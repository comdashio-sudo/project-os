import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { DICTIONARY, extendDictionary, scoreHeader } from "./dictionary";
import { decodeCsv, parseCsv, readGrid } from "./sheetReader";
import { detectFormat, understand } from "./understand";
import { tabulate } from "./table";

async function xlsx(build: (ws: ExcelJS.Worksheet) => void): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet("S"); build(ws); return new Uint8Array(await wb.xlsx.writeBuffer());
}

describe("merged cells (the owner's lesson: fill VERTICAL merges first, and say how many)", () => {
  it("a vertical merge is filled down; a horizontal merge is NOT spread; the count is reported", async () => {
    const bytes = await xlsx(ws => {
      ws.addRow(["الباب", "الوصف", "الكمية"]); ws.addRow(["الأول", "حفر", 10]); ws.addRow([null, "ردم", 20]); ws.addRow([null, "نقل", 30]); ws.addRow(["الثاني", "خرسانة", 5]);
      ws.addRow(["Title across", null, null]); ws.mergeCells("A2:A4"); ws.mergeCells("A6:C6");
    });
    const grid = await readGrid(bytes, "xlsx");
    if (!grid.ok) throw new Error("not ok");
    const sheet = grid.sheets[0];
    expect(sheet.rows.slice(1, 4).map(row => row[0])).toEqual(["الأول", "الأول", "الأول"]);
    expect(sheet.mergedFilled).toBe(2);
    expect(sheet.rows[5]).toEqual(["Title across", null, null]); // not copied into B6 and C6
  });
  it("the preview figure reaches the understanding", async () => {
    const bytes = await xlsx(ws => { ws.addRow(["Section", "Description", "Qty", "Rate", "Amount"]); for (let i = 0; i < 6; i++) ws.addRow([i < 3 ? "S1" : i < 5 ? "S2" : null, `Work ${i}`, 10 + i, 2, (10 + i) * 2]); ws.mergeCells("A2:A4"); ws.mergeCells("A5:A6"); });
    expect((await understand(bytes, { fileName: "m.xlsx" })).table?.mergedFilled).toBe(3);
  });
});

describe("CSV in either encoding", () => {
  it("UTF-8 (with and without BOM) and Windows-1256 decode to the same Arabic text", () => {
    const text = "رمز,وصف\n1,حفر";
    expect(decodeCsv(new TextEncoder().encode(text)).encoding).toBe("utf-8");
    expect(decodeCsv(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(text)])).text).toBe(text);
    const reverse = new Map<string, number>(); const decoder = new TextDecoder("windows-1256"); for (let b = 0x80; b <= 0xff; b++) reverse.set(decoder.decode(Uint8Array.of(b)), b);
    const bytes = Uint8Array.from(Array.from(text, ch => (ch.codePointAt(0)! < 0x80 ? ch.codePointAt(0)! : reverse.get(ch)!)));
    const decoded = decodeCsv(bytes);
    expect(decoded.encoding).toBe("windows-1256"); expect(decoded.text).toBe(text);
  });
  it("sniffs the delimiter and keeps quoted commas", () => {
    expect(parseCsv('a;b;c\n1;"x;y";3')).toEqual([["a", "b", "c"], ["1", "x;y", "3"]]);
    expect(parseCsv('a,b\n"1,5",2')).toEqual([["a", "b"], ["1,5", "2"]]);
  });
});

describe("the table inside a messy sheet", () => {
  const grid = (rows: Array<Array<string | number | null>>) => ({ name: "S", rows, mergedFilled: 0, mergeRanges: 0 });
  it("skips logo lines, headings, totals, repeated page headers and blanks — and counts them", () => {
    const table = tabulate(grid([
      ["Company logo", null, null, null], [null, null, null, null], ["Item", "Description", "Qty", "Amount"],
      ["Earthworks", null, null, null], ["1", "Excavation", 10, 100], [null, null, null, null], ["2", "Backfill", 5, 40],
      ["Item", "Description", "Qty", "Amount"], ["3", "Compaction", 2, 30], ["Sub total", null, null, 170], ["Total", null, null, 170],
    ]));
    expect(table?.headerRow).toBe(3);
    expect(table?.dataRows.map(row => row.rowNumber)).toEqual([5, 7, 9]);
    expect(table?.skipped.map(item => item.reason).sort()).toEqual(["blank", "repeatedHeader", "section", "total", "total"]);
  });
  it("joins a two-line header", () => {
    const table = tabulate(grid([["Item", "Description", "Contract", null, "Amount"], [null, null, "Qty", "Rate", null], ["1", "Excavation", 10, 5, 50], ["2", "Backfill", 20, 5, 100], ["3", "Rock", 3, 50, 150]]));
    expect(table?.headers).toEqual(["Item", "Description", "Contract Qty", "Contract Rate", "Amount"]);
  });
  it("NEGATIVE: a sheet with no table (a cover page) gives none", () => { expect(tabulate(grid([["Example Co"], ["Tender"], ["2026"]]))).toBeNull(); });
});

describe("the dictionary and the matcher", () => {
  it("exact, phrase, near-spelling and unrelated", () => {
    expect(scoreHeader("Qty", "quantity")).toBe(1);
    expect(scoreHeader("الكميــــة", "quantity")).toBe(1); // tatweel
    expect(scoreHeader("Total Price (SAR)", "amount")).toBeGreaterThan(0.8);
    expect(scoreHeader("Quantiy", "quantity")).toBeGreaterThan(0.55); // a typo
    expect(scoreHeader("Remarks", "quantity")).toBe(0);
    expect(scoreHeader("م", "description")).toBe(0); // a single letter counts only as the whole header of its own concept
  });
  it("is extensible at run time", () => {
    expect(scoreHeader("بند المقايسة", "itemCode")).toBeLessThan(1);
    extendDictionary("itemCode", ["بند المقايسة"]);
    expect(scoreHeader("بند المقايسة", "itemCode")).toBe(1);
    expect(Object.keys(DICTIONARY).length).toBeGreaterThan(30);
  });
});

