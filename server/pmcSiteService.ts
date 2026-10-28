// Work order 22: the site's own record (replacing AppSheet + Apps Script + the Google Sheet), and how it stands against the consultant and the monthly report.
//   - updateSiteStatus: one entry for several villas (a list, a range «268-272», or a whole block) → one row per villa in the site's history, in one transaction, refused before
//     anything is written when a villa does not exist, the date is in the future, a field is missing, or the activity does not apply to the villa's type;
//   - pmcSourcePercentages: the three percentages (site, consultant, monthly report) for the project, each zone, block and villa, and the differences between them;
//   - pmcComparison: site ↔ consultant per cell (villa × catalogue activity), the two kinds of difference with their age, the site's note, and a summary by section;
//   - actOnDifferences: «create an inspection request» or «update the site status» for one or many differences at once;
//   - earned value in riyals (net area × unit price × weight) only with the financial permission; the S-curve (planned months against the site's dated statuses).
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  auditLogs, pmcActivityDefinitions, pmcActivityStages, pmcBlocks, pmcCellNotes, pmcConsultantCells, pmcConsultantColumns, pmcInspectionRequestUnits, pmcInspectionRequests, pmcInspectionSteps,
  pmcPlanMonths, pmcSiteActivities, pmcSiteActivityLinks, pmcSiteCellEvents, pmcSiteCells, pmcStatusFactors, pmcUnitActivityProgress, pmcUnits, pmcZones,
} from "../drizzle/schema";
import { effectiveStatusFactors, type PmcUnitActivityStatus } from "./domain/pmc";
import { SITE_STATUSES, type SiteStatus } from "./domain/smartImport/siteWorkbook";
import { PMC_INSPECTION_STEPS } from "./pmcService";
import { chunks, daysBetween, FINANCIAL_PERMISSION, holds, pmcGate, siteToday, villaKey, type Db, type Scope } from "./wo22Shared";

const refuse = (code: "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT", message: string, issues?: unknown[]) => new TRPCError({ code, message, cause: issues ? { issues } : undefined });
export const isSiteDone = (status: string) => status === "DONE" || status === "INSPECTION_REQUESTED" || status === "QC_APPROVED";
const DATE_COLUMN: Record<SiteStatus, "notStartedOn" | "inProgressOn" | "doneOn" | "inspectionRequestedOn" | "qcApprovedOn"> = { NOT_STARTED: "notStartedOn", IN_PROGRESS: "inProgressOn", DONE: "doneOn", INSPECTION_REQUESTED: "inspectionRequestedOn", QC_APPROVED: "qcApprovedOn" };
const mine = <T extends { tenantId: unknown; projectId: unknown }>(table: T, input: Scope) => and(eq(table.tenantId as never, input.tenantId), eq(table.projectId as never, input.projectId));
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

// ------------------------------------------------------------------ the site's activities and their link to the catalogue

export async function listSiteActivities(input: Scope) {
  const db = await pmcGate(input, "project.pmc.read");
  const [activities, links] = await Promise.all([
    db.select({ id: pmcSiteActivities.id, code: pmcSiteActivities.code, csiName: pmcSiteActivities.csiName, subName: pmcSiteActivities.subName, name: pmcSiteActivities.name, weight: pmcSiteActivities.weight, modelCodesJson: pmcSiteActivities.modelCodesJson, sortOrder: pmcSiteActivities.sortOrder }).from(pmcSiteActivities).where(mine(pmcSiteActivities, input)).orderBy(pmcSiteActivities.sortOrder),
    db.select({ siteActivityId: pmcSiteActivityLinks.siteActivityId, activityCode: pmcSiteActivityLinks.activityCode, score: pmcSiteActivityLinks.score, confirmed: pmcSiteActivityLinks.confirmed }).from(pmcSiteActivityLinks).where(mine(pmcSiteActivityLinks, input)),
  ]);
  return activities.map(activity => ({ ...activity, weight: Number(activity.weight), modelCodes: activity.modelCodesJson ? JSON.parse(activity.modelCodesJson) as string[] : null, links: links.filter(link => link.siteActivityId === activity.id).map(link => ({ activityCode: link.activityCode, score: link.score === null ? null : Number(link.score), confirmed: link.confirmed })) }));
}

