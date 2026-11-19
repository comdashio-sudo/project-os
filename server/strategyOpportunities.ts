// Q-21 (a), batch 4: the company's opportunities pipeline (docs/proposals/q21-strategy-mapping.md §2, item 4; §5 question 1 → a table of its own, the
// proposed option, the adviser not having decided within two hours — Q-30 (3)). Company-wide: strategy.read reads, strategy.manage writes, at company scope.
// An opportunity is entered and kept up to date while open or submitted; once decided (won / lost / withdrawn) its figures are locked, so the actual win
// rate cannot be rewritten after the fact — a decision is final in this batch (no reopening).
// The winner of a lost opportunity, when known, is a competitor of the same company. Every write leaves an audit row in its transaction.
import { TRPCError } from "@trpc/server";
import { and, asc, eq } from "drizzle-orm";
import { auditLogs, strategyCompetitors, strategyOpportunities } from "../drizzle/schema";
import { assertTenantAccess } from "./domain/authorization";
import { summarizePipeline } from "./domain/strategyPipeline";
import { getDb, getTenantAccessSnapshot } from "./db";

type Caller = { userId: number; tenantId: string };
type Row = typeof strategyOpportunities.$inferSelect;
export type OpportunityFields = {
  code: string; name: string; clientName?: string | null; sector?: string | null; region?: string | null; estimatedValue: number; probabilityPercent: number;
  expectedAwardAt?: string | null; durationMonths?: number | null; status?: "open" | "submitted";
};

const fail = (code: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST", message: string) => new TRPCError({ code, message });
const text = (value: string | null | undefined) => value?.trim() || null;
const siteToday = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

async function authorized(input: Caller, permission: "strategy.read" | "strategy.manage") {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw fail("FORBIDDEN", "PROJECT_OS_TENANT_ACCESS_DENIED");
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "EXECUTIVE", permission, scope: { type: "company", id: input.tenantId } });
  return db;
}
type Db = Awaited<ReturnType<typeof authorized>>;

function values(input: OpportunityFields) {
  if (!Number.isFinite(input.estimatedValue) || input.estimatedValue < 0 || !(input.probabilityPercent >= 0 && input.probabilityPercent <= 100)) throw fail("BAD_REQUEST", "PROJECT_OS_STRATEGY_VALUE_INVALID");
  if (input.durationMonths !== undefined && input.durationMonths !== null && !(Number.isInteger(input.durationMonths) && input.durationMonths > 0)) throw fail("BAD_REQUEST", "PROJECT_OS_STRATEGY_VALUE_INVALID");
  return {
    code: input.code.trim(), name: input.name.trim(), clientName: text(input.clientName), sector: text(input.sector), region: text(input.region),
    estimatedValue: input.estimatedValue.toFixed(2), probabilityPercent: input.probabilityPercent.toFixed(2), expectedAwardAt: input.expectedAwardAt ?? null,
    durationMonths: input.durationMonths ?? null, status: input.status ?? "open",
  };
}
const shape = (row: Row) => ({
  id: row.id, code: row.code, name: row.name, clientName: row.clientName, sector: row.sector, region: row.region, estimatedValue: Number(row.estimatedValue),
  probabilityPercent: Number(row.probabilityPercent), expectedAwardAt: row.expectedAwardAt, durationMonths: row.durationMonths, status: row.status, decidedAt: row.decidedAt,
  winnerCompetitorId: row.winnerCompetitorId, winningValue: row.winningValue === null ? null : Number(row.winningValue), outcomeNote: row.outcomeNote,
});
const audit = (db: Pick<Db, "insert">, input: Caller, action: string, id: string, metadata: Record<string, unknown>) =>
  db.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action, entityType: "strategy_opportunity", entityId: id, metadata: JSON.stringify(metadata) });

async function loadOpportunity(db: Db, input: Caller & { opportunityId: string }) {
  const [row] = await db.select().from(strategyOpportunities).where(and(eq(strategyOpportunities.id, input.opportunityId), eq(strategyOpportunities.tenantId, input.tenantId))).limit(1);
  if (!row) throw fail("NOT_FOUND", "PROJECT_OS_STRATEGY_OPPORTUNITY_NOT_FOUND");
  return row;
}

export async function listStrategyOpportunities(input: Caller & { status?: Row["status"] }) {
  const db = await authorized(input, "strategy.read");
  const rows = await db.select().from(strategyOpportunities)
    .where(and(eq(strategyOpportunities.tenantId, input.tenantId), input.status ? eq(strategyOpportunities.status, input.status) : undefined)).orderBy(asc(strategyOpportunities.code));
  return rows.map(shape);
}

export async function createStrategyOpportunity(input: Caller & OpportunityFields) {
  const db = await authorized(input, "strategy.manage");
  const fields = values(input);
  const [same] = await db.select({ id: strategyOpportunities.id }).from(strategyOpportunities).where(and(eq(strategyOpportunities.tenantId, input.tenantId), eq(strategyOpportunities.code, fields.code))).limit(1);
  if (same) throw fail("CONFLICT", "PROJECT_OS_STRATEGY_OPPORTUNITY_CODE_EXISTS");
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(strategyOpportunities).values({ id, tenantId: input.tenantId, ...fields, createdByUserId: input.userId });
    await audit(tx, input, "strategy_opportunity.created", id, { code: fields.code, value: input.estimatedValue, probability: input.probabilityPercent });
  });
  return { id };
}

