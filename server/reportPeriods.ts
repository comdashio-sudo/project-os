// D-48 (§5): the period engine behind the weekly report (D-49, D-50) and the monthly one (D-53). It READS the daily reports and adds them up; it writes nothing and
// stores nothing, so a figure here is always the sum of the dailies as they stand. Every sum is done by the database (GROUP BY), so a project of 1,230 units
// costs a handful of queries, not one per unit. The arithmetic and the period rules are in server/domain/reportPeriod.ts.
//
// Which daily reports count: the APPROVED ones (the record), unless includeUnapproved asks for every report but a rejected one (a draft view for the planner).
import { TRPCError } from "@trpc/server";
import { and, asc, eq, sql } from "drizzle-orm";
import { ncrs, pmcActivityDefinitions, pmcInspectionRequests, pmcUnits, projectEquipment, projectLabourRoles, projectProfiles, rfis, siteDailyReportEquipment, siteDailyReportHse, siteDailyReportLabour, siteDailyReportLines, siteDailyReports } from "../drizzle/schema";
import { activityFigures, ncrAges, periodRange, round, workDaysOf, workingDays, type ActivityDayRow, type PeriodKind } from "./domain/reportPeriod";
import { authorize, HSE_KINDS, READ_PERMISSIONS } from "./siteReports";

type Scope = { userId: number; tenantId: string; projectId: string };
const mine = <T extends { tenantId: unknown; projectId: unknown }>(table: T, input: Scope) => and(eq(table.tenantId as never, input.tenantId), eq(table.projectId as never, input.projectId));
const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));
// the site's day (UTC+3), as the daily report reads its inspections
const siteDay = (column: unknown) => sql<string>`(((${column}) AT TIME ZONE 'UTC') + interval '3 hours')::date::text`;

