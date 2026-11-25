// Q-21 (a), batch 6 (unit 5): goals, initiatives and variances (docs/proposals/q21-strategy-mapping.md §3; §5 question 3 → a variance's decision is kept
// on the variance itself, the adviser not having decided within two hours — Q-30 (3)). Company-wide: strategy.read reads, strategy.manage writes, at
// company scope, as the rest of the centre.
//   assumption (what we expect) ≠ goal (what we want) ≠ actual (what happened, from the platform where it can: the win rate from decided opportunities)
//   ≠ initiative (what we do). A variance sets the approved assumption against the actual for a period and records both values, the difference, how many
//   items the actual rests on, whether it recurs, and the decision it calls for:
//     adjust_assumption  opens a change request on the assumption in the same transaction — someone else approves it, as every change (#397)
//     initiative         names an initiative to improve performance
//   No decision touches a goal: a target moves only when someone edits that goal, and the edit is audited with both values.
// A decided variance is final. Every write leaves an audit row in its transaction.
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { auditLogs, memberships, strategyAssumptions, strategyGoals, strategyInitiatives, strategyOpportunities, strategyVariances } from "../drizzle/schema";
import { assertTenantAccess } from "./domain/authorization";
import { difference, winRateInPeriod } from "./domain/strategyVariance";
import { getDb, getTenantAccessSnapshot } from "./db";
import { violates } from "./projectProfile";

type Caller = { userId: number; tenantId: string };
type Values = { conservative: number; base: number; optimistic: number };
type GoalRow = typeof strategyGoals.$inferSelect;
type InitiativeRow = typeof strategyInitiatives.$inferSelect;
type VarianceRow = typeof strategyVariances.$inferSelect;
export type GoalFields = { code: string; name: string; assumptionId?: string | null; unit: GoalRow["unit"]; targetValue: number; periodStart: string; periodEnd: string; status?: GoalRow["status"] };
export type InitiativeFields = { code: string; name: string; goalId?: string | null; ownerUserId?: number | null; dueAt?: string | null; status?: InitiativeRow["status"]; note?: string | null };

const fail = (code: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST", message: string) => new TRPCError({ code, message });
const text = (value: string | null | undefined) => value?.trim() || null;
const siteToday = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
const period = (start: string, end: string) => { if (end < start) throw fail("BAD_REQUEST", "PROJECT_OS_STRATEGY_PERIOD_INVALID"); };

async function authorized(input: Caller, permission: "strategy.read" | "strategy.manage") {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw fail("FORBIDDEN", "PROJECT_OS_TENANT_ACCESS_DENIED");
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "EXECUTIVE", permission, scope: { type: "company", id: input.tenantId } });
  return db;
}
type Db = Awaited<ReturnType<typeof authorized>>;
const audit = (db: Pick<Db, "insert">, input: Caller, entityType: string, action: string, id: string, metadata: Record<string, unknown>) =>
  db.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action, entityType, entityId: id, metadata: JSON.stringify(metadata) });
// two saves of the same code at the same moment both pass the read above; the unique (tenant, code) index lets one win and the other gets the same
// translated refusal, not a raw 23505 (review of #495)
const codeTaken = (index: string, message: string) => (error: unknown): never => { if (violates(error, index)) throw fail("CONFLICT", message); throw error; };
const inTenant = (db: Db, table: typeof strategyAssumptions | typeof strategyGoals | typeof strategyInitiatives, id: string, tenantId: string) =>
  db.select({ id: table.id }).from(table).where(and(eq(table.id, id), eq(table.tenantId, tenantId))).limit(1).then(rows => rows.length === 1);

// ---- goals

const goalShape = (row: GoalRow) => ({ id: row.id, code: row.code, name: row.name, assumptionId: row.assumptionId, unit: row.unit, targetValue: Number(row.targetValue), periodStart: row.periodStart, periodEnd: row.periodEnd, status: row.status });

