import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// G-031: receiving material against an issued purchase order from the phone. Synthetic fixtures.
const T = "77000000-0000-4000-8000-0000000000a1";
const P = "77000000-0000-4000-8000-0000000000a2";
const uid = (n: number) => `77000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [WBS, MAT, MAT2, COM, PO, PO_DRAFT] = [101, 102, 103, 104, 105, 106].map(uid);
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^mysql(?:2)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
let connection: mysql.Connection;
const users = { keeper: 0, reader: 0 };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@receipt.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const scope = { tenantId: T, projectId: P };

async function clear() {
  await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM client_requests WHERE tenantId = ?", [T]);
  for (const table of ["goods_receipt_notes", "cost_entries", "purchase_orders", "commitments", "material_masters", "wbs_items"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [T]);
  await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId = ?", [T]);
  await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [T]);
  await connection.query("DELETE FROM roles WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM memberships WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM subscriptions WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM projects WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM companies WHERE id = ?", [T]);
  await connection.query("DELETE FROM users WHERE openId LIKE 'rcp-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("receiving against a purchase order from the phone on a real database", () => {
  beforeAll(async () => {
    connection = await mysql.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('rcp-keeper','Keeper','rcp-keeper@receipt.example.test','user'),('rcp-reader','Reader','rcp-reader@receipt.example.test','user')");
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'rcp-%'");
    users.keeper = rows.find(row => row.openId === "rcp-keeper")!.id; users.reader = rows.find(row => row.openId === "rcp-reader")!.id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Receipt Tenant', 'receipt-tenant')", [T]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'RC-A', 'Receipt project', 'villas', 'SAR', 'active')", [P, T]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('rcp-sub', ?, 'ALL-IN-ONE', 'active', NOW())", [T]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('rcp-ent', ?, 'rcp-sub', 'PROJECT', true, NOW())", [T]);
    for (const code of ["project.read", "project.inventory.manage"]) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (UUID(), ?, ?, 'PROJECT')", [code, code]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('rcp-r-keeper', ?, 'RCP_KEEPER','Keeper','PROJECT'), ('rcp-r-reader', ?, 'RCP_READER','Reader','PROJECT')", [T, T]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'rcp-r-keeper', id FROM permissions WHERE code IN ('project.read','project.inventory.manage')");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'rcp-r-reader', id FROM permissions WHERE code = 'project.read'");
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('rcp-m-keeper', ?, ?, 'active'), ('rcp-m-reader', ?, ?, 'active')", [T, users.keeper, T, users.reader]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('rcp-mr-keeper','rcp-m-keeper','rcp-r-keeper','company'),('rcp-mr-reader','rcp-m-reader','rcp-r-reader','company')");
    await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name, plannedValue) VALUES (?, ?, ?, 'RC-1', 'Receipt work', 5000)", [WBS, T, P]);
    await connection.query("INSERT INTO material_masters (id, tenantId, code, description, unitOfMeasure, category, active, createdByUserId) VALUES (?, ?, 'CEM', 'Cement', 'bag', 'concrete', true, ?), (?, ?, 'STL', 'Steel bar', 'ton', 'steel', true, ?)", [MAT, T, users.keeper, MAT2, T, users.keeper]);
    await connection.query("INSERT INTO commitments (id, tenantId, projectId, code, description, amount, currency, status, committedAt) VALUES (?, ?, ?, 'COM-RC', 'Receipt commitment', 1000, 'SAR', 'committed', NOW())", [COM, T, P]);
    await connection.query("INSERT INTO purchase_orders (id, tenantId, projectId, commitmentId, wbsItemId, purchaseOrderNumber, supplierName, orderDate, amount, currency, summary, status, createdByUserId) VALUES (?, ?, ?, ?, ?, 'PO-RC-1', 'Supplier One', NOW(), 1000, 'SAR', 'Cement', 'issued', ?), (?, ?, ?, NULL, NULL, 'PO-RC-DRAFT', 'Supplier Two', NOW(), 500, 'SAR', 'Draft', 'draft', ?)", [PO, T, P, COM, WBS, users.keeper, PO_DRAFT, T, P, users.keeper]);
  }, 60_000);
  afterAll(async () => { await clear(); await connection.end(); });

  const input = (over: Record<string, unknown> = {}) => ({ ...scope, grnNumber: "GRN-RC-1", purchaseOrderId: PO, materialId: MAT, receivedQuantity: 10, rejectedQuantity: 0, unitCost: 25, unitOfMeasure: "bag", receivedAt: new Date("2026-10-15T08:00:00.000Z"), ...over });
  const count = async (sql: string, params: unknown[]) => { const [rows] = await connection.query<{ n: number }[]>(sql, params); return Number(rows[0].n); };

  it("offers the storekeeper only the issued orders, and says whether the role may receive", async () => {
    const context = await callerFor(users.keeper, "rcp-keeper").fieldEntry.context(scope);
    expect(context.purchaseOrders.map(order => [order.purchaseOrderNumber, order.supplierName, order.hasCommitment, order.lastReceivedMaterialId])).toEqual([["PO-RC-1", "Supplier One", true, null]]); // the draft order is not offered
    expect(context.can.receiveMaterial).toBe(true);
    expect((await callerFor(users.reader, "rcp-reader").fieldEntry.context(scope)).can.receiveMaterial).toBe(false);
  });

  it("books the receipt: the note, the material cost on the order's WBS, and the commitment drawn down; a resend with the same identifier changes nothing", async () => {
    const keeper = callerFor(users.keeper, "rcp-keeper");
    const clientRequestId = "77000000-0000-4000-8000-00000000f001";
    const first = await keeper.goodsReceipts.create({ ...input(), clientRequestId });
    expect(first.actualCost).toBe(250); // 10 bags x 25
    const again = await keeper.goodsReceipts.create({ ...input(), clientRequestId }); // the phone never heard the first answer
    expect(again).toEqual(first);
    expect(await count("SELECT COUNT(*) AS n FROM goods_receipt_notes WHERE tenantId = ?", [T])).toBe(1);
    const [[cost]] = await connection.query<any[]>("SELECT amount, wbsItemId, category, sourceType FROM cost_entries WHERE tenantId = ? AND sourceId = ?", [T, first.id]);
    expect(cost).toMatchObject({ wbsItemId: WBS, category: "materials", sourceType: "goods_receipt_note" });
    expect(Number(cost.amount)).toBe(250);
  });

  it("then proposes the material just received on that order, with the unit cost as the last price", async () => {
    const context = await callerFor(users.keeper, "rcp-keeper").fieldEntry.context(scope);
    expect(context.purchaseOrders[0].lastReceivedMaterialId).toBe(MAT);
    expect(context.materials.find(material => material.id === MAT)?.lastUnitCost).toBe(25);
  });

  it("refuses what the desk screen refuses: more than the commitment holds, a draft order, a wrong unit, and a role without inventory permission", async () => {
    const keeper = callerFor(users.keeper, "rcp-keeper");
    await expect(keeper.goodsReceipts.create(input({ grnNumber: "GRN-RC-2", receivedQuantity: 100, unitCost: 25 }))).rejects.toThrow("PROJECT_OS_GRN_COMMITMENT_INSUFFICIENT"); // 2,500 against 750 open
    await expect(keeper.goodsReceipts.create(input({ grnNumber: "GRN-RC-3", purchaseOrderId: PO_DRAFT }))).rejects.toThrow("PROJECT_OS_GRN_PURCHASE_ORDER_NOT_ISSUED");
    await expect(keeper.goodsReceipts.create(input({ grnNumber: "GRN-RC-4", unitOfMeasure: "ton" }))).rejects.toThrow("PROJECT_OS_REQUISITION_UNIT_MISMATCH");
    await expect(callerFor(users.reader, "rcp-reader").goodsReceipts.create(input({ grnNumber: "GRN-RC-5" }))).rejects.toThrow("Required permission is not granted.");
    expect(await count("SELECT COUNT(*) AS n FROM goods_receipt_notes WHERE tenantId = ?", [T])).toBe(1); // none of the refused ones was written
  });
});
