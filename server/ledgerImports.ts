import { type ExportLocale } from "@shared/exportLocale";
// Excel cycle for the operational data that is appended rather than keyed by a code on a master list (work order 11, item 4):
// actual costs, purchase orders, employees and hours. Each module has the same four steps as the master-data cycle: a template, an export (with a hidden id and version
// on every row), a differences preview (new / modified / unchanged / conflict, nothing written), and a confirmation that writes exactly what was previewed.
//
// What an import may NOT do is the point of this file. It writes through the same rules the screens use and never around an approval path:
//   · actual costs     every row is tied to a WBS item that exists (or to a budget line that is linked to one); a posted cost is read-only — an exported row that is edited is refused
//   · purchase orders  always created as drafts; only a draft may be changed; the Status column is shown but a change to it is refused (submitting / approving stays a workflow action)
//   · employees        the working record only (no nationality, no identity document); terminating stays on the HR screen; every read of the records is audited
//   · hours            the employee's assignment on this project, and the approved-attendance rule of the hours screen, are enforced row by row; entries are created as drafts
import { createHash, randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { auditLogs, budgetLines, contracts, costEntries, employeeAssignments, employeeAttendance, employees, employeeTimeEntries, purchaseOrders, suppliers, wbsItems } from "../drizzle/schema";
import { acceptedHeaders, isLedgerModule, ledgerColumns, LEDGER_ID_HEADER, LEDGER_VERSION_HEADER, type LedgerColumn, type LedgerModule } from "@shared/ledgerImportColumns";
import { assertHrRecordAccess, assertProjectWithinTenant, assertTenantFeatureAccess, createDataExport, createTeamTimeEntriesForTenant, getDb } from "./db";
import { buildDataExportFile, type ExportModuleCode } from "./domain/dataImport";
import { readSpreadsheetSafely, spreadsheetBoundsError, worksheetToRows } from "./domain/excelWorkbook";
import { diffHash, type DiffEntry, type FieldChange, type MissingRow } from "./domain/importCycle";

export { isLedgerModule, type LedgerModule };
type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
export type LedgerScope = { userId: number; tenantId: string; projectId: string };
export type LedgerError = { rowNumber: number; code: string; field?: string; detail?: string };
export type LedgerCounts = { createdRows: number; updatedRows: number; skippedRows: number };
export type LedgerPlan = {
  totalRows: number;
  entries: DiffEntry[];
  errors: LedgerError[];
  missing: MissingRow[];
  /** True when the plan read employee records (names, numbers): the caller audits that read. */
  readsEmployeeRecords: boolean;
  apply: ((context: { importId: string; db: Db }) => Promise<{ counts: LedgerCounts; results: Array<{ rowNumber: number; key: string; action: "created" | "updated" | "skipped"; entityId: string | null }> }>) | null;
};

const CHUNK = 1000;
const chunks = <T,>(items: readonly T[], size = CHUNK) => Array.from({ length: Math.ceil(items.length / size) }, (_unused, index) => items.slice(index * size, (index + 1) * size));
const norm = (value: unknown) => String(value ?? "").replace(/^﻿/, "").trim().toLowerCase().replace(/[_\s-]+/g, " ");
const text = (value: unknown) => String(value ?? "").trim();
const money = (value: number) => (Math.round(value * 100) / 100).toFixed(2);

/** A plain number from a cell: a number, or text such as "12,500.00". Anything else is undefined. */
function numberOf(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  const source = text(value).replace(/,/g, "");
  if (!/^-?\d+(\.\d+)?$/.test(source)) return undefined;
  return Number(source);
}
/** A calendar day (UTC midnight) from a date cell or "YYYY-MM-DD" text. */
function dayOf(value: unknown): Date | undefined {
  if (value instanceof Date) return Number.isFinite(value.getTime()) ? new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate())) : undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(text(value));
  if (!match) return undefined;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCMonth() === Number(match[2]) - 1 ? date : undefined; // 2026-02-31 is not a day
}
const dayKey = (date: Date | null | undefined) => (date ? date.toISOString().slice(0, 10) : "");

type ParsedRow = { rowNumber: number; cells: Record<string, unknown>; fileId?: string; fileVersion?: string };

async function readTable(moduleCode: LedgerModule, format: "xlsx" | "csv", bytes: Buffer): Promise<{ rows: ParsedRow[]; errors: LedgerError[] }> {
  const fail = (code: string): { rows: ParsedRow[]; errors: LedgerError[] } => ({ rows: [], errors: [{ rowNumber: 0, code }] });
  const parsed = await readSpreadsheetSafely(format === "csv" ? bytes.toString("utf8") : bytes, format);
  if (!parsed.ok) return fail(parsed.code);
  if (parsed.workbook.worksheets.length !== 1) return fail(parsed.workbook.worksheets.length === 0 ? "IMPORT_EMPTY_WORKBOOK" : "IMPORT_SINGLE_SHEET_REQUIRED");
  const sheet = parsed.workbook.worksheets[0]!;
  const { headers, rows } = worksheetToRows(sheet);
  const bounds = spreadsheetBoundsError(sheet, rows);
  if (bounds) return fail(bounds);
  const columns = ledgerColumns[moduleCode];
  const accepted = (column: LedgerColumn) => new Set(acceptedHeaders(column).map(norm));
  const headerOf = new Map<string, string>();
  for (const column of columns) { const names = accepted(column); const header = headers.find(candidate => names.has(norm(candidate))); if (header) headerOf.set(column.key, header); }
  const known = new Set(Array.from(headerOf.values()));
  const errors: LedgerError[] = [];
  for (const header of headers) if (header && !known.has(header) && header !== LEDGER_ID_HEADER && header !== LEDGER_VERSION_HEADER) errors.push({ rowNumber: 0, code: "IMPORT_UNSUPPORTED_COLUMN", field: header });
  for (const column of columns) if (column.required && !headerOf.has(column.key)) errors.push({ rowNumber: 0, code: "IMPORT_REQUIRED_COLUMN_MISSING", field: column.key });
  if (errors.length) return { rows: [], errors };
  return {
    errors,
    rows: rows.map((row, index) => ({
      rowNumber: index + 2,
      cells: Object.fromEntries(columns.map(column => [column.key, headerOf.has(column.key) ? row[headerOf.get(column.key)!] : undefined])),
      fileId: text(row[LEDGER_ID_HEADER]) || undefined,
      fileVersion: text(row[LEDGER_VERSION_HEADER]) || undefined,
    })),
  };
}