export async function listStrategyGoals(input: Caller) {
  const db = await authorized(input, "strategy.read");
  return (await db.select().from(strategyGoals).where(eq(strategyGoals.tenantId, input.tenantId)).orderBy(asc(strategyGoals.code))).map(goalShape);
}

async function goalValues(db: Db, input: Caller & GoalFields) {
  if (!Number.isFinite(input.targetValue)) throw fail("BAD_REQUEST", "PROJECT_OS_STRATEGY_VALUE_INVALID");
  period(input.periodStart, input.periodEnd);
  if (input.assumptionId && !(await inTenant(db, strategyAssumptions, input.assumptionId, input.tenantId))) throw fail("NOT_FOUND", "PROJECT_OS_STRATEGY_ASSUMPTION_NOT_FOUND");
  return { code: input.code.trim(), name: input.name.trim(), assumptionId: input.assumptionId || null, unit: input.unit, targetValue: input.targetValue.toFixed(4), periodStart: input.periodStart, periodEnd: input.periodEnd, status: input.status ?? "active" };
}

export async function createStrategyGoal(input: Caller & GoalFields) {
  const db = await authorized(input, "strategy.manage");
  const fields = await goalValues(db, input);
  const [same] = await db.select({ id: strategyGoals.id }).from(strategyGoals).where(and(eq(strategyGoals.tenantId, input.tenantId), eq(strategyGoals.code, fields.code))).limit(1);
  if (same) throw fail("CONFLICT", "PROJECT_OS_STRATEGY_GOAL_CODE_EXISTS");
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(strategyGoals).values({ id, tenantId: input.tenantId, ...fields, createdByUserId: input.userId });
    await audit(tx, input, "strategy_goal", "strategy_goal.created", id, { code: fields.code, target: input.targetValue });
  }).catch(codeTaken("strategy_goals_tenant_code_unique", "PROJECT_OS_STRATEGY_GOAL_CODE_EXISTS"));
  return { id };
}

/** A goal changes only here, by someone who means to change it; the audit row carries the target before and after. */
export async function updateStrategyGoal(input: Caller & { goalId: string } & GoalFields) {
  const db = await authorized(input, "strategy.manage");
  const fields = await goalValues(db, input);
  const [row] = await db.select().from(strategyGoals).where(and(eq(strategyGoals.id, input.goalId), eq(strategyGoals.tenantId, input.tenantId))).limit(1);
  if (!row) throw fail("NOT_FOUND", "PROJECT_OS_STRATEGY_GOAL_NOT_FOUND");
  if (row.status === "retired") throw fail("CONFLICT", "PROJECT_OS_STRATEGY_GOAL_RETIRED");
  const [same] = await db.select({ id: strategyGoals.id }).from(strategyGoals).where(and(eq(strategyGoals.tenantId, input.tenantId), eq(strategyGoals.code, fields.code))).limit(1);
  if (same && same.id !== row.id) throw fail("CONFLICT", "PROJECT_OS_STRATEGY_GOAL_CODE_EXISTS");
  await db.transaction(async tx => {
    const changed = await tx.update(strategyGoals).set(fields).where(and(eq(strategyGoals.id, row.id), eq(strategyGoals.tenantId, input.tenantId), eq(strategyGoals.status, row.status))).returning({ id: strategyGoals.id });
    if (changed.length !== 1) throw fail("CONFLICT", "PROJECT_OS_STRATEGY_GOAL_RETIRED");
    await audit(tx, input, "strategy_goal", "strategy_goal.updated", row.id, { from: { target: Number(row.targetValue), status: row.status }, to: { target: input.targetValue, status: fields.status } });
  }).catch(codeTaken("strategy_goals_tenant_code_unique", "PROJECT_OS_STRATEGY_GOAL_CODE_EXISTS"));
  return { id: row.id };
}

// ---- initiatives

const initiativeShape = (row: InitiativeRow) => ({ id: row.id, code: row.code, name: row.name, goalId: row.goalId, ownerUserId: row.ownerUserId, dueAt: row.dueAt, status: row.status, note: row.note });

