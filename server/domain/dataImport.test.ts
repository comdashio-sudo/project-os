import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { analyzeImportFile, analyzeMasterPlanMappingFile, analyzeMasterPlanSpatialEntityFile, buildDataExportFile } from "./dataImport";

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
  it("builds localized CSV headers without exposing unrequested columns", () => {
    const result = buildDataExportFile({ moduleCode: "wbs", format: "csv", locale: "ar", rows: [{ code: "1.0", name: "أعمال مدنية", plannedValue: 100, tenantId: "must-not-export" }] });
    const csv = result.bytes.toString("utf8");
    expect(result).toMatchObject({ fileName: "wbs-export.csv", contentType: "text/csv;charset=utf-8" });
    expect(csv).toContain("رمز WBS"); expect(csv).toContain("أعمال مدنية"); expect(csv).not.toContain("must-not-export");
  });
});

describe("analyzeMasterPlanMappingFile", () => {
  it("maps Arabic unit, progress, status, and value headings", () => {
    const result = analyzeMasterPlanMappingFile({ format: "csv", bytes: Buffer.from("\uFEFFرقم الوحدة,نسبة التقدم,الحالة,القيمة المخططة,القيمة الفعلية\nV-105,84%,قيد التنفيذ,1000,840") });
    expect(result.errors).toEqual([]);
    expect(result.validRows).toEqual([{ rowNumber: 2, values: { code: "V-105", progressPercent: 84, status: "in_progress", plannedValue: 1000, actualValue: 840 } }]);
  });

  it("rejects an invalid status before any Master Plan update", () => {
    const result = analyzeMasterPlanMappingFile({ format: "csv", bytes: Buffer.from("Unit ID,Status\nV-105,Unknown") });
    expect(result.validRows).toEqual([]);
    expect(result.errors).toContainEqual({ rowNumber: 2, code: "MASTER_PLAN_MAPPING_STATUS_INVALID", field: "status" });
  });
});

describe("analyzeMasterPlanSpatialEntityFile", () => {
  it("maps an Arabic spatial-entity row with bounded geometry", () => {
    const result = analyzeMasterPlanSpatialEntityFile({ format: "csv", bytes: Buffer.from("رمز الكيان,اسم الكيان,نوع الكيان,س,ص,العرض,الارتفاع,نسبة التقدم\nZONE-NEW,منطقة جديدة,منطقة,5,10,25,20,84%") });
    expect(result.errors).toEqual([]); expect(result.validRows).toEqual([{ rowNumber: 2, values: { code: "ZONE-NEW", name: "منطقة جديدة", entityType: "zone", geometry: { x: 5, y: 10, width: 25, height: 20 }, status: "not_started", progressPercent: 84, plannedValue: 0, actualValue: 0, forecastValue: 0 } }]);
  });

  it("rejects a spatial entity that exceeds the fixed plan geometry", () => {
    const result = analyzeMasterPlanSpatialEntityFile({ format: "csv", bytes: Buffer.from("Code,Name,Entity Type,X,Y,Width,Height\nOVER,Overflow,zone,90,0,20,10") });
    expect(result.validRows).toEqual([]); expect(result.errors).toContainEqual({ rowNumber: 2, code: "MASTER_PLAN_SPATIAL_GEOMETRY_INVALID", field: "geometry" });
  });
});
