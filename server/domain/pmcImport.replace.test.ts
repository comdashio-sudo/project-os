import { describe, expect, it } from "vitest";
import { parsePmcImportFile, type PmcImportEdits } from "./pmcImport";

// Q-66 batch 1 (5b): «apply this correction to every cell like it» — a rule over one column, read by the PMC reader itself. Synthetic villas only.
const csv = Buffer.from("Block Code,Unit Number,Model Code\nB1,1,a\nB1,2,a\nB1,3,B\nB1,4,a\nB1,5, a \n", "utf8");
const parse = (edits?: PmcImportEdits, previewLimit?: number) => parsePmcImportFile({ kind: "locations", format: "csv", bytes: csv, edits, ...(previewLimit ? { previewLimit } : {}) });
const models = (parsed: Awaited<ReturnType<typeof parse>>) => parsed.rows.map(row => [row.rowNumber, row.cells.modelCode]);

describe("Q-66 (5b): a «same value» rule", () => {
  it("POSITIVE: every cell of the column that reads «a» is read «A» (spaces around the value do not count), counted in the notes and marked on each row", async () => {
    const parsed = await parse({ cells: [], ignoreRows: [], replace: [{ field: "modelCode", from: "a", to: "A" }] }, 100);
    expect(parsed.errors).toEqual([]);
    expect(models(parsed)).toEqual([[2, "A"], [3, "A"], [4, "B"], [5, "A"], [6, "A"]]);
    expect(parsed.notes?.replaced).toEqual([{ field: "modelCode", header: "Model Code", from: "a", to: "A", cells: 4 }]);
    expect(parsed.notes?.preview?.map(row => row.replaced ?? null)).toEqual([{ modelCode: "a" }, { modelCode: "a" }, null, { modelCode: "a" }, { modelCode: "a" }]);
  });

  it("B's note on #593: spaces around the new value are trimmed too, so «A » is read and checked as «A»", async () => {
    const parsed = await parse({ cells: [], ignoreRows: [], replace: [{ field: "modelCode", from: "a", to: " A  " }] }, 100);
    expect(models(parsed)).toEqual([[2, "A"], [3, "A"], [4, "B"], [5, "A"], [6, "A"]]);
    expect(parsed.notes?.replaced?.[0].to).toBe("A");
  });

  it("a cell corrected by itself keeps its own value over the rule, and its correction names the file's value", async () => {
    const parsed = await parse({ cells: [{ row: 5, field: "modelCode", value: "C" }], ignoreRows: [], replace: [{ field: "modelCode", from: "a", to: "A" }] }, 100);
    expect(models(parsed)).toContainEqual([5, "C"]);
    expect(parsed.notes?.edits).toEqual([{ row: 5, field: "modelCode", header: "Model Code", from: "a", to: "C" }]);
    expect(parsed.notes?.preview?.find(row => row.row === 5)?.replaced).toBeUndefined();
  });

  it("NEGATIVE: a rule no cell matches, or for a field no column is read for, is refused by name — never dropped silently", async () => {
    const none = await parse({ cells: [], ignoreRows: [], replace: [{ field: "modelCode", from: "Z", to: "A" }] });
    expect(none.rows).toEqual([]);
    expect(none.errors).toEqual([{ rowNumber: 0, code: "IMPORT_EDIT_INVALID", field: "modelCode", detail: "Z" }]);
    const unread = await parse({ cells: [], ignoreRows: [], replace: [{ field: "zoneName", from: "a", to: "A" }] });
    expect(unread.errors).toEqual([{ rowNumber: 0, code: "IMPORT_EDIT_INVALID", field: "zoneName", detail: "a" }]);
  });
});