const change = (field: string, before: unknown, after: unknown): FieldChange[] => (String(before ?? "") === String(after ?? "") ? [] : [{ field, oldValue: String(before ?? ""), newValue: String(after ?? "") }]);
const entry = (rowNumber: number, key: string, kind: DiffEntry["kind"], changes: FieldChange[] = [], conflict?: string): DiffEntry => ({ rowNumber, key, kind, changes, ...(conflict ? { conflict } : {}) });

// ------------------------------------------------------------------------------------------------------------------------------------------- costs
const COST_CATEGORIES: Record<string, "materials" | "labour" | "subcontract" | "other"> = {
  materials: "materials", material: "materials", مواد: "materials", labour: "labour", labor: "labour", عمالة: "labour", subcontract: "subcontract", "مقاول من الباطن": "subcontract", other: "other", أخرى: "other", "\u0627\u062E\u0631\u0649": "other",
};

async function planCosts(db: Db, scope: LedgerScope, rows: ParsedRow[]): Promise<LedgerPlan> {
  const [wbs, budgets] = await Promise.all([
    db.select({ id: wbsItems.id, code: wbsItems.code }).from(wbsItems).where(and(eq(wbsItems.tenantId, scope.tenantId), eq(wbsItems.projectId, scope.projectId))),
    db.select({ id: budgetLines.id, costCode: budgetLines.costCode, wbsItemId: budgetLines.wbsItemId }).from(budgetLines).where(and(eq(budgetLines.tenantId, scope.tenantId), eq(budgetLines.projectId, scope.projectId))),
  ]);
  const wbsByCode = new Map(wbs.map(item => [item.code, item.id])); const wbsCodeById = new Map(wbs.map(item => [item.id, item.code]));
  const budgetByCode = new Map(budgets.map(item => [item.costCode, item]));
  const ids = Array.from(new Set(rows.flatMap(row => (row.fileId ? [row.fileId] : []))));
  const existing = new Map<string, { wbsItemId: string | null; amount: string; category: string; incurredAt: Date; status: string; entryType: string }>();
  for (const part of chunks(ids, 5000)) for (const row of await db.select({ id: costEntries.id, wbsItemId: costEntries.wbsItemId, amount: costEntries.amount, category: costEntries.category, incurredAt: costEntries.incurredAt, status: costEntries.status, entryType: costEntries.entryType }).from(costEntries).where(and(eq(costEntries.tenantId, scope.tenantId), eq(costEntries.projectId, scope.projectId), inArray(costEntries.id, part)))) existing.set(row.id, row);

  const errors: LedgerError[] = []; const entries: DiffEntry[] = [];
  const creates: Array<{ rowNumber: number; id: string; wbsItemId: string; amount: number; category: "materials" | "labour" | "subcontract" | "other"; incurredAt: Date }> = [];
  for (const { rowNumber, cells, fileId } of rows) {
    const before = errors.length;
    const wbsCode = text(cells.wbsCode); const costCode = text(cells.costCode);
    const amount = numberOf(cells.amount); const incurredAt = dayOf(cells.incurredAt);
    const category = text(cells.category) ? COST_CATEGORIES[norm(cells.category)] : "other";
    if (amount === undefined || amount <= 0) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "amount" });
    if (!incurredAt) errors.push({ rowNumber, code: "IMPORT_INVALID_DATE", field: "incurredAt" });
    if (!category) errors.push({ rowNumber, code: "COST_CATEGORY_INVALID", field: "category" });
    // every row is tied to something that exists: a WBS item, or a budget line that is itself linked to one
    let wbsItemId: string | undefined;
    if (!wbsCode && !costCode) errors.push({ rowNumber, code: "COST_ROW_NOT_LINKED", field: "wbsCode" });
    if (wbsCode) { wbsItemId = wbsByCode.get(wbsCode); if (!wbsItemId) errors.push({ rowNumber, code: "COST_WBS_NOT_FOUND", field: "wbsCode", detail: wbsCode }); }
    if (costCode) {
      const line = budgetByCode.get(costCode);
      if (!line) errors.push({ rowNumber, code: "COST_BUDGET_LINE_NOT_FOUND", field: "costCode", detail: costCode });
      else if (!line.wbsItemId) errors.push({ rowNumber, code: "COST_BUDGET_LINE_WITHOUT_WBS", field: "costCode", detail: costCode });
      else if (wbsItemId && line.wbsItemId !== wbsItemId) errors.push({ rowNumber, code: "COST_LINK_MISMATCH", field: "costCode", detail: costCode });
      else if (!wbsCode) wbsItemId = line.wbsItemId;
    }
    if (errors.length > before || !wbsItemId || amount === undefined || !incurredAt || !category) continue;
    if (!fileId) { const id = randomUUID(); creates.push({ rowNumber, id, wbsItemId, amount, category, incurredAt }); entries.push(entry(rowNumber, `row ${rowNumber}`, "new", [...change("wbsCode", "", wbsCodeById.get(wbsItemId)), ...change("amount", "", money(amount)), ...change("incurredAt", "", dayKey(incurredAt)), ...change("category", "", category)])); continue; }
    const stored = existing.get(fileId);
    if (!stored || stored.entryType !== "actual") { entries.push(entry(rowNumber, fileId, "conflict", [], "ID_KEY_MISMATCH")); continue; }
    const changes = [...change("wbsCode", wbsCodeById.get(stored.wbsItemId ?? ""), wbsCodeById.get(wbsItemId)), ...change("amount", money(Number(stored.amount)), money(amount)), ...change("incurredAt", dayKey(stored.incurredAt), dayKey(incurredAt)), ...change("category", stored.category, category)];
    // a posted cost is a ledger line: the sheet can confirm it, it cannot rewrite it
    entries.push(changes.length ? entry(rowNumber, fileId, "conflict", changes, "COST_ENTRY_READ_ONLY") : entry(rowNumber, fileId, "unchanged"));
  }
  return {
    totalRows: rows.length, entries, errors, missing: [], readsEmployeeRecords: false,
    apply: errors.length || entries.some(item => item.kind === "conflict") || !creates.length ? null : async ({ importId, db: handle }) => {
      await handle.transaction(async tx => {
        for (const part of chunks(creates)) {
          await tx.insert(costEntries).values(part.map(item => ({ id: item.id, tenantId: scope.tenantId, projectId: scope.projectId, wbsItemId: item.wbsItemId, amount: money(item.amount), entryType: "actual" as const, status: "posted" as const, incurredAt: item.incurredAt, category: item.category, sourceType: "excel_import", sourceId: importId })));
          await tx.insert(auditLogs).values(part.map(item => ({ id: randomUUID(), tenantId: scope.tenantId, actorUserId: scope.userId, action: "project.cost_entry_created", entityType: "cost_entry", entityId: item.id, metadata: JSON.stringify({ projectId: scope.projectId, wbsItemId: item.wbsItemId, amount: money(item.amount), incurredAt: item.incurredAt.toISOString(), source: "excel_import", importId }) })));
        }
      });
      return { counts: { createdRows: creates.length, updatedRows: 0, skippedRows: entries.length - creates.length }, results: creates.map(item => ({ rowNumber: item.rowNumber, key: `row ${item.rowNumber}`, action: "created" as const, entityId: item.id })) };
    },
  };
}

