import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { buildImportGrid } from "./importGrid";
import { CLEANED_FILLS, cleanedWorkbook } from "./importGridWorkbook";

// Q-66 batch 1 (8): the cleaned copy of an import — the grid's rows in an xlsx with its colours and a notes column. Synthetic rows only.
const rows = buildImportGrid({
  preview: [
    { row: 4, class: "data", cells: { csi: "Q01", weight: "0.6" } },
    { row: 5, class: "data", cells: { csi: "", weight: "0.4" }, filled: { csi: "Q01" } },
    { row: 6, class: "data", cells: { csi: "Q02", weight: "0.12x" } },
    { row: 7, class: "total", cells: { csi: "Total", weight: "1" } },
  ],
  fields: ["csi", "weight"], errors: [{ rowNumber: 6, code: "IMPORT_INVALID_NUMBER", field: "weight" }], scaledFromFractions: true,
});
const fields = [{ key: "csi", header: "Section" }, { key: "weight", header: "W%" }];
const read = async (language: "ar" | "en" | "ur") => { const book = new ExcelJS.Workbook(); await book.xlsx.load(await cleanedWorkbook({ rows, fields, language })); return book.worksheets[0]; };
const argb = (cell: ExcelJS.Cell) => (cell.fill as ExcelJS.FillPattern | undefined)?.fgColor?.argb;

describe("Q-66 (8): the cleaned copy", () => {
  it("POSITIVE: the file's row numbers, the values as read (numbers as numbers), the state and the notes in words, in the grid's colours", async () => {
    const sheet = await read("en");
    expect((sheet.getRow(1).values as unknown[]).slice(1)).toEqual(["Row in the file", "Group (section or CSI item) (Section)", "Weight (W%)", "State", "Notes"]);
    expect((sheet.getRow(2).values as unknown[]).slice(1, 5)).toEqual([4, "Q01", 60, "Corrected"]);
    expect(sheet.getCell("E2").value).toBe("Weight: a fraction read as a percent (in the file «0.6»)");
    expect(argb(sheet.getCell("C2"))).toBe(CLEANED_FILLS.corrected);
    expect(argb(sheet.getCell("B2"))).toBeUndefined();
    expect(sheet.getCell("E3").value).toContain("Group (section or CSI item): taken from the row above (in the file «empty»)");
    expect(argb(sheet.getCell("C4"))).toBe(CLEANED_FILLS.error);
    expect(sheet.getCell("D4").value).toBe("Error");
    expect(sheet.getCell("E4").value).toBe("Weight: Not a valid number");
    expect(sheet.getCell("C4").value).toBe("0.12x"); // not a number: kept as the file wrote it
  });

  it("a row not read is grey and struck through with why; Arabic and Urdu read right to left with the header and row numbers frozen", async () => {
    const sheet = await read("ar");
    expect(argb(sheet.getCell("B5"))).toBe(CLEANED_FILLS.ignored);
    expect(sheet.getCell("B5").font?.strike).toBe(true);
    expect(sheet.getCell("E5").value).toBe("سطر مجموع: لا يُقرأ");
    expect(sheet.views[0]).toMatchObject({ state: "frozen", xSplit: 1, ySplit: 1, rightToLeft: true });
    expect((await read("en")).views[0]).toMatchObject({ rightToLeft: false });
    expect((await read("ur")).getCell("D1").value).toBe("حالت");
  });
});
