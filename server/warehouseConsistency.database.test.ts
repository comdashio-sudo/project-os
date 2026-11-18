import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-41 (P2-05): the warehouse's reported balance is the sum of its movements after every kind of movement, and a movement out beyond what is on the shelf is
// refused on every path (issue to work, issue to another warehouse, an issue or adjustment out) — nothing written. Real database, restricted role, synthetic data.
const SLUG = "q41-consistency";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const P = "41410000-0000-4000-8000-000000000001"; const WBS = "41410000-0000-4000-8000-000000000010";
let connection: fixtureDb.Connection; let tenantId = ""; let ownerId = 0; let one = ""; let two = ""; let cement = "";
const owner = () => appRouter.createCaller({ user: { id: ownerId, openId: "q41-owner", name: "Q41", email: "q41-owner@q41.example.test", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [SLUG]);
  for (const { id } of companies) {
    for (const table of ["material_returns", "material_issues", "cost_entries", "warehouse_inventory_transactions", "warehouse_inventory_transfers", "client_requests", "project_warehouses", "material_masters", "wbs_items", "audit_logs"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId = 'q41-owner'");
}
/** What the warehouse screen reports, against the raw sum of movements, for every (warehouse, material) of the project. */
async function reportedAgainstMovements() {
  const reported = (await owner().warehouses.list({ tenantId, projectId: P })).balances.map(row => [`${row.warehouseId}:${row.materialId}`, Number(row.quantityOnHand)] as const);
  const [sums] = await connection.query<{ k: string; q: string }[]>("SELECT warehouseId || ':' || materialId AS k, SUM(quantityDelta) AS q FROM warehouse_inventory_transactions WHERE tenantId = ? AND projectId = ? GROUP BY 1", [tenantId, P]);
  return { reported: Object.fromEntries(reported), movements: Object.fromEntries(sums.map(row => [row.k, Number(row.q)])) };
}
const movementCount = async () => (await connection.query<{ n: number }[]>("SELECT count(*)::int AS n FROM warehouse_inventory_transactions WHERE tenantId = ?", [tenantId]))[0][0].n;

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-41: the warehouse balance is the sum of its movements; nothing leaves what is not there", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('q41-owner', 'Q41', 'q41-owner@q41.example.test', 'user')");
    ownerId = (await connection.query<{ id: number }[]>("SELECT id FROM users WHERE openId = 'q41-owner'"))[0][0].id;
    ({ tenantId } = await owner().tenant.create({ legalName: "Q41 Stores Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q41-1', 'Stores project', 'villas', 'SAR', 'active')", [P, tenantId]);
    await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name) VALUES (?, ?, ?, '1', 'Masonry')", [WBS, tenantId, P]);
    await owner().materials.createMaster({ tenantId, code: "CEM-1", description: "Cement bag 50kg", unitOfMeasure: "bag", category: "cement" });
    cement = (await connection.query<{ id: string }[]>("SELECT id FROM material_masters WHERE tenantId = ?", [tenantId]))[0][0].id;
    await owner().warehouses.create({ tenantId, projectId: P, code: "S1", name: "Store one" });
    await owner().warehouses.create({ tenantId, projectId: P, code: "S2", name: "Store two" });
    const [stores] = await connection.query<{ id: string; code: string }[]>("SELECT id, code FROM project_warehouses WHERE tenantId = ?", [tenantId]);
    one = stores.find(row => row.code === "S1")!.id; two = stores.find(row => row.code === "S2")!.id;
  }, 120_000);
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("after a receipt, a transfer, an issue to work and an adjustment, every reported balance equals the sum of its movements", async () => {
    const now = new Date();
    await owner().warehouses.recordInventory({ tenantId, projectId: P, warehouseId: one, materialId: cement, transactionType: "receipt", quantityDelta: 100, unitCost: 20, occurredAt: now });
    await owner().warehouses.transferInventory({ tenantId, projectId: P, sourceWarehouseId: one, destinationWarehouseId: two, materialId: cement, quantity: 30, transferredAt: now, note: "Stock for block 2" });
    await owner().warehouses.issueToWork({ tenantId, projectId: P, warehouseId: one, materialId: cement, wbsItemId: WBS, issuedQuantity: 25, issuedAt: now });
    await owner().warehouses.recordInventory({ tenantId, projectId: P, warehouseId: two, materialId: cement, transactionType: "adjustment", quantityDelta: -5, occurredAt: now, note: "Damaged bags" });
    const { reported, movements } = await reportedAgainstMovements();
    expect(reported).toEqual(movements);
    expect(reported).toEqual({ [`${one}:${cement}`]: 45, [`${two}:${cement}`]: 25 });
  });

  it("NEGATIVE: an issue to work, a transfer, an issue and an adjustment beyond what is on the shelf are refused, and nothing moves", async () => {
    const before = await movementCount(); const now = new Date();
    const attempts: Record<string, () => Promise<unknown>> = {
      issueToWork: () => owner().warehouses.issueToWork({ tenantId, projectId: P, warehouseId: one, materialId: cement, wbsItemId: WBS, issuedQuantity: 46, issuedAt: now }),
      transferInventory: () => owner().warehouses.transferInventory({ tenantId, projectId: P, sourceWarehouseId: two, destinationWarehouseId: one, materialId: cement, quantity: 26, transferredAt: now, note: "More than is there" }),
      issue: () => owner().warehouses.recordInventory({ tenantId, projectId: P, warehouseId: one, materialId: cement, transactionType: "issue", quantityDelta: -46, occurredAt: now }),
      adjustment: () => owner().warehouses.recordInventory({ tenantId, projectId: P, warehouseId: two, materialId: cement, transactionType: "adjustment", quantityDelta: -26, occurredAt: now, note: "More than is there" }),
    };
    for (const [path, attempt] of Object.entries(attempts)) expect([path, await code(attempt())]).toEqual([path, "PROJECT_OS_INVENTORY_INSUFFICIENT_STOCK"]);
    expect(await movementCount()).toBe(before);
    const { reported, movements } = await reportedAgainstMovements();
    expect(reported).toEqual(movements);
  });
});
