import ExcelJS from "exceljs";
import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { buildSpreadsheet } from "./excelWorkbook";
import { analyzeImportFile, analyzeMasterPlanMappingFile, analyzeMasterPlanSpatialEntityFile, buildDataExportFile } from "./dataImport";

async function workbookBytes(rows: Record<string, unknown>[]) {
  const headers = Array.from(new Set(rows.flatMap(row => Object.keys(row))));
  return buildSpreadsheet({ sheetName: "Data", headers, rows: rows.map(row => headers.map(header => row[header] ?? "")), format: "xlsx" });
}

describe("analyzeImportFile", () => {
  it("maps recognized Arabic WBS headings without guessing missing fields", async () => {
    const result = await analyzeImportFile({ moduleCode: "wbs", format: "xlsx", bytes: await workbookBytes([{ "رمز هيكل العمل": "1.1", "اسم هيكل العمل": "Foundation", "القيمة المخططة": 100 }]) });
    expect(result.mapping).toMatchObject({ code: "رمز هيكل العمل", name: "اسم هيكل العمل", plannedValue: "القيمة المخططة" }); expect(result.errors).toEqual([]);
  });
  it("reports a required budget heading that is absent", async () => {
    const result = await analyzeImportFile({ moduleCode: "budget", format: "xlsx", bytes: await workbookBytes([{ "Cost Code": "CIVIL", "Original Amount": 10 }]) });
    expect(result.errors).toContainEqual(expect.objectContaining({ code: "IMPORT_REQUIRED_COLUMN_MISSING", field: "currentAmount" }));
  });
  it("accepts a unique manual mapping for unrecognized headings and rejects duplicated assignments", async () => {
    const bytes = await workbookBytes([{ A: "CIVIL", B: 10, C: 15 }]);
    expect((await analyzeImportFile({ moduleCode: "budget", format: "xlsx", bytes, mappingOverride: { costCode: "A", originalAmount: "B", currentAmount: "C" } })).validRows).toEqual([{ rowNumber: 2, values: { costCode: "CIVIL", originalAmount: 10, currentAmount: 15 } }]);
    expect((await analyzeImportFile({ moduleCode: "budget", format: "xlsx", bytes, mappingOverride: { costCode: "A", originalAmount: "A", currentAmount: "C" } })).errors).toContainEqual({ rowNumber: 0, code: "IMPORT_MAPPING_INVALID" });
  });
  it("returns only validated rows and reports their spreadsheet row number", async () => {
    const result = await analyzeImportFile({ moduleCode: "budget", format: "xlsx", bytes: await workbookBytes([{ "Cost Code": "CIVIL", "Original Amount": 10, "Current Amount": 15 }, { "Cost Code": "", "Original Amount": 2, "Current Amount": "not-a-number" }]) });
    expect(result.validRows).toEqual([{ rowNumber: 2, values: { costCode: "CIVIL", originalAmount: 10, currentAmount: 15 } }]); expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ rowNumber: 3, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "costCode" }), expect.objectContaining({ rowNumber: 3, code: "IMPORT_INVALID_NUMBER", field: "currentAmount" })]));
  });
  it("rejects a workbook with multiple sheets or unapproved extra columns before confirmation", async () => {
    const workbook = new ExcelJS.Workbook(); workbook.addWorksheet("WBS").addRow(["WBS Code", "WBS Name"]); workbook.addWorksheet("Second").addRow(["WBS Code", "WBS Name"]);
    const multiSheet = Buffer.from(await workbook.xlsx.writeBuffer());
    expect((await analyzeImportFile({ moduleCode: "wbs", format: "xlsx", bytes: multiSheet })).errors).toContainEqual({ rowNumber: 0, code: "IMPORT_SINGLE_SHEET_REQUIRED" });
    const extraColumn = await analyzeImportFile({ moduleCode: "wbs", format: "xlsx", bytes: await workbookBytes([{ "WBS Code": "1.0", "WBS Name": "Civil", Notes: "Do not import" }]) });
    expect(extraColumn.errors).toContainEqual({ rowNumber: 0, code: "IMPORT_UNSUPPORTED_COLUMN", field: "Notes" });
  });
  it("rejects oversized or malformed workbooks before extracting any row", async () => {
    const oversized = await analyzeImportFile({ moduleCode: "wbs", format: "xlsx", bytes: new Uint8Array(5 * 1024 * 1024 + 1) }); const malformed = await analyzeImportFile({ moduleCode: "wbs", format: "xlsx", bytes: Buffer.from("not-a-workbook") });
    expect(oversized.errors).toContainEqual({ rowNumber: 0, code: "IMPORT_FILE_TOO_LARGE" }); expect(oversized.validRows).toEqual([]); expect(malformed.errors).toContainEqual({ rowNumber: 0, code: "IMPORT_WORKBOOK_INVALID" }); expect(malformed.validRows).toEqual([]);
  });
  it("rejects a macro workbook and files that exceed controlled row or column limits", async () => {
    const macroZip = new JSZip(); macroZip.file("xl/vbaProject.bin", "untrusted-vba"); const macroBytes = await macroZip.generateAsync({ type: "nodebuffer" });
    const tooManyRows = Buffer.from(["WBS Code,WBS Name", ...Array.from({ length: 10_001 }, (_unused, index) => `WBS-${index},Work package ${index}`)].join("\n"));
    const tooManyColumns = Buffer.from(`${Array.from({ length: 61 }, (_unused, index) => `Column ${index}`).join(",")}\n${Array.from({ length: 61 }, () => "value").join(",")}`);
    expect((await analyzeImportFile({ moduleCode: "wbs", format: "xlsx", bytes: macroBytes })).errors).toContainEqual({ rowNumber: 0, code: "IMPORT_MACRO_WORKBOOK_REJECTED" });
    expect((await analyzeImportFile({ moduleCode: "wbs", format: "csv", bytes: tooManyRows })).errors).toContainEqual({ rowNumber: 0, code: "IMPORT_TOO_MANY_ROWS" });
    expect((await analyzeImportFile({ moduleCode: "wbs", format: "csv", bytes: tooManyColumns })).errors).toContainEqual({ rowNumber: 0, code: "IMPORT_TOO_MANY_COLUMNS" });
  });
  it("rejects repeated business keys inside the same file instead of choosing a row silently", async () => {
    const result = await analyzeImportFile({ moduleCode: "budget", format: "xlsx", bytes: await workbookBytes([{ "Cost Code": "CIVIL", "Original Amount": 10, "Current Amount": 12 }, { "Cost Code": "CIVIL", "Original Amount": 20, "Current Amount": 25 }]) });
    expect(result.errors).toContainEqual({ rowNumber: 3, code: "IMPORT_DUPLICATE_FILE_KEY", field: "costCode" }); expect(result.validRows).toHaveLength(1);
  });
  it("accepts an approved Arabic contracts template and normalizes its ISO currency", async () => {
    const result = await analyzeImportFile({ moduleCode: "contracts", format: "xlsx", bytes: await workbookBytes([{ "رمز العقد": "CON-001", "اسم العقد": "عقد الأعمال المدنية", "الطرف المتعاقد": "المقاول الرئيسي", "قيمة العقد": "2,500,000", "العملة": "sar" }]) });
    expect(result.errors).toEqual([]); expect(result.validRows).toEqual([{ rowNumber: 2, values: { code: "CON-001", title: "عقد الأعمال المدنية", counterparty: "المقاول الرئيسي", contractValue: 2500000, currency: "SAR" } }]);
  });
  it("rejects a contracts file with an invalid currency or a repeated contract code", async () => {
    const result = await analyzeImportFile({ moduleCode: "contracts", format: "xlsx", bytes: await workbookBytes([{ "Contract Code": "CON-001", "Contract Title": "Civil works", Counterparty: "Main Contractor", "Contract Value": 100, Currency: "Saudi Riyal" }, { "Contract Code": "CON-001", "Contract Title": "MEP works", Counterparty: "MEP Contractor", "Contract Value": 200, Currency: "SAR" }]) });
    expect(result.errors).toEqual(expect.arrayContaining([expect.objectContaining({ rowNumber: 2, code: "IMPORT_INVALID_CURRENCY", field: "currency" }), expect.objectContaining({ rowNumber: 3, code: "IMPORT_DUPLICATE_FILE_KEY", field: "code" })])); expect(result.validRows).toEqual([]);
  });
  it("accepts the named materials template and rejects duplicated or unsupported columns", async () => {
    const accepted = await analyzeImportFile({ moduleCode: "materials", format: "xlsx", bytes: await workbookBytes([{ "Material Code": "MAT-01", Description: "Structural concrete", "Unit of Measure": "m3", Category: "Concrete", "Reference Specification": "ASTM C94" }]) });
    const unsupported = await analyzeImportFile({ moduleCode: "materials", format: "xlsx", bytes: await workbookBytes([{ "Material Code": "MAT-01", Description: "Concrete", "Unit of Measure": "m3", Category: "Concrete", Notes: "not approved" }]) });
    const duplicate = await analyzeImportFile({ moduleCode: "materials", format: "xlsx", bytes: await workbookBytes([{ "Material Code": "MAT-01", Description: "Concrete", "Unit of Measure": "m3", Category: "Concrete" }, { "Material Code": "MAT-01", Description: "Concrete 2", "Unit of Measure": "m3", Category: "Concrete" }]) });
    expect(accepted.errors).toEqual([]); expect(unsupported.errors).toContainEqual(expect.objectContaining({ code: "IMPORT_UNSUPPORTED_COLUMN" })); expect(duplicate.errors).toContainEqual(expect.objectContaining({ code: "IMPORT_DUPLICATE_FILE_KEY" }));
  });
  it("parses the explicit schedule Excel template into dependent WBS and activity rows", async () => {
    const result = await analyzeImportFile({ moduleCode: "schedule", format: "xlsx", bytes: await workbookBytes([{ "Record Type": "WBS", "WBS Code": "1.0", "WBS Name": "Civil works", "Planned Value": 1000 }, { "Record Type": "Activity", "WBS Code": "1.0", "Activity Code": "A-100", "Activity Name": "Foundation", "Planned Start": "2026-09-01", "Planned Finish": "2026-09-05", "Planned Value": 500, Status: "In Progress" }]) });
    expect(result.errors).toEqual([]); expect(result.validRows).toEqual(expect.arrayContaining([expect.objectContaining({ kind: "wbs", values: expect.objectContaining({ code: "1.0" }) }), expect.objectContaining({ kind: "activity", values: expect.objectContaining({ code: "A-100", wbsCode: "1.0", status: "in_progress" }) })]));
  });
  it("rejects an unresolved schedule WBS reference and a missing required XER table", async () => {
    const unresolved = await analyzeImportFile({ moduleCode: "schedule", format: "xlsx", bytes: await workbookBytes([{ "Record Type": "Activity", "WBS Code": "MISSING", "Activity Code": "A-100", "Activity Name": "Foundation", "Planned Start": "2026-09-01", "Planned Finish": "2026-09-05", "Planned Value": 500, Status: "In Progress" }]) });
    const xer = await analyzeImportFile({ moduleCode: "schedule", format: "xer", bytes: Buffer.from("%T\tPROJWBS\n%F\twbs_id\twbs_short_name\twbs_name\n%R\t1\t1.0\tCivil") });
    expect(unresolved.errors).toContainEqual({ rowNumber: 2, code: "SCHEDULE_WBS_REFERENCE_UNRESOLVED", field: "wbsCode" }); expect(xer.errors).toContainEqual({ rowNumber: 0, code: "XER_REQUIRED_TABLE_MISSING" });
  });
  it("parses the restricted XER WBS and TASK tables without accepting arbitrary records", async () => {
    const bytes = Buffer.from("%T\tPROJWBS\n%F\twbs_id\twbs_short_name\twbs_name\twbs_cost\n%R\t10\t1.0\tCivil\t1000\n%T\tTASK\n%F\ttask_code\ttask_name\twbs_id\ttarget_start_date\ttarget_end_date\ttarget_cost\tstatus_code\n%R\tA-100\tFoundation\t10\t2026-09-01 00:00:00\t2026-09-05 00:00:00\t500\tTK_Active");
    const result = await analyzeImportFile({ moduleCode: "schedule", format: "xer", bytes }); expect(result.errors).toEqual([]); expect(result.validRows).toHaveLength(2);
  });
  it("rejects an XER with an extra unsupported table instead of partially importing it", async () => {
    const bytes = Buffer.from("%T\tPROJWBS\n%F\twbs_id\twbs_short_name\twbs_name\n%R\t10\t1.0\tCivil\n%T\tTASK\n%F\ttask_code\ttask_name\twbs_id\ttarget_start_date\ttarget_end_date\tstatus_code\n%R\tA-100\tFoundation\t10\t2026-09-01 00:00:00\t2026-09-05 00:00:00\tTK_Active\n%T\tTASKPRED\n%F\ttask_id\n%R\tA-100");
    const result = await analyzeImportFile({ moduleCode: "schedule", format: "xer", bytes }); expect(result.validRows).toEqual([]); expect(result.errors).toContainEqual({ rowNumber: 0, code: "XER_UNSUPPORTED_TABLE", field: "TASKPRED" });
  });
  it("builds localized CSV headers without exposing unrequested columns", async () => {
    const result = await buildDataExportFile({ moduleCode: "wbs", format: "csv", locale: "ar", rows: [{ code: "1.0", name: "أعمال مدنية", plannedValue: 100, tenantId: "must-not-export" }] }); const csv = result.bytes.toString("utf8");
    expect(result).toMatchObject({ fileName: "wbs-export.csv", contentType: "text/csv;charset=utf-8" }); expect(csv).toContain("رمز WBS"); expect(csv).toContain("أعمال مدنية"); expect(csv).not.toContain("must-not-export");
  });
  it("neutralizes formula-like export cells before building CSV or Excel", async () => {
    const result = await buildDataExportFile({ moduleCode: "wbs", format: "csv", locale: "en", rows: [{ code: "=HYPERLINK(\"https://untrusted.example\")", name: "+unsafe", plannedValue: 100 }] }); const csv = result.bytes.toString("utf8");
    expect(csv).toContain("'=HYPERLINK"); expect(csv).toContain("'+unsafe");
  });
});

