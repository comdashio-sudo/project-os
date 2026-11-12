import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-12 (c) on a real database, through the real router, as the restricted application role: a planning engineer on project A (the ready-made template, which now carries
// project.team.invite) invites a site engineer onto A; the same person cannot invite onto B, company-wide, or with a role the rule refuses; another company's owner cannot
// either. Synthetic data only (*.example.test).
const SLUG = "q12-planner-invite";
const A = "c1300000-0000-4000-8000-000000000001";
const B = "c1300000-0000-4000-8000-000000000002";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@pi.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const KEYS = ["owner", "planner", "outsider"] as const;
type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callers = {} as Record<Key, ReturnType<typeof callerFor>>;
let connection: fixtureDb.Connection; let tenantId = ""; let otherTenantId = "";
const roleIds: Record<string, string> = {};
const invitations = async (email: string) => Number(((await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM membership_invitations WHERE email = ?", [email]))[0] as Array<{ n: number }>)[0].n);

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug LIKE ?", [`${SLUG}%`]);
  for (const { id } of companies) {
    for (const table of ["email_outbox", "audit_logs", "membership_invitations"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'pi-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("a planning engineer invites the project team (Q-12 c)", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`pi-${key}`, `PI ${key}`, `pi-${key}@pi.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'pi-%'");
    for (const key of KEYS) { ids[key] = rows.find(row => row.openId === `pi-${key}`)!.id; callers[key] = callerFor(ids[key], `pi-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Planner Invite Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: otherTenantId } = await callers.outsider.tenant.create({ legalName: "Other Planner Co.", slug: `${SLUG}-other`, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'PI-A', 'Project A', 'villas', 'SAR', 'active'), (?, ?, 'PI-B', 'Project B', 'villas', 'SAR', 'active')", [A, tenantId, B, tenantId]);
    await callers.owner.tenant.administration({ tenantId }); // installs the ready-made role templates
    const [roleRows] = await connection.query<{ id: string; code: string }[]>("SELECT id, code FROM roles WHERE tenantId = ?", [tenantId]);
    for (const row of roleRows as Array<{ id: string; code: string }>) roleIds[row.code] = row.id;
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.planner, roleId: roleIds.PLANNING_ENGINEER, scopeType: "project", scopeId: A });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("POSITIVE: the planning engineer of A invites a site engineer onto A, sees the team, and is offered only allowed roles", async () => {
    const result = await callers.planner.tenant.createInvitation({ tenantId, email: "site.a@pi.example.test", roleId: roleIds.SITE_ENGINEER, scopeType: "project", scopeId: A });
    expect(result.inviteToken.length).toBeGreaterThanOrEqual(32);
    expect((await callers.planner.projects.team.invitations({ tenantId, projectId: A })).map(item => item.email)).toEqual(["site.a@pi.example.test"]);
    const offered = (await callers.planner.projects.team.invitableRoles({ tenantId, projectId: A })).map(role => role.id);
    expect(offered).toContain(roleIds.SITE_ENGINEER);
    for (const refused of ["PLANNING_ENGINEER", "PROJECT_MANAGER", "HR_MANAGER", "TENANT_OWNER"]) expect(offered).not.toContain(roleIds[refused]);
  });

  it("NEGATIVE: the planning engineer cannot invite onto B, company-wide, or with a refused role; nothing is written", async () => {
    expect(await code(callers.planner.tenant.createInvitation({ tenantId, email: "x1@pi.example.test", roleId: roleIds.SITE_ENGINEER, scopeType: "project", scopeId: B }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callers.planner.tenant.createInvitation({ tenantId, email: "x2@pi.example.test", roleId: roleIds.SITE_ENGINEER, scopeType: "company" }))).not.toBe("no error");
    for (const refused of ["PROJECT_MANAGER", "HR_MANAGER", "TENANT_OWNER"]) expect(await code(callers.planner.tenant.createInvitation({ tenantId, email: `x-${refused.toLowerCase()}@pi.example.test`, roleId: roleIds[refused], scopeType: "project", scopeId: A }))).toBe("PROJECT_OS_INVITATION_ROLE_NOT_ALLOWED");
    expect(await code(callers.planner.projects.team.list({ tenantId, projectId: B }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    for (const email of ["x1@pi.example.test", "x2@pi.example.test", "x-project_manager@pi.example.test", "x-hr_manager@pi.example.test", "x-tenant_owner@pi.example.test"]) expect(await invitations(email)).toBe(0);
  });

  it("NEGATIVE: another company's owner cannot invite onto A, nor see its team", async () => {
    expect(await code(callers.outsider.tenant.createInvitation({ tenantId, email: "x3@pi.example.test", roleId: roleIds.SITE_ENGINEER, scopeType: "project", scopeId: A }))).not.toBe("no error");
    expect(await code(callers.outsider.tenant.createInvitation({ tenantId: otherTenantId, email: "x3@pi.example.test", roleId: roleIds.SITE_ENGINEER, scopeType: "project", scopeId: A }))).not.toBe("no error");
    expect(await code(callers.outsider.projects.team.invitableRoles({ tenantId, projectId: A }))).not.toBe("no error");
    expect(await invitations("x3@pi.example.test")).toBe(0);
  });
});