/** The owner's one-time decision: which catalogue activities each site activity stands for (replaces that activity's links; confirmed). */
export async function confirmSiteActivityLinks(input: Scope & { links: Array<{ siteActivityId: string; activityCodes: string[] }> }) {
  const db = await pmcGate(input, "project.pmc.manage");
  const siteIds = input.links.map(link => link.siteActivityId);
  const known = new Set((await db.select({ id: pmcSiteActivities.id }).from(pmcSiteActivities).where(and(mine(pmcSiteActivities, input), inArray(pmcSiteActivities.id, siteIds.length ? siteIds : ["-"])))).map(row => row.id));
  if (siteIds.some(id => !known.has(id))) throw refuse("NOT_FOUND", "PROJECT_OS_PMC_SITE_ACTIVITY_NOT_FOUND");
  const codes = Array.from(new Set(input.links.flatMap(link => link.activityCodes)));
  const catalog = new Set((await db.select({ code: pmcActivityDefinitions.code }).from(pmcActivityDefinitions).where(and(mine(pmcActivityDefinitions, input), inArray(pmcActivityDefinitions.code, codes.length ? codes : ["-"])))).map(row => row.code));
  if (codes.some(code => !catalog.has(code))) throw refuse("NOT_FOUND", "PROJECT_OS_PMC_ACTIVITY_NOT_FOUND");
  const now = new Date();
  await db.transaction(async tx => {
    for (const link of input.links) {
      await tx.delete(pmcSiteActivityLinks).where(and(mine(pmcSiteActivityLinks, input), eq(pmcSiteActivityLinks.siteActivityId, link.siteActivityId)));
      if (link.activityCodes.length) await tx.insert(pmcSiteActivityLinks).values(Array.from(new Set(link.activityCodes)).map(activityCode => ({ id: randomUUID(), tenantId: input.tenantId, projectId: input.projectId, siteActivityId: link.siteActivityId, activityCode, confirmed: true, confirmedByUserId: input.userId, confirmedAt: now })));
    }
    await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.site_activity_links_confirmed", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ siteActivities: input.links.length, links: input.links.reduce((sum, link) => sum + link.activityCodes.length, 0) }) });
  });
  return { confirmed: input.links.length };
}

/** The catalogue (the monthly report's activities, one entry per code) for choosing a link by hand: code, name, WIR and section. */
export async function listCatalogActivities(input: Scope) {
  const db = await pmcGate(input, "project.pmc.read");
  const [defs, stages] = await Promise.all([
    db.select({ code: pmcActivityDefinitions.code, name: pmcActivityDefinitions.name, wirCode: pmcActivityDefinitions.wirCode, stageId: pmcActivityDefinitions.stageId }).from(pmcActivityDefinitions).where(mine(pmcActivityDefinitions, input)),
    db.select({ id: pmcActivityStages.id, name: pmcActivityStages.name }).from(pmcActivityStages).where(mine(pmcActivityStages, input)),
  ]);
  const stageName = new Map(stages.map(stage => [stage.id, stage.name]));
  const byCode = new Map<string, { code: string; name: string; wirCode: string | null; section: string }>();
  for (const def of defs) if (!byCode.has(def.code)) byCode.set(def.code, { code: def.code, name: def.name, wirCode: def.wirCode, section: stageName.get(def.stageId) ?? "" });
  return Array.from(byCode.values()).sort((a, b) => a.section.localeCompare(b.section) || a.name.localeCompare(b.name));
}

// ------------------------------------------------------------------ one update for several villas

export type SiteUpdateInput = Scope & { siteActivityId: string; villas?: string[]; range?: string; blockCode?: string; status: SiteStatus; date: string; batchSource?: "site" | "comparison" };
export type SiteUpdateIssue = { code: string; villa?: string; detail?: string };

/** «268-272» → the villas between them that exist (by number); a single «268» is itself. */
export function expandVillaRange(range: string, known: string[]): string[] | null {
  const match = range.trim().match(/^(\d+)\s*[-–—]\s*(\d+)$/);
  if (!match) return /^\d+$/.test(range.trim()) ? [String(Number(range.trim()))] : null;
  const [from, to] = [Number(match[1]), Number(match[2])].sort((a, b) => a - b);
  return known.filter(label => /^\d+$/.test(label) && Number(label) >= from && Number(label) <= to).sort((a, b) => Number(a) - Number(b));
}

