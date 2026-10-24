import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import { OdooClient } from "./integrations/connectors/odoo";
import { runIntegrationDailyWork } from "./integrations/daily";
import { liveEvm, loadProfitabilityRows, DEFAULT_EAC_METHOD } from "./profitability";
import { getDb } from "./db";
import { withSystemContext } from "./_core/database";

// Work order 12, item 10: the Odoo connector against a REAL Odoo Community (started by .github/workflows/odoo.yml, or locally with docker), both directions.
// Skipped unless ODOO_URL names one. Synthetic data only; the Odoo credentials are the throw-away ones of the CI container.
process.env.INTEGRATION_SECRET_KEY = "test-only-integration-secret-0123456789"; // secret-scan:allow a test-only value, never a real key
process.env.INTEGRATION_ALLOW_PRIVATE_WEBHOOKS = "1"; // Odoo listens on 127.0.0.1 in CI
const ODOO = { url: process.env.ODOO_URL ?? "", db: process.env.ODOO_DB ?? "odoo_ci", login: process.env.ODOO_LOGIN ?? "admin", password: process.env.ODOO_PASSWORD ?? "" };
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@odoo.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} }, res: {} } as unknown as TrpcContext);
const run = crypto.randomUUID().slice(0, 6);
const KEYS = ["owner", "other"] as const;
const id = (n: number) => `f8000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const P = id(1); const WBS = id(2);

let connection: fixtureDb.Connection; let odoo: OdooClient;
let tenantId = ""; let otherTenant = ""; let connectionId = "";
const userIds: Record<string, number> = {}; const callers: Record<string, ReturnType<typeof callerFor>> = {};
const odooIds: { analytic?: number; partner?: number; product?: number; expense?: number } = {};

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug IN (?, ?)", [`odoo-a-${run}`, `odoo-b-${run}`]);
  for (const { id: company } of companies) {
    for (const table of ["integration_sync_items", "integration_inbound_records", "integration_sync_runs", "integration_mappings", "integration_connections", "api_keys", "cost_entries", "purchase_orders", "suppliers", "progress_entries", "activities", "budget_lines", "wbs_items", "audit_logs", "membership_invitations"]) {
      await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [company]);
    }
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [company]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [company]);
    for (const table of ["roles", "memberships", "tenant_entitlements", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [company]);
    await connection.query("DELETE FROM companies WHERE id = ?", [company]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'odo-%'");
}
const byEntity = (result: Awaited<ReturnType<typeof callers.owner.integrations.runConnection>>) => Object.fromEntries(result.pulled.map(item => [item.entity, item]));

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL) || !ODOO.url)("the Odoo connector against a real Odoo, both directions", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    odoo = new OdooClient({ baseUrl: ODOO.url, database: ODOO.db, login: ODOO.login, secret: ODOO.password });
    // One-time preparation of the throw-away Odoo: riyals as the company currency and the analytic-accounting group for the admin (both idempotent).
    const [sar] = await odoo.searchRead<{ id: number }>("res.currency", [["name", "=", "SAR"], ["active", "in", [true, false]]], ["id"]);
    await odoo.write("res.currency", [sar.id], { active: true });
    await odoo.write("res.company", [1], { currency_id: sar.id });
    const [group] = await odoo.searchRead<{ res_id: number }>("ir.model.data", [["module", "=", "analytic"], ["name", "=", "group_analytic_accounting"]], ["res_id"]);
    await odoo.call("res.users", "write", [[2], { groups_id: [[4, group.res_id]] }]);
    // The Odoo side of the story, with names made unique per run so a second run on the same Odoo does not collide.
    odooIds.analytic = await odoo.create("account.analytic.account", { name: `PRJ-ODOO ${run}`, plan_id: 1 });
    odooIds.partner = await odoo.create("res.partner", { name: `Odoo Cement ${run}`, ref: `OD-CEM-${run}`, supplier_rank: 1, email: `sales-${run}@odoo-cement.example.test` });
    odooIds.product = await odoo.create("product.product", { name: `Cement bag ${run}`, purchase_ok: true });
    await odoo.create("purchase.order", { partner_id: odooIds.partner, date_order: "2026-10-02 08:00:00", order_line: [[0, 0, { name: "Cement", product_id: odooIds.product, product_qty: 10, price_unit: 480, analytic_distribution: { [odooIds.analytic]: 100 } }]] });
    const [expense] = await odoo.searchRead<{ id: number }>("account.account", [["code", "=", "600000"]], ["id"]);
    odooIds.expense = expense.id;
    await odoo.create("account.analytic.line", { name: `Cement delivered ${run}`, account_id: odooIds.analytic, amount: -4800, date: "2026-10-05", general_account_id: expense.id });
    await odoo.create("account.move", { move_type: "in_invoice", partner_id: odooIds.partner, invoice_date: "2026-10-06", invoice_line_ids: [[0, 0, { name: "Cement", quantity: 10, price_unit: 480 }]] });
    await odoo.create("account.payment", { payment_type: "outbound", partner_type: "supplier", partner_id: odooIds.partner, amount: 4800, date: "2026-10-07" });

    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`odo-${key}`, `Odoo ${key}`, `odo-${key}@odoo.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'odo-%'");
    for (const key of KEYS) { userIds[key] = rows.find(row => row.openId === `odo-${key}`)!.id; callers[key] = callerFor(userIds[key], `odo-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Odoo Co. A", slug: `odoo-a-${run}`, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: otherTenant } = await callers.other.tenant.create({ legalName: "Odoo Co. B", slug: `odoo-b-${run}`, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'PRJ-1', 'Villas', 'villas', 'SAR', 'active')", [P, tenantId]);
    await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name, plannedValue) VALUES (?, ?, ?, '1.1', 'Masonry', 100000)", [WBS, tenantId, P]);
    await connection.query("INSERT INTO budget_lines (id, tenantId, projectId, wbsItemId, costCode, originalAmount, currentAmount) VALUES (gen_random_uuid(), ?, ?, ?, 'MAS', 100000, 100000)", [tenantId, P, WBS]);
    await connection.query("INSERT INTO activities (id, tenantId, projectId, wbsItemId, code, name, status, plannedValue, plannedStartAt, plannedFinishAt) VALUES (gen_random_uuid(), ?, ?, ?, 'A-1', 'Masonry work', 'in_progress', 100000, ?, ?)", [tenantId, P, WBS, new Date("2026-01-01"), new Date("2026-12-31")]);
    await connection.query("INSERT INTO progress_entries (id, tenantId, projectId, wbsItemId, progressPercent, status, measuredAt) VALUES (gen_random_uuid(), ?, ?, ?, 40, 'submitted', ?)", [tenantId, P, WBS, new Date("2026-10-01")]);
  }, 300_000);
  afterAll(async () => { await clear(); await connection.end(); });

  it("a connection keeps its password sealed, shows no secret, can be tested, and is the company manager's alone", async () => {
    const created = await callers.owner.integrations.createConnection({ tenantId, system: "odoo", name: `Odoo ${run}`, baseUrl: ODOO.url, database: ODOO.db, username: ODOO.login, secret: ODOO.password, settings: { analyticProjectMap: { [String(odooIds.analytic)]: "PRJ-1" } }, scheduledDaily: false });
    connectionId = created.id;
    const [stored] = await connection.query<{ secretSealed: string }[]>("SELECT secretSealed FROM integration_connections WHERE id = ?", [connectionId]);
    expect(stored[0].secretSealed.startsWith("v1:")).toBe(true); expect(stored[0].secretSealed).not.toContain(ODOO.password);
    const listed = await callers.owner.integrations.listConnections({ tenantId });
    expect(JSON.stringify(listed)).not.toContain("secret"); expect(listed[0].connector).toMatchObject({ status: "PROVEN_IN_CI" });
    expect(await callers.owner.integrations.testConnection({ tenantId, connectionId })).toMatchObject({ ok: true });
    const wrong = await callers.owner.integrations.createConnection({ tenantId, system: "odoo", name: `Odoo wrong ${run}`, baseUrl: ODOO.url, database: ODOO.db, username: ODOO.login, secret: "not-the-password" });
    expect(await callers.owner.integrations.testConnection({ tenantId, connectionId: wrong.id })).toMatchObject({ ok: false, reason: "ODOO_AUTH_FAILED" });
    await expect(callers.other.integrations.runConnection({ tenantId, connectionId, direction: "in" })).rejects.toThrow();
    await expect(callers.other.integrations.runConnection({ tenantId: otherTenant, connectionId, direction: "in" })).rejects.toThrow("PROJECT_OS_CONNECTION_NOT_FOUND");
    await expect(callers.owner.integrations.createConnection({ tenantId, system: "nonesuch", name: "xx", baseUrl: ODOO.url, secret: "x" })).rejects.toThrow("PROJECT_OS_CONNECTION_SYSTEM_UNSUPPORTED");
  });

  it("pull: Odoo's suppliers, purchase orders, costs, bills and payments become the platform's records, under the platform's own rules", async () => {
    // the cost account's code means a WBS item here: the company says so once, in the mapping
    await callers.owner.integrations.saveMappings({ tenantId, system: "odoo", type: "cost_code", records: [{ externalId: "600000", ref: "1.1", project: "PRJ-1" }] });
    const first = await callers.owner.integrations.runConnection({ tenantId, connectionId, direction: "in" });
    const entities = byEntity(first);
    expect(entities.suppliers.accepted).toBeGreaterThanOrEqual(1);
    expect(entities["purchase-orders"]).toMatchObject({ rejected: 0 });
    expect(entities["actual-costs"]).toMatchObject({ rejected: 0 });
    expect(entities.invoices.accepted).toBeGreaterThanOrEqual(1); expect(entities.payments.accepted).toBeGreaterThanOrEqual(1);
    const [suppliers] = await connection.query<{ code: string; legalName: string }[]>("SELECT code, legalName FROM suppliers WHERE tenantId = ? AND code = ?", [tenantId, `OD-CEM-${run}`]);
    expect(suppliers).toEqual([{ code: `OD-CEM-${run}`, legalName: `Odoo Cement ${run}` }]);
    const [orders] = await connection.query<{ status: string; amount: string; currency: string; supplierName: string }[]>("SELECT status, amount, currency, supplierName FROM purchase_orders WHERE tenantId = ?", [tenantId]);
    expect(orders).toHaveLength(1); expect(orders[0]).toMatchObject({ status: "draft", currency: "SAR", supplierName: `Odoo Cement ${run}` }); expect(Number(orders[0].amount)).toBe(5520); // 10 x 480 plus Odoo's 15% tax
    const [costs] = await connection.query<{ amount: string; status: string; wbsItemId: string }[]>("SELECT amount, status, wbsItemId FROM cost_entries WHERE tenantId = ? AND sourceType = 'erp'", [tenantId]);
    expect(costs).toHaveLength(1); expect(costs[0]).toMatchObject({ status: "posted", wbsItemId: WBS }); expect(Number(costs[0].amount)).toBe(4800);
    const [kept] = await connection.query<{ entityType: string }[]>("SELECT entityType FROM integration_inbound_records WHERE tenantId = ? ORDER BY entityType", [tenantId]);
    expect([...new Set(kept.map(row => row.entityType))]).toEqual(["invoice", "payment"]); // Odoo may hold more than one bill and payment
  });

  it("a second pull of the same Odoo changes nothing; a change in Odoo arrives as an update, a new order as a new draft", async () => {
    const second = await callers.owner.integrations.runConnection({ tenantId, connectionId, direction: "in" });
    for (const item of second.pulled) {
      const items = await callers.owner.integrations.syncItems({ tenantId, runId: item.runId });
      expect(items.every(row => row.outcome === "unchanged"), `${item.entity}: ${JSON.stringify(items.map(row => row.outcome))}`).toBe(true);
    }
    await odoo.write("res.partner", [odooIds.partner!], { name: `Odoo Cement Co ${run}` });
    await odoo.create("purchase.order", { partner_id: odooIds.partner, date_order: "2026-10-09 08:00:00", order_line: [[0, 0, { name: "Sand", product_id: odooIds.product, product_qty: 2, price_unit: 100, analytic_distribution: { [odooIds.analytic!]: 100 } }]] });
    const third = await callers.owner.integrations.runConnection({ tenantId, connectionId, direction: "in" });
    const supplierItems = await callers.owner.integrations.syncItems({ tenantId, runId: byEntity(third).suppliers.runId });
    expect(supplierItems.filter(row => row.outcome === "updated").map(row => row.externalId)).toContain(String(odooIds.partner));
    const orderItems = await callers.owner.integrations.syncItems({ tenantId, runId: byEntity(third)["purchase-orders"].runId });
    expect(orderItems.filter(row => row.outcome === "created")).toHaveLength(1);
    const [orders] = await connection.query<{ n: string }[]>("SELECT COUNT(*) n FROM purchase_orders WHERE tenantId = ?", [tenantId]);
    expect(Number(orders[0].n)).toBe(2);
  });

  it("an order the platform has approved is not changed by Odoo; what cannot be placed is reported with the reason", async () => {
    await connection.query("UPDATE purchase_orders SET status = 'approved' WHERE tenantId = ?", [tenantId]);
    await odoo.call("purchase.order", "write", [(await odoo.searchRead<{ id: number }>("purchase.order", [["partner_id", "=", odooIds.partner]], ["id"], { order: "id", limit: 1 })).map(row => row.id), { partner_ref: `touched ${run}` }]);
    const unmapped = await callers.owner.integrations.createConnection({ tenantId, system: "odoo", name: `Odoo no map ${run}`, baseUrl: ODOO.url, database: ODOO.db, username: ODOO.login, secret: ODOO.password, settings: {} });
    const result = await callers.owner.integrations.runConnection({ tenantId, connectionId: unmapped.id, direction: "in" });
    expect(result.skipped.some(item => item.entity === "purchase-orders" && item.reason === "PROJECT_NOT_MAPPED")).toBe(true);
    expect(result.skipped.some(item => item.entity === "actual-costs" && item.reason === "PROJECT_NOT_MAPPED")).toBe(true);
    const [orders] = await connection.query<{ status: string }[]>("SELECT status FROM purchase_orders WHERE tenantId = ?", [tenantId]);
    expect(orders.every(order => order.status === "approved")).toBe(true);
  });

  it("push: the platform's projects, suppliers and progress are written to Odoo; a second push changes nothing", async () => {
    await connection.query("INSERT INTO suppliers (id, tenantId, code, legalName, contactEmail, active, createdByUserId) VALUES (gen_random_uuid(), ?, ?, ?, ?, true, ?)", [tenantId, `PLAT-${run}`, `Platform Steel ${run}`, `steel-${run}@platform.example.test`, userIds.owner]);
    const first = await callers.owner.integrations.runConnection({ tenantId, connectionId, direction: "out" });
    expect(first.pushed).toMatchObject({ rejected: 0 });
    const pushedItems = await callers.owner.integrations.syncItems({ tenantId, runId: first.pushed!.runId });
    expect(pushedItems.map(item => item.entityType).sort(), JSON.stringify(pushedItems)).toEqual(["progress", "project", "supplier"]); // only the platform's own supplier goes out; Odoo's own are not written back
    const projects = await odoo.searchRead<{ id: number; name: string }>("project.project", [["name", "=", "PRJ-1 — Villas"]], ["name"]);
    expect(projects).toHaveLength(1);
    const partners = await odoo.searchRead<{ name: string; ref: string; email: string; supplier_rank: number }>("res.partner", [["ref", "=", `PLAT-${run}`]], ["name", "ref", "email", "supplier_rank"]);
    expect(partners).toHaveLength(1); expect(partners[0]).toMatchObject({ name: `Platform Steel ${run}`, email: `steel-${run}@platform.example.test` }); expect(partners[0].supplier_rank).toBeGreaterThan(0);
    const db = (await getDb())!;
    const evm = await withSystemContext("test", async () => liveEvm(await loadProfitabilityRows(db, { tenantId, projectId: P }), new Date(), DEFAULT_EAC_METHOD));
    expect("error" in evm).toBe(false);
    const expected = Math.round(((evm as { ev: number; bac: number }).ev / (evm as { ev: number; bac: number }).bac) * 100);
    // an Odoo that earlier runs already pushed to holds their updates too: this run added exactly one, with this project's progress
    const updates = await odoo.searchRead<{ id: number; progress: number }>("project.update", [["project_id", "=", projects[0].id]], ["progress"], { order: "id desc" });
    expect(updates[0].progress).toBe(expected); const updateCount = updates.length;
    const again = await callers.owner.integrations.runConnection({ tenantId, connectionId, direction: "out" });
    expect(again.pushed).toMatchObject({ created: 0, updated: 0, rejected: 0 }); expect(again.pushed!.unchanged).toBeGreaterThanOrEqual(3);
    expect(await odoo.searchRead("project.project", [["name", "=", "PRJ-1 — Villas"]], ["id"])).toHaveLength(1);
    expect(await odoo.searchRead("project.update", [["project_id", "=", projects[0].id]], ["id"])).toHaveLength(updateCount);
  });

  it("the daily job runs the connections set to run daily, and one that fails does not stop the others", async () => {
    await callers.owner.integrations.setConnectionActive({ tenantId, connectionId, active: true, scheduledDaily: true });
    const broken = await callers.owner.integrations.createConnection({ tenantId, system: "odoo", name: `Odoo broken ${run}`, baseUrl: ODOO.url, database: ODOO.db, username: ODOO.login, secret: "wrong-password", scheduledDaily: true });
    expect(broken.id).toBeTruthy();
    const summary = await runIntegrationDailyWork();
    expect(summary.connections.ran).toBeGreaterThanOrEqual(1);
    expect(summary.connections.failed).toBeGreaterThanOrEqual(1);
    const [row] = await connection.query<{ lastRunAt: string | null }[]>("SELECT lastRunAt FROM integration_connections WHERE id = ?", [connectionId]);
    expect(row[0].lastRunAt).not.toBeNull();
  });
});
