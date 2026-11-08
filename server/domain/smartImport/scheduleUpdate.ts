// A «progress update» exported from a scheduling tool (Primavera P6's Update Activities, as .xls or .xlsx): one sheet of activities with the ACTUAL start and finish dates — the headers
// carry a star, «(*)Start» / «(*)Finish», which in that export means an actual date. Recognised by those headers, not by the sheet's name; any other sheet (P6 adds a USERDATA sheet) is ignored.
import { p6Date } from "./p6Xer";
import type { Cell, SheetGrid } from "./sheetReader";

export type ScheduleUpdateRow = { row: number; code: string; name: string; actualStart: string | null; actualFinish: string | null };
export type ScheduleUpdateModel = { sheet: string; headerRow: number; rows: ScheduleUpdateRow[]; ignoredSheets: string[]; badDates: Array<{ row: number; value: string }> };
export type ScheduleUpdateDetection = { ok: true; model: ScheduleUpdateModel } | { ok: false; reason: string };

const clean = (cell: Cell | undefined) => (cell === null || cell === undefined ? "" : cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell).trim());
const norm = (value: string) => value.toLowerCase().replace(/\s+/g, " ").trim();
const ID = /^(activity id|activityid|activity code|رمز النشاط|رقم النشاط)$/;
const NAME = /^(activity name|اسم النشاط)$/;
const START = /^(\(\*\)\s*start|\*\s*start|actual start|البداية الفعلية)$/;
const FINISH = /^(\(\*\)\s*finish|\*\s*finish|actual finish|النهاية الفعلية)$/;

/** A date written as text («19-Oct-23», «19-Oct-23 A», 2023-10-19) or already a date; blank is «no actual date». */
export function updateDate(cell: Cell | undefined): { iso: string | null; bad: boolean } {
  const text = clean(cell);
  if (!text) return { iso: null, bad: false };
  const iso = p6Date(text.replace(/\*/g, "").trim());
  return iso ? { iso: iso.slice(0, 10), bad: false } : { iso: null, bad: true };
}

export function detectScheduleUpdate(grids: SheetGrid[]): ScheduleUpdateDetection {
  for (const grid of grids) {
    for (let r = 0; r < Math.min(12, grid.rows.length); r++) {
      const cells = grid.rows[r].map(cell => norm(clean(cell)));
      const idCol = cells.findIndex(c => ID.test(c));
      if (idCol < 0) continue;
      const startCol = cells.findIndex(c => START.test(c)); const finishCol = cells.findIndex(c => FINISH.test(c)); const nameCol = cells.findIndex(c => NAME.test(c));
      if (startCol < 0 && finishCol < 0) continue;
      const rows: ScheduleUpdateRow[] = []; const badDates: ScheduleUpdateModel["badDates"] = [];
      for (let k = r + 1; k < grid.rows.length; k++) {
        const row = grid.rows[k]; const code = clean(row[idCol]);
        if (!code) continue;
        const start = updateDate(startCol >= 0 ? row[startCol] : null); const finish = updateDate(finishCol >= 0 ? row[finishCol] : null);
        if (start.bad) badDates.push({ row: k + 1, value: clean(row[startCol]) });
        if (finish.bad) badDates.push({ row: k + 1, value: clean(row[finishCol]) });
        rows.push({ row: k + 1, code, name: nameCol >= 0 ? clean(row[nameCol]) : "", actualStart: start.iso, actualFinish: finish.iso });
      }
      if (rows.length < 1) return { ok: false, reason: "NO_ACTIVITY_ROWS" };
      return { ok: true, model: { sheet: grid.name, headerRow: r + 1, rows, ignoredSheets: grids.filter(g => g.name !== grid.name).map(g => g.name), badDates } };
    }
  }
  return { ok: false, reason: "NO_UPDATE_HEADERS" };
}