export async function updateSiteStatus(input: SiteUpdateInput) {
  const db = await pmcGate(input, "project.pmc.update");
  const issues: SiteUpdateIssue[] = [];
  if (!input.siteActivityId) issues.push({ code: "SITE_FIELD_MISSING", detail: "activity" });
  if (!SITE_STATUSES.includes(input.status)) issues.push({ code: "SITE_FIELD_MISSING", detail: "status" });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date ?? "")) issues.push({ code: "SITE_FIELD_MISSING", detail: "date" });
  else if (input.date > siteToday()) issues.push({ code: "SITE_DATE_IN_FUTURE", detail: input.date });
  const chosen = [input.villas?.length ? 1 : 0, input.range ? 1 : 0, input.blockCode ? 1 : 0].reduce((a, b) => a + b, 0);
  if (chosen === 0) issues.push({ code: "SITE_FIELD_MISSING", detail: "villas" });
  if (issues.length) throw refuse("BAD_REQUEST", "PROJECT_OS_SITE_UPDATE_INVALID", issues);

  const [activity] = await db.select({ id: pmcSiteActivities.id, name: pmcSiteActivities.name, modelCodesJson: pmcSiteActivities.modelCodesJson }).from(pmcSiteActivities).where(and(mine(pmcSiteActivities, input), eq(pmcSiteActivities.id, input.siteActivityId))).limit(1);
  if (!activity) throw refuse("BAD_REQUEST", "PROJECT_OS_SITE_UPDATE_INVALID", [{ code: "SITE_ACTIVITY_UNKNOWN" }]);
  const units = await db.select({ id: pmcUnits.id, unitNumber: pmcUnits.unitNumber, villaLabel: pmcUnits.villaLabel, modelCode: pmcUnits.modelCode, blockId: pmcUnits.blockId }).from(pmcUnits).where(mine(pmcUnits, input));
  const byVilla = new Map(units.map(unit => [villaKey(unit.villaLabel ?? unit.unitNumber), unit]));
  let wanted: string[] = [];
  if (input.villas?.length) wanted = Array.from(new Set(input.villas.flatMap(item => item.split(/[,،;\s]+/)).filter(Boolean).map(villaKey)));
  if (input.range) { const expanded = expandVillaRange(input.range, Array.from(byVilla.keys())); if (!expanded) issues.push({ code: "SITE_RANGE_INVALID", detail: input.range }); else if (!expanded.length) issues.push({ code: "SITE_RANGE_EMPTY", detail: input.range }); else wanted = expanded; }
  if (input.blockCode) {
    const blocks = await db.select({ id: pmcBlocks.id, code: pmcBlocks.code, name: pmcBlocks.name }).from(pmcBlocks).where(mine(pmcBlocks, input));
    const block = blocks.find(item => item.code === input.blockCode || item.name === input.blockCode || item.code.endsWith(`-${input.blockCode}`));
    if (!block) issues.push({ code: "SITE_BLOCK_UNKNOWN", detail: input.blockCode });
    else wanted = units.filter(unit => unit.blockId === block.id).map(unit => villaKey(unit.villaLabel ?? unit.unitNumber));
  }
  const allowed = activity.modelCodesJson ? new Set(JSON.parse(activity.modelCodesJson) as string[]) : null;
  const targets: typeof units = [];
  for (const villa of wanted) {
    const unit = byVilla.get(villa);
    if (!unit) { issues.push({ code: "SITE_VILLA_UNKNOWN", villa }); continue; }
    if (allowed && !allowed.has(unit.modelCode)) { issues.push({ code: "SITE_ACTIVITY_NOT_FOR_TYPE", villa, detail: unit.modelCode }); continue; }
    targets.push(unit);
  }
  if (issues.length || !targets.length) throw refuse("BAD_REQUEST", "PROJECT_OS_SITE_UPDATE_INVALID", issues.length ? issues : [{ code: "SITE_FIELD_MISSING", detail: "villas" }]);

  const batchId = randomUUID();
  const result = await db.transaction(tx => writeSiteStatus(tx, input, targets.map(unit => unit.id), input.siteActivityId, input.status, input.date, { batchId, source: input.batchSource ?? "site", userId: input.userId, label: null }));
  await db.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.site_status_updated", entityType: "pmc_site_activity", entityId: input.siteActivityId, metadata: JSON.stringify({ projectId: input.projectId, status: input.status, date: input.date, villas: targets.length, updated: result.updated, unchanged: result.unchanged, batchId }) });
  return { ...result, villas: targets.map(unit => villaKey(unit.villaLabel ?? unit.unitNumber)), batchId };
}

/** The write itself, shared by the site's update, the actions on a difference and the one-time import: a row per villa, an event per change, nothing for a cell already there. */
export async function writeSiteStatus(tx: Tx, input: Scope, unitIds: string[], siteActivityId: string, status: SiteStatus, date: string, by: { batchId: string; source: string; userId: number | null; label: string | null }) {
  const existing = await tx.select({ id: pmcSiteCells.id, unitId: pmcSiteCells.unitId, status: pmcSiteCells.status, statusOn: pmcSiteCells.statusOn }).from(pmcSiteCells).where(and(eq(pmcSiteCells.tenantId, input.tenantId), eq(pmcSiteCells.siteActivityId, siteActivityId), inArray(pmcSiteCells.unitId, unitIds)));
  const byUnit = new Map(existing.map(cell => [cell.unitId, cell]));
  const now = new Date(); let updated = 0; let unchanged = 0;
  const events: Array<typeof pmcSiteCellEvents.$inferInsert> = [];
  const inserts: Array<typeof pmcSiteCells.$inferInsert> = [];
  for (const unitId of unitIds) {
    const cell = byUnit.get(unitId);
    if (cell && cell.status === status && cell.statusOn === date) { unchanged += 1; continue; }
    const id = cell?.id ?? randomUUID();
    if (!cell) inserts.push({ id, tenantId: input.tenantId, projectId: input.projectId, unitId, siteActivityId, status, statusOn: date, [DATE_COLUMN[status]]: date, updatedByUserId: by.userId, updatedByLabel: by.label });
    else {
      const rows = await tx.update(pmcSiteCells).set({ status, statusOn: date, [DATE_COLUMN[status]]: date, updatedByUserId: by.userId, updatedByLabel: by.label, updatedAt: now }).where(and(eq(pmcSiteCells.id, cell.id), eq(pmcSiteCells.tenantId, input.tenantId))).returning({ id: pmcSiteCells.id });
      if (rows.length !== 1) throw refuse("CONFLICT", "PROJECT_OS_SITE_UPDATE_INVALID"); // rows = 0 is never taken for success
    }
    events.push({ id: randomUUID(), tenantId: input.tenantId, projectId: input.projectId, cellId: id, fromStatus: cell?.status ?? null, toStatus: status, statusOn: date, enteredByUserId: by.userId, enteredByLabel: by.label, source: by.source, batchId: by.batchId });
    updated += 1;
  }
  for (const batch of chunks(inserts, 500)) await tx.insert(pmcSiteCells).values(batch);
  for (const batch of chunks(events, 500)) await tx.insert(pmcSiteCellEvents).values(batch);
  return { updated, unchanged };
}

