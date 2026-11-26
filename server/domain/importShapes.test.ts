import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { BOQ_SHAPES, IMPORT_SHAPES } from "../testing/importShapes";
import { analyzeBoqFile, boqRefusal } from "./boqFile";
import { parsePmcImportFile, planCatalog, weightsToCatalogRows } from "./pmcImport";

// Q-50 batch 6: every shape in the library imports as it is — no mapping, no correction — and reads to what the library says. Synthetic data only.
const emptyContext = { groups: new Map(), stages: new Map(), definitions: new Map(), activityCodesByModel: new Map(), wbsItems: new Map() };

describe("the library of file shapes (Q-50 batch 6)", () => {
  it("has the six shapes of the proposal", () => {
    expect(IMPORT_SHAPES.length).toBeGreaterThanOrEqual(6);
    expect(new Set(IMPORT_SHAPES.map(shape => shape.name)).size).toBe(IMPORT_SHAPES.length);
  });

  for (const shape of IMPORT_SHAPES) {
    it(`«${shape.name}» imports with no mapping and no correction, and totals 100`, async () => {
      const parsed = await parsePmcImportFile({ kind: "weights", format: "xlsx", bytes: await shape.build() });
      expect(parsed.errors).toEqual([]);
      expect(parsed.columns?.overridden).toBe(false);
      const out = weightsToCatalogRows(parsed.rows, ["A"]);
      expect(out.errors).toEqual([]);
      expect(out.rows.length).toBe(shape.expect.activities);
      expect(new Set(out.rows.map(row => row.cells.groupCode)).size).toBe(shape.expect.groups);
      const total = out.rows.reduce((sum, row) => sum + Number(row.cells.weightPercent), 0);
      expect(Math.abs(total - 100)).toBeLessThan(0.01);
      expect(planCatalog(out.rows, emptyContext).errors).toEqual([]);
      expect(parsed.notes?.skippedTotals ?? 0).toBe(shape.expect.skippedTotals ?? 0);
      expect(parsed.notes?.outlineHeadings ?? 0).toBe(shape.expect.outlineHeadings ?? 0);
      expect(out.rows.filter(row => String(row.cells.activityNameEn ?? "").trim()).length).toBe(shape.expect.englishNames ?? 0);
    });
  }

  it("NEGATIVE: a copy of a library shape with one weight cut is refused with the model and the difference, and a #REF! weight on its row", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await IMPORT_SHAPES.find(shape => shape.name === "subtotals and a grand total")!.build()) as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    sheet.getCell("C3").value = 0.2; // Slabs 0.3 → 0.2: the activities now total 0.9
    sheet.getCell("C6").value = { formula: "#REF!", result: { error: "#REF!" } } as unknown as ExcelJS.CellValue;
    const parsed = await parsePmcImportFile({ kind: "weights", format: "xlsx", bytes: new Uint8Array(await workbook.xlsx.writeBuffer()) });
    const out = weightsToCatalogRows(parsed.rows, ["A"]);
    expect(out.errors.map(error => `${error.rowNumber}:${error.code}`)).toEqual(["6:IMPORT_FORMULA_ERROR"]);
    expect(planCatalog(out.rows, emptyContext).errors.length).toBeGreaterThan(0);
  });
});

describe("the library's priced bills of quantities (Q-50)", () => {
  for (const shape of BOQ_SHAPES) {
    it(`«${shape.name}» reads with no mapping and no correction; headings and non-item lines are left out and named`, async () => {
      const read = await analyzeBoqFile(await shape.build(), "xlsx");
      expect(read.fileError).toBeNull();
      expect(read.issues).toEqual([]);
      expect(boqRefusal(read)).toBeNull();
      expect(read.items.length).toBe(shape.expect.items);
      expect(read.totalAmount).toBe(shape.expect.totalAmount);
      expect(read.leftOut.filter(row => row.kind === "heading").length).toBe(shape.expect.headings);
      expect(read.leftOut.filter(row => row.kind === "line").length).toBe(shape.expect.lines);
      expect(read.leftOut.every(row => row.text.length > 0 && row.rowNumber > 0)).toBe(true);
    });
  }

  it("NEGATIVE: a row with only some of unit, quantity and rate is still an error on its row — never left out as a heading", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await BOQ_SHAPES[0].build()) as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    sheet.getCell("D6").value = null; // item 1.1 keeps its unit and rate but loses its quantity
    sheet.getCell("C7").value = null; sheet.getCell("D7").value = null; sheet.getCell("E7").value = null; sheet.getCell("F7").value = null; sheet.getCell("C7").value = "m2"; // 1.2: a unit only
    sheet.getCell("A10").value = null; // item 2.1 loses its code but keeps unit, quantity and rate
    const read = await analyzeBoqFile(new Uint8Array(await workbook.xlsx.writeBuffer()), "xlsx");
    expect(read.issues.map(issue => `${issue.rowNumber}:${issue.code}`)).toEqual(["6:BOQ_QUANTITY_INVALID", "7:BOQ_QUANTITY_INVALID", "10:BOQ_CODE_MISSING"]);
    expect(boqRefusal(read)).toBe("BOQ_ROWS_INVALID");
    expect(read.leftOut.map(row => row.rowNumber)).toEqual([5, 8, 9, 11, 12]); // only the headings and the totals
  });

  it("review of #544 — NEGATIVE: an item with a code and an amount but no unit, quantity or rate (a lump sum written as an amount) is an error on its row, never left out; a totals line with an amount and no code is still left out", async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load((await BOQ_SHAPES[0].build()) as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0];
    sheet.getRow(13).values = ["3", "Preliminaries (lump sum)", "", null, null, 50000];
    const read = await analyzeBoqFile(new Uint8Array(await workbook.xlsx.writeBuffer()), "xlsx");
    expect(read.issues).toEqual([{ rowNumber: 13, code: "BOQ_LUMP_SUM_UNPRICED", value: "50000" }]);
    expect(boqRefusal(read)).toBe("BOQ_ROWS_INVALID");
    expect(read.leftOut.map(row => `${row.rowNumber}:${row.kind}`)).toEqual(["5:heading", "8:line", "9:heading", "11:line", "12:line"]); // the totals with amounts are still lines
  });
});
