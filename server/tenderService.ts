// Tenders before award (work order 5, item 8): packages, the invitation list, bid entry, levelling and the award. Every function checks the tenant,
// the project and the named permission BEFORE it reads or writes, every query filters on tenant AND project, and every write leaves an audit row in
// the same transaction. The comparison arithmetic is domain/tenders.ts.
//
// Separation of duties is a rule about PEOPLE as well as powers: whoever entered any bid of a package cannot award it, even if they hold both
// powers (the company owner does). The award creates the contract and the commitment in the same transaction, or nothing at all.
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { auditLogs, commitments, contracts, suppliers, tenderBidAdjustments, tenderBids, tenderInvitees, tenderPackages } from "../drizzle/schema";
import { assertProjectWithinTenant, getDb, getTenantAccessSnapshot } from "./db";
import { isUniqueViolation, rowsAffected } from "./_core/database";
import { assertTenantAccess } from "./domain/authorization";
import { levelBids, tenderTransitions, type AdjustmentKind, type TenderStatus } from "./domain/tenders";

const refuse = (code: "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT", message: string) => new TRPCError({ code, message });
const isDuplicate = isUniqueViolation;
const duplicateAs = async <T>(work: () => Promise<T>): Promise<T> => { try { return await work(); } catch (error) { if (isDuplicate(error)) throw refuse("CONFLICT", "PROJECT_OS_TENDER_DUPLICATE"); throw error; } };
const mine = <T extends { tenantId: unknown; projectId: unknown }>(table: T, input: { tenantId: string; projectId: string }) => and(eq(table.tenantId as never, input.tenantId), eq(table.projectId as never, input.projectId));

/** The one gate of this module: active membership, licensed PROJECT product, the permission, the project scope, then the project must belong to the tenant. */
export async function assertTenderAccess(input: { userId: number; tenantId: string; projectId: string }, permission: string | readonly string[]) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission, scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  return db;
}

const audit = (tx: { insert: (table: typeof auditLogs) => { values: (row: typeof auditLogs.$inferInsert) => Promise<unknown> } }, input: { userId: number; tenantId: string; projectId: string }, action: string, entityType: string, entityId: string, extra: Record<string, unknown> = {}) =>
  tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action, entityType, entityId, metadata: JSON.stringify({ projectId: input.projectId, ...extra }) });

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
async function loadPackage(db: Db, input: { tenantId: string; projectId: string }, packageId: string) {
  const [row] = await db.select().from(tenderPackages).where(and(mine(tenderPackages, input), eq(tenderPackages.id, packageId))).limit(1);
  if (!row) throw refuse("NOT_FOUND", "PROJECT_OS_TENDER_NOT_FOUND");
  return row;
}
async function loadSupplier(db: Db, tenantId: string, supplierId: string) {
  const [row] = await db.select({ id: suppliers.id, legalName: suppliers.legalName, active: suppliers.active }).from(suppliers).where(and(eq(suppliers.tenantId, tenantId), eq(suppliers.id, supplierId))).limit(1);
  if (!row || !row.active) throw refuse("NOT_FOUND", "PROJECT_OS_TENDER_SUPPLIER_NOT_FOUND");
  return row;
}

// ------------------------------------------------------------------ reads (project.read)

export async function listTenderSuppliers(input: { userId: number; tenantId: string; projectId: string }) {
  const db = await assertTenderAccess(input, "project.read");
  return db.select({ id: suppliers.id, code: suppliers.code, legalName: suppliers.legalName }).from(suppliers).where(and(eq(suppliers.tenantId, input.tenantId), eq(suppliers.active, true))).orderBy(asc(suppliers.legalName)).limit(500);
}

