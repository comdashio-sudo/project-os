// Q-72 (4): the engineer in charge of a block or a phase. One per scope (project × block code / phase), set by whoever manages PMC (project.pmc.manage, the PMC licence feature),
// who must be an active member of the same company; clearing is a deletion with its audit row. Read with the activity summary (project.pmc.read), every query filtered by
// the company and the project. The audit row is written in the same transaction as the change.
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { auditLogs, memberships, pmcBlocks, pmcScopeEngineers, pmcUnits, users } from "../drizzle/schema";
import { authorize, mine, type Scope } from "./pmcService";

export type ScopeType = "block" | "phase";
const refuse = (code: "BAD_REQUEST" | "NOT_FOUND", message: string) => new TRPCError({ code, message });

export async function setPmcScopeEngineer(input: Scope & { scopeType: ScopeType; scopeKey: string; engineerUserId: number | null }) {
  const db = await authorize(input, "project.pmc.manage");
  const key = input.scopeKey.trim();
  if (!key) throw refuse("BAD_REQUEST", "PROJECT_OS_PMC_SCOPE_UNKNOWN");
  // the block or the phase must exist in THIS project (a phase is the value villas carry; matched without regard to case, stored as the villas write it)
  let stored = key;
  if (input.scopeType === "block") {
    const [block] = await db.select({ code: pmcBlocks.code }).from(pmcBlocks).where(and(mine(pmcBlocks, input), eq(pmcBlocks.code, key))).limit(1);
    if (!block) throw refuse("NOT_FOUND", "PROJECT_OS_PMC_SCOPE_UNKNOWN");
    stored = block.code;
  } else {
    const phases = await db.selectDistinct({ phase: pmcUnits.phase }).from(pmcUnits).where(mine(pmcUnits, input));
    const found = phases.map(row => row.phase).find((phase): phase is string => Boolean(phase) && phase!.toUpperCase() === key.toUpperCase());
    if (!found) throw refuse("NOT_FOUND", "PROJECT_OS_PMC_SCOPE_UNKNOWN");
    stored = found;
  }
  if (input.engineerUserId !== null) {
    const [member] = await db.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.tenantId, input.tenantId), eq(memberships.userId, input.engineerUserId), eq(memberships.status, "active"))).limit(1);
    if (!member) throw refuse("BAD_REQUEST", "PROJECT_OS_PMC_SCOPE_ENGINEER_NOT_A_MEMBER");
  }
  await db.transaction(async tx => {
    const where = and(mine(pmcScopeEngineers, input), eq(pmcScopeEngineers.scopeType, input.scopeType), eq(pmcScopeEngineers.scopeKey, stored));
    const [before] = await tx.select({ engineerUserId: pmcScopeEngineers.engineerUserId }).from(pmcScopeEngineers).where(where).limit(1);
    if (input.engineerUserId === null) {
      // clearing what is not there is not a success to audit (rows = 0 is never taken for success; review of #583, B)
      const removed = await tx.delete(pmcScopeEngineers).where(where).returning({ id: pmcScopeEngineers.id });
      if (!removed.length) throw refuse("NOT_FOUND", "PROJECT_OS_PMC_SCOPE_ENGINEER_NOT_SET");
    } else await tx.insert(pmcScopeEngineers).values({ id: crypto.randomUUID(), tenantId: input.tenantId, projectId: input.projectId, scopeType: input.scopeType, scopeKey: stored, engineerUserId: input.engineerUserId, updatedByUserId: input.userId })
      .onConflictDoUpdate({ target: [pmcScopeEngineers.projectId, pmcScopeEngineers.scopeType, pmcScopeEngineers.scopeKey], set: { engineerUserId: input.engineerUserId, updatedByUserId: input.userId, updatedAt: new Date() }, setWhere: eq(pmcScopeEngineers.tenantId, input.tenantId) });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.scope_engineer_set", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ scopeType: input.scopeType, scopeKey: stored, before: before?.engineerUserId ?? null, after: input.engineerUserId }) });
  });
  return { scopeType: input.scopeType, scopeKey: stored, engineerUserId: input.engineerUserId };
}

/** The engineers of the project's blocks and phases, by scope — name only, never contact details. Called after the caller's PMC read check. */
export async function readPmcScopeEngineers(db: NonNullable<Awaited<ReturnType<typeof authorize>>>, input: Pick<Scope, "tenantId" | "projectId">) {
  const rows = await db.select({ scopeType: pmcScopeEngineers.scopeType, scopeKey: pmcScopeEngineers.scopeKey, userId: pmcScopeEngineers.engineerUserId, name: users.name }).from(pmcScopeEngineers)
    .innerJoin(users, eq(users.id, pmcScopeEngineers.engineerUserId)).where(mine(pmcScopeEngineers, input));
  return { blocks: new Map(rows.filter(row => row.scopeType === "block").map(row => [row.scopeKey, { userId: row.userId, name: row.name ?? "" }])), phases: new Map(rows.filter(row => row.scopeType === "phase").map(row => [row.scopeKey.toUpperCase(), { userId: row.userId, name: row.name ?? "" }])) };
}

/** Who can be named: the company's active members, name only (to whoever manages PMC, who is the one choosing). */
export async function listScopeEngineerCandidates(input: Scope) {
  const db = await authorize(input, "project.pmc.manage");
  const rows = await db.select({ userId: memberships.userId, name: users.name }).from(memberships).innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.tenantId, input.tenantId), eq(memberships.status, "active")));
  return rows.map(row => ({ userId: row.userId, name: row.name ?? "" })).sort((a, b) => a.name.localeCompare(b.name));
}
