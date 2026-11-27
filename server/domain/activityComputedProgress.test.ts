import { describe, expect, it } from "vitest";
import { computeActivityProgress } from "./activityComputedProgress";

// Q-71 (1) batch 2: a P6 activity's progress from the villa's PMC cells of the weight groups its stage carries, worked by hand. Synthetic data only.
const factors = { NOT_STARTED: 0, IN_PROGRESS: 0.5, UNDER_REVIEW: 0.8, COMPLETE: 1 };
const units = [{ id: "u1", unitNumber: 1, modelCode: "C" }, { id: "u2", unitNumber: 2, modelCode: "D" }];
const links = [{ groupId: "g1", stageCodes: ["Q02"] }, { groupId: "g2", stageCodes: ["Q02", "Q06"] }];
const definitions = [
  { id: "d1", groupId: "g1", modelCode: "C", weightPercent: 30 }, // walls
  { id: "d2", groupId: "g2", modelCode: "C", weightPercent: 10 }, // slab
  { id: "d3", groupId: "g1", modelCode: "D", weightPercent: 0 },
  { id: "d9", groupId: "g9", modelCode: "C", weightPercent: 60 }, // a group no stage carries: never counted
];
const statusOf = new Map([["u1:d1", "COMPLETE" as const], ["u1:d2", "IN_PROGRESS" as const], ["u1:d9", "COMPLETE" as const]]);

describe("Q-71 (1) batch 2: a schedule activity's computed progress", () => {
  it("POSITIVE: Q02 on villa 1 carries g1 and g2 — (30 × 1 + 10 × 0.5) / 40 = 87.5%; Q06 carries g2 only — 50%", () => {
    const [q02, q06] = computeActivityProgress({ activities: [{ id: "a1", villa: 1, stage: "Q02" }, { id: "a2", villa: 1, stage: "Q06" }], links, definitions, units, statusOf, factors });
    expect(q02).toMatchObject({ percent: 87.5, reason: null, groupIds: ["g1", "g2"], cells: 2 });
    expect(q06).toMatchObject({ percent: 50, reason: null, groupIds: ["g2"], cells: 1 });
  });

  it("NEGATIVE: what cannot be computed says why by name — never a 0", () => {
    const rows = computeActivityProgress({
      activities: [{ id: "n1", villa: null, stage: "Q02" }, { id: "n2", villa: 1, stage: null }, { id: "n3", villa: 1, stage: "Q99" }, { id: "n4", villa: 7, stage: "Q02" }, { id: "n5", villa: 2, stage: "Q02" }],
      links, definitions, units, statusOf, factors,
    });
    expect(rows.map(row => [row.reason, row.percent])).toEqual([["NO_VILLA", null], ["NO_STAGE", null], ["STAGE_NOT_LINKED", null], ["VILLA_NOT_IN_PROJECT", null], ["NO_WEIGHT", null]]);
  });

  it("a villa with no cell yet reads 0% only when its stage is linked and weighted (a real 0, not a missing source)", () => {
    const [row] = computeActivityProgress({ activities: [{ id: "a3", villa: 1, stage: "Q06" }], links, definitions, units, statusOf: new Map(), factors });
    expect(row).toMatchObject({ percent: 0, reason: null });
  });
});
