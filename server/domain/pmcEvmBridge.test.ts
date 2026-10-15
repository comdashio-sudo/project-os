import { describe, expect, it } from "vitest";
import { planEvmBridge, wbsProgressFromPmc } from "./pmcEvmBridge";

// Hand calculation (also in docs/PMC_PHASE_D_HAND_CHECKS.md): four equal units of model A,
// WALLS (weight 60) linked to WBS-W (planned value 1000) and PAINT (weight 40) linked to WBS-P (500).
// WALLS is complete in 3 of 4 units -> 75%. PAINT is complete in 2 of 4 -> 50%.
// EV = 1000 x 0.75 + 500 x 0.50 = 750 + 250 = 1000.
const units = [1, 2, 3, 4].map(n => ({ id: `u${n}`, modelCode: "A", weight: 1 }));
const definitions = [
  { id: "d1", modelCode: "A", weightPercent: 60, wbsItemId: "W" },
  { id: "d2", modelCode: "A", weightPercent: 40, wbsItemId: "P" },
];
const cells = [
  { unitId: "u1", definitionId: "d1", status: "COMPLETE" as const },
  { unitId: "u2", definitionId: "d1", status: "COMPLETE" as const },
  { unitId: "u3", definitionId: "d1", status: "COMPLETE" as const },
  { unitId: "u4", definitionId: "d1", status: "IN_PROGRESS" as const },
  { unitId: "u1", definitionId: "d2", status: "COMPLETE" as const },
  { unitId: "u4", definitionId: "d2", status: "COMPLETE" as const },
];
const factors = { NOT_STARTED: 0, IN_PROGRESS: 0, UNDER_REVIEW: 0, COMPLETE: 1 };
const wbs = [{ id: "W", code: "WBS-W", plannedValue: 1000 }, { id: "P", code: "WBS-P", plannedValue: 500 }, { id: "X", code: "WBS-X", plannedValue: 300 }];

describe("PMC -> EVM bridge, against the hand calculation", () => {
  it("derives each linked WBS item's progress from the cells, weighted by activity and unit", () => {
    const progress = wbsProgressFromPmc({ units, definitions, cells, factors });
    expect(Array.from(progress.entries())).toEqual([["W", 75], ["P", 50]]);
  });

  it("uses the tenant's status factors (UNDER_REVIEW counted 0.9) and the units' own weights", () => {
    const withReview = wbsProgressFromPmc({ units, definitions, cells: [...cells.slice(0, 3), { unitId: "u4", definitionId: "d1", status: "UNDER_REVIEW" }], factors: { ...factors, UNDER_REVIEW: 0.9 } });
    expect(withReview.get("W")).toBe(97.5); // (3 + 0.9) / 4
    const heavy = wbsProgressFromPmc({ units: [{ id: "u1", modelCode: "A", weight: 3 }, { id: "u2", modelCode: "A", weight: 1 }], definitions: [definitions[0]], cells: [{ unitId: "u1", definitionId: "d1", status: "COMPLETE" }], factors });
    expect(heavy.get("W")).toBe(75); // the heavy unit is 3 of 4
  });

  it("leaves a unit out of the denominator when its model does not have the linked activity", () => {
    const mixed = wbsProgressFromPmc({ units: [...units, { id: "u5", modelCode: "B", weight: 1 }], definitions, cells, factors });
    expect(mixed.get("W")).toBe(75); // u5 (model B) has no WALLS: it neither earns nor dilutes
  });

  it("plans a new entry only where progress moved, and gives EV before and after", () => {
    const computed = wbsProgressFromPmc({ units, definitions, cells, factors });
    // WBS-W was at 50, WBS-P had no entry, WBS-X is not linked.
    const plan = planEvmBridge({ wbs, latest: new Map([["W", 50]]), computed });
    expect(plan.changed).toEqual([
      { wbsItemId: "W", code: "WBS-W", plannedValue: 1000, before: 50, after: 75 },
      { wbsItemId: "P", code: "WBS-P", plannedValue: 500, before: null, after: 50 },
    ]);
    expect(plan.evBefore).toBe(500); // 1000 x 0.5
    expect(plan.evAfter).toBe(1000); // 750 + 250
  });

  it("writes nothing when nothing moved, or when there is no entry yet and progress is still 0", () => {
    const same = planEvmBridge({ wbs, latest: new Map([["W", 75], ["P", 50]]), computed: new Map([["W", 75], ["P", 50]]) });
    expect(same.changed).toEqual([]);
    expect(same.evBefore).toBe(1000);
    expect(same.evAfter).toBe(1000);
    const zero = planEvmBridge({ wbs, latest: new Map(), computed: new Map([["W", 0]]) });
    expect(zero.changed).toEqual([]);
    expect(zero.evAfter).toBe(0);
    // Going back to 0 after having reported progress IS a change (a status was revised downward).
    const back = planEvmBridge({ wbs, latest: new Map([["W", 25]]), computed: new Map([["W", 0]]) });
    expect(back.changed).toEqual([{ wbsItemId: "W", code: "WBS-W", plannedValue: 1000, before: 25, after: 0 }]);
    expect([back.evBefore, back.evAfter]).toEqual([250, 0]);
  });
});
