// Q-21 (a), batch 1: the register of strategy assumptions (docs/proposals/q21-strategy-mapping.md §2–§4). Company-wide: every call asks for its permission
// on a COMPANY-scope assignment of the EXECUTIVE product (a project-scoped grant does not reach it), through assertTenantAccess.
//   strategy.read     the register and each assumption's change history
//   strategy.manage   enter a draft, correct it, send it for approval; ask for a change to an approved one
//   strategy.approve  approve a draft or a change, refuse a change, retire an assumption
// Separation of duties: whoever entered, corrected or sent a draft, or asked for a change, does not approve it (PROJECT_OS_STRATEGY_SELF_APPROVAL).
// An approved assumption is never edited in place: its values move only when a change request is approved, and every approval, change, refusal and
// retirement writes one row to strategy_assumption_changes (append-only in the database) and one audit row, in the same transaction as the change.
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { auditLogs, strategyAssumptionChanges, strategyAssumptions } from "../drizzle/schema";
import { assertTenantAccess } from "./domain/authorization";
import { getDb, getTenantAccessSnapshot } from "./db";
import { violates } from "./projectProfile";

type Caller = { userId: number; tenantId: string };
type Values = { conservative: number; base: number; optimistic: number };
type Row = typeof strategyAssumptions.$inferSelect;
export type AssumptionFields = {
  code: string; name: string; unit: Row["unit"]; sourceType: Row["sourceType"]; sourceNote?: string | null; confidence: Row["confidence"];
  reviewFrequency: Row["reviewFrequency"]; nextReviewAt?: string | null; values: Values;
  // Q-21 (a), batch 2: the market study's indicators are assumptions of the «market» module
  module?: Row["module"]; evidence?: Row["evidence"]; sourceUrl?: string | null;
};

const fail = (code: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST", message: string) => new TRPCError({ code, message });
const num = (value: number) => value.toFixed(4);
const toNumber = (value: string | null) => (value === null ? null : Number(value));

async function authorized(input: Caller, permission: "strategy.read" | "strategy.manage" | "strategy.approve") {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw fail("FORBIDDEN", "PROJECT_OS_TENANT_ACCESS_DENIED");
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "EXECUTIVE", permission, scope: { type: "company", id: input.tenantId } });
  return db;
}

function assertValues(values: Values) {
  if (![values.conservative, values.base, values.optimistic].every(Number.isFinite)) throw fail("BAD_REQUEST", "PROJECT_OS_STRATEGY_VALUE_INVALID");
}

/** Q-21 (a), batch 2: every market indicator names where it came from — a link, a note, or both; a link is an https address. */
function sourceOf(input: Pick<AssumptionFields, "module" | "sourceNote" | "sourceUrl">) {
  const note = input.sourceNote?.trim() || null; const url = input.sourceUrl?.trim() || null;
  if (url && !/^https:\/\/[^\s]+$/i.test(url)) throw fail("BAD_REQUEST", "PROJECT_OS_STRATEGY_SOURCE_URL_INVALID");
  if ((input.module ?? "general") === "market" && !note && !url) throw fail("BAD_REQUEST", "PROJECT_OS_STRATEGY_MARKET_SOURCE_REQUIRED");
  return { sourceNote: note, sourceUrl: url };
}

const shape = (row: Row) => ({
  id: row.id, code: row.code, name: row.name, unit: row.unit, sourceType: row.sourceType, sourceNote: row.sourceNote, sourceUrl: row.sourceUrl, module: row.module, evidence: row.evidence, confidence: row.confidence,
  reviewFrequency: row.reviewFrequency, nextReviewAt: row.nextReviewAt, status: row.status, approvedAt: row.approvedAt,
  values: { conservative: Number(row.valueConservative), base: Number(row.valueBase), optimistic: Number(row.valueOptimistic) },
  pendingChange: row.proposedBase === null ? null : {
    values: { conservative: Number(row.proposedConservative), base: Number(row.proposedBase), optimistic: Number(row.proposedOptimistic) },
    reason: row.changeReason, requestedByUserId: row.changeRequestedByUserId,
  },
});

export async function listStrategyAssumptions(input: Caller & { module?: Row["module"] }) {
  const db = await authorized(input, "strategy.read");
  const rows = await db.select().from(strategyAssumptions)
    .where(and(eq(strategyAssumptions.tenantId, input.tenantId), input.module ? eq(strategyAssumptions.module, input.module) : undefined)).orderBy(asc(strategyAssumptions.code));
  return rows.map(shape);
}

