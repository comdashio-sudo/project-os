import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parsePmcImportFile, planCatalog, pmcHeaderKey, weightsToCatalogRows } from "./pmcImport";

// Q-31 (P0-01): a weights table or a villa list as people really keep them — a title above the table, other sheets beside it, Arabic letter variants and
// brackets in the headers, Arabic digits, a totals line — is read; what cannot be read safely is refused with a reason that names the row and the column,
// never guessed. Synthetic data only.
async function workbook(sheets: Array<{ name: string; rows: unknown[][]; hidden?: boolean }>) {
  const book = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const ws = book.addWorksheet(sheet.name, sheet.hidden ? { state: "hidden" } : undefined);
    for (const row of sheet.rows) ws.addRow(row);
  }
  return new Uint8Array(await book.xlsx.writeBuffer());
}
const weights = async (rows: unknown[][], extra: Array<{ name: string; rows: unknown[][]; hidden?: boolean }> = []) =>
  parsePmcImportFile({ kind: "weights", format: "xlsx", bytes: await workbook([{ name: "Weights", rows }, ...extra]) });
const codes = (parsed: { errors: Array<{ code: string }> }) => parsed.errors.map(error => error.code);

describe("PMC import headers and sheets as real files have them (Q-31)", () => {
  it("POSITIVE: a title row above the table, the header is found below it, and row numbers are the sheet's own", async () => {
    const parsed = await weights([["Project weights — synthetic"], [], ["بند CSI", "البند الفرعي", "النشاط", "الوزن"], ["03", "Frame", "Columns", 60], [], ["03", "Frame", "Slabs", 40]]);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows.map(row => [row.rowNumber, row.cells.activityName])).toEqual([[4, "Columns"], [6, "Slabs"]]);
  });

  it("POSITIVE: Arabic letter variants, tatweel, brackets and a percent sign in the headers still name the fields", async () => {
    expect(pmcHeaderKey("القسـم")).toBe(pmcHeaderKey("القسم"));
    expect(pmcHeaderKey("Weight (%)")).toBe("weight");
    const parsed = await weights([["Section CSI", "Sub Item", "النشـاط", "Weight (%)"], ["03", "Frame", "Columns", 100]]);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0].cells).toMatchObject({ csi: "03", sub: "Frame", activityName: "Columns", weight: "100" });
  });

  it("POSITIVE: the activity column is «النشاط» even when «البند» sits beside it (the best-named column wins, not the leftmost)", async () => {
    const parsed = await weights([["بند CSI", "البند", "النشاط", "الوزن"], ["03", "Frame", "Columns", 100]]);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0].cells.activityName).toBe("Columns");
  });

  it("POSITIVE: other sheets (notes, a hidden one) beside the table do not refuse the file; the sheet with the columns is read", async () => {
    const parsed = await weights([["بند CSI", "النشاط", "الوزن"], ["03", "Columns", 100]], [{ name: "Notes", rows: [["Prepared for the synthetic project"]] }, { name: "Old", rows: [["x"]], hidden: true }]);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(1);
  });

  it("NEGATIVE: two sheets that both hold the columns are refused with their names — the server does not choose", async () => {
    const table = [["بند CSI", "النشاط", "الوزن"], ["03", "Columns", 100]];
    const parsed = await weights(table, [{ name: "Copy", rows: table }]);
    expect(parsed.errors).toEqual([{ rowNumber: 0, code: "IMPORT_SHEET_AMBIGUOUS", detail: "Weights | Copy" }]);
  });

  it("NEGATIVE: two columns that name the same field equally are refused with both names, and nothing is read", async () => {
    const parsed = await weights([["بند CSI", "النشاط", "الوزن", "Weight"], ["03", "Columns", 100, 100]]);
    expect(parsed.errors).toEqual([{ rowNumber: 1, code: "IMPORT_COLUMN_AMBIGUOUS", field: "weight", detail: "الوزن | Weight" }]);
    expect(parsed.rows).toEqual([]);
  });

  it("NEGATIVE: a missing required column is named, with the columns the file does have", async () => {
    const parsed = await weights([["Activity", "Weight"], ["Columns", 100]]);
    expect(parsed.errors).toEqual([{ rowNumber: 1, code: "IMPORT_REQUIRED_COLUMN_MISSING", field: "csi", detail: "Activity | Weight" }]);
  });

  it("POSITIVE: a totals line at the foot is skipped, not read as an activity; a real activity named like a deduction is kept", async () => {
    const parsed = await weights([["بند CSI", "النشاط", "الوزن"], ["03", "Columns", 60], ["03", "خصم الحواف", 40], ["الإجمالي", "", 100], ["Total", "Total", 100]]);
    expect(parsed.rows.map(row => row.cells.activityName)).toEqual(["Columns", "خصم الحواف"]);
  });

  it("POSITIVE: formatted but empty columns at the right do not count against the 20-column limit; 21 filled columns still do", async () => {
    const book = new ExcelJS.Workbook(); const ws = book.addWorksheet("W");
    ws.addRow(["بند CSI", "النشاط", "الوزن"]); ws.addRow(["03", "Columns", 100]);
    ws.getCell(1, 40).numFmt = "0.00"; ws.getCell(1, 40).value = null;
    expect(codes(await parsePmcImportFile({ kind: "weights", format: "xlsx", bytes: new Uint8Array(await book.xlsx.writeBuffer()) }))).toEqual([]);
    const wide = await weights([["بند CSI", "النشاط", "الوزن", ...Array.from({ length: 18 }, (_unused, i) => `Extra ${i}`)], ["03", "Columns", 100]]);
    expect(codes(wide)).toEqual(["IMPORT_TOO_MANY_COLUMNS"]);
  });

  it("POSITIVE: a CSV saved by older Excel in the Arabic code page (windows-1256) is read", async () => {
    const encode1256 = (text: string) => { const table = new TextDecoder("windows-1256"); const map = new Map<string, number>(); for (let b = 0; b < 256; b += 1) map.set(table.decode(new Uint8Array([b])), b); return new Uint8Array([...text].map(ch => map.get(ch) ?? 63)); };
    const parsed = await parsePmcImportFile({ kind: "weights", format: "csv", bytes: encode1256("القسم,النشاط,الوزن\n03,Columns,100\n") });
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0].cells).toMatchObject({ csi: "03", activityName: "Columns" });
  });

  it("the villa list (not weights) still refuses a column it does not know", async () => {
    const parsed = await parsePmcImportFile({ kind: "locations", format: "xlsx", bytes: await workbook([{ name: "V", rows: [["البلوك", "الفيلا", "النموذج", "ملاحظات"], ["B1", 1, "A", "x"]] }]) });
    expect(parsed.errors).toEqual([{ rowNumber: 1, code: "IMPORT_UNSUPPORTED_COLUMN", field: "ملاحظات" }]);
  });
});

