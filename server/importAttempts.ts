// The import log is a list of ATTEMPTS. Two things the person can do with one:
//   discard   an attempt that wrote nothing (refused by the analysis, or never confirmed): delete the attempt and its stored file, so the file can be uploaded again and the log is clean;
//   rollback  an import that was confirmed: delete exactly the rows THAT import created, in one transaction, with the audit row. Never rows it only updated (their previous values were not kept),
//             never rows something else now depends on (the foreign key refuses, the whole rollback is undone and says so).
import { randomUUID } from "node:crypto";
import { and, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { activities, activityCodeAssignments, activityCodeTypes, activityCodeValues, activityRelationships, activityResourceAssignments, auditLogs, budgetLines, contracts, dataImportErrors, dataImportRowResults, dataImportSources, dataImports, materialMasters, projectResources, scheduleCalendars, scheduleSnapshots, wbsItems } from "../drizzle/schema";
import { isForeignKeyViolation } from "./_core/database";
import { logError } from "./_core/logger";
import { assertProjectWithinTenant, assertTenantFeatureAccess, getDb, getTenantAccessSnapshot, importPermissionFor } from "./db";
import { assertTenantAccess } from "./domain/authorization";
import { attemptState, canDiscardAttempt, canRollbackAttempt, canRollbackModule } from "../shared/importAttempts";
import { storageDelete } from "./storage";
import { captureScheduleSnapshot, rollbackScheduleUpdate } from "./scheduleSnapshots";

export { ROLLBACK_MODULES } from "../shared/importAttempts";
const ROLLBACK_PERMISSION = "project.manage";

type Scope = { userId: number; tenantId: string; projectId: string; importId: string };
const fail = (message: string, code: TRPCError["code"] = "BAD_REQUEST") => new TRPCError({ code, message });

async function load(input: Scope, permission: string | readonly string[]) {
  const db = await getDb(); if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw fail("PROJECT_OS_TENANT_ACCESS_DENIED", "FORBIDDEN");
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission, scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const [record] = await db.select({ id: dataImports.id, moduleCode: dataImports.moduleCode, status: dataImports.status, fileKey: dataImports.fileKey, fileName: dataImports.fileName, summaryJson: dataImports.summaryJson, createdRows: dataImports.createdRows, updatedRows: dataImports.updatedRows })
    .from(dataImports).where(and(eq(dataImports.id, input.importId), eq(dataImports.tenantId, input.tenantId), eq(dataImports.projectId, input.projectId))).limit(1);
  if (!record) throw fail("PROJECT_OS_IMPORT_NOT_FOUND", "NOT_FOUND");
  const hasError = (await db.select({ rowNumber: dataImportErrors.rowNumber }).from(dataImportErrors).where(and(eq(dataImportErrors.importId, record.id), eq(dataImportErrors.severity, "error"))).limit(1)).length > 0;
  return { db, record, state: attemptState({ status: record.status, errorCount: hasError ? 1 : 0 }) };
}

export async function discardImportAttempt(input: Scope) {
  const { db, record, state } = await load(input, importPermissionFor("any"));
  // only an attempt that wrote nothing is deleted. An undone import is history (what it wrote, what the rollback took back, by whom): it stays.
  if (!canDiscardAttempt(state)) throw fail("PROJECT_OS_IMPORT_DISCARD_NOT_ALLOWED");
  try {
    await db.transaction(async tx => {
      await tx.delete(dataImportErrors).where(eq(dataImportErrors.importId, record.id));
      await tx.delete(dataImportRowResults).where(eq(dataImportRowResults.importId, record.id));
      await tx.delete(dataImportSources).where(eq(dataImportSources.importId, record.id));
      const removed = await tx.delete(dataImports).where(and(eq(dataImports.id, record.id), eq(dataImports.tenantId, input.tenantId), eq(dataImports.projectId, input.projectId), eq(dataImports.status, record.status))).returning({ id: dataImports.id });
      if (removed.length !== 1) throw fail("PROJECT_OS_IMPORT_NOT_CONFIRMABLE", "CONFLICT"); // rows = 0 is never taken for success: the attempt moved on (it was confirmed meanwhile)
      await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "data_import_attempt_discarded", entityType: "data_import", entityId: record.id, metadata: JSON.stringify({ projectId: input.projectId, moduleCode: record.moduleCode, fileName: record.fileName, state }) });
    });
  } catch (error) {
    if (isForeignKeyViolation(error)) throw fail("PROJECT_OS_IMPORT_DISCARD_NOT_ALLOWED", "CONFLICT");
    throw error;
  }
  await storageDelete(record.fileKey).catch(error => logError("import.discard_file_delete_failed", error, { importId: record.id })); // the file goes after the row: an orphan object is swept, a row without its file would be a broken record
  return { id: record.id, discarded: true as const };
}