describe("understanding", () => {
  it("a profile's column map is applied as given (a correction wins over the guess)", async () => {
    const bytes = await xlsx(ws => { ws.addRow(["A", "B", "C"]); ws.addRow(["x1", "Item one", 5]); ws.addRow(["x2", "Item two", 6]); ws.addRow(["x3", "Item three", 7]); });
    const forced = await understand(bytes, { fileName: "f.xlsx", kind: "boq", forced: { 0: "code", 1: "name", 2: "quantity" } });
    expect(forced.columns.map(column => [column.fieldKey, column.basis])).toEqual([["code", "profile"], ["name", "profile"], ["quantity", "profile"]]);
  });
  it("flags rows with a missing or unreadable value and an amount that is not quantity x rate", async () => {
    const bytes = await xlsx(ws => { ws.addRow(["Item", "Description", "Unit", "Qty", "Rate", "Amount"]); ws.addRow(["1", "Excavation", "m3", 10, 5, 50]); ws.addRow(["2", "Backfill", "m3", 10, 5, 500]); ws.addRow(["3", null, "m3", "abc", 5, 10]); ws.addRow(["1", "Duplicate code", "m3", 1, 1, 1]); });
    const result = await understand(bytes, { fileName: "f.xlsx" });
    expect(result.flagged.find(item => item.rowNumber === 3)?.reasons).toContain("AMOUNT_MISMATCH");
    expect(result.flagged.find(item => item.rowNumber === 4)?.reasons).toEqual(expect.arrayContaining(["MISSING:name", "NOT_A_NUMBER:quantity"]));
    expect(result.flagged.find(item => item.rowNumber === 5)?.reasons).toContain("DUPLICATE_CODE:1");
    expect(result.flagged.find(item => item.rowNumber === 2)).toBeUndefined();
  });
  it("PDF and scans are recognised and sent to the smart-reading layer, never half-read", async () => {
    expect(detectFormat(new TextEncoder().encode("%PDF-1.7"), "x.pdf")).toBe("pdf");
    expect(detectFormat(Uint8Array.of(0x89, 0x50, 0x4e, 0x47), "scan.png")).toBe("image");
    expect((await understand(new TextEncoder().encode("%PDF-1.7"), { fileName: "x.pdf" })).kind).toBe("needsSmartReading");
  });
  it("a Primavera XER is recognised by its content, whatever it is called", () => { expect(detectFormat(new TextEncoder().encode("ERMHDR\t8.4\n%T\tTASK"), "export.txt")).toBe("xer"); });
  it("NEGATIVE: a corrupt workbook is reported, not thrown", async () => { expect((await understand(Uint8Array.of(0x50, 0x4b, 0x03, 0x04, 1, 2, 3), { fileName: "bad.xlsx" })).warnings.length).toBeGreaterThan(0); });
});

import { currencyCode, generatedCode, scheduleStatus, translate } from "./translate";
describe("translate (what the existing importers read)", () => {
  it("writes the Saudi riyal as SAR however it was typed, and leaves other currencies as written for the importer to refuse", () => {
    for (const written of ["ريال", "ر.س", "SR", "sar", "ريال سعودي", "Saudi Riyal"]) expect(currencyCode(written)).toBe("SAR");
    expect(currencyCode("usd")).toBe("USD");
  });
  it("generates the same material code for the same words, and different codes for different ones", () => {
    expect(generatedCode("MAT", "حديد 16", "طن")).toBe(generatedCode("MAT", "  حديد 16 ", "طن"));
    expect(generatedCode("MAT", "حديد 16", "طن")).not.toBe(generatedCode("MAT", "حديد 12", "طن"));
  });
  it("maps status words (and a progress figure) to the schedule importer's four statuses", () => {
    expect(scheduleStatus("مكتمل", null)).toBe("Completed");
    expect(scheduleStatus("In progress", null)).toBe("In Progress");
    expect(scheduleStatus("", 0)).toBe("Not Started");
    expect(scheduleStatus("", 100)).toBe("Completed");
    expect(scheduleStatus("", 40)).toBe("In Progress");
    expect(scheduleStatus("???", null)).toBe("");
  });
  it("sets aside rows missing what the importer requires and says why; a BOQ row's value is its amount, else quantity × rate", () => {
    const rows = [
      { rowNumber: 5, values: { code: "1.1", name: "حفر", quantity: 10, rate: 5, amount: null }, display: {} },
      { rowNumber: 6, values: { code: "1.2", name: "ردم", amount: 70 }, display: {} },
      { rowNumber: 7, values: { code: "", name: "بلا رمز" }, display: {} },
      { rowNumber: 8, values: { code: "1.1", name: "مكرر" }, display: {} },
    ];
    const out = translate("boq", rows)!;
    expect(out.rows).toEqual([["1.1", "حفر", 50], ["1.2", "ردم", 70]]);
    expect(out.excluded).toEqual([{ rowNumber: 7, reason: "MISSING:code" }, { rowNumber: 8, reason: "DUPLICATE_CODE:1.1" }]);
    expect(translate("valuation", rows)).toBeNull();
  });
});
