import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parsePmcImportFile, weightsToCatalogRows } from "../pmcImport";
import { applyOutline, outlineSegments } from "./outline";

// Q-50 batch 5b: a weights file with no section column, numbered as a hierarchy. Synthetic data only.
const row = (rowNumber: number, cells: Record<string, unknown>) => ({ rowNumber, cells });

async function xlsx(lines: unknown[][]): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Weights");
  for (const line of lines) sheet.addRow(line);
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

describe("outlineSegments", () => {
  it("reads plain, prefixed and Arabic-Indic numbering", () => {
    expect(outlineSegments("1.2.3")).toEqual([1, 2, 3]);
    expect(outlineSegments("WIR.2.1.1")).toEqual([2, 1, 1]);
    expect(outlineSegments("١٫٢")).toEqual([1, 2]);
    expect(outlineSegments(3)).toEqual([3]);
  });
  it("is null for what is not a numbering (negative)", () => {
    for (const value of ["", "Concrete", "1-2", "2026-11-20", "1..2", null]) expect(outlineSegments(value)).toBeNull();
  });
});

describe("applyOutline", () => {
  it("a heading names the group, the deepest heading above names the stage, and headings are removed and counted", () => {
    const rows = [
      row(2, { outline: "1", activityName: "Structure" }),
      row(3, { outline: "1.1", activityName: "Concrete" }),
      row(4, { outline: "1.1.1", activityName: "Footings", weight: 30 }),
      row(5, { outline: "1.1.2", activityName: "Slabs", weight: 20 }),
      row(6, { outline: "1.2", activityName: "Block work", weight: 10 }),
      row(7, { outline: "2", activityName: "Finishes" }),
      row(8, { outline: "2.1", activityName: "Paint", weight: 40 }),
    ];
    expect(applyOutline(rows, cells => cells.outline)).toEqual({ headings: 3, placed: 4 });
    expect(rows.map(item => `${item.rowNumber}|${item.cells.csi}|${item.cells.sub ?? ""}`)).toEqual([
      "4|1 Structure|1.1 Concrete", "5|1 Structure|1.1 Concrete", "6|1 Structure|", "8|2 Finishes|",
    ]);
  });

  it("an activity with no heading above it stays without a group (refused later on its row), and a filled cell is never overwritten (negative)", () => {
    const rows = [row(2, { outline: "7.1", activityName: "Orphan", weight: 50 }), row(3, { outline: "8", activityName: "Group" }), row(4, { outline: "8.1", csi: "Own", activityName: "Kept", weight: 50 })];
    applyOutline(rows, cells => cells.outline);
    expect(rows.map(item => item.cells.csi ?? "")).toEqual(["", "Own"]);
    const out = weightsToCatalogRows(rows, ["A"]);
    expect(out.errors.map(error => `${error.rowNumber}:${error.code}`)).toEqual(["2:PMC_CLASSIFICATION_BLANK"]);
  });
});

describe("a numbered weights file with no section column (Q-50 batch 5b)", () => {
  it("is read without mapping: headings give group and stage, the activities total 100", async () => {
    const bytes = await xlsx([
      ["No", "Description", "Weight"],
      ["1", "Structure", null],
      ["1.1", "Concrete", null],
      ["1.1.1", "Footings", 0.3],
      ["1.1.2", "Slabs", 0.2],
      ["2", "Finishes", null],
      ["2.1", "Paint", 0.5],
    ]);
    const parsed = await parsePmcImportFile({ kind: "weights", format: "xlsx", bytes });
    expect(parsed.errors).toEqual([]);
    expect(parsed.notes?.outlineHeadings).toBe(3);
    const out = weightsToCatalogRows(parsed.rows, ["A"]);
    expect(out.errors).toEqual([]);
    expect(out.rows.map(item => `${item.cells.groupName}|${item.cells.stageName}|${item.cells.activityName}|${item.cells.weightPercent}`)).toEqual([
      "1 Structure|1.1 Concrete|Footings|30", "1 Structure|1.1 Concrete|Slabs|20", "2 Finishes|2 Finishes|Paint|50",
    ]);
  });

  it("a file with a section column keeps reading the section from it; the numbering does not override it", async () => {
    const bytes = await xlsx([["No", "Section", "Description", "Weight"], ["1", "S1", "Head", null], ["1.1", "03", "Footings", 100]]);
    const parsed = await parsePmcImportFile({ kind: "weights", format: "xlsx", bytes });
    expect(parsed.errors).toEqual([]);
    expect(parsed.notes?.outlineHeadings).toBeUndefined();
    expect(parsed.rows.map(item => item.cells.csi)).toEqual(["S1", "03"]);
  });

  it("with neither a section column nor a numbering column the section is still a missing required column (negative)", async () => {
    const bytes = await xlsx([["Description", "Weight"], ["Footings", 100]]);
    const parsed = await parsePmcImportFile({ kind: "weights", format: "xlsx", bytes });
    expect(parsed.errors.map(error => `${error.code}:${error.field}`)).toContain("IMPORT_REQUIRED_COLUMN_MISSING:csi");
  });
});
