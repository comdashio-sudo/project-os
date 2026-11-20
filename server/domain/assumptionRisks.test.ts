import { describe, expect, it } from "vitest";
import { assumptionRisks, type RiskAssumption } from "./assumptionRisks";

// Q-21 (a), batch 5: the assumption-risk board, criterion (و) of the item and the ranking by financial weight. Hand-checked figures.
const item = (key: string, base: number, extra: Partial<RiskAssumption> = {}): RiskAssumption => ({
  id: `id-${key}`, key, name: key, status: "approved", values: { conservative: base, base, optimistic: base },
  confidence: "medium", nextReviewAt: "2027-01-01", sourceType: "internal", sourceUrl: null, ...extra,
});
// 12 tenders a year × 1,000,000 × 25% = 250,000 a month, executed in one month, no lag, 20% margin, no overheads
const register = () => [
  item("tendersPerYear", 12), item("averageTenderValue", 1_000_000), item("winRate", 25), item("executionMonths", 1), item("grossMarginPercent", 20),
];

describe("assumption risks (Q-21 (a) batch 5)", () => {
  it("(و) an assumption past its review date is flagged; one due later is not", () => {
    const { rows, counts } = assumptionRisks([...register(), item("overheadsMonthly", 0, { nextReviewAt: "2026-11-01" })], "2026-11-19", 12);
    expect(rows.find(row => row.key === "overheadsMonthly")!.flags.reviewOverdue).toBe(true);
    expect(rows.find(row => row.key === "winRate")!.flags.reviewOverdue).toBe(false);
    expect(counts.reviewOverdue).toBe(1);
  });

  it("low confidence and a management estimate with no link are flagged; a linked estimate is not weak", () => {
    const { rows, counts } = assumptionRisks([
      ...register(), item("marketGrowth", 6, { confidence: "low", sourceType: "management" }), item("villaDemand", 3, { sourceType: "management", sourceUrl: "https://stats.example.test/x" }),
    ], "2026-11-19", 12);
    expect(rows.find(row => row.key === "marketGrowth")!.flags).toEqual({ lowConfidence: true, reviewOverdue: false, weakSource: true });
    expect(rows.find(row => row.key === "villaDemand")!.flags.weakSource).toBe(false);
    expect([counts.lowConfidence, counts.weakSource]).toEqual([1, 1]);
  });

  it("impact: +10% on the win rate adds exactly 10% of the revenue (12 months × 250,000 × 10% = 300,000), and the ranking puts the heavy ones first", () => {
    const { rows } = assumptionRisks(register(), "2026-11-19", 12);
    expect(rows.find(row => row.key === "winRate")!.impact!.revenue).toBe(300000);
    expect(rows.find(row => row.key === "averageTenderValue")!.impact!.revenue).toBe(300000);
    // the margin does not move revenue; with no overheads the cash never dips below zero here, so the lowest balance does not move either
    expect(rows.find(row => row.key === "grossMarginPercent")!.impact).toEqual({ revenue: 0, lowestCash: 0 });
    expect(rows[0].impact!.revenue).toBe(300000);
  });

  it("NEGATIVE: a draft, a pending one, a key the model does not read, and any assumption while the model is incomplete carry no impact; a retired one is not on the board", () => {
    const { rows } = assumptionRisks([
      ...register(), item("collectionDays", 30, { status: "draft" }), item("marketGrowth", 6), item("vatPercent", 15, { status: "retired" }),
    ], "2026-11-19", 12);
    expect(rows.find(row => row.key === "collectionDays")!.impact).toBeNull();
    expect(rows.find(row => row.key === "marketGrowth")!.impact).toBeNull();
    expect(rows.some(row => row.key === "vatPercent")).toBe(false);
    const incomplete = assumptionRisks([item("winRate", 25)], "2026-11-19", 12).rows;
    expect(incomplete[0].impact).toBeNull();
  });
});
