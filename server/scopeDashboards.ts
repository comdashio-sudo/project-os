// The four levels a role works at (work order 12, item 2): company/board (every project, view only), the project portfolio, one project, one project warehouse.
// Each level answers with the same indicators, summed over exactly the projects the caller's OWN assignment covers; the server decides the scope
// (scopeAccess.ts) and a person who can see project A is refused project B, whatever id they send.
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, isNotNull, isNull, lt, ne, notInArray, sql } from "drizzle-orm";
import {
  activities,
  consultantSubmittals,
  ncrs,
  pmcInspectionRequests,
  projectMaterialOverrides,
  materialMasters,
  projectWarehouses,
  projects,
  qualityInspections,
  warehouseInventoryTransactions,
} from "../drizzle/schema";
import { getDb } from "./db";
import { logError } from "./_core/logger";
import { calculateProjectProgress } from "./domain/pmc";
import { buildProfitabilityReport } from "./domain/profitabilityReport";
import { unitProgressOf } from "./domain/pmcScreens";
import { DEFAULT_EAC_METHOD, liveEvm, loadProfitabilityRows, reportInputFor } from "./profitability";
import { loadPmcDataset } from "./pmcScreensService";
import { assertProjectInScope, resolveScopedAccess } from "./scopeAccess";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export type Unavailable = { value: null; reason: string };
export type ProjectKpis = {
  projectId: string;
  code: string;
  name: string;
  currency: string;
  /** Final profit at completion (FPAC) from the profitability engine, or why it cannot be computed. */
  expectedProfit: { value: number } | Unavailable;
  evm: { pv: number; ev: number; ac: number; bac: number; cpi: number | null; spi: number | null; eac: number; vac: number } | Unavailable;
  /** Weighted unit progress from the location/activity register (0–100). */
  progress: { percent: number } | Unavailable;
  /** Schedule activities past their planned finish and not completed. */
  overdueActivities: number;
  pendingConsultant: { inspectionRequests: number; submittals: number };
  pendingQuality: { inspectionsAwaitingResult: number; openNcrs: number };
  stock: { value: number; materialsBelowReorder: number };
};

export type KpiTotals = {
  projectCount: number;
  /** Money is summed only when every project is in one currency; otherwise it is withheld (a sum across currencies is a number in no currency). */
  currency: string | null;
  expectedProfit: number | null;
  stockValue: number | null;
  avgProgress: number | null;
  overdueActivities: number;
  pendingConsultant: { inspectionRequests: number; submittals: number };
  pendingQuality: { inspectionsAwaitingResult: number; openNcrs: number };
  materialsBelowReorder: number;
};

async function countBy(db: Db, ids: string[], run: (ids: string[]) => Promise<Array<{ projectId: string; n: number }>>) {
  const out = new Map<string, number>();
  if (!ids.length) return out;
  for (const row of await run(ids)) out.set(row.projectId, Number(row.n));
  return out;
}

