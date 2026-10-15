import mysql from "mysql2/promise";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
vi.mock("./storage", async importOriginal => (await import("./testing/memoryStorage")).memoryStorageModule(await importOriginal<typeof import("./storage")>()));

// Synthetic fixtures only. The phone entry screens read one context (defaults)
// and write through the existing procedures; this proves both on a real database.
const T = "30000000-0000-4000-8000-0000000000a1";
const T_OTHER = "30000000-0000-4000-8000-0000000000b1";
const P = "30000000-0000-4000-8000-0000000000a2";
const P_OTHER = "30000000-0000-4000-8000-0000000000b2";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^mysql(?:2)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };

let connection: mysql.Connection;
const ids = { engineer: 0, low: 0 };
const callerFor = (id: number, openId: string) => appRouter.createCaller({ user: { id, openId, name: openId, email: `${openId}@field.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });

async function clear() {
  const tenants = [T, T_OTHER];
  const projects = [P, P_OTHER];
  await connection.query("DELETE FROM audit_logs WHERE tenantId IN (?, ?)", tenants);
  for (const table of ["material_issues", "warehouse_inventory_transactions", "progress_entries", "cost_entries", "project_warehouses", "wbs_items"]) await connection.query(`DELETE FROM ${table} WHERE projectId IN (?, ?)`, projects);
  await connection.query("DELETE FROM material_masters WHERE tenantId IN (?, ?)", tenants);
  await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId IN (?, ?)", tenants);
  await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId IN (?, ?)", tenants);
  await connection.query("DELETE FROM roles WHERE tenantId IN (?, ?)", tenants);
  await connection.query("DELETE FROM memberships WHERE tenantId IN (?, ?)", tenants);
  await connection.query("DELETE FROM tenant_entitlements WHERE tenantId IN (?, ?)", tenants);
  await connection.query("DELETE FROM subscriptions WHERE tenantId IN (?, ?)", tenants);
  await connection.query("DELETE FROM projects WHERE id IN (?, ?)", projects);
  await connection.query("DELETE FROM companies WHERE id IN (?, ?)", tenants);
  await connection.query("DELETE FROM users WHERE openId IN ('field-engineer','field-low')");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Phone entry context and writes on a real database", () => {
  beforeAll(async () => {
    connection = await mysql.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('field-engineer','Field Engineer','field-engineer@field.example.test','user'),('field-low','Field Low','field-low@field.example.test','user')");
    const [users] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'field-%'");
    ids.engineer = users.find(u => u.openId === "field-engineer")!.id;
    ids.low = users.find(u => u.openId === "field-low")!.id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Field Tenant', 'field-tenant'), (?, 'Field Other Tenant', 'field-other')", [T, T_OTHER]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'FE-A', 'Field project', 'villas', 'SAR', 'active'), (?, ?, 'FE-B', 'Other project', 'villas', 'SAR', 'active')", [P, T, P_OTHER, T_OTHER]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('field-sub-a', ?, 'ALL-IN-ONE', 'active', NOW()), ('field-sub-b', ?, 'ALL-IN-ONE', 'active', NOW())", [T, T_OTHER]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('field-ent-a', ?, 'field-sub-a', 'PROJECT', true, NOW()), ('field-ent-b', ?, 'field-sub-b', 'PROJECT', true, NOW())", [T, T_OTHER]);
    await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES ('field-perm-read','project.read','Field project read','PROJECT'),('field-perm-write','project.write','Field project write','PROJECT')");
    const [permissions] = await connection.query<{ id: string; code: string }[]>("SELECT id, code FROM permissions WHERE code IN ('project.read','project.write')");
    const pid = (code: string) => permissions.find(p => p.code === code)!.id;
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('field-role-engineer', ?, 'FIELD_ENGINEER','Field engineer','PROJECT'), ('field-role-none', ?, 'FIELD_NONE','No permissions','PROJECT')", [T, T]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) VALUES ('field-role-engineer', ?),('field-role-engineer', ?)", [pid("project.read"), pid("project.write")]);
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('field-m-engineer', ?, ?, 'active'),('field-m-low', ?, ?, 'active')", [T, ids.engineer, T, ids.low]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('field-mr-engineer','field-m-engineer','field-role-engineer','company'),('field-mr-none','field-m-low','field-role-none','company')");
  }, 60_000);

  afterAll(async () => { await clear(); await connection.end(); });

  it("builds the defaults: last unit cost (issue beats receipt), stock on hand, last progress, last work item", async () => {
    const engineer = callerFor(ids.engineer, "field-engineer");
    const empty = await engineer.fieldEntry.context({ tenantId: T, projectId: P });
    expect(empty).toMatchObject({ warehouses: [], materials: [], wbs: [], lastIssuedWbsItemId: null });

    const warehouse = await engineer.warehouses.create({ tenantId: T, projectId: P, code: "WH-1", name: "Main store" });
    const cement = await engineer.materials.createMaster({ tenantId: T, code: "CEM", description: "Cement", unitOfMeasure: "bag", category: "concrete" });
    const steel = await engineer.materials.createMaster({ tenantId: T, code: "STL", description: "Rebar", unitOfMeasure: "ton", category: "steel" });
    const wbs1 = await engineer.wbs.create({ tenantId: T, projectId: P, code: "1", name: "Foundations", plannedValue: 100 });
    const wbs2 = await engineer.wbs.create({ tenantId: T, projectId: P, code: "2", name: "Structure", plannedValue: 100 });
    for (const materialId of [cement.id, steel.id]) await engineer.warehouses.recordInventory({ tenantId: T, projectId: P, warehouseId: warehouse.id, materialId, transactionType: "receipt", quantityDelta: 100, occurredAt: new Date("2026-10-01T00:00:00.000Z") });
    await engineer.progress.create({ tenantId: T, projectId: P, wbsItemId: wbs1.id, percentComplete: 30, reportedAt: new Date("2026-10-01T00:00:00.000Z") });
    await engineer.progress.create({ tenantId: T, projectId: P, wbsItemId: wbs1.id, percentComplete: 55, reportedAt: new Date("2026-10-05T00:00:00.000Z") });
    await engineer.warehouses.issueToWork({ tenantId: T, projectId: P, warehouseId: warehouse.id, materialId: cement.id, wbsItemId: wbs2.id, issuedQuantity: 10, unitCost: 18.5, issuedAt: new Date("2026-10-06T00:00:00.000Z") });

    const context = await engineer.fieldEntry.context({ tenantId: T, projectId: P });
    expect(context.warehouses.map(w => w.code)).toEqual(["WH-1"]);
    expect(context.lastIssuedWbsItemId).toBe(wbs2.id);
    expect(context.wbs.find(w => w.code === "1")).toMatchObject({ lastPercent: 55 });
    expect(context.wbs.find(w => w.code === "2")).toMatchObject({ lastPercent: null });
    const [first, second] = context.materials;
    // Most-issued first: cement was issued, rebar was not.
    expect([first.code, second.code]).toEqual(["CEM", "STL"]);
    expect(first).toMatchObject({ lastUnitCost: 18.5, timesIssued: 1, onHand: [{ warehouseId: warehouse.id, quantity: 90 }] });
    expect(second).toMatchObject({ lastUnitCost: null, timesIssued: 0, onHand: [{ warehouseId: warehouse.id, quantity: 100 }] });
  }, 60_000);

  it("refuses another tenant's project and a caller without the permission", async () => {
    const engineer = callerFor(ids.engineer, "field-engineer");
    const low = callerFor(ids.low, "field-low");
    await expect(engineer.fieldEntry.context({ tenantId: T, projectId: P_OTHER })).rejects.toThrow("PROJECT_OS_PROJECT_NOT_FOUND");
    await expect(low.fieldEntry.context({ tenantId: T, projectId: P })).rejects.toThrow("Required permission is not granted.");
  }, 60_000);

  it("keeps the existing write guards: an issue beyond the stock on hand is refused and changes nothing", async () => {
    const engineer = callerFor(ids.engineer, "field-engineer");
    const before = await engineer.fieldEntry.context({ tenantId: T, projectId: P });
    const cement = before.materials.find(m => m.code === "CEM")!;
    await expect(engineer.warehouses.issueToWork({ tenantId: T, projectId: P, warehouseId: before.warehouses[0].id, materialId: cement.id, wbsItemId: before.wbs[0].id, issuedQuantity: 1000, unitCost: 18.5, issuedAt: new Date() })).rejects.toThrow();
    const after = await engineer.fieldEntry.context({ tenantId: T, projectId: P });
    expect(after.materials.find(m => m.code === "CEM")!.onHand[0].quantity).toBe(90);
  }, 60_000);
});
