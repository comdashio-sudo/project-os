import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { IMPORT_SHAPES } from "../testing/importShapes";
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
