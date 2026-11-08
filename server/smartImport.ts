// The smart import box («ارفع أي ملف»): the person uploads whatever file they have; the platform works out what it is.
//   createSmartUpload  a signed URL for the original file (kept in Storage under imports/<company>/<project>/smart/, linked to the import it produces)
//   analyzeSmartUpload reads it with the tolerant reader (server/domain/smartImport) and answers «هذا ما فهمته»; writes nothing
//   confirmSmartImport writes what was understood in the columns the existing importer reads, and hands it to registerImportUpload: the importer's validation,
//                      its own confirmation step, its progress screen and its audit trail are all still in force. This module adds no way around any of them.
// Profiles: after a correction, the column map is saved under the source's name and applied to the next file with the same headers.
import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { auditLogs, dataImportRowResults, dataImportSources, dataImports, importSourceProfiles } from "../drizzle/schema";
import { buildSpreadsheet } from "./domain/excelWorkbook";
import { authorizeNewImport, getDataImportDetailForTenant, getDb } from "./db";
import { detectFormat, understand, type Understanding } from "./domain/smartImport/understand";
import { KINDS, type KindCode } from "./domain/smartImport/kinds";
import { normalizeHeader } from "./domain/smartImport/dictionary";
import { hasTranslator, translate } from "./domain/smartImport/translate";
import { registerImportUpload } from "./importJobs";
import { analyzeMatrixImport, confirmMatrixImport, type MatrixPlan } from "./matrixImport";
import { analyzeP6Import, confirmP6Import, type P6Plan } from "./p6Import";
import { analyzeScheduleUpdate, confirmScheduleUpdate, type ScheduleUpdatePlan } from "./p6Update";
import { readTableWithAi, smartReadingQuote } from "./smartReading";
import { MAX_DIRECT_UPLOAD_BYTES, storageCreateUploadUrl, storageDelete, storageGetSignedUrl, storageHead, storagePut, storageRead } from "./storage";
import { logError } from "./_core/logger";

type Identity = { userId: number; tenantId: string; projectId: string };
const EXTENSIONS: Record<string, string> = { xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv", xer: "text/plain", pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg" };
const safeName = (name: string) => name.normalize("NFKC").replace(/[^A-Za-z0-9._\-؀-ۿݐ-ݿ]+/g, "_").replace(/^[._]+/, "").slice(0, 120) || "file";
const smartPrefix = (input: Identity) => `imports/${input.tenantId}/${input.projectId}/smart/`;
const extensionOf = (fileName: string) => fileName.toLowerCase().match(/\.([a-z0-9]+)$/)?.[1] ?? "";
const PROFILE_MATCH = 0.75;

async function database() { const db = await getDb(); if (!db) throw new Error("Database connection is not available"); return db; }

/** Step 1: a URL to upload to. Any import permission clears it (the importer that receives the rows asks for its own permission again at confirmation). */
export async function createSmartUpload(input: Identity & { fileName: string }) {
  await authorizeNewImport({ userId: input.userId, tenantId: input.tenantId, projectId: input.projectId, moduleCode: "any" });
  const type = EXTENSIONS[extensionOf(input.fileName)];
  if (!type) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_SMART_IMPORT_FORMAT_UNSUPPORTED" });
  const key = `${smartPrefix(input)}${randomUUID()}/${safeName(input.fileName)}`;
  const upload = await storageCreateUploadUrl(key, type);
  return { uploadKey: upload.key, uploadUrl: upload.url, headers: upload.headers, expiresInSeconds: upload.expiresInSeconds, maxBytes: MAX_DIRECT_UPLOAD_BYTES };
}

async function takeSmartUpload(input: Identity & { uploadKey: string }) {
  // the key must be one this server issued for exactly this company and project: another company's object can never be read through this door
  if (!input.uploadKey.startsWith(smartPrefix(input)) || input.uploadKey.split("/").some(part => part === ".." || part === ".")) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_IMPORT_UPLOAD_KEY_INVALID" });
  const head = await storageHead(input.uploadKey);
  if (!head) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_UPLOAD_MISSING" });
  if (head.size <= 0 || head.size > MAX_DIRECT_UPLOAD_BYTES) { await storageDelete(input.uploadKey).catch(() => undefined); throw new TRPCError({ code: "BAD_REQUEST", message: head.size <= 0 ? "PROJECT_OS_IMPORT_FILE_INVALID" : "PROJECT_OS_IMPORT_FILE_TOO_LARGE" }); }
  const bytes = await storageRead(input.uploadKey);
  if (bytes.length !== head.size) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_FILE_INVALID" });
  return bytes;
}