// ------------------------------------------------------------------------------------------------------------------------------------ purchase orders
async function planPurchaseOrders(db: Db, scope: LedgerScope, rows: ParsedRow[]): Promise<LedgerPlan> {
  const [wbs, contractRows, supplierRows, orders] = await Promise.all([
    db.select({ id: wbsItems.id, code: wbsItems.code }).from(wbsItems).where(and(eq(wbsItems.tenantId, scope.tenantId), eq(wbsItems.projectId, scope.projectId))),
    db.select({ id: contracts.id, code: contracts.code }).from(contracts).where(and(eq(contracts.tenantId, scope.tenantId), eq(contracts.projectId, scope.projectId))),
    db.select({ id: suppliers.id, code: suppliers.code, legalName: suppliers.legalName, active: suppliers.active }).from(suppliers).where(eq(suppliers.tenantId, scope.tenantId)),
    db.select().from(purchaseOrders).where(and(eq(purchaseOrders.tenantId, scope.tenantId), eq(purchaseOrders.projectId, scope.projectId))),
  ]);
  const wbsByCode = new Map(wbs.map(item => [item.code, item.id])); const wbsCodeById = new Map(wbs.map(item => [item.id, item.code]));
  const contractByCode = new Map(contractRows.map(item => [item.code, item.id])); const contractCodeById = new Map(contractRows.map(item => [item.id, item.code]));
  const supplierByCode = new Map(supplierRows.map(item => [item.code, item])); const supplierCodeById = new Map(supplierRows.map(item => [item.id, item.code]));
  const orderByNumber = new Map(orders.map(order => [order.purchaseOrderNumber, order]));

  const errors: LedgerError[] = []; const entries: DiffEntry[] = []; const seen = new Set<string>();
  type Fields = { purchaseOrderNumber: string; orderDate: Date; amount: number; summary: string; contractId: string | null; supplierId: string | null; supplierName: string; wbsItemId: string | null };
  const creates: Array<{ rowNumber: number; id: string; fields: Fields }> = []; const updates: Array<{ rowNumber: number; id: string; fields: Fields }> = [];
  for (const { rowNumber, cells, fileId, fileVersion } of rows) {
    const before = errors.length;
    const number = text(cells.purchaseOrderNumber); const orderDate = dayOf(cells.orderDate); const amount = numberOf(cells.amount); const summary = text(cells.summary);
    if (!number) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "purchaseOrderNumber" });
    else if (seen.has(number)) errors.push({ rowNumber, code: "IMPORT_DUPLICATE_FILE_KEY", field: "purchaseOrderNumber" });
    seen.add(number);
    if (!orderDate) errors.push({ rowNumber, code: "IMPORT_INVALID_DATE", field: "orderDate" });
    if (amount === undefined || amount <= 0) errors.push({ rowNumber, code: "IMPORT_INVALID_NUMBER", field: "amount" });
    if (!summary) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "summary" });
    const contractCode = text(cells.contractCode); const supplierCode = text(cells.supplierCode); const wbsCode = text(cells.wbsCode);
    // an order is tied to a contract or to a supplier that exists (and, when a register supplier is named, is active)
    let contractId: string | null = null; let supplierId: string | null = null; let supplierName = text(cells.supplierName);
    if (!contractCode && !supplierCode) errors.push({ rowNumber, code: "PO_NOT_LINKED", field: "contractCode" });
    if (contractCode) { contractId = contractByCode.get(contractCode) ?? null; if (!contractId) errors.push({ rowNumber, code: "PO_CONTRACT_NOT_FOUND", field: "contractCode", detail: contractCode }); }
    if (supplierCode) {
      const supplier = supplierByCode.get(supplierCode);
      if (!supplier) errors.push({ rowNumber, code: "PO_SUPPLIER_NOT_FOUND", field: "supplierCode", detail: supplierCode });
      else if (!supplier.active) errors.push({ rowNumber, code: "PO_SUPPLIER_INACTIVE", field: "supplierCode", detail: supplierCode });
      else { supplierId = supplier.id; supplierName = supplier.legalName; } // the name on the order is the register's, as on the screen
    } else if (supplierName.length < 2) errors.push({ rowNumber, code: "PO_SUPPLIER_NAME_REQUIRED", field: "supplierName" });
    let wbsItemId: string | null = null;
    if (wbsCode) { wbsItemId = wbsByCode.get(wbsCode) ?? null; if (!wbsItemId) errors.push({ rowNumber, code: "COST_WBS_NOT_FOUND", field: "wbsCode", detail: wbsCode }); }
    const statusCell = norm(cells.status);
    if (errors.length > before || !orderDate || amount === undefined) continue;
    const fields: Fields = { purchaseOrderNumber: number, orderDate, amount, summary, contractId, supplierId, supplierName, wbsItemId };
    const stored = orderByNumber.get(number);
    if (!stored) {
      if (fileId) { entries.push(entry(rowNumber, number, "conflict", [], "ID_KEY_MISMATCH")); continue; }
      if (statusCell && statusCell !== "draft") { errors.push({ rowNumber, code: "PO_STATUS_READ_ONLY", field: "status" }); continue; } // an imported order is a draft; submitting is a workflow action
      creates.push({ rowNumber, id: randomUUID(), fields });
      entries.push(entry(rowNumber, number, "new", [...change("amount", "", money(amount)), ...change("orderDate", "", dayKey(orderDate)), ...change("contractCode", "", contractCode), ...change("supplierCode", "", supplierCode), ...change("summary", "", summary)]));
      continue;
    }
    if (fileId && fileId !== stored.id) { entries.push(entry(rowNumber, number, "conflict", [], "ID_KEY_MISMATCH")); continue; }
    if (fileVersion && fileVersion !== stored.updatedAt.toISOString()) { entries.push(entry(rowNumber, number, "conflict", [], "VERSION_CHANGED")); continue; }
    if (statusCell && statusCell !== stored.status) { entries.push(entry(rowNumber, number, "conflict", change("status", stored.status, statusCell), "PO_STATUS_READ_ONLY")); continue; }
    const changes = [
      ...change("orderDate", dayKey(stored.orderDate), dayKey(orderDate)), ...change("amount", money(Number(stored.amount)), money(amount)), ...change("summary", stored.summary, summary),
      ...change("contractCode", contractCodeById.get(stored.contractId ?? ""), contractCode), ...change("supplierCode", supplierCodeById.get(stored.supplierId ?? ""), supplierCode),
      ...(supplierCode ? [] : change("supplierName", stored.supplierName, supplierName)), ...change("wbsCode", wbsCodeById.get(stored.wbsItemId ?? ""), wbsCode),
    ];
    if (!changes.length) { entries.push(entry(rowNumber, number, "unchanged")); continue; }
    if (stored.status !== "draft") { entries.push(entry(rowNumber, number, "conflict", changes, "PO_NOT_DRAFT")); continue; } // only a draft may change; an order in the workflow is edited there
    updates.push({ rowNumber, id: stored.id, fields });
    entries.push(entry(rowNumber, number, "modified", changes));
  }
  const missing = orders.filter(order => !seen.has(order.purchaseOrderNumber)).map(order => ({ key: order.purchaseOrderNumber }));
  const writable = !errors.length && !entries.some(item => item.kind === "conflict") && (creates.length > 0 || updates.length > 0);
  return {
    totalRows: rows.length, entries, errors, missing, readsEmployeeRecords: false,
    apply: !writable ? null : async ({ importId, db: handle }) => {
      await handle.transaction(async tx => {
        for (const part of chunks(creates)) {
          await tx.insert(purchaseOrders).values(part.map(item => ({ id: item.id, tenantId: scope.tenantId, projectId: scope.projectId, contractId: item.fields.contractId, wbsItemId: item.fields.wbsItemId, supplierId: item.fields.supplierId, purchaseOrderNumber: item.fields.purchaseOrderNumber, supplierName: item.fields.supplierName, orderDate: item.fields.orderDate, amount: money(item.fields.amount), currency: "SAR", summary: item.fields.summary, status: "draft" as const, createdByUserId: scope.userId })));
          await tx.insert(auditLogs).values(part.map(item => ({ id: randomUUID(), tenantId: scope.tenantId, actorUserId: scope.userId, action: "procurement.purchase_order_created", entityType: "purchase_order", entityId: item.id, metadata: JSON.stringify({ projectId: scope.projectId, purchaseOrderNumber: item.fields.purchaseOrderNumber, amount: money(item.fields.amount), source: "excel_import", importId }) })));
        }
        for (const item of updates) {
          const done = await tx.update(purchaseOrders).set({ contractId: item.fields.contractId, wbsItemId: item.fields.wbsItemId, supplierId: item.fields.supplierId, supplierName: item.fields.supplierName, orderDate: item.fields.orderDate, amount: money(item.fields.amount), summary: item.fields.summary })
            .where(and(eq(purchaseOrders.id, item.id), eq(purchaseOrders.tenantId, scope.tenantId), eq(purchaseOrders.projectId, scope.projectId), eq(purchaseOrders.status, "draft"))).returning({ id: purchaseOrders.id });
          if (!done.length) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_IMPORT_VERSION_CONFLICT" }); // it left draft since the preview: nothing of this import is written
          await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: scope.tenantId, actorUserId: scope.userId, action: "procurement.purchase_order_updated", entityType: "purchase_order", entityId: item.id, metadata: JSON.stringify({ projectId: scope.projectId, purchaseOrderNumber: item.fields.purchaseOrderNumber, source: "excel_import", importId }) });
        }
      });
      return { counts: { createdRows: creates.length, updatedRows: updates.length, skippedRows: entries.length - creates.length - updates.length }, results: [...creates.map(item => ({ rowNumber: item.rowNumber, key: item.fields.purchaseOrderNumber, action: "created" as const, entityId: item.id })), ...updates.map(item => ({ rowNumber: item.rowNumber, key: item.fields.purchaseOrderNumber, action: "updated" as const, entityId: item.id }))] };
    },
  };
}