export async function listStrategyInitiatives(input: Caller) {
  const db = await authorized(input, "strategy.read");
  return (await db.select().from(strategyInitiatives).where(eq(strategyInitiatives.tenantId, input.tenantId)).orderBy(asc(strategyInitiatives.code))).map(initiativeShape);
}

async function initiativeValues(db: Db, input: Caller & InitiativeFields) {
  if (input.goalId && !(await inTenant(db, strategyGoals, input.goalId, input.tenantId))) throw fail("NOT_FOUND", "PROJECT_OS_STRATEGY_GOAL_NOT_FOUND");
  if (input.ownerUserId) {
    // the owner is a member of this company (a user of another company is refused, never stored)
    const [member] = await db.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.tenantId, input.tenantId), eq(memberships.userId, input.ownerUserId), eq(memberships.status, "active"))).limit(1);
    if (!member) throw fail("NOT_FOUND", "PROJECT_OS_STRATEGY_OWNER_NOT_MEMBER");
  }
  return { code: input.code.trim(), name: input.name.trim(), goalId: input.goalId || null, ownerUserId: input.ownerUserId ?? null, dueAt: input.dueAt ?? null, status: input.status ?? "planned", note: text(input.note) };
}

export async function createStrategyInitiative(input: Caller & InitiativeFields) {
  const db = await authorized(input, "strategy.manage");
  const fields = await initiativeValues(db, input);
  const [same] = await db.select({ id: strategyInitiatives.id }).from(strategyInitiatives).where(and(eq(strategyInitiatives.tenantId, input.tenantId), eq(strategyInitiatives.code, fields.code))).limit(1);
  if (same) throw fail("CONFLICT", "PROJECT_OS_STRATEGY_INITIATIVE_CODE_EXISTS");
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(strategyInitiatives).values({ id, tenantId: input.tenantId, ...fields, createdByUserId: input.userId });
    await audit(tx, input, "strategy_initiative", "strategy_initiative.created", id, { code: fields.code, goalId: fields.goalId });
  }).catch(codeTaken("strategy_initiatives_tenant_code_unique", "PROJECT_OS_STRATEGY_INITIATIVE_CODE_EXISTS"));
  return { id };
}

export async function updateStrategyInitiative(input: Caller & { initiativeId: string } & InitiativeFields) {
  const db = await authorized(input, "strategy.manage");
  const fields = await initiativeValues(db, input);
  const [row] = await db.select().from(strategyInitiatives).where(and(eq(strategyInitiatives.id, input.initiativeId), eq(strategyInitiatives.tenantId, input.tenantId))).limit(1);
  if (!row) throw fail("NOT_FOUND", "PROJECT_OS_STRATEGY_INITIATIVE_NOT_FOUND");
  const [same] = await db.select({ id: strategyInitiatives.id }).from(strategyInitiatives).where(and(eq(strategyInitiatives.tenantId, input.tenantId), eq(strategyInitiatives.code, fields.code))).limit(1);
  if (same && same.id !== row.id) throw fail("CONFLICT", "PROJECT_OS_STRATEGY_INITIATIVE_CODE_EXISTS");
  await db.transaction(async tx => {
    await tx.update(strategyInitiatives).set(fields).where(and(eq(strategyInitiatives.id, row.id), eq(strategyInitiatives.tenantId, input.tenantId)));
    await audit(tx, input, "strategy_initiative", "strategy_initiative.updated", row.id, { from: { status: row.status, dueAt: row.dueAt }, to: { status: fields.status, dueAt: fields.dueAt } });
  }).catch(codeTaken("strategy_initiatives_tenant_code_unique", "PROJECT_OS_STRATEGY_INITIATIVE_CODE_EXISTS"));
  return { id: row.id };
}

// ---- variances

const varianceShape = (row: VarianceRow) => {
  const assumed = Number(row.assumedValue);
  const actual = Number(row.actualValue);
  return {
    id: row.id, assumptionId: row.assumptionId, periodStart: row.periodStart, periodEnd: row.periodEnd, assumedValue: assumed, actualValue: actual, ...difference(assumed, actual),
    sampleSize: row.sampleSize, actualSource: row.actualSource, recurring: row.recurring, note: row.note, decision: row.decision, initiativeId: row.initiativeId,
    decisionReason: row.decisionReason, decidedByUserId: row.decidedByUserId, decidedAt: row.decidedAt, recordedByUserId: row.recordedByUserId,
  };
};

