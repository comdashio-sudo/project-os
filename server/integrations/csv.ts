// The standard CSV template of the ERP exchange (work order 12, item 11). For a company whose ERP has no connector here — or whose connector is still UNVERIFIED — a person exports the
// ERP's lists to this one layout and uploads it; each row becomes the same inbound record an API call or a connector would produce, and goes through the same applyErpBatch (same rules,
// same mapping, same log). A row that cannot be read is reported with its line number and why; the rows that can be read are applied.
import type { ErpEntity } from "./erpInbound";

type Column = { name: string; required?: boolean; kind?: "string" | "number" | "boolean" };
const SPEC: Record<ErpEntity, { columns: Column[]; example: string[] }> = {
  suppliers: { columns: [{ name: "externalId", required: true }, { name: "code", required: true }, { name: "legalName", required: true }, { name: "contactName" }, { name: "contactEmail" }, { name: "contactPhone" }, { name: "active", kind: "boolean" }], example: ["V-1001", "SUP-1001", "Example Cement Co.", "A. Buyer", "sales@supplier.example.test", "+966500000000", "true"] },
  "purchase-orders": { columns: [{ name: "externalId", required: true }, { name: "project", required: true }, { name: "number", required: true }, { name: "supplier" }, { name: "supplierName" }, { name: "orderDate", required: true }, { name: "amount", required: true, kind: "number" }, { name: "currency" }, { name: "summary" }, { name: "costCode" }], example: ["PO-2001", "PRJ-1", "PO-2001", "SUP-1001", "Example Cement Co.", "2026-10-02", "5520.00", "SAR", "Cement for block work", "1.1"] },
  "actual-costs": { columns: [{ name: "externalId", required: true }, { name: "project", required: true }, { name: "costCode", required: true }, { name: "amount", required: true, kind: "number" }, { name: "incurredAt", required: true }, { name: "category" }, { name: "description" }], example: ["GL-3001", "PRJ-1", "1.1", "4800.00", "2026-10-05", "materials", "Cement delivered"] },
  invoices: { columns: [{ name: "externalId", required: true }, { name: "number" }, { name: "supplier" }, { name: "date" }, { name: "amount", kind: "number" }, { name: "currency" }, { name: "project" }], example: ["INV-4001", "INV-4001", "SUP-1001", "2026-10-06", "5520.00", "SAR", "PRJ-1"] },
  payments: { columns: [{ name: "externalId", required: true }, { name: "number" }, { name: "supplier" }, { name: "date" }, { name: "amount", kind: "number" }, { name: "currency" }], example: ["PAY-5001", "PAY-5001", "SUP-1001", "2026-10-07", "5520.00", "SAR"] },
  "employee-costs": { columns: [{ name: "externalId", required: true }, { name: "project" }, { name: "period" }, { name: "role" }, { name: "hours", kind: "number" }, { name: "amount", kind: "number" }, { name: "currency" }], example: ["EMP-6001", "PRJ-1", "2026-09", "Site engineer", "176", "14000.00", "SAR"] },
};
export const CSV_ENTITIES = Object.keys(SPEC) as ErpEntity[];
export const CSV_MAX_ROWS = 5000;

const quote = (value: string) => (/[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value);
/** The template: the header row and one synthetic example row, UTF-8 with a BOM so Excel opens Arabic text correctly. */
export function csvTemplate(entity: ErpEntity): string {
  const spec = SPEC[entity];
  return "﻿" + [spec.columns.map(column => column.name).join(","), spec.example.map(quote).join(",")].join("\r\n") + "\r\n";
}

/** RFC 4180: quoted fields, doubled quotes, CR LF or LF row ends. A BOM and a trailing blank line are tolerated. */
export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') { if (text[i + 1] === '"') { field += '"'; i += 1; } else quoted = false; } else field += char;
    } else if (char === '"' && field === "") quoted = true;
    else if (char === ",") { row.push(field); field = ""; }
    else if (char === "\n" || char === "\r") { if (char === "\r" && text[i + 1] === "\n") i += 1; row.push(field); field = ""; if (row.some(cell => cell.trim() !== "")) rows.push(row); row = []; }
    else field += char;
  }
  if (quoted) throw new Error("CSV_UNTERMINATED_QUOTE");
  row.push(field);
  if (row.some(cell => cell.trim() !== "")) rows.push(row);
  return rows;
}

export type CsvRowError = { line: number; reason: string; detail?: string };
export function csvToRecords(entity: ErpEntity, input: string): { records: Array<Record<string, unknown>>; errors: CsvRowError[] } {
  const spec = SPEC[entity];
  const rows = parseCsv(input);
  if (!rows.length) return { records: [], errors: [{ line: 1, reason: "CSV_EMPTY" }] };
  const header = rows[0].map(cell => cell.trim());
  const known = new Set(spec.columns.map(column => column.name));
  const unknown = header.filter(name => !known.has(name));
  const missing = spec.columns.filter(column => column.required && !header.includes(column.name)).map(column => column.name);
  if (missing.length) return { records: [], errors: [{ line: 1, reason: "CSV_COLUMN_MISSING", detail: missing.join(",") }] };
  if (unknown.length && entity !== "invoices" && entity !== "payments" && entity !== "employee-costs") return { records: [], errors: [{ line: 1, reason: "CSV_COLUMN_UNKNOWN", detail: unknown.join(",") }] };
  if (rows.length - 1 > CSV_MAX_ROWS) return { records: [], errors: [{ line: 1, reason: "CSV_TOO_MANY_ROWS", detail: String(CSV_MAX_ROWS) }] };
  const records: Array<Record<string, unknown>> = []; const errors: CsvRowError[] = [];
  rows.slice(1).forEach((cells, index) => {
    const line = index + 2; const record: Record<string, unknown> = {}; let failed = false;
    header.forEach((name, column) => {
      const value = (cells[column] ?? "").trim();
      const def = spec.columns.find(item => item.name === name);
      if (value === "") { if (def?.required && !failed) { errors.push({ line, reason: "CSV_VALUE_MISSING", detail: name }); failed = true; } return; }
      if (def?.kind === "number") { const n = Number(value.replace(/,/g, "")); if (!Number.isFinite(n)) { if (!failed) errors.push({ line, reason: "CSV_NUMBER_INVALID", detail: name }); failed = true; return; } record[name] = n; }
      else if (def?.kind === "boolean") record[name] = /^(true|1|yes|y)$/i.test(value);
      else record[name] = value;
    });
    if (!failed) records.push(record);
  });
  return { records, errors };
}