// -------------------------------------------------------------------------------------------------------------------------------------------- employees
async function planEmployees(db: Db, scope: LedgerScope, rows: ParsedRow[]): Promise<LedgerPlan> {
  const stored = await db.select({ id: employees.id, employeeNumber: employees.employeeNumber, fullName: employees.fullName, jobTitle: employees.jobTitle, department: employees.department, hireDate: employees.hireDate, employmentStatus: employees.employmentStatus, archivedAt: employees.archivedAt, updatedAt: employees.updatedAt }).from(employees).where(eq(employees.tenantId, scope.tenantId));
  const byNumber = new Map(stored.map(row => [row.employeeNumber, row]));
  const errors: LedgerError[] = []; const entries: DiffEntry[] = []; const seen = new Set<string>();
  type Fields = { employeeNumber: string; fullName: string; jobTitle: string; department: string; hireDate: Date; employmentStatus: "active" | "suspended" };
  const creates: Array<{ rowNumber: number; id: string; fields: Fields }> = []; const updates: Array<{ rowNumber: number; id: string; fields: Fields }> = [];
  for (const { rowNumber, cells, fileId, fileVersion } of rows) {
    const before = errors.length;
    const number = text(cells.employeeNumber); const fullName = text(cells.fullName); const jobTitle = text(cells.jobTitle); const department = text(cells.department); const hireDate = dayOf(cells.hireDate);
    const status = norm(cells.employmentStatus) || "active";
    if (!number) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "employeeNumber" });
    else if (seen.has(number)) errors.push({ rowNumber, code: "IMPORT_DUPLICATE_FILE_KEY", field: "employeeNumber" });
    seen.add(number);
    if (fullName.length < 2) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "fullName" });
    if (!jobTitle) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "jobTitle" });
    if (!department) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "department" });
    if (!hireDate) errors.push({ rowNumber, code: "IMPORT_INVALID_DATE", field: "hireDate" });
    if (!["active", "suspended", "terminated"].includes(status)) errors.push({ rowNumber, code: "EMPLOYEE_STATUS_INVALID", field: "employmentStatus" });
    if (errors.length > before || !hireDate) continue;
    const current = byNumber.get(number);
    if (!current) {
      if (fileId) { entries.push(entry(rowNumber, number, "conflict", [], "ID_KEY_MISMATCH")); continue; }
      if (status === "terminated") { errors.push({ rowNumber, code: "EMPLOYEE_TERMINATION_NOT_BY_IMPORT", field: "employmentStatus" }); continue; } // a new record is never born terminated
      creates.push({ rowNumber, id: randomUUID(), fields: { employeeNumber: number, fullName, jobTitle, department, hireDate, employmentStatus: status as "active" | "suspended" } });
      entries.push(entry(rowNumber, number, "new", [...change("fullName", "", fullName), ...change("jobTitle", "", jobTitle), ...change("department", "", department), ...change("hireDate", "", dayKey(hireDate)), ...change("employmentStatus", "", status)]));
      continue;
    }
    if (fileId && fileId !== current.id) { entries.push(entry(rowNumber, number, "conflict", [], "ID_KEY_MISMATCH")); continue; }
    if (fileVersion && fileVersion !== current.updatedAt.toISOString()) { entries.push(entry(rowNumber, number, "conflict", [], "VERSION_CHANGED")); continue; }
    const changes = [...change("fullName", current.fullName, fullName), ...change("jobTitle", current.jobTitle, jobTitle), ...change("department", current.department, department), ...change("hireDate", dayKey(current.hireDate), dayKey(hireDate)), ...change("employmentStatus", current.employmentStatus, status)];
    if (!changes.length) { entries.push(entry(rowNumber, number, "unchanged")); continue; }
    // terminating (and anything done to a terminated or archived record) belongs to the HR screen, where its consequences are handled
    if (current.employmentStatus === "terminated" || current.archivedAt) { entries.push(entry(rowNumber, number, "conflict", changes, "EMPLOYEE_READ_ONLY")); continue; }
    if (status === "terminated") { entries.push(entry(rowNumber, number, "conflict", changes, "EMPLOYEE_TERMINATION_NOT_BY_IMPORT")); continue; }
    updates.push({ rowNumber, id: current.id, fields: { employeeNumber: number, fullName, jobTitle, department, hireDate, employmentStatus: status as "active" | "suspended" } });
    entries.push(entry(rowNumber, number, "modified", changes));
  }
  const missing = stored.filter(row => !seen.has(row.employeeNumber)).map(row => ({ key: row.employeeNumber }));
  const writable = !errors.length && !entries.some(item => item.kind === "conflict") && (creates.length > 0 || updates.length > 0);
  return {
    totalRows: rows.length, entries, errors, missing, readsEmployeeRecords: true,
    apply: !writable ? null : async ({ importId, db: handle }) => {
      await handle.transaction(async tx => {
        for (const part of chunks(creates)) {
          await tx.insert(employees).values(part.map(item => ({ id: item.id, tenantId: scope.tenantId, employeeNumber: item.fields.employeeNumber, fullName: item.fields.fullName, jobTitle: item.fields.jobTitle, department: item.fields.department, hireDate: item.fields.hireDate, employmentStatus: item.fields.employmentStatus, createdByUserId: scope.userId })));
          await tx.insert(auditLogs).values(part.map(item => ({ id: randomUUID(), tenantId: scope.tenantId, actorUserId: scope.userId, action: "hr.employee_created", entityType: "employee", entityId: item.id, metadata: JSON.stringify({ employeeNumber: item.fields.employeeNumber, source: "excel_import", importId }) })));
        }
        for (const item of updates) {
          const done = await tx.update(employees).set({ fullName: item.fields.fullName, jobTitle: item.fields.jobTitle, department: item.fields.department, hireDate: item.fields.hireDate, employmentStatus: item.fields.employmentStatus }).where(and(eq(employees.id, item.id), eq(employees.tenantId, scope.tenantId))).returning({ id: employees.id });
          if (!done.length) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_IMPORT_VERSION_CONFLICT" });
          await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: scope.tenantId, actorUserId: scope.userId, action: "hr.employee_updated", entityType: "employee", entityId: item.id, metadata: JSON.stringify({ employeeNumber: item.fields.employeeNumber, source: "excel_import", importId }) });
        }
      });
      return { counts: { createdRows: creates.length, updatedRows: updates.length, skippedRows: entries.length - creates.length - updates.length }, results: [...creates.map(item => ({ rowNumber: item.rowNumber, key: item.fields.employeeNumber, action: "created" as const, entityId: item.id })), ...updates.map(item => ({ rowNumber: item.rowNumber, key: item.fields.employeeNumber, action: "updated" as const, entityId: item.id }))] };
    },
  };
}