describe("weights as people write them (Q-31)", () => {
  const row = (rowNumber: number, cells: Record<string, unknown>) => ({ rowNumber, cells });
  it("POSITIVE: Arabic-Indic digits, «٪», «٫» and a decimal comma are read as written", () => {
    const out = weightsToCatalogRows([row(2, { csi: "03", activityName: "A", weight: "٥٠٪" }), row(3, { csi: "03", activityName: "B", weight: "٢٥٫٥" }), row(4, { csi: "03", activityName: "C", weight: "24,5" })], ["M"]);
    expect(out.errors).toEqual([]);
    expect(out.rows.map(item => item.cells.weightPercent)).toEqual([50, 25.5, 24.5]);
  });

  it("NEGATIVE: text that is not a number is refused on its row, and a negative weight is still refused", () => {
    const out = weightsToCatalogRows([row(2, { csi: "03", activityName: "A", weight: "تقريبًا" }), row(3, { csi: "03", activityName: "B", weight: "-5" })], ["M"]);
    expect(out.errors.map(error => `${error.rowNumber}:${error.code}`)).toEqual(["2:IMPORT_INVALID_NUMBER", "3:IMPORT_INVALID_NUMBER"]);
  });
});

describe("a person's column mapping (Q-31, P0-02)", () => {
  const villas = async (rows: unknown[][], mappingOverride?: Record<string, string>) => parsePmcImportFile({ kind: "locations", format: "xlsx", bytes: await workbook([{ name: "V", rows }]), mappingOverride });

  it("POSITIVE: columns no alias names are read once a person maps them, and the report says which column each field came from", async () => {
    const unmapped = await villas([["Plot Block", "House", "Kind"], ["B1", 1, "A"]]);
    expect(codes(unmapped)).toEqual(expect.arrayContaining(["IMPORT_REQUIRED_COLUMN_MISSING"]));
    expect(unmapped.columns?.fields.find(field => field.key === "blockCode")).toEqual({ key: "blockCode", required: true, header: null });
    const mapped = await villas([["Plot Block", "House", "Kind"], ["B1", 1, "A"]], { blockCode: "Plot Block", unitNumber: "House", modelCode: "Kind" });
    expect(mapped.errors).toEqual([]);
    expect(mapped.rows[0].cells).toMatchObject({ blockCode: "B1", modelCode: "A" });
    expect(mapped.columns).toMatchObject({ overridden: true, headers: ["Plot Block", "House", "Kind"] });
  });

  it("POSITIVE: a mapping settles an ambiguity — the person says which of two weight columns is the weight", async () => {
    const parsed = await weights([["بند CSI", "النشاط", "الوزن", "Weight"], ["03", "Columns", 100, 7]].map(row => row), []);
    expect(codes(parsed)).toEqual(["IMPORT_COLUMN_AMBIGUOUS"]);
    const settled = await parsePmcImportFile({ kind: "weights", format: "xlsx", bytes: await workbook([{ name: "W", rows: [["بند CSI", "النشاط", "الوزن", "Weight"], ["03", "Columns", 100, 7]] }]), mappingOverride: { weight: "الوزن" } });
    expect(settled.errors).toEqual([]);
    expect(settled.rows[0].cells.weight).toBe("100");
  });

  it("NEGATIVE: a header the file does not have, a field the kind does not have, or one header for two fields is refused whole", async () => {
    const rows = [["البلوك", "الفيلا", "النموذج"], ["B1", 1, "A"]];
    expect((await villas(rows, { blockCode: "Block X" })).errors).toEqual([{ rowNumber: 0, code: "IMPORT_MAPPING_INVALID", detail: "Block X" }]);
    expect((await villas(rows, { salary: "البلوك" })).errors).toEqual([{ rowNumber: 0, code: "IMPORT_MAPPING_INVALID", detail: "salary" }]);
    expect((await villas(rows, { blockCode: "البلوك", modelCode: "البلوك" })).errors).toEqual([{ rowNumber: 0, code: "IMPORT_MAPPING_INVALID", detail: "البلوك" }]);
  });
});