export async function listStrategyVariances(input: Caller & { assumptionId?: string }) {
  const db = await authorized(input, "strategy.read");
  const rows = await db.select().from(strategyVariances)
    .where(and(eq(strategyVariances.tenantId, input.tenantId), input.assumptionId ? eq(strategyVariances.assumptionId, input.assumptionId) : undefined)).orderBy(desc(strategyVariances.periodEnd));
  return rows.map(varianceShape);
}

type Actual = { source: "pipeline" } | { source: "manual"; value: number; sampleSize: number };
/**
 * Sets the APPROVED assumption (its base value) against the actual for a closed period. The actual is the win rate of the opportunities decided in the
 * period (source «pipeline», for a percent assumption) or a value someone enters with how many items it rests on (source «manual»). Nothing decided in the
 * period is refused («no actual»), never recorded as 0.
 */
export async function recordStrategyVariance(input: Caller & { assumptionId: string; periodStart: string; periodEnd: string; actual: Actual; recurring?: boolean; note?: string | null }) {
  const db = await authorized(input, "strategy.manage");
  period(input.periodStart, input.periodEnd);
  if (input.periodEnd > siteToday()) throw fail("BAD_REQUEST", "PROJECT_OS_STRATEGY_PERIOD_INVALID");
  const [assumption] = await db.select().from(strategyAssumptions).where(and(eq(strategyAssumptions.id, input.assumptionId), eq(strategyAssumptions.tenantId, input.tenantId))).limit(1);
  if (!assumption) throw fail("NOT_FOUND", "PROJECT_OS_STRATEGY_ASSUMPTION_NOT_FOUND");
  if (assumption.status !== "approved") throw fail("CONFLICT", "PROJECT_OS_STRATEGY_ASSUMPTION_NOT_APPROVED");
  let actual: { value: number; sampleSize: number };
  if (input.actual.source === "pipeline") {
    if (assumption.unit !== "percent") throw fail("BAD_REQUEST", "PROJECT_OS_STRATEGY_ACTUAL_SOURCE_INVALID");
    const decided = await db.select({ status: strategyOpportunities.status, decidedAt: strategyOpportunities.decidedAt }).from(strategyOpportunities).where(eq(strategyOpportunities.tenantId, input.tenantId));
    const rate = winRateInPeriod(decided, input.periodStart, input.periodEnd);
    if (!rate) throw fail("CONFLICT", "PROJECT_OS_STRATEGY_NO_ACTUAL");
    actual = { value: rate.actual, sampleSize: rate.sampleSize };
  } else {
    if (!Number.isFinite(input.actual.value) || !(Number.isInteger(input.actual.sampleSize) && input.actual.sampleSize > 0)) throw fail("BAD_REQUEST", "PROJECT_OS_STRATEGY_VALUE_INVALID");
    actual = { value: input.actual.value, sampleSize: input.actual.sampleSize };
  }
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(strategyVariances).values({
      id, tenantId: input.tenantId, assumptionId: assumption.id, periodStart: input.periodStart, periodEnd: input.periodEnd, assumedValue: assumption.valueBase,
      actualValue: actual.value.toFixed(4), sampleSize: actual.sampleSize, actualSource: input.actual.source, recurring: input.recurring ?? false, note: text(input.note), recordedByUserId: input.userId,
    });
    await audit(tx, input, "strategy_variance", "strategy_variance.recorded", id, { assumptionId: assumption.id, assumed: Number(assumption.valueBase), actual: actual.value, sampleSize: actual.sampleSize, source: input.actual.source });
  });
  return { id, assumedValue: Number(assumption.valueBase), actualValue: actual.value, sampleSize: actual.sampleSize, ...difference(Number(assumption.valueBase), actual.value) };
}

