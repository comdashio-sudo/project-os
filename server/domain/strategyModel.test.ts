import { describe, expect, it } from "vitest";
import { DEFAULT_VAT_PERCENT, runStrategyModel, sCurveShares, type ModelAssumption, type ModelInput } from "./strategyModel";

// Q-21 (c): the acceptance criteria (b)–(e) of the item, on figures computed by hand in the test.
const same = (value: number) => ({ conservative: value, base: value, optimistic: value });
const approved = (key: string, values: { conservative: number; base: number; optimistic: number }): ModelAssumption => ({ key, status: "approved", values });
// 12 tenders a year (1 a month), 1,000,000 each, 25% won, earned in the month of award, 20% margin, no overheads, terms off: 250,000 won and earned a month.
const base = (overrides: ModelAssumption[] = []): ModelInput => {
  const list = [approved("tendersPerYear", same(12)), approved("averageTenderValue", same(1_000_000)), approved("winRate", same(25)), approved("executionMonths", same(1)), approved("grossMarginPercent", same(20)), approved("awardLagMonths", same(0))];
  const keys = new Set(overrides.map(item => item.key));
  return { horizonMonths: 12, backlog: [], assumptions: [...list.filter(item => !keys.has(item.key)), ...overrides] };
};

describe("sCurveShares", () => {
  it("sums to 1, starts and ends slowly, and is symmetric", () => {
    const shares = sCurveShares(10);
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12);
    expect(shares[0]).toBeLessThan(shares[4]);
    shares.forEach((share, k) => expect(share).toBeCloseTo(shares[shares.length - 1 - k], 12));
    expect(sCurveShares(1)).toEqual([1]);
  });
});

describe("strategy model (Q-21 c)", () => {
  it("(c) revenue = tenders × average value × win rate, by hand: 250,000 a month, 3,000,000 a year; win rate 25% → 30% adds exactly 600,000", () => {
    const at25 = runStrategyModel(base()).scenarios.base;
    expect(at25.months[0].revenue).toBe(250_000);
    expect(at25.totals.revenue).toBe(3_000_000);
    expect(at25.totals.net).toBe(600_000); // 20% margin, terms off, no overheads
    const at30 = runStrategyModel(base([approved("winRate", same(30))])).scenarios.base;
    expect(at30.totals.revenue - at25.totals.revenue).toBe(600_000);
    // the calculation trace names the assumptions the revenue used, with the values used
    expect(at30.trace.find(step => step.figure === "revenue")!.uses).toContain("winRate");
    expect(at30.used.winRate).toBe(30);
  });

  it("(b) a draft, pending or retired assumption never moves a number, even beside an approved one of the same key", () => {
    const plainInput = base();
    const withDraft = { ...plainInput, assumptions: [...plainInput.assumptions, { key: "overheadsMonthly", status: "draft" as const, values: same(99_999) }, { key: "tendersPerYear", status: "pending" as const, values: same(1_000) }, { key: "winRate", status: "retired" as const, values: same(90) }] };
    expect(runStrategyModel(withDraft).scenarios.base.totals).toEqual(runStrategyModel(base()).scenarios.base.totals);
    // and a required key with only a draft value is reported missing, not filled in
    const draftOnlyWin = base([{ key: "winRate", status: "draft", values: same(40) }]);
    const result = runStrategyModel(draftOnlyWin).scenarios.base;
    expect(result.missing).toContain("winRate");
    expect(result.totals.revenue).toBe(0);
  });

  it("(d) revenue: conservative ≤ base ≤ optimistic", () => {
    const { scenarios } = runStrategyModel(base([approved("winRate", { conservative: 20, base: 25, optimistic: 30 })]));
    expect(scenarios.conservative.totals.revenue).toBeLessThanOrEqual(scenarios.base.totals.revenue);
    expect(scenarios.base.totals.revenue).toBeLessThanOrEqual(scenarios.optimistic.totals.revenue);
    expect([scenarios.conservative.totals.revenue, scenarios.optimistic.totals.revenue]).toEqual([2_400_000, 3_600_000]);
  });

  it("(e) advance, retention and 30 days' collection move the cash, not the revenue", () => {
    const plain = runStrategyModel(base()).scenarios.base;
    const terms = runStrategyModel(base([approved("advancePercent", same(10)), approved("retentionPercent", same(5)), approved("retentionReleaseMonths", same(2)), approved("collectionDays", same(30))])).scenarios.base;
    expect(terms.totals.revenue).toBe(plain.totals.revenue);
    expect(terms.months.map(month => month.revenue)).toEqual(plain.months.map(month => month.revenue));
    // month 1 by hand: plain collects the bill in the month (250,000); with terms only the advance arrives (10% × 250,000), the bill a month later
    expect(plain.months[0].receipts).toBe(250_000);
    expect(terms.months[0].receipts).toBe(25_000);
    // month 2: the advance of the second contract (25,000) + the first bill net of advance and retention (250,000 × 85% = 212,500)
    expect(terms.months[1].receipts).toBe(237_500);
    expect(terms.lowestCumulative).toBeLessThan(plain.lowestCumulative);
  });

  it("VAT is reported, defaults to 15%, and does not change the net cash", () => {
    const result = runStrategyModel(base()).scenarios.base;
    expect(result.used.vatPercent).toBe(DEFAULT_VAT_PERCENT);
    expect(result.months[0].vatCollected).toBe(37_500); // 250,000 × 15%
    const at5 = runStrategyModel(base([approved("vatPercent", same(5))])).scenarios.base;
    expect(at5.totals.net).toBe(result.totals.net);
  });

  it("overheads make a funding need and a break-even month; backlog adds revenue on its own shares", () => {
    // by hand: 25,000 of overheads and nothing earned for three months → −75,000 at month 2; then 250,000 × 20% − 25,000 = +25,000 a month → back to 0 at month 5
    const heavy = runStrategyModel(base([approved("overheadsMonthly", same(25_000)), approved("awardLagMonths", same(3))])).scenarios.base;
    expect([heavy.fundingRequired, heavy.lowestMonth, heavy.breakEvenMonth]).toEqual([75_000, 2, 5]);
    const withBacklog = runStrategyModel({ ...base(), backlog: [{ code: "C-1", remainingValue: 1_200_000, monthlyShares: [1, 1, 1, 1] }] }).scenarios.base;
    expect(withBacklog.totals.backlogRevenue).toBe(1_200_000);
    expect(withBacklog.months[0].backlogRevenue).toBe(300_000);
  });

  it("sensitivity: +5 points of win rate adds 600,000 of revenue at 1,000,000 × 12 tenders", () => {
    expect(runStrategyModel(base()).sensitivity.revenueChange.base).toBe(600_000);
  });
});