/** The newest packages first, each with its counts and the lowest levelled total, all computed by the database (3,000 packages answer in one pass). */
export async function listTenderPackages(input: { userId: number; tenantId: string; projectId: string; limit?: number; offset?: number }) {
  const db = await assertTenderAccess(input, "project.read");
  const limit = Math.min(Math.max(input.limit ?? 100, 1), 500);
  const rows = await db.select({ id: tenderPackages.id, packageCode: tenderPackages.packageCode, title: tenderPackages.title, status: tenderPackages.status, estimateAmount: tenderPackages.estimateAmount, currency: tenderPackages.currency, closingAt: tenderPackages.closingAt, awardedAt: tenderPackages.awardedAt, awardedContractId: tenderPackages.awardedContractId, createdAt: tenderPackages.createdAt })
    .from(tenderPackages).where(mine(tenderPackages, input)).orderBy(desc(tenderPackages.createdAt), desc(tenderPackages.id)).limit(limit).offset(Math.max(input.offset ?? 0, 0));
  if (!rows.length) return { total: 0, packages: [] as Array<(typeof rows)[number] & { invitees: number; bids: number; lowestLevelled: number | null }> };
  const ids = rows.map(row => row.id);
  const adjustmentSums = db.select({ bidId: tenderBidAdjustments.bidId, total: sql<string>`sum(${tenderBidAdjustments.amount})`.as("total") }).from(tenderBidAdjustments).where(and(mine(tenderBidAdjustments, input), inArray(tenderBidAdjustments.packageId, ids))).groupBy(tenderBidAdjustments.bidId).as("adjustment_sums");
  const [total, invitees, bids] = await Promise.all([
    db.select({ total: sql<number>`count(*)` }).from(tenderPackages).where(mine(tenderPackages, input)),
    db.select({ packageId: tenderInvitees.packageId, total: sql<number>`count(*)` }).from(tenderInvitees).where(and(mine(tenderInvitees, input), inArray(tenderInvitees.packageId, ids))).groupBy(tenderInvitees.packageId),
    // The lowest levelled total of the bids that can still win: the bid plus its adjustments, per package. The adjustments are summed ONCE per bid in a
    // derived table and joined, instead of asking for the sum row by row: the first version (a correlated sub-select) took 32 s on its first call after a
    // bulk load, while the optimiser's statistics were still those of an empty table; the join does not depend on them being fresh.
    db.select({ packageId: tenderBids.packageId, total: sql<number>`count(*)`, lowest: sql<string | null>`min(${tenderBids.amount} + coalesce(${adjustmentSums.total}, 0))` }).from(tenderBids).leftJoin(adjustmentSums, eq(adjustmentSums.bidId, tenderBids.id)).where(and(mine(tenderBids, input), inArray(tenderBids.packageId, ids), eq(tenderBids.status, "submitted"))).groupBy(tenderBids.packageId),
  ]);
  const inviteeCount = new Map(invitees.map(row => [row.packageId, Number(row.total)]));
  const bidInfo = new Map(bids.map(row => [row.packageId, { total: Number(row.total), lowest: row.lowest === null ? null : Number(row.lowest) }]));
  return { total: Number(total[0]?.total ?? 0), packages: rows.map(row => ({ ...row, invitees: inviteeCount.get(row.id) ?? 0, bids: bidInfo.get(row.id)?.total ?? 0, lowestLevelled: bidInfo.get(row.id)?.lowest ?? null })) };
}

export async function listTenderInvitees(input: { userId: number; tenantId: string; projectId: string; packageId: string }) {
  const db = await assertTenderAccess(input, "project.read");
  await loadPackage(db, input, input.packageId);
  return db.select({ id: tenderInvitees.id, supplierId: tenderInvitees.supplierId, supplierName: suppliers.legalName, status: tenderInvitees.status, invitedAt: tenderInvitees.invitedAt })
    .from(tenderInvitees).innerJoin(suppliers, eq(tenderInvitees.supplierId, suppliers.id)).where(and(mine(tenderInvitees, input), eq(tenderInvitees.packageId, input.packageId))).orderBy(asc(suppliers.legalName));
}

