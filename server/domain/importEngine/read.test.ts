import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { ledgerHeaders } from "@shared/ledgerImportColumns";
import { readLedgerTable } from "../../ledgerImports";
import { analyzeBoqFile } from "../boqFile";
import { analyzeCashFlowFile } from "../plannedCashFlow";
import { analyzeLabourFile } from "../plannedLabour";
import { chooseSheet, findHeaderRow, HEADER_SEARCH_ROWS, type TableRows } from "./read";

// Q-50 batch 1 (docs/proposals/universal-import.md, layer 1): the shared reader. Synthetic workbooks only.
const limits = { maxRows: 0, maxColumns: 60 };
const named = (wanted: string[], required = wanted) => ({ baseHeaders }: TableRows) => {
  const have = new Set(baseHeaders.map(header => header.toLowerCase()));
  return { found: wanted.filter(name => have.has(name)).length, complete: required.every(name => have.has(name)) };
};
function book(build: (workbook: ExcelJS.Workbook) => void) { const workbook = new ExcelJS.Workbook(); build(workbook); return workbook; }

describe("importEngine/read: the header row", () => {
  it("POSITIVE: a table under two title rows is read from its own header row, not row 1", () => {
    const workbook = book(w => { const s = w.addWorksheet("Data"); s.addRow(["Synthetic Project — cost ledger"]); s.addRow(["Exported 2026-11-19"]); s.addRow(["code", "amount"]); s.addRow(["C-1", 10]); });
    expect(findHeaderRow(workbook.worksheets[0]!, named(["code", "amount"]), limits).row).toBe(3);
  });
  it("with no complete row, the row naming the most fields is chosen (earliest on a tie), so a person can map its columns", () => {
    const workbook = book(w => { const s = w.addWorksheet("Data"); s.addRow(["title"]); s.addRow(["code", "other"]); s.addRow(["code", "other"]); });
    const found = findHeaderRow(workbook.worksheets[0]!, named(["code", "amount"]), limits);
    expect(found.row).toBe(2);
    expect(found.evaluation).toEqual({ found: 1, complete: false });
  });
  it(`NEGATIVE: a header below row ${HEADER_SEARCH_ROWS} is not searched for (the file is reported as missing its columns, never guessed)`, () => {
    const workbook = book(w => { const s = w.addWorksheet("Data"); for (let i = 0; i < HEADER_SEARCH_ROWS; i += 1) s.addRow([`note ${i + 1}`]); s.addRow(["code", "amount"]); });
    expect(findHeaderRow(workbook.worksheets[0]!, named(["code", "amount"]), limits).evaluation.complete).toBe(false);
  });
});

describe("importEngine/read: the sheet", () => {
  it("POSITIVE: a notes sheet and a hidden working sheet beside the table do not stop it: the complete sheet is read", () => {
    const workbook = book(w => {
      w.addWorksheet("Notes").addRow(["How to fill this file"]);
      const hidden = w.addWorksheet("Lists"); hidden.state = "hidden"; hidden.addRow(["code", "amount"]);
      w.addWorksheet("Data").addRow(["code", "amount"]);
    });
    const choice = chooseSheet(workbook, named(["code", "amount"]), limits);
    expect(choice.ok && choice.sheet.name).toBe("Data");
  });
  it("NEGATIVE: two complete sheets are refused as ambiguous, naming both, rather than one being picked", () => {
    const workbook = book(w => { w.addWorksheet("A").addRow(["code", "amount"]); w.addWorksheet("B").addRow(["code", "amount"]); });
    expect(chooseSheet(workbook, named(["code", "amount"]), limits)).toEqual({ ok: false, code: "IMPORT_SHEET_AMBIGUOUS", detail: "A | B" });
  });
  it("NEGATIVE: a workbook whose only sheets are hidden is empty", () => {
    const workbook = book(w => { const s = w.addWorksheet("Hidden"); s.state = "veryHidden"; s.addRow(["code", "amount"]); });
    expect(chooseSheet(workbook, named(["code", "amount"]), limits)).toEqual({ ok: false, code: "IMPORT_EMPTY_WORKBOOK" });
  });
  it("with no complete sheet, `closeness` ranks the sheets when a kind gives it (PMC: fewest required fields missing)", () => {
    const workbook = book(w => { w.addWorksheet("Many").addRow(["a", "b", "c"]); w.addWorksheet("Close").addRow(["code"]); });
    const evaluate = ({ baseHeaders }: TableRows) => ({ found: baseHeaders.length, complete: false, closeness: baseHeaders.includes("code") ? 0 : -2 });
    const choice = chooseSheet(workbook, evaluate, limits);
    expect(choice.ok && choice.sheet.name).toBe("Close");
  });
});