const signatureOf = (headers: string[]) => Array.from(new Set(headers.map(normalizeHeader).filter(Boolean))).sort();
const overlap = (a: string[], b: string[]) => { if (!a.length || !b.length) return 0; const set = new Set(b); return a.filter(item => set.has(item)).length / Math.max(a.length, b.length); };

type ProfileRow = { id: string; name: string; kind: string; headerSignature: string; columnMapJson: string; timesUsed: number };
type ColumnMap = Record<string, string | null>; // normalised header -> field key (null: ignored)

/** The saved profile of this company whose headers overlap enough with the file's: the same source, sent again. */
async function findProfile(tenantId: string, headers: string[]): Promise<{ profile: ProfileRow; map: ColumnMap } | null> {
  const db = await database();
  const profiles = await db.select({ id: importSourceProfiles.id, name: importSourceProfiles.name, kind: importSourceProfiles.kind, headerSignature: importSourceProfiles.headerSignature, columnMapJson: importSourceProfiles.columnMapJson, timesUsed: importSourceProfiles.timesUsed })
    .from(importSourceProfiles).where(eq(importSourceProfiles.tenantId, tenantId));
  const mine = signatureOf(headers);
  let best: { profile: ProfileRow; score: number } | null = null;
  for (const profile of profiles) { const score = overlap(mine, JSON.parse(profile.headerSignature) as string[]); if (score >= PROFILE_MATCH && (!best || score > best.score)) best = { profile, score }; }
  return best ? { profile: best.profile, map: JSON.parse(best.profile.columnMapJson) as ColumnMap } : null;
}

const forcedFromMap = (headers: string[], map: ColumnMap) => Object.fromEntries(headers.flatMap((header, index) => { const key = normalizeHeader(header); return key in map ? [[index, map[key]]] : []; })) as Record<number, string | null>;
const strip = (u: Understanding) => { const { rows: _rows, ...rest } = u; return rest; };

export type SmartAnalysis = {
  understanding: Omit<Understanding, "rows">;
  profile: { id: string; name: string; timesUsed: number } | null;
  /** a unit-completion matrix: what importing it would change, counted by the database in a transaction that was rolled back, and how it compares with the platform's own calculation */
  matrixPlan?: MatrixPlan;
  /** a Primavera P6 export: what importing it in full would change (WBS, activities, relationships, resources, assignments, codes, calendars), counted by the database in a transaction that was rolled back */
  p6Plan?: P6Plan;
  /** a progress update (activity id + actual start / finish): what it would change in the project's schedule, counted against its own rows */
  scheduleUpdatePlan?: ScheduleUpdatePlan;
  /** present for a PDF / image: whether the AI reading is on, what it would cost, what is left this month */
  smartReading?: Awaited<ReturnType<typeof smartReadingQuote>>;
};