export async function rollbackImport(input: Scope) {
  const { db, record, state } = await load(input, ROLLBACK_PERMISSION);
  await assertTenantFeatureAccess({ userId: input.userId, tenantId: input.tenantId, product: "PROJECT", permission: ROLLBACK_PERMISSION, featureCode: "DATA_IMPORT", scope: { type: "project", id: input.projectId } });
  if (!canRollbackAttempt(state)) throw fail("PROJECT_OS_IMPORT_ROLLBACK_NOT_COMPLETED");
  if (!canRollbackModule(record.moduleCode)) throw fail("PROJECT_OS_IMPORT_ROLLBACK_MODULE_UNSUPPORTED");
  if (record.moduleCode === "p6update") return rollbackActivityUpdate(db, input, record);
  if (record.moduleCode === "p6") return rollbackP6Import(db, input, record);
  const results = await db.select({ action: dataImportRowResults.action, rowKey: dataImportRowResults.rowKey, entityId: dataImportRowResults.entityId }).from(dataImportRowResults).where(eq(dataImportRowResults.importId, record.id));
  if (results.some(row => row.action === "updated")) throw fail("PROJECT_OS_IMPORT_ROLLBACK_HAS_UPDATES", "CONFLICT");
  const created = results.filter(row => row.action === "created" && row.entityId);
  const idsOf = (prefix?: string) => created.filter(row => !prefix || row.rowKey.startsWith(prefix)).map(row => row.entityId as string);
  if (created.length !== record.createdRows) throw fail("PROJECT_OS_IMPORT_ROLLBACK_INCOMPLETE_RECORD", "CONFLICT"); // the record does not list every row it created: refusing is safer than a partial undo
  const now = new Date();
  const deleted: Record<string, number> = {};
  try {
    await db.transaction(async tx => {
      const take = async (name: string, ids: string[], run: (batch: string[]) => Promise<{ id: string }[]>) => {
        let count = 0;
        for (let from = 0; from < ids.length; from += 500) count += (await run(ids.slice(from, from + 500))).length;
        if (count !== ids.length) throw fail("PROJECT_OS_IMPORT_ROLLBACK_INCOMPLETE_RECORD", "CONFLICT"); // a created row is already gone: the record no longer describes the data
        deleted[name] = count;
      };
      if (record.moduleCode === "schedule") {
        await take("activities", idsOf("activity:"), ids => tx.delete(activities).where(and(inArray(activities.id, ids), eq(activities.tenantId, input.tenantId), eq(activities.projectId, input.projectId))).returning({ id: activities.id }));
        await take("wbsItems", idsOf("wbs:"), ids => tx.delete(wbsItems).where(and(inArray(wbsItems.id, ids), eq(wbsItems.tenantId, input.tenantId), eq(wbsItems.projectId, input.projectId))).returning({ id: wbsItems.id }));
      } else if (record.moduleCode === "wbs") await take("wbsItems", idsOf(), ids => tx.delete(wbsItems).where(and(inArray(wbsItems.id, ids), eq(wbsItems.tenantId, input.tenantId), eq(wbsItems.projectId, input.projectId))).returning({ id: wbsItems.id }));
      else if (record.moduleCode === "budget") await take("budgetLines", idsOf(), ids => tx.delete(budgetLines).where(and(inArray(budgetLines.id, ids), eq(budgetLines.tenantId, input.tenantId), eq(budgetLines.projectId, input.projectId))).returning({ id: budgetLines.id }));
      else if (record.moduleCode === "contracts") await take("contracts", idsOf(), ids => tx.delete(contracts).where(and(inArray(contracts.id, ids), eq(contracts.tenantId, input.tenantId), eq(contracts.projectId, input.projectId))).returning({ id: contracts.id }));
      else await take("materials", idsOf(), ids => tx.delete(materialMasters).where(and(inArray(materialMasters.id, ids), eq(materialMasters.tenantId, input.tenantId))).returning({ id: materialMasters.id }));
      const previous = (() => { try { return JSON.parse(record.summaryJson ?? "{}") as Record<string, unknown>; } catch { return {}; } })();
      const marked = await tx.update(dataImports).set({ status: "cancelled", summaryJson: JSON.stringify({ ...previous, rolledBack: { at: now.toISOString(), byUserId: input.userId, deleted } }) })
        .where(and(eq(dataImports.id, record.id), eq(dataImports.tenantId, input.tenantId), eq(dataImports.projectId, input.projectId), eq(dataImports.status, "completed"))).returning({ id: dataImports.id });
      if (marked.length !== 1) throw fail("PROJECT_OS_IMPORT_ROLLBACK_NOT_COMPLETED", "CONFLICT");
      await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "data_import_rolled_back", entityType: "data_import", entityId: record.id, metadata: JSON.stringify({ projectId: input.projectId, moduleCode: record.moduleCode, fileName: record.fileName, deleted }) });
    });
  } catch (error) {
    if (isForeignKeyViolation(error)) throw fail("PROJECT_OS_IMPORT_ROLLBACK_IN_USE", "CONFLICT"); // the whole transaction is undone: something now depends on rows this import created
    throw error;
  }
  return { id: record.id, rolledBack: true as const, deleted };
}

