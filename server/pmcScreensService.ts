import { type ExportLocale } from "@shared/exportLocale";
// Loads one dataset for the project and answers each PMC screen from it.
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import {
  pmcActivityDefinitions,
  pmcActivityGroups,
  pmcActivityStages,
  pmcBaselines,
  pmcBlocks,
  pmcInspectionRequestUnits,
  pmcInspectionRequests,
  pmcInspectionSteps,
  pmcStatusFactors,
  pmcUnitActivityHistory,
  pmcUnitActivityProgress,
  pmcUnits,
  pmcVerificationStatuses,
  pmcZones,
  users,
} from "../drizzle/schema";
import { assertProjectWithinTenant, assertTenantFeatureAccess, ensureDefaultCommercialCatalog, getDb } from "./db";
import { buildSpreadsheet } from "./domain/excelWorkbook";
import { PMC_SCREEN_NAMES, screenTable, type PmcScreenName, type ScreenData } from "./domain/pmcScreenExport";
import { activitiesMatrix, approvals, filterDataset, freshnessOf, inspections, latestUpdates, pendingAtVerifier, periodReport, stagesView, zones, type PmcDataset, type PmcFilters } from "./domain/pmcScreens";
import type { PmcUnitActivityStatus } from "./domain/pmc";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Scope = { userId: number; tenantId: string; projectId: string };
export type PmcFilterInput = PmcFilters;
const DEFAULT_FACTORS: Record<PmcUnitActivityStatus, number> = { NOT_STARTED: 0, IN_PROGRESS: 0, UNDER_REVIEW: 0, COMPLETE: 1 };
const DAY = 86_400_000;

