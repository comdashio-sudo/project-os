import { describe, expect, it } from "vitest";
import { delta, periodChange, statusesAsOf } from "./progressPeriod";

const at = (iso: string) => new Date(iso);
describe("Q-72 (2): the progress of a period is the end minus the start", () => {
  const history = [
    { cellId: "c1", status: "IN_PROGRESS" as const, at: at("2026-11-02T08:00:00Z") },
    { cellId: "c1", status: "COMPLETE" as const, at: at("2026-11-10T08:00:00Z") },
    { cellId: "c2", status: "IN_PROGRESS" as const, at: at("2026-11-12T08:00:00Z") },
  ];
  it("a cell's status at a moment is its last history row up to then; no row yet means absent (not started)", () => {
    expect(statusesAsOf(history, at("2026-11-01T00:00:00Z")).size).toBe(0);
    expect(statusesAsOf(history, at("2026-11-05T00:00:00Z")).get("c1")).toBe("IN_PROGRESS");
    expect(statusesAsOf(history, at("2026-11-11T00:00:00Z")).get("c1")).toBe("COMPLETE");
    expect(statusesAsOf(history, at("2026-11-11T00:00:00Z")).has("c2")).toBe(false);
    expect(statusesAsOf([...history].reverse(), at("2026-11-13T00:00:00Z")).get("c1")).toBe("COMPLETE"); // the order of the rows does not matter
  });
  it("a number that is unknown on either side gives no difference, never a guess", () => {
    expect(delta(10.5, 14.25)).toBe(3.75);
    expect(delta(null, 14)).toBeNull();
    expect(delta(10, null)).toBeNull();
  });
  it("the change of the project, its blocks and activities from two summaries", () => {
    const summary = (project: number, block: number, earned: number) => ({ project: { progressPercent: project }, blocks: [{ key: "B1", villas: 1, progressPercent: block, villasWithoutNumber: 0, completeCells: 0, totalCells: 1 }], phases: [],
      activities: [{ code: "A", name: "A", villas: 1, complete: 0, underReview: 0, inProgress: 0, notStarted: 1, completionPercent: 0, earnedPercent: earned }] });
    const change = periodChange(summary(10, 20, 5), summary(16, 31.5, 8.25));
    expect(change.project).toEqual({ startPercent: 10, endPercent: 16, deltaPercent: 6 });
    expect(change.blocks).toEqual([{ key: "B1", startPercent: 20, endPercent: 31.5, deltaPercent: 11.5 }]);
    expect(change.activities).toEqual([{ code: "A", startEarnedPercent: 5, endEarnedPercent: 8.25, deltaEarnedPercent: 3.25 }]);
  });
});
