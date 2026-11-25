import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { analyzeBoqRows, BOQ_HEADERS } from "./boqFile";
import { analyzeImportFile, importModuleFields } from "./dataImport";
import { parsePmcImportFile, pmcImportFields } from "./pmcImport";
import { buildProjectWorkbook, FIRST_DATA_ROW, PROJECT_WORKBOOK_VERSION, projectWorkbookSheets, type WorkbookSheet } from "./projectWorkbook";

// Q-51 batch 1: the project workbook. Built from the importers' own field tables; each sheet's two header rows are accepted by the importer that reads it;
// the examples agree with one another. Synthetic data only.
const load = async (bytes: Buffer) => { const book = new ExcelJS.Workbook(); await book.xlsx.load(bytes as unknown as ArrayBuffer); return book; };
const sheetFor = (key: string) => projectWorkbookSheets().find(sheet => sheet.key === key)!;
const PMC: Record<string, Parameters<typeof pmcImportFields>[0]> = { units: "locations", activities: "catalog", baseline: "baselineDates", status: "status", requests: "requests" };
const GENERAL: Record<string, "budget" | "contracts" | "materials" | "openingBalances"> = { budget: "budget", contracts: "contracts", materials: "materials", stock: "openingBalances" };
/** One sheet's header row (Arabic or English) and its examples, as a plain file — what the importer would receive for that sheet. */
const plain = async (sheet: WorkbookSheet, language: "ar" | "en") => {
  const book = new ExcelJS.Workbook(); const ws = book.addWorksheet("Sheet1");
  ws.addRow(sheet.columns.map(column => column[language]));
  for (const example of sheet.examples) ws.addRow(sheet.columns.map(column => example[column.key] ?? null));
  return new Uint8Array(await book.xlsx.writeBuffer());
};

describe("Q-51 batch 1: the project workbook", () => {
  it("has the read-me, the lists, the thirteen sheets in order and a hidden version sheet, in each language; Arabic and Urdu read right to left", async () => {
    for (const locale of ["ar", "en", "ur"] as const) {
      const book = await load((await buildProjectWorkbook({ locale })).bytes);
      const names = book.worksheets.map(ws => ws.name);
      expect(names).toHaveLength(16);
      expect(names.slice(2, 15)).toEqual(projectWorkbookSheets().map(sheet => sheet[locale]));
      const meta = book.getWorksheet("_dashio")!;
      expect(meta.state).toBe("veryHidden");
      expect(meta.getCell("A1").value).toBe(PROJECT_WORKBOOK_VERSION);
      expect(book.worksheets[2].views[0]).toMatchObject({ rightToLeft: locale !== "en" });
    }
  });

  it("is built from the importers' own field tables — the same keys, in the same order, required where the importer requires", () => {
    for (const [key, kind] of Object.entries(PMC)) expect(sheetFor(key).columns.map(column => [column.key, column.required])).toEqual(pmcImportFields(kind).map(field => [field.key, field.required]));
    for (const [key, moduleCode] of Object.entries(GENERAL)) expect(sheetFor(key).columns.map(column => [column.key, column.required])).toEqual(importModuleFields(moduleCode).map(field => [field.key, field.required]));
    expect(sheetFor("boq").columns.map(column => column.key)).toEqual(Object.keys(BOQ_HEADERS));
  });

  it("each sheet's Arabic header row and its English one are both read by its importer, and its examples pass it with no error", async () => {
    for (const language of ["ar", "en"] as const) {
      for (const [key, kind] of Object.entries(PMC)) {
        const parsed = await parsePmcImportFile({ kind, format: "xlsx", bytes: await plain(sheetFor(key), language) });
        expect(parsed.errors, `${key}/${language}`).toEqual([]);
        expect(parsed.rows.length, `${key}/${language}`).toBe(sheetFor(key).examples.length);
      }
      for (const [key, moduleCode] of Object.entries(GENERAL)) {
        const analysis = await analyzeImportFile({ moduleCode, format: "xlsx", bytes: await plain(sheetFor(key), language) });
        expect(analysis.errors.filter(error => error.code !== "IMPORT_REFERENCE_NOT_FOUND"), `${key}/${language}`).toEqual([]);
      }
      const boq = sheetFor("boq");
      const rows = boq.examples.map(example => Object.fromEntries(boq.columns.map(column => [column[language], example[column.key]])));
      expect(analyzeBoqRows(rows, boq.columns.map(column => column[language])).issues, `boq/${language}`).toEqual([]);
    }
  });

  it("the examples agree with one another: units use the models given, activities and progress name activities of the unit's model", () => {
    const models = new Set(sheetFor("models").examples.map(row => row.modelCode));
    const unitModel = new Map(sheetFor("units").examples.map(row => [row.unitNumber, row.modelCode]));
    const activities = new Set(sheetFor("activities").examples.map(row => `${row.modelCode}|${row.activityCode}`));
    for (const model of unitModel.values()) expect(models.has(model)).toBe(true);
    for (const row of sheetFor("baseline").examples) expect(activities.has(`${row.modelCode}|${row.activityCode}`)).toBe(true);
    for (const row of sheetFor("status").examples) expect(activities.has(`${unitModel.get(row.unitNumber)}|${row.activityCode}`)).toBe(true);
    // the example weights total 100 for the model they describe
    expect(sheetFor("activities").examples.reduce((sum, row) => sum + Number(row.weightPercent), 0)).toBe(100);
  });

  it("required headers are indigo and optional light; examples are marked in column A; drop-downs, key highlighting and the weight totals are in place", async () => {
    const book = await load((await buildProjectWorkbook({ locale: "ar" })).bytes);
    const units = book.getWorksheet(sheetFor("units").ar)!;
    const columns = sheetFor("units").columns;
    const fill = (col: number) => (units.getCell(1, col).fill as { fgColor?: { argb?: string } }).fgColor?.argb;
    expect(fill(columns.findIndex(column => column.key === "unitNumber") + 2)).toBe("FF3730A3");
    expect(fill(columns.findIndex(column => column.key === "zoneCode") + 2)).toBe("FFE0E7FF");
    expect(units.getCell(FIRST_DATA_ROW - 2, 1).value).toBe("مثال");
    const status = book.getWorksheet(sheetFor("status").ar)!;
    const statusCol = sheetFor("status").columns.findIndex(column => column.key === "status") + 2;
    expect(status.getCell(FIRST_DATA_ROW, statusCol).dataValidation).toMatchObject({ type: "list" });
    // the composite key (unit + activity) is highlighted part by part when one is missing, and together when repeated
    const rules = (status as unknown as { conditionalFormattings: Array<{ ref: string; rules: Array<{ formulae: string[] }> }> }).conditionalFormattings;
    expect(rules.length).toBe(3);
    expect(rules[2].rules[0].formulae[0]).toContain("COUNTIFS(");
    const activities = book.getWorksheet(sheetFor("activities").ar)!;
    const at = sheetFor("activities").columns.length + 3;
    expect(String((activities.getCell(2, at + 1).value as { formula: string }).formula)).toContain("SUMIFS(");
  });
});