export async function authorizePmcRead(input: Scope) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  await ensureDefaultCommercialCatalog(db);
  await assertTenantFeatureAccess({ userId: input.userId, tenantId: input.tenantId, product: "PROJECT", permission: "project.pmc.read", featureCode: "PMC", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  return db;
}

export async function loadPmcDataset(db: Db, input: Scope, now: Date): Promise<PmcDataset> {
  return (await loadPmcDatasets(db, input.tenantId, [input.projectId], now)).get(input.projectId)!;
}

/**
 * D-23 (delivery 3.5): the PMC datasets of MANY projects of one tenant in one round of statements (each table read once with `project_id IN (…)`),
 * then built per project exactly as for one. A level of 50 projects runs the same statements as a level of 1; the one-project loader above is
 * this with one id. Every project asked for is in the map (one with no PMC data gets an empty dataset).
 */
export async function loadPmcDatasets(db: Db, tenantId: string, projectIds: string[], now: Date): Promise<Map<string, PmcDataset>> {
  const ids = Array.from(new Set(projectIds));
  const result = new Map<string, PmcDataset>();
  if (!ids.length) return result;
  const ours = <T extends { tenantId: unknown; projectId: unknown }>(table: T) => and(eq(table.tenantId as never, tenantId), inArray(table.projectId as never, ids));
  const [zoneAll, blockAll, unitAll, groupAll, stageAll, defAll, cellAll, historyAll, verificationAll, requestAll, requestUnitAll, stepAll, baselineAll, factorAll] = await Promise.all([
    db.select({ projectId: pmcZones.projectId, id: pmcZones.id, code: pmcZones.code }).from(pmcZones).where(ours(pmcZones)),
    db.select({ projectId: pmcBlocks.projectId, id: pmcBlocks.id, code: pmcBlocks.code, zoneId: pmcBlocks.zoneId }).from(pmcBlocks).where(ours(pmcBlocks)),
    db.select({ projectId: pmcUnits.projectId, id: pmcUnits.id, unitNumber: pmcUnits.unitNumber, modelCode: pmcUnits.modelCode, unitWeight: pmcUnits.unitWeight, blockId: pmcUnits.blockId, updatedAt: pmcUnits.updatedAt, geometryJson: pmcUnits.geometryJson }).from(pmcUnits).where(ours(pmcUnits)),
    db.select({ projectId: pmcActivityGroups.projectId, id: pmcActivityGroups.id, code: pmcActivityGroups.code, name: pmcActivityGroups.name }).from(pmcActivityGroups).where(ours(pmcActivityGroups)),
    db.select({ projectId: pmcActivityStages.projectId, id: pmcActivityStages.id, code: pmcActivityStages.code, name: pmcActivityStages.name }).from(pmcActivityStages).where(ours(pmcActivityStages)),
    db.select({ projectId: pmcActivityDefinitions.projectId, id: pmcActivityDefinitions.id, modelCode: pmcActivityDefinitions.modelCode, code: pmcActivityDefinitions.code, name: pmcActivityDefinitions.name, weightPercent: pmcActivityDefinitions.weightPercent, groupId: pmcActivityDefinitions.groupId, stageId: pmcActivityDefinitions.stageId, updatedAt: pmcActivityDefinitions.updatedAt }).from(pmcActivityDefinitions).where(ours(pmcActivityDefinitions)),
    db.select({ projectId: pmcUnitActivityProgress.projectId, id: pmcUnitActivityProgress.id, unitId: pmcUnitActivityProgress.unitId, definitionId: pmcUnitActivityProgress.activityDefinitionId, status: pmcUnitActivityProgress.status, verificationStatusId: pmcUnitActivityProgress.verificationStatusId, assignedUserId: pmcUnitActivityProgress.assignedUserId, lastChangedAt: pmcUnitActivityProgress.lastChangedAt }).from(pmcUnitActivityProgress).where(ours(pmcUnitActivityProgress)),
    db.select({ projectId: pmcUnitActivityHistory.projectId, cellId: pmcUnitActivityHistory.unitActivityProgressId, from: pmcUnitActivityHistory.fromStatus, to: pmcUnitActivityHistory.toStatus, userId: pmcUnitActivityHistory.changedByUserId, at: pmcUnitActivityHistory.changedAt }).from(pmcUnitActivityHistory).where(ours(pmcUnitActivityHistory)),
    db.select({ projectId: pmcVerificationStatuses.projectId, id: pmcVerificationStatuses.id, code: pmcVerificationStatuses.code, label: pmcVerificationStatuses.label, pending: pmcVerificationStatuses.pending, sortOrder: pmcVerificationStatuses.sortOrder }).from(pmcVerificationStatuses).where(and(ours(pmcVerificationStatuses), eq(pmcVerificationStatuses.active, true))),
    db.select({ projectId: pmcInspectionRequests.projectId, id: pmcInspectionRequests.id, code: pmcInspectionRequests.requestCode, definitionId: pmcInspectionRequests.activityDefinitionId, contractor: pmcInspectionRequests.contractorLabel, consultant: pmcInspectionRequests.consultantLabel, response: pmcInspectionRequests.responseCode, requestedAt: pmcInspectionRequests.requestedAt, updatedAt: pmcInspectionRequests.updatedAt }).from(pmcInspectionRequests).where(ours(pmcInspectionRequests)),
    db.select({ projectId: pmcInspectionRequestUnits.projectId, requestId: pmcInspectionRequestUnits.inspectionRequestId, unitId: pmcInspectionRequestUnits.unitId }).from(pmcInspectionRequestUnits).where(ours(pmcInspectionRequestUnits)),
    db.select({ projectId: pmcInspectionSteps.projectId, requestId: pmcInspectionSteps.inspectionRequestId, code: pmcInspectionSteps.stepCode, status: pmcInspectionSteps.status, holder: pmcInspectionSteps.holderLabel, order: pmcInspectionSteps.stepOrder }).from(pmcInspectionSteps).where(ours(pmcInspectionSteps)),
    db.select({ projectId: pmcBaselines.projectId, definitionId: pmcBaselines.activityDefinitionId, at: pmcBaselines.periodAt, percent: pmcBaselines.plannedPercent, createdAt: pmcBaselines.createdAt }).from(pmcBaselines).where(ours(pmcBaselines)),
    db.select({ projectId: pmcStatusFactors.projectId, status: pmcStatusFactors.status, factor: pmcStatusFactors.factor }).from(pmcStatusFactors).where(ours(pmcStatusFactors)),
  ]);
  // the people named in any project's cells and history, read once for all of them
  const peopleIds = Array.from(new Set([...cellAll.flatMap(c => (c.assignedUserId ? [c.assignedUserId] : [])), ...historyAll.map(h => h.userId)]));
  const people = peopleIds.length ? await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, peopleIds)) : [];
  const of = <R extends { projectId: string }>(rows: R[], projectId: string) => rows.filter(row => row.projectId === projectId);
  for (const projectId of ids) {
    const zoneRows = of(zoneAll, projectId), blockRows = of(blockAll, projectId), unitRows = of(unitAll, projectId), groupRows = of(groupAll, projectId), stageRows = of(stageAll, projectId);
    const defRows = of(defAll, projectId), cellRows = of(cellAll, projectId), historyRows = of(historyAll, projectId), verificationRows = of(verificationAll, projectId).map(({ projectId: _, ...row }) => row);
    const requestRows = of(requestAll, projectId), requestUnitRows = of(requestUnitAll, projectId), stepRows = of(stepAll, projectId), baselineRows = of(baselineAll, projectId), factorRows = of(factorAll, projectId);
    const zoneById = new Map(zoneRows.map(z => [z.id, z.code]));
    const blockById = new Map(blockRows.map(b => [b.id, { code: b.code, zoneCode: zoneById.get(b.zoneId) ?? "" }]));
    const unitById = new Map(unitRows.map(u => [u.id, u]));
    const groupById = new Map(groupRows.map(g => [g.id, g]));
    const stageById = new Map(stageRows.map(s => [s.id, s]));
    const cellById = new Map(cellRows.map(c => [c.id, c]));
    const unitNumberById = new Map(unitRows.map(u => [u.id, u.unitNumber]));
    const factors = { ...DEFAULT_FACTORS };
    for (const row of factorRows) factors[row.status] = Number(row.factor);
    const unitsOfRequest = new Map<string, number[]>();
    for (const row of requestUnitRows) unitsOfRequest.set(row.requestId, [...(unitsOfRequest.get(row.requestId) ?? []), unitNumberById.get(row.unitId) ?? 0]);
    const baselines = new Map<string, Array<{ at: Date; percent: number }>>();
    for (const row of baselineRows) baselines.set(row.definitionId, [...(baselines.get(row.definitionId) ?? []), { at: row.at, percent: Number(row.percent) }]);
    const mentioned = new Set([...cellRows.flatMap(c => (c.assignedUserId ? [c.assignedUserId] : [])), ...historyRows.map(h => h.userId)]);
    const latest = (dates: Array<Date | null | undefined>) => dates.reduce<Date | null>((best, date) => (date && (!best || date > best) ? date : best), null);
    result.set(projectId, {
      now,
      factors,
      units: unitRows.map(u => ({ id: u.id, number: u.unitNumber, modelCode: u.modelCode, weight: Number(u.unitWeight), zoneCode: blockById.get(u.blockId)?.zoneCode ?? "", blockCode: blockById.get(u.blockId)?.code ?? "", geometry: u.geometryJson ? JSON.parse(u.geometryJson) : null })),
      definitions: defRows.map(d => ({ id: d.id, modelCode: d.modelCode, code: d.code, name: d.name, weightPercent: Number(d.weightPercent), groupCode: groupById.get(d.groupId)?.code ?? "", groupName: groupById.get(d.groupId)?.name ?? "", stageCode: stageById.get(d.stageId)?.code ?? "", stageName: stageById.get(d.stageId)?.name ?? "" })),
      cells: cellRows.map(c => ({ id: c.id, unitId: c.unitId, definitionId: c.definitionId, status: c.status as PmcUnitActivityStatus, verificationStatusId: c.verificationStatusId, assignedUserId: c.assignedUserId, lastChangedAt: c.lastChangedAt })),
      history: historyRows.flatMap(h => { const cell = cellById.get(h.cellId); return cell ? [{ unitId: cell.unitId, definitionId: cell.definitionId, from: h.from as PmcUnitActivityStatus | null, to: h.to as PmcUnitActivityStatus, userId: h.userId, at: h.at }] : []; }),
      verification: verificationRows,
      requests: requestRows.map(r => ({ id: r.id, code: r.code, definitionId: r.definitionId, contractor: r.contractor, consultant: r.consultant, response: r.response, requestedAt: r.requestedAt, unitNumbers: (unitsOfRequest.get(r.id) ?? []).sort((a, b) => a - b), steps: stepRows.filter(s => s.requestId === r.id).map(s => ({ code: s.code, status: s.status, holder: s.holder, order: s.order })) })),
      baselines,
      // only the people this project names (the batch read them for every project at once)
      people: new Map(people.filter(p => mentioned.has(p.id)).map(p => [p.id, p.name ?? p.email ?? `#${p.id}`])),
      sources: [
        { source: "locations", lastAt: latest(unitRows.map(u => u.updatedAt)) },
        { source: "catalog", lastAt: latest(defRows.map(d => d.updatedAt)) },
        { source: "status", lastAt: latest(cellRows.map(c => c.lastChangedAt)) },
        { source: "requests", lastAt: latest(requestRows.map(r => r.updatedAt)) },
        { source: "baseline", lastAt: latest(baselineRows.map(b => b.createdAt)) },
      ],
    });
  }
  return result;
}

