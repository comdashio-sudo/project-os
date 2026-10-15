import { loadedHourlyCost } from "./profitability";

// G-015 / G-016 / G-124. The loaded hourly cost of an employee, from the salary structure and the
// tenant's own settings, and the tenant's working calendar. Pure: no database, no clock.

/** 0 = Sunday ... 6 = Saturday, as Date#getUTCDay. The default week is Sunday to Thursday. */
export const DEFAULT_WORKING_DAYS = [0, 1, 2, 3, 4] as const;

export type TenantLabourSettings = {
  /** Employer's social-insurance contribution, as a fraction of basic + allowances (0.1175 = 11.75%). */
  employerGosiRate: number;
  /** Indirect cost the tenant loads on top of pay (supervision, tools, insurance...), as a percent of basic + allowances. */
  indirectLoadingPercent: number;
  hoursPerDay: number;
  workingDays: readonly number[];
};

export const DEFAULT_LABOUR_SETTINGS: TenantLabourSettings = { employerGosiRate: 0, indirectLoadingPercent: 0, hoursPerDay: 8, workingDays: DEFAULT_WORKING_DAYS };

export function parseWorkingDays(value: string | null | undefined): number[] {
  const days = Array.from(new Set((value ?? "").split(",").map(part => part.trim()).filter(Boolean).map(Number)));
  if (!days.length || days.some(day => !Number.isInteger(day) || day < 0 || day > 6)) return [...DEFAULT_WORKING_DAYS];
  return days.sort((a, b) => a - b);
}

export function assertValidLabourSettings(settings: TenantLabourSettings) {
  const ok = Number.isFinite(settings.employerGosiRate) && settings.employerGosiRate >= 0 && settings.employerGosiRate <= 0.5
    && Number.isFinite(settings.indirectLoadingPercent) && settings.indirectLoadingPercent >= 0 && settings.indirectLoadingPercent <= 300
    && Number.isFinite(settings.hoursPerDay) && settings.hoursPerDay > 0 && settings.hoursPerDay <= 24
    && settings.workingDays.length >= 1 && settings.workingDays.every(day => Number.isInteger(day) && day >= 0 && day <= 6) && new Set(settings.workingDays).size === settings.workingDays.length;
  if (!ok) throw new RangeError("PROJECT_OS_LABOUR_SETTINGS_INVALID");
}

const DAY_MS = 86_400_000;
const utcDay = (value: Date) => new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));

/** Working days from start to finish, both included, on the tenant's calendar. */
export function countWorkingDays(startAt: Date, finishAt: Date, workingDays: readonly number[] = DEFAULT_WORKING_DAYS) {
  const days = new Set(workingDays);
  let count = 0;
  for (let cursor = utcDay(startAt), end = utcDay(finishAt); cursor <= end; cursor = new Date(cursor.getTime() + DAY_MS)) if (days.has(cursor.getUTCDay())) count += 1;
  return count;
}

/** The hours the month offers on the tenant's calendar: what a monthly cost is spread over. */
export function monthlyWorkingHours(month: Date, settings: Pick<TenantLabourSettings, "workingDays" | "hoursPerDay">) {
  const start = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const end = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0));
  return countWorkingDays(start, end, settings.workingDays) * settings.hoursPerDay;
}

export type SalaryForLoading = { baseSalary: number; housingAllowance: number; transportAllowance: number; hardshipAllowance: number; eosMonthlyAccrual: number };

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * The loaded cost of one hour worked in the month of `workDate`:
 * (basic + allowances + employer social insurance + end-of-service accrual + tenant indirects) / the month's working hours.
 * `loadingFactor` (loaded over basic + allowances) is what the screens show.
 */
export function loadedRateForMonth(input: { salary: SalaryForLoading; settings: TenantLabourSettings; workDate: Date }) {
  assertValidLabourSettings(input.settings);
  const allowances = input.salary.housingAllowance + input.salary.transportAllowance + input.salary.hardshipAllowance;
  const direct = input.salary.baseSalary + allowances;
  const hours = monthlyWorkingHours(input.workDate, input.settings);
  const result = loadedHourlyCost({
    basicSalary: input.salary.baseSalary,
    allowances,
    employerSocialInsurance: round2(direct * input.settings.employerGosiRate),
    accruedEndOfService: input.salary.eosMonthlyAccrual,
    tenantIndirects: round2((direct * input.settings.indirectLoadingPercent) / 100),
    workedHours: hours,
  });
  return { ...result, monthlyHours: hours, directHourlyCost: hours === 0 ? null : round2(direct / hours) };
}
