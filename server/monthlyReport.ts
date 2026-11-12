// D-53 (a), §6: the monthly report's data — the period engine (D-48) for a calendar month, the S-curve (planned from the imported P6 schedule against the actual from
// the approved daily reports), the milestones, and earned value. Read only; nothing is stored, so a figure here is always what the sources say now.
// Earned value is money: it is returned only to a caller holding project.budget.manage on the project, and is null (with financialHidden) for anyone else.
import { TRPCError } from "@trpc/server";
import { and, desc, eq, isNotNull, or, sql } from "drizzle-orm";
import { activities, evmSnapshots, pmcActivityDefinitions, pmcUnits, siteDailyReportLines, siteDailyReports } from "../drizzle/schema";
import { getTenantAccessSnapshot } from "./db";
import { holdsPermission } from "./domain/authorization";
import { actualCurve, milestoneStates, monthEnds, plannedCurve } from "./domain/monthlyCurve";
import { getReportPeriod } from "./reportPeriods";
import { authorize, READ_PERMISSIONS } from "./siteReports";

type Scope = { userId: number; tenantId: string; projectId: string };
const mine = <T extends { tenantId: unknown; projectId: unknown }>(table: T, input: Scope) => and(eq(table.tenantId as never, input.tenantId), eq(table.projectId as never, input.projectId));
const FINANCIAL_PERMISSION = "project.budget.manage";
const isoDay = (value: Date | null) => (value ? value.toISOString().slice(0, 10) : null);
const MILESTONE_TYPES = ["TT_Mile", "TT_FinMile"];

export async function getMonthlyReport(input: Scope & { month: string; includeUnapproved?: boolean }) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.month)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_REPORT_PERIOD_INVALID" });
  // the period engine checks the caller (read permissions, company and project) before anything else is read
  const period = await getReportPeriod({ ...input, kind: "month", anchor: `${input.month}-01` });
  const db = await authorize(input, READ_PERMISSIONS);
  const { start, end } = period.period;
  const counted = input.includeUnapproved ? sql`${siteDailyReports.status} <> 'rejected'` : sql`${siteDailyReports.status} = 'approved'`;

  const [schedule, firsts, definitions, unitCount, snapshot] = await Promise.all([
    // the imported P6 schedule: activities that came from P6 (an external id) with both planned dates
    db.select({ code: activities.code, name: activities.name, start: activities.plannedStartAt, finish: activities.plannedFinishAt, actualStart: activities.actualStartAt, actualFinish: activities.actualFinishAt, plannedValue: activities.plannedValue, durationHours: activities.durationHours, taskType: activities.taskType })
      .from(activities).where(and(mine(activities, input), isNotNull(activities.externalId), or(isNotNull(activities.plannedStartAt), isNotNull(activities.plannedFinishAt)))),
    // each villa's FIRST completion per activity, up to the month's end (the D-48 rule)
    db.select({ activityId: siteDailyReportLines.pmcActivityDefinitionId, date: sql<string>`min(${siteDailyReports.reportDate})::text` })
      .from(siteDailyReportLines).innerJoin(siteDailyReports, eq(siteDailyReports.id, siteDailyReportLines.reportId))
      .where(and(mine(siteDailyReports, input), counted, sql`${siteDailyReports.reportDate} <= ${end}`, eq(siteDailyReportLines.lineType, "work"), eq(siteDailyReportLines.reportedStatus, "COMPLETE"), sql`${siteDailyReportLines.pmcUnitId} IS NOT NULL`))
      .groupBy(siteDailyReportLines.pmcActivityDefinitionId, siteDailyReportLines.pmcUnitId),
    db.select({ id: pmcActivityDefinitions.id, weightPercent: pmcActivityDefinitions.weightPercent }).from(pmcActivityDefinitions).where(mine(pmcActivityDefinitions, input)),
    db.select({ units: sql<number>`count(*)::int` }).from(pmcUnits).where(mine(pmcUnits, input)),
    db.select().from(evmSnapshots).where(and(mine(evmSnapshots, input), sql`(${evmSnapshots.periodAt} AT TIME ZONE 'UTC')::date <= ${end}::date`)).orderBy(desc(evmSnapshots.periodAt)).limit(1),
  ]);

  const tasks = schedule.filter(row => !MILESTONE_TYPES.includes(row.taskType ?? "")).map(row => {
    const startDay = isoDay(row.start ?? row.finish)!, finishDay = isoDay(row.finish ?? row.start)!;
    return { start: startDay, finish: finishDay, plannedValue: Number(row.plannedValue ?? 0), durationHours: Number(row.durationHours ?? 0) };
  });
  const completions = firsts.filter(row => row.activityId).map(row => ({ activityId: row.activityId!, date: row.date }));
  const weights = new Map(definitions.map(row => [row.id, Number(row.weightPercent)]));
  // the curve runs from the schedule's first month (or the first completion) to the report's month
  const firstDay = [...tasks.map(task => task.start), ...completions.map(row => row.date)].sort()[0] ?? start;
  const dates = monthEnds(firstDay, end);
  const planned = plannedCurve(tasks, dates);
  const actual = actualCurve(completions, weights, unitCount[0]?.units ?? 0, dates);

  const snapshotAccess = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  const financial = Boolean(snapshotAccess && holdsPermission(snapshotAccess, FINANCIAL_PERMISSION, { type: "project", id: input.projectId }));
  const evm = snapshot[0];
  const num = (value: string | null) => (value === null ? null : Number(value));

  return {
    ...period,
    sCurve: {
      plannedSource: tasks.length ? "p6" as const : null, // no imported P6 schedule: the planned line is absent, never invented
      points: dates.map((date, index) => ({ month: date.slice(0, 7), date, planned: planned[index], actual: date <= end ? actual[index] : null, deviation: planned[index] === null || actual[index] === null ? null : Math.round((actual[index]! - planned[index]!) * 10_000) / 10_000 })),
    },
    milestones: milestoneStates(schedule.filter(row => MILESTONE_TYPES.includes(row.taskType ?? "")).sort((a, b) => (isoDay(a.finish ?? a.start) ?? "").localeCompare(isoDay(b.finish ?? b.start) ?? ""))
      .map(row => ({ code: row.code, name: row.name, plannedDate: isoDay(row.finish ?? row.start), actualDate: isoDay(row.actualFinish ?? row.actualStart) })), start, end),
    earnedValue: financial ? (evm ? { asOf: isoDay(evm.periodAt), pv: Number(evm.pv), ev: Number(evm.ev), ac: Number(evm.ac), bac: Number(evm.bac), cv: Number(evm.cv), sv: Number(evm.sv), cpi: num(evm.cpi), spi: num(evm.spi) } : null) : null,
    financialHidden: !financial,
  };
}