/** Step 2: what the file is and how its columns map. Nothing is recorded. `forced` are the person's corrections (column index -> field key). */
export async function analyzeSmartUpload(input: Identity & { uploadKey: string; fileName: string; sheet?: string; kind?: KindCode; forced?: Record<number, string | null>; useAi?: boolean }): Promise<SmartAnalysis> {
  await authorizeNewImport({ userId: input.userId, tenantId: input.tenantId, projectId: input.projectId, moduleCode: "any" });
  let bytes: Uint8Array = await takeSmartUpload(input);
  const format = detectFormat(bytes, input.fileName);
  if (format === "pdf" || format === "image") {
    if (!input.useAi) return { understanding: strip(await understand(bytes, { fileName: input.fileName })), profile: null, smartReading: await smartReadingQuote(input.tenantId, bytes.length) };
    bytes = await readTableWithAi({ tenantId: input.tenantId, bytes, fileName: input.fileName, kind: format }); // throws PROJECT_OS_SMART_READING_DISABLED / _CAP_REACHED before any call
    input = { ...input, fileName: input.fileName.replace(/\.[a-z0-9]+$/i, "") + ".csv" };
  }
  let result = await understand(bytes, { fileName: input.fileName, sheet: input.sheet, kind: input.kind, forced: input.forced });
  let profile: SmartAnalysis["profile"] = null;
  if (result.kind === "scheduleUpdate") {
    const scheduleUpdatePlan = await analyzeScheduleUpdate({ userId: input.userId, tenantId: input.tenantId, projectId: input.projectId, bytes });
    return { understanding: strip(result), profile: null, scheduleUpdatePlan };
  }
  if (result.kind === "xer") {
    const p6Plan = await analyzeP6Import({ userId: input.userId, tenantId: input.tenantId, projectId: input.projectId, bytes });
    return { understanding: strip(result), profile: null, p6Plan };
  }
  if (result.kind === "unitMatrix") {
    // the report's own structure is the map: nothing to correct column by column. The plan is counted by the database, in a transaction that is rolled back.
    const matrixPlan = await analyzeMatrixImport({ userId: input.userId, tenantId: input.tenantId, projectId: input.projectId, bytes });
    const found = await findProfile(input.tenantId, matrixPlan.activityNames);
    if (found && found.profile.kind === "unitMatrix") profile = { id: found.profile.id, name: found.profile.name, timesUsed: found.profile.timesUsed };
    return { understanding: strip(result), profile, matrixPlan };
  }
  if (result.table && !input.forced) {
    const headers = result.columns.map(column => column.header);
    const found = await findProfile(input.tenantId, headers);
    if (found && found.profile.kind in KINDS) {
      result = await understand(bytes, { fileName: input.fileName, sheet: input.sheet ?? result.sheet ?? undefined, kind: found.profile.kind as KindCode, forced: forcedFromMap(headers, found.map) });
      profile = { id: found.profile.id, name: found.profile.name, timesUsed: found.profile.timesUsed };
    }
  }
  return { understanding: strip(result), profile };
}

export type SmartConfirmation = { importId: string; status: string; module: string; rowsSent: number; rowsExcluded: number; excluded: Array<{ rowNumber: number; reason: string }>; notes: string[]; profileId: string | null; matrixChanges?: MatrixPlan["changes"]; p6Counts?: P6Plan["counts"]; scheduleUpdate?: Pick<ScheduleUpdatePlan, "updated" | "started" | "finished" | "moved" | "unknown" | "unchanged"> };