// ------------------------------------------------------------------------------------------------------------------------------------------ hours
async function planTimeEntries(db: Db, scope: LedgerScope, rows: ParsedRow[]): Promise<LedgerPlan> {
  const numbers = Array.from(new Set(rows.map(row => text(row.cells.employeeNumber)).filter(Boolean)));
  const people = new Map<string, string>();
  for (const part of chunks(numbers, 5000)) for (const row of await db.select({ id: employees.id, employeeNumber: employees.employeeNumber }).from(employees).where(and(eq(employees.tenantId, scope.tenantId), inArray(employees.employeeNumber, part)))) people.set(row.employeeNumber, row.id);
  const employeeIds = Array.from(people.values());
  const [assignments, attendance, entriesStored] = await Promise.all([
    employeeIds.length ? db.select({ id: employeeAssignments.id, employeeId: employeeAssignments.employeeId, plannedStartAt: employeeAssignments.plannedStartAt, plannedFinishAt: employeeAssignments.plannedFinishAt, status: employeeAssignments.status }).from(employeeAssignments).where(and(eq(employeeAssignments.tenantId, scope.tenantId), eq(employeeAssignments.projectId, scope.projectId), inArray(employeeAssignments.employeeId, employeeIds))) : Promise.resolve([]),
    employeeIds.length ? db.select({ employeeId: employeeAttendance.employeeId, attendanceDate: employeeAttendance.attendanceDate }).from(employeeAttendance).where(and(eq(employeeAttendance.tenantId, scope.tenantId), eq(employeeAttendance.attendanceStatus, "present"), eq(employeeAttendance.status, "approved"), inArray(employeeAttendance.employeeId, employeeIds))) : Promise.resolve([]),
    employeeIds.length ? db.select({ id: employeeTimeEntries.id, assignmentId: employeeTimeEntries.assignmentId, workDate: employeeTimeEntries.workDate, actualHours: employeeTimeEntries.actualHours, reportedProgressPercent: employeeTimeEntries.reportedProgressPercent }).from(employeeTimeEntries).where(and(eq(employeeTimeEntries.tenantId, scope.tenantId), eq(employeeTimeEntries.projectId, scope.projectId), inArray(employeeTimeEntries.employeeId, employeeIds))) : Promise.resolve([]),
  ]);
  const approved = new Set(attendance.map(row => `${row.employeeId}|${dayKey(row.attendanceDate)}`));
  const storedByDay = new Map(entriesStored.map(row => [`${row.assignmentId}|${dayKey(row.workDate)}`, row]));
  const errors: LedgerError[] = []; const entries: DiffEntry[] = []; const seen = new Set<string>();
  const creates: Array<{ rowNumber: number; key: string; assignmentId: string; workDate: Date; actualHours: number; reportedProgressPercent?: number }> = [];
  for (const { rowNumber, cells, fileId } of rows) {
    const before = errors.length;
    const number = text(cells.employeeNumber); const workDate = dayOf(cells.workDate); const hours = numberOf(cells.actualHours);
    const progress = text(cells.reportedProgressPercent) ? numberOf(cells.reportedProgressPercent) : undefined;
    if (!number) errors.push({ rowNumber, code: "IMPORT_REQUIRED_VALUE_MISSING", field: "employeeNumber" });
    if (!workDate) errors.push({ rowNumber, code: "IMPORT_INVALID_DATE", field: "workDate" });
    if (hours === undefined || hours <= 0 || hours > 24) errors.push({ rowNumber, code: "PROJECT_OS_TIME_ENTRY_INVALID", field: "actualHours" });
    if (text(cells.reportedProgressPercent) && (progress === undefined || progress < 0 || progress > 100)) errors.push({ rowNumber, code: "PROJECT_OS_TIME_ENTRY_INVALID", field: "reportedProgressPercent" });
    const key = `${number}|${dayKey(workDate)}`;
    if (number && workDate) { if (seen.has(key)) errors.push({ rowNumber, code: "IMPORT_DUPLICATE_FILE_KEY", field: "workDate" }); seen.add(key); }
    if (errors.length > before || !workDate || hours === undefined) continue;
    const employeeId = people.get(number);
    if (!employeeId) { errors.push({ rowNumber, code: "TIME_EMPLOYEE_NOT_FOUND", field: "employeeNumber", detail: number }); continue; }
    // the employee's assignment on THIS project that is open on that day; none, or more than one, is a refusal (the hours screen needs a single assignment to book against)
    const open = assignments.filter(item => item.employeeId === employeeId && ["planned", "active"].includes(item.status) && workDate >= item.plannedStartAt && workDate <= item.plannedFinishAt);
    if (open.length === 0) { errors.push({ rowNumber, code: "PROJECT_OS_TIME_ENTRY_ASSIGNMENT_INVALID", field: "employeeNumber", detail: number }); continue; }
    if (open.length > 1) { errors.push({ rowNumber, code: "TIME_AMBIGUOUS_ASSIGNMENT", field: "employeeNumber", detail: number }); continue; }
    const assignment = open[0]!;
    const current = storedByDay.get(`${assignment.id}|${dayKey(workDate)}`);
    if (current) {
      const changes = [...change("actualHours", money(Number(current.actualHours)), money(hours)), ...change("reportedProgressPercent", current.reportedProgressPercent === null ? "" : money(Number(current.reportedProgressPercent)), progress === undefined ? "" : money(progress))];
      if (fileId && fileId !== current.id) entries.push(entry(rowNumber, key, "conflict", [], "ID_KEY_MISMATCH"));
      else entries.push(changes.length ? entry(rowNumber, key, "conflict", changes, "TIME_ENTRY_READ_ONLY") : entry(rowNumber, key, "unchanged")); // a booked day is not rewritten from a sheet
      continue;
    }
    if (fileId) { entries.push(entry(rowNumber, key, "conflict", [], "ID_KEY_MISMATCH")); continue; }
    if (!approved.has(`${employeeId}|${dayKey(workDate)}`)) { errors.push({ rowNumber, code: "PROJECT_OS_ATTENDANCE_APPROVAL_REQUIRED", field: "workDate", detail: number }); continue; } // the hours screen's own rule
    creates.push({ rowNumber, key, assignmentId: assignment.id, workDate, actualHours: hours, reportedProgressPercent: progress });
    entries.push(entry(rowNumber, key, "new", [...change("actualHours", "", money(hours)), ...change("reportedProgressPercent", "", progress === undefined ? "" : money(progress))]));
  }
  const writable = !errors.length && !entries.some(item => item.kind === "conflict") && creates.length > 0;
  return {
    totalRows: rows.length, entries, errors, missing: [], readsEmployeeRecords: true,
    apply: !writable ? null : async () => {
      // The writes go through the hours screen's own function, one day at a time, so every rule it enforces is enforced again and each entry is audited as usual.
      const byDay = new Map<string, typeof creates>();
      for (const item of creates) byDay.set(dayKey(item.workDate), [...(byDay.get(dayKey(item.workDate)) ?? []), item]);
      const results: Array<{ rowNumber: number; key: string; action: "created"; entityId: string | null }> = [];
      for (const day of Array.from(byDay.values())) for (const part of chunks(day, 200)) {
        const saved = await createTeamTimeEntriesForTenant({ userId: scope.userId, tenantId: scope.tenantId, projectId: scope.projectId, workDate: part[0]!.workDate, entries: part.map(item => ({ assignmentId: item.assignmentId, actualHours: item.actualHours, reportedProgressPercent: item.reportedProgressPercent })) });
        if (saved.errors.length) throw new TRPCError({ code: "BAD_REQUEST", message: /^PROJECT_OS_[A-Z0-9_]+$/.test(saved.errors[0]!.code) ? saved.errors[0]!.code : "PROJECT_OS_TIME_ENTRY_INVALID" });
        part.forEach((item, index) => results.push({ rowNumber: item.rowNumber, key: item.key, action: "created", entityId: saved.ids[index] ?? null }));
      }
      return { counts: { createdRows: creates.length, updatedRows: 0, skippedRows: entries.length - creates.length }, results };
    },
  };
}

