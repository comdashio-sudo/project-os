import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-17 (205-5, G-162): attendance is the HR manager's and the site engineer's. The site engineer template carries project.attendance.manage, so a
// site engineer passes the attendance check on their project (the call then reaches the employee lookup); the warehouse keeper does not; the project
// manager can still invite someone as site engineer (a project's attendance is site work, not staff data). On a real database, through the real
// router, as the restricted application role. Synthetic data only.
const SLUG = "q17-attendance";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const KEYS = ["owner", "site", "keeper", "pm"] as const;
type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callerFor = (key: Key) => appRouter.createCaller({ user: { id: ids[key], openId: `q17a-${key}`, name: `Q17 ${key}`, email: `q17a-${key}@q17.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const P = "17aa0000-0000-4000-8000-000000000001";
const NO_EMPLOYEE = "17aa0000-0000-4000-8000-0000000000ee";
let connection: fixtureDb.Connection; let tenantId = "";

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [SLUG]);
  for (const { id } of companies) {
    for (const table of ["audit_logs", "membership_invitations", "email_outbox"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q17a-%'");
}
const templateRole = async (roleCode: string) => (await connection.query<{ id: string }[]>("SELECT id FROM roles WHERE tenantId = ? AND code = ?", [tenantId, roleCode]))[0][0]!.id;

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-17 (205-5, G-162): the site engineer records attendance; the project manager still invites site engineers", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q17a-${key}`, `Q17 ${key}`, `q17a-${key}@q17.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q17a-%'");
    for (const key of KEYS) ids[key] = rows.find(row => row.openId === `q17a-${key}`)!.id;
    ({ tenantId } = await callerFor("owner").tenant.create({ legalName: "Q17 Attendance Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q17A-1', 'Attendance one', 'villas', 'SAR', 'active')", [P, tenantId]);
    const owner = callerFor("owner");
    for (const [key, roleCode] of [["site", "SITE_ENGINEER"], ["keeper", "WAREHOUSE_CUSTODIAN"], ["pm", "PROJECT_MANAGER"]] as const) await owner.tenant.assignMember({ tenantId, targetUserId: ids[key], roleId: await templateRole(roleCode), scopeType: "project", scopeId: P });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("POSITIVE: the site engineer passes the attendance check on their project (the call goes on to look the employee up)", async () => {
    expect(await code(callerFor("site").employees.attendance.create({ tenantId, projectId: P, employeeId: NO_EMPLOYEE, attendanceDate: new Date("2026-11-12T00:00:00Z"), attendanceStatus: "present" }))).toMatch(/^PROJECT_OS_(EMPLOYEE_NOT_ACTIVE|ASSIGNMENT_NOT_FOUND)$/);
  });

  it("NEGATIVE: the warehouse keeper does not record attendance", async () => {
    expect(await code(callerFor("keeper").employees.attendance.create({ tenantId, projectId: P, employeeId: NO_EMPLOYEE, attendanceDate: new Date("2026-11-12T00:00:00Z"), attendanceStatus: "present" }))).toBe("PROJECT_OS_PERMISSION_DENIED");
  });

  it("the project manager still invites someone as site engineer on the project (attendance in the role is no longer refused to a project inviter)", async () => {
    expect(await code(callerFor("pm").tenant.createInvitation({ tenantId, email: "q17a-new.site@q17.example.test", roleId: await templateRole("SITE_ENGINEER"), scopeType: "project", scopeId: P }))).toBe("no error");
  });

  it("NEGATIVE: the project manager still cannot give the HR manager's role (staff and pay data)", async () => {
    expect(await code(callerFor("pm").tenant.createInvitation({ tenantId, email: "q17a-new.hr@q17.example.test", roleId: await templateRole("HR_MANAGER"), scopeType: "project", scopeId: P }))).toBe("PROJECT_OS_INVITATION_ROLE_NOT_ALLOWED");
  });
});
