// A SYNTHETIC Primavera P6 export (version 25.12) with the table sizes of a real one the owner described — 611 activities, 140 WBS nodes, 1,434 relationships, 1,022 resource
// assignments, 377 activity-code assignments, 6 resources, 3 calendars — and nothing else from it: names, codes and dates are invented. The header says USD, as P6 does by default.
export const P6_COUNTS = { activities: 611, wbs: 140, relationships: 1434, assignments: 1022, codeAssignments: 377, resources: 6, calendars: 3, codeTypes: 2, codeValues: 10 } as const;

export type P6Truth = {
  activityCodes: string[]; wbsCodes: string[]; started: string[]; finished: string[]; totalPlannedCost: number; currencyInHeader: string;
  /** activity code -> actual start / finish (ISO date) for the activities that have them */
  actuals: Record<string, { start: string | null; finish: string | null }>;
};

const pad = (n: number, width = 2) => String(n).padStart(width, "0");
const day = (offset: number) => { const d = new Date(Date.UTC(2023, 9, 1)); d.setUTCDate(d.getUTCDate() + offset); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };

export function buildP6Xer(options: { currency?: string; latin1?: boolean; /** false: every activity is not started, no actual dates (the schedule before any progress update) */ withActuals?: boolean; /** how many activities (default 611): the D-4 timing uses 10,000 */ activities?: number; /** appended to every activity name: a second import of the same schedule then UPDATES every activity */ nameSuffix?: string } = {}): { bytes: Uint8Array; truth: P6Truth } {
  const currency = options.currency ?? "USD";
  const activityCount = options.activities ?? P6_COUNTS.activities;
  const out: string[] = [];
  const table = (name: string, fields: string[], rows: Array<Array<string | number>>) => { out.push(`%T\t${name}`, `%F\t${fields.join("\t")}`); for (const row of rows) out.push(`%R\t${row.join("\t")}`); };
  out.push(`ERMHDR\t25.12\t2026-10-01\tProject\tadmin\tadmin\tdb\tProject Management\t${currency}`);
  table("CURRTYPE", ["curr_id", "curr_short_name", "curr_symbol"], [[1, "USD", "$"], [2, "SAR", "SR"]]);
  table("OBS", ["obs_id", "obs_name"], [[1, "Enterprise"]]);
  table("CALENDAR", ["clndr_id", "default_flag", "clndr_name", "clndr_type", "day_hr_cnt", "week_hr_cnt", "clndr_data"], [[1, "Y", "Five day week", "CA_Project", 8, 40, "(0||CalendarData()())"], [2, "N", "Six day week", "CA_Project", 8, 48, "(0||CalendarData()())"], [3, "N", "Shifts", "CA_Rsrc", 10, 50, "(0||CalendarData()())"]]);
  table("PROJECT", ["proj_id", "proj_short_name", "plan_start_date", "scd_end_date", "last_recalc_date", "clndr_id"], [[500, "DEMO-P6", "2023-10-01 08:00", "2026-06-30 17:00", "2026-09-30 00:00", 1]]);

  // the WBS tree: a project root, 6 branches, the rest below them (short names repeat under different parents, as they do in a real tree)
  const wbsRows: Array<Array<string | number>> = [[9000, 500, "Y", 0, "DEMO", "Demo project", ""]];
  const wbsCodes = ["DEMO"]; const parents: number[] = [9000];
  for (let i = 1; i < P6_COUNTS.wbs; i++) {
    const parent = i <= 6 ? 9000 : 9000 + 1 + ((i - 7) % 6);
    const short = i <= 6 ? `B${i}` : `${Math.floor((i - 7) / 6) + 1}`; // unique under its branch, repeated under every other branch
    wbsRows.push([9000 + i, 500, "N", i, short, `Package ${i}`, parent]); parents.push(parent); wbsCodes.push(short);
  }
  table("PROJWBS", ["wbs_id", "proj_id", "proj_node_flag", "seq_num", "wbs_short_name", "wbs_name", "parent_wbs_id"], wbsRows);

  table("RSRC", ["rsrc_id", "parent_rsrc_id", "rsrc_name", "rsrc_short_name", "rsrc_type"], [[1, "", "Site engineer", "ENG", "RT_Labor"], [2, "", "Foreman", "FRM", "RT_Labor"], [3, "", "Excavator", "EXC", "RT_Equip"], [4, "", "Crane", "CRN", "RT_Equip"], [5, "", "Concrete", "CON", "RT_Mat"], [6, "", "Steel", "STL", "RT_Mat"]]);
  table("ACTVTYPE", ["actv_code_type_id", "actv_short_len", "seq_num", "actv_code_type", "actv_code_type_scope"], [[1, 8, 1, "Responsible", "AS_Project"], [2, 8, 2, "Area", "AS_Project"]]);
  const codeValueRows: Array<Array<string | number>> = [];
  for (let v = 1; v <= P6_COUNTS.codeValues; v++) codeValueRows.push([v, "", v <= 5 ? 1 : 2, `Value ${v}`, `V${v}`, v]);
  table("ACTVCODE", ["actv_code_id", "parent_actv_code_id", "actv_code_type_id", "actv_code_name", "short_name", "seq_num"], codeValueRows);

  const activityCodes: string[] = []; const started: string[] = []; const finished: string[] = []; const actuals: P6Truth["actuals"] = {};
  const taskRows: Array<Array<string | number>> = [];
  for (let i = 0; i < activityCount; i++) {
    const code = `A${1000 + i * 10}`; activityCodes.push(code);
    const wbs = 9000 + 7 + (i % (P6_COUNTS.wbs - 7)); // activities live under the leaf packages
    const start = day(i * 2); const end = day(i * 2 + 14);
    const state = options.withActuals === false ? "TK_NotStart" : i < 120 ? "TK_Complete" : i < 139 ? "TK_Active" : "TK_NotStart";
    const actStart = state === "TK_NotStart" ? "" : `${day(i * 2 + 1)} 08:00`;
    const actEnd = state === "TK_Complete" ? `${day(i * 2 + 13)} 17:00` : "";
    const wouldStart = i < 139; const wouldFinish = i < 120;
    if (actStart) started.push(code); if (actEnd) finished.push(code);
    if (wouldStart) actuals[code] = { start: day(i * 2 + 1), finish: wouldFinish ? day(i * 2 + 13) : null };
    taskRows.push([6000 + i, 500, wbs, i % 3 === 0 ? 2 : 1, i % 40 === 0 ? "TT_Mile" : "TT_Task", state, code, `Activity ${i + 1} ${options.latin1 ? "café" : ""}`.trim() + (options.nameSuffix ?? ""), 120 + (i % 7) * 8, state === "TK_Complete" ? 0 : 96, state === "TK_Complete" ? 100 : state === "TK_Active" ? 40 : 0, (i % 11) * 8, `${start} 08:00`, `${end} 17:00`, actStart, actEnd]);
  }
  table("TASK", ["task_id", "proj_id", "wbs_id", "clndr_id", "task_type", "status_code", "task_code", "task_name", "target_drtn_hr_cnt", "remain_drtn_hr_cnt", "phys_complete_pct", "total_float_hr_cnt", "target_start_date", "target_end_date", "act_start_date", "act_end_date"], taskRows);

  const preds: Array<Array<string | number>> = []; const seen = new Set<string>();
  for (let k = 0; preds.length < P6_COUNTS.relationships; k++) {
    const succ = 1 + (k % (activityCount - 1)); const pred = Math.max(0, succ - 1 - ((k * 7) % Math.min(succ, 30)));
    const type = ["PR_FS", "PR_FS", "PR_SS", "PR_FF", "PR_SF"][k % 5];
    const key = `${pred}-${succ}-${type}`; if (seen.has(key) || pred >= succ) continue; seen.add(key);
    preds.push([20000 + preds.length, 6000 + succ, 6000 + pred, 500, 500, type, (k % 4) * 8]);
  }
  table("TASKPRED", ["task_pred_id", "task_id", "pred_task_id", "proj_id", "pred_proj_id", "pred_type", "lag_hr_cnt"], preds);

  const assignRows: Array<Array<string | number>> = []; let totalPlannedCost = 0;
  for (let k = 0; k < P6_COUNTS.assignments; k++) {
    const task = k % activityCount; const rsrc = 1 + ((k * 5 + (k >> 3)) % 6); const qty = 8 + (k % 9) * 4; const cost = qty * (20 + rsrc * 5);
    totalPlannedCost += cost;
    assignRows.push([30000 + k, 6000 + task, 500, rsrc, qty, qty, cost, 0, 0, cost]);
  }
  table("TASKRSRC", ["taskrsrc_id", "task_id", "proj_id", "rsrc_id", "remain_qty", "target_qty", "target_cost", "act_reg_cost", "act_ot_cost", "remain_cost"], assignRows);

  const codeRows: Array<Array<string | number>> = [];
  for (let k = 0; k < P6_COUNTS.codeAssignments; k++) { const type = 1 + (k % 2); codeRows.push([6000 + ((k * 3) % activityCount), type, type === 1 ? 1 + (k % 5) : 6 + (k % 5), 500]); }
  table("TASKACTV", ["task_id", "actv_code_type_id", "actv_code_id", "proj_id"], codeRows);
  out.push("%E");

  const text = out.join("\n");
  const bytes = options.latin1 ? new Uint8Array(Array.from(text).map(ch => (ch.charCodeAt(0) < 256 ? ch.charCodeAt(0) : 63))) : new TextEncoder().encode(text);
  return { bytes, truth: { activityCodes, wbsCodes, started, finished, totalPlannedCost, currencyInHeader: currency, actuals } };
}