/** The comparison: every bid of the package with its adjustments, levelled, ranked and flagged (domain/tenders.ts). */
export async function getTenderComparison(input: { userId: number; tenantId: string; projectId: string; packageId: string }) {
  const db = await assertTenderAccess(input, "project.read");
  const tender = await loadPackage(db, input, input.packageId);
  const [bids, adjustments] = await Promise.all([
    db.select({ id: tenderBids.id, supplierId: tenderBids.supplierId, supplierName: suppliers.legalName, status: tenderBids.status, statusReason: tenderBids.statusReason, amount: tenderBids.amount, currency: tenderBids.currency, durationDays: tenderBids.durationDays, validityDays: tenderBids.validityDays, notes: tenderBids.notes, enteredAt: tenderBids.enteredAt })
      .from(tenderBids).innerJoin(suppliers, eq(tenderBids.supplierId, suppliers.id)).where(and(mine(tenderBids, input), eq(tenderBids.packageId, input.packageId))),
    db.select({ id: tenderBidAdjustments.id, bidId: tenderBidAdjustments.bidId, kind: tenderBidAdjustments.kind, description: tenderBidAdjustments.description, amount: tenderBidAdjustments.amount, createdAt: tenderBidAdjustments.createdAt }).from(tenderBidAdjustments).where(and(mine(tenderBidAdjustments, input), eq(tenderBidAdjustments.packageId, input.packageId))).orderBy(asc(tenderBidAdjustments.createdAt)),
  ]);
  const levelled = levelBids(bids, adjustments, tender.estimateAmount);
  const detail = new Map(bids.map(bid => [bid.id, bid]));
  return {
    package: { id: tender.id, packageCode: tender.packageCode, title: tender.title, status: tender.status, estimateAmount: tender.estimateAmount === null ? null : Number(tender.estimateAmount), currency: tender.currency, awardedBidId: tender.awardedBidId, awardedContractId: tender.awardedContractId, awardedCommitmentId: tender.awardedCommitmentId, awardJustification: tender.awardJustification },
    lowest: levelled.lowest, median: levelled.median, comparable: levelled.comparable,
    bids: levelled.bids.map(bid => ({ ...bid, currency: detail.get(bid.id)!.currency, validityDays: detail.get(bid.id)!.validityDays, notes: detail.get(bid.id)!.notes, statusReason: detail.get(bid.id)!.statusReason, adjustmentLines: adjustments.filter(item => item.bidId === bid.id).map(item => ({ id: item.id, kind: item.kind, description: item.description, amount: Number(item.amount) })) })),
  };
}

// ------------------------------------------------------------------ packages and invitations (project.tender.manage)

export async function createTenderPackage(input: { userId: number; tenantId: string; projectId: string; packageCode: string; title: string; scopeSummary?: string; estimateAmount?: number; currency: string; closingAt?: Date }) {
  const db = await assertTenderAccess(input, "project.tender.manage");
  const id = crypto.randomUUID();
  await duplicateAs(() => db.transaction(async tx => {
    await tx.insert(tenderPackages).values({ id, tenantId: input.tenantId, projectId: input.projectId, packageCode: input.packageCode, title: input.title, scopeSummary: input.scopeSummary, estimateAmount: input.estimateAmount === undefined ? undefined : String(input.estimateAmount), currency: input.currency, closingAt: input.closingAt, createdByUserId: input.userId });
    await audit(tx, input, "tender.package_created", "tender_package", id, { packageCode: input.packageCode, estimateAmount: input.estimateAmount ?? null });
  }));
  return { id, status: "draft" as const };
}

