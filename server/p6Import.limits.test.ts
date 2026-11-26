import { describe, expect, it } from "vitest";
import { sync } from "./p6Import";
import { readP6, type XerFile } from "./domain/smartImport/p6Xer";
import { xerTableOverLimit } from "./domain/excelWorkbook";

// Q-61 (1): the two limits that stopped a large villa schedule, with no database. Each test fails on the code before this batch.
const rows = (count: number, make: (index: number) => Record<string, string>) => Array.from({ length: count }, (_unused, index) => make(index));
const file = (tables: Record<string, Array<Record<string, string>>>): XerFile => ({ version: "25.12", exportedAt: null, currency: "SAR", encoding: "utf-8", tables: new Map(Object.entries(tables).map(([name, list]) => [name, { name, fields: Object.keys(list[0] ?? {}), rows: list }])) } as XerFile);
const wbsRows = (count: number) => rows(count, i => ({ wbs_id: `w${i}`, proj_id: "1", proj_node_flag: i === 0 ? "Y" : "N", seq_num: String(i), wbs_short_name: `W${i}`, wbs_name: `Node ${i}`, parent_wbs_id: i === 0 ? "" : "w0" }));
const taskRows = (count: number) => rows(count, i => ({ task_id: `t${i}`, proj_id: "1", wbs_id: "w1", task_code: `A${i}`, task_name: `Activity ${i}`, status_code: "TK_NotStart" }));

describe("recording the ids of what an import created (Q-61 1)", () => {
  it("records 181,148 new rows without overflowing the call stack, and returns their count", async () => {
    const desired = Array.from({ length: 181_148 }, (_unused, index) => ({ id: `id-${index}`, key: `k-${index}` }));
    const created: string[] = []; let inserted = 0;
    const counts = await sync({ created, desired, existing: new Map(), key: item => item.key, same: () => true, insert: async batch => { inserted += batch.length; }, update: async () => undefined });
    expect(counts).toEqual({ create: 181_148, update: 0, unchanged: 0, absent: 0 });
    expect(inserted).toBe(181_148); expect(created).toHaveLength(181_148); expect(created[181_147]).toBe("id-181147"); // before: RangeError: Maximum call stack size exceeded
  });
});

describe("the row limit of a Primavera file is per table, not the sum of two (Q-61 1)", () => {
  it("accepts 100,000 activities and 100,000 WBS nodes together (200,000 lines: over the old sum, each table within its own limit)", () => {
    const model = readP6(file({ TASK: taskRows(100_000), PROJWBS: wbsRows(100_000) }));
    expect(model.issues.map(issue => issue.code)).not.toContain("IMPORT_TOO_MANY_ROWS");
  });
  it("accepts 16,469 activities with 181,148 activity-code lines", () => {
    const codes = rows(181_148, i => ({ task_id: `t${i % 16_469}`, actv_code_type_id: "1", actv_code_id: "1", proj_id: "1" }));
    expect(readP6(file({ TASK: taskRows(16_469), PROJWBS: wbsRows(10), TASKACTV: codes })).issues.map(issue => issue.code)).not.toContain("IMPORT_TOO_MANY_ROWS");
  });
  it("NEGATIVE: a table over its own limit is still refused, and the answer names the table", () => {
    const model = readP6(file({ TASK: taskRows(150_001), PROJWBS: wbsRows(2) }));
    expect(model.issues).toContainEqual({ code: "IMPORT_TOO_MANY_ROWS", detail: "TASK" });
    expect(xerTableOverLimit(table => (table === "TASKACTV" ? 1_000_001 : 0))).toBe("TASKACTV");
    expect(xerTableOverLimit(() => 0)).toBeNull();
  });
});
