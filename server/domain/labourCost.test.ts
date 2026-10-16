import { describe, expect, it } from "vitest";
import { assertValidLabourSettings, classifyNationality, completedServiceYears, countWorkingDays, DEFAULT_LABOUR_SETTINGS, employerSocialInsurance, eosMonthlyAccrual, loadedRateForMonth, monthlyWorkingHours, parseWorkingDays } from "./labourCost";

// Hand calculation (docs/LABOUR_COST_HAND_CHECKS.md). October 2026 starts on a Thursday and has 31 days.
// Sunday-Thursday weeks: Oct 1 (Thu), then Oct 4-8, 11-15, 18-22, 25-29 = 1 + 20 = 21 working days -> 168 hours at 8 h.
const october = new Date("2026-10-15T00:00:00.000Z");
const salary = { baseSalary: 8000, housingAllowance: 1500, transportAllowance: 500, hardshipAllowance: 0, eosMonthlyAccrual: 0 };
const saudi = { hireDate: new Date("2024-03-01T00:00:00Z"), nationality: "Saudi" }; // 2 completed years at October 2026: the first period
const indian = { hireDate: new Date("2024-03-01T00:00:00Z"), nationality: "Indian" };

describe("tenant working calendar", () => {
  it("counts October 2026 on the default Sunday-Thursday week and on a Monday-Friday week", () => {
    expect(countWorkingDays(new Date("2026-10-01T00:00:00Z"), new Date("2026-10-31T00:00:00Z"))).toBe(21);
    expect(monthlyWorkingHours(october, DEFAULT_LABOUR_SETTINGS)).toBe(168);
    // Mon-Fri: Oct 1,2 (Thu, Fri) + 5 days x 3 full weeks (5-9, 12-16, 19-23) + Oct 26-30 = 2 + 15 + 5 = 22
    expect(countWorkingDays(new Date("2026-10-01T00:00:00Z"), new Date("2026-10-31T00:00:00Z"), [1, 2, 3, 4, 5])).toBe(22);
    // a single day, inclusive of both ends
    expect(countWorkingDays(new Date("2026-10-01T09:00:00Z"), new Date("2026-10-01T17:00:00Z"))).toBe(1);
  });

  it("reads a stored list of days and falls back to the default week for anything malformed", () => {
    expect(parseWorkingDays("1,2,3,4,5")).toEqual([1, 2, 3, 4, 5]);
    expect(parseWorkingDays("5, 1,1")).toEqual([1, 5]);
    expect(parseWorkingDays("")).toEqual([0, 1, 2, 3, 4]);
    expect(parseWorkingDays("1,9")).toEqual([0, 1, 2, 3, 4]);
  });
});

describe("employer insurance and nationality", () => {
  it("reads free-text nationality as Saudi, not Saudi, or unknown without guessing", () => {
    for (const value of ["Saudi", "  SAUDI Arabia ", "KSA", "سعودي", "سعودية", "المملكة العربية السعودية"]) expect(classifyNationality(value), value).toBe("saudi");
    for (const value of ["Egyptian", "Indian", "مصري", "Saudi-born Egyptian"]) expect(classifyNationality(value), value).toBe("non_saudi");
    for (const value of [null, undefined, "", "   "]) expect(classifyNationality(value as string | null)).toBe("unknown");
  });

  it("charges 11.75% to a Saudi and 2% to anyone else, on basic + housing only (transport and hardship are outside the base)", () => {
    // (8000 + 1500) = 9500 -> 1116.25 and 190
    expect(employerSocialInsurance({ baseSalary: 8000, housingAllowance: 1500, nationalityClass: "saudi", settings: DEFAULT_LABOUR_SETTINGS })).toMatchObject({ amount: 1116.25, rate: 0.1175, base: 9500 });
    expect(employerSocialInsurance({ baseSalary: 8000, housingAllowance: 1500, nationalityClass: "non_saudi", settings: DEFAULT_LABOUR_SETTINGS })).toMatchObject({ amount: 190, rate: 0.02 });
  });

  it("with no nationality recorded it uses the higher rate and says the nationality is unknown, so a blank field can only over-state a cost", () => {
    expect(employerSocialInsurance({ baseSalary: 8000, housingAllowance: 1500, nationalityClass: "unknown", settings: DEFAULT_LABOUR_SETTINGS })).toMatchObject({ amount: 1116.25, nationalityClass: "unknown" });
  });
});

describe("end-of-service accrual by length of service", () => {
  const rule = DEFAULT_LABOUR_SETTINGS;
  it("counts whole years of service and never goes below zero before the hire date", () => {
    const hired = new Date("2021-10-16T00:00:00Z");
    expect(completedServiceYears(hired, new Date("2026-10-15T00:00:00Z"))).toBe(4); // the day before the fifth anniversary
    expect(completedServiceYears(hired, new Date("2026-10-16T00:00:00Z"))).toBe(5);
    expect(completedServiceYears(hired, new Date("2020-01-01T00:00:00Z"))).toBe(0);
  });

  it("accrues half a month a year for the first five years and a month a year after: wage 10,000 gives 416.67 then 833.33 a month", () => {
    const hired = new Date("2021-10-16T00:00:00Z");
    expect(eosMonthlyAccrual({ wage: 10000, hireDate: hired, at: new Date("2026-10-15T00:00:00Z"), settings: rule })).toMatchObject({ amount: 416.67, monthsPerYear: 0.5, period: "first" });
    expect(eosMonthlyAccrual({ wage: 10000, hireDate: hired, at: new Date("2026-10-16T00:00:00Z"), settings: rule })).toMatchObject({ amount: 833.33, monthsPerYear: 1, period: "later" });
  });

  it("accrues nothing for a month before the person was hired, and follows a tenant's own rule", () => {
    expect(eosMonthlyAccrual({ wage: 10000, hireDate: new Date("2027-01-01T00:00:00Z"), at: new Date("2026-10-15T00:00:00Z"), settings: rule }).amount).toBe(0);
    const custom = { eosFirstPeriodYears: 3, eosFirstPeriodMonthsPerYear: 0.75, eosLaterMonthsPerYear: 1.5 };
    expect(eosMonthlyAccrual({ wage: 12000, hireDate: new Date("2023-01-01T00:00:00Z"), at: new Date("2026-02-01T00:00:00Z"), settings: custom })).toMatchObject({ amount: 1500, period: "later" }); // 3 completed years: 12000 x 1.5 / 12
  });
});

