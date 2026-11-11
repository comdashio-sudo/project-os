// The site's daily report (work order 12, item 4): labour and equipment per activity, the work done (per unit and activity), the weather, photos and obstacles.
// The engineer prepares and submits it; the project manager approves it, and the approval is what moves the progress of the cells the report names, in the same
// transaction. Decisions that were not in the order (recorded in docs/STATE.md): one report per engineer per project per day; the preparer cannot approve their own
// report (it holds for the company owner too); an approved report only moves a cell FORWARD (a report cannot take back progress the cell already has); a COMPLETE line
// obeys the company's quality policy like any other path to COMPLETE.
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { auditLogs, pmcActivityDefinitions, pmcBlocks, pmcUnitActivityProgress, pmcUnits, pmcZones, projectCompanies, projectEquipment, projectLabourRoles, projectProfiles, projectReportCounters, consultantSubmittals, siteDailyReportEquipment, siteDailyReportHse, siteDailyReportLabour, siteDailyReportMaterials, siteDailyReportObstacles, siteDailyReportTomorrow, siteDailyReportLines, siteDailyReportPhotos, siteDailyReports } from "../drizzle/schema";
import { siteToday } from "./wo22Shared";
import { violates } from "./projectProfile";
import { assertProjectWithinTenant, assertTenantFeatureAccess, ensureDefaultCommercialCatalog, getDb, getTenantAccessSnapshot } from "./db";
import { assertTenantAccess } from "./domain/authorization";
import type { PmcUnitActivityStatus } from "./domain/pmc";
import { takeDirectUpload } from "./directUploadKeys";
import { applyCellStatus, type CellWarning } from "./pmcService";
import { emitWebhookEvent, kickWebhookDelivery } from "./integrations/webhooks";
import { qcCompletionGate } from "./qualityGate";
import { storageDelete, storageGetSignedUrl, storagePut } from "./storage";

type Scope = { userId: number; tenantId: string; projectId: string };
const refuse = (code: "BAD_REQUEST" | "NOT_FOUND" | "CONFLICT" | "FORBIDDEN", message: string) => new TRPCError({ code, message });
const RANK: Record<PmcUnitActivityStatus, number> = { NOT_STARTED: 0, IN_PROGRESS: 1, UNDER_REVIEW: 2, COMPLETE: 3 };
const MAX_PHOTO_BYTES = 10 * 1024 * 1024;
const MAX_PHOTOS_PER_REPORT = 30;

export type ReportLineInput = { lineType: "labour" | "equipment" | "work"; label?: string; quantity?: number; hours?: number; description?: string; pmcUnitId?: string; pmcActivityDefinitionId?: string; reportedStatus?: PmcUnitActivityStatus; plannedQuantity?: number; actualQuantity?: number };
/** D-45 (a): one cell of the labour matrix (a company on the project × a labour role × a shift → headcount) and one machine of the project's equipment list. */
export type ReportLabourInput = { companyId: string; labourRoleId: string; shift: "day" | "night"; headcount: number };
export type ReportEquipmentInput = { equipmentId: string; count: number; hours?: number };
/** D-45 (b): the report's other sections — materials received, HSE events, obstacles, the plan for tomorrow. Each list is replaced whole on every save. */
export const HSE_KINDS = ["meeting", "incident", "near_miss", "violation", "corrective_action"] as const;
export type ReportMaterialInput = { material: string; quantity: number; unit: string; supplier?: string; consultantSubmittalId?: string };
export type ReportHseInput = { kind: (typeof HSE_KINDS)[number]; description: string; peopleCount?: number; actionTaken?: string };
export type ReportObstacleInput = { issue: string; impact?: string; responsible?: string; action?: string; dueDate?: string };
export type ReportTomorrowInput = { area?: string; activity: string; quantity?: number; unit?: string; resources?: string };
type Sections = { materials?: ReportMaterialInput[]; hse?: ReportHseInput[]; obstacleItems?: ReportObstacleInput[]; tomorrow?: ReportTomorrowInput[] };
export type ReportInput = Sections & { reportDate: string; weather?: string; temperatureC?: number; wind?: string; workHours?: number; summary?: string; obstacles?: string; lines: ReportLineInput[]; labour?: ReportLabourInput[]; equipment?: ReportEquipmentInput[] };

async function authorize(input: Scope, permission: string | readonly string[]) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw refuse("FORBIDDEN", "PROJECT_OS_TENANT_ACCESS_DENIED");
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission, scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  return db;
}
const mine = <T extends { tenantId: unknown; projectId: unknown }>(table: T, input: Scope) => and(eq(table.tenantId as never, input.tenantId), eq(table.projectId as never, input.projectId));
/**
 * One report per preparer, project and day (and contractor, from work order 22): the unique index decides. The check before the transaction answers the usual case;
 * two saves or copies at the same moment both pass it, and the one that loses the race meets the index — said here as «a report for this day exists», not a 500.
 */
