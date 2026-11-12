import { describe, expect, it } from "vitest";
import { buildSpreadsheet } from "./excelWorkbook";
import { analyzeLabourFile, analyzeLabourRows, labourRefusal } from "./plannedLabour";

// Q-10 (d): the planned labour reader. Synthetic numbers only.
const H = ["Month", "Trade", "Workers"];
const r = (month: unknown, trade: unknown, workers: unknown) => ({ Month: month, Trade: trade, Workers: workers });

describe("planned labour reader (Q-10 d)", () => {
  it("POSITIVE: rows per trade are summed per month into the histogram, with the peak; a file without a trade column is accepted", () => {
    const a = analyzeLabourRows([r("2027-02", "Masons", 40), r("2027-01", "Masons", 20), r("2027-02", "Carpenters", "1,000")], H);
    expect(labourRefusal(a)).toBeNull();
    expect(a.histogram).toEqual([{ month: "2027-01-01", workers: 20 }, { month: "2027-02-01", workers: 1040 }]);
    expect(a.peak).toBe(1040);
    const plain = analyzeLabourRows([{ "الشهر": "2027-01", "العمالة": 15 }], ["الشهر", "العمالة"]);
    expect(plain.rows).toEqual([{ month: "2027-01-01", trade: "", workers: 15 }]);
  });

  it("NEGATIVE: a bad month, a fractional or negative headcount and a repeated month and trade are each refused with their row", () => {
    const a = analyzeLabourRows([r("2027-01", "Masons", 10), r("soon", "Masons", 5), r("2027-02", "Masons", 2.5), r("2027-03", "Masons", -1), r("2027-01", "masons", 3)], H);
    expect(a.issues.map(issue => [issue.rowNumber, issue.code])).toEqual([[3, "LABOUR_MONTH_INVALID"], [4, "LABOUR_WORKERS_INVALID"], [5, "LABOUR_WORKERS_INVALID"], [6, "LABOUR_ROW_REPEATED"]]);
    expect(labourRefusal(a)).toBe("LABOUR_ROWS_INVALID");
  });

  it("NEGATIVE: missing columns and an empty file are refused; a real .xlsx is read", async () => {
    expect(labourRefusal(analyzeLabourRows([{ Date: "x" }], ["Date"]))).toBe("LABOUR_COLUMNS_MISSING");
    expect(labourRefusal(analyzeLabourRows([], H))).toBe("LABOUR_EMPTY");
    const xlsx = await buildSpreadsheet({ sheetName: "Labour", headers: H, rows: [["2027-01", "Masons", 12]], format: "xlsx" });
    expect((await analyzeLabourFile(xlsx, "xlsx")).peak).toBe(12);
  });
});