describe("loaded hourly labour cost", () => {
  it("a Saudi in his second year: pay + 11.75% insurance on basic + housing + half-month end-of-service, over the month's hours", () => {
    // direct 10000; insurance 9500 x 11.75% = 1116.25; EOS 10000 x 0.5 / 12 = 416.67; total 11532.92; / 168 h = 68.65; factor 1.1533
    const result = loadedRateForMonth({ salary, employee: saudi, settings: DEFAULT_LABOUR_SETTINGS, workDate: october });
    expect(result).toMatchObject({ totalLoadedCost: 11532.92, hourlyCost: 68.65, loadingFactor: 1.1533, monthlyHours: 168, directHourlyCost: 59.52 });
    expect(result.parts).toMatchObject({ employerSocialInsurance: 1116.25, eosAccrual: 416.67, nationalityClass: "saudi", eosPeriod: "first", completedServiceYears: 2 });
  });

  it("the same pay for a non-Saudi costs less in insurance (2%)", () => {
    // insurance 190; total 10000 + 190 + 416.67 = 10606.67; / 168 = 63.13
    expect(loadedRateForMonth({ salary, employee: indian, settings: DEFAULT_LABOUR_SETTINGS, workDate: october })).toMatchObject({ totalLoadedCost: 10606.67, hourlyCost: 63.13 });
  });

  it("a typed-in end-of-service amount (manual mode) replaces the computed one", () => {
    // 10000 + 1116.25 + 700 = 11816.25; / 168 = 70.33
    expect(loadedRateForMonth({ salary: { ...salary, eosMonthlyAccrual: 700, eosAccrualMode: "manual" }, employee: saudi, settings: DEFAULT_LABOUR_SETTINGS, workDate: october })).toMatchObject({ totalLoadedCost: 11816.25, hourlyCost: 70.33 });
  });

  it("adds the tenant's indirect loading on basic + allowances", () => {
    // 11532.92 + 10% x 10000 = 12532.92; / 168 = 74.6
    const settings = { ...DEFAULT_LABOUR_SETTINGS, indirectLoadingPercent: 10 };
    expect(loadedRateForMonth({ salary, employee: saudi, settings, workDate: october })).toMatchObject({ totalLoadedCost: 12532.92, hourlyCost: 74.6 });
  });

  it("follows the tenant's calendar: the same pay over Monday-Friday hours (22 days = 176 h) costs less per hour", () => {
    const settings = { ...DEFAULT_LABOUR_SETTINGS, workingDays: [1, 2, 3, 4, 5] };
    expect(loadedRateForMonth({ salary, employee: saudi, settings, workDate: october })).toMatchObject({ monthlyHours: 176, hourlyCost: 65.53 }); // 11532.92 / 176
    const longDay = { ...DEFAULT_LABOUR_SETTINGS, hoursPerDay: 10 };
    expect(loadedRateForMonth({ salary, employee: saudi, settings: longDay, workDate: october })).toMatchObject({ monthlyHours: 210, hourlyCost: 54.92 }); // 11532.92 / 210
  });

  it("refuses settings that would make the number meaningless", () => {
    const bad = [{ employerGosiRateSaudi: -0.1 }, { employerGosiRateSaudi: 0.9 }, { employerGosiRateNonSaudi: 0.9 }, { indirectLoadingPercent: 400 }, { hoursPerDay: 0 }, { hoursPerDay: 30 }, { workingDays: [] as number[] }, { workingDays: [7] }, { workingDays: [1, 1] }, { eosFirstPeriodYears: 2.5 }, { eosFirstPeriodMonthsPerYear: 5 }, { eosLaterMonthsPerYear: -1 }];
    for (const patch of bad) expect(() => assertValidLabourSettings({ ...DEFAULT_LABOUR_SETTINGS, ...patch }), JSON.stringify(patch)).toThrow("PROJECT_OS_LABOUR_SETTINGS_INVALID");
    expect(() => assertValidLabourSettings(DEFAULT_LABOUR_SETTINGS)).not.toThrow();
  });

  it("nothing defaults to zero: the owner's defaults are in force until a tenant changes them", () => {
    expect(DEFAULT_LABOUR_SETTINGS).toMatchObject({ employerGosiRateSaudi: 0.1175, employerGosiRateNonSaudi: 0.02, eosFirstPeriodYears: 5, eosFirstPeriodMonthsPerYear: 0.5, eosLaterMonthsPerYear: 1 });
  });
});