async function oneReportPerDay<T>(write: Promise<T>): Promise<T> {
  try { return await write; } catch (error) {
    if (violates(error, "site_daily_reports_project_date_preparer_unique")) throw refuse("CONFLICT", "PROJECT_OS_SITE_REPORT_EXISTS");
    throw error;
  }
}
// the reports written here have no contractor (a work-order-22 import does): the save, the copy and its «already there» check all look at those only
const ownDayReports = (input: Scope) => and(mine(siteDailyReports, input), eq(siteDailyReports.preparedByUserId, input.userId), sql`${siteDailyReports.contractorId} IS NULL`);
// the calendar day on site (UTC+3): «a date in the future» is judged against this (D-45 a), not the server's UTC midnight
const today = () => siteToday();
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** The next number of the project's daily reports, inside the report's own transaction: an atomic upsert on the counter row (two reports at once get two numbers). */
async function nextReportNumber(tx: Tx, input: Scope) {
  const [row] = await tx.insert(projectReportCounters).values({ id: crypto.randomUUID(), tenantId: input.tenantId, projectId: input.projectId, kind: "daily", lastNumber: 1 })
    .onConflictDoUpdate({ target: [projectReportCounters.tenantId, projectReportCounters.projectId, projectReportCounters.kind], set: { lastNumber: sql`${projectReportCounters.lastNumber} + 1`, updatedAt: new Date() } })
    .returning({ lastNumber: projectReportCounters.lastNumber });
  const [profile] = await tx.select({ prefix: projectProfiles.reportPrefix }).from(projectProfiles).where(mine(projectProfiles, input)).limit(1);
  return `${profile?.prefix ?? "DR"}-${String(row.lastNumber).padStart(4, "0")}`;
}

/** The labour matrix and the equipment name only this project's companies, roles and machines (the composite foreign keys hold the same; this says it first, translated). */
async function validateResources(db: Db, input: Scope, labour: ReportLabourInput[], equipment: ReportEquipmentInput[]) {
  const cells = new Set<string>();
  for (const row of labour) {
    const key = `${row.companyId}|${row.labourRoleId}|${row.shift}`;
    if (cells.has(key)) throw refuse("BAD_REQUEST", "PROJECT_OS_SITE_REPORT_LABOUR_DUPLICATE");
    cells.add(key);
  }
  if (new Set(equipment.map(row => row.equipmentId)).size !== equipment.length) throw refuse("BAD_REQUEST", "PROJECT_OS_SITE_REPORT_EQUIPMENT_DUPLICATE");
  const ids = (values: string[]) => Array.from(new Set(values));
  const [companies, roles, machines] = await Promise.all([
    labour.length ? db.select({ id: projectCompanies.id }).from(projectCompanies).where(and(mine(projectCompanies, input), inArray(projectCompanies.id, ids(labour.map(row => row.companyId))))) : Promise.resolve([]),
    labour.length ? db.select({ id: projectLabourRoles.id }).from(projectLabourRoles).where(and(mine(projectLabourRoles, input), inArray(projectLabourRoles.id, ids(labour.map(row => row.labourRoleId))))) : Promise.resolve([]),
    equipment.length ? db.select({ id: projectEquipment.id }).from(projectEquipment).where(and(mine(projectEquipment, input), inArray(projectEquipment.id, ids(equipment.map(row => row.equipmentId))))) : Promise.resolve([]),
  ]);
  if (companies.length !== ids(labour.map(row => row.companyId)).length || roles.length !== ids(labour.map(row => row.labourRoleId)).length || machines.length !== ids(equipment.map(row => row.equipmentId)).length) throw refuse("NOT_FOUND", "PROJECT_OS_SITE_REPORT_REFERENCE_NOT_FOUND");
}
/** A calendar date that exists («2026-02-30» does not, though Date.parse rolls it over). */
const realDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
/** A material may name the consultant's approval of it: a submittal of THIS project (the composite foreign key holds the same). */
async function validateSections(db: Db, input: Scope, sections: Sections) {
  const submittals = Array.from(new Set((sections.materials ?? []).flatMap(row => (row.consultantSubmittalId ? [row.consultantSubmittalId] : []))));
  if (submittals.length && (await db.select({ id: consultantSubmittals.id }).from(consultantSubmittals).where(and(mine(consultantSubmittals, input), inArray(consultantSubmittals.id, submittals)))).length !== submittals.length) throw refuse("NOT_FOUND", "PROJECT_OS_SITE_REPORT_REFERENCE_NOT_FOUND");
  if ((sections.obstacleItems ?? []).some(row => row.dueDate !== undefined && !realDate(row.dueDate))) throw refuse("BAD_REQUEST", "PROJECT_OS_SITE_REPORT_LINE_INVALID");
}
const text = (value: string | undefined) => value?.trim() || null;
const amount = (value: number | undefined) => (value === undefined ? null : String(value));
/** Replaces the four section lists of a report inside the save's transaction. */
async function writeSections(tx: Tx, input: Scope, reportId: string, sections: Sections, replace: boolean) {
  const base = (index: number) => ({ id: crypto.randomUUID(), tenantId: input.tenantId, projectId: input.projectId, reportId, sortOrder: index });
  // a section the save does not send is left as it is; an empty list clears it (review of #240: the merged screen saves the header alone)
  const sent = [[siteDailyReportMaterials, sections.materials], [siteDailyReportHse, sections.hse], [siteDailyReportObstacles, sections.obstacleItems], [siteDailyReportTomorrow, sections.tomorrow]] as const;
  if (replace) for (const [table, rows] of sent) if (rows !== undefined) await tx.delete(table).where(and(mine(table, input), eq(table.reportId, reportId)));
  if (sections.materials?.length) await tx.insert(siteDailyReportMaterials).values(sections.materials.map((row, i) => ({ ...base(i), material: row.material.trim(), quantity: String(row.quantity), unit: row.unit.trim(), supplier: text(row.supplier), consultantSubmittalId: row.consultantSubmittalId ?? null })));
  if (sections.hse?.length) await tx.insert(siteDailyReportHse).values(sections.hse.map((row, i) => ({ ...base(i), kind: row.kind, description: row.description.trim(), peopleCount: row.peopleCount ?? null, actionTaken: text(row.actionTaken) })));
  if (sections.obstacleItems?.length) await tx.insert(siteDailyReportObstacles).values(sections.obstacleItems.map((row, i) => ({ ...base(i), issue: row.issue.trim(), impact: text(row.impact), responsible: text(row.responsible), action: text(row.action), dueDate: row.dueDate ?? null })));
  if (sections.tomorrow?.length) await tx.insert(siteDailyReportTomorrow).values(sections.tomorrow.map((row, i) => ({ ...base(i), area: text(row.area), activity: row.activity.trim(), quantity: amount(row.quantity), unit: text(row.unit), resources: text(row.resources) })));
}
const labourRows = (input: Scope, reportId: string, labour: ReportLabourInput[]) => labour.map(row => ({ id: crypto.randomUUID(), tenantId: input.tenantId, projectId: input.projectId, reportId, ...row }));
const equipmentRows = (input: Scope, reportId: string, equipment: Array<{ equipmentId: string; count: number; hours?: number | string | null }>) => equipment.map(row => ({ id: crypto.randomUUID(), tenantId: input.tenantId, projectId: input.projectId, reportId, equipmentId: row.equipmentId, count: row.count, hours: row.hours === undefined || row.hours === null ? null : String(row.hours) }));

