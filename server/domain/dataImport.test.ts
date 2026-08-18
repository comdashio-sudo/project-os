import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { analyzeImportFile } from "./dataImport";

function workbookBytes(rows: Record<string, unknown>[]) { const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Data"); return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer; }

describe("analyzeImportFile", () => {
  it("maps recognized Arabic WBS headings without guessing missing fields", () => {
    const result = analyzeImportFile({ moduleCode: "wbs", format: "xlsx", bytes: new Uint8Array(workbookBytes([{ "رمز هيكل العمل": "1.1", "اسم هيكل العمل": "Foundation", "القيمة المخططة": 100 }])) });
    expect(result.mapping).toMatchObject({ code: "رمز هيكل العمل", name: "اسم هيكل العمل", plannedValue: "القيمة المخططة" }); expect(result.errors).toEqual([]);
  });
  it("reports a required budget heading that is absent", () => {
    const result = analyzeImportFile({ moduleCode: "budget", format: "xlsx", bytes: new Uint8Array(workbookBytes([{ "Cost Code": "CIVIL", "Original Amount": 10 }])) });
    expect(result.errors).toContainEqual(expect.objectContaining({ code: "IMPORT_REQUIRED_COLUMN_MISSING", field: "currentAmount" }));
  });

  it("returns only validated rows and reports their spreadsheet row number", () => {
    const result = analyzeImportFile({ moduleCode: "budget", format: "xlsx", bytes: new Uint8Array(workbookBytes([{ "Cost Code": "CIVIL", "Original Amount": 10, "Current Amount": 15 }, { "Cost Code": "", "Original Amount": 2, "Current Amount": "not-a-number" }])) });
    expect(result.validRows).toEqual([{ rowNumber: 2, values: { costCode: "CIVIL", originalAmount: 10, currentAmount: 15 } }]);
    expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ rowNumber: 3, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "costCode" }), expect.objectContaining({ rowNumber: 3, code: "IMPORT_INVALID_NUMBER", field: "currentAmount" })]));
  });
});
