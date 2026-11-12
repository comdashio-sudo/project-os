import { describe, expect, it } from "vitest";
import { buildSpreadsheet } from "./excelWorkbook";
import { analyzeCashFlowFile, analyzeCashFlowRows, cashFlowRefusal } from "./plannedCashFlow";

// Q-10 (b): the planned cash flow reader. Synthetic months only.
const rows = (pairs: Array<[unknown, unknown]>) => pairs.map(([month, percent]) => ({ Month: month, Percent: percent }));
const H = ["Month", "Percent"];

describe("planned cash flow reader (Q-10 b)", () => {
  it("POSITIVE: percent rows that total 100% are accepted, sorted by month, with the cumulative S-curve ending at 1", () => {
    const a = analyzeCashFlowRows(rows([["2027-03", "30%"], ["2027-01", 20], ["2027-02", "50"]]), H);
    expect(cashFlowRefusal(a)).toBeNull();
    expect(a.months.map(m => m.month)).toEqual(["2027-01-01", "2027-02-01", "2027-03-01"]);
    expect(a.months.map(m => m.cumulative)).toEqual([0.2, 0.7, 1]);
    expect(a.totalPercent).toBe(100);
  });

  it("POSITIVE: a file of fractions (0.25 …) is read as fractions, and Arabic headers and real dates are understood", () => {
    const a = analyzeCashFlowRows([{ "الشهر": new Date(Date.UTC(2027, 0, 15)), "النسبة": 0.25 }, { "الشهر": "2027/2/1", "النسبة": 0.75 }], ["الشهر", "النسبة"]);
    expect(cashFlowRefusal(a)).toBeNull();
    expect(a.months.map(m => [m.month, m.fraction])).toEqual([["2027-01-01", 0.25], ["2027-02-01", 0.75]]);
  });

  it("NEGATIVE: a total other than 100% is refused, and the total is reported so the difference can be named", () => {
    const a = analyzeCashFlowRows(rows([["2027-01", "40%"], ["2027-02", "50%"]]), H);
    expect(cashFlowRefusal(a)).toBe("CASHFLOW_TOTAL_NOT_100");
    expect(a.totalPercent).toBe(90);
  });

  it("NEGATIVE: a bad month, a bad share and a repeated month are each reported with their row and value, and the save is refused", () => {
    const a = analyzeCashFlowRows(rows([["2027-01", "50%"], ["January", "10%"], ["2027-02", "abc"], ["2027-01", "50%"], ["2027-13", "1%"]]), H);
    expect(a.issues).toEqual([
      { rowNumber: 3, code: "CASHFLOW_MONTH_INVALID", value: "January" },
      { rowNumber: 4, code: "CASHFLOW_PERCENT_INVALID", value: "abc" },
      { rowNumber: 5, code: "CASHFLOW_MONTH_REPEATED", value: "2027-01" },
      { rowNumber: 6, code: "CASHFLOW_MONTH_INVALID", value: "2027-13" },
    ]);
    expect(cashFlowRefusal(a)).toBe("CASHFLOW_ROWS_INVALID");
  });

  it("NEGATIVE: missing columns, a negative share and an empty file are refused", () => {
    expect(cashFlowRefusal(analyzeCashFlowRows([{ Date: "2027-01", Value: 100 }], ["Date", "Value"]))).toBe("CASHFLOW_COLUMNS_MISSING");
    expect(analyzeCashFlowRows(rows([["2027-01", -5]]), H).issues[0].code).toBe("CASHFLOW_PERCENT_INVALID");
    expect(cashFlowRefusal(analyzeCashFlowRows([], H))).toBe("CASHFLOW_EMPTY");
  });

  it("reads a real .xlsx and .csv file end to end", async () => {
    const xlsx = await buildSpreadsheet({ sheetName: "Cash flow", headers: H, rows: [["2027-01", "60%"], ["2027-02", "40%"]], format: "xlsx" });
    expect(cashFlowRefusal(await analyzeCashFlowFile(xlsx, "xlsx"))).toBeNull();
    const csv = new TextEncoder().encode("Month,Percent\n2027-01,100\n");
    expect((await analyzeCashFlowFile(csv, "csv")).months).toHaveLength(1);
    expect((await analyzeCashFlowFile(new TextEncoder().encode("not a workbook"), "xlsx")).fileError).toBeTruthy();
  });
});
