import type ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { ownerOriginalWeights } from "../testing/ownerWeightsFixtures";
import { parsePmcImportFile, PMC_PREVIEW_ROWS, weightsToCatalogRows, type PmcImportEdits } from "./pmcImport";

// Q-50 batch 4: a person corrects a cell (or leaves a row out) in the preview instead of going back to Excel. The owner-shaped synthetic file
// (server/testing/ownerWeightsFixtures.ts) with a #REF! in the weight of its first activity (row 4) is the case the owner met.
const broken = () => ownerOriginalWeights({ weightOfFirst: { formula: "#REF!", result: { error: "#REF!" } } as unknown as ExcelJS.CellValue });
const parse = (bytes: Uint8Array, edits?: PmcImportEdits) => parsePmcImportFile({ kind: "weights", format: "xlsx", bytes, edits });
const weightOf = (parsed: Awaited<ReturnType<typeof parse>>, row: number) => parsed.rows.find(item => item.rowNumber === row)?.cells.weight;

describe("cell corrections in the preview (Q-50 batch 4)", () => {
  it("NEGATIVE baseline: the #REF! weight is a row error, as before", async () => {
    const parsed = await parse(await broken());
    expect(parsed.errors).toEqual([]);
    expect(weightsToCatalogRows(parsed.rows, ["A"]).errors).toEqual([expect.objectContaining({ rowNumber: 4, code: "IMPORT_FORMULA_ERROR" })]);
  });

  it("POSITIVE: the corrected weight is read instead of the file's, the report keeps both values, and the stored bytes are untouched", async () => {
    const bytes = await broken();
    const before = Buffer.from(bytes).toString("base64");
    const parsed = await parse(bytes, { cells: [{ row: 4, field: "weight", value: "0.25" }], ignoreRows: [] });
    expect(parsed.errors).toEqual([]);
    expect(weightOf(parsed, 4)).toBe("0.25");
    expect(parsed.notes?.edits).toEqual([{ row: 4, field: "weight", header: "NEW Percentage", from: "#REF!", to: "0.25" }]);
    const translated = weightsToCatalogRows(parsed.rows, ["A"]);
    expect(translated.errors).toEqual([]);
    expect(translated.rows.reduce((sum, row) => sum + Number(row.cells.weightPercent), 0)).toBeCloseTo(100, 6);
    expect(Buffer.from(bytes).toString("base64")).toBe(before);
  });

  it("POSITIVE: a row left out is not read at all (its error goes with it) and is listed in the report", async () => {
    const parsed = await parse(await broken(), { cells: [], ignoreRows: [4] });
    expect(parsed.rows.map(row => row.rowNumber)).toEqual([5, 6, 7, 8, 9]);
    expect(parsed.notes?.ignoredRows).toEqual([4]);
    expect(weightsToCatalogRows(parsed.rows, ["A"]).errors.filter(error => error.code === "IMPORT_FORMULA_ERROR")).toEqual([]);
  });

  it("NEGATIVE: a correction of a row the table does not have, or of a field no column is read for, is refused with that row — nothing is read", async () => {
    const outside = await parse(await broken(), { cells: [{ row: 99, field: "weight", value: "0.25" }], ignoreRows: [] });
    expect(outside.rows).toEqual([]);
    expect(outside.errors).toEqual([{ rowNumber: 99, code: "IMPORT_EDIT_INVALID", field: "weight" }]);
    const unmapped = await parse(await broken(), { cells: [{ row: 4, field: "modelCode", value: "A" }], ignoreRows: [] });
    expect(unmapped.errors).toEqual([{ rowNumber: 4, code: "IMPORT_EDIT_INVALID", field: "modelCode" }]);
    const titleRow = await parse(await broken(), { cells: [], ignoreRows: [2] });
    expect(titleRow.errors).toEqual([{ rowNumber: 2, code: "IMPORT_EDIT_INVALID" }]);
  });

  it("NEGATIVE: no corrections means the file is read exactly as before", async () => {
    const plain = await parse(await broken());
    const empty = await parse(await broken(), { cells: [], ignoreRows: [] });
    expect(empty).toEqual(plain);
  });
});

describe("row classes in the preview (Q-50 batch 4c)", () => {
  it("POSITIVE: every row read is classed — data, the totals line, a row left out — with the cells of its mapped fields", async () => {
    const parsed = await parse(await ownerOriginalWeights(), { cells: [], ignoreRows: [9] });
    expect(parsed.notes?.preview?.map(row => [row.row, row.class])).toEqual([[4, "data"], [5, "data"], [6, "data"], [7, "data"], [8, "data"], [9, "leftOut"], [10, "total"]]);
    expect(parsed.notes?.preview?.[0].cells).toMatchObject({ activityName: "صب القواعد", activityCode: "WIR.3.1.1", weight: "0.25" });
  });

  it("POSITIVE: a row the reader took for totals is read as data when the person says so, and the report lists it", async () => {
    const parsed = await parse(await ownerOriginalWeights(), { cells: [{ row: 10, field: "activityName", value: "تسليم مختلق" }, { row: 10, field: "activityCode", value: "WIR.9.9.9" }, { row: 10, field: "csi", value: "09 91 00 دهانات مختلقة" }], ignoreRows: [], readRows: [10] });
    expect(parsed.errors).toEqual([]);
    expect(parsed.notes?.skippedTotals).toBe(0);
    expect(parsed.notes?.readRows).toEqual([10]);
    expect(parsed.rows.map(row => row.rowNumber)).toContain(10);
  });

  it("NEGATIVE: «read as data» for a row the table does not have is refused with that row; the preview stops at its limit", async () => {
    const refused = await parse(await ownerOriginalWeights(), { cells: [], ignoreRows: [], readRows: [50] });
    expect(refused.errors).toEqual([{ rowNumber: 50, code: "IMPORT_EDIT_INVALID" }]);
    const plain = await parse(await ownerOriginalWeights());
    expect(plain.notes?.preview?.length).toBeLessThanOrEqual(PMC_PREVIEW_ROWS);
  });
});
