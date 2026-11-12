// Q-10 (c): a project's bill of quantities from an Excel/CSV file — item code, description, unit, quantity and unit rate per row.
// A pure reader: rows in, items and every refusal (with its row and value) out. Nothing here touches the database.
import { readSpreadsheetSafely, worksheetToRows } from "./excelWorkbook";

export type BoqFileItem = { rowNumber: number; code: string; description: string; unitOfMeasure: string; quantity: number; unitRate: number; totalAmount: number };
export type BoqIssue = { rowNumber: number; code: "BOQ_CODE_MISSING" | "BOQ_CODE_TOO_LONG" | "BOQ_DESCRIPTION_MISSING" | "BOQ_UNIT_INVALID" | "BOQ_QUANTITY_INVALID" | "BOQ_RATE_INVALID" | "BOQ_CODE_REPEATED"; value?: string };
export type BoqAnalysis = { items: BoqFileItem[]; issues: BoqIssue[]; totalAmount: number; fileError: string | null };

export const BOQ_HEADERS = {
  code: ["item no.", "item no", "item code", "code", "رقم البند", "الرمز", "آئٹم نمبر"],
  description: ["description", "وصف البند", "الوصف", "تفصیل"],
  unitOfMeasure: ["unit", "uom", "الوحدة", "اکائی"],
  quantity: ["quantity", "qty", "الكمية", "مقدار"],
  unitRate: ["rate", "unit rate", "unit price", "سعر الوحدة", "الفئة", "شرح"],
} as const;
export const MAX_BOQ_ROWS = 5000;

const normalize = (value: string) => value.trim().toLowerCase();
const text = (value: unknown) => String(value ?? "").trim();
const amount = (value: unknown) => { const raw = text(value).replace(/,/g, ""); const n = Number(raw); return raw !== "" && Number.isFinite(n) && n >= 0 && n < 1e13 ? n : null; };

export function analyzeBoqRows(rows: Array<Record<string, unknown>>, headers: string[]): BoqAnalysis {
  const columns = Object.fromEntries(Object.entries(BOQ_HEADERS).map(([key, aliases]) => [key, headers.find(header => (aliases as readonly string[]).includes(normalize(header)))])) as Record<keyof typeof BOQ_HEADERS, string | undefined>;
  if (Object.values(columns).some(column => !column)) return { items: [], issues: [], totalAmount: 0, fileError: "BOQ_COLUMNS_MISSING" };
  if (rows.length > MAX_BOQ_ROWS) return { items: [], issues: [], totalAmount: 0, fileError: "BOQ_TOO_MANY_ROWS" };
  const items: BoqFileItem[] = []; const issues: BoqIssue[] = []; const seen = new Set<string>();
  rows.forEach((row, index) => {
    const rowNumber = index + 2; const code = text(row[columns.code!]); const description = text(row[columns.description!]); const unit = text(row[columns.unitOfMeasure!]);
    const quantity = amount(row[columns.quantity!]); const unitRate = amount(row[columns.unitRate!]);
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
  return { items, issues, totalAmount: Math.round(items.reduce((sum, item) => sum + item.totalAmount, 0) * 100) / 100, fileError: null };
}

export async function analyzeBoqFile(bytes: Uint8Array, format: "xlsx" | "csv"): Promise<BoqAnalysis> {
  const read = await readSpreadsheetSafely(bytes, format);
  if (!read.ok) return { items: [], issues: [], totalAmount: 0, fileError: read.code };
  const sheet = read.workbook.worksheets[0];
  if (!sheet) return { items: [], issues: [], totalAmount: 0, fileError: "BOQ_COLUMNS_MISSING" };
  const { headers, rows } = worksheetToRows(sheet, { maxRows: MAX_BOQ_ROWS + 1, maxColumns: 30 });
  return analyzeBoqRows(rows, headers);
}

/** Why a save is refused, or null: a file error, any refused row, or no item at all. */
export function boqRefusal(analysis: BoqAnalysis): string | null {
  if (analysis.fileError) return analysis.fileError;
  if (analysis.issues.length) return "BOQ_ROWS_INVALID";
  return analysis.items.length ? null : "BOQ_EMPTY";
}
