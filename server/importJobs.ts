// Direct-upload imports and their background jobs (work order 6).
//
// A function's request body stops at 4.5 MB, so a large import file never travels through one:
//   1. createImportUpload   the server picks the object key and hands the browser a short-lived signed PUT URL;
//   2. the browser PUTs the file straight to Storage;
//   3. registerImportUpload the server checks the object is there and within 50 MB, hashes it, records the import as `analyzing`
//                           and starts the analysis AFTER the response (Vercel `waitUntil`);
//   4. the screen polls getImportProgress: queued → downloading → parsing → validating → writing, then `uploaded`/`validated`
//                           (analysis done) or `failed` with a reason code;
//   5. confirm of a large import is the same: `importing` with progress, then `completed` or `failed` with a reason.
// The job is claimed atomically (heartbeat), so two requests never run one import. A function killed at its time limit leaves a stale heartbeat;
// the next poll or the periodic sweep resumes it, at most IMPORT_JOB_MAX_ATTEMPTS times, then marks it failed (IMPORT_JOB_STALLED).
import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { auditLogs, dataImportErrors, dataImportRowResults, dataImportSources, dataImports, importSourceProfiles } from "../drizzle/schema";
import { runAfterResponse } from "./_core/afterResponse";
import { logError } from "./_core/logger";
import { assertFileNotAlreadyImported, assertImportAccess, assertProjectWithinTenant, getTenantAccessSnapshot, previewDataImportDiff, recordApprovedDiffHash, authorizeNewImport, addOpeningBalanceReferenceErrors, confirmAndImportData, getDataImportDetailForTenant, getDb, importPermissionFor, isDuplicateEntryError, reanalyzeDataImport } from "./db";
import { analysisWarnings, analyzeImportFile, type ImportModuleCode } from "./domain/dataImport";
import { analyzeExternalImport, applyExternalImport, authorizeExternalImport, isExternalModule, pmcKindOf, type ExternalContext, type ExternalModule } from "./externalImports";
import type { PmcImportEdits } from "./domain/pmcImport";
import { DIFF_PAGE_SIZE, summariseDiff } from "./domain/importCycle";
import { auditEmployeeRecordsRead, isLedgerModule, ledgerPlanHash, planLedgerImport } from "./ledgerImports";
import { assertTenantAccess } from "./domain/authorization";
import { insertChunked } from "./importBulk";
import { confirmP6Import } from "./p6Import";
import { MAX_DIRECT_UPLOAD_BYTES, storageCreateUploadUrl, storageDelete, storageHead, storageList, storageRead } from "./storage";

/** A running job that has not touched its heartbeat for this long is dead: the function's own limit (300 s) is shorter. */
export const IMPORT_JOB_STALL_MS = 6 * 60 * 1000;
export const IMPORT_JOB_MAX_ATTEMPTS = 3;
/** Up to this many rows the work finishes inside the request; above it the confirmation / re-analysis becomes a background job. */
export const IMPORT_SYNC_MAX_ROWS = 2_000;
/** An upload nobody registered within this time is removed by the sweep. */
export const ORPHAN_UPLOAD_MAX_AGE_MS = 24 * 60 * 60 * 1000;

type Format = "xlsx" | "csv" | "xer";
type DuplicateMode = "create_only" | "update_existing" | "upsert" | "skip_duplicates" | "fail_on_duplicate";
type JobIdentity = { userId: number; tenantId: string; projectId: string; importId: string };

