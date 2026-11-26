import { describe, expect, it } from "vitest";
import { elapsedShare, monthEnds, plannedCurves, type CurveActivity } from "./plannedCurve";

// Q-61 (4): planned curves worked by hand. Synthetic villas and dates only.
const d = (iso: string) => new Date(`${iso}T00:00:00Z`);
// Q02 runs 40 days (Jan 1 → Feb 10); Q06 Feb 1 → Feb 28
const act = (villa: number, stage: string, start: string, finish: string): CurveActivity => ({ villa, stage, start: d(start), finish: d(finish) });
const groups = [
  { id: "g1", code: "W1", weightByModel: { C: 40, D: 100 } },
  { id: "g2", code: "W2", weightByModel: { C: 30 } }, // factory production: earned at the start of Q06
  { id: "g3", code: "W3", weightByModel: { C: 30 } },
];
const links = [
  { groupId: "g1", stageCodes: ["Q02"], anchor: "span" as const },
  { groupId: "g2", stageCodes: ["Q06"], anchor: "start" as const },
  { groupId: "g3", stageCodes: ["Q06"], anchor: "end" as const },
];
const villas = [
  { unitNumber: 1, modelCode: "C", blockCode: "B1", unitWeight: 1 },
  { unitNumber: 2, modelCode: "D", blockCode: "B1", unitWeight: 3 },
  { unitNumber: 3, modelCode: "C", blockCode: "B2", unitWeight: 1 }, // Q06 missing in the schedule for this villa
  { unitNumber: 4, modelCode: "C", blockCode: "B2", unitWeight: 1 }, // no activity at all
];
const activities = [act(1, "Q02", "2026-01-01", "2026-02-10"), act(1, "Q06", "2026-02-01", "2026-02-28"), act(2, "Q02", "2026-01-01", "2026-02-10"), act(3, "Q02", "2026-01-01", "2026-02-10"), act(99, "Q02", "2025-06-01", "2025-07-01")];

describe("Q-61 (4): the planned curve per villa and for the project", () => {
  it("month ends cover the schedule; a span is linear over duration; start/end are all or nothing", () => {
    expect(monthEnds(d("2026-01-15"), d("2026-03-02")).map(m => m.month)).toEqual(["2026-01", "2026-02", "2026-03"]);
    const q02 = [act(1, "Q02", "2026-01-01", "2026-02-10")];
    expect(elapsedShare(q02, "span", d("2026-01-21"))).toBe(0.5);
    expect(elapsedShare(q02, "span", d("2025-12-31"))).toBe(0);
    expect(elapsedShare(q02, "span", d("2026-03-01"))).toBe(1);
    expect(elapsedShare(q02, "start", d("2026-01-01"))).toBe(1);
    expect(elapsedShare(q02, "end", d("2026-02-09"))).toBe(0);
    // two activities: 10 + 30 days, 15 days in → (10 + 5) / 40
    expect(elapsedShare([act(1, "Q", "2026-01-01", "2026-01-11"), act(1, "Q", "2026-01-11", "2026-02-10")], "span", d("2026-01-16"))).toBe(0.375);
    // a milestone alone counts at its finish
    expect(elapsedShare([act(1, "Q", "2026-01-05", "2026-01-05")], "span", d("2026-01-04"))).toBe(0);
    expect(elapsedShare([act(1, "Q", "2026-01-05", "2026-01-05")], "span", d("2026-01-05"))).toBe(1);
  });

  it("POSITIVE: each villa's curve equals the hand calculation; a villa reaches its model's whole weight (100) at the end", () => {
    const result = plannedCurves({ villas, activities, groups, links, at: d("2026-01-21") });
    expect(result.months).toEqual(["2026-01", "2026-02"]); // villa 99 is not the project's: it does not stretch the axis
    const v = Object.fromEntries(result.villas.map(row => [row.unitNumber, row]));
    // Jan end: 31 of 40 days of Q02 × 40 = 31; Q06 not started → 0. Feb end: 40 + 30 (start) + 30 (end) = 100
    expect(v[1].curve).toEqual([{ month: "2026-01", planned: 31 }, { month: "2026-02", planned: 100 }]);
    expect(v[2].curve).toEqual([{ month: "2026-01", planned: 77.5 }, { month: "2026-02", planned: 100 }]);
    expect(v[1].plannedNow).toBe(20); // 20 of 40 days × 40
  });

  it("the project, block and model curves are the villas' averaged by unit weight; a villa with no activity is left out, not counted as 0", () => {
    const result = plannedCurves({ villas, activities, groups, links, at: d("2026-01-21") });
    // Jan: (31×1 + 77.5×3 + 31×1) / 5 = 58.9; Feb: (100 + 300 + 40) / 5 = 88
    expect(result.project).toEqual([{ month: "2026-01", planned: 58.9 }, { month: "2026-02", planned: 88 }]);
    expect(result.blocks.find(row => row.key === "B2")!.curve).toEqual([{ month: "2026-01", planned: 31 }, { month: "2026-02", planned: 40 }]);
    expect(result.models.find(row => row.key === "D")!.curve[0].planned).toBe(77.5);
    expect(result.villas.find(row => row.unitNumber === 4)!.scheduled).toBe(false);
    // today: (20 + 50×3 + 20) / 5 = 38
    expect(result.projectNow).toBe(38);
  });

  it("NEGATIVE: a group whose stages have no activity in a villa is named for that villa (never a silent 0); no schedule gives no curve", () => {
    const result = plannedCurves({ villas, activities, groups, links, at: d("2026-01-21") });
    expect(result.gaps).toEqual([{ unitNumber: 3, groupCodes: ["W2", "W3"] }]);
    expect(plannedCurves({ villas, activities: [], groups, links, at: d("2026-01-21") })).toMatchObject({ months: [], project: [], projectNow: 0 });
  });
});
