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
  const { tenantId, projectId } = scope;
  const mine = <T extends { tenantId: unknown; projectId: unknown }>(table: T) => and(eq(table.tenantId as never, tenantId), eq(table.projectId as never, projectId));
  const [projectRows, changeRows, activityRows, budgetRows, costRows, progressRows, wbsRows, snapshotRows, poRows, grnRows, paidRows, wbsMaterials, grnMaterials, labourRows, paidInvoiceRows] = await Promise.all([
    db.select({ id: projects.id, code: projects.code, name: projects.name, currency: projects.currency, contractValue: projects.contractValue, updatedAt: projects.updatedAt }).from(projects).where(and(eq(projects.id, projectId), eq(projects.tenantId, tenantId))).limit(1),
    db.select({ id: changeRequests.id, status: changeRequests.status, contractValueImpact: changeRequests.contractValueImpact, reviewedAt: changeRequests.reviewedAt }).from(changeRequests).where(mine(changeRequests)),
    db.select({ plannedValue: activities.plannedValue, plannedStartAt: activities.plannedStartAt, plannedFinishAt: activities.plannedFinishAt }).from(activities).where(mine(activities)),
    db.select({ wbsItemId: budgetLines.wbsItemId, currentAmount: budgetLines.currentAmount }).from(budgetLines).where(mine(budgetLines)),
    db.select({ id: costEntries.id, wbsItemId: costEntries.wbsItemId, amount: costEntries.amount, status: costEntries.status, entryType: costEntries.entryType, incurredAt: costEntries.incurredAt, category: costEntries.category, sourceType: costEntries.sourceType, sourceId: costEntries.sourceId }).from(costEntries).where(mine(costEntries)),
    db.select({ wbsItemId: progressEntries.wbsItemId, progressPercent: progressEntries.progressPercent, status: progressEntries.status, measuredAt: progressEntries.measuredAt }).from(progressEntries).where(mine(progressEntries)),
    db.select({ id: wbsItems.id, code: wbsItems.code, name: wbsItems.name, plannedValue: wbsItems.plannedValue }).from(wbsItems).where(mine(wbsItems)),
    db.select().from(evmSnapshots).where(and(mine(evmSnapshots), isNotNull(evmSnapshots.fpac))).orderBy(desc(evmSnapshots.periodAt)).limit(1),
    db.select({ id: purchaseOrders.id, amount: purchaseOrders.amount, status: purchaseOrders.status, wbsItemId: purchaseOrders.wbsItemId }).from(purchaseOrders).where(mine(purchaseOrders)),
    db.select({ purchaseOrderId: goodsReceiptNotes.purchaseOrderId, receivedQuantity: goodsReceiptNotes.receivedQuantity, rejectedQuantity: goodsReceiptNotes.rejectedQuantity, unitCost: goodsReceiptNotes.unitCost }).from(goodsReceiptNotes).where(mine(goodsReceiptNotes)),
    db.select({ total: sql<string>`COALESCE(SUM(${projectCommercialInvoices.totalAmount}), 0)` }).from(projectCommercialInvoices).where(and(mine(projectCommercialInvoices), eq(projectCommercialInvoices.status, "paid"))),
    db.select({ last: max(warehouseInventoryTransactions.occurredAt) }).from(warehouseInventoryTransactions).where(mine(warehouseInventoryTransactions)),
    db.select({ last: max(goodsReceiptNotes.receivedAt) }).from(goodsReceiptNotes).where(mine(goodsReceiptNotes)),
    db.select({ last: max(employeeTimeEntries.workDate) }).from(employeeTimeEntries).where(and(mine(employeeTimeEntries), inArray(employeeTimeEntries.status, ["submitted", "approved"]))),
    db.select({ amount: projectCommercialInvoices.totalAmount, paidAt: projectCommercialInvoices.paidAt, updatedAt: projectCommercialInvoices.updatedAt }).from(projectCommercialInvoices).where(and(mine(projectCommercialInvoices), eq(projectCommercialInvoices.status, "paid"))),
  ]);
  const lastSnapshot = snapshotRows[0] ?? null;
  const lastWbs = lastSnapshot ? await db.select({ wbsItemId: evmWbsSnapshots.wbsItemId, eac: evmWbsSnapshots.eac }).from(evmWbsSnapshots).where(eq(evmWbsSnapshots.snapshotId, lastSnapshot.id)) : [];
  return { project: projectRows[0] ?? null, changeRows, activityRows, budgetRows, costRows, progressRows, wbsRows, lastSnapshot, lastWbs, poRows, grnRows, paidReceipts: Number(paidRows[0]?.total ?? 0), paidInvoiceRows, lastMaterialsAt: laterOf(wbsMaterials[0]?.last ?? null, grnMaterials[0]?.last ?? null), lastLabourAt: labourRows[0]?.last ?? null };
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