// ------------------------------------------------------------------------------------------------------------------------------------------ the entry points
/** The module's own gate for this scope; throws the refusal the screens would. */
export async function authorizeLedgerModule(scope: LedgerScope, moduleCode: LedgerModule) {
  if (moduleCode === "employees" || moduleCode === "timeEntries") await assertHrRecordAccess({ userId: scope.userId, tenantId: scope.tenantId, permission: "project.hr.manage" });
}

export async function planLedgerImport(db: Db, scope: LedgerScope, moduleCode: LedgerModule, format: "xlsx" | "csv", bytes: Buffer): Promise<LedgerPlan> {
  const table = await readTable(moduleCode, format, bytes);
  if (table.errors.length) return { totalRows: 0, entries: [], errors: table.errors, missing: [], readsEmployeeRecords: false, apply: null };
  if (moduleCode === "costs") return planCosts(db, scope, table.rows);
  if (moduleCode === "purchaseOrders") return planPurchaseOrders(db, scope, table.rows);
  if (moduleCode === "employees") return planEmployees(db, scope, table.rows);
  return planTimeEntries(db, scope, table.rows);
}

export const ledgerPlanHash = (plan: LedgerPlan) => diffHash({ entries: plan.entries, missing: plan.missing });
/** The same hash for a file the person did not change and a project that did not change, so what they approved is what is written. */
export const ledgerFileHash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");

