// Q-14: which villas have stopped moving. A villa counts only when work on it has started (one activity is past «not started») and it is not complete
// (some activity of its model is not complete). Its last movement is the latest progress update or QC receipt on it; the days since are WORKING days of the
// project (its work week: a Friday off is not counted), from the day after the movement up to today. Active ≤ threshold < stalled ≤ long < long-stalled.
export type StallActivity = { id: string; code: string; name: string; order: number };
export type StallCell = { activityDefinitionId: string; status: string; changedAt: Date };
export type StallUnit = { unitId: string; villa: string; blockCode: string; modelCode: string; cells: StallCell[]; qcChangedAt: Date[] };
export type StallClass = "active" | "stalled" | "long";
export type StallRow = { unitId: string; villa: string; blockCode: string; modelCode: string; lastMovedOn: string; workingDays: number; state: StallClass; lastActivity: { code: string; name: string } | null; nextActivity: { code: string; name: string } | null };

export const DEFAULT_STALL_THRESHOLD = 3;
export const LONG_STALL_DAYS = 14;

/** The day of a moment in Riyadh (UTC+3), the project's day. */
export const riyadhDay = (moment: Date) => new Date(moment.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);

/** Working days after `from` up to and including `to` (0 when `to` is not after `from`). `workDays` are JavaScript weekdays (0 = Sunday). */
export function workingDaysBetween(from: string, to: string, workDays: readonly number[]): number {
  let count = 0;
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let day = Date.parse(`${from}T00:00:00Z`) + 86_400_000; day <= end; day += 86_400_000) if (workDays.includes(new Date(day).getUTCDay())) count += 1;
  return count;
}

export function classifyStalledUnits(input: { units: StallUnit[]; activitiesByModel: Map<string, StallActivity[]>; today: string; workDays: readonly number[]; threshold: number; longDays?: number }): StallRow[] {
  const longDays = input.longDays ?? LONG_STALL_DAYS;
  const rows: StallRow[] = [];
  for (const unit of input.units) {
    const activities = [...(input.activitiesByModel.get(unit.modelCode) ?? [])].sort((a, b) => a.order - b.order);
    if (!activities.length) continue;
    const statusOf = new Map(unit.cells.map(cell => [cell.activityDefinitionId, cell.status]));
    const started = unit.cells.some(cell => cell.status !== "NOT_STARTED");
    const complete = activities.every(activity => statusOf.get(activity.id) === "COMPLETE");
    if (!started || complete) continue;
    const moved = [...unit.cells].sort((a, b) => b.changedAt.getTime() - a.changedAt.getTime());
    const latestCell = moved[0] ?? null;
    const lastMoment = [latestCell?.changedAt, ...unit.qcChangedAt].filter((value): value is Date => Boolean(value)).sort((a, b) => b.getTime() - a.getTime())[0];
    const lastMovedOn = riyadhDay(lastMoment);
    const workingDays = workingDaysBetween(lastMovedOn, input.today, input.workDays);
    const lastDefinition = latestCell ? activities.find(activity => activity.id === latestCell.activityDefinitionId) : undefined;
    const next = activities.find(activity => statusOf.get(activity.id) !== "COMPLETE");
    rows.push({
      unitId: unit.unitId, villa: unit.villa, blockCode: unit.blockCode, modelCode: unit.modelCode, lastMovedOn, workingDays,
      state: workingDays > longDays ? "long" : workingDays > input.threshold ? "stalled" : "active",
      lastActivity: lastDefinition ? { code: lastDefinition.code, name: lastDefinition.name } : null,
      nextActivity: next ? { code: next.code, name: next.name } : null,
    });
  }
  return rows.sort((a, b) => b.workingDays - a.workingDays || Number(a.villa) - Number(b.villa));
}
