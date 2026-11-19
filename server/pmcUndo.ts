// Q-44 (adviser 18-11, docs/proposals/undo.md §2): «undo the last save», for two operations only — a «progress update» batch and a «QC receipt» batch.
//  - who: the person who saved it, alone, with the permission they saved it with, on the same project;
//  - when: within 15 minutes of the save, by the server's clock;
//  - how: NEVER a delete — a new save puts every cell of the batch back to what it was before, with its own history rows (noted `undo <batchId>`) and audit row;
//    the original rows stay as they are (append-only);
//  - refused whole when any cell of the batch changed after it (another save, a daily report's approval, a QC receipt on it) — the villas are named — and
//    once undone, a batch is not undone again (and an undo is not itself undone: save again instead).
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gt, inArray, isNotNull, lt, ne, sql } from "drizzle-orm";
import { auditLogs, pmcQcReceiptEvents, pmcQcReceipts, pmcUnitActivityHistory, pmcUnitActivityProgress, pmcUnits } from "../drizzle/schema";
import { applyCellStatus, authorize, type Scope } from "./pmcService";
import { villaKey } from "./wo22Shared";

export const UNDO_WINDOW_MINUTES = 15;
type Db = Awaited<ReturnType<typeof authorize>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
const refuse = (code: "BAD_REQUEST" | "FORBIDDEN" | "NOT_FOUND" | "CONFLICT", message: string, cause?: unknown) => new TRPCError({ code, message, cause });