/** G-208 (Q-23): an activity update (p6update) only UPDATED activities, so undoing it puts their previous values back from the snapshot taken before it
 *  (server/scheduleSnapshots.ts rollbackScheduleUpdate) — never a delete — and marks the import cancelled with its audit row, in one transaction. */
async function rollbackActivityUpdate(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, input: Scope, record: { id: string; status: string; summaryJson: string | null }) {
  const now = new Date();
  let restored = 0;
  await db.transaction(async tx => {
    ({ restored } = await rollbackScheduleUpdate(tx as unknown as Parameters<typeof rollbackScheduleUpdate>[0], { tenantId: input.tenantId, projectId: input.projectId, importId: record.id, userId: input.userId }));
    const previous = (() => { try { return JSON.parse(record.summaryJson ?? "{}") as Record<string, unknown>; } catch { return {}; } })();
    const marked = await tx.update(dataImports).set({ status: "cancelled", summaryJson: JSON.stringify({ ...previous, rolledBack: { at: now.toISOString(), byUserId: input.userId, restored: { activities: restored } } }) })
      .where(and(eq(dataImports.id, record.id), eq(dataImports.tenantId, input.tenantId), eq(dataImports.projectId, input.projectId), eq(dataImports.status, "completed"))).returning({ id: dataImports.id });
    if (marked.length !== 1) throw fail("PROJECT_OS_IMPORT_ROLLBACK_NOT_COMPLETED", "CONFLICT");
    await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "data_import_rolled_back", entityType: "data_import", entityId: record.id, metadata: JSON.stringify({ projectId: input.projectId, moduleCode: "p6update", restored: { activities: restored } }) });
  });
  return { id: record.id, rolledBack: true as const, deleted: {} as Record<string, number>, restored: { activities: restored } };
}

/**
 * Q-23 (the rest; adviser's question I25, option 1 — the smaller, safer one): an XER import is undone only when it CREATED everything it wrote (no row of
 * any of its nine tables was updated) and it is the project's latest schedule import still standing. Exactly the rows it created are deleted — the list
 * it kept of them (p6.created, recorded since this change; an older import has none and is refused) — children before parents, in one transaction, with
 * the audit row and a «p6_rollback» snapshot. A row something now depends on (a daily report, a progress line, a certificate) stops the whole undo.
 */