/** Step 3: the person approved. The rows go to the existing importer in its own template; the original file is kept and linked to the import. */
export async function confirmSmartImport(input: Identity & { uploadKey: string; fileName: string; kind: KindCode; sheet?: string; forced: Record<number, string | null>; approvedHash?: string; profileName?: string; profileId?: string | null; duplicateMode?: "create_only" | "update_existing" | "upsert" | "skip_duplicates" | "fail_on_duplicate" }): Promise<SmartConfirmation> {
  const db = await database();
  const bytes = await takeSmartUpload(input);
  const format = detectFormat(bytes, input.fileName);
  if (input.kind === "scheduleUpdate") {
    if (format !== "xlsx" && format !== "xls") throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_SMART_IMPORT_FORMAT_UNSUPPORTED" });
    const done = await confirmScheduleUpdate({ userId: input.userId, tenantId: input.tenantId, projectId: input.projectId, bytes, approvedHash: input.approvedHash, source: { key: input.uploadKey, name: input.fileName } });
    return { importId: done.importId, status: "completed", module: "p6update", rowsSent: done.plan.updated, rowsExcluded: done.plan.unknown, excluded: [], notes: [], profileId: null, scheduleUpdate: { updated: done.plan.updated, started: done.plan.started, finished: done.plan.finished, moved: done.plan.moved, unknown: done.plan.unknown, unchanged: done.plan.unchanged } };
  }
  if (input.kind === "unitMatrix") {
    if (format !== "xlsx") throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_SMART_IMPORT_FORMAT_UNSUPPORTED" });
    const plan = await confirmMatrixImport({ userId: input.userId, tenantId: input.tenantId, projectId: input.projectId, bytes, approvedHash: input.approvedHash, source: { key: input.uploadKey, name: input.fileName } });
    const importId = plan.importId!;
    let profileId: string | null = input.profileId ?? null;
    try {
      await db.transaction(async tx => {
        if (input.profileName) {
          const signature = JSON.stringify(signatureOf(plan.activityNames));
          const [row] = await tx.insert(importSourceProfiles).values({ id: randomUUID(), tenantId: input.tenantId, name: input.profileName, kind: "unitMatrix", headerSignature: signature, columnMapJson: JSON.stringify({ unitMatrix: true, activities: plan.activityNames.length }), timesUsed: 1, createdByUserId: input.userId })
            .onConflictDoUpdate({ target: [importSourceProfiles.tenantId, importSourceProfiles.name], set: { kind: "unitMatrix", headerSignature: signature, timesUsed: sql`${importSourceProfiles.timesUsed} + 1`, updatedAt: sql`now()` } }).returning({ id: importSourceProfiles.id });
          profileId = row.id;
        } else if (profileId) await tx.update(importSourceProfiles).set({ timesUsed: sql`${importSourceProfiles.timesUsed} + 1`, updatedAt: sql`now()` }).where(and(eq(importSourceProfiles.id, profileId), eq(importSourceProfiles.tenantId, input.tenantId)));
        if (profileId) await tx.update(dataImportSources).set({ profileId }).where(and(eq(dataImportSources.importId, importId), eq(dataImportSources.tenantId, input.tenantId)));
      });
    } catch (error) { logError("smart_import.profile_failed", error); }
    return { importId, status: "completed", module: "pmcMatrix", rowsSent: plan.summary.units, rowsExcluded: 0, excluded: [], notes: plan.summary.warnings, profileId, matrixChanges: plan.changes };
  }
  const base = { userId: input.userId, tenantId: input.tenantId, projectId: input.projectId, duplicateMode: input.duplicateMode };
  let registered: { id: string; status: string }; let module: string; let rowsSent = 0; let excluded: SmartConfirmation["excluded"] = []; let notes: string[] = [];
  let mapping: ColumnMap = {}; let mergedFilled = 0; let sheetName: string | null = input.sheet ?? null; let headers: string[] = [];

  if (format === "xer") {
    // a Primavera export is read whole (the WBS tree, activities, relationships, resources, assignments, codes, calendars) and written in one transaction
    const plan = await confirmP6Import({ userId: input.userId, tenantId: input.tenantId, projectId: input.projectId, bytes, approvedHash: input.approvedHash, source: { key: input.uploadKey, name: input.fileName } });
    return { importId: plan.importId!, status: "completed", module: "p6", rowsSent: plan.summary.activities, rowsExcluded: 0, excluded: [], notes: plan.warnings, profileId: null, p6Counts: plan.counts };
  } else if (format === "pdf" || format === "image" || format === "unknown") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_SMART_IMPORT_FORMAT_UNSUPPORTED" });
  } else {
    if (input.kind === "xer" || !(input.kind in KINDS)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_SMART_IMPORT_KIND_INVALID" });
    if (!hasTranslator(input.kind)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_SMART_IMPORT_NO_IMPORTER" });
    const result = await understand(bytes, { fileName: input.fileName, kind: input.kind, sheet: input.sheet, forced: input.forced, includeRows: true });
    if (!result.table || !result.rows) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_SMART_IMPORT_NO_TABLE" });
    const mapped = new Set(result.columns.map(column => column.fieldKey).filter(Boolean));
    if (result.fields.some(field => field.required && !mapped.has(field.key))) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_SMART_IMPORT_REQUIRED_UNMAPPED" });
    const translated = translate(input.kind, result.rows);
    if (!translated || !translated.rows.length) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_SMART_IMPORT_NOTHING_TO_IMPORT" });
    module = translated.module; rowsSent = translated.rows.length; excluded = translated.excluded; notes = translated.notes;
    headers = result.columns.map(column => column.header);
    mapping = Object.fromEntries(result.columns.map(column => [normalizeHeader(column.header), column.fieldKey]));
    mergedFilled = result.table.mergedFilled; sheetName = result.sheet;
    const sheetBytes = await buildSpreadsheet({ sheetName: "Import", headers: translated.headers, rows: translated.rows, format: "xlsx" });
    const baseName = safeName(input.fileName).replace(/\.[a-z0-9]+$/i, "");
    const pendingKey = `imports/${input.tenantId}/${input.projectId}/pending/${randomUUID()}/${baseName}.xlsx`;
    const stored = await storagePut(pendingKey, sheetBytes, EXTENSIONS.xlsx);
    registered = await registerImportUpload({ ...base, moduleCode: translated.module, fileName: `${baseName}.xlsx`, sourceFormat: "xlsx", uploadKey: stored.key });
  }

  // From here the import exists. Linking the original and remembering the profile are best-effort: a failure leaves a good import without its link, and is logged.
  let profileId: string | null = input.profileId ?? null;
  try {
    await db.transaction(async tx => {
      if (input.profileName && Object.keys(mapping).length) {
        const signature = JSON.stringify(signatureOf(headers));
        const [row] = await tx.insert(importSourceProfiles).values({ id: randomUUID(), tenantId: input.tenantId, name: input.profileName, kind: input.kind, headerSignature: signature, columnMapJson: JSON.stringify(mapping), timesUsed: 1, createdByUserId: input.userId })
          .onConflictDoUpdate({ target: [importSourceProfiles.tenantId, importSourceProfiles.name], set: { kind: input.kind, headerSignature: signature, columnMapJson: JSON.stringify(mapping), timesUsed: sql`${importSourceProfiles.timesUsed} + 1`, updatedAt: sql`now()` } })
          .returning({ id: importSourceProfiles.id });
        profileId = row.id;
      } else if (profileId) {
        await tx.update(importSourceProfiles).set({ timesUsed: sql`${importSourceProfiles.timesUsed} + 1`, updatedAt: sql`now()` }).where(and(eq(importSourceProfiles.id, profileId), eq(importSourceProfiles.tenantId, input.tenantId)));
      }
      await tx.insert(dataImportSources).values({ importId: registered.id, tenantId: input.tenantId, projectId: input.projectId, sourceKey: input.uploadKey, sourceName: input.fileName, detectedKind: input.kind, sheetName, mappingJson: JSON.stringify(mapping), profileId, mergedCellsFilled: mergedFilled });
      await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "smart_import_confirmed", entityType: "data_import", entityId: registered.id, metadata: JSON.stringify({ projectId: input.projectId, kind: input.kind, module, rowsSent, rowsExcluded: excluded.length, profileId, fileHash: createHash("sha256").update(bytes).digest("hex") }) });
    });
  } catch (error) { logError("smart_import.link_failed", error); }
  return { importId: registered.id, status: registered.status, module, rowsSent, rowsExcluded: excluded.length, excluded: excluded.slice(0, 200), notes, profileId };
}