/** Every line is checked before anything is written: a labour or equipment line says what and how many; a work line names a real unit and one of its own model's activities. */
async function validateLines(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, input: Scope, lines: ReportLineInput[]) {
  const unitIds = Array.from(new Set(lines.flatMap(line => (line.pmcUnitId ? [line.pmcUnitId] : []))));
  const activityIds = Array.from(new Set(lines.flatMap(line => (line.pmcActivityDefinitionId ? [line.pmcActivityDefinitionId] : []))));
  const [units, definitions] = await Promise.all([
    unitIds.length ? db.select({ id: pmcUnits.id, modelCode: pmcUnits.modelCode }).from(pmcUnits).where(and(mine(pmcUnits, input), inArray(pmcUnits.id, unitIds))) : Promise.resolve([]),
    activityIds.length ? db.select({ id: pmcActivityDefinitions.id, modelCode: pmcActivityDefinitions.modelCode }).from(pmcActivityDefinitions).where(and(mine(pmcActivityDefinitions, input), inArray(pmcActivityDefinitions.id, activityIds))) : Promise.resolve([]),
  ]);
  const unitModel = new Map(units.map(unit => [unit.id, unit.modelCode])); const activityModel = new Map(definitions.map(definition => [definition.id, definition.modelCode]));
  for (const line of lines) {
    if (line.pmcUnitId && !unitModel.has(line.pmcUnitId)) throw refuse("NOT_FOUND", "PROJECT_OS_PMC_UNIT_NOT_FOUND");
    if (line.pmcActivityDefinitionId && !activityModel.has(line.pmcActivityDefinitionId)) throw refuse("NOT_FOUND", "PROJECT_OS_PMC_ACTIVITY_NOT_FOUND");
    if (line.pmcUnitId && line.pmcActivityDefinitionId && unitModel.get(line.pmcUnitId) !== activityModel.get(line.pmcActivityDefinitionId)) throw refuse("BAD_REQUEST", "PROJECT_OS_PMC_ACTIVITY_NOT_IN_UNIT_MODEL");
    if (line.lineType === "work") {
      if (line.reportedStatus && !(line.pmcUnitId && line.pmcActivityDefinitionId)) throw refuse("BAD_REQUEST", "PROJECT_OS_SITE_REPORT_STATUS_NEEDS_CELL");
      if (!line.description?.trim() && !line.reportedStatus) throw refuse("BAD_REQUEST", "PROJECT_OS_SITE_REPORT_LINE_INVALID");
    } else if (!line.label?.trim() || !(Number(line.quantity) > 0) || (line.hours !== undefined && !(Number(line.hours) >= 0))) throw refuse("BAD_REQUEST", "PROJECT_OS_SITE_REPORT_LINE_INVALID");
  }
}

