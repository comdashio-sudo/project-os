import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { analyzeImportFile, buildDataExportFile, buildImportTemplateFile, type ImportModuleCode } from "./dataImport";
import { diffImportRows, EXPORT_ID_HEADER, EXPORT_VERSION_HEADER, summariseDiff, type CycleModuleCode, type FileRow, type StoredRow } from "./importCycle";

// The real file path, no database: rows → exported workbook → the importer's own analysis → diff against the same rows. Synthetic data only.
const V = "2026-10-01T08:00:00.000Z";
const wbsRows = (count: number) => Array.from({ length: count }, (_, index) => ({ code: `W-${String(index + 1).padStart(5, "0")}`, name: `Work package ${index + 1}`, plannedValue: (index + 1) * 10 }));
const storedFrom = (rows: ReturnType<typeof wbsRows>) => new Map<string, StoredRow>(rows.map((row, index) => [row.code, { id: `id-${index}`, version: V, values: { ...row, plannedValue: row.plannedValue.toFixed(2) } }]));
const exportRows = (rows: ReturnType<typeof wbsRows>) => rows.map((row, index) => ({ ...row, [EXPORT_ID_HEADER]: `id-${index}`, [EXPORT_VERSION_HEADER]: V }));

async function reimport(bytes: Buffer, moduleCode: CycleModuleCode, stored: Map<string, StoredRow>) {
  const analysis = await analyzeImportFile({ moduleCode, format: "xlsx", bytes });
  const fileRows: FileRow[] = analysis.validRows.map(row => { const raw = analysis.rows[row.rowNumber - 2] ?? {}; return { rowNumber: row.rowNumber, values: row.values as Record<string, unknown>, fileId: String(raw[EXPORT_ID_HEADER] ?? "") || undefined, fileVersion: String(raw[EXPORT_VERSION_HEADER] ?? "") || undefined }; });
  return { analysis, diff: diffImportRows(moduleCode, fileRows, stored) };
}

