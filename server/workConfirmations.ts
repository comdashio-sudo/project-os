// Q-43 (P2-06), batch 2: proof of a subcontractor's work without prices (docs/proposals/subcontractor-progress.md §3–§5).
//   record   project.subcontract.progress.record — prepare a confirmation (lines: unit × activity × percent, or BOQ item × quantity), send it, cancel own
//   approve  project.commitment.manage — approve or reject (with a reason) a sent confirmation; never one this person prepared (separation of duties)
//   read     either of the above, or project.read — the replies carry NO rate, amount or contract value (none exists in these tables)
// Double claims are refused inside one transaction that locks the project row, so two sends cannot both pass: a unit × activity is never confirmed past
// 100% for one subcontract (DUPLICATE, naming the earlier confirmation) nor past 100% across subcontracts (OVER_COMPLETE); a BOQ item is never confirmed past
// its BOQ quantity across subcontracts (OVER_BOQ). Draft, sent and approved confirmations count; cancelled and rejected ones do not.
// Corrections (negative lines), historical lines and pulling into a certificate come in later batches; this one refuses a negative line.
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { auditLogs, boqItems, pmcActivityDefinitions, pmcUnits, subcontractContracts, subcontractWorkConfirmationLines, subcontractWorkConfirmations } from "../drizzle/schema";
import { assertTenantAccess } from "./domain/authorization";
import { assertProjectWithinTenant, getDb, getTenantAccessSnapshot } from "./db";

const RECORD = "project.subcontract.progress.record";
const APPROVE = "project.commitment.manage";
const READ = [RECORD, APPROVE, "project.read"] as const;
const COUNTED = ["draft", "submitted", "approved"] as const;

type Scope = { userId: number; tenantId: string; projectId: string };
export type ConfirmationLine = { kind: "unit"; pmcUnitId: string; pmcActivityDefinitionId: string; percent: number; note?: string | null } | { kind: "quantity"; boqItemId: string; quantity: number; note?: string | null };
const fail = (code: "FORBIDDEN" | "NOT_FOUND" | "CONFLICT" | "BAD_REQUEST", message: string) => new TRPCError({ code, message });

async function authorized(input: Scope, permission: string | readonly string[]) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw fail("FORBIDDEN", "PROJECT_OS_TENANT_ACCESS_DENIED");
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission, scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  return db;
}
type Db = Awaited<ReturnType<typeof authorized>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
const own = <T extends { tenantId: unknown; projectId: unknown }>(table: T, input: Scope) => and(eq(table.tenantId as never, input.tenantId), eq(table.projectId as never, input.projectId));

/** Every unit, activity, BOQ item and the subcontract named must be this project's; a line's figure must be in range. */
async function assertReferences(db: Db | Tx, input: Scope & { subcontractId: string; lines: ConfirmationLine[] }) {
  if (!input.lines.length) throw fail("BAD_REQUEST", "PROJECT_OS_WORK_CONFIRMATION_LINES_REQUIRED");
  const [contract] = await db.select({ id: subcontractContracts.id }).from(subcontractContracts).where(and(eq(subcontractContracts.id, input.subcontractId), own(subcontractContracts, input))).limit(1);
  if (!contract) throw fail("NOT_FOUND", "PROJECT_OS_SUBCONTRACT_NOT_FOUND");
  const units = input.lines.flatMap(line => (line.kind === "unit" ? [line] : [])); const quantities = input.lines.flatMap(line => (line.kind === "quantity" ? [line] : []));
  if (units.some(line => !(line.percent > 0 && line.percent <= 100)) || quantities.some(line => !(line.quantity > 0 && Number.isFinite(line.quantity)))) throw fail("BAD_REQUEST", "PROJECT_OS_WORK_CONFIRMATION_LINE_INVALID");
  const unitIds = Array.from(new Set(units.map(line => line.pmcUnitId))); const activityIds = Array.from(new Set(units.map(line => line.pmcActivityDefinitionId))); const boqIds = Array.from(new Set(quantities.map(line => line.boqItemId)));
  if (unitIds.length && (await db.select({ id: pmcUnits.id }).from(pmcUnits).where(and(own(pmcUnits, input), inArray(pmcUnits.id, unitIds)))).length !== unitIds.length) throw fail("NOT_FOUND", "PROJECT_OS_PMC_UNIT_NOT_FOUND");
  if (activityIds.length && (await db.select({ id: pmcActivityDefinitions.id }).from(pmcActivityDefinitions).where(and(own(pmcActivityDefinitions, input), inArray(pmcActivityDefinitions.id, activityIds)))).length !== activityIds.length) throw fail("NOT_FOUND", "PROJECT_OS_PMC_ACTIVITY_NOT_FOUND");
  if (boqIds.length && (await db.select({ id: boqItems.id }).from(boqItems).where(and(own(boqItems, input), inArray(boqItems.id, boqIds)))).length !== boqIds.length) throw fail("NOT_FOUND", "PROJECT_OS_WORK_CONFIRMATION_BOQ_NOT_FOUND");
}