async function kpisFor(db: Db, tenantId: string, projectIds: string[], now: Date): Promise<ProjectKpis[]> {
  if (!projectIds.length) return [];
  const rows = await db.select({ id: projects.id, code: projects.code, name: projects.name, currency: projects.currency }).from(projects).where(and(eq(projects.tenantId, tenantId), inArray(projects.id, projectIds)));

  const overdue = await countBy(db, projectIds, ids => db.select({ projectId: activities.projectId, n: sql<number>`count(*)::int` }).from(activities)
    .where(and(eq(activities.tenantId, tenantId), inArray(activities.projectId, ids), ne(activities.status, "completed"), isNotNull(activities.plannedFinishAt), lt(activities.plannedFinishAt, now))).groupBy(activities.projectId));
  const waitingRequests = await countBy(db, projectIds, ids => db.select({ projectId: pmcInspectionRequests.projectId, n: sql<number>`count(*)::int` }).from(pmcInspectionRequests)
    .where(and(eq(pmcInspectionRequests.tenantId, tenantId), inArray(pmcInspectionRequests.projectId, ids), isNull(pmcInspectionRequests.responseCode))).groupBy(pmcInspectionRequests.projectId));
  const waitingSubmittals = await countBy(db, projectIds, ids => db.select({ projectId: consultantSubmittals.projectId, n: sql<number>`count(*)::int` }).from(consultantSubmittals)
    .where(and(eq(consultantSubmittals.tenantId, tenantId), inArray(consultantSubmittals.projectId, ids), eq(consultantSubmittals.status, "sent"))).groupBy(consultantSubmittals.projectId));
  const waitingInspections = await countBy(db, projectIds, ids => db.select({ projectId: qualityInspections.projectId, n: sql<number>`count(*)::int` }).from(qualityInspections)
    .where(and(eq(qualityInspections.tenantId, tenantId), inArray(qualityInspections.projectId, ids), eq(qualityInspections.status, "submitted"))).groupBy(qualityInspections.projectId));
  const openNcrs = await countBy(db, projectIds, ids => db.select({ projectId: ncrs.projectId, n: sql<number>`count(*)::int` }).from(ncrs)
    .where(and(eq(ncrs.tenantId, tenantId), inArray(ncrs.projectId, ids), notInArray(ncrs.status, ["closed", "cancelled"]))).groupBy(ncrs.projectId));
  const stockValue = new Map<string, number>();
  for (const row of await db.select({ projectId: warehouseInventoryTransactions.projectId, value: sql<string>`COALESCE(SUM(${warehouseInventoryTransactions.valueDelta}), 0)` }).from(warehouseInventoryTransactions)
    .where(and(eq(warehouseInventoryTransactions.tenantId, tenantId), inArray(warehouseInventoryTransactions.projectId, projectIds))).groupBy(warehouseInventoryTransactions.projectId)) stockValue.set(row.projectId, Math.max(0, Number(row.value)));
  const below = await materialsBelowReorder(db, tenantId, projectIds);

  return Promise.all(rows.map(async (project): Promise<ProjectKpis> => {
    const unavailable = (reason: string): Unavailable => ({ value: null, reason });
    let expectedProfit: ProjectKpis["expectedProfit"] = unavailable("PROFITABILITY_UNAVAILABLE");
    let evm: ProjectKpis["evm"] = unavailable("EVM_UNAVAILABLE");
    try {
      const loaded = await loadProfitabilityRows(db, { tenantId, projectId: project.id });
      const live = liveEvm(loaded, now, DEFAULT_EAC_METHOD);
      if ("error" in live) evm = unavailable(live.error);
      else evm = { pv: round2(live.pv), ev: round2(live.ev), ac: round2(live.ac), bac: round2(live.bac), cpi: live.cpi, spi: live.spi, eac: round2(live.eac), vac: round2(live.vac) };
      const report = buildProfitabilityReport(reportInputFor(loaded, now, DEFAULT_EAC_METHOD));
      expectedProfit = report.headline.status === "ok" ? { value: report.headline.data.fpac } : unavailable(report.headline.reason);
    } catch (error) {
      // both stay "unavailable": one project failing never blanks the rest — but the failure is logged, never swallowed (D-23, delivery 3.6)
      logError("levels.project_profitability_failed", error, { tenantId, projectId: project.id });
    }
    let progress: ProjectKpis["progress"] = unavailable("NO_UNITS");
    try {
      const dataset = await loadPmcDataset(db, { userId: 0, tenantId, projectId: project.id }, now);
      const unitRows = dataset.units.flatMap(unit => { const percent = unitProgressOf(dataset, unit); return percent === null ? [] : [{ progressPercent: percent, unitWeight: unit.weight }]; });
      if (unitRows.length) progress = { percent: calculateProjectProgress(unitRows) };
    } catch (error) { progress = unavailable("PROGRESS_UNAVAILABLE"); logError("levels.project_progress_failed", error, { tenantId, projectId: project.id }); }
    return {
      projectId: project.id, code: project.code, name: project.name, currency: project.currency,
      expectedProfit, evm, progress,
      overdueActivities: overdue.get(project.id) ?? 0,
      pendingConsultant: { inspectionRequests: waitingRequests.get(project.id) ?? 0, submittals: waitingSubmittals.get(project.id) ?? 0 },
      pendingQuality: { inspectionsAwaitingResult: waitingInspections.get(project.id) ?? 0, openNcrs: openNcrs.get(project.id) ?? 0 },
      stock: { value: round2(stockValue.get(project.id) ?? 0), materialsBelowReorder: below.get(project.id) ?? 0 },
    };
  }));
}

