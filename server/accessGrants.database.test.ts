import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// G-142 (D-18) on a real database, through the real router, as the restricted application role: one person is a VIEWER on project A and a
// MANAGER on project B of the same company. A write on A is refused and writes nothing; the same write on B is accepted. On main @ 935516d the
// writes on A were accepted (the snapshot pooled the manager's permissions with the viewer's scope). Synthetic data only.
const SLUG = "access-grants";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@ag.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const A = "a3000000-0000-4000-8000-000000000001";
const B = "a3000000-0000-4000-8000-000000000002";
const KEYS = ["owner", "mixed", "outsider"] as const;
type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callers = {} as Record<Key, ReturnType<typeof callerFor>>;
let connection: fixtureDb.Connection;
let tenantId = ""; let otherTenantId = "";
const count = async (sql: string, params: unknown[]) => Number(((await connection.query<{ n: number }[]>(sql, params))[0] as Array<{ n: number }>)[0].n);

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug IN (?, ?)", [SLUG, `${SLUG}-other`]);
  for (const { id } of companies) {
    for (const table of ["risks", "contracts", "audit_logs", "membership_invitations"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    await connection.query("DELETE FROM roles WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM memberships WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM subscriptions WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM projects WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'ag-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("permissions travel with their scope (G-142, D-18) on a real database", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`ag-${key}`, `AG ${key}`, `ag-${key}@ag.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'ag-%'");
    for (const key of KEYS) { ids[key] = rows.find(row => row.openId === `ag-${key}`)!.id; callers[key] = callerFor(ids[key], `ag-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Grants Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: otherTenantId } = await callers.outsider.tenant.create({ legalName: "Other Grants Co.", slug: `${SLUG}-other`, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'AG-A', 'Project A', 'villas', 'SAR', 'active'), (?, ?, 'AG-B', 'Project B', 'villas', 'SAR', 'active')", [A, tenantId, B, tenantId]);
    // viewer on A (PROJECT + PMO read), manager on B (PROJECT manage and commitments + PMO write): two assignments of one membership
    const viewer = await callers.owner.tenant.createRole({ tenantId, code: "AG_VIEWER", name: "Viewer", productCode: "PROJECT", permissionCodes: ["project.read"] });
    const pmoViewer = await callers.owner.tenant.createRole({ tenantId, code: "AG_PMO_VIEWER", name: "PMO viewer", productCode: "PMO", permissionCodes: ["pmo.read"] });
    const manager = await callers.owner.tenant.createRole({ tenantId, code: "AG_MANAGER", name: "Manager", productCode: "PROJECT", permissionCodes: ["project.read", "project.manage", "project.commitment.manage"] });
    const pmoWriter = await callers.owner.tenant.createRole({ tenantId, code: "AG_PMO_WRITER", name: "PMO writer", productCode: "PMO", permissionCodes: ["pmo.read", "pmo.write"] });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.mixed, roleId: viewer.id, scopeType: "project", scopeId: A });
    const [[membership]] = await connection.query<{ id: string }[]>("SELECT id FROM memberships WHERE tenantId = ? AND userId = ?", [tenantId, ids.mixed]) as unknown as [{ id: string }[]];
    for (const [roleId, projectId] of [[pmoViewer.id, A], [manager.id, B], [pmoWriter.id, B]] as const) await callers.owner.tenant.assignMembershipRole({ tenantId, membershipId: membership.id, roleId, scopeType: "project", scopeId: projectId });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  const contract = (projectId: string, suffix: string) => ({ tenantId, projectId, code: `AG-C-${suffix}`, title: `Contract ${suffix}`, counterparty: "Example Supplier Co.", contractValue: 1000, currency: "SAR" as const });
  const risk = (projectId: string, suffix: string) => ({ tenantId, projectId, code: `AG-R-${suffix}`, title: `Risk ${suffix}`, probability: 3, severity: 3 });

  it("a write on A (where the person only views) is refused and writes no row", async () => {
    expect(await code(callers.mixed.contracts.create(contract(A, "A")))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callers.mixed.pmo.createRisk(risk(A, "A")))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await count("SELECT COUNT(*) AS n FROM contracts WHERE tenantId = ? AND projectId = ?", [tenantId, A])).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM risks WHERE tenantId = ? AND projectId = ?", [tenantId, A])).toBe(0);
  });

  it("the same write on B (where the person manages) is accepted", async () => {
    expect(await code(callers.mixed.contracts.create(contract(B, "B")))).toBe("no error");
    expect(await code(callers.mixed.pmo.createRisk(risk(B, "B")))).toBe("no error");
    expect(await count("SELECT COUNT(*) AS n FROM contracts WHERE tenantId = ? AND projectId = ?", [tenantId, B])).toBe(1);
    expect(await count("SELECT COUNT(*) AS n FROM risks WHERE tenantId = ? AND projectId = ?", [tenantId, B])).toBe(1);
  });

  it("reading A still works, and what the screen is told it may do follows the project: no team hours on A, team hours on B", async () => {
    expect((await callers.mixed.fieldEntry.context({ tenantId, projectId: A })).can.logTeamHours).toBe(false);
    expect((await callers.mixed.fieldEntry.context({ tenantId, projectId: B })).can.logTeamHours).toBe(true);
    expect((await callers.mixed.contracts.getProjectRegister({ tenantId, projectId: A })).contracts).toEqual([]);
  });

  it("someone from another company is refused as before", async () => {
    expect(await code(callers.outsider.contracts.create(contract(A, "X")))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(callers.outsider.pmo.createRisk({ ...risk(A, "X"), tenantId: otherTenantId }))).toBe("PROJECT_OS_PROJECT_NOT_FOUND");
    expect(await count("SELECT COUNT(*) AS n FROM contracts WHERE code = 'AG-C-X'", [])).toBe(0);
  });
});