/** The caps, read under the project lock: what the counted confirmations of this project already claim, plus these lines. */
async function assertCaps(tx: Tx, input: Scope & { subcontractId: string; lines: ConfirmationLine[]; excludeConfirmationId?: string }) {
  await tx.execute(sql`SELECT id FROM projects WHERE id = ${input.projectId} AND tenant_id = ${input.tenantId} FOR UPDATE`);
  const counted = and(own(subcontractWorkConfirmations, input), inArray(subcontractWorkConfirmations.status, [...COUNTED]), input.excludeConfirmationId ? ne(subcontractWorkConfirmations.id, input.excludeConfirmationId) : undefined);
  const existing = await tx.select({
    subcontractId: subcontractWorkConfirmations.subcontractId, kind: subcontractWorkConfirmationLines.kind,
    unitId: subcontractWorkConfirmationLines.pmcUnitId, activityId: subcontractWorkConfirmationLines.pmcActivityDefinitionId, percent: subcontractWorkConfirmationLines.percent,
    boqItemId: subcontractWorkConfirmationLines.boqItemId, quantity: subcontractWorkConfirmationLines.quantity,
  }).from(subcontractWorkConfirmationLines)
    .innerJoin(subcontractWorkConfirmations, and(eq(subcontractWorkConfirmations.id, subcontractWorkConfirmationLines.confirmationId), eq(subcontractWorkConfirmations.tenantId, subcontractWorkConfirmationLines.tenantId)))
    .where(counted);
  const mine = new Map<string, { total: number }>(); const all = new Map<string, number>(); const boq = new Map<string, number>();
  const add = (subcontractId: string, line: { kind: string; unitId?: string | null; activityId?: string | null; percent?: number; boqItemId?: string | null; quantity?: number }) => {
    if (line.kind === "unit") {
      const cell = `${line.unitId}|${line.activityId}`;
      all.set(cell, (all.get(cell) ?? 0) + (line.percent ?? 0));
      if (subcontractId === input.subcontractId) mine.set(cell, { total: (mine.get(cell)?.total ?? 0) + (line.percent ?? 0) });
    } else if (line.boqItemId) boq.set(line.boqItemId, (boq.get(line.boqItemId) ?? 0) + (line.quantity ?? 0));
  };
  for (const row of existing) add(row.subcontractId, { kind: row.kind, unitId: row.unitId, activityId: row.activityId, percent: Number(row.percent ?? 0), boqItemId: row.boqItemId, quantity: Number(row.quantity ?? 0) });
  for (const line of input.lines) add(input.subcontractId, line.kind === "unit" ? { kind: "unit", unitId: line.pmcUnitId, activityId: line.pmcActivityDefinitionId, percent: line.percent } : { kind: "quantity", boqItemId: line.boqItemId, quantity: line.quantity });
  const over = (value: number, cap: number) => value > cap + 1e-9;
  for (const entry of Array.from(mine.values())) if (over(entry.total, 100)) throw fail("CONFLICT", "PROJECT_OS_WORK_CONFIRMATION_DUPLICATE");
  for (const [, total] of Array.from(all)) if (over(total, 100)) throw fail("CONFLICT", "PROJECT_OS_WORK_CONFIRMATION_OVER_COMPLETE");
  if (boq.size) {
    const caps = await tx.select({ id: boqItems.id, quantity: boqItems.quantity }).from(boqItems).where(and(own(boqItems, input), inArray(boqItems.id, Array.from(boq.keys()))));
    for (const cap of caps) if (over(boq.get(cap.id) ?? 0, Number(cap.quantity))) throw fail("CONFLICT", "PROJECT_OS_WORK_CONFIRMATION_OVER_BOQ");
  }
}

const lineRows = (input: Scope, confirmationId: string, lines: ConfirmationLine[]) => lines.map(line => ({
  id: crypto.randomUUID(), tenantId: input.tenantId, projectId: input.projectId, confirmationId, kind: line.kind, note: line.note?.trim() || null,
  ...(line.kind === "unit" ? { pmcUnitId: line.pmcUnitId, pmcActivityDefinitionId: line.pmcActivityDefinitionId, percent: line.percent.toFixed(3) } : { boqItemId: line.boqItemId, quantity: line.quantity.toFixed(3) }),
}));
const audit = (tx: Tx, input: Scope, action: string, id: string, metadata: Record<string, unknown>) =>
  tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action, entityType: "work_confirmation", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, ...metadata }) });

