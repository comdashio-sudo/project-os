import ExcelJS from "exceljs";
import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";
import { appRouter } from "./routers";
import { ledgerHeaders, type LedgerModule } from "@shared/ledgerImportColumns";
import { startFakeS3, type FakeS3 } from "./testing/fakeS3";

// Work order 11, item 4, on a real database: the Excel cycle (template → export → differences preview → confirmation) for actual costs, purchase orders, employees and hours,
// and what an import must NOT do: bypass an approval path, rewrite a posted cost, change an order's status, touch identity data, or read employee records unaudited. Synthetic data only.
const T = "79300000-0000-4000-8000-0000000000a1";
const P = "79300000-0000-4000-8000-0000000000a2";
const uid = (n: number) => `79300000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [W1, W2, B_CIVIL, B_ORPHAN, C1, S1, S2, EMP1, EMP2, RES, ASG] = [101, 102, 103, 104, 105, 106, 107, 108, 109, 110, 111].map(uid);
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
let connection: fixtureDb.Connection;
let s3: FakeS3;
const users = { ops: 0, costOnly: 0, reader: 0 };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@ledger.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
type Caller = ReturnType<typeof callerFor>;
const scope = { tenantId: T, projectId: P };

async function clear() {
  await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [T]);
  await connection.query("DELETE r FROM data_import_row_results r INNER JOIN data_imports i ON i.id = r.importId WHERE i.tenantId = ?", [T]);
  await connection.query("DELETE e FROM data_import_errors e INNER JOIN data_imports i ON i.id = e.importId WHERE i.tenantId = ?", [T]);
  await connection.query("DELETE FROM data_imports WHERE tenantId = ?", [T]);
  for (const table of ["employee_time_entries", "employee_attendance", "employee_assignments", "project_resources", "purchase_orders", "cost_entries", "budget_lines", "contracts", "suppliers", "wbs_items", "employees"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [T]);
  await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId = ?", [T]);
  await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [T]);
  await connection.query("DELETE FROM roles WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM memberships WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM subscriptions WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM projects WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM companies WHERE id = ?", [T]);
  await connection.query("DELETE FROM users WHERE openId LIKE 'led-%'");
}

/** A workbook the way a person fills the template: the module's own English headers, then rows. */
async function sheet(moduleCode: LedgerModule, rows: unknown[][], extra: string[] = []) {
  const workbook = new ExcelJS.Workbook(); const worksheet = workbook.addWorksheet("Data");
  worksheet.addRow([...ledgerHeaders(moduleCode, "en"), ...extra]); rows.forEach(row => worksheet.addRow(row));
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
async function edit(bytes: Buffer, apply: (worksheet: ExcelJS.Worksheet) => void) {
  const workbook = new ExcelJS.Workbook(); await workbook.xlsx.load(bytes as unknown as ArrayBuffer); apply(workbook.worksheets[0]!);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
async function upload(caller: Caller, moduleCode: LedgerModule, bytes: Buffer, name: string) {
  const target = await caller.dataImports.createUpload({ ...scope, moduleCode, fileName: name, sourceFormat: "xlsx" });
  const put = await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: bytes });
  if (!put.ok) throw new Error(`PUT failed ${put.status}`);
  const registered = await caller.dataImports.registerUpload({ ...scope, moduleCode, fileName: name, sourceFormat: "xlsx", uploadKey: target.uploadKey });
  return pollUntilDone(caller, registered.id);
}
async function pollUntilDone(caller: Caller, importId: string, timeoutMs = 120_000) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const view = await caller.dataImports.progress({ ...scope, importId });
    if (view.status !== "analyzing" && view.status !== "importing") return view;
    if (Date.now() > deadline) throw new Error(`job still ${view.status}`);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
const exported = async (caller: Caller, moduleCode: LedgerModule) => Buffer.from((await caller.dataImports.export({ ...scope, moduleCode, format: "xlsx", locale: "en" })).base64, "base64");
const errorCodes = (view: Awaited<ReturnType<typeof pollUntilDone>>) => (view.analysis?.errors ?? []).map(error => error.code);
async function confirmWithHash(caller: Caller, importId: string) {
  const preview = await caller.dataImports.diff({ ...scope, importId });
  if (!preview.supported) throw new Error("no preview");
  await caller.dataImports.confirm({ ...scope, importId, approvedDiffHash: preview.diffHash });
  return pollUntilDone(caller, importId);
}
const one = async <T = any>(sql: string, params: unknown[] = []) => (await connection.query<T[]>(sql, params))[0][0] as T;
const countOf = async (table: string, where = "") => Number((await one<{ n: number }>(`SELECT COUNT(*) AS n FROM ${table} WHERE tenantId = ? ${where}`, [T])).n);
const auditCount = async (action: string) => Number((await one<{ n: number }>("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action = ?", [T, action])).n);

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Excel cycle for costs, purchase orders, employees and hours (work order 11, item 4)", () => {
  beforeAll(async () => {
    s3 = await startFakeS3();
    Object.assign(ENV, { storageS3Endpoint: s3.endpoint, storageS3Region: "local", storageS3AccessKeyId: "AKIALOCALTEST", storageS3SecretAccessKey: "local-test-only-secret", storageBucket: s3.bucket });
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('led-ops','Ops','led-ops@ledger.example.test','user'),('led-cost','Cost','led-cost@ledger.example.test','user'),('led-reader','Reader','led-reader@ledger.example.test','user')");
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'led-%'");
    const idOf = (openId: string) => rows.find(row => row.openId === openId)!.id;
    users.ops = idOf("led-ops"); users.costOnly = idOf("led-cost"); users.reader = idOf("led-reader");
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'ledger-tenant', 'ledger-tenant')", [T]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'LG-A', 'Ledger project', 'villas', 'SAR', 'active')", [P, T]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('led-sub', ?, 'ALL-IN-ONE', 'active', NOW())", [T]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('led-ent', ?, 'led-sub', 'PROJECT', true, NOW())", [T]);
    for (const code of ["project.read", "project.cost.enter", "project.procurement.manage", "project.manage", "project.hr.manage"]) await connection.query("INSERT INTO permissions (id, code, name, productCode) VALUES (UUID(), ?, ?, 'PROJECT') ON CONFLICT DO NOTHING", [code, code]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('led-r-ops', ?, 'LED_OPS','Ops','PROJECT'), ('led-r-cost', ?, 'LED_COST','Cost','PROJECT'), ('led-r-reader', ?, 'LED_READER','Reader','PROJECT')", [T, T, T]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'led-r-ops', id FROM permissions WHERE code IN ('project.read','project.cost.enter','project.procurement.manage','project.manage','project.hr.manage')");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'led-r-cost', id FROM permissions WHERE code IN ('project.read','project.cost.enter')");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'led-r-reader', id FROM permissions WHERE code = 'project.read'");
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('led-m-ops', ?, ?, 'active'), ('led-m-cost', ?, ?, 'active'), ('led-m-reader', ?, ?, 'active')", [T, users.ops, T, users.costOnly, T, users.reader]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('led-mr-ops','led-m-ops','led-r-ops','company'),('led-mr-cost','led-m-cost','led-r-cost','company'),('led-mr-reader','led-m-reader','led-r-reader','company')");
    await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name) VALUES (?, ?, ?, '1.1', 'Site works'), (?, ?, ?, '1.2', 'Structure')", [W1, T, P, W2, T, P]);
    await connection.query("INSERT INTO budget_lines (id, tenantId, projectId, wbsItemId, costCode) VALUES (?, ?, ?, ?, 'CIVIL'), (?, ?, ?, NULL, 'ORPHAN')", [B_CIVIL, T, P, W1, B_ORPHAN, T, P]);
    await connection.query("INSERT INTO contracts (id, tenantId, projectId, code, title, counterparty) VALUES (?, ?, ?, 'CON-1', 'Civil works', 'Main contractor')", [C1, T, P]);
    await connection.query("INSERT INTO suppliers (id, tenantId, code, legalName, active, createdByUserId) VALUES (?, ?, 'SUP-1', 'Steel Supplier Co', true, ?), (?, ?, 'SUP-2', 'Closed Supplier Co', false, ?)", [S1, T, users.ops, S2, T, users.ops]);
    await connection.query("INSERT INTO employees (id, tenantId, employeeNumber, fullName, jobTitle, department, hireDate, createdByUserId) VALUES (?, ?, 'E-1', 'Example One', 'Engineer', 'Engineering', '2026-01-01', ?), (?, ?, 'E-2', 'Example Two', 'Foreman', 'Site', '2026-01-01', ?)", [EMP1, T, users.ops, EMP2, T, users.ops]);
    await connection.query("INSERT INTO project_resources (id, tenantId, projectId, resourceCode, name, resourceType, createdByUserId) VALUES (?, ?, ?, 'RES-1', 'Labour', 'labor', ?)", [RES, T, P, users.ops]);
    await connection.query("INSERT INTO employee_assignments (id, tenantId, projectId, employeeId, projectResourceId, plannedStartAt, plannedFinishAt, plannedHours, status, createdByUserId) VALUES (?, ?, ?, ?, ?, '2026-09-01', '2026-09-30', 160, 'active', ?)", [ASG, T, P, EMP1, RES, users.ops]);
    await connection.query("INSERT INTO employee_attendance (id, tenantId, employeeId, attendanceDate, attendanceStatus, status, createdByUserId) VALUES ('led-att-1', ?, ?, '2026-09-15', 'present', 'approved', ?)", [T, EMP1, users.ops]);
  }, 60_000);
  afterAll(async () => { await clear(); await connection.end(); await s3.close(); });

  // ---------------------------------------------------------------------------------------------------------------------------------------- costs
  describe("actual costs", () => {
    it("the blank template's own example row is a valid, importable row; the preview shows it as new, and the write posts it with its source", async () => {
      const ops = callerFor(users.ops, "led-ops");
      const template = await ops.dataImports.template({ moduleCode: "costs", locale: "en" });
      const view = await upload(ops, "costs", Buffer.from(template.base64, "base64"), "costs-template.xlsx");
      expect(view).toMatchObject({ status: "validated" });
      const preview = await ops.dataImports.diff({ ...scope, importId: view.id });
      expect(preview).toMatchObject({ supported: true, summary: { new: 1, unchanged: 0, conflict: 0 } });
      expect(await countOf("cost_entries")).toBe(0); // the preview wrote nothing
      expect(await confirmWithHash(ops, view.id)).toMatchObject({ status: "completed", createdRows: 1 });
      const posted = await one<{ status: string; entryType: string; sourceType: string; sourceId: string; amount: string }>("SELECT status, entryType, sourceType, sourceId, amount FROM cost_entries WHERE tenantId = ?", [T]);
      expect(posted).toMatchObject({ status: "posted", entryType: "actual", sourceType: "excel_import", sourceId: view.id });
      expect(Number(posted.amount)).toBe(12500);
      expect(await auditCount("project.cost_entry_created")).toBe(1);
    });

    it("every row must be tied to a WBS item or a budget line that exists; each refusal names its reason and nothing is written", async () => {
      const ops = callerFor(users.ops, "led-ops");
      const bytes = await sheet("costs", [
        ["", "", "materials", "2026-09-01", 100], // no link at all
        ["9.9", "", "materials", "2026-09-01", 101], // WBS that does not exist
        ["", "NOPE", "materials", "2026-09-01", 102], // budget line that does not exist
        ["", "ORPHAN", "materials", "2026-09-01", 103], // budget line that is not linked to a WBS item
        ["1.2", "CIVIL", "materials", "2026-09-01", 104], // budget line linked to 1.1, row says 1.2
        ["1.1", "", "materials", "2026-09-01", -5], // not an amount
        ["1.1", "", "bogus", "2026-09-01", 106], // not a category
        ["1.1", "", "materials", "not-a-date", 107],
      ]);
      const view = await upload(ops, "costs", bytes, "costs-bad.xlsx");
      expect(view.status).toBe("uploaded");
      expect(errorCodes(view)).toEqual(expect.arrayContaining(["COST_ROW_NOT_LINKED", "COST_WBS_NOT_FOUND", "COST_BUDGET_LINE_NOT_FOUND", "COST_BUDGET_LINE_WITHOUT_WBS", "COST_LINK_MISMATCH", "IMPORT_INVALID_NUMBER", "COST_CATEGORY_INVALID", "IMPORT_INVALID_DATE"]));
      await expect(ops.dataImports.confirm({ ...scope, importId: view.id })).rejects.toThrow("PROJECT_OS_IMPORT_NOT_CONFIRMABLE");
      expect(await countOf("cost_entries")).toBe(1); // only the template's row from the previous case
    });

    it("a budget line linked to a WBS item is enough; re-importing an export changes nothing; a posted cost cannot be rewritten from the sheet", async () => {
      const ops = callerFor(users.ops, "led-ops");
      const added = await upload(ops, "costs", await sheet("costs", [["", "CIVIL", "labour", "2026-09-02", 2000]]), "costs-by-budget.xlsx");
      expect(await confirmWithHash(ops, added.id)).toMatchObject({ status: "completed", createdRows: 1 });
      const budgetRow = await one<{ code: string }>("SELECT w.code AS code FROM cost_entries c JOIN wbs_items w ON w.id = c.wbsItemId WHERE c.tenantId = ? AND c.amount = 2000", [T]);
      expect(budgetRow.code).toBe("1.1"); // the WBS item came from the budget line

      const file = await exported(ops, "costs");
      const untouched = await upload(ops, "costs", file, "costs-export-untouched.xlsx");
      expect(await ops.dataImports.diff({ ...scope, importId: untouched.id })).toMatchObject({ supported: true, summary: { new: 0, modified: 0, unchanged: 2, conflict: 0 } });
      expect(untouched.external?.canConfirm).toBe(false); // valid, but there is nothing to write
      await expect(ops.dataImports.confirm({ ...scope, importId: untouched.id })).rejects.toThrow("PROJECT_OS_IMPORT_NOTHING_TO_CONFIRM");

      const edited = await upload(ops, "costs", await edit(file, ws => { ws.getCell(2, 5).value = 99999; }), "costs-export-edited.xlsx"); // row 2, "Amount (SAR)"
      expect(edited.status).toBe("uploaded"); // blocked
      const preview = await ops.dataImports.diff({ ...scope, importId: edited.id });
      expect(preview).toMatchObject({ supported: true, summary: { conflict: 1 } });
      if (preview.supported) expect(preview.entries[0]).toMatchObject({ kind: "conflict", conflict: "COST_ENTRY_READ_ONLY", changes: [{ field: "amount" }] });
      await expect(ops.dataImports.confirm({ ...scope, importId: edited.id })).rejects.toThrow("PROJECT_OS_IMPORT_NOT_CONFIRMABLE");
      expect(Number((await one<{ a: string }>("SELECT MIN(amount) AS a FROM cost_entries WHERE tenantId = ?", [T])).a)).toBe(2000);
    });

    it("a new row appended to an exported file is the only thing written; the approved hash is enforced", async () => {
      const ops = callerFor(users.ops, "led-ops");
      const file = await edit(await exported(ops, "costs"), ws => { ws.addRow(["1.2", "", "subcontract", "2026-09-03", 700]); });
      const view = await upload(ops, "costs", file, "costs-export-plus-one.xlsx");
      const preview = await ops.dataImports.diff({ ...scope, importId: view.id });
      expect(preview).toMatchObject({ supported: true, summary: { new: 1, unchanged: 2, conflict: 0 } });
      await expect(ops.dataImports.confirm({ ...scope, importId: view.id, approvedDiffHash: "0".repeat(64) })).rejects.toThrow("PROJECT_OS_IMPORT_DIFF_CHANGED");
      expect(await countOf("cost_entries")).toBe(2);
      expect(await confirmWithHash(ops, view.id)).toMatchObject({ status: "completed", createdRows: 1, skippedRows: 2 });
      expect(await countOf("cost_entries")).toBe(3);
    });

    it("who may: a person who can enter costs can import them; a reader can export but cannot upload or preview", async () => {
      const costOnly = callerFor(users.costOnly, "led-cost"); const reader = callerFor(users.reader, "led-reader");
      expect((await exported(reader, "costs")).length).toBeGreaterThan(0); // exporting needs read access only
      await expect(reader.dataImports.createUpload({ ...scope, moduleCode: "costs", fileName: "c.xlsx", sourceFormat: "xlsx" })).rejects.toThrow();
      const view = await upload(costOnly, "costs", await sheet("costs", [["1.2", "", "other", "2026-09-04", 55]]), "costs-by-cost-user.xlsx");
      expect(view.status).toBe("validated");
      await expect(reader.dataImports.diff({ ...scope, importId: view.id })).rejects.toThrow();
      await expect(reader.dataImports.confirm({ ...scope, importId: view.id })).rejects.toThrow();
      expect(await confirmWithHash(costOnly, view.id)).toMatchObject({ status: "completed", createdRows: 1 });
    });
  });

  describe("size", () => {
    it("20,000 cost rows: analysed and written by background jobs with visible progress; the export of all of them re-imports with zero changes", async () => {
      const ops = callerFor(users.ops, "led-ops");
      const before = await countOf("cost_entries");
      const rows = Array.from({ length: 20_000 }, (_unused, index) => ["1.2", "", "materials", "2026-09-10", 10 + (index % 90)]);
      const target = await ops.dataImports.createUpload({ ...scope, moduleCode: "costs", fileName: "costs-20k.xlsx", sourceFormat: "xlsx" });
      const bytes = await sheet("costs", rows);
      const put = await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: bytes });
      expect(put.ok).toBe(true);
      const registered = await ops.dataImports.registerUpload({ ...scope, moduleCode: "costs", fileName: "costs-20k.xlsx", sourceFormat: "xlsx", uploadKey: target.uploadKey });
      expect(registered.status).toBe("analyzing");
      const seen = new Set<string>();
      let view = await ops.dataImports.progress({ ...scope, importId: registered.id });
      const deadline = Date.now() + 240_000;
      while (view.status === "analyzing") { seen.add(`${view.status}:${view.progressStage}`); if (Date.now() > deadline) throw new Error("analysis too slow"); await new Promise(resolve => setTimeout(resolve, 100)); view = await ops.dataImports.progress({ ...scope, importId: registered.id }); }
      expect(seen.size).toBeGreaterThan(0); // the screen had something to show while it waited
      expect(view).toMatchObject({ status: "validated", totalRows: 20_000, validRows: 20_000, invalidRows: 0 });
      const preview = await ops.dataImports.diff({ ...scope, importId: registered.id });
      expect(preview).toMatchObject({ supported: true, summary: { new: 20_000, conflict: 0 } });
      if (!preview.supported) throw new Error("no preview");
      expect(preview.entries).toHaveLength(preview.pageSize); // a page of the preview, with the full count beside it
      const confirming = await ops.dataImports.confirm({ ...scope, importId: registered.id, approvedDiffHash: preview.diffHash });
      expect(confirming).toMatchObject({ status: "importing" });
      const done = await pollUntilDone(ops, registered.id, 240_000);
      expect(done).toMatchObject({ status: "completed", createdRows: 20_000, failureReason: null });
      expect(await countOf("cost_entries")).toBe(before + 20_000);

      const file = await exported(ops, "costs");
      const again = await upload(ops, "costs", file, "costs-20k-export.xlsx");
      expect(again.totalRows).toBe(before + 20_000);
      expect(await ops.dataImports.diff({ ...scope, importId: again.id })).toMatchObject({ supported: true, summary: { new: 0, modified: 0, unchanged: before + 20_000, conflict: 0 } });
    }, 600_000);
  });

  // ------------------------------------------------------------------------------------------------------------------------------- purchase orders
  describe("purchase orders", () => {
    const orderRow = (number: string, contract: string, supplier: string, supplierName = "", amount = 48000) => [number, "2026-09-15", amount, "Reinforcement steel", contract, supplier, supplierName, "1.1"];

    it("is created as a draft only; the supplier's name comes from the register; unlinked or inactive-supplier rows are refused with their reasons", async () => {
      const ops = callerFor(users.ops, "led-ops");
      const bad = await upload(ops, "purchaseOrders", await sheet("purchaseOrders", [orderRow("PO-BAD-1", "", ""), orderRow("PO-BAD-2", "", "SUP-2"), orderRow("PO-BAD-3", "NOPE", "", "One-off supplier"), orderRow("PO-BAD-4", "CON-1", "")]), "po-bad.xlsx");
      expect(bad.status).toBe("uploaded");
      expect(errorCodes(bad)).toEqual(expect.arrayContaining(["PO_NOT_LINKED", "PO_SUPPLIER_INACTIVE", "PO_CONTRACT_NOT_FOUND", "PO_SUPPLIER_NAME_REQUIRED"]));
      expect(await countOf("purchase_orders")).toBe(0);

      const good = await upload(ops, "purchaseOrders", await sheet("purchaseOrders", [orderRow("PO-100", "CON-1", "", "One-off supplier"), orderRow("PO-101", "", "SUP-1", "ignored when the register supplier is named")]), "po-good.xlsx");
      expect(good.status).toBe("validated");
      expect(await confirmWithHash(ops, good.id)).toMatchObject({ status: "completed", createdRows: 2 });
      const created = (await connection.query<{ purchaseOrderNumber: string; status: string; supplierName: string; currency: string; supplierId: string | null }[]>("SELECT purchaseOrderNumber, status, supplierName, currency, supplierId FROM purchase_orders WHERE tenantId = ? ORDER BY purchaseOrderNumber", [T]))[0];
      expect(created.map(row => [row.purchaseOrderNumber, row.status, row.supplierName, row.currency])).toEqual([["PO-100", "draft", "One-off supplier", "SAR"], ["PO-101", "draft", "Steel Supplier Co", "SAR"]]);
    });

    it("a draft can be corrected through an export; an order that has left draft cannot, and its Status cannot be changed from the sheet", async () => {
      const ops = callerFor(users.ops, "led-ops");
      const file = await exported(ops, "purchaseOrders");
      const headerRow = (await new ExcelJS.Workbook().xlsx.load(file as unknown as ArrayBuffer)).worksheets[0]!.getRow(1).values as unknown[];
      expect(headerRow).toEqual(expect.arrayContaining(["PO Number", "Status"]));

      const corrected = await upload(ops, "purchaseOrders", await edit(file, ws => { ws.getCell(2, 3).value = 52000; }), "po-correct.xlsx"); // PO-100, amount
      const preview = await ops.dataImports.diff({ ...scope, importId: corrected.id });
      expect(preview).toMatchObject({ supported: true, summary: { modified: 1, unchanged: 1, conflict: 0 } });
      if (preview.supported) expect(preview.entries[0]).toMatchObject({ key: "PO-100", kind: "modified", changes: [{ field: "amount", oldValue: "48000.00", newValue: "52000.00" }] });
      expect(await confirmWithHash(ops, corrected.id)).toMatchObject({ status: "completed", updatedRows: 1 });
      expect(Number((await one<{ a: string }>("SELECT amount AS a FROM purchase_orders WHERE tenantId = ? AND purchaseOrderNumber = 'PO-100'", [T])).a)).toBe(52000);

      // approving by editing the Status cell is not a thing the sheet can do
      const fresh = await exported(ops, "purchaseOrders");
      const statusColumn = 9;
      const approve = await upload(ops, "purchaseOrders", await edit(fresh, ws => { ws.getCell(2, statusColumn).value = "approved"; }), "po-approve.xlsx");
      expect(approve.status).toBe("uploaded");
      expect(errorCodes(approve)).toContain("PO_STATUS_READ_ONLY");
      await expect(ops.dataImports.confirm({ ...scope, importId: approve.id })).rejects.toThrow("PROJECT_OS_IMPORT_NOT_CONFIRMABLE");

      // an order that moved on through the workflow after the export: its fields are no longer the sheet's to change
      await connection.query("UPDATE purchase_orders SET status = 'submitted' WHERE tenantId = ? AND purchaseOrderNumber = 'PO-101'", [T]);
      const moved = await exported(ops, "purchaseOrders");
      const edited = await upload(ops, "purchaseOrders", await edit(moved, ws => { ws.getCell(3, 3).value = 1; }), "po-submitted-edit.xlsx");
      expect(errorCodes(edited)).toContain("PO_NOT_DRAFT");
      expect((await one<{ status: string }>("SELECT status FROM purchase_orders WHERE tenantId = ? AND purchaseOrderNumber = 'PO-101'", [T])).status).toBe("submitted");
    });

    it("a file exported before the order changed in the platform is refused rather than written over it", async () => {
      const ops = callerFor(users.ops, "led-ops");
      const stale = await exported(ops, "purchaseOrders");
      await connection.query("UPDATE purchase_orders SET summary = 'Revised in the platform' WHERE tenantId = ? AND purchaseOrderNumber = 'PO-100'", [T]);
      const view = await upload(ops, "purchaseOrders", await edit(stale, ws => { ws.getCell(2, 3).value = 1234; }), "po-stale.xlsx");
      expect(errorCodes(view)).toContain("VERSION_CHANGED");
      expect((await one<{ summary: string }>("SELECT summary FROM purchase_orders WHERE tenantId = ? AND purchaseOrderNumber = 'PO-100'", [T])).summary).toBe("Revised in the platform");
    });
  });

  // ---------------------------------------------------------------------------------------------------------------------------------- employees
  describe("employees", () => {
    it("the personal-identity columns never travel through Excel, and every read of the records is audited", async () => {
      const ops = callerFor(users.ops, "led-ops");
      const before = await auditCount("hr.employee_records_read");
      const file = await exported(ops, "employees");
      const headers = ((await new ExcelJS.Workbook().xlsx.load(file as unknown as ArrayBuffer)).worksheets[0]!.getRow(1).values as unknown[]).map(value => String(value ?? "").toLowerCase());
      expect(headers.some(header => /nationality|identity|iqama|passport/.test(header))).toBe(false);
      expect(await auditCount("hr.employee_records_read")).toBe(before + 1);
      const log = await one<{ metadata: string }>("SELECT metadata FROM audit_logs WHERE tenantId = ? AND action = 'hr.employee_records_read' ORDER BY createdAt DESC LIMIT 1", [T]);
      expect(JSON.parse(log.metadata)).toMatchObject({ module: "employees", context: "export", rows: 2 });
      expect(log.metadata).not.toContain("Example One"); // the audit row says who read how many, never what
      // a file that tries to bring identity data in is refused as an unsupported column
      const sneaky = await upload(ops, "employees", await sheet("employees", [["E-9", "Example Nine", "Clerk", "Admin", "2026-02-01", "active", "Saudi"]], ["Nationality"]), "employees-identity.xlsx");
      expect(errorCodes(sneaky)).toContain("IMPORT_UNSUPPORTED_COLUMN");
    });

    it("creates and corrects the working record; reading it for the preview and the analysis is audited; terminating is not done from a sheet", async () => {
      const ops = callerFor(users.ops, "led-ops");
      const created = await upload(ops, "employees", await sheet("employees", [["E-100", "Example Hundred", "Surveyor", "Engineering", "2026-03-01", "active"]]), "employees-new.xlsx");
      expect(created.status).toBe("validated");
      const readsBefore = await auditCount("hr.employee_records_read");
      expect(await ops.dataImports.diff({ ...scope, importId: created.id })).toMatchObject({ supported: true, summary: { new: 1 } });
      expect(await auditCount("hr.employee_records_read")).toBe(readsBefore + 1); // the preview is a read
      expect(await confirmWithHash(ops, created.id)).toMatchObject({ status: "completed", createdRows: 1 });
      expect(await auditCount("hr.employee_created")).toBe(1);

      const file = await exported(ops, "employees");
      const rename = await upload(ops, "employees", await edit(file, ws => { for (let row = 2; row <= ws.rowCount; row += 1) if (String(ws.getCell(row, 1).value) === "E-100") ws.getCell(row, 3).value = "Senior Surveyor"; }), "employees-rename.xlsx");
      const preview = await ops.dataImports.diff({ ...scope, importId: rename.id });
      expect(preview).toMatchObject({ supported: true, summary: { modified: 1, unchanged: 2, conflict: 0 } });
      expect(await confirmWithHash(ops, rename.id)).toMatchObject({ status: "completed", updatedRows: 1 });
      expect((await one<{ jobTitle: string }>("SELECT jobTitle FROM employees WHERE tenantId = ? AND employeeNumber = 'E-100'", [T])).jobTitle).toBe("Senior Surveyor");

      const terminate = await upload(ops, "employees", await edit(await exported(ops, "employees"), ws => { for (let row = 2; row <= ws.rowCount; row += 1) if (String(ws.getCell(row, 1).value) === "E-2") ws.getCell(row, 6).value = "terminated"; }), "employees-terminate.xlsx");
      expect(terminate.status).toBe("uploaded");
      expect(errorCodes(terminate)).toContain("EMPLOYEE_TERMINATION_NOT_BY_IMPORT");
      const bornTerminated = await upload(ops, "employees", await sheet("employees", [["E-101", "Example OneOhOne", "Clerk", "Admin", "2026-02-01", "terminated"]]), "employees-born-terminated.xlsx");
      expect(errorCodes(bornTerminated)).toContain("EMPLOYEE_TERMINATION_NOT_BY_IMPORT");
      expect((await one<{ status: string }>("SELECT employmentStatus AS status FROM employees WHERE tenantId = ? AND employeeNumber = 'E-2'", [T])).status).toBe("active");
    });

    it("a person with cost permission only cannot export, upload or preview employee records", async () => {
      const costOnly = callerFor(users.costOnly, "led-cost");
      await expect(costOnly.dataImports.export({ ...scope, moduleCode: "employees", format: "xlsx", locale: "en" })).rejects.toThrow();
      await expect(costOnly.dataImports.createUpload({ ...scope, moduleCode: "employees", fileName: "e.xlsx", sourceFormat: "xlsx" })).rejects.toThrow();
      await expect(costOnly.dataImports.export({ ...scope, moduleCode: "timeEntries", format: "xlsx", locale: "en" })).rejects.toThrow();
    });
  });

  // ------------------------------------------------------------------------------------------------------------------------------------- hours
  describe("hours", () => {
    it("books against the employee's assignment and keeps the approved-attendance rule: each refusal names its reason", async () => {
      const ops = callerFor(users.ops, "led-ops");
      const view = await upload(ops, "timeEntries", await sheet("timeEntries", [
        ["E-1", "2026-09-16", 8, ""], // present on the 15th only: no approved attendance for the 16th
        ["E-1", "2026-10-05", 8, ""], // outside the assignment
        ["E-9", "2026-09-15", 8, ""], // no such employee
        ["E-1", "2026-09-15", 25, ""], // not a day's hours
        ["E-2", "2026-09-15", 8, ""], // has no assignment on this project
      ]), "hours-bad.xlsx");
      expect(view.status).toBe("uploaded");
      expect(errorCodes(view)).toEqual(expect.arrayContaining(["PROJECT_OS_ATTENDANCE_APPROVAL_REQUIRED", "PROJECT_OS_TIME_ENTRY_ASSIGNMENT_INVALID", "TIME_EMPLOYEE_NOT_FOUND", "PROJECT_OS_TIME_ENTRY_INVALID"]));
      expect(await countOf("employee_time_entries")).toBe(0);
    });

    it("a valid day is created as a draft through the hours screen's own function; an export re-imports clean and a booked day is not rewritten from the sheet", async () => {
      const ops = callerFor(users.ops, "led-ops");
      const readsBefore = await auditCount("hr.employee_records_read");
      const view = await upload(ops, "timeEntries", await sheet("timeEntries", [["E-1", "2026-09-15", 8, 40]]), "hours-good.xlsx");
      expect(view.status).toBe("validated");
      expect(await auditCount("hr.employee_records_read")).toBeGreaterThan(readsBefore); // the analysis read employee numbers
      expect(await confirmWithHash(ops, view.id)).toMatchObject({ status: "completed", createdRows: 1 });
      const booked = await one<{ status: string; actualHours: string; assignmentId: string }>("SELECT status, actualHours, assignmentId FROM employee_time_entries WHERE tenantId = ?", [T]);
      expect(booked).toMatchObject({ status: "draft", assignmentId: ASG });
      expect(Number(booked.actualHours)).toBe(8);
      expect(await auditCount("employee.time_entry_created")).toBe(1);

      const file = await exported(ops, "timeEntries");
      const untouched = await upload(ops, "timeEntries", file, "hours-export.xlsx");
      expect(await ops.dataImports.diff({ ...scope, importId: untouched.id })).toMatchObject({ supported: true, summary: { new: 0, unchanged: 1, conflict: 0 } });
      const edited = await upload(ops, "timeEntries", await edit(file, ws => { ws.getCell(2, 3).value = 4; }), "hours-edit.xlsx");
      expect(errorCodes(edited)).toContain("TIME_ENTRY_READ_ONLY");
      expect(Number((await one<{ h: string }>("SELECT actualHours AS h FROM employee_time_entries WHERE tenantId = ?", [T])).h)).toBe(8);
    });
  });
});
