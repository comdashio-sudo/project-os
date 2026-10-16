import { loadedHourlyCost } from "./profitability";

// G-015 / G-016 / G-124. The loaded hourly cost of an employee, from the salary structure and the
// tenant's own settings, and the tenant's working calendar. Pure: no database, no clock.

/** 0 = Sunday ... 6 = Saturday, as Date#getUTCDay. The default week is Sunday to Thursday. */
export const DEFAULT_WORKING_DAYS = [0, 1, 2, 3, 4] as const;

export type TenantLabourSettings = {
  /** Employer's social-insurance share for a Saudi national, as a fraction of basic + housing (0.1175 = 11.75%). Owner default; the tenant can change it. */
  employerGosiRateSaudi: number;
  /** The same for a non-Saudi (0.02 = 2%). */
  employerGosiRateNonSaudi: number;
  /** Indirect cost the tenant loads on top of pay (supervision, tools, insurance...), as a percent of basic + allowances. */
  indirectLoadingPercent: number;
  hoursPerDay: number;
  workingDays: readonly number[];
  /** End-of-service accrual: for the first `eosFirstPeriodYears` of service the employee earns `eosFirstPeriodMonthsPerYear` months of pay per year, afterwards `eosLaterMonthsPerYear`. */
  eosFirstPeriodYears: number;
  eosFirstPeriodMonthsPerYear: number;
  eosLaterMonthsPerYear: number;
};

/**
 * Owner decisions (work order 3): employer social insurance 11.75% for a Saudi and 2% for anyone else, on basic + housing; end of
 * service half a month per year for the first five years and a month per year after. Nothing defaults to zero. All of it is the
 * tenant's to change, and every screen that shows the result says it is a cost estimate, not a legal calculation.
 */
export const DEFAULT_LABOUR_SETTINGS: TenantLabourSettings = { employerGosiRateSaudi: 0.1175, employerGosiRateNonSaudi: 0.02, indirectLoadingPercent: 0, hoursPerDay: 8, workingDays: DEFAULT_WORKING_DAYS, eosFirstPeriodYears: 5, eosFirstPeriodMonthsPerYear: 0.5, eosLaterMonthsPerYear: 1 };

export function parseWorkingDays(value: string | null | undefined): number[] {
  const days = Array.from(new Set((value ?? "").split(",").map(part => part.trim()).filter(Boolean).map(Number)));
  if (!days.length || days.some(day => !Number.isInteger(day) || day < 0 || day > 6)) return [...DEFAULT_WORKING_DAYS];
  return days.sort((a, b) => a - b);
}

