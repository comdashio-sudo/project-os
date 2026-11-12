// Q-10 (b): the planned cash flow of a project — the share of the contract planned for each month. One row per month; the shares total 100%.
// A pure reader: the file's rows in, the months (as fractions, like pmc_plan_months stores them) and every refusal out. Nothing here touches the database.
//   - Month: a real date or a "YYYY-MM" text; only the month counts (the 1st is stored).
//   - Share: "5%", 5 (read as percent) or 0.05 (read as a fraction) — a file of fractions is recognised by its total (≈ 1), never row by row.
//   - The total must be 100% within 0.01 percentage point; otherwise the save is refused and the difference is named.
import { readSpreadsheetSafely, worksheetToRows } from "./excelWorkbook";

export type CashFlowMonth = { month: string; fraction: number; cumulative: number };
export type CashFlowIssue = { rowNumber: number; code: "CASHFLOW_MONTH_INVALID" | "CASHFLOW_PERCENT_INVALID" | "CASHFLOW_MONTH_REPEATED"; value?: string };
export type CashFlowAnalysis = { months: CashFlowMonth[]; issues: CashFlowIssue[]; totalPercent: number; fileError: string | null };

export const CASHFLOW_HEADERS = { month: ["month", "الشهر", "مہینہ"], percent: ["percent", "planned %", "%", "النسبة", "النسبة المخططة", "فیصد"] } as const;
export const MAX_CASHFLOW_MONTHS = 240;
const TOLERANCE = 0.01; // percentage points

const normalize = (value: string) => value.trim().toLowerCase();
const pad = (n: number) => String(n).padStart(2, "0");

function monthOf(value: unknown): string | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-01`;
  const text = String(value ?? "").trim();
  const match = /^(\d{4})[-/](\d{1,2})(?:[-/](\d{1,2}))?/.exec(text);
  if (!match) return null;
  const month = Number(match[2]);
  return month >= 1 && month <= 12 ? `${match[1]}-${pad(month)}-01` : null;
}

function shareOf(value: unknown): { amount: number; percentSign: boolean } | null {
  const text = String(value ?? "").trim().replace(/,/g, ".");
  const percentSign = text.endsWith("%");
  const amount = Number(percentSign ? text.slice(0, -1).trim() : text);
  return text !== "" && Number.isFinite(amount) && amount >= 0 ? { amount, percentSign } : null;
}

/** The rows of a sheet (header row already read) to months. Exported for the unit tests; analyzeCashFlowFile is the file path. */
export function analyzeCashFlowRows(rows: Array<Record<string, unknown>>, headers: string[]): CashFlowAnalysis {
  const find = (aliases: readonly string[]) => headers.find(header => aliases.includes(normalize(header)));
  const monthHeader = find(CASHFLOW_HEADERS.month); const percentHeader = find(CASHFLOW_HEADERS.percent);
  if (!monthHeader || !percentHeader) return { months: [], issues: [], totalPercent: 0, fileError: "CASHFLOW_COLUMNS_MISSING" };
  if (rows.length > MAX_CASHFLOW_MONTHS) return { months: [], issues: [], totalPercent: 0, fileError: "CASHFLOW_TOO_MANY_MONTHS" };
  const issues: CashFlowIssue[] = []; const read: Array<{ month: string; amount: number; percentSign: boolean }> = []; const seen = new Set<string>();
  rows.forEach((row, index) => {
    const rowNumber = index + 2; const month = monthOf(row[monthHeader]); const share = shareOf(row[percentHeader]);
    if (!month) { issues.push({ rowNumber, code: "CASHFLOW_MONTH_INVALID", value: String(row[monthHeader] ?? "") }); return; }
    if (!share) { issues.push({ rowNumber, code: "CASHFLOW_PERCENT_INVALID", value: String(row[percentHeader] ?? "") }); return; }
    if (seen.has(month)) { issues.push({ rowNumber, code: "CASHFLOW_MONTH_REPEATED", value: month.slice(0, 7) }); return; }
    seen.add(month); read.push({ month, ...share });
  });
  // fractions or percent: a file whose plain numbers add up to about 1 is a file of fractions (0.05 = 5%)
  const plainTotal = read.filter(row => !row.percentSign).reduce((sum, row) => sum + row.amount, 0);
  const signed = read.some(row => row.percentSign);
  const fractions = !signed && plainTotal > 0 && plainTotal <= 1 + TOLERANCE / 100;
  const sorted = read.map(row => ({ month: row.month, fraction: row.percentSign || !fractions ? row.amount / 100 : row.amount })).sort((a, b) => a.month.localeCompare(b.month));
  let running = 0;
  const months = sorted.map(row => { running += row.fraction; return { month: row.month, fraction: row.fraction, cumulative: running }; });
  return { months, issues, totalPercent: Math.round(running * 100 * 1e6) / 1e6, fileError: null };
}

export async function analyzeCashFlowFile(bytes: Uint8Array, format: "xlsx" | "csv"): Promise<CashFlowAnalysis> {
  const read = await readSpreadsheetSafely(bytes, format);
  if (!read.ok) return { months: [], issues: [], totalPercent: 0, fileError: read.code };
  const sheet = read.workbook.worksheets[0];
  if (!sheet) return { months: [], issues: [], totalPercent: 0, fileError: "CASHFLOW_COLUMNS_MISSING" };
  const { headers, rows } = worksheetToRows(sheet, { maxRows: MAX_CASHFLOW_MONTHS + 1, maxColumns: 20 });
  return analyzeCashFlowRows(rows, headers);
}

/** Why a save is refused, or null: a file error, any row issue, no months, or a total that is not 100%. */
export function cashFlowRefusal(analysis: CashFlowAnalysis): string | null {
  if (analysis.fileError) return analysis.fileError;
  if (analysis.issues.length) return "CASHFLOW_ROWS_INVALID";
  if (!analysis.months.length) return "CASHFLOW_EMPTY";
  return Math.abs(analysis.totalPercent - 100) > TOLERANCE ? "CASHFLOW_TOTAL_NOT_100" : null;
}
