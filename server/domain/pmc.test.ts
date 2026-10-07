import { describe, expect, it } from "vitest";
import {
  assertActivityClassification,
  calculateActivityCompletion,
  calculateEarnedValue,
  calculateProjectProgress,
  calculateUnitProgress,
  normalizeUnitRange,
  validateActivityWeights,
} from "./pmc";

describe("PMC Phase A calculation rules", () => {
  it("Rule 1: calculates weighted unit progress with configurable status factors", () => {
    expect(calculateUnitProgress({
      activities: [
        { weightPercent: 40, status: "COMPLETE" },
        { weightPercent: 35, status: "UNDER_REVIEW" },
        { weightPercent: 25, status: "IN_PROGRESS" },
      ],
      statusFactors: { UNDER_REVIEW: 0.9 },
    })).toBe(71.5);
  });

  it("Rule 2: calculates weighted project progress and defaults to equal unit weights", () => {
    expect(calculateProjectProgress([
      { progressPercent: 50, unitWeight: 2 },
      { progressPercent: 100, unitWeight: 1 },
    ])).toBe(66.6667);
    expect(calculateProjectProgress([{ progressPercent: 20 }, { progressPercent: 80 }])).toBe(50);
  });

  it("Rule 3: rejects impossible completion and never permits a result over 100%", () => {
    expect(calculateActivityCompletion(8, 10)).toBe(80);
    expect(() => calculateActivityCompletion(11, 10)).toThrow(/cannot exceed/);
    expect(calculateActivityCompletion(0, 0)).toBe(0);
  });

  it("Rule 4: accepts only activity weight sets totaling exactly 100%", () => {
    expect(validateActivityWeights([
      { activityCode: "A", weightPercent: 40 },
      { activityCode: "B", weightPercent: 60 },
    ])).toBe(100);
    expect(() => validateActivityWeights([{ activityCode: "A", weightPercent: 99.99 }])).toThrow(/100%/);
    expect(() => validateActivityWeights([
      { activityCode: "A", weightPercent: 50 },
      { activityCode: "A", weightPercent: 50 },
    ])).toThrow(/Duplicate/);
  });

  it("Rule 5: rejects blank classification at the domain boundary", () => {
    expect(() => assertActivityClassification({ groupCode: "G", stageCode: "S", activityCode: "A" })).not.toThrow();
    expect(() => assertActivityClassification({ groupCode: "G", stageCode: "", activityCode: "A" })).toThrow(/classification/);
  });

  it("Rule 6: normalizes report ranges to the first and last unit number", () => {
    expect(normalizeUnitRange([147, 8, 21])).toEqual({ from: 8, to: 147 });
    expect(() => normalizeUnitRange([4.5])).toThrow(/integers/);
  });

  it("Rule 7: derives earned value from WBS budget and normalized progress", () => {
    expect(calculateEarnedValue(25, 200_000)).toBe(50_000);
    expect(() => calculateEarnedValue(101, 200_000)).toThrow(/100/);
  });
});
