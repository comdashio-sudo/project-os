// A SYNTHETIC Primavera P6 export with the TABLE SIZES of a large villa schedule (Q-61): 16,469 activities, 46,592 relationships, 181,148 activity-code assignments,
// 1,413 WBS nodes — about 15 MB — and nothing else from any real file: every name, code and date is invented. A villa is a WBS node «Vnnn» whose ~13 activities
// carry codes in 11 code types, so the file has the shape the platform has to read (villa activities, the codes that say stage / zone / block / villa type).
const pad = (n: number, width = 2) => String(n).padStart(width, "0");
const day = (offset: number) => { const d = new Date(Date.UTC(2024, 0, 1)); d.setUTCDate(d.getUTCDate() + offset); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
export const LARGE_P6_COUNTS = { activities: 16_469, wbs: 1_413, relationships: 46_592, codeAssignments: 181_148, codeTypes: 11 } as const;
const TYPES = ["Stage", "Scope", "Weight Stage", "Zone", "Phase", "Trade", "CSI", "Block", "Villa Type", "Package", "Q Item"] as const;

export function buildLargeP6Xer(options: { counts?: Partial<typeof LARGE_P6_COUNTS> } = {}) {
  const counts = { ...LARGE_P6_COUNTS, ...options.counts };
  const out: string[] = [];
  const table = (name: string, fields: string[], rows: Array<Array<string | number>>) => { out.push(`%T\t${name}`, `%F\t${fields.join("\t")}`); for (const row of rows) out.push(`%R\t${row.join("\t")}`); };
  out.push("ERMHDR\t25.12\t2026-10-01\tProject\tadmin\tadmin\tdb\tProject Management\tSAR");
  table("CALENDAR", ["clndr_id", "default_flag", "clndr_name", "clndr_type", "day_hr_cnt", "week_hr_cnt", "clndr_data"], [[1, "Y", "Six day week", "CA_Project", 8, 48, "(0||CalendarData()())"]]);
  table("PROJECT", ["proj_id", "proj_short_name", "plan_start_date", "scd_end_date", "last_recalc_date", "clndr_id"], [[500, "SYN-LARGE", "2024-01-01 08:00", "2027-12-31 17:00", "2026-10-01 00:00", 1]]);
  // WBS: root, a few levels, then villas «V001…» as leaves
  const wbsRows: Array<Array<string | number>> = [[9000, 500, "Y", 0, "SYN", "Synthetic project", ""]];
  const villaWbs: number[] = [];
  const upper = Math.max(1, Math.floor(counts.wbs / 40));
  for (let i = 1; i < counts.wbs; i++) {
    if (i <= upper) wbsRows.push([9000 + i, 500, "N", i, `ZN${pad(i)}`, `Zone ${i}`, 9000]);
    else { const parent = 9000 + 1 + ((i - upper - 1) % upper); wbsRows.push([9000 + i, 500, "N", i, `V${pad(i - upper, 3)}`, `Villa ${i - upper}`, parent]); villaWbs.push(9000 + i); }
  }
  table("PROJWBS", ["wbs_id", "proj_id", "proj_node_flag", "seq_num", "wbs_short_name", "wbs_name", "parent_wbs_id"], wbsRows);
  table("ACTVTYPE", ["actv_code_type_id", "actv_short_len", "seq_num", "actv_code_type", "actv_code_type_scope"], TYPES.map((name, i) => [i + 1, 20, i + 1, name, "AS_Project"]));
  const valueRows: Array<Array<string | number>> = []; const perType = 30;
  TYPES.forEach((name, t) => { for (let v = 0; v < perType; v++) valueRows.push([t * 100 + v + 1, "", t + 1, `${name} value ${v}`, `${name.replace(/\W/g, "").slice(0, 4).toUpperCase()}${v}`, v]); });
  table("ACTVCODE", ["actv_code_id", "parent_actv_code_id", "actv_code_type_id", "actv_code_name", "short_name", "seq_num"], valueRows);
  const tasks: Array<Array<string | number>> = [];
  for (let i = 0; i < counts.activities; i++) {
    const wbs = villaWbs[i % villaWbs.length]; const villa = (wbs - 9000 - upper); const code = `V${pad(villa, 3)}.Q${pad(1 + (i % 13))}.${1000 + Math.floor(i / villaWbs.length)}`;
    const start = day(i % 900); const end = day((i % 900) + 14);
    tasks.push([6000 + i, 500, wbs, 1, "TT_Task", "TK_NotStart", code, `Synthetic activity ${i + 1} of villa ${villa} with a long enough name to look real`, 120, 120, 0, 0, `${start} 08:00`, `${end} 17:00`, "", ""]);
  }
  table("TASK", ["task_id", "proj_id", "wbs_id", "clndr_id", "task_type", "status_code", "task_code", "task_name", "target_drtn_hr_cnt", "remain_drtn_hr_cnt", "phys_complete_pct", "total_float_hr_cnt", "target_start_date", "target_end_date", "act_start_date", "act_end_date"], tasks);
  const preds: Array<Array<string | number>> = []; const seen = new Set<string>();
  for (let k = 0; preds.length < counts.relationships; k++) {
    const succ = 1 + (k % (counts.activities - 1)); const pred = Math.max(0, succ - 1 - ((k * 7) % Math.min(succ, 30)));
    const type = ["PR_FS", "PR_FS", "PR_SS", "PR_FF", "PR_SF"][k % 5]; const key = `${pred}-${succ}-${type}`; if (seen.has(key) || pred >= succ) continue; seen.add(key);
    preds.push([20000 + preds.length, 6000 + succ, 6000 + pred, 500, 500, type, (k % 4) * 8]);
  }
  table("TASKPRED", ["task_pred_id", "task_id", "pred_task_id", "proj_id", "pred_proj_id", "pred_type", "lag_hr_cnt"], preds);
  const codeRows: Array<Array<string | number>> = [];
  for (let k = 0; codeRows.length < counts.codeAssignments; k++) { const task = Math.floor(k / TYPES.length) % counts.activities; const type = k % TYPES.length; codeRows.push([6000 + task, type + 1, type * 100 + 1 + ((task + k) % perType), 500]); }
  table("TASKACTV", ["task_id", "actv_code_type_id", "actv_code_id", "proj_id"], codeRows);
  out.push("%E");
  return { bytes: new TextEncoder().encode(out.join("\n")), counts };
}
