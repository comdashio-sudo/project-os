// A progress update exported from the scheduling tool (activity id + actual start + actual finish, as .xls or .xlsx) applied to the schedule already in the project:
// matched by ACTIVITY ID against the activities of the imported schedule, and only the actual start and finish dates (and what follows from them: in progress / completed) are written.
// `analyze` counts what would change, against the project's own rows, and writes nothing; `confirm` applies exactly that, in one transaction, with the audit row.
//   «N activities will be updated, of which S started, F finished, and K have an id that is not in the schedule»
import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { activities, auditLogs, dataImportRowResults, dataImportSources, dataImports } from "../drizzle/schema";
import { authorizeNewImport } from "./db";
import { detectScheduleUpdate, type ScheduleUpdateModel } from "./domain/smartImport/scheduleUpdate";
import { readGrid } from "./domain/smartImport/sheetReader";
import { detectFormat } from "./domain/smartImport/understand";

type Scope = { userId: number; tenantId: string; projectId: string };
const CHUNK = 500;
const chunks = <T,>(items: T[], size = CHUNK) => Array.from({ length: Math.ceil(items.length / size) }, (_unused, index) => items.slice(index * size, (index + 1) * size));
const day = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

export type ScheduleUpdatePlan = {
  fileHash: string; sheet: string; ignoredSheets: string[]; rowsInFile: number;
  /** activities whose actual dates this file would change */
  updated: number;
  /** of those: newly started (had no actual start), newly finished (had no actual finish), and ones whose already-recorded date this file moves */
  started: number; finished: number; moved: number;
  /** ids in the file that are not an activity of the project's schedule */
  unknown: number; unknownCodes: string[];
  unchanged: number;
  issues: Array<{ code: string; row?: number; detail?: string }>;
  canConfirm: boolean;
  changes: Array<{ code: string; start: { from: string | null; to: string | null } | null; finish: { from: string | null; to: string | null } | null }>;
};
type Change = { id: string; code: string; actualStart: string | null; actualFinish: string | null; startFrom: string | null; finishFrom: string | null };

async function readUpdate(bytes: Uint8Array): Promise<{ model: ScheduleUpdateModel; fileHash: string }> {
  const format = detectFormat(bytes, "update.xls");
  if (format !== "xlsx" && format !== "xls") throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_SMART_IMPORT_FORMAT_UNSUPPORTED" });
  const grid = await readGrid(bytes, format);
  if (!grid.ok) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_FILE_INVALID" });
  const detected = detectScheduleUpdate(grid.sheets);
  if (!detected.ok) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_SCHEDULE_UPDATE_NOT_RECOGNISED" });
  return { model: detected.model, fileHash: createHash("sha256").update(bytes).digest("hex") };
}

type Db = Awaited<ReturnType<typeof authorizeNewImport>>;
type Reader = Pick<Db, "select">;

async function plan(db: Reader, input: Scope, model: ScheduleUpdateModel, fileHash: string): Promise<{ plan: ScheduleUpdatePlan; changes: Change[] }> {
  const stored = await db.select({ id: activities.id, code: activities.code, actualStartAt: activities.actualStartAt, actualFinishAt: activities.actualFinishAt }).from(activities).where(and(eq(activities.tenantId, input.tenantId), eq(activities.projectId, input.projectId)));
  const byCode = new Map(stored.map(row => [row.code, row]));
  const issues: ScheduleUpdatePlan["issues"] = model.badDates.map(item => ({ code: "SCHEDULE_UPDATE_DATE_UNREADABLE", row: item.row, detail: item.value }));
  const changes: Change[] = []; const unknownCodes: string[] = []; let started = 0; let finished = 0; let moved = 0; let unchanged = 0; const seen = new Set<string>();
  const result: ScheduleUpdatePlan["changes"] = [];
  for (const row of model.rows) {
    if (seen.has(row.code)) { issues.push({ code: "SCHEDULE_UPDATE_DUPLICATE_ID", row: row.row, detail: row.code }); continue; }
    seen.add(row.code);
    const activity = byCode.get(row.code);
    if (!activity) { unknownCodes.push(row.code); continue; }
    if (row.actualStart && row.actualFinish && row.actualFinish < row.actualStart) { issues.push({ code: "SCHEDULE_UPDATE_FINISH_BEFORE_START", row: row.row, detail: row.code }); continue; }
    const startFrom = day(activity.actualStartAt); const finishFrom = day(activity.actualFinishAt);
    const startChanges = row.actualStart !== null && row.actualStart !== startFrom; const finishChanges = row.actualFinish !== null && row.actualFinish !== finishFrom;
    if (!startChanges && !finishChanges) { unchanged += 1; continue; }
    if (startChanges) { if (startFrom === null) started += 1; else moved += 1; }
    if (finishChanges) { if (finishFrom === null) finished += 1; else moved += 1; }
    changes.push({ id: activity.id, code: row.code, actualStart: startChanges ? row.actualStart : null, actualFinish: finishChanges ? row.actualFinish : null, startFrom, finishFrom });
    if (result.length < 200) result.push({ code: row.code, start: startChanges ? { from: startFrom, to: row.actualStart } : null, finish: finishChanges ? { from: finishFrom, to: row.actualFinish } : null });
  }
  if (stored.length === 0) issues.push({ code: "SCHEDULE_UPDATE_NO_SCHEDULE" }); // nothing to match against: import the schedule (the .xer) first
  const out: ScheduleUpdatePlan = { fileHash, sheet: model.sheet, ignoredSheets: model.ignoredSheets, rowsInFile: model.rows.length, updated: changes.length, started, finished, moved, unknown: unknownCodes.length, unknownCodes: unknownCodes.slice(0, 200), unchanged, issues, canConfirm: stored.length > 0 && changes.length + unchanged > 0 && !issues.some(item => item.code === "SCHEDULE_UPDATE_NO_SCHEDULE"), changes: result };
  return { plan: out, changes };
}

