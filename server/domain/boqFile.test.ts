import { describe, expect, it } from "vitest";
import { buildSpreadsheet } from "./excelWorkbook";
import { analyzeBoqFile, analyzeBoqRows, boqRefusal } from "./boqFile";

// Q-10 (c): the BOQ reader. Synthetic items only.
const H = ["Item no.", "Description", "Unit", "Quantity", "Unit rate"];
const row = (code: unknown, description: unknown, unit: unknown, quantity: unknown, rate: unknown) => Object.fromEntries(H.map((header, index) => [header, [code, description, unit, quantity, rate][index]]));

describe("BOQ reader (Q-10 c)", () => {
  it("POSITIVE: items are read with their total (quantity × rate), thousands separators allowed, Arabic headers understood", () => {
    const a = analyzeBoqRows([row("A-01", "Excavation", "m3", "1,200", 18.5), row("A-02", "Concrete", "m3", 85, "320")], H);
    expect(boqRefusal(a)).toBeNull();
    expect(a.items.map(item => [item.code, item.totalAmount])).toEqual([["A-01", 22200], ["A-02", 27200]]);
    expect(a.totalAmount).toBe(49400);
    const ar = analyzeBoqRows([{ "رقم البند": "B-1", "وصف البند": "حفر", "الوحدة": "م3", "الكمية": 10, "سعر الوحدة": 2 }], ["رقم البند", "وصف البند", "الوحدة", "الكمية", "سعر الوحدة"]);
    expect(ar.items[0]).toMatchObject({ code: "B-1", totalAmount: 20 });
  });

  it("NEGATIVE: every refused row names its row and reason, a repeated code is refused, and the save is refused", () => {
    const a = analyzeBoqRows([row("A-01", "Ok", "m3", 1, 1), row("", "No code", "m3", 1, 1), row("A-03", "", "m3", 1, 1), row("A-04", "x", "", 1, 1), row("A-05", "x", "m3", "-2", 1), row("A-06", "x", "m3", 1, "abc"), row("A-01", "Again", "m3", 1, 1)], H);
    expect(a.issues.map(issue => [issue.rowNumber, issue.code])).toEqual([[3, "BOQ_CODE_MISSING"], [4, "BOQ_DESCRIPTION_MISSING"], [5, "BOQ_UNIT_INVALID"], [6, "BOQ_QUANTITY_INVALID"], [7, "BOQ_RATE_INVALID"], [8, "BOQ_CODE_REPEATED"]]);
    expect(boqRefusal(a)).toBe("BOQ_ROWS_INVALID");
  });

  it("NEGATIVE: missing columns and an empty file are refused", () => {
    expect(boqRefusal(analyzeBoqRows([{ Code: "A", Name: "B" }], ["Code", "Name"]))).toBe("BOQ_COLUMNS_MISSING");
    expect(boqRefusal(analyzeBoqRows([], H))).toBe("BOQ_EMPTY");
  });

  it("reads a real .xlsx file", async () => {
    const xlsx = await buildSpreadsheet({ sheetName: "BOQ", headers: H, rows: [["A-01", "Excavation", "m3", 10, 5]], format: "xlsx" });
    expect((await analyzeBoqFile(xlsx, "xlsx")).items[0]).toMatchObject({ code: "A-01", quantity: 10, unitRate: 5, totalAmount: 50 });
  });
});