export async function inviteTenderSupplier(input: { userId: number; tenantId: string; projectId: string; packageId: string; supplierId: string }) {
  const db = await assertTenderAccess(input, "project.tender.manage");
  const tender = await loadPackage(db, input, input.packageId);
  if (tender.status !== "draft" && tender.status !== "open") throw refuse("CONFLICT", "PROJECT_OS_TENDER_INVITATION_CLOSED");
  const supplier = await loadSupplier(db, input.tenantId, input.supplierId);
  const id = crypto.randomUUID();
  await duplicateAs(() => db.transaction(async tx => {
    await tx.insert(tenderInvitees).values({ id, tenantId: input.tenantId, projectId: input.projectId, packageId: input.packageId, supplierId: input.supplierId, invitedByUserId: input.userId });
    await audit(tx, input, "tender.supplier_invited", "tender_package", input.packageId, { packageCode: tender.packageCode, supplierId: supplier.id, supplierName: supplier.legalName });
  }));
  return { id, status: "invited" as const };
}

/** draft → open (needs at least one invitee) · open → closed · closed → open (a late bidder) · cancel before an award. The award itself is awardTender. */
export async function transitionTenderPackage(input: { userId: number; tenantId: string; projectId: string; packageId: string; nextStatus: "open" | "closed" | "cancelled" }) {
  const db = await assertTenderAccess(input, "project.tender.manage");
  const tender = await loadPackage(db, input, input.packageId);
  if (!tenderTransitions[tender.status].includes(input.nextStatus as TenderStatus)) throw refuse("BAD_REQUEST", "PROJECT_OS_TENDER_TRANSITION_INVALID");
  if (input.nextStatus === "open" && tender.status === "draft") {
    const [invited] = await db.select({ total: sql<number>`count(*)` }).from(tenderInvitees).where(and(mine(tenderInvitees, input), eq(tenderInvitees.packageId, input.packageId)));
    if (Number(invited?.total ?? 0) === 0) throw refuse("CONFLICT", "PROJECT_OS_TENDER_NO_INVITEES");
  }
  await db.transaction(async tx => {
    await tx.update(tenderPackages).set({ status: input.nextStatus }).where(and(mine(tenderPackages, input), eq(tenderPackages.id, input.packageId)));
    await audit(tx, input, "tender.package_status_transitioned", "tender_package", input.packageId, { packageCode: tender.packageCode, previousStatus: tender.status, nextStatus: input.nextStatus });
  });
  return { id: input.packageId, previousStatus: tender.status, status: input.nextStatus };
}

// ------------------------------------------------------------------ bids (project.tender.bids)

export async function enterTenderBid(input: { userId: number; tenantId: string; projectId: string; packageId: string; supplierId: string; amount: number; currency?: string; durationDays?: number; validityDays?: number; notes?: string }) {
  const db = await assertTenderAccess(input, "project.tender.bids");
  const tender = await loadPackage(db, input, input.packageId);
  if (tender.status !== "open") throw refuse("CONFLICT", "PROJECT_OS_TENDER_NOT_OPEN");
  const [invitee] = await db.select({ id: tenderInvitees.id }).from(tenderInvitees).where(and(mine(tenderInvitees, input), eq(tenderInvitees.packageId, input.packageId), eq(tenderInvitees.supplierId, input.supplierId))).limit(1);
  if (!invitee) throw refuse("CONFLICT", "PROJECT_OS_TENDER_NOT_INVITED");
  const id = crypto.randomUUID();
  try {
    await db.transaction(async tx => {
      await tx.insert(tenderBids).values({ id, tenantId: input.tenantId, projectId: input.projectId, packageId: input.packageId, supplierId: input.supplierId, amount: String(input.amount), currency: input.currency ?? tender.currency, durationDays: input.durationDays, validityDays: input.validityDays, notes: input.notes, enteredByUserId: input.userId });
      await tx.update(tenderInvitees).set({ status: "submitted" }).where(eq(tenderInvitees.id, invitee.id));
      await audit(tx, input, "tender.bid_entered", "tender_bid", id, { packageId: input.packageId, packageCode: tender.packageCode, supplierId: input.supplierId, amount: input.amount });
    });
  } catch (error) { if (isDuplicate(error)) throw refuse("CONFLICT", "PROJECT_OS_TENDER_BID_EXISTS"); throw error; }
  return { id, status: "submitted" as const };
}

