import { describe, expect, it } from "vitest";
import { calculateOperationalCashFlow, monthlyNetCashFlow } from "./cashFlow";

describe("operational cash flow", () => {
  it("يجمع الميزانية والتكلفة الفعلية والالتزامات ويستبعد السجلات الملغاة", () => {
    expect(calculateOperationalCashFlow({ budgetAmounts: [1000, 500], costEntries: [{ amount: 200, status: "posted" }, { amount: 75, status: "draft" }, { amount: 50, status: "void" }], commitments: [{ amount: 300, status: "draft" }, { amount: 90, status: "cancelled" }] })).toEqual({ plannedBudget: 1500, actualCost: 275, committedAmount: 300, totalExposure: 575, remainingBudget: 925 });
  });

  it("does not count received goods twice: only the unsettled part of a commitment is exposure", () => {
    // A 1,000 order of which 400 was received (and is already in the actual cost) is 600 of open commitment, not 1,000.
    const result = calculateOperationalCashFlow({ budgetAmounts: [2000], costEntries: [{ amount: 400, status: "posted" }], commitments: [{ amount: 1000, status: "approved", settledAmount: 400 }, { amount: 300, status: "approved" }, { amount: 500, status: "cancelled" }, { amount: 100, status: "approved", settledAmount: 150 }] });
    expect(result).toEqual({ plannedBudget: 2000, actualCost: 400, committedAmount: 900, totalExposure: 1300, remainingBudget: 700 }); // 600 + 300 + 0 (over-settled is never negative)
  });
});

// Hand calculation: docs/CASH_FLOW_HAND_CHECKS.md
describe("net cash flow by month", () => {
  const at = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
  it("puts each movement in its month, fills the quiet months, and accumulates", () => {
    const result = monthlyNetCashFlow({
      receipts: [{ amount: 500, at: at("2026-08-20") }, { amount: 250, at: at("2026-10-02") }, { amount: 100, at: at("2026-10-30") }],
      outflows: [{ amount: 300, at: at("2026-08-05") }, { amount: 120, at: at("2026-08-31") }, { amount: 200, at: at("2026-09-15") }, { amount: 90, at: at("2026-10-31") }],
    });
    expect(result.months).toEqual([
      { month: "2026-08", receipts: 500, outflows: 420, net: 80, cumulative: 80 },
      { month: "2026-09", receipts: 0, outflows: 200, net: -200, cumulative: -120 },
      { month: "2026-10", receipts: 350, outflows: 90, net: 260, cumulative: 140 },
    ]);
    expect(result.totals).toEqual({ receipts: 850, outflows: 710, net: 140 });
    expect(result.lowestCumulative).toEqual({ month: "2026-09", cumulative: -120 });
  });

  it("crosses a year end, and is empty when nothing moved", () => {
    const result = monthlyNetCashFlow({ receipts: [{ amount: 10, at: at("2026-12-31") }], outflows: [{ amount: 4, at: at("2027-02-01") }] });
    expect(result.months.map(row => [row.month, row.net, row.cumulative])).toEqual([["2026-12", 10, 10], ["2027-01", 0, 10], ["2027-02", -4, 6]]);
    expect(monthlyNetCashFlow({ receipts: [], outflows: [] })).toEqual({ months: [], totals: { receipts: 0, outflows: 0, net: 0 }, lowestCumulative: null });
    expect(() => monthlyNetCashFlow({ receipts: [{ amount: Number.NaN, at: at("2026-01-01") }], outflows: [] })).toThrow(RangeError);
  });
});
