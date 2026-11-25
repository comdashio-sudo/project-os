// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { cellValue, collectTables, tablesToSheets, westernDigits } from "./domTables";
import { buildWorkbookOfSheets } from "./excelExport";

// Q-57 (2): the tables of a page, read as drawn.
const page = (html: string) => { const root = document.createElement("main"); root.innerHTML = html; document.body.append(root); return root; };
afterEach(() => { document.body.innerHTML = ""; });

describe("cellValue", () => {
  it("turns a figure into a number, keeps a code as text", () => {
    expect(cellValue("1,234.50")).toBe(1234.5);
    expect(cellValue("-12")).toBe(-12);
    expect(cellValue("007")).toBe("007");
    expect(cellValue("PRJ-1")).toBe("PRJ-1");
    expect(cellValue("2.1.3")).toBe("2.1.3");
    expect(cellValue("")).toBeNull();
  });
  it("reads a percentage as a fraction and a calendar day as a date, and rejects an impossible day", () => {
    expect(cellValue("12.5%")).toEqual({ value: 0.125, kind: "percent" });
    expect((cellValue("2026-11-25") as Date).toISOString()).toBe("2026-11-25T00:00:00.000Z");
    expect(cellValue("2026-02-31")).toBe("2026-02-31");
  });
  it("reads Arabic-Indic and Urdu digits as figures", () => {
    const arabic = String.fromCharCode(0x0661, 0x0662, 0x0663, 0x066b, 0x0665);
    expect(westernDigits(arabic)).toBe("123.5");
    expect(cellValue(arabic)).toBe(123.5);
    expect(cellValue(String.fromCharCode(0x06f4, 0x06f2))).toBe(42);
  });
});

describe("collectTables", () => {
  it("reads the header and the rows as drawn, and names the table by its caption", () => {
    const root = page(`<table><caption>Labour</caption><thead><tr><th>Trade</th><th>Count</th></tr></thead><tbody><tr><td>Mason</td><td>12</td></tr><tr><td>Welder</td><td>3</td></tr></tbody></table>`);
    expect(collectTables(root)).toEqual([{ name: "Labour", headers: ["Trade", "Count"], rows: [["Mason", "12"], ["Welder", "3"]] }]);
  });
  it("skips the empty-state row, a hidden table, a table marked data-no-export and a hidden row", () => {
    const root = page(`
      <h2>Risks</h2><table><thead><tr><th>A</th><th>B</th></tr></thead><tbody><tr><td colspan="2">No rows</td></tr></tbody></table>
      <table hidden><thead><tr><th>H</th></tr></thead><tbody><tr><td>x</td></tr></tbody></table>
      <div data-no-export><table><thead><tr><th>N</th></tr></thead><tbody><tr><td>y</td></tr></tbody></table></div>
      <h2>Visible</h2><table><thead><tr><th>K</th></tr></thead><tbody><tr><td>keep</td></tr><tr hidden><td>drop</td></tr></tbody></table>`);
    const tables = collectTables(root);
    expect(tables.map(table => table.name)).toEqual(["Risks", "Visible"]);
    expect(tables[0].rows).toEqual([]);
    expect(tables[1].rows).toEqual([["keep"]]);
  });
  it("a page without a table gives nothing to export", () => {
    expect(collectTables(page("<p>Only text</p>"))).toEqual([]);
  });
});

describe("a workbook of several tables", () => {
  it("writes one sheet per table, numbers as numbers, and never two sheets with one name", async () => {
    const root = page(`<table><caption>Same</caption><thead><tr><th>Code</th><th>Qty</th></tr></thead><tbody><tr><td>007</td><td>1,500</td></tr></tbody></table>
      <table><caption>Same</caption><thead><tr><th>Name</th></tr></thead><tbody><tr><td>Z</td></tr></tbody></table>`);
    const bytes = await buildWorkbookOfSheets({ sheets: tablesToSheets(collectTables(root)), meta: { title: "Page", company: "Demo Co", exportedAt: new Date("2026-11-25T12:00:00Z"), locale: "en" } });
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(bytes);
    expect(book.worksheets.map(sheet => sheet.name)).toEqual(["Same", "Same 2"]);
    const first = book.worksheets[0];
    const dataRow = first.getRow(first.rowCount);
    expect(dataRow.getCell(1).value).toBe("007");
    expect(dataRow.getCell(2).value).toBe(1500);
  }, 30000);
});
