// Q-10 (d): the planned labour histogram of a project — workers planned per month, optionally per trade. A pure reader: rows in, rows and refusals out.
//   - Month: a real date or "YYYY-MM" (the 1st is stored). Trade: optional text (empty = all trades). Workers: a whole number from 0.
//   - The same month and trade twice is refused. The histogram is the sum of workers per month.
import { readSpreadsheetSafely, worksheetToRows } from "./excelWorkbook";
import { monthOf } from "./plannedCashFlow";

export type LabourRow = { month: string; trade: string; workers: number };
export type LabourIssue = { rowNumber: number; code: "LABOUR_MONTH_INVALID" | "LABOUR_WORKERS_INVALID" | "LABOUR_TRADE_TOO_LONG" | "LABOUR_ROW_REPEATED"; value?: string };
export type LabourAnalysis = { rows: LabourRow[]; issues: LabourIssue[]; histogram: Array<{ month: string; workers: number }>; peak: number; fileError: string | null };

export const LABOUR_HEADERS = { month: ["month", "الشهر", "مہینہ"], trade: ["trade", "المهنة", "التخصص", "پیشہ"], workers: ["workers", "headcount", "العمالة", "عدد العمال", "مزدور"] } as const;
export const MAX_LABOUR_ROWS = 3000;
const normalize = (value: string) => value.trim().toLowerCase();

/** Workers per month, ascending; months with no row are not invented. */
export function labourHistogram(rows: LabourRow[]) {
  const byMonth = new Map<string, number>();
  for (const row of rows) byMonth.set(row.month, (byMonth.get(row.month) ?? 0) + row.workers);
  return Array.from(byMonth, ([month, workers]) => ({ month, workers })).sort((a, b) => a.month.localeCompare(b.month));
}

export function analyzeLabourRows(input: Array<Record<string, unknown>>, headers: string[]): LabourAnalysis {
  const find = (aliases: readonly string[]) => headers.find(header => aliases.includes(normalize(header)));
  const monthHeader = find(LABOUR_HEADERS.month); const tradeHeader = find(LABOUR_HEADERS.trade); const workersHeader = find(LABOUR_HEADERS.workers);
  const empty = { rows: [], issues: [], histogram: [], peak: 0 };
  if (!monthHeader || !workersHeader) return { ...empty, fileError: "LABOUR_COLUMNS_MISSING" };
  if (input.length > MAX_LABOUR_ROWS) return { ...empty, fileError: "LABOUR_TOO_MANY_ROWS" };
  const rows: LabourRow[] = []; const issues: LabourIssue[] = []; const seen = new Set<string>();
  input.forEach((row, index) => {
    const rowNumber = index + 2; const month = monthOf(row[monthHeader]); const trade = tradeHeader ? String(row[tradeHeader] ?? "").trim() : "";
    const raw = String(row[workersHeader] ?? "").trim().replace(/,/g, ""); const workers = Number(raw);
    if (!month) return void issues.push({ rowNumber, code: "LABOUR_MONTH_INVALID", value: String(row[monthHeader] ?? "") });
    if (raw === "" || !Number.isInteger(workers) || workers < 0 || workers > 1_000_000) return void issues.push({ rowNumber, code: "LABOUR_WORKERS_INVALID", value: raw });
    if (trade.length > 80) return void issues.push({ rowNumber, code: "LABOUR_TRADE_TOO_LONG", value: trade.slice(0, 40) });
    const key = `${month}|${trade.toLowerCase()}`;
    if (seen.has(key)) return void issues.push({ rowNumber, code: "LABOUR_ROW_REPEATED", value: `${month.slice(0, 7)} ${trade}`.trim() });
    seen.add(key); rows.push({ month, trade, workers });
  });
  const histogram = labourHistogram(rows);
  return { rows, issues, histogram, peak: histogram.reduce((max, point) => Math.max(max, point.workers), 0), fileError: null };
}

export async function analyzeLabourFile(bytes: Uint8Array, format: "xlsx" | "csv"): Promise<LabourAnalysis> {
  const read = await readSpreadsheetSafely(bytes, format);
  if (!read.ok) return { rows: [], issues: [], histogram: [], peak: 0, fileError: read.code };
  const sheet = read.workbook.worksheets[0];
  if (!sheet) return { rows: [], issues: [], histogram: [], peak: 0, fileError: "LABOUR_COLUMNS_MISSING" };
  const { headers, rows } = worksheetToRows(sheet, { maxRows: MAX_LABOUR_ROWS + 1, maxColumns: 20 });
  return analyzeLabourRows(rows, headers);
}

export function labourRefusal(analysis: LabourAnalysis): string | null {
  if (analysis.fileError) return analysis.fileError;
  if (analysis.issues.length) return "LABOUR_ROWS_INVALID";
  return analysis.rows.length ? null : "LABOUR_EMPTY";
}
