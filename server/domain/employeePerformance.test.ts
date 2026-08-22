import { describe, expect, it } from "vitest";
import { calculateEmployeePerformance } from "./employeePerformance";

describe("calculateEmployeePerformance", () => {
  it("derives transparent metrics and removes only records with a documented exclusion", () => {
    const now = new Date("2026-09-10T12:00:00.000Z");
    const result = calculateEmployeePerformance({
      now,
      excludedKeys: new Set(["rfi:rfi-excluded"]),
      records: [
        { sourceType: "activity", sourceId: "activity-on-time", label: "Activity", status: "completed", createdAt: new Date("2026-09-01T08:00:00.000Z"), dueAt: new Date("2026-09-05T17:00:00.000Z"), completedAt: new Date("2026-09-04T12:00:00.000Z") },
        { sourceType: "action", sourceId: "action-overdue", label: "Action", status: "open", createdAt: new Date("2026-09-01T08:00:00.000Z"), dueAt: new Date("2026-09-06T17:00:00.000Z"), completedAt: null },
        { sourceType: "rfi", sourceId: "rfi-excluded", label: "RFI", status: "submitted", createdAt: new Date("2026-09-01T08:00:00.000Z"), dueAt: new Date("2026-09-02T17:00:00.000Z"), completedAt: null },
      ],
    });

    expect(result).toMatchObject({ assignedCount: 2, completedCount: 1, overdueCount: 1, onTimeCompletionPercent: 100, openCount: 1, excludedCount: 1, recordsConsidered: 2, sourceCounts: { activity: 1, action: 1, rfi: 0 } });
    expect(result.averageResponseHours).toBe(76);
    expect(result.formula).toContain("non-excluded source records");
  });
});
