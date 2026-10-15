import { describe, expect, it } from "vitest";
import { assertValidLabourSettings, countWorkingDays, DEFAULT_LABOUR_SETTINGS, loadedRateForMonth, monthlyWorkingHours, parseWorkingDays } from "./labourCost";

// Hand calculation (docs/LABOUR_COST_HAND_CHECKS.md). October 2026 starts on a Thursday and has 31 days.
// Sunday-Thursday weeks: Oct 1 (Thu), then Oct 4-8, 11-15, 18-22, 25-29 = 1 + 20 = 21 working days -> 168 hours at 8 h.
const october = new Date("2026-10-15T00:00:00.000Z");
const salary = { baseSalary: 8000, housingAllowance: 1500, transportAllowance: 500, hardshipAllowance: 0, eosMonthlyAccrual: 700 };

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

describe("loaded hourly labour cost", () => {
  it("with no loading it is pay plus the end-of-service accrual over the month's hours", () => {
    // direct = 8000 + 2000 = 10000; + EOS 700 = 10700; / 168 h = 63.69
    const result = loadedRateForMonth({ salary, settings: DEFAULT_LABOUR_SETTINGS, workDate: october });
    expect(result).toMatchObject({ totalLoadedCost: 10700, hourlyCost: 63.69, loadingFactor: 1.07, monthlyHours: 168, directHourlyCost: 59.52 });
  });

  it("adds the employer's insurance and the tenant's indirect loading, both on basic + allowances", () => {
    // employer 11.75% of 10000 = 1175; indirects 10% of 10000 = 1000; total = 10000 + 1175 + 700 + 1000 = 12875; / 168 = 76.64; factor 1.2875
    const settings = { ...DEFAULT_LABOUR_SETTINGS, employerGosiRate: 0.1175, indirectLoadingPercent: 10 };
    expect(loadedRateForMonth({ salary, settings, workDate: october })).toMatchObject({ totalLoadedCost: 12875, hourlyCost: 76.64, loadingFactor: 1.2875 });
  });

  it("follows the tenant's calendar: the same pay over Monday-Friday hours (22 days = 176 h) costs less per hour", () => {
    const settings = { ...DEFAULT_LABOUR_SETTINGS, workingDays: [1, 2, 3, 4, 5] };
    expect(loadedRateForMonth({ salary, settings, workDate: october })).toMatchObject({ monthlyHours: 176, hourlyCost: 60.8 }); // 10700 / 176
    const longDay = { ...DEFAULT_LABOUR_SETTINGS, hoursPerDay: 10 };
    expect(loadedRateForMonth({ salary, settings: longDay, workDate: october })).toMatchObject({ monthlyHours: 210, hourlyCost: 50.95 }); // 10700 / 210
  });

  it("refuses settings that would make the number meaningless", () => {
    const bad = [{ employerGosiRate: -0.1 }, { employerGosiRate: 0.9 }, { indirectLoadingPercent: 400 }, { hoursPerDay: 0 }, { hoursPerDay: 30 }, { workingDays: [] as number[] }, { workingDays: [7] }, { workingDays: [1, 1] }];
    for (const patch of bad) expect(() => assertValidLabourSettings({ ...DEFAULT_LABOUR_SETTINGS, ...patch }), JSON.stringify(patch)).toThrow("PROJECT_OS_LABOUR_SETTINGS_INVALID");
    expect(() => assertValidLabourSettings(DEFAULT_LABOUR_SETTINGS)).not.toThrow();
  });
});