export async function saveSiteDailyReportForTenant(input: Scope & ReportInput) {
  const db = await authorize(input, "project.field.manage");
  if (!realDate(input.reportDate)) throw refuse("BAD_REQUEST", "PROJECT_OS_SITE_REPORT_DATE_INVALID");
  if (input.reportDate > today()) throw refuse("BAD_REQUEST", "PROJECT_OS_SITE_REPORT_DATE_FUTURE");
  await validateLines(db, input, input.lines);
  await validateResources(db, input, input.labour ?? [], input.equipment ?? []);
  await validateSections(db, input, input);
  const [existing] = await db.select().from(siteDailyReports).where(and(ownDayReports(input), eq(siteDailyReports.reportDate, input.reportDate))).limit(1);
  if (existing && (existing.status === "submitted" || existing.status === "approved")) throw refuse("CONFLICT", "PROJECT_OS_SITE_REPORT_LOCKED");
  const id = existing?.id ?? crypto.randomUUID();
  await oneReportPerDay(db.transaction(async tx => {
    const header = { weather: input.weather?.trim() || null, temperatureC: input.temperatureC === undefined ? null : String(input.temperatureC), wind: input.wind?.trim() || null, workHours: input.workHours === undefined ? null : String(input.workHours), summary: input.summary?.trim() || null, obstacles: input.obstacles?.trim() || null };
    if (existing) {
      await tx.update(siteDailyReports).set({ ...header, status: "draft", reviewNote: null, ...(existing.reportNumber ? {} : { reportNumber: await nextReportNumber(tx, input) }) }).where(eq(siteDailyReports.id, id));
      await tx.delete(siteDailyReportLines).where(eq(siteDailyReportLines.reportId, id));
      // a list the save does not send is left as it is; an empty list clears it (review of #240: a screen that saves only the header must not wipe the matrix)
      if (input.labour !== undefined) await tx.delete(siteDailyReportLabour).where(and(mine(siteDailyReportLabour, input), eq(siteDailyReportLabour.reportId, id)));
      if (input.equipment !== undefined) await tx.delete(siteDailyReportEquipment).where(and(mine(siteDailyReportEquipment, input), eq(siteDailyReportEquipment.reportId, id)));
    } else {
      await tx.insert(siteDailyReports).values({ id, tenantId: input.tenantId, projectId: input.projectId, reportDate: input.reportDate, ...header, reportNumber: await nextReportNumber(tx, input), preparedByUserId: input.userId });
    }
    if (input.labour?.length) await tx.insert(siteDailyReportLabour).values(labourRows(input, id, input.labour));
    if (input.equipment?.length) await tx.insert(siteDailyReportEquipment).values(equipmentRows(input, id, input.equipment));
    await writeSections(tx, input, id, input, Boolean(existing));
    if (input.lines.length) await tx.insert(siteDailyReportLines).values(input.lines.map((line, index) => ({
      id: crypto.randomUUID(), tenantId: input.tenantId, projectId: input.projectId, reportId: id, lineType: line.lineType, pmcActivityDefinitionId: line.pmcActivityDefinitionId ?? null, pmcUnitId: line.pmcUnitId ?? null,
      label: line.label?.trim() || null, quantity: line.quantity === undefined ? null : String(line.quantity), hours: line.hours === undefined ? null : String(line.hours), description: line.description?.trim() || null, reportedStatus: line.reportedStatus ?? null, sortOrder: index,
      plannedQuantity: line.plannedQuantity === undefined ? null : String(line.plannedQuantity), actualQuantity: line.actualQuantity === undefined ? null : String(line.actualQuantity),
    })));
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: existing ? "site_report.updated" : "site_report.created", entityType: "site_daily_report", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, reportDate: input.reportDate, lines: input.lines.length, labour: input.labour?.length ?? 0, equipment: input.equipment?.length ?? 0, materials: input.materials?.length ?? 0, hse: input.hse?.length ?? 0, obstacles: input.obstacleItems?.length ?? 0, tomorrow: input.tomorrow?.length ?? 0 }) });
  }));
  const [{ reportNumber }] = await db.select({ reportNumber: siteDailyReports.reportNumber }).from(siteDailyReports).where(eq(siteDailyReports.id, id));
  return { id, reportNumber, status: "draft" as const, lines: input.lines.length };
}

async function ownReport(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, input: Scope & { reportId: string }) {
  const [report] = await db.select().from(siteDailyReports).where(and(mine(siteDailyReports, input), eq(siteDailyReports.id, input.reportId))).limit(1);
  if (!report) throw refuse("NOT_FOUND", "PROJECT_OS_SITE_REPORT_NOT_FOUND");
  return report;
}

export async function submitSiteDailyReportForTenant(input: Scope & { reportId: string }) {
  const db = await authorize(input, "project.field.manage");
  const report = await ownReport(db, input);
  if (report.preparedByUserId !== input.userId) throw refuse("FORBIDDEN", "PROJECT_OS_SITE_REPORT_NOT_YOURS");
  if (report.status !== "draft" && report.status !== "rejected") throw refuse("CONFLICT", "PROJECT_OS_SITE_REPORT_LOCKED");
  const [{ lines }] = await db.select({ lines: sql<number>`count(*)::int` }).from(siteDailyReportLines).where(eq(siteDailyReportLines.reportId, report.id));
  if (!lines && !report.summary) throw refuse("BAD_REQUEST", "PROJECT_OS_SITE_REPORT_EMPTY");
  await db.transaction(async tx => {
    const changed = await tx.update(siteDailyReports).set({ status: "submitted", submittedAt: new Date(), reviewNote: null }).where(and(eq(siteDailyReports.id, report.id), inArray(siteDailyReports.status, ["draft", "rejected"]))).returning({ id: siteDailyReports.id });
    if (!changed.length) throw refuse("CONFLICT", "PROJECT_OS_SITE_REPORT_LOCKED");
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "site_report.submitted", entityType: "site_daily_report", entityId: report.id, metadata: JSON.stringify({ projectId: input.projectId, reportDate: report.reportDate }) });
  });
  return { id: report.id, status: "submitted" as const };
}

export type AppliedCell = { unitId: string; activityDefinitionId: string; from: PmcUnitActivityStatus | null; to: PmcUnitActivityStatus };
export type SkippedCell = { unitId: string; activityDefinitionId: string; reason: "NOT_FORWARD"; current: PmcUnitActivityStatus; reported: PmcUnitActivityStatus };

