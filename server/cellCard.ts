// One timeline for a unit (and, when asked, one of its activities): what happened to it on site, with the consultant, in quality and in the warehouse, in time order
// (work order 12, item 7). The daily reports that named it, the submittals sent for it, the inspection requests and their answers, the NCRs raised in it, the material
// issued into it, and every change of its status. Money is not shown here: a material line says what and how much, not what it cost.
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, or, sql } from "drizzle-orm";
import {
  consultantSubmittals,
  materialIssues,
  materialMasters,
  ncrs,
  pmcActivityDefinitions,
  pmcBlocks,
  pmcInspectionRequestUnits,
  pmcInspectionRequests,
  pmcUnitActivityHistory,
  pmcUnitActivityProgress,
  pmcUnits,
  pmcZones,
  siteDailyReportLines,
  siteDailyReports,
} from "../drizzle/schema";
import { assertProjectWithinTenant, getDb, getTenantAccessSnapshot } from "./db";
import { assertTenantAccess } from "./domain/authorization";
import { cellsWithoutAcceptedInspection, loadTenantPolicy, openNcrNumbers } from "./qualityGate";

type Scope = { userId: number; tenantId: string; projectId: string };
export type TimelineEvent = { kind: "daily_report" | "submittal" | "inspection" | "ncr" | "material_issue" | "status_change"; at: string; ref: string; title: string; detail: Record<string, string | number | null> };