const P6_DELETE_ORDER = ["codeAssignments", "relationships", "assignments", "codeValues", "codeTypes", "activities", "resources", "calendars", "wbs"] as const;
async function rollbackP6Import(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, input: Scope, record: { id: string; status: string; summaryJson: string | null }) {
  const summary = (() => { try { return JSON.parse(record.summaryJson ?? "{}") as { p6?: { counts?: Record<string, { update?: number }>; created?: Partial<Record<(typeof P6_DELETE_ORDER)[number], string[]>> } }; } catch { return {}; } })();
  const created = summary.p6?.created;
  if (!created) throw fail("PROJECT_OS_IMPORT_ROLLBACK_INCOMPLETE_RECORD", "CONFLICT"); // imported before the list of created rows was kept
  if (Object.values(summary.p6?.counts ?? {}).some(count => Number(count.update ?? 0) > 0)) throw fail("PROJECT_OS_IMPORT_ROLLBACK_HAS_UPDATES", "CONFLICT");
  const now = new Date();
  const deleted: Record<string, number> = {};
  try {
    await db.transaction(async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`schedule-snapshot:${input.projectId}`}))`);
      // compared in the database: created_at holds microseconds, a JavaScript date only milliseconds (the import itself would read as «later»)
      const later = await tx.select({ id: dataImports.id }).from(dataImports).where(and(eq(dataImports.tenantId, input.tenantId), eq(dataImports.projectId, input.projectId), eq(dataImports.status, "completed"),
        inArray(dataImports.moduleCode, ["p6", "p6update", "schedule"]), ne(dataImports.id, record.id),
        gt(dataImports.createdAt, sql`(SELECT created_at FROM data_imports WHERE id = ${record.id} AND tenant_id = ${input.tenantId})`))).limit(1);
      if (later.length) throw fail("PROJECT_OS_SCHEDULE_ROLLBACK_NOT_LATEST", "CONFLICT");
      const scope = { tenantId: input.tenantId, projectId: input.projectId };
      const tables = { codeAssignments: activityCodeAssignments, relationships: activityRelationships, assignments: activityResourceAssignments, codeValues: activityCodeValues, codeTypes: activityCodeTypes,
        activities, resources: projectResources, calendars: scheduleCalendars, wbs: wbsItems } as const;
      for (const name of P6_DELETE_ORDER) {
        const ids = created[name] ?? [];
        const table = tables[name] as typeof activities; // every one of the nine has id, tenant_id and project_id
        let count = 0;
        for (let from = 0; from < ids.length; from += 500) {
          count += (await tx.delete(table).where(and(inArray(table.id, ids.slice(from, from + 500)), eq(table.tenantId, scope.tenantId), eq(table.projectId, scope.projectId))).returning({ id: table.id })).length;
        }
        if (count !== ids.length) throw fail("PROJECT_OS_IMPORT_ROLLBACK_INCOMPLETE_RECORD", "CONFLICT"); // a created row is already gone: the list no longer describes the data
        deleted[name] = count;
      }
      const previous = (() => { try { return JSON.parse(record.summaryJson ?? "{}") as Record<string, unknown>; } catch { return {}; } })();
      const marked = await tx.update(dataImports).set({ status: "cancelled", summaryJson: JSON.stringify({ ...previous, rolledBack: { at: now.toISOString(), byUserId: input.userId, deleted } }) })
        .where(and(eq(dataImports.id, record.id), eq(dataImports.tenantId, input.tenantId), eq(dataImports.projectId, input.projectId), eq(dataImports.status, "completed"))).returning({ id: dataImports.id });
      if (marked.length !== 1) throw fail("PROJECT_OS_IMPORT_ROLLBACK_NOT_COMPLETED", "CONFLICT");
      await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "data_import_rolled_back", entityType: "data_import", entityId: record.id, metadata: JSON.stringify({ projectId: input.projectId, moduleCode: "p6", deleted }) });
      await captureScheduleSnapshot(tx as unknown as Parameters<typeof captureScheduleSnapshot>[0], { tenantId: input.tenantId, projectId: input.projectId, importId: record.id, source: "p6_rollback", dataDate: null, userId: input.userId });
      // the undone import's snapshot stops being the baseline (review of #497), so the next import becomes it. AFTER the p6_rollback snapshot: taken without a
      // baseline, that empty snapshot would itself become the baseline. The undone snapshot stays as a record.
      await tx.update(scheduleSnapshots).set({ isBaseline: false })
        .where(and(eq(scheduleSnapshots.tenantId, input.tenantId), eq(scheduleSnapshots.projectId, input.projectId), eq(scheduleSnapshots.importId, record.id), eq(scheduleSnapshots.isBaseline, true)));
    });
  } catch (error) {
    if (isForeignKeyViolation(error)) throw fail("PROJECT_OS_IMPORT_ROLLBACK_IN_USE", "CONFLICT"); // the whole transaction is undone: something now depends on a row this import created
    throw error;
  }
  return { id: record.id, rolledBack: true as const, deleted };
}
