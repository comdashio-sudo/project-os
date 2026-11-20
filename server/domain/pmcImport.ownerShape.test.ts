import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { ownerEditedWeights, ownerOriginalWeights } from "../testing/ownerWeightsFixtures";
import { cellText } from "./excelWorkbook";
import { parsePmcImportFile, planCatalog, weightsToCatalogRows } from "./pmcImport";

// Q-48: the owner's weights file, in two synthetic copies of its shape (server/testing/ownerWeightsFixtures.ts). On main before this change both fall:
// (a) throws «Cannot read properties of null (reading 'toString')» inside exceljs, (b) is refused as IMPORT_COLUMN_AMBIGUOUS. After it both read with
// no manual mapping, and every quiet choice (title rows, the division left aside, a totals line, a zero weight) is in the report.
const emptyContext = { groups: new Map(), stages: new Map(), definitions: new Map(), activityCodesByModel: new Map(), wbsItems: new Map() };
const parse = (bytes: Uint8Array, mappingOverride?: Record<string, string>) => parsePmcImportFile({ kind: "weights", format: "xlsx", bytes, mappingOverride });
const mapped = (parsed: Awaited<ReturnType<typeof parse>>) => Object.fromEntries((parsed.columns?.fields ?? []).map(field => [field.key, field.header]));

describe("reading a cell safely (Q-48 cause 1)", () => {
  it("NEGATIVE then POSITIVE: exceljs's own text throws on a covered cell of an unnamed merge; cellText reads it as empty, and an error result as its code", async () => {
    const book = new ExcelJS.Workbook();
    await book.xlsx.load((await ownerOriginalWeights()) as unknown as ArrayBuffer);
    const sheet = book.worksheets[0];
    expect(() => sheet.getCell("B8").text).toThrow(/toString/);
    expect(cellText(sheet.getCell("B8"))).toBe("");
    expect(cellText(sheet.getCell("B5"))).toBe("Division 03 مختلق");
    expect(cellText(sheet.getCell("A4"))).toBe("#REF!");
  });
});

describe("the owner's original file, shape (a)", () => {
  it("POSITIVE: read with no manual mapping — header in row 3 under two title rows, the owner's words, the division and the scope column left aside and shown", async () => {
    const parsed = await parse(await ownerOriginalWeights());
    expect(parsed.errors).toEqual([]);
    expect(mapped(parsed)).toMatchObject({ csi: "بند CSI", sub: "تصنيف داخلي", activityCode: "Activity Code", activityName: "البند الفرعي", weight: "NEW Percentage", modelCode: null, activityNameEn: "Activity Title" });
    expect(parsed.rows.map(row => [row.rowNumber, row.cells.activityName, row.cells.sub])).toEqual([
      [4, "صب القواعد", "هيكل"], [5, "صب الأعمدة", "هيكل"], [6, "صب السقف", "هيكل"], [7, "دهان داخلي", "تشطيب"], [8, "دهان خارجي", "تشطيب"], [9, "تنظيف نهائي", "تشطيب"],
    ]);
    expect(parsed.notes?.skippedTotals).toBe(1);
    const ignored = Object.fromEntries((parsed.notes?.ignoredColumns ?? []).map(column => [column.header, column.samples]));
    expect(Object.keys(ignored)).toEqual(["م", "القسم", "وزن القسم", "قيمة القسم", "Old Percentage", "(L)", "تفصيل البند في الجدول الزمني"]);
    expect(ignored["(L)"]).toEqual(["Whole Building", "Ground floor", "First floor"]);
  });

  it("POSITIVE: fractions of 1 become percentages, the zero weight is skipped and counted, and the model totals exactly 100", async () => {
    const parsed = await parse(await ownerOriginalWeights());
    const out = weightsToCatalogRows(parsed.rows, ["A"]);
    expect(out.errors).toEqual([]);
    expect(out.scaledFromFractions).toBe(true);
    expect(out.ignoredZeroWeight).toBe(1);
    expect(out.rows.map(row => [row.cells.activityCode, row.cells.groupCode, row.cells.stageName, row.cells.weightPercent])).toEqual([
      ["WIR.3.1.1", "03 30 00 خرسانة مختلقة", "هيكل", 25], ["WIR.3.1.2", "03 30 00 خرسانة مختلقة", "هيكل", 25], ["WIR.3.1.3", "03 30 00 خرسانة مختلقة", "هيكل", 20],
      ["WIR.9.1.1", "09 91 00 دهانات مختلقة", "تشطيب", 20], ["WIR.9.1.2", "09 91 00 دهانات مختلقة", "تشطيب", 10],
    ]);
    const plan = planCatalog(out.rows, emptyContext);
    expect(plan.errors).toEqual([]);
    expect(plan.counts.create).toBe(5);
  });

  it("NEGATIVE: a weight Excel could not compute (#REF!) is refused on its own row with the code, never read as zero", async () => {
    const parsed = await parse(await ownerOriginalWeights({ weightOfFirst: { formula: "#REF!", result: { error: "#REF!" } } as unknown as ExcelJS.CellValue }));
    expect(parsed.errors).toEqual([]);
    const out = weightsToCatalogRows(parsed.rows, ["A"]);
    expect(out.errors).toEqual([{ rowNumber: 4, code: "IMPORT_FORMULA_ERROR", field: "weightPercent", detail: "#REF!" }]);
  });
});