/** The decision a variance calls for. Final. «adjust_assumption» opens a change request (approved by someone else); «initiative» names one. No goal moves. */
export async function decideStrategyVariance(input: Caller & { varianceId: string; decision: "adjust_assumption" | "initiative"; reason: string; values?: Values; initiativeId?: string }) {
  const db = await authorized(input, "strategy.manage");
  const reason = input.reason.trim();
  if (!reason) throw fail("BAD_REQUEST", "PROJECT_OS_STRATEGY_CHANGE_REASON_REQUIRED");
  if (input.decision === "adjust_assumption" && !(input.values && [input.values.conservative, input.values.base, input.values.optimistic].every(Number.isFinite))) throw fail("BAD_REQUEST", "PROJECT_OS_STRATEGY_VALUE_INVALID");
  if (input.decision === "initiative" && !input.initiativeId) throw fail("BAD_REQUEST", "PROJECT_OS_STRATEGY_INITIATIVE_NOT_FOUND");
  const [row] = await db.select().from(strategyVariances).where(and(eq(strategyVariances.id, input.varianceId), eq(strategyVariances.tenantId, input.tenantId))).limit(1);
  if (!row) throw fail("NOT_FOUND", "PROJECT_OS_STRATEGY_VARIANCE_NOT_FOUND");
  if (row.decision) throw fail("CONFLICT", "PROJECT_OS_STRATEGY_VARIANCE_DECIDED");
  if (input.decision === "initiative" && !(await inTenant(db, strategyInitiatives, input.initiativeId!, input.tenantId))) throw fail("NOT_FOUND", "PROJECT_OS_STRATEGY_INITIATIVE_NOT_FOUND");
  await db.transaction(async tx => {
    if (input.decision === "adjust_assumption") {
      // the same rule as requestChange (#397): an approved assumption, no change already waiting; the values stay in force until someone else approves
      await tx.execute(sql`SELECT id FROM strategy_assumptions WHERE id = ${row.assumptionId} AND tenant_id = ${input.tenantId} FOR UPDATE`);
      const [assumption] = await tx.select().from(strategyAssumptions).where(and(eq(strategyAssumptions.id, row.assumptionId), eq(strategyAssumptions.tenantId, input.tenantId))).limit(1);
      if (!assumption || assumption.status !== "approved") throw fail("CONFLICT", "PROJECT_OS_STRATEGY_ASSUMPTION_NOT_APPROVED");
      if (assumption.proposedBase !== null) throw fail("CONFLICT", "PROJECT_OS_STRATEGY_CHANGE_ALREADY_PENDING");
      const values = input.values!;
      await tx.update(strategyAssumptions).set({ proposedConservative: values.conservative.toFixed(4), proposedBase: values.base.toFixed(4), proposedOptimistic: values.optimistic.toFixed(4), changeReason: reason, changeRequestedByUserId: input.userId })
        .where(and(eq(strategyAssumptions.id, assumption.id), eq(strategyAssumptions.tenantId, input.tenantId)));
      await audit(tx, input, "strategy_assumption", "strategy_assumption.change_requested", assumption.id, { values, reason, varianceId: row.id });
    }
    const decided = await tx.update(strategyVariances).set({ decision: input.decision, initiativeId: input.decision === "initiative" ? input.initiativeId! : null, decisionReason: reason, decidedByUserId: input.userId, decidedAt: new Date() })
      .where(and(eq(strategyVariances.id, row.id), eq(strategyVariances.tenantId, input.tenantId), isNull(strategyVariances.decision))).returning({ id: strategyVariances.id });
    // decided meanwhile by someone else: nothing is kept (the change request above is rolled back with it)
    if (decided.length !== 1) throw fail("CONFLICT", "PROJECT_OS_STRATEGY_VARIANCE_DECIDED");
    await audit(tx, input, "strategy_variance", "strategy_variance.decided", row.id, { decision: input.decision, initiativeId: input.initiativeId ?? null, reason });
  });
  return { id: row.id, decision: input.decision };
}