const compute: { [N in PmcScreenName]: (ds: PmcDataset) => ScreenData[N] } = {
  latestUpdates, approvals, inspections, activities: activitiesMatrix, zones, weekly: ds => periodReport(ds, "week"), monthly: ds => periodReport(ds, "month"), pending: pendingAtVerifier, stages: stagesView,
};
/** When the person gives no date range, the history screens look at a sensible recent window rather than all time. */
const DEFAULT_DAYS: Partial<Record<PmcScreenName, number>> = { latestUpdates: 7, weekly: 84, monthly: 365 };

export async function getPmcScreen<N extends PmcScreenName>(input: Scope & { screen: N; filters?: PmcFilterInput; now?: Date }) {
  if (!PMC_SCREEN_NAMES.includes(input.screen)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_PMC_SCREEN_UNKNOWN" });
  const db = await authorizePmcRead(input);
  const now = input.now ?? new Date();
  const filters: PmcFilterInput = { ...input.filters };
  if (!filters.since && DEFAULT_DAYS[input.screen]) filters.since = new Date(now.getTime() - DEFAULT_DAYS[input.screen]! * DAY);
  const dataset = await loadPmcDataset(db, input, now);
  const filtered = filterDataset(dataset, filters);
  return { screen: input.screen, generatedAt: now, filters, freshness: freshnessOf(dataset), data: compute[input.screen](filtered) as ScreenData[N], options: { zones: Array.from(new Set(dataset.units.map(u => u.zoneCode))).sort(), blocks: Array.from(new Set(dataset.units.map(u => u.blockCode))).sort(), groups: Array.from(new Set(dataset.definitions.map(d => d.groupCode))).sort(), stages: Array.from(new Set(dataset.definitions.map(d => d.stageCode))).sort(), activities: Array.from(new Set(dataset.definitions.map(d => d.code))).sort() } };
}

export async function exportPmcScreen(input: Scope & { screen: PmcScreenName; filters?: PmcFilterInput; locale: ExportLocale; now?: Date }) {
  const result = await getPmcScreen(input);
  const table = screenTable(input.screen, result.data as never, input.locale);
  const bytes = await buildSpreadsheet({ sheetName: table.sheetName, headers: table.headers, rows: table.rows, format: "xlsx" });
  return { fileName: `pmc-${input.screen}.xlsx`, base64: Buffer.from(bytes).toString("base64"), rows: table.rows.length };
}
