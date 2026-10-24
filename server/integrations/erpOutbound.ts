// What the platform gives the company's ERP and other systems (work order 12, item 9): budgets, commitments, progress and valuations (the subcontract payment certificates),
// pulled with a company key that holds `export.read`. Each is paged with an `after` token and can ask only for what changed since a moment; a call is logged as an outgoing run.
import { and, asc, eq, gt, sql } from "drizzle-orm";
import { budgetLines, commitments, progressEntries, projects, subcontractCertificates, wbsItems } from "../../drizzle/schema";
import { getDb } from "../db";
import { finishSyncRun, startSyncRun } from "./sync";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export const EXPORT_ENTITIES = ["budgets", "commitments", "progress", "valuations"] as const;
export type ExportEntity = (typeof EXPORT_ENTITIES)[number];
export type ExportQuery = { project?: string; updatedSince?: Date; after?: string; limit?: number };
// The page token carries the row's timestamp to the microsecond (PostgreSQL keeps microseconds; a JavaScript Date keeps milliseconds and would repeat a row).
const encode = (at: string, id: string) => Buffer.from(`${at}|${id}`).toString("base64url");
const decode = (token: string | undefined): { at: string; id: string } | null => {
  if (!token) return null;
  const [at, id] = Buffer.from(token, "base64url").toString().split("|");
  return id && /^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/.test(at) ? { at, id } : null;
};
const microseconds = (column: unknown) => sql<string>`to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

export async function exportEntity(input: { tenantId: string; apiKeyId?: string; system?: string; entity: ExportEntity; query: ExportQuery }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const limit = Math.min(Math.max(input.query.limit ?? 500, 1), 1000);
  const cursor = decode(input.query.after);
  const runId = await startSyncRun(db, { tenantId: input.tenantId, system: input.system ?? "generic", direction: "out", trigger: "api", entityType: input.entity, apiKeyId: input.apiKeyId });
  try {
    const [project] = input.query.project ? await db.select({ id: projects.id }).from(projects).where(and(eq(projects.tenantId, input.tenantId), eq(projects.code, input.query.project))).limit(1) : [undefined];
    if (input.query.project && !project) { await finishSyncRun(db, runId, [{ entityType: input.entity, externalId: null, outcome: "rejected", reason: "PROJECT_UNKNOWN" }]); return { unknownProject: true as const, items: [], next: null }; }
    const page = await queryPage(db, input.tenantId, input.entity, { projectId: project?.id, since: input.query.updatedSince, cursor, limit: limit + 1 });
    const more = page.length > limit;
    const rows = page.slice(0, limit);
    await finishSyncRun(db, runId, rows.map(row => ({ entityType: input.entity, externalId: String(row.id), outcome: "unchanged" as const, reason: "EXPORTED" })));
    const last = rows[rows.length - 1];
    return { unknownProject: false as const, items: rows.map(({ cursor: _cursor, ...row }) => row), next: more && last ? encode(last.cursor, String(last.id)) : null };
  } catch (error) {
    await finishSyncRun(db, runId, [], error instanceof Error ? error.message : "export failed");
    throw error;
  }
}

type Page = Array<{ id: string; cursor: string } & Record<string, unknown>>;
async function queryPage(db: Db, tenantId: string, entity: ExportEntity, q: { projectId?: string; since?: Date; cursor: { at: string; id: string } | null; limit: number }): Promise<Page> {
  const after = (stamp: unknown, id: unknown) => (q.cursor ? sql`(${stamp}, ${id}) > (${q.cursor.at}::timestamptz, ${q.cursor.id})` : undefined);
  if (entity === "budgets") {
    const rows = await db.select({ id: budgetLines.id, project: projects.code, wbsCode: wbsItems.code, wbsName: wbsItems.name, costCode: budgetLines.costCode, originalAmount: budgetLines.originalAmount, currentAmount: budgetLines.currentAmount, cursor: microseconds(budgetLines.updatedAt), stamp: budgetLines.updatedAt })
      .from(budgetLines).innerJoin(projects, eq(projects.id, budgetLines.projectId)).leftJoin(wbsItems, eq(wbsItems.id, budgetLines.wbsItemId))
      .where(and(eq(budgetLines.tenantId, tenantId), q.projectId ? eq(budgetLines.projectId, q.projectId) : undefined, q.since ? gt(budgetLines.updatedAt, q.since) : undefined, after(budgetLines.updatedAt, budgetLines.id))).orderBy(asc(budgetLines.updatedAt), asc(budgetLines.id)).limit(q.limit);
    return rows.map(row => ({ ...row, originalAmount: Number(row.originalAmount), currentAmount: Number(row.currentAmount), currency: "SAR", updatedAt: row.stamp.toISOString() }));
  }
  if (entity === "commitments") {
    const rows = await db.select({ id: commitments.id, project: projects.code, code: commitments.code, description: commitments.description, amount: commitments.amount, status: commitments.status, committedAt: commitments.committedAt, cursor: microseconds(commitments.updatedAt), stamp: commitments.updatedAt })
      .from(commitments).innerJoin(projects, eq(projects.id, commitments.projectId))
      .where(and(eq(commitments.tenantId, tenantId), q.projectId ? eq(commitments.projectId, q.projectId) : undefined, q.since ? gt(commitments.updatedAt, q.since) : undefined, after(commitments.updatedAt, commitments.id))).orderBy(asc(commitments.updatedAt), asc(commitments.id)).limit(q.limit);
    return rows.map(row => ({ ...row, amount: Number(row.amount), currency: "SAR", committedAt: row.committedAt?.toISOString() ?? null, updatedAt: row.stamp.toISOString() }));
  }
  if (entity === "progress") {
    // the latest submitted progress of each WBS item: what the schedule and cost systems read as "how far along"
    const rows = await db.select({ id: progressEntries.id, project: projects.code, wbsCode: wbsItems.code, progressPercent: progressEntries.progressPercent, measuredAt: progressEntries.measuredAt, cursor: microseconds(progressEntries.createdAt), stamp: progressEntries.createdAt })
      .from(progressEntries).innerJoin(projects, eq(projects.id, progressEntries.projectId)).innerJoin(wbsItems, eq(wbsItems.id, progressEntries.wbsItemId))
      .where(and(eq(progressEntries.tenantId, tenantId), eq(progressEntries.status, "submitted"), q.projectId ? eq(progressEntries.projectId, q.projectId) : undefined, q.since ? gt(progressEntries.createdAt, q.since) : undefined, after(progressEntries.createdAt, progressEntries.id),
        sql`NOT EXISTS (SELECT 1 FROM progress_entries newer WHERE newer.wbs_item_id = ${progressEntries.wbsItemId} AND newer.status = 'submitted' AND (newer.measured_at > ${progressEntries.measuredAt} OR (newer.measured_at = ${progressEntries.measuredAt} AND newer.id > ${progressEntries.id})))`)).orderBy(asc(progressEntries.createdAt), asc(progressEntries.id)).limit(q.limit);
    return rows.map(row => ({ ...row, progressPercent: Number(row.progressPercent), measuredAt: row.measuredAt.toISOString() }));
  }
  const rows = await db.select({ id: subcontractCertificates.id, project: projects.code, certificateNumber: subcontractCertificates.certificateNumber, periodStart: subcontractCertificates.periodStart, periodEnd: subcontractCertificates.periodEnd, grossAmount: subcontractCertificates.grossAmount, retentionAmount: subcontractCertificates.retentionAmount, advanceRecoveryAmount: subcontractCertificates.advanceRecoveryAmount, netAmount: subcontractCertificates.netAmount, status: subcontractCertificates.status, approvedAt: subcontractCertificates.approvedAt, cursor: microseconds(subcontractCertificates.updatedAt), stamp: subcontractCertificates.updatedAt })
    .from(subcontractCertificates).innerJoin(projects, eq(projects.id, subcontractCertificates.projectId))
    .where(and(eq(subcontractCertificates.tenantId, tenantId), q.projectId ? eq(subcontractCertificates.projectId, q.projectId) : undefined, q.since ? gt(subcontractCertificates.updatedAt, q.since) : undefined, after(subcontractCertificates.updatedAt, subcontractCertificates.id))).orderBy(asc(subcontractCertificates.updatedAt), asc(subcontractCertificates.id)).limit(q.limit);
  return rows.map(row => ({ ...row, grossAmount: Number(row.grossAmount), retentionAmount: Number(row.retentionAmount), advanceRecoveryAmount: Number(row.advanceRecoveryAmount), netAmount: Number(row.netAmount), currency: "SAR", periodStart: row.periodStart?.toISOString() ?? null, periodEnd: row.periodEnd?.toISOString() ?? null, approvedAt: row.approvedAt?.toISOString() ?? null, updatedAt: row.stamp.toISOString() }));
}
