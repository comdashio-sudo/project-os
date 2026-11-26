import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parsePmcImportFile, planLocations, type LocationsContext } from "./pmcImport";

// Q-60 batch 2b (the owner's villa register, 26-11): one sheet, row 1 empty, headers in row 2 — «Villa» (Villa 700) and «Villa» again (700), Type, Package,
// Block, Phase, «Mock-up villa», «WBS code (villa)» whose every cell is #REF!. Synthetic copy of the shape only; no real data.
async function register(rows: unknown[][], headers = ["Villa", "Villa", "Type", "Package", "Block", "Phase", "Mock-up villa", "WBS code (villa)"]) {
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("Villas");
  sheet.addRow([]);
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  // the broken link: a formula cell whose cached value is the #REF! error, as the owner's file holds
  const wbsColumn = headers.indexOf("WBS code (villa)") + 1;
  for (let index = 0; index < rows.length; index += 1) sheet.getCell(index + 3, wbsColumn).value = { formula: "#REF!", result: { error: "#REF!" } } as never;
  return new Uint8Array(await book.xlsx.writeBuffer());
}
const ROWS = [
  ["Villa 700", 700, "A-End", "Gold", "BLK 33", "PH1", "Yes"], ["Villa 701", 701, "B", "Gold", "BLK 33", "PH1", ""],
  ["Villa 702", 702, "C+", "Diamond", "BLK 34", "PH2", "No"], ["Villa 703", 703, "D", "Diamond", "BLK 34", "PH2", null],
];
const empty = (): LocationsContext => ({ zones: new Map(), blocks: new Map(), units: new Map() });

describe("the owner's villa register shape (Q-60 batch 2b)", () => {
  it("POSITIVE: the numeric «Villa» column is read, Phase / Package / Mock-up are kept, the #REF! column is set aside with a note — nothing refused", async () => {
    const parsed = await parsePmcImportFile({ kind: "locations", format: "xlsx", bytes: await register(ROWS) });
    expect(parsed.errors).toEqual([]);
    expect(parsed.notes?.chosenColumns).toEqual([expect.objectContaining({ field: "unitNumber" })]);
    expect(parsed.notes?.errorColumns).toEqual(["WBS code (villa)"]);
    const plan = planLocations(parsed.rows, empty());
    expect(plan.errors).toEqual([]);
    expect(plan.newUnits.map(unit => [unit.unitNumber, unit.modelCode, unit.blockCode, unit.phase, unit.package, unit.isMockup])).toEqual([
      [700, "A-End", "BLK 33", "PH1", "Gold", true], [701, "B", "BLK 33", "PH1", "Gold", null], [702, "C+", "BLK 34", "PH2", "Diamond", false], [703, "D", "BLK 34", "PH2", "Diamond", null],
    ]);
  });

  it("only the text column «Villa 700»: the number is read from it", async () => {
    const parsed = await parsePmcImportFile({ kind: "locations", format: "xlsx", bytes: await register(ROWS.map(([text, , ...rest]) => [text, ...rest]), ["Villa", "Type", "Package", "Block", "Phase", "Mock-up villa", "WBS code (villa)"]) });
    expect(parsed.errors).toEqual([]);
    expect(planLocations(parsed.rows, empty()).newUnits.map(unit => unit.unitNumber)).toEqual([700, 701, 702, 703]);
  });

  it("uploading the register again creates nothing: each villa is found by its number; a changed phase is an update, a missing column keeps the stored value", async () => {
    const parsed = await parsePmcImportFile({ kind: "locations", format: "xlsx", bytes: await register(ROWS) });
    const stored: LocationsContext = { zones: new Map([["Z1", { id: "z" }]]), blocks: new Map([["BLK 33", { id: "b1", zoneCode: "Z1" }], ["BLK 34", { id: "b2", zoneCode: "Z1" }]]), units: new Map([
      [700, { id: "u700", blockCode: "BLK 33", modelCode: "A-End", saleStatus: null, unitWeight: 1, phase: "PH1", package: "Gold", isMockup: true }],
      [701, { id: "u701", blockCode: "BLK 33", modelCode: "B", saleStatus: null, unitWeight: 1, phase: "PH1", package: "Gold", isMockup: null }],
      [702, { id: "u702", blockCode: "BLK 34", modelCode: "C+", saleStatus: null, unitWeight: 1, phase: "PH3", package: "Diamond", isMockup: false }], // the file says PH2
      [703, { id: "u703", blockCode: "BLK 34", modelCode: "D", saleStatus: null, unitWeight: 1, phase: "PH2", package: "Diamond", isMockup: null }],
    ]) };
    const again = planLocations(parsed.rows, stored);
    expect(again.counts).toEqual({ create: 0, update: 1, unchanged: 3 });
    expect(again.updatedUnits).toEqual([expect.objectContaining({ id: "u702", phase: "PH2" })]);
    const withoutPhase = planLocations(parsed.rows.map(row => { const { phase: _phase, ...cells } = row.cells as Record<string, unknown>; return { ...row, cells }; }) as never, stored);
    expect(withoutPhase.updatedUnits.find(unit => unit.id === "u702")).toBeUndefined(); // no Phase column: PH3 stays
  });

  it("NEGATIVE: two «Villa» columns that are both text stay ambiguous for a person; a mock-up mark that is neither yes nor no is refused on its row", async () => {
    const both = await parsePmcImportFile({ kind: "locations", format: "xlsx", bytes: await register(ROWS.map(([text, , ...rest]) => [text, `V-${String(text).slice(6)}`, ...rest])) });
    expect(both.errors.map(error => error.code)).toContain("IMPORT_COLUMN_AMBIGUOUS");
    const parsed = await parsePmcImportFile({ kind: "locations", format: "xlsx", bytes: await register([["Villa 700", 700, "A-End", "Gold", "BLK 33", "PH1", "maybe"]]) });
    expect(planLocations(parsed.rows, empty()).errors).toEqual([expect.objectContaining({ code: "IMPORT_INVALID_VALUE", field: "mockup", detail: "maybe" })]);
  });
});
