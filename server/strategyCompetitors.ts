// Q-21 (a), batch 3: competitors and SWOT (docs/proposals/q21-strategy-mapping.md §2, item 3). Company-wide, as the register of assumptions: every call
// asks for strategy.read or strategy.manage on a COMPANY-scope assignment of the EXECUTIVE product (assertTenantAccess). Each write leaves an audit row in
// its own transaction. Nothing is deleted: a competitor or a SWOT point no longer held is archived, and stays readable with `includeArchived`.
//   competitor: who it is, its sector, region and kind of projects, its size (documented = confirmed, or estimated), the source and the date it was gathered
//   SWOT point: strength / weakness / opportunity / threat, the evidence behind it, and (optionally) the competitor it is about and the assumption it bears on
import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray } from "drizzle-orm";
import { auditLogs, strategyAssumptions, strategyCompetitors, strategySwotItems } from "../drizzle/schema";
import { assertTenantAccess } from "./domain/authorization";
import { getDb, getTenantAccessSnapshot } from "./db";

type Caller = { userId: number; tenantId: string };
type Competitor = typeof strategyCompetitors.$inferSelect;
type Swot = typeof strategySwotItems.$inferSelect;
export type CompetitorFields = {
  name: string; sector?: string | null; region?: string | null; projectTypes?: string | null; sizeValue?: number | null; sizeEvidence?: Competitor["sizeEvidence"];
  sourceNote?: string | null; sourceUrl?: string | null; collectedAt: string;
};
export type SwotFields = { kind: Swot["kind"]; statement: string; evidence: string; competitorId?: string | null; assumptionId?: string | null };

const fail = (code: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST", message: string) => new TRPCError({ code, message });
const text = (value: string | null | undefined) => value?.trim() || null;
/** Today in Riyadh (the site day), as YYYY-MM-DD: information cannot have been gathered after it. */
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
const audit = (db: Pick<Db, "insert">, input: Caller, action: string, entityType: string, entityId: string, metadata: Record<string, unknown>) =>
  db.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action, entityType, entityId, metadata: JSON.stringify(metadata) });

/** The competitor's fields as stored: a source (link or note) is required, a link is https, and the date gathered is not in the future. */
function competitorValues(input: CompetitorFields) {
  const sourceNote = text(input.sourceNote); const sourceUrl = text(input.sourceUrl);
  if (sourceUrl && !/^https:\/\/[^\s]+$/i.test(sourceUrl)) throw fail("BAD_REQUEST", "PROJECT_OS_STRATEGY_SOURCE_URL_INVALID");
  if (!sourceNote && !sourceUrl) throw fail("BAD_REQUEST", "PROJECT_OS_STRATEGY_SOURCE_REQUIRED");
  if (input.collectedAt > siteToday()) throw fail("BAD_REQUEST", "PROJECT_OS_STRATEGY_COLLECTED_AT_FUTURE");
  if (input.sizeValue !== undefined && input.sizeValue !== null && (!Number.isFinite(input.sizeValue) || input.sizeValue < 0)) throw fail("BAD_REQUEST", "PROJECT_OS_STRATEGY_VALUE_INVALID");
  return {
    name: input.name.trim(), sector: text(input.sector), region: text(input.region), projectTypes: text(input.projectTypes),
    sizeValue: input.sizeValue === undefined || input.sizeValue === null ? null : input.sizeValue.toFixed(2), sizeEvidence: input.sizeEvidence ?? "estimate",
    sourceNote, sourceUrl, collectedAt: input.collectedAt,
  };
}
const competitorShape = (row: Competitor) => ({
  id: row.id, name: row.name, sector: row.sector, region: row.region, projectTypes: row.projectTypes, sizeValue: row.sizeValue === null ? null : Number(row.sizeValue),
  sizeEvidence: row.sizeEvidence, sourceNote: row.sourceNote, sourceUrl: row.sourceUrl, collectedAt: row.collectedAt, archived: row.archived,
});

export async function listStrategyCompetitors(input: Caller & { includeArchived?: boolean }) {
  const db = await authorized(input, "strategy.read");
  const rows = await db.select().from(strategyCompetitors)
    .where(and(eq(strategyCompetitors.tenantId, input.tenantId), input.includeArchived ? undefined : eq(strategyCompetitors.archived, false))).orderBy(asc(strategyCompetitors.name));
  return rows.map(competitorShape);
}

async function loadCompetitor(db: Db, input: Caller & { competitorId: string }) {
  const [row] = await db.select().from(strategyCompetitors).where(and(eq(strategyCompetitors.id, input.competitorId), eq(strategyCompetitors.tenantId, input.tenantId))).limit(1);
  if (!row) throw fail("NOT_FOUND", "PROJECT_OS_STRATEGY_COMPETITOR_NOT_FOUND");
  return row;
}
async function assertNameFree(db: Db, input: Caller & { name: string; exceptId?: string }) {
  const [same] = await db.select({ id: strategyCompetitors.id }).from(strategyCompetitors).where(and(eq(strategyCompetitors.tenantId, input.tenantId), eq(strategyCompetitors.name, input.name.trim()))).limit(1);
  if (same && same.id !== input.exceptId) throw fail("CONFLICT", "PROJECT_OS_STRATEGY_COMPETITOR_EXISTS");
}

