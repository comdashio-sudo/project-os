// Q-45 (c, adviser 18-11): «مهامي» — what waits on ME in this company, in one place: the actions I own that are still open, and the decisions whose next
// step is mine (to decide as their owner; to submit or implement as the one who recorded them). Q-25's meeting tasks join this same page as another
// source later; this is not a second task system. And «إنجاز المهمة»: the action's owner marks it done, with an audit row in its transaction.
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, or } from "drizzle-orm";
import { actions, auditLogs, decisions, memberships, projects } from "../drizzle/schema";
import { assertDecisionParticipant, getDb, getTenantAccessSnapshot } from "./db";

/** The caller's membership of this company, AFTER the gate (active membership of a licensed company) has passed. */
async function myMembership(input: { userId: number; tenantId: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const [membership] = await db.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.tenantId, input.tenantId), eq(memberships.userId, input.userId))).limit(1);
  if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  return { db, membershipId: membership.id };
}

export async function getMyWorkForTenant(input: { userId: number; tenantId: string }) {
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertDecisionParticipant(snapshot);
  const { db, membershipId } = await myMembership(input);
  const recorded = (await db.select({ entityId: auditLogs.entityId }).from(auditLogs)
    .where(and(eq(auditLogs.tenantId, input.tenantId), eq(auditLogs.action, "executive.decision_created"), eq(auditLogs.actorUserId, input.userId)))).map(row => row.entityId).filter((id): id is string => Boolean(id));
  const [actionRows, decisionRows] = await Promise.all([
    db.select({ id: actions.id, projectId: actions.projectId, title: actions.title, priority: actions.priority, dueAt: actions.dueAt, status: actions.status, escalationStatus: actions.escalationStatus, projectCode: projects.code, projectName: projects.name })
      .from(actions).leftJoin(projects, and(eq(projects.id, actions.projectId), eq(projects.tenantId, actions.tenantId)))
      .where(and(eq(actions.tenantId, input.tenantId), eq(actions.ownerMembershipId, membershipId), inArray(actions.status, ["open", "in_progress"])))
      .orderBy(asc(actions.dueAt)),
    db.select({ id: decisions.id, projectId: decisions.projectId, problem: decisions.problem, status: decisions.status, ownerId: decisions.decisionOwnerMembershipId, projectCode: projects.code, projectName: projects.name })
      .from(decisions).leftJoin(projects, and(eq(projects.id, decisions.projectId), eq(projects.tenantId, decisions.tenantId)))
      .where(and(eq(decisions.tenantId, input.tenantId), or(
        and(eq(decisions.decisionOwnerMembershipId, membershipId), inArray(decisions.status, ["submitted", "approved"])),
        recorded.length ? and(inArray(decisions.id, recorded), inArray(decisions.status, ["draft", "approved"])) : undefined,
      ))),
  ]);
  const now = Date.now();
  return {
    actions: actionRows.map(row => ({ ...row, overdue: row.dueAt !== null && row.dueAt.getTime() < now })),
    // the steps this person may take now, by the cycle's rules (server/db.ts transitionDecision checks them again)
    decisions: decisionRows.map(row => {
      const isOwner = row.ownerId === membershipId; const isRecorder = recorded.includes(row.id);
      const steps = row.status === "submitted" && isOwner ? ["approved", "rejected"] : row.status === "draft" && isRecorder ? ["submitted"] : row.status === "approved" && (isRecorder || isOwner) ? ["implemented"] : [];
      return { id: row.id, projectId: row.projectId, projectCode: row.projectCode, projectName: row.projectName, problem: row.problem, status: row.status, hasOwner: Boolean(row.ownerId), steps };
    }).filter(row => row.steps.length > 0),
  };
}

/** «إنجاز المهمة»: the action's owner — and only the owner — marks an open action done. */
export async function completeMyActionForTenant(input: { userId: number; tenantId: string; actionId: string }) {
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertDecisionParticipant(snapshot);
  const { db, membershipId } = await myMembership(input);
  return db.transaction(async tx => {
    const [action] = await tx.select({ id: actions.id, projectId: actions.projectId, status: actions.status, ownerId: actions.ownerMembershipId }).from(actions)
      .where(and(eq(actions.id, input.actionId), eq(actions.tenantId, input.tenantId))).limit(1).for("update");
    if (!action) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_ACTION_NOT_FOUND" });
    if (action.ownerId !== membershipId) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_ACTION_OWNER_ONLY" });
    if (!["open", "in_progress"].includes(action.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_ACTION_NOT_OPEN" });
    const updated = await tx.update(actions).set({ status: "completed", updatedAt: new Date() }).where(and(eq(actions.id, action.id), eq(actions.status, action.status))).returning({ id: actions.id });
    if (updated.length !== 1) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_ACTION_NOT_OPEN" });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmo.action_completed", entityType: "action", entityId: action.id, metadata: JSON.stringify({ projectId: action.projectId, previousStatus: action.status }) });
    return { id: action.id, previousStatus: action.status, status: "completed" as const };
  });
}
