import { describe, expect, it } from "vitest";
import { actualCurve, milestoneStates, monthEnds, plannedCurve } from "./monthlyCurve";

// D-53 (a): the S-curve and milestone rules, without a database (the database half is server/monthlyReport.database.test.ts).
describe("monthly S-curve and milestones (D-53 a)", () => {
  it("month ends from the first month to the last, across a year", () => {
    expect(monthEnds("2026-11-15", "2027-02-03")).toEqual(["2026-11-30", "2026-12-31", "2027-01-31", "2027-02-28"]);
    expect(monthEnds("2026-10-01", "2026-10-31")).toEqual(["2026-10-31"]);
  });

  it("the planned line spreads each P6 activity's value evenly over its planned days", () => {
    const schedule = [{ start: "2026-09-01", finish: "2026-09-30", plannedValue: 1000, durationHours: 0 }, { start: "2026-10-01", finish: "2026-11-30", plannedValue: 3000, durationHours: 0 }];
    const [sep, oct, nov] = plannedCurve(schedule, ["2026-09-30", "2026-10-31", "2026-11-30"]);
    expect(sep).toBe(25);
    expect(oct).toBeCloseTo(((1000 + 3000 * (31 / 61)) / 4000) * 100, 3);
    expect(nov).toBe(100);
    expect(plannedCurve(schedule, ["2026-08-31"])).toEqual([0]);
  });

  it("without any planned value the schedule is weighed by duration; with nothing to weigh the line is absent (null), never invented", () => {
    expect(plannedCurve([{ start: "2026-09-01", finish: "2026-09-10", plannedValue: 0, durationHours: 80 }, { start: "2026-09-11", finish: "2026-09-20", plannedValue: 0, durationHours: 240 }], ["2026-09-10"])).toEqual([25]);
    expect(plannedCurve([], ["2026-09-30"])).toEqual([null]);
  });

  it("the actual line: weight × villas first completed by the date ÷ villas of the project", () => {
    const firsts = [{ activityId: "wall", date: "2026-10-05" }, { activityId: "wall", date: "2026-10-20" }, { activityId: "slab", date: "2026-11-02" }];
    expect(actualCurve(firsts, new Map([["wall", 60], ["slab", 40]]), 10, ["2026-09-30", "2026-10-31", "2026-11-30"])).toEqual([0, 12, 16]);
    expect(actualCurve(firsts, new Map(), 0, ["2026-10-31"])).toEqual([null]);
  });

  it("milestones at the month's end: done, done late, late, due this month, ahead", () => {
    const states = milestoneStates([
      { code: "M1", name: "a", plannedDate: "2026-10-10", actualDate: "2026-10-08" },
      { code: "M2", name: "b", plannedDate: "2026-10-10", actualDate: "2026-10-15" },
      { code: "M3", name: "c", plannedDate: "2026-09-20", actualDate: null },
      { code: "M4", name: "d", plannedDate: "2026-10-25", actualDate: null },
      { code: "M5", name: "e", plannedDate: "2026-12-01", actualDate: "2026-12-02" }, // done after the month: not done yet at its end
    ], "2026-10-01", "2026-10-31");
    expect(states.map(s => [s.code, s.state, s.varianceDays, s.actualDate])).toEqual([["M1", "done", -2, "2026-10-08"], ["M2", "done_late", 5, "2026-10-15"], ["M3", "late", 41, null], ["M4", "due_this_month", null, null], ["M5", "ahead", null, null]]);
  });
});