/** What approving would do, and what the company's quality policy says about it. Nothing is written. */
async function planApproval(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, input: Scope, reportId: string) {
  const lines = await db.select().from(siteDailyReportLines).where(and(eq(siteDailyReportLines.reportId, reportId), sql`${siteDailyReportLines.reportedStatus} IS NOT NULL`)).orderBy(asc(siteDailyReportLines.sortOrder));
  // the last line of a cell wins
  const wanted = new Map<string, { unitId: string; activityDefinitionId: string; status: PmcUnitActivityStatus }>();
  for (const line of lines) if (line.pmcUnitId && line.pmcActivityDefinitionId && line.reportedStatus) wanted.set(`${line.pmcUnitId}:${line.pmcActivityDefinitionId}`, { unitId: line.pmcUnitId, activityDefinitionId: line.pmcActivityDefinitionId, status: line.reportedStatus as PmcUnitActivityStatus });
  const cells = Array.from(wanted.values());
  const current = cells.length ? await db.select({ unitId: pmcUnitActivityProgress.unitId, activityDefinitionId: pmcUnitActivityProgress.activityDefinitionId, status: pmcUnitActivityProgress.status }).from(pmcUnitActivityProgress).where(and(mine(pmcUnitActivityProgress, input), inArray(pmcUnitActivityProgress.unitId, cells.map(cell => cell.unitId)))) : [];
  const currentOf = new Map(current.map(row => [`${row.unitId}:${row.activityDefinitionId}`, row.status as PmcUnitActivityStatus]));
  const moving: typeof cells = []; const skipped: SkippedCell[] = [];
  for (const cell of cells) {
    const now = currentOf.get(`${cell.unitId}:${cell.activityDefinitionId}`) ?? "NOT_STARTED";
    if (RANK[cell.status] > RANK[now]) moving.push(cell);
    else skipped.push({ unitId: cell.unitId, activityDefinitionId: cell.activityDefinitionId, reason: "NOT_FORWARD", current: now, reported: cell.status });
  }
  const completing = moving.filter(cell => cell.status === "COMPLETE");
  const gate = await qcCompletionGate(db, input.tenantId, completing.map(cell => ({ unitId: cell.unitId, activityDefinitionId: cell.activityDefinitionId })));
  return { moving, skipped, gate };
}

export async function reviewSiteDailyReportForTenant(input: Scope & { reportId: string; decision: "approve" | "reject"; note?: string; dryRun?: boolean }) {
  const db = await authorize(input, "project.manage");
  const report = await ownReport(db, input);
  if (report.status !== "submitted") throw refuse("CONFLICT", "PROJECT_OS_SITE_REPORT_NOT_SUBMITTED");
  // The person who wrote the report is not the one who approves it, whatever else they hold.
  if (report.preparedByUserId === input.userId) throw refuse("CONFLICT", "PROJECT_OS_SITE_REPORT_SELF_REVIEW");
  if (input.decision === "reject") {
    if ((input.note ?? "").trim().length < 3) throw refuse("BAD_REQUEST", "PROJECT_OS_SITE_REPORT_REJECT_REASON_REQUIRED");
    if (input.dryRun) return { id: report.id, status: "rejected" as const, applied: [] as AppliedCell[], skipped: [] as SkippedCell[], warnings: [] as CellWarning[], notAccepted: [] };
    await db.transaction(async tx => {
      const changed = await tx.update(siteDailyReports).set({ status: "rejected", reviewedByUserId: input.userId, reviewedAt: new Date(), reviewNote: input.note!.trim() }).where(and(eq(siteDailyReports.id, report.id), eq(siteDailyReports.status, "submitted"))).returning({ id: siteDailyReports.id });
      if (!changed.length) throw refuse("CONFLICT", "PROJECT_OS_SITE_REPORT_NOT_SUBMITTED");
      await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "site_report.rejected", entityType: "site_daily_report", entityId: report.id, metadata: JSON.stringify({ projectId: input.projectId, note: input.note!.trim() }) });
    });
    return { id: report.id, status: "rejected" as const, applied: [] as AppliedCell[], skipped: [] as SkippedCell[], warnings: [] as CellWarning[], notAccepted: [] };
  }
  const plan = await planApproval(db, input, report.id);
  if (plan.moving.length) {
    await ensureDefaultCommercialCatalog(db);
    await assertTenantFeatureAccess({ userId: input.userId, tenantId: input.tenantId, product: "PROJECT", permission: "project.manage", featureCode: "PMC", scope: { type: "project", id: input.projectId } });
  }
  if (plan.gate.mode === "block" && plan.gate.notAccepted.length) {
    if (input.dryRun) return { id: report.id, status: "submitted" as const, applied: [] as AppliedCell[], skipped: plan.skipped, warnings: [] as CellWarning[], notAccepted: plan.gate.notAccepted };
    throw refuse("CONFLICT", "PROJECT_OS_QC_NOT_ACCEPTED");
  }
  if (input.dryRun) return { id: report.id, status: "submitted" as const, applied: plan.moving.map(cell => ({ unitId: cell.unitId, activityDefinitionId: cell.activityDefinitionId, from: null, to: cell.status })) as AppliedCell[], skipped: plan.skipped, warnings: (plan.gate.notAccepted.length ? [{ code: "QC_NOT_ACCEPTED" as const }] : []) as CellWarning[], notAccepted: plan.gate.notAccepted };
  const applied: AppliedCell[] = []; const warnings: CellWarning[] = [];
  await db.transaction(async tx => {
    const changed = await tx.update(siteDailyReports).set({ status: "approved", reviewedByUserId: input.userId, reviewedAt: new Date(), reviewNote: input.note?.trim() || null }).where(and(eq(siteDailyReports.id, report.id), eq(siteDailyReports.status, "submitted"))).returning({ id: siteDailyReports.id });
    if (!changed.length) throw refuse("CONFLICT", "PROJECT_OS_SITE_REPORT_NOT_SUBMITTED");
    const now = new Date();
    for (const cell of plan.moving) {
      const result = await applyCellStatus(tx, { userId: input.userId, tenantId: input.tenantId, projectId: input.projectId, unitId: cell.unitId, activityDefinitionId: cell.activityDefinitionId, status: cell.status, note: `Daily report ${report.reportDate}` }, now);
      if (result.changed) applied.push({ unitId: cell.unitId, activityDefinitionId: cell.activityDefinitionId, from: result.from as PmcUnitActivityStatus | null, to: cell.status });
      warnings.push(...result.warnings);
    }
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "site_report.approved", entityType: "site_daily_report", entityId: report.id, metadata: JSON.stringify({ projectId: input.projectId, reportDate: report.reportDate, applied: applied.length, skipped: plan.skipped.length, warnings: warnings.length }) });
    await emitWebhookEvent(tx, input.tenantId, "daily_report.approved", { reportId: report.id, projectId: input.projectId, reportDate: report.reportDate, cellsMoved: applied.length });
  });
  kickWebhookDelivery();
  return { id: report.id, status: "approved" as const, applied, skipped: plan.skipped, warnings, notAccepted: [] as typeof plan.gate.notAccepted };
}