export async function analyzeScheduleUpdate(input: Scope & { bytes: Uint8Array }): Promise<ScheduleUpdatePlan> {
  const db = await authorizeNewImport({ userId: input.userId, tenantId: input.tenantId, projectId: input.projectId, moduleCode: "schedule" });
  const { model, fileHash } = await readUpdate(input.bytes);
  return (await plan(db, input, model, fileHash)).plan;
}

export async function confirmScheduleUpdate(input: Scope & { bytes: Uint8Array; approvedHash?: string; source: { key: string; name: string } }) {
  const db = await authorizeNewImport({ userId: input.userId, tenantId: input.tenantId, projectId: input.projectId, moduleCode: "schedule" });
  const { model, fileHash } = await readUpdate(input.bytes);
  if (input.approvedHash && input.approvedHash !== fileHash) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_PMC_IMPORT_FILE_CHANGED" });
  return db.transaction(async tx => {
    const { plan: current, changes } = await plan(tx as unknown as Reader, input, model, fileHash); // re-counted inside the transaction: the project may have changed since the preview
    if (!current.canConfirm) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_VALIDATION_FAILED", cause: current.issues.slice(0, 20) });
    const now = new Date(); const at = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`) : null);
    for (const batch of chunks(changes, 50)) await Promise.all(batch.map(async change => {
      const finishing = change.actualFinish !== null;
      const updated = await tx.update(activities).set({
        ...(change.actualStart ? { actualStartAt: at(change.actualStart) } : {}), ...(change.actualFinish ? { actualFinishAt: at(change.actualFinish) } : {}),
        status: finishing ? "completed" : "in_progress", ...(finishing ? { percentComplete: "100", remainingHours: "0" } : {}), updatedAt: now,
      }).where(and(eq(activities.id, change.id), eq(activities.tenantId, input.tenantId))).returning({ id: activities.id });
      if (updated.length !== 1) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_IMPORT_VALIDATION_FAILED" }); // rows = 0 is never taken for success
    }));
    const importId = randomUUID();
    await tx.insert(dataImports).values({ id: importId, tenantId: input.tenantId, projectId: input.projectId, moduleCode: "p6update", templateCode: "p6update_v1", sourceFormat: detectFormat(input.bytes, input.source.name) === "xls" ? "xls" : "xlsx", fileName: input.source.name, fileKey: input.source.key, fileHash, status: "completed",
      totalRows: current.rowsInFile, validRows: current.updated + current.unchanged, invalidRows: current.unknown + current.issues.length, createdRows: 0, updatedRows: current.updated, skippedRows: current.unchanged,
      summaryJson: JSON.stringify({ scheduleUpdate: { updated: current.updated, started: current.started, finished: current.finished, moved: current.moved, unknown: current.unknown } }), createdByUserId: input.userId, progressPercent: 100, completedAt: now });
    await tx.insert(dataImportSources).values({ importId, tenantId: input.tenantId, projectId: input.projectId, sourceKey: input.source.key, sourceName: input.source.name, detectedKind: "scheduleUpdate", sheetName: model.sheet, mappingJson: JSON.stringify({ headerRow: model.headerRow, ignoredSheets: model.ignoredSheets }), mergedCellsFilled: 0 });
    let rowNumber = 0;
    for (const batch of chunks(changes)) await tx.insert(dataImportRowResults).values(batch.map(change => ({ id: randomUUID(), importId, rowNumber: (rowNumber += 1), rowKey: change.code.slice(0, 160), action: "updated" as const, entityId: change.id })));
    await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "schedule.p6_update_confirmed", entityType: "data_import", entityId: importId, metadata: JSON.stringify({ projectId: input.projectId, fileHash, updated: current.updated, started: current.started, finished: current.finished, moved: current.moved, unknown: current.unknown }) });
    return { importId, plan: current };
  });
}

