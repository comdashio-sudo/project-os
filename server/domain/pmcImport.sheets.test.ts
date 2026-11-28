import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parsePmcImportFile } from "./pmcImport";

// Q-66 batch 1 (7) (adviser's I68): a file of several sheets — the reader says, for every sheet, whether it was read and why, so the review grid can show
// the sheets as tabs. Reporting only: which sheet is read is exactly as before (Q-31). Synthetic data only.
type Sheet = { name: string; rows: unknown[][]; hidden?: boolean };
async function file(sheets: Sheet[]) {
  const book = new ExcelJS.Workbook();
  for (const sheet of sheets) { const ws = book.addWorksheet(sheet.name, sheet.hidden ? { state: "hidden" } : undefined); for (const row of sheet.rows) ws.addRow(row); }
  return new Uint8Array(await book.xlsx.writeBuffer());
}
const weights = async (sheets: Sheet[]) => parsePmcImportFile({ kind: "weights", format: "xlsx", bytes: await file(sheets) });
const table = [["Synthetic weights"], ["بند CSI", "النشاط", "الوزن"], ["03", "Columns", 100]];

describe("Q-66 (7): every sheet of the file, read or not, and why", () => {
  it("POSITIVE: the sheet whose header names every field is read (with its header row); a sheet without the columns says which it lacks; a hidden one says so", async () => {
    const parsed = await weights([{ name: "Notes", rows: [["How to fill this file"]] }, { name: "Weights", rows: table }, { name: "Half", rows: [["النشاط", "الملاحظة"], ["Columns", "x"]] }, { name: "Old", rows: table, hidden: true }]);
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows).toHaveLength(1); // the choice is unchanged
    expect(parsed.notes?.sheets).toEqual([
      { name: "Notes", read: false, why: "missing", headerRow: 1, missing: expect.arrayContaining(["csi", "activityName", "weight"]) },
      { name: "Weights", read: true, why: "complete", headerRow: 2 },
      { name: "Half", read: false, why: "missing", headerRow: 1, missing: expect.arrayContaining(["csi", "weight"]) },
      { name: "Old", read: false, why: "hidden" },
    ]);
    expect(parsed.notes?.sheets?.[2].missing).not.toContain("activityName");
  });

  it("NEGATIVE: two complete sheets — nothing is read and both say why; a file whose read sheet lacks a column still lists the sheets beside the error", async () => {
    const ambiguous = await weights([{ name: "Weights", rows: table }, { name: "Copy", rows: table }]);
    expect(ambiguous.errors).toEqual([{ rowNumber: 0, code: "IMPORT_SHEET_AMBIGUOUS", detail: "Weights | Copy" }]);
    expect(ambiguous.rows).toEqual([]);
    expect(ambiguous.notes?.sheets).toEqual([{ name: "Weights", read: false, why: "ambiguous", headerRow: 2 }, { name: "Copy", read: false, why: "ambiguous", headerRow: 2 }]);
    const lacking = await weights([{ name: "Cover", rows: [["Synthetic"]] }, { name: "Weights", rows: [["بند CSI", "النشاط"], ["03", "Columns"]] }]);
    expect(lacking.errors.map(error => error.code)).toContain("IMPORT_REQUIRED_COLUMN_MISSING");
    expect(lacking.notes?.sheets?.map(sheet => [sheet.name, sheet.read, sheet.why])).toEqual([["Cover", false, "missing"], ["Weights", true, "closest"]]);
  });

  it("a one-sheet file and a CSV carry no sheet list (nothing to choose between)", async () => {
    expect((await weights([{ name: "Weights", rows: table }])).notes?.sheets).toBeUndefined();
    const csv = await parsePmcImportFile({ kind: "weights", format: "csv", bytes: new TextEncoder().encode("بند CSI,النشاط,الوزن\n03,Columns,100\n") });
    expect(csv.errors).toEqual([]);
    expect(csv.notes?.sheets).toBeUndefined();
  });

  it("a weights table with a column per model is read from its sheet (wide); the other sheets were not looked at", async () => {
    const parsed = await weights([{ name: "Cover", rows: [["Synthetic weights"]] }, { name: "By model", rows: [["م", "الرمز", "البند", "نموذج A", "نموذج B"], ["", "Q01", "الحفر", 1, 1], [1, "IP-001", "الحفر", 1, 1]] }]);
    expect(parsed.notes?.wide?.sheetName).toBe("By model");
    expect(parsed.notes?.sheets).toEqual([{ name: "Cover", read: false, why: "notRead" }, { name: "By model", read: true, why: "wide" }]);
  });
});
