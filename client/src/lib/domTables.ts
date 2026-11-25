import type { ExportCellValue, ExportColumn, ExportSheet } from "./excelExport";

// Q-57 (2): "export the tables of this page". The tables the page draws are read as they are drawn — the same columns, in the language of the screen, with the
// filter the person has applied — so what a person cannot see is never in the file (the money and the salaries sit behind the server's own gates, and a table
// the server did not fill has no rows here). Nothing is sent to the server. Pure functions over a DOM subtree, tested in jsdom.

export type CollectedTable = { name: string; headers: string[]; rows: string[][] };

const squeeze = (text: string | null | undefined) => (text ?? "").replace(/\s+/g, " ").trim();

/** Arabic-Indic and Urdu digits to Western ones (written as escapes: screen code holds no non-Western digit), so a figure written with them is read as a number. */
export function westernDigits(text: string): string {
  return text.replace(/[\u0660-\u0669\u06F0-\u06F9]/g, digit => String(digit.charCodeAt(0) >= 0x06f0 ? digit.charCodeAt(0) - 0x06f0 : digit.charCodeAt(0) - 0x0660)).replace(/\u066B/g, ".").replace(/\u066C/g, ",");
}

/** A cell that is only a figure becomes a number (Excel can then sum and sort it); a code («007», «PRJ-1», «2.1.3») and any text stay text. */
export function cellValue(text: string): ExportCellValue | { value: number; kind: "percent" } {
  const plain = westernDigits(text).replace(/[‎‏‪-‮]/g, "").trim();
  if (!plain) return null;
  const percent = /^-?\d+(?:\.\d+)?\s?%$/.exec(plain);
  if (percent) return { value: Number.parseFloat(plain) / 100, kind: "percent" };
  if (/^-?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/.test(plain)) {
    const digits = plain.replace(/,/g, "");
    if (/^-?0\d/.test(digits)) return text; // a leading zero marks a code, not a quantity
    const value = Number(digits);
    if (Number.isFinite(value) && Math.abs(value) < 1e15) return value;
  }
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(plain);
  if (day) {
    const date = new Date(Date.UTC(Number(day[1]), Number(day[2]) - 1, Number(day[3])));
    if (date.getUTCFullYear() === Number(day[1]) && date.getUTCMonth() === Number(day[2]) - 1 && date.getUTCDate() === Number(day[3])) return date;
  }
  return text;
}

const isHidden = (element: Element) => element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true" || element.closest("[data-no-export]") !== null;

/** What names a table: its caption, its region label, or the heading just above it. */
function tableName(table: HTMLTableElement, index: number): string {
  const caption = squeeze(table.querySelector("caption")?.textContent);
  if (caption) return caption;
  const labelled = table.closest("[aria-label]")?.getAttribute("aria-label");
  if (labelled && squeeze(labelled)) return squeeze(labelled);
  let node: Element | null = table;
  while (node && node.tagName !== "BODY") {
    let sibling = node.previousElementSibling;
    while (sibling) {
      const heading = sibling.matches("h1,h2,h3,h4") ? sibling : sibling.querySelector("h1,h2,h3,h4");
      if (heading && squeeze(heading.textContent)) return squeeze(heading.textContent);
      sibling = sibling.previousElementSibling;
    }
    node = node.parentElement;
  }
  return `${index + 1}`;
}

function rowCells(row: HTMLTableRowElement): string[] {
  const cells: string[] = [];
  for (const cell of Array.from(row.cells)) {
    if (isHidden(cell)) continue;
    cells.push(squeeze(cell.textContent));
    for (let extra = 1; extra < Math.max(cell.colSpan, 1) && extra < 50; extra++) cells.push("");
  }
  return cells;
}

/** Every table drawn under `root`, except the hidden ones and those marked data-no-export. A row that is one wide cell is the table's empty message, not data. */
export function collectTables(root: ParentNode): CollectedTable[] {
  const tables = Array.from(root.querySelectorAll("table")).filter(table => !isHidden(table) && !table.closest("[hidden],[data-no-export]"));
  const out: CollectedTable[] = [];
  tables.forEach((table, index) => {
    const headRows = Array.from(table.tHead?.rows ?? []);
    const bodyRows = (table.tBodies.length ? Array.from(table.tBodies).flatMap(body => Array.from(body.rows)) : Array.from(table.rows).filter(row => !headRows.includes(row)))
      .filter(row => !isHidden(row));
    const header = (headRows.length ? headRows[headRows.length - 1] : bodyRows[0] && Array.from(bodyRows[0].cells).every(cell => cell.tagName === "TH") ? bodyRows.shift() : undefined);
    const headers = header ? rowCells(header) : [];
    // a row that is one cell spanning several columns is the table's empty message («no rows»), not data
    const dataRows = bodyRows.filter(row => !(row.cells.length === 1 && row.cells[0].colSpan > 1));
    const rows = dataRows.map(rowCells).filter(cells => cells.some(cell => cell !== ""));
    const width = Math.max(headers.length, ...rows.map(row => row.length), 0);
    if (width === 0) return;
    const paddedHeaders = Array.from({ length: width }, (_, column) => headers[column] || `${column + 1}`);
    out.push({ name: tableName(table, index), headers: paddedHeaders, rows: rows.map(row => Array.from({ length: width }, (_, column) => row[column] ?? "")) });
  });
  return out;
}

/** The sheets of a workbook, one per collected table. A table with no rows is still a sheet (its header), so the file says the page had it and it was empty. */
export function tablesToSheets(tables: readonly CollectedTable[]): ExportSheet<string[]>[] {
  return tables.map(table => ({
    sheetName: table.name,
    title: table.name,
    rows: table.rows,
    columns: table.headers.map<ExportColumn<string[]>>((header, column) => ({ header, value: row => cellValue(row[column] ?? "") as ExportCellValue })),
  }));
}