export async function getCellCardForTenant(input: Scope & { unitId: string; activityDefinitionId?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: ["project.read", "project.pmc.read", "project.manage"], scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const mine = <T extends { tenantId: unknown; projectId: unknown }>(table: T) => and(eq(table.tenantId as never, input.tenantId), eq(table.projectId as never, input.projectId));

  const [unit] = await db.select({ id: pmcUnits.id, number: pmcUnits.unitNumber, modelCode: pmcUnits.modelCode, block: pmcBlocks.code, zone: pmcZones.code }).from(pmcUnits)
    .innerJoin(pmcBlocks, eq(pmcBlocks.id, pmcUnits.blockId)).innerJoin(pmcZones, eq(pmcZones.id, pmcBlocks.zoneId)).where(and(mine(pmcUnits), eq(pmcUnits.id, input.unitId))).limit(1);
  if (!unit) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_PMC_UNIT_NOT_FOUND" });
  let activity: { id: string; code: string; name: string } | null = null;
  if (input.activityDefinitionId) {
    const [row] = await db.select({ id: pmcActivityDefinitions.id, code: pmcActivityDefinitions.code, name: pmcActivityDefinitions.name, modelCode: pmcActivityDefinitions.modelCode }).from(pmcActivityDefinitions).where(and(mine(pmcActivityDefinitions), eq(pmcActivityDefinitions.id, input.activityDefinitionId))).limit(1);
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_PMC_ACTIVITY_NOT_FOUND" });
    if (row.modelCode !== unit.modelCode) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_PMC_ACTIVITY_NOT_IN_UNIT_MODEL" });
    activity = { id: row.id, code: row.code, name: row.name };
  }
  const activityOnly = <C>(column: C) => (activity ? eq(column as never, activity.id) : undefined);

  const [reportLines, submittals, requests, ncrRows, issues, history, cells] = await Promise.all([
    db.select({ reportId: siteDailyReports.id, reportDate: siteDailyReports.reportDate, reportStatus: siteDailyReports.status, lineType: siteDailyReportLines.lineType, label: siteDailyReportLines.label, quantity: siteDailyReportLines.quantity, hours: siteDailyReportLines.hours, description: siteDailyReportLines.description, reportedStatus: siteDailyReportLines.reportedStatus })
      .from(siteDailyReportLines).innerJoin(siteDailyReports, eq(siteDailyReports.id, siteDailyReportLines.reportId))
      .where(and(mine(siteDailyReportLines), eq(siteDailyReportLines.pmcUnitId, input.unitId), activityOnly(siteDailyReportLines.pmcActivityDefinitionId), inArray(siteDailyReports.status, ["submitted", "approved"]))),
    db.select().from(consultantSubmittals).where(and(mine(consultantSubmittals), activity ? eq(consultantSubmittals.pmcActivityDefinitionId, activity.id) : undefined, or(eq(consultantSubmittals.pmcUnitId, input.unitId), activity ? sql`${consultantSubmittals.pmcUnitId} IS NULL` : sql`false`))),
    db.select({ id: pmcInspectionRequests.id, code: pmcInspectionRequests.requestCode, activityDefinitionId: pmcInspectionRequests.activityDefinitionId, requestedAt: pmcInspectionRequests.requestedAt, responseCode: pmcInspectionRequests.responseCode, consultant: pmcInspectionRequests.consultantLabel })
      .from(pmcInspectionRequests).innerJoin(pmcInspectionRequestUnits, eq(pmcInspectionRequestUnits.inspectionRequestId, pmcInspectionRequests.id))
      .where(and(mine(pmcInspectionRequests), eq(pmcInspectionRequestUnits.unitId, input.unitId), activityOnly(pmcInspectionRequests.activityDefinitionId))),
    db.select({ id: ncrs.id, number: ncrs.ncrNumber, title: ncrs.title, status: ncrs.status, createdAt: ncrs.createdAt, activityDefinitionId: ncrs.pmcActivityDefinitionId }).from(ncrs).where(and(mine(ncrs), eq(ncrs.pmcUnitId, input.unitId), activityOnly(ncrs.pmcActivityDefinitionId))),
    db.select({ id: materialIssues.id, issuedAt: materialIssues.issuedAt, quantity: materialIssues.issuedQuantity, code: materialMasters.code, description: materialMasters.description, unit: materialMasters.unitOfMeasure, activityDefinitionId: materialIssues.pmcActivityDefinitionId })
      .from(materialIssues).innerJoin(materialMasters, eq(materialMasters.id, materialIssues.materialId)).where(and(mine(materialIssues), eq(materialIssues.pmcUnitId, input.unitId), activityOnly(materialIssues.pmcActivityDefinitionId))),
    db.select({ id: pmcUnitActivityHistory.id, from: pmcUnitActivityHistory.fromStatus, to: pmcUnitActivityHistory.toStatus, changedAt: pmcUnitActivityHistory.changedAt, note: pmcUnitActivityHistory.note, activityDefinitionId: pmcUnitActivityProgress.activityDefinitionId })
      .from(pmcUnitActivityHistory).innerJoin(pmcUnitActivityProgress, eq(pmcUnitActivityProgress.id, pmcUnitActivityHistory.unitActivityProgressId))
      .where(and(mine(pmcUnitActivityHistory), eq(pmcUnitActivityProgress.unitId, input.unitId), activityOnly(pmcUnitActivityProgress.activityDefinitionId))),
    db.select({ activityDefinitionId: pmcUnitActivityProgress.activityDefinitionId, status: pmcUnitActivityProgress.status }).from(pmcUnitActivityProgress).where(and(mine(pmcUnitActivityProgress), eq(pmcUnitActivityProgress.unitId, input.unitId), activityOnly(pmcUnitActivityProgress.activityDefinitionId))),
  ]);

  const events: TimelineEvent[] = [
    ...reportLines.map(line => ({ kind: "daily_report" as const, at: `${line.reportDate}T00:00:00.000Z`, ref: line.reportId, title: line.lineType, detail: { reportStatus: line.reportStatus, label: line.label, quantity: line.quantity === null ? null : Number(line.quantity), hours: line.hours === null ? null : Number(line.hours), description: line.description, reportedStatus: line.reportedStatus } })),
    ...submittals.map(row => ({ kind: "submittal" as const, at: (row.sentAt ?? row.createdAt).toISOString(), ref: row.id, title: `${row.submittalNumber} r${row.revision}`, detail: { submittalType: row.submittalType, status: row.status, replyCode: row.replyCode, repliedAt: row.repliedAt?.toISOString() ?? null } })),
    ...requests.map(row => ({ kind: "inspection" as const, at: row.requestedAt.toISOString(), ref: row.id, title: row.code, detail: { responseCode: row.responseCode, consultant: row.consultant } })),
    ...ncrRows.map(row => ({ kind: "ncr" as const, at: row.createdAt.toISOString(), ref: row.id, title: row.number, detail: { status: row.status, summary: row.title } })),
    ...issues.map(row => ({ kind: "material_issue" as const, at: row.issuedAt.toISOString(), ref: row.id, title: row.code, detail: { description: row.description, quantity: Number(row.quantity), unit: row.unit } })),
    ...history.map(row => ({ kind: "status_change" as const, at: row.changedAt.toISOString(), ref: row.id, title: `${row.from ?? "—"} → ${row.to}`, detail: { note: row.note, activityDefinitionId: row.activityDefinitionId } })),
  ].sort((a, b) => b.at.localeCompare(a.at)).slice(0, 300);

  const policy = await loadTenantPolicy(db, input.tenantId);
  let qc: { policy: string; accepted: boolean; ncrMode: string; heldByNcr: boolean } | null = null;
  if (activity) {
    const accepted = (await cellsWithoutAcceptedInspection(db, [{ unitId: unit.id, activityDefinitionId: activity.id }])).length === 0;
    // work order 14: "held by an NCR" = the latest answer is an accepted code, yet the cell is not accepted because an NCR is open on it and the company's rule is block
    const latest = requests.filter(request => request.activityDefinitionId === activity!.id && request.responseCode).sort((a, b) => b.requestedAt.getTime() - a.requestedAt.getTime())[0];
    const heldByNcr = !accepted && policy.ncrAcceptanceMode === "block" && Boolean(latest && policy.qcAcceptedCodes.includes(latest.responseCode!)) && (await openNcrNumbers(db, input.tenantId, [unit.id], activity.id)).length > 0;
    qc = { policy: policy.qcCompletionMode, accepted, ncrMode: policy.ncrAcceptanceMode, heldByNcr };
  }
  return {
    unit, activity, status: activity ? (cells[0]?.status ?? "NOT_STARTED") : null, qc,
    openNcrs: ncrRows.filter(row => !["closed", "cancelled"].includes(row.status)).length,
    events,
  };
}

