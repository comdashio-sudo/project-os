// A Primavera P6 export (.xer) read whole: the activities AND the WBS tree, the relationships, the resources and their assignments, the activity codes and the calendars.
// The older schedule importer accepted two tables (PROJWBS, TASK) and refused a real export for having any other; this reads what a real export holds.
// Pure: no database, no clock. The money in the file is in the project's currency on the platform (the header's currency is the P6 default and is only compared, never trusted).
import { MAX_XER_ROWS } from "../excelWorkbook";

export type XerTable = { name: string; fields: string[]; rows: Array<Record<string, string>> };
export type XerFile = { version: string | null; exportedAt: string | null; currency: string | null; encoding: "utf-8" | "windows-1252"; tables: Map<string, XerTable> };

export function decodeXer(bytes: Uint8Array): { text: string; encoding: "utf-8" | "windows-1252" } {
  try { return { text: new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, ""), encoding: "utf-8" }; }
  catch { return { text: new TextDecoder("windows-1252").decode(bytes), encoding: "windows-1252" }; }
}

export function parseXerFile(bytes: Uint8Array): XerFile {
  const { text, encoding } = decodeXer(bytes);
  const tables = new Map<string, XerTable>();
  let active: XerTable | null = null;
  let header: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line) continue;
    const parts = line.split("\t");
    const tag = parts[0];
    if (tag === "ERMHDR") header = parts;
    else if (tag === "%T") { active = { name: parts[1] ?? "", fields: [], rows: [] }; tables.set(active.name, active); }
    else if (tag === "%F" && active) active.fields = parts.slice(1);
    else if (tag === "%R" && active && active.fields.length) { const row: Record<string, string> = {}; active.fields.forEach((field, i) => { row[field] = parts[i + 1] ?? ""; }); active.rows.push(row); }
  }
  return { version: header[1] ?? null, exportedAt: header[2] ?? null, currency: header[8] ?? null, encoding, tables };
}

export const isXerText = (bytes: Uint8Array) => decodeXer(bytes.subarray(0, 4096)).text.trimStart().startsWith("ERMHDR");

// ------------------------------------------------------------------ the model

export type P6Wbs = { externalId: string; parentExternalId: string | null; shortName: string; name: string; isProjectRoot: boolean; sequence: number; code: string };
export type P6Activity = {
  externalId: string; code: string; name: string; wbsExternalId: string; calendarExternalId: string | null; taskType: string; statusCode: string;
  plannedStart: string | null; plannedFinish: string | null; actualStart: string | null; actualFinish: string | null;
  durationHours: number; remainingHours: number; percentComplete: number; totalFloatHours: number | null; constraintType: string | null; constraintDate: string | null;
};
export type P6Relationship = { externalId: string; predecessorCode: string; successorCode: string; type: "FS" | "SS" | "FF" | "SF"; lagHours: number };
export type P6Resource = { externalId: string; code: string; name: string; type: "labor" | "equipment" | "material" | "service"; parentExternalId: string | null };
export type P6Assignment = { externalId: string; activityCode: string; resourceCode: string; plannedUnits: number; actualUnits: number; remainingUnits: number; plannedCost: number; actualCost: number; remainingCost: number };
export type P6CodeType = { externalId: string; name: string; scope: string; sequence: number };
export type P6CodeValue = { externalId: string; typeExternalId: string; parentExternalId: string | null; shortName: string; name: string; sequence: number };
export type P6CodeAssignment = { activityCode: string; typeExternalId: string; valueExternalId: string };
export type P6Calendar = { externalId: string; name: string; type: string; isDefault: boolean; hoursPerDay: number; hoursPerWeek: number; data: string };
export type P6Project = { externalId: string; shortName: string; plannedStart: string | null; plannedFinish: string | null; dataDate: string | null };

export type P6Model = {
  header: { version: string | null; exportedAt: string | null; currency: string | null; encoding: string };
  project: P6Project;
  wbs: P6Wbs[]; activities: P6Activity[]; relationships: P6Relationship[]; resources: P6Resource[]; assignments: P6Assignment[];
  codeTypes: P6CodeType[]; codeValues: P6CodeValue[]; codeAssignments: P6CodeAssignment[]; calendars: P6Calendar[];
  /** tables in the file the platform does not keep, with their row counts: said in the preview, never silently dropped */
  skippedTables: Array<{ table: string; rows: number }>;
  warnings: string[];
  issues: Array<{ code: string; detail?: string }>;
};

const num = (value: string | undefined) => { const n = Number((value ?? "").replace(/,/g, "")); return Number.isFinite(n) ? n : 0; };
const KEPT = new Set(["PROJECT", "PROJWBS", "TASK", "TASKPRED", "RSRC", "TASKRSRC", "ACTVTYPE", "ACTVCODE", "TASKACTV", "CALENDAR"]);
const RELATION: Record<string, P6Relationship["type"]> = { PR_FS: "FS", PR_SS: "SS", PR_FF: "FF", PR_SF: "SF" };
const RESOURCE_TYPE: Record<string, P6Resource["type"]> = { RT_Labor: "labor", RT_Equip: "equipment", RT_Mat: "material" };
const MONTHS: Record<string, string> = { jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06", jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12" };