/** Materials whose on-hand quantity (all the project's warehouses) is under their reorder level. */
async function materialsBelowReorder(db: Db, tenantId: string, projectIds: string[]) {
  const out = new Map<string, number>();
  if (!projectIds.length) return out;
  const rows = await db.select({ projectId: projectMaterialOverrides.projectId, n: sql<number>`count(*)::int` }).from(projectMaterialOverrides)
    .where(and(eq(projectMaterialOverrides.tenantId, tenantId), inArray(projectMaterialOverrides.projectId, projectIds), isNotNull(projectMaterialOverrides.reorderLevel),
      sql`COALESCE((SELECT SUM(t.quantity_delta) FROM warehouse_inventory_transactions t WHERE t.project_id = ${projectMaterialOverrides.projectId} AND t.material_id = ${projectMaterialOverrides.materialId}), 0) < ${projectMaterialOverrides.reorderLevel}`))
    .groupBy(projectMaterialOverrides.projectId);
  for (const row of rows) out.set(row.projectId, Number(row.n));
  return out;
}

function totalsOf(items: ProjectKpis[]): KpiTotals {
  const currencies = new Set(items.map(item => item.currency));
  const single = currencies.size <= 1;
  const profits = items.flatMap(item => ("value" in item.expectedProfit && item.expectedProfit.value !== null ? [item.expectedProfit.value] : []));
  const progresses = items.flatMap(item => ("percent" in item.progress ? [item.progress.percent] : []));
  return {
    projectCount: items.length,
    currency: single ? items[0]?.currency ?? null : null,
    expectedProfit: single && profits.length ? round2(profits.reduce((total, value) => total + value, 0)) : null,
    stockValue: single ? round2(items.reduce((total, item) => total + item.stock.value, 0)) : null,
    avgProgress: progresses.length ? round2(progresses.reduce((total, value) => total + value, 0) / progresses.length) : null,
    overdueActivities: items.reduce((total, item) => total + item.overdueActivities, 0),
    pendingConsultant: { inspectionRequests: items.reduce((t, i) => t + i.pendingConsultant.inspectionRequests, 0), submittals: items.reduce((t, i) => t + i.pendingConsultant.submittals, 0) },
    pendingQuality: { inspectionsAwaitingResult: items.reduce((t, i) => t + i.pendingQuality.inspectionsAwaitingResult, 0), openNcrs: items.reduce((t, i) => t + i.pendingQuality.openNcrs, 0) },
    materialsBelowReorder: items.reduce((t, i) => t + i.stock.materialsBelowReorder, 0),
  };
}

const sortByCode = (items: ProjectKpis[]) => items.slice().sort((a, b) => a.code.localeCompare(b.code));

