import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Work order 12, item 2: the four levels a role works at, answered by the server over exactly the projects the caller's OWN assignment covers.
// Real database, the application running as the restricted role. Synthetic data only.
const SLUG = "scope-levels";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@scope.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} }, res: {} } as unknown as TrpcContext);
const SCOPE_DENIED = "Role scope does not cover the requested resource.";
const PERM_DENIED = "Required permission is not granted.";

let connection: fixtureDb.Connection;
let tenantId = "";
const ids = { portfolio: "f4000000-0000-4000-8000-0000000000a1", a: "f4000000-0000-4000-8000-0000000000b1", b: "f4000000-0000-4000-8000-0000000000b2", c: "f4000000-0000-4000-8000-0000000000b3" };
const KEYS = ["owner", "board", "pmo", "pmA", "split", "keeper", "coord"] as const;
const userIds: Record<string, number> = {}; const roleIds: Record<string, string> = {};
const callers: Record<string, ReturnType<typeof callerFor>> = {};
let warehouseA = ""; let warehouseB = "";

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [SLUG]);
  for (const { id } of companies) {
    for (const table of ["warehouse_inventory_transactions", "project_material_overrides", "project_warehouses", "material_masters", "consultant_submittals", "quality_inspections", "ncrs", "activities", "pmc_inspection_requests", "audit_logs", "membership_invitations"]) {
      await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    }
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    for (const table of ["roles", "memberships", "tenant_entitlements", "subscriptions", "projects", "portfolios"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'scp-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("the four levels, scoped by the server on a real database", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`scp-${key}`, `Scope ${key}`, `scp-${key}@scope.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'scp-%'");
    for (const key of KEYS) { userIds[key] = rows.find(row => row.openId === `scp-${key}`)!.id; callers[key] = callerFor(userIds[key], `scp-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Scope Levels Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO portfolios (id, tenantId, code, name) VALUES (?, ?, 'P-ONE', 'Portfolio one')", [ids.portfolio, tenantId]);
    // A and C belong to the portfolio; B stands alone.
    await connection.query("INSERT INTO projects (id, tenantId, portfolioId, code, name, projectType, currency, status) VALUES (?, ?, ?, 'SC-A', 'Villas A', 'villas', 'SAR', 'active'), (?, ?, ?, 'SC-C', 'Villas C', 'villas', 'SAR', 'active'), (?, ?, NULL, 'SC-B', 'Villas B', 'villas', 'SAR', 'active')", [ids.a, tenantId, ids.portfolio, ids.c, tenantId, ids.portfolio, ids.b, tenantId]);
    const administration = await callers.owner.tenant.administration({ tenantId });
    for (const role of administration.roles) roleIds[role.code] = role.id;
    const invite = async (key: typeof KEYS[number], role: string, scopeType: "company" | "portfolio" | "project", scopeId?: string) => {
      const invitation = await callers.owner.tenant.createInvitation({ tenantId, email: `scp-${key}@scope.example.test`, roleId: roleIds[role], scopeType, scopeId });
      await callers[key].tenant.acceptInvitation({ inviteToken: invitation.inviteToken });
    };
    await invite("board", "EXECUTIVE", "company");
    await invite("pmo", "PMO_LEAD", "portfolio", ids.portfolio);
    await invite("pmA", "PROJECT_MANAGER", "project", ids.a);
    // The pooled-permission trap (G-142): project.read on A, and only warehouse keeping on B.
    await invite("split", "PROJECT_MANAGER", "project", ids.a);
    const [[membership]] = await connection.query<{ id: string }[]>("SELECT id FROM memberships WHERE tenantId = ? AND userId = ?", [tenantId, userIds.split]);
    await callers.owner.tenant.assignMembershipRole({ tenantId, membershipId: membership.id, roleId: roleIds.WAREHOUSE_CUSTODIAN, scopeType: "project", scopeId: ids.b });
    await invite("keeper", "WAREHOUSE_CUSTODIAN", "project", ids.a);
    await invite("coord", "PROJECT_COORDINATOR", "project", ids.a);

    // Facts to count on A: one overdue activity, one open NCR, one submittal at the consultant, one inspection awaiting a result, stock with a reorder level.
    await connection.query("INSERT INTO activities (id, tenantId, projectId, code, name, status, plannedStartAt, plannedFinishAt) VALUES (gen_random_uuid(), ?, ?, 'ACT-1', 'Late slab', 'in_progress', ?, ?)", [tenantId, ids.a, new Date("2026-01-01"), new Date("2026-02-01")]);
    await connection.query("INSERT INTO ncrs (id, tenantId, projectId, ncrNumber, title, description, status, createdByUserId) VALUES (gen_random_uuid(), ?, ?, 'NCR-1', 'Cracks', 'Cracks in slab', 'open', ?)", [tenantId, ids.a, userIds.owner]);
    await connection.query("INSERT INTO consultant_submittals (id, tenantId, projectId, submittalType, submittalNumber, title, discipline, status, createdByUserId) VALUES (gen_random_uuid(), ?, ?, 'shop_drawing', 'SUB-1', 'Tiles', 'architectural', 'sent', ?)", [tenantId, ids.a, userIds.owner]);
    await connection.query("INSERT INTO quality_inspections (id, tenantId, projectId, inspectionNumber, inspectionType, inspectedAt, outcome, summary, status, createdByUserId) VALUES (gen_random_uuid(), ?, ?, 'QI-1', 'witness', ?, 'pass', 'Concrete pour', 'submitted', ?)", [tenantId, ids.a, new Date("2026-03-01"), userIds.owner]);
    await callers.owner.materials.createMaster({ tenantId, code: "CEM-1", description: "Cement bag", unitOfMeasure: "bag", category: "cement" });
    const [[material]] = await connection.query<{ id: string }[]>("SELECT id FROM material_masters WHERE tenantId = ? AND code = 'CEM-1'", [tenantId]);
    await callers.owner.warehouses.create({ tenantId, projectId: ids.a, code: "WH-A", name: "Store A" });
    await callers.owner.warehouses.create({ tenantId, projectId: ids.b, code: "WH-B", name: "Store B" });
    const [whs] = await connection.query<{ id: string; code: string }[]>("SELECT id, code FROM project_warehouses WHERE tenantId = ?", [tenantId]);
    warehouseA = whs.find(row => row.code === "WH-A")!.id; warehouseB = whs.find(row => row.code === "WH-B")!.id;
    await callers.owner.warehouses.recordInventory({ tenantId, projectId: ids.a, warehouseId: warehouseA, materialId: material.id, transactionType: "receipt", quantityDelta: 40, unitCost: 25, occurredAt: new Date() });
    await connection.query("INSERT INTO project_material_overrides (id, tenantId, projectId, materialId, reorderLevel, createdByUserId) VALUES (gen_random_uuid(), ?, ?, ?, 100, ?)", [tenantId, ids.a, material.id, userIds.owner]);
  }, 180_000);
  afterAll(async () => { await clear(); await connection.end(); });

  it("level 1: the board sees every project, read only; anyone narrower is refused, not narrowed", async () => {
    const view = await callers.board.scopes.company({ tenantId });
    expect(view.readOnly).toBe(true);
    expect(view.projects.map(item => item.code)).toEqual(["SC-A", "SC-B", "SC-C"]);
    const a = view.projects.find(item => item.code === "SC-A")!;
    expect(a.overdueActivities).toBe(1);
    expect(a.pendingQuality).toEqual({ inspectionsAwaitingResult: 1, openNcrs: 1 });
    expect(a.pendingConsultant.submittals).toBe(1);
    expect(a.stock).toEqual({ value: 1000, materialsBelowReorder: 1 });
    expect(view.totals.projectCount).toBe(3);
    expect(view.totals.stockValue).toBe(1000);
    // narrower assignments and wrong roles
    await expect(callers.pmo.scopes.company({ tenantId })).rejects.toThrow(PERM_DENIED);
    await expect(callers.pmA.scopes.company({ tenantId })).rejects.toThrow(PERM_DENIED);
  });

  it("level 2: the PMO lead of a portfolio sees that portfolio's projects and no others", async () => {
    const view = await callers.pmo.scopes.portfolio({ tenantId });
    expect(view.projects.map(item => item.code)).toEqual(["SC-A", "SC-C"]);
    expect(view.totals.projectCount).toBe(2);
    await expect(callers.pmA.scopes.portfolio({ tenantId })).rejects.toThrow(PERM_DENIED);
  });

  it("level 3: a project user sees their project, and is refused another project in the same company", async () => {
    const own = await callers.pmA.scopes.project({ tenantId, projectId: ids.a });
    expect(own.project.code).toBe("SC-A");
    await expect(callers.pmA.scopes.project({ tenantId, projectId: ids.b })).rejects.toThrow(SCOPE_DENIED);
    await expect(callers.pmA.scopes.project({ tenantId, projectId: ids.c })).rejects.toThrow(SCOPE_DENIED);
  });

  it("a permission held on one project is not read as held on another (the pooled-permission trap)", async () => {
    // `split` is a project manager on A and only a warehouse custodian on B: the custodian role has no project.read.
    expect((await callers.split.scopes.project({ tenantId, projectId: ids.a })).project.code).toBe("SC-A");
    await expect(callers.split.scopes.project({ tenantId, projectId: ids.b })).rejects.toThrow(SCOPE_DENIED);
  });

  it("level 4: the warehouse is answered for the custodian's own project and refused for any other", async () => {
    const own = await callers.keeper.scopes.warehouse({ tenantId, projectId: ids.a, warehouseId: warehouseA });
    expect(own.warehouse.code).toBe("WH-A");
    expect(own.totals).toEqual({ materials: 1, stockValue: 1000, materialsBelowReorder: 1 });
    expect(own.stock[0]).toMatchObject({ code: "CEM-1", quantity: 40, value: 1000, reorderLevel: 100, belowReorder: true });
    await expect(callers.keeper.scopes.warehouse({ tenantId, projectId: ids.b, warehouseId: warehouseB })).rejects.toThrow(SCOPE_DENIED);
    // a warehouse of another project under the caller's own project id is not found, not served
    await expect(callers.keeper.scopes.warehouse({ tenantId, projectId: ids.a, warehouseId: warehouseB })).rejects.toThrow("PROJECT_OS_WAREHOUSE_NOT_FOUND");
  });

  it("the project register shows a project-scoped person their own project only (G-143)", async () => {
    expect((await callers.coord.projects.list({ tenantId })).map(item => item.code)).toEqual(["SC-A"]);
    expect((await callers.owner.projects.list({ tenantId })).map(item => item.code).sort()).toEqual(["SC-A", "SC-B", "SC-C"]);
  });

  it("a stranger to the company is refused at every level", async () => {
    const stranger = callerFor(userIds.owner + 100000, "scp-stranger");
    await expect(stranger.scopes.company({ tenantId })).rejects.toThrow();
    await expect(stranger.scopes.project({ tenantId, projectId: ids.a })).rejects.toThrow();
  });
});
