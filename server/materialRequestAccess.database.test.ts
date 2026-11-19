import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-32 (P0-03): the material request (MR) is read by the people who work it, on their own project. Before this fix the register, the material list and
// the warehouse list asked for project.read alone, which the project manager, the procurement officer and the warehouse keeper templates do not carry
// (Q-17 205-3 kept it from the warehouse role): the project manager could create a request he could not see, the procurement officer could approve
// requests he could not list, and the keeper could not open his warehouses. Now each read accepts the power that already writes it — nobody gains
// project.read. On a real database, through the real router, as the restricted application role. Synthetic data only.
const SLUG = "q32-mr";
const SLUG_B = "q32-mr-b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const KEYS = ["owner", "pm", "proc", "keeper", "accountant", "pmElsewhere", "ownerB", "site"] as const;
type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callerFor = (key: Key) => appRouter.createCaller({ user: { id: ids[key], openId: `q32m-${key}`, name: `Q32 ${key}`, email: `q32m-${key}@q32.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const P = "32bb0000-0000-4000-8000-000000000001";
const P2 = "32bb0000-0000-4000-8000-000000000002";
const PB = "32cc0000-0000-4000-8000-000000000001";
let connection: fixtureDb.Connection; let tenantId = ""; let tenantB = ""; let materialId = "";

async function clear() {
  for (const slug of [SLUG, SLUG_B]) {
    const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [slug]);
    for (const { id } of companies) {
      for (const table of ["audit_logs", "material_returns", "material_issues", "cost_entries", "warehouse_inventory_transactions", "procurement_requisitions", "material_masters", "project_warehouses", "wbs_items"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE FROM membership_roles WHERE membershipId IN (SELECT id FROM memberships WHERE tenantId = ?)", [id]);
      await connection.query("DELETE FROM role_permissions WHERE roleId IN (SELECT id FROM roles WHERE tenantId = ?)", [id]);
      for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE FROM companies WHERE id = ?", [id]);
    }
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q32m-%'");
}
const templateRole = async (roleCode: string) => (await connection.query<{ id: string }[]>("SELECT id FROM roles WHERE tenantId = ? AND code = ?", [tenantId, roleCode]))[0][0]!.id;
const scope = () => ({ tenantId, projectId: P });

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-32 (P0-03): the material request opens for the people who work it", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q32m-${key}`, `Q32 ${key}`, `q32m-${key}@q32.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q32m-%'");
    for (const key of KEYS) ids[key] = rows.find(row => row.openId === `q32m-${key}`)!.id;
    ({ tenantId } = await callerFor("owner").tenant.create({ legalName: "Q32 MR Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: tenantB } = await callerFor("ownerB").tenant.create({ legalName: "Q32 MR Other Co.", slug: SLUG_B, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q32-1', 'MR one', 'villas', 'SAR', 'active'), (?, ?, 'Q32-2', 'MR two', 'villas', 'SAR', 'active'), (?, ?, 'Q32-B', 'Other company', 'villas', 'SAR', 'active')", [P, tenantId, P2, tenantId, PB, tenantB]);
    const owner = callerFor("owner");
    for (const [key, roleCode, project] of [["pm", "PROJECT_MANAGER", P], ["proc", "PROCUREMENT_OFFICER", P], ["keeper", "WAREHOUSE_CUSTODIAN", P], ["accountant", "ACCOUNTANT", P], ["pmElsewhere", "PROJECT_MANAGER", P2], ["site", "SITE_ENGINEER", P]] as const) await owner.tenant.assignMember({ tenantId, targetUserId: ids[key], roleId: await templateRole(roleCode), scopeType: "project", scopeId: project });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
    ({ id: materialId } = await owner.materials.createMaster({ tenantId, code: "Q32-CEM", description: "Synthetic cement bag", unitOfMeasure: "bag", category: "Concrete" }));
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("POSITIVE: the project manager creates a request and sees it in the register", async () => {
    const pm = callerFor("pm");
    expect((await pm.materials.list(scope())).map(item => item.code)).toContain("Q32-CEM");
    await pm.procurement.createRequisition({ ...scope(), requisitionNumber: "MR-Q32-1", materialId, description: "Cement for the first slab", requestedQuantity: 40, unitOfMeasure: "bag", requiredAt: new Date("2026-12-01T00:00:00Z") });
    expect((await pm.procurement.register(scope())).requisitions.map(item => [item.requisitionNumber, item.status])).toEqual([["MR-Q32-1", "draft"]]);
  });

  it("POSITIVE: the procurement officer lists the request and moves it to approved; the warehouse keeper then sees it and his warehouses", async () => {
    const proc = callerFor("proc");
    const [request] = (await proc.procurement.register(scope())).requisitions;
    await proc.procurement.transitionRequisition({ ...scope(), requisitionId: request.id, nextStatus: "submitted" });
    await proc.procurement.transitionRequisition({ ...scope(), requisitionId: request.id, nextStatus: "approved" });
    const keeper = callerFor("keeper");
    expect((await keeper.procurement.register(scope())).requisitions.map(item => [item.requisitionNumber, item.status, item.remainingQuantity])).toEqual([["MR-Q32-1", "approved", 40]]);
    expect(await code(keeper.warehouses.list(scope()))).toBe("no error");
  });

  it("NEGATIVE: what each role does not do stays refused — the keeper does not request, the procurement officer does not list warehouses, the accountant reads none of it", async () => {
    expect(await code(callerFor("keeper").procurement.createRequisition({ ...scope(), requisitionNumber: "MR-Q32-K", materialId, description: "Not the keeper's to ask", requestedQuantity: 1, unitOfMeasure: "bag", requiredAt: new Date("2026-12-01T00:00:00Z") }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callerFor("proc").warehouses.list(scope()))).toBe("PROJECT_OS_PERMISSION_DENIED");
    for (const read of [(c: ReturnType<typeof callerFor>) => c.procurement.register(scope()), (c: ReturnType<typeof callerFor>) => c.materials.list(scope()), (c: ReturnType<typeof callerFor>) => c.warehouses.list(scope())]) expect(await code(read(callerFor("accountant")))).toBe("PROJECT_OS_PERMISSION_DENIED");
    // and nobody gained project.read through THIS change: the warehouse keeper still does not open the controls page. (The project manager does since
    // Q-33, adviser 18-11 option (a): its template carries project.read — server/pmProjectRead.database.test.ts — which is not this change's doing.)
    expect(await code(callerFor("keeper").projects.getControls(scope()))).toBe("PROJECT_OS_PERMISSION_DENIED");
  });

  // Adviser 18-11 (Q-32): the warehouse keeper sees quantities, not value; the value is for the project-money readers (205-1).
  it("MONEY: the keeper reads quantities with no value, and his issue returns no cost; the owner reads the value; the site engineer's issue list carries no average cost", async () => {
    const owner = callerFor("owner");
    const { id: warehouseId } = await owner.warehouses.create({ ...scope(), code: "Q32-WH", name: "Synthetic main store" });
    await owner.warehouses.recordInventory({ ...scope(), warehouseId, materialId, transactionType: "receipt", quantityDelta: 100, unitCost: 25, referenceNumber: "GRN-Q32-1", note: "Opening receipt", occurredAt: new Date("2026-11-01T00:00:00Z") });
    const { id: wbsItemId } = await owner.wbs.create({ ...scope(), code: "Q32-W1", name: "Synthetic slab works" });
    const keeper = callerFor("keeper");
    const keeperView = await keeper.warehouses.list(scope());
    expect(keeperView.moneyVisible).toBe(false);
    expect(keeperView.balances.map(item => [item.quantityOnHand, item.stockValue, item.averageCost, item.priced])).toEqual([["100.000", null, null, true]]);
    expect(keeperView.transactions.every(item => item.unitCost === null && item.valueDelta === null)).toBe(true);
    const level = await keeper.scopes.warehouse({ ...scope(), warehouseId });
    expect([level.moneyVisible, level.totals.stockValue, level.stock.map(line => [line.quantity, line.value])]).toEqual([false, null, [[100, null]]]);
    expect(level.recentMovements.every(item => item.valueDelta === null)).toBe(true);
    // the keeper still issues priced stock at its average without seeing it, and the result names no cost
    const issued = await keeper.warehouses.issueToWork({ ...scope(), warehouseId, materialId, wbsItemId, issuedQuantity: 10, issuedAt: new Date("2026-11-02T00:00:00Z") });
    expect([issued.totalCost, issued.unitCost, issued.nextQuantity]).toEqual([null, null, 90]);
    const ownerView = await owner.warehouses.list(scope());
    expect(ownerView.moneyVisible).toBe(true);
    expect(ownerView.balances.map(item => [item.quantityOnHand, item.stockValue, item.averageCost])).toEqual([["90.000", "2250.00", "25.0000"]]);
    expect((await owner.scopes.warehouse({ ...scope(), warehouseId })).totals.stockValue).toBe(2250);
    const site = (await callerFor("site").fieldEntry.context(scope())).materials.find(item => item.id === materialId)!;
    expect([site.lastUnitCost, site.onHand.map(shelf => [shelf.quantity, shelf.averageCost, shelf.priced])]).toEqual([null, [[90, null, true]]]);
    // reviewer A (sibling paths): a return gives the cost back to the money readers only; the quick count is stopped (Q-41) and would mask its value too
    const [issueRow] = await keeper.warehouses.returnableIssues(scope());
    const keeperReturn = await keeper.warehouses.returnToWarehouse({ ...scope(), materialIssueId: issueRow.id, quantity: 2, reason: "Synthetic surplus back to the shelf", returnedAt: new Date("2026-11-03T00:00:00Z") });
    expect([keeperReturn.quantity, keeperReturn.totalCost, keeperReturn.returnableAfter]).toEqual([2, null, 8]);
    const ownerReturn = await owner.warehouses.returnToWarehouse({ ...scope(), materialIssueId: issueRow.id, quantity: 3, reason: "Synthetic surplus back to the shelf", returnedAt: new Date("2026-11-03T00:00:00Z") });
    expect([ownerReturn.totalCost, ownerReturn.returnableAfter]).toEqual([75, 5]);
    expect(await code(keeper.warehouses.stocktake({ ...scope(), warehouseId, note: "Synthetic count", countedAt: new Date("2026-11-04T00:00:00Z"), lines: [{ materialId, countedQuantity: 1 }] }))).toBe("PROJECT_OS_STOCKTAKE_QUICK_STOPPED");
  });

  it("SCOPE: the project manager of another project of the same company does not read this project's requests", async () => {
    expect(await code(callerFor("pmElsewhere").procurement.register(scope()))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect((await callerFor("pmElsewhere").procurement.register({ tenantId, projectId: P2 })).requisitions).toEqual([]);
  });

  it("ISOLATION: the roles of one company reach nothing of another", async () => {
    for (const key of ["pm", "proc", "keeper"] as const) expect(await code(callerFor(key).procurement.register({ tenantId: tenantB, projectId: PB }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
  });
});
