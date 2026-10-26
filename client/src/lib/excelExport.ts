import { isRtlLanguage, type Language } from "./language";
// Table exports built in the browser (work order 8). The layout is a pure function so it is tested without a workbook; the writer
// loads exceljs on demand, as the import screens already do. Numbers stay numbers and dates stay dates, so Excel can sum and sort them.

export type ExportCellKind = "text" | "number" | "money" | "percent" | "date";

export type ExportCellValue = string | number | Date | null | undefined;

/** One cell with its own format, for a column that mixes kinds (a money figure and a margin). */
export type ExportCellSpec = { value: ExportCellValue; kind: ExportCellKind };

export type ExportColumn<Row> = {
  /** The header as it appears on screen. */
  header: string;
  /** The value this row shows in the column. Pass numbers as numbers and dates as Date objects, never as formatted text.
   *  Return an `ExportCellSpec` when one cell needs its own kind. */
  value: (row: Row) => ExportCellValue | ExportCellSpec;
  /** Optional: how Excel formats every cell of the column. `percent` expects a fraction (0.25 shows as 25%). Inferred when omitted. */
  kind?: ExportCellKind;
};

export type ExportMeta = {
  title: string;
  company?: string;
  project?: string;
  exportedAt: Date;
  /** The language of the workbook: its headings, its direction (Arabic and Urdu are right to left) and its labels. */
  locale: Language;
};

export type ExportCell = { value: string | number | Date | null; kind: ExportCellKind };

export type ExportLayout = {
  /** The title block above the table: title, company, project, export date. */
  metaRows: string[][];
  headerRow: string[];
  rows: ExportCell[][];
};

const LABELS: Record<Language, { company: string; project: string; exported: string }> = {
  ar: { company: "الشركة", project: "المشروع", exported: "تاريخ التصدير" },
  en: { company: "Company", project: "Project", exported: "Exported on" },
  ur: { company: "کمپنی", project: "پروجیکٹ", exported: "برآمد کی تاریخ" },
};

/** The calendar day where the person is, not in UTC: an export made after 21:00 in Riyadh must not carry tomorrow's date. */
const isoDay = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

function isCellSpec(value: unknown): value is ExportCellSpec {
  return typeof value === "object" && value !== null && !(value instanceof Date) && "kind" in value && "value" in value;
}

/** V1 decision (STATE.md): the company's base currency is the riyal. Every money figure is exported in it, and the header says so. */
const BASE_CURRENCY: Record<Language, string> = { ar: "ريال", en: "SAR", ur: "ریال" };

function normalise(value: string | number | Date | null | undefined): string | number | Date | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  return value;
}

/** Used when the column names no kind: taken from the raw value. An empty cell is text, because it has nothing to format. */
function inferKind(raw: ExportCellValue): ExportCellKind {
  if (typeof raw === "number") return "number";
  if (raw instanceof Date) return "date";
  return "text";
}

/** The rows and header exactly as the screen shows them, with the cell kinds Excel needs. Pure: no DOM, no exceljs. */
export function buildExportLayout<Row>(columns: readonly ExportColumn<Row>[], rows: readonly Row[], meta: ExportMeta): ExportLayout {
  const labels = LABELS[meta.locale];
  const metaRows: string[][] = [[meta.title]];
  if (meta.company) metaRows.push([labels.company, meta.company]);
  if (meta.project) metaRows.push([labels.project, meta.project]);
  metaRows.push([labels.exported, isoDay(meta.exportedAt)]);
  const cells = rows.map(row => columns.map<ExportCell>(column => {
    const raw = column.value(row);
    if (isCellSpec(raw)) return { value: normalise(raw.value), kind: raw.kind };
    return { value: normalise(raw), kind: column.kind ?? inferKind(raw) };
  }));
  // A column that holds money carries the currency name in its header, so no figure is a bare number.
  const headerRow = columns.map((column, index) => {
    const hasMoney = column.kind === "money" || cells.some(row => row[index].kind === "money");
    return hasMoney ? `${column.header} (${BASE_CURRENCY[meta.locale]})` : column.header;
  });
  return { metaRows, headerRow, rows: cells };
}

const SHEET_NAME_FORBIDDEN = /[\\/?*[\]:]/g;

/** Excel sheet names: at most 31 characters, none of \ / ? * [ ] : . */
export function sheetNameFor(name: string): string {
  const cleaned = name.replace(SHEET_NAME_FORBIDDEN, " ").trim();
  return (cleaned || "Sheet1").slice(0, 31);
}

const NUMBER_FORMAT: Partial<Record<ExportCellKind, string>> = { money: "#,##0.00", percent: "0.0%", date: "yyyy-mm-dd" };



/** The file name a download gets: a readable name plus the export day, so repeated exports do not overwrite each other. */
export function exportFileName(base: string, exportedAt: Date): string {
  const slug = base.trim().replace(/[\s/\\:*?"<>|.,;()[\]{}!@#$%^&+=~`'-]+/g, "-").replace(/^-+|-+$/g, "") || "export";
  return `${slug}-${isoDay(exportedAt)}.xlsx`;
}

/** Builds the .xlsx bytes. Right-to-left for Arabic. The header row is bold and frozen; columns are sized to their content. */
export async function buildTableWorkbook<Row>(input: {
  sheetName: string;
  columns: readonly ExportColumn<Row>[];
  rows: readonly Row[];
  meta: ExportMeta;
}): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import("exceljs");
  const layout = buildExportLayout(input.columns, input.rows, input.meta);
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet(sheetNameFor(input.sheetName), { views: [{ rightToLeft: isRtlLanguage(input.meta.locale) }] });
  for (const row of layout.metaRows) sheet.addRow(row).font = { bold: row.length === 1 };
  sheet.addRow([]);
  const headerIndex = sheet.rowCount + 1;
  const header = sheet.addRow(layout.headerRow);
  header.font = { bold: true };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE6F4F3" } };
  for (const row of layout.rows) {
    const added = sheet.addRow(row.map(cell => cell.value));
    row.forEach((cell, index) => {
      const format = NUMBER_FORMAT[cell.kind];
      if (format) added.getCell(index + 1).numFmt = format;
    });
  }
  sheet.views = [{ rightToLeft: isRtlLanguage(input.meta.locale), state: "frozen", ySplit: headerIndex }];
  layout.headerRow.forEach((text, index) => {
    const widest = Math.max(text.length, ...layout.rows.map(row => String(row[index]?.value instanceof Date ? "yyyy-mm-dd" : row[index]?.value ?? "").length));
    sheet.getColumn(index + 1).width = Math.min(Math.max(widest + 2, 12), 40);
  });
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

/** Starts the browser download. Kept apart so the writer can be tested without touching the page. */
export function downloadWorkbook(fileName: string, bytes: ArrayBuffer): void {
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  // Some browsers cancel the download when the URL is revoked in the same tick as the click, so the revoke waits.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