/** An opportunity still in play is kept up to date; a decided one is not edited (its figures make the actual win rate). */
export async function updateStrategyOpportunity(input: Caller & { opportunityId: string } & OpportunityFields) {
  const db = await authorized(input, "strategy.manage");
  const fields = values(input);
  const row = await loadOpportunity(db, input);
  if (row.status !== "open" && row.status !== "submitted") throw fail("CONFLICT", "PROJECT_OS_STRATEGY_OPPORTUNITY_DECIDED");
  const [same] = await db.select({ id: strategyOpportunities.id }).from(strategyOpportunities).where(and(eq(strategyOpportunities.tenantId, input.tenantId), eq(strategyOpportunities.code, fields.code))).limit(1);
  if (same && same.id !== row.id) throw fail("CONFLICT", "PROJECT_OS_STRATEGY_OPPORTUNITY_CODE_EXISTS");
  await db.transaction(async tx => {
    await tx.update(strategyOpportunities).set(fields).where(and(eq(strategyOpportunities.id, row.id), eq(strategyOpportunities.tenantId, input.tenantId), eq(strategyOpportunities.status, row.status)));
    await audit(tx, input, "strategy_opportunity.updated", row.id, { from: { value: Number(row.estimatedValue), probability: Number(row.probabilityPercent), status: row.status }, to: { value: input.estimatedValue, probability: input.probabilityPercent, status: fields.status } });
  });
  return { id: row.id };
}

/** Records the outcome: won, lost (optionally to which competitor and for how much) or withdrawn, on a date not after today. Final. */
export async function decideStrategyOpportunity(input: Caller & { opportunityId: string; outcome: "won" | "lost" | "withdrawn"; decidedAt: string; winnerCompetitorId?: string | null; winningValue?: number | null; note?: string | null }) {
  const db = await authorized(input, "strategy.manage");
  if (input.decidedAt > siteToday()) throw fail("BAD_REQUEST", "PROJECT_OS_STRATEGY_DECIDED_AT_FUTURE");
  if ((input.winnerCompetitorId || (input.winningValue !== undefined && input.winningValue !== null)) && input.outcome !== "lost") throw fail("BAD_REQUEST", "PROJECT_OS_STRATEGY_WINNER_ONLY_WHEN_LOST");
  if (input.winningValue !== undefined && input.winningValue !== null && !(Number.isFinite(input.winningValue) && input.winningValue >= 0)) throw fail("BAD_REQUEST", "PROJECT_OS_STRATEGY_VALUE_INVALID");
  const row = await loadOpportunity(db, input);
  if (row.status !== "open" && row.status !== "submitted") throw fail("CONFLICT", "PROJECT_OS_STRATEGY_OPPORTUNITY_DECIDED");
  if (input.winnerCompetitorId) {
    const [rival] = await db.select({ id: strategyCompetitors.id }).from(strategyCompetitors).where(and(eq(strategyCompetitors.id, input.winnerCompetitorId), eq(strategyCompetitors.tenantId, input.tenantId))).limit(1);
    if (!rival) throw fail("NOT_FOUND", "PROJECT_OS_STRATEGY_COMPETITOR_NOT_FOUND");
  }
  await db.transaction(async tx => {
    await tx.update(strategyOpportunities).set({
      status: input.outcome, decidedAt: input.decidedAt, winnerCompetitorId: input.winnerCompetitorId || null,
      winningValue: input.winningValue === undefined || input.winningValue === null ? null : input.winningValue.toFixed(2), outcomeNote: text(input.note),
    }).where(and(eq(strategyOpportunities.id, row.id), eq(strategyOpportunities.tenantId, input.tenantId), eq(strategyOpportunities.status, row.status)));
    await audit(tx, input, "strategy_opportunity.decided", row.id, { outcome: input.outcome, decidedAt: input.decidedAt, winnerCompetitorId: input.winnerCompetitorId ?? null });
  });
  return { id: row.id, status: input.outcome };
}

/** The pipeline in numbers (server/domain/strategyPipeline.ts), with the competitors' names for «lost to». */
export async function getStrategyPipelineSummary(input: Caller & { months?: number }) {
  const db = await authorized(input, "strategy.read");
  const rows = await db.select().from(strategyOpportunities).where(eq(strategyOpportunities.tenantId, input.tenantId));
  const summary = summarizePipeline(rows.map(shape), siteToday(), input.months ?? 12);
  const names = summary.lostTo.length ? await db.select({ id: strategyCompetitors.id, name: strategyCompetitors.name }).from(strategyCompetitors).where(eq(strategyCompetitors.tenantId, input.tenantId)) : [];
  return { ...summary, lostTo: summary.lostTo.map(entry => ({ ...entry, competitorName: names.find(name => name.id === entry.competitorId)?.name ?? null })) };
}