/** The site's history of one villa × activity (the newest first). */
export async function siteCellHistory(input: Scope & { unitId: string; siteActivityId: string }) {
  const db = await pmcGate(input, "project.pmc.read");
  const [cell] = await db.select({ id: pmcSiteCells.id }).from(pmcSiteCells).where(and(mine(pmcSiteCells, input), eq(pmcSiteCells.unitId, input.unitId), eq(pmcSiteCells.siteActivityId, input.siteActivityId))).limit(1);
  if (!cell) return [];
  const events = await db.select({ fromStatus: pmcSiteCellEvents.fromStatus, toStatus: pmcSiteCellEvents.toStatus, statusOn: pmcSiteCellEvents.statusOn, enteredByUserId: pmcSiteCellEvents.enteredByUserId, enteredByLabel: pmcSiteCellEvents.enteredByLabel, source: pmcSiteCellEvents.source, createdAt: pmcSiteCellEvents.createdAt }).from(pmcSiteCellEvents).where(and(mine(pmcSiteCellEvents, input), eq(pmcSiteCellEvents.cellId, cell.id)));
  return events.sort((a, b) => (b.statusOn.localeCompare(a.statusOn) || b.createdAt.getTime() - a.createdAt.getTime()));
}

// ------------------------------------------------------------------ the state of the project, read once

type State = Awaited<ReturnType<typeof loadState>>;
async function loadState(db: Pick<Db, "select">, input: Scope) {
  const [zones, blocks, units, defs, stages, site, links, siteCells, columns, factorsRows] = await Promise.all([
    db.select({ id: pmcZones.id, code: pmcZones.code, name: pmcZones.name }).from(pmcZones).where(mine(pmcZones, input)),
    db.select({ id: pmcBlocks.id, code: pmcBlocks.code, name: pmcBlocks.name, zoneId: pmcBlocks.zoneId }).from(pmcBlocks).where(mine(pmcBlocks, input)),
    db.select({ id: pmcUnits.id, unitNumber: pmcUnits.unitNumber, villaLabel: pmcUnits.villaLabel, modelCode: pmcUnits.modelCode, blockId: pmcUnits.blockId }).from(pmcUnits).where(mine(pmcUnits, input)),
    db.select({ id: pmcActivityDefinitions.id, code: pmcActivityDefinitions.code, name: pmcActivityDefinitions.name, modelCode: pmcActivityDefinitions.modelCode, weightPercent: pmcActivityDefinitions.weightPercent, wirCode: pmcActivityDefinitions.wirCode, stageId: pmcActivityDefinitions.stageId }).from(pmcActivityDefinitions).where(mine(pmcActivityDefinitions, input)),
    db.select({ id: pmcActivityStages.id, name: pmcActivityStages.name }).from(pmcActivityStages).where(mine(pmcActivityStages, input)),
    db.select({ id: pmcSiteActivities.id, name: pmcSiteActivities.name, csiName: pmcSiteActivities.csiName, weight: pmcSiteActivities.weight, sortOrder: pmcSiteActivities.sortOrder }).from(pmcSiteActivities).where(mine(pmcSiteActivities, input)),
    db.select({ siteActivityId: pmcSiteActivityLinks.siteActivityId, activityCode: pmcSiteActivityLinks.activityCode, confirmed: pmcSiteActivityLinks.confirmed }).from(pmcSiteActivityLinks).where(mine(pmcSiteActivityLinks, input)),
    db.select({ unitId: pmcSiteCells.unitId, siteActivityId: pmcSiteCells.siteActivityId, status: pmcSiteCells.status, statusOn: pmcSiteCells.statusOn, doneOn: pmcSiteCells.doneOn, inspectionRequestedOn: pmcSiteCells.inspectionRequestedOn, qcApprovedOn: pmcSiteCells.qcApprovedOn }).from(pmcSiteCells).where(mine(pmcSiteCells, input)),
    db.select({ id: pmcConsultantColumns.id, activityCode: pmcConsultantColumns.activityCode, activityName: pmcConsultantColumns.activityName, locationName: pmcConsultantColumns.locationName, wirCode: pmcConsultantColumns.wirCode }).from(pmcConsultantColumns).where(mine(pmcConsultantColumns, input)),
    db.select({ status: pmcStatusFactors.status, factor: pmcStatusFactors.factor }).from(pmcStatusFactors).where(mine(pmcStatusFactors, input)),
  ]);
  const [consultantCells, progress] = await Promise.all([
    db.select({ unitId: pmcConsultantCells.unitId, columnId: pmcConsultantCells.columnId, status: pmcConsultantCells.status, firstReceivedOn: pmcConsultantCells.firstReceivedOn }).from(pmcConsultantCells).where(mine(pmcConsultantCells, input)),
    db.select({ unitId: pmcUnitActivityProgress.unitId, activityDefinitionId: pmcUnitActivityProgress.activityDefinitionId, status: pmcUnitActivityProgress.status }).from(pmcUnitActivityProgress).where(mine(pmcUnitActivityProgress, input)),
  ]);
  const factors = effectiveStatusFactors(factorsRows);
  const stageName = new Map(stages.map(stage => [stage.id, stage.name]));
  const defByModelCode = new Map(defs.map(def => [`${def.modelCode}|${def.code}`, def]));
  const blockById = new Map(blocks.map(block => [block.id, block])); const zoneById = new Map(zones.map(zone => [zone.id, zone]));
  const siteById = new Map(site.map(activity => [activity.id, { ...activity, weight: Number(activity.weight) }]));
  const siteCellByKey = new Map(siteCells.map(cell => [`${cell.unitId}|${cell.siteActivityId}`, cell]));
  const confirmed = links.filter(link => link.confirmed);
  const siteFor = new Map<string, string[]>(); for (const link of confirmed) siteFor.set(link.activityCode, [...(siteFor.get(link.activityCode) ?? []), link.siteActivityId]);
  const columnsFor = new Map<string, typeof columns>(); for (const column of columns) if (column.activityCode) columnsFor.set(column.activityCode, [...(columnsFor.get(column.activityCode) ?? []), column]);
  const consultantByKey = new Map(consultantCells.map(cell => [`${cell.unitId}|${cell.columnId}`, cell]));
  const progressByKey = new Map(progress.map(cell => [`${cell.unitId}|${cell.activityDefinitionId}`, cell.status as PmcUnitActivityStatus]));
  return { zones, blocks, units, defs, stageName, defByModelCode, blockById, zoneById, site, siteById, siteCellByKey, siteFor, columns, columnsFor, consultantByKey, progressByKey, factors, unlinkedColumns: columns.filter(column => !column.activityCode).length, confirmedLinks: confirmed.length };
}