const CONTENT_TYPES: Record<Format, string> = { csv: "text/csv", xer: "text/plain", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
// letters of any script survive in the object key (Arabic file names are normal here); anything that could act as a path or control character becomes "_"
const safeFileName = (name: string) => name.normalize("NFKC").replace(/[^A-Za-z0-9._\-\u0600-\u06FF\u0750-\u077F]+/g, "_").replace(/^[._]+/, "").slice(0, 120) || "file";
const IMPORT_MODULES: readonly string[] = ["wbs", "budget", "contracts", "materials", "schedule", "openingBalances"];
const reasonCode = (error: unknown) => {
  const message = error instanceof Error ? error.message : "";
  return /^PROJECT_OS_[A-Z0-9_]+$/.test(message) ? message : "PROJECT_OS_IMPORT_JOB_FAILED";
};

async function database() {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  return db;
}

/** A new import clears its module's own gate before any byte moves: the general importer's (permission, DATA_IMPORT feature and its count limit), or the PMC / master-plan module's own. */
async function authorizeUpload(input: { userId: number; tenantId: string; projectId: string; moduleCode: ImportModuleCode | ExternalModule; sourceFormat: Format; context?: ExternalContext }) {
  if (!isExternalModule(input.moduleCode)) return authorizeNewImport({ ...input, moduleCode: input.moduleCode });
  if (input.sourceFormat === "xer") throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_FORMAT_INVALID" });
  return authorizeExternalImport({ ...input, moduleCode: input.moduleCode });
}

const parseJson = <T,>(text: string | null | undefined, fallback: T): T => { try { return text ? JSON.parse(text) as T : fallback; } catch { return fallback; } };
const contextOf = (summaryJson: string | null | undefined) => parseJson<{ context?: ExternalContext }>(summaryJson, {}).context;
/** Q-50 batch 4: the corrections a person made in the preview, kept with the import (never in the stored file) so the analysis they read and the write use them. */
const editsOf = (summaryJson: string | null | undefined) => parseJson<{ edits?: PmcImportEdits }>(summaryJson, {}).edits;

/** Step 1: the URL the browser uploads to. Nothing is recorded yet: an abandoned upload is only an object the sweep removes. */
export async function createImportUpload(input: { userId: number; tenantId: string; projectId: string; moduleCode: ImportModuleCode | ExternalModule; fileName: string; sourceFormat: Format; context?: ExternalContext }) {
  await authorizeUpload(input);
  const key = `imports/${input.tenantId}/${input.projectId}/pending/${randomUUID()}/${safeFileName(input.fileName)}`;
  const upload = await storageCreateUploadUrl(key, CONTENT_TYPES[input.sourceFormat]);
  return { uploadKey: upload.key, uploadUrl: upload.url, headers: upload.headers, expiresInSeconds: upload.expiresInSeconds, maxBytes: MAX_DIRECT_UPLOAD_BYTES };
}

/** Step 3: the file is in Storage; record the import and start analysing it in the background. */
export async function registerImportUpload(input: { userId: number; tenantId: string; projectId: string; moduleCode: ImportModuleCode | ExternalModule; fileName: string; sourceFormat: Format; uploadKey: string; duplicateMode?: DuplicateMode; mappingOverride?: Record<string, string>; context?: ExternalContext }) {
  const db = await authorizeUpload(input);
  const prefix = `imports/${input.tenantId}/${input.projectId}/pending/`;
  // The key must be one this server issued for exactly this company and project: another company's object can never become this company's import.
  if (!input.uploadKey.startsWith(prefix) || input.uploadKey.split("/").some(part => part === ".." || part === ".")) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_IMPORT_UPLOAD_KEY_INVALID" });
  const head = await storageHead(input.uploadKey);
  if (!head) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_UPLOAD_MISSING" });
  if (head.size <= 0 || head.size > MAX_DIRECT_UPLOAD_BYTES) {
    await storageDelete(input.uploadKey).catch(() => undefined);
    throw new TRPCError({ code: "BAD_REQUEST", message: head.size <= 0 ? "PROJECT_OS_IMPORT_FILE_INVALID" : "PROJECT_OS_IMPORT_FILE_TOO_LARGE" });
  }
  const bytes = await storageRead(input.uploadKey);
  if (bytes.length !== head.size) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_FILE_INVALID" });
  const fileHash = createHash("sha256").update(bytes).digest("hex");
  // a file that was already CONFIRMED is refused here, readably; a refused or unconfirmed attempt of it never blocks (the unique index only guards the confirmed ones)
  try { await assertFileNotAlreadyImported(db, { tenantId: input.tenantId, fileHash }); } catch (error) { await storageDelete(input.uploadKey).catch(cleanup => logError("import.duplicate_upload_delete_failed", cleanup, { uploadKey: input.uploadKey })); throw error; }
  const id = randomUUID();
  try {
    await db.insert(dataImports).values({
      id, tenantId: input.tenantId, projectId: input.projectId, moduleCode: input.moduleCode, templateCode: `${input.moduleCode}_v1`, sourceFormat: input.sourceFormat, fileName: input.fileName, fileKey: input.uploadKey, fileHash,
      status: "analyzing", duplicateMode: input.duplicateMode ?? "fail_on_duplicate", mappingJson: input.mappingOverride && Object.keys(input.mappingOverride).length ? JSON.stringify(input.mappingOverride) : null,
      progressPercent: 5, progressStage: "queued", createdByUserId: input.userId,
      // the master-plan version an import belongs to is kept with it, so the background job (which has no request) knows where to write
      summaryJson: input.context ? JSON.stringify({ context: input.context }) : null,
    });
  } catch (error) {
    if (isDuplicateEntryError(error)) { await storageDelete(input.uploadKey).catch(() => undefined); throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_IMPORT_DUPLICATE_DETECTED" }); }
    throw error;
  }
  const job = { userId: input.userId, tenantId: input.tenantId, projectId: input.projectId, importId: id };
  void runAfterResponse(`import.analyze:${id}`, () => runImportAnalysis(job));
  return { id, status: "analyzing" as const };
}

type Db = Awaited<ReturnType<typeof database>>;
const inFlight = ["analyzing", "importing"] as const;

/** Moves the row's progress and heartbeat. Does nothing once the row has left the in-flight statuses. */
async function touch(db: Db, importId: string, stage: string, percent: number) {
  await db.update(dataImports).set({ heartbeatAt: sql`now()`, progressStage: stage, progressPercent: percent }).where(and(eq(dataImports.id, importId), inArray(dataImports.status, [...inFlight])));
}

/** Takes the job for this run, or reports that another run (or a finished state) already has it. `resume` takes a job whose heartbeat went stale. */
async function claim(db: Db, importId: string, status: (typeof inFlight)[number], resume: boolean) {
  const stale = sql`COALESCE(${dataImports.heartbeatAt}, ${dataImports.updatedAt}) < now() - make_interval(secs => ${IMPORT_JOB_STALL_MS / 1000}::double precision)`;
  const claimed = await db.update(dataImports)
    .set({ heartbeatAt: sql`now()`, attempts: sql`${dataImports.attempts} + 1`, startedAt: sql`COALESCE(${dataImports.startedAt}, now())`, progressStage: sql`COALESCE(${dataImports.progressStage}, 'queued')` })
    .where(and(eq(dataImports.id, importId), eq(dataImports.status, status), resume ? stale : sql`${dataImports.heartbeatAt} IS NULL`))
    .returning({ id: dataImports.id });
  return claimed.length === 1;
}

/** Records the failure on the import itself (status `failed`, a reason code the screen translates) and in the audit trail. */
async function failJob(db: Db, job: JobIdentity, reason: string, stage: string | null) {
  await db.transaction(async tx => {
    const failed = await tx.update(dataImports)
      .set({ status: "failed", failureReason: reason, progressStage: null, heartbeatAt: null, completedAt: sql`now()` })
      .where(and(eq(dataImports.id, job.importId), eq(dataImports.tenantId, job.tenantId), inArray(dataImports.status, [...inFlight])))
      .returning({ id: dataImports.id });
    if (failed.length) await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: job.tenantId, actorUserId: job.userId, action: "data_import_failed", entityType: "data_import", entityId: job.importId, metadata: JSON.stringify({ projectId: job.projectId, reason, stage }) });
  });
}

/** Analysis of a PMC / master-plan file: the importer's own verdict is kept on the import (its counts in `summaryJson.report`), its errors in the same table the general importer uses. */
async function analyseExternal(db: Db, job: JobIdentity, record: { moduleCode: ExternalModule; sourceFormat: Format; fileHash: string; summaryJson: string | null; mappingJson: string | null }, bytes: Buffer, progress: typeof touch) {
  await progress(db, job.importId, "validating", 45);
  const analysis = await analyzeExternalImport({ userId: job.userId, tenantId: job.tenantId, projectId: job.projectId, moduleCode: record.moduleCode, format: record.sourceFormat as "xlsx" | "csv", bytes, mappingOverride: storedMapping(record.mappingJson), edits: editsOf(record.summaryJson) });
  await progress(db, job.importId, "writing", 80);
  await db.transaction(async tx => {
    await tx.delete(dataImportErrors).where(eq(dataImportErrors.importId, job.importId));
    const verdict = await tx.update(dataImports).set({
      status: analysis.errors.length ? "uploaded" : "validated", totalRows: analysis.totalRows, validRows: analysis.validRows, invalidRows: analysis.totalRows - analysis.validRows,
      summaryJson: JSON.stringify({ context: contextOf(record.summaryJson), edits: editsOf(record.summaryJson), report: analysis.report, canConfirm: analysis.canConfirm }), progressPercent: 100, progressStage: null, failureReason: null, heartbeatAt: null,
    }).where(and(eq(dataImports.id, job.importId), eq(dataImports.status, "analyzing"))).returning({ id: dataImports.id });
    if (!verdict.length) return;
    await insertChunked(tx, dataImportErrors, analysis.errors.map(error => ({ id: randomUUID(), importId: job.importId, rowNumber: error.rowNumber, code: error.code, severity: "error" as const, suggestedFix: error.field ?? null, value: error.detail ? error.detail.slice(0, 200) : null })));
    await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: job.tenantId, actorUserId: job.userId, action: "data_import_uploaded", entityType: "data_import", entityId: job.importId, metadata: JSON.stringify({ projectId: job.projectId, moduleCode: record.moduleCode, fileHash: record.fileHash, totalRows: analysis.totalRows, errorCount: analysis.errors.length }) });
    // Q-50 batch 4: every correction the analysis used — row, field, the file's column, the file's value and the value used — in the same transaction as the verdict
    const details = (analysis.report.pmc as { details?: { edits?: unknown[]; ignoredRows?: number[]; readRows?: number[] } } | undefined)?.details;
    if (details?.edits?.length || details?.ignoredRows?.length || details?.readRows?.length) await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: job.tenantId, actorUserId: job.userId, action: "data_import_cells_corrected", entityType: "data_import", entityId: job.importId, metadata: JSON.stringify({ projectId: job.projectId, moduleCode: record.moduleCode, fileHash: record.fileHash, edits: details.edits ?? [], ignoredRows: details.ignoredRows ?? [], readRows: details.readRows ?? [] }) });
  });
}

