import { describe, expect, it } from "vitest";
import { DEFAULT_STATUS_FACTORS, type PmcUnitActivityStatus } from "./pmc";
import { summarizeProgress, type SummaryDefinition, type SummaryUnit } from "./progressSummary";

// Q-70 (3): the activity summary, checked against a hand calculation. Synthetic data only.
const units: SummaryUnit[] = [
  { id: "u700", villa: "700", blockCode: "BLK 33", phase: "PH1", modelCode: "C", unitWeight: 1 },
  { id: "u701", villa: "701", blockCode: "BLK 33", phase: "PH1", modelCode: "C", unitWeight: 1 },
  { id: "u702", villa: "702", blockCode: "BLK 34", phase: "PH2", modelCode: "C", unitWeight: 2 },
  { id: "u800", villa: "800", blockCode: "BLK 34", phase: "PH2", modelCode: "D", unitWeight: 1 },
];
const definitions: SummaryDefinition[] = [
  { id: "c1", modelCode: "C", code: "ACT01", name: "Excavation", weightPercent: 40 },
  { id: "c2", modelCode: "C", code: "ACT02", name: "Footings", weightPercent: 60 },
  { id: "d1", modelCode: "D", code: "ACT01", name: "Excavation", weightPercent: 100 },
];
const statusOf = new Map<string, PmcUnitActivityStatus>([["u700:c1", "COMPLETE"], ["u700:c2", "COMPLETE"], ["u701:c1", "COMPLETE"], ["u701:c2", "IN_PROGRESS"], ["u702:c1", "IN_PROGRESS"], ["u800:d1", "COMPLETE"]]);
const factors = { ...DEFAULT_STATUS_FACTORS, IN_PROGRESS: 0.5 };

describe("the activity summary (Q-70 3)", () => {
  it("POSITIVE: each activity counts the villas of every model that has it, with complete / in progress / not started and the shares; blocks and phases by the PMC rule", () => {
    const summary = summarizeProgress({ units, definitions, statusOf, factors });
    // ACT01 on 700, 701, 702 (C) and 800 (D): complete 700, 701, 800; in progress 702 (weight 2) → completion 3/4; earned (1+1+2×0.5+1)/(1+1+2+1) = 4/5
    expect(summary.activities[0]).toEqual({ code: "ACT01", name: "Excavation", villas: 4, complete: 3, underReview: 0, inProgress: 1, notStarted: 0, completionPercent: 75, earnedPercent: 80 });
    // ACT02 on 700, 701, 702: complete 700, in progress 701, not started 702 → 1/3; earned (1 + 0.5 + 0)/(1+1+2) = 37.5
    expect(summary.activities[1]).toEqual({ code: "ACT02", name: "Footings", villas: 3, complete: 1, underReview: 0, inProgress: 1, notStarted: 1, completionPercent: 33.33, earnedPercent: 37.5 });
    // villa progress: 700 = 100, 701 = 40 + 30 = 70, 702 = 20, 800 = 100. BLK 33 = (100 + 70)/2 = 85; BLK 34 = (20×2 + 100×1)/3 = 46.67
    expect(summary.blocks).toEqual([
      { key: "BLK 33", villas: 2, progressPercent: 85, villasWithoutNumber: 0, completeCells: 3, totalCells: 4 },
      { key: "BLK 34", villas: 2, progressPercent: 46.67, villasWithoutNumber: 0, completeCells: 1, totalCells: 3 },
    ]);
    expect(summary.phases.map(phase => [phase.key, phase.progressPercent])).toEqual([["PH1", 85], ["PH2", 46.67]]);
    // project = (100 + 70 + 20×2 + 100)/5 = 62
    expect(summary.project).toEqual({ villas: 4, progressPercent: 62, villasWithoutNumber: 0 });
  });

  it("NEGATIVE: a model whose weights do not total 100 gives no number for its villas — never a wrong one — and the others are still summed", () => {
    const summary = summarizeProgress({ units, definitions: definitions.map(item => (item.id === "d1" ? { ...item, weightPercent: 90 } : item)), statusOf, factors });
    expect(summary.blocks[1]).toMatchObject({ key: "BLK 34", progressPercent: 20, villasWithoutNumber: 1 });
    expect(summary.project).toEqual({ villas: 4, progressPercent: 52.5, villasWithoutNumber: 1 }); // (100 + 70 + 20×2)/(1 + 1 + 2)
    expect(summarizeProgress({ units: [], definitions, statusOf, factors }).project).toEqual({ villas: 0, progressPercent: null, villasWithoutNumber: 0 });
  });

  it("review of #576 (C, change 1): a block whose villas all weigh 0 gives no number — never a crash — and the project is summed over the weighted villas only; «under review» is its own count", () => {
    const zero: SummaryUnit[] = [...units, { id: "u900", villa: "900", blockCode: "BLK 99", phase: "PH3", modelCode: "C", unitWeight: 0 }];
    const status = new Map(statusOf); status.set("u900:c1", "COMPLETE"); status.set("u900:c2", "UNDER_REVIEW");
    const summary = summarizeProgress({ units: zero, definitions, statusOf: status, factors });
    expect(summary.blocks.find(block => block.key === "BLK 99")).toEqual({ key: "BLK 99", villas: 1, progressPercent: null, villasWithoutNumber: 0, completeCells: 1, totalCells: 2 });
    expect(summary.phases.find(phase => phase.key === "PH3")!.progressPercent).toBeNull();
    expect(summary.project.progressPercent).toBe(62); // as before: the villa of weight 0 moves nothing
    expect(summary.activities[1]).toMatchObject({ code: "ACT02", villas: 4, underReview: 1, inProgress: 1, notStarted: 1 });
    // only weight-0 villas chosen (a block filter): no number, no throw
    expect(summarizeProgress({ units: zero.filter(unit => unit.id === "u900"), definitions, statusOf: status, factors }).project).toEqual({ villas: 1, progressPercent: null, villasWithoutNumber: 0 });
  });
});
