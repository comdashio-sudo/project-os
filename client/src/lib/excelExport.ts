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
  /** Q-72 (1): who asked for the file, and the filters the screen had on (words), so a file found later says where it came from. */
  exportedBy?: string;
  filters?: string;
  /** A name for the person's time zone; the UTC offset of their clock when not given. */
  timeZone?: string;
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

const LABELS: Record<Language, { company: string; project: string; exported: string; filters: string; by: string; generated: string; rowCount: string }> = {
  ar: { company: "الشركة", project: "المشروع", exported: "تاريخ التصدير", filters: "الفلاتر", by: "طلبه", generated: "وقت التوليد", rowCount: "عدد الصفوف" },
  en: { company: "Company", project: "Project", exported: "Exported on", filters: "Filters", by: "Requested by", generated: "Generated at", rowCount: "Rows" },
  ur: { company: "کمپنی", project: "پروجیکٹ", exported: "برآمد کی تاریخ", filters: "فلٹرز", by: "درخواست کنندہ", generated: "تیاری کا وقت", rowCount: "قطاروں کی تعداد" },
};
const pad = (value: number) => String(value).padStart(2, "0");
/** The offset of the person's clock from UTC, «UTC+03:00» (the zone's name is not read: one place formats dates, components/ds/format.ts). */
const offsetName = (date: Date) => { const minutes = -date.getTimezoneOffset(); const sign = minutes < 0 ? "-" : "+"; return `UTC${sign}${pad(Math.floor(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`; };
/** The day and the minute on the person's own clock, with the offset named: «2026-11-27 03:40 (UTC+03:00)». */
const stamp = (date: Date, timeZone?: string) => `${isoDay(date)} ${pad(date.getHours())}:${pad(date.getMinutes())} (${timeZone ?? offsetName(date)})`;

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
  // Q-72 (1): a file says where it came from — who asked, the filters, when (with the zone) and how many rows — then a blank line, then the table
  if (meta.exportedBy) metaRows.push([labels.by, meta.exportedBy]);
  if (meta.filters) metaRows.push([labels.filters, meta.filters]);
  metaRows.push([labels.generated, stamp(meta.exportedAt, meta.timeZone)]);
  metaRows.push([labels.rowCount, String(rows.length)]);
  const raw = rows.map(row => columns.map<ExportCell>(column => {
    const value = column.value(row);
    if (isCellSpec(value)) return { value: normalise(value.value), kind: value.kind };
    return { value: normalise(value), kind: column.kind ?? inferKind(value) };
  }));
  // a column that is wholly a percentage is exported as plain numbers ×100 under a header that says «(%)», not as an Excel percent format that hides what the number is;
  // a column that mixes kinds keeps each cell's own format (its header cannot name two units)
  const percentColumns = columns.map((column, index) => (raw.length ? raw.every(row => row[index].kind === "percent" || row[index].value === null) && raw.some(row => row[index].kind === "percent") : column.kind === "percent"));
  const cells = raw.map(row => row.map((cell, index) => (percentColumns[index] && cell.kind === "percent" ? { value: typeof cell.value === "number" ? Math.round(cell.value * 100 * 1e6) / 1e6 : cell.value, kind: "number" as const } : cell)));
  // A column that holds money carries the currency name in its header, so no figure is a bare number.
  const headerRow = columns.map((column, index) => {
    const hasMoney = column.kind === "money" || cells.some(row => row[index].kind === "money");
    if (percentColumns[index]) return `${column.header} (%)`;
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

export type ExportSheet<Row = unknown> = { sheetName: string; columns: readonly ExportColumn<Row>[]; rows: readonly Row[]; title?: string };

type ExcelSheet = import("exceljs").Worksheet;

/** Writes one table into a worksheet: the title block, the bold frozen header, the typed cells, the column widths. */
function writeSheet(sheet: ExcelSheet, layout: ExportLayout, rtl: boolean) {
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
  sheet.views = [{ rightToLeft: rtl, state: "frozen", ySplit: headerIndex }];
  layout.headerRow.forEach((text, index) => {
    const widest = Math.max(text.length, ...layout.rows.map(row => String(row[index]?.value instanceof Date ? "yyyy-mm-dd" : row[index]?.value ?? "").length));
    sheet.getColumn(index + 1).width = Math.min(Math.max(widest + 2, 12), 40);
  });
}

/** One workbook with a sheet per table (Q-57): every sheet goes through the same layout as a single table, so the cell kinds, the currency in the header and
 *  the direction are the same. Two sheets may not share a name, so a repeated name gets a number. */
export async function buildWorkbookOfSheets(input: { sheets: readonly ExportSheet<any>[]; meta: ExportMeta }): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  const used = new Set<string>();
  for (const spec of input.sheets) {
    const base = sheetNameFor(spec.sheetName);
    let name = base;
    for (let n = 2; used.has(name.toLowerCase()); n++) name = `${base.slice(0, 31 - String(n).length - 1)} ${n}`;
    used.add(name.toLowerCase());
    const layout = buildExportLayout(spec.columns, spec.rows, { ...input.meta, title: spec.title ?? input.meta.title });
    writeSheet(workbook.addWorksheet(name, { views: [{ rightToLeft: isRtlLanguage(input.meta.locale) }] }), layout, isRtlLanguage(input.meta.locale));
  }
  return (await workbook.xlsx.writeBuffer()) as ArrayBuffer;
}

/** Builds the .xlsx bytes. Right-to-left for Arabic. The header row is bold and frozen; columns are sized to their content. */
export async function buildTableWorkbook<Row>(input: {
  sheetName: string;
  columns: readonly ExportColumn<Row>[];
  rows: readonly Row[];
  meta: ExportMeta;
}): Promise<ArrayBuffer> {
  return buildWorkbookOfSheets({ sheets: [{ sheetName: input.sheetName, columns: input.columns, rows: input.rows }], meta: input.meta });
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
