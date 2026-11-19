import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-42 (P2-04, adviser 18-11; docs/proposals/future-mr.md): the site asks today for a material it needs on a later date. The request may name the warehouse it
// would be issued from and the subcontract it is for (a preference, each of this project only); a date already gone is refused; creating — and approving —
// a request touches no stock; whoever asked submits or cancels their own request and nothing else; the register says how soon each open request is due.
// On a real database, through the real router, as the restricted application role. Synthetic data only.
const SLUG = "q42-mr";
const SLUG_B = "q42-mr-b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const KEYS = ["owner", "site", "site2", "proc", "ownerB"] as const;
type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callerFor = (key: Key) => appRouter.createCaller({ user: { id: ids[key], openId: `q42m-${key}`, name: `Q42 ${key}`, email: `q42m-${key}@q42.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const P = "42aa0000-0000-4000-8000-000000000001";
const P2 = "42aa0000-0000-4000-8000-000000000002";
const PB = "42bb0000-0000-4000-8000-000000000001";
const DAY = 86_400_000;
let connection: fixtureDb.Connection; let tenantId = ""; let tenantB = ""; let materialId = ""; let warehouseId = ""; let otherWarehouseId = ""; let contractId = ""; let otherContractId = "";

async function clear() {
  for (const slug of [SLUG, SLUG_B]) {
    const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [slug]);
    for (const { id } of companies) {
      for (const table of ["audit_logs", "warehouse_inventory_transactions", "procurement_requisitions", "subcontract_contracts", "material_masters", "project_warehouses"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE FROM membership_roles WHERE membershipId IN (SELECT id FROM memberships WHERE tenantId = ?)", [id]);
      await connection.query("DELETE FROM role_permissions WHERE roleId IN (SELECT id FROM roles WHERE tenantId = ?)", [id]);
      for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE FROM companies WHERE id = ?", [id]);
    }
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q42m-%'");
}
const templateRole = async (roleCode: string) => (await connection.query<{ id: string }[]>("SELECT id FROM roles WHERE tenantId = ? AND code = ?", [tenantId, roleCode]))[0][0]!.id;
const scope = () => ({ tenantId, projectId: P });
const ask = (key: Key, number: string, extra: { requiredAt?: Date; warehouseId?: string; subcontractId?: string; requestedQuantity?: number } = {}) => callerFor(key).procurement.createRequisition({ ...scope(), requisitionNumber: number, materialId, description: "Synthetic cement for the subcontractor's slab", requestedQuantity: extra.requestedQuantity ?? 500, unitOfMeasure: "bag", requiredAt: extra.requiredAt ?? new Date(Date.now() + 5 * DAY), warehouseId: extra.warehouseId, subcontractId: extra.subcontractId });
const register = async () => (await callerFor("owner").procurement.register(scope())).requisitions;
const byNumber = async (number: string) => (await register()).find(item => item.requisitionNumber === number)!;
const stock = async () => (await callerFor("owner").warehouses.list(scope())).balances.map(item => [item.quantityOnHand, item.stockValue]);
const move = (key: Key, id: string, nextStatus: "submitted" | "approved" | "rejected" | "cancelled" | "closed") => callerFor(key).procurement.transitionRequisition({ ...scope(), requisitionId: id, nextStatus });

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-42: a material request for a later date, without touching stock", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q42m-${key}`, `Q42 ${key}`, `q42m-${key}@q42.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q42m-%'");
    for (const key of KEYS) ids[key] = rows.find(row => row.openId === `q42m-${key}`)!.id;
    ({ tenantId } = await callerFor("owner").tenant.create({ legalName: "Q42 MR Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: tenantB } = await callerFor("ownerB").tenant.create({ legalName: "Q42 MR Other Co.", slug: SLUG_B, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q42-1', 'MR one', 'villas', 'SAR', 'active'), (?, ?, 'Q42-2', 'MR two', 'villas', 'SAR', 'active'), (?, ?, 'Q42-B', 'Other company', 'villas', 'SAR', 'active')", [P, tenantId, P2, tenantId, PB, tenantB]);
    const owner = callerFor("owner");
    for (const [key, roleCode] of [["site", "SITE_ENGINEER"], ["site2", "SITE_ENGINEER"], ["proc", "PROCUREMENT_OFFICER"]] as const) await owner.tenant.assignMember({ tenantId, targetUserId: ids[key], roleId: await templateRole(roleCode), scopeType: "project", scopeId: P });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
    ({ id: materialId } = await owner.materials.createMaster({ tenantId, code: "Q42-CEM", description: "Synthetic cement bag", unitOfMeasure: "bag", category: "Concrete" }));
    ({ id: warehouseId } = await owner.warehouses.create({ ...scope(), code: "Q42-WH", name: "Synthetic main store" }));
    ({ id: otherWarehouseId } = await owner.warehouses.create({ tenantId, projectId: P2, code: "Q42-WH2", name: "Other project's store" }));
    await owner.warehouses.recordInventory({ ...scope(), warehouseId, materialId, transactionType: "receipt", quantityDelta: 100, unitCost: 20, referenceNumber: "GRN-Q42", note: "Opening receipt", occurredAt: new Date(Date.now() - DAY) });
    await owner.subcontracts.create({ ...scope(), code: "Q42-SUB", title: "Synthetic slab works", subcontractorName: "Synthetic Builders", contractValue: 90000 });
    await owner.subcontracts.create({ tenantId, projectId: P2, code: "Q42-SUB2", title: "Other project's works", subcontractorName: "Synthetic Two", contractValue: 1000 });
    contractId = (await owner.subcontracts.list(scope()))[0].id;
    otherContractId = (await owner.subcontracts.list({ tenantId, projectId: P2 }))[0].id;
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("POSITIVE: the site engineer asks today for 500 bags needed in 5 days, from a warehouse, for a subcontract — and the stock does not move", async () => {
    const before = await stock();
    await ask("site", "MR-Q42-1", { warehouseId, subcontractId: contractId });
    expect(await stock()).toEqual(before); // 100 bags, 2000.00 — no deduction, no reservation, more asked than on the shelf
    const request = await byNumber("MR-Q42-1");
    expect([request.status, request.warehouse?.code, request.subcontract?.code, request.dueState, request.remainingQuantity]).toEqual(["draft", "Q42-WH", "Q42-SUB", "due_soon", 500]);
    expect(request.subcontract).not.toHaveProperty("contractValue"); // whom it is for, never the subcontract's value
  });

  it("NEGATIVE: a date already gone is refused and writes nothing; a warehouse or subcontract of another project is refused", async () => {
    expect(await code(ask("site", "MR-Q42-PAST", { requiredAt: new Date(Date.now() - 2 * DAY) }))).toBe("PROJECT_OS_REQUISITION_REQUIRED_AT_PAST");
    expect(await code(ask("site", "MR-Q42-WH2", { warehouseId: otherWarehouseId }))).toBe("PROJECT_OS_WAREHOUSE_NOT_FOUND");
    expect(await code(ask("site", "MR-Q42-SUB2", { subcontractId: otherContractId }))).toBe("PROJECT_OS_SUBCONTRACT_NOT_FOUND");
    expect((await register()).map(item => item.requisitionNumber)).toEqual(["MR-Q42-1"]);
  });

  it("the requester submits their own request; another site engineer cannot touch it; the requester cannot approve; procurement approves — still no stock moves", async () => {
    const { id } = await byNumber("MR-Q42-1");
    expect(await code(move("site2", id, "submitted"))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect((await move("site", id, "submitted")).status).toBe("submitted");
    expect(await code(move("site", id, "approved"))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(move("site2", id, "cancelled"))).toBe("PROJECT_OS_PERMISSION_DENIED");
    const before = await stock();
    expect((await move("proc", id, "approved")).status).toBe("approved");
    expect(await stock()).toEqual(before);
    // once approved, the requester no longer cancels it alone
    expect(await code(move("site", id, "cancelled"))).toBe("PROJECT_OS_PERMISSION_DENIED");
  });

  it("the requester cancels their own draft; a request due later says «later»; a cancelled one has no due state", async () => {
    await ask("site", "MR-Q42-2", { requiredAt: new Date(Date.now() + 30 * DAY), requestedQuantity: 5 });
    expect((await byNumber("MR-Q42-2")).dueState).toBe("later");
    expect((await move("site", (await byNumber("MR-Q42-2")).id, "cancelled")).status).toBe("cancelled");
    expect((await byNumber("MR-Q42-2")).dueState).toBeNull();
  });

  it("ISOLATION: another company neither reads nor files a request here", async () => {
    expect(await code(callerFor("ownerB").procurement.register(scope()))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(callerFor("ownerB").procurement.createRequisition({ ...scope(), requisitionNumber: "MR-Q42-B", materialId, description: "Not this company's", requestedQuantity: 1, unitOfMeasure: "bag", requiredAt: new Date(Date.now() + DAY) }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
  });
});
