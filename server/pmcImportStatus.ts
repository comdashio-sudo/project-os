// Q-35 (P1-02): for each PMC import kind, what the project's saved imports say — not what was uploaded. A file that was uploaded or analysed but never
// confirmed is not «imported»; only an import the job finished (status completed) is. Read from data_imports, this company and project only (tenantId filter
// and RLS), for whoever may read PMC (the same check as the PMC screens). Nothing is written.
import { and, desc, eq, inArray } from "drizzle-orm";
import { dataImports } from "../drizzle/schema";
import { PMC_IMPORT_KINDS, type PmcImportKind } from "./domain/pmcImport";
import { assertProjectWithinTenant, assertTenantFeatureAccess, getDb } from "./db";

/** completed: imported (a finished import is the latest word) · pending: analysed, waiting for someone to confirm · analyzing: uploaded, analysing or writing
 *  now · failed: the latest attempt failed · none: never imported (or only cancelled). */
export type PmcImportState = "completed" | "pending" | "analyzing" | "failed" | "none";
export type ImportAttempt = { status: string; createdAt: Date; completedAt: Date | null; createdRows: number; updatedRows: number; failureReason: string | null };
export type PmcKindStatus = { kind: PmcImportKind; state: PmcImportState; lastAttemptAt: Date | null; lastImportedAt: Date | null; createdRows: number; updatedRows: number; failureReason: string | null };

const IN_PROGRESS = new Set(["uploaded", "analyzing", "confirmed", "importing"]);

/** The state of one kind from its attempts, newest first. Exported for the unit test. */
export function importStateOf(kind: PmcImportKind, attempts: ImportAttempt[]): PmcKindStatus {
  const live = attempts.filter(attempt => attempt.status !== "cancelled");
  const latest = live[0];
  const imported = live.find(attempt => attempt.status === "completed");
  const state: PmcImportState = !latest ? "none" : latest.status === "completed" ? "completed" : latest.status === "validated" ? "pending" : IN_PROGRESS.has(latest.status) ? "analyzing" : latest.status === "failed" ? "failed" : "none";
  return {
    kind, state,
    lastAttemptAt: latest?.createdAt ?? null,
    lastImportedAt: imported ? imported.completedAt ?? imported.createdAt : null,
    createdRows: imported?.createdRows ?? 0, updatedRows: imported?.updatedRows ?? 0,
    failureReason: state === "failed" ? latest!.failureReason : null,
  };
}

export async function getPmcImportStatus(input: { userId: number; tenantId: string; projectId: string }): Promise<PmcKindStatus[]> {
  // the same check as the PMC screens (pmcScreensService.authorizePmcRead), written out here so the static gate checks see it in this function
  await assertTenantFeatureAccess({ userId: input.userId, tenantId: input.tenantId, product: "PROJECT", permission: "project.pmc.read", featureCode: "PMC", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const rows = await db.select({ moduleCode: dataImports.moduleCode, status: dataImports.status, createdAt: dataImports.createdAt, completedAt: dataImports.completedAt, createdRows: dataImports.createdRows, updatedRows: dataImports.updatedRows, failureReason: dataImports.failureReason })
    .from(dataImports)
    .where(and(eq(dataImports.tenantId, input.tenantId), eq(dataImports.projectId, input.projectId), inArray(dataImports.moduleCode, PMC_IMPORT_KINDS.map(kind => `pmc.${kind}`))))
    .orderBy(desc(dataImports.createdAt));
  return PMC_IMPORT_KINDS.map(kind => importStateOf(kind, rows.filter(row => row.moduleCode === `pmc.${kind}`)));
}
