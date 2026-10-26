import { normalizeHeader, scoreHeader, DICTIONARY, type Concept } from "./dictionary";
import { parseDate } from "./dates";
import { parseNumber } from "./numbers";
import { isUnitText } from "./units";
import type { Cell, SheetGrid } from "./sheetReader";

// From a raw grid to a TABLE: where the header row is (a logo, a title and blank lines may sit above it; a two-line header is joined), which lines are data, and which are headings, totals,
// repeated page headers or blanks — those are skipped and COUNTED, so the preview can say what was left out.
export type DataRow = { rowNumber: number; cells: Cell[] };
export type SkippedRow = { rowNumber: number; reason: "blank" | "section" | "total" | "repeatedHeader" };
export type Table = { sheet: string; headerRow: number; headers: string[]; width: number; dataRows: DataRow[]; skipped: SkippedRow[]; titleLines: string[]; mergedFilled: number };

const text = (cell: Cell): string => (cell === null ? "" : cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell).trim());
const isFilled = (cell: Cell) => text(cell) !== "";
const TOTAL_WORDS = /^(?:ال)?(?:مجموع|اجمالي|إجمالي|جمله|جملة|المجموع الكلي|اجمالي الباب|اجمالي القسم|المبلغ الاجمالي|استقطاع|خصم|ضريبه|ضريبة|صافي|مستحق|دفعه)|^(?:sub ?total|grand total|total|totals|sum|retention|vat|net|deduction|advance)\b/i;
const ALL_CONCEPTS = Object.keys(DICTIONARY) as Concept[];

const looksLikeData = (cell: Cell) => cell instanceof Date || typeof cell === "number" || parseNumber(cell) !== null || parseDate(cell) !== null;

/** How header-like a row is: dictionary hits count most, text cells next; numbers and dates count against it. */
function headerScore(cells: Cell[]): { score: number; hits: number; filled: number } {
  let score = 0; let hits = 0; let filled = 0;
  for (const cell of cells) {
    if (!isFilled(cell)) continue;
    filled += 1;
    if (looksLikeData(cell) && typeof cell !== "string") { score -= 2; continue; }
    if (typeof cell === "string" && looksLikeData(cell) && !/[A-Za-z؀-ۿ]{3,}/.test(cell)) { score -= 2; continue; }
    const best = Math.max(...ALL_CONCEPTS.map(concept => scoreHeader(text(cell), concept)));
    if (best >= 0.7) { hits += 1; score += 3; } else score += 1;
  }
  return { score: filled < 2 ? -1 : score, hits, filled };
}

export function tabulate(grid: SheetGrid): Table | null {
  const rows = grid.rows;
  let best = { index: -1, score: 0 };
  for (let r = 0; r < Math.min(rows.length, 60); r++) {
    const { score, filled } = headerScore(rows[r]);
    if (filled < 2 || score <= 0) continue;
    // a header is followed by data: at least two of the next five lines have several filled cells
    const following = rows.slice(r + 1, r + 6).filter(next => next.filter(isFilled).length >= Math.min(2, filled)).length;
    if (following < 2) continue;
    if (score > best.score) best = { index: r, score };
  }
  if (best.index < 0) return null;
  let headerIndex = best.index;
  let headers = rows[headerIndex].map(text);
  // a second header line under the first ("Contract" over "Qty" / "Rate"): joined when it is made of words that name columns
  const next = rows[headerIndex + 1];
  if (next) {
    const nextScore = headerScore(next);
    const nextWords = next.filter(cell => isFilled(cell) && typeof cell === "string" && !looksLikeData(cell)).length;
    if (nextScore.hits >= 2 && nextWords >= Math.max(2, nextScore.filled - 1) && headerScore(rows[headerIndex + 2] ?? []).hits === 0) {
      let group = "";
      headers = headers.map((top, column) => { if (top) group = top; const sub = text(next[column]); return top && !sub ? top : [sub ? group : "", sub].filter(Boolean).join(" ") || group; });
      headerIndex += 1;
    }
  }
  const width = headers.reduce((last, header, index) => (header ? index + 1 : last), 0);
  const trimmedHeaders = headers.slice(0, width);
  const normalizedHeaders = trimmedHeaders.map(normalizeHeader);
  const dataRows: DataRow[] = []; const skipped: SkippedRow[] = [];
  for (let r = headerIndex + 1; r < rows.length; r++) {
    const cells = rows[r].slice(0, width);
    const filledCount = cells.filter(isFilled).length;
    const rowNumber = r + 1;
    if (filledCount === 0) { skipped.push({ rowNumber, reason: "blank" }); continue; }
    const same = cells.filter((cell, index) => isFilled(cell) && normalizeHeader(text(cell)) === normalizedHeaders[index]).length;
    if (same >= Math.max(2, Math.ceil(filledCount * 0.6))) { skipped.push({ rowNumber, reason: "repeatedHeader" }); continue; }
    const wordCells = cells.filter(cell => isFilled(cell) && typeof cell === "string");
    const hasNumber = cells.some(cell => (typeof cell === "number" && cell !== 0) || (typeof cell === "string" && parseNumber(cell) !== null && !/[A-Za-z؀-ۿ]{2,}/.test(cell)));
    if (wordCells.some(cell => TOTAL_WORDS.test(normalizeHeader(text(cell)).replace(/^ال/, "")) || TOTAL_WORDS.test(text(cell))) && (hasNumber || filledCount <= 3)) { skipped.push({ rowNumber, reason: "total" }); continue; }
    if (filledCount <= 2 && width >= 4 && !hasNumber) { skipped.push({ rowNumber, reason: "section" }); continue; }
    dataRows.push({ rowNumber, cells });
  }
  const titleLines = rows.slice(0, best.index).flatMap(row => row.filter(isFilled).map(text)).slice(0, 12);
  return { sheet: grid.name, headerRow: best.index + 1, headers: trimmedHeaders, width, dataRows, skipped, titleLines, mergedFilled: grid.mergedFilled };
}

export type ColumnProfile = { filled: number; numeric: number; date: number; unit: number; short: number; avgLength: number; distinct: number; percentLike: number; serialLike: number };
export function profileColumn(values: Cell[]): ColumnProfile {
  const filled = values.filter(isFilled);
  const n = filled.length || 1;
  let numeric = 0; let date = 0; let unit = 0; let short = 0; let length = 0; let percentLike = 0; let serialLike = 0;
  for (const value of filled) {
    const str = text(value); length += str.length;
    if (str.length <= 24 && !/\s{2,}/.test(str)) short += 1;
    if (value instanceof Date || (typeof value === "string" && parseDate(value) !== null)) date += 1;
    else if (typeof value === "number" && value >= 30000 && value <= 60000) { serialLike += 1; numeric += 1; }
    else if (parseNumber(value) !== null) { numeric += 1; const parsed = parseNumber(value)!; if (parsed.percent) percentLike += 1; }
    if (typeof value === "string" && isUnitText(value)) unit += 1;
  }
  return { filled: filled.length, numeric: numeric / n, date: date / n, unit: unit / n, short: short / n, avgLength: length / n, distinct: new Set(filled.map(text)).size / n, percentLike: percentLike / n, serialLike: serialLike / n };
}
