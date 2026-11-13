// D-25 (#186, 6.15): the older importer's reader (worksheetToRows: ledgers, PMC lists, the planned cash flow, BOQ, planned labour) reads merged cells the way the
// smart import's reader does: a vertical merge (a section code written once beside many lines) fills every row; a horizontal or block merge (a title across
// columns) does not spread into the other columns. Before this, a title merged across two columns was read into both. A synthetic workbook only.
import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { worksheetToRows } from "./excelWorkbook";
import { sheetFromWorksheet } from "./smartImport/sheetReader";

async function sheet() {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("S");
  ws.addRow(["Section", "Code", "Name", "Note"]);
  ws.addRow(["CSI-03", "A1", "one", null]);
  ws.addRow([null, "A2", "two", null]);
  ws.addRow([null, "A3", "three", null]);
  ws.addRow(["CSI-04", "Title across two columns", null, "kept"]);
  ws.addRow(["CSI-05", "Block", null, null]);
  ws.addRow([null, null, null, null]);
  ws.mergeCells("A2:A4"); // vertical: the section of three lines
  ws.mergeCells("B5:C5"); // horizontal: a title
  ws.mergeCells("B6:C7"); // a block
  const read = new ExcelJS.Workbook();
  await read.xlsx.load(await workbook.xlsx.writeBuffer() as ArrayBuffer);
  return read.worksheets[0];
}

describe("merged cells in the older importer's reader (D-25)", () => {
  it("fills a vertical merge into every row it covers", async () => {
    const { rows } = worksheetToRows(await sheet());
    expect(rows.slice(0, 3).map(row => row.Section)).toEqual(["CSI-03", "CSI-03", "CSI-03"]);
    expect(rows.slice(0, 3).map(row => row.Code)).toEqual(["A1", "A2", "A3"]);
  });

  it("NEGATIVE: a horizontal title and a block do not spread into the columns they cover (they did before: «Name» read the title)", async () => {
    const { rows } = worksheetToRows(await sheet());
    expect(rows[3]).toMatchObject({ Section: "CSI-04", Code: "Title across two columns", Name: "", Note: "kept" });
    expect(rows[4]).toMatchObject({ Section: "CSI-05", Code: "Block", Name: "" });
    expect(rows).toHaveLength(5); // the block's second row has nothing of its own, so it is not a row
  });

  it("reads the data rows exactly as the smart import's reader does", async () => {
    const ws = await sheet();
    const old = worksheetToRows(ws).rows.map(row => [row.Section, row.Code, row.Name].map(value => (value === "" ? null : value)));
    const smart = sheetFromWorksheet(ws).rows.slice(1, 6).map(cells => cells.slice(0, 3));
    expect(old).toEqual(smart);
    expect(sheetFromWorksheet(ws).mergedFilled).toBe(2);
  });
});
