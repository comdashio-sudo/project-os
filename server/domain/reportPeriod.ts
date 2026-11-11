// D-48 (§5): the period a weekly or monthly report covers, and the arithmetic that turns daily rows into its figures. Pure functions: the service
// (server/reportPeriods.ts) reads the rows, this file adds them up, so the rules are tested without a database.
//
// The rules the owner named (spec §5 and «errors the system prevents»):
// - every figure is a sum of what the daily reports say, nothing typed again;
// - the PLAN is never taken from the actuals: a day with an actual and no plan has no plan (null), and a period whose days have no plan has no plan;
// - the average is per WORKING day of the period (the project's work days), not per calendar day and not per reported day.

export type PeriodKind = "week" | "month";
const DAY_MS = 86_400_000;
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
const parseDay = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || isoDay(date) !== value ? null : date;
};

/** The project's work days as JavaScript weekdays (0 = Sunday). No profile: the spec's Saturday–Thursday. */
export function workDaysOf(profileDigits: string | null | undefined): number[] {
  const days = (profileDigits ?? "").split("").map(Number).filter(day => Number.isInteger(day) && day >= 0 && day <= 6);
  return days.length ? days : [6, 0, 1, 2, 3, 4];
}

/** A week is seven days from its first day; a month is the calendar month of the day given. Null for a date that does not exist. */
export function periodRange(kind: PeriodKind, anchor: string): { start: string; end: string; days: string[] } | null {
  const date = parseDay(anchor);
  if (!date) return null;
  const start = kind === "week" ? date : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  const end = kind === "week" ? new Date(start.getTime() + 6 * DAY_MS) : new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  const days: string[] = [];
  for (let at = start.getTime(); at <= end.getTime(); at += DAY_MS) days.push(isoDay(new Date(at)));
  return { start: days[0], end: days[days.length - 1], days };
}
export const workingDays = (days: string[], workDays: number[]) => days.filter(day => workDays.includes(new Date(`${day}T00:00:00Z`).getUTCDay()));

/** A sum that stays null when nothing was entered (so a plan nobody gave is not shown as 0, and is never filled from the actual). */
export const sumOrNull = (values: Array<number | null>) => (values.some(value => value !== null) ? round(values.reduce<number>((total, value) => total + (value ?? 0), 0)) : null);
export const round = (value: number, places = 3) => Math.round(value * 10 ** places) / 10 ** places;
const ratio = (part: number | null, whole: number | null) => (part === null || whole === null || whole === 0 ? null : round((part / whole) * 100, 2));

export type ActivityDayRow = { activityId: string; date: string; planned: number | null; actual: number | null; completedUnits: number };
export type ActivityFacts = { activityId: string; code: string; name: string; modelCode: string; unitsInModel: number };

/** Per activity: the period's days, its totals and the project's totals up to the period's end, the average per working day and the best day. */
/**
 * `completed` holds the DISTINCT villas reported COMPLETE per activity, counted by the database over the period and over everything up to its end (review of #248:
 * a villa reported complete on two days is ONE villa; adding the per-day counts counted it twice). The per-day counts stay in the daily series only.
 */
export function activityFigures(rows: ActivityDayRow[], facts: ActivityFacts[], range: { start: string; end: string }, workingDayCount: number, completed: { period: Map<string, number>; cumulative: Map<string, number> } = { period: new Map(), cumulative: new Map() }) {
  return facts.map(fact => {
    const mine = rows.filter(row => row.activityId === fact.activityId && row.date <= range.end);
    const inPeriod = mine.filter(row => row.date >= range.start).sort((a, b) => a.date.localeCompare(b.date));
    const period = { planned: sumOrNull(inPeriod.map(row => row.planned)), actual: sumOrNull(inPeriod.map(row => row.actual)), completedUnits: completed.period.get(fact.activityId) ?? 0 };
    const cumulative = { planned: sumOrNull(mine.map(row => row.planned)), actual: sumOrNull(mine.map(row => row.actual)), completedUnits: completed.cumulative.get(fact.activityId) ?? 0 };
    const best = inPeriod.filter(row => row.actual !== null).reduce<ActivityDayRow | null>((top, row) => (top === null || (row.actual ?? 0) > (top.actual ?? 0) ? row : top), null);
    return {
      ...fact,
      period: { ...period, variance: period.planned === null || period.actual === null ? null : round(period.actual - period.planned), percentOfPlan: ratio(period.actual, period.planned) },
      cumulative: { ...cumulative, variance: cumulative.planned === null || cumulative.actual === null ? null : round(cumulative.actual - cumulative.planned), percentOfPlan: ratio(cumulative.actual, cumulative.planned), completedPercentOfUnits: ratio(cumulative.completedUnits, fact.unitsInModel) },
      averagePerWorkingDay: period.actual === null || workingDayCount === 0 ? null : round(period.actual / workingDayCount),
      bestDay: best ? { date: best.date, actual: best.actual } : null,
      daily: inPeriod.map(row => ({ date: row.date, planned: row.planned, actual: row.actual, variance: row.planned === null || row.actual === null ? null : round(row.actual - row.planned), completedUnits: row.completedUnits })),
    };
  });
}

/** NCR ages in whole days at the period's end, in the buckets the weekly report shows. */
export function ncrAges(openedAt: Date[], periodEnd: string) {
  const end = new Date(`${periodEnd}T23:59:59Z`).getTime();
  const ages = openedAt.map(at => Math.max(0, Math.floor((end - at.getTime()) / DAY_MS)));
  return { open: ages.length, oldestDays: ages.length ? Math.max(...ages) : null, buckets: { upTo7: ages.filter(age => age <= 7).length, from8To14: ages.filter(age => age >= 8 && age <= 14).length, from15To30: ages.filter(age => age >= 15 && age <= 30).length, over30: ages.filter(age => age > 30).length } };
}
