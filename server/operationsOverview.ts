// Q-53 (adviser 20-11): «التشغيل» — one row per project the caller may read, for the operations manager (and anyone who reads projects at that scope).
// Every figure comes from records that already exist; nothing is stored, nothing is estimated. A figure that has no source is null with the reason
// (no P6 schedule, no villas, money not visible), never 0. Counts (overdue activities, open NCRs, …) are real counts: 0 means none were found.
//   progress  — weighted actual (villas' first completions in APPROVED daily reports × activity weights) against the P6 planned line, today, exactly as the
//               monthly report's S-curve computes them (server/monthlyReport.ts, domain/monthlyCurve.ts); no approved completion yet is null (NO_REPORTS);
//   schedule  — activities past their planned finish and not completed (the levels dashboards' count), and the villas the stall rule classifies stalled;
//   quality   — NCRs not closed or cancelled; safety — incidents not closed, and lost-time injuries in the last 30 site days;
//   materials — materials under their reorder level across the project's warehouses (as the levels dashboards count them);
//   cost      — cost variance (EV − AC) and CPI of the live earned value, only for whoever may see this project's money (projectMoneyVisible), else null;
//               no profit, never: the expected profit belongs to project.profit.read (Q-53, batch 1) and is not part of this read;
//   risks     — open risks (not closed) scoring 10 or more (the «high» and «critical» bands of the 5×5 matrix);
//   waiting   — what waits on the CALLER on this project: decisions submitted to them as owner, and open actions they own that were escalated.
import { and, eq, gte, inArray, isNotNull, lt, ne, notInArray, or, sql } from "drizzle-orm";
import { actions, activities, decisions, memberships, ncrs, pmcActivityDefinitions, pmcUnits, projects, risks, safetyIncidents, siteDailyReportLines, siteDailyReports } from "../drizzle/schema";
import { getDb, getTenantAccessSnapshot, projectMoneyVisible } from "./db";
import { actualCurve, plannedCurve } from "./domain/monthlyCurve";
import { computeStalledUnits } from "./stalledUnits";
import { DEFAULT_EAC_METHOD, liveEvm, loadProfitabilityRowsByProject } from "./profitability";
import { materialsBelowReorder } from "./scopeDashboards";
import { resolveScopedAccess } from "./scopeAccess";
import { siteToday } from "./wo22Shared";
import { LOST_TIME_KINDS } from "../shared/safetyIndicators";
import { logError } from "./_core/logger";
import { countedReportCondition } from "./reportCounting";