describe("ledger imports read through the shared reader (Q-50 batch 1)", () => {
  const save = async (workbook: ExcelJS.Workbook) => Buffer.from(await workbook.xlsx.writeBuffer());
  it("POSITIVE: a cost ledger under a title row, beside a notes sheet, is read with its true sheet row numbers", async () => {
    const workbook = book(w => {
      w.addWorksheet("Notes").addRow(["Synthetic notes"]);
      const s = w.addWorksheet("Costs"); s.addRow(["Synthetic company — costs"]); s.addRow(ledgerHeaders("costs", "en")); s.addRow([]); s.addRow(ledgerHeaders("costs", "en").map((_h, i) => (i === 0 ? "COST-1" : "x")));
    });
    const table = await readLedgerTable("costs", "xlsx", await save(workbook));
    expect(table.errors.filter(error => error.code !== "IMPORT_UNSUPPORTED_COLUMN")).toEqual([]);
    expect(table.rows.map(row => row.rowNumber)).toEqual([4]);
  });
  it("NEGATIVE: two sheets that both hold the cost ledger are refused as ambiguous (was: a second sheet of any kind was refused)", async () => {
    const workbook = book(w => { w.addWorksheet("Costs A").addRow(ledgerHeaders("costs", "en")); w.addWorksheet("Costs B").addRow(ledgerHeaders("costs", "en")); });
    expect((await readLedgerTable("costs", "xlsx", await save(workbook))).errors).toEqual([{ rowNumber: 0, code: "IMPORT_SHEET_AMBIGUOUS", field: "Costs A | Costs B" }]);
  });
});

describe("baseline files read through the shared reader (Q-50 batch 1b)", () => {
  const save = async (workbook: ExcelJS.Workbook) => new Uint8Array(await workbook.xlsx.writeBuffer());
  it("POSITIVE: a BOQ under a title row, beside a notes sheet, with a blank row inside, is read with its true sheet row numbers", async () => {
    const workbook = book(w => {
      w.addWorksheet("Notes").addRow(["Synthetic notes"]);
      const s = w.addWorksheet("BOQ"); s.addRow(["Synthetic project — bill of quantities"]); s.addRow(["Item No.", "Description", "Unit", "Quantity", "Rate"]);
      s.addRow(["A-1", "Synthetic tiles", "m2", 10, 5]); s.addRow([]); s.addRow(["A-2", "Synthetic paint", "m2", 4, 2]);
    });
    const analysis = await analyzeBoqFile(await save(workbook), "xlsx");
    expect(analysis.fileError).toBeNull();
    expect(analysis.items.map(item => [item.code, item.rowNumber])).toEqual([["A-1", 3], ["A-2", 5]]);
  });
  it("NEGATIVE: two sheets that both hold the BOQ are refused as ambiguous, naming both", async () => {
    const workbook = book(w => { for (const name of ["BOQ A", "BOQ B"]) w.addWorksheet(name).addRow(["Item No.", "Description", "Unit", "Quantity", "Rate"]); });
    expect(await analyzeBoqFile(await save(workbook), "xlsx")).toMatchObject({ fileError: "IMPORT_SHEET_AMBIGUOUS", fileErrorDetail: "BOQ A | BOQ B" });
  });
  it("the planned cash flow and the labour plan find their header under a title too; a workbook of hidden sheets only reads as missing its columns", async () => {
    const cash = book(w => { const s = w.addWorksheet("Cash"); s.addRow(["Synthetic plan"]); s.addRow(["Month", "Percent"]); s.addRow(["2026-01", 60]); s.addRow(["2026-02", 40]); });
    const cashAnalysis = await analyzeCashFlowFile(await save(cash), "xlsx");
    expect(cashAnalysis.fileError).toBeNull();
    expect(cashAnalysis.months.length).toBe(2);
    const hidden = book(w => { const s = w.addWorksheet("Hidden"); s.state = "hidden"; s.addRow(["Month", "Workers"]); });
    expect((await analyzeLabourFile(await save(hidden), "xlsx")).fileError).toBe("LABOUR_COLUMNS_MISSING");
  });
});
