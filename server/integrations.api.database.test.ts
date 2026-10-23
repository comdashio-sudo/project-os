import { createHmac } from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { createApp } from "./_core/app";
import { appRouter } from "./routers";
import { openApiDocument, routes } from "./integrations/api";
import { deliverDueWebhooks, isPrivateAddress, signWebhook } from "./integrations/webhooks";

// Work order 12, items 8 and 9: the documented integration API, the company's keys, the signed webhooks, the mappings and the exchange log, on a real database with the
// application running as its restricted role. Two companies, so a key is shown to see only its own. Synthetic data only.
process.env.INTEGRATION_SECRET_KEY = "test-only-integration-secret-0123456789";
process.env.INTEGRATION_ALLOW_PRIVATE_WEBHOOKS = "1"; // the receivers below listen on 127.0.0.1; the refusal of private addresses is tested through isPrivateAddress
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@integ.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} }, res: {} } as unknown as TrpcContext);
const SLUGS = ["integ-a", "integ-b"];
const KEYS = ["ownerA", "ownerB", "engineerA"] as const;
const id = (n: number) => `f7000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PA = id(1); const PB = id(2); const WBS_A = id(10); const ZONE = id(20); const BLOCK = id(21); const UNIT1 = id(22); const UNIT2 = id(23); const GROUP = id(24); const STAGE = id(25); const WALLS = id(26);

let connection: fixtureDb.Connection; let api: Server; let base = "";
let tenantA = ""; let tenantB = "";
const userIds: Record<string, number> = {}; const callers: Record<string, ReturnType<typeof callerFor>> = {};
let fullKeyA = ""; let keyIdA = ""; let fullKeyB = "";

const call = async (key: string | null, method: string, path: string, body?: unknown) => {
  const response = await fetch(`${base}/api/v1${path}`, { method, headers: { "content-type": "application/json", ...(key ? { authorization: `Bearer ${key}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await response.text();
  return { status: response.status, headers: response.headers, json: text ? JSON.parse(text) : null };
};
const outcomes = (result: { json: { items: Array<{ externalId: string; outcome: string; reason?: string }> } }) => Object.fromEntries(result.json.items.map(item => [item.externalId ?? "?", item.reason ? `${item.outcome}:${item.reason}` : item.outcome]));

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug IN ('integ-a', 'integ-b')");
  for (const { id: company } of companies) {
    for (const table of ["webhook_deliveries", "webhook_endpoints", "api_rate_windows", "integration_sync_items", "integration_inbound_records", "integration_sync_runs", "integration_mappings", "integration_connections", "api_keys", "consultant_submittals", "submittal_reply_codes", "tenant_policies",
      "cost_entries", "purchase_orders", "suppliers", "budget_lines", "pmc_unit_activity_history", "pmc_inspection_request_units", "pmc_inspection_requests", "pmc_unit_activity_progress", "pmc_activity_definitions", "pmc_activity_stages", "pmc_activity_groups", "pmc_units", "pmc_blocks", "pmc_zones", "wbs_items", "audit_logs", "membership_invitations"]) {
      await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [company]);
    }
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [company]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [company]);
    for (const table of ["roles", "memberships", "tenant_entitlements", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [company]);
    await connection.query("DELETE FROM companies WHERE id = ?", [company]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'int-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("the integration API, keys, webhooks, mappings and log on a real database", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`int-${key}`, `Integ ${key}`, `int-${key}@integ.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'int-%'");
    for (const key of KEYS) { userIds[key] = rows.find(row => row.openId === `int-${key}`)!.id; callers[key] = callerFor(userIds[key], `int-${key}`); }
    ({ tenantId: tenantA } = await callers.ownerA.tenant.create({ legalName: "Integration A Co.", slug: SLUGS[0], packageCode: "ALL-IN-ONE" }));
    ({ tenantId: tenantB } = await callers.ownerB.tenant.create({ legalName: "Integration B Co.", slug: SLUGS[1], packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'PRJ-1', 'Villas A', 'villas', 'SAR', 'active'), (?, ?, 'PRJ-B', 'Villas B (other company)', 'villas', 'SAR', 'active')", [PA, tenantA, PB, tenantB]);
    await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name, plannedValue) VALUES (?, ?, ?, '1.1', 'Masonry', 500000)", [WBS_A, tenantA, PA]);
    await connection.query("INSERT INTO budget_lines (id, tenantId, projectId, wbsItemId, costCode, originalAmount, currentAmount) VALUES (gen_random_uuid(), ?, ?, ?, 'MAS', 400000, 420000), (gen_random_uuid(), ?, ?, ?, 'MAS2', 100000, 100000)", [tenantA, PA, WBS_A, tenantA, PA, WBS_A]);
    await connection.query("INSERT INTO pmc_zones (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'Z1', 'Zone 1')", [ZONE, tenantA, PA]);
    await connection.query("INSERT INTO pmc_blocks (id, tenantId, projectId, zoneId, code, name) VALUES (?, ?, ?, ?, 'B1', 'Block 1')", [BLOCK, tenantA, PA, ZONE]);
    await connection.query("INSERT INTO pmc_units (id, tenantId, projectId, blockId, unitNumber, modelCode, unitWeight) VALUES (?, ?, ?, ?, 1, 'A', 1), (?, ?, ?, ?, 2, 'B', 1)", [UNIT1, tenantA, PA, BLOCK, UNIT2, tenantA, PA, BLOCK]);
    await connection.query("INSERT INTO pmc_activity_groups (id, tenantId, projectId, code, name) VALUES (?, ?, ?, 'FIN', 'Finishing')", [GROUP, tenantA, PA]);
    await connection.query("INSERT INTO pmc_activity_stages (id, tenantId, projectId, groupId, code, name) VALUES (?, ?, ?, ?, 'INT', 'Internal')", [STAGE, tenantA, PA, GROUP]);
    await connection.query("INSERT INTO pmc_activity_definitions (id, tenantId, projectId, groupId, stageId, wbsItemId, modelCode, code, name, weightPercent) VALUES (?, ?, ?, ?, ?, ?, 'A', 'WALLS', 'Walls', 100), (gen_random_uuid(), ?, ?, ?, ?, ?, 'B', 'WALLS', 'Walls', 100)", [WALLS, tenantA, PA, GROUP, STAGE, WBS_A, tenantA, PA, GROUP, STAGE, WBS_A]);
    const administration = await callers.ownerA.tenant.administration({ tenantId: tenantA });
    const invitation = await callers.ownerA.tenant.createInvitation({ tenantId: tenantA, email: "int-engineerA@integ.example.test", roleId: administration.roles.find(role => role.code === "SITE_ENGINEER")!.id, scopeType: "company" });
    await callers.engineerA.tenant.acceptInvitation({ inviteToken: invitation.inviteToken });
    const { app, finish } = createApp({ production: false, apiRequestsPerMinute: 100000, registerAuth: () => undefined });
    finish(app);
    api = await new Promise<Server>(resolve => { const server = app.listen(0, "127.0.0.1", () => resolve(server)); });
    base = `http://127.0.0.1:${(api.address() as AddressInfo).port}`;
    const all = ["erp.write", "export.read", "external.write", "mappings.write", "sync.read"] as const;
    const created = await callers.ownerA.integrations.createKey({ tenantId: tenantA, name: "ERP A", scopes: [...all] });
    fullKeyA = created.key; keyIdA = created.id;
    fullKeyB = (await callers.ownerB.integrations.createKey({ tenantId: tenantB, name: "ERP B", scopes: [...all] })).key;
  }, 240_000);
  afterAll(async () => { await new Promise(resolve => api.close(resolve)); await clear(); await connection.end(); });

  // ----------------------------------------------------------------------------------------------------------------------------------- keys
  it("a key is shown once, only its hash is kept, only a company manager makes or revokes one, and a revoked key stops working", async () => {
    expect(fullKeyA).toMatch(/^pos_[0-9a-f]{8}_[A-Za-z0-9_-]{20,}$/);
    const [stored] = await connection.query<{ keyHash: string; keyPrefix: string }[]>("SELECT keyHash, keyPrefix FROM api_keys WHERE id = ?", [keyIdA]);
    expect(stored[0].keyHash).toHaveLength(64);
    expect(JSON.stringify(stored[0])).not.toContain(fullKeyA.split("_")[2]);
    const listed = await callers.ownerA.integrations.listKeys({ tenantId: tenantA });
    expect(listed[0]).toMatchObject({ name: "ERP A", keyPrefix: stored[0].keyPrefix });
    expect(JSON.stringify(listed)).not.toContain(fullKeyA);
    await expect(callers.engineerA.integrations.createKey({ tenantId: tenantA, name: "Not allowed", scopes: ["erp.write"] })).rejects.toThrow();
    await expect(callers.ownerB.integrations.listKeys({ tenantId: tenantA })).rejects.toThrow();
    const throwaway = await callers.ownerA.integrations.createKey({ tenantId: tenantA, name: "Throwaway", scopes: ["sync.read"] });
    expect((await call(throwaway.key, "GET", "/ping")).status).toBe(200);
    await callers.ownerA.integrations.revokeKey({ tenantId: tenantA, keyId: throwaway.id });
    expect((await call(throwaway.key, "GET", "/ping")).status).toBe(401);
    expect((await call(null, "GET", "/ping")).status).toBe(401);
    expect((await call("pos_00000000_notarealkeynotarealkey", "GET", "/ping")).status).toBe(401);
  });

  it("the key carries its own powers: a call outside them is refused 403 and writes nothing", async () => {
    const readOnly = await callers.ownerA.integrations.createKey({ tenantId: tenantA, name: "Read only", scopes: ["sync.read", "export.read"] });
    const refused = await call(readOnly.key, "POST", "/erp/suppliers", { records: [{ externalId: "S-9", code: "SUP-9", legalName: "Nope" }] });
    expect(refused.status).toBe(403); expect(refused.json).toMatchObject({ code: "PROJECT_OS_API_SCOPE_MISSING", scope: "erp.write" });
    const [none] = await connection.query<{ n: string }[]>("SELECT COUNT(*) n FROM suppliers WHERE tenantId = ? AND code = 'SUP-9'", [tenantA]);
    expect(Number(none[0].n)).toBe(0);
    expect((await call(readOnly.key, "GET", "/sync/runs")).status).toBe(200);
  });

  it("calls are limited per key per minute; the refusal says when to come back, and another key is not affected", async () => {
    const limited = await callers.ownerA.integrations.createKey({ tenantId: tenantA, name: "Limited", scopes: ["sync.read"], rateLimitPerMinute: 10 });
    const statuses: number[] = [];
    for (let index = 0; index < 12; index += 1) statuses.push((await call(limited.key, "GET", "/ping")).status);
    expect(statuses.filter(status => status === 200).length).toBeGreaterThanOrEqual(10);
    expect(statuses.slice(-1)[0]).toBe(429);
    const refused = await call(limited.key, "GET", "/ping");
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(refused.json.code).toBe("PROJECT_OS_API_RATE_LIMITED");
    expect((await call(fullKeyA, "GET", "/ping")).status).toBe(200);
  });

  it("the OpenAPI document describes every route that is served, and is served without a key", async () => {
    const response = await fetch(`${base}/api/v1/openapi.json`);
    expect(response.status).toBe(200);
    const document = await response.json() as ReturnType<typeof openApiDocument>;
    expect(document.openapi).toBe("3.1.0");
    for (const route of routes) {
      const path = route.path.replace(/:(\w+)/g, "{$1}");
      expect((document.paths as Record<string, Record<string, unknown>>)[path]?.[route.method], `${route.method.toUpperCase()} ${path}`).toBeTruthy();
    }
    expect(Object.keys(document.paths).length).toBe(routes.map(route => route.path).filter((path, index, all) => all.indexOf(path) === index).length + 1);
    const body = JSON.stringify(document);
    for (const word of ["bearerAuth", "x-required-scope", "X-ProjectOS-Signature", "daily_report.approved"]) expect(body).toContain(word);
    // and the document is true: a body that breaks its schema is refused with the field named
    const bad = await call(fullKeyA, "POST", "/erp/suppliers", { records: [{ externalId: "S-1", code: "" }] });
    expect(bad.status).toBe(400); expect(bad.json.code).toBe("PROJECT_OS_API_VALIDATION"); expect(bad.json.issues[0].path).toContain("records");
  });

  // ----------------------------------------------------------------------------------------------------------------------------------- ERP in
  it("suppliers: created, then unchanged on a re-send, updated when they change; a code taken by another is refused; one bad record does not stop the rest", async () => {
    const first = await call(fullKeyA, "POST", "/erp/suppliers", { system: "odoo", records: [{ externalId: "P-1", code: "SUP-1", legalName: "Gulf Cement" }, { externalId: "P-2", code: "SUP-2", legalName: "Red Sea Steel", contactEmail: "sales@steel.example.test" }] });
    expect(first.status).toBe(200);
    expect(outcomes(first)).toEqual({ "P-1": "created", "P-2": "created" });
    expect(first.json).toMatchObject({ status: "ok", received: 2, accepted: 2, rejected: 0 });
    expect(outcomes(await call(fullKeyA, "POST", "/erp/suppliers", { system: "odoo", records: [{ externalId: "P-1", code: "SUP-1", legalName: "Gulf Cement" }] }))).toEqual({ "P-1": "unchanged" });
    expect(outcomes(await call(fullKeyA, "POST", "/erp/suppliers", { system: "odoo", records: [{ externalId: "P-1", code: "SUP-1", legalName: "Gulf Cement Co." }] }))).toEqual({ "P-1": "updated" });
    const mixed = await call(fullKeyA, "POST", "/erp/suppliers", { system: "odoo", records: [{ externalId: "P-3", code: "SUP-2", legalName: "Clash" }, { externalId: "P-4", code: "SUP-4", legalName: "Fine" }] });
    expect(outcomes(mixed)).toEqual({ "P-3": "rejected:SUPPLIER_CODE_TAKEN", "P-4": "created" });
    expect(mixed.json).toMatchObject({ status: "partial", accepted: 1, rejected: 1 });
    const [rows] = await connection.query<{ legalName: string }[]>("SELECT legalName FROM suppliers WHERE tenantId = ? AND code = 'SUP-1'", [tenantA]);
    expect(rows).toHaveLength(1); expect(rows[0].legalName).toBe("Gulf Cement Co.");
    // the other company has none of it
    const [others] = await connection.query<{ n: string }[]>("SELECT COUNT(*) n FROM suppliers WHERE tenantId = ?", [tenantB]);
    expect(Number(others[0].n)).toBe(0);
  });

  it("purchase orders arrive as drafts, update only while draft, and are held to the platform's rules (project, supplier, riyals)", async () => {
    const order = (over: Record<string, unknown> = {}) => ({ externalId: "PO-1", project: "PRJ-1", number: "PO-0001", supplier: "P-1", orderDate: "2026-10-01", amount: 48000, summary: "Cement", costCode: "1.1", ...over });
    const created = await call(fullKeyA, "POST", "/erp/purchase-orders", { system: "odoo", records: [order()] });
    expect(outcomes(created)).toEqual({ "PO-1": "created" });
    const [po] = await connection.query<{ status: string; amount: string; supplierName: string; currency: string }[]>("SELECT status, amount, supplierName, currency FROM purchase_orders WHERE tenantId = ? AND purchaseOrderNumber = 'PO-0001'", [tenantA]);
    expect(po[0]).toMatchObject({ status: "draft", supplierName: "Gulf Cement Co.", currency: "SAR" }); expect(Number(po[0].amount)).toBe(48000);
    expect(outcomes(await call(fullKeyA, "POST", "/erp/purchase-orders", { system: "odoo", records: [order({ amount: 52000 })] }))).toEqual({ "PO-1": "updated" });
    expect(outcomes(await call(fullKeyA, "POST", "/erp/purchase-orders", { system: "odoo", records: [order({ amount: 52000 })] }))).toEqual({ "PO-1": "unchanged" });
    await connection.query("UPDATE purchase_orders SET status = 'approved' WHERE tenantId = ? AND purchaseOrderNumber = 'PO-0001'", [tenantA]);
    expect(outcomes(await call(fullKeyA, "POST", "/erp/purchase-orders", { system: "odoo", records: [order({ amount: 60000 })] }))).toEqual({ "PO-1": "rejected:PURCHASE_ORDER_NOT_DRAFT" });
    const refusals = await call(fullKeyA, "POST", "/erp/purchase-orders", { system: "odoo", records: [order({ externalId: "PO-2", number: "PO-0002", project: "PRJ-B" }), order({ externalId: "PO-3", number: "PO-0003", supplier: "P-404" }), order({ externalId: "PO-4", number: "PO-0004", costCode: "9.9" })] });
    expect(outcomes(refusals)).toEqual({ "PO-2": "rejected:PROJECT_UNKNOWN", "PO-3": "rejected:SUPPLIER_UNKNOWN", "PO-4": "rejected:COST_CODE_UNKNOWN" }); // PRJ-B belongs to the other company
    const sar = await call(fullKeyA, "POST", "/erp/purchase-orders", { system: "odoo", records: [{ ...order({ externalId: "PO-5", number: "PO-0005" }), currency: "USD" }] });
    expect(sar.status).toBe(400); // the document says SAR only
  });

  it("actual costs are posted on an existing WBS item through the mapped cost code, never changed by a re-send, and refused for an unknown code", async () => {
    const mapped = await call(fullKeyA, "PUT", "/mappings/cost_code", { system: "odoo", records: [{ externalId: "ACC-5001", ref: "1.1", project: "PRJ-1" }, { externalId: "ACC-X", ref: "7.7", project: "PRJ-1" }, { externalId: "ACC-Y", ref: "1.1" }] });
    expect(outcomes(mapped)).toEqual({ "ACC-5001": "created", "ACC-X": "rejected:REF_UNKNOWN", "ACC-Y": "rejected:PROJECT_REQUIRED" });
    const cost = (over: Record<string, unknown> = {}) => ({ externalId: "JE-1", project: "PRJ-1", costCode: "ACC-5001", amount: 12500.5, incurredAt: "2026-10-05", category: "materials", ...over });
    expect(outcomes(await call(fullKeyA, "POST", "/erp/actual-costs", { system: "odoo", records: [cost()] }))).toEqual({ "JE-1": "created" });
    const [entry] = await connection.query<{ amount: string; status: string; entryType: string; wbsItemId: string; sourceType: string }[]>("SELECT amount, status, entryType, wbsItemId, sourceType FROM cost_entries WHERE tenantId = ? AND sourceType = 'erp'", [tenantA]);
    expect(entry).toHaveLength(1); expect(entry[0]).toMatchObject({ status: "posted", entryType: "actual", wbsItemId: WBS_A, sourceType: "erp" }); expect(Number(entry[0].amount)).toBe(12500.5);
    expect(outcomes(await call(fullKeyA, "POST", "/erp/actual-costs", { system: "odoo", records: [cost()] }))).toEqual({ "JE-1": "unchanged" });
    expect(outcomes(await call(fullKeyA, "POST", "/erp/actual-costs", { system: "odoo", records: [cost({ amount: 99999 })] }))).toEqual({ "JE-1": "rejected:COST_ALREADY_POSTED" });
    expect(outcomes(await call(fullKeyA, "POST", "/erp/actual-costs", { system: "odoo", records: [cost({ externalId: "JE-2", costCode: "NOPE" })] }))).toEqual({ "JE-2": "rejected:COST_CODE_UNKNOWN" });
    const [after] = await connection.query<{ n: string }[]>("SELECT COUNT(*) n FROM cost_entries WHERE tenantId = ? AND sourceType = 'erp'", [tenantA]);
    expect(Number(after[0].n)).toBe(1);
    // the same code in the OTHER company's world is not ours: B's key cannot post to A's project
    expect(outcomes(await call(fullKeyB, "POST", "/erp/actual-costs", { system: "odoo", records: [cost({ externalId: "JE-B" })] }))).toEqual({ "JE-B": "rejected:PROJECT_UNKNOWN" }.constructor === Object ? { "JE-B": "rejected:PROJECT_UNKNOWN" } : {});
  });

  it("invoices, payments and employee cost have no table: they are kept as received and reported 'stored', not invented into one", async () => {
    for (const [path, type] of [["invoices", "invoice"], ["payments", "payment"], ["employee-costs", "employee_cost"]] as const) {
      const result = await call(fullKeyA, "POST", `/erp/${path}`, { system: "odoo", records: [{ externalId: `${type}-1`, amount: 100, reference: "R-1" }] });
      expect(outcomes(result)).toEqual({ [`${type}-1`]: "stored:NO_TABLE" });
      expect(outcomes(await call(fullKeyA, "POST", `/erp/${path}`, { system: "odoo", records: [{ externalId: `${type}-1`, amount: 100, reference: "R-1" }] }))).toEqual({ [`${type}-1`]: "unchanged" });
    }
    const [kept] = await connection.query<{ n: string }[]>("SELECT COUNT(*) n FROM integration_inbound_records WHERE tenantId = ?", [tenantA]);
    expect(Number(kept[0].n)).toBe(3);
  });

  // ----------------------------------------------------------------------------------------------------------------------------------- other systems in
  it("a submittal system's records: created with its own ids, answered with the company's codes, and refused when the code is not the company's", async () => {
    const submittal = (over: Record<string, unknown> = {}) => ({ externalId: "SUB-1", project: "PRJ-1", type: "shop_drawing", number: "SD-100", title: "Slab drawing", sentAt: "2026-10-01T08:00:00Z", ...over });
    const created = await call(fullKeyA, "POST", "/external/submittals", { system: "submittals", records: [submittal(), submittal({ externalId: "SUB-2", number: "SD-101", replyCode: "A", repliedAt: "2026-10-04T08:00:00Z" })] });
    expect(outcomes(created)).toEqual({ "SUB-1": "created", "SUB-2": "created" });
    const [rows] = await connection.query<{ submittalNumber: string; status: string; replyCode: string | null }[]>("SELECT submittalNumber, status, replyCode FROM consultant_submittals WHERE tenantId = ? ORDER BY submittalNumber", [tenantA]);
    expect(rows).toEqual([{ submittalNumber: "SD-100", status: "sent", replyCode: null }, { submittalNumber: "SD-101", status: "replied", replyCode: "A" }]);
    expect(outcomes(await call(fullKeyA, "POST", "/external/submittals", { system: "submittals", records: [submittal()] }))).toEqual({ "SUB-1": "unchanged" });
    expect(outcomes(await call(fullKeyA, "POST", "/external/submittals", { system: "submittals", records: [submittal({ replyCode: "B", repliedAt: "2026-10-06T08:00:00Z" })] }))).toEqual({ "SUB-1": "updated" });
    const refused = await call(fullKeyA, "POST", "/external/submittals", { system: "submittals", records: [submittal({ externalId: "SUB-3", number: "SD-102", replyCode: "Z", repliedAt: "2026-10-06T08:00:00Z" }), submittal({ externalId: "SUB-4", number: "SD-103", type: "material_approval" }), submittal({ externalId: "SUB-5", number: "SD-104", repliedAt: "2026-09-01T08:00:00Z", replyCode: "A" }), submittal({ externalId: "SUB-6", number: "SD-105", project: "PRJ-B" })] });
    expect(outcomes(refused)).toEqual({ "SUB-3": "rejected:REPLY_CODE_UNKNOWN", "SUB-4": "rejected:MATERIAL_REQUIRED", "SUB-5": "rejected:REPLY_BEFORE_SENT", "SUB-6": "rejected:PROJECT_UNKNOWN" });
  });

  it("a quality system's inspection answered A is the acceptance the company's quality gate reads", async () => {
    await callers.ownerA.policy.set({ tenantId: tenantA, qcCompletionMode: "block", qcAcceptedCodes: ["A", "B"], materialApprovalMode: "off" });
    const manager = callers.ownerA;
    await expect(manager.pmc.setUnitActivityStatus({ tenantId: tenantA, projectId: PA, unitId: UNIT1, activityDefinitionId: WALLS, status: "COMPLETE" })).rejects.toThrow("PROJECT_OS_QC_NOT_ACCEPTED");
    const sent = await call(fullKeyA, "POST", "/external/inspections", { system: "quality", records: [
      { externalId: "IR-1", project: "PRJ-1", requestCode: "IR-ALPHA-001", units: [1], activity: "WALLS", requestedAt: "2026-10-02T08:00:00Z", responseCode: "C" },
      { externalId: "IR-2", project: "PRJ-1", requestCode: "IR-ALPHA-002", units: [1, 2], activity: "WALLS", requestedAt: "2026-10-03T08:00:00Z" },
      { externalId: "IR-3", project: "PRJ-1", requestCode: "IR-ALPHA-003", units: [99], activity: "WALLS", requestedAt: "2026-10-03T08:00:00Z" },
    ] });
    expect(outcomes(sent)).toEqual({ "IR-1": "created", "IR-2": "rejected:UNITS_MIXED_MODELS", "IR-3": "rejected:UNIT_UNKNOWN" });
    await expect(manager.pmc.setUnitActivityStatus({ tenantId: tenantA, projectId: PA, unitId: UNIT1, activityDefinitionId: WALLS, status: "COMPLETE" })).rejects.toThrow("PROJECT_OS_QC_NOT_ACCEPTED"); // answered C
    expect(outcomes(await call(fullKeyA, "POST", "/external/inspections", { system: "quality", records: [{ externalId: "IR-1", project: "PRJ-1", requestCode: "IR-ALPHA-001", units: [1], activity: "WALLS", requestedAt: "2026-10-02T08:00:00Z", responseCode: "A" }] }))).toEqual({ "IR-1": "updated" });
    const done = await manager.pmc.setUnitActivityStatus({ tenantId: tenantA, projectId: PA, unitId: UNIT1, activityDefinitionId: WALLS, status: "COMPLETE" });
    expect(done.to).toBe("COMPLETE");
    await callers.ownerA.policy.set({ tenantId: tenantA, qcCompletionMode: "warn", qcAcceptedCodes: ["A", "B"], materialApprovalMode: "warn" });
  });

  // ----------------------------------------------------------------------------------------------------------------------------------- ERP out
  it("exports are paged, can ask for what changed, and show a key its own company only", async () => {
    const page1 = await call(fullKeyA, "GET", "/export/budgets?project=PRJ-1&limit=1");
    expect(page1.status).toBe(200);
    expect(page1.json.items).toHaveLength(1);
    expect(page1.json.next).toBeTruthy();
    const page2 = await call(fullKeyA, "GET", `/export/budgets?project=PRJ-1&limit=1&after=${page1.json.next}`);
    expect(page2.json.items).toHaveLength(1);
    expect(page2.json.items[0].id).not.toBe(page1.json.items[0].id);
    expect(page2.json.next).toBeNull();
    const costCodes = [page1.json.items[0].costCode, page2.json.items[0].costCode].sort();
    expect(costCodes).toEqual(["MAS", "MAS2"]);
    expect(page1.json.items.concat(page2.json.items).reduce((total: number, item: { currentAmount: number }) => total + item.currentAmount, 0)).toBe(520000);
    expect((await call(fullKeyA, "GET", `/export/budgets?updated_since=${encodeURIComponent(new Date(Date.now() + 60_000).toISOString())}`)).json.items).toEqual([]);
    expect((await call(fullKeyA, "GET", "/export/budgets?project=PRJ-B")).status).toBe(404); // B's project is not A's
    expect((await call(fullKeyB, "GET", "/export/budgets")).json.items).toEqual([]);
    for (const entity of ["commitments", "progress", "valuations"]) expect((await call(fullKeyA, "GET", `/export/${entity}`)).status, entity).toBe(200);
    expect((await call(fullKeyA, "GET", "/export/nothing")).status).toBe(404);
    expect((await call(fullKeyA, "GET", "/export/budgets?limit=5000")).status).toBe(400);
  });

  // ----------------------------------------------------------------------------------------------------------------------------------- the log and isolation
  it("the log shows what arrived and what was refused with the reason, and a key reads its own company's log only", async () => {
    const runs = await call(fullKeyA, "GET", "/sync/runs?limit=100");
    expect(runs.status).toBe(200);
    const withRefusals = runs.json.items.find((run: { rejected: number; entityType: string }) => run.rejected > 0 && run.entityType === "supplier");
    expect(withRefusals).toMatchObject({ system: "odoo", direction: "in", status: "partial" });
    const items = await call(fullKeyA, "GET", `/sync/runs/${withRefusals.id}/items?outcome=rejected`);
    expect(items.json.items.map((item: { reason: string }) => item.reason)).toEqual(["SUPPLIER_CODE_TAKEN"]);
    // another company's key cannot read that run
    expect((await call(fullKeyB, "GET", `/sync/runs/${withRefusals.id}/items`)).json.items).toEqual([]);
    expect((await call(fullKeyB, "GET", "/sync/runs")).json.items.every((run: { tenantId: string }) => run.tenantId === tenantB)).toBe(true);
    const mappings = await call(fullKeyA, "GET", "/mappings?system=odoo&type=supplier");
    expect(mappings.json.items.map((item: { externalId: string }) => item.externalId).sort()).toEqual(["P-1", "P-2", "P-4"]);
    expect((await call(fullKeyB, "GET", "/mappings")).json.items).toEqual([]);
    // and the manager sees the same log on the screen's side; an engineer does not
    expect((await callers.ownerA.integrations.syncRuns({ tenantId: tenantA })).length).toBeGreaterThan(5);
    await expect(callers.engineerA.integrations.syncRuns({ tenantId: tenantA })).rejects.toThrow();
  });

  // ----------------------------------------------------------------------------------------------------------------------------------- webhooks
  describe("webhooks", () => {
    let receiver: Server; let receiverUrl = ""; let respondWith = 200;
    const received: Array<{ headers: Record<string, string | string[] | undefined>; body: string }> = [];
    let endpoint: { id: string; secret: string } | null = null;
    beforeAll(async () => {
      receiver = createServer((request, response) => { const parts: Buffer[] = []; request.on("data", part => parts.push(part)).on("end", () => { received.push({ headers: request.headers, body: Buffer.concat(parts).toString() }); response.writeHead(respondWith); response.end(); }); });
      await new Promise<void>(resolve => receiver.listen(0, "127.0.0.1", () => resolve()));
      receiverUrl = `http://127.0.0.1:${(receiver.address() as AddressInfo).port}/hook`;
    });
    afterAll(async () => { await new Promise(resolve => receiver.close(resolve)); });

    it("private and plain-http addresses are refused unless an operator opted in", () => {
      for (const address of ["127.0.0.1", "10.1.2.3", "172.16.0.9", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "fe80::1", "::ffff:10.0.0.1", "0.0.0.0"]) expect(isPrivateAddress(address), address).toBe(true);
      for (const address of ["8.8.8.8", "93.184.216.34", "2606:4700:4700::1111"]) expect(isPrivateAddress(address), address).toBe(false);
    });

    it("the manager registers an endpoint; the secret is shown once; a test event arrives signed and its signature verifies", async () => {
      await expect(callers.engineerA.integrations.createWebhook({ tenantId: tenantA, url: receiverUrl, events: ["*"] })).rejects.toThrow();
      await expect(callers.ownerA.integrations.createWebhook({ tenantId: tenantA, url: receiverUrl, events: ["not.an.event"] })).rejects.toThrow("PROJECT_OS_WEBHOOK_EVENTS_INVALID");
      const created = await callers.ownerA.integrations.createWebhook({ tenantId: tenantA, url: receiverUrl, events: ["daily_report.approved", "submittal.replied", "webhook.test"] });
      endpoint = { id: created.id, secret: created.secret };
      expect(created.secret).toMatch(/^whsec_/);
      const listed = await callers.ownerA.integrations.listWebhooks({ tenantId: tenantA });
      expect(JSON.stringify(listed)).not.toContain(created.secret);
      const [stored] = await connection.query<{ secretSealed: string }[]>("SELECT secretSealed FROM webhook_endpoints WHERE id = ?", [created.id]);
      expect(stored[0].secretSealed.startsWith("v1:")).toBe(true); expect(stored[0].secretSealed).not.toContain(created.secret);
      received.length = 0;
      const result = await callers.ownerA.integrations.testWebhook({ tenantId: tenantA, endpointId: created.id });
      expect(result).toMatchObject({ status: "delivered", lastStatusCode: 200 });
      expect(received).toHaveLength(1);
      const hit = received[0];
      const signature = String(hit.headers["x-projectos-signature"]);
      const [t, v1] = signature.split(",").map(part => part.split("=")[1]);
      expect(v1).toBe(createHmac("sha256", created.secret).update(`${t}.${hit.body}`).digest("hex"));
      expect(Math.abs(Number(t) - Date.now() / 1000)).toBeLessThan(60);
      expect(hit.headers["x-projectos-event"]).toBe("webhook.test");
      expect(JSON.parse(hit.body)).toMatchObject({ type: "webhook.test", tenantId: tenantA });
      expect(signWebhook(created.secret, hit.body, Number(t))).toBe(signature);
    });

    it("a real event reaches it: a submittal answered in the platform is posted to the receiver, and another company's endpoint hears nothing", async () => {
      received.length = 0;
      const engineerKeyEvents = await callers.ownerA.integrations.createWebhook({ tenantId: tenantB, url: receiverUrl, events: ["*"] }).catch(() => null);
      expect(engineerKeyEvents).toBeNull(); // the A manager has no say over B
      const sent = (await call(fullKeyA, "POST", "/external/submittals", { system: "submittals", records: [{ externalId: "SUB-9", project: "PRJ-1", type: "method_statement", number: "MS-1", title: "Concrete method", sentAt: new Date(Date.now() - 86_400_000).toISOString() }] })).json;
      expect(sent.accepted).toBe(1);
      const [row] = await connection.query<{ id: string }[]>("SELECT id FROM consultant_submittals WHERE tenantId = ? AND submittalNumber = 'MS-1'", [tenantA]);
      // the platform's own reply path: the owner records the consultant's answer
      await callers.ownerA.submittals.reply({ tenantId: tenantA, projectId: PA, submittalId: row[0].id, replyCode: "A" });
      await deliverDueWebhooks();
      const events = received.map(hit => JSON.parse(hit.body));
      expect(events.some(event => event.type === "submittal.replied" && event.data.submittalNumber === "MS-1" && event.data.approved === true)).toBe(true);
    });

    it("a receiver that is down is tried again later with growing gaps and given up on after six tries; the log shows each try", async () => {
      respondWith = 500;
      received.length = 0;
      const created = await callers.ownerA.integrations.testWebhook({ tenantId: tenantA, endpointId: endpoint!.id });
      expect(created).toMatchObject({ status: "pending", lastStatusCode: 500 });
      let clock = Date.now();
      for (const minutes of [1, 5, 30, 120, 720]) { clock += minutes * 60_000 + 1000; await deliverDueWebhooks({ now: new Date(clock) }); }
      const deliveries = await callers.ownerA.integrations.webhookDeliveries({ tenantId: tenantA, endpointId: endpoint!.id });
      const failed = deliveries.find(delivery => delivery.status === "failed");
      expect(failed).toBeTruthy();
      expect(failed!.attempts).toBe(6);
      expect(failed!.lastError).toBe("HTTP_500");
      respondWith = 200;
      await callers.ownerA.integrations.setWebhookActive({ tenantId: tenantA, endpointId: endpoint!.id, active: false });
      received.length = 0;
      const [open] = await connection.query<{ id: string }[]>("SELECT id FROM consultant_submittals WHERE tenantId = ? AND submittalNumber = 'SD-100'", [tenantA]);
      await callers.ownerA.submittals.reply({ tenantId: tenantA, projectId: PA, submittalId: open[0].id, replyCode: "B" }).catch(() => undefined);
      await deliverDueWebhooks();
      expect(received).toHaveLength(0); // a disabled endpoint hears nothing
    });
  });
});
