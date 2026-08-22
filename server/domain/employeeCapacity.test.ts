import { describe, expect, it } from "vitest";
import { assessEmployeeCapacity, countSaudiWorkingDays } from "./employeeCapacity";

describe("employee capacity", () => {
  it("counts Sunday through Thursday as the default working week", () => {
    expect(countSaudiWorkingDays(new Date("2026-09-06T00:00:00Z"), new Date("2026-09-12T00:00:00Z"))).toBe(5);
  });

  it("returns a visible capacity warning without silently refusing the assignment", () => {
    expect(assessEmployeeCapacity({ startAt: new Date("2026-09-06T00:00:00Z"), finishAt: new Date("2026-09-10T00:00:00Z"), existingPlannedHours: 20, requestedHours: 25 })).toMatchObject({ availableHours: 40, totalHours: 45, exceedsCapacity: true, warningCode: "PROJECT_OS_EMPLOYEE_CAPACITY_EXCEEDED" });
  });
});
