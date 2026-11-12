// D-44 (b): the site's unit TRACKER — one row per villa (serial | phase | block | villa number | model) and one column per activity holding its state in words
// («Completed», «On going», empty). Recognised by its STRUCTURE, like the unit-completion matrix (matrix.ts), but it carries no weights, so it never builds a catalogue:
// its columns are matched by name to the activities the project already has. Nothing here writes. Vertical merges (a phase or block written once beside many villas)
// are already filled by the reader (sheetReader.ts) before this sees the sheet.
import { parseNumber } from "./numbers";
import type { Cell, SheetGrid } from "./sheetReader";
import { villaLabelOf } from "./matrix";

export type TrackerStatus = "COMPLETE" | "IN_PROGRESS";
export type TrackerUnit = { row: number; serial: number; stage: string; block: string; villaLabel: string | null; modelCode: string; statuses: Array<TrackerStatus | null> };
export type TrackerModel = {
  sheet: string; headerRow: number; mergedFilled: number;
  activities: Array<{ column: number; name: string }>;
  units: TrackerUnit[];
  /** a status the importer does not understand: reported with its row and column, never guessed */
  unknownCells: Array<{ row: number; column: number; value: string }>;
};
export type TrackerIssue = { code: string; detail?: string; row?: number };

const text = (cell: Cell | undefined) => (cell === null || cell === undefined ? "" : cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell).trim());
export const normName = (value: string) => value.toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/[\s_-]+/g, " ").trim();
const STATUS: Record<string, TrackerStatus> = {
  completed: "COMPLETE", complete: "COMPLETE", done: "COMPLETE", "مكتمل": "COMPLETE", "منجز": "COMPLETE",
  "on going": "IN_PROGRESS", ongoing: "IN_PROGRESS", "in progress": "IN_PROGRESS", "جاري": "IN_PROGRESS", "قيد التنفيذ": "IN_PROGRESS",
};
export const trackerStatusOf = (cell: Cell | undefined): TrackerStatus | null | undefined => { const value = normName(text(cell)); return value === "" ? null : STATUS[value]; };

// the header words of the five identity columns, compared after the same normalisation as the cell (hamza, ta marbuta, case, spaces)
const IDENTITY: Array<{ key: "serial" | "stage" | "block" | "villa" | "model"; words: string[] }> = [
  { key: "villa", words: ["رقم الفيلا", "الفيلا", "فيلا", "villa", "villa no", "villa no.", "villa number"] }, { key: "serial", words: ["م", "رقم تسلسلي", "التسلسل", "مسلسل", "s no", "s no.", "sno", "serial", "#"] },
  { key: "stage", words: ["المرحلة", "phase", "stage"] }, { key: "block", words: ["البلوك", "block"] }, { key: "model", words: ["النموذج", "model", "type"] },
].map(item => ({ key: item.key as "serial" | "stage" | "block" | "villa" | "model", words: item.words.map(normName) }));

/** Looks for the tracker shape. `ok: false` carries the reason. A tracker is never a matrix: it has no weights row (matrix.ts is tried first). */
export function detectTracker(grid: SheetGrid): { ok: true; model: TrackerModel } | { ok: false; reason: string } {
  const rows = grid.rows;
  let headerRow = -1; let found = new Map<string, number>();
  for (let r = 0; r < Math.min(10, rows.length); r++) {
    const here = new Map<string, number>();
    rows[r].forEach((cell, c) => { const label = normName(text(cell)); for (const item of IDENTITY) if (!here.has(item.key) && item.words.includes(label)) { here.set(item.key, c); break; } });
    if (["stage", "block", "villa", "model"].every(key => here.has(key))) { headerRow = r; found = here; break; }
  }
  if (headerRow < 0) return { ok: false, reason: "NO_TRACKER_HEADER" };
  const lastIdentity = Math.max(...Array.from(found.values()));
  const activities = rows[headerRow].flatMap((cell, c) => (c > lastIdentity && text(cell) ? [{ column: c + 1, name: text(cell) }] : []));
  if (activities.length < 3) return { ok: false, reason: "TOO_FEW_ACTIVITIES" };
  const at = (row: Cell[], key: string) => text(row[found.get(key) ?? -1]);
  const units: TrackerUnit[] = []; const unknownCells: TrackerModel["unknownCells"] = [];
  let recognised = 0; let filled = 0;
  for (let r = headerRow + 1; r < rows.length; r++) {
    const row = rows[r];
    if (!at(row, "model") && !at(row, "villa")) { if (row.every(cell => !text(cell))) continue; break; }
    const statuses = activities.map(activity => {
      const status = trackerStatusOf(row[activity.column - 1]);
      if (status === undefined) { unknownCells.push({ row: r + 1, column: activity.column, value: text(row[activity.column - 1]).slice(0, 40) }); filled += 1; return null; }
      if (status) { recognised += 1; filled += 1; }
      return status;
    });
    const serial = parseNumber(row[found.get("serial") ?? -1])?.value ?? NaN;
    units.push({ row: r + 1, serial: Number.isFinite(serial) ? Math.round(serial) : NaN, stage: at(row, "stage"), block: at(row, "block"), villaLabel: villaLabelOf(at(row, "villa"), ""), modelCode: at(row, "model"), statuses });
  }
  // one villa is enough: the four identity headers, three activity columns and statuses in words already make the shape (a floor of five sent a small tracker to the table reader)
  if (units.length < 1) return { ok: false, reason: "TOO_FEW_UNITS" };
  if (!recognised || recognised < filled * 0.9) return { ok: false, reason: "STATUS_CELLS_NOT_RECOGNISED" };
  return { ok: true, model: { sheet: grid.name, headerRow: headerRow + 1, mergedFilled: grid.mergedFilled, activities, units, unknownCells } };
}

/** What must be true before anything is written: one row per villa and per serial, a full location, and only statuses that are understood. */
export function validateTracker(model: TrackerModel): TrackerIssue[] {
  const issues: TrackerIssue[] = [];
  const villas = new Set<string>(); const serials = new Set<number>();
  for (const unit of model.units) {
    if (!unit.villaLabel) issues.push({ code: "TRACKER_VILLA_MISSING", row: unit.row });
    else if (villas.has(unit.villaLabel)) issues.push({ code: "TRACKER_VILLA_DUPLICATE", row: unit.row, detail: unit.villaLabel });
    else villas.add(unit.villaLabel);
    if (!Number.isFinite(unit.serial)) issues.push({ code: "MATRIX_UNIT_SERIAL_MISSING", row: unit.row });
    else if (serials.has(unit.serial)) issues.push({ code: "MATRIX_UNIT_SERIAL_DUPLICATE", row: unit.row, detail: String(unit.serial) });
    else serials.add(unit.serial);
    if (!unit.stage || !unit.block || !unit.modelCode) issues.push({ code: "MATRIX_UNIT_LOCATION_MISSING", row: unit.row });
  }
  for (const cell of model.unknownCells) issues.push({ code: "TRACKER_STATUS_UNKNOWN", row: cell.row, detail: `${model.activities.find(a => a.column === cell.column)?.name ?? cell.column}: ${cell.value}` });
  return issues;
}