export async function getStrategyAssumptionChanges(input: Caller & { assumptionId: string }) {
  const db = await authorized(input, "strategy.read");
  const rows = await db.select().from(strategyAssumptionChanges)
    .where(and(eq(strategyAssumptionChanges.tenantId, input.tenantId), eq(strategyAssumptionChanges.assumptionId, input.assumptionId)))
    .orderBy(desc(strategyAssumptionChanges.createdAt));
  return rows.map(row => ({
    id: row.id, kind: row.kind, reason: row.reason, requestedByUserId: row.requestedByUserId, decidedByUserId: row.decidedByUserId, createdAt: row.createdAt,
    previous: row.previousBase === null ? null : { conservative: toNumber(row.previousConservative), base: toNumber(row.previousBase), optimistic: toNumber(row.previousOptimistic) },
    next: row.newBase === null ? null : { conservative: toNumber(row.newConservative), base: toNumber(row.newBase), optimistic: toNumber(row.newOptimistic) },
  }));
}

type Db = Awaited<ReturnType<typeof authorized>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
/** The assumption, locked for the length of the transaction, of this company only. */
async function loadLocked(tx: Tx, input: Caller & { assumptionId: string }) {
  await tx.execute(sql`SELECT id FROM strategy_assumptions WHERE id = ${input.assumptionId} AND tenant_id = ${input.tenantId} FOR UPDATE`);
  const [row] = await tx.select().from(strategyAssumptions).where(and(eq(strategyAssumptions.id, input.assumptionId), eq(strategyAssumptions.tenantId, input.tenantId))).limit(1);
  if (!row) throw fail("NOT_FOUND", "PROJECT_OS_STRATEGY_ASSUMPTION_NOT_FOUND");
  return row;
}
const audit = (tx: Tx, input: Caller, action: string, entityId: string, metadata: Record<string, unknown>) =>
  tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action, entityType: "strategy_assumption", entityId, metadata: JSON.stringify(metadata) });

export async function createStrategyAssumption(input: Caller & AssumptionFields) {
  const db = await authorized(input, "strategy.manage");
  assertValues(input.values);
  const source = sourceOf(input);
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    const [duplicate] = await tx.select({ id: strategyAssumptions.id }).from(strategyAssumptions).where(and(eq(strategyAssumptions.tenantId, input.tenantId), eq(strategyAssumptions.code, input.code))).limit(1);
    if (duplicate) throw fail("CONFLICT", "PROJECT_OS_STRATEGY_ASSUMPTION_CODE_EXISTS");
    await tx.insert(strategyAssumptions).values({
      id, tenantId: input.tenantId, code: input.code, name: input.name, unit: input.unit, sourceType: input.sourceType, ...source, module: input.module ?? "general", evidence: input.evidence ?? "estimate",
      confidence: input.confidence, reviewFrequency: input.reviewFrequency, nextReviewAt: input.nextReviewAt ?? null,
      valueConservative: num(input.values.conservative), valueBase: num(input.values.base), valueOptimistic: num(input.values.optimistic), createdByUserId: input.userId,
    });
    await audit(tx, input, "strategy_assumption.created", id, { code: input.code, module: input.module ?? "general", evidence: input.evidence ?? "estimate", values: input.values });
    // two saves of the same code at the same moment both pass the read above; the unique (tenant, code) index lets one win and the other gets the same
    // translated refusal, not a raw 23505 (the sibling of #496)
  }).catch((error: unknown): never => { if (violates(error, "strategy_assumptions_tenant_code_unique")) throw fail("CONFLICT", "PROJECT_OS_STRATEGY_ASSUMPTION_CODE_EXISTS"); throw error; });
  return { id, status: "draft" as const };
}

