import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-33 (adviser 18-11): the project manager template carries project.read, as the field roles do since 205-3 — 205-1 made project.read money-free, and
// the project manager's own money (budget, cash flow, profit) stays where ROLE_MATRIX already puts it. A company that existed with the old template gets
// it by itself at the next administration read, with an audit row (the 205-3 path; no migration); the project manager then opens the controls page of
// his project and sees its money; the warehouse keeper still does not open it; a project manager scoped to another project does not open this one; a
// second company is untouched. On a real database, through the real router, as the restricted application role. Synthetic data only.
const SLUG = "q33-pm-read";
const SLUG_B = "q33-pm-read-b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const KEYS = ["owner", "pm", "pmElsewhere", "keeper", "ownerB"] as const;
type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callerFor = (key: Key) => appRouter.createCaller({ user: { id: ids[key], openId: `q33p-${key}`, name: `Q33 ${key}`, email: `q33p-${key}@q33p.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const P = "33d00000-0000-4000-8000-000000000001";
const P2 = "33d00000-0000-4000-8000-000000000002";
const PB = "33e00000-0000-4000-8000-000000000001";
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
  await connection.query("DELETE FROM users WHERE openId LIKE 'q33p-%'");
}
const templateRole = async (tenant: string, roleCode: string) => (await connection.query<{ id: string }[]>("SELECT id FROM roles WHERE tenantId = ? AND code = ?", [tenant, roleCode]))[0][0]!.id;
const holds = async (tenant: string, roleCode: string, permission: string) => (await connection.query<{ n: number }[]>("SELECT count(*)::int AS n FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId INNER JOIN permissions p ON p.id = rp.permissionId WHERE r.tenantId = ? AND r.code = ? AND p.code = ?", [tenant, roleCode, permission]))[0][0]!.n === 1;

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-33: the project manager opens his project, with its money", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q33p-${key}`, `Q33 ${key}`, `q33p-${key}@q33p.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q33p-%'");
    for (const key of KEYS) ids[key] = rows.find(row => row.openId === `q33p-${key}`)!.id;
    ({ tenantId } = await callerFor("owner").tenant.create({ legalName: "Q33 PM Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: tenantB } = await callerFor("ownerB").tenant.create({ legalName: "Q33 PM Other Co.", slug: SLUG_B, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status, currentBudget) VALUES (?, ?, 'Q33P-1', 'PM one', 'villas', 'SAR', 'active', 900), (?, ?, 'Q33P-2', 'PM two', 'villas', 'SAR', 'active', 500), (?, ?, 'Q33P-B', 'Other company', 'villas', 'SAR', 'active', 700)", [P, tenantId, P2, tenantId, PB, tenantB]);
    // the company as it was BEFORE this change: its project manager template without project.read
    await connection.query("DELETE FROM role_permissions WHERE roleId IN (SELECT id FROM roles WHERE tenantId = ? AND code = 'PROJECT_MANAGER') AND permissionId = (SELECT id FROM permissions WHERE code = 'project.read')", [tenantId]);
    const owner = callerFor("owner");
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.pm, roleId: await templateRole(tenantId, "PROJECT_MANAGER"), scopeType: "project", scopeId: P });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.pmElsewhere, roleId: await templateRole(tenantId, "PROJECT_MANAGER"), scopeType: "project", scopeId: P2 });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.keeper, roleId: await templateRole(tenantId, "WAREHOUSE_CUSTODIAN"), scopeType: "project", scopeId: P });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("before the sync, the old template does not open the controls page", async () => {
    expect(await holds(tenantId, "PROJECT_MANAGER", "project.read")).toBe(false);
    expect(await code(callerFor("pm").projects.getControls({ tenantId, projectId: P }))).toBe("PROJECT_OS_PERMISSION_DENIED");
  });

  it("POSITIVE: the administration read brings project.read to the project manager template, with an audit row", async () => {
    await callerFor("owner").tenant.administration({ tenantId });
    expect(await holds(tenantId, "PROJECT_MANAGER", "project.read")).toBe(true);
    const [audit] = await connection.query<{ metadata: string }[]>("SELECT metadata FROM audit_logs WHERE tenantId = ? AND action = 'role_template.permission_added'", [tenantId]);
    expect(audit.map(row => JSON.parse(row.metadata) as { role: string; permission: string }).filter(row => row.permission === "project.read").map(row => row.role)).toEqual(["PROJECT_MANAGER"]);
  });

  it("the project manager then opens his project's controls and the register, and sees its money as before", async () => {
    const controls = await callerFor("pm").projects.getControls({ tenantId, projectId: P });
    expect(controls.moneyVisible).toBe(true);
    expect(Number(controls.project.currentBudget)).toBe(900);
    expect((await callerFor("pm").projects.list({ tenantId })).map(project => project.code)).toEqual(["Q33P-1"]);
  });

  it("NEGATIVE: the keeper still does not open the project, and a project manager of another project does not open this one", async () => {
    expect(await holds(tenantId, "WAREHOUSE_CUSTODIAN", "project.read")).toBe(false);
    expect(await code(callerFor("keeper").projects.getControls({ tenantId, projectId: P }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callerFor("pmElsewhere").projects.getControls({ tenantId, projectId: P }))).toBe("PROJECT_OS_PERMISSION_DENIED");
  });

  it("ISOLATION: the project manager of one company reaches nothing of another", async () => {
    expect(await code(callerFor("pm").projects.getControls({ tenantId: tenantB, projectId: PB }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await holds(tenantB, "PROJECT_MANAGER", "project.read")).toBe(true); // the new company is born with the new template
  });
});