// ------------------------------------------------------------------------------------------------------------------------------ photos

const imageKind = (bytes: Uint8Array) => {
  if (bytes.length > 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { type: "image/jpeg", extension: "jpg" };
  if (bytes.length > 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return { type: "image/png", extension: "png" };
  if (bytes.length > 12 && Buffer.from(bytes.subarray(0, 4)).toString("latin1") === "RIFF" && Buffer.from(bytes.subarray(8, 12)).toString("latin1") === "WEBP") return { type: "image/webp", extension: "webp" };
  return null;
};

/** A photo uploaded straight to storage becomes part of a report that is still the preparer's to change. */
export async function attachSiteReportPhotoForTenant(input: Scope & { reportId: string; uploadKey: string; fileName: string; caption?: string }) {
  const db = await authorize(input, "project.field.manage");
  const report = await ownReport(db, input);
  if (report.preparedByUserId !== input.userId) throw refuse("FORBIDDEN", "PROJECT_OS_SITE_REPORT_NOT_YOURS");
  if (report.status !== "draft" && report.status !== "rejected") throw refuse("CONFLICT", "PROJECT_OS_SITE_REPORT_LOCKED");
  const [{ photos }] = await db.select({ photos: sql<number>`count(*)::int` }).from(siteDailyReportPhotos).where(eq(siteDailyReportPhotos.reportId, report.id));
  if (photos >= MAX_PHOTOS_PER_REPORT) throw refuse("BAD_REQUEST", "PROJECT_OS_SITE_REPORT_TOO_MANY_PHOTOS");
  const taken = await takeDirectUpload({ tenantId: input.tenantId, projectId: input.projectId, purpose: "sitePhoto", uploadKey: input.uploadKey });
  const kind = imageKind(taken.bytes);
  if (!kind || taken.bytes.length > MAX_PHOTO_BYTES) { await taken.discard(); throw refuse("BAD_REQUEST", kind ? "PROJECT_OS_SITE_REPORT_PHOTO_TOO_LARGE" : "PROJECT_OS_SITE_REPORT_PHOTO_INVALID"); }
  const id = crypto.randomUUID();
  const safeName = input.fileName.normalize("NFKC").replace(/[^A-Za-z0-9._\-؀-ۿ]+/g, "_").replace(/^[._]+/, "").slice(0, 100) || `photo.${kind.extension}`;
  const stored = await storagePut(`tenants/${input.tenantId}/projects/${input.projectId}/site-reports/${report.id}/${id}-${safeName}`, taken.bytes, kind.type);
  try {
    await db.transaction(async tx => {
      await tx.insert(siteDailyReportPhotos).values({ id, tenantId: input.tenantId, projectId: input.projectId, reportId: report.id, storageKey: stored.key, fileName: safeName, contentType: kind.type, sizeBytes: taken.bytes.length, caption: input.caption?.trim() || null, createdByUserId: input.userId });
      await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "site_report.photo_attached", entityType: "site_daily_report", entityId: report.id, metadata: JSON.stringify({ projectId: input.projectId, photoId: id, bytes: taken.bytes.length }) });
    });
  } catch (error) { await storageDelete(stored.key).catch(() => undefined); throw error; }
  await taken.discard();
  return { id, contentType: kind.type, sizeBytes: taken.bytes.length };
}

// ------------------------------------------------------------------------------------------------------------------------------ reading

const READ_PERMISSIONS = ["project.read", "project.field.manage", "project.manage"] as const;

export async function listSiteDailyReportsForTenant(input: Scope & { status?: "draft" | "submitted" | "approved" | "rejected"; limit?: number }) {
  const db = await authorize(input, READ_PERMISSIONS);
  return db.select({ id: siteDailyReports.id, reportDate: siteDailyReports.reportDate, status: siteDailyReports.status, weather: siteDailyReports.weather, preparedByUserId: siteDailyReports.preparedByUserId, submittedAt: siteDailyReports.submittedAt, reviewedAt: siteDailyReports.reviewedAt, reviewNote: siteDailyReports.reviewNote })
    .from(siteDailyReports).where(and(mine(siteDailyReports, input), input.status ? eq(siteDailyReports.status, input.status) : undefined))
    .orderBy(desc(siteDailyReports.reportDate), desc(siteDailyReports.createdAt)).limit(Math.min(input.limit ?? 60, 200));
}

