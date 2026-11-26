import { describe, expect, it } from "vitest";
import { calculatePlanningControl, formatPlanningPercent, nextTwoWeeks, planningControlLabel, planningHeadline } from "./planningControl";

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
    expect(formatPlanningPercent(result.progressCoverage)).toBe("100%");
  });

  it("localizes data-gap labels", () => {
    expect(planningControlLabel("unlinked_boq", true)).toBe("بنود BOQ غير مربوطة بـWBS");
    expect(planningControlLabel("unlinked_boq", false)).toBe("BOQ lines are not linked to WBS");
  });

  // Q-64 batch 2
  describe("the next two weeks and the planned-to-date sentence", () => {
    const at = new Date("2026-06-01T10:00:00Z");
    const a = (id: string, status: string, start: string | null, finish: string | null) => ({ id, code: id.toUpperCase(), name: `Activity ${id}`, status, plannedStartAt: start, plannedFinishAt: finish });
    it("lists what should start and what should finish within 14 days, today included; a late one, a started one, a completed one and a far one are not in it", () => {
      const result = nextTwoWeeks([
        a("s1", "not_started", "2026-06-01", "2026-07-30"), // starts today
        a("s2", "not_started", "2026-06-15", "2026-06-20"), // starts on the 14th day, finishes later than the window
        a("s3", "not_started", "2026-06-16", "2026-07-01"), // starts on day 15: out
        a("s4", "in_progress", "2026-05-20", "2026-06-10"), // started: not «to start»; finishes in the window
        a("s5", "in_progress", "2026-05-01", "2026-05-30"), // finish already passed: late, not «next»
        a("s6", "completed", "2026-05-20", "2026-06-05"), // completed: not «to finish»
        a("s7", "not_started", null, null), // undated
      ], at);
      expect(result.starting.map(item => item.id)).toEqual(["s1", "s2"]);
      expect(result.finishing.map(item => item.id)).toEqual(["s4"]); // s2 finishes on June 20th, after the window
      expect(result).toMatchObject({ startingCount: 2, finishingCount: 1 });
    });
    it("shows at most `limit` rows per list and says how many there are in all, in date order", () => {
      const many = Array.from({ length: 9 }, (_unused, index) => a(`m${index}`, "not_started", `2026-06-${String(10 - index).padStart(2, "0")}`, null));
      const result = nextTwoWeeks(many, at, 4);
      expect(result.starting).toHaveLength(4);
      expect(result.startingCount).toBe(9);
      expect(result.starting.map(item => item.date)).toEqual(["2026-06-02", "2026-06-03", "2026-06-04", "2026-06-05"]);
    });
    it("the headline adds where the plan says the project should be today against the site's actual; with no progress it says so, and without a plan it adds nothing", () => {
      const result = calculatePlanningControl({ ...base, asOf: new Date("2026-01-11") });
      expect(planningHeadline(result, "SAR", "ar", { planned: 42.5, actual: 38 })).toContain("المخطط حتى اليوم 42.5%، والفعلي 38%.");
      expect(planningHeadline(result, "SAR", "en", { planned: 42.5, actual: 38 })).toContain("Planned to date 42.5%, actual 38%.");
      expect(planningHeadline(result, "SAR", "en", { planned: 10, actual: null })).toContain("no progress recorded yet");
      expect(planningHeadline(result, "SAR", "en", null)).not.toContain("Planned to date");
    });
  });
});