/** Correct a submitted bid while the tender is still open (price, duration, validity, notes). */
export async function reviseTenderBid(input: { userId: number; tenantId: string; projectId: string; bidId: string; amount: number; durationDays?: number; validityDays?: number; notes?: string }) {
  const db = await assertTenderAccess(input, "project.tender.bids");
  const [bid] = await db.select().from(tenderBids).where(and(mine(tenderBids, input), eq(tenderBids.id, input.bidId))).limit(1);
  if (!bid) throw refuse("NOT_FOUND", "PROJECT_OS_TENDER_BID_NOT_FOUND");
  const tender = await loadPackage(db, input, bid.packageId);
  if (tender.status !== "open") throw refuse("CONFLICT", "PROJECT_OS_TENDER_NOT_OPEN");
  if (bid.status !== "submitted") throw refuse("CONFLICT", "PROJECT_OS_TENDER_BID_STATE_INVALID");
  await db.transaction(async tx => {
    await tx.update(tenderBids).set({ amount: String(input.amount), durationDays: input.durationDays ?? null, validityDays: input.validityDays ?? null, notes: input.notes ?? null }).where(and(mine(tenderBids, input), eq(tenderBids.id, input.bidId)));
    await audit(tx, input, "tender.bid_revised", "tender_bid", input.bidId, { packageCode: tender.packageCode, previousAmount: Number(bid.amount), amount: input.amount });
  });
  return { id: input.bidId, status: "submitted" as const };
}

/** The bidder pulls out (the one who entered bids records it, while the tender is open). */
export async function withdrawTenderBid(input: { userId: number; tenantId: string; projectId: string; bidId: string; reason?: string }) {
  const db = await assertTenderAccess(input, "project.tender.bids");
  const [bid] = await db.select().from(tenderBids).where(and(mine(tenderBids, input), eq(tenderBids.id, input.bidId))).limit(1);
  if (!bid) throw refuse("NOT_FOUND", "PROJECT_OS_TENDER_BID_NOT_FOUND");
  const tender = await loadPackage(db, input, bid.packageId);
  if (tender.status !== "open") throw refuse("CONFLICT", "PROJECT_OS_TENDER_NOT_OPEN");
  if (bid.status !== "submitted") throw refuse("CONFLICT", "PROJECT_OS_TENDER_BID_STATE_INVALID");
  await db.transaction(async tx => {
    await tx.update(tenderBids).set({ status: "withdrawn", statusReason: input.reason ?? null }).where(and(mine(tenderBids, input), eq(tenderBids.id, input.bidId)));
    await audit(tx, input, "tender.bid_withdrawn", "tender_bid", input.bidId, { packageCode: tender.packageCode, supplierId: bid.supplierId });
  });
  return { id: input.bidId, status: "withdrawn" as const };
}

// ------------------------------------------------------------------ levelling (project.tender.level)

export async function disqualifyTenderBid(input: { userId: number; tenantId: string; projectId: string; bidId: string; reason: string }) {
  const db = await assertTenderAccess(input, "project.tender.level");
  const [bid] = await db.select().from(tenderBids).where(and(mine(tenderBids, input), eq(tenderBids.id, input.bidId))).limit(1);
  if (!bid) throw refuse("NOT_FOUND", "PROJECT_OS_TENDER_BID_NOT_FOUND");
  const tender = await loadPackage(db, input, bid.packageId);
  if (tender.status !== "closed") throw refuse("CONFLICT", "PROJECT_OS_TENDER_NOT_CLOSED");
  if (bid.status !== "submitted") throw refuse("CONFLICT", "PROJECT_OS_TENDER_BID_STATE_INVALID");
  if (!input.reason.trim()) throw refuse("BAD_REQUEST", "PROJECT_OS_TENDER_REASON_REQUIRED");
  await db.transaction(async tx => {
    await tx.update(tenderBids).set({ status: "disqualified", statusReason: input.reason.trim() }).where(and(mine(tenderBids, input), eq(tenderBids.id, input.bidId)));
    await audit(tx, input, "tender.bid_disqualified", "tender_bid", input.bidId, { packageCode: tender.packageCode, supplierId: bid.supplierId, reason: input.reason.trim() });
  });
  return { id: input.bidId, status: "disqualified" as const };
}