export async function getSiteDailyReportForTenant(input: Scope & { reportId: string }) {
  const db = await authorize(input, READ_PERMISSIONS);
  const report = await ownReport(db, input);
  const section = <T extends typeof siteDailyReportMaterials | typeof siteDailyReportHse | typeof siteDailyReportObstacles | typeof siteDailyReportTomorrow>(table: T) => db.select().from(table as never).where(and(mine(table, input), eq(table.reportId, report.id))).orderBy(asc(table.sortOrder));
  const [materials, hse, obstacleItems, tomorrow] = await Promise.all([section(siteDailyReportMaterials), section(siteDailyReportHse), section(siteDailyReportObstacles), section(siteDailyReportTomorrow)]) as [
    Array<typeof siteDailyReportMaterials.$inferSelect>, Array<typeof siteDailyReportHse.$inferSelect>, Array<typeof siteDailyReportObstacles.$inferSelect>, Array<typeof siteDailyReportTomorrow.$inferSelect>];
  const [lines, photos, labour, equipment, cumulative] = await Promise.all([
    db.select().from(siteDailyReportLines).where(eq(siteDailyReportLines.reportId, report.id)).orderBy(asc(siteDailyReportLines.sortOrder)),
    db.select().from(siteDailyReportPhotos).where(eq(siteDailyReportPhotos.reportId, report.id)).orderBy(asc(siteDailyReportPhotos.createdAt)),
    db.select({ companyId: siteDailyReportLabour.companyId, companyName: projectCompanies.name, labourRoleId: siteDailyReportLabour.labourRoleId, roleName: projectLabourRoles.name, category: projectLabourRoles.category, shift: siteDailyReportLabour.shift, headcount: siteDailyReportLabour.headcount })
      .from(siteDailyReportLabour).innerJoin(projectCompanies, eq(projectCompanies.id, siteDailyReportLabour.companyId)).innerJoin(projectLabourRoles, eq(projectLabourRoles.id, siteDailyReportLabour.labourRoleId))
      .where(and(mine(siteDailyReportLabour, input), eq(siteDailyReportLabour.reportId, report.id))).orderBy(asc(projectCompanies.name), asc(projectLabourRoles.sortOrder)),
    db.select({ equipmentId: siteDailyReportEquipment.equipmentId, equipmentType: projectEquipment.equipmentType, model: projectEquipment.model, plateOrSize: projectEquipment.plateOrSize, count: siteDailyReportEquipment.count, hours: siteDailyReportEquipment.hours })
      .from(siteDailyReportEquipment).innerJoin(projectEquipment, eq(projectEquipment.id, siteDailyReportEquipment.equipmentId)).where(and(mine(siteDailyReportEquipment, input), eq(siteDailyReportEquipment.reportId, report.id))).orderBy(asc(projectEquipment.equipmentType)),
    // the project's man-days up to this report's date (every report but a rejected one), the same rows a reader would add up
    db.select({ headcount: sql<number>`coalesce(sum(${siteDailyReportLabour.headcount}), 0)::int` }).from(siteDailyReportLabour).innerJoin(siteDailyReports, eq(siteDailyReports.id, siteDailyReportLabour.reportId))
      .where(and(mine(siteDailyReportLabour, input), sql`${siteDailyReports.reportDate} <= ${report.reportDate}`, sql`${siteDailyReports.status} <> 'rejected'`)),
  ]);
  const sum = (rows: Array<{ headcount: number }>) => rows.reduce((total, row) => total + row.headcount, 0);
  const numeric = (value: string | null) => (value === null ? null : Number(value));
  return {
    report: { ...report, workHours: numeric(report.workHours) },
    labour,
    equipment: equipment.map(row => ({ ...row, hours: numeric(row.hours) })),
    materials: materials.map(row => ({ ...row, quantity: Number(row.quantity) })),
    hse, obstacleItems, tomorrow: tomorrow.map(row => ({ ...row, quantity: numeric(row.quantity) })),
    // computed, never stored: the report's totals and the cumulative man-days
    totals: {
      hse: Object.fromEntries(HSE_KINDS.map(kind => [kind, hse.filter(row => row.kind === kind).length])) as Record<(typeof HSE_KINDS)[number], number>,
      labour: { total: sum(labour), direct: sum(labour.filter(row => row.category === "direct")), indirect: sum(labour.filter(row => row.category === "indirect")), day: sum(labour.filter(row => row.shift === "day")), night: sum(labour.filter(row => row.shift === "night")),
        byCompany: Array.from(new Map(labour.map(row => [row.companyId, { companyId: row.companyId, companyName: row.companyName, headcount: sum(labour.filter(other => other.companyId === row.companyId)) }])).values()) },
      equipment: { count: equipment.reduce((total, row) => total + row.count, 0), hours: equipment.reduce((total, row) => total + row.count * Number(row.hours ?? 0), 0) },
      cumulativeManDays: Number(cumulative[0]?.headcount ?? 0),
    },
    lines: lines.map(line => ({ ...line, quantity: numeric(line.quantity), hours: numeric(line.hours), plannedQuantity: numeric(line.plannedQuantity), actualQuantity: numeric(line.actualQuantity),
      variance: line.plannedQuantity === null || line.actualQuantity === null ? null : Number(line.actualQuantity) - Number(line.plannedQuantity) })),
    photos: await Promise.all(photos.map(async ({ storageKey, ...photo }) => ({ ...photo, url: await storageGetSignedUrl(storageKey).catch(() => null) }))),
  };
}