const MILESTONE_TYPES = ["TT_Mile", "TT_FinMile"];
const HIGH_RISK_SCORE = 10;
const LOST_TIME_WINDOW_DAYS = 30;
const round2 = (value: number) => Math.round(value * 100) / 100;
const isoDay = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);
const daysBefore = (day: string, days: number) => new Date(Date.parse(`${day}T00:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

type Missing<R extends string> = { value: null; reason: R };
export type OperationsRow = {
  projectId: string; code: string; name: string; currency: string; status: "draft" | "active" | "on_hold";
  progress: { actual: number | null; planned: number | null; deviation: number | null; reason: "NO_UNITS" | "NO_REPORTS" | "NO_SCHEDULE" | null };
  overdueActivities: number; stalledUnits: number | null;
  openNcrs: number;
  safety: { openIncidents: number; lostTimeLast30Days: number };
  materialsBelowReorder: number;
  cost: { costVariance: number; cpi: number | null } | Missing<"MONEY_HIDDEN" | "EVM_UNAVAILABLE">;
  highRisks: number;
  waiting: { decisions: number; escalations: number };
};

const countBy = (rows: Array<{ projectId: string | null; n: number }>) => new Map(rows.flatMap(row => (row.projectId ? [[row.projectId, Number(row.n)] as const] : [])));

export async function getOperationsOverview(input: { userId: number; tenantId: string; now?: Date }): Promise<{ today: string; projects: OperationsRow[] }> {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  // the projects the caller's own project.read assignments cover (company, portfolio, program or single projects); no read, no rows — the scope refuses
  const access = await resolveScopedAccess({ userId: input.userId, tenantId: input.tenantId, product: "PROJECT", permissions: ["project.read"] });
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  const now = input.now ?? new Date();
  const today = siteToday(now);
  const ids = Array.from(access.projectIds);
  if (!ids.length) return { today, projects: [] };
  const tenant = eq(projects.tenantId, input.tenantId);
  // every project still in hand: draft (being set up), active and on hold; a closed or cancelled project has no operation left to follow
  const projectRows = await db.select({ id: projects.id, code: projects.code, name: projects.name, currency: projects.currency, status: projects.status }).from(projects)
    .where(and(tenant, inArray(projects.id, ids), notInArray(projects.status, ["closed", "cancelled"])));
  const projectIds = projectRows.map(row => row.id);
  if (!projectIds.length) return { today, projects: [] };
  const [membership] = await db.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.tenantId, input.tenantId), eq(memberships.userId, input.userId))).limit(1);
  const lostSince = daysBefore(today, LOST_TIME_WINDOW_DAYS);

  // Q-71 (2): the reports the figures count (approved, or also sent when the company needs no approval)
  const counted = await countedReportCondition(db, input.tenantId);
  const [schedule, firsts, weights, units, overdue, openNcrs, openIncidents, lostTime, highRisks, waitingDecisions, waitingEscalations, below] = await Promise.all([
    db.select({ projectId: activities.projectId, start: activities.plannedStartAt, finish: activities.plannedFinishAt, plannedValue: activities.plannedValue, durationHours: activities.durationHours, taskType: activities.taskType })
      .from(activities).where(and(eq(activities.tenantId, input.tenantId), inArray(activities.projectId, projectIds), isNotNull(activities.externalId), or(isNotNull(activities.plannedStartAt), isNotNull(activities.plannedFinishAt)))),
    db.select({ projectId: siteDailyReports.projectId, activityId: siteDailyReportLines.pmcActivityDefinitionId, date: sql<string>`min(${siteDailyReports.reportDate})::text` })
      .from(siteDailyReportLines).innerJoin(siteDailyReports, eq(siteDailyReports.id, siteDailyReportLines.reportId))
      .where(and(eq(siteDailyReports.tenantId, input.tenantId), inArray(siteDailyReports.projectId, projectIds), counted, sql`${siteDailyReports.reportDate} <= ${today}`,
        eq(siteDailyReportLines.lineType, "work"), eq(siteDailyReportLines.reportedStatus, "COMPLETE"), isNotNull(siteDailyReportLines.pmcUnitId)))
      .groupBy(siteDailyReports.projectId, siteDailyReportLines.pmcActivityDefinitionId, siteDailyReportLines.pmcUnitId),
    db.select({ projectId: pmcActivityDefinitions.projectId, id: pmcActivityDefinitions.id, weightPercent: pmcActivityDefinitions.weightPercent }).from(pmcActivityDefinitions)
      .where(and(eq(pmcActivityDefinitions.tenantId, input.tenantId), inArray(pmcActivityDefinitions.projectId, projectIds))),
    db.select({ projectId: pmcUnits.projectId, n: sql<number>`count(*)::int` }).from(pmcUnits).where(and(eq(pmcUnits.tenantId, input.tenantId), inArray(pmcUnits.projectId, projectIds))).groupBy(pmcUnits.projectId),
    db.select({ projectId: activities.projectId, n: sql<number>`count(*)::int` }).from(activities)
      .where(and(eq(activities.tenantId, input.tenantId), inArray(activities.projectId, projectIds), ne(activities.status, "completed"), isNotNull(activities.plannedFinishAt), lt(activities.plannedFinishAt, now))).groupBy(activities.projectId),
    db.select({ projectId: ncrs.projectId, n: sql<number>`count(*)::int` }).from(ncrs)
      .where(and(eq(ncrs.tenantId, input.tenantId), inArray(ncrs.projectId, projectIds), notInArray(ncrs.status, ["closed", "cancelled"]))).groupBy(ncrs.projectId),
    db.select({ projectId: safetyIncidents.projectId, n: sql<number>`count(*)::int` }).from(safetyIncidents)
      .where(and(eq(safetyIncidents.tenantId, input.tenantId), inArray(safetyIncidents.projectId, projectIds), ne(safetyIncidents.status, "closed"))).groupBy(safetyIncidents.projectId),
    db.select({ projectId: safetyIncidents.projectId, n: sql<number>`count(*)::int` }).from(safetyIncidents)
      .where(and(eq(safetyIncidents.tenantId, input.tenantId), inArray(safetyIncidents.projectId, projectIds), inArray(safetyIncidents.kind, [...LOST_TIME_KINDS]), gte(safetyIncidents.occurredOn, lostSince), sql`${safetyIncidents.occurredOn} <= ${today}`)).groupBy(safetyIncidents.projectId),
    db.select({ projectId: risks.projectId, n: sql<number>`count(*)::int` }).from(risks)
      .where(and(eq(risks.tenantId, input.tenantId), inArray(risks.projectId, projectIds), ne(risks.status, "closed"), sql`${risks.probability} * ${risks.severity} >= ${HIGH_RISK_SCORE}`)).groupBy(risks.projectId),
    membership ? db.select({ projectId: decisions.projectId, n: sql<number>`count(*)::int` }).from(decisions)
      .where(and(eq(decisions.tenantId, input.tenantId), inArray(decisions.projectId, projectIds), eq(decisions.decisionOwnerMembershipId, membership.id), eq(decisions.status, "submitted"))).groupBy(decisions.projectId) : Promise.resolve([]),
    membership ? db.select({ projectId: actions.projectId, n: sql<number>`count(*)::int` }).from(actions)
      .where(and(eq(actions.tenantId, input.tenantId), inArray(actions.projectId, projectIds), eq(actions.ownerMembershipId, membership.id), eq(actions.escalationStatus, "escalated"), inArray(actions.status, ["open", "in_progress"]))).groupBy(actions.projectId) : Promise.resolve([]),
    materialsBelowReorder(db, input.tenantId, projectIds),
  ]);

  // money: the live earned value of the projects whose money the caller may see, and of no other (205-1). The profit in these rows is not read at all.
  const moneyIds = projectIds.filter(id => Boolean(snapshot && projectMoneyVisible(snapshot, id)));
  const evmInputs = moneyIds.length ? await loadProfitabilityRowsByProject(db, input.tenantId, moneyIds).catch(error => { logError("operations.evm_batch_failed", error, { tenantId: input.tenantId }); return null; }) : null;

  const [overdueBy, ncrBy, incidentBy, lostBy, riskBy, decisionBy, escalationBy, unitsBy] = [overdue, openNcrs, openIncidents, lostTime, highRisks, waitingDecisions, waitingEscalations, units].map(countBy);
  const rows = await Promise.all(projectRows.map(async (project): Promise<OperationsRow> => {
    const tasks = schedule.filter(row => row.projectId === project.id && !MILESTONE_TYPES.includes(row.taskType ?? "")).map(row => ({
      start: isoDay(row.start ?? row.finish)!, finish: isoDay(row.finish ?? row.start)!, plannedValue: Number(row.plannedValue ?? 0), durationHours: Number(row.durationHours ?? 0),
    }));
    const unitCount = unitsBy.get(project.id) ?? 0;
    const completions = firsts.filter(row => row.projectId === project.id && row.activityId).map(row => ({ activityId: row.activityId!, date: row.date }));
    const weightOf = new Map(weights.filter(row => row.projectId === project.id).map(row => [row.id, Number(row.weightPercent)]));
    const planned = plannedCurve(tasks, [today])[0] ?? null;
    // no villa completed in any approved daily report yet: the actual has no source (the grid's own progress is another reading), so null, not 0
    const actual = completions.length ? actualCurve(completions, weightOf, unitCount, [today])[0] ?? null : null;
    const reason = unitCount === 0 ? "NO_UNITS" as const : !completions.length ? "NO_REPORTS" as const : planned === null ? "NO_SCHEDULE" as const : null;
    const progress = { actual, planned, deviation: actual === null || planned === null ? null : round2(actual - planned), reason };

    let stalledUnits: number | null = null;
    try { stalledUnits = unitCount ? (await computeStalledUnits(db, { tenantId: input.tenantId, projectId: project.id }, now)).counts.stalled : null; }
    catch (error) { logError("operations.stalled_failed", error, { tenantId: input.tenantId, projectId: project.id }); }

    let cost: OperationsRow["cost"] = { value: null, reason: "MONEY_HIDDEN" };
    if (moneyIds.includes(project.id)) {
      const loaded = evmInputs?.get(project.id);
      const live = loaded ? liveEvm(loaded, now, DEFAULT_EAC_METHOD) : null;
      cost = !live || "error" in live ? { value: null, reason: "EVM_UNAVAILABLE" } : { costVariance: round2(live.ev - live.ac), cpi: live.cpi };
    }
    return {
      projectId: project.id, code: project.code, name: project.name, currency: project.currency, status: project.status as OperationsRow["status"],
      progress, overdueActivities: overdueBy.get(project.id) ?? 0, stalledUnits,
      openNcrs: ncrBy.get(project.id) ?? 0,
      safety: { openIncidents: incidentBy.get(project.id) ?? 0, lostTimeLast30Days: lostBy.get(project.id) ?? 0 },
      materialsBelowReorder: below.get(project.id) ?? 0,
      cost, highRisks: riskBy.get(project.id) ?? 0,
      waiting: { decisions: decisionBy.get(project.id) ?? 0, escalations: escalationBy.get(project.id) ?? 0 },
    };
  }));
  return { today, projects: rows.sort((a, b) => a.code.localeCompare(b.code)) };
}

