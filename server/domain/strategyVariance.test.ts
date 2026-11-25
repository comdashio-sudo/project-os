import { describe, expect, it } from "vitest";
import { difference, winRateInPeriod } from "./strategyVariance";

// Q-21 (a), batch 6: hand-computed values. Synthetic data only.
describe("winRateInPeriod", () => {
  it("POSITIVE: won ÷ (won + lost) inside the period; withdrawn, open and out-of-period ones do not count", () => {
    const items = [
      { status: "won" as const, decidedAt: "2026-07-10" }, { status: "lost" as const, decidedAt: "2026-08-01" }, { status: "lost" as const, decidedAt: "2026-09-30" },
      { status: "won" as const, decidedAt: "2026-10-01" }, // after the period
      { status: "withdrawn" as const, decidedAt: "2026-08-15" }, { status: "open" as const, decidedAt: null },
    ];
    expect(winRateInPeriod(items, "2026-07-01", "2026-09-30")).toEqual({ actual: 33.3333, sampleSize: 3 });
  });
  it("NEGATIVE: nothing decided in the period is «no actual» (null), not a win rate of 0", () => {
    expect(winRateInPeriod([{ status: "withdrawn", decidedAt: "2026-08-15" }, { status: "won", decidedAt: "2025-01-01" }], "2026-07-01", "2026-09-30")).toBeNull();
  });
});

describe("difference", () => {
  it("actual − assumed, and as a share of the assumed value; none when the assumed value is 0", () => {
    expect(difference(25, 20)).toEqual({ difference: -5, percentOfAssumed: -20 });
    expect(difference(-10, -5)).toEqual({ difference: 5, percentOfAssumed: 50 });
    expect(difference(0, 3)).toEqual({ difference: 3, percentOfAssumed: null });
  });
});
