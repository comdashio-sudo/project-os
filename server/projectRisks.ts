// Q-27 (P-115): the project risk register on the server. A risk was only ever created (pmo.createRisk); now it carries an owner, a response plan, a status and
// a review date, it is updated and closed, it can turn into an issue when it happens, and every change is a row of history.
//  - Reading takes pmo.read on the project, writing pmo.write on the project (the permission createRisk already takes), both under the PMO licence.
//  - Every write locks the risk's row first, refuses a closed risk (PROJECT_OS_RISK_CLOSED), and writes its audit row in the same transaction. The audit
//    row of an update holds each changed field as { from, to }: that is the risk's history (audit_logs is append-only in the database), read back by
//    pmo.riskHistory. A save that changes nothing writes nothing.
//  - The owner is an active member of the same company (PROJECT_OS_RISK_OWNER_INVALID); a review date is a calendar day.
//  - Closing needs a reason. Turning a risk into an issue creates the issue (its code unique in the project), links it on the risk and closes the risk,
//    all in one transaction; a risk becomes an issue once.
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { auditLogs, issues, memberships, risks, users } from "../drizzle/schema";
import { assertActiveMember, assertProjectWithinTenant, getDb, getTenantAccessSnapshot, isDuplicateEntryError } from "./db";
import { assertTenantAccess } from "./domain/authorization";
import { siteToday } from "./wo22Shared";
import { isReviewOverdue, riskLevel, riskMatrix, riskScore, reviewQueue, type RiskStatus } from "@shared/riskMatrix";

type Scope = { userId: number; tenantId: string; projectId: string };
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
const fail = (code: "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT" | "FORBIDDEN", message: string) => new TRPCError({ code, message });

async function riskScope(input: Scope, permission: "pmo.read" | "pmo.write"): Promise<Db> {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw fail("FORBIDDEN", "PROJECT_OS_TENANT_ACCESS_DENIED");
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PMO", permission, scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  return db;
}

const riskColumns = {
  id: risks.id, code: risks.code, title: risks.title, cause: risks.cause, impact: risks.impact, probability: risks.probability, severity: risks.severity,
  residualProbability: risks.residualProbability, residualSeverity: risks.residualSeverity, response: risks.response, mitigation: risks.mitigation, trigger: risks.trigger,
  ownerMembershipId: risks.ownerMembershipId, dueAt: risks.dueAt, nextReviewAt: risks.nextReviewAt, status: risks.status, closedAt: risks.closedAt,
  closureReason: risks.closureReason, issueId: risks.issueId, createdAt: risks.createdAt, updatedAt: risks.updatedAt,
};

/** The project's risks with their owner's name, score and band, the 5×5 matrix of the live ones and the review list, as of the site day. */
export async function listProjectRisks(input: Scope) {
  const db = await riskScope(input, "pmo.read");
  const rows = await db.select({ ...riskColumns, ownerName: users.name }).from(risks)
    .leftJoin(memberships, and(eq(memberships.id, risks.ownerMembershipId), eq(memberships.tenantId, risks.tenantId)))
    .leftJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(risks.tenantId, input.tenantId), eq(risks.projectId, input.projectId)))
    .orderBy(asc(risks.code));
  const today = siteToday();
  const items = rows.map(row => ({ ...row, score: riskScore(row), level: riskLevel(riskScore(row)), reviewOverdue: isReviewOverdue(row, today) }));
  const matrix = riskMatrix(items);
  const queue = reviewQueue(items, today);
  return { asOf: today, risks: items, matrix: { cells: matrix.cells.map(row => row.map(cell => cell.length)), live: matrix.live, byLevel: matrix.byLevel }, overdueIds: queue.overdue.map(risk => risk.id), unscheduledIds: queue.unscheduled.map(risk => risk.id) };
}

async function lockRisk(tx: Parameters<Parameters<Db["transaction"]>[0]>[0], input: Scope & { riskId: string }) {
  const [row] = await tx.select(riskColumns).from(risks).where(and(eq(risks.id, input.riskId), eq(risks.tenantId, input.tenantId), eq(risks.projectId, input.projectId))).for("update").limit(1);
  if (!row) throw fail("NOT_FOUND", "PROJECT_OS_RISK_NOT_FOUND");
  if (row.status === "closed") throw fail("CONFLICT", "PROJECT_OS_RISK_CLOSED");
  return row;
}

export type RiskPatch = Partial<{
  title: string; cause: string | null; impact: string | null; probability: number; severity: number; residualProbability: number | null; residualSeverity: number | null;
  response: string | null; mitigation: string | null; trigger: string | null; ownerMembershipId: string | null; nextReviewAt: string | null; status: Exclude<RiskStatus, "closed">;
}>;
const PATCH_KEYS = ["title", "cause", "impact", "probability", "severity", "residualProbability", "residualSeverity", "response", "mitigation", "trigger", "ownerMembershipId", "nextReviewAt", "status"] as const;