const placeOf = (state: State, unit: State["units"][number]) => { const block = state.blockById.get(unit.blockId); const zone = block ? state.zoneById.get(block.zoneId) : undefined; return { block: block?.name ?? "", blockCode: block?.code ?? "", zone: zone?.name ?? "", zoneCode: zone?.code ?? "" }; };
const doneDateOf = (cell: { status: string; statusOn: string | null; doneOn: string | null; inspectionRequestedOn: string | null; qcApprovedOn: string | null } | undefined) => (cell && isSiteDone(cell.status) ? cell.doneOn ?? cell.inspectionRequestedOn ?? cell.qcApprovedOn ?? cell.statusOn : null);

// ------------------------------------------------------------------ the three percentages

function unitShares(state: State, unit: State["units"][number]) {
  let monthly = 0; let consultant = 0; let site = 0;
  for (const def of state.defs) {
    if (def.modelCode !== unit.modelCode) continue;
    const weight = Number(def.weightPercent) / 100;
    const status = state.progressByKey.get(`${unit.id}|${def.id}`);
    if (status) monthly += weight * (state.factors[status] ?? 0);
    const columns = state.columnsFor.get(def.code) ?? [];
    if (columns.some(column => { const cell = state.consultantByKey.get(`${unit.id}|${column.id}`); return cell && cell.status !== "NOT_RECEIVED"; })) consultant += weight;
  }
  for (const activity of state.site) { const cell = state.siteCellByKey.get(`${unit.id}|${activity.id}`); if (cell && isSiteDone(cell.status)) site += Number(activity.weight); }
  return { monthly, consultant, site };
}

export async function pmcSourcePercentages(input: Scope) {
  const db = await pmcGate(input, "project.pmc.read");
  const state = await loadState(db, input);
  const perUnit = state.units.map(unit => ({ unitId: unit.id, villa: unit.villaLabel ?? String(unit.unitNumber), ...placeOf(state, unit), modelCode: unit.modelCode, ...unitShares(state, unit) }));
  const average = (rows: typeof perUnit) => { const n = rows.length || 1; const monthly = rows.reduce((s, r) => s + r.monthly, 0) / n; const consultant = rows.reduce((s, r) => s + r.consultant, 0) / n; const site = rows.reduce((s, r) => s + r.site, 0) / n; return { units: rows.length, monthly, consultant, site, siteMinusConsultant: site - consultant, siteMinusMonthly: site - monthly, consultantMinusMonthly: consultant - monthly }; };
  const group = (key: (row: (typeof perUnit)[number]) => string) => Array.from(new Set(perUnit.map(key))).sort().map(value => ({ key: value, ...average(perUnit.filter(row => key(row) === value)) }));
  return {
    project: average(perUnit), byZone: group(row => row.zone), byBlock: group(row => row.block),
    byUnit: perUnit.map(row => ({ unitId: row.unitId, villa: row.villa, zone: row.zone, block: row.block, modelCode: row.modelCode, monthly: row.monthly, consultant: row.consultant, site: row.site })),
    readiness: { siteActivities: state.site.length, confirmedLinks: state.confirmedLinks, consultantColumns: state.columns.length, unlinkedColumns: state.unlinkedColumns },
  };
}

// ------------------------------------------------------------------ site ↔ consultant

export type DifferenceKind = "site_done_not_received" | "received_not_done";
export type ComparisonRow = {
  unitId: string; activityCode: string; zone: string; block: string; villa: string; modelCode: string; section: string; wir: string | null;
  siteActivity: string; consultantActivity: string; siteStatus: string | null; doneOn: string | null; consultantStatus: string | null; firstReceivedOn: string | null;
  kind: DifferenceKind | null; ageDays: number | null; note: string | null;
};