describe("review of #370 and the owner's decisions of 18-11 (Q-47)", () => {
  it("POSITIVE (review of #370): an activity whose name starts with «Total» is an activity, not a totals line; its empty section takes the one above (Q-47), counted", async () => {
    const parsed = await weights([["CSI", "Activity", "Weight"], ["03", "Concrete", 60], ["", "Total station survey", 40]]);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows.map(row => [row.cells.csi, row.cells.activityName])).toEqual([["03", "Concrete"], ["03", "Total station survey"]]);
    expect(parsed.notes).toMatchObject({ skippedTotals: 0, filledDown: 1 });
  });

  it("NEGATIVE: an empty section with nothing above it is not invented — the row is kept and refused on its own line", async () => {
    const parsed = await weights([["CSI", "Activity", "Weight"], ["", "Footings", 60], ["03", "Slabs", 40]]);
    expect(parsed.rows.map(row => row.rowNumber)).toEqual([2, 3]);
    expect(weightsToCatalogRows(parsed.rows, ["A"]).errors).toEqual([{ rowNumber: 2, code: "PMC_CLASSIFICATION_BLANK", field: "groupCode" }]);
  });

  it("a real totals line (every filled label is total words) is skipped and COUNTED, never silent", async () => {
    const parsed = await weights([["CSI", "Activity", "Weight"], ["03", "Concrete", 100], ["الإجمالي", "", 100], ["", "Grand total", 100]]);
    expect(parsed.rows.map(row => row.cells.activityName)).toEqual(["Concrete"]);
    expect(parsed.notes).toMatchObject({ skippedTotals: 2, filledDown: 0 });
    // Q-50 4c: the preview says which rows were read and which were taken for totals
    expect(parsed.notes?.preview?.map(row => [row.row, row.class])).toEqual([[2, "data"], [3, "total"], [4, "total"]]);
  });

  it("Q-47: a weights total rounded for display (99.99–100.01) is accepted; 99.98 is still refused; the catalogue's own tolerance is unchanged", () => {
    const rows = (weights: number[]) => weights.map((weight, index) => ({ rowNumber: index + 2, cells: { modelCode: "A", groupCode: "03", groupName: "03", stageCode: "03 / 03", stageName: "03", activityCode: `A${index}`, activityName: `Activity ${index}`, weightPercent: weight } }));
    const context = (totalTolerance?: number) => ({ groups: new Map(), stages: new Map(), definitions: new Map(), activityCodesByModel: new Map(), wbsItems: new Map(), totalTolerance });
    expect(planCatalog(rows([33.33, 33.33, 33.33]), context(0.01)).errors).toEqual([]);
    expect(planCatalog(rows([33.34, 33.34, 33.33]), context(0.01)).errors).toEqual([]);
    expect(planCatalog(rows([33.33, 33.33, 33.32]), context(0.01)).errors.map(error => error.code)).toEqual(["PMC_MODEL_WEIGHTS_NOT_100"]);
    expect(planCatalog(rows([33.33, 33.33, 33.33]), context()).errors.map(error => error.code)).toEqual(["PMC_MODEL_WEIGHTS_NOT_100"]);
  });
});

