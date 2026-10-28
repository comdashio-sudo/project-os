// Work order 22: the site's old workbook (Google Sheet + AppSheet + Apps Script) brought in ONCE, so the platform starts with the site's whole history:
//   Weights → the site's activities (their link to the catalogue is SUGGESTED by name, for the owner to confirm once); Contractors → the list;
//   Progress → each villa × activity's current status and the date each status was reached; Progress Log → the dated history (entered by «مُستورد», never an e-mail);
//   Daily + ManPower → the daily reports (without photos whose files are not available); PLanned P6 → the planned monthly curve;
//   Summary Progress → compared with what the platform computes from the imported rows (never written).
// Everything that cannot be taken is listed with its sheet, row and reason (a date in the future, a villa or an activity the project does not have, a missing field).
// `analyze` runs the same steps in a transaction that is rolled back; `confirm` commits them in one transaction. A second import is refused.
import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  auditLogs, dataImportSources, dataImports, pmcActivityDefinitions, pmcContractors, pmcPlanMonths, pmcSiteActivities, pmcSiteActivityLinks, pmcSiteCellEvents, pmcSiteCells, pmcUnits,
  siteDailyReportLines, siteDailyReports,
} from "../drizzle/schema";
import { isDuplicateEntryError } from "./db";
import { normaliseName, suggestLinks } from "./domain/pmcActivityMatch";
import { readGrid } from "./domain/smartImport/sheetReader";
import { IMPORTED_BY, isSiteWorkbook, readSiteWorkbook, type SiteRejection, type SiteStatus, type SiteWorkbook } from "./domain/smartImport/siteWorkbook";
import { assertNotImportedYet, chunks, FINANCIAL_PERMISSION, holds, pmcGate, siteToday, unitsByVilla, villaKey, type Db, type Scope } from "./wo22Shared";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
const ORDER: SiteStatus[] = ["NOT_STARTED", "IN_PROGRESS", "DONE", "INSPECTION_REQUESTED", "QC_APPROVED"];
const DATE_COLUMN = { NOT_STARTED: "notStartedOn", IN_PROGRESS: "inProgressOn", DONE: "doneOn", INSPECTION_REQUESTED: "inspectionRequestedOn", QC_APPROVED: "qcApprovedOn" } as const;
const codeFor = (name: string) => `S-${createHash("sha256").update(normaliseName(name)).digest("hex").slice(0, 8).toUpperCase()}`;

export type SiteLegacyPlan = {
  fileHash: string; asOf: string; sheets: SiteWorkbook["sheets"];
  activities: number; weightTotal: number; suggestedLinks: number; unlinkedSiteActivities: number; unlinkedCatalogActivities: number;
  contractors: number; cells: number; cellsByStatus: Record<string, number>; historyEvents: number; logEvents: number; financialVillas: number; financialSkipped: boolean;
  dailyReports: number; labourLines: number; equipmentLines: number; photosNotAvailable: number; planMonths: number;
  /** the sheet's own Summary Progress against the platform's count from the imported rows */
  summaryCompared: number; summaryMismatches: Array<{ activity: string; sheet: number; platform: number }>;
  rejected: SiteRejection[]; rejectedByReason: Record<string, number>;
  errors: Array<{ code: string; detail?: string }>;
  canConfirm: boolean;
};
class Rollback extends Error { constructor(readonly plan: SiteLegacyPlan) { super("rollback"); } }

