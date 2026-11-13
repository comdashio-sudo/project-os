import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// G-104 (D-32 part 2): the stocktake document on a real database, through the router as a request would be — open, count, approve by another person,
// and one adjustment per variance in the same transaction as the approval and its audit row. And who may not: a reader, the opener approving their own
// count, another company. Synthetic fixtures only.
const T = "79160000-0000-4000-8000-0000000000a1";
const T2 = "79160000-0000-4000-8000-0000000000b1";
const P = "79160000-0000-4000-8000-0000000000a2";
const P2 = "79160000-0000-4000-8000-0000000000b2";
const uid = (n: number) => `79160000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [WH, WH2, CEM, STL, SND] = [101, 102, 104, 105, 106].map(uid);
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
let connection: fixtureDb.Connection;
const users = { opener: 0, approver: 0, reader: 0, outsider: 0 };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@stocktake.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: { clearCookie: () => undefined } as TrpcContext["res"] } as TrpcContext);

async function clear() {
  for (const tenant of [T, T2]) {
    await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM stocktake_lines WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM stocktakes WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM warehouse_inventory_transactions WHERE tenantId = ?", [tenant]);
    for (const table of ["project_warehouses", "material_masters"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [tenant]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId = ?", [tenant]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [tenant]);
    await connection.query("DELETE FROM roles WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM memberships WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM subscriptions WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM projects WHERE tenantId = ?", [tenant]);
    await connection.query("DELETE FROM companies WHERE id = ?", [tenant]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'stk-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("the stocktake document on a real database (G-104)", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('stk-opener','Opener','stk-opener@stocktake.example.test','user'),('stk-approver','Approver','stk-approver@stocktake.example.test','user'),('stk-reader','Reader','stk-reader@stocktake.example.test','user'),('stk-outsider','Outsider','stk-outsider@stocktake.example.test','user')");
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'stk-%'");
    const idOf = (openId: string) => rows.find(row => row.openId === openId)!.id;
    users.opener = idOf("stk-opener"); users.approver = idOf("stk-approver"); users.reader = idOf("stk-reader"); users.outsider = idOf("stk-outsider");
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Stocktake Tenant', 'stocktake-tenant'), (?, 'Other Tenant', 'stocktake-other')", [T, T2]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'ST-A', 'Stocktake project', 'villas', 'SAR', 'active'), (?, ?, 'ST-B', 'Other company project', 'villas', 'SAR', 'active')", [P, T, P2, T2]);
    for (const [tenant, tag] of [[T, "a"], [T2, "b"]] as const) {
      await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES (?, ?, 'ALL-IN-ONE', 'active', NOW())", [`stk-sub-${tag}`, tenant]);
      await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES (?, ?, ?, 'PROJECT', true, NOW())", [`stk-ent-${tag}`, tenant, `stk-sub-${tag}`]);
    }
    for (const code of ["project.read", "project.inventory.manage"]) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (UUID(), ?, ?, 'PROJECT')", [code, code]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('stk-r-keeper', ?, 'STK_KEEPER','Keeper','PROJECT'), ('stk-r-reader', ?, 'STK_READER','Reader','PROJECT'), ('stk-r-out', ?, 'STK_OUT','Other keeper','PROJECT')", [T, T, T2]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT r.id, p.id FROM (VALUES ('stk-r-keeper'), ('stk-r-out')) AS r(id), permissions p WHERE p.code IN ('project.read','project.inventory.manage')");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'stk-r-reader', id FROM permissions WHERE code = 'project.read'");
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('stk-m-opener', ?, ?, 'active'), ('stk-m-approver', ?, ?, 'active'), ('stk-m-reader', ?, ?, 'active'), ('stk-m-out', ?, ?, 'active')", [T, users.opener, T, users.approver, T, users.reader, T2, users.outsider]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('stk-mr-opener','stk-m-opener','stk-r-keeper','company'),('stk-mr-approver','stk-m-approver','stk-r-keeper','company'),('stk-mr-reader','stk-m-reader','stk-r-reader','company'),('stk-mr-out','stk-m-out','stk-r-out','company')");
    await connection.query("INSERT INTO project_warehouses (id, tenantId, projectId, code, name, active, createdByUserId) VALUES (?, ?, ?, 'WH-01', 'Main store', true, ?), (?, ?, ?, 'WH-B', 'Other company store', true, ?)", [WH, T, P, users.opener, WH2, T2, P2, users.outsider]);
    await connection.query("INSERT INTO material_masters (id, tenantId, code, description, unitOfMeasure, category, active, createdByUserId) VALUES (?, ?, 'CEM', 'Cement', 'bag', 'concrete', true, ?), (?, ?, 'STL', 'Steel bar', 'ton', 'steel', true, ?), (?, ?, 'SND', 'Sand', 'm3', 'aggregate', true, ?)", [CEM, T, users.opener, STL, T, users.opener, SND, T, users.opener]);
    const keeper = callerFor(users.opener, "stk-opener");
    const receive = (materialId: string, quantityDelta: number, unitCost: number) => keeper.warehouses.recordInventory({ tenantId: T, projectId: P, warehouseId: WH, materialId, transactionType: "receipt", quantityDelta, unitCost, referenceNumber: "GRN-1", occurredAt: new Date() });
    await receive(CEM, 100, 20); await receive(STL, 10, 3000); await receive(SND, 50, 40);
  }, 60_000);
  afterAll(async () => { await clear(); await connection.end(); });

  const scope = { tenantId: T, projectId: P };
  const onHand = async (materialId: string) => { const [rows] = await connection.query<{ q: string | null; v: string | null }[]>("SELECT SUM(quantityDelta) AS q, SUM(valueDelta) AS v FROM warehouse_inventory_transactions WHERE warehouseId = ? AND materialId = ?", [WH, materialId]); return { quantity: Number(rows[0].q ?? 0), value: Number(rows[0].v ?? 0) }; };
  const audits = async (action: string) => { const [rows] = await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action = ?", [T, action]); return Number(rows[0].n); };
  const adjustments = async () => { const [rows] = await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM warehouse_inventory_transactions WHERE tenantId = ? AND transactionType = 'adjustment'", [T]); return Number(rows[0].n); };
  let stocktakeId = "";

  it("opens a count with the system quantity of every material on the shelf, and moves nothing", async () => {
    const opened = await callerFor(users.opener, "stk-opener").stocktakes.open({ ...scope, warehouseId: WH, stocktakeNumber: "ST-001", note: "Quarter end" });
    stocktakeId = opened.id;
    expect(opened.lines).toBe(3);
    const view = await callerFor(users.opener, "stk-opener").stocktakes.get({ ...scope, stocktakeId });
    expect(view.status).toBe("counting");
    expect(view.lines.map(line => [line.code, line.systemQuantity, line.countedQuantity])).toEqual([["CEM", 100, null], ["SND", 50, null], ["STL", 10, null]]);
    expect(await adjustments()).toBe(0);
    expect(await audits("stocktake_opened")).toBe(1);
  });

  it("NEGATIVE: a second open count of the same warehouse, a used number, a reader, and another company are refused, and write nothing", async () => {
    const opener = callerFor(users.opener, "stk-opener");
    await expect(opener.stocktakes.open({ ...scope, warehouseId: WH, stocktakeNumber: "ST-002" })).rejects.toThrow("PROJECT_OS_STOCKTAKE_ALREADY_OPEN");
    await expect(opener.stocktakes.open({ ...scope, warehouseId: WH, stocktakeNumber: "ST-001" })).rejects.toThrow("PROJECT_OS_STOCKTAKE_NUMBER_EXISTS");
    await expect(callerFor(users.reader, "stk-reader").stocktakes.open({ ...scope, warehouseId: WH, stocktakeNumber: "ST-009" })).rejects.toThrow("PROJECT_OS_PERMISSION_DENIED");
    await expect(callerFor(users.reader, "stk-reader").stocktakes.get({ ...scope, stocktakeId })).rejects.toThrow("PROJECT_OS_PERMISSION_DENIED");
    const outsider = callerFor(users.outsider, "stk-outsider");
    await expect(outsider.stocktakes.get({ ...scope, stocktakeId })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
    // the other company's keeper, in their own company, cannot reach this stocktake by its id
    await expect(outsider.stocktakes.get({ tenantId: T2, projectId: P2, stocktakeId })).rejects.toThrow("PROJECT_OS_STOCKTAKE_NOT_FOUND");
    await expect(outsider.stocktakes.approve({ tenantId: T2, projectId: P2, stocktakeId, reason: "taking over" })).rejects.toThrow("PROJECT_OS_STOCKTAKE_NOT_FOUND");
    const [[count]] = await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM stocktakes WHERE tenantId = ?", [T]);
    expect(Number(count.n)).toBe(1);
  });

  it("records the counts, and refuses approval before every line is counted, by the opener, or without a reason", async () => {
    const opener = callerFor(users.opener, "stk-opener");
    const view = await opener.stocktakes.get({ ...scope, stocktakeId });
    const line = (code: string) => view.lines.find(item => item.code === code)!.id;
    await opener.stocktakes.count({ ...scope, stocktakeId, counts: [{ lineId: line("CEM"), countedQuantity: 96 }, { lineId: line("STL"), countedQuantity: 10 }] });
    const approver = callerFor(users.approver, "stk-approver");
    await expect(approver.stocktakes.approve({ ...scope, stocktakeId, reason: "Quarter end count" })).rejects.toThrow("PROJECT_OS_STOCKTAKE_NOT_FULLY_COUNTED");
    await opener.stocktakes.count({ ...scope, stocktakeId, counts: [{ lineId: line("SND"), countedQuantity: 52.5 }] });
    await expect(opener.stocktakes.count({ ...scope, stocktakeId, counts: [{ lineId: line("SND"), countedQuantity: -1 }] })).rejects.toThrow("PROJECT_OS_STOCKTAKE_COUNT_INVALID");
    await expect(opener.stocktakes.approve({ ...scope, stocktakeId, reason: "my own count" })).rejects.toThrow("PROJECT_OS_STOCKTAKE_SAME_APPROVER");
    await expect(approver.stocktakes.approve({ ...scope, stocktakeId, reason: " " })).rejects.toThrow("PROJECT_OS_INVENTORY_REASON_REQUIRED");
    expect(await adjustments()).toBe(0);
    const counted = await opener.stocktakes.get({ ...scope, stocktakeId });
    expect(counted.lines.map(item => [item.code, item.variance])).toEqual([["CEM", -4], ["SND", 2.5], ["STL", 0]]);
  });

  it("approval by another keeper posts one valued adjustment per variance, with the approval and its audit row, all at once", async () => {
    const result = await callerFor(users.approver, "stk-approver").stocktakes.approve({ ...scope, stocktakeId, reason: "Quarter end count" });
    expect(result.adjustments).toBe(2);
    expect(await onHand(CEM)).toEqual({ quantity: 96, value: 1920 }); // 4 bags out at the average 20
    expect(await onHand(SND)).toEqual({ quantity: 52.5, value: 2100 }); // 2.5 m3 in at the average 40
    expect(await onHand(STL)).toEqual({ quantity: 10, value: 30000 }); // no variance, no movement
    const [rows] = await connection.query<{ referenceNumber: string; note: string; createdByUserId: number }[]>("SELECT referenceNumber, note, createdByUserId FROM warehouse_inventory_transactions WHERE tenantId = ? AND transactionType = 'adjustment'", [T]);
    expect(rows).toHaveLength(2);
    expect(rows.every(row => row.referenceNumber === "ST-001" && row.note === "Quarter end count" && row.createdByUserId === users.approver)).toBe(true);
    const view = await callerFor(users.approver, "stk-approver").stocktakes.get({ ...scope, stocktakeId });
    expect(view).toMatchObject({ status: "approved", approvedByUserId: users.approver, approvalReason: "Quarter end count" });
    expect(view.lines.filter(line => line.adjustmentTransactionId).length).toBe(2);
    expect(await audits("stocktake_approved")).toBe(1);
  });

  it("NEGATIVE: an approved stocktake is neither recounted nor approved again", async () => {
    const view = await callerFor(users.opener, "stk-opener").stocktakes.get({ ...scope, stocktakeId });
    await expect(callerFor(users.opener, "stk-opener").stocktakes.count({ ...scope, stocktakeId, counts: [{ lineId: view.lines[0]!.id, countedQuantity: 1 }] })).rejects.toThrow("PROJECT_OS_STOCKTAKE_NOT_OPEN");
    await expect(callerFor(users.approver, "stk-approver").stocktakes.approve({ ...scope, stocktakeId, reason: "again" })).rejects.toThrow("PROJECT_OS_STOCKTAKE_NOT_OPEN");
    expect(await adjustments()).toBe(2);
    expect(await audits("stocktake_approved")).toBe(1);
    const list = await callerFor(users.opener, "stk-opener").stocktakes.list(scope);
    expect(list.map(item => [item.stocktakeNumber, item.status])).toEqual([["ST-001", "approved"]]);
  });
});
