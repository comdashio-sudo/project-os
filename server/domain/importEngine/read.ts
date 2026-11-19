/**
 * Q-50 (docs/proposals/universal-import.md, layer 1, batch 1): the one tolerant reader every tabular import goes through. It moves what PMC learned in
 * Q-31/Q-48 out of pmcImport.ts so that other kinds read a file the same way:
 *  - the header row is not assumed to be row 1: a title, a logo or a project value above the table is common, so the first of the top rows that names every
 *    required field is taken, and when none does, the row that names the most (the earliest on a tie), so a person can still map that row's columns;
 *  - a workbook may carry other sheets (notes, a cover): hidden sheets are skipped, the one sheet whose header is complete is read, and two complete sheets
 *    are refused as ambiguous rather than one being picked silently.
 * What a "field" is and how a header names it stays with each kind (it passes `evaluate`); this module only reads and chooses. Nothing is written here.
 */
import type ExcelJS from "exceljs";
import { worksheetToRows, type SpreadsheetLimits } from "../excelWorkbook";

/** How many top rows are searched for the header row. */
export const HEADER_SEARCH_ROWS = 10;

/**
 * What a kind reports about one candidate header row: how many of its fields that row names, and whether every required field is named. `closeness`
 * (optional, higher is closer) ranks incomplete sheets against each other when none is complete; it defaults to `found`. PMC passes minus the count of
 * missing required fields, which is how it has always ranked sheets.
 */
export type HeaderEvaluation = { found: number; complete: boolean; closeness?: number };

export type HeaderCandidate<E extends HeaderEvaluation> = { row: number; headers: string[]; baseHeaders: string[]; evaluation: E };

export type TableRows = { headers: string[]; baseHeaders: string[]; rows: Record<string, unknown>[] };

/** Visible sheets only: a hidden or very hidden sheet is a workbook's own working area, never the table a person meant to import. */
export function visibleSheets(workbook: ExcelJS.Workbook): ExcelJS.Worksheet[] {
  return workbook.worksheets.filter(sheet => sheet.state !== "hidden" && sheet.state !== "veryHidden");
}

/**
 * The header row of one sheet. `evaluate` receives the table as it reads with that row as the header (headers made unique, empty ones named by their
 * column letter) and says how many fields it found and whether every required one is there. The first complete row wins; otherwise the row that found the
 * most, the earliest on a tie. Row 1 is the answer only when nothing better exists.
 */
export function findHeaderRow<E extends HeaderEvaluation>(sheet: ExcelJS.Worksheet, evaluate: (table: TableRows) => E, limits: SpreadsheetLimits): HeaderCandidate<E> {
  let best: HeaderCandidate<E> | undefined;
  const last = Math.min(HEADER_SEARCH_ROWS, Math.max(sheet.rowCount, 1));
  for (let row = 1; row <= last; row += 1) {
    const { headers, baseHeaders, rows } = worksheetToRows(sheet, limits, row, { uniqueHeaders: true });
    const evaluation = evaluate({ headers, baseHeaders, rows });
    const candidate = { row, headers, baseHeaders, evaluation };
    if (evaluation.complete) return candidate;
    if (!best || evaluation.found > best.evaluation.found) best = candidate;
  }
  return best!;
}

export type SheetChoice<E extends HeaderEvaluation> =
  | { ok: true; sheet: ExcelJS.Worksheet; candidate: HeaderCandidate<E> }
  | { ok: false; code: "IMPORT_EMPTY_WORKBOOK" | "IMPORT_SHEET_AMBIGUOUS"; detail?: string };

/**
 * The sheet to read: the one whose header row is complete. Two complete sheets are refused (IMPORT_SHEET_AMBIGUOUS, naming them) because either could be
 * meant. With no complete sheet, the one closest to complete is returned, so its missing columns are reported against the table the person meant.
 */
export function chooseSheet<E extends HeaderEvaluation>(workbook: ExcelJS.Workbook, evaluate: (table: TableRows) => E, limits: SpreadsheetLimits): SheetChoice<E> {
  const sheets = visibleSheets(workbook);
  if (sheets.length === 0) return { ok: false, code: "IMPORT_EMPTY_WORKBOOK" };
  const found = sheets.map(sheet => ({ sheet, candidate: findHeaderRow(sheet, evaluate, limits) }));
  const complete = found.filter(item => item.candidate.evaluation.complete);
  if (complete.length > 1) return { ok: false, code: "IMPORT_SHEET_AMBIGUOUS", detail: complete.map(item => item.sheet.name).join(" | ") };
  const closeness = (item: (typeof found)[number]) => item.candidate.evaluation.closeness ?? item.candidate.evaluation.found;
  const chosen = complete[0] ?? found.reduce((a, b) => (closeness(b) > closeness(a) ? b : a));
  return { ok: true, ...chosen };
}
