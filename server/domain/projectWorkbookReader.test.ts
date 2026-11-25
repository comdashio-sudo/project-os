import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildProjectWorkbook, FIRST_DATA_ROW, projectWorkbookSheets } from "./projectWorkbook";
import { readProjectWorkbook, WORKBOOK_MAX_ROWS } from "./projectWorkbookReader";

// Q-51 batch 2a: reading the workbook back. Built with buildProjectWorkbook, filled as a company would, read with readProjectWorkbook. Synthetic data only.
const sheets = projectWorkbookSheets();
const spec = (key: string) => sheets.find(sheet => sheet.key === key)!;
async function workbook(locale: "ar" | "en" | "ur", fill: Record<string, Array<Record<string, string | number>>>, edit?: (book: ExcelJS.Workbook) => void) {
  const book = new ExcelJS.Workbook(); await book.xlsx.load((await buildProjectWorkbook({ locale })).bytes as unknown as ArrayBuffer);
  for (const [key, rows] of Object.entries(fill)) {
    const sheet = spec(key); const ws = book.getWorksheet(sheet[locale])!;
    rows.forEach((row, index) => sheet.columns.forEach((column, col) => { if (row[column.key] !== undefined) ws.getCell(FIRST_DATA_ROW + index, col + 2).value = row[column.key]; }));
  }
  edit?.(book);
  return new Uint8Array(await book.xlsx.writeBuffer());
}
const report = async (bytes: Uint8Array) => { const reading = await readProjectWorkbook(bytes); if (!reading.recognised) throw new Error(reading.code); return Object.fromEntries(reading.sheets.map(sheet => [sheet.key, sheet])); };

describe("Q-51 batch 2a: reading the project workbook", () => {
  it("POSITIVE: in each language, filled sheets read complete with their rows; untouched sheets read empty; the examples are never read", async () => {
    for (const locale of ["ar", "en", "ur"] as const) {
      const read = await report(await workbook(locale, {
        models: [{ modelCode: "M1" }, { modelCode: "M2" }],
        units: [{ blockCode: "B1", unitNumber: 101, modelCode: "M1" }, { blockCode: "B1", unitNumber: 102, modelCode: "M2" }],
        status: [{ unitNumber: 101, activityCode: "X-01", status: "COMPLETE" }],
      }));
      expect(read.models.status).toBe("complete");
      expect(read.units.rows.map(row => row.cells.unitNumber)).toEqual(["101", "102"]); // the examples (units 1 and 2) are not among them
      expect(read.status.rows.map(row => [row.row, row.cells.activityCode])).toEqual([[FIRST_DATA_ROW, "X-01"]]);
      expect(read.budget.status).toBe("empty");
      expect(Object.values(read).flatMap(sheet => sheet.errors)).toEqual([]);
    }
  });

  it("NEGATIVE (composite keys): «current progress» = unit + activity, «opening stock» = warehouse + material — one part missing, the other, or both with other data: refused by sheet, row and field", async () => {
    const read = await report(await workbook("ar", {
      status: [{ unitNumber: 101, status: "COMPLETE" }, { activityCode: "X-01", status: "COMPLETE" }, { status: "IN_PROGRESS" }],
      stock: [{ warehouseCode: "WH-1", quantity: 5, unitCost: 10 }, { materialCode: "MAT-1", quantity: 5, unitCost: 10 }, { quantity: 5, unitCost: 10 }],
    }));
    const r = FIRST_DATA_ROW;
    expect(read.status.status).toBe("errors");
    expect(read.status.errors.filter(error => error.code === "WORKBOOK_KEY_MISSING")).toEqual([
      { sheet: "status", row: r, field: "activityCode", code: "WORKBOOK_KEY_MISSING" },
      { sheet: "status", row: r + 1, field: "unitNumber", code: "WORKBOOK_KEY_MISSING" },
      { sheet: "status", row: r + 2, field: "unitNumber", code: "WORKBOOK_KEY_MISSING" },
      { sheet: "status", row: r + 2, field: "activityCode", code: "WORKBOOK_KEY_MISSING" },
    ]);
    expect(read.stock.errors.filter(error => error.code === "WORKBOOK_KEY_MISSING")).toEqual([
      { sheet: "stock", row: r, field: "materialCode", code: "WORKBOOK_KEY_MISSING" },
      { sheet: "stock", row: r + 1, field: "warehouseCode", code: "WORKBOOK_KEY_MISSING" },
      { sheet: "stock", row: r + 2, field: "warehouseCode", code: "WORKBOOK_KEY_MISSING" },
      { sheet: "stock", row: r + 2, field: "materialCode", code: "WORKBOOK_KEY_MISSING" },
    ]);
  });

  it("NEGATIVE: a simple key left empty on a row with data, a required column left empty, and a repeated key are each an error — never skipped", async () => {
    const read = await report(await workbook("en", { units: [{ blockCode: "B1", modelCode: "M1" }, { blockCode: "B1", unitNumber: 7 }, { blockCode: "B1", unitNumber: 8, modelCode: "M1" }, { blockCode: "B2", unitNumber: 8, modelCode: "M1" }] }));
    const r = FIRST_DATA_ROW;
    expect(read.units.errors).toEqual([
      { sheet: "units", row: r, field: "unitNumber", code: "WORKBOOK_KEY_MISSING" },
      { sheet: "units", row: r + 1, field: "modelCode", code: "WORKBOOK_REQUIRED_MISSING" },
      { sheet: "units", row: r + 3, field: "unitNumber", code: "WORKBOOK_KEY_DUPLICATE" },
    ]);
  });

  it("NEGATIVE: a file that is not a Dashio workbook (no version, another version, not a spreadsheet) is not recognised; a renamed column refuses its sheet", async () => {
    const plain = new ExcelJS.Workbook(); plain.addWorksheet("Sheet1").addRow(["a"]);
    expect(await readProjectWorkbook(new Uint8Array(await plain.xlsx.writeBuffer()))).toEqual({ recognised: false, code: "WORKBOOK_NOT_RECOGNISED" });
    expect(await readProjectWorkbook(await workbook("en", {}, book => { book.getWorksheet("_dashio")!.getCell("A1").value = "dashio-project-workbook/0"; }))).toEqual({ recognised: false, code: "WORKBOOK_NOT_RECOGNISED" });
    expect(await readProjectWorkbook(new Uint8Array([1, 2, 3]))).toEqual({ recognised: false, code: "WORKBOOK_NOT_RECOGNISED" });
    const renamed = await report(await workbook("en", { units: [{ blockCode: "B1", unitNumber: 1, modelCode: "M1" }] }, book => {
      const ws = book.getWorksheet(spec("units").en)!; ws.getCell(1, 3).value = "Something else"; ws.getCell(2, 3).value = "Something else";
    }));
    expect(renamed.units).toMatchObject({ status: "errors", rows: [], errors: [{ code: "WORKBOOK_HEADERS_CHANGED", row: 1 }] });
  });
  it("review of #527 — NEGATIVE: a sheet declaring more rows than the cap is refused with its own error, before its rows are walked", async () => {
    const read = await report(await workbook("en", {}, book => { book.getWorksheet(spec("units").en)!.getCell(FIRST_DATA_ROW + WORKBOOK_MAX_ROWS + 5, 2).value = "B9"; }));
    expect(read.units).toMatchObject({ status: "errors", rows: [], errors: [{ code: "WORKBOOK_TOO_MANY_ROWS" }] });
    expect(read.models.status).toBe("empty");
  });
});