export async function createStrategyCompetitor(input: Caller & CompetitorFields) {
  const db = await authorized(input, "strategy.manage");
  const values = competitorValues(input);
  await assertNameFree(db, input);
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(strategyCompetitors).values({ id, tenantId: input.tenantId, ...values, createdByUserId: input.userId });
    await audit(tx, input, "strategy_competitor.created", "strategy_competitor", id, { name: values.name });
  });
  return { id };
}

export async function updateStrategyCompetitor(input: Caller & { competitorId: string; archived?: boolean } & CompetitorFields) {
  const db = await authorized(input, "strategy.manage");
  const values = competitorValues(input);
  const row = await loadCompetitor(db, input);
  await assertNameFree(db, { ...input, exceptId: row.id });
  await db.transaction(async tx => {
    await tx.update(strategyCompetitors).set({ ...values, archived: input.archived ?? row.archived }).where(and(eq(strategyCompetitors.id, row.id), eq(strategyCompetitors.tenantId, input.tenantId)));
    await audit(tx, input, input.archived && !row.archived ? "strategy_competitor.archived" : "strategy_competitor.updated", "strategy_competitor", row.id, { name: values.name });
  });
  return { id: row.id };
}

/** The competitor and the assumption a point names must be this company's (the database says so too, by composite key). */
async function assertLinks(db: Db, input: Caller & Pick<SwotFields, "competitorId" | "assumptionId">) {
  if (input.competitorId) await loadCompetitor(db, { ...input, competitorId: input.competitorId });
  if (input.assumptionId) {
    const [row] = await db.select({ id: strategyAssumptions.id }).from(strategyAssumptions).where(and(eq(strategyAssumptions.id, input.assumptionId), eq(strategyAssumptions.tenantId, input.tenantId))).limit(1);
    if (!row) throw fail("NOT_FOUND", "PROJECT_OS_STRATEGY_ASSUMPTION_NOT_FOUND");
  }
}
function swotValues(input: SwotFields) {
  const statement = input.statement.trim(); const evidence = input.evidence.trim();
  if (!statement || !evidence) throw fail("BAD_REQUEST", "PROJECT_OS_STRATEGY_SWOT_EVIDENCE_REQUIRED");
  return { kind: input.kind, statement, evidence, competitorId: input.competitorId || null, assumptionId: input.assumptionId || null };
}

export async function listStrategySwot(input: Caller & { includeArchived?: boolean; competitorId?: string }) {
  const db = await authorized(input, "strategy.read");
  const rows = await db.select().from(strategySwotItems)
    .where(and(eq(strategySwotItems.tenantId, input.tenantId), input.includeArchived ? undefined : eq(strategySwotItems.archived, false), input.competitorId ? eq(strategySwotItems.competitorId, input.competitorId) : undefined))
    .orderBy(asc(strategySwotItems.kind), asc(strategySwotItems.createdAt));
  const competitorIds = Array.from(new Set(rows.map(row => row.competitorId).filter((id): id is string => Boolean(id))));
  const assumptionIds = Array.from(new Set(rows.map(row => row.assumptionId).filter((id): id is string => Boolean(id))));
  const [competitors, assumptions] = await Promise.all([
    competitorIds.length ? db.select({ id: strategyCompetitors.id, name: strategyCompetitors.name }).from(strategyCompetitors).where(and(eq(strategyCompetitors.tenantId, input.tenantId), inArray(strategyCompetitors.id, competitorIds))) : [],
    assumptionIds.length ? db.select({ id: strategyAssumptions.id, code: strategyAssumptions.code, name: strategyAssumptions.name }).from(strategyAssumptions).where(and(eq(strategyAssumptions.tenantId, input.tenantId), inArray(strategyAssumptions.id, assumptionIds))) : [],
  ]);
  const competitorOf = new Map(competitors.map(row => [row.id, row])); const assumptionOf = new Map(assumptions.map(row => [row.id, row]));
  return rows.map(row => ({
    id: row.id, kind: row.kind, statement: row.statement, evidence: row.evidence, archived: row.archived,
    competitor: row.competitorId ? competitorOf.get(row.competitorId) ?? null : null, assumption: row.assumptionId ? assumptionOf.get(row.assumptionId) ?? null : null,
  }));
}

export async function createStrategySwot(input: Caller & SwotFields) {
  const db = await authorized(input, "strategy.manage");
  const values = swotValues(input);
  await assertLinks(db, input);
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(strategySwotItems).values({ id, tenantId: input.tenantId, ...values, createdByUserId: input.userId });
    await audit(tx, input, "strategy_swot.created", "strategy_swot_item", id, { kind: values.kind, competitorId: values.competitorId, assumptionId: values.assumptionId });
  });
  return { id };
}

export async function updateStrategySwot(input: Caller & { swotId: string; archived?: boolean } & SwotFields) {
  const db = await authorized(input, "strategy.manage");
  const values = swotValues(input);
  const [row] = await db.select().from(strategySwotItems).where(and(eq(strategySwotItems.id, input.swotId), eq(strategySwotItems.tenantId, input.tenantId))).limit(1);
  if (!row) throw fail("NOT_FOUND", "PROJECT_OS_STRATEGY_SWOT_NOT_FOUND");
  await assertLinks(db, input);
  await db.transaction(async tx => {
    await tx.update(strategySwotItems).set({ ...values, archived: input.archived ?? row.archived }).where(and(eq(strategySwotItems.id, row.id), eq(strategySwotItems.tenantId, input.tenantId)));
    await audit(tx, input, input.archived && !row.archived ? "strategy_swot.archived" : "strategy_swot.updated", "strategy_swot_item", row.id, { kind: values.kind });
  });
  return { id: row.id };
}
