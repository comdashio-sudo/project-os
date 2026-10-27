import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";

// Work order 3, decisions 3 to 5: the month's loaded pay is shared out by approved hours; a person may adjust a share only with a reason;
// the employer's insurance depends on nationality; end of service follows the length of service. Synthetic fixtures; hand calculations in comments.
const T = "79000000-0000-4000-8000-0000000000a1";
const P1 = "79000000-0000-4000-8000-0000000000a2";
const P2 = "79000000-0000-4000-8000-0000000000a3";
const uid = (n: number) => `79000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [W1, W2, W3, RES, E1, E2, E3] = [101, 102, 103, 104, 105, 106, 107].map(uid);
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
let connection: fixtureDb.Connection;
const users = { manager: 0, runner: 0, approver: 0, p1only: 0, plain: 0 };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@payalloc.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const asg: Record<string, string> = {};
let entryOf: Record<string, string> = {};
let runId = "";

async function clear() {
  await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [T]);
  await connection.query("UPDATE employee_time_entries SET costEntryId = NULL, progressEntryId = NULL WHERE tenantId = ?", [T]);
  await connection.query("DELETE a FROM payroll_allocation_adjustments a WHERE a.tenantId = ?", [T]);
  for (const table of ["employee_time_entries", "employee_assignments", "payroll_allocations", "payroll_entries", "payroll_runs", "cost_entries", "salary_structures", "employees", "project_resources", "wbs_items"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [T]);
  await connection.query("DELETE FROM tenant_settings WHERE tenantId = ?", [T]);
  await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId = ?", [T]);
  await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [T]);
  await connection.query("DELETE FROM roles WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM memberships WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM subscriptions WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM projects WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM companies WHERE id = ?", [T]);
  await connection.query("DELETE FROM users WHERE openId LIKE 'pal-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("loaded pay shared by approved hours, with audited adjustments, on a real database", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    const names = ["manager", "runner", "approver", "p1only", "plain"];
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${names.map(n => `('pal-${n}','${n}','pal-${n}@payalloc.example.test','user')`).join(",")}`);
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'pal-%'");
    for (const name of names) (users as Record<string, number>)[name] = rows.find(row => row.openId === `pal-${name}`)!.id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Pay Alloc Tenant', 'pay-alloc-tenant')", [T]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'PA-1', 'Pay project one', 'villas', 'SAR', 'active'), (?, ?, 'PA-2', 'Pay project two', 'villas', 'SAR', 'active')", [P1, T, P2, T]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('pal-sub', ?, 'ALL-IN-ONE', 'active', NOW())", [T]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('pal-ent', ?, 'pal-sub', 'PROJECT', true, NOW())", [T]);
    const codes = ["project.read", "project.manage", "project.payroll.run", "project.payroll.structure", "project.payroll.approve", "project.payroll.sensitive.read"];
    for (const code of codes) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (UUID(), ?, ?, 'PROJECT')", [code, code]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('pal-r-manager', ?, 'PAL_MANAGER','Manager','PROJECT'), ('pal-r-runner', ?, 'PAL_RUNNER','Runner','PROJECT'), ('pal-r-approver', ?, 'PAL_APPROVER','Approver','PROJECT'), ('pal-r-plain', ?, 'PAL_PLAIN','Plain','PROJECT')", [T, T, T, T]);
    const grant = (role: string, list: string[]) => connection.query(`INSERT INTO role_permissions (roleId, permissionId) SELECT ?, id FROM permissions WHERE code IN (${list.map(() => "?").join(",")})`, [role, ...list]);
    await grant("pal-r-manager", ["project.read", "project.manage"]);
    await grant("pal-r-runner", ["project.read", "project.payroll.run", "project.payroll.structure", "project.payroll.sensitive.read"]);
    await grant("pal-r-approver", ["project.read", "project.payroll.approve", "project.payroll.sensitive.read"]);
    await grant("pal-r-plain", ["project.read"]);
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('pal-m-manager', ?, ?, 'active'),('pal-m-runner', ?, ?, 'active'),('pal-m-approver', ?, ?, 'active'),('pal-m-p1only', ?, ?, 'active'),('pal-m-plain', ?, ?, 'active')", [T, users.manager, T, users.runner, T, users.approver, T, users.p1only, T, users.plain]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('pal-mr-manager','pal-m-manager','pal-r-manager','company'),('pal-mr-runner','pal-m-runner','pal-r-runner','company'),('pal-mr-approver','pal-m-approver','pal-r-approver','company'),('pal-mr-plain','pal-m-plain','pal-r-plain','company')");
    // the same approval power, but only inside project one
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType, scopeId) VALUES ('pal-mr-p1only','pal-m-p1only','pal-r-approver','project', ?)", [P1]);
    await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name, plannedValue) VALUES (?, ?, ?, 'PA-W1', 'Walls', 100000), (?, ?, ?, 'PA-W2', 'Roof', 100000), (?, ?, ?, 'PA-W3', 'Roads', 100000)", [W1, T, P1, W2, T, P1, W3, T, P2]);
    await connection.query("INSERT INTO project_resources (id, tenantId, projectId, resourceCode, name, resourceType, plannedUnits, allocatedUnits, unitCost, currency, createdByUserId) VALUES (?, ?, ?, 'PA-RES', 'Labour', 'labor', 1000, 0, 50, 'SAR', ?)", [RES, T, P1, users.manager]);
    // E1: a Saudi hired 2020-01-01 (six completed years in November 2026: the later end-of-service rate). 9000 basic + 2000 housing + 1000 transport.
    // E2: an Indian hired 2025-06-01 (one completed year: the first rate). 5000 basic + 1000 housing.
    // E3: no nationality recorded, hired 2026-06-01, 4000 basic; no hours at all.
    await connection.query("INSERT INTO employees (id, tenantId, employeeNumber, fullName, jobTitle, department, hireDate, employmentStatus, nationality, createdByUserId) VALUES (?, ?, 'PA-1', 'Employee One', 'Foreman', 'Site', '2020-01-01', 'active', 'Saudi', ?), (?, ?, 'PA-2', 'Employee Two', 'Mason', 'Site', '2025-06-01', 'active', 'Indian', ?), (?, ?, 'PA-3', 'Employee Three', 'Clerk', 'Office', '2026-06-01', 'active', NULL, ?)", [E1, T, users.manager, E2, T, users.manager, E3, T, users.manager]);
    await runnerSave(E1, 9000, 2000, 1000); await runnerSave(E2, 5000, 1000, 0); await runnerSave(E3, 4000, 0, 0);
    let n = 200;
    for (const [employee, label] of [[E1, "E1"], [E2, "E2"]] as const) for (const [wbs, project, wlabel] of [[W1, P1, "W1"], [W2, P1, "W2"], [W3, P2, "W3"]] as const) {
      const id = uid(n++); asg[`${label}${wlabel}`] = id;
      await connection.query("INSERT INTO employee_assignments (id, tenantId, projectId, employeeId, projectResourceId, wbsItemId, plannedStartAt, plannedFinishAt, plannedHours, status, createdByUserId) VALUES (?, ?, ?, ?, ?, ?, '2026-11-01', '2026-11-30', 100, 'active', ?)", [id, T, project, employee, RES, wbs, users.manager]);
    }
    // E1: Walls 3 days (24 h), Roof 1 day (8 h), Roads 1 day (8 h) = 40 h -> 60% / 20% / 20%. E2: one day (8 h) on each = thirds.
    const plan: Array<[string, string, string, string]> = [["E1W1", E1, P1, "2026-11-01"], ["E1W1", E1, P1, "2026-11-02"], ["E1W1", E1, P1, "2026-11-03"], ["E1W2", E1, P1, "2026-11-04"], ["E1W3", E1, P2, "2026-11-05"], ["E2W1", E2, P1, "2026-11-01"], ["E2W2", E2, P1, "2026-11-02"], ["E2W3", E2, P2, "2026-11-03"]];
    entryOf = {};
    for (const [index, [key, employee, project, date]] of plan.entries()) {
      const id = uid(300 + index); entryOf[`${key}@${date}`] = id;
      await connection.query("INSERT INTO employee_time_entries (id, tenantId, assignmentId, employeeId, projectId, workDate, actualHours, status, createdByUserId) VALUES (?, ?, ?, ?, ?, ?, 8, 'submitted', ?)", [id, T, asg[key], employee, project, date, users.manager]);
    }
  }, 60_000);
  afterAll(async () => { await clear(); await connection.end(); });

  async function runnerSave(employeeId: string, baseSalary: number, housingAllowance: number, transportAllowance: number) {
    await callerFor(users.runner, "pal-runner").employees.payroll.salaryStructure.save({ tenantId: T, employeeId, baseSalary, housingAllowance, transportAllowance, hardshipAllowance: 0, gosiRate: 0.09, otherDeductions: 0, eosAccrualMode: "computed", eosMonthlyAccrual: 0, currency: "SAR" });
  }
  const one = async (sql: string, params: unknown[] = [T]) => { const [rows] = await connection.query<any[]>(sql, params); return rows[0]; };
  const approver = () => callerFor(users.approver, "pal-approver");
  const approverNow = { get employees() { return approver().employees; } }; // the person is chosen when the call is made
  const entryFor = async (employeeId: string) => (await one("SELECT id FROM payroll_entries WHERE tenantId = ? AND employeeId = ?", [T, employeeId])).id as string;
  const postedLabour = async () => Number((await one("SELECT COALESCE(SUM(amount), 0) AS total FROM cost_entries WHERE tenantId = ? AND category = 'labour' AND status = 'posted'")).total);

  it("approving hours first posts provisional labour cost, hour by hour", async () => {
    const { transitionEmployeeTimeEntryForTenant } = await import("./db");
    for (const [key, id] of Object.entries(entryOf)) {
      const project = key.includes("W3") ? P2 : P1;
      await transitionEmployeeTimeEntryForTenant({ userId: users.manager, tenantId: T, projectId: project, timeEntryId: id, status: "approved" });
    }
    expect((await one("SELECT COUNT(*) AS n FROM cost_entries WHERE tenantId = ? AND sourceType = 'time_entry' AND status = 'posted'")).n).toBe(8);
    expect(await postedLabour()).toBeGreaterThan(0);
  });

  it("makes the payroll run with each person's insurance and end of service fixed by nationality and length of service", async () => {
    const runner = callerFor(users.runner, "pal-runner");
    const created = await runner.employees.payroll.createRun({ tenantId: T, periodStart: day("2026-11-01"), periodEnd: day("2026-11-30") });
    runId = created.id;
    const read = async (employeeId: string) => one("SELECT employerSocialInsurance, eosMonthlyAccrual, indirectLoading, nationalityClass FROM payroll_entries WHERE tenantId = ? AND employeeId = ?", [T, employeeId]);
    // E1: (9000 + 2000) x 11.75% = 1292.50 ; wage 12000 x 1 / 12 = 1000.00 (later period)
    expect(await read(E1)).toMatchObject({ employerSocialInsurance: "1292.50", eosMonthlyAccrual: "1000.00", nationalityClass: "saudi" });
    // E2: (5000 + 1000) x 2% = 120.00 ; wage 6000 x 0.5 / 12 = 250.00 (first period)
    expect(await read(E2)).toMatchObject({ employerSocialInsurance: "120.00", eosMonthlyAccrual: "250.00", nationalityClass: "non_saudi" });
    // E3: no nationality -> the higher rate, said out loud: 4000 x 11.75% = 470.00 ; 4000 x 0.5 / 12 = 166.67
    expect(await read(E3)).toMatchObject({ employerSocialInsurance: "470.00", eosMonthlyAccrual: "166.67", nationalityClass: "unknown" });
    await runner.employees.payroll.transition({ tenantId: T, payrollRunId: runId, status: "review" });
    await approver().employees.payroll.transition({ tenantId: T, payrollRunId: runId, status: "approved" });
  });

  it("a later change of the tenant's rates does not move the month that was already made", async () => {
    await connection.query("INSERT INTO tenant_settings (id, tenantId, employerGosiRateSaudi, employerGosiRateNonSaudi) VALUES (UUID(), ?, 0.30, 0.30) ON DUPLICATE KEY UPDATE employerGosiRateSaudi = 0.30, employerGosiRateNonSaudi = 0.30", [T]);
    expect((await one("SELECT employerSocialInsurance FROM payroll_entries WHERE tenantId = ? AND employeeId = ?", [T, E1])).employerSocialInsurance).toBe("1292.50");
    await connection.query("DELETE FROM tenant_settings WHERE tenantId = ?", [T]);
  });

  it("refuses to share the pay across projects for someone whose approval is limited to one project, and writes nothing", async () => {
    const before = await one("SELECT (SELECT COUNT(*) FROM payroll_allocations WHERE tenantId = ?) AS allocations, (SELECT COUNT(*) FROM cost_entries WHERE tenantId = ? AND status = 'void') AS voided", [T, T]);
    await expect(callerFor(users.p1only, "pal-p1only").employees.payroll.allocateByHours({ tenantId: T, payrollEntryId: await entryFor(E1) })).rejects.toThrow("PROJECT_OS_PERMISSION_DENIED"); // a one-project approval cannot share pay across projects
    await expect(callerFor(users.runner, "pal-runner").employees.payroll.allocateByHours({ tenantId: T, payrollEntryId: await entryFor(E1) })).rejects.toThrow("PROJECT_OS_PERMISSION_DENIED");
    expect(await one("SELECT (SELECT COUNT(*) FROM payroll_allocations WHERE tenantId = ?) AS allocations, (SELECT COUNT(*) FROM cost_entries WHERE tenantId = ? AND status = 'void') AS voided", [T, T])).toEqual(before);
  });

  it("shares E1's loaded 14,292.50 by hours (60/20/20) and replaces the provisional hour costs, so the pay is counted once", async () => {
    const provisionalBefore = Number((await one("SELECT COALESCE(SUM(c.amount), 0) AS total FROM cost_entries c INNER JOIN employee_time_entries t ON t.costEntryId = c.id WHERE t.tenantId = ? AND t.employeeId = ? AND c.status = 'posted'", [T, E1])).total);
    expect(provisionalBefore).toBeGreaterThan(0);
    // 12000 pay and allowances + 1292.50 insurance + 1000.00 end of service
    const result = await approverNow.employees.payroll.allocateByHours({ tenantId: T, payrollEntryId: await entryFor(E1) });
    expect(result).toMatchObject({ loadedCost: 14292.5, totalHours: 40, supersededTimeEntries: 5 });
    const byWbs = Object.fromEntries(result.allocations.map(item => [item.wbsItemId, item]));
    expect(byWbs[W1]).toMatchObject({ amount: 8575.5, hours: 24, sharePercent: 60 });
    expect(byWbs[W2]).toMatchObject({ amount: 2858.5, hours: 8, sharePercent: 20 });
    expect(byWbs[W3]).toMatchObject({ amount: 2858.5, hours: 8, sharePercent: 20 });
    expect(result.allocations.reduce((total, item) => total + item.amount, 0)).toBeCloseTo(14292.5, 2);
    // E1's provisional hour costs are void, E1's posted labour cost is exactly the loaded pay, and the cost lands on the right work items
    expect(Number((await one("SELECT COALESCE(SUM(c.amount), 0) AS total FROM cost_entries c INNER JOIN employee_time_entries t ON t.costEntryId = c.id WHERE t.tenantId = ? AND t.employeeId = ? AND c.status = 'posted'", [T, E1])).total)).toBe(0);
    expect(Number((await one("SELECT SUM(amount) AS total FROM cost_entries WHERE tenantId = ? AND sourceType = 'payroll_allocation' AND status = 'posted'")).total)).toBe(14292.5);
    expect(Number((await one("SELECT amount FROM cost_entries WHERE tenantId = ? AND sourceType = 'payroll_allocation' AND wbsItemId = ? AND status = 'posted'", [T, W1])).amount)).toBe(8575.5);
    expect((await one("SELECT COUNT(*) AS n FROM employee_time_entries WHERE tenantId = ? AND employeeId = ? AND supersededByPayrollEntryId IS NOT NULL", [T, E1])).n).toBe(5);
    const audit = await one("SELECT metadata FROM audit_logs WHERE tenantId = ? AND action = 'payroll.cost_allocated_by_hours'");
    expect(JSON.parse(audit.metadata)).toMatchObject({ loadedCost: 14292.5, totalHours: 40, supersededTimeEntries: 5, voidedProvisionalCosts: 5 });
  });

  it("will not share the same pay twice, nor approve more hours for a month the payroll already carries", async () => {
    await expect(approverNow.employees.payroll.allocateByHours({ tenantId: T, payrollEntryId: await entryFor(E1) })).rejects.toThrow("PROJECT_OS_PAYROLL_AUTO_ALREADY_ALLOCATED");
    await connection.query("INSERT INTO employee_time_entries (id, tenantId, assignmentId, employeeId, projectId, workDate, actualHours, status, createdByUserId) VALUES (?, ?, ?, ?, ?, '2026-11-08', 8, 'submitted', ?)", [uid(399), T, asg["E1W1"], E1, P1, users.manager]);
    const { transitionEmployeeTimeEntryForTenant } = await import("./db");
    await expect(transitionEmployeeTimeEntryForTenant({ userId: users.manager, tenantId: T, projectId: P1, timeEntryId: uid(399), status: "approved" })).rejects.toThrow("PROJECT_OS_TIME_ENTRY_PAYROLL_ALLOCATED");
  });

  it("cuts an indivisible amount in whole cents that still add up exactly: E2's 6,370.00 in thirds", async () => {
    // 6000 pay + 120 insurance + 250 end of service = 6370.00 ; thirds of 6370.00 are 2123.333...
    const result = await approverNow.employees.payroll.allocateByHours({ tenantId: T, payrollEntryId: await entryFor(E2) });
    const cents = result.allocations.map(item => Math.round(item.amount * 100)).sort((a, b) => b - a);
    expect(cents.reduce((total, value) => total + value, 0)).toBe(637000);
    expect(cents[0] - cents[2]).toBeLessThanOrEqual(1);
    expect(result.allocations.every(item => item.sharePercent === 33.3333)).toBe(true);
    expect(await postedLabour()).toBe(14292.5 + 6370);
  });

  it("has nothing to share by when no hours were approved", async () => {
    await expect(approverNow.employees.payroll.allocateByHours({ tenantId: T, payrollEntryId: await entryFor(E3) })).rejects.toThrow("PROJECT_OS_PAYROLL_AUTO_NO_HOURS");
  });

  it("lets a person change one share only with a reason, keeps before, after and why, and replaces the cost line instead of overwriting it", async () => {
    const e1 = await entryFor(E1);
    const roof = await one("SELECT id, costEntryId FROM payroll_allocations WHERE tenantId = ? AND payrollEntryId = ? AND wbsItemId = ?", [T, e1, W2]);
    const caller = approver();
    await expect(caller.employees.payroll.adjustAllocation({ tenantId: T, allocationId: roof.id, newAmount: 2500, reason: "  " })).rejects.toThrow(); // zod: a blank reason is refused before it reaches the database
    await expect(caller.employees.payroll.adjustAllocation({ tenantId: T, allocationId: roof.id, newAmount: 2500, reason: "abc" })).rejects.toThrow();
    await expect(caller.employees.payroll.adjustAllocation({ tenantId: T, allocationId: roof.id, newAmount: 2858.5, reason: "Same amount again" })).rejects.toThrow("PROJECT_OS_PAYROLL_ADJUSTMENT_NO_CHANGE");
    await expect(caller.employees.payroll.adjustAllocation({ tenantId: T, allocationId: roof.id, newAmount: 99999, reason: "Far too much" })).rejects.toThrow("PROJECT_OS_PAYROLL_ALLOCATION_EXCEEDS_COST");
    await expect(callerFor(users.runner, "pal-runner").employees.payroll.adjustAllocation({ tenantId: T, allocationId: roof.id, newAmount: 2500, reason: "Roof crew was on loan" })).rejects.toThrow("PROJECT_OS_PERMISSION_DENIED");
    expect(Number((await one("SELECT amount FROM payroll_allocations WHERE id = ?", [roof.id])).amount)).toBe(2858.5); // every refusal left the share alone

    const result = await caller.employees.payroll.adjustAllocation({ tenantId: T, allocationId: roof.id, newAmount: 2500, reason: "Roof crew was on loan to project two for a week" });
    expect(result).toMatchObject({ previousAmount: 2858.5, newAmount: 2500 });
    expect(Number((await one("SELECT amount FROM payroll_allocations WHERE id = ?", [roof.id])).amount)).toBe(2500);
    expect((await one("SELECT status FROM cost_entries WHERE id = ?", [roof.costEntryId])).status).toBe("void"); // the old line is kept, voided
    expect(Number((await one("SELECT c.amount FROM payroll_allocations a INNER JOIN cost_entries c ON c.id = a.costEntryId WHERE a.id = ?", [roof.id])).amount)).toBe(2500);
    const adjustment = await one("SELECT previousAmount, newAmount, reason, adjustedByUserId FROM payroll_allocation_adjustments WHERE allocationId = ?", [roof.id]);
    expect(adjustment).toMatchObject({ previousAmount: "2858.50", newAmount: "2500.00", reason: "Roof crew was on loan to project two for a week", adjustedByUserId: users.approver });
    const audit = await one("SELECT metadata FROM audit_logs WHERE tenantId = ? AND action = 'payroll.allocation_adjusted'");
    expect(JSON.parse(audit.metadata)).toMatchObject({ previousAmount: 2858.5, newAmount: 2500, reason: "Roof crew was on loan to project two for a week" });
    // the money taken off the roof can be put where it belongs, up to the loaded total and no further
    const roads = await one("SELECT id FROM payroll_allocations WHERE tenantId = ? AND payrollEntryId = ? AND wbsItemId = ?", [T, e1, W3]);
    await expect(caller.employees.payroll.adjustAllocation({ tenantId: T, allocationId: roads.id, newAmount: 2858.5 + 358.51, reason: "One cent over the total" })).rejects.toThrow("PROJECT_OS_PAYROLL_ALLOCATION_EXCEEDS_COST");
    await expect(caller.employees.payroll.adjustAllocation({ tenantId: T, allocationId: roads.id, newAmount: 2858.5 + 358.5, reason: "Roof crew time moved to roads" })).resolves.toMatchObject({ newAmount: 3217 });
    expect(await postedLabour()).toBe(14292.5 + 6370); // moved between work items, never created
  });
});
