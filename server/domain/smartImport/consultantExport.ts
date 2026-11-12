// Work order 22: the consultant's export (one sheet, many merged cells). Recognised by its STRUCTURE, not by position:
//   a header row naming Zone · Block · Unit · Villa Type (with Zone Ratio, Block Ratio, Cluster, Ratio beside them), then the CSI sections «name (weight%)» over the activity
//   columns; under it the sub-groups «name (weight%)», the activity, the location (Whole Building, Ground floor, First Floor, Boundary Wall, Annex) and «WIR (achieved%)»;
//   one row per villa, its cells «Ok» (received) or «-» (not received); after the villas the summary rows (Total Units, the weights, the progress) which are never units.
// Nothing here writes: it turns the sheet into a model the importer compares with what the platform holds.
import { parseDate } from "./dates";
import type { Cell, SheetGrid } from "./sheetReader";

export type ConsultantColumn = {
  index: number; column: number;
  /** what identifies the column from one weekly export to the next: its WIR, else section | activity | location */
  key: string;
  wir: string | null; section: string; sectionWeight: number | null; subgroup: string; subgroupWeight: number | null; activity: string; location: string; reportedPercent: number | null;
};
export type ConsultantUnit = { row: number; zone: string; block: string; cluster: string; unit: string; villaType: string; reportedPercent: number | null; received: boolean[] };
export type ConsultantModel = {
  sheet: string; project: string | null; client: string | null; contractor: string | null; exportDate: string | null;
  headerRow: number; columns: ConsultantColumn[]; units: ConsultantUnit[];
  /** cells that are neither «Ok» nor «-»/empty: reported, never guessed */
  unexpectedCells: Array<{ row: number; column: number; value: string }>;
  summaryRows: number; warnings: string[];
};
export type ConsultantDetection = { ok: true; model: ConsultantModel } | { ok: false; reason: string };

const text = (cell: Cell | undefined) => (cell === null || cell === undefined ? "" : cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell).trim());
const lower = (cell: Cell | undefined) => text(cell).toLowerCase().replace(/\s+/g, " ");
/** «Concrete (12.50%)» → { name: "Concrete", weight: 0.125 } */
export function nameAndPercent(value: string): { name: string; percent: number | null } {
  const match = value.match(/^(.*?)\s*\(\s*([\d.]+)\s*%\s*\)\s*$/);
  if (!match) return { name: value.trim(), percent: null };
  return { name: match[1].trim(), percent: Number(match[2]) / 100 };
}
/** The number part of a WIR, so «WIR-0105», «WIR 105» and «105» are the same request. */
export const wirNumber = (value: string | null | undefined) => { const match = (value ?? "").match(/\d+/g); return match ? String(Number(match[match.length - 1])) : null; };
const RECEIVED = /^(ok|okay|yes|y|✓|√|received)$/i;
const NOT_RECEIVED = /^(-|—|–|no|n|x|)$/i;
const SUMMARY = /^(total units|total|section weight|sections? total|activity weight|activity progress|weight|progress|sum)/i;