/** Q-31 (P0-02): the columns a person chose for a PMC file, kept on the import so the analysis they read and the write that follows use the same mapping. */
const storedMapping = (json: string | null) => { if (!json) return undefined; try { const value = JSON.parse(json) as unknown; return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, string> : undefined; } catch { return undefined; } };

/** The write of a PMC / master-plan import: the importer's own transaction, then the import is marked completed with its counts. A job resumed after the write re-runs it; every one of these writes is safe to repeat (or refuses the duplicate and says so). */
async function confirmExternal(db: Db, job: JobIdentity, onStage: (stage: string, percent: number) => Promise<void>) {
  const [record] = await db.select({ moduleCode: dataImports.moduleCode, sourceFormat: dataImports.sourceFormat, fileKey: dataImports.fileKey, fileHash: dataImports.fileHash, summaryJson: dataImports.summaryJson, mappingJson: dataImports.mappingJson })
    .from(dataImports).where(and(eq(dataImports.id, job.importId), eq(dataImports.tenantId, job.tenantId), eq(dataImports.projectId, job.projectId), eq(dataImports.status, "importing"))).limit(1);
  if (!record || !isExternalModule(record.moduleCode)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_NOT_CONFIRMABLE" });
  await onStage("downloading", 10);
  const bytes = await storageRead(record.fileKey);
  if (!bytes.length || bytes.length > MAX_DIRECT_UPLOAD_BYTES || createHash("sha256").update(bytes).digest("hex") !== record.fileHash) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_FILE_INVALID" });
  await onStage("writing", 40);
  const { results, ...counts } = await applyExternalImport({ userId: job.userId, tenantId: job.tenantId, projectId: job.projectId, moduleCode: record.moduleCode, format: record.sourceFormat as "xlsx" | "csv", bytes, fileHash: record.fileHash, importId: job.importId, approvedDiffHash: parseJson<{ approvedDiffHash?: string }>(record.summaryJson, {}).approvedDiffHash, context: contextOf(record.summaryJson), mappingOverride: storedMapping(record.mappingJson), edits: editsOf(record.summaryJson) });
  await db.transaction(async tx => {
    const done = await tx.update(dataImports).set({ status: "completed", ...counts, progressPercent: 100, progressStage: null, failureReason: null, heartbeatAt: null, completedAt: sql`now()` })
      .where(and(eq(dataImports.id, job.importId), eq(dataImports.status, "importing"))).returning({ id: dataImports.id });
    // what each row did, as the general importer records it (an operational import: costs, orders, employees, hours)
    if (done.length && results?.length) { await tx.delete(dataImportRowResults).where(eq(dataImportRowResults.importId, job.importId)); await insertChunked(tx, dataImportRowResults, results.map(item => ({ id: randomUUID(), importId: job.importId, rowNumber: item.rowNumber, rowKey: item.key.slice(0, 160), action: item.action, entityId: item.entityId }))); }
    if (done.length) await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: job.tenantId, actorUserId: job.userId, action: "data_import_completed", entityType: "data_import", entityId: job.importId, metadata: JSON.stringify({ projectId: job.projectId, moduleCode: record.moduleCode, ...counts }) });
  });
  return counts;
}

/** The analysis job: read the stored file, validate every row, and write the verdict (rows, errors, mapping) in one transaction. */
export async function runImportAnalysis(job: JobIdentity, options: { resume?: boolean } = {}) {
  const db = await database();
  if (!(await claim(db, job.importId, "analyzing", options.resume ?? false))) return;
  let stage = "downloading";
  try {
    const [record] = await db.select({ moduleCode: dataImports.moduleCode, sourceFormat: dataImports.sourceFormat, fileKey: dataImports.fileKey, fileHash: dataImports.fileHash, mappingJson: dataImports.mappingJson, summaryJson: dataImports.summaryJson, createdByUserId: dataImports.createdByUserId })
      .from(dataImports).where(and(eq(dataImports.id, job.importId), eq(dataImports.tenantId, job.tenantId), eq(dataImports.projectId, job.projectId))).limit(1);
    if (!record) return;
    await touch(db, job.importId, stage, 10);
    const bytes = await storageRead(record.fileKey);
    if (!bytes.length || bytes.length > MAX_DIRECT_UPLOAD_BYTES || createHash("sha256").update(bytes).digest("hex") !== record.fileHash) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_FILE_INVALID" });
    stage = "parsing"; await touch(db, job.importId, stage, 30);
    if (isExternalModule(record.moduleCode)) { await analyseExternal(db, job, { ...record, sourceFormat: record.sourceFormat as Format, moduleCode: record.moduleCode }, bytes, touch); return; }
    const override = record.mappingJson ? JSON.parse(record.mappingJson) as Record<string, string> : undefined;
    if (!IMPORT_MODULES.includes(record.moduleCode)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_MODULE_INVALID" });
    const analysis = await analyzeImportFile({ moduleCode: record.moduleCode as ImportModuleCode, format: record.sourceFormat as "xlsx" | "csv" | "xer", bytes, mappingOverride: override });
    stage = "validating"; await touch(db, job.importId, stage, 60);
    await addOpeningBalanceReferenceErrors(db, { tenantId: job.tenantId, projectId: job.projectId, moduleCode: record.moduleCode, analysis });
    stage = "writing"; await touch(db, job.importId, stage, 80);
    await db.transaction(async tx => {
      await tx.delete(dataImportErrors).where(eq(dataImportErrors.importId, job.importId));
      const verdict = await tx.update(dataImports).set({
        status: analysis.errors.length ? "uploaded" : "validated", totalRows: analysis.rows.length, validRows: analysis.validRows.length, invalidRows: analysis.rows.length - analysis.validRows.length,
        mappingJson: JSON.stringify(analysis.mapping), summaryJson: JSON.stringify({ sheetNames: analysis.sheetNames, headers: analysis.headers }), progressPercent: 100, progressStage: null, failureReason: null, heartbeatAt: null,
      }).where(and(eq(dataImports.id, job.importId), eq(dataImports.status, "analyzing"))).returning({ id: dataImports.id });
      if (!verdict.length) return; // cancelled or failed meanwhile: nothing to record
      await insertChunked(tx, dataImportErrors, analysis.errors.map(error => ({ id: randomUUID(), importId: job.importId, rowNumber: error.rowNumber, code: error.code, severity: "error" as const, suggestedFix: "field" in error ? error.field : null, value: "detail" in error && error.detail ? String(error.detail).slice(0, 200) : null })));
      // what the file holds that this importer does not read: kept as WARNINGS (named in the preview), which never stop the import
      const ignored = analysisWarnings(analysis);
      if (ignored.length) await insertChunked(tx, dataImportErrors, ignored.map(warning => ({ id: randomUUID(), importId: job.importId, rowNumber: warning.rowNumber, code: warning.code, severity: "warning" as const, suggestedFix: warning.field ?? null })));
      await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: job.tenantId, actorUserId: job.userId, action: "data_import_uploaded", entityType: "data_import", entityId: job.importId, metadata: JSON.stringify({ projectId: job.projectId, moduleCode: record.moduleCode, fileHash: record.fileHash, totalRows: analysis.rows.length, background: true }) });
    });
  } catch (error) {
    logError("import.analysis_failed", error, { importId: job.importId, stage });
    await failJob(db, job, reasonCode(error), stage);
  }
}