/** A draft (or one sent back to draft) may be corrected freely; anything else is refused — an approved one changes only by a change request. */
export async function updateStrategyAssumptionDraft(input: Caller & { assumptionId: string } & Omit<AssumptionFields, "code">) {
  const db = await authorized(input, "strategy.manage");
  assertValues(input.values);
  await db.transaction(async tx => {
    const row = await loadLocked(tx, input);
    const source = sourceOf({ ...input, module: input.module ?? row.module });
    if (row.status === "approved") throw fail("CONFLICT", "PROJECT_OS_STRATEGY_ASSUMPTION_APPROVED_LOCKED");
    if (row.status !== "draft") throw fail("CONFLICT", "PROJECT_OS_STRATEGY_ASSUMPTION_NOT_DRAFT");
    await tx.update(strategyAssumptions).set({
      name: input.name, unit: input.unit, sourceType: input.sourceType, ...source, module: input.module ?? row.module, evidence: input.evidence ?? row.evidence, confidence: input.confidence, reviewFrequency: input.reviewFrequency,
      nextReviewAt: input.nextReviewAt ?? null, valueConservative: num(input.values.conservative), valueBase: num(input.values.base), valueOptimistic: num(input.values.optimistic),
    }).where(and(eq(strategyAssumptions.id, row.id), eq(strategyAssumptions.tenantId, input.tenantId)));
    await audit(tx, input, "strategy_assumption.draft_updated", row.id, { values: input.values });
  });
  return { id: input.assumptionId, status: "draft" as const };
}

export async function submitStrategyAssumption(input: Caller & { assumptionId: string }) {
  const db = await authorized(input, "strategy.manage");
  await db.transaction(async tx => {
    const row = await loadLocked(tx, input);
    if (row.status !== "draft") throw fail("CONFLICT", "PROJECT_OS_STRATEGY_ASSUMPTION_NOT_DRAFT");
    await tx.update(strategyAssumptions).set({ status: "pending", submittedByUserId: input.userId }).where(and(eq(strategyAssumptions.id, row.id), eq(strategyAssumptions.tenantId, input.tenantId)));
    await audit(tx, input, "strategy_assumption.submitted", row.id, {});
  });
  return { id: input.assumptionId, status: "pending" as const };
}

/** Approve a pending draft (its values become the approved ones), or send it back to draft. The person who entered or sent it does not decide it. */
export async function decideStrategyAssumption(input: Caller & { assumptionId: string; decision: "approve" | "return"; reason?: string }) {
  const db = await authorized(input, "strategy.approve");
  return db.transaction(async tx => {
    const row = await loadLocked(tx, input);
    if (row.status !== "pending") throw fail("CONFLICT", "PROJECT_OS_STRATEGY_ASSUMPTION_NOT_PENDING");
    if (row.createdByUserId === input.userId || row.submittedByUserId === input.userId) throw fail("FORBIDDEN", "PROJECT_OS_STRATEGY_SELF_APPROVAL");
    // Review of #397 (programmer A): whoever corrected the draft's values (any draft_updated row of theirs, in this draft's whole life — a return to draft
    // keeps the values they wrote) does not approve it either; returning it stays open to them. Read from the audit trail, so no migration.
    if (input.decision === "approve") {
      const [edited] = await tx.select({ id: auditLogs.id }).from(auditLogs).where(and(eq(auditLogs.tenantId, input.tenantId), eq(auditLogs.entityType, "strategy_assumption"),
        eq(auditLogs.entityId, row.id), eq(auditLogs.action, "strategy_assumption.draft_updated"), eq(auditLogs.actorUserId, input.userId))).limit(1);
      if (edited) throw fail("FORBIDDEN", "PROJECT_OS_STRATEGY_SELF_APPROVAL");
    }
    const where = and(eq(strategyAssumptions.id, row.id), eq(strategyAssumptions.tenantId, input.tenantId));
    if (input.decision === "return") {
      await tx.update(strategyAssumptions).set({ status: "draft", submittedByUserId: null }).where(where);
      await audit(tx, input, "strategy_assumption.returned", row.id, { reason: input.reason ?? null });
      return { id: row.id, status: "draft" as const };
    }
    await tx.update(strategyAssumptions).set({ status: "approved", approvedByUserId: input.userId, approvedAt: new Date() }).where(where);
    await tx.insert(strategyAssumptionChanges).values({
      id: crypto.randomUUID(), tenantId: input.tenantId, assumptionId: row.id, kind: "approved", newConservative: row.valueConservative, newBase: row.valueBase, newOptimistic: row.valueOptimistic,
      reason: input.reason?.trim() || null, requestedByUserId: row.submittedByUserId, decidedByUserId: input.userId,
    });
    await audit(tx, input, "strategy_assumption.approved", row.id, { values: shape(row).values });
    return { id: row.id, status: "approved" as const };
  });
}

