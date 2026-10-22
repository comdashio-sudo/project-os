import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Work order 3, decision 1 and 2: a goods receipt raises the shelf and the cost is charged when the material is issued to a WBS item;
// a direct delivery to site charges the cost at the door. Stock is valued at the weighted average. Synthetic fixtures.
const T = "78000000-0000-4000-8000-0000000000a1";
const P = "78000000-0000-4000-8000-0000000000a2";
const uid = (n: number) => `78000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [WBS, CEM, SAND, COM, PO] = [101, 102, 103, 104, 105].map(uid);
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
let connection: fixtureDb.Connection;
let keeper = 0; let warehouseA = ""; let warehouseB = "";
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@stock.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const scope = { tenantId: T, projectId: P };
const day = (value: string) => new Date(`${value}T08:00:00.000Z`);

async function clear() {
  await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM client_requests WHERE tenantId = ?", [T]);
  await connection.query("UPDATE warehouse_inventory_transactions SET transferId = NULL WHERE tenantId = ?", [T]);
  for (const table of ["material_issues", "goods_receipt_notes", "warehouse_inventory_transactions", "warehouse_inventory_transfers", "cost_entries", "purchase_orders", "commitments", "project_warehouses", "material_masters", "wbs_items"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [T]);
  await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId = ?", [T]);
  await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [T]);
  await connection.query("DELETE FROM roles WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM memberships WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM subscriptions WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM projects WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM companies WHERE id = ?", [T]);
  await connection.query("DELETE FROM users WHERE openId LIKE 'stk-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("stock valuation and the two ways cost enters a project, on a real database", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('stk-keeper','Keeper','stk-keeper@stock.example.test','user')");
    const [rows] = await connection.query<{ id: number }[]>("SELECT id FROM users WHERE openId = 'stk-keeper'");
    keeper = rows[0].id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Stock Tenant', 'stock-tenant')", [T]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'ST-A', 'Stock project', 'villas', 'SAR', 'active')", [P, T]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('stk-sub', ?, 'ALL-IN-ONE', 'active', NOW())", [T]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('stk-ent', ?, 'stk-sub', 'PROJECT', true, NOW())", [T]);
    for (const code of ["project.read", "project.inventory.manage"]) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (UUID(), ?, ?, 'PROJECT')", [code, code]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('stk-r-keeper', ?, 'STK_KEEPER','Keeper','PROJECT')", [T]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'stk-r-keeper', id FROM permissions WHERE code IN ('project.read','project.inventory.manage')");
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('stk-m-keeper', ?, ?, 'active')", [T, keeper]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('stk-mr-keeper','stk-m-keeper','stk-r-keeper','company')");
    await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name, plannedValue) VALUES (?, ?, ?, 'ST-1', 'Foundations', 50000)", [WBS, T, P]);
    await connection.query("INSERT INTO material_masters (id, tenantId, code, description, unitOfMeasure, category, active, createdByUserId) VALUES (?, ?, 'CEM', 'Cement', 'bag', 'concrete', true, ?), (?, ?, 'SND', 'Sand', 'm3', 'aggregate', true, ?)", [CEM, T, keeper, SAND, T, keeper]);
    await connection.query("INSERT INTO commitments (id, tenantId, projectId, code, description, amount, currency, status, committedAt) VALUES (?, ?, ?, 'COM-ST', 'Cement supply', 10000, 'SAR', 'committed', NOW())", [COM, T, P]);
    await connection.query("INSERT INTO purchase_orders (id, tenantId, projectId, commitmentId, wbsItemId, purchaseOrderNumber, supplierName, orderDate, amount, currency, summary, status, createdByUserId) VALUES (?, ?, ?, ?, ?, 'PO-ST-1', 'Supplier One', NOW(), 10000, 'SAR', 'Cement', 'issued', ?)", [PO, T, P, COM, WBS, keeper]);
    const caller = callerFor(keeper, "stk-keeper");
    warehouseA = (await caller.warehouses.create({ ...scope, code: "WH-A", name: "Main store" })).id;
    warehouseB = (await caller.warehouses.create({ ...scope, code: "WH-B", name: "Block 2 store" })).id;
  }, 60_000);
  afterAll(async () => { await clear(); await connection.end(); });

  const keeperCaller = () => callerFor(keeper, "stk-keeper");
  const grn = (over: Record<string, unknown>) => keeperCaller().goodsReceipts.create({ ...scope, purchaseOrderId: PO, materialId: CEM, rejectedQuantity: 0, unitOfMeasure: "bag", ...over } as never);
  const exposure = async () => (await keeperCaller().projects.getControls(scope)).cashFlow;
  const one = async (sql: string, params: unknown[] = [T]) => { const [rows] = await connection.query<any[]>(sql, params); return rows[0]; };
  const balance = async (warehouseId: string, materialId: string) => (await keeperCaller().warehouses.list(scope)).balances.find(row => row.warehouseId === warehouseId && row.materialId === materialId);

  it("a receipt raises the shelf and books no cost; the value received draws the commitment down and sits in exposure as stock", async () => {
    const first = await grn({ grnNumber: "GRN-ST-1", receivedQuantity: 100, unitCost: 10, receivedAt: day("2026-10-01"), receiptMode: "warehouse_stock", warehouseId: warehouseA });
    expect(first).toMatchObject({ receiptMode: "warehouse_stock", costEntryId: null, actualCost: 0, receivedValue: 1000, inventoryTransactionId: expect.any(String) });
    expect((await one("SELECT COUNT(*) AS n FROM cost_entries WHERE tenantId = ?")).n).toBe(0); // nothing is cost yet
    expect(await balance(warehouseA, CEM)).toMatchObject({ quantityOnHand: "100.000", stockValue: "1000.00", averageCost: "10.0000" });
    expect(await exposure()).toMatchObject({ actualCost: 0, committedAmount: 9000, inventoryValue: 1000, totalExposure: 10000 });
  });

  it("values stock at the weighted average of what was received", async () => {
    await grn({ grnNumber: "GRN-ST-2", receivedQuantity: 100, unitCost: 20, receivedAt: day("2026-10-02"), receiptMode: "warehouse_stock", warehouseId: warehouseA });
    expect(await balance(warehouseA, CEM)).toMatchObject({ quantityOnHand: "200.000", stockValue: "3000.00", averageCost: "15.0000" });
    expect(await exposure()).toMatchObject({ actualCost: 0, committedAmount: 7000, inventoryValue: 3000, totalExposure: 10000 });
  });

  it("issuing to a WBS item charges the average, and exposure does not move: the cost is counted once", async () => {
    const before = await exposure();
    const issue = await keeperCaller().warehouses.issueToWork({ ...scope, warehouseId: warehouseA, materialId: CEM, wbsItemId: WBS, issuedQuantity: 50, issuedAt: day("2026-10-03") });
    expect(issue).toMatchObject({ unitCost: 15, totalCost: 750, costBasis: "weighted_average" });
    expect(await one("SELECT SUM(amount) AS total, COUNT(*) AS n FROM cost_entries WHERE tenantId = ? AND wbsItemId IS NOT NULL", [T])).toMatchObject({ n: 1 });
    expect(Number((await one("SELECT SUM(amount) AS total FROM cost_entries WHERE tenantId = ?")).total)).toBe(750); // 750 of cost, not 3000 + 750
    expect(await balance(warehouseA, CEM)).toMatchObject({ quantityOnHand: "150.000", stockValue: "2250.00", averageCost: "15.0000" });
    const after = await exposure();
    expect(after).toMatchObject({ actualCost: 750, committedAmount: 7000, inventoryValue: 2250 });
    expect(after.totalExposure).toBe(before.totalExposure); // receiving and issuing the same goods never changes what the project is exposed to
  });

  it("ignores a typed-in cost while an average exists: the average is the only number the books accept", async () => {
    const issue = await keeperCaller().warehouses.issueToWork({ ...scope, warehouseId: warehouseA, materialId: CEM, wbsItemId: WBS, issuedQuantity: 10, unitCost: 99, issuedAt: day("2026-10-03") });
    expect(issue).toMatchObject({ unitCost: 15, totalCost: 150, costBasis: "weighted_average" });
  });

  it("a direct delivery to site books the cost at the door, never touches a shelf, and settles the commitment the same way", async () => {
    const before = await exposure();
    const stockBefore = await balance(warehouseA, CEM);
    const direct = await grn({ grnNumber: "GRN-ST-3", receivedQuantity: 10, unitCost: 30, receivedAt: day("2026-10-04"), receiptMode: "direct_to_site" });
    expect(direct).toMatchObject({ receiptMode: "direct_to_site", actualCost: 300, receivedValue: 300, inventoryTransactionId: null, costEntryId: expect.any(String) });
    expect(await balance(warehouseA, CEM)).toEqual(stockBefore); // the shelf did not move
    const after = await exposure();
    expect(after.actualCost).toBe(before.actualCost + 300);
    expect(after.committedAmount).toBe(before.committedAmount - 300);
    expect(after.totalExposure).toBe(before.totalExposure);
    // Cost on this order's material, across both ways: issue 750 + 150 from the shelf, 300 from the door. Each unit of cost exactly once.
    expect(Number((await one("SELECT SUM(amount) AS total FROM cost_entries WHERE tenantId = ? AND status = 'posted'")).total)).toBe(1200);
    expect((await one("SELECT COUNT(*) AS n FROM cost_entries WHERE tenantId = ? AND sourceType = 'goods_receipt_note'")).n).toBe(1); // only the direct delivery
    expect((await one("SELECT COUNT(*) AS n FROM cost_entries WHERE tenantId = ? AND sourceType = 'material_issue'")).n).toBe(2);
  });

  it("refuses a stock receipt with no warehouse, and a direct delivery that names one", async () => {
    await expect(grn({ grnNumber: "GRN-ST-4", receivedQuantity: 1, unitCost: 10, receivedAt: day("2026-10-05"), receiptMode: "warehouse_stock" })).rejects.toThrow("PROJECT_OS_GRN_WAREHOUSE_REQUIRED");
    await expect(grn({ grnNumber: "GRN-ST-5", receivedQuantity: 1, unitCost: 10, receivedAt: day("2026-10-05"), receiptMode: "direct_to_site", warehouseId: warehouseA })).rejects.toThrow("PROJECT_OS_GRN_WAREHOUSE_NOT_ALLOWED");
    await expect(grn({ grnNumber: "GRN-ST-6", receivedQuantity: 100000, unitCost: 10, receivedAt: day("2026-10-05"), receiptMode: "warehouse_stock", warehouseId: warehouseA })).rejects.toThrow("PROJECT_OS_GRN_COMMITMENT_INSUFFICIENT"); // the commitment limit applies to stock receipts too
    expect((await one("SELECT COUNT(*) AS n FROM goods_receipt_notes WHERE tenantId = ?")).n).toBe(3);
  });

  it("a transfer between warehouses carries the cost across: the total value on the shelves does not change", async () => {
    const totalBefore = (await exposure()).inventoryValue;
    await keeperCaller().warehouses.transferInventory({ ...scope, sourceWarehouseId: warehouseA, destinationWarehouseId: warehouseB, materialId: CEM, quantity: 20, note: "Block 2 pour", transferredAt: day("2026-10-06") });
    expect(await balance(warehouseA, CEM)).toMatchObject({ quantityOnHand: "120.000", stockValue: "1800.00", averageCost: "15.0000" });
    expect(await balance(warehouseB, CEM)).toMatchObject({ quantityOnHand: "20.000", stockValue: "300.00", averageCost: "15.0000" });
    expect((await exposure()).inventoryValue).toBe(totalBefore);
  });

  it("writes stock off at the average, and brings an uncounted find in at the average, so the average never moves by accident", async () => {
    await keeperCaller().warehouses.recordInventory({ ...scope, warehouseId: warehouseA, materialId: CEM, transactionType: "adjustment", quantityDelta: -4, note: "Damaged bags", occurredAt: day("2026-10-07") });
    expect(await balance(warehouseA, CEM)).toMatchObject({ quantityOnHand: "116.000", stockValue: "1740.00", averageCost: "15.0000" });
    await keeperCaller().warehouses.recordInventory({ ...scope, warehouseId: warehouseA, materialId: CEM, transactionType: "adjustment", quantityDelta: 4, note: "Found on recount", occurredAt: day("2026-10-07") });
    expect(await balance(warehouseA, CEM)).toMatchObject({ quantityOnHand: "120.000", stockValue: "1800.00", averageCost: "15.0000" });
    await expect(keeperCaller().warehouses.recordInventory({ ...scope, warehouseId: warehouseA, materialId: CEM, transactionType: "adjustment", quantityDelta: -1, unitCost: 5, note: "x cost", occurredAt: day("2026-10-07") })).rejects.toThrow("PROJECT_OS_INVENTORY_UNIT_COST_INVALID"); // stock leaving is never priced by hand
  });

  it("stock nobody priced is reported as such and can only be issued at a cost the person states, which the record labels as manual", async () => {
    await keeperCaller().warehouses.recordInventory({ ...scope, warehouseId: warehouseB, materialId: SAND, transactionType: "receipt", quantityDelta: 40, occurredAt: day("2026-10-08") });
    expect(await balance(warehouseB, SAND)).toMatchObject({ quantityOnHand: "40.000", stockValue: "0.00", averageCost: null, unpricedQuantity: "40.000" });
    await expect(keeperCaller().warehouses.issueToWork({ ...scope, warehouseId: warehouseB, materialId: SAND, wbsItemId: WBS, issuedQuantity: 5, issuedAt: day("2026-10-08") })).rejects.toThrow("PROJECT_OS_MATERIAL_ISSUE_COST_REQUIRED");
    await expect(keeperCaller().warehouses.issueToWork({ ...scope, warehouseId: warehouseB, materialId: SAND, wbsItemId: WBS, issuedQuantity: 5, unitCost: 7, issuedAt: day("2026-10-08") })).resolves.toMatchObject({ unitCost: 7, totalCost: 35, costBasis: "manual" });
    const [audits] = await connection.query<{ metadata: string }[]>("SELECT metadata FROM audit_logs WHERE tenantId = ? AND action = 'warehouse.material_issued_to_work'", [T]);
    const bases = audits.map(row => JSON.parse(row.metadata).costBasis).sort();
    expect(bases).toEqual(["manual", "weighted_average", "weighted_average"]); // the audit row says where each number came from
  });

  it("treats a receipt row from before stock valuation as a direct delivery: its cost was booked at the door and no shelf was ever raised", async () => {
    await connection.query("INSERT INTO goods_receipt_notes (id, tenantId, projectId, purchaseOrderId, materialId, grnNumber, receivedQuantity, rejectedQuantity, unitCost, unitOfMeasure, receivedAt, createdByUserId) VALUES ('stk-legacy-grn', ?, ?, ?, ?, 'GRN-LEGACY', 1, 0, 10, 'bag', NOW(), ?)", [T, P, PO, CEM, keeper]);
    expect((await one("SELECT receiptMode, warehouseId, inventoryTransactionId FROM goods_receipt_notes WHERE id = 'stk-legacy-grn'", []))).toEqual({ receiptMode: "direct_to_site", warehouseId: null, inventoryTransactionId: null });
  });
});
