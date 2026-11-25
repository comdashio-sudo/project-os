import { describe, expect, it } from "vitest";
import { summarizePipeline, windowStart, type PipelineOpportunity } from "./strategyPipeline";

// Q-21 (a), batch 4: the pipeline summary, figures checked by hand.
const opp = (status: PipelineOpportunity["status"], estimatedValue: number, extra: Partial<PipelineOpportunity> = {}): PipelineOpportunity => ({
  status, estimatedValue, probabilityPercent: 50, decidedAt: status === "won" || status === "lost" || status === "withdrawn" ? "2026-10-01" : null, winnerCompetitorId: null, winningValue: null, ...extra,
});

describe("opportunities pipeline summary (Q-21 (a) batch 4)", () => {
  it("in play: open + submitted, and the weighted value = Σ value × probability (10M × 30% + 4M × 50% = 5M)", () => {
    const summary = summarizePipeline([opp("open", 10_000_000, { probabilityPercent: 30 }), opp("submitted", 4_000_000), opp("won", 2_000_000)], "2026-11-19");
    expect(summary.inPlay).toEqual({ count: 2, value: 14_000_000, weighted: 5_000_000 });
    expect(summary.counts).toEqual({ open: 1, submitted: 1, won: 1, lost: 0, withdrawn: 0 });
  });

  it("actual win rate: 2 won of 5 decided = 40% by count; by value 6M of 20M = 30%; withdrawn ones are not a contest", () => {
    const summary = summarizePipeline([
      opp("won", 2_000_000), opp("won", 4_000_000), opp("lost", 5_000_000), opp("lost", 5_000_000), opp("lost", 4_000_000), opp("withdrawn", 9_000_000),
    ], "2026-11-19");
    expect([summary.winRate.decided, summary.winRate.won, summary.winRate.byCount, summary.winRate.byValue]).toEqual([5, 2, 40, 30]);
  });

  it("the window is the last 12 months by decision date; an older decision, or one without a date, does not count; nothing decided → null", () => {
    expect(windowStart("2026-11-19", 12)).toBe("2025-11-19");
    const summary = summarizePipeline([opp("won", 1, { decidedAt: "2025-11-19" }), opp("lost", 1, { decidedAt: null }), opp("lost", 1, { decidedAt: "2026-11-20" })], "2026-11-19");
    expect([summary.winRate.decided, summary.winRate.byCount, summary.winRate.byValue]).toEqual([0, null, null]);
  });

  it("lost to: per competitor, how many and for how much (its winning value when known, else our estimate), most first", () => {
    const summary = summarizePipeline([
      opp("lost", 5_000_000, { winnerCompetitorId: "rival-a", winningValue: 4_800_000 }), opp("lost", 3_000_000, { winnerCompetitorId: "rival-a" }),
      opp("lost", 9_000_000, { winnerCompetitorId: "rival-b", winningValue: 8_500_000 }), opp("lost", 1_000_000),
    ], "2026-11-19");
    expect(summary.lostTo).toEqual([{ competitorId: "rival-a", count: 2, value: 7_800_000 }, { competitorId: "rival-b", count: 1, value: 8_500_000 }]);
  });
});
