import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-12 (d) on a real database, through the real router, as the restricted application role: a planning engineer given the ready-made template for the WHOLE company
// (it now carries project.create) creates a project, writes its profile and companies, and invites its project manager. The same template given on ONE project sets
// nothing up and still cannot give the project manager's role; a site engineer cannot create; staff-data roles stay refused; another company's planner touches
// nothing here. Synthetic data only (*.example.test).
const SLUG = "q12d-setup";
const A = "c1400000-0000-4000-8000-000000000001";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@ps.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const KEYS = ["owner", "planner", "scoped", "site", "outsider"] as const;
type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callers = {} as Record<Key, ReturnType<typeof callerFor>>;
let connection: fixtureDb.Connection; let tenantId = ""; let otherTenantId = "";
const roleIds: Record<string, string> = {};
const profile = { location: "Synthetic district", contractNumber: "C-001", clientName: "Client Co.", consultantName: "Consultant Co.", contractorName: "Contractor Co.", workDays: [0, 1, 2, 3, 4], workStart: "07:00", workEnd: "17:00", reportPrefix: "PS" };

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug LIKE ?", [`${SLUG}%`]);
  for (const { id } of companies) {
    for (const table of ["email_outbox", "audit_logs", "membership_invitations", "project_companies", "project_profiles"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'ps-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("a planning engineer sets a project up (Q-12 d)", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`ps-${key}`, `PS ${key}`, `ps-${key}@ps.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'ps-%'");
    for (const key of KEYS) { ids[key] = rows.find(row => row.openId === `ps-${key}`)!.id; callers[key] = callerFor(ids[key], `ps-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Project Setup Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: otherTenantId } = await callers.outsider.tenant.create({ legalName: "Other Setup Co.", slug: `${SLUG}-other`, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'PS-A', 'Existing project', 'villas', 'SAR', 'active')", [A, tenantId]);
    await callers.owner.tenant.administration({ tenantId }); // installs the ready-made role templates
    await callers.outsider.tenant.administration({ tenantId: otherTenantId });
    const [roleRows] = await connection.query<{ id: string; code: string }[]>("SELECT id, code FROM roles WHERE tenantId = ?", [tenantId]);
    for (const row of roleRows as Array<{ id: string; code: string }>) roleIds[row.code] = row.id;
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.planner, roleId: roleIds.PLANNING_ENGINEER, scopeType: "company" });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.scoped, roleId: roleIds.PLANNING_ENGINEER, scopeType: "project", scopeId: A });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.site, roleId: roleIds.SITE_ENGINEER, scopeType: "company" });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
  }, 60_000);
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  let created = "";
  it("the company-wide planner creates a project (audited); the project-scoped planner and a site engineer are refused and nothing is written", async () => {
    ({ id: created } = await callers.planner.projects.create({ tenantId, code: "PS-NEW", name: "New villas", projectType: "villas", currency: "SAR" }));
    const [audit] = await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND entityId = ? AND action = 'project.created' AND actorUserId = ?", [tenantId, created, ids.planner]);
    expect(Number(audit[0].n)).toBe(1);
    expect(await code(callers.scoped.projects.create({ tenantId, code: "PS-X1", name: "Refused", projectType: "villas", currency: "SAR" }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callers.site.projects.create({ tenantId, code: "PS-X2", name: "Refused", projectType: "villas", currency: "SAR" }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    const [refused] = await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM projects WHERE tenantId = ? AND code IN ('PS-X1','PS-X2')", [tenantId]);
    expect(Number(refused[0].n)).toBe(0);
  });

  it("the planner writes the new project's profile and adds its main contractor; a site engineer may not", async () => {
    const saved = await callers.planner.projects.profile.save({ tenantId, projectId: created, ...profile });
    expect(saved.clientName).toBe("Client Co.");
    await callers.planner.projects.companies.save({ tenantId, projectId: created, name: "Main Contractor Co.", role: "main" });
    expect((await callers.planner.projects.companies.list({ tenantId, projectId: created })).map(company => `${company.role}:${company.name}`)).toEqual(["main:Main Contractor Co."]);
    expect(await code(callers.site.projects.profile.save({ tenantId, projectId: created, ...profile }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callers.site.projects.companies.save({ tenantId, projectId: created, name: "Refused Co.", role: "sub" }))).toBe("PROJECT_OS_PERMISSION_DENIED");
  });

  it("the planner may give the project manager's role on the new project; staff-data and company roles stay refused", async () => {
    const offered = (await callers.planner.projects.team.invitableRoles({ tenantId, projectId: created })).map(role => role.id);
    expect(offered).toContain(roleIds.PROJECT_MANAGER);
    for (const refused of ["HR_MANAGER", "PLANNING_ENGINEER", "TENANT_OWNER"]) expect(offered).not.toContain(roleIds[refused]);
    const result = await callers.planner.tenant.createInvitation({ tenantId, email: "pm@ps.example.test", roleId: roleIds.PROJECT_MANAGER, scopeType: "project", scopeId: created });
    expect(result.inviteToken).toBeTruthy();
    for (const refused of ["HR_MANAGER", "PLANNING_ENGINEER"]) expect(await code(callers.planner.tenant.createInvitation({ tenantId, email: `x-${refused.toLowerCase()}@ps.example.test`, roleId: roleIds[refused], scopeType: "project", scopeId: created }))).toBe("PROJECT_OS_INVITATION_ROLE_NOT_ALLOWED");
  });

  it("the project-scoped planner still cannot give the project manager's role", async () => {
    expect((await callers.scoped.projects.team.invitableRoles({ tenantId, projectId: A })).map(role => role.id)).not.toContain(roleIds.PROJECT_MANAGER);
    expect(await code(callers.scoped.tenant.createInvitation({ tenantId, email: "pm2@ps.example.test", roleId: roleIds.PROJECT_MANAGER, scopeType: "project", scopeId: A }))).toBe("PROJECT_OS_INVITATION_ROLE_NOT_ALLOWED");
  });

  it("two companies: the other company's owner can neither create here nor write this project's profile", async () => {
    expect(await code(callers.outsider.projects.create({ tenantId, code: "PS-X3", name: "Refused", projectType: "villas", currency: "SAR" }))).not.toBe("no error");
    expect(await code(callers.outsider.projects.profile.save({ tenantId, projectId: created, ...profile }))).not.toBe("no error");
    expect(await code(callers.outsider.projects.profile.save({ tenantId: otherTenantId, projectId: created, ...profile }))).not.toBe("no error");
  });
});