describe("the owner's edited copy, shape (b)", () => {
  it("POSITIVE: «القسم» written twice reads the later one (E) as the group and shows the earlier one (B) as left aside; «النشاط» is the stage", async () => {
    const parsed = await parse(await ownerEditedWeights());
    expect(parsed.errors).toEqual([]);
    expect(mapped(parsed)).toMatchObject({ csi: "القسم (E)", sub: "النشاط", activityName: "البند الفرعي", weight: "الوزن" });
    expect(parsed.columns?.headers).toEqual(["م", "القسم (B)", "وزن القسم", "قيمة القسم", "القسم (E)", "النشاط", "البند الفرعي", "الوزن"]);
    expect((parsed.notes?.ignoredColumns ?? []).map(column => column.header)).toEqual(["م", "القسم (B)", "وزن القسم", "قيمة القسم"]);
    const out = weightsToCatalogRows(parsed.rows, ["A"]);
    expect(out.errors).toEqual([]);
    expect(planCatalog(out.rows, emptyContext).errors).toEqual([]);
    expect(out.rows.map(row => row.cells.weightPercent)).toEqual([25, 25, 20, 20, 10]);
  });

  it("POSITIVE then NEGATIVE: a person can choose the other «القسم» by its letter; the division merged and left unnamed does NOT take the division above it", async () => {
    const parsed = await parse(await ownerEditedWeights(), { csi: "القسم (B)" });
    expect(parsed.errors).toEqual([]);
    expect(mapped(parsed).csi).toBe("القسم (B)");
    expect(parsed.rows.map(row => row.cells.csi)).toEqual(["Division 03 مختلق", "Division 03 مختلق", "Division 03 مختلق", "", ""]);
    expect(parsed.notes?.filledDown).toBe(0);
    const out = weightsToCatalogRows(parsed.rows, ["A"]);
    expect(out.errors.map(error => `${error.rowNumber}:${error.code}`)).toEqual(["5:PMC_CLASSIFICATION_BLANK", "6:PMC_CLASSIFICATION_BLANK"]);
  });

  it("NEGATIVE: a name that is not a column of the file is still refused whole", async () => {
    const parsed = await parse(await ownerEditedWeights(), { csi: "القسم" });
    expect(parsed.errors.map(error => error.code)).toEqual(["IMPORT_MAPPING_INVALID"]);
  });
});

describe("tables that do not use the owner's words read as before (Q-48 is decided per file)", () => {
  const sheet = async (rows: unknown[][]) => {
    const book = new ExcelJS.Workbook();
    const ws = book.addWorksheet("W");
    rows.forEach(row => ws.addRow(row));
    return new Uint8Array(await book.xlsx.writeBuffer());
  };

  it("NEGATIVE: without «النشاط» or «تصنيف داخلي», «البند الفرعي» is still the stage", async () => {
    const parsed = await parse(await sheet([["بند CSI", "البند الفرعي", "اسم النشاط", "الوزن"], ["03", "Frame", "Columns", 100]]));
    expect(parsed.errors).toEqual([]);
    expect(mapped(parsed)).toMatchObject({ csi: "بند CSI", sub: "البند الفرعي", activityName: "اسم النشاط" });
  });

  it("POSITIVE: with no row naming every field, the columns shown are those of the best header row (row 3), not of the empty title row", async () => {
    const parsed = await parse(await sheet([["عنوان مختلق"], ["قيمة مختلقة"], ["بند CSI", "تصنيف داخلي", "البند الفرعي", "ملاحظة"], ["03", "هيكل", "صب", "x"]]));
    expect(parsed.errors.map(error => `${error.rowNumber}:${error.code}:${error.field}`)).toEqual(["3:IMPORT_REQUIRED_COLUMN_MISSING:weight"]);
    expect(parsed.columns?.headers).toEqual(["بند CSI", "تصنيف داخلي", "البند الفرعي", "ملاحظة"]);
  });

  it("NEGATIVE: a villa list with an unnamed column that holds notes is not refused for it (an unnamed column was never a «column of unknown name»)", async () => {
    const parsed = await parsePmcImportFile({ kind: "locations", format: "xlsx", bytes: await sheet([["البلوك", "الفيلا", "النموذج", null], ["B1", 1, "A", "ملاحظة"]]) });
    expect(parsed.errors).toEqual([]);
  });
});