/** Updates the fields given; each changed one goes into the audit row as { from, to }. Nothing changed → nothing written, `changed: []`. */
export async function updateProjectRisk(input: Scope & { riskId: string; patch: RiskPatch }) {
  const db = await riskScope(input, "pmo.write");
  if (input.patch.ownerMembershipId) await assertActiveMember(db, input.tenantId, input.patch.ownerMembershipId, "PROJECT_OS_RISK_OWNER_INVALID");
  return db.transaction(async tx => {
    const current = await lockRisk(tx, input);
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of PATCH_KEYS) {
      const next = input.patch[key];
      if (next === undefined || next === current[key]) continue;
      changes[key] = { from: current[key], to: next };
    }
    const changed = Object.keys(changes);
    if (!changed.length) return { id: current.id, changed };
    await tx.update(risks).set({ ...Object.fromEntries(changed.map(key => [key, changes[key]!.to])), updatedAt: new Date() }).where(and(eq(risks.id, current.id), eq(risks.tenantId, input.tenantId)));
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmo.risk_updated", entityType: "risk", entityId: current.id, metadata: JSON.stringify({ projectId: input.projectId, code: current.code, changes }) });
    return { id: current.id, changed };
  });
}

/** Closes a live risk with a reason; a closed risk cannot be changed again. */
export async function closeProjectRisk(input: Scope & { riskId: string; reason: string }) {
  const db = await riskScope(input, "pmo.write");
  return db.transaction(async tx => {
    const current = await lockRisk(tx, input);
    const closedAt = new Date();
    await tx.update(risks).set({ status: "closed", closedAt, closureReason: input.reason, updatedAt: closedAt }).where(and(eq(risks.id, current.id), eq(risks.tenantId, input.tenantId)));
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmo.risk_closed", entityType: "risk", entityId: current.id, metadata: JSON.stringify({ projectId: input.projectId, code: current.code, changes: { status: { from: current.status, to: "closed" } }, reason: input.reason }) });
    return { id: current.id, status: "closed" as const, closedAt };
  });
}

/** The risk happened: an issue is opened from it (code unique in the project), linked on the risk, and the risk is closed — one transaction, once. */
export async function convertRiskToIssue(input: Scope & { riskId: string; issueCode: string; priority: "low" | "medium" | "high" | "critical"; dueAt?: Date }) {
  const db = await riskScope(input, "pmo.write");
  try {
    return await db.transaction(async tx => {
      const current = await lockRisk(tx, input);
      if (current.issueId) throw fail("CONFLICT", "PROJECT_OS_RISK_ALREADY_CONVERTED");
      const issueId = crypto.randomUUID();
      const now = new Date();
      await tx.insert(issues).values({ id: issueId, tenantId: input.tenantId, projectId: input.projectId, code: input.issueCode, title: current.title, priority: input.priority, dueAt: input.dueAt, status: "open" });
      await tx.update(risks).set({ issueId, status: "closed", closedAt: now, closureReason: `issue:${input.issueCode}`, updatedAt: now }).where(and(eq(risks.id, current.id), eq(risks.tenantId, input.tenantId)));
      await tx.insert(auditLogs).values([
        { id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmo.issue_created", entityType: "issue", entityId: issueId, metadata: JSON.stringify({ projectId: input.projectId, code: input.issueCode, fromRiskId: current.id }) },
        { id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmo.risk_converted", entityType: "risk", entityId: current.id, metadata: JSON.stringify({ projectId: input.projectId, code: current.code, issueId, issueCode: input.issueCode, changes: { status: { from: current.status, to: "closed" } } }) },
      ]);
      return { riskId: current.id, issueId };
    });
  } catch (error) {
    if (isDuplicateEntryError(error)) throw fail("CONFLICT", "PROJECT_OS_ISSUE_CODE_EXISTS");
    throw error;
  }
}

/** The risk's history, newest first: who did what and, for an update, each field's before and after. Read from the append-only audit log. */
export async function projectRiskHistory(input: Scope & { riskId: string }) {
  const db = await riskScope(input, "pmo.read");
  const [risk] = await db.select({ id: risks.id }).from(risks).where(and(eq(risks.id, input.riskId), eq(risks.tenantId, input.tenantId), eq(risks.projectId, input.projectId))).limit(1);
  if (!risk) throw fail("NOT_FOUND", "PROJECT_OS_RISK_NOT_FOUND");
  const rows = await db.select({ id: auditLogs.id, action: auditLogs.action, actorUserId: auditLogs.actorUserId, actorName: users.name, metadata: auditLogs.metadata, createdAt: auditLogs.createdAt })
    .from(auditLogs).leftJoin(users, eq(users.id, auditLogs.actorUserId))
    .where(and(eq(auditLogs.tenantId, input.tenantId), eq(auditLogs.entityType, "risk"), eq(auditLogs.entityId, risk.id), inArray(auditLogs.action, ["pmo.risk_created", "pmo.risk_updated", "pmo.risk_closed", "pmo.risk_converted"])))
    .orderBy(desc(auditLogs.createdAt));
  return rows.map(row => {
    const meta = parseMeta(row.metadata);
    return { id: row.id, action: row.action, actorName: row.actorName, createdAt: row.createdAt, changes: (meta.changes ?? {}) as Record<string, { from: unknown; to: unknown }>, reason: typeof meta.reason === "string" ? meta.reason : null, issueCode: typeof meta.issueCode === "string" ? meta.issueCode : null };
  });
}

const parseMeta = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === "object") return value as Record<string, unknown>;
  try { const parsed = JSON.parse(String(value ?? "{}")); return parsed && typeof parsed === "object" ? parsed : {}; } catch { return {}; }
};
