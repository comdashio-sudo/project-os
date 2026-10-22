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
