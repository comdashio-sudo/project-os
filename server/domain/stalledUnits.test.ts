import { describe, expect, it } from "vitest";
import { classifyStalledUnits, workingDaysBetween, type StallUnit } from "./stalledUnits";

// Q-14 with a synthetic project: work week Sunday–Thursday (Friday and Saturday off). Today is Thursday 2026-11-12.
const WEEK = [0, 1, 2, 3, 4];
const TODAY = "2026-11-12";
const activities = new Map([["A", [{ id: "d1", code: "FOOT", name: "Footings", order: 1 }, { id: "d2", code: "WALL", name: "Walls", order: 2 }, { id: "d3", code: "PAINT", name: "Paint", order: 3 }]]]);
const at = (day: string) => new Date(`${day}T08:00:00Z`);
const unit = (villa: string, cells: Array<[string, string, string]>, qc: string[] = []): StallUnit => ({ unitId: `u${villa}`, villa, blockCode: "B1", modelCode: "A", cells: cells.map(([id, status, day]) => ({ activityDefinitionId: id, status, changedAt: at(day) })), qcChangedAt: qc.map(at) });

describe("stalled units (Q-14)", () => {
  it("counts working days only: a Friday and a Saturday in between are not counted", () => {
    expect(workingDaysBetween("2026-11-05", "2026-11-12", WEEK)).toBe(5); // Thu 5 → seven calendar days, Fri 6 and Sat 7 not counted
    expect(workingDaysBetween("2026-11-08", "2026-11-12", WEEK)).toBe(4); // Sun 8 → Mon, Tue, Wed, Thu
    expect(workingDaysBetween("2026-11-10", "2026-11-12", WEEK)).toBe(2);
    expect(workingDaysBetween("2026-11-12", "2026-11-12", WEEK)).toBe(0);
  });

  it("a villa last moved 4 working days ago is stalled, 2 ago is active; complete and not-started villas are left out; last and next activity are right", () => {
    const rows = classifyStalledUnits({ activitiesByModel: activities, today: TODAY, workDays: WEEK, threshold: 3, units: [
      unit("1", [["d1", "COMPLETE", "2026-11-05"], ["d2", "IN_PROGRESS", "2026-11-08"]]),             // 4 working days → stalled
      unit("2", [["d1", "IN_PROGRESS", "2026-11-10"]]),                                               // 2 → active
      unit("3", [["d1", "COMPLETE", "2026-11-01"], ["d2", "COMPLETE", "2026-11-01"], ["d3", "COMPLETE", "2026-11-01"]]), // complete → out
      unit("4", []),                                                                                  // not started → out
    ] });
    expect(rows.map(row => `${row.villa}:${row.workingDays}:${row.state}:${row.lastActivity?.code}>${row.nextActivity?.code}`)).toEqual(["1:4:stalled:WALL>WALL", "2:2:active:FOOT>FOOT"]);
  });

  it("raising the threshold to 5 turns the stalled villa active; a QC receipt is a movement; over 14 working days is long-stalled", () => {
    const one = unit("1", [["d1", "COMPLETE", "2026-11-05"], ["d2", "IN_PROGRESS", "2026-11-08"]]);
    expect(classifyStalledUnits({ activitiesByModel: activities, today: TODAY, workDays: WEEK, threshold: 5, units: [one] })[0].state).toBe("active");
    expect(classifyStalledUnits({ activitiesByModel: activities, today: TODAY, workDays: WEEK, threshold: 3, units: [unit("1", [["d1", "IN_PROGRESS", "2026-11-06"]], ["2026-11-11"])] })[0]).toMatchObject({ lastMovedOn: "2026-11-11", workingDays: 1, state: "active" });
    expect(classifyStalledUnits({ activitiesByModel: activities, today: TODAY, workDays: WEEK, threshold: 3, units: [unit("9", [["d1", "IN_PROGRESS", "2026-10-15"]])] })[0].state).toBe("long");
  });
});
