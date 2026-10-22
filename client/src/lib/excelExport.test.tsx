// @vitest-environment node
import { describe, expect, it } from "vitest";
import { buildExportLayout, buildTableWorkbook, exportFileName, sheetNameFor, type ExportColumn } from "./excelExport";

type Row = { code: string; amount: number | null; due: Date | null; progress: number; note?: string };

const rows: Row[] = [
  { code: "WBS-1", amount: 1250.5, due: new Date("2026-09-30T00:00:00Z"), progress: 0.4 },
  { code: "WBS-2", amount: null, due: null, progress: 1, note: "معلّق" },
];

const columns: ExportColumn<Row>[] = [
  { header: "الرمز", value: row => row.code },
  { header: "المبلغ", value: row => row.amount, kind: "money" },
  { header: "الاستحقاق", value: row => row.due },
  { header: "التقدم", value: row => row.progress, kind: "percent" },
  { header: "ملاحظة", value: row => row.note },
];

const meta = { title: "تقرير الميزانية", company: "شركة تجريبية", project: "مشروع تجريبي", exportedAt: new Date("2026-10-22T09:00:00Z"), locale: "ar" as const };

describe("buildExportLayout", () => {
  it("header row matches the visible columns in order", () => {
    expect(buildExportLayout(columns, rows, meta).headerRow).toEqual(["الرمز", "المبلغ", "الاستحقاق", "التقدم", "ملاحظة"]);
  });

  it("one data row per input row, one cell per column", () => {
    const layout = buildExportLayout(columns, rows, meta);
    expect(layout.rows).toHaveLength(2);
    for (const row of layout.rows) expect(row).toHaveLength(columns.length);
  });

  it("keeps numbers as numbers and dates as dates; null and missing values become empty cells", () => {
    const [first, second] = buildExportLayout(columns, rows, meta).rows;
    expect(first[1]).toEqual({ value: 1250.5, kind: "money" });
    expect(first[2].value).toBeInstanceOf(Date);
    expect(first[2].kind).toBe("date");
    expect(second[1]).toEqual({ value: null, kind: "money" });
    expect(first[4]).toEqual({ value: null, kind: "text" });
    expect(second[4]).toEqual({ value: "معلّق", kind: "text" });
  });

  it("treats NaN and invalid dates as empty instead of writing them as text", () => {
    const layout = buildExportLayout<Row>([{ header: "x", value: () => Number.NaN }, { header: "y", value: () => new Date("nope") }], [rows[0]], meta);
    expect(layout.rows[0]).toEqual([{ value: null, kind: "number" }, { value: null, kind: "date" }]);
  });

  it("infers the kind when the column does not name one", () => {
    const layout = buildExportLayout<Row>([{ header: "n", value: row => row.progress }, { header: "t", value: row => row.code }], rows, meta);
    expect(layout.rows[0].map(cell => cell.kind)).toEqual(["number", "text"]);
  });

  it("title block carries title, company, project and the export day, in the chosen language", () => {
    const layout = buildExportLayout(columns, rows, meta);
    expect(layout.metaRows).toEqual([["تقرير الميزانية"], ["الشركة", "شركة تجريبية"], ["المشروع", "مشروع تجريبي"], ["تاريخ التصدير", "2026-10-22"]]);
    const english = buildExportLayout(columns, rows, { ...meta, locale: "en", company: undefined });
    expect(english.metaRows.map(row => row[0])).toEqual(["تقرير الميزانية", "Project", "Exported on"]);
  });
});

describe("per-cell kind and currency", () => {
  it("a cell can override the column kind, so one column can mix a money figure and a margin", () => {
    const mixed: ExportColumn<Row>[] = [{ header: "القيمة", value: row => (row.progress === 1 ? { value: row.progress, kind: "percent" } : { value: row.amount, kind: "money", currency: "SAR" }) }];
    const [first, second] = buildExportLayout(mixed, rows, meta).rows;
    expect(first[0]).toEqual({ value: 1250.5, kind: "money", currency: "SAR" });
    expect(second[0]).toEqual({ value: 1, kind: "percent", currency: undefined });
  });

  it("a money cell with a currency is written with that code in its number format; invalid codes are dropped", async () => {
    const mixed: ExportColumn<Row>[] = [
      { header: "المبلغ", value: row => ({ value: row.amount, kind: "money", currency: "usd" }) },
      { header: "عملة مُدخلة بخطأ", value: () => ({ value: 5, kind: "money", currency: "$$$" }) },
    ];
    const bytes = await buildTableWorkbook({ sheetName: "عملات", columns: mixed, rows: [rows[0]], meta });
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);
    const sheet = workbook.getWorksheet("عملات")!;
    const dataRow = sheet.getRow(sheet.rowCount);
    expect(dataRow.getCell(1).numFmt).toBe('#,##0.00 "USD"');
    expect(dataRow.getCell(2).numFmt).toBe("#,##0.00");
  });
});

describe("sheetNameFor and exportFileName", () => {
  it("removes characters Excel forbids in sheet names and caps the length at 31", () => {
    expect(sheetNameFor("ميزانية/المشروع: [الأول]")).toBe("ميزانية المشروع: [الأول]".replace(/[\\/?*[\]:]/g, " ").trim());
    expect(sheetNameFor("a".repeat(60))).toHaveLength(31);
    expect(sheetNameFor("   ")).toBe("Sheet1");
  });

  it("file name carries a readable base and the export day", () => {
    expect(exportFileName("التدفق النقدي الشهري", new Date("2026-10-22T09:00:00Z"))).toBe("التدفق-النقدي-الشهري-2026-10-22.xlsx");
    expect(exportFileName("  ", new Date("2026-10-22T09:00:00Z"))).toBe("export-2026-10-22.xlsx");
  });
});

describe("buildTableWorkbook (round trip)", () => {
  it("writes an xlsx whose cells read back as the same values and types", async () => {
    const bytes = await buildTableWorkbook({ sheetName: "الميزانية", columns, rows, meta });
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);
    const sheet = workbook.getWorksheet("الميزانية");
    expect(sheet).toBeDefined();
    expect(sheet!.views[0]).toMatchObject({ rightToLeft: true, state: "frozen" });

    const headerRowNumber = sheet!.rowCount - rows.length;
    const header = sheet!.getRow(headerRowNumber).values as (string | undefined)[];
    expect(header.slice(1)).toEqual(["الرمز", "المبلغ", "الاستحقاق", "التقدم", "ملاحظة"]);

    const first = sheet!.getRow(headerRowNumber + 1);
    expect(first.getCell(2).value).toBe(1250.5);
    expect(typeof first.getCell(2).value).toBe("number");
    expect(first.getCell(2).numFmt).toBe("#,##0.00");
    expect(first.getCell(3).value).toBeInstanceOf(Date);
    expect(first.getCell(4).value).toBe(0.4);
    expect(first.getCell(4).numFmt).toBe("0.0%");

    const second = sheet!.getRow(headerRowNumber + 2);
    expect(second.getCell(2).value).toBeNull();
    expect(second.getCell(5).value).toBe("معلّق");
  });

  it("an English export is left to read left to right", async () => {
    const bytes = await buildTableWorkbook({ sheetName: "Budget", columns, rows, meta: { ...meta, locale: "en" } });
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(bytes);
    expect(workbook.getWorksheet("Budget")!.views[0]).toMatchObject({ rightToLeft: false });
  });
});
