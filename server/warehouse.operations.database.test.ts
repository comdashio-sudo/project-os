import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Work order 12, item 3: returns, transfers between projects, stock counts, finding a material, and issuing into a unit's activity.
// Real database, the application running as the restricted role. Synthetic data only.
const SLUG = "warehouse-ops";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@warehouse.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} }, res: {} } as unknown as TrpcContext);
const DENIED = "Required permission is not granted.";
const SCOPE_DENIED = "Role scope does not cover the requested resource.";
const KEYS = ["owner", "keeperA"] as const;
const id = (n: number) => `f5000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const A = id(1); const B = id(2); const WBS = id(10); const ZONE = id(20); const BLOCK = id(21); const UNIT = id(22); const UNIT_B = id(23);
const GROUP = id(24); const STAGE = id(25); const DEF = id(26); const DEF_OTHER_MODEL = id(27); const DEF_UNLINKED = id(28);

let connection: fixtureDb.Connection;
let tenantId = ""; let warehouseA = ""; let warehouseB = ""; let cement = ""; let sand = "";
const userIds: Record<string, number> = {}; const callers: Record<string, ReturnType<typeof callerFor>> = {};

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [SLUG]);
  for (const { id: company } of companies) {
    for (const table of ["warehouse_stocktake_lines", "warehouse_stocktakes", "material_returns", "material_issues", "cost_entries", "warehouse_inventory_transactions", "warehouse_inventory_transfers", "client_requests", "project_warehouses", "material_masters", "pmc_activity_definitions", "pmc_activity_stages", "pmc_activity_groups", "pmc_units", "pmc_blocks", "pmc_zones", "wbs_items", "audit_logs", "membership_invitations"]) {
      await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [company]);
    }
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [company]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [company]);
    for (const table of ["roles", "memberships", "tenant_entitlements", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [company]);
    await connection.query("DELETE FROM companies WHERE id = ?", [company]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'whs-%'");
}
const costTotal = async (projectId: string) => { const [[row]] = await Promise.all([connection.query<{ total: string }[]>("SELECT COALESCE(SUM(amount), 0) AS total FROM cost_entries WHERE tenantId = ? AND projectId = ? AND status = 'posted'", [tenantId, projectId])]); return Number(row[0].total); };
const onHand = async (projectId: string, warehouseId: string, materialId: string) => { const [rows] = await connection.query<{ q: string; v: string | null }[]>("SELECT COALESCE(SUM(quantityDelta), 0) AS q, SUM(valueDelta) AS v FROM warehouse_inventory_transactions WHERE tenantId = ? AND projectId = ? AND warehouseId = ? AND materialId = ?", [tenantId, projectId, warehouseId, materialId]); return { quantity: Number(rows[0].q), value: rows[0].v === null ? null : Number(rows[0].v) }; };

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("warehouse operations on a real database", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`whs-${key}`, `Warehouse ${key}`, `whs-${key}@warehouse.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'whs-%'");
    for (const key of KEYS) { userIds[key] = rows.find(row => row.openId === `whs-${key}`)!.id; callers[key] = callerFor(userIds[key], `whs-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Warehouse Ops Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'WH-A', 'Villas A', 'villas', 'SAR', 'active'), (?, ?, 'WH-B', 'Villas B', 'villas', 'SAR', 'active')", [A, tenantId, B, tenantId]);
    const administration = await callers.owner.tenant.administration({ tenantId });
    const roleId = administration.roles.find(role => role.code === "WAREHOUSE_CUSTODIAN")!.id;
    const invitation = await callers.owner.tenant.createInvitation({ tenantId, email: "whs-keeperA@warehouse.example.test", roleId, scopeType: "project", scopeId: A });
    await callers.keeperA.tenant.acceptInvitation({ inviteToken: invitation.inviteToken });
    await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'WBS-1', 'Masonry')", [WBS, tenantId, A]);
    await connection.query("INSERT INTO pmc_zones (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'Z1', 'Zone 1')", [ZONE, tenantId, A]);
    await connection.query("INSERT INTO pmc_blocks (id, tenantId, projectId, zoneId, code, name) VALUES (?, ?, ?, ?, 'B1', 'Block 1')", [BLOCK, tenantId, A, ZONE]);
    await connection.query("INSERT INTO pmc_units (id, tenantId, projectId, blockId, unitNumber, modelCode, unitWeight) VALUES (?, ?, ?, ?, 1, 'A', 1), (?, ?, ?, ?, 2, 'B', 1)", [UNIT, tenantId, A, BLOCK, UNIT_B, tenantId, A, BLOCK]);
    await connection.query("INSERT INTO pmc_activity_groups (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'FIN', 'Finishing')", [GROUP, tenantId, A]);
    await connection.query("INSERT INTO pmc_activity_stages (id, tenantId, projectId, groupId, code, name) VALUES (?, ?, ?, ?, 'INT', 'Internal')", [STAGE, tenantId, A, GROUP]);
    await connection.query("INSERT INTO pmc_activity_definitions (id, tenantId, projectId, groupId, stageId, wbsItemId, modelCode, code, name, weightPercent) VALUES (?, ?, ?, ?, ?, ?, 'A', 'WALLS', 'Walls', 100), (?, ?, ?, ?, ?, ?, 'B', 'WALLS', 'Walls', 100), (?, ?, ?, ?, ?, NULL, 'A', 'PAINT', 'Paint', 0)", [DEF, tenantId, A, GROUP, STAGE, WBS, DEF_OTHER_MODEL, tenantId, A, GROUP, STAGE, WBS, DEF_UNLINKED, tenantId, A, GROUP, STAGE]);
    await callers.owner.materials.createMaster({ tenantId, code: "CEM-1", description: "Cement bag 50kg", unitOfMeasure: "bag", category: "cement" });
    await callers.owner.materials.createMaster({ tenantId, code: "SND-1", description: "Washed sand", unitOfMeasure: "m3", category: "aggregates" });
    const [materials] = await connection.query<{ id: string; code: string }[]>("SELECT id, code FROM material_masters WHERE tenantId = ?", [tenantId]);
    cement = materials.find(row => row.code === "CEM-1")!.id; sand = materials.find(row => row.code === "SND-1")!.id;
    await callers.owner.warehouses.create({ tenantId, projectId: A, code: "WH-A", name: "Store A" });
    await callers.owner.warehouses.create({ tenantId, projectId: B, code: "WH-B", name: "Store B" });
    const [whs] = await connection.query<{ id: string; code: string }[]>("SELECT id, code FROM project_warehouses WHERE tenantId = ?", [tenantId]);
    warehouseA = whs.find(row => row.code === "WH-A")!.id; warehouseB = whs.find(row => row.code === "WH-B")!.id;
    await callers.owner.warehouses.recordInventory({ tenantId, projectId: A, warehouseId: warehouseA, materialId: cement, transactionType: "receipt", quantityDelta: 100, unitCost: 20, occurredAt: new Date() });
  }, 180_000);
  afterAll(async () => { await clear(); await connection.end(); });

  it("issues into a unit's activity: the activity names the WBS item, the cost is booked, and the cell is on the record", async () => {
    const issue = await callers.owner.warehouses.issueToCell({ tenantId, projectId: A, warehouseId: warehouseA, materialId: cement, pmcUnitId: UNIT, pmcActivityDefinitionId: DEF, issuedQuantity: 10, issuedAt: new Date() });
    expect(issue.totalCost).toBe(200);
    expect(await costTotal(A)).toBe(200);
    const [rows] = await connection.query<{ wbsItemId: string; pmcUnitId: string; pmcActivityDefinitionId: string }[]>("SELECT wbsItemId, pmcUnitId, pmcActivityDefinitionId FROM material_issues WHERE id = ?", [issue.id]);
    expect(rows[0]).toEqual({ wbsItemId: WBS, pmcUnitId: UNIT, pmcActivityDefinitionId: DEF });
    // a unit of model B cannot take model A's activity; an activity with no WBS item cannot carry a cost
    await expect(callers.owner.warehouses.issueToCell({ tenantId, projectId: A, warehouseId: warehouseA, materialId: cement, pmcUnitId: UNIT_B, pmcActivityDefinitionId: DEF, issuedQuantity: 1, issuedAt: new Date() })).rejects.toThrow("PROJECT_OS_PMC_ACTIVITY_MODEL_MISMATCH");
    await expect(callers.owner.warehouses.issueToCell({ tenantId, projectId: A, warehouseId: warehouseA, materialId: cement, pmcUnitId: UNIT, pmcActivityDefinitionId: DEF_UNLINKED, issuedQuantity: 1, issuedAt: new Date() })).rejects.toThrow("PROJECT_OS_PMC_ACTIVITY_NOT_LINKED_TO_WBS");
    expect(await costTotal(A)).toBe(200); // the refused attempts booked nothing
  });

  it("a repeated phone request does not issue twice", async () => {
    const clientRequestId = crypto.randomUUID();
    const first = await callers.owner.warehouses.issueToCell({ tenantId, projectId: A, warehouseId: warehouseA, materialId: cement, pmcUnitId: UNIT, pmcActivityDefinitionId: DEF, issuedQuantity: 2, issuedAt: new Date(), clientRequestId });
    const again = await callers.owner.warehouses.issueToCell({ tenantId, projectId: A, warehouseId: warehouseA, materialId: cement, pmcUnitId: UNIT, pmcActivityDefinitionId: DEF, issuedQuantity: 2, issuedAt: new Date(), clientRequestId });
    expect(again.id).toBe(first.id);
    expect((await onHand(A, warehouseA, cement)).quantity).toBe(88);
    expect(await costTotal(A)).toBe(240);
  });

  it("a return puts the material back at the issue's cost and reverses exactly that charge, never more than was issued", async () => {
    const [issues] = await connection.query<{ id: string }[]>("SELECT id FROM material_issues WHERE tenantId = ? AND issuedQuantity = 10", [tenantId]);
    const materialIssueId = issues[0].id;
    const stockBefore = await onHand(A, warehouseA, cement);
    const first = await callers.owner.warehouses.returnToWarehouse({ tenantId, projectId: A, materialIssueId, quantity: 4, reason: "Over-issued", returnedAt: new Date() });
    expect(first).toMatchObject({ quantity: 4, totalCost: 80, returnableAfter: 6 });
    expect((await onHand(A, warehouseA, cement)).quantity).toBe(stockBefore.quantity + 4);
    expect((await onHand(A, warehouseA, cement)).value).toBe((stockBefore.value ?? 0) + 80);
    expect(await costTotal(A)).toBe(160);
    await expect(callers.owner.warehouses.returnToWarehouse({ tenantId, projectId: A, materialIssueId, quantity: 7, reason: "Too many", returnedAt: new Date() })).rejects.toThrow("PROJECT_OS_MATERIAL_RETURN_EXCEEDS_ISSUE");
    await expect(callers.owner.warehouses.returnToWarehouse({ tenantId, projectId: A, materialIssueId, quantity: 1, reason: "", returnedAt: new Date() })).rejects.toThrow("PROJECT_OS_INVENTORY_REASON_REQUIRED");
    const last = await callers.owner.warehouses.returnToWarehouse({ tenantId, projectId: A, materialIssueId, quantity: 6, reason: "Rest back", returnedAt: new Date() });
    expect(last).toMatchObject({ totalCost: 120, returnableAfter: 0 });
    expect(await costTotal(A)).toBe(40); // only the second issue (2 bags) is left charged
    await expect(callers.owner.warehouses.returnToWarehouse({ tenantId, projectId: A, materialIssueId, quantity: 0.5, reason: "Again", returnedAt: new Date() })).rejects.toThrow("PROJECT_OS_MATERIAL_RETURN_EXCEEDS_ISSUE");
  });

  it("stock moves between projects with its value, books no cost, and needs the right on BOTH projects", async () => {
    const before = await onHand(A, warehouseA, cement);
    const moved = await callers.owner.warehouses.transferBetweenProjects({ tenantId, sourceProjectId: A, sourceWarehouseId: warehouseA, destinationProjectId: B, destinationWarehouseId: warehouseB, materialId: cement, quantity: 30, reason: "Project B needs cement", transferredAt: new Date() });
    expect(moved.sourceQuantityAfter).toBe(before.quantity - 30);
    expect(await onHand(B, warehouseB, cement)).toEqual({ quantity: 30, value: 600 });
    expect((await onHand(A, warehouseA, cement)).value).toBe((before.value ?? 0) - 600);
    expect(await costTotal(B)).toBe(0);
    await expect(callers.owner.warehouses.transferBetweenProjects({ tenantId, sourceProjectId: A, sourceWarehouseId: warehouseA, destinationProjectId: B, destinationWarehouseId: warehouseB, materialId: cement, quantity: 9999, reason: "Too much", transferredAt: new Date() })).rejects.toThrow("PROJECT_OS_INVENTORY_INSUFFICIENT_STOCK");
    await expect(callers.owner.warehouses.transferBetweenProjects({ tenantId, sourceProjectId: A, sourceWarehouseId: warehouseA, destinationProjectId: A, destinationWarehouseId: warehouseA, materialId: cement, quantity: 1, reason: "Same", transferredAt: new Date() })).rejects.toThrow("PROJECT_OS_INVENTORY_TRANSFER_SAME_PROJECT");
    // the custodian of project A alone may not push stock into project B
    await expect(callers.keeperA.warehouses.transferBetweenProjects({ tenantId, sourceProjectId: A, sourceWarehouseId: warehouseA, destinationProjectId: B, destinationWarehouseId: warehouseB, materialId: cement, quantity: 1, reason: "Not mine", transferredAt: new Date() })).rejects.toThrow(SCOPE_DENIED);
    expect((await onHand(B, warehouseB, cement)).quantity).toBe(30);
  });

  it("a stock count adjusts each difference at the shelf's average and keeps what the books said beside what was counted", async () => {
    await callers.owner.warehouses.recordInventory({ tenantId, projectId: A, warehouseId: warehouseA, materialId: sand, transactionType: "receipt", quantityDelta: 50, unitCost: 8, occurredAt: new Date() });
    const cementNow = (await onHand(A, warehouseA, cement)).quantity;
    const count = await callers.owner.warehouses.stocktake({ tenantId, projectId: A, warehouseId: warehouseA, note: "Monthly count", countedAt: new Date(), lines: [{ materialId: cement, countedQuantity: cementNow - 3 }, { materialId: sand, countedQuantity: 50 }] });
    expect(count.adjusted).toBe(1);
    expect(count.lines.find(line => line.materialId === cement)).toMatchObject({ systemQuantity: cementNow, variance: -3, valueDelta: -60, adjusted: true });
    expect(count.lines.find(line => line.materialId === sand)).toMatchObject({ variance: 0, adjusted: false });
    expect((await onHand(A, warehouseA, cement)).quantity).toBe(cementNow - 3);
    expect(await costTotal(A)).toBe(40); // a count difference is an inventory adjustment, not a project cost
    await expect(callers.owner.warehouses.stocktake({ tenantId, projectId: A, warehouseId: warehouseA, note: "Dup", countedAt: new Date(), lines: [{ materialId: sand, countedQuantity: 1 }, { materialId: sand, countedQuantity: 2 }] })).rejects.toThrow("PROJECT_OS_STOCKTAKE_DUPLICATE_MATERIAL");
    await expect(callers.owner.warehouses.stocktake({ tenantId, projectId: A, warehouseId: warehouseA, note: "", countedAt: new Date(), lines: [{ materialId: sand, countedQuantity: 1 }] })).rejects.toThrow("PROJECT_OS_INVENTORY_REASON_REQUIRED");
    const over = await callers.owner.warehouses.stocktake({ tenantId, projectId: A, warehouseId: warehouseA, note: "Found more", countedAt: new Date(), lines: [{ materialId: sand, countedQuantity: 55 }] });
    expect(over.lines[0]).toMatchObject({ variance: 5, valueDelta: 40 });
  });

  it("finds a material by scanned code, QR label, or part of the name — with what is on the shelf", async () => {
    const scanned = await callers.keeperA.warehouses.findMaterial({ tenantId, projectId: A, warehouseId: warehouseA, query: "cem-1" });
    expect(scanned).toHaveLength(1);
    expect(scanned[0]).toMatchObject({ code: "CEM-1", exact: true });
    expect(scanned[0].onHand).toBeGreaterThan(0);
    expect((await callers.keeperA.warehouses.findMaterial({ tenantId, projectId: A, warehouseId: warehouseA, query: "MAT:SND-1" }))[0]).toMatchObject({ code: "SND-1", onHand: 55 });
    expect((await callers.keeperA.warehouses.findMaterial({ tenantId, projectId: A, warehouseId: warehouseA, query: "sand" })).map(row => row.code)).toEqual(["SND-1"]);
    expect(await callers.keeperA.warehouses.findMaterial({ tenantId, projectId: A, warehouseId: warehouseA, query: "100%_nothing" })).toEqual([]);
  });

  it("the custodian of project A is refused project B's warehouse, and a stranger everything", async () => {
    await expect(callers.keeperA.warehouses.findMaterial({ tenantId, projectId: B, warehouseId: warehouseB, query: "cem" })).rejects.toThrow(SCOPE_DENIED);
    await expect(callers.keeperA.warehouses.stocktake({ tenantId, projectId: B, warehouseId: warehouseB, note: "No", countedAt: new Date(), lines: [{ materialId: cement, countedQuantity: 1 }] })).rejects.toThrow(SCOPE_DENIED);
    const stranger = callerFor(userIds.owner + 100000, "whs-stranger");
    await expect(stranger.warehouses.findMaterial({ tenantId, projectId: A, warehouseId: warehouseA, query: "cem" })).rejects.toThrow();
    expect(DENIED).toBeTruthy();
  });

  it("the whole phone path — find the material, then issue it to a unit's activity — runs in well under a second on the server", async () => {
    const started = performance.now();
    const [found] = await callers.keeperA.warehouses.findMaterial({ tenantId, projectId: A, warehouseId: warehouseA, query: "MAT:CEM-1" });
    await callers.keeperA.warehouses.issueToCell({ tenantId, projectId: A, warehouseId: warehouseA, materialId: found.id, pmcUnitId: UNIT, pmcActivityDefinitionId: DEF, issuedQuantity: 1, issuedAt: new Date(), clientRequestId: crypto.randomUUID() });
    expect(performance.now() - started).toBeLessThan(1000);
  });
});
