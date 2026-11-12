import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Work order 23, P-18 (D-42 b) on a real database, through the real router, as the restricted application role: the people on a project (put there by the existing
// invitation / role-assignment procedures) and the report chain (prepare / review / approve). Positive, negative, the same-company foreign key held by the database
// itself, and isolation between companies and between projects of one company. Synthetic data only (*.example.test).
const SLUG = "proj-approvers";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@pa.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const A = "a4000000-0000-4000-8000-000000000001";
const B = "a4000000-0000-4000-8000-000000000002";
const KEYS = ["owner", "manager", "engineer", "qc", "elsewhere", "otherOwner"] as const;
type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callers = {} as Record<Key, ReturnType<typeof callerFor>>;
const member = {} as Record<Key, string>;
let connection: fixtureDb.Connection;
let tenantId = ""; let otherTenantId = "";
const count = async (sql: string, params: unknown[]) => Number(((await connection.query<{ n: number }[]>(sql, params))[0] as Array<{ n: number }>)[0].n);

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug IN (?, ?)", [SLUG, `${SLUG}-other`]);
  for (const { id } of companies) {
    for (const table of ["project_report_approvers", "audit_logs", "membership_invitations"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    await connection.query("DELETE FROM roles WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM memberships WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM subscriptions WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM projects WHERE tenantId = ?", [id]);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'pa-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("project team and report approvers on a real database (D-42 b)", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`pa-${key}`, `PA ${key}`, `pa-${key}@pa.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'pa-%'");
    for (const key of KEYS) { ids[key] = rows.find(row => row.openId === `pa-${key}`)!.id; callers[key] = callerFor(ids[key], `pa-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Approvers Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: otherTenantId } = await callers.otherOwner.tenant.create({ legalName: "Other Approvers Co.", slug: `${SLUG}-other`, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'PA-A', 'Approvers A', 'villas', 'SAR', 'active'), (?, ?, 'PA-B', 'Approvers B', 'villas', 'SAR', 'active')", [A, tenantId, B, tenantId]);
    // people are put on the project by the EXISTING assignment procedure (tenant.assignMember / assignMembershipRole with scope «project»)
    const manager = await callers.owner.tenant.createRole({ tenantId, code: "PA_MANAGER", name: "Project manager", productCode: "PROJECT", permissionCodes: ["project.read", "project.manage"] });
    const field = await callers.owner.tenant.createRole({ tenantId, code: "PA_FIELD", name: "Site engineer", productCode: "PROJECT", permissionCodes: ["project.read", "project.field.manage"] });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.manager, roleId: manager.id, scopeType: "project", scopeId: A });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.engineer, roleId: field.id, scopeType: "project", scopeId: A });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.qc, roleId: field.id, scopeType: "project", scopeId: A });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.elsewhere, roleId: field.id, scopeType: "project", scopeId: B }); // a role, but on project B only
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
    const [members] = await connection.query<{ id: string; userId: number; tenantId: string }[]>("SELECT id, userId, tenantId FROM memberships WHERE tenantId IN (?, ?)", [tenantId, otherTenantId]);
    for (const key of KEYS) member[key] = members.find(row => row.userId === ids[key])?.id ?? "";
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("the team of project A is the people whose assignments cover it: the owner (company-wide) and the three on A, not the one on B", async () => {
    const team = await callers.manager.projects.team.list({ tenantId, projectId: A });
    expect(team.map(person => person.userId).sort()).toEqual([ids.owner, ids.manager, ids.engineer, ids.qc].sort());
    expect(team.find(person => person.userId === ids.engineer)?.roles).toEqual([expect.objectContaining({ code: "PA_FIELD", scope: "project" })]);
    expect(await code(callers.engineer.projects.team.list({ tenantId, projectId: A }))).toBe("PROJECT_OS_PERMISSION_DENIED");
  });

  it("the manager sets prepare / review / approve; anyone on the project reads the chain; one audit row per change", async () => {
    expect(await callers.engineer.projects.approvers.get({ tenantId, projectId: A })).toEqual({ prepare: null, review: null, approve: null });
    await callers.manager.projects.approvers.set({ tenantId, projectId: A, step: "prepare", membershipId: member.engineer });
    await callers.manager.projects.approvers.set({ tenantId, projectId: A, step: "review", membershipId: member.qc });
    const chain = await callers.manager.projects.approvers.set({ tenantId, projectId: A, step: "approve", membershipId: member.manager });
    expect(chain).toMatchObject({ prepare: { userId: ids.engineer }, review: { userId: ids.qc }, approve: { userId: ids.manager } });
    // replacing a step keeps one row per step; clearing removes it
    await callers.manager.projects.approvers.set({ tenantId, projectId: A, step: "review", membershipId: member.owner });
    const cleared = await callers.manager.projects.approvers.set({ tenantId, projectId: A, step: "prepare", membershipId: null });
    expect(cleared).toMatchObject({ prepare: null, review: { userId: ids.owner }, approve: { userId: ids.manager } });
    expect((await callers.engineer.projects.approvers.get({ tenantId, projectId: A })).approve?.userId).toBe(ids.manager);
    expect(await count("SELECT COUNT(*) AS n FROM project_report_approvers WHERE tenantId = ? AND projectId = ?", [tenantId, A])).toBe(2);
    expect(await count("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action IN ('project.report_approver_set', 'project.report_approver_cleared')", [tenantId])).toBe(5);
  });

  it("someone with no role on the project, a person of another company, a stranger id and a non-manager are refused; nothing is written", async () => {
    const before = await count("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action LIKE 'project.report_approver_%'", [tenantId]);
    expect(await code(callers.manager.projects.approvers.set({ tenantId, projectId: A, step: "prepare", membershipId: member.elsewhere }))).toBe("PROJECT_OS_PROJECT_APPROVER_NOT_ON_PROJECT");
    expect(await code(callers.manager.projects.approvers.set({ tenantId, projectId: A, step: "prepare", membershipId: member.otherOwner }))).toBe("PROJECT_OS_MEMBER_NOT_FOUND");
    expect(await code(callers.manager.projects.approvers.set({ tenantId, projectId: A, step: "prepare", membershipId: "a4000000-0000-4000-8000-0000000000ff" }))).toBe("PROJECT_OS_MEMBER_NOT_FOUND");
    expect(await code(callers.engineer.projects.approvers.set({ tenantId, projectId: A, step: "prepare", membershipId: member.engineer }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await count("SELECT COUNT(*) AS n FROM project_report_approvers WHERE tenantId = ? AND projectId = ? AND step = 'prepare'", [tenantId, A])).toBe(0);
    expect(await count("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action LIKE 'project.report_approver_%'", [tenantId])).toBe(before);
  });

  it("the database itself refuses a step pointing at another company's person (composite foreign key) and a second row for one step", async () => {
    await expect(connection.query("INSERT INTO project_report_approvers (id, tenantId, projectId, step, membershipId) VALUES (UUID(), ?, ?, 'prepare', ?)", [tenantId, A, member.otherOwner])).rejects.toThrow(/project_report_approvers_membership_tenant_fk/);
    await expect(connection.query("INSERT INTO project_report_approvers (id, tenantId, projectId, step, membershipId) VALUES (UUID(), ?, ?, 'approve', ?)", [tenantId, A, member.qc])).rejects.toThrow(/project_report_approvers_project_step_unique/);
    await expect(connection.query("INSERT INTO project_report_approvers (id, tenantId, projectId, step, membershipId) VALUES (UUID(), ?, ?, 'sign', ?)", [tenantId, A, member.qc])).rejects.toThrow(/project_report_approvers_step_check/);
  });

  it("isolation: another company neither reads nor sets this chain; the manager of A neither reads the team of B nor sets its chain", async () => {
    expect(await code(callers.otherOwner.projects.approvers.get({ tenantId, projectId: A }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(callers.otherOwner.projects.approvers.set({ tenantId, projectId: A, step: "approve", membershipId: member.otherOwner }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(callers.otherOwner.projects.approvers.set({ tenantId: otherTenantId, projectId: A, step: "approve", membershipId: member.otherOwner }))).toBe("PROJECT_OS_PROJECT_NOT_FOUND");
    expect(await code(callers.manager.projects.team.list({ tenantId, projectId: B }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callers.manager.projects.approvers.set({ tenantId, projectId: B, step: "approve", membershipId: member.elsewhere }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await count("SELECT COUNT(*) AS n FROM project_report_approvers WHERE projectId = ? OR tenantId = ?", [B, otherTenantId])).toBe(0);
  });
});
