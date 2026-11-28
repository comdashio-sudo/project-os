import { describe, expect, it } from "vitest";
import { buildImportGrid, countGrid, filterGrid } from "./importGrid";

// Q-66 batch 1: the review grid of an import, built from what the importer's own reader found. Synthetic data only.
const fields = ["csi", "activityName", "weight"];
const preview = [
  { row: 5, class: "data" as const, cells: { csi: "Q01", activityName: "Blockwork", weight: "0.6" } },
  { row: 6, class: "data" as const, cells: { csi: "", activityName: "Plaster", weight: "0.4" }, filled: { csi: "Q01" } },
  { row: 7, class: "total" as const, cells: { csi: "", activityName: "Total", weight: "1" } },
  { row: 8, class: "data" as const, cells: { csi: "Q02", activityName: "Roof slab", weight: "abc" } },
  { row: 9, class: "leftOut" as const, cells: { csi: "Phase 1", activityName: "", weight: "" } },
  { row: 10, class: "data" as const, cells: { csi: "Q02", activityName: "Tiles (edited)", weight: "0" } },
];
const errors = [{ rowNumber: 8, code: "IMPORT_INVALID_NUMBER", field: "weight" }, { rowNumber: 10, code: "PMC_DUPLICATE_ACTIVITY" }, { rowNumber: 7, code: "SHOULD_NOT_SHOW", field: "weight" }];
const edits = [{ row: 10, field: "activityName", header: "Activity", from: "Tiles", to: "Tiles (edited)" }];

describe("Q-66 batch 1: the import review grid", () => {
  const rows = buildImportGrid({ preview, fields, errors, edits, scaledFromFractions: true });
  const byRow = Object.fromEntries(rows.map(row => [row.row, row]));

  it("POSITIVE: each cell says what the reader did — a fraction read as a percent, a section filled from above, a person's correction — with the file's value kept", () => {
    expect(byRow[5]).toMatchObject({ status: "corrected", cells: { weight: { value: "60", from: "0.6", why: "fraction" }, csi: { value: "Q01" } } });
    expect(byRow[5].cells.csi.why).toBeUndefined();
    expect(byRow[6].cells.csi).toEqual({ value: "Q01", from: "", why: "filledDown" });
    expect(byRow[10].cells.activityName).toMatchObject({ value: "Tiles (edited)", from: "Tiles", why: "edited" });
  });

  it("NEGATIVE: a reason sits on the cell of its field (or on the row when it names none) and the row is an error; a totals line or a row left out is ignored, never an error", () => {
    expect(byRow[8]).toMatchObject({ status: "error", cells: { weight: { value: "abc", errors: [{ code: "IMPORT_INVALID_NUMBER" }] } } });
    expect(byRow[8].cells.weight.why).toBeUndefined(); // not a number: not «read as a percent»
    expect(byRow[10]).toMatchObject({ status: "error", rowErrors: [{ code: "PMC_DUPLICATE_ACTIVITY" }] });
    expect(byRow[7]).toMatchObject({ status: "ignored", class: "total", rowErrors: [] });
    expect(byRow[7].cells.weight.errors).toBeUndefined();
    expect(byRow[9]).toMatchObject({ status: "ignored", class: "leftOut" });
  });

  it("tabs count over the whole file («ready» includes the corrected), and the search finds a value as read, as in the file, or a row number", () => {
    expect(countGrid(rows)).toEqual({ all: 6, ready: 2, corrected: 2, errors: 2, ignored: 2 });
    expect(filterGrid(rows, "errors").map(row => row.row)).toEqual([8, 10]);
    expect(filterGrid(rows, "all", "roof").map(row => row.row)).toEqual([8]);
    expect(filterGrid(rows, "all", "0.6").map(row => row.row)).toEqual([5]); // the file's value before it was read as 60
    expect(filterGrid(rows, "all", "9").map(row => row.row)).toEqual([9]);
    expect(filterGrid(rows, "ready", "Roof")).toEqual([]);
  });

  it("a weights table's reasons name the catalogue's fields: they are shown on the file's column (weightPercent → weight, groupCode → section)", () => {
    const [row] = buildImportGrid({ preview: [{ row: 4, class: "data", cells: { csi: "", weight: "0.12x" } }], fields: ["csi", "weight"], errors: [{ rowNumber: 4, code: "IMPORT_INVALID_NUMBER", field: "weightPercent" }, { rowNumber: 4, code: "PMC_CLASSIFICATION_BLANK", field: "groupCode" }], fieldOf: { weightPercent: "weight", groupCode: "csi" } });
    expect(row.cells.weight.errors).toEqual([{ code: "IMPORT_INVALID_NUMBER" }]);
    expect(row.cells.csi.errors).toEqual([{ code: "PMC_CLASSIFICATION_BLANK" }]);
    expect(row.rowErrors).toEqual([]);
    // without the map the reason still shows, on the row
    expect(buildImportGrid({ preview: [{ row: 4, class: "data", cells: { weight: "x" } }], fields: ["weight"], errors: [{ rowNumber: 4, code: "IMPORT_INVALID_NUMBER", field: "weightPercent" }] })[0].rowErrors).toEqual([{ code: "IMPORT_INVALID_NUMBER" }]);
  });

  it("Q-66 (5b): a cell a «same value» rule changed is corrected, with the file's value", () => {
    const [row] = buildImportGrid({ preview: [{ row: 3, class: "data", cells: { modelCode: "A" }, replaced: { modelCode: "a" } }], fields: ["modelCode"], errors: [] });
    expect(row).toMatchObject({ status: "corrected", cells: { modelCode: { value: "A", from: "a", why: "replaced" } } });
  });

  it("a file of whole percents is shown as written (no fraction marks)", () => {
    const plain = buildImportGrid({ preview: [{ row: 2, class: "data", cells: { weight: "60" } }], fields: ["weight"], errors: [], scaledFromFractions: false });
    expect(plain[0]).toMatchObject({ status: "ready", cells: { weight: { value: "60" } } });
    expect(plain[0].cells.weight.why).toBeUndefined();
  });
});