export async function listImportProfiles(input: { userId: number; tenantId: string; projectId: string }) {
  await authorizeNewImport({ userId: input.userId, tenantId: input.tenantId, projectId: input.projectId, moduleCode: "any" });
  const db = await database();
  return db.select({ id: importSourceProfiles.id, name: importSourceProfiles.name, kind: importSourceProfiles.kind, timesUsed: importSourceProfiles.timesUsed, updatedAt: importSourceProfiles.updatedAt }).from(importSourceProfiles)
    .where(eq(importSourceProfiles.tenantId, input.tenantId)).orderBy(desc(importSourceProfiles.updatedAt)).limit(200);
}

/** From an item card: the original file an item came from (a short-lived signed link). `entityId` is the id the import wrote; `importId` names the import directly. */
export async function getImportSourceLink(input: Identity & { entityId?: string; importId?: string }) {
  const db = await database();
  let importId = input.importId ?? null;
  if (!importId && input.entityId) {
    const [hit] = await db.select({ importId: dataImportRowResults.importId }).from(dataImportRowResults).innerJoin(dataImports, eq(dataImports.id, dataImportRowResults.importId))
      .where(and(eq(dataImportRowResults.entityId, input.entityId), eq(dataImports.tenantId, input.tenantId), eq(dataImports.projectId, input.projectId))).orderBy(desc(dataImportRowResults.createdAt)).limit(1);
    importId = hit?.importId ?? null;
  }
  if (!importId) return { found: false as const };
  await getDataImportDetailForTenant({ userId: input.userId, tenantId: input.tenantId, projectId: input.projectId, importId }); // the same read gate as the import's own detail
  const [source] = await db.select().from(dataImportSources).where(and(eq(dataImportSources.importId, importId), eq(dataImportSources.tenantId, input.tenantId))).limit(1);
  if (!source) return { found: false as const };
  const signed = await storageGetSignedUrl(source.sourceKey);
  return { found: true as const, importId, fileName: source.sourceName, kind: source.detectedKind, sheet: source.sheetName, url: signed, mergedCellsFilled: source.mergedCellsFilled };
}