describe("Master Plan spreadsheet imports", () => {
  it("maps Arabic unit, progress, status, and value headings", async () => {
    const result = await analyzeMasterPlanMappingFile({ format: "csv", bytes: Buffer.from("\uFEFFرقم الوحدة,نسبة التقدم,الحالة,القيمة المخططة,القيمة الفعلية\nV-105,84%,قيد التنفيذ,1000,840") });
    expect(result.errors).toEqual([]); expect(result.validRows).toEqual([{ rowNumber: 2, values: { code: "V-105", progressPercent: 84, status: "in_progress", plannedValue: 1000, actualValue: 840 } }]);
  });
  it("rejects an invalid status before any Master Plan update", async () => {
    const result = await analyzeMasterPlanMappingFile({ format: "csv", bytes: Buffer.from("Unit ID,Status\nV-105,Unknown") }); expect(result.validRows).toEqual([]); expect(result.errors).toContainEqual({ rowNumber: 2, code: "MASTER_PLAN_MAPPING_STATUS_INVALID", field: "status" });
  });
  it("maps an Arabic spatial-entity row with bounded geometry", async () => {
    const result = await analyzeMasterPlanSpatialEntityFile({ format: "csv", bytes: Buffer.from("رمز الكيان,اسم الكيان,نوع الكيان,س,ص,العرض,الارتفاع,نسبة التقدم,رمز الأب,رمز WBS,رمز النشاط\nZONE-NEW,منطقة جديدة,منطقة,5,10,25,20,84%,BLOCK-1,1.0,A-01") });
    expect(result.errors).toEqual([]); expect(result.validRows).toEqual([expect.objectContaining({ values: expect.objectContaining({ code: "ZONE-NEW", entityType: "zone", wbsCode: "1.0" }) })]);
  });
  it("rejects a spatial entity that exceeds the fixed plan geometry", async () => {
    const result = await analyzeMasterPlanSpatialEntityFile({ format: "csv", bytes: Buffer.from("Code,Name,Entity Type,X,Y,Width,Height\nOVER,Overflow,zone,90,0,20,10") }); expect(result.validRows).toEqual([]); expect(result.errors).toContainEqual({ rowNumber: 2, code: "MASTER_PLAN_SPATIAL_GEOMETRY_INVALID", field: "geometry" });
  });
});
