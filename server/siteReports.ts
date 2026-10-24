// The site's daily report (work order 12, item 4): labour and equipment per activity, the work done (per unit and activity), the weather, photos and obstacles.
// The engineer prepares and submits it; the project manager approves it, and the approval is what moves the progress of the cells the report names, in the same
// transaction. Decisions that were not in the order (recorded in docs/STATE.md): one report per engineer per project per day; the preparer cannot approve their own
// report (it holds for the company owner too); an approved report only moves a cell FORWARD (a report cannot take back progress the cell already has); a COMPLETE line
// obeys the company's quality policy like any other path to COMPLETE.
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { auditLogs, pmcActivityDefinitions, pmcBlocks, pmcUnitActivityProgress, pmcUnits, pmcZones, siteDailyReportLines, siteDailyReportPhotos, siteDailyReports } from "../drizzle/schema";
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

export type ReportLineInput = { lineType: "labour" | "equipment" | "work"; label?: string; quantity?: number; hours?: number; description?: string; pmcUnitId?: string; pmcActivityDefinitionId?: string; reportedStatus?: PmcUnitActivityStatus };
export type ReportInput = { reportDate: string; weather?: string; temperatureC?: number; summary?: string; obstacles?: string; lines: ReportLineInput[] };

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
const today = () => new Date().toISOString().slice(0, 10);

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
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.reportDate) || Number.isNaN(Date.parse(input.reportDate))) throw refuse("BAD_REQUEST", "PROJECT_OS_SITE_REPORT_DATE_INVALID");
  if (input.reportDate > today()) throw refuse("BAD_REQUEST", "PROJECT_OS_SITE_REPORT_DATE_FUTURE");
  await validateLines(db, input, input.lines);
  const [existing] = await db.select().from(siteDailyReports).where(and(mine(siteDailyReports, input), eq(siteDailyReports.reportDate, input.reportDate), eq(siteDailyReports.preparedByUserId, input.userId))).limit(1);
  if (existing && (existing.status === "submitted" || existing.status === "approved")) throw refuse("CONFLICT", "PROJECT_OS_SITE_REPORT_LOCKED");
  const id = existing?.id ?? crypto.randomUUID();
  await db.transaction(async tx => {
    const header = { weather: input.weather?.trim() || null, temperatureC: input.temperatureC === undefined ? null : String(input.temperatureC), summary: input.summary?.trim() || null, obstacles: input.obstacles?.trim() || null };
    if (existing) {
      await tx.update(siteDailyReports).set({ ...header, status: "draft", reviewNote: null }).where(eq(siteDailyReports.id, id));
      await tx.delete(siteDailyReportLines).where(eq(siteDailyReportLines.reportId, id));
    } else {
      await tx.insert(siteDailyReports).values({ id, tenantId: input.tenantId, projectId: input.projectId, reportDate: input.reportDate, ...header, preparedByUserId: input.userId });
    }
    if (input.lines.length) await tx.insert(siteDailyReportLines).values(input.lines.map((line, index) => ({
      id: crypto.randomUUID(), tenantId: input.tenantId, projectId: input.projectId, reportId: id, lineType: line.lineType, pmcActivityDefinitionId: line.pmcActivityDefinitionId ?? null, pmcUnitId: line.pmcUnitId ?? null,
      label: line.label?.trim() || null, quantity: line.quantity === undefined ? null : String(line.quantity), hours: line.hours === undefined ? null : String(line.hours), description: line.description?.trim() || null, reportedStatus: line.reportedStatus ?? null, sortOrder: index,
    })));
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: existing ? "site_report.updated" : "site_report.created", entityType: "site_daily_report", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, reportDate: input.reportDate, lines: input.lines.length }) });
  });
  return { id, status: "draft" as const, lines: input.lines.length };
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
  const [lines, photos] = await Promise.all([
    db.select().from(siteDailyReportLines).where(eq(siteDailyReportLines.reportId, report.id)).orderBy(asc(siteDailyReportLines.sortOrder)),
    db.select().from(siteDailyReportPhotos).where(eq(siteDailyReportPhotos.reportId, report.id)).orderBy(asc(siteDailyReportPhotos.createdAt)),
  ]);
  return {
    report,
    lines: lines.map(line => ({ ...line, quantity: line.quantity === null ? null : Number(line.quantity), hours: line.hours === null ? null : Number(line.hours) })),
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
