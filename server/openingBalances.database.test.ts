import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
vi.mock("./storage", async importOriginal => (await import("./testing/memoryStorage")).memoryStorageModule(await importOriginal<typeof import("./storage")>()));

// G-105: opening stock through the governed importer. Synthetic fixtures only.
const T = "78000000-0000-4000-8000-0000000000a1";
const P = "78000000-0000-4000-8000-0000000000a2";
const P2 = "78000000-0000-4000-8000-0000000000a3";
const uid = (n: number) => `78000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [WH1, WH_OLD, WH_OTHER, CEM, STL, OLDM] = [101, 102, 103, 104, 105, 106].map(uid);
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^mysql(?:2)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
let connection: mysql.Connection;
const users = { keeper: 0, buyer: 0, reader: 0 };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@opening.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const csv = (...lines: string[]) => Buffer.from(["Warehouse Code,Material Code,Quantity", ...lines].join("\n"), "utf8").toString("base64");

async function clear() {
  await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [T]);
  await connection.query("DELETE r FROM data_import_row_results r INNER JOIN data_imports i ON i.id = r.importId WHERE i.tenantId = ?", [T]);
  await connection.query("DELETE e FROM data_import_errors e INNER JOIN data_imports i ON i.id = e.importId WHERE i.tenantId = ?", [T]);
  await connection.query("DELETE FROM data_imports WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM warehouse_inventory_transactions WHERE tenantId = ?", [T]);
  for (const table of ["project_warehouses", "material_masters"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [T]);
  await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId = ?", [T]);
  await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [T]);
  await connection.query("DELETE FROM roles WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM memberships WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM subscriptions WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM projects WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM companies WHERE id = ?", [T]);
  await connection.query("DELETE FROM users WHERE openId LIKE 'opn-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("opening balances through the governed importer on a real database", () => {
  beforeAll(async () => {
    connection = await mysql.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('opn-keeper','Keeper','opn-keeper@opening.example.test','user'),('opn-buyer','Buyer','opn-buyer@opening.example.test','user'),('opn-reader','Reader','opn-reader@opening.example.test','user')");
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'opn-%'");
    const idOf = (openId: string) => rows.find(row => row.openId === openId)!.id;
    users.keeper = idOf("opn-keeper"); users.buyer = idOf("opn-buyer"); users.reader = idOf("opn-reader");
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Opening Tenant', 'opening-tenant')", [T]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'OP-A', 'Opening project', 'villas', 'SAR', 'active'), (?, ?, 'OP-B', 'Other project', 'villas', 'SAR', 'active')", [P, T, P2, T]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('opn-sub', ?, 'ALL-IN-ONE', 'active', NOW())", [T]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('opn-ent', ?, 'opn-sub', 'PROJECT', true, NOW())", [T]);
    for (const code of ["project.read", "project.inventory.manage", "project.procurement.manage"]) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (UUID(), ?, ?, 'PROJECT')", [code, code]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('opn-r-keeper', ?, 'OPN_KEEPER','Keeper','PROJECT'), ('opn-r-buyer', ?, 'OPN_BUYER','Buyer','PROJECT'), ('opn-r-reader', ?, 'OPN_READER','Reader','PROJECT')", [T, T, T]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'opn-r-keeper', id FROM permissions WHERE code IN ('project.read','project.inventory.manage')");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'opn-r-buyer', id FROM permissions WHERE code IN ('project.read','project.procurement.manage')");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'opn-r-reader', id FROM permissions WHERE code = 'project.read'");
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('opn-m-keeper', ?, ?, 'active'), ('opn-m-buyer', ?, ?, 'active'), ('opn-m-reader', ?, ?, 'active')", [T, users.keeper, T, users.buyer, T, users.reader]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('opn-mr-keeper','opn-m-keeper','opn-r-keeper','company'),('opn-mr-buyer','opn-m-buyer','opn-r-buyer','company'),('opn-mr-reader','opn-m-reader','opn-r-reader','company')");
    await connection.query("INSERT INTO project_warehouses (id, tenantId, projectId, code, name, active, createdByUserId) VALUES (?, ?, ?, 'WH-01', 'Main store', true, ?), (?, ?, ?, 'WH-OLD', 'Closed store', false, ?), (?, ?, ?, 'WH-OTHER', 'Other project store', true, ?)", [WH1, T, P, users.keeper, WH_OLD, T, P, users.keeper, WH_OTHER, T, P2, users.keeper]);
    await connection.query("INSERT INTO material_masters (id, tenantId, code, description, unitOfMeasure, category, active, createdByUserId) VALUES (?, ?, 'CEM', 'Cement', 'bag', 'concrete', true, ?), (?, ?, 'STL', 'Steel bar', 'ton', 'steel', true, ?), (?, ?, 'OLDM', 'Retired material', 'm', 'misc', false, ?)", [CEM, T, users.keeper, STL, T, users.keeper, OLDM, T, users.keeper]);
  }, 60_000);
  afterAll(async () => { await clear(); await connection.end(); });

  const scope = { tenantId: T, projectId: P };
  const onHand = async (warehouseId: string, materialId: string) => { const [rows] = await connection.query<{ q: string | null }[]>("SELECT SUM(quantityDelta) AS q FROM warehouse_inventory_transactions WHERE warehouseId = ? AND materialId = ?", [warehouseId, materialId]); return Number(rows[0].q ?? 0); };
  const transactions = async () => { const [rows] = await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM warehouse_inventory_transactions WHERE tenantId = ?", [T]); return Number(rows[0].n); };

  it("reports every unusable row by number and field, and loads nothing", async () => {
    const keeper = callerFor(users.keeper, "opn-keeper");
    const bad = await keeper.dataImports.analyze({ ...scope, moduleCode: "openingBalances", fileName: "bad.csv", sourceFormat: "csv", base64: csv("WH-01,CEM,10", "WH-NOPE,CEM,5", "WH-OLD,STL,5", "WH-OTHER,CEM,5", "WH-01,OLDM,5", "WH-01,STL,0", "WH-01,CEM,3") });
    expect(bad.status).toBe("uploaded");
    expect(bad.errors.map(error => [error.rowNumber, error.code, error.field])).toEqual(expect.arrayContaining([
      [3, "IMPORT_REFERENCE_NOT_FOUND", "warehouseCode"], // unknown warehouse
      [4, "IMPORT_REFERENCE_NOT_FOUND", "warehouseCode"], // inactive warehouse
      [5, "IMPORT_REFERENCE_NOT_FOUND", "warehouseCode"], // a warehouse of another project
      [6, "IMPORT_REFERENCE_NOT_FOUND", "materialCode"], // inactive material
      [7, "IMPORT_INVALID_NUMBER", "quantity"], // zero is not a balance
      [8, "IMPORT_DUPLICATE_FILE_KEY", "materialCode"], // the pair WH-01/CEM is already in the file
    ]));
    await expect(keeper.dataImports.confirm({ ...scope, importId: bad.id })).rejects.toThrow("PROJECT_OS_IMPORT_NOT_CONFIRMABLE");
    expect(await transactions()).toBe(0);
  });

  it("loads the opening stock as the first movement, with a row result and an audit row", async () => {
    const keeper = callerFor(users.keeper, "opn-keeper");
    const analysis = await keeper.dataImports.analyze({ ...scope, moduleCode: "openingBalances", fileName: "opening.csv", sourceFormat: "csv", base64: csv("WH-01,CEM,120", "WH-01,STL,2.5") });
    expect(analysis).toMatchObject({ status: "validated", errors: [] });
    await expect(keeper.dataImports.confirm({ ...scope, importId: analysis.id })).resolves.toMatchObject({ status: "completed", createdRows: 2, updatedRows: 0, skippedRows: 0 });
    expect(await onHand(WH1, CEM)).toBe(120); expect(await onHand(WH1, STL)).toBe(2.5);
    const [moves] = await connection.query<{ transactionType: string; note: string; referenceNumber: string }[]>("SELECT transactionType, note, referenceNumber FROM warehouse_inventory_transactions WHERE tenantId = ?", [T]);
    expect(moves.every(move => move.transactionType === "adjustment" && move.note === "Opening balance (data import)" && move.referenceNumber.startsWith("OPENING-"))).toBe(true);
    const [[audit]] = await connection.query<any[]>("SELECT metadata FROM audit_logs WHERE tenantId = ? AND action = 'data_import_completed' AND entityId = ?", [T, analysis.id]);
    expect(JSON.parse(audit.metadata)).toMatchObject({ moduleCode: "openingBalances", createdRows: 2, totalQuantity: 122.5 });
    const detail = await keeper.dataImports.detail({ ...scope, importId: analysis.id });
    expect(detail.rowResults.map(row => [row.rowKey, row.action])).toEqual([["WH-01|CEM", "created"], ["WH-01|STL", "created"]]);
  });

  it("never opens a pair that already has movements: refused by default, skipped on request, and stock with history is not edited", async () => {
    const keeper = callerFor(users.keeper, "opn-keeper");
    const again = await keeper.dataImports.analyze({ ...scope, moduleCode: "openingBalances", fileName: "again.csv", sourceFormat: "csv", base64: csv("WH-01,CEM,999") });
    await expect(keeper.dataImports.confirm({ ...scope, importId: again.id })).rejects.toThrow("PROJECT_OS_IMPORT_DUPLICATE_DETECTED");
    expect(await onHand(WH1, CEM)).toBe(120);
    const mixed = await keeper.dataImports.analyze({ ...scope, moduleCode: "openingBalances", fileName: "mixed.csv", sourceFormat: "csv", base64: csv("WH-01,CEM,999", "WH-01,STL,999"), duplicateMode: "skip_duplicates" });
    // both pairs already have movements, so everything is skipped and nothing changes
    await expect(keeper.dataImports.confirm({ ...scope, importId: mixed.id })).resolves.toMatchObject({ createdRows: 0, skippedRows: 2 });
    expect(await onHand(WH1, CEM)).toBe(120); expect(await onHand(WH1, STL)).toBe(2.5);
  });

  it("is open only to someone who may manage inventory: not a buyer, not a read-only user", async () => {
    const file = { ...scope, moduleCode: "openingBalances" as const, fileName: "x.csv", sourceFormat: "csv" as const, base64: csv("WH-01,CEM,1") };
    await expect(callerFor(users.buyer, "opn-buyer").dataImports.analyze(file)).rejects.toThrow("Required permission is not granted.");
    await expect(callerFor(users.reader, "opn-reader").dataImports.analyze(file)).rejects.toThrow("Required permission is not granted.");
  });

  it("tells a person who uploads the very same file twice that it is a duplicate, and leaves the first upload alone", async () => {
    const keeper = callerFor(users.keeper, "opn-keeper");
    const file = { ...scope, moduleCode: "openingBalances" as const, fileName: "same.csv", sourceFormat: "csv" as const, base64: csv("WH-01,STL,777") };
    const first = await keeper.dataImports.analyze(file);
    const countImports = async () => { const [rows] = await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM data_imports WHERE tenantId = ?", [T]); return Number(rows[0].n); };
    const before = await countImports();
    await expect(keeper.dataImports.analyze({ ...file, fileName: "same-again.csv" })).rejects.toThrow("PROJECT_OS_IMPORT_DUPLICATE_DETECTED");
    expect(await countImports()).toBe(before); // the repeat created nothing
    expect((await keeper.dataImports.detail({ ...scope, importId: first.id })).status).toBe("validated");
  });
});
