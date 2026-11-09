// Work order 23, P-18 (D-42 b): who prepares, reviews and approves a project's reports, and the people on the project to choose from.
//   - listProjectTeam: the company's members whose assignments cover this project (company-wide, or on this project), with those roles. People are put on the project
//     through the procedures that already exist — tenant.createInvitation and tenant.assignMembershipRole with scope «project» — never a new invitation path here.
//   - getReportApprovers / setReportApprover: one membership per step (prepare / review / approve). A person with no role on the project is refused; a person of
//     another company is impossible (composite foreign key (membership_id, tenant_id) in 0021) and refused before that as «member not found».
// Reading the chain: project.read or project.manage. The team (names and e-mail addresses) and assigning a step: project.manage. Audit row in the same transaction.
import { randomUUID } from "node:crypto";
import { and, eq, inArray, or } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { auditLogs, membershipRoles, memberships, projectReportApprovers, roles, users } from "../drizzle/schema";
import { projectGate, violates } from "./projectProfile";

type Scope = { userId: number; tenantId: string; projectId: string };
export const APPROVAL_STEPS = ["prepare", "review", "approve"] as const;
export type ApprovalStep = (typeof APPROVAL_STEPS)[number];
type Db = Awaited<ReturnType<typeof projectGate>>;
/** A member counts as «on the project» while invited or active and holding at least one assignment that covers it. */
const ON_PROJECT_STATUSES = ["invited", "active"] as const;
const coversProject = (projectId: string) => or(eq(membershipRoles.scopeType, "company"), and(eq(membershipRoles.scopeType, "project"), eq(membershipRoles.scopeId, projectId)));

async function team(db: Db, input: Scope, membershipIds?: string[]) {
  const rows = await db.select({ membershipId: memberships.id, userId: memberships.userId, status: memberships.status, name: users.name, email: users.email, roleId: roles.id, roleCode: roles.code, roleName: roles.name, scopeType: membershipRoles.scopeType })
    .from(memberships).innerJoin(users, eq(users.id, memberships.userId)).innerJoin(membershipRoles, eq(membershipRoles.membershipId, memberships.id)).innerJoin(roles, eq(roles.id, membershipRoles.roleId))
    .where(and(eq(memberships.tenantId, input.tenantId), inArray(memberships.status, [...ON_PROJECT_STATUSES]), coversProject(input.projectId), membershipIds ? inArray(memberships.id, membershipIds.length ? membershipIds : ["-"]) : undefined));
  const byMember = new Map<string, { membershipId: string; userId: number; status: string; name: string | null; email: string | null; roles: Array<{ roleId: string; code: string; name: string; scope: "company" | "project" }> }>();
  for (const row of rows) {
    const member = byMember.get(row.membershipId) ?? { membershipId: row.membershipId, userId: row.userId, status: row.status, name: row.name, email: row.email, roles: [] };
    member.roles.push({ roleId: row.roleId, code: row.roleCode, name: row.roleName, scope: row.scopeType === "company" ? "company" : "project" });
    byMember.set(row.membershipId, member);
  }
  return Array.from(byMember.values()).sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}

export async function listProjectTeam(input: Scope) {
  const db = await projectGate(input, ["project.manage"]);
  return team(db, input);
}

export async function getReportApprovers(input: Scope) {
  const db = await projectGate(input, ["project.read", "project.manage"]);
  const rows = await db.select({ step: projectReportApprovers.step, membershipId: projectReportApprovers.membershipId, userId: memberships.userId, name: users.name })
    .from(projectReportApprovers).innerJoin(memberships, and(eq(memberships.id, projectReportApprovers.membershipId), eq(memberships.tenantId, projectReportApprovers.tenantId))).innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(projectReportApprovers.tenantId, input.tenantId), eq(projectReportApprovers.projectId, input.projectId)));
  return Object.fromEntries(APPROVAL_STEPS.map(step => { const row = rows.find(item => item.step === step); return [step, row ? { membershipId: row.membershipId, userId: row.userId, name: row.name } : null]; })) as Record<ApprovalStep, { membershipId: string; userId: number; name: string | null } | null>;
}

/** Puts one person on a step (membershipId) or clears it (null). */
export async function setReportApprover(input: Scope & { step: ApprovalStep; membershipId: string | null }) {
  const db = await projectGate(input, ["project.manage"]);
  if (input.membershipId) {
    const [member] = await db.select({ id: memberships.id, status: memberships.status }).from(memberships).where(and(eq(memberships.id, input.membershipId), eq(memberships.tenantId, input.tenantId))).limit(1);
    if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_MEMBER_NOT_FOUND" });
    if (!(await team(db, input, [input.membershipId])).length) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_PROJECT_APPROVER_NOT_ON_PROJECT" });
  }
  const where = and(eq(projectReportApprovers.tenantId, input.tenantId), eq(projectReportApprovers.projectId, input.projectId), eq(projectReportApprovers.step, input.step));
  try {
    await db.transaction(async tx => {
      const [current] = await tx.select({ id: projectReportApprovers.id, membershipId: projectReportApprovers.membershipId }).from(projectReportApprovers).where(where).limit(1);
      if (!input.membershipId) { if (current) await tx.delete(projectReportApprovers).where(and(where, eq(projectReportApprovers.id, current.id))); }
      else if (current) await tx.update(projectReportApprovers).set({ membershipId: input.membershipId, assignedByUserId: input.userId, updatedAt: new Date() }).where(and(where, eq(projectReportApprovers.id, current.id)));
      else await tx.insert(projectReportApprovers).values({ id: randomUUID(), tenantId: input.tenantId, projectId: input.projectId, step: input.step, membershipId: input.membershipId, assignedByUserId: input.userId });
      await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: input.membershipId ? "project.report_approver_set" : "project.report_approver_cleared", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ step: input.step, membershipId: input.membershipId, previousMembershipId: current?.membershipId ?? null }) });
    });
  } catch (error) {
    if (violates(error, "project_report_approvers_project_step_unique")) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_PROJECT_PROFILE_CONFLICT" });
    throw error;
  }
  return getReportApprovers(input);
}