describe("«البند الفرعي» beside «النشاط»: the data tells the stage from the activity (Q-48 against the platform's own template)", () => {
  const sheet = async (rows: unknown[][]) => {
    const book = new ExcelJS.Workbook();
    const ws = book.addWorksheet("W");
    rows.forEach(row => ws.addRow(row));
    return new Uint8Array(await book.xlsx.writeBuffer());
  };
  const header = ["القسم", "البند الفرعي", "النشاط", "الوزن"];

  it("POSITIVE: the template's own layout (stage repeats under «البند الفرعي») reads as the template says", async () => {
    const parsed = await parse(await sheet([header, ["03", "هيكل", "صب القواعد", 50], ["03", "هيكل", "صب الأعمدة", 50]]));
    expect(mapped(parsed)).toMatchObject({ sub: "البند الفرعي", activityName: "النشاط" });
  });

  it("POSITIVE: the owner's layout (stage repeats under «النشاط») reads the other way", async () => {
    const parsed = await parse(await sheet([header, ["03", "صب القواعد", "هيكل", 50], ["03", "صب الأعمدة", "هيكل", 50]]));
    expect(mapped(parsed)).toMatchObject({ sub: "النشاط", activityName: "البند الفرعي" });
  });

  it("NEGATIVE: a tie (one row) keeps the template's reading, never a guess the other way", async () => {
    const parsed = await parse(await sheet([header, ["03", "هيكل", "صب القواعد", 100]]));
    expect(mapped(parsed)).toMatchObject({ sub: "البند الفرعي", activityName: "النشاط" });
  });
});

// I50 (adviser 20-11 04:10, on the owner's real files): the totals line writes «الإجمالي» in the unmapped «م» column (merged with the division cell), leaves
// every mapped label empty, and carries the rounded sum (0.99999) as its weight. It was refused as PMC_CLASSIFICATION_BLANK; it is a totals line, skipped and counted.
describe("Q-48 I50: a totals line whose word is in a column no field reads", () => {
  it("NEGATIVE on main, POSITIVE now: the original copy's totals line in «م» is skipped and counted, not refused; the model still totals exactly 100", async () => {
    const parsed = await parse(await ownerOriginalWeights({ totalIn: "serial" }));
    expect(parsed.errors).toEqual([]);
    expect(parsed.notes?.skippedTotals).toBe(1);
    expect(parsed.rows.some(row => row.rowNumber === 10)).toBe(false);
    const out = weightsToCatalogRows(parsed.rows, ["A"]);
    expect(out.errors).toEqual([]);
    expect(planCatalog(out.rows, emptyContext).errors).toEqual([]);
  });

  it("POSITIVE: the edited copy's totals line (row 7) is skipped and counted too", async () => {
    const parsed = await parse(await ownerEditedWeights({ withTotal: true }));
    expect(parsed.errors).toEqual([]);
    expect(parsed.notes?.skippedTotals).toBe(1);
    expect(parsed.rows.some(row => row.rowNumber === 7)).toBe(false);
  });

  it("NEGATIVE: a row with an activity name is never a totals line, even with «Total» in another column; a real section with no activity stays an error", async () => {
    const book = new ExcelJS.Workbook();
    const ws = book.addWorksheet("W");
    ws.getRow(1).values = ["م", "بند CSI", "تصنيف داخلي", "البند الفرعي", "NEW Percentage"];
    ws.getRow(2).values = ["Total", "03 مختلق", "هيكل", "صب القواعد", 0.5];
    ws.getRow(3).values = [2, "03 مختلق", "هيكل", "صب الأعمدة", 0.5];
    ws.getRow(4).values = ["الإجمالي", "09 مختلق", "", "", 1];
    const parsed = await parse(new Uint8Array(await book.xlsx.writeBuffer()));
    expect(parsed.notes?.skippedTotals ?? 0).toBe(0);
    expect(parsed.rows.map(row => row.rowNumber)).toEqual([2, 3, 4]); // row 4 names a real section: kept, and refused later on its own row
  });
});
