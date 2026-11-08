// The unit-completion matrix: a monthly report with one row per unit and one column per activity (1 = complete, empty = not started), the weight of each activity
// in a row above, a three-level header (phase, division, activity), and percentages the spreadsheet computed. Recognised by its STRUCTURE, never by a name or a position,
// so a differently lettered report of the same shape is read the same way. Nothing here writes: it turns the sheet into a model, checks it, and compares the sheet's
// own percentages with the platform's calculation (the same weights × complete cells that server/domain/pmc.ts applies).
import { createHash } from "node:crypto";
import { parseDate } from "./dates";
import { parseNumber } from "./numbers";
import type { Cell, SheetGrid } from "./sheetReader";

export type MatrixActivity = { index: number; column: number; code: string; name: string; groupCode: string; groupName: string; divisionCode: string; divisionName: string; weight: number; wir: string | null };
export type MatrixUnit = {
  row: number; serial: number; oracleCode: string | null; plot: string | null; project: string | null; stage: string | null; zone: string; block: string; modelCode: string; villaCode: string | null;
  /** the villa number as the site and the consultant write it (work order 22): the digits of the villa code, else the plot */
  villaLabel: string | null;
  reportedPercent: number | null; complete: boolean[];
  reportedDivisionPercent: Record<string, number | null>; reportedBlockPercent: number | null; reportedZonePercent: number | null;
};
export type MatrixModel = {
  sheet: string; reportDate: string | null; weightsRow: number; headerRows: [number, number, number];
  /** the row of WIR numbers under the header (work order 22), and the total column the weights row carries (its weight is the sum of the others) */
  wirRow: number | null; totalColumn: number | null;
  activities: MatrixActivity[]; units: MatrixUnit[];
  divisions: Array<{ code: string; name: string; groupCode: string; weightText: number | null; weightSum: number }>;
  /** what the spreadsheet computed itself: columns that are NOT written, only compared */
  computedColumns: { villaPercent: number | null; identityPercent: number | null; division: Array<{ code: string; column: number }>; blockPercent: number | null; zonePercent: number | null };
  ignored: { totalsRow: number | null; pivotRow: number | null; computedColumnCount: number };
  unexpectedCells: Array<{ row: number; column: number; value: string }>;
  warnings: string[];
};