/** Ask for new values for an approved assumption. The approved values stay in force (and in the model) until someone else approves the request. */
export async function requestStrategyAssumptionChange(input: Caller & { assumptionId: string; values: Values; reason: string }) {
  const db = await authorized(input, "strategy.manage");
  assertValues(input.values);
  if (!input.reason.trim()) throw fail("BAD_REQUEST", "PROJECT_OS_STRATEGY_CHANGE_REASON_REQUIRED");
  await db.transaction(async tx => {
    const row = await loadLocked(tx, input);
    if (row.status !== "approved") throw fail("CONFLICT", "PROJECT_OS_STRATEGY_ASSUMPTION_NOT_APPROVED");
    if (row.proposedBase !== null) throw fail("CONFLICT", "PROJECT_OS_STRATEGY_CHANGE_ALREADY_PENDING");
    await tx.update(strategyAssumptions).set({ proposedConservative: num(input.values.conservative), proposedBase: num(input.values.base), proposedOptimistic: num(input.values.optimistic), changeReason: input.reason.trim(), changeRequestedByUserId: input.userId })
      .where(and(eq(strategyAssumptions.id, row.id), eq(strategyAssumptions.tenantId, input.tenantId)));
    await audit(tx, input, "strategy_assumption.change_requested", row.id, { values: input.values, reason: input.reason.trim() });
  });
  return { id: input.assumptionId, pendingChange: true };
}

/** Approve or refuse a change request. Either way one row of history records the two sets of values, the reason, who asked and who decided. */
export async function decideStrategyAssumptionChange(input: Caller & { assumptionId: string; decision: "approve" | "reject" }) {
  const db = await authorized(input, "strategy.approve");
  return db.transaction(async tx => {
    const row = await loadLocked(tx, input);
    if (row.status !== "approved" || row.proposedBase === null) throw fail("CONFLICT", "PROJECT_OS_STRATEGY_NO_PENDING_CHANGE");
    if (row.changeRequestedByUserId === input.userId) throw fail("FORBIDDEN", "PROJECT_OS_STRATEGY_SELF_APPROVAL");
    const approve = input.decision === "approve";
    await tx.insert(strategyAssumptionChanges).values({
      id: crypto.randomUUID(), tenantId: input.tenantId, assumptionId: row.id, kind: approve ? "changed" : "change_rejected",
      previousConservative: row.valueConservative, previousBase: row.valueBase, previousOptimistic: row.valueOptimistic,
      newConservative: row.proposedConservative, newBase: row.proposedBase, newOptimistic: row.proposedOptimistic,
      reason: row.changeReason, requestedByUserId: row.changeRequestedByUserId, decidedByUserId: input.userId,
    });
    const cleared = { proposedConservative: null, proposedBase: null, proposedOptimistic: null, changeReason: null, changeRequestedByUserId: null };
    await tx.update(strategyAssumptions).set(approve
      ? { ...cleared, valueConservative: row.proposedConservative!, valueBase: row.proposedBase!, valueOptimistic: row.proposedOptimistic!, approvedByUserId: input.userId, approvedAt: new Date() }
      : cleared).where(and(eq(strategyAssumptions.id, row.id), eq(strategyAssumptions.tenantId, input.tenantId)));
    await audit(tx, input, approve ? "strategy_assumption.changed" : "strategy_assumption.change_rejected", row.id, { reason: row.changeReason });
    return { id: row.id, changed: approve };
  });
}

/** Retire an assumption: it leaves the model. A pending change request, if any, lapses with it. */
export async function retireStrategyAssumption(input: Caller & { assumptionId: string; reason: string }) {
  const db = await authorized(input, "strategy.approve");
  if (!input.reason.trim()) throw fail("BAD_REQUEST", "PROJECT_OS_STRATEGY_CHANGE_REASON_REQUIRED");
  await db.transaction(async tx => {
    const row = await loadLocked(tx, input);
    if (row.status === "retired") throw fail("CONFLICT", "PROJECT_OS_STRATEGY_ASSUMPTION_RETIRED");
    await tx.update(strategyAssumptions).set({ status: "retired", proposedConservative: null, proposedBase: null, proposedOptimistic: null, changeReason: null, changeRequestedByUserId: null })
      .where(and(eq(strategyAssumptions.id, row.id), eq(strategyAssumptions.tenantId, input.tenantId)));
    await tx.insert(strategyAssumptionChanges).values({
      id: crypto.randomUUID(), tenantId: input.tenantId, assumptionId: row.id, kind: "retired", previousConservative: row.valueConservative, previousBase: row.valueBase, previousOptimistic: row.valueOptimistic,
      reason: input.reason.trim(), decidedByUserId: input.userId,
    });
    await audit(tx, input, "strategy_assumption.retired", row.id, { reason: input.reason.trim() });
  });
  return { id: input.assumptionId, status: "retired" as const };
}