/** The confirmation job: write the validated rows (the same code the synchronous confirmation runs), reporting progress as it goes. */
export async function runImportConfirmation(job: JobIdentity, options: { resume?: boolean } = {}) {
  const db = await database();
  if (!(await claim(db, job.importId, "importing", options.resume ?? false))) return;
  let stage = "downloading";
  try {
    const progress = async (next: string, percent: number) => { stage = next; await touch(db, job.importId, next, percent); };
    const [module] = await db.select({ moduleCode: dataImports.moduleCode }).from(dataImports).where(and(eq(dataImports.id, job.importId), eq(dataImports.tenantId, job.tenantId))).limit(1);
    if (module?.moduleCode === "p6") await confirmP6Job(db, job, progress);
    else if (module && isExternalModule(module.moduleCode)) await confirmExternal(db, job, progress);
    else await confirmAndImportData({ ...job, asJob: true, onStage: progress });
    await db.update(dataImports).set({ progressPercent: 100, progressStage: null, failureReason: null, heartbeatAt: null }).where(and(eq(dataImports.id, job.importId), eq(dataImports.status, "completed")));
  } catch (error) {
    logError("import.confirmation_failed", error, { importId: job.importId, stage });
    await failJob(db, job, reasonCode(error), stage);
  }
}

/**
 * Q-61 (P6): a full Primavera import (WBS, activities, relationships, resources, codes) as a background job. The file is already in Storage (the smart box's signed upload); here the import is
 * recorded as `importing` (with the hash the person approved) and the write runs after the response, in ONE transaction that also turns the row into `completed`. The screen polls
 * getImportProgress; a function killed at its limit leaves nothing written (the transaction rolled back) and the sweep / next poll re-runs it, at most IMPORT_JOB_MAX_ATTEMPTS times.
 */
export async function startP6ImportJob(input: { userId: number; tenantId: string; projectId: string; uploadKey: string; fileName: string; bytes: Uint8Array; approvedHash?: string }) {
  const db = await authorizeNewImport({ userId: input.userId, tenantId: input.tenantId, projectId: input.projectId, moduleCode: "schedule" });
  const fileHash = createHash("sha256").update(input.bytes).digest("hex");
  if (input.approvedHash && input.approvedHash !== fileHash) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_PMC_IMPORT_FILE_CHANGED" });
  await assertFileNotAlreadyImported(db, { tenantId: input.tenantId, fileHash });
  const id = randomUUID();
  try {
    await db.insert(dataImports).values({
      id, tenantId: input.tenantId, projectId: input.projectId, moduleCode: "p6", templateCode: "p6_v1", sourceFormat: "xer", fileName: input.fileName, fileKey: input.uploadKey, fileHash,
      status: "importing", duplicateMode: "fail_on_duplicate", progressPercent: 5, progressStage: "queued", createdByUserId: input.userId,
    });
  } catch (error) {
    if (isDuplicateEntryError(error)) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_IMPORT_DUPLICATE_DETECTED" });
    throw error;
  }
  const job = { userId: input.userId, tenantId: input.tenantId, projectId: input.projectId, importId: id };
  void runAfterResponse(`import.p6:${id}`, () => runImportConfirmation(job));
  return { id, status: "importing" as const };
}

/** The write of a P6 job: read the stored file, check it is the one that was approved, and run the importer's single transaction on this import row. Safe to repeat: a killed run wrote nothing. */
async function confirmP6Job(db: Db, job: JobIdentity, onStage: (stage: string, percent: number) => Promise<void>) {
  const [record] = await db.select({ fileKey: dataImports.fileKey, fileName: dataImports.fileName, fileHash: dataImports.fileHash })
    .from(dataImports).where(and(eq(dataImports.id, job.importId), eq(dataImports.tenantId, job.tenantId), eq(dataImports.projectId, job.projectId), eq(dataImports.status, "importing"))).limit(1);
  if (!record) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_NOT_CONFIRMABLE" });
  await onStage("downloading", 10);
  const bytes = await storageRead(record.fileKey);
  if (!bytes.length || bytes.length > MAX_DIRECT_UPLOAD_BYTES || createHash("sha256").update(bytes).digest("hex") !== record.fileHash) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_FILE_INVALID" });
  await onStage("writing", 30);
  await confirmP6Import({ userId: job.userId, tenantId: job.tenantId, projectId: job.projectId, bytes, approvedHash: record.fileHash, source: { key: record.fileKey, name: record.fileName }, importId: job.importId });
}

/** Who may act on an import at all: the general importer's gate, or (for a PMC / master-plan import) that module's own. The module's gate is ALSO applied to the record afterwards, so holding one never opens the other. */
async function importAccess(input: { userId: number; tenantId: string; projectId: string; importId: string }) {
  try { return await assertImportAccess(input); } catch (error) {
    if (!(error instanceof TRPCError)) throw error;
    const db = await database();
    const [row] = await db.select({ moduleCode: dataImports.moduleCode, summaryJson: dataImports.summaryJson }).from(dataImports).where(and(eq(dataImports.id, input.importId), eq(dataImports.tenantId, input.tenantId), eq(dataImports.projectId, input.projectId))).limit(1);
    if (!row || !isExternalModule(row.moduleCode)) throw error;
    await authorizeExternalImport({ userId: input.userId, tenantId: input.tenantId, projectId: input.projectId, moduleCode: row.moduleCode, context: contextOf(row.summaryJson) });
    return { db, snapshot: null };
  }
}

async function readRecord(db: Db, input: { tenantId: string; projectId: string; importId: string }) {
  const [record] = await db.select({
    id: dataImports.id, moduleCode: dataImports.moduleCode, status: dataImports.status, totalRows: dataImports.totalRows, validRows: dataImports.validRows, invalidRows: dataImports.invalidRows, createdRows: dataImports.createdRows, updatedRows: dataImports.updatedRows, skippedRows: dataImports.skippedRows,
    progressPercent: dataImports.progressPercent, progressStage: dataImports.progressStage, failureReason: dataImports.failureReason, heartbeatAt: dataImports.heartbeatAt, updatedAt: dataImports.updatedAt, attempts: dataImports.attempts, createdByUserId: dataImports.createdByUserId, summaryJson: dataImports.summaryJson,
  }).from(dataImports).where(and(eq(dataImports.id, input.importId), eq(dataImports.tenantId, input.tenantId), eq(dataImports.projectId, input.projectId))).limit(1);
  if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_IMPORT_NOT_FOUND" });
  return record;
}

