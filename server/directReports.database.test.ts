import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-17 (205-5, G-147): a performance manager sees the indicators of the people who report to them DIRECTLY, and no one else's. HR sets the line
// (employees.setManager): same company, active, not self, no loop, with an audit row. On a real database, through the real router, as the restricted
// application role. Synthetic data only.
const SLUG = "q17-reports";
const SLUG_B = "q17-reports-b";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const KEYS = ["owner", "manager", "lead", "ownerB"] as const;
type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callerFor = (key: Key) => appRouter.createCaller({ user: { id: ids[key], openId: `q17d-${key}`, name: `Q17 ${key}`, email: `q17d-${key}@q17.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const P = "17d10000-0000-4000-8000-000000000001";
const PB = "17d20000-0000-4000-8000-000000000001";
const E = { manager: "17d10000-0000-4000-8000-0000000000e1", report: "17d10000-0000-4000-8000-0000000000e2", other: "17d10000-0000-4000-8000-0000000000e3", lead: "17d10000-0000-4000-8000-0000000000e4", leadReport: "17d10000-0000-4000-8000-0000000000e5", b: "17d20000-0000-4000-8000-0000000000e1" };
const RES = "17d10000-0000-4000-8000-0000000000f1";
let connection: fixtureDb.Connection; let tenantId = ""; let tenantB = "";

async function clear() {
  for (const slug of [SLUG, SLUG_B]) {
    const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug = ?", [slug]);
    for (const { id } of companies) {
      for (const table of ["audit_logs", "employee_assignments", "project_resources", "employees"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE FROM membership_roles WHERE membershipId IN (SELECT id FROM memberships WHERE tenantId = ?)", [id]);
      await connection.query("DELETE FROM role_permissions WHERE roleId IN (SELECT id FROM roles WHERE tenantId = ?)", [id]);
      for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
      await connection.query("DELETE FROM companies WHERE id = ?", [id]);
    }
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q17d-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-17 (205-5, G-147): a manager sees only the performance of their direct reports", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q17d-${key}`, `Q17 ${key}`, `q17d-${key}@q17.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q17d-%'");
    for (const key of KEYS) ids[key] = rows.find(row => row.openId === `q17d-${key}`)!.id;
    ({ tenantId } = await callerFor("owner").tenant.create({ legalName: "Q17 Reports Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    ({ tenantId: tenantB } = await callerFor("ownerB").tenant.create({ legalName: "Q17 Reports Other Co.", slug: SLUG_B, packageCode: "ALL-IN-ONE" }));
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q17D-1', 'Reports one', 'villas', 'SAR', 'active'), (?, ?, 'Q17D-B', 'Other company', 'villas', 'SAR', 'active')", [P, tenantId, PB, tenantB]);
    const owner = callerFor("owner");
    const manager = await owner.tenant.createRole({ tenantId, code: "Q17D_MANAGER", name: "Q17D_MANAGER", productCode: "PROJECT", permissionCodes: ["project.read", "project.performance.manage", "project.performance.read_own"] });
    const lead = await owner.tenant.createRole({ tenantId, code: "Q17D_LEAD", name: "Q17D_LEAD", productCode: "PROJECT", permissionCodes: ["project.read", "project.performance.read_own"] });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.manager, roleId: manager.id, scopeType: "project", scopeId: P });
    await owner.tenant.assignMember({ tenantId, targetUserId: ids.lead, roleId: lead.id, scopeType: "project", scopeId: P });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
    const employee = (id: string, tenant: string, number: string, linkedUserId: number | null) => connection.query("INSERT INTO employees (id, tenantId, employeeNumber, fullName, jobTitle, department, hireDate, employmentStatus, linkedUserId, createdByUserId) VALUES (?, ?, ?, ?, 'Engineer', 'Site', '2024-01-01', 'active', ?, ?)", [id, tenant, number, `Synthetic ${number}`, linkedUserId, ids.owner]);
    await employee(E.manager, tenantId, "Q17D-01", ids.manager);
    await employee(E.report, tenantId, "Q17D-02", null);
    await employee(E.other, tenantId, "Q17D-03", null);
    await employee(E.lead, tenantId, "Q17D-04", ids.lead);
    await employee(E.leadReport, tenantId, "Q17D-05", null);
    await employee(E.b, tenantB, "Q17D-B1", null);
    await connection.query("INSERT INTO project_resources (id, tenantId, projectId, resourceCode, name, resourceType, plannedUnits, allocatedUnits, unitCost, currency, createdByUserId) VALUES (?, ?, ?, 'Q17D-RES', 'Labour', 'labor', 100, 0, 10, 'SAR', ?)", [RES, tenantId, P, ids.owner]);
    for (const [index, employeeId] of [E.manager, E.report, E.other, E.lead, E.leadReport].entries()) await connection.query("INSERT INTO employee_assignments (id, tenantId, projectId, employeeId, projectResourceId, plannedStartAt, plannedFinishAt, plannedHours, status, createdByUserId) VALUES (?, ?, ?, ?, ?, '2026-11-01', '2026-11-30', 100, 'active', ?)", [`17d10000-0000-4000-8000-0000000001a${index}`, tenantId, P, employeeId, RES, ids.owner]);
  });
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("POSITIVE: HR sets the direct manager, with an audit row carrying the previous and the new manager", async () => {
    expect(await callerFor("owner").employees.setManager({ tenantId, employeeId: E.report, reportsToEmployeeId: E.manager })).toEqual({ id: E.report, reportsToEmployeeId: E.manager });
    await callerFor("owner").employees.setManager({ tenantId, employeeId: E.leadReport, reportsToEmployeeId: E.lead });
    const [audit] = await connection.query<{ metadata: string }[]>("SELECT metadata FROM audit_logs WHERE tenantId = ? AND action = 'hr.employee_manager_set' AND entityId = ?", [tenantId, E.report]);
    expect(audit.map(row => JSON.parse(row.metadata))).toEqual([{ previousManagerEmployeeId: null, managerEmployeeId: E.manager }]);
    expect((await callerFor("owner").employees.list({ tenantId })).find(row => row.id === E.report)?.reportsToEmployeeId).toBe(E.manager);
  });

  it("NEGATIVE: self, a loop, a manager of another company, and a caller without HR are all refused, and nothing changes", async () => {
    const owner = callerFor("owner");
    expect(await code(owner.employees.setManager({ tenantId, employeeId: E.report, reportsToEmployeeId: E.report }))).toBe("PROJECT_OS_EMPLOYEE_MANAGER_SELF");
    expect(await code(owner.employees.setManager({ tenantId, employeeId: E.manager, reportsToEmployeeId: E.report }))).toBe("PROJECT_OS_EMPLOYEE_MANAGER_LOOP");
    expect(await code(owner.employees.setManager({ tenantId, employeeId: E.other, reportsToEmployeeId: E.b }))).toBe("PROJECT_OS_EMPLOYEE_MANAGER_INVALID");
    expect(await code(callerFor("manager").employees.setManager({ tenantId, employeeId: E.other, reportsToEmployeeId: E.manager }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    const [[row]] = await connection.query<{ n: number }[]>("SELECT count(*)::int AS n FROM employees WHERE tenantId = ? AND reportsToEmployeeId IS NOT NULL", [tenantId]);
    expect(row.n).toBe(2);
  });

  it("POSITIVE: the manager lists their direct report and reads that report's indicators", async () => {
    expect((await callerFor("manager").performance.directReports({ tenantId, projectId: P })).map(row => row.id)).toEqual([E.report]);
    const performance = await callerFor("manager").performance.get({ tenantId, projectId: P, employeeId: E.report });
    expect(performance.employee).toMatchObject({ id: E.report, isOwn: false });
  });

  it("NEGATIVE: the manager does not read an employee who does not report to them", async () => {
    expect(await code(callerFor("manager").performance.get({ tenantId, projectId: P, employeeId: E.other }))).toBe("PROJECT_OS_PERFORMANCE_SELF_ONLY");
  });

  it("NEGATIVE: a direct manager without project.performance.manage still sees only their own", async () => {
    expect(await code(callerFor("lead").performance.get({ tenantId, projectId: P, employeeId: E.leadReport }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callerFor("lead").performance.directReports({ tenantId, projectId: P }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect((await callerFor("lead").performance.get({ tenantId, projectId: P })).employee).toMatchObject({ id: E.lead, isOwn: true });
  });

  it("ISOLATION: the manager of one company reaches nothing of another", async () => {
    expect(await code(callerFor("manager").performance.directReports({ tenantId: tenantB, projectId: PB }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(callerFor("manager").performance.get({ tenantId: tenantB, projectId: PB, employeeId: E.b }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
  });
});
