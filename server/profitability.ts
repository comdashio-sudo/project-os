// Database side of the profitability screen. It only reads (and, for a snapshot,
// writes) rows for one tenant and one project that the caller has already been
// authorized for; the arithmetic lives in domain/profitability*.ts.
//
// This module must not import ./db at runtime (db.ts imports it).
import { and, desc, eq, inArray, isNotNull, max, sql } from "drizzle-orm";
import {
  activities,
  budgetLines,
  changeRequests,
  costEntries,
  employeeTimeEntries,
  evmSnapshots,
  evmWbsSnapshots,
  goodsReceiptNotes,
  progressEntries,
  projectCommercialInvoices,
  projects,
  purchaseOrders,
  warehouseInventoryTransactions,
  wbsItems,
} from "../drizzle/schema";
import type { getDb } from "./db";
import { calculateOperationalEvm } from "./domain/operationalEvm";
import { wbsEacRows, type EacMethodUsed, type ProfitabilityReportInput } from "./domain/profitabilityReport";
import { adjustedContractValue, fpac } from "./domain/profitability";

export type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export const DEFAULT_EAC_METHOD: EacMethodUsed = "ac_plus_remaining";

export type ProfitabilityRows = Awaited<ReturnType<typeof loadProfitabilityRows>>;

export async function loadProfitabilityRows(db: Db, scope: { tenantId: string; projectId: string }) {
  return (await loadProfitabilityRowsByProject(db, scope.tenantId, [scope.projectId])).get(scope.projectId)!;
}

/**
 * D-23 (delivery 3.5): the profitability inputs of MANY projects of one tenant in one round of statements (each table read once with
 * `project_id IN (…)`), grouped back per project. A level of 50 projects runs the same statements as a level of 1. The one-project loader above
 * is this with one id, so both always read the same rows. Every project asked for is in the map (an unknown one has `project: null`).
 */