/** Writes the audit row for a read of employee records (the export, the preview, the analysis): who, which module, how many rows, never the content. */
export async function auditEmployeeRecordsRead(db: Db, scope: LedgerScope, moduleCode: LedgerModule, context: "export" | "preview" | "analysis" | "confirm", rows: number) {
  await db.insert(auditLogs).values({ id: randomUUID(), tenantId: scope.tenantId, actorUserId: scope.userId, action: "hr.employee_records_read", entityType: "employee", entityId: null, metadata: JSON.stringify({ module: moduleCode, context, projectId: scope.projectId, rows }) });
}

// ------------------------------------------------------------------------------------------------------------------------------------------ export rows
export async function ledgerExportRows(db: Db, scope: LedgerScope, moduleCode: LedgerModule): Promise<Record<string, unknown>[]> {
  const id = LEDGER_ID_HEADER; const version = LEDGER_VERSION_HEADER;
  if (moduleCode === "costs") {
    const [wbs, rows] = await Promise.all([
      db.select({ id: wbsItems.id, code: wbsItems.code }).from(wbsItems).where(and(eq(wbsItems.tenantId, scope.tenantId), eq(wbsItems.projectId, scope.projectId))),
      db.select().from(costEntries).where(and(eq(costEntries.tenantId, scope.tenantId), eq(costEntries.projectId, scope.projectId), eq(costEntries.entryType, "actual"), eq(costEntries.status, "posted"))).orderBy(costEntries.incurredAt),
    ]);
    const codeById = new Map(wbs.map(item => [item.id, item.code]));
    return rows.map(row => ({ wbsCode: codeById.get(row.wbsItemId ?? "") ?? "", costCode: "", category: row.category, incurredAt: dayKey(row.incurredAt), amount: Number(row.amount), [id]: row.id, [version]: row.createdAt.toISOString() }));
  }
  if (moduleCode === "purchaseOrders") {
    const [wbs, contractRows, supplierRows, rows] = await Promise.all([
      db.select({ id: wbsItems.id, code: wbsItems.code }).from(wbsItems).where(and(eq(wbsItems.tenantId, scope.tenantId), eq(wbsItems.projectId, scope.projectId))),
      db.select({ id: contracts.id, code: contracts.code }).from(contracts).where(and(eq(contracts.tenantId, scope.tenantId), eq(contracts.projectId, scope.projectId))),
      db.select({ id: suppliers.id, code: suppliers.code }).from(suppliers).where(eq(suppliers.tenantId, scope.tenantId)),
      db.select().from(purchaseOrders).where(and(eq(purchaseOrders.tenantId, scope.tenantId), eq(purchaseOrders.projectId, scope.projectId))).orderBy(purchaseOrders.purchaseOrderNumber),
    ]);
    const wbsCode = new Map(wbs.map(item => [item.id, item.code])); const contractCode = new Map(contractRows.map(item => [item.id, item.code])); const supplierCode = new Map(supplierRows.map(item => [item.id, item.code]));
    return rows.map(row => ({ purchaseOrderNumber: row.purchaseOrderNumber, orderDate: dayKey(row.orderDate), amount: Number(row.amount), summary: row.summary, contractCode: contractCode.get(row.contractId ?? "") ?? "", supplierCode: supplierCode.get(row.supplierId ?? "") ?? "", supplierName: row.supplierId ? "" : row.supplierName, wbsCode: wbsCode.get(row.wbsItemId ?? "") ?? "", status: row.status, [id]: row.id, [version]: row.updatedAt.toISOString() }));
  }
  if (moduleCode === "employees") {
    await assertHrRecordAccess({ userId: scope.userId, tenantId: scope.tenantId, permission: "project.hr.manage" });
    const rows = await db.select({ id: employees.id, employeeNumber: employees.employeeNumber, fullName: employees.fullName, jobTitle: employees.jobTitle, department: employees.department, hireDate: employees.hireDate, employmentStatus: employees.employmentStatus, updatedAt: employees.updatedAt }).from(employees).where(eq(employees.tenantId, scope.tenantId)).orderBy(employees.employeeNumber);
    await auditEmployeeRecordsRead(db, scope, "employees", "export", rows.length);
    return rows.map(row => ({ employeeNumber: row.employeeNumber, fullName: row.fullName, jobTitle: row.jobTitle, department: row.department, hireDate: dayKey(row.hireDate), employmentStatus: row.employmentStatus, [id]: row.id, [version]: row.updatedAt.toISOString() }));
  }
  await assertHrRecordAccess({ userId: scope.userId, tenantId: scope.tenantId, permission: "project.hr.manage" });
  const rows = await db.select({ id: employeeTimeEntries.id, employeeNumber: employees.employeeNumber, workDate: employeeTimeEntries.workDate, actualHours: employeeTimeEntries.actualHours, reportedProgressPercent: employeeTimeEntries.reportedProgressPercent, updatedAt: employeeTimeEntries.updatedAt })
    .from(employeeTimeEntries).innerJoin(employees, eq(employees.id, employeeTimeEntries.employeeId)).where(and(eq(employeeTimeEntries.tenantId, scope.tenantId), eq(employeeTimeEntries.projectId, scope.projectId))).orderBy(employeeTimeEntries.workDate);
  await auditEmployeeRecordsRead(db, scope, "timeEntries", "export", rows.length);
  return rows.map(row => ({ employeeNumber: row.employeeNumber, workDate: dayKey(row.workDate), actualHours: Number(row.actualHours), reportedProgressPercent: row.reportedProgressPercent === null ? "" : Number(row.reportedProgressPercent), [id]: row.id, [version]: row.updatedAt.toISOString() }));
}

