// Q-10 (c): a project's bill of quantities from an Excel/CSV file — item code, description, unit, quantity and unit rate per row.
// A pure reader: rows in, items and every refusal (with its row and value) out. Nothing here touches the database.
import { headerEvaluator, resolveColumns, type ColumnReport } from "./columnChoice";
import { readSpreadsheetSafely, worksheetToRows } from "./excelWorkbook";
import { chooseSheet } from "./importEngine/read";

export type BoqFileItem = { rowNumber: number; code: string; description: string; unitOfMeasure: string; quantity: number; unitRate: number; totalAmount: number };
export type BoqIssue = { rowNumber: number; code: "BOQ_CODE_MISSING" | "BOQ_CODE_TOO_LONG" | "BOQ_DESCRIPTION_MISSING" | "BOQ_UNIT_INVALID" | "BOQ_QUANTITY_INVALID" | "BOQ_RATE_INVALID" | "BOQ_CODE_REPEATED"; value?: string };
/** `columns`: which column each field was read from (Q-31), absent when the file could not be read at all. */
/** Q-50 (the library's priced BOQ): a row that is not an item and is left out — counted and shown in the check report, never silent. «heading»: a code and a
 *  description with no unit, no quantity and no rate (a section: «1 SUBSTRUCTURE»); «line»: no code, no unit, no quantity, no rate (a total carried to
 *  the summary, a grand total, a note). A row with only some of the unit, quantity and rate is still an error on its row. */
export type BoqLeftOut = { rowNumber: number; kind: "heading" | "line"; text: string };
export type BoqAnalysis = { items: BoqFileItem[]; issues: BoqIssue[]; totalAmount: number; fileError: string | null; fileErrorDetail?: string; columns?: ColumnReport; leftOut: BoqLeftOut[] };

export const BOQ_HEADERS = {
  code: ["item no.", "item no", "item code", "code", "رقم البند", "الرمز", "آئٹم نمبر"],
  description: ["description", "وصف البند", "الوصف", "تفصیل"],
  unitOfMeasure: ["unit", "uom", "الوحدة", "اکائی"],
  quantity: ["quantity", "qty", "الكمية", "مقدار"],
  unitRate: ["rate", "unit rate", "unit price", "سعر الوحدة", "الفئة", "شرح"],
} as const;
export const MAX_BOQ_ROWS = 5000;

const text = (value: unknown) => String(value ?? "").trim();
const amount = (value: unknown) => { const raw = text(value).replace(/,/g, ""); const n = Number(raw); return raw !== "" && Number.isFinite(n) && n >= 0 && n < 1e13 ? n : null; };

const BOQ_FIELDS = Object.entries(BOQ_HEADERS).map(([key, aliases]) => ({ key, required: true, aliases }));

/** `choice`: a person's choice of columns (Q-31, columnChoice.ts); the preview and the save carry the same one. */
export function analyzeBoqRows(rows: Array<Record<string, unknown>>, headers: string[], choice?: Record<string, string>, rowNumbers?: number[]): BoqAnalysis {
  const resolved = resolveColumns(BOQ_FIELDS, headers, choice);
  const columns = resolved.columns as Record<keyof typeof BOQ_HEADERS, string | undefined>;
  const none = { items: [], issues: [], totalAmount: 0, columns: resolved.report, leftOut: [] };
  if (resolved.invalid) return { ...none, fileError: "IMPORT_MAPPING_INVALID", fileErrorDetail: resolved.invalid };
  if (Object.values(columns).some(column => !column)) return { ...none, fileError: "BOQ_COLUMNS_MISSING" };
  if (rows.length > MAX_BOQ_ROWS) return { ...none, fileError: "BOQ_TOO_MANY_ROWS" };
  const items: BoqFileItem[] = []; const issues: BoqIssue[] = []; const leftOut: BoqLeftOut[] = []; const seen = new Set<string>();
  rows.forEach((row, index) => {
    const rowNumber = rowNumbers?.[index] ?? index + 2; const code = text(row[columns.code!]); const description = text(row[columns.description!]); const unit = text(row[columns.unitOfMeasure!]);
    const quantity = amount(row[columns.quantity!]); const unitRate = amount(row[columns.unitRate!]);
    // Q-50: a section heading or a line that is not an item (all three of unit, quantity and rate empty) is left out and reported; partly filled stays an error
    const bare = !unit && text(row[columns.quantity!]) === "" && text(row[columns.unitRate!]) === "";
    if (bare && (code || description)) return void leftOut.push({ rowNumber, kind: code ? "heading" : "line", text: [code, description].filter(Boolean).join(" ").slice(0, 120) });
    if (!code) return void issues.push({ rowNumber, code: "BOQ_CODE_MISSING" });
    if (code.length > 80) return void issues.push({ rowNumber, code: "BOQ_CODE_TOO_LONG", value: code.slice(0, 40) });
    if (!description) return void issues.push({ rowNumber, code: "BOQ_DESCRIPTION_MISSING", value: code });
    if (!unit || unit.length > 40) return void issues.push({ rowNumber, code: "BOQ_UNIT_INVALID", value: unit.slice(0, 40) });
    if (quantity === null) return void issues.push({ rowNumber, code: "BOQ_QUANTITY_INVALID", value: text(row[columns.quantity!]) });
    if (unitRate === null) return void issues.push({ rowNumber, code: "BOQ_RATE_INVALID", value: text(row[columns.unitRate!]) });
    if (seen.has(code)) return void issues.push({ rowNumber, code: "BOQ_CODE_REPEATED", value: code });
    seen.add(code);
    items.push({ rowNumber, code, description, unitOfMeasure: unit, quantity, unitRate, totalAmount: Math.round(quantity * unitRate * 100) / 100 });
  });
  return { items, issues, totalAmount: Math.round(items.reduce((sum, item) => sum + item.totalAmount, 0) * 100) / 100, fileError: null, columns: resolved.report, leftOut };
}

export async function analyzeBoqFile(bytes: Uint8Array, format: "xlsx" | "csv", choice?: Record<string, string>): Promise<BoqAnalysis> {
  const read = await readSpreadsheetSafely(bytes, format);
  if (!read.ok) return { items: [], issues: [], totalAmount: 0, fileError: read.code, leftOut: [] };
  // Q-50 (importEngine/read.ts): the sheet whose header names the required columns, and that header row (a title above the table is common); two such sheets are refused
  const picked = chooseSheet(read.workbook, headerEvaluator(BOQ_FIELDS), { maxRows: 0, maxColumns: 30 });
  if (!picked.ok) return { items: [], issues: [], totalAmount: 0, leftOut: [], fileError: picked.code === "IMPORT_EMPTY_WORKBOOK" ? "BOQ_COLUMNS_MISSING" : picked.code, ...(picked.detail ? { fileErrorDetail: picked.detail } : {}) };
  const { headers, rows, rowNumbers } = worksheetToRows(picked.sheet, { maxRows: MAX_BOQ_ROWS + 1, maxColumns: 30 }, picked.candidate.row);
  return analyzeBoqRows(rows, headers, choice, rowNumbers);
}

/** Why a save is refused, or null: a file error, any refused row, or no item at all. */
export function boqRefusal(analysis: BoqAnalysis): string | null {
  if (analysis.fileError) return analysis.fileError;
  if (analysis.issues.length) return "BOQ_ROWS_INVALID";
  return analysis.items.length ? null : "BOQ_EMPTY";
}
