import { describe, expect, it } from "vitest";
import { pmcDefinitionKey, planBaselineDates } from "./pmcImport";

// Q-66 (4): the PMC import reads dates as the owner's files write them, each column's day/month order decided from all its values. Synthetic data only.
const context = { definitions: new Map([[pmcDefinitionKey("C", "IP-001"), "d1"], [pmcDefinitionKey("C", "IP-002"), "d2"]]), stored: new Map() };
const plan = (rows: Array<[string, string, unknown, unknown]>) => planBaselineDates(rows.map(([modelCode, activityCode, startDate, endDate], index) => ({ rowNumber: index + 2, cells: { modelCode, activityCode, startDate, endDate } })), context);
const months = (result: ReturnType<typeof plan>, id: string) => result.creates.filter(row => row.activityDefinitionId === id).map(row => [row.periodAt.toISOString().slice(0, 7), row.plannedPercent]);

describe("PMC import dates (Q-66 4)", () => {
  it("POSITIVE: «05/09/2026» in a day-first column is 5 September (never 9 May); the order is decided by the file («15/09/2026» settles it)", () => {
    const result = plan([["C", "IP-001", "05/09/2026", "15/10/2026"], ["C", "IP-002", "01/11/2026", "30/11/2026"]]);
    expect(result.errors).toEqual([]);
    expect(months(result, "d1").map(([month]) => month)).toEqual(["2026-09", "2026-10"]);
    expect(months(result, "d2")).toEqual([["2026-11", 100]]);
  });

  it("POSITIVE: Arabic-Indic digits, a month written in words, an Excel serial number and a month-first column read right", () => {
    const words = plan([["C", "IP-001", "١/٩/٢٠٢٦", "15 أكتوبر 2026"], ["C", "IP-002", 46327, "2026-12-31"]]);
    expect(words.errors).toEqual([]);
    expect(months(words, "d1").map(([month]) => month)).toEqual(["2026-09", "2026-10"]);
    expect(months(words, "d2")[0][0]).toBe("2026-11"); // Excel 46327 = 2026-11-01
    const usOrder = plan([["C", "IP-001", "09/05/2026", "12/25/2026"], ["C", "IP-002", "10/01/2026", "10/31/2026"]]);
    expect(usOrder.errors).toEqual([]); // «12/25» can only be month-first: the column is read month-first, «09/05» is 5 September
    expect(months(usOrder, "d1")[0][0]).toBe("2026-09");
  });

  it("NEGATIVE: a date that is not a date is refused by its field, never guessed", () => {
    const result = plan([["C", "IP-001", "31/02/2026", "next month"]]);
    expect(result.errors.map(error => [error.code, error.field])).toEqual([["PMC_DATE_INVALID", "startDate"], ["PMC_DATE_INVALID", "endDate"]]);
  });
});
