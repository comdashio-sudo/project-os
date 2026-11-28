import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Q-38 batch 2 on a real database, through the real router, as the restricted application role: whoever sets salary structures (project.payroll.structure for
// the whole company, without the employee register) reads the active employees' number and name — nothing else — and sets a structure; the full register stays
// project.hr.manage; someone with the register only, and another company, are refused this list. Synthetic data only (*.example.test).
const SLUG = "q38-payroll-list";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@q38.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const KEYS = ["owner", "payroll", "hr", "outsider"] as const;
type Key = (typeof KEYS)[number];
const ids = {} as Record<Key, number>;
const callers = {} as Record<Key, ReturnType<typeof callerFor>>;
let connection: fixtureDb.Connection; let tenantId = ""; let active = ""; let archived = "";

async function clear() {
  const [companies] = await connection.query<{ id: string }[]>("SELECT id FROM companies WHERE slug LIKE ?", [`${SLUG}%`]);
  for (const { id } of companies) {
    for (const table of ["audit_logs", "salary_structures", "employees", "membership_invitations"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
    await connection.query("DELETE mr FROM membership_roles mr INNER JOIN memberships m ON m.id = mr.membershipId WHERE m.tenantId = ?", [id]);
    await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [id]);
    for (const table of ["role_template_removals", "roles", "memberships", "tenant_entitlements", "tenant_licenses", "subscriptions", "projects"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [id]).catch(() => undefined);
    await connection.query("DELETE FROM companies WHERE id = ?", [id]);
  }
  await connection.query("DELETE FROM users WHERE openId LIKE 'q38-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-38 batch 2: the employees whoever sets salary structures may choose from", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${KEYS.map(() => "(?, ?, ?, 'user')").join(",")}`, KEYS.flatMap(key => [`q38-${key}`, `Q38 ${key}`, `q38-${key}@q38.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q38-%'");
    for (const key of KEYS) { ids[key] = rows.find(row => row.openId === `q38-${key}`)!.id; callers[key] = callerFor(ids[key], `q38-${key}`); }
    ({ tenantId } = await callers.owner.tenant.create({ legalName: "Q38 Payroll Co.", slug: SLUG, packageCode: "ALL-IN-ONE" }));
    await callers.outsider.tenant.create({ legalName: "Q38 Other Co.", slug: `${SLUG}-other`, packageCode: "ALL-IN-ONE" });
    const structureOnly = await callers.owner.tenant.createRole({ tenantId, code: "Q38_STRUCTURE_ONLY", name: "Structure only (synthetic)", productCode: "PROJECT", permissionCodes: ["project.payroll.structure"] }) as { id: string };
    const registerOnly = await callers.owner.tenant.createRole({ tenantId, code: "Q38_REGISTER_ONLY", name: "Register only (synthetic)", productCode: "PROJECT", permissionCodes: ["project.hr.manage"] }) as { id: string };
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.payroll, roleId: structureOnly.id, scopeType: "company" });
    await callers.owner.tenant.assignMember({ tenantId, targetUserId: ids.hr, roleId: registerOnly.id, scopeType: "company" });
    await connection.query("UPDATE memberships SET status = 'active' WHERE tenantId = ?", [tenantId]);
    const make = (employeeNumber: string, fullName: string) => callers.owner.employees.create({ tenantId, employeeNumber, fullName, jobTitle: "Technician", department: "Site", hireDate: new Date("2026-01-01"), identityDocumentType: "residence", identityReference: "Q38-ID-SYNTHETIC" }) as Promise<{ id: string }>;
    active = (await make("Q38-E1", "Employee One (synthetic)")).id;
    archived = (await make("Q38-E2", "Employee Two (synthetic)")).id;
    await callers.owner.employees.archive({ tenantId, employeeId: archived });
  }, 120_000);
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("POSITIVE: the structure setter reads the active employees' number and name only, and sets a structure for one of them", async () => {
    const list = await callers.payroll.employees.payroll.salaryStructure.employees({ tenantId });
    expect(list).toEqual([{ id: active, employeeNumber: "Q38-E1", fullName: "Employee One (synthetic)" }]); // no identity, contact, salary or HR field; the archived one is not offered
    await callers.payroll.employees.payroll.salaryStructure.save({ tenantId, employeeId: active, baseSalary: 5000, housingAllowance: 1000, transportAllowance: 300, hardshipAllowance: 0, gosiRate: 0.0975, otherDeductions: 0, eosMonthlyAccrual: 0, currency: "SAR" });
    const [saved] = await connection.query<{ n: number }[]>("SELECT COUNT(*) AS n FROM salary_structures WHERE tenantId = ? AND employeeId = ?", [tenantId, active]);
    expect(Number((saved as Array<{ n: number }>)[0].n)).toBe(1);
  });

  it("NEGATIVE: the full register stays project.hr.manage; the register holder, and another company, are refused this list", async () => {
    expect(await code(callers.payroll.employees.list({ tenantId }))).not.toBe("no error");
    expect(await code(callers.hr.employees.payroll.salaryStructure.employees({ tenantId }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    expect(await code(callers.outsider.employees.payroll.salaryStructure.employees({ tenantId }))).not.toBe("no error");
  });
});
