// Synthetic import files for the size tests. Invented codes and names only.
import ExcelJS from "exceljs";

/** A Primavera XER (PROJWBS + TASK, the two tables the importer accepts) of at least `targetBytes`, padded by a remarks column the importer ignores. */
export function syntheticXer(targetBytes: number, wbsCount = 400) {
  const lines = ["ERMHDR\t8.4\t2026-10-22\tProject\tadmin\tsynthetic", "%T\tPROJWBS", "%F\twbs_id\twbs_short_name\twbs_name\twbs_cost"];
  for (let index = 1; index <= wbsCount; index += 1) lines.push(`%R\t${index}\tW${index}\tWBS ${index}\t${index * 1000}`);
  lines.push("%T\tTASK", "%F\ttask_id\twbs_id\ttask_code\ttask_name\ttarget_start_date\ttarget_end_date\ttarget_cost\tstatus_code\tremarks");
  const padding = "x".repeat(380);
  let size = lines.join("\n").length; let activities = 0;
  while (size < targetBytes) {
    activities += 1;
    const line = `%R\t${activities}\t${(activities % wbsCount) + 1}\tA${activities}\tActivity ${activities}\t2026-01-01 08:00\t2026-02-01 17:00\t${activities}\tTK_NotStart\t${padding}`;
    lines.push(line); size += line.length + 1;
  }
  lines.push("%E");
  return { bytes: Buffer.from(lines.join("\n"), "utf8"), wbs: wbsCount, activities };
}

/** A schedule workbook with `rows` data rows (the WBS rows first, then activities). */
export async function syntheticScheduleWorkbook(rows: number, wbsCount = 400) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Schedule");
  sheet.addRow(["Record Type", "WBS Code", "WBS Name", "Activity Code", "Activity Name", "Planned Start", "Planned Finish", "Planned Value", "Status"]);
  for (let index = 1; index <= wbsCount; index += 1) sheet.addRow(["WBS", `W${index}`, `WBS ${index}`, "", "", "", "", index * 1000, ""]);
  for (let index = 1; index <= rows - wbsCount; index += 1) sheet.addRow(["Activity", `W${(index % wbsCount) + 1}`, "", `A${index}`, `Activity ${index}`, "2026-01-01", "2026-02-01", index, "not_started"]);
  return { bytes: Buffer.from(await workbook.xlsx.writeBuffer()), wbs: wbsCount, activities: rows - wbsCount };
}

/**
 * A small fabricated Primavera export shaped like a real one: a project root, two branches, and the short codes "1" and "2" repeated under different parents (which P6 allows),
 * with several activities on one WBS. `repeatTaskCode` reuses T3 (a true duplicate); `repeatSibling` adds a second "1" under the same parent (a true duplicate WBS path).
 */
export function realisticXer(options: { repeatTaskCode?: boolean; repeatSibling?: boolean } = {}) {
  const wbs = [
    // wbs_id, parent_wbs_id, short name, proj_node_flag
    ["1", "", "PRJ", "Y"], ["2", "1", "A", "N"], ["3", "1", "B", "N"],
    ["4", "2", "1", "N"], ["5", "2", "2", "N"], ["6", "3", "1", "N"], ["7", "3", "2", "N"],
    ["8", "4", "1", "N"], ["9", "5", "1", "N"], ["10", "6", "1", "N"], ["11", "7", "1", "N"],
    ...(options.repeatSibling ? [["12", "2", "1", "N"]] : []),
  ];
  const tasks = [["1", "8", "T1"], ["2", "8", "T2"], ["3", "9", "T3"], ["4", "10", "T4"], ["5", "10", "T5"], ["6", "10", "T6"], ["7", "11", "T7"], ["8", "2", options.repeatTaskCode ? "T3" : "T8"]];
  const lines = ["ERMHDR\t8.4\t2026-11-12\tProject\tadmin\tsynthetic", "%T\tPROJWBS", "%F\twbs_id\tparent_wbs_id\twbs_short_name\twbs_name\twbs_cost\tproj_node_flag"];
  for (const [id, parent, short, flag] of wbs) lines.push(`%R\t${id}\t${parent}\t${short}\tWBS ${id}\t${Number(id) * 100}\t${flag}`);
  lines.push("%T\tTASK", "%F\ttask_id\twbs_id\ttask_code\ttask_name\ttarget_start_date\ttarget_end_date\ttarget_cost\tstatus_code");
  for (const [id, wbsId, code] of tasks) lines.push(`%R\t${id}\t${wbsId}\t${code}\tActivity ${id}\t2026-01-01 08:00\t2026-02-01 17:00\t${Number(id) * 10}\tTK_NotStart`);
  lines.push("%E");
  return { bytes: Buffer.from(lines.join("\n"), "utf8"), wbsCount: wbs.length, taskCount: tasks.length };
}
