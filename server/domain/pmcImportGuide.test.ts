import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { PMC_GUIDE_KINDS, PMC_IMPORT_GUIDE } from "../../client/src/lib/pmcImportGuide";
import { PMC_IMPORT_KINDS, parsePmcImportFile } from "./pmcImport";

// Q-35: the template guide shown on the PMC import screen must say what the importer really accepts. Each example (in every language) is built as a
// workbook and read by the real importer: no missing, unknown or ambiguous column. Every column the guide calls required is: leaving it out is refused by
// name; and every column it calls optional is: leaving it out is accepted.
const workbook = async (rows: Array<Array<string | number>>) => { const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("Sheet1"); rows.forEach(row => sheet.addRow(row)); return new Uint8Array(await book.xlsx.writeBuffer()); };
const headerErrors = (errors: Array<{ code: string }>) => errors.filter(error => error.code.startsWith("IMPORT_")).map(error => error.code);

describe("PMC import template guide (Q-35)", () => {
  it("covers every import kind the PMC importer has", () => {
    expect([...PMC_GUIDE_KINDS].sort()).toEqual([...PMC_IMPORT_KINDS].sort());
  });

  for (const language of ["ar", "en", "ur"] as const) for (const kind of PMC_GUIDE_KINDS) {
    const guide = PMC_IMPORT_GUIDE[language][kind];
    it(`${language} · ${kind}: the example is read with no column problem, and every row of it is read`, async () => {
      const parsed = await parsePmcImportFile({ kind, format: "xlsx", bytes: await workbook(guide.example) });
      expect(headerErrors(parsed.errors)).toEqual([]);
      expect(parsed.rows).toHaveLength(guide.example.length - 1);
      for (const header of guide.example[0]) expect(guide.columns.map(column => column.header)).toContain(header);
    });
    it(`${language} · ${kind}: all the listed columns together are accepted; each required one left out is refused, each optional one left out is not`, async () => {
      const headers = guide.columns.map(column => column.header);
      expect(headerErrors((await parsePmcImportFile({ kind, format: "xlsx", bytes: await workbook([headers]) })).errors)).toEqual([]);
      for (const column of guide.columns) {
        const without = headers.filter(header => header !== column.header);
        const codes = headerErrors((await parsePmcImportFile({ kind, format: "xlsx", bytes: await workbook([without]) })).errors);
        if (column.required) expect(codes, `${column.header} is required`).toContain("IMPORT_REQUIRED_COLUMN_MISSING");
        else expect(codes, `${column.header} is optional`).toEqual([]);
      }
    });
  }

  it("NEGATIVE: a column the importer does not know is refused (outside the weights table), so a wrong header in the guide would fail above", async () => {
    const parsed = await parsePmcImportFile({ kind: "locations", format: "xlsx", bytes: await workbook([["block", "villa", "model", "colour"], ["B1", 1, "A", "red"]]) });
    expect(headerErrors(parsed.errors)).toContain("IMPORT_UNSUPPORTED_COLUMN");
  });
});

describe("PMC import template guide, Urdu notes (Q-35)", () => {
  it("every column note shown in Urdu is in Urdu (only the file's own headers stay in English)", () => {
    for (const kind of PMC_GUIDE_KINDS) for (const column of PMC_IMPORT_GUIDE.ur[kind].columns) if (column.note && !/^\d/.test(column.note)) expect(column.note, `${kind} · ${column.header}`).toMatch(/[؀-ۿ]/);
  });
});