function compare(state: State, notes: Map<string, string>, today: string) {
  const rows: ComparisonRow[] = [];
  const sections = new Map<string, { section: string; compared: number; bothDone: number; neither: number; siteDoneNotReceived: number; receivedNotDone: number }>();
  let notCompared = 0;
  for (const unit of state.units) {
    const place = placeOf(state, unit);
    for (const def of state.defs) {
      if (def.modelCode !== unit.modelCode) continue;
      const siteIds = state.siteFor.get(def.code) ?? []; const columns = state.columnsFor.get(def.code) ?? [];
      if (!siteIds.length || !columns.length) { notCompared += 1; continue; }
      const siteCells = siteIds.map(id => state.siteCellByKey.get(`${unit.id}|${id}`));
      const siteDone = siteCells.every(cell => cell && isSiteDone(cell.status));
      const doneOn = siteDone ? siteCells.map(doneDateOf).filter((value): value is string => Boolean(value)).sort().pop() ?? null : null;
      const consultantCells = columns.map(column => state.consultantByKey.get(`${unit.id}|${column.id}`)).filter(Boolean);
      const received = consultantCells.some(cell => cell!.status !== "NOT_RECEIVED");
      const firstReceivedOn = received ? consultantCells.map(cell => cell!.firstReceivedOn).filter((value): value is string => Boolean(value)).sort()[0] ?? null : null;
      const section = state.stageName.get(def.stageId) ?? "";
      const tally = sections.get(section) ?? { section, compared: 0, bothDone: 0, neither: 0, siteDoneNotReceived: 0, receivedNotDone: 0 };
      tally.compared += 1;
      const kind: DifferenceKind | null = siteDone && !received ? "site_done_not_received" : received && !siteDone ? "received_not_done" : null;
      if (kind === "site_done_not_received") tally.siteDoneNotReceived += 1; else if (kind === "received_not_done") tally.receivedNotDone += 1; else if (siteDone) tally.bothDone += 1; else tally.neither += 1;
      sections.set(section, tally);
      if (!kind) continue;
      const since = kind === "site_done_not_received" ? doneOn : firstReceivedOn;
      const siteStatus = siteCells.map(cell => cell?.status ?? "NOT_STARTED").join(" · ");
      rows.push({
        unitId: unit.id, activityCode: def.code, zone: place.zone, block: place.block, villa: unit.villaLabel ?? String(unit.unitNumber), modelCode: unit.modelCode, section, wir: def.wirCode,
        siteActivity: siteIds.map(id => state.siteById.get(id)?.name ?? "").join(" + "), consultantActivity: columns.map(column => [column.activityName, column.locationName].filter(Boolean).join(" — ")).join(" + "),
        siteStatus, doneOn, consultantStatus: received ? (consultantCells.find(cell => cell!.status !== "NOT_RECEIVED")!.status) : "NOT_RECEIVED", firstReceivedOn,
        kind, ageDays: since ? Math.max(0, daysBetween(since, today)) : null, note: notes.get(`${unit.id}|${def.code}`) ?? null,
      });
    }
  }
  return { rows, summary: Array.from(sections.values()).sort((a, b) => a.section.localeCompare(b.section)), notCompared };
}

async function notesOf(db: Pick<Db, "select">, input: Scope) {
  const rows = await db.select({ unitId: pmcCellNotes.unitId, activityCode: pmcCellNotes.activityCode, note: pmcCellNotes.note }).from(pmcCellNotes).where(mine(pmcCellNotes, input));
  return new Map(rows.map(row => [`${row.unitId}|${row.activityCode}`, row.note]));
}

export type ComparisonFilter = { kind?: DifferenceKind; zone?: string; block?: string; section?: string; villa?: string; minAgeDays?: number; offset?: number; limit?: number };
export async function pmcComparison(input: Scope & ComparisonFilter) {
  const db = await pmcGate(input, "project.pmc.read");
  const state = await loadState(db, input);
  const { rows, summary, notCompared } = compare(state, await notesOf(db, input), siteToday());
  const filtered = rows.filter(row => (!input.kind || row.kind === input.kind) && (!input.zone || row.zone === input.zone) && (!input.block || row.block === input.block) && (!input.section || row.section === input.section) && (!input.villa || villaKey(row.villa) === villaKey(input.villa)) && (input.minAgeDays === undefined || (row.ageDays ?? 0) >= input.minAgeDays))
    .sort((a, b) => (b.ageDays ?? 0) - (a.ageDays ?? 0) || a.villa.localeCompare(b.villa, undefined, { numeric: true }));
  const offset = input.offset ?? 0; const limit = Math.min(input.limit ?? 200, 2000);
  return {
    summary, notCompared, totals: { siteDoneNotReceived: rows.filter(row => row.kind === "site_done_not_received").length, receivedNotDone: rows.filter(row => row.kind === "received_not_done").length },
    total: filtered.length, rows: filtered.slice(offset, offset + limit),
    readiness: { confirmedLinks: state.confirmedLinks, unlinkedColumns: state.unlinkedColumns, consultantColumns: state.columns.length, siteActivities: state.site.length },
  };
}
/** Every difference, unpaged (the Excel export). */
export async function pmcComparisonAll(input: Scope) {
  const db = await pmcGate(input, "project.pmc.read");
  const state = await loadState(db, input);
  return compare(state, await notesOf(db, input), siteToday());
}

