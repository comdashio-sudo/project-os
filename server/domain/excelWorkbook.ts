import ExcelJS from "exceljs";
import JSZip from "jszip";
import { Readable } from "node:stream";

export const MAX_IMPORT_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 10_000;
export const MAX_IMPORT_COLUMNS = 60;

export type SpreadsheetReadResult =
  | { ok: true; workbook: ExcelJS.Workbook }
  | { ok: false; code: "IMPORT_FILE_TOO_LARGE" | "IMPORT_WORKBOOK_INVALID" | "IMPORT_MACRO_WORKBOOK_REJECTED" };

export async function readSpreadsheetSafely(input: Uint8Array | string, format: "xlsx" | "csv"): Promise<SpreadsheetReadResult> {
  const byteLength = typeof input === "string" ? Buffer.byteLength(input, "utf8") : input.byteLength;
  if (byteLength > MAX_IMPORT_BYTES) return { ok: false, code: "IMPORT_FILE_TOO_LARGE" };

  try {
    const workbook = new ExcelJS.Workbook();
    if (format === "csv") {
      await workbook.csv.read(Readable.from([Buffer.from(typeof input === "string" ? input : input)]), { map: value => value });
      return { ok: true, workbook };
    }

    const bytes = Buffer.from(input);
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
      return { ok: false, code: "IMPORT_WORKBOOK_INVALID" };
    }
    const zip = await JSZip.loadAsync(bytes);
    if (Object.keys(zip.files).some(name => /(^|\/)vbaProject\.bin$/i.test(name))) {
      return { ok: false, code: "IMPORT_MACRO_WORKBOOK_REJECTED" };
    }
    type ExcelJsLoadInput = Parameters<typeof workbook.xlsx.load>[0];
    await workbook.xlsx.load(bytes as unknown as ExcelJsLoadInput);
    return { ok: true, workbook };
  } catch {
    return { ok: false, code: "IMPORT_WORKBOOK_INVALID" };
  }
}

export function worksheetToRows(sheet: ExcelJS.Worksheet): { headers: string[]; rows: Record<string, unknown>[] } {
  const headerRow = sheet.getRow(1);
  const headers = Array.from({ length: Math.min(sheet.columnCount, MAX_IMPORT_COLUMNS + 1) }, (_unused, index) => {
    const cell = headerRow.getCell(index + 1);
    return String(cell.text ?? "").trim();
  });
  const rows: Record<string, unknown>[] = [];
  const lastRow = Math.min(sheet.rowCount, MAX_IMPORT_ROWS + 2);
  for (let rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values = Object.fromEntries(headers.map((header, index) => {
      const cell = row.getCell(index + 1);
      const value = typeof cell.value === "object" && cell.value !== null && "result" in cell.value
        ? cell.value.result
        : cell.value;
      return [header, value instanceof Date ? value : cell.text || value || ""];
    }));
    if (Object.values(values).some(value => String(value ?? "").trim() !== "")) rows.push(values);
  }
  return { headers, rows };
}

export function spreadsheetBoundsError(sheet: ExcelJS.Worksheet, rows: Record<string, unknown>[]) {
  if (sheet.columnCount > MAX_IMPORT_COLUMNS) return "IMPORT_TOO_MANY_COLUMNS" as const;
  if (sheet.rowCount - 1 > MAX_IMPORT_ROWS) return "IMPORT_TOO_MANY_ROWS" as const;
  return undefined;
}

export async function buildSpreadsheet(input: { sheetName: string; headers: string[]; rows: unknown[][]; format: "xlsx" | "csv" }): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(input.sheetName);
  sheet.addRow(input.headers);
  input.rows.forEach(row => sheet.addRow(row));
  const bytes = input.format === "csv" ? await workbook.csv.writeBuffer() : await workbook.xlsx.writeBuffer();
  return Buffer.from(bytes);
}
