import { describe, expect, it } from "vitest";
import { calculateOperationalEvm } from "./operationalEvm";

describe("calculateOperationalEvm", () => {
  it("يجمع PV وEV وAC وBAC من مصادر تشغيلية محددة وقابلة للتتبع", () => {
    const result = calculateOperationalEvm({
      periodAt: new Date("2026-08-10T00:00:00.000Z"),
      activities: [
        { plannedValue: "100", plannedStartAt: new Date("2026-08-01T00:00:00.000Z"), plannedFinishAt: new Date("2026-08-11T00:00:00.000Z") },
        { plannedValue: "40", plannedStartAt: null, plannedFinishAt: null },
      ],
      budgets: [{ currentAmount: "200" }],
      costs: [
        { amount: "80", status: "posted", entryType: "actual", incurredAt: new Date("2026-08-09T00:00:00.000Z") },
        { amount: "10", status: "draft", entryType: "actual", incurredAt: new Date("2026-08-09T00:00:00.000Z") },
      ],
      wbs: [{ id: "wbs-1", plannedValue: "100" }, { id: "wbs-2", plannedValue: "100" }],
      progress: [
        { wbsItemId: "wbs-1", progressPercent: "25", status: "submitted", measuredAt: new Date("2026-08-08T00:00:00.000Z") },
        { wbsItemId: "wbs-1", progressPercent: "50", status: "submitted", measuredAt: new Date("2026-08-09T00:00:00.000Z") },
        { wbsItemId: "wbs-2", progressPercent: "100", status: "draft", measuredAt: new Date("2026-08-09T00:00:00.000Z") },
      ],
      eacMethod: "ac_plus_remaining",
    });

    expect(result).toMatchObject({ pv: 90, ev: 50, ac: 80, bac: 200, cv: -30, sv: -40, eac: 230, etc: 150, vac: -30 });
    expect(result.sources).toEqual({ scheduledActivities: 1, scheduledActivityValue: 100, budgetLines: 1, postedActualCostEntries: 1, latestSubmittedProgressEntries: 1, wbsItemsWithProgress: 1 });
  });

  it("لا ينسب قيمة إلى مصدر غير موجود ويعطي EVM صفريًا مع طريقة EAC صالحة", () => {
    const result = calculateOperationalEvm({ periodAt: new Date("2026-08-10T00:00:00.000Z"), activities: [], budgets: [], costs: [], wbs: [], progress: [], eacMethod: "ac_plus_remaining" });

    expect(result).toMatchObject({ pv: 0, ev: 0, ac: 0, bac: 0, eac: 0, etc: 0, vac: 0, cpi: null, spi: null });
    expect(result.sources).toEqual({ scheduledActivities: 0, scheduledActivityValue: 0, budgetLines: 0, postedActualCostEntries: 0, latestSubmittedProgressEntries: 0, wbsItemsWithProgress: 0 });
  });
});
