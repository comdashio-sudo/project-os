import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-17 (205-3): the site engineer and the HSE manager templates carry project.read. A company that already existed with the old template gets it by
// itself at the next administration read, with an audit row; the site engineer then opens the project but still sees none of its money (205-1); the
// warehouse keeper (not a field role) still does not open it; and a second company is untouched. On a real database, through the real router, as the
// restricted application role. Synthetic data only.
const SLUG = "q17-field";
const SLUG_B = "q17-field-b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const KEYS = ["owner", "site", "keeper", "ownerB"] as const;
type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callerFor = (key: Key) => appRouter.createCaller({ user: { id: ids[key], openId: `q17f-${key}`, name: `Q17 ${key}`, email: `q17f-${key}@q17.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const P = "17e00000-0000-4000-8000-000000000001";
const PB = "17f00000-0000-4000-8000-000000000001";
let connection: fixtureDb.Connection; let tenantId = ""; let tenantB = "";

async function clear() {
  for (const slug of [SLUG, SLUG_B]) {
    const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [slug]);
    for (const { id } of companies) {
      await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [id]);
      await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
      await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
      for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE FROM companies WHERE id = ?", [id]);
    }
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q17f-%'");
}
const templateRole = async (tenant: string, roleCode: string) => (await connection.query<{ id: string }[]>("SELECT id FROM roles WHERE tenantId = ? AND code = ?", [tenant, roleCode]))[0][0]!.id;
const holds = async (tenant: string, roleCode: string, permission: string) => (await connection.query<{ n: number }[]>("SELECT count(*)::int AS n FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId INNER JOIN permissions p ON p.id = rp.permissionId WHERE r.tenantId = ? AND r.code = ? AND p.code = ?", [tenant, roleCode, permission]))[0][0]!.n === 1;

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-17 (205-3): the field roles open the project, without its money", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q17f-${key}`, `Q17 ${key}`, `q17f-${key}@q17.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q17f-%'");
    for (const key of KEYS) ids[key] = rows.find(row => row.openId === `q17f-${key}`)!.id;
    ({ tenantId } = await callerFor("owner").tenant.create({ legalName: "Q17 Field Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: tenantB } = await callerFor("ownerB").tenant.create({ legalName: "Q17 Field Other Co.", slug: SLUG_B, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status, currentBudget) VALUES (?, ?, 'Q17F-1', 'Field one', 'villas', 'SAR', 'active', 900), (?, ?, 'Q17F-B', 'Other company', 'villas', 'SAR', 'active', 700)", [P, tenantId, PB, tenantB]);
    // the company as it was BEFORE this change: its site engineer and HSE templates without project.read
    for (const roleCode of ["SITE_ENGINEER", "HSE_MANAGER"]) await connection.query("DELETE FROM role_permissions WHERE roleId IN (SELECT id FROM roles WHERE tenantId = ? AND code = ?) AND permissionId = (SELECT id FROM permissions WHERE code = 'project.read')", [tenantId, roleCode]);
    const owner = callerFor("owner");
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.site, roleId: await templateRole(tenantId, "SITE_ENGINEER"), scopeType: "project", scopeId: P });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.keeper, roleId: await templateRole(tenantId, "WAREHOUSE_CUSTODIAN"), scopeType: "project", scopeId: P });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("before the sync, the old template does not open the project", async () => {
    expect(await holds(tenantId, "SITE_ENGINEER", "project.read")).toBe(false);
    expect(await code(callerFor("site").projects.getControls({ tenantId, projectId: P }))).toBe("PROJECT_OS_PERMISSION_DENIED");
  });

  it("POSITIVE: the administration read brings project.read to both field templates, with an audit row each", async () => {
    await callerFor("owner").tenant.administration({ tenantId });
    for (const roleCode of ["SITE_ENGINEER", "HSE_MANAGER"]) expect(await holds(tenantId, roleCode, "project.read"), roleCode).toBe(true);
    const [audit] = await connection.query<{ metadata: string }[]>("SELECT metadata FROM audit_logs WHERE tenantId = ? AND action = 'role_template.permission_added'", [tenantId]);
    const added = audit.map(row => JSON.parse(row.metadata) as { role: string; permission: string }).filter(row => row.permission === "project.read").map(row => row.role).sort();
    expect(added).toEqual(["HSE_MANAGER", "SITE_ENGINEER"]);
  });

  it("the site engineer then opens the project and its schedule, and still sees none of its money", async () => {
    const controls = await callerFor("site").projects.getControls({ tenantId, projectId: P });
    expect(controls.moneyVisible).toBe(false);
    expect(controls.project.currentBudget).toBeNull();
    expect((await callerFor("site").projects.list({ tenantId })).map(project => [project.code, project.currentBudget])).toEqual([["Q17F-1", null]]);
  });

  it("NEGATIVE: the warehouse keeper (not a field role) still does not open the project", async () => {
    expect(await holds(tenantId, "WAREHOUSE_CUSTODIAN", "project.read")).toBe(false);
    expect(await code(callerFor("keeper").projects.getControls({ tenantId, projectId: P }))).toBe("PROJECT_OS_PERMISSION_DENIED");
  });

  it("ISOLATION: the field role of one company reaches nothing of another", async () => {
    expect(await code(callerFor("site").projects.getControls({ tenantId: tenantB, projectId: PB }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
  });
});