/** The batch's audit row, checked against the three rules that do not need the cells: it exists on this project, it is the caller's, it is recent. */
async function batchOf(tx: Tx, input: Scope & { batchId: string }, saved: string, undone: string) {
  // one undo of a batch at a time: a second request waits here and then finds the first one's audit row
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`undo:${input.batchId}`}))`);
  const [row] = await tx.select({ id: auditLogs.id, actorUserId: auditLogs.actorUserId, createdAt: auditLogs.createdAt }).from(auditLogs)
    .where(and(eq(auditLogs.tenantId, input.tenantId), eq(auditLogs.action, saved), eq(auditLogs.entityId, input.projectId), sql`(${auditLogs.metadata})::jsonb ->> 'batchId' = ${input.batchId}`)).limit(1);
  if (!row) throw refuse("NOT_FOUND", "PROJECT_OS_UNDO_BATCH_NOT_FOUND");
  if (row.actorUserId !== input.userId) throw refuse("FORBIDDEN", "PROJECT_OS_UNDO_NOT_YOURS");
  if (Date.now() - row.createdAt.getTime() > UNDO_WINDOW_MINUTES * 60_000) throw refuse("BAD_REQUEST", "PROJECT_OS_UNDO_EXPIRED");
  const [already] = await tx.select({ id: auditLogs.id }).from(auditLogs)
    .where(and(eq(auditLogs.tenantId, input.tenantId), eq(auditLogs.action, undone), eq(auditLogs.entityId, input.projectId), sql`(${auditLogs.metadata})::jsonb ->> 'batchId' = ${input.batchId}`)).limit(1);
  if (already) throw refuse("CONFLICT", "PROJECT_OS_UNDO_ALREADY_DONE");
  return row;
}

async function villaNames(tx: Tx, input: Scope, unitIds: string[]) {
  if (!unitIds.length) return [];
  const units = await tx.select({ unitNumber: pmcUnits.unitNumber, villaLabel: pmcUnits.villaLabel }).from(pmcUnits)
    .where(and(eq(pmcUnits.tenantId, input.tenantId), eq(pmcUnits.projectId, input.projectId), inArray(pmcUnits.id, unitIds)));
  return units.map(unit => villaKey(unit.villaLabel ?? unit.unitNumber)).sort();
}

/** Undo a «progress update» batch (updatePmcProgress): each cell it changed goes back to its status before the batch. */
export async function undoPmcProgressBatch(input: Scope & { batchId: string }) {
  const db = await authorize(input, "project.pmc.update");
  return db.transaction(async tx => {
    const batch = await batchOf(tx, input, "pmc.progress_batch_updated", "pmc.progress_batch_undone");
    const note = `batch ${input.batchId}`;
    const rows = await tx.select({ id: pmcUnitActivityHistory.id, progressId: pmcUnitActivityHistory.unitActivityProgressId, fromStatus: pmcUnitActivityHistory.fromStatus, toStatus: pmcUnitActivityHistory.toStatus, changedAt: pmcUnitActivityHistory.changedAt, changedByUserId: pmcUnitActivityHistory.changedByUserId })
      .from(pmcUnitActivityHistory).where(and(eq(pmcUnitActivityHistory.tenantId, input.tenantId), eq(pmcUnitActivityHistory.projectId, input.projectId), eq(pmcUnitActivityHistory.note, note)));
    const cells = rows.length
      ? await tx.select().from(pmcUnitActivityProgress).where(and(eq(pmcUnitActivityProgress.tenantId, input.tenantId), eq(pmcUnitActivityProgress.projectId, input.projectId), inArray(pmcUnitActivityProgress.id, rows.map(row => row.progressId)))).for("update")
      : [];
    const cellOf = new Map(cells.map(cell => [cell.id, cell]));
    const changedUnits: string[] = [];
    for (const row of rows) {
      const cell = cellOf.get(row.progressId)!;
      // a later write — another save, a report's approval, a verification — moves the cell's status or its last-changed stamp, or leaves a history row
      const moved = cell.status !== row.toStatus || cell.lastChangedByUserId !== row.changedByUserId || cell.lastChangedAt?.getTime() !== row.changedAt.getTime();
      const [later] = moved ? [] : await tx.select({ id: pmcUnitActivityHistory.id }).from(pmcUnitActivityHistory)
        .where(and(eq(pmcUnitActivityHistory.unitActivityProgressId, row.progressId), ne(pmcUnitActivityHistory.id, row.id), sql`${pmcUnitActivityHistory.changedAt} >= ${row.changedAt}`, sql`coalesce(${pmcUnitActivityHistory.note}, '') <> ${note}`)).limit(1);
      const [qcAfter] = moved || later ? [] : await tx.select({ id: pmcQcReceiptEvents.id }).from(pmcQcReceiptEvents).innerJoin(pmcQcReceipts, eq(pmcQcReceipts.id, pmcQcReceiptEvents.receiptId))
        .where(and(eq(pmcQcReceipts.tenantId, input.tenantId), eq(pmcQcReceipts.unitId, cell.unitId), eq(pmcQcReceipts.activityDefinitionId, cell.activityDefinitionId), gt(pmcQcReceiptEvents.changedAt, batch.createdAt))).limit(1);
      if (moved || later || qcAfter) changedUnits.push(cell.unitId);
    }
    if (changedUnits.length) throw refuse("CONFLICT", "PROJECT_OS_UNDO_CELLS_CHANGED", { villas: await villaNames(tx, input, Array.from(new Set(changedUnits))) });
    const now = new Date();
    for (const row of rows) {
      const cell = cellOf.get(row.progressId)!;
      // a cell the batch created had no row before: «not started» is what the progress read counts for a missing row
      await applyCellStatus(tx, { ...input, unitId: cell.unitId, activityDefinitionId: cell.activityDefinitionId, status: row.fromStatus ?? "NOT_STARTED", note: `undo ${input.batchId}` }, now);
    }
    await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.progress_batch_undone", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ batchId: input.batchId, cells: rows.length, savedAuditId: batch.id }) });
    return { batchId: input.batchId, cells: rows.length };
  });
}

/** Undo a «QC receipt» batch (updatePmcQcReceipts): each receipt it changed goes back to what it was before the batch, as a new event. */
export async function undoPmcQcReceiptBatch(input: Scope & { batchId: string }) {
  const db = await authorize(input, "project.qc.receive");
  return db.transaction(async tx => {
    const batch = await batchOf(tx, input, "pmc.qc_receipt_batch_updated", "pmc.qc_receipt_batch_undone");
    const events = await tx.select().from(pmcQcReceiptEvents)
      .where(and(eq(pmcQcReceiptEvents.tenantId, input.tenantId), eq(pmcQcReceiptEvents.projectId, input.projectId), isNotNull(pmcQcReceiptEvents.batchId), eq(pmcQcReceiptEvents.batchId, input.batchId)));
    const receipts = events.length
      ? await tx.select().from(pmcQcReceipts).where(and(eq(pmcQcReceipts.tenantId, input.tenantId), eq(pmcQcReceipts.projectId, input.projectId), inArray(pmcQcReceipts.id, events.map(event => event.receiptId)))).for("update")
      : [];
    const receiptOf = new Map(receipts.map(receipt => [receipt.id, receipt]));
    const changedUnits: string[] = [];
    for (const event of events) {
      const receipt = receiptOf.get(event.receiptId)!;
      // every change of a receipt writes an event, so a later event is the test; updated_at is the database trigger's clock and is not compared
      const moved = receipt.received !== event.toReceived || receipt.receivedOn !== event.receivedOn || receipt.updatedByUserId !== event.changedByUserId;
      const [later] = moved ? [] : await tx.select({ id: pmcQcReceiptEvents.id }).from(pmcQcReceiptEvents)
        .where(and(eq(pmcQcReceiptEvents.receiptId, event.receiptId), ne(pmcQcReceiptEvents.id, event.id), sql`${pmcQcReceiptEvents.changedAt} >= ${event.changedAt}`)).limit(1);
      if (moved || later) changedUnits.push(receipt.unitId);
    }
    if (changedUnits.length) throw refuse("CONFLICT", "PROJECT_OS_UNDO_CELLS_CHANGED", { villas: await villaNames(tx, input, Array.from(new Set(changedUnits))) });
    const now = new Date();
    for (const event of events) {
      const receipt = receiptOf.get(event.receiptId)!;
      // the receipt as it was: the event before this one, if any; a receipt the batch created goes back to «not received» (what a missing receipt counts as)
      const [previous] = await tx.select({ receivedOn: pmcQcReceiptEvents.receivedOn }).from(pmcQcReceiptEvents)
        .where(and(eq(pmcQcReceiptEvents.receiptId, event.receiptId), lt(pmcQcReceiptEvents.changedAt, event.changedAt))).orderBy(desc(pmcQcReceiptEvents.changedAt)).limit(1);
      const received = event.fromReceived ?? false;
      const receivedOn = previous?.receivedOn ?? event.receivedOn;
      await tx.update(pmcQcReceipts).set({ received, receivedOn, updatedByUserId: input.userId, updatedAt: now }).where(eq(pmcQcReceipts.id, receipt.id));
      await tx.insert(pmcQcReceiptEvents).values({ id: randomUUID(), tenantId: input.tenantId, projectId: input.projectId, receiptId: receipt.id, fromReceived: receipt.received, toReceived: received, receivedOn, changedByUserId: input.userId, changedAt: now, batchId: null });
    }
    await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.qc_receipt_batch_undone", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ batchId: input.batchId, receipts: events.length, savedAuditId: batch.id }) });
    return { batchId: input.batchId, receipts: events.length };
  });
}
