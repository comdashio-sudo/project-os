import ExcelJS from "exceljs";
import { MAX_IMPORT_ROWS, readSpreadsheetSafely } from "../excelWorkbook";

// Reads ANY workbook or CSV into plain grids, without asking the file to look like our template: every sheet, the merged cells filled the way Excel SHOWS them (vertical merges only —
// a horizontal merge must not copy a title into six columns), and CSV in UTF-8 or Windows-1256. Free, deterministic, no model.
export const MATRIX_MAX_COLUMNS = 300;
export type Cell = string | number | Date | null;
export type SheetGrid = { name: string; rows: Cell[][]; mergedFilled: number; mergeRanges: number };
export type GridResult = { ok: true; sheets: SheetGrid[]; encoding: "utf-8" | "windows-1256" | "xlsx" } | { ok: false; code: string };

const columnNumber = (letters: string) => letters.split("").reduce((sum, ch) => sum * 26 + (ch.charCodeAt(0) - 64), 0);
function parseRange(range: string): { top: number; left: number; bottom: number; right: number } | null {
  const match = /^([A-Z]+)(\d+):([A-Z]+)(\d+)$/.exec(range);
  return match ? { left: columnNumber(match[1]), top: Number(match[2]), right: columnNumber(match[3]), bottom: Number(match[4]) } : null;
}

function plainValue(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return value;
  if (typeof value === "number" || typeof value === "string") return value;
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE";
  const object = value as unknown as Record<string, unknown>;
  if (Array.isArray(object.richText)) return (object.richText as Array<{ text: string }>).map(part => part.text).join("");
  if ("result" in object) return plainValue(object.result as ExcelJS.CellValue);
  if (typeof object.text === "string") return object.text;
  if ("error" in object) return null;
  return null;
}

export function sheetFromWorksheet(sheet: ExcelJS.Worksheet): SheetGrid {
  const lastRow = Math.min(sheet.rowCount, MAX_IMPORT_ROWS + 50);
  // wide enough for a unit-completion matrix (160 columns); the importers still cap what they take (MAX_IMPORT_COLUMNS)
  const lastColumn = Math.min(sheet.columnCount, MATRIX_MAX_COLUMNS);
  const merges = ((sheet.model as unknown as { merges?: string[] }).merges ?? []).map(parseRange).filter((range): range is NonNullable<typeof range> => range !== null);
  // a vertical merge is a range one column wide spanning several rows (a section code written once beside many lines)
  const vertical = merges.filter(range => range.left === range.right && range.bottom > range.top);
  const rows: Cell[][] = [];
  let mergedFilled = 0;
  for (let r = 1; r <= lastRow; r++) {
    const row = sheet.getRow(r);
    const cells: Cell[] = [];
    for (let c = 1; c <= lastColumn; c++) {
      const cell = row.getCell(c);
      let value: Cell;
      if (cell.isMerged && cell.master && cell.master.address !== cell.address) {
        const inVertical = vertical.some(range => range.left === c && r >= range.top && r <= range.bottom);
        value = inVertical ? plainValue(cell.master.value) : null; // vertical: the master's value; horizontal/block: empty (never spread a title)
        if (inVertical && value !== null) mergedFilled += 1;
      } else value = plainValue(cell.value);
      cells.push(typeof value === "string" ? value.replace(/ /g, " ").trim() || null : value);
    }
    rows.push(cells);
  }
  return { name: sheet.name, rows, mergedFilled, mergeRanges: merges.length };
}

/** UTF-8 when it is valid UTF-8 (or has a BOM); Windows-1256 otherwise (what Arabic Excel writes into "CSV"). */
export function decodeCsv(bytes: Uint8Array): { text: string; encoding: "utf-8" | "windows-1256" } {
  const buffer = Buffer.from(bytes);
  if (buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) return { text: buffer.subarray(3).toString("utf8"), encoding: "utf-8" };
  try { return { text: new TextDecoder("utf-8", { fatal: true }).decode(buffer), encoding: "utf-8" }; }
  catch { return { text: new TextDecoder("windows-1256").decode(buffer), encoding: "windows-1256" }; }
}

export function parseCsv(text: string): Cell[][] {
  const firstLines = text.split(/\r?\n/).slice(0, 8).join("\n");
  const count = (delimiter: string) => (firstLines.match(new RegExp(delimiter === "\t" ? "\\t" : `\\${delimiter}`, "g")) ?? []).length;
  const delimiter = [",", ";", "\t"].sort((a, b) => count(b) - count(a))[0];
  const rows: Cell[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  const push = () => { row.push(field); field = ""; };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) { if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; } else field += ch; continue; }
    if (ch === '"') quoted = true;
    else if (ch === delimiter) push();
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; push(); rows.push(row.map(value => value.trim() || null)); row = []; }
    else field += ch;
  }
  if (field || row.length) { push(); rows.push(row.map(value => value.trim() || null)); }
  return rows;
}

export async function readGrid(bytes: Uint8Array, format: "xlsx" | "csv"): Promise<GridResult> {
  if (format === "csv") {
    const { text, encoding } = decodeCsv(bytes);
    return { ok: true, encoding, sheets: [{ name: "CSV", rows: parseCsv(text), mergedFilled: 0, mergeRanges: 0 }] };
  }
  const parsed = await readSpreadsheetSafely(bytes, "xlsx");
  if (!parsed.ok) return { ok: false, code: parsed.code };
  return { ok: true, encoding: "xlsx", sheets: parsed.workbook.worksheets.map(sheetFromWorksheet) };
}
