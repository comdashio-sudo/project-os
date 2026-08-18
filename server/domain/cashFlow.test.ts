import { describe, expect, it } from "vitest";
import { calculateOperationalCashFlow } from "./cashFlow";

describe("operational cash flow", () => {
  it("يجمع الميزانية والتكلفة الفعلية والالتزامات ويستبعد السجلات الملغاة", () => {
    expect(calculateOperationalCashFlow({ budgetAmounts: [1000, 500], costEntries: [{ amount: 200, status: "posted" }, { amount: 75, status: "draft" }, { amount: 50, status: "void" }], commitments: [{ amount: 300, status: "draft" }, { amount: 90, status: "cancelled" }] })).toEqual({ plannedBudget: 1500, actualCost: 275, committedAmount: 300, totalExposure: 575, remainingBudget: 925 });
  });
});