/** The export of an operational module: the same gates as the master-data export (read access to the project, the DATA_EXPORT feature, its row limit), plus the HR permission for the HR modules. */
export async function exportLedgerData(input: LedgerScope & { moduleCode: LedgerModule; format: "xlsx" | "csv"; locale: ExportLocale }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const feature = await assertTenantFeatureAccess({ userId: input.userId, tenantId: input.tenantId, product: "PROJECT", permission: "project.read", featureCode: "DATA_EXPORT", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const rows = await ledgerExportRows(db, input, input.moduleCode);
  if (feature.limitValue !== null && rows.length > feature.limitValue) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_LICENSE_LIMIT_EXCEEDED" });
  const file = await buildDataExportFile({ moduleCode: input.moduleCode, format: input.format, locale: input.locale, rows });
  if (file.bytes.length > 10 * 1024 * 1024) throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "PROJECT_OS_EXPORT_FILE_TOO_LARGE" });
  const exportId = randomUUID();
  await db.insert(auditLogs).values({ id: exportId, tenantId: input.tenantId, actorUserId: input.userId, action: "data_export_generated", entityType: "data_export", entityId: exportId, metadata: JSON.stringify({ projectId: input.projectId, moduleCode: input.moduleCode, format: input.format, locale: input.locale, rowCount: rows.length }) });
  return { id: exportId, fileName: file.fileName, contentType: file.contentType, base64: file.bytes.toString("base64"), rowCount: rows.length };
}

/** The export button of every module: master-data and activity exports (the original function) and the operational ones. Both write the `data_export_generated` audit row. */
export async function exportProjectData(input: LedgerScope & { moduleCode: ExportModuleCode; format: "xlsx" | "csv"; locale: ExportLocale }) {
  await assertTenantFeatureAccess({ userId: input.userId, tenantId: input.tenantId, product: "PROJECT", permission: "project.read", featureCode: "DATA_EXPORT", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  if (isLedgerModule(input.moduleCode)) return exportLedgerData({ ...input, moduleCode: input.moduleCode });
  return createDataExport({ ...input, moduleCode: input.moduleCode });
}