const text = (cell: Cell | undefined) => (cell === null || cell === undefined ? "" : cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell).trim());
const isWeight = (cell: Cell | undefined): cell is number => typeof cell === "number" && cell > 0 && cell <= 1;
const norm = (value: string) => value.toLowerCase().replace(/[ً-ْـ]/g, "").replace(/[أإآ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/\s+/g, " ").trim();
const hash6 = (value: string) => createHash("sha256").update(norm(value)).digest("hex").slice(0, 6).toUpperCase();
const TOTAL = /^(الاجمالي|اجمالي|المجموع|مجموع|الاجمالى|total|grand total|sum)(\s|$)/i;

const IDENTITY: Array<{ key: "serial" | "oracle" | "plot" | "project" | "stage" | "zone" | "block" | "model" | "villa" | "percent"; test: RegExp }> = [
  { key: "oracle", test: /(اوراكيل|اوراكل|oracle)/ }, { key: "villa", test: /(كود الفيل|villa code|رمز الفيل)/ }, { key: "plot", test: /(رقم القطع|plot)/ },
  { key: "project", test: /(اسم المشروع|project)/ }, { key: "stage", test: /^stage$|^المرحل/ }, { key: "zone", test: /^zone$|^الزون$|^المنطق/ }, { key: "block", test: /^block$|^البلوك$|^الكتل/ },
  { key: "model", test: /(رمز النموذج|النموذج|model|type)/ }, { key: "percent", test: /(نسبه الانجاز|progress|completion)/ }, { key: "serial", test: /^(م|no\.?|#|serial|مسلسل|التسلسل)$/ },
];

/** «V-0268», «268», «فيلا 268» → «268»: the villa number the other sources write; the plot when the code holds no number. */
export function villaLabelOf(villaCode: string, plot: string): string | null {
  const digits = (value: string) => { const match = value.match(/\d+/g); return match ? String(Number(match[match.length - 1])) : null; };
  return digits(villaCode) ?? digits(plot);
}

export type MatrixDetection = { ok: true; model: MatrixModel } | { ok: false; reason: string };

/** Looks for the matrix shape in a sheet. `ok: false` carries the reason, so "why was it not recognised" has an answer. */
export function detectMatrix(grid: SheetGrid): MatrixDetection {
  const rows = grid.rows;
  if (rows.length < 12 || (rows[0]?.length ?? 0) < 30) return { ok: false, reason: "TOO_SMALL" };
  // 1. the weights row: many numbers in (0, 1] that add up to about 1
  // A report may carry a TOTAL column in the same row (its weight is the sum of all the others, so the row adds up to ~2.0): that column is found and set aside.
  let weightsRow = -1; let totalColumn = -1;
  for (let r = 0; r < Math.min(15, rows.length - 4); r++) {
    const values = rows[r].filter(isWeight) as number[];
    const sum = values.reduce((a, b) => a + b, 0);
    if (values.length < 20 || values.length < rows[r].filter(cell => typeof cell === "number").length * 0.9) continue;
    if (sum >= 0.5 && sum <= 1.5) { weightsRow = r; break; }
    if (sum > 1.5 && sum <= 2.5) {
      const total = rows[r].findIndex(cell => isWeight(cell) && Math.abs((cell as number) - (sum - (cell as number))) <= 0.01);
      if (total >= 0) { weightsRow = r; totalColumn = total; break; }
    }
  }
  if (weightsRow < 0) return { ok: false, reason: "NO_WEIGHTS_ROW" };
  const h1 = weightsRow + 1; const h2 = weightsRow + 2; const h3 = weightsRow + 3;
  const activityColumns = rows[weightsRow].flatMap((cell, c) => (isWeight(cell) && c !== totalColumn ? [c] : []));
  // the row of inspection request (WIR) numbers right under the header, when the report has one: most activity cells read like «WIR-0105»
  const wirLike = (cell: Cell | undefined) => /^\s*(wir|ir|rfi)?[\s#-]*[a-z]{0,4}[\s#-]*\d{1,6}\b/i.test(text(cell)) && !/^[01]$/.test(text(cell));
  const wirCandidate = rows[h3 + 1] ?? [];
  const hasWirRow = activityColumns.filter(c => wirLike(wirCandidate[c])).length >= activityColumns.length * 0.8;
  const first = hasWirRow ? weightsRow + 5 : weightsRow + 4;
  const named = activityColumns.filter(c => text(rows[h3][c]) !== "").length;
  if (named < activityColumns.length * 0.9) return { ok: false, reason: "NO_ACTIVITY_NAMES" };
  const firstActivity = activityColumns[0];

  // 2. identity columns, read from the header text above the activities
  const headerOf = (c: number) => norm(Array.from(new Set([text(rows[h1][c]), text(rows[h2][c]), text(rows[h3][c])].filter(Boolean))).join(" "));
  const found = new Map<string, number>();
  for (let c = 0; c < firstActivity; c++) {
    const label = headerOf(c);
    if (!label) continue;
    // the narrow patterns (oracle, villa code, plot) win over the broad ones, so "كود اوراكيل" is never mistaken for a plain code
    for (const item of IDENTITY) if (!found.has(item.key) && item.test.test(label)) { found.set(item.key, c); break; }
  }
  for (const needed of ["model", "zone", "block"]) if (!found.has(needed)) return { ok: false, reason: `NO_${needed.toUpperCase()}_COLUMN` };
  if (!found.has("serial") && !found.has("villa")) return { ok: false, reason: "NO_UNIT_KEY_COLUMN" };

  // 3. the unit rows: until the identity runs out (the totals row and the pivot below it are not units)
  const model = found.get("model")!; const serialColumn = found.get("serial"); const villaColumn = found.get("villa");
  const unitRows: number[] = [];
  let totalsRow: number | null = null; let pivotRow: number | null = null; let endRow = rows.length;
  for (let r = first; r < rows.length; r++) {
    const row = rows[r];
    const lead = [text(row[0]), text(row[1]), text(row[2])].join(" ");
    if (TOTAL.test(norm(text(row[0]))) || TOTAL.test(norm(text(row[1])))) { totalsRow = r + 1; endRow = r; break; }
    if (!text(row[model]) || (serialColumn !== undefined && parseNumber(row[serialColumn]) === null && !(villaColumn !== undefined && text(row[villaColumn])))) { endRow = r; break; }
    void lead; unitRows.push(r);
  }
  if (unitRows.length < 5) return { ok: false, reason: "TOO_FEW_UNITS" };
  for (let r = endRow; r < rows.length; r++) if (/^(row labels|sum of|عناوين الصفوف)/i.test(text(rows[r][0])) || /^sum of /i.test(text(rows[r][1]))) { pivotRow = r + 1; break; }

  // 4. the activity cells are 1 / empty; anything else is reported, not guessed
  const unexpected: MatrixModel["unexpectedCells"] = [];
  let conforming = 0; let cellsSeen = 0;
  for (const r of unitRows) for (const c of activityColumns) {
    const cell = rows[r][c]; cellsSeen += 1;
    if (cell === null || cell === undefined || cell === "" || cell === 0 || cell === 1 || cell === "1" || cell === "0") { conforming += 1; continue; }
    if (unexpected.length < 50) unexpected.push({ row: r + 1, column: c + 1, value: text(cell) });
  }
  if (conforming < cellsSeen * 0.98) return { ok: false, reason: "ACTIVITY_CELLS_NOT_BINARY" };

  // 5. the three-level header, carried across the merged (horizontal) cells that only hold their first column
  const carry = (rowIndex: number) => { const out: string[] = []; let last = ""; for (const c of activityColumns) { const value = text(rows[rowIndex][c]); if (value) last = value; out[c] = last; } return out; };
  const phases = carry(h1); const divisionsLabel = carry(h2);
  const phaseOrder = Array.from(new Set(activityColumns.map(c => phases[c] || "—")));
  const divisionCodeOf = (label: string, fallback: number) => { const match = label.match(/division\s*0*(\d+)/i) ?? label.match(/\b0*(\d{2})\b/); return match ? `D${match[1].padStart(2, "0")}` : `D${String(fallback + 1).padStart(2, "0")}`; };
  const divisionOrder = Array.from(new Set(activityColumns.map(c => divisionsLabel[c] || "—")));
  const usedCodes = new Set<string>();
  const activities: MatrixActivity[] = activityColumns.map((c, index) => {
    const label = divisionsLabel[c] || "—";
    const divisionCode = divisionCodeOf(label, divisionOrder.indexOf(label));
    const name = text(rows[h3][c]) || `${divisionCode} ${index + 1}`;
    let code = `${divisionCode}-${hash6(`${label}|${name}`)}`;
    for (let n = 2; usedCodes.has(code); n++) code = `${divisionCode}-${hash6(`${label}|${name}`)}-${n}`;
    usedCodes.add(code);
    const phase = phases[c] || "—";
    return { index, column: c + 1, code, name, groupCode: `G${String(phaseOrder.indexOf(phase) + 1).padStart(2, "0")}`, groupName: phase, divisionCode, divisionName: label.split("\n")[0] || label, weight: rows[weightsRow][c] as number, wir: hasWirRow ? text(wirCandidate[c]) || null : null };
  });

  // division weights written as text in the row above the weights: «Division 02=47.5%»
  const weightText = new Map<string, number>();
  for (let r = 0; r < weightsRow; r++) for (const cell of rows[r]) { const m = text(cell).match(/division\s*0*(\d+)\s*=\s*([\d.]+)\s*%/i); if (m) weightText.set(`D${m[1].padStart(2, "0")}`, Number(m[2])); }
  const divisions = Array.from(new Set(activities.map(a => a.divisionCode))).map(code => {
    const own = activities.filter(a => a.divisionCode === code);
    return { code, name: own[0].divisionName, groupCode: own[0].groupCode, weightText: weightText.get(code) ?? null, weightSum: own.reduce((sum, a) => sum + a.weight, 0) };
  });

  // 6. the percentages the spreadsheet computed (compared, never written)
  const after = rows[h3].length;
  let villaPercent: number | null = null; let blockPercent: number | null = null; let zonePercent: number | null = null;
  for (let c = 0; c < after; c++) {
    if (activityColumns.includes(c) || c === totalColumn) continue;
    const label = headerOf(c);
    if (c > activityColumns[activityColumns.length - 1] && /نسبه الفيل/.test(label)) villaPercent = c;
    if (c > activityColumns[activityColumns.length - 1] && /نسبه البلوك/.test(label)) blockPercent = c;
    if (c > activityColumns[activityColumns.length - 1] && /نسبه الزون/.test(label)) zonePercent = c;
  }
  const divisionColumns: Array<{ code: string; column: number }> = [];
  for (let c = 0; c < firstActivity; c++) {
    if (c === found.get("percent")) continue;
    const label = text(rows[h3][c]) || text(rows[h2][c]);
    const m = label.match(/div(?:ision)?\s*0*(\d+)/i);
    if (m && !Array.from(found.values()).includes(c)) divisionColumns.push({ code: `D${m[1].padStart(2, "0")}`, column: c + 1 });
  }
  const numberAt = (row: Cell[], c: number | null | undefined) => (c === null || c === undefined ? null : parseNumber(row[c])?.value ?? null);
  const units: MatrixUnit[] = unitRows.map(r => {
    const row = rows[r];
    const serial = serialColumn !== undefined ? (parseNumber(row[serialColumn])?.value ?? NaN) : NaN;
    return {
      row: r + 1, serial: Number.isFinite(serial) ? Math.round(serial) : NaN, oracleCode: text(row[found.get("oracle") ?? -1]) || null, plot: text(row[found.get("plot") ?? -1]) || null,
      project: text(row[found.get("project") ?? -1]) || null, stage: text(row[found.get("stage") ?? -1]) || null, zone: text(row[found.get("zone")!]), block: text(row[found.get("block")!]), modelCode: text(row[model]),
      villaCode: villaColumn !== undefined ? text(row[villaColumn]) || null : null,
      villaLabel: villaLabelOf(villaColumn !== undefined ? text(row[villaColumn]) : "", text(row[found.get("plot") ?? -1])),
      reportedPercent: numberAt(row, villaPercent ?? found.get("percent")),
      complete: activityColumns.map(c => row[c] === 1 || row[c] === "1"),
      reportedDivisionPercent: Object.fromEntries(divisionColumns.map(d => [d.code, numberAt(row, d.column - 1)])), reportedBlockPercent: numberAt(row, blockPercent), reportedZonePercent: numberAt(row, zonePercent),
    };
  });

  // 7. the report date, written beside its label in the first rows
  let reportDate: string | null = null;
  for (let r = 0; r < Math.min(4, rows.length) && !reportDate; r++) rows[r].forEach((cell, c) => {
    if (reportDate || !/تاريخ التقرير|report date/i.test(text(cell))) return;
    for (let k = c + 1; k <= c + 6 && !reportDate; k++) { const parsed = parseDate(rows[r][k] as never); if (parsed) reportDate = parsed.iso; }
  });

  // no label: the first date written in the first row (the report the owner described keeps it in V1)
  if (!reportDate) for (const cell of rows[0] ?? []) { if (reportDate) break; if (cell instanceof Date || (typeof cell === "string" && /\d{4}-\d{2}-\d{2}|\d{1,2}[/.-]\d{1,2}[/.-]\d{2,4}/.test(cell))) { const parsed = parseDate(cell as never); if (parsed) reportDate = parsed.iso; } }

  const warnings: string[] = [];
  if (unexpected.length) warnings.push("UNEXPECTED_ACTIVITY_CELLS");
  if (!reportDate) warnings.push("REPORT_DATE_MISSING");
  if (units.some(u => !Number.isFinite(u.serial))) warnings.push("SERIAL_MISSING");
  const computedColumnCount = [villaPercent, blockPercent, zonePercent].filter(v => v !== null).length + divisionColumns.length + (found.has("percent") ? 1 : 0);
  return {
    ok: true,
    model: {
      sheet: grid.name, reportDate, weightsRow: weightsRow + 1, headerRows: [h1 + 1, h2 + 1, h3 + 1], wirRow: hasWirRow ? h3 + 2 : null, totalColumn: totalColumn >= 0 ? totalColumn + 1 : null, activities, units, divisions,
      computedColumns: { villaPercent: villaPercent === null ? null : villaPercent + 1, identityPercent: found.has("percent") ? found.get("percent")! + 1 : null, division: divisionColumns, blockPercent: blockPercent === null ? null : blockPercent + 1, zonePercent: zonePercent === null ? null : zonePercent + 1 },
      ignored: { totalsRow, pivotRow, computedColumnCount }, unexpectedCells: unexpected, warnings,
    },
  };
}

// ------------------------------------------------------------------ checks

export type MatrixIssue = { code: string; detail?: string; row?: number };
const WEIGHT_TOLERANCE = 1e-6;

/** What must be true before anything is written. The weights are the heart: a model whose weights are not 100% has no honest percentage. */
export function validateMatrix(model: MatrixModel): MatrixIssue[] {
  const issues: MatrixIssue[] = [];
  const total = model.activities.reduce((sum, a) => sum + a.weight, 0);
  if (Math.abs(total - 1) > WEIGHT_TOLERANCE) issues.push({ code: "MATRIX_WEIGHTS_NOT_100", detail: `${(total * 100).toFixed(4)}%` });
  const serials = new Set<number>(); const oracle = new Set<string>(); const villa = new Set<string>();
  const blockZone = new Map<string, string>();
  for (const unit of model.units) {
    if (!Number.isFinite(unit.serial)) issues.push({ code: "MATRIX_UNIT_SERIAL_MISSING", row: unit.row });
    else if (serials.has(unit.serial)) issues.push({ code: "MATRIX_UNIT_SERIAL_DUPLICATE", row: unit.row, detail: String(unit.serial) });
    else serials.add(unit.serial);
    if (unit.oracleCode) { if (oracle.has(unit.oracleCode)) issues.push({ code: "MATRIX_ORACLE_CODE_DUPLICATE", row: unit.row, detail: unit.oracleCode }); oracle.add(unit.oracleCode); }
    if (unit.villaCode) { if (villa.has(unit.villaCode)) issues.push({ code: "MATRIX_VILLA_CODE_DUPLICATE", row: unit.row, detail: unit.villaCode }); villa.add(unit.villaCode); }
    if (!unit.zone || !unit.block || !unit.modelCode) issues.push({ code: "MATRIX_UNIT_LOCATION_MISSING", row: unit.row });
    const key = `${unit.zone}\u0000${unit.block}`;
    const seenZone = blockZone.get(unit.block);
    if (seenZone !== undefined && seenZone !== unit.zone && !blockZone.has(key)) { /* same block name in two zones is allowed: blocks are keyed with their zone */ }
    blockZone.set(unit.block, unit.zone);
  }
  return issues;
}

export type MatchReport = {
  tolerance: number;
  units: { compared: number; matched: number; mismatches: Array<{ row: number; serial: number; villaCode: string | null; reported: number; computed: number; difference: number }> };
  divisions: { compared: number; matched: number; mismatches: Array<{ row: number; serial: number; division: string; reported: number; computed: number }> };
  blocks: { compared: number; matched: number; mismatches: Array<{ block: string; reported: number; computed: number }> };
  zones: { compared: number; matched: number; mismatches: Array<{ zone: string; reported: number; computed: number }> };
  /** the share of units whose own percentage the platform reproduces */
  unitMatchShare: number;
};
export const MATCH_TOLERANCE = 0.00005;
const MAX_LISTED = 200;

/** The platform's own number for each unit: the weights of its complete activities added up — compared with the percentage the sheet computed for it. */
export function reconcile(model: MatrixModel, tolerance = MATCH_TOLERANCE): MatchReport {
  const weights = model.activities.map(a => a.weight);
  const divisionWeight = new Map(model.divisions.map(d => [d.code, d.weightSum]));
  const computed = model.units.map(unit => unit.complete.reduce((sum, done, a) => sum + (done ? weights[a] : 0), 0));
  const report: MatchReport = { tolerance, units: { compared: 0, matched: 0, mismatches: [] }, divisions: { compared: 0, matched: 0, mismatches: [] }, blocks: { compared: 0, matched: 0, mismatches: [] }, zones: { compared: 0, matched: 0, mismatches: [] }, unitMatchShare: 0 };
  model.units.forEach((unit, u) => {
    if (unit.reportedPercent !== null) {
      report.units.compared += 1;
      if (Math.abs(unit.reportedPercent - computed[u]) <= tolerance) report.units.matched += 1;
      else if (report.units.mismatches.length < MAX_LISTED) report.units.mismatches.push({ row: unit.row, serial: unit.serial, villaCode: unit.villaCode, reported: unit.reportedPercent, computed: computed[u], difference: unit.reportedPercent - computed[u] });
    }
    for (const [code, reported] of Object.entries(unit.reportedDivisionPercent)) {
      if (reported === null) continue;
      const own = model.activities.map((a, i) => (a.divisionCode === code ? i : -1)).filter(i => i >= 0);
      const total = divisionWeight.get(code) ?? 0;
      if (!own.length || total <= 0) continue;
      const platform = own.reduce((sum, i) => sum + (unit.complete[i] ? weights[i] : 0), 0) / total;
      report.divisions.compared += 1;
      if (Math.abs(reported - platform) <= tolerance) report.divisions.matched += 1;
      else if (report.divisions.mismatches.length < MAX_LISTED) report.divisions.mismatches.push({ row: unit.row, serial: unit.serial, division: code, reported, computed: platform });
    }
  });
  const group = (key: (unit: MatrixUnit) => string, reported: (unit: MatrixUnit) => number | null, into: MatchReport["blocks"] | MatchReport["zones"], label: "block" | "zone") => {
    const byKey = new Map<string, number[]>(); const seen = new Map<string, number>();
    model.units.forEach((unit, u) => { const k = key(unit); byKey.set(k, [...(byKey.get(k) ?? []), computed[u]]); const value = reported(unit); if (value !== null && !seen.has(k)) seen.set(k, value); });
    seen.forEach((value, k) => {
      const values = byKey.get(k)!; const platform = values.reduce((a, b) => a + b, 0) / values.length;
      into.compared += 1;
      if (Math.abs(value - platform) <= tolerance) into.matched += 1;
      else if (into.mismatches.length < MAX_LISTED) (into.mismatches as Array<Record<string, unknown>>).push({ [label]: k, reported: value, computed: platform });
    });
  };
  group(unit => `${unit.zone}-${unit.block}`, unit => unit.reportedBlockPercent, report.blocks, "block");
  group(unit => unit.zone, unit => unit.reportedZonePercent, report.zones, "zone");
  report.unitMatchShare = report.units.compared ? report.units.matched / report.units.compared : 0;
  return report;
}

// ------------------------------------------------------------------ the PMC import rows

export const matrixBlockCode = (unit: Pick<MatrixUnit, "zone" | "block">) => `${unit.zone}-${unit.block}`;

/** The weights as percentages with the four decimals the catalogue keeps. When the sheet's own total is 1.0 but rounding leaves a residue, the residue goes to the heaviest activity (said, never hidden). */
export function weightPercents(model: MatrixModel): { percents: number[]; adjustment: number } {
  const percents = model.activities.map(a => Math.round(a.weight * 100 * 1e4) / 1e4);
  const residue = Math.round((100 - percents.reduce((a, b) => a + b, 0)) * 1e4) / 1e4;
  if (residue === 0 || Math.abs(residue) > 0.01) return { percents, adjustment: 0 };
  const heaviest = percents.indexOf(Math.max(...percents));
  percents[heaviest] = Math.round((percents[heaviest] + residue) * 1e4) / 1e4;
  return { percents, adjustment: residue };
}

export type PmcRow = { rowNumber: number; cells: Record<string, unknown> };
/** The three files the existing PMC importers read, as rows: locations, then the catalogue per model, then one COMPLETE row per complete cell. */
export function toPmcRows(model: MatrixModel, reportDate: string | null) {
  const { percents } = weightPercents(model);
  const locations: PmcRow[] = model.units.map(unit => ({ rowNumber: unit.row, cells: { zoneCode: unit.zone, zoneName: unit.zone, blockCode: matrixBlockCode(unit), blockName: unit.block, unitNumber: unit.serial, modelCode: unit.modelCode } }));
  const models = Array.from(new Set(model.units.map(unit => unit.modelCode)));
  const catalog: PmcRow[] = []; let n = 0;
  for (const modelCode of models) model.activities.forEach((activity, i) => { n += 1; catalog.push({ rowNumber: n, cells: { modelCode, groupCode: activity.groupCode, groupName: activity.groupName, stageCode: activity.divisionCode, stageName: activity.divisionName, activityCode: activity.code, activityName: activity.name, weightPercent: percents[i] } }); });
  const status: PmcRow[] = [];
  for (const unit of model.units) unit.complete.forEach((done, i) => { if (done) status.push({ rowNumber: unit.row, cells: { unitNumber: unit.serial, activityCode: model.activities[i].code, status: "Complete", changedAt: reportDate ?? undefined } }); });
  return { locations, catalog, status, models };
}