export async function addTenderBidAdjustment(input: { userId: number; tenantId: string; projectId: string; bidId: string; kind: AdjustmentKind; description: string; amount: number }) {
  const db = await assertTenderAccess(input, "project.tender.level");
  const [bid] = await db.select().from(tenderBids).where(and(mine(tenderBids, input), eq(tenderBids.id, input.bidId))).limit(1);
  if (!bid) throw refuse("NOT_FOUND", "PROJECT_OS_TENDER_BID_NOT_FOUND");
  const tender = await loadPackage(db, input, bid.packageId);
  if (tender.status !== "closed") throw refuse("CONFLICT", "PROJECT_OS_TENDER_NOT_CLOSED");
  if (bid.status !== "submitted") throw refuse("CONFLICT", "PROJECT_OS_TENDER_BID_STATE_INVALID");
  // a discount only ever lowers the bid and a scope gap or exclusion only ever raises it; a correction may go either way
  if ((input.kind === "discount" && input.amount > 0) || ((input.kind === "scope_gap" || input.kind === "exclusion") && input.amount < 0)) throw refuse("BAD_REQUEST", "PROJECT_OS_TENDER_ADJUSTMENT_SIGN");
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(tenderBidAdjustments).values({ id, tenantId: input.tenantId, projectId: input.projectId, packageId: bid.packageId, bidId: input.bidId, kind: input.kind, description: input.description, amount: String(input.amount), createdByUserId: input.userId });
    await audit(tx, input, "tender.adjustment_added", "tender_bid", input.bidId, { packageCode: tender.packageCode, kind: input.kind, amount: input.amount });
  });
  return { id };
}

export async function removeTenderBidAdjustment(input: { userId: number; tenantId: string; projectId: string; adjustmentId: string }) {
  const db = await assertTenderAccess(input, "project.tender.level");
  const [adjustment] = await db.select().from(tenderBidAdjustments).where(and(mine(tenderBidAdjustments, input), eq(tenderBidAdjustments.id, input.adjustmentId))).limit(1);
  if (!adjustment) throw refuse("NOT_FOUND", "PROJECT_OS_TENDER_ADJUSTMENT_NOT_FOUND");
  const tender = await loadPackage(db, input, adjustment.packageId);
  if (tender.status !== "closed") throw refuse("CONFLICT", "PROJECT_OS_TENDER_NOT_CLOSED");
  await db.transaction(async tx => {
    await tx.delete(tenderBidAdjustments).where(and(mine(tenderBidAdjustments, input), eq(tenderBidAdjustments.id, input.adjustmentId)));
    await audit(tx, input, "tender.adjustment_removed", "tender_bid", adjustment.bidId, { packageCode: tender.packageCode, kind: adjustment.kind, amount: Number(adjustment.amount) });
  });
  return { id: input.adjustmentId };
}

// ------------------------------------------------------------------ award (project.tender.award)

/**
 * The award. The tender must be closed; the bid must be one that can still win; the person awarding must not have entered any bid of the package
 * (whatever powers they hold); with fewer than two comparable bids a written justification is required. In ONE transaction it creates the contract
 * (value = the levelled total, counterparty = the supplier from the register), the commitment on it (committed now), and marks the package awarded.
 */