export async function savePmcCellNote(input: Scope & { unitId: string; activityCode: string; note: string }) {
  const db = await pmcGate(input, "project.pmc.update");
  const [unit] = await db.select({ id: pmcUnits.id }).from(pmcUnits).where(and(mine(pmcUnits, input), eq(pmcUnits.id, input.unitId))).limit(1);
  if (!unit) throw refuse("NOT_FOUND", "PROJECT_OS_PMC_UNIT_NOT_FOUND");
  const note = input.note.trim().slice(0, 2000); const now = new Date();
  await db.transaction(async tx => {
    if (!note) await tx.delete(pmcCellNotes).where(and(mine(pmcCellNotes, input), eq(pmcCellNotes.unitId, input.unitId), eq(pmcCellNotes.activityCode, input.activityCode)));
    else await tx.insert(pmcCellNotes).values({ id: randomUUID(), tenantId: input.tenantId, projectId: input.projectId, unitId: input.unitId, activityCode: input.activityCode, note, updatedByUserId: input.userId }).onConflictDoUpdate({ target: [pmcCellNotes.unitId, pmcCellNotes.activityCode], set: { note, updatedByUserId: input.userId, updatedAt: now } });
    await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.cell_note_saved", entityType: "pmc_unit", entityId: input.unitId, metadata: JSON.stringify({ projectId: input.projectId, activityCode: input.activityCode, cleared: !note }) });
  });
  return { saved: Boolean(note) };
}

/**
 * One action on many differences at once, all or nothing:
 *   create_inspection — for «finished on site, not handed to the consultant»: an inspection request per activity and villa type, and the site status moves to «inspection requested»;
 *   update_site       — for «received by the consultant, not updated on site»: the site status becomes «done», dated the day the consultant first showed it (or the date given).
 * Each item must still be the difference the action is for; anything else refuses the whole action and says which.
 */
export async function actOnDifferences(input: Scope & { action: "create_inspection" | "update_site"; items: Array<{ unitId: string; activityCode: string }>; date?: string }) {
  const db = await pmcGate(input, "project.pmc.update");
  if (!input.items.length) throw refuse("BAD_REQUEST", "PROJECT_OS_PMC_DIFFERENCE_NOT_FOUND");
  const today = siteToday();
  if (input.date && (!/^\d{4}-\d{2}-\d{2}$/.test(input.date) || input.date > today)) throw refuse("BAD_REQUEST", "PROJECT_OS_SITE_UPDATE_INVALID", [{ code: "SITE_DATE_IN_FUTURE", detail: input.date }]);
  const state = await loadState(db, input);
  const { rows } = compare(state, new Map(), today);
  const byKey = new Map(rows.map(row => [`${row.unitId}|${row.activityCode}`, row]));
  const want: DifferenceKind = input.action === "create_inspection" ? "site_done_not_received" : "received_not_done";
  const chosen = input.items.map(item => ({ item, row: byKey.get(`${item.unitId}|${item.activityCode}`) }));
  const stale = chosen.filter(entry => !entry.row || entry.row.kind !== want);
  if (stale.length) throw refuse("CONFLICT", "PROJECT_OS_PMC_DIFFERENCE_CHANGED", stale.slice(0, 20).map(entry => entry.item));
  const batchId = randomUUID(); const unitById = new Map(state.units.map(unit => [unit.id, unit]));
  const outcome = await db.transaction(async tx => {
    if (input.action === "update_site") {
      let updated = 0;
      for (const { item, row } of chosen) for (const siteActivityId of state.siteFor.get(item.activityCode) ?? []) {
        const cell = state.siteCellByKey.get(`${item.unitId}|${siteActivityId}`);
        if (cell && isSiteDone(cell.status)) continue;
        const date = input.date ?? (row!.firstReceivedOn && row!.firstReceivedOn <= today ? row!.firstReceivedOn : today);
        updated += (await writeSiteStatus(tx, input, [item.unitId], siteActivityId, "DONE", date, { batchId, source: "comparison", userId: input.userId, label: null })).updated;
      }
      return { updated, requests: [] as Array<{ requestCode: string; units: number }> };
    }
    // create_inspection: one request per (activity, villa type), since a catalogue activity is defined per type
    const groups = new Map<string, { def: State["defs"][number]; unitIds: string[] }>();
    for (const { item } of chosen) {
      const unit = unitById.get(item.unitId)!; const def = state.defByModelCode.get(`${unit.modelCode}|${item.activityCode}`);
      if (!def) throw refuse("NOT_FOUND", "PROJECT_OS_PMC_ACTIVITY_NOT_FOUND");
      const group = groups.get(def.id) ?? { def, unitIds: [] }; group.unitIds.push(item.unitId); groups.set(def.id, group);
    }
    const existingCodes = new Set((await tx.select({ code: pmcInspectionRequests.requestCode }).from(pmcInspectionRequests).where(mine(pmcInspectionRequests, input))).map(row => row.code));
    const requests: Array<{ requestCode: string; units: number }> = []; let updated = 0; const requestedAt = new Date(`${input.date ?? today}T00:00:00Z`);
    for (const { def, unitIds } of Array.from(groups.values())) {
      let n = 1; let code = `${def.wirCode ?? def.code}-${def.modelCode}-${(input.date ?? today).replace(/-/g, "")}`;
      while (existingCodes.has(code)) { n += 1; code = `${def.wirCode ?? def.code}-${def.modelCode}-${(input.date ?? today).replace(/-/g, "")}-${n}`; }
      existingCodes.add(code);
      const id = randomUUID(); const units = Array.from(new Set(unitIds));
      await tx.insert(pmcInspectionRequests).values({ id, tenantId: input.tenantId, projectId: input.projectId, requestCode: code.slice(0, 80), activityDefinitionId: def.id, requestedAt, notes: "Created from the site ↔ consultant comparison" });
      await tx.insert(pmcInspectionRequestUnits).values(units.map(unitId => ({ id: randomUUID(), tenantId: input.tenantId, projectId: input.projectId, inspectionRequestId: id, unitId })));
      await tx.insert(pmcInspectionSteps).values(PMC_INSPECTION_STEPS.map((stepCode, index) => ({ id: randomUUID(), tenantId: input.tenantId, projectId: input.projectId, inspectionRequestId: id, stepCode, stepOrder: index + 1, status: index === 0 ? ("in_progress" as const) : ("pending" as const) })));
      requests.push({ requestCode: code, units: units.length });
      for (const unitId of units) for (const siteActivityId of state.siteFor.get(def.code) ?? []) {
        const cell = state.siteCellByKey.get(`${unitId}|${siteActivityId}`);
        if (cell?.status !== "DONE") continue; // already requested or approved: left as it is
        updated += (await writeSiteStatus(tx, input, [unitId], siteActivityId, "INSPECTION_REQUESTED", input.date ?? today, { batchId, source: "comparison", userId: input.userId, label: null })).updated;
      }
    }
    return { updated, requests };
  });
  await db.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: input.action === "create_inspection" ? "pmc.differences_inspection_requested" : "pmc.differences_site_updated", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ items: input.items.length, siteCellsUpdated: outcome.updated, requests: outcome.requests.length, batchId }) });
  return { action: input.action, items: input.items.length, ...outcome };
}

