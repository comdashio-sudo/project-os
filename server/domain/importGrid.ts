// Q-66 batch 1 (the owner, 26-11: «when importing, the files should show like an Excel table, clearer than one row at a time, after processing, to confirm
// it»; adviser's I68): the review grid of an import — every row of the file as the importer read it, each cell with what the reader did to it. Pure: the
// caller reads the file with the importer's own reader and passes what it found, so the grid never reads a file any other way than the import does.
//   corrected — the reader changed the value (a person's correction, a section filled down from above, a fraction read as a percent): the file's value is kept
//   error     — a reason that stops the row, on the cell of its field (or on the row when it names no field)
//   ignored   — a totals line or a row left out: not read, with its reason
import type { PmcImportError } from "./pmcImport";
import type { PmcAppliedEdit, PmcPreviewRow, PmcRowClass } from "./pmcImport";

export type GridWhy = "edited" | "replaced" | "filledDown" | "fraction";
export type GridCell = { value: string; from?: string; why?: GridWhy; errors?: Array<{ code: string; detail?: string }> };
export type GridStatus = "ready" | "corrected" | "error" | "ignored";
export type GridRow = { index: number; row: number; class: PmcRowClass; status: GridStatus; cells: Record<string, GridCell>; rowErrors: Array<{ code: string; detail?: string }> };
export const GRID_TABS = ["all", "ready", "corrected", "errors", "ignored"] as const;
export type GridTab = (typeof GRID_TABS)[number];
export type GridCounts = Record<GridTab, number>;

const fraction = (value: string) => {
  const number = Number(value.replace(/,/g, ""));
  return value !== "" && Number.isFinite(number) ? String(Math.round(number * 100 * 10000) / 10000) : null;
};

/** A weights table is checked as catalogue rows: its reasons name the catalogue's fields, which are these columns of the file. */
export const WEIGHTS_FIELD_OF: Readonly<Record<string, string>> = { weightPercent: "weight", groupCode: "csi", groupName: "csi", stageCode: "sub", stageName: "sub" };

export function buildImportGrid(input: { preview: PmcPreviewRow[]; fields: string[]; errors: PmcImportError[]; edits?: PmcAppliedEdit[]; scaledFromFractions?: boolean; weightField?: string;
  /** The column a reason's field is shown on, when the checks name another field than the file's (WEIGHTS_FIELD_OF). */
  fieldOf?: Readonly<Record<string, string>> }): GridRow[] {
  const editOf = new Map((input.edits ?? []).map(edit => [`${edit.row}:${edit.field}`, edit]));
  const errorsOf = new Map<number, PmcImportError[]>();
  for (const error of input.errors) if (error.rowNumber > 0) errorsOf.set(error.rowNumber, [...(errorsOf.get(error.rowNumber) ?? []), error]);
  const weightField = input.weightField ?? "weight";
  return input.preview.map((source, index) => {
    const cells: Record<string, GridCell> = {};
    const rowErrors: GridRow["rowErrors"] = [];
    const errors = source.class === "data" ? errorsOf.get(source.row) ?? [] : [];
    for (const field of input.fields) {
      const value = source.cells[field] ?? "";
      const cell: GridCell = { value };
      const edit = editOf.get(`${source.row}:${field}`);
      if (edit) Object.assign(cell, { from: edit.from, why: "edited" as const });
      else if (source.replaced?.[field] !== undefined) Object.assign(cell, { from: source.replaced[field], why: "replaced" as const });
      else if (source.filled?.[field] !== undefined) Object.assign(cell, { value: source.filled[field], from: value, why: "filledDown" as const });
      else if (source.class === "data" && input.scaledFromFractions && field === weightField) {
        const percent = fraction(value);
        if (percent !== null && percent !== value) Object.assign(cell, { value: percent, from: value, why: "fraction" as const });
      }
      cells[field] = cell;
    }
    for (const error of errors) {
      const reason = { code: error.code, ...(error.detail ? { detail: error.detail } : {}) };
      const field = error.field ? input.fieldOf?.[error.field] ?? error.field : undefined;
      if (field && cells[field]) (cells[field].errors ??= []).push(reason);
      else rowErrors.push(reason);
    }
    const status: GridStatus = source.class !== "data" ? "ignored" : errors.length ? "error" : Object.values(cells).some(cell => cell.why) ? "corrected" : "ready";
    return { index, row: source.row, class: source.class, status, cells, rowErrors };
  });
}

/** «Ready» is every row that will be read without a reason against it — the corrected ones included, so its count is what the confirmation writes from. */
export const inTab = (row: GridRow, tab: GridTab) => tab === "all" || (tab === "ready" ? row.status === "ready" || row.status === "corrected" : tab === "corrected" ? row.status === "corrected" : tab === "errors" ? row.status === "error" : row.status === "ignored");

export function countGrid(rows: GridRow[]): GridCounts {
  return Object.fromEntries(GRID_TABS.map(tab => [tab, rows.filter(row => inTab(row, tab)).length])) as GridCounts;
}

const searchKey = (value: string) => value.normalize("NFKC").toLowerCase().replace(/[ً-ٟـ]/g, "").trim();

/** The rows of a tab that hold the search text in any cell (as read or as in the file) or in their row number. */
export function filterGrid(rows: GridRow[], tab: GridTab, search?: string) {
  const needle = searchKey(search ?? "");
  return rows.filter(row => inTab(row, tab) && (!needle || String(row.row) === needle || Object.values(row.cells).some(cell => searchKey(cell.value).includes(needle) || (cell.from !== undefined && searchKey(cell.from).includes(needle)))));
}

/** One page of the grid; the screen asks for the next as it scrolls, so a file of 50,000 rows is never sent at once. */
export const GRID_PAGE_SIZE = 200;