/** The units and the activities a person on site picks from (the daily report, the inspection request, the NCR, the unit card). No money, no WBS; readable by whoever may read the project. */
export async function listFieldOptionsForTenant(input: Scope) {
  const db = await authorize(input, ["project.read", "project.field.manage", "project.manage"]);
  const [units, activities] = await Promise.all([
    db.select({ id: pmcUnits.id, number: pmcUnits.unitNumber, modelCode: pmcUnits.modelCode, block: pmcBlocks.code, zone: pmcZones.code }).from(pmcUnits)
      .innerJoin(pmcBlocks, eq(pmcBlocks.id, pmcUnits.blockId)).innerJoin(pmcZones, eq(pmcZones.id, pmcBlocks.zoneId)).where(mine(pmcUnits, input)).orderBy(asc(pmcUnits.unitNumber)),
    db.select({ id: pmcActivityDefinitions.id, modelCode: pmcActivityDefinitions.modelCode, code: pmcActivityDefinitions.code, name: pmcActivityDefinitions.name }).from(pmcActivityDefinitions).where(mine(pmcActivityDefinitions, input)).orderBy(asc(pmcActivityDefinitions.code)),
  ]);
  return { units, activities };
}

// ------------------------------------------------------------------------------------------------------------------------------ copy from yesterday

/**
 * D-45 (a): today's draft starts from the preparer's last report (same contractor): its labour matrix and its equipment, nothing else (no work lines, no photos —
 * what was done yesterday is not what is done today). Refused when the preparer already has a report for that day. The new draft takes the next number.
 */
export async function copySiteDailyReportFromYesterday(input: Scope & { reportDate: string }) {
  const db = await authorize(input, "project.field.manage");
  if (!realDate(input.reportDate)) throw refuse("BAD_REQUEST", "PROJECT_OS_SITE_REPORT_DATE_INVALID");
  if (input.reportDate > today()) throw refuse("BAD_REQUEST", "PROJECT_OS_SITE_REPORT_DATE_FUTURE");
  const mineAndPreparer = ownDayReports(input);
  const [exists] = await db.select({ id: siteDailyReports.id }).from(siteDailyReports).where(and(mineAndPreparer, eq(siteDailyReports.reportDate, input.reportDate))).limit(1);
  if (exists) throw refuse("CONFLICT", "PROJECT_OS_SITE_REPORT_EXISTS");
  const [source] = await db.select({ id: siteDailyReports.id, reportDate: siteDailyReports.reportDate }).from(siteDailyReports).where(and(mineAndPreparer, sql`${siteDailyReports.reportDate} < ${input.reportDate}`)).orderBy(desc(siteDailyReports.reportDate)).limit(1);
  if (!source) throw refuse("NOT_FOUND", "PROJECT_OS_SITE_REPORT_NOTHING_TO_COPY");
  const [labour, equipment] = await Promise.all([
    db.select({ companyId: siteDailyReportLabour.companyId, labourRoleId: siteDailyReportLabour.labourRoleId, shift: siteDailyReportLabour.shift, headcount: siteDailyReportLabour.headcount }).from(siteDailyReportLabour).where(and(mine(siteDailyReportLabour, input), eq(siteDailyReportLabour.reportId, source.id))),
    db.select({ equipmentId: siteDailyReportEquipment.equipmentId, count: siteDailyReportEquipment.count, hours: siteDailyReportEquipment.hours }).from(siteDailyReportEquipment).where(and(mine(siteDailyReportEquipment, input), eq(siteDailyReportEquipment.reportId, source.id))),
  ]);
  const id = crypto.randomUUID();
  let carried = 0;
  await oneReportPerDay(db.transaction(async tx => {
    await tx.insert(siteDailyReports).values({ id, tenantId: input.tenantId, projectId: input.projectId, reportDate: input.reportDate, reportNumber: await nextReportNumber(tx, input), preparedByUserId: input.userId });
    if (labour.length) await tx.insert(siteDailyReportLabour).values(labourRows(input, id, labour as ReportLabourInput[]));
    if (equipment.length) await tx.insert(siteDailyReportEquipment).values(equipmentRows(input, id, equipment));
    // D-45 (b): yesterday's plan for tomorrow is today's starting plan, carried into today's «tomorrow» list to be edited
    const plan = await tx.select().from(siteDailyReportTomorrow).where(and(mine(siteDailyReportTomorrow, input), eq(siteDailyReportTomorrow.reportId, source.id))).orderBy(asc(siteDailyReportTomorrow.sortOrder));
    carried = plan.length;
    if (plan.length) await writeSections(tx, input, id, { tomorrow: plan.map(row => ({ area: row.area ?? undefined, activity: row.activity, quantity: row.quantity === null ? undefined : Number(row.quantity), unit: row.unit ?? undefined, resources: row.resources ?? undefined })) }, false);
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "site_report.copied", entityType: "site_daily_report", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, reportDate: input.reportDate, from: source.id, fromDate: source.reportDate, labour: labour.length, equipment: equipment.length }) });
  }));
  const [{ reportNumber }] = await db.select({ reportNumber: siteDailyReports.reportNumber }).from(siteDailyReports).where(eq(siteDailyReports.id, id));
  return { id, reportNumber, from: source.id, labour: labour.length, equipment: equipment.length, tomorrow: carried };
}
