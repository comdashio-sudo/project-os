import { describe, expect, it } from "vitest";
import { calculatePlanningControl, formatPlanningPercent, planningControlLabel } from "./planningControl";

const base = {
  activities: [
    { id: "a1", code: "A-01", name: "Concrete", status: "in_progress", plannedStartAt: "2026-01-01", plannedFinishAt: "2026-01-10" },
    { id: "a2", code: "A-02", name: "Unknown", status: "not_started", plannedStartAt: null, plannedFinishAt: null },
    { id: "a3", code: "A-03", name: "Blocked", status: "blocked", plannedStartAt: "2026-01-01", plannedFinishAt: "2026-01-04" },
  ],
  boq: [{ id: "b1", code: "BOQ-01", description: "Concrete", quantity: 10, unitRate: 20, totalAmount: 200, status: "active", wbsItemId: "w1" }, { id: "b2", code: "BOQ-02", description: "Steel", quantity: 5, unitRate: 30, totalAmount: 150, status: "active", wbsItemId: null }],
  requisitions: [{ id: "r1", requisitionNumber: "MR-01", requestedQuantity: 10, issuedQuantity: 4, remainingQuantity: 6, status: "approved", wbsItemId: "w1", activityId: "a1" }],
  budgets: [{ currentAmount: 1000 }],
  costs: [{ amount: 300, status: "posted", wbsItemId: "w1" }, { amount: 50, status: "posted", wbsItemId: null }],
  commitments: [{ amount: 200, status: "approved" }],
  warehouseBalances: [{ quantityOnHand: 12 }],
};

describe("planning control calculations", () => {
  it("connects budget, actuals, commitments, quantities, schedule and data gaps without inventing progress", () => {
    const result = calculatePlanningControl({ ...base, asOf: new Date("2026-01-11") });
    expect(result).toMatchObject({ budget: 1000, postedActual: 350, openCommitments: 200, exposure: 550, variance: 450, boqValue: 350, activeBoqLines: 2, requestedQuantity: 10, issuedQuantity: 4, remainingQuantity: 6, onHandQuantity: 12, overdueActivities: 2, blockedActivities: 1, undatedActivities: 1, unlinkedBoqLines: 1, unlinkedCosts: 1, unfulfilledRequisitions: 1, riskLevel: "attention" });
    expect(result.dataGaps).toEqual(expect.arrayContaining(["undated_activities", "unlinked_boq", "unlinked_actual_cost"]));
  });

  it("does not divide by zero and marks a clean controlled plan only when sources are complete", () => {
    const result = calculatePlanningControl({ activities: [{ id: "a", code: "A", name: "Done", status: "completed", plannedStartAt: "2026-01-01", plannedFinishAt: "2026-01-02" }], boq: [{ id: "b", code: "B", description: "Item", quantity: 1, unitRate: 5, totalAmount: 5, status: "active", wbsItemId: "w" }], requisitions: [], budgets: [{ currentAmount: 5 }], costs: [{ amount: 5, status: "posted", wbsItemId: "w" }], commitments: [], warehouseBalances: [], asOf: new Date("2026-01-01") });
    expect(result.costUtilization).toBe(1);
    expect(result.riskLevel).toBe("controlled");
    expect(result.dataGaps).toEqual([]);
    expect(formatPlanningPercent(result.progressCoverage)).toBe("100.0%");
  });

  it("localizes data-gap labels", () => {
    expect(planningControlLabel("unlinked_boq", true)).toBe("بنود BOQ غير مربوطة بـWBS");
    expect(planningControlLabel("unlinked_boq", false)).toBe("BOQ lines are not linked to WBS");
  });
});
