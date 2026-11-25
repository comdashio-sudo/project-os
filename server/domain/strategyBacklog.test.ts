import { describe, expect, it } from "vitest";
import { monthsInclusive, strategyBacklog } from "./strategyBacklog";
import { runStrategyModel } from "./strategyModel";

// Q-21 (c): the backlog the model reads. Values computed by hand below. Synthetic codes only.
describe("Q-21 (c): the company's backlog", () => {
  it("POSITIVE: remaining = contract + approved changes − issued/paid invoices, on a straight line to the planned finish, both months included", () => {
    const backlog = strategyBacklog([
      // 12,000,000 + 1,000,000 approved (the rejected 500,000 does not count) − 3,000,000 invoiced = 10,000,000 over Nov 2026 … Aug 2027 = 10 months
      { code: "SYN-1", contractValue: 12_000_000, changeOrders: [{ status: "approved", contractValueImpact: 1_000_000 }, { status: "rejected", contractValueImpact: 500_000 }], invoiced: 3_000_000, plannedFinishAt: "2027-08-15" },
    ], "2026-11");
    expect(backlog.contracts).toEqual([{ code: "SYN-1", remainingValue: 10_000_000, monthlyShares: new Array(10).fill(1) }]);
    expect(backlog.scheduled).toEqual({ count: 1, remainingValue: 10_000_000 });
    expect(monthsInclusive("2026-11", "2026-11-30")).toBe(1);
    expect(monthsInclusive("2026-11", "2027-11-01")).toBe(13);

    // the model earns exactly that: 1,000,000 a month for ten months, nothing after
    const model = runStrategyModel({ horizonMonths: 12, assumptions: [], backlog: backlog.contracts }).scenarios.base;
    expect(model.totals.backlogRevenue).toBe(10_000_000);
    expect(model.months[0].backlogRevenue).toBe(1_000_000);
    expect(model.months[9].backlogRevenue).toBe(1_000_000);
    expect(model.months[10].backlogRevenue).toBe(0);
  });

  it("NEGATIVE: nothing left is no contract; an overrun finish falls in this month; no planned finish is not guessed — counted as unscheduled with its value", () => {
    const backlog = strategyBacklog([
      { code: "SYN-DONE", contractValue: 5_000_000, changeOrders: [], invoiced: 5_200_000, plannedFinishAt: "2027-01-01" },
      { code: "SYN-LATE", contractValue: 2_000_000, changeOrders: [], invoiced: 500_000, plannedFinishAt: "2026-03-31" },
      { code: "SYN-OPEN", contractValue: 4_000_000, changeOrders: [{ status: "submitted", contractValueImpact: 9_000_000 }], invoiced: 0, plannedFinishAt: null },
    ], "2026-11");
    expect(backlog.contracts).toEqual([{ code: "SYN-LATE", remainingValue: 1_500_000, monthlyShares: [1] }]);
    expect(backlog.scheduled).toEqual({ count: 1, remainingValue: 1_500_000 });
    expect(backlog.unscheduled).toEqual({ count: 1, remainingValue: 4_000_000 });
  });
});
