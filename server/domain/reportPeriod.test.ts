import { describe, expect, it } from "vitest";
import { activityFigures, ncrAges, periodRange, sumOrNull, workDaysOf, workingDays } from "./reportPeriod";

// D-48: the period rules and the arithmetic, without a database (the database half is server/reportPeriods.database.test.ts).
describe("report periods (D-48)", () => {
  it("a week is seven days from its first; a month is the calendar month; a date that does not exist is refused", () => {
    expect(periodRange("week", "2026-11-07")).toMatchObject({ start: "2026-11-07", end: "2026-11-13" });
    expect(periodRange("month", "2026-02-17")).toMatchObject({ start: "2026-02-01", end: "2026-02-28" });
    expect(periodRange("month", "2028-02-03")?.days).toHaveLength(29);
    for (const bad of ["2026-02-30", "2026-13-01", "11/07/2026", ""]) expect(periodRange("week", bad), bad).toBeNull();
  });

  it("work days come from the project profile; without one, the spec's Saturday to Thursday — so a Saturday-to-Friday week has six working days", () => {
    expect(workDaysOf(null)).toEqual([6, 0, 1, 2, 3, 4]);
    expect(workDaysOf("01234")).toEqual([0, 1, 2, 3, 4]);
    const week = periodRange("week", "2026-11-07")!.days; // a Saturday
    expect(workingDays(week, workDaysOf(null))).toEqual(["2026-11-07", "2026-11-08", "2026-11-09", "2026-11-10", "2026-11-11", "2026-11-12"]);
    expect(workingDays(week, workDaysOf("01234"))).toHaveLength(5);
  });

  it("NEGATIVE: the plan is never taken from the actuals — a day with an actual and no plan has no plan, and a period with no plan has none (null, not 0, not the actual)", () => {
    expect(sumOrNull([null, null])).toBeNull();
    expect(sumOrNull([null, 2])).toBe(2);
    const [figure] = activityFigures(
      [{ activityId: "a", date: "2026-11-08", planned: null, actual: 7, completedUnits: 0 }, { activityId: "a", date: "2026-11-09", planned: null, actual: 5, completedUnits: 0 }],
      [{ activityId: "a", code: "WALL", name: "Wall", modelCode: "A", unitsInModel: 10 }], { start: "2026-11-07", end: "2026-11-13" }, 6);
    expect(figure.period.planned).toBeNull(); expect(figure.period.actual).toBe(12);
    expect(figure.period.variance).toBeNull(); expect(figure.period.percentOfPlan).toBeNull();
    expect(figure.daily.every(day => day.planned === null && day.variance === null)).toBe(true);
  });

  it("period, cumulative, average per WORKING day and best day; days after the period are left out", () => {
    const rows = [
      { activityId: "a", date: "2026-10-30", planned: 4, actual: 3, completedUnits: 1 }, // before the period: cumulative only
      { activityId: "a", date: "2026-11-08", planned: 5, actual: 6, completedUnits: 2 },
      { activityId: "a", date: "2026-11-10", planned: 5, actual: 3, completedUnits: 0 },
      { activityId: "a", date: "2026-11-20", planned: 9, actual: 9, completedUnits: 9 }, // after the period: nowhere
    ];
    const [figure] = activityFigures(rows, [{ activityId: "a", code: "WALL", name: "Wall", modelCode: "A", unitsInModel: 10 }], { start: "2026-11-07", end: "2026-11-13" }, 6);
    expect(figure.period).toMatchObject({ planned: 10, actual: 9, completedUnits: 2, variance: -1, percentOfPlan: 90 });
    expect(figure.cumulative).toMatchObject({ planned: 14, actual: 12, completedUnits: 3, variance: -2, completedPercentOfUnits: 30 });
    expect(figure.averagePerWorkingDay).toBe(1.5);
    expect(figure.bestDay).toEqual({ date: "2026-11-08", actual: 6 });
  });

  it("NCR ages at the period's end, in the report's buckets", () => {
    const at = (day: string) => new Date(`${day}T08:00:00Z`);
    expect(ncrAges([at("2026-11-12"), at("2026-11-01"), at("2026-10-20"), at("2026-09-01")], "2026-11-13")).toEqual({ open: 4, oldestDays: 73, buckets: { upTo7: 1, from8To14: 1, from15To30: 1, over30: 1 } });
    expect(ncrAges([], "2026-11-13")).toMatchObject({ open: 0, oldestDays: null });
  });
});
