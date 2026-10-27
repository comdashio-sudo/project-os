// The import log is a list of ATTEMPTS. Two things the person can do with one:
//   discard   an attempt that wrote nothing (refused by the analysis, or never confirmed): delete the attempt and its stored file, so the file can be uploaded again and the log is clean;
//   rollback  an import that was confirmed: delete exactly the rows THAT import created, in one transaction, with the audit row. Never rows it only updated (their previous values were not kept),
//             never rows something else now depends on (the foreign key refuses, the whole rollback is undone and says so).
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { activities, auditLogs, budgetLines, contracts, dataImportErrors, dataImportRowResults, dataImportSources, dataImports, materialMasters, wbsItems } from "../drizzle/schema";
import { isForeignKeyViolation } from "./_core/database";
import { assertProjectWithinTenant, assertTenantFeatureAccess, getDb, getTenantAccessSnapshot, importPermissionFor } from "./db";
import { assertTenantAccess } from "./domain/authorization";
import { attemptState, canDiscardAttempt, canRollbackAttempt } from "../shared/importAttempts";
import { storageDelete } from "./storage";

/** Modules whose created rows can be taken back. Opening stock is a ledger of stock movements: it is never erased by an undo. */
export const ROLLBACK_MODULES = ["wbs", "budget", "contracts", "materials", "schedule"] as const;
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
  if (!canDiscardAttempt(state) && state !== "undone") throw fail("PROJECT_OS_IMPORT_DISCARD_NOT_ALLOWED");
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
  await storageDelete(record.fileKey).catch(() => undefined); // the file goes after the row: an orphan object is swept, a row without its file would be a broken record
  return { id: record.id, discarded: true as const };
}

export async function rollbackImport(input: Scope) {
  const { db, record, state } = await load(input, ROLLBACK_PERMISSION);
  await assertTenantFeatureAccess({ userId: input.userId, tenantId: input.tenantId, product: "PROJECT", permission: ROLLBACK_PERMISSION, featureCode: "DATA_IMPORT", scope: { type: "project", id: input.projectId } });
  if (!canRollbackAttempt(state)) throw fail("PROJECT_OS_IMPORT_ROLLBACK_NOT_COMPLETED");
  if (!(ROLLBACK_MODULES as readonly string[]).includes(record.moduleCode)) throw fail("PROJECT_OS_IMPORT_ROLLBACK_MODULE_UNSUPPORTED");
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