/** Level 1 — the company / board: every project, view only. A narrower assignment is refused, not narrowed. */
export async function getCompanyLevel(input: { userId: number; tenantId: string; now?: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const access = await resolveScopedAccess({ userId: input.userId, tenantId: input.tenantId, product: "EXECUTIVE", permissions: ["executive.read"], requireCompanyScope: true });
  const items = sortByCode(await kpisFor(db, input.tenantId, Array.from(access.projectIds), input.now ?? new Date()));
  return { level: "company" as const, readOnly: true as const, totals: totalsOf(items), projects: items };
}

/** Level 2 — project management: the portfolio the caller's PMO assignment covers (company, portfolio, program or single projects). */
export async function getPortfolioLevel(input: { userId: number; tenantId: string; now?: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const access = await resolveScopedAccess({ userId: input.userId, tenantId: input.tenantId, product: "PMO", permissions: ["pmo.read"] });
  const items = sortByCode(await kpisFor(db, input.tenantId, Array.from(access.projectIds), input.now ?? new Date()));
  return { level: "portfolio" as const, totals: totalsOf(items), projects: items };
}

/** Level 3 — one project. */
export async function getProjectLevel(input: { userId: number; tenantId: string; projectId: string; now?: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const access = await resolveScopedAccess({ userId: input.userId, tenantId: input.tenantId, product: "PROJECT", permissions: ["project.read", "project.manage"] });
  assertProjectInScope(access, input.projectId);
  const [item] = await kpisFor(db, input.tenantId, [input.projectId], input.now ?? new Date());
  if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_PROJECT_NOT_FOUND" });
  return { level: "project" as const, project: item, totals: totalsOf([item]) };
}

/** Level 4 — one project warehouse: stock by material (quantity, value, reorder level) and the latest movements. */
export async function getWarehouseLevel(input: { userId: number; tenantId: string; projectId: string; warehouseId: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const access = await resolveScopedAccess({ userId: input.userId, tenantId: input.tenantId, product: "PROJECT", permissions: ["project.inventory.manage", "project.read", "project.manage"] });
  assertProjectInScope(access, input.projectId);
  const [warehouse] = await db.select({ id: projectWarehouses.id, code: projectWarehouses.code, name: projectWarehouses.name, active: projectWarehouses.active }).from(projectWarehouses)
    .where(and(eq(projectWarehouses.id, input.warehouseId), eq(projectWarehouses.tenantId, input.tenantId), eq(projectWarehouses.projectId, input.projectId))).limit(1);
  if (!warehouse) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_WAREHOUSE_NOT_FOUND" });
  const stock = await db.select({
    materialId: warehouseInventoryTransactions.materialId, code: materialMasters.code, description: materialMasters.description, unit: materialMasters.unitOfMeasure,
    quantity: sql<string>`COALESCE(SUM(${warehouseInventoryTransactions.quantityDelta}), 0)`, value: sql<string>`COALESCE(SUM(${warehouseInventoryTransactions.valueDelta}), 0)`,
  }).from(warehouseInventoryTransactions).innerJoin(materialMasters, eq(materialMasters.id, warehouseInventoryTransactions.materialId))
    .where(and(eq(warehouseInventoryTransactions.tenantId, input.tenantId), eq(warehouseInventoryTransactions.projectId, input.projectId), eq(warehouseInventoryTransactions.warehouseId, input.warehouseId)))
    .groupBy(warehouseInventoryTransactions.materialId, materialMasters.code, materialMasters.description, materialMasters.unitOfMeasure).orderBy(materialMasters.code);
  const reorder = new Map((await db.select({ materialId: projectMaterialOverrides.materialId, level: projectMaterialOverrides.reorderLevel }).from(projectMaterialOverrides)
    .where(and(eq(projectMaterialOverrides.tenantId, input.tenantId), eq(projectMaterialOverrides.projectId, input.projectId)))).map(row => [row.materialId, row.level === null ? null : Number(row.level)]));
  const lines = stock.map(row => { const quantity = Number(row.quantity); const level = reorder.get(row.materialId) ?? null; return { materialId: row.materialId, code: row.code, description: row.description, unit: row.unit, quantity, value: round2(Math.max(0, Number(row.value))), reorderLevel: level, belowReorder: level !== null && quantity < level }; });
  const movements = await db.select({ id: warehouseInventoryTransactions.id, materialId: warehouseInventoryTransactions.materialId, transactionType: warehouseInventoryTransactions.transactionType, quantityDelta: warehouseInventoryTransactions.quantityDelta, valueDelta: warehouseInventoryTransactions.valueDelta, occurredAt: warehouseInventoryTransactions.occurredAt, referenceNumber: warehouseInventoryTransactions.referenceNumber })
    .from(warehouseInventoryTransactions).where(and(eq(warehouseInventoryTransactions.tenantId, input.tenantId), eq(warehouseInventoryTransactions.projectId, input.projectId), eq(warehouseInventoryTransactions.warehouseId, input.warehouseId)))
    .orderBy(sql`${warehouseInventoryTransactions.occurredAt} DESC`).limit(20);
  return {
    level: "warehouse" as const, warehouse,
    totals: { materials: lines.length, stockValue: round2(lines.reduce((total, line) => total + line.value, 0)), materialsBelowReorder: lines.filter(line => line.belowReorder).length },
    stock: lines, recentMovements: movements.map(item => ({ ...item, quantityDelta: Number(item.quantityDelta), valueDelta: item.valueDelta === null ? null : Number(item.valueDelta) })),
  };
}