export async function loadProfitabilityRowsByProject(db: Db, tenantId: string, projectIds: string[]) {
  const ids = Array.from(new Set(projectIds));
  const ours = <T extends { tenantId: unknown; projectId: unknown }>(table: T) => and(eq(table.tenantId as never, tenantId), inArray(table.projectId as never, ids));
  const [projectRows, changeRows, activityRows, budgetRows, costRows, progressRows, wbsRows, snapshotRows, poRows, grnRows, paidRows, wbsMaterials, grnMaterials, labourRows, paidInvoiceRows] = ids.length ? await Promise.all([
    db.select({ projectId: projects.id, id: projects.id, code: projects.code, name: projects.name, currency: projects.currency, contractValue: projects.contractValue, updatedAt: projects.updatedAt }).from(projects).where(and(inArray(projects.id, ids), eq(projects.tenantId, tenantId))),
    db.select({ projectId: changeRequests.projectId, id: changeRequests.id, status: changeRequests.status, contractValueImpact: changeRequests.contractValueImpact, reviewedAt: changeRequests.reviewedAt }).from(changeRequests).where(ours(changeRequests)),
    db.select({ projectId: activities.projectId, plannedValue: activities.plannedValue, plannedStartAt: activities.plannedStartAt, plannedFinishAt: activities.plannedFinishAt }).from(activities).where(ours(activities)),
    db.select({ projectId: budgetLines.projectId, wbsItemId: budgetLines.wbsItemId, currentAmount: budgetLines.currentAmount }).from(budgetLines).where(ours(budgetLines)),
    db.select({ projectId: costEntries.projectId, id: costEntries.id, wbsItemId: costEntries.wbsItemId, amount: costEntries.amount, status: costEntries.status, entryType: costEntries.entryType, incurredAt: costEntries.incurredAt, category: costEntries.category, sourceType: costEntries.sourceType, sourceId: costEntries.sourceId }).from(costEntries).where(ours(costEntries)),
    db.select({ projectId: progressEntries.projectId, wbsItemId: progressEntries.wbsItemId, progressPercent: progressEntries.progressPercent, status: progressEntries.status, measuredAt: progressEntries.measuredAt }).from(progressEntries).where(ours(progressEntries)),
    db.select({ projectId: wbsItems.projectId, id: wbsItems.id, code: wbsItems.code, name: wbsItems.name, plannedValue: wbsItems.plannedValue }).from(wbsItems).where(ours(wbsItems)),
    // the latest snapshot with an FPAC of each project: one row per project
    db.selectDistinctOn([evmSnapshots.projectId]).from(evmSnapshots).where(and(ours(evmSnapshots), isNotNull(evmSnapshots.fpac))).orderBy(evmSnapshots.projectId, desc(evmSnapshots.periodAt)),
    db.select({ projectId: purchaseOrders.projectId, id: purchaseOrders.id, amount: purchaseOrders.amount, status: purchaseOrders.status, wbsItemId: purchaseOrders.wbsItemId }).from(purchaseOrders).where(ours(purchaseOrders)),
    db.select({ projectId: goodsReceiptNotes.projectId, purchaseOrderId: goodsReceiptNotes.purchaseOrderId, receivedQuantity: goodsReceiptNotes.receivedQuantity, rejectedQuantity: goodsReceiptNotes.rejectedQuantity, unitCost: goodsReceiptNotes.unitCost }).from(goodsReceiptNotes).where(ours(goodsReceiptNotes)),
    db.select({ projectId: projectCommercialInvoices.projectId, total: sql<string>`COALESCE(SUM(${projectCommercialInvoices.totalAmount}), 0)` }).from(projectCommercialInvoices).where(and(ours(projectCommercialInvoices), eq(projectCommercialInvoices.status, "paid"))).groupBy(projectCommercialInvoices.projectId),
    db.select({ projectId: warehouseInventoryTransactions.projectId, last: max(warehouseInventoryTransactions.occurredAt) }).from(warehouseInventoryTransactions).where(ours(warehouseInventoryTransactions)).groupBy(warehouseInventoryTransactions.projectId),
    db.select({ projectId: goodsReceiptNotes.projectId, last: max(goodsReceiptNotes.receivedAt) }).from(goodsReceiptNotes).where(ours(goodsReceiptNotes)).groupBy(goodsReceiptNotes.projectId),
    db.select({ projectId: employeeTimeEntries.projectId, last: max(employeeTimeEntries.workDate) }).from(employeeTimeEntries).where(and(ours(employeeTimeEntries), inArray(employeeTimeEntries.status, ["submitted", "approved"]))).groupBy(employeeTimeEntries.projectId),
    db.select({ projectId: projectCommercialInvoices.projectId, amount: projectCommercialInvoices.totalAmount, paidAt: projectCommercialInvoices.paidAt, updatedAt: projectCommercialInvoices.updatedAt }).from(projectCommercialInvoices).where(and(ours(projectCommercialInvoices), eq(projectCommercialInvoices.status, "paid"))),
  ]) : [[], [], [], [], [], [], [], [], [], [], [], [], [], [], []] as never;
  const snapshotIds = snapshotRows.map(row => row.id);
  const wbsSnapshotRows = snapshotIds.length ? await db.select({ snapshotId: evmWbsSnapshots.snapshotId, wbsItemId: evmWbsSnapshots.wbsItemId, eac: evmWbsSnapshots.eac }).from(evmWbsSnapshots).where(inArray(evmWbsSnapshots.snapshotId, snapshotIds)) : [];
  // each row goes back to its own project, without the projectId it was grouped by (the shapes stay those of the one-project reads)
  const byProject = <R extends { projectId: string }>(rows: R[]) => {
    const out = new Map<string, Array<Omit<R, "projectId">>>();
    for (const { projectId, ...rest } of rows) { const list = out.get(projectId); if (list) list.push(rest); else out.set(projectId, [rest]); }
    return (projectId: string) => out.get(projectId) ?? [];
  };
  const projectOf = byProject(projectRows), changesOf = byProject(changeRows), activitiesOf = byProject(activityRows), budgetsOf = byProject(budgetRows), costsOf = byProject(costRows);
  const progressOf = byProject(progressRows), wbsOf = byProject(wbsRows), posOf = byProject(poRows), grnsOf = byProject(grnRows), paidInvoicesOf = byProject(paidInvoiceRows);
  const valueOf = <R extends { projectId: string }, V>(rows: R[], pick: (row: R) => V) => { const map = new Map(rows.map(row => [row.projectId, pick(row)])); return (projectId: string) => map.get(projectId); };
  const paidTotal = valueOf(paidRows, row => Number(row.total ?? 0));
  const lastWarehouse = valueOf(wbsMaterials, row => row.last); const lastReceipt = valueOf(grnMaterials, row => row.last); const lastLabour = valueOf(labourRows, row => row.last);
  const snapshotOf = valueOf(snapshotRows, row => row);
  const result = new Map<string, {
    project: ReturnType<typeof projectOf>[number] | null; changeRows: ReturnType<typeof changesOf>; activityRows: ReturnType<typeof activitiesOf>; budgetRows: ReturnType<typeof budgetsOf>; costRows: ReturnType<typeof costsOf>;
    progressRows: ReturnType<typeof progressOf>; wbsRows: ReturnType<typeof wbsOf>; lastSnapshot: (typeof snapshotRows)[number] | null; lastWbs: Array<{ wbsItemId: string | null; eac: string }>; poRows: ReturnType<typeof posOf>;
    grnRows: ReturnType<typeof grnsOf>; paidReceipts: number; paidInvoiceRows: ReturnType<typeof paidInvoicesOf>; lastMaterialsAt: Date | null; lastLabourAt: Date | null;
  }>();
  for (const projectId of ids) {
    const lastSnapshot = snapshotOf(projectId) ?? null;
    result.set(projectId, {
      project: projectOf(projectId)[0] ?? null, changeRows: changesOf(projectId), activityRows: activitiesOf(projectId), budgetRows: budgetsOf(projectId), costRows: costsOf(projectId),
      progressRows: progressOf(projectId), wbsRows: wbsOf(projectId), lastSnapshot,
      lastWbs: lastSnapshot ? wbsSnapshotRows.filter(row => row.snapshotId === lastSnapshot.id).map(({ wbsItemId, eac }) => ({ wbsItemId, eac })) : [],
      poRows: posOf(projectId), grnRows: grnsOf(projectId), paidReceipts: paidTotal(projectId) ?? 0, paidInvoiceRows: paidInvoicesOf(projectId),
      lastMaterialsAt: laterOf(lastWarehouse(projectId) ?? null, lastReceipt(projectId) ?? null), lastLabourAt: lastLabour(projectId) ?? null,
    });
  }
  return result;
}