/** P6 writes «2023-10-19 08:00»; an Excel export of the same data writes «19-Oct-23». Both become an ISO date-time (no time zone: the schedule's own clock). */
export function p6Date(value: string | undefined | null): string | null {
  const text = (value ?? "").trim().replace(/\s*A$/, "");
  if (!text) return null;
  let m = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? "00"}:${m[5] ?? "00"}:00`;
  m = text.match(/^(\d{1,2})[-\s/]([A-Za-z]{3})[a-z]*[-\s/](\d{4}|\d{2})(?:\s+(\d{2}):(\d{2}))?/);
  if (m && MONTHS[m[2].toLowerCase()]) { const year = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${year}-${MONTHS[m[2].toLowerCase()]}-${m[1].padStart(2, "0")}T${m[4] ?? "00"}:${m[5] ?? "00"}:00`; }
  return null;
}

export function readP6(file: XerFile): P6Model {
  const table = (name: string) => file.tables.get(name)?.rows ?? [];
  const issues: P6Model["issues"] = []; const warnings: string[] = [];
  const tasks = table("TASK");
  if (!tasks.length) issues.push({ code: "XER_NO_ACTIVITIES" });
  if (tasks.length + table("PROJWBS").length > MAX_XER_ROWS) issues.push({ code: "IMPORT_TOO_MANY_ROWS" });
  const projectIds = Array.from(new Set(tasks.map(row => row.proj_id)));
  if (projectIds.length > 1) issues.push({ code: "XER_MULTIPLE_PROJECTS", detail: String(projectIds.length) });
  const projectRow = table("PROJECT").find(row => row.proj_id === projectIds[0]) ?? table("PROJECT")[0];
  const project: P6Project = { externalId: projectRow?.proj_id ?? projectIds[0] ?? "", shortName: projectRow?.proj_short_name ?? "", plannedStart: p6Date(projectRow?.plan_start_date), plannedFinish: p6Date(projectRow?.scd_end_date), dataDate: p6Date(projectRow?.last_recalc_date) };

  // the WBS tree: a short name is the code when it is unique in the file, else the path from the root (the platform keeps one code per project)
  const wbsRows = table("PROJWBS").filter(row => !projectIds[0] || row.proj_id === projectIds[0]);
  const byId = new Map(wbsRows.map(row => [row.wbs_id, row]));
  const shortCount = new Map<string, number>(); for (const row of wbsRows) shortCount.set(row.wbs_short_name, (shortCount.get(row.wbs_short_name) ?? 0) + 1);
  const pathOf = (row: Record<string, string>, depth = 0): string => { const parent = byId.get(row.parent_wbs_id); return parent && parent.proj_node_flag !== "Y" && depth < 50 ? `${pathOf(parent, depth + 1)}.${row.wbs_short_name}` : row.wbs_short_name; };
  const wbs: P6Wbs[] = wbsRows.map(row => ({ externalId: row.wbs_id, parentExternalId: byId.has(row.parent_wbs_id) ? row.parent_wbs_id : null, shortName: row.wbs_short_name, name: row.wbs_name || row.wbs_short_name, isProjectRoot: row.proj_node_flag === "Y", sequence: num(row.seq_num), code: (shortCount.get(row.wbs_short_name) ?? 0) > 1 ? pathOf(row) : row.wbs_short_name }));
  const usedCodes = new Set<string>(); for (const item of wbs) { if (usedCodes.has(item.code)) issues.push({ code: "XER_WBS_CODE_DUPLICATE", detail: item.code }); usedCodes.add(item.code); }
  const wbsIds = new Set(wbs.map(item => item.externalId));

  const activities: P6Activity[] = tasks.map(row => ({
    externalId: row.task_id, code: row.task_code, name: row.task_name || row.task_code, wbsExternalId: row.wbs_id, calendarExternalId: row.clndr_id || null, taskType: row.task_type || "TT_Task", statusCode: row.status_code || "TK_NotStart",
    plannedStart: p6Date(row.target_start_date ?? row.early_start_date), plannedFinish: p6Date(row.target_end_date ?? row.early_end_date), actualStart: p6Date(row.act_start_date), actualFinish: p6Date(row.act_end_date),
    durationHours: num(row.target_drtn_hr_cnt), remainingHours: num(row.remain_drtn_hr_cnt), percentComplete: Math.min(100, Math.max(0, num(row.phys_complete_pct))), totalFloatHours: row.total_float_hr_cnt === "" || row.total_float_hr_cnt === undefined ? null : num(row.total_float_hr_cnt),
    constraintType: row.cstr_type || null, constraintDate: p6Date(row.cstr_date),
  }));
  const codeSeen = new Set<string>(); const codeOf = new Map(activities.map(a => [a.externalId, a.code]));
  for (const a of activities) { if (!a.code) issues.push({ code: "XER_ACTIVITY_CODE_MISSING", detail: a.externalId }); else if (codeSeen.has(a.code)) issues.push({ code: "XER_ACTIVITY_CODE_DUPLICATE", detail: a.code }); codeSeen.add(a.code); if (!wbsIds.has(a.wbsExternalId)) issues.push({ code: "XER_WBS_REFERENCE_UNRESOLVED", detail: a.code }); }

  const relationships: P6Relationship[] = []; let unresolvedRelations = 0;
  for (const row of table("TASKPRED")) {
    const predecessorCode = codeOf.get(row.pred_task_id); const successorCode = codeOf.get(row.task_id);
    if (!predecessorCode || !successorCode) { unresolvedRelations += 1; continue; } // a link to an activity of another project
    relationships.push({ externalId: row.task_pred_id, predecessorCode, successorCode, type: RELATION[row.pred_type] ?? "FS", lagHours: num(row.lag_hr_cnt) });
  }
  if (unresolvedRelations) warnings.push(`XER_RELATIONSHIPS_OUTSIDE_PROJECT:${unresolvedRelations}`);

  const resourceRows = table("RSRC");
  const resourceCodeOf = new Map<string, string>(); const usedResourceCodes = new Set<string>();
  const resources: P6Resource[] = resourceRows.map(row => {
    let code = row.rsrc_short_name || row.rsrc_id; for (let n = 2; usedResourceCodes.has(code); n++) code = `${row.rsrc_short_name || row.rsrc_id}-${n}`;
    usedResourceCodes.add(code); resourceCodeOf.set(row.rsrc_id, code);
    return { externalId: row.rsrc_id, code, name: row.rsrc_name || code, type: RESOURCE_TYPE[row.rsrc_type] ?? "labor", parentExternalId: row.parent_rsrc_id || null };
  });
  const assignments: P6Assignment[] = [];
  for (const row of table("TASKRSRC")) {
    const activityCode = codeOf.get(row.task_id); const resourceCode = resourceCodeOf.get(row.rsrc_id);
    if (!activityCode || !resourceCode) continue;
    const actualUnits = num(row.act_reg_qty) + num(row.act_ot_qty); const actualCost = num(row.act_reg_cost) + num(row.act_ot_cost);
    assignments.push({ externalId: row.taskrsrc_id, activityCode, resourceCode, plannedUnits: num(row.target_qty), actualUnits, remainingUnits: num(row.remain_qty), plannedCost: num(row.target_cost), actualCost, remainingCost: num(row.remain_cost) });
  }

  const codeTypes: P6CodeType[] = table("ACTVTYPE").map(row => ({ externalId: row.actv_code_type_id, name: row.actv_code_type, scope: row.actv_code_type_scope || "", sequence: num(row.seq_num) }));
  const codeValues: P6CodeValue[] = table("ACTVCODE").map(row => ({ externalId: row.actv_code_id, typeExternalId: row.actv_code_type_id, parentExternalId: row.parent_actv_code_id || null, shortName: row.short_name, name: row.actv_code_name || row.short_name, sequence: num(row.seq_num) }));
  const valueIds = new Set(codeValues.map(v => v.externalId));
  const codeAssignments: P6CodeAssignment[] = table("TASKACTV").flatMap(row => { const activityCode = codeOf.get(row.task_id); return activityCode && valueIds.has(row.actv_code_id) ? [{ activityCode, typeExternalId: row.actv_code_type_id, valueExternalId: row.actv_code_id }] : []; });

  const calendars: P6Calendar[] = table("CALENDAR").map(row => ({ externalId: row.clndr_id, name: row.clndr_name, type: row.clndr_type || "", isDefault: row.default_flag === "Y", hoursPerDay: num(row.day_hr_cnt), hoursPerWeek: num(row.week_hr_cnt), data: row.clndr_data ?? "" }));

  const skippedTables = Array.from(file.tables.values()).filter(item => !KEPT.has(item.name) && item.rows.length > 0).map(item => ({ table: item.name, rows: item.rows.length }));
  return { header: { version: file.version, exportedAt: file.exportedAt, currency: file.currency, encoding: file.encoding }, project, wbs, activities, relationships, resources, assignments, codeTypes, codeValues, codeAssignments, calendars, skippedTables, warnings, issues };
}

/** The planned cost of an activity: what its resource assignments add up to (the TASK table carries no cost). */
export function plannedCostByActivity(model: P6Model): Map<string, number> {
  const out = new Map<string, number>();
  for (const a of model.assignments) out.set(a.activityCode, (out.get(a.activityCode) ?? 0) + a.plannedCost);
  return out;
}