describe("review of #371: «no column» and the columns no field takes", () => {
  it("NEGATIVE→fixed: «no column» (empty) for a field the reader found clears it — the column is no longer read", async () => {
    const book = await workbook([{ name: "W", rows: [["بند CSI", "Sub item", "النشاط", "Weight"], ["03", "Pour", "Columns", 100]] }]);
    const auto = await parsePmcImportFile({ kind: "weights", format: "xlsx", bytes: book });
    expect(auto.rows[0].cells.sub).toBe("Pour");
    const cleared = await parsePmcImportFile({ kind: "weights", format: "xlsx", bytes: book, mappingOverride: { sub: "", weight: "Weight" } });
    expect(cleared.errors).toEqual([]);
    expect(cleared.rows[0].cells.sub).toBeUndefined();
    expect(cleared.columns?.fields.find(field => field.key === "sub")?.header).toBeNull();
  });

  it("clearing a REQUIRED field makes it missing, as any missing column", async () => {
    const book = await workbook([{ name: "V", rows: [["البلوك", "الفيلا", "النموذج"], ["B1", 1, "A"]] }]);
    expect(codes(await parsePmcImportFile({ kind: "locations", format: "xlsx", bytes: book, mappingOverride: { modelCode: "" } }))).toEqual(["IMPORT_REQUIRED_COLUMN_MISSING"]);
  });

  it("an extra column a villa list does not know is refused — unless the person, having seen the list, asks to ignore the columns no field takes", async () => {
    const book = await workbook([{ name: "V", rows: [["البلوك", "الفيلا", "النموذج", "Notes"], ["B1", 1, "A", "x"]] }]);
    expect(codes(await parsePmcImportFile({ kind: "locations", format: "xlsx", bytes: book }))).toEqual(["IMPORT_UNSUPPORTED_COLUMN"]);
    const ignored = await parsePmcImportFile({ kind: "locations", format: "xlsx", bytes: book, mappingOverride: { __others__: "ignore" } });
    expect(ignored.errors).toEqual([]);
    expect(ignored.rows[0].cells).toMatchObject({ blockCode: "B1", modelCode: "A" });
    // any other value of the marker is refused, never guessed
    expect(codes(await parsePmcImportFile({ kind: "locations", format: "xlsx", bytes: book, mappingOverride: { __others__: "yes" } }))).toEqual(["IMPORT_MAPPING_INVALID"]);
  });
});
