export type CapacityAssessment = { workingDays: number; availableHours: number; plannedHours: number; requestedHours: number; totalHours: number; exceedsCapacity: boolean; warningCode?: "PROJECT_OS_EMPLOYEE_CAPACITY_EXCEEDED" };

function utcDay(value: Date) { return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())); }

export function countSaudiWorkingDays(startAt: Date, finishAt: Date) {
  let count = 0;
  for (let cursor = utcDay(startAt), end = utcDay(finishAt); cursor <= end; cursor = new Date(cursor.getTime() + 86_400_000)) {
    const day = cursor.getUTCDay();
    if (day >= 0 && day <= 4) count += 1;
  }
  return count;
}

export function assessEmployeeCapacity(input: { startAt: Date; finishAt: Date; existingPlannedHours: number; requestedHours: number; hoursPerWorkingDay?: number }): CapacityAssessment {
  const workingDays = countSaudiWorkingDays(input.startAt, input.finishAt);
  const availableHours = workingDays * (input.hoursPerWorkingDay ?? 8);
  const totalHours = input.existingPlannedHours + input.requestedHours;
  const exceedsCapacity = totalHours > availableHours;
  return { workingDays, availableHours, plannedHours: input.existingPlannedHours, requestedHours: input.requestedHours, totalHours, exceedsCapacity, ...(exceedsCapacity ? { warningCode: "PROJECT_OS_EMPLOYEE_CAPACITY_EXCEEDED" as const } : {}) };
}
