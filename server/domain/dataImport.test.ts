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

  it("accepts a unique manual mapping for unrecognized headings and rejects duplicated assignments", () => {
    const bytes = new Uint8Array(workbookBytes([{ A: "CIVIL", B: 10, C: 15 }]));
    expect(analyzeImportFile({ moduleCode: "budget", format: "xlsx", bytes, mappingOverride: { costCode: "A", originalAmount: "B", currentAmount: "C" } }).validRows).toEqual([{ rowNumber: 2, values: { costCode: "CIVIL", originalAmount: 10, currentAmount: 15 } }]);
    expect(analyzeImportFile({ moduleCode: "budget", format: "xlsx", bytes, mappingOverride: { costCode: "A", originalAmount: "A", currentAmount: "C" } }).errors).toContainEqual({ rowNumber: 0, code: "IMPORT_MAPPING_INVALID" });
  });

  it("returns only validated rows and reports their spreadsheet row number", () => {
    const result = analyzeImportFile({ moduleCode: "budget", format: "xlsx", bytes: new Uint8Array(workbookBytes([{ "Cost Code": "CIVIL", "Original Amount": 10, "Current Amount": 15 }, { "Cost Code": "", "Original Amount": 2, "Current Amount": "not-a-number" }])) });
    expect(result.validRows).toEqual([{ rowNumber: 2, values: { costCode: "CIVIL", originalAmount: 10, currentAmount: 15 } }]);
    expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ rowNumber: 3, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "costCode" }), expect.objectContaining({ rowNumber: 3, code: "IMPORT_INVALID_NUMBER", field: "currentAmount" })]));
  });
  it("rejects a workbook with multiple sheets or unapproved extra columns before confirmation", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ "WBS Code": "1.0", "WBS Name": "Civil" }]), "WBS");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([{ "WBS Code": "2.0", "WBS Name": "MEP" }]), "Second");
    expect(analyzeImportFile({ moduleCode: "wbs", format: "xlsx", bytes: new Uint8Array(XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer) }).errors).toContainEqual({ rowNumber: 0, code: "IMPORT_SINGLE_SHEET_REQUIRED" });
    const extraColumn = analyzeImportFile({ moduleCode: "wbs", format: "xlsx", bytes: new Uint8Array(workbookBytes([{ "WBS Code": "1.0", "WBS Name": "Civil", Notes: "Do not import" }])) });
    expect(extraColumn.errors).toContainEqual({ rowNumber: 0, code: "IMPORT_UNSUPPORTED_COLUMN", field: "Notes" });
  });
  it("rejects repeated business keys inside the same file instead of choosing a row silently", () => {
    const result = analyzeImportFile({ moduleCode: "budget", format: "xlsx", bytes: new Uint8Array(workbookBytes([{ "Cost Code": "CIVIL", "Original Amount": 10, "Current Amount": 12 }, { "Cost Code": "CIVIL", "Original Amount": 20, "Current Amount": 25 }])) });
    expect(result.errors).toContainEqual({ rowNumber: 3, code: "IMPORT_DUPLICATE_FILE_KEY", field: "costCode" });
    expect(result.validRows).toHaveLength(1);
  });
  it("accepts an approved Arabic contracts template and normalizes its ISO currency", () => {
    const result = analyzeImportFile({ moduleCode: "contracts", format: "xlsx", bytes: new Uint8Array(workbookBytes([{ "رمز العقد": "CON-001", "اسم العقد": "عقد الأعمال المدنية", "الطرف المتعاقد": "المقاول الرئيسي", "قيمة العقد": "2,500,000", "العملة": "sar" }])) });
    expect(result.errors).toEqual([]);
    expect(result.validRows).toEqual([{ rowNumber: 2, values: { code: "CON-001", title: "عقد الأعمال المدنية", counterparty: "المقاول الرئيسي", contractValue: 2500000, currency: "SAR" } }]);
  });
  it("rejects a contracts file with an invalid currency or a repeated contract code", () => {
    const result = analyzeImportFile({ moduleCode: "contracts", format: "xlsx", bytes: new Uint8Array(workbookBytes([{ "Contract Code": "CON-001", "Contract Title": "Civil works", Counterparty: "Main Contractor", "Contract Value": 100, Currency: "Saudi Riyal" }, { "Contract Code": "CON-001", "Contract Title": "MEP works", Counterparty: "MEP Contractor", "Contract Value": 200, Currency: "SAR" }])) });
    expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ rowNumber: 2, code: "IMPORT_INVALID_CURRENCY", field: "currency" }), expect.objectContaining({ rowNumber: 3, code: "IMPORT_DUPLICATE_FILE_KEY", field: "code" })]));
    expect(result.validRows).toEqual([]);
  });
  it("accepts the named materials template and rejects duplicated or unsupported columns", () => {
    const accepted = analyzeImportFile({ moduleCode: "materials", format: "xlsx", bytes: new Uint8Array(workbookBytes([{ "Material Code": "MAT-01", Description: "Structural concrete", "Unit of Measure": "m3", Category: "Concrete", "Reference Specification": "ASTM C94" }])) });
    expect(accepted.errors).toEqual([]); expect(accepted.validRows).toEqual([expect.objectContaining({ values: expect.objectContaining({ code: "MAT-01", unitOfMeasure: "m3" }) })]);
    const unsupported = analyzeImportFile({ moduleCode: "materials", format: "xlsx", bytes: new Uint8Array(workbookBytes([{ "Material Code": "MAT-01", Description: "Concrete", "Unit of Measure": "m3", Category: "Concrete", Notes: "not approved" }])) });
    const duplicate = analyzeImportFile({ moduleCode: "materials", format: "xlsx", bytes: new Uint8Array(workbookBytes([{ "Material Code": "MAT-01", Description: "Concrete", "Unit of Measure": "m3", Category: "Concrete" }, { "Material Code": "MAT-01", Description: "Concrete 2", "Unit of Measure": "m3", Category: "Concrete" }])) });
    expect(unsupported.errors).toContainEqual(expect.objectContaining({ code: "IMPORT_UNSUPPORTED_COLUMN" })); expect(duplicate.errors).toContainEqual(expect.objectContaining({ code: "IMPORT_DUPLICATE_FILE_KEY" }));
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
    const result = analyzeMasterPlanSpatialEntityFile({ format: "csv", bytes: Buffer.from("رمز الكيان,اسم الكيان,نوع الكيان,س,ص,العرض,الارتفاع,نسبة التقدم,رمز الأب,رمز WBS,رمز النشاط\nZONE-NEW,منطقة جديدة,منطقة,5,10,25,20,84%,BLOCK-1,1.0,A-01") });
    expect(result.errors).toEqual([]); expect(result.validRows).toEqual([{ rowNumber: 2, values: { code: "ZONE-NEW", name: "منطقة جديدة", entityType: "zone", geometry: { x: 5, y: 10, width: 25, height: 20 }, status: "not_started", progressPercent: 84, plannedValue: 0, actualValue: 0, forecastValue: 0, parentCode: "BLOCK-1", wbsCode: "1.0", activityCode: "A-01" } }]);
  });

  it("rejects a spatial entity that exceeds the fixed plan geometry", () => {
    const result = analyzeMasterPlanSpatialEntityFile({ format: "csv", bytes: Buffer.from("Code,Name,Entity Type,X,Y,Width,Height\nOVER,Overflow,zone,90,0,20,10") });
    expect(result.validRows).toEqual([]); expect(result.errors).toContainEqual({ rowNumber: 2, code: "MASTER_PLAN_SPATIAL_GEOMETRY_INVALID", field: "geometry" });
  });
});