export function detectConsultantExport(grid: SheetGrid): ConsultantDetection {
  const rows = grid.rows;
  if (rows.length < 12) return { ok: false, reason: "TOO_SMALL" };
  // 1. the header row: Zone, Block, Unit and Villa Type in the first columns
  let header = -1; const at: Record<string, number> = {};
  for (let r = 0; r < Math.min(15, rows.length); r++) {
    const labels = rows[r].slice(0, 20).map(lower);
    const find = (test: RegExp) => labels.findIndex(label => test.test(label));
    const zone = find(/^zone$/); const block = find(/^block$/); const unit = find(/^unit$|^villa$|^villa no\.?$/); const type = find(/^villa type$|^type$/);
    if (zone >= 0 && block >= 0 && unit >= 0 && type >= 0) {
      header = r; Object.assign(at, { zone, block, unit, type, zoneRatio: find(/^zone ratio$/), blockRatio: find(/^block ratio$/), cluster: find(/^cluster$/), ratio: find(/^ratio$/) });
      break;
    }
  }
  if (header < 0) return { ok: false, reason: "NO_HEADER_ROW" };
  const identityEnd = Math.max(...Object.values(at).filter(value => value >= 0));
  const firstActivity = identityEnd + 1;
  const sub = header + 1; const act = header + 2; const loc = header + 3; const wirRow = header + 4; const firstUnit = header + 5;
  const width = Math.max(...rows.slice(header, firstUnit).map(row => row.length));
  // 2. the activity columns: a name in the activity row (sections and sub-groups are merged across them; carry the first value along)
  const carry = (rowIndex: number) => { const out: string[] = []; let last = ""; for (let c = firstActivity; c < width; c++) { const value = text(rows[rowIndex]?.[c]); if (value) last = value; out[c] = last; } return out; };
  const sections = carry(header); const subgroups = carry(sub);
  const columns: ConsultantColumn[] = [];
  const seen = new Map<string, number>();
  for (let c = firstActivity; c < width; c++) {
    const activity = text(rows[act]?.[c]);
    if (!activity) continue;
    const wirCell = nameAndPercent(text(rows[wirRow]?.[c]));
    const section = nameAndPercent(sections[c] ?? ""); const subgroup = nameAndPercent(subgroups[c] ?? "");
    const location = text(rows[loc]?.[c]);
    const wir = wirCell.name || null;
    let key = wir ? `WIR:${wirNumber(wir) ?? wir}` : `${section.name}|${activity}|${location}`.slice(0, 250);
    const repeat = seen.get(key) ?? 0; seen.set(key, repeat + 1);
    if (repeat) key = `${key}#${repeat + 1}`;
    columns.push({ index: columns.length, column: c + 1, key, wir, section: section.name, sectionWeight: section.percent, subgroup: subgroup.name, subgroupWeight: subgroup.percent, activity, location, reportedPercent: wirCell.percent });
  }
  if (columns.length < 10) return { ok: false, reason: "NO_ACTIVITY_COLUMNS" };
  if (columns.filter(column => column.wir).length < columns.length * 0.8) return { ok: false, reason: "NO_WIR_ROW" };

  // 3. the villas: until a summary row or an empty unit
  const units: ConsultantUnit[] = []; const unexpected: ConsultantModel["unexpectedCells"] = [];
  let summaryRows = 0; let cells = 0; let conforming = 0;
  for (let r = firstUnit; r < rows.length; r++) {
    const row = rows[r];
    if (SUMMARY.test(lower(row[0])) || SUMMARY.test(lower(row[at.zone])) || SUMMARY.test(lower(row[at.unit]))) { summaryRows = rows.length - r; break; }
    const unit = text(row[at.unit]);
    if (!unit) { if (rows.slice(r, r + 3).every(next => !text(next[at.unit]))) { summaryRows = rows.length - r; break; } continue; }
    const received = columns.map(column => {
      const value = text(row[column.column - 1]); cells += 1;
      if (RECEIVED.test(value)) { conforming += 1; return true; }
      if (NOT_RECEIVED.test(value)) { conforming += 1; return false; }
      if (unexpected.length < 50) unexpected.push({ row: r + 1, column: column.column, value });
      return false;
    });
    const ratio = at.ratio >= 0 ? nameAndPercent(`x (${text(row[at.ratio]).replace("%", "")}%)`).percent : null;
    units.push({ row: r + 1, zone: text(row[at.zone]), block: text(row[at.block]), cluster: at.cluster >= 0 ? text(row[at.cluster]) : "", unit, villaType: text(row[at.type]), reportedPercent: Number.isFinite(ratio) ? ratio : null, received });
  }
  if (units.length < 5) return { ok: false, reason: "TOO_FEW_UNITS" };
  if (conforming < cells * 0.98) return { ok: false, reason: "CELLS_NOT_OK_OR_DASH" };

  // 4. project, client, contractor and the export's date, written in the first rows
  let project: string | null = null; let client: string | null = null; let contractor: string | null = null; let exportDate: string | null = null;
  for (let r = 0; r < header; r++) for (const cell of rows[r]) {
    const value = text(cell); if (!value) continue;
    const pair = value.match(/^(project|client|contractor|export date|date)\s*:\s*(.+)$/i);
    if (pair) {
      const label = pair[1].toLowerCase();
      if (label === "project") project = pair[2].trim(); else if (label === "client") client = pair[2].trim(); else if (label === "contractor") contractor = pair[2].trim();
      else { const parsed = parseDate(pair[2].trim() as never); if (parsed) exportDate = parsed.iso; }
    } else if (cell instanceof Date && !exportDate) exportDate = cell.toISOString().slice(0, 10);
  }
  const warnings: string[] = [];
  if (unexpected.length) warnings.push("CONSULTANT_UNEXPECTED_CELLS");
  if (!exportDate) warnings.push("CONSULTANT_EXPORT_DATE_MISSING");
  return { ok: true, model: { sheet: grid.name, project, client, contractor, exportDate, headerRow: header + 1, columns, units, unexpectedCells: unexpected, summaryRows, warnings } };
}