export async function awardTender(input: { userId: number; tenantId: string; projectId: string; packageId: string; bidId: string; contractCode: string; justification?: string }) {
  const db = await assertTenderAccess(input, "project.tender.award");
  const tender = await loadPackage(db, input, input.packageId);
  if (tender.status !== "closed") throw refuse("CONFLICT", "PROJECT_OS_TENDER_NOT_CLOSED");
  const bids = await db.select({ id: tenderBids.id, supplierId: tenderBids.supplierId, supplierName: suppliers.legalName, status: tenderBids.status, amount: tenderBids.amount, currency: tenderBids.currency, durationDays: tenderBids.durationDays, enteredByUserId: tenderBids.enteredByUserId })
    .from(tenderBids).innerJoin(suppliers, eq(tenderBids.supplierId, suppliers.id)).where(and(mine(tenderBids, input), eq(tenderBids.packageId, input.packageId)));
  const winner = bids.find(bid => bid.id === input.bidId);
  if (!winner) throw refuse("NOT_FOUND", "PROJECT_OS_TENDER_BID_NOT_FOUND");
  if (winner.status !== "submitted") throw refuse("CONFLICT", "PROJECT_OS_TENDER_BID_NOT_ELIGIBLE");
  if (bids.some(bid => bid.enteredByUserId === input.userId)) throw refuse("CONFLICT", "PROJECT_OS_TENDER_SELF_AWARD");
  const adjustments = await db.select({ bidId: tenderBidAdjustments.bidId, amount: tenderBidAdjustments.amount }).from(tenderBidAdjustments).where(and(mine(tenderBidAdjustments, input), eq(tenderBidAdjustments.packageId, input.packageId)));
  const levelled = levelBids(bids, adjustments, tender.estimateAmount);
  if (levelled.comparable < 2 && (input.justification ?? "").trim().length < 10) throw refuse("BAD_REQUEST", "PROJECT_OS_TENDER_JUSTIFICATION_REQUIRED");
  const value = levelled.bids.find(bid => bid.id === winner.id)!.levelledTotal;
  const contractId = crypto.randomUUID();
  const commitmentId = crypto.randomUUID();
  const now = new Date();
  await duplicateAs(() => db.transaction(async tx => {
    await tx.insert(contracts).values({ id: contractId, tenantId: input.tenantId, projectId: input.projectId, code: input.contractCode, title: tender.title, counterparty: winner.supplierName, counterpartyKind: "supplier", supplierId: winner.supplierId, contractValue: String(value), currency: winner.currency, status: "draft" });
    await tx.insert(commitments).values({ id: commitmentId, tenantId: input.tenantId, projectId: input.projectId, contractId, code: `${input.contractCode}-C1`, description: `Tender award ${tender.packageCode}`, amount: String(value), currency: winner.currency, status: "committed", committedAt: now });
    // the status is part of the condition: two people awarding the same package at once cannot both win, the second finds it no longer closed and the whole transaction (contract and commitment included) is undone
    const header = await tx.update(tenderPackages).set({ status: "awarded", awardedBidId: winner.id, awardedContractId: contractId, awardedCommitmentId: commitmentId, awardedAt: now, awardedByUserId: input.userId, awardJustification: input.justification?.trim() || null }).where(and(mine(tenderPackages, input), eq(tenderPackages.id, input.packageId), eq(tenderPackages.status, "closed")));
    if (rowsAffected(header) !== 1) throw refuse("CONFLICT", "PROJECT_OS_TENDER_NOT_CLOSED");
    await audit(tx, input, "tender.awarded", "tender_package", input.packageId, { packageCode: tender.packageCode, bidId: winner.id, supplierId: winner.supplierId, levelledTotal: value, contractId, commitmentId, comparableBids: levelled.comparable, justified: Boolean(input.justification?.trim()) });
    await audit(tx, input, "project.contract_created", "contract", contractId, { code: input.contractCode, contractValue: value, source: "tender_award", packageId: input.packageId });
    await audit(tx, input, "project.commitment_created", "commitment", commitmentId, { contractId, amount: value, source: "tender_award", packageId: input.packageId });
  }));
  return { packageId: input.packageId, contractId, commitmentId, value, currency: winner.currency, status: "awarded" as const };
}
