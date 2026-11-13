// D-53 (a), §6: the monthly report's S-curve and milestones, as pure functions (the service, server/monthlyReport.ts, reads the rows).
//
// - PLANNED: the imported P6 schedule (activities with an external id). Each activity spreads its weight evenly over its planned days, so the planned share at a date
//   is weight × (days of the activity elapsed by then ÷ its days). The weight is its planned value; when the schedule carries no values at all, its duration.
// - ACTUAL: the daily reports (the same rule as the weekly engine, D-48): an activity's share is its weight in its model × the villas completed by then (first approved
//   completion) ÷ the villas of the project. So a planned figure is never read from the actuals, and an actual one never from the schedule.
const DAY_MS = 86_400_000;
const day = (value: string) => Date.parse(`${value}T00:00:00Z`);
const round = (value: number, places = 4) => Math.round(value * 10 ** places) / 10 ** places;

/** Month ends from the first month to the last, as YYYY-MM-DD. */
export function monthEnds(from: string, to: string): string[] {
  const out: string[] = [];
  let year = Number(from.slice(0, 4)), month = Number(from.slice(5, 7)) - 1;
  const lastKey = to.slice(0, 7);
  for (let guard = 0; guard < 240; guard++) {
    const end = new Date(Date.UTC(year, month + 1, 0)).toISOString().slice(0, 10);
    out.push(end);
    if (end.slice(0, 7) >= lastKey) break;
    month += 1; if (month === 12) { month = 0; year += 1; }
  }
  return out;
}

export type ScheduledActivity = { start: string; finish: string; plannedValue: number; durationHours: number };
/** The planned cumulative percentage (0–100) at each date; null when the schedule has nothing to weigh. */
export function plannedCurve(activities: ScheduledActivity[], dates: string[]): Array<number | null> {
  const usable = activities.filter(activity => day(activity.finish) >= day(activity.start));
  const byValue = usable.some(activity => activity.plannedValue > 0);
  const weightOf = (activity: ScheduledActivity) => (byValue ? activity.plannedValue : activity.durationHours);
  const total = usable.reduce((sum, activity) => sum + weightOf(activity), 0);
  if (!(total > 0)) return dates.map(() => null);
  return dates.map(date => {
    const at = day(date);
    const done = usable.reduce((sum, activity) => {
      const start = day(activity.start), finish = day(activity.finish);
      const span = (finish - start) / DAY_MS + 1; // inclusive days: a one-day activity is done on its day
      const elapsed = Math.min(Math.max((at - start) / DAY_MS + 1, 0), span);
      return sum + weightOf(activity) * (elapsed / span);
    }, 0);
    return round((done / total) * 100);
  });
}

/** The actual cumulative percentage (0–100) at each date from the first completions of villas: Σ weight% × villas done ÷ villas of the project. */
export function actualCurve(firstCompletions: Array<{ activityId: string; date: string }>, weightPercent: Map<string, number>, totalUnits: number, dates: string[]): Array<number | null> {
  if (totalUnits <= 0) return dates.map(() => null);
  return dates.map(date => round(firstCompletions.reduce((sum, row) => sum + (row.date <= date ? (weightPercent.get(row.activityId) ?? 0) : 0), 0) / totalUnits));
}

export type Milestone = { code: string; name: string; plannedDate: string | null; actualDate: string | null };
/** Each milestone's state at the report's end: done (and whether late), late (due and not done), due this month, or ahead. */
export function milestoneStates(milestones: Milestone[], monthStart: string, monthEnd: string) {
  return milestones.map(milestone => {
    const done = milestone.actualDate !== null && milestone.actualDate <= monthEnd;
    const state = done ? (milestone.plannedDate !== null && milestone.actualDate! > milestone.plannedDate ? "done_late" : "done")
      : milestone.plannedDate !== null && milestone.plannedDate < monthStart ? "late"
      : milestone.plannedDate !== null && milestone.plannedDate <= monthEnd ? "due_this_month" : "ahead";
    const varianceDays = milestone.plannedDate === null ? null : Math.round(((done ? day(milestone.actualDate!) : day(monthEnd)) - day(milestone.plannedDate)) / DAY_MS);
    return { ...milestone, actualDate: done ? milestone.actualDate : null, state, varianceDays: state === "ahead" || state === "due_this_month" ? null : varianceDays };
  });
}