export async function createWorkConfirmation(input: Scope & { subcontractId: string; confirmationNumber: string; periodStart: string; periodEnd: string; note?: string | null; lines: ConfirmationLine[] }) {
  const db = await authorized(input, RECORD);
  if (input.periodEnd < input.periodStart) throw fail("BAD_REQUEST", "PROJECT_OS_WORK_CONFIRMATION_PERIOD_INVALID");
  await assertReferences(db, input);
  const [same] = await db.select({ id: subcontractWorkConfirmations.id }).from(subcontractWorkConfirmations).where(and(own(subcontractWorkConfirmations, input), eq(subcontractWorkConfirmations.confirmationNumber, input.confirmationNumber))).limit(1);
  if (same) throw fail("CONFLICT", "PROJECT_OS_WORK_CONFIRMATION_NUMBER_EXISTS");
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    await assertCaps(tx, input);
    await tx.insert(subcontractWorkConfirmations).values({ id, tenantId: input.tenantId, projectId: input.projectId, subcontractId: input.subcontractId, confirmationNumber: input.confirmationNumber, periodStart: input.periodStart, periodEnd: input.periodEnd, note: input.note?.trim() || null, preparedByUserId: input.userId });
    await tx.insert(subcontractWorkConfirmationLines).values(lineRows(input, id, input.lines));
    await audit(tx, input, "work_confirmation.created", id, { subcontractId: input.subcontractId, number: input.confirmationNumber, lines: input.lines.length });
  });
  return { id, status: "draft" as const };
}

/** The confirmation and its lines, locked, of this project only. */
async function loadConfirmation(tx: Tx, input: Scope & { confirmationId: string }) {
  await tx.execute(sql`SELECT id FROM subcontract_work_confirmations WHERE id = ${input.confirmationId} AND tenant_id = ${input.tenantId} FOR UPDATE`);
  const [row] = await tx.select().from(subcontractWorkConfirmations).where(and(eq(subcontractWorkConfirmations.id, input.confirmationId), own(subcontractWorkConfirmations, input))).limit(1);
  if (!row) throw fail("NOT_FOUND", "PROJECT_OS_WORK_CONFIRMATION_NOT_FOUND");
  const lines = await tx.select().from(subcontractWorkConfirmationLines).where(and(eq(subcontractWorkConfirmationLines.confirmationId, row.id), own(subcontractWorkConfirmationLines, input)));
  const asInput = lines.map((line): ConfirmationLine => (line.kind === "unit" ? { kind: "unit", pmcUnitId: line.pmcUnitId!, pmcActivityDefinitionId: line.pmcActivityDefinitionId!, percent: Number(line.percent) } : { kind: "quantity", boqItemId: line.boqItemId!, quantity: Number(line.quantity) }));
  return { row, lines: asInput };
}

/** draft → submitted (the preparer); submitted → approved | rejected (a commitments manager who did not prepare it); draft | submitted → cancelled (the preparer or a commitments manager). */
export async function transitionWorkConfirmation(input: Scope & { confirmationId: string; nextStatus: "submitted" | "approved" | "rejected" | "cancelled"; reason?: string | null }) {
  const db = await authorized(input, input.nextStatus === "approved" || input.nextStatus === "rejected" ? APPROVE : [RECORD, APPROVE]);
  if (input.nextStatus === "rejected" && !input.reason?.trim()) throw fail("BAD_REQUEST", "PROJECT_OS_WORK_CONFIRMATION_REASON_REQUIRED");
  const snapshot = (await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId }))!;
  const approver = snapshot.grants.some(grant => grant.code === APPROVE && (grant.scopeType === "company" || grant.scopeId === input.projectId));
  return db.transaction(async tx => {
    const { row, lines } = await loadConfirmation(tx, input);
    const allowed = { submitted: ["draft"], approved: ["submitted"], rejected: ["submitted"], cancelled: ["draft", "submitted"] }[input.nextStatus];
    if (!allowed.includes(row.status)) throw fail("CONFLICT", "PROJECT_OS_WORK_CONFIRMATION_TRANSITION_INVALID");
    const preparer = row.preparedByUserId === input.userId;
    if (input.nextStatus === "submitted" && !preparer) throw fail("FORBIDDEN", "PROJECT_OS_PERMISSION_DENIED");
    if (input.nextStatus === "cancelled" && !preparer && !approver) throw fail("FORBIDDEN", "PROJECT_OS_PERMISSION_DENIED");
    if ((input.nextStatus === "approved" || input.nextStatus === "rejected") && preparer) throw fail("FORBIDDEN", "PROJECT_OS_WORK_CONFIRMATION_SELF_APPROVAL");
    if (input.nextStatus === "submitted" || input.nextStatus === "approved") await assertCaps(tx, { ...input, subcontractId: row.subcontractId, lines, excludeConfirmationId: row.id });
    const reviewed = input.nextStatus === "approved" || input.nextStatus === "rejected";
    await tx.update(subcontractWorkConfirmations).set({
      status: input.nextStatus, ...(input.nextStatus === "submitted" ? { submittedAt: new Date() } : {}),
      ...(reviewed ? { reviewedByUserId: input.userId, reviewedAt: new Date(), rejectionReason: input.nextStatus === "rejected" ? input.reason!.trim() : null } : {}),
    }).where(and(eq(subcontractWorkConfirmations.id, row.id), own(subcontractWorkConfirmations, input)));
    await audit(tx, input, `work_confirmation.${input.nextStatus}`, row.id, { from: row.status, reason: input.reason?.trim() || null });
    return { id: row.id, status: input.nextStatus };
  });
}

