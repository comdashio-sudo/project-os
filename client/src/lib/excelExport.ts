// Table exports built in the browser (work order 8). The layout is a pure function so it is tested without a workbook; the writer
// loads exceljs on demand, as the import screens already do. Numbers stay numbers and dates stay dates, so Excel can sum and sort them.

export type ExportCellKind = "text" | "number" | "money" | "percent" | "date";

export type ExportColumn<Row> = {
  /** The header as it appears on screen. */
  header: string;
  /** The value this row shows in the column. Pass numbers as numbers and dates as Date objects, never as formatted text. */
  value: (row: Row) => string | number | Date | null | undefined;
  /** Optional: how Excel formats the cell. `percent` expects a fraction (0.25 shows as 25%). Inferred when omitted. */
  kind?: ExportCellKind;
};

export type ExportMeta = {
  title: string;
  company?: string;
  project?: string;
  exportedAt: Date;
  locale: "ar" | "en";
};

export type ExportCell = { value: string | number | Date | null; kind: ExportCellKind };

export type ExportLayout = {
  /** The title block above the table: title, company, project, export date. */
  metaRows: string[][];
  headerRow: string[];
  rows: ExportCell[][];
};

const LABELS = {
  ar: { company: "الشركة", project: "المشروع", exported: "تاريخ التصدير" },
  en: { company: "Company", project: "Project", exported: "Exported on" },
} as const;

const isoDay = (date: Date) => date.toISOString().slice(0, 10);

function normalise(value: string | number | Date | null | undefined): string | number | Date | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  return value;
}

/** Inferred from the raw value, so an empty cell in a numeric column still formats as a number. */
function inferKind(raw: string | number | Date | null | undefined): ExportCellKind {
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
    return { value: normalise(raw), kind: column.kind ?? inferKind(raw) };
  }));
  return { metaRows, headerRow: columns.map(column => column.header), rows: cells };
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
  const sheet = workbook.addWorksheet(sheetNameFor(input.sheetName), { views: [{ rightToLeft: input.meta.locale === "ar" }] });
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
  sheet.views = [{ rightToLeft: input.meta.locale === "ar", state: "frozen", ySplit: headerIndex }];
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
  URL.revokeObjectURL(url);
}