/** Confirm. Small imports finish inside the request (the result is the final one); a large one becomes a background job and returns `importing`. */
export async function requestImportConfirmation(input: { userId: number; tenantId: string; projectId: string; importId: string; approvedDiffHash?: string }) {
  const { db, snapshot } = await importAccess(input);
  const record = await readRecord(db, input);
  const external = isExternalModule(record.moduleCode);
  if (external) await authorizeExternalImport({ userId: input.userId, tenantId: input.tenantId, projectId: input.projectId, moduleCode: record.moduleCode as ExternalModule, context: contextOf(record.summaryJson) });
  else assertTenantAccess(snapshot!, { tenantId: input.tenantId, product: "PROJECT", permission: importPermissionFor(record.moduleCode), scope: { type: "project", id: input.projectId } });
  if (record.status !== "validated") throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_NOT_CONFIRMABLE" });
  if (external && !parseJson<{ canConfirm?: boolean }>(record.summaryJson, {}).canConfirm) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_NOTHING_TO_CONFIRM" }); // a valid file that changes nothing has nothing to write
  // The hash of the differences the user reviewed rides with the import, so the write (inline or in the background job) can refuse if the file or the stored rows moved since.
  if (input.approvedDiffHash) await recordApprovedDiffHash(db, input, input.approvedDiffHash);
  const { approvedDiffHash: _approved, ...ids } = input;
  if (!external && record.validRows <= IMPORT_SYNC_MAX_ROWS) return confirmAndImportData(ids);
  const taken = await db.update(dataImports)
    .set({ status: "importing", progressPercent: 5, progressStage: "queued", failureReason: null, attempts: 0, heartbeatAt: null, startedAt: null, completedAt: null })
    .where(and(eq(dataImports.id, input.importId), eq(dataImports.tenantId, input.tenantId), eq(dataImports.projectId, input.projectId), eq(dataImports.status, "validated")))
    .returning({ id: dataImports.id });
  if (!taken.length) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_NOT_CONFIRMABLE" });
  // A small PMC / master-plan file is written inside the request like a small general import; a large one becomes a job the screen polls.
  if (external && record.validRows <= IMPORT_SYNC_MAX_ROWS) {
    await runImportConfirmation(ids);
    const after = await readRecord(db, input);
    if (after.status === "failed") {
      // Inside the request a refusal is an answer, as it is for a general import: the person is told why, and a refusal that happened BEFORE anything was written
      // (the preview is stale, the project changed, nothing to write) leaves the import where it was, ready to be looked at again.
      const reason = after.failureReason ?? "PROJECT_OS_IMPORT_JOB_FAILED";
      if (["PROJECT_OS_IMPORT_DIFF_CHANGED", "PROJECT_OS_IMPORT_VERSION_CONFLICT", "PROJECT_OS_IMPORT_NOTHING_TO_CONFIRM"].includes(reason)) {
        await db.update(dataImports).set({ status: "validated", failureReason: null, progressStage: null, heartbeatAt: null, completedAt: null }).where(and(eq(dataImports.id, input.importId), eq(dataImports.tenantId, input.tenantId), eq(dataImports.status, "failed")));
      }
      throw new TRPCError({ code: "BAD_REQUEST", message: reason });
    }
    return progressView(db, after, input);
  }
  void runAfterResponse(`import.confirm:${input.importId}`, () => runImportConfirmation(ids));
  return { id: input.importId, status: "importing" as const };
}

/** Re-analysis with another column mapping. A small import (or a re-run of a sync analysis) stays synchronous; a large one, or a failed job, runs in the background. */
export async function requestImportReanalysis(input: { userId: number; tenantId: string; projectId: string; importId: string; mappingOverride: Record<string, string> }) {
  const { db, snapshot } = await importAccess(input);
  const record = await readRecord(db, input);
  // Q-31 (P0-02): the columns of a PMC file, an operational ledger (costs, orders, employees, hours) or the equipment list can be chosen by a person;
  // the master-plan files keep fixed columns (upload the corrected file)
  const external = isExternalModule(record.moduleCode);
  if (external && !pmcKindOf(record.moduleCode as ExternalModule) && !isLedgerModule(record.moduleCode) && record.moduleCode !== "equipment") throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_MODULE_INVALID" });
  if (external) await authorizeExternalImport({ ...input, moduleCode: record.moduleCode as ExternalModule });
  else assertTenantAccess(snapshot!, { tenantId: input.tenantId, product: "PROJECT", permission: importPermissionFor(record.moduleCode), scope: { type: "project", id: input.projectId } });
  if (record.status !== "uploaded" && record.status !== "validated" && record.status !== "failed") throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_NOT_CONFIRMABLE" });
  // an external analysis (PMC, ledger) always runs as a job (it reads the file from storage); a small general import stays synchronous
  if (!external && record.status !== "failed" && record.totalRows <= IMPORT_SYNC_MAX_ROWS) return reanalyzeDataImport(input);
  try {
    const taken = await db.update(dataImports)
      // other columns are another reading of the file: the corrections made on the previous one are dropped (the screen says so before the person applies)
      .set({ status: "analyzing", mappingJson: JSON.stringify(input.mappingOverride), ...(external ? { summaryJson: withoutEdits(record.summaryJson) } : {}), progressPercent: 5, progressStage: "queued", failureReason: null, attempts: 0, heartbeatAt: null, startedAt: null, completedAt: null })
      .where(and(eq(dataImports.id, input.importId), eq(dataImports.tenantId, input.tenantId), eq(dataImports.projectId, input.projectId), inArray(dataImports.status, ["uploaded", "validated", "failed"])))
      .returning({ id: dataImports.id });
    if (!taken.length) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_NOT_CONFIRMABLE" });
  } catch (error) {
    // a failed row released its hash; another import of the same file may hold it now
    if (isDuplicateEntryError(error)) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_IMPORT_DUPLICATE_DETECTED" });
    throw error;
  }
  void runAfterResponse(`import.reanalyze:${input.importId}`, () => runImportAnalysis(input));
  return { id: input.importId, status: "analyzing" as const };
}

/** The stored summary without the preview's corrections (a new column choice is a new reading). */
const withoutEdits = (summaryJson: string | null) => {
  const summary = parseJson<Record<string, unknown>>(summaryJson, {});
  if (!("edits" in summary)) return summaryJson;
  const { edits: _dropped, ...rest } = summary;
  return JSON.stringify(rest);
};

/** Q-50 batch 4 (docs/proposals/universal-import.md §4): a correction in the preview of a PMC file — a cell of a row, by the field it is read for, or a row left
 * out. The stored file is untouched; the corrections replace the previous ones (the screen sends them all), the file is analysed again in the background, and
 * nothing is written before the person confirms the new report. The operational ledgers, the equipment list and the master plan are refused (decision 3). */