const laterOf = (a: Date | null, b: Date | null) => (a && b ? (a > b ? a : b) : a ?? b);

/** What the live EVM engine says, or why it could not run (never a thrown error into the screen). */
export function liveEvm(rows: ProfitabilityRows, now: Date, method: EacMethodUsed) {
  try {
    return calculateOperationalEvm({ periodAt: now, activities: rows.activityRows, budgets: rows.budgetRows, costs: rows.costRows, progress: rows.progressRows, wbs: rows.wbsRows.map(w => ({ id: w.id, plannedValue: w.plannedValue })), eacMethod: method });
  } catch (error) {
    return { error: error instanceof RangeError ? "EVM_INPUTS_INCONSISTENT" : "EVM_UNAVAILABLE" } as const;
  }
}

export function reportInputFor(rows: ProfitabilityRows, now: Date, method: EacMethodUsed): ProfitabilityReportInput {
  if (!rows.project) throw new Error("The project row is required.");
  const evm = liveEvm(rows, now, method);
  const wbs = (() => {
    try { return wbsEacRows({ periodAt: now, method, wbs: rows.wbsRows, budgets: rows.budgetRows, costs: rows.costRows, progress: rows.progressRows }); } catch { return null; }
  })();
  const grossReceived = (poId: string) => rows.grnRows.filter(g => g.purchaseOrderId === poId).reduce((t, g) => t + Math.max(0, Number(g.receivedQuantity) - Number(g.rejectedQuantity)) * Number(g.unitCost), 0);
  const open = rows.poRows.filter(po => ["approved", "issued", "received"].includes(po.status));
  const outflows = rows.costRows.filter(c => c.status === "posted" && c.entryType === "actual" && c.incurredAt <= now).reduce((t, c) => t + Number(c.amount), 0);
  const submittedProgress = rows.progressRows.filter(p => p.status === "submitted" && p.wbsItemId);
  const latestByWbs = new Map<string, Date>();
  for (const p of submittedProgress) { const cur = latestByWbs.get(p.wbsItemId!); if (!cur || p.measuredAt > cur) latestByWbs.set(p.wbsItemId!, p.measuredAt); }
  const lastSnapshot = rows.lastSnapshot;
  return {
    now,
    project: rows.project,
    changeOrders: rows.changeRows.map(c => ({ id: c.id, status: c.status, contractValueImpact: Number(c.contractValueImpact) })),
    changeOrdersAsOf: rows.changeRows.reduce<Date | null>((latest, c) => (c.reviewedAt && (!latest || c.reviewedAt > latest) ? c.reviewedAt : latest), null),
    evm: "error" in evm ? evm : { eac: evm.eac, ac: evm.ac, etc: evm.etc, bac: evm.bac },
    wbs: wbs ? { rows: wbs.rows, unallocatedActual: wbs.unallocatedActual } : null,
    lastSnapshot: lastSnapshot ? { periodAt: lastSnapshot.periodAt, adjustedContractValue: lastSnapshot.adjustedContractValue === null ? null : Number(lastSnapshot.adjustedContractValue), ac: Number(lastSnapshot.ac), etc: Number(lastSnapshot.etc), fpac: lastSnapshot.fpac === null ? null : Number(lastSnapshot.fpac), wbs: rows.lastWbs.filter(w => w.wbsItemId).map(w => ({ wbsItemId: w.wbsItemId!, eac: Number(w.eac) })) } : null,
    wbsCommitted: (() => {
      // Open part of each order that is for a WBS item: what is ordered and not yet received, beside that item's plan, actual and forecast.
      const byWbs: Record<string, number> = {}; let unallocated = 0;
      for (const po of open) { const left = Math.max(0, Number(po.amount) - grossReceived(po.id)); if (po.wbsItemId) byWbs[po.wbsItemId] = (byWbs[po.wbsItemId] ?? 0) + left; else unallocated += left; }
      return { byWbs, unallocated, total: Object.values(byWbs).reduce((t, v) => t + v, 0) + unallocated };
    })(),
    commitments: {
      orderValue: open.reduce((t, po) => t + Number(po.amount), 0),
      receivedValue: open.reduce((t, po) => t + grossReceived(po.id), 0),
      // Supplier invoices are not recorded in the platform, so nothing can be "invoiced" yet.
      invoicedValue: 0,
    },
    cash: { receipts: rows.paidReceipts, outflows },
    freshness: {
      progress: submittedProgress.reduce<Date | null>((latest, p) => (!latest || p.measuredAt > latest ? p.measuredAt : latest), null),
      materials: rows.lastMaterialsAt,
      labour: rows.lastLabourAt,
      wbsProgressDates: (wbs?.rows ?? []).map(row => latestByWbs.get(row.wbsItemId) ?? null),
    },
  };
}

/**
 * The profitability position stored with an EVM snapshot: contract value, FPAC
 * and each WBS item's EAC, so the next snapshot can say what moved.
 */
export function snapshotExtension(rows: ProfitabilityRows, periodAt: Date, method: EacMethodUsed, evm: { eac: number }) {
  const contract = adjustedContractValue(Number(rows.project?.contractValue ?? 0), rows.changeRows.map(c => ({ status: c.status, contractValueImpact: Number(c.contractValueImpact) })));
  const result = fpac({ adjustedContractValue: contract.adjustedContractValue, eac: evm.eac });
  const wbs = wbsEacRows({ periodAt, method, wbs: rows.wbsRows, budgets: rows.budgetRows, costs: rows.costRows, progress: rows.progressRows });
  return { adjustedContractValue: contract.adjustedContractValue, fpac: result.fpac, wbsRows: wbs.rows.map(row => ({ wbsItemId: row.wbsItemId, bac: row.bac, ac: row.ac, eac: row.eac })) };
}
