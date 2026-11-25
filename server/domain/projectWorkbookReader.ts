// Q-51 batch 2a: reading the project workbook back. The file is recognised by its hidden «_dashio» sheet (the version only); everything else — which
// sheets exist, their columns, which are keys, which are required — comes from projectWorkbookSheets(), never from the uploaded file. Each sheet gets
// a completeness line: empty, complete, or errors listed by sheet, row and field. Rows marked «مثال / Example» in column A are never read; empty rows
// are skipped. Rules (review of 19-11): a row with data whose key (each part of a composite key) is empty is an error, never skipped in silence; a key
// repeated in a sheet is an error; a required column left empty is an error. Nothing is written here: the apply step takes the clean sheets.
import ExcelJS from "exceljs";
import { FIRST_DATA_ROW, PROJECT_WORKBOOK_VERSION, projectWorkbookSheets, type WorkbookSheet } from "./projectWorkbook";

export type WorkbookError = { sheet: string; row: number; field: string; code: "WORKBOOK_KEY_MISSING" | "WORKBOOK_KEY_DUPLICATE" | "WORKBOOK_REQUIRED_MISSING" | "WORKBOOK_HEADERS_CHANGED" | "WORKBOOK_TOO_MANY_ROWS" };
/** Review of #527: the most rows a sheet may declare. A small compressed file can declare hundreds of thousands of empty formatted rows; past this the sheet
 *  is refused with its own error, before any row is walked. */
export const WORKBOOK_MAX_ROWS = 20_000;
export type WorkbookSheetReport = { key: string; status: "empty" | "complete" | "errors"; rows: Array<{ row: number; cells: Record<string, string> }>; errors: WorkbookError[] };
export type WorkbookReading = { recognised: true; sheets: WorkbookSheetReport[] } | { recognised: false; code: "WORKBOOK_NOT_RECOGNISED" };

const EXAMPLE = new Set(["مثال", "example"]);
const text = (value: ExcelJS.CellValue): string => {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    if ("result" in value) return text((value as { result: ExcelJS.CellValue }).result);
    if ("richText" in value) return (value as { richText: Array<{ text: string }> }).richText.map(part => part.text).join("");
    if ("text" in value) return String((value as { text: unknown }).text);
    return "";
  }
  return String(value).trim();
};
const normalize = (value: string) => value.trim().toLowerCase();

function findSheet(book: ExcelJS.Workbook, sheet: WorkbookSheet, index: number) {
  return book.worksheets.find(ws => [sheet.ar, sheet.en, sheet.ur].includes(ws.name)) ?? book.worksheets[index + 2];
}

function readSheet(ws: ExcelJS.Worksheet | undefined, sheet: WorkbookSheet): WorkbookSheetReport {
  if (!ws) return { key: sheet.key, status: "empty", rows: [], errors: [] };
  // the two header rows must still be the workbook's own (Arabic and English): a sheet whose columns were moved or renamed is refused, not guessed
  const ar = sheet.columns.map((_, index) => normalize(text(ws.getCell(1, index + 2).value)));
  const en = sheet.columns.map((_, index) => normalize(text(ws.getCell(2, index + 2).value)));
  const changed = sheet.columns.findIndex((column, index) => ar[index] !== normalize(column.ar) && en[index] !== normalize(column.en));
  if (changed >= 0) return { key: sheet.key, status: "errors", rows: [], errors: [{ sheet: sheet.key, row: 1, field: sheet.columns[changed].key, code: "WORKBOOK_HEADERS_CHANGED" }] };
  if (ws.rowCount - (FIRST_DATA_ROW - 3) > WORKBOOK_MAX_ROWS) return { key: sheet.key, status: "errors", rows: [], errors: [{ sheet: sheet.key, row: ws.rowCount, field: "", code: "WORKBOOK_TOO_MANY_ROWS" }] };
  const rows: WorkbookSheetReport["rows"] = []; const errors: WorkbookError[] = []; const seen = new Map<string, number>();
  for (let row = FIRST_DATA_ROW - 2; row <= ws.rowCount; row++) {
    if (EXAMPLE.has(normalize(text(ws.getCell(row, 1).value)))) continue;
    const cells = Object.fromEntries(sheet.columns.map((column, index) => [column.key, text(ws.getCell(row, index + 2).value)]));
    if (!Object.values(cells).some(Boolean)) continue;
    const before = errors.length;
    for (const key of sheet.keys) if (!cells[key]) errors.push({ sheet: sheet.key, row, field: key, code: "WORKBOOK_KEY_MISSING" });
    for (const column of sheet.columns) if (column.required && !sheet.keys.includes(column.key) && !cells[column.key]) errors.push({ sheet: sheet.key, row, field: column.key, code: "WORKBOOK_REQUIRED_MISSING" });
    if (errors.length === before) {
      const identity = sheet.keys.map(key => normalize(cells[key])).join("\u0000");
      const first = seen.get(identity);
      if (first !== undefined) errors.push({ sheet: sheet.key, row, field: sheet.keys.join("+"), code: "WORKBOOK_KEY_DUPLICATE" }); else seen.set(identity, row);
    }
    rows.push({ row, cells });
  }
  return { key: sheet.key, status: errors.length ? "errors" : rows.length ? "complete" : "empty", rows, errors };
}

/** Reads an uploaded workbook: recognised by its version, then every sheet checked against Dashio's own tables. Writes nothing. */
export async function readProjectWorkbook(bytes: Uint8Array): Promise<WorkbookReading> {
  const book = new ExcelJS.Workbook();
  try { await book.xlsx.load(bytes as unknown as ArrayBuffer); } catch { return { recognised: false, code: "WORKBOOK_NOT_RECOGNISED" }; }
  if (text(book.getWorksheet("_dashio")?.getCell("A1").value ?? null) !== PROJECT_WORKBOOK_VERSION) return { recognised: false, code: "WORKBOOK_NOT_RECOGNISED" };
  return { recognised: true, sheets: projectWorkbookSheets().map((sheet, index) => readSheet(findSheet(book, sheet, index), sheet)) };
}