async function read(bytes: Uint8Array) {
  const grid = await readGrid(bytes, "xlsx");
  if (!grid.ok) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_IMPORT_FILE_INVALID" });
  if (!isSiteWorkbook(grid.sheets)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_SITE_WORKBOOK_NOT_RECOGNISED" });
  const asOf = siteToday();
  return { book: readSiteWorkbook(grid.sheets, asOf), asOf, fileHash: createHash("sha256").update(bytes).digest("hex") };
}

async function run(tx: Tx, input: Scope & { financial: boolean }, book: SiteWorkbook, asOf: string, fileHash: string, source: { key: string; name: string } | null, commit: boolean): Promise<SiteLegacyPlan & { importId?: string }> {
  const rejected = [...book.rejected];
  const plan: SiteLegacyPlan = { fileHash, asOf, sheets: book.sheets, activities: 0, weightTotal: 0, suggestedLinks: 0, unlinkedSiteActivities: 0, unlinkedCatalogActivities: 0, contractors: 0, cells: 0, cellsByStatus: {}, historyEvents: 0, logEvents: 0, financialVillas: 0, financialSkipped: false, dailyReports: 0, labourLines: 0, equipmentLines: 0, photosNotAvailable: 0, planMonths: 0, summaryCompared: 0, summaryMismatches: [], rejected, rejectedByReason: {}, errors: [], canConfirm: false };
  const done = () => { for (const item of rejected) plan.rejectedByReason[item.reason] = (plan.rejectedByReason[item.reason] ?? 0) + 1; plan.rejected = rejected.slice(0, 500); return plan; };
  const already = await tx.select({ id: pmcSiteCellEvents.id }).from(pmcSiteCellEvents).where(and(eq(pmcSiteCellEvents.tenantId, input.tenantId), eq(pmcSiteCellEvents.projectId, input.projectId), inArray(pmcSiteCellEvents.source, ["legacy", "legacy_log"]))).limit(1);
  if (already.length) { plan.errors.push({ code: "SITE_LEGACY_ALREADY_IMPORTED" }); throw new Rollback(done()); }
  const { byVilla } = await unitsByVilla(tx, input);
  if (!byVilla.size) { plan.errors.push({ code: "SITE_NO_UNITS_IN_PROJECT" }); throw new Rollback(done()); } // the monthly report builds the villas first
  plan.weightTotal = book.activities.reduce((sum, activity) => sum + activity.weight, 0);
  if (Math.abs(plan.weightTotal - 1) > 1e-6) plan.errors.push({ code: "SITE_WEIGHTS_NOT_100", detail: `${(plan.weightTotal * 100).toFixed(4)}%` });
  if (!book.activities.length) plan.errors.push({ code: "SITE_NO_ACTIVITIES" });
  if (plan.errors.length) throw new Rollback(done());

  // 1. the site's activities (by name), and the suggested links to the catalogue
  const existing = await tx.select({ id: pmcSiteActivities.id, code: pmcSiteActivities.code }).from(pmcSiteActivities).where(and(eq(pmcSiteActivities.tenantId, input.tenantId), eq(pmcSiteActivities.projectId, input.projectId)));
  const existingByCode = new Map(existing.map(item => [item.code, item.id]));
  const activityByName = new Map<string, string>(); const usedCodes = new Set<string>();
  for (const [index, activity] of Array.from(book.activities.entries())) {
    let code = codeFor(`${activity.csi}|${activity.name}`); for (let n = 2; usedCodes.has(code); n++) code = `${codeFor(`${activity.csi}|${activity.name}`)}-${n}`; usedCodes.add(code);
    const id = existingByCode.get(code) ?? randomUUID();
    if (existingByCode.has(code)) await tx.update(pmcSiteActivities).set({ csiName: activity.csi.slice(0, 255) || "—", subName: activity.sub.slice(0, 255) || null, name: activity.name.slice(0, 255), weight: String(activity.weight), sortOrder: index, updatedAt: new Date() }).where(eq(pmcSiteActivities.id, id));
    else await tx.insert(pmcSiteActivities).values({ id, tenantId: input.tenantId, projectId: input.projectId, code, csiName: activity.csi.slice(0, 255) || "—", subName: activity.sub.slice(0, 255) || null, name: activity.name.slice(0, 255), weight: String(activity.weight), sortOrder: index });
    activityByName.set(normaliseName(activity.name), id);
  }
  plan.activities = book.activities.length;
  const catalog = await tx.select({ code: pmcActivityDefinitions.code, name: pmcActivityDefinitions.name }).from(pmcActivityDefinitions).where(and(eq(pmcActivityDefinitions.tenantId, input.tenantId), eq(pmcActivityDefinitions.projectId, input.projectId)));
  const catalogUnique = Array.from(new Map(catalog.map(item => [item.code, item])).values());
  const siteRefs = book.activities.map(activity => ({ id: activityByName.get(normaliseName(activity.name))!, name: activity.name, section: activity.csi }));
  const suggestion = suggestLinks(siteRefs, catalogUnique);
  const linked = new Set((await tx.select({ siteActivityId: pmcSiteActivityLinks.siteActivityId }).from(pmcSiteActivityLinks).where(and(eq(pmcSiteActivityLinks.tenantId, input.tenantId), eq(pmcSiteActivityLinks.projectId, input.projectId)))).map(row => row.siteActivityId));
  const newLinks = suggestion.links.filter(link => !linked.has(link.siteActivityId));
  for (const batch of chunks(newLinks, 500)) await tx.insert(pmcSiteActivityLinks).values(batch.map(link => ({ id: randomUUID(), tenantId: input.tenantId, projectId: input.projectId, siteActivityId: link.siteActivityId, activityCode: link.activityCode, score: String(link.score), confirmed: false })));
  plan.suggestedLinks = suggestion.links.length; plan.unlinkedSiteActivities = suggestion.unmatchedSite.length; plan.unlinkedCatalogActivities = suggestion.unmatchedCatalog.length;

  // 2. contractors
  const knownContractors = new Map((await tx.select({ id: pmcContractors.id, name: pmcContractors.name }).from(pmcContractors).where(and(eq(pmcContractors.tenantId, input.tenantId), eq(pmcContractors.projectId, input.projectId)))).map(row => [row.name.trim().toLowerCase(), row.id]));
  for (const contractor of book.contractors) {
    if (knownContractors.has(contractor.name.trim().toLowerCase())) continue;
    const id = randomUUID(); await tx.insert(pmcContractors).values({ id, tenantId: input.tenantId, projectId: input.projectId, name: contractor.name.slice(0, 255), number: contractor.number?.slice(0, 80) ?? null });
    knownContractors.set(contractor.name.trim().toLowerCase(), id); plan.contractors += 1;
  }
  for (const villa of book.villas) if (!byVilla.has(villaKey(villa.villa))) rejected.push({ sheet: "Villa", row: villa.row, reason: "SITE_VILLA_UNKNOWN", detail: villa.villa });

  // 3. Progress: the current status of every villa × activity, with the date of each status; the dated steps become the history
  const cells: Array<typeof pmcSiteCells.$inferInsert> = []; const events: Array<typeof pmcSiteCellEvents.$inferInsert> = [];
  const cellId = new Map<string, string>(); const eventKey = new Set<string>();
  const finance = new Map<string, { area: number; price: number }>();
  for (const row of book.progress) {
    const unit = byVilla.get(villaKey(row.villa)); const activityId = activityByName.get(normaliseName(row.activity));
    if (!unit) { rejected.push({ sheet: "Progress", row: row.row, reason: "SITE_VILLA_UNKNOWN", detail: row.villa }); continue; }
    if (!activityId) { rejected.push({ sheet: "Progress", row: row.row, reason: "SITE_ACTIVITY_UNKNOWN", detail: row.activity }); continue; }
    const key = `${unit.id}|${activityId}`;
    if (cellId.has(key)) { rejected.push({ sheet: "Progress", row: row.row, reason: "SITE_ROW_DUPLICATE", detail: `${row.villa} · ${row.activity}` }); continue; }
    const id = randomUUID(); cellId.set(key, id);
    const steps = ORDER.filter(step => row.dates[step]);
    const statusOn = row.statusDate ?? row.dates[row.status] ?? (steps.length ? row.dates[steps[steps.length - 1]]! : null);
    const dates = Object.fromEntries(steps.map(step => [DATE_COLUMN[step], row.dates[step]!]));
    if (row.status !== "NOT_STARTED" && statusOn && !row.dates[row.status]) (dates as Record<string, string>)[DATE_COLUMN[row.status]] = statusOn;
    cells.push({ id, tenantId: input.tenantId, projectId: input.projectId, unitId: unit.id, siteActivityId: activityId, status: row.status, statusOn, ...dates, updatedByUserId: null, updatedByLabel: IMPORTED_BY });
    plan.cellsByStatus[row.status] = (plan.cellsByStatus[row.status] ?? 0) + 1;
    let from: SiteStatus | null = null;
    for (const step of ORDER.slice(1)) {
      const date = (dates as Record<string, string | undefined>)[DATE_COLUMN[step]];
      if (!date || ORDER.indexOf(step) > ORDER.indexOf(row.status)) continue;
      events.push({ id: randomUUID(), tenantId: input.tenantId, projectId: input.projectId, cellId: id, fromStatus: from, toStatus: step, statusOn: date, enteredByUserId: null, enteredByLabel: IMPORTED_BY, source: "legacy" });
      eventKey.add(`${id}|${step}|${date}`); from = step;
    }
    if (row.area !== null && row.price !== null && !finance.has(unit.id)) finance.set(unit.id, { area: row.area, price: row.price });
  }
  plan.cells = cells.length; plan.historyEvents = events.length;
  // Progress Log: what AppSheet received, one row per villa; a step the Progress history already holds is not doubled
  for (const row of book.log) {
    const unit = byVilla.get(villaKey(row.villa)); const activityId = activityByName.get(normaliseName(row.activity));
    if (!unit) { rejected.push({ sheet: "Progress Log", row: row.row, reason: "SITE_VILLA_UNKNOWN", detail: row.villa }); continue; }
    if (!activityId) { rejected.push({ sheet: "Progress Log", row: row.row, reason: "SITE_ACTIVITY_UNKNOWN", detail: row.activity }); continue; }
    const id = cellId.get(`${unit.id}|${activityId}`);
    if (!id) { rejected.push({ sheet: "Progress Log", row: row.row, reason: "SITE_CELL_NOT_IN_PROGRESS", detail: `${row.villa} · ${row.activity}` }); continue; }
    if (eventKey.has(`${id}|${row.status}|${row.date}`)) continue;
    eventKey.add(`${id}|${row.status}|${row.date}`);
    events.push({ id: randomUUID(), tenantId: input.tenantId, projectId: input.projectId, cellId: id, fromStatus: null, toStatus: row.status, statusOn: row.date, enteredByUserId: null, enteredByLabel: IMPORTED_BY, source: "legacy_log" });
    plan.logEvents += 1;
  }
  for (const batch of chunks(cells, 1000)) await tx.insert(pmcSiteCells).values(batch);
  for (const batch of chunks(events, 1000)) await tx.insert(pmcSiteCellEvents).values(batch);
  // area and unit price: financial, written only by a person who holds the financial permission
  if (input.financial) {
    for (const batch of chunks(Array.from(finance.entries()), 100)) await Promise.all(batch.map(([unitId, value]) => tx.update(pmcUnits).set({ netSellableArea: String(value.area), unitPrice: String(value.price) }).where(and(eq(pmcUnits.id, unitId), eq(pmcUnits.tenantId, input.tenantId))).returning({ id: pmcUnits.id }).then(rows => { if (rows.length !== 1) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_IMPORT_VALIDATION_FAILED" }); })));
    plan.financialVillas = finance.size;
  } else plan.financialSkipped = finance.size > 0;

  // 4. the daily reports (one per day and contractor), their equipment and the labour by WBS code
  const reportKey = new Map<string, string>();
  const reportFor = async (date: string, contractorName: string, row: number, sheet: string) => {
    const contractorId = knownContractors.get(contractorName.trim().toLowerCase()) ?? null;
    if (contractorName && !contractorId) { rejected.push({ sheet, row, reason: "SITE_CONTRACTOR_UNKNOWN", detail: contractorName }); return null; }
    const key = `${date}|${contractorId ?? ""}`;
    if (reportKey.has(key)) return reportKey.get(key)!;
    const id = randomUUID();
    await tx.insert(siteDailyReports).values({ id, tenantId: input.tenantId, projectId: input.projectId, reportDate: date, contractorId, status: "submitted", preparedByUserId: input.userId, sourceLabel: IMPORTED_BY, submittedAt: new Date(`${date}T12:00:00Z`) });
    reportKey.set(key, id); plan.dailyReports += 1;
    return id;
  };
  const inspection = (value: string | null) => { const word = (value ?? "").toLowerCase().replace(/\s+/g, ""); return word === "approved" ? "approved" : word === "submitted" ? "submitted" : word === "notsubmitted" ? "not_submitted" : null; };
  for (const row of book.daily) {
    const reportId = await reportFor(row.date, row.contractor, row.row, "Daily");
    if (!reportId) continue;
    await tx.update(siteDailyReports).set({ mainLabourCount: row.mainLabour === null ? null : Math.round(row.mainLabour), subLabourCount: row.subLabour === null ? null : Math.round(row.subLabour), inspectionStatus: inspection(row.inspectionStatus), dayProgressPercent: row.todayPercent === null ? null : String(Math.round(row.todayPercent * 1e4) / 1e4), remainingDays: row.remainingDays === null ? null : Math.round(row.remainingDays), summary: row.note, obstacles: row.problems, recommendations: row.recommendations }).where(eq(siteDailyReports.id, reportId));
    if (row.equipment) { await tx.insert(siteDailyReportLines).values({ id: randomUUID(), tenantId: input.tenantId, projectId: input.projectId, reportId, lineType: "equipment", label: row.equipment.slice(0, 160), quantity: row.equipmentCount === null ? null : String(row.equipmentCount) }); plan.equipmentLines += 1; }
    plan.photosNotAvailable += row.photos.length;
  }
  for (const row of book.manpower) {
    const reportId = await reportFor(row.date, row.contractor, row.row, "ManPower");
    if (!reportId) continue;
    await tx.insert(siteDailyReportLines).values({ id: randomUUID(), tenantId: input.tenantId, projectId: input.projectId, reportId, lineType: "labour", wbsCode: row.wbsCode.split(/\s+/)[0].slice(0, 40), label: row.wbsCode.slice(0, 160), quantity: String(row.count) });
    plan.labourLines += 1;
  }
  // 5. the planned monthly curve
  for (const row of book.plan) {
    await tx.insert(pmcPlanMonths).values({ id: randomUUID(), tenantId: input.tenantId, projectId: input.projectId, month: row.month, plannedCost: row.cost === null ? null : String(row.cost), plannedPercent: String(row.percent), cumulativePercent: String(row.cumulativePercent) })
      .onConflictDoUpdate({ target: [pmcPlanMonths.projectId, pmcPlanMonths.month], set: { plannedCost: row.cost === null ? null : String(row.cost), plannedPercent: String(row.percent), cumulativePercent: String(row.cumulativePercent) } });
    plan.planMonths += 1;
  }
  // 6. the sheet's Summary Progress against the platform's own count (compared, never written)
  const completedByActivity = new Map<string, number>();
  for (const cell of cells) if (cell.status === "DONE" || cell.status === "INSPECTION_REQUESTED" || cell.status === "QC_APPROVED") completedByActivity.set(cell.siteActivityId, (completedByActivity.get(cell.siteActivityId) ?? 0) + 1);
  for (const row of book.summary) {
    const id = activityByName.get(normaliseName(row.activity)); if (!id) continue;
    plan.summaryCompared += 1;
    const platform = completedByActivity.get(id) ?? 0;
    if (platform !== row.completed) plan.summaryMismatches.push({ activity: row.activity, sheet: row.completed, platform });
  }
  plan.canConfirm = plan.cells > 0;
  done();
  if (!commit || !source) throw new Rollback(plan);

  const importId = randomUUID(); const now = new Date();
  await tx.insert(dataImports).values({
    id: importId, tenantId: input.tenantId, projectId: input.projectId, moduleCode: "pmcSiteLegacy", templateCode: "pmcSiteLegacy_v1", sourceFormat: "xlsx", fileName: source.name, fileKey: source.key, fileHash, status: "completed",
    totalRows: book.progress.length + book.log.length + book.daily.length, validRows: plan.cells + plan.logEvents + plan.dailyReports, invalidRows: rejected.length, createdRows: plan.cells, updatedRows: 0, skippedRows: rejected.length,
    summaryJson: JSON.stringify({ siteLegacy: { activities: plan.activities, cells: plan.cells, historyEvents: plan.historyEvents, logEvents: plan.logEvents, dailyReports: plan.dailyReports, planMonths: plan.planMonths, rejectedByReason: plan.rejectedByReason, summaryMismatches: plan.summaryMismatches.length } }),
    createdByUserId: input.userId, progressPercent: 100, completedAt: now,
  });
  await tx.insert(dataImportSources).values({ importId, tenantId: input.tenantId, projectId: input.projectId, sourceKey: source.key, sourceName: source.name, detectedKind: "siteWorkbook", sheetName: null, mappingJson: JSON.stringify({ sheets: book.sheets.found }), mergedCellsFilled: 0 });
  await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.site_legacy_imported", entityType: "data_import", entityId: importId, metadata: JSON.stringify({ projectId: input.projectId, fileHash, cells: plan.cells, events: plan.historyEvents + plan.logEvents, rejected: rejected.length, financial: input.financial }) });
  return { ...plan, importId };
}

async function inTransaction(input: Scope, book: SiteWorkbook, asOf: string, fileHash: string, source: { key: string; name: string } | null, commit: boolean) {
  const db = await pmcGate(input, "project.pmc.manage");
  const financial = await holds(input, FINANCIAL_PERMISSION);
  try { return await db.transaction(tx => run(tx, { ...input, financial }, book, asOf, fileHash, source, commit)); }
  catch (error) { if (error instanceof Rollback) return error.plan; if (isDuplicateEntryError(error)) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_IMPORT_DUPLICATE_DETECTED" }); throw error; }
}

export async function analyzeSiteLegacyImport(input: Scope & { bytes: Uint8Array }): Promise<SiteLegacyPlan> {
  const { book, asOf, fileHash } = await read(input.bytes);
  return inTransaction(input, book, asOf, fileHash, null, false);
}

export async function confirmSiteLegacyImport(input: Scope & { bytes: Uint8Array; approvedHash?: string; source: { key: string; name: string } }): Promise<SiteLegacyPlan & { importId?: string }> {
  const { book, asOf, fileHash } = await read(input.bytes);
  if (input.approvedHash && input.approvedHash !== fileHash) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_PMC_IMPORT_FILE_CHANGED" });
  const db = await pmcGate(input, "project.pmc.manage");
  await assertNotImportedYet(db, { tenantId: input.tenantId, fileHash });
  const plan = await inTransaction(input, book, asOf, fileHash, input.source, true);
  if (plan.errors.length || !plan.canConfirm || !(plan as { importId?: string }).importId) throw new TRPCError({ code: "BAD_REQUEST", message: plan.errors[0]?.code === "SITE_LEGACY_ALREADY_IMPORTED" ? "PROJECT_OS_SITE_LEGACY_ALREADY_IMPORTED" : "PROJECT_OS_IMPORT_VALIDATION_FAILED", cause: plan.errors });
  return plan;
}
