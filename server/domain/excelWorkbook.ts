import ExcelJS from "exceljs";
import JSZip from "jszip";
import { Readable } from "node:stream";

// The file reaches the server by direct upload to Storage (not inside a request body), so the ceiling is 50 MB (owner decision, work order 6).
export const MAX_IMPORT_BYTES = 50 * 1024 * 1024;
export const MAX_IMPORT_ROWS = 50_000;
/** A Primavera XER carries one line per activity; 150,000 lines is about 100 MB of text, so the byte ceiling binds first for wide rows. */
export const MAX_XER_ROWS = 150_000;
/** What a workbook may expand to once unzipped. A 50 MB .xlsx that inflates past this is a zip bomb, not a spreadsheet. */
export const MAX_WORKBOOK_UNCOMPRESSED_BYTES = 400 * 1024 * 1024;
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
    const inflated = Object.values(zip.files).reduce((sum, entry) => sum + Number((entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0), 0);
    if (inflated > MAX_WORKBOOK_UNCOMPRESSED_BYTES) return { ok: false, code: "IMPORT_FILE_TOO_LARGE" };
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

const columnNumber = (letters: string) => letters.split("").reduce((sum, ch) => sum * 26 + (ch.charCodeAt(0) - 64), 0);
/** «B2:B6» as its corners (1-based); null for anything else. Shared by both readers. */
export function parseRange(range: string): { top: number; left: number; bottom: number; right: number } | null {
  const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range);
  return match ? { left: columnNumber(match[1]), top: Number(match[2]), right: columnNumber(match[3]), bottom: Number(match[4]) } : null;
}
/**
 * D-25: merged cells read the way Excel SHOWS them — the same rule as the smart import's reader (smartImport/sheetReader.ts): a VERTICAL merge (one column,
 * several rows: a section code written once beside many lines) gives every row its value; a horizontal or block merge (a title across columns) does not spread
 * its text into the other columns, which stay empty. Returns whether a cell of the sheet is a covered cell of a merge that is NOT vertical.
 */
export function horizontalMergeCover(sheet: ExcelJS.Worksheet): (row: number, column: number) => boolean {
  const merges = ((sheet.model as unknown as { merges?: string[] }).merges ?? []).map(parseRange).filter((range): range is NonNullable<typeof range> => range !== null)
    .filter(range => !(range.left === range.right && range.bottom > range.top));
  return (row, column) => merges.some(range => row >= range.top && row <= range.bottom && column >= range.left && column <= range.right && !(row === range.top && column === range.left));
}

export type SpreadsheetLimits = { maxRows: number; maxColumns: number };
const defaultLimits: SpreadsheetLimits = { maxRows: MAX_IMPORT_ROWS, maxColumns: MAX_IMPORT_COLUMNS };

export function worksheetToRows(sheet: ExcelJS.Worksheet, limits: SpreadsheetLimits = defaultLimits): { headers: string[]; rows: Record<string, unknown>[] } {
  const headerRow = sheet.getRow(1);
  const headers = Array.from({ length: Math.min(sheet.columnCount, limits.maxColumns + 1) }, (_unused, index) => {
    const cell = headerRow.getCell(index + 1);
    return canonicalHeader(String(cell.text ?? "").trim());
  });
  const rows: Record<string, unknown>[] = [];
  const covered = horizontalMergeCover(sheet);
  const lastRow = Math.min(sheet.rowCount, limits.maxRows + 2);
  for (let rowNumber = 2; rowNumber <= lastRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values = Object.fromEntries(headers.map((header, index) => {
      if (covered(rowNumber, index + 1)) return [header, ""];
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

export function spreadsheetBoundsError(sheet: ExcelJS.Worksheet, rows: Record<string, unknown>[], limits: SpreadsheetLimits = defaultLimits) {
  if (sheet.columnCount > limits.maxColumns) return "IMPORT_TOO_MANY_COLUMNS" as const;
  if (sheet.rowCount - 1 > limits.maxRows) return "IMPORT_TOO_MANY_ROWS" as const;
  return undefined;
}

/**
 * Q-17 item 7 (decision 210-2, G-156): an exported row's platform id and version travel in two columns whose header explains them in the reader's
 * language and ends with the machine key in brackets («… [__id]»). Reading a file back, such a header counts as the bare key, so a file exported with
 * the explained header and one exported before it (bare «__id») re-import the same way.
 */
export const RESERVED_HEADER_KEY = /\[(__id|__version)\]\s*$/;
export const canonicalHeader = (header: string): string => RESERVED_HEADER_KEY.exec(header)?.[1] ?? header;

export type SpreadsheetOptions = {
  /** 1-based columns kept in the file but hidden in Excel (row id / version of an exported row). */
  hiddenColumns?: number[];
  /** 1-based columns shown grey and locked: the sheet is protected so only these cannot be typed over (every other cell, new rows included, stays editable). */
  lockedColumns?: number[];
  /** 1-based column → allowed values, applied to rows 2..200 so the template offers a drop-down. */
  validations?: Array<{ column: number; list: string[] }>;
};

export async function buildSpreadsheet(input: { sheetName: string; headers: string[]; rows: unknown[][]; format: "xlsx" | "csv" } & SpreadsheetOptions): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(input.sheetName, { views: [{ rightToLeft: false, state: "frozen", ySplit: 1 }] });
  sheet.addRow(input.headers);
  sheet.getRow(1).font = { bold: true };
  input.rows.forEach(row => sheet.addRow(row));
  input.headers.forEach((header, index) => { sheet.getColumn(index + 1).width = Math.max(14, Math.min(40, header.length + 6)); });
  for (const column of input.hiddenColumns ?? []) sheet.getColumn(column).hidden = true;
  if (input.lockedColumns?.length && input.format === "xlsx") {
    const locked = new Set(input.lockedColumns); const grey = { type: "pattern" as const, pattern: "solid" as const, fgColor: { argb: "FFEEF1F6" } };
    for (let column = 1; column <= Math.max(input.headers.length, 1); column += 1) {
      const isLocked = locked.has(column); const sheetColumn = sheet.getColumn(column);
      sheetColumn.protection = { locked: isLocked }; // the column style: rows the reader adds below take it too
      if (isLocked) { sheetColumn.font = { color: { argb: "FF5F6D8A" } }; sheetColumn.fill = grey; }
      for (let row = 1; row <= input.rows.length + 1; row += 1) {
        const cell = sheet.getCell(row, column); cell.protection = { locked: isLocked };
        if (isLocked) { cell.font = { ...(row === 1 ? { bold: true } : {}), color: { argb: "FF5F6D8A" } }; cell.fill = grey; }
      }
    }
    await sheet.protect("", { selectLockedCells: true, selectUnlockedCells: true, formatCells: true, formatColumns: true, formatRows: true, insertRows: true, deleteRows: true, sort: true, autoFilter: true });
  }
  for (const validation of input.validations ?? []) {
    const formula = `"${validation.list.join(",")}"`; // an inline list is capped at 255 characters by Excel
    if (formula.length > 255) continue;
    for (let row = 2; row <= 200; row += 1) sheet.getCell(row, validation.column).dataValidation = { type: "list", allowBlank: true, formulae: [formula] };
  }
  const bytes = input.format === "csv" ? await workbook.csv.writeBuffer() : await workbook.xlsx.writeBuffer();
  return Buffer.from(bytes);
}