// ------------------------------------------------------------------ riyals and the S-curve

/** Net sellable area × unit price × the weight of what the site has done, per villa. Financial: refused without the permission. */
export async function pmcEarnedValue(input: Scope) {
  const db = await pmcGate(input, FINANCIAL_PERMISSION);
  const state = await loadState(db, input);
  const finance = await db.select({ id: pmcUnits.id, area: pmcUnits.netSellableArea, price: pmcUnits.unitPrice }).from(pmcUnits).where(mine(pmcUnits, input));
  const byId = new Map(finance.map(row => [row.id, row]));
  const villas = state.units.map(unit => {
    const f = byId.get(unit.id); const area = f?.area === null || f?.area === undefined ? null : Number(f.area); const price = f?.price === null || f?.price === undefined ? null : Number(f.price);
    const done = unitShares(state, unit).site;
    const value = area !== null && price !== null ? area * price : null;
    return { unitId: unit.id, villa: unit.villaLabel ?? String(unit.unitNumber), area, price, contractValue: value, sitePercent: done, earnedValue: value === null ? null : Math.round(value * done * 100) / 100 };
  });
  return { villas, total: { contractValue: villas.reduce((s, v) => s + (v.contractValue ?? 0), 0), earnedValue: villas.reduce((s, v) => s + (v.earnedValue ?? 0), 0), villasWithoutPrice: villas.filter(v => v.contractValue === null).length } };
}
export const canSeeFinancials = (input: Scope) => holds(input, FINANCIAL_PERMISSION);

/** The planned months (from the schedule) against the site's actual percentage at the end of each month, and the deviation up to today. */
export async function pmcSiteCurve(input: Scope) {
  const db = await pmcGate(input, "project.pmc.read");
  const state = await loadState(db, input);
  const planned = (await db.select({ month: pmcPlanMonths.month, plannedPercent: pmcPlanMonths.plannedPercent, cumulativePercent: pmcPlanMonths.cumulativePercent, plannedCost: pmcPlanMonths.plannedCost }).from(pmcPlanMonths).where(mine(pmcPlanMonths, input))).sort((a, b) => a.month.localeCompare(b.month));
  const today = siteToday();
  const doneDates: Array<{ date: string; weight: number }> = [];
  for (const unit of state.units) for (const activity of state.site) { const date = doneDateOf(state.siteCellByKey.get(`${unit.id}|${activity.id}`)); if (date) doneDates.push({ date, weight: Number(activity.weight) }); }
  const units = state.units.length || 1;
  const monthEnd = (month: string) => { const d = new Date(`${month}T00:00:00Z`); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10); };
  const actualAt = (date: string) => doneDates.reduce((sum, item) => sum + (item.date <= date ? item.weight : 0), 0) / units;
  const months = planned.length ? planned.map(row => row.month) : Array.from(new Set(doneDates.map(item => `${item.date.slice(0, 7)}-01`))).sort();
  const points = months.map(month => {
    const plan = planned.find(row => row.month === month); const end = monthEnd(month);
    const actual = month <= today ? actualAt(end < today ? end : today) : null;
    const plannedCumulative = plan ? Number(plan.cumulativePercent) : null;
    return { month, plannedPercent: plan ? Number(plan.plannedPercent) : null, plannedCumulative, plannedCost: plan?.plannedCost === null || plan?.plannedCost === undefined ? null : Number(plan.plannedCost), actualCumulative: actual, deviation: actual !== null && plannedCumulative !== null ? actual - plannedCumulative : null };
  });
  const last = points.filter(point => point.actualCumulative !== null).pop() ?? null;
  return { points, today, deviationToDate: last?.deviation ?? null, actualToDate: actualAt(today) };
}
