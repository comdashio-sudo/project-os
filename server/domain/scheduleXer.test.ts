import { describe, expect, it } from "vitest";
import { analyzeScheduleImportFile, type ScheduleActivityImportRow, type ScheduleWbsImportRow } from "./dataImport";
import { realisticXer } from "../testing/importFixtures";

// Q-13: a real Primavera export repeats short WBS codes under different parents and puts many activities on one WBS. The importer used to treat every repeated short code
// as a duplicate (44 errors on a real file). A WBS is identified by its path; an activity by its task_code and tied to its WBS by wbs_id. Fabricated data only.
const wbsOf = (rows: unknown[]) => (rows as { kind: string }[]).filter(row => row.kind === "wbs") as ScheduleWbsImportRow[];
const activitiesOf = (rows: unknown[]) => (rows as { kind: string }[]).filter(row => row.kind === "activity") as ScheduleActivityImportRow[];

describe("XER schedule import: repeated short codes are not duplicates", () => {
  it("imports without errors and builds the tree from parent_wbs_id", async () => {
    const fixture = realisticXer();
    const result = await analyzeScheduleImportFile({ format: "xer", bytes: fixture.bytes });
    expect(result.errors).toEqual([]);
    expect(result.validRows.length).toBe(fixture.wbsCount + fixture.taskCount);
    const wbs = wbsOf(result.validRows);
    // unique short codes stay as they are; the repeated "1" and "2" become their full path
    expect(wbs.map(row => row.values.code).sort()).toEqual(["A", "B", "PRJ", "PRJ.A.1", "PRJ.A.1.1", "PRJ.A.2", "PRJ.A.2.1", "PRJ.B.1", "PRJ.B.1.1", "PRJ.B.2", "PRJ.B.2.1"].sort());
    const parentOf = Object.fromEntries(wbs.map(row => [row.values.code, row.values.parentCode ?? null]));
    expect(parentOf).toMatchObject({ PRJ: null, A: "PRJ", B: "PRJ", "PRJ.A.1": "A", "PRJ.A.2": "A", "PRJ.B.1": "B", "PRJ.B.2": "B", "PRJ.A.1.1": "PRJ.A.1", "PRJ.A.2.1": "PRJ.A.2", "PRJ.B.1.1": "PRJ.B.1", "PRJ.B.2.1": "PRJ.B.2" });
  });

  it("ties each activity to its own WBS by wbs_id, several activities to one WBS, never by the short code", async () => {
    const result = await analyzeScheduleImportFile({ format: "xer", bytes: realisticXer().bytes });
    const wbsCodeOf = Object.fromEntries(activitiesOf(result.validRows).map(row => [row.values.code, row.values.wbsCode]));
    expect(wbsCodeOf).toEqual({ T1: "PRJ.A.1.1", T2: "PRJ.A.1.1", T3: "PRJ.A.2.1", T4: "PRJ.B.1.1", T5: "PRJ.B.1.1", T6: "PRJ.B.1.1", T7: "PRJ.B.2.1", T8: "A" });
  });

  it("NEGATIVE: the same task_code twice is a real duplicate, reported once with its row and value", async () => {
    const result = await analyzeScheduleImportFile({ format: "xer", bytes: realisticXer({ repeatTaskCode: true }).bytes });
    expect(result.errors).toEqual([{ rowNumber: 11 + 8 + 1, code: "IMPORT_DUPLICATE_FILE_KEY", field: "activityCode", detail: "T3" }]);
    expect(activitiesOf(result.validRows).filter(row => row.values.code === "T3").length).toBe(1);
  });

  it("NEGATIVE: two siblings with the same short code under one parent are the same path, a real duplicate", async () => {
    const result = await analyzeScheduleImportFile({ format: "xer", bytes: realisticXer({ repeatSibling: true }).bytes });
    expect(result.errors.filter(error => error.field === "wbsCode")).toEqual([{ rowNumber: 12 + 1, code: "IMPORT_DUPLICATE_FILE_KEY", field: "wbsCode", detail: "PRJ.A.1" }]);
  });
});