/** The project's confirmations with their lines, named by unit, activity and BOQ item. No rate, amount or contract value is read or returned. */
export async function listWorkConfirmations(input: Scope & { subcontractId?: string }) {
  const db = await authorized(input, READ);
  const headers = await db.select({
    id: subcontractWorkConfirmations.id, number: subcontractWorkConfirmations.confirmationNumber, subcontractId: subcontractWorkConfirmations.subcontractId, subcontractCode: subcontractContracts.code,
    subcontractorName: subcontractContracts.subcontractorName, periodStart: subcontractWorkConfirmations.periodStart, periodEnd: subcontractWorkConfirmations.periodEnd, status: subcontractWorkConfirmations.status,
    rejectionReason: subcontractWorkConfirmations.rejectionReason, note: subcontractWorkConfirmations.note, preparedByUserId: subcontractWorkConfirmations.preparedByUserId, reviewedByUserId: subcontractWorkConfirmations.reviewedByUserId,
  }).from(subcontractWorkConfirmations)
    .innerJoin(subcontractContracts, and(eq(subcontractContracts.id, subcontractWorkConfirmations.subcontractId), eq(subcontractContracts.tenantId, subcontractWorkConfirmations.tenantId)))
    .where(and(own(subcontractWorkConfirmations, input), input.subcontractId ? eq(subcontractWorkConfirmations.subcontractId, input.subcontractId) : undefined))
    .orderBy(desc(subcontractWorkConfirmations.createdAt));
  if (!headers.length) return [];
  const lines = await db.select({
    id: subcontractWorkConfirmationLines.id, confirmationId: subcontractWorkConfirmationLines.confirmationId, kind: subcontractWorkConfirmationLines.kind, percent: subcontractWorkConfirmationLines.percent,
    quantity: subcontractWorkConfirmationLines.quantity, note: subcontractWorkConfirmationLines.note, unitNumber: pmcUnits.unitNumber, activityCode: pmcActivityDefinitions.code, activityName: pmcActivityDefinitions.name,
    boqCode: boqItems.code, unitOfMeasure: boqItems.unitOfMeasure,
  }).from(subcontractWorkConfirmationLines)
    .leftJoin(pmcUnits, and(eq(pmcUnits.id, subcontractWorkConfirmationLines.pmcUnitId), eq(pmcUnits.tenantId, subcontractWorkConfirmationLines.tenantId)))
    .leftJoin(pmcActivityDefinitions, and(eq(pmcActivityDefinitions.id, subcontractWorkConfirmationLines.pmcActivityDefinitionId), eq(pmcActivityDefinitions.tenantId, subcontractWorkConfirmationLines.tenantId)))
    .leftJoin(boqItems, and(eq(boqItems.id, subcontractWorkConfirmationLines.boqItemId), eq(boqItems.tenantId, subcontractWorkConfirmationLines.tenantId)))
    .where(and(own(subcontractWorkConfirmationLines, input), inArray(subcontractWorkConfirmationLines.confirmationId, headers.map(header => header.id))))
    .orderBy(asc(pmcUnits.unitNumber), asc(boqItems.code));
  return headers.map(header => ({
    ...header,
    lines: lines.filter(line => line.confirmationId === header.id).map(({ confirmationId: _confirmation, percent, quantity, ...line }) => ({ ...line, percent: percent === null ? null : Number(percent), quantity: quantity === null ? null : Number(quantity) })),
  }));
}
