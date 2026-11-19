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

/** Q-48: the letters of a 1-based column number (5 → «E»), the way a person names a column. */
export const columnLetters = (column: number): string => {
  let letters = "";
  for (let rest = column; rest > 0; rest = Math.floor((rest - 1) / 26)) letters = String.fromCharCode(65 + ((rest - 1) % 26)) + letters;
  return letters;
};

/**
 * Q-48: a cell's text that never throws. exceljs's own `cell.text` throws on a covered cell of a merge whose first cell is empty (a section merged over
 * many rows with no name in it), and writes a formula whose result is an error as «[object Object]». A covered cell reads its merge's first cell; an empty
 * one is ""; a formula's result is read (an error result is its code, «#REF!»); rich text is its plain text.
 */
export function cellText(cell: ExcelJS.Cell): string {
  const source = cell.isMerged ? cell.master : cell;
  const read = (value: unknown): string => {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) return source.text ?? "";
    if (typeof value !== "object") return String(value);
    const object = value as { error?: unknown; result?: unknown; formula?: unknown; sharedFormula?: unknown; richText?: Array<{ text?: unknown }>; text?: unknown; hyperlink?: unknown };
    if ("error" in object) return String(object.error ?? "");
    if ("formula" in object || "sharedFormula" in object) return read(object.result);
    if (Array.isArray(object.richText)) return object.richText.map(part => String(part.text ?? "")).join("");
    if ("text" in object) return read(object.text);
    return "";
  };
  return read(source.value);
}

/**
 * Q-48: whether a cell lies in a VERTICAL merge whose first cell is empty (a section merged over its rows and left without a name). Such cells are empty on
 * purpose: a reader that fills a section down from the row above must not give them the previous section.
 */
export function emptyVerticalMergeCover(sheet: ExcelJS.Worksheet): (row: number, column: number) => boolean {
  const merges = ((sheet.model as unknown as { merges?: string[] }).merges ?? []).map(parseRange).filter((range): range is NonNullable<typeof range> => range !== null)
    .filter(range => range.left === range.right && range.bottom > range.top && cellText(sheet.getCell(range.top, range.left)).trim() === "");
  return (row, column) => merges.some(range => column === range.left && row >= range.top && row <= range.bottom);
}

export type SpreadsheetLimits = { maxRows: number; maxColumns: number };
const defaultLimits: SpreadsheetLimits = { maxRows: MAX_IMPORT_ROWS, maxColumns: MAX_IMPORT_COLUMNS };

/**
 * headerRowNumber (default 1): the row that holds the column names; the data starts below it. rowNumbers[i] is the sheet row of rows[i] (blank rows are dropped, so they differ).
 * Q-48 `uniqueHeaders`: a name written over two columns («القسم» in B and in E), and a column with no name that holds data, would share one key and one would
 * overwrite the other. With the option each such column is keyed by its name and its letter («القسم (B)», «القسم (E)», «(L)»), so both are read and a person
 * can tell them apart; `baseHeaders[i]` keeps the name as written.
 */
export function worksheetToRows(sheet: ExcelJS.Worksheet, limits: SpreadsheetLimits = defaultLimits, headerRowNumber = 1, options: { uniqueHeaders?: boolean } = {}): { headers: string[]; baseHeaders: string[]; rows: Record<string, unknown>[]; rowNumbers: number[] } {
  const headerRow = sheet.getRow(headerRowNumber);
  const baseHeaders = Array.from({ length: Math.min(sheet.columnCount, limits.maxColumns + 1) }, (_unused, index) => canonicalHeader(cellText(headerRow.getCell(index + 1)).trim()));
  const counts = new Map<string, number>();
  for (const header of baseHeaders) counts.set(header, (counts.get(header) ?? 0) + 1);
  const headers = options.uniqueHeaders
    ? baseHeaders.map((header, index) => (header === "" ? `(${columnLetters(index + 1)})` : (counts.get(header) ?? 0) > 1 ? `${header} (${columnLetters(index + 1)})` : header))
    : baseHeaders;
  const rows: Record<string, unknown>[] = [];
  const rowNumbers: number[] = [];
  const covered = horizontalMergeCover(sheet);
  const lastRow = Math.min(sheet.rowCount, limits.maxRows + 1 + headerRowNumber);
  for (let rowNumber = headerRowNumber + 1; rowNumber <= lastRow; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const values = Object.fromEntries(headers.map((header, index) => {
      if (covered(rowNumber, index + 1)) return [header, ""];
      const cell = row.getCell(index + 1);
      const value = typeof cell.value === "object" && cell.value !== null && "result" in cell.value
        ? cell.value.result
        : cell.value;
      return [header, value instanceof Date ? value : cellText(cell) || (typeof value === "object" ? "" : value) || ""];
    }));
    if (Object.values(values).some(value => String(value ?? "").trim() !== "")) { rows.push(values); rowNumbers.push(rowNumber); }
  }
  return { headers, baseHeaders, rows, rowNumbers };
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
