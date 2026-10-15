import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import * as serverDb from "./db";
import { appRouter } from "./routers";

// Net cash flow by month (G-013), the open commitment on each WBS item and at the top (G-024), and the source of every
// cost line (G-023), on a real database. Hand calculations: docs/CASH_FLOW_HAND_CHECKS.md.
const T = "74000000-0000-4000-8000-0000000000a1";
const P = "74000000-0000-4000-8000-0000000000a2";
const uid = (n: number) => `74000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [W1, W2, MAT] = [101, 102, 103].map(uid);
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^mysql(?:2)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

let connection: mysql.Connection;
const users = { cfo: 0, ops: 0, reader: 0, plain: 0 };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@cash.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const scope = { tenantId: T, projectId: P };
const ids: Record<string, string> = {};

async function clear() {
  await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM goods_receipt_notes WHERE tenantId = ?", [T]);
  for (const table of ["purchase_orders", "cost_entries", "commitments", "contracts", "project_commercial_invoices", "progress_entries", "budget_lines", "material_masters", "wbs_items"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [T]);
  await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId = ?", [T]);
  await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [T]);
  await connection.query("DELETE FROM roles WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM memberships WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM subscriptions WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM projects WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM companies WHERE id = ?", [T]);
  await connection.query("DELETE FROM users WHERE openId LIKE 'cfd-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("cash flow, committed cost and cost sources on a real database", () => {
  beforeAll(async () => {
    connection = await mysql.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    const keys = ["cfo", "ops", "reader", "plain"];
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${keys.map(() => "(?, ?, ?, 'user')").join(",")}`, keys.flatMap(key => [`cfd-${key}`, `Cash ${key}`, `cfd-${key}@cash.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'cfd-%'");
    for (const key of keys) users[key as keyof typeof users] = rows.find(row => row.openId === `cfd-${key}`)!.id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Cash Tenant', 'cash-drill')", [T]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status, contractValue) VALUES (?, ?, 'CD-A', 'Cash project', 'villas', 'SAR', 'active', 20000)", [P, T]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('cfd-sub', ?, 'ALL-IN-ONE', 'active', NOW())", [T]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('cfd-ent', ?, 'cfd-sub', 'PROJECT', true, NOW())", [T]);
    const codes = ["project.read", "project.cashflow.read", "project.invoice.match", "project.commitment.manage", "project.cost.enter", "project.procurement.manage", "project.inventory.manage"];
    for (const code of codes) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (UUID(), ?, ?, 'PROJECT')", [code, code]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('cfd-r-cfo', ?, 'CFD_CFO','CFO','PROJECT'), ('cfd-r-ops', ?, 'CFD_OPS','Ops','PROJECT'), ('cfd-r-reader', ?, 'CFD_READER','Reader','PROJECT'), ('cfd-r-plain', ?, 'CFD_PLAIN','Plain','PROJECT')", [T, T, T, T]);
    const grant = (role: string, list: string[]) => connection.query(`INSERT INTO role_permissions (roleId, permissionId) SELECT ?, id FROM permissions WHERE code IN (${list.map(() => "?").join(",")})`, [role, ...list]);
    await grant("cfd-r-cfo", ["project.read", "project.cashflow.read", "project.invoice.match", "project.commitment.manage", "project.cost.enter"]);
    await grant("cfd-r-ops", ["project.read", "project.procurement.manage", "project.inventory.manage"]); // fixture only: the API would refuse to put these two together
    await grant("cfd-r-reader", ["project.read", "project.cashflow.read"]);
    await grant("cfd-r-plain", ["project.read"]);
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('cfd-m-cfo', ?, ?, 'active'),('cfd-m-ops', ?, ?, 'active'),('cfd-m-reader', ?, ?, 'active'),('cfd-m-plain', ?, ?, 'active')", [T, users.cfo, T, users.ops, T, users.reader, T, users.plain]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('cfd-mr-cfo','cfd-m-cfo','cfd-r-cfo','company'),('cfd-mr-ops','cfd-m-ops','cfd-r-ops','company'),('cfd-mr-reader','cfd-m-reader','cfd-r-reader','company'),('cfd-mr-plain','cfd-m-plain','cfd-r-plain','company')");
    await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name, plannedValue) VALUES (?, ?, ?, '1', 'Foundations', 5000), (?, ?, ?, '2', 'Finishes', 3000)", [W1, T, P, W2, T, P]);
    await connection.query("INSERT INTO budget_lines (id, tenantId, projectId, wbsItemId, costCode, originalAmount, currentAmount) VALUES (?, ?, ?, ?, 'B1', 5000, 5000), (?, ?, ?, ?, 'B2', 3000, 3000)", [uid(901), T, P, W1, uid(902), T, P, W2]);
    await connection.query("INSERT INTO progress_entries (id, tenantId, projectId, wbsItemId, progressPercent, status, measuredAt) VALUES (?, ?, ?, ?, 40, 'submitted', '2026-10-01 00:00:00')", [uid(903), T, P, W1]);
    await connection.query("INSERT INTO material_masters (id, tenantId, code, description, unitOfMeasure, category, active, createdByUserId) VALUES (?, ?, 'CEM', 'Cement', 'bag', 'Concrete', true, ?)", [MAT, T, users.ops]);
  }, 60_000);

  afterAll(async () => { await clear(); await connection.end(); });
  const db = serverDb as unknown as Record<string, (input: unknown) => Promise<any>>;

  it("commits an order to a WBS item and lets goods received against it become that item's actual cost", async () => {
    const contract = await db.createContractForTenant({ userId: users.cfo, ...scope, code: "CT-1", title: "Supply", counterparty: "Supplier", contractValue: 5000, currency: "SAR" });
    const commitment = await db.createCommitmentForTenant({ userId: users.cfo, ...scope, contractId: contract.id, code: "CM-1", description: "Cement", amount: 1000, currency: "SAR" });
    await connection.query("UPDATE commitments SET status = 'committed' WHERE id = ?", [commitment.id]); // goods are received only against a committed commitment
    const po = async (number: string, amount: number, extra: Record<string, unknown>) => (await db.createPurchaseOrderForTenant({ userId: users.ops, ...scope, purchaseOrderNumber: number, supplierName: "Supplier", orderDate: day("2026-10-01"), amount, currency: "SAR", summary: "Order for the work", ...extra })).id as string;
    ids.po1 = await po("PO-1", 1000, { commitmentId: commitment.id, wbsItemId: W1 });
    ids.po2 = await po("PO-2", 300, { wbsItemId: W2 });
    ids.po3 = await po("PO-3", 200, {});
    const move = (purchaseOrderId: string, nextStatus: string) => db.transitionPurchaseOrderStatus({ userId: users.ops, ...scope, purchaseOrderId, nextStatus });
    for (const status of ["submitted", "approved", "issued"]) await move(ids.po1, status);
    for (const status of ["submitted", "approved"]) { await move(ids.po2, status); await move(ids.po3, status); }
    // an order for a WBS item of another project is refused
    await expect(db.createPurchaseOrderForTenant({ userId: users.ops, ...scope, purchaseOrderNumber: "PO-X", supplierName: "S", orderDate: day("2026-10-01"), amount: 1, currency: "SAR", summary: "Foreign item", wbsItemId: uid(999) })).rejects.toThrow();
    // 40 bags at 10 = 400 received against PO-1
    const grn = await db.createGoodsReceiptNoteForTenant({ userId: users.ops, ...scope, grnNumber: "GRN-1", purchaseOrderId: ids.po1, materialId: MAT, receivedQuantity: 40, rejectedQuantity: 0, unitCost: 10, unitOfMeasure: "bag", receivedAt: day("2026-10-08") });
    ids.grn = grn.id;
    const [cost] = await connection.query<{ wbsItemId: string; amount: string; category: string; sourceType: string; sourceId: string }[]>("SELECT wbsItemId, amount, category, sourceType, sourceId FROM cost_entries WHERE sourceId = ?", [ids.grn]);
    expect(cost[0]).toMatchObject({ wbsItemId: W1, amount: "400.00", category: "materials", sourceType: "goods_receipt_note", sourceId: ids.grn });
    await db.createCostEntry({ userId: users.cfo, ...scope, wbsItemId: W2, amount: 250, incurredAt: day("2026-09-20"), category: "labour" });
    await connection.query("UPDATE cost_entries SET status = 'posted' WHERE tenantId = ? AND status = 'draft'", [T]);
  }, 60_000);

  it("shows plan, actual, committed, forecast and variance at the project level and at each WBS item, adding up", async () => {
    const reader = callerFor(users.reader, "cfd-reader");
    const report = await reader.profitability.project(scope);
    if (report.drill.status !== "ok") throw new Error("drill unavailable");
    const { items, totals } = report.drill.data;
    // W1: plan 5,000; actual 400; open commitment 1,000 - 400 = 600; 40% done -> EV 2,000, forecast 400 + 3,000 = 3,400; variance 1,600.
    // W2: plan 3,000; actual 250; open 300; 0% done -> forecast 250 + 3,000 = 3,250; variance -250.
    expect(items).toEqual([
      { wbsItemId: W2, code: "2", name: "Finishes", planned: 3000, actual: 250, committed: 300, forecast: 3250, variance: -250 },
      { wbsItemId: W1, code: "1", name: "Foundations", planned: 5000, actual: 400, committed: 600, forecast: 3400, variance: 1600 },
    ]);
    // Project: plan 8,000; actual 650; committed 600 + 300 + the unallocated 200 = 1,100; forecast 6,650; variance 1,350.
    expect(totals).toEqual({ planned: 8000, actual: 650, committed: 1100, forecast: 6650, variance: 1350 });
    expect(totals.planned).toBe(items.reduce((t, i) => t + i.planned, 0));
    expect(totals.forecast).toBe(items.reduce((t, i) => t + i.forecast, 0));
  });

  it("leads every cost line to its source document, and counts the received goods once in the exposure", async () => {
    const reader = callerFor(users.reader, "cfd-reader");
    const breakdown = await reader.profitability.costBreakdown({ ...scope, wbsItemId: W1 });
    expect(breakdown.lines.map(line => [line.sourceType, line.sourceId, line.amount])).toEqual([["goods_receipt_note", ids.grn, 400]]);
    // A commitment of 1,000 of which 400 was received is exposure of 600 beside the 400 already in the actual, not 1,000.
    const controls = await db.getProjectControlsForTenant({ userId: users.reader, ...scope });
    expect(controls.cashFlow).toMatchObject({ plannedBudget: 8000, actualCost: 650, committedAmount: 600, totalExposure: 1250 });
  });

  it("records receipts through the invoice statuses, refuses a skipped step, and puts the payment in the month it was made", async () => {
    const invoice = async (invoiceNumber: string, date: string, amount: number, vatAmount: number) => (await db.createProjectCommercialInvoiceForTenant({ userId: users.cfo, ...scope, invoiceNumber, invoiceDate: day(date), clientName: "Client", amount, vatAmount })).id as string;
    ids.inv1 = await invoice("INV-1", "2026-10-05", 1000, 150);
    ids.inv2 = await invoice("INV-2", "2026-10-02", 500, 75);
    const move = (invoiceId: string, nextStatus: string, paidAt?: Date) => db.transitionProjectCommercialInvoiceStatus({ userId: users.cfo, ...scope, invoiceId, nextStatus, paidAt });
    await expect(move(ids.inv1, "paid", day("2026-10-10"))).rejects.toThrow("PROJECT_OS_INVOICE_TRANSITION_INVALID"); // a draft is issued first
    await move(ids.inv1, "issued");
    await expect(move(ids.inv1, "paid", day("2026-10-01"))).rejects.toThrow("PROJECT_OS_INVOICE_PAID_DATE_INVALID"); // before the invoice date
    await expect(move(ids.inv1, "paid", day("2999-01-01"))).rejects.toThrow("PROJECT_OS_INVOICE_PAID_DATE_INVALID");
    expect(await move(ids.inv1, "paid", day("2026-10-10"))).toMatchObject({ previousStatus: "issued", status: "paid" });
    await expect(move(ids.inv1, "void")).rejects.toThrow("PROJECT_OS_INVOICE_TRANSITION_INVALID"); // money received is not voided
    // the second invoice goes through the API a client calls
    const cfoCaller = callerFor(users.cfo, "cfd-cfo");
    await cfoCaller.projectInvoices.transitionStatus({ ...scope, invoiceId: ids.inv2, nextStatus: "issued" });
    await cfoCaller.projectInvoices.transitionStatus({ ...scope, invoiceId: ids.inv2, nextStatus: "paid", paidAt: day("2026-10-12") });
    const [audit] = await connection.query<{ metadata: string }[]>("SELECT metadata FROM audit_logs WHERE tenantId = ? AND action = 'project.invoice_status_changed' AND entityId = ?", [T, ids.inv1]);
    const changes = audit.map(row => JSON.parse(row.metadata));
    expect(changes.length).toBe(2); // issued, then paid: the refused moves left no trace
    expect(changes.find(change => change.to === "paid")).toMatchObject({ from: "issued", to: "paid", totalAmount: "1150.00" });
    // a reader may look but not move money
    await expect(db.transitionProjectCommercialInvoiceStatus({ userId: users.reader, ...scope, invoiceId: ids.inv2, nextStatus: "void" })).rejects.toThrow("Required permission is not granted.");
  }, 60_000);

  it("draws the net cash flow by month: September 250 out; October 1,725 in and 400 out", async () => {
    const reader = callerFor(users.reader, "cfd-reader");
    const flow = await reader.profitability.cashFlow(scope);
    expect(flow.months).toEqual([
      { month: "2026-09", receipts: 0, outflows: 250, net: -250, cumulative: -250 },
      { month: "2026-10", receipts: 1725, outflows: 400, net: 1325, cumulative: 1075 },
    ]);
    expect(flow.totals).toEqual({ receipts: 1725, outflows: 650, net: 1075 });
    expect(flow.lowestCumulative).toEqual({ month: "2026-09", cumulative: -250 });
    expect(flow.basis.outflows).toContain("accrual_proxy");
    // the headline's profit-versus-cash figures use the same receipts
    const report = await reader.profitability.project(scope);
    if (report.cash.status !== "ok") throw new Error("cash unavailable");
    expect(report.cash.data).toMatchObject({ receipts: 1725, outflows: 650, netCashFlow: 1075 });
  });

  it("closes the cash flow to whoever may not read it", async () => {
    await expect(callerFor(users.plain, "cfd-plain").profitability.cashFlow(scope)).rejects.toThrow("Required permission is not granted.");
    await expect(callerFor(users.ops, "cfd-ops").profitability.cashFlow(scope)).rejects.toThrow("Required permission is not granted.");
    await expect(callerFor(users.reader, "cfd-reader").profitability.cashFlow({ tenantId: T, projectId: uid(998) })).rejects.toThrow();
  });
});