export async function requestImportCorrection(input: { userId: number; tenantId: string; projectId: string; importId: string; edits: PmcImportEdits }) {
  const { db } = await importAccess(input);
  const record = await readRecord(db, input);
  if (!isExternalModule(record.moduleCode) || !pmcKindOf(record.moduleCode as ExternalModule)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_EDITS_NOT_ALLOWED" });
  await authorizeExternalImport({ ...input, moduleCode: record.moduleCode as ExternalModule });
  if (record.status !== "uploaded" && record.status !== "validated") throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_NOT_CONFIRMABLE" });
  const summary = parseJson<Record<string, unknown>>(record.summaryJson, {});
  const edits = input.edits.cells.length || input.edits.ignoreRows.length || input.edits.readRows?.length ? input.edits : undefined;
  const taken = await db.update(dataImports)
    .set({ status: "analyzing", summaryJson: JSON.stringify({ ...summary, edits }), progressPercent: 5, progressStage: "queued", failureReason: null, attempts: 0, heartbeatAt: null, startedAt: null, completedAt: null })
    .where(and(eq(dataImports.id, input.importId), eq(dataImports.tenantId, input.tenantId), eq(dataImports.projectId, input.projectId), inArray(dataImports.status, ["uploaded", "validated"])))
    .returning({ id: dataImports.id });
  if (!taken.length) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_NOT_CONFIRMABLE" });
  void runAfterResponse(`import.correct:${input.importId}`, () => runImportAnalysis(input));
  return { id: input.importId, status: "analyzing" as const };
}

const isStalled = (record: { heartbeatAt: Date | null; updatedAt: Date }, now: number) => now - (record.heartbeatAt ?? record.updatedAt).getTime() > IMPORT_JOB_STALL_MS;

/** Resumes a dead job (stale heartbeat), or fails it once it has used up its attempts. Safe to call from several places at once: the claim is atomic. */
async function resumeIfStalled(db: Db, job: JobIdentity, record: Awaited<ReturnType<typeof readRecord>>, now: number): Promise<boolean> {
  if (!(inFlight as readonly string[]).includes(record.status) || !isStalled(record, now)) return false;
  if (record.attempts >= IMPORT_JOB_MAX_ATTEMPTS) { await failJob(db, job, "PROJECT_OS_IMPORT_JOB_STALLED", record.progressStage); return true; }
  const run = record.status === "analyzing" ? () => runImportAnalysis(job, { resume: true }) : () => runImportConfirmation(job, { resume: true });
  void runAfterResponse(`import.resume:${job.importId}`, run);
  return true;
}

/** The most validation errors a poll returns; the record's counters carry the true totals. */
const PROGRESS_ERRORS_LIMIT = 100;
/** How many row numbers and values a grouped error shows. */
const PROGRESS_GROUP_SAMPLES = 5;

async function progressView(db: Db, record: Awaited<ReturnType<typeof readRecord>> | { id: string; status: string; progressPercent: number; progressStage: string | null; failureReason: string | null; totalRows: number; validRows: number; invalidRows: number; createdRows: number; updatedRows: number; skippedRows: number }, input: JobIdentity) {
  const view = { id: record.id, status: record.status, progressPercent: record.progressPercent, progressStage: record.progressStage, failureReason: record.failureReason, totalRows: record.totalRows, validRows: record.validRows, invalidRows: record.invalidRows, createdRows: record.createdRows, updatedRows: record.updatedRows, skippedRows: record.skippedRows };
  // Once the analysis is done the screen needs what the old synchronous answer carried: the file's columns, the detected mapping and the validation errors.
  // Q-56 (5): a completed PMC / master-plan import keeps the report it was confirmed on (activities per model, their total, what was skipped and why),
  // so the screen can say what was saved; read only, nothing to confirm. The general importer has no report and gets null as before.
  if (record.status === "completed") {
    const [saved] = await db.select({ summaryJson: dataImports.summaryJson }).from(dataImports).where(and(eq(dataImports.id, input.importId), eq(dataImports.tenantId, input.tenantId), eq(dataImports.projectId, input.projectId))).limit(1);
    const report = parseJson<{ report?: Record<string, unknown> }>(saved?.summaryJson, {}).report;
    return { ...view, analysis: null, external: report ? { report, canConfirm: false } : null, suggestedTemplate: null };
  }
  if (record.status !== "uploaded" && record.status !== "validated") return { ...view, analysis: null, external: null, suggestedTemplate: null };
  const [stored] = await db.select({ mappingJson: dataImports.mappingJson, summaryJson: dataImports.summaryJson, moduleCode: dataImports.moduleCode }).from(dataImports).where(and(eq(dataImports.id, input.importId), eq(dataImports.tenantId, input.tenantId), eq(dataImports.projectId, input.projectId))).limit(1);
  const errors = await db.select({ rowNumber: dataImportErrors.rowNumber, code: dataImportErrors.code, field: dataImportErrors.suggestedFix }).from(dataImportErrors).where(and(eq(dataImportErrors.importId, input.importId), eq(dataImportErrors.severity, "error"))).orderBy(dataImportErrors.rowNumber).limit(PROGRESS_ERRORS_LIMIT);
  const [{ total }] = await db.select({ total: sql<number>`count(*)::int` }).from(dataImportErrors).where(and(eq(dataImportErrors.importId, input.importId), eq(dataImportErrors.severity, "error")));
  // One line per kind of error, not one per row: a P6 file with 172 rows of the same mistake read as 172 identical lines. Each group carries its true count, the first rows it happens on and a few of the offending values.
  const errorGroups = await db.select({
    code: dataImportErrors.code, field: dataImportErrors.suggestedFix, count: sql<number>`count(*)::int`,
    rows: sql<number[]>`(array_agg(${dataImportErrors.rowNumber} order by ${dataImportErrors.rowNumber}))[1:${sql.raw(String(PROGRESS_GROUP_SAMPLES))}]`,
    values: sql<string[]>`coalesce((array_agg(${dataImportErrors.value} order by ${dataImportErrors.rowNumber}) filter (where ${dataImportErrors.value} is not null))[1:${sql.raw(String(PROGRESS_GROUP_SAMPLES))}], '{}')`,
  }).from(dataImportErrors).where(and(eq(dataImportErrors.importId, input.importId), eq(dataImportErrors.severity, "error"))).groupBy(dataImportErrors.code, dataImportErrors.suggestedFix).orderBy(sql`min(${dataImportErrors.rowNumber})`).limit(PROGRESS_ERRORS_LIMIT);
  const warnings = await db.select({ code: dataImportErrors.code, field: dataImportErrors.suggestedFix }).from(dataImportErrors).where(and(eq(dataImportErrors.importId, input.importId), eq(dataImportErrors.severity, "warning"))).orderBy(dataImportErrors.suggestedFix).limit(PROGRESS_ERRORS_LIMIT);
  const parse = parseJson;
  const summary = parse<{ headers?: string[]; report?: Record<string, unknown>; canConfirm?: boolean }>(stored?.summaryJson, {});
  // Q-50 batch 2: a company template that fits these columns is offered (never applied here: the person applies it through reanalyze after seeing it).
  const columns = reportColumnsOf(stored?.summaryJson ?? null);
  const suggestedTemplate = columns && stored ? await suggestImportTemplate(db, { tenantId: input.tenantId, moduleCode: stored.moduleCode, headers: columns.headers }) : null;
  // `external` carries the PMC / master-plan importer's own report (what the file would create or change); the general importer's screen ignores it.
  return { ...view, suggestedTemplate, analysis: { headers: summary.headers ?? [], mapping: parse<Record<string, string>>(stored?.mappingJson, {}), errors, errorGroups, errorsListed: errors.length, errorsTotal: Number(total), warnings }, external: summary.report ? { report: summary.report, canConfirm: summary.canConfirm === true } : null };
}

/** What the screen polls. Anyone who can read the project's imports sees the state; a poll by someone who may import also revives a dead job. */
export async function getImportProgress(input: { userId: number; tenantId: string; projectId: string; importId: string }, now = Date.now()) {
  const db = await database();
  let canImport = true;
  try { await importAccess(input); } catch (error) { canImport = false; if (!(error instanceof TRPCError)) throw error; }
  if (!canImport) await getDataImportDetailForTenant(input); // read-only viewers: the same visibility as the import list (throws when they may not see it)
  const record = await readRecord(db, input);
  // a stalled PMC / master-plan job is revived only by someone who passes THAT module's gate: the job runs under the identity of whoever revives it
  if (canImport && isExternalModule(record.moduleCode)) { try { await authorizeExternalImport({ userId: input.userId, tenantId: input.tenantId, projectId: input.projectId, moduleCode: record.moduleCode, context: contextOf(record.summaryJson) }); } catch (error) { if (!(error instanceof TRPCError)) throw error; canImport = false; } }
  if (canImport && await resumeIfStalled(db, input, record, now)) return progressView(db, await readRecord(db, input), input);
  return progressView(db, record, input);
}

/** The periodic sweep (cron, system context): revive or fail every dead job, and remove uploads that were never registered. */
export async function sweepImportJobs(now = Date.now()) {
  const db = await database();
  const rows = await db.select({ id: dataImports.id, tenantId: dataImports.tenantId, projectId: dataImports.projectId, status: dataImports.status, createdByUserId: dataImports.createdByUserId, heartbeatAt: dataImports.heartbeatAt, updatedAt: dataImports.updatedAt, attempts: dataImports.attempts, progressStage: dataImports.progressStage })
    .from(dataImports).where(inArray(dataImports.status, [...inFlight]));
  let resumed = 0; let failed = 0;
  for (const row of rows) {
    if (!isStalled(row, now)) continue;
    const job = { userId: row.createdByUserId, tenantId: row.tenantId, projectId: row.projectId!, importId: row.id };
    if (row.attempts >= IMPORT_JOB_MAX_ATTEMPTS) { await failJob(db, job, "PROJECT_OS_IMPORT_JOB_STALLED", row.progressStage); failed += 1; continue; }
    void runAfterResponse(`import.sweep:${row.id}`, () => (row.status === "analyzing" ? runImportAnalysis(job, { resume: true }) : runImportConfirmation(job, { resume: true })));
    resumed += 1;
  }
  // Uploads nobody registered: a key under .../pending/ that no import row points at, older than a day.
  const referenced = new Set((await db.select({ key: dataImports.fileKey }).from(dataImports).where(isNotNull(dataImports.fileKey))).map(row => row.key));
  let orphansRemoved = 0;
  for (const object of await storageList("imports/")) {
    if (!object.key.includes("/pending/") || referenced.has(object.key) || !object.lastModified || now - object.lastModified.getTime() < ORPHAN_UPLOAD_MAX_AGE_MS) continue;
    await storageDelete(object.key).catch(error => logError("import.orphan_delete_failed", error));
    orphansRemoved += 1;
  }
  // The same for the smart import box's originals (.../smart/): one nobody confirmed is not linked from data_import_sources.
  const linked = new Set((await db.select({ key: dataImportSources.sourceKey }).from(dataImportSources)).map(row => row.key));
  for (const object of await storageList("imports/")) {
    if (!object.key.includes("/smart/") || linked.has(object.key) || !object.lastModified || now - object.lastModified.getTime() < ORPHAN_UPLOAD_MAX_AGE_MS) continue;
    await storageDelete(object.key).catch(error => logError("import.orphan_delete_failed", error));
    orphansRemoved += 1;
  }
  // The same for the attachment and site-plan uploads (server/directUpload.ts): a pending object nobody turned into a document or a plan.
  for (const object of await storageList("uploads/")) {
    if (!object.key.includes("/pending/") || !object.lastModified || now - object.lastModified.getTime() < ORPHAN_UPLOAD_MAX_AGE_MS) continue;
    await storageDelete(object.key).catch(error => logError("upload.orphan_delete_failed", error));
    orphansRemoved += 1;
  }
  return { inFlight: rows.length, resumed, failed, orphansRemoved };
}

/**
 * The differences preview of any import. The general modules' (master data) is computed by `previewDataImportDiff`; an operational module's (costs, purchase orders,
 * employees, hours) is its own plan, and reading it passes that module's gate — for the HR modules the read is itself audited.
 */
export async function previewImportDiff(input: { userId: number; tenantId: string; projectId: string; importId: string; kind?: "new" | "modified" | "conflict" | "all"; offset?: number }) {
  const { db } = await importAccess(input);
  const record = await readRecord(db, input);
  if (!isExternalModule(record.moduleCode)) return previewDataImportDiff(input);
  await authorizeExternalImport({ userId: input.userId, tenantId: input.tenantId, projectId: input.projectId, moduleCode: record.moduleCode, context: contextOf(record.summaryJson) });
  if (!isLedgerModule(record.moduleCode)) return { supported: false as const, moduleCode: record.moduleCode };
  if (record.status !== "uploaded" && record.status !== "validated") throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_DIFF_UNAVAILABLE" });
  const [file] = await db.select({ fileKey: dataImports.fileKey, fileHash: dataImports.fileHash, sourceFormat: dataImports.sourceFormat, mappingJson: dataImports.mappingJson }).from(dataImports).where(and(eq(dataImports.id, input.importId), eq(dataImports.tenantId, input.tenantId), eq(dataImports.projectId, input.projectId))).limit(1);
  const bytes = await storageRead(file!.fileKey);
  if (!bytes.length || bytes.length > MAX_DIRECT_UPLOAD_BYTES || createHash("sha256").update(bytes).digest("hex") !== file!.fileHash) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_FILE_INVALID" });
  // the columns the person chose (Q-31): the preview, its hash and the write read the file the same way
  const plan = await planLedgerImport(db, input, record.moduleCode, file!.sourceFormat as "xlsx" | "csv", bytes, storedMapping(file!.mappingJson));
  if (plan.readsEmployeeRecords) await auditEmployeeRecordsRead(db, input, record.moduleCode, "preview", plan.totalRows);
  const kind = input.kind ?? "all";
  const shown = plan.entries.filter(item => (kind === "all" ? item.kind !== "unchanged" : item.kind === kind));
  const offset = input.offset ?? 0;
  return { supported: true as const, moduleCode: record.moduleCode, summary: summariseDiff({ entries: plan.entries, missing: plan.missing }), rejected: plan.errors.length, rejections: plan.errors.slice(0, DIFF_PAGE_SIZE), diffHash: ledgerPlanHash(plan), entries: shown.slice(offset, offset + DIFF_PAGE_SIZE), shownTotal: shown.length, offset, pageSize: DIFF_PAGE_SIZE, missing: plan.missing.slice(0, DIFF_PAGE_SIZE), missingTotal: plan.missing.length };
}


/*
 * Q-50 batch 2 (docs/proposals/universal-import.md §4; adviser's decision I52): company templates for the files whose columns a person can map (PMC kinds and
 * the operational ledgers). A mapping the person confirmed on one import is saved for the company and that kind; a later file whose headers match it by at
 * least TEMPLATE_SUGGEST_AT is offered the template — never applied without the person seeing and confirming the mapping (they apply it through reanalyze,
 * as with any mapping they choose). Templates live in import_source_profiles (tenant_id + RLS: one company never sees another's), and saving or deleting one
 * takes the same permission as importing that kind, with an audit row in the same transaction.
 */
export const TEMPLATE_SUGGEST_AT = 0.8;
type ReportColumns = { headers: string[]; fields: Array<{ key: string; header: string | null }> };
const templateHeaderKey = (value: string) => value.replace(/^﻿/, "").trim().toLowerCase().replace(/[\s_-]+/g, " ");
const templateSignature = (headers: string[]) => Array.from(new Set(headers.map(templateHeaderKey).filter(Boolean))).sort();
const signatureOverlap = (a: string[], b: string[]) => { if (!a.length || !b.length) return 0; const set = new Set(b); return a.filter(item => set.has(item)).length / Math.max(a.length, b.length); };
// where each importer's report keeps the columns it read: a ledger under `ledger.columns`, a PMC file under `pmc.details.columns`
const reportColumnsOf = (summaryJson: string | null) => {
  const report = parseJson<{ report?: { columns?: ReportColumns; ledger?: { columns?: ReportColumns }; pmc?: { details?: { columns?: ReportColumns } } } }>(summaryJson, {}).report;
  return report?.columns ?? report?.ledger?.columns ?? report?.pmc?.details?.columns;
};
const mappableModule = (moduleCode: string): moduleCode is ExternalModule => isExternalModule(moduleCode) && (Boolean(pmcKindOf(moduleCode as ExternalModule)) || isLedgerModule(moduleCode));

async function authorizeTemplateKind(input: { userId: number; tenantId: string; projectId: string }, moduleCode: string) {
  if (!mappableModule(moduleCode)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_MODULE_INVALID" });
  await authorizeExternalImport({ ...input, moduleCode });
}

/** The company's best template for these headers and this kind, if it matches by at least TEMPLATE_SUGGEST_AT and every header it maps is in the file. */
export async function suggestImportTemplate(db: Db, input: { tenantId: string; moduleCode: string; headers: string[] }) {
  if (!mappableModule(input.moduleCode) || input.headers.length === 0) return null;
  const rows = await db.select({ id: importSourceProfiles.id, name: importSourceProfiles.name, headerSignature: importSourceProfiles.headerSignature, columnMapJson: importSourceProfiles.columnMapJson })
    .from(importSourceProfiles).where(and(eq(importSourceProfiles.tenantId, input.tenantId), eq(importSourceProfiles.kind, input.moduleCode)));
  const mine = templateSignature(input.headers);
  const present = new Set(input.headers);
  let best: { id: string; name: string; score: number; mapping: Record<string, string> } | null = null;
  for (const row of rows) {
    const score = signatureOverlap(mine, parseJson<string[]>(row.headerSignature, []));
    const mapping = parseJson<Record<string, string>>(row.columnMapJson, {});
    if (score < TEMPLATE_SUGGEST_AT || !Object.values(mapping).every(header => header === "" || header === "ignore" || present.has(header))) continue;
    if (!best || score > best.score) best = { id: row.id, name: row.name, score: Math.round(score * 100) / 100, mapping };
  }
  return best;
}

/** Saves the mapping the person confirmed on this import (the columns the analysis used) as the company's template for its kind. */
export async function saveImportTemplate(input: { userId: number; tenantId: string; projectId: string; importId: string; name: string }) {
  const { db } = await importAccess(input);
  const [record] = await db.select({ moduleCode: dataImports.moduleCode, status: dataImports.status, summaryJson: dataImports.summaryJson })
    .from(dataImports).where(and(eq(dataImports.id, input.importId), eq(dataImports.tenantId, input.tenantId), eq(dataImports.projectId, input.projectId))).limit(1);
  if (!record) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_IMPORT_NOT_FOUND" });
  await authorizeTemplateKind(input, record.moduleCode);
  const columns = reportColumnsOf(record.summaryJson);
  const chosen = columns?.fields.filter(field => field.header) ?? [];
  // only a complete, analysed mapping is worth keeping: an analysis still missing a required column would teach the next file the same gap
  if (record.status !== "validated" || !columns || chosen.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_TEMPLATE_NOT_READY" });
  const mapping = Object.fromEntries(chosen.map(field => [field.key, field.header!]));
  return db.transaction(async tx => {
    const [row] = await tx.insert(importSourceProfiles).values({ id: randomUUID(), tenantId: input.tenantId, name: input.name, kind: record.moduleCode, headerSignature: JSON.stringify(templateSignature(columns.headers)), columnMapJson: JSON.stringify(mapping), timesUsed: 1, createdByUserId: input.userId })
      // the name is the company's (one unique index across every kind): it updates only a template of the SAME kind; a name another kind already uses
      // (a PMC template, a smart-import profile) is refused, never taken over by someone who may not import that kind (review of #446)
      .onConflictDoUpdate({ target: [importSourceProfiles.tenantId, importSourceProfiles.name], set: { headerSignature: JSON.stringify(templateSignature(columns.headers)), columnMapJson: JSON.stringify(mapping), updatedAt: sql`now()` }, setWhere: eq(importSourceProfiles.kind, record.moduleCode) })
      .returning({ id: importSourceProfiles.id });
    if (!row) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_IMPORT_TEMPLATE_NAME_TAKEN" });
    await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "import_template_saved", entityType: "import_source_profile", entityId: row!.id, metadata: JSON.stringify({ projectId: input.projectId, importId: input.importId, moduleCode: record.moduleCode, name: input.name, fields: Object.keys(mapping) }) });
    return { id: row!.id, name: input.name, mapping };
  });
}

/** A member of the company and a project of that company; which kinds they may import is checked per template (a cost-only role has no general import right). */
async function templateScope(input: { userId: number; tenantId: string; projectId: string }) {
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  // a company whose PROJECT licence is off is refused before anything is read, like every tenant read (gate6.matrix)
  if (!snapshot.entitledProducts.includes("PROJECT")) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_PRODUCT_NOT_ENTITLED" });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  return database();
}

/** The company's templates for the kinds the person may import in this project (name, kind, the mapping, when last changed). */
export async function listImportTemplates(input: { userId: number; tenantId: string; projectId: string }) {
  const db = await templateScope(input);
  const rows = await db.select({ id: importSourceProfiles.id, name: importSourceProfiles.name, kind: importSourceProfiles.kind, columnMapJson: importSourceProfiles.columnMapJson, updatedAt: importSourceProfiles.updatedAt })
    .from(importSourceProfiles).where(eq(importSourceProfiles.tenantId, input.tenantId)).orderBy(importSourceProfiles.name);
  const allowed: typeof rows = [];
  for (const row of rows) {
    if (!mappableModule(row.kind)) continue;
    try { await authorizeExternalImport({ ...input, moduleCode: row.kind }); allowed.push(row); } catch { /* a kind this person may not import is not listed */ }
  }
  return allowed.map(row => ({ id: row.id, name: row.name, kind: row.kind, mapping: parseJson<Record<string, string>>(row.columnMapJson, {}), updatedAt: row.updatedAt }));
}

/** Deletes one of the company's templates; the same permission as importing its kind. A template of another company reads as not found. */
export async function deleteImportTemplate(input: { userId: number; tenantId: string; projectId: string; templateId: string }) {
  const db = await templateScope(input);
  const [row] = await db.select({ kind: importSourceProfiles.kind, name: importSourceProfiles.name }).from(importSourceProfiles)
    .where(and(eq(importSourceProfiles.id, input.templateId), eq(importSourceProfiles.tenantId, input.tenantId))).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_IMPORT_TEMPLATE_NOT_FOUND" });
  if (!mappableModule(row.kind)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_MODULE_INVALID" });
  await authorizeExternalImport({ ...input, moduleCode: row.kind });
  return db.transaction(async tx => {
    const deleted = await tx.delete(importSourceProfiles).where(and(eq(importSourceProfiles.id, input.templateId), eq(importSourceProfiles.tenantId, input.tenantId))).returning({ id: importSourceProfiles.id });
    if (!deleted.length) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_IMPORT_TEMPLATE_NOT_FOUND" });
    await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "import_template_deleted", entityType: "import_source_profile", entityId: input.templateId, metadata: JSON.stringify({ projectId: input.projectId, kind: row.kind, name: row.name }) });
    return { id: input.templateId };
  });
}
