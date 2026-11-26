// Q-60 batch 1 (the owner's weights file, 26-11): the precise sheet is «by model» — two title rows, then the headers in row 4:
//   م | الرمز | البند | نوع الاستلام | «نموذج A-End» … «نموذج D»  (one column per villa model)
// then a «total per villa» line, then phase lines («المرحلة 1 – الأعمال التحتية») with their sums, then group lines (code Q01…, no serial) whose weight
// is the sum of their items, then the items (a serial and a code IP-001…). Weights are fractions of 1 per model, and «–» means the item is not in that model.
// The PMC weights reader takes one weight column (and an optional model column), so this file was refused (no «weight» column) — and if read as rows its
// group lines would count as activities and double each total. Here a wide sheet is turned into the long table the reader already knows: one row per
// item × model, with its group (the Q line above it) and its stage (the phase line above it); totals, phase and group lines are kept aside, never as
// activities. The row numbers of the original file are kept, so every refusal names the row the owner sees. Pure: the caller hands the workbook.
import ExcelJS from "exceljs";
import { cellText } from "./excelWorkbook";

/** «نموذج A-End», «Model C+», «Type B» → the model code (A-End, C+, B). */
const MODEL_HEADER = /^(?:نموذج|النموذج|model|type)\s*[:\-–]?\s*(\S.*)$/i;
const SERIAL = new Set(["م", "#", "no", "no.", "serial", "seq", "الرقم", "ت", "مسلسل"]);
const CODE = new Set(["الرمز", "رمز", "code", "item code", "رمز البند", "activity code", "رمز النشاط"]);
const NAME = new Set(["البند", "item", "description", "activity", "activity name", "النشاط", "اسم البند", "اسم النشاط", "الوصف"]);
const GROUP_CODE = /^Q\s*\d+/i;
const TOTAL = /المجموع|الإجمالي|^total\b|^grand total\b/i;
const ABSENT = /^[–—\-]+$/;
const key = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

export type WideWeights = {
  bytes: Uint8Array;
  /** the row of the long table → the row of the owner's file */
  rowMap: Map<number, number>;
  sheetName: string;
  models: string[];
  groups: number;
  phases: number;
  /** each model's own total line in the file, with the row it is on (compared with the sum read, never used as data) */
  totals: Array<{ row: number; model: string; value: string }>;
};

/** The first sheet (with the most model columns) whose header row names two or more models; null when the file is not wide. */
export async function unpivotWideWeights(workbook: ExcelJS.Workbook): Promise<WideWeights | null> {
  type Found = { sheet: ExcelJS.Worksheet; headerRow: number; serial: number; code: number; name: number; models: Array<{ column: number; code: string }> };
  let best: Found | null = null;
  for (const sheet of workbook.worksheets) {
    for (let rowNumber = 1; rowNumber <= Math.min(sheet.rowCount, 15); rowNumber += 1) {
      const row = sheet.getRow(rowNumber);
      const cells: Array<{ column: number; text: string }> = [];
      row.eachCell({ includeEmpty: false }, (cell, column) => cells.push({ column, text: cellText(cell).trim() }));
      const models = cells.flatMap(cell => { const match = MODEL_HEADER.exec(cell.text); return match ? [{ column: cell.column, code: match[1].trim() }] : []; });
      if (models.length < 2) continue;
      const find = (names: Set<string>) => cells.find(cell => names.has(key(cell.text)))?.column ?? 0;
      const found: Found = { sheet, headerRow: rowNumber, serial: find(SERIAL), code: find(CODE), name: find(NAME), models };
      if (found.name && (!best || found.models.length > best.models.length)) best = found;
      break;
    }
  }
  if (!best) return null;
  const { sheet, headerRow, serial, code, name, models } = best;
  const out = new ExcelJS.Workbook(); const long = out.addWorksheet("weights");
  long.addRow(["CSI section", "Sub item", "Activity code", "Activity name", "Weight", "Model"]);
  const rowMap = new Map<number, number>();
  const totals: WideWeights["totals"] = [];
  let group = ""; let phase = ""; let groups = 0; let phases = 0;
  for (let rowNumber = headerRow + 1; rowNumber <= sheet.rowCount; rowNumber += 1) {
    const row = sheet.getRow(rowNumber);
    const read = (column: number) => (column ? cellText(row.getCell(column)).trim() : "");
    const serialText = read(serial); const codeText = read(code); const nameText = read(name);
    if (!serialText && !codeText && !nameText) continue;
    if (TOTAL.test(nameText) || TOTAL.test(codeText)) {
      for (const model of models) { const value = read(model.column); if (value && !ABSENT.test(value)) totals.push({ row: rowNumber, model: model.code, value }); }
      continue;
    }
    // a group line: a code Q01… and no serial — the group of the items under it (its weight is their sum, so it is not an activity)
    if (!serialText && GROUP_CODE.test(codeText)) { group = `${codeText} ${nameText}`.trim(); groups += 1; continue; }
    // a phase line: no serial and no code — the stage of the groups under it
    if (!serialText && !codeText) { phase = nameText; phases += 1; continue; }
    for (const model of models) {
      const value = read(model.column);
      if (!value || ABSENT.test(value)) continue; // «–»: the item is not in this model
      long.addRow([group, phase, codeText, nameText, value, model.code]);
      rowMap.set(long.rowCount, rowNumber);
    }
  }
  return { bytes: new Uint8Array(await out.xlsx.writeBuffer()), rowMap, sheetName: sheet.name, models: models.map(model => model.code), groups, phases, totals };
}