describe("export → edit → re-import through the real workbook", () => {
  it("exports the reserved id/version columns hidden, and re-importing the untouched file gives zero changes", async () => {
    const rows = wbsRows(25);
    const file = await buildDataExportFile({ moduleCode: "wbs", format: "xlsx", locale: "ar", rows: exportRows(rows) });
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(file.bytes as unknown as ArrayBuffer);
    const sheet = workbook.worksheets[0]!;
    expect(sheet.getRow(1).values).toEqual([undefined, "رمز WBS", "اسم WBS", "القيمة المخططة", EXPORT_ID_HEADER, EXPORT_VERSION_HEADER]);
    expect(sheet.getColumn(4).hidden).toBe(true); expect(sheet.getColumn(5).hidden).toBe(true); expect(sheet.getColumn(1).hidden).toBeFalsy();
    const { analysis, diff } = await reimport(file.bytes, "wbs", storedFrom(rows));
    expect(analysis.errors).toEqual([]); // the reserved columns are not "unsupported columns"
    expect(summariseDiff(diff)).toEqual({ new: 0, modified: 0, unchanged: 25, conflict: 0, missing: 0, total: 25 });
  });

  it("editing one cell of the exported file gives exactly one change", async () => {
    const rows = wbsRows(25);
    const file = await buildDataExportFile({ moduleCode: "wbs", format: "xlsx", locale: "en", rows: exportRows(rows) });
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(file.bytes as unknown as ArrayBuffer);
    workbook.worksheets[0]!.getCell(8, 3).value = 99999; // row 8 = W-00007, "Planned Value"
    const edited = Buffer.from(await workbook.xlsx.writeBuffer());
    const { diff } = await reimport(edited, "wbs", storedFrom(rows));
    expect(summariseDiff(diff)).toMatchObject({ new: 0, modified: 1, unchanged: 24, conflict: 0 });
    expect(diff.entries.find(entry => entry.kind === "modified")).toMatchObject({ key: "W-00007", changes: [{ field: "plannedValue", oldValue: "70.00", newValue: "99999.00" }] });
  });

  it("a stored row that changed since the export is a conflict, not an overwrite", async () => {
    const rows = wbsRows(5);
    const file = await buildDataExportFile({ moduleCode: "wbs", format: "xlsx", locale: "en", rows: exportRows(rows) });
    const stored = storedFrom(rows); stored.get("W-00002")!.version = "2026-10-02T09:00:00.000Z"; // someone saved it in the platform after the export
    expect(summariseDiff((await reimport(file.bytes, "wbs", stored)).diff)).toMatchObject({ conflict: 1, unchanged: 4 });
  });

  it("a 20,000-row export re-imports with zero changes", async () => {
    const rows = wbsRows(20_000);
    const file = await buildDataExportFile({ moduleCode: "wbs", format: "xlsx", locale: "en", rows: exportRows(rows) });
    const started = Date.now();
    const { analysis, diff } = await reimport(file.bytes, "wbs", storedFrom(rows));
    expect(analysis.errors).toEqual([]);
    expect(summariseDiff(diff)).toMatchObject({ unchanged: 20_000, modified: 0, new: 0, conflict: 0, missing: 0 });
    expect(Date.now() - started).toBeLessThan(60_000);
  }, 120_000);

  it("contracts and materials exports carry the cycle columns too, and re-import clean", async () => {
    const contracts = [{ code: "C-1", title: "Civil", counterparty: "Main", contractValue: 1000, currency: "SAR", [EXPORT_ID_HEADER]: "c0", [EXPORT_VERSION_HEADER]: V }];
    const file = await buildDataExportFile({ moduleCode: "contracts", format: "xlsx", locale: "en", rows: contracts });
    const stored = new Map<string, StoredRow>([["C-1", { id: "c0", version: V, values: { code: "C-1", title: "Civil", counterparty: "Main", contractValue: "1000.00", currency: "SAR" } }]]);
    expect(summariseDiff((await reimport(file.bytes, "contracts", stored)).diff)).toMatchObject({ unchanged: 1, modified: 0 });
    const materials = [{ code: "M-1", description: "d", unitOfMeasure: "m3", category: "c", referenceSpecification: "", [EXPORT_ID_HEADER]: "m0", [EXPORT_VERSION_HEADER]: V }];
    const mfile = await buildDataExportFile({ moduleCode: "materials", format: "xlsx", locale: "ar", rows: materials });
    const mstored = new Map<string, StoredRow>([["M-1", { id: "m0", version: V, values: { code: "M-1", description: "d", unitOfMeasure: "m3", category: "c", referenceSpecification: null } }]]);
    expect(summariseDiff((await reimport(mfile.bytes, "materials", mstored)).diff)).toMatchObject({ unchanged: 1, modified: 0 });
  });
});

describe("import templates come from the importer's own field table (X-1)", () => {
  const modules: ImportModuleCode[] = ["wbs", "budget", "contracts", "materials", "openingBalances", "schedule"];
  for (const moduleCode of modules) for (const locale of ["ar", "en"] as const) {
    it(`${moduleCode}/${locale}: the template's own example rows pass the importer with no errors`, async () => {
      const file = await buildImportTemplateFile({ moduleCode, locale });
      const analysis = await analyzeImportFile({ moduleCode, format: "xlsx", bytes: file.bytes });
      expect(analysis.errors).toEqual([]);
      expect(analysis.validRows.length).toBeGreaterThan(0);
    });
  }

  it("offers drop-down lists where the importer accepts a closed set of values", async () => {
    const file = await buildImportTemplateFile({ moduleCode: "contracts", locale: "en" });
    const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(file.bytes as unknown as ArrayBuffer);
    expect(workbook.worksheets[0]!.getCell(2, 5).dataValidation).toMatchObject({ type: "list" });
    expect(workbook.worksheets[0]!.getCell(50, 5).dataValidation).toMatchObject({ type: "list" });
  });
});