export async function getReportPeriod(input: Scope & { kind: PeriodKind; anchor: string; includeUnapproved?: boolean }) {
  const db = await authorize(input, READ_PERMISSIONS);
  const range = periodRange(input.kind, input.anchor);
  if (!range) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_REPORT_PERIOD_INVALID" });
  const [profile] = await db.select({ workDays: projectProfiles.workDays, workStart: projectProfiles.workStart, workEnd: projectProfiles.workEnd }).from(projectProfiles).where(mine(projectProfiles, input)).limit(1);
  const workDays = workDaysOf(profile?.workDays);
  const working = workingDays(range.days, workDays);
  const counted = input.includeUnapproved ? sql`${siteDailyReports.status} <> 'rejected'` : sql`${siteDailyReports.status} = 'approved'`;
  const upToEnd = and(mine(siteDailyReports, input), counted, sql`${siteDailyReports.reportDate} <= ${range.end}`);
  const inPeriod = and(upToEnd, sql`${siteDailyReports.reportDate} >= ${range.start}`);
  const profileHours = profile?.workStart && profile.workEnd ? round((Date.parse(`1970-01-01T${profile.workEnd}Z`) - Date.parse(`1970-01-01T${profile.workStart}Z`)) / 3_600_000, 2) : null;

  const [reports, activityRows, definitions, unitsPerModel, labourRows, cumulativeLabour, equipmentRows, hseRows, wirRows, rfiRows, openNcrs, ncrMoves] = await Promise.all([
    db.select({ id: siteDailyReports.id, date: siteDailyReports.reportDate, status: siteDailyReports.status, reportNumber: siteDailyReports.reportNumber, workHours: siteDailyReports.workHours }).from(siteDailyReports).where(inPeriod).orderBy(asc(siteDailyReports.reportDate)),
    // one row per activity and day, up to the period's end (the cumulative needs the days before it). A plan nobody entered stays NULL: sum() of nulls is null.
    db.select({ activityId: siteDailyReportLines.pmcActivityDefinitionId, date: siteDailyReports.reportDate, planned: sql<string | null>`sum(${siteDailyReportLines.plannedQuantity})`, actual: sql<string | null>`sum(${siteDailyReportLines.actualQuantity})`,
      completedUnits: sql<number>`count(DISTINCT ${siteDailyReportLines.pmcUnitId}) FILTER (WHERE ${siteDailyReportLines.reportedStatus} = 'COMPLETE')::int` })
      .from(siteDailyReportLines).innerJoin(siteDailyReports, eq(siteDailyReports.id, siteDailyReportLines.reportId))
      .where(and(upToEnd, eq(siteDailyReportLines.lineType, "work"), sql`${siteDailyReportLines.pmcActivityDefinitionId} IS NOT NULL`)).groupBy(siteDailyReportLines.pmcActivityDefinitionId, siteDailyReports.reportDate),
    db.select({ id: pmcActivityDefinitions.id, code: pmcActivityDefinitions.code, name: pmcActivityDefinitions.name, modelCode: pmcActivityDefinitions.modelCode }).from(pmcActivityDefinitions).where(mine(pmcActivityDefinitions, input)).orderBy(asc(pmcActivityDefinitions.modelCode), asc(pmcActivityDefinitions.code)),
    db.select({ modelCode: pmcUnits.modelCode, units: sql<number>`count(*)::int` }).from(pmcUnits).where(mine(pmcUnits, input)).groupBy(pmcUnits.modelCode),
    db.select({ date: siteDailyReports.reportDate, category: projectLabourRoles.category, shift: siteDailyReportLabour.shift, headcount: sql<number>`sum(${siteDailyReportLabour.headcount})::int` })
      .from(siteDailyReportLabour).innerJoin(siteDailyReports, eq(siteDailyReports.id, siteDailyReportLabour.reportId)).innerJoin(projectLabourRoles, eq(projectLabourRoles.id, siteDailyReportLabour.labourRoleId))
      .where(inPeriod).groupBy(siteDailyReports.reportDate, projectLabourRoles.category, siteDailyReportLabour.shift),
    db.select({ category: projectLabourRoles.category, headcount: sql<number>`coalesce(sum(${siteDailyReportLabour.headcount}), 0)::int` })
      .from(siteDailyReportLabour).innerJoin(siteDailyReports, eq(siteDailyReports.id, siteDailyReportLabour.reportId)).innerJoin(projectLabourRoles, eq(projectLabourRoles.id, siteDailyReportLabour.labourRoleId))
      .where(upToEnd).groupBy(projectLabourRoles.category),
    db.select({ date: siteDailyReports.reportDate, equipmentId: siteDailyReportEquipment.equipmentId, equipmentType: projectEquipment.equipmentType, count: sql<number>`sum(${siteDailyReportEquipment.count})::int`, hours: sql<string>`coalesce(sum(${siteDailyReportEquipment.count} * coalesce(${siteDailyReportEquipment.hours}, 0)), 0)` })
      .from(siteDailyReportEquipment).innerJoin(siteDailyReports, eq(siteDailyReports.id, siteDailyReportEquipment.reportId)).innerJoin(projectEquipment, eq(projectEquipment.id, siteDailyReportEquipment.equipmentId))
      .where(inPeriod).groupBy(siteDailyReports.reportDate, siteDailyReportEquipment.equipmentId, projectEquipment.equipmentType),
    db.select({ kind: siteDailyReportHse.kind, items: sql<number>`count(*)::int`, people: sql<number>`coalesce(sum(${siteDailyReportHse.peopleCount}), 0)::int` })
      .from(siteDailyReportHse).innerJoin(siteDailyReports, eq(siteDailyReports.id, siteDailyReportHse.reportId)).where(inPeriod).groupBy(siteDailyReportHse.kind),
    db.select({ code: pmcInspectionRequests.responseCode, items: sql<number>`count(*)::int` }).from(pmcInspectionRequests)
      .where(and(mine(pmcInspectionRequests, input), sql`${siteDay(pmcInspectionRequests.requestedAt)} BETWEEN ${range.start} AND ${range.end}`)).groupBy(pmcInspectionRequests.responseCode),
    db.select({ status: rfis.status, items: sql<number>`count(*)::int` }).from(rfis)
      .where(and(mine(rfis, input), sql`${rfis.submittedAt} IS NOT NULL`, sql`${siteDay(rfis.submittedAt)} BETWEEN ${range.start} AND ${range.end}`)).groupBy(rfis.status),
    db.select({ createdAt: ncrs.createdAt }).from(ncrs).where(and(mine(ncrs, input), sql`${ncrs.status} NOT IN ('closed', 'cancelled')`, sql`${siteDay(ncrs.createdAt)} <= ${range.end}`)),
    db.select({
      opened: sql<number>`count(*) FILTER (WHERE ${siteDay(ncrs.createdAt)} BETWEEN ${range.start} AND ${range.end})::int`,
      // an NCR keeps no closing date of its own: its last change is read as the close (stated in the contract)
      closed: sql<number>`count(*) FILTER (WHERE ${ncrs.status} = 'closed' AND ${siteDay(ncrs.updatedAt)} BETWEEN ${range.start} AND ${range.end})::int`,
    }).from(ncrs).where(mine(ncrs, input)),
  ]);

  // safety man-hours: each day's headcount times that day's working hours (the report's, else the project's); a day with neither is counted, not guessed
  const headcountByDay = new Map<string, number>();
  for (const row of labourRows) headcountByDay.set(row.date, (headcountByDay.get(row.date) ?? 0) + row.headcount);
  let manHours = 0; let daysWithoutHours = 0;
  for (const report of reports) {
    const hours = num(report.workHours) ?? profileHours;
    if (hours === null) { if (headcountByDay.get(report.date)) daysWithoutHours += 1; continue; }
    manHours += (headcountByDay.get(report.date) ?? 0) * hours;
  }

  const unitsOf = new Map(unitsPerModel.map(row => [row.modelCode, row.units]));
  const dayRows: ActivityDayRow[] = activityRows.map(row => ({ activityId: row.activityId!, date: row.date, planned: num(row.planned), actual: num(row.actual), completedUnits: row.completedUnits }));
  const active = new Set(dayRows.map(row => row.activityId));
  const facts = definitions.filter(definition => active.has(definition.id)).map(definition => ({ activityId: definition.id, code: definition.code, name: definition.name, modelCode: definition.modelCode, unitsInModel: unitsOf.get(definition.modelCode) ?? 0 }));
  const labourDay = (date: string, category: string) => labourRows.filter(row => row.date === date && row.category === category).reduce((total, row) => total + row.headcount, 0);
  const reportedDays = new Set(reports.map(report => report.date));
  const equipmentIds = Array.from(new Set(equipmentRows.map(row => row.equipmentId)));
  const wir = (code: string | null) => wirRows.filter(row => row.code === code).reduce((total, row) => total + row.items, 0);
  const rfi = (states: string[]) => rfiRows.filter(row => states.includes(row.status)).reduce((total, row) => total + row.items, 0);

  return {
    period: { kind: input.kind, start: range.start, end: range.end, workDays, workingDays: working, workingDayCount: working.length, includeUnapproved: Boolean(input.includeUnapproved) },
    reports: reports.map(report => ({ id: report.id, date: report.date, reportNumber: report.reportNumber, status: report.status })),
    missingWorkingDays: working.filter(day => !reportedDays.has(day)),
    activities: activityFigures(dayRows, facts, range, working.length),
    labour: {
      period: { direct: labourRows.filter(row => row.category === "direct").reduce((t, r) => t + r.headcount, 0), indirect: labourRows.filter(row => row.category === "indirect").reduce((t, r) => t + r.headcount, 0), day: labourRows.filter(row => row.shift === "day").reduce((t, r) => t + r.headcount, 0), night: labourRows.filter(row => row.shift === "night").reduce((t, r) => t + r.headcount, 0) },
      cumulative: { direct: cumulativeLabour.find(row => row.category === "direct")?.headcount ?? 0, indirect: cumulativeLabour.find(row => row.category === "indirect")?.headcount ?? 0 },
      daily: range.days.map(date => ({ date, direct: labourDay(date, "direct"), indirect: labourDay(date, "indirect") })),
    },
    equipment: equipmentIds.map(equipmentId => {
      const rows = equipmentRows.filter(row => row.equipmentId === equipmentId);
      return { equipmentId, equipmentType: rows[0].equipmentType, units: rows.reduce((t, r) => t + r.count, 0), hours: round(rows.reduce((t, r) => t + Number(r.hours), 0), 2), daily: range.days.map(date => ({ date, count: rows.find(row => row.date === date)?.count ?? 0 })) };
    }),
    quality: {
      wir: { A: wir("A"), B: wir("B"), C: wir("C"), D: wir("UR"), pending: wir(null) },
      rfi: { submitted: rfiRows.reduce((t, r) => t + r.items, 0), answered: rfi(["answered", "closed"]), cancelled: rfi(["cancelled"]), pending: rfiRows.reduce((t, r) => t + r.items, 0) - rfi(["answered", "closed", "cancelled"]) },
      ncr: { opened: ncrMoves[0]?.opened ?? 0, closed: ncrMoves[0]?.closed ?? 0, ...ncrAges(openNcrs.map(row => row.createdAt), range.end) },
    },
    safety: { manHours: round(manHours, 2), daysWithoutHours, ...Object.fromEntries(HSE_KINDS.map(kind => [kind, hseRows.find(row => row.kind === kind)?.items ?? 0])) as Record<(typeof HSE_KINDS)[number], number> },
  };
}