export function assertValidLabourSettings(settings: TenantLabourSettings) {
  const rate = (value: number) => Number.isFinite(value) && value >= 0 && value <= 0.5;
  const months = (value: number) => Number.isFinite(value) && value >= 0 && value <= 3;
  const ok = rate(settings.employerGosiRateSaudi) && rate(settings.employerGosiRateNonSaudi)
    && Number.isInteger(settings.eosFirstPeriodYears) && settings.eosFirstPeriodYears >= 0 && settings.eosFirstPeriodYears <= 50 && months(settings.eosFirstPeriodMonthsPerYear) && months(settings.eosLaterMonthsPerYear)
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

export type SalaryForLoading = { baseSalary: number; housingAllowance: number; transportAllowance: number; hardshipAllowance: number; eosMonthlyAccrual: number; /** 'computed' = from the length of service; 'manual' = the stored `eosMonthlyAccrual`. */ eosAccrualMode?: "computed" | "manual" };

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export type NationalityClass = "saudi" | "non_saudi" | "unknown";
const SAUDI_NAMES = new Set(["saudi", "saudi arabia", "saudi arabian", "saudi national", "ksa", "sa", "kingdom of saudi arabia", "سعودي", "سعودية", "سعودى", "السعودية", "سعودي الجنسية", "المملكة العربية السعودية"]);

/** The employee's nationality as free text, read as Saudi, not Saudi, or unknown (nothing recorded). Unknown is never guessed into one of the others. */
export function classifyNationality(value: string | null | undefined): NationalityClass {
  const text = (value ?? "").normalize("NFKC").replace(/[\u064B-\u065F\u0670]/g, "").trim().toLowerCase().replace(/\s+/g, " ");
  if (!text) return "unknown";
  return SAUDI_NAMES.has(text) ? "saudi" : "non_saudi";
}

/**
 * The employer's social-insurance share: basic + housing at the Saudi or non-Saudi rate. With the nationality unknown the higher rate
 * is used, so a missing field can only over-state a cost, never hide one; `nationalityClass: "unknown"` is returned so the screen says so.
 */
export function employerSocialInsurance(input: { baseSalary: number; housingAllowance: number; nationalityClass: NationalityClass; settings: Pick<TenantLabourSettings, "employerGosiRateSaudi" | "employerGosiRateNonSaudi"> }) {
  const rate = input.nationalityClass === "saudi" ? input.settings.employerGosiRateSaudi : input.nationalityClass === "non_saudi" ? input.settings.employerGosiRateNonSaudi : Math.max(input.settings.employerGosiRateSaudi, input.settings.employerGosiRateNonSaudi);
  const base = input.baseSalary + input.housingAllowance;
  return { amount: round2(base * rate), rate, base, nationalityClass: input.nationalityClass };
}

/** Whole years of service completed at `at` (0 before the hire date). */
export function completedServiceYears(hireDate: Date, at: Date) {
  if (at < hireDate) return 0;
  let years = at.getUTCFullYear() - hireDate.getUTCFullYear();
  if (at.getUTCMonth() < hireDate.getUTCMonth() || (at.getUTCMonth() === hireDate.getUTCMonth() && at.getUTCDate() < hireDate.getUTCDate())) years -= 1;
  return Math.max(0, years);
}

/**
 * The month's end-of-service accrual: the wage (basic + every fixed allowance) times the months-per-year that applies to the year of
 * service the employee is in, over twelve. Half a month a year for the first five years, a month a year after, unless the tenant set otherwise.
 * It is a cost estimate on the owner's stated rule, not a legal calculation: the real entitlement depends on how and when employment ends.
 */
export function eosMonthlyAccrual(input: { wage: number; hireDate: Date; at: Date; settings: Pick<TenantLabourSettings, "eosFirstPeriodYears" | "eosFirstPeriodMonthsPerYear" | "eosLaterMonthsPerYear"> }) {
  const completedYears = completedServiceYears(input.hireDate, input.at);
  const started = input.at >= input.hireDate;
  const monthsPerYear = completedYears < input.settings.eosFirstPeriodYears ? input.settings.eosFirstPeriodMonthsPerYear : input.settings.eosLaterMonthsPerYear;
  return { amount: started ? round2((input.wage * monthsPerYear) / 12) : 0, monthsPerYear, completedYears, period: completedYears < input.settings.eosFirstPeriodYears ? "first" as const : "later" as const };
}

/**
 * The loaded cost of one hour worked in the month of `workDate`:
 * (basic + allowances + employer social insurance + end-of-service accrual + tenant indirects) / the month's working hours.
 * `loadingFactor` (loaded over basic + allowances) is what the screens show.
 */
export function loadedRateForMonth(input: { salary: SalaryForLoading; settings: TenantLabourSettings; workDate: Date; employee: { hireDate: Date; nationality: string | null } }) {
  assertValidLabourSettings(input.settings);
  const allowances = input.salary.housingAllowance + input.salary.transportAllowance + input.salary.hardshipAllowance;
  const direct = input.salary.baseSalary + allowances;
  const hours = monthlyWorkingHours(input.workDate, input.settings);
  const insurance = employerSocialInsurance({ baseSalary: input.salary.baseSalary, housingAllowance: input.salary.housingAllowance, nationalityClass: classifyNationality(input.employee.nationality), settings: input.settings });
  const eos = input.salary.eosAccrualMode === "manual"
    ? { amount: input.salary.eosMonthlyAccrual, monthsPerYear: null, completedYears: completedServiceYears(input.employee.hireDate, input.workDate), period: "manual" as const }
    : eosMonthlyAccrual({ wage: direct, hireDate: input.employee.hireDate, at: input.workDate, settings: input.settings });
  const indirects = round2((direct * input.settings.indirectLoadingPercent) / 100);
  const result = loadedHourlyCost({
    basicSalary: input.salary.baseSalary,
    allowances,
    employerSocialInsurance: insurance.amount,
    accruedEndOfService: eos.amount,
    tenantIndirects: indirects,
    workedHours: hours,
  });
  return { ...result, monthlyHours: hours, directHourlyCost: hours === 0 ? null : round2(direct / hours), parts: { employerSocialInsurance: insurance.amount, employerSocialInsuranceRate: insurance.rate, nationalityClass: insurance.nationalityClass, eosAccrual: eos.amount, eosPeriod: eos.period, completedServiceYears: eos.completedYears, indirects } };
}
