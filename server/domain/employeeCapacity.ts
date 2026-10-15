import { countWorkingDays } from "./labourCost";
export type CapacityAssessment = { workingDays: number; availableHours: number; plannedHours: number; requestedHours: number; totalHours: number; exceedsCapacity: boolean; warningCode?: "PROJECT_OS_EMPLOYEE_CAPACITY_EXCEEDED" };

function utcDay(value: Date) { return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())); }

/** Working days on the default Sunday-Thursday week; a tenant with another calendar passes its own days to `countWorkingDays`. */
export function countSaudiWorkingDays(startAt: Date, finishAt: Date) {
  return countWorkingDays(startAt, finishAt);
}

export function assessEmployeeCapacity(input: { startAt: Date; finishAt: Date; existingPlannedHours: number; requestedHours: number; hoursPerWorkingDay?: number; workingWeekDays?: readonly number[] }): CapacityAssessment {
  const workingDays = countWorkingDays(input.startAt, input.finishAt, input.workingWeekDays);
  const availableHours = workingDays * (input.hoursPerWorkingDay ?? 8);
  const totalHours = input.existingPlannedHours + input.requestedHours;
  const exceedsCapacity = totalHours > availableHours;
  return { workingDays, availableHours, plannedHours: input.existingPlannedHours, requestedHours: input.requestedHours, totalHours, exceedsCapacity, ...(exceedsCapacity ? { warningCode: "PROJECT_OS_EMPLOYEE_CAPACITY_EXCEEDED" as const } : {}) };
}
