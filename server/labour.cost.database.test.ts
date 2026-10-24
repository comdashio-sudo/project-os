import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { getDb } from "./db";
import { liveEvm, loadProfitabilityRows } from "./profitability";
import { appRouter } from "./routers";

// Loaded labour cost (G-015, G-016) and the tenant working calendar (G-124) on a real database.
// Hand calculations: docs/LABOUR_COST_HAND_CHECKS.md. October 2026 has 21 Sunday-Thursday working days = 168 hours.
const T = "73000000-0000-4000-8000-0000000000a1";
const T_OTHER = "73000000-0000-4000-8000-0000000000b1";
const P = "73000000-0000-4000-8000-0000000000a2";
const uid = (n: number) => `73000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [WBS, RES, EMP_A, EMP_B, ASG_A, ASG_B, TE1, TE2, TE3, SAL_A] = [101, 102, 103, 104, 105, 106, 107, 108, 109, 110].map(uid);
const [EMP_C, EMP_D, ASG_C, ASG_D, TE4, TE5, SAL_C, SAL_D, RUN_NOV, PE_C, PE_D, RUN_DEC, RUN_JAN, PE_C2, PE_C3] = [111, 112, 113, 114, 115, 116, 117, 118, 119, 120, 121, 122, 123, 124, 125].map(uid); // G-123: November payroll, one employee costed by time first, one by payroll first
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };

let connection: fixtureDb.Connection;
const users = { manager: 0, finance: 0, plain: 0 };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@labour.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const scope = { tenantId: T, projectId: P };
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function clear() {
  const t = [T, T_OTHER];
  await connection.query("DELETE FROM audit_logs WHERE tenantId IN (?, ?)", t);
  await connection.query("UPDATE employee_time_entries SET costEntryId = NULL, progressEntryId = NULL WHERE tenantId IN (?, ?)", t);
  for (const table of ["employee_time_entries", "employee_assignments", "payroll_allocations", "payroll_entries", "payroll_runs", "cost_entries", "progress_entries", "budget_lines", "project_resources", "salary_structures", "employees", "tenant_settings", "wbs_items"]) await connection.query(`DELETE FROM ${table} WHERE tenantId IN (?, ?)`, t);
  await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId IN (?, ?)", t);
  await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM roles WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM memberships WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM tenant_entitlements WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM subscriptions WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM projects WHERE tenantId IN (?, ?)", t);
  await connection.query("DELETE FROM companies WHERE id IN (?, ?)", t);
  await connection.query("DELETE FROM users WHERE openId IN ('lab-manager','lab-finance','lab-plain')");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("loaded labour cost on a real database", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('lab-manager','Lab Manager','lab-manager@labour.example.test','user'),('lab-finance','Lab Finance','lab-finance@labour.example.test','user'),('lab-plain','Lab Plain','lab-plain@labour.example.test','user')");
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'lab-%'");
    const idOf = (openId: string) => rows.find(row => row.openId === openId)!.id;
    users.manager = idOf("lab-manager"); users.finance = idOf("lab-finance"); users.plain = idOf("lab-plain");
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Labour Tenant', 'labour-tenant'), (?, 'Labour Other', 'labour-other')", [T, T_OTHER]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'LB-A', 'Labour project', 'villas', 'SAR', 'active')", [P, T]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('lab-sub', ?, 'ALL-IN-ONE', 'active', NOW())", [T]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('lab-ent', ?, 'lab-sub', 'PROJECT', true, NOW())", [T]);
    const codes = ["project.read", "project.manage", "project.cashflow.read", "project.settings.labour", "project.payroll.approve", "project.payroll.sensitive.read"];
    for (const code of codes) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (UUID(), ?, ?, 'PROJECT')", [code, code]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('lab-role-manager', ?, 'LAB_MANAGER','Manager','PROJECT'), ('lab-role-finance', ?, 'LAB_FINANCE','Finance','PROJECT'), ('lab-role-plain', ?, 'LAB_PLAIN','Plain','PROJECT')", [T, T, T]);
    const grant = (role: string, list: string[]) => connection.query(`INSERT INTO role_permissions (roleId, permissionId) SELECT ?, id FROM permissions WHERE code IN (${list.map(() => "?").join(",")})`, [role, ...list]);
    await grant("lab-role-manager", ["project.read", "project.manage", "project.cashflow.read"]);
    await grant("lab-role-finance", ["project.read", "project.cashflow.read", "project.settings.labour", "project.payroll.approve", "project.payroll.sensitive.read"]);
    await grant("lab-role-plain", ["project.read"]);
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('lab-m-manager', ?, ?, 'active'),('lab-m-finance', ?, ?, 'active'),('lab-m-plain', ?, ?, 'active')", [T, users.manager, T, users.finance, T, users.plain]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('lab-mr-manager','lab-m-manager','lab-role-manager','company'),('lab-mr-finance','lab-m-finance','lab-role-finance','company'),('lab-mr-plain','lab-m-plain','lab-role-plain','company')");
    await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name, plannedValue) VALUES (?, ?, ?, 'LB-1', 'Labour work', 100000)", [WBS, T, P]);
    await connection.query("INSERT INTO budget_lines (id, tenantId, projectId, wbsItemId, costCode, originalAmount, currentAmount) VALUES (?, ?, ?, ?, 'LAB', 90000, 90000)", [uid(900), T, P, WBS]);
    // 10% progress of a 100,000 item -> earned value 10,000
    await connection.query("INSERT INTO progress_entries (id, tenantId, projectId, wbsItemId, progressPercent, status, measuredAt) VALUES (?, ?, ?, ?, 10, 'submitted', '2026-10-01 00:00:00')", [uid(901), T, P, WBS]);
    await connection.query("INSERT INTO employees (id, tenantId, employeeNumber, fullName, jobTitle, department, hireDate, employmentStatus, nationality, createdByUserId) VALUES (?, ?, 'E-A', 'Employee A', 'Foreman', 'Site', '2024-01-01', 'active', 'Saudi', ?), (?, ?, 'E-B', 'Employee B', 'Labourer', 'Site', '2024-01-01', 'active', NULL, ?)", [EMP_A, T, users.manager, EMP_B, T, users.manager]);
    // A (Saudi, hired 2024-01-01, two completed years in October 2026): 8000 basic + 1500 housing + 500 transport = 10,000 direct; end-of-service follows the length of service. B has no salary structure.
    await connection.query("INSERT INTO salary_structures (id, tenantId, employeeId, baseSalary, housingAllowance, transportAllowance, hardshipAllowance, gosiRate, otherDeductions, eosMonthlyAccrual, currency, active, createdByUserId) VALUES (?, ?, ?, 8000, 1500, 500, 0, 0.09, 0, 700, 'SAR', true, ?)", [SAL_A, T, EMP_A, users.manager]);
    await connection.query("INSERT INTO project_resources (id, tenantId, projectId, resourceCode, name, resourceType, plannedUnits, allocatedUnits, unitCost, currency, createdByUserId) VALUES (?, ?, ?, 'LAB-RES', 'Labour', 'labor', 1000, 0, 50, 'SAR', ?)", [RES, T, P, users.manager]);
    await connection.query("INSERT INTO employee_assignments (id, tenantId, projectId, employeeId, projectResourceId, wbsItemId, plannedStartAt, plannedFinishAt, plannedHours, status, createdByUserId) VALUES (?, ?, ?, ?, ?, ?, '2026-10-01', '2026-10-31', 100, 'active', ?), (?, ?, ?, ?, ?, ?, '2026-10-01', '2026-10-31', 100, 'active', ?)", [ASG_A, T, P, EMP_A, RES, WBS, users.manager, ASG_B, T, P, EMP_B, RES, WBS, users.manager]);
    const entry = (id: string, assignment: string, employee: string, date: string) => connection.query("INSERT INTO employee_time_entries (id, tenantId, assignmentId, employeeId, projectId, workDate, actualHours, status, createdByUserId) VALUES (?, ?, ?, ?, ?, ?, 8, 'submitted', ?)", [id, T, assignment, employee, P, date, users.manager]);
    await entry(TE1, ASG_A, EMP_A, "2026-10-04"); await entry(TE2, ASG_A, EMP_A, "2026-10-05"); await entry(TE3, ASG_B, EMP_B, "2026-10-04");
    // G-123 fixture: two more employees on a salary, an approved November payroll run covering both, and one submitted time entry each
    await connection.query("INSERT INTO employees (id, tenantId, employeeNumber, fullName, jobTitle, department, hireDate, employmentStatus, createdByUserId) VALUES (?, ?, 'E-C', 'Employee C', 'Mason', 'Site', '2024-01-01', 'active', ?), (?, ?, 'E-D', 'Employee D', 'Mason', 'Site', '2024-01-01', 'active', ?)", [EMP_C, T, users.manager, EMP_D, T, users.manager]);
    await connection.query("INSERT INTO salary_structures (id, tenantId, employeeId, baseSalary, housingAllowance, transportAllowance, hardshipAllowance, gosiRate, otherDeductions, eosMonthlyAccrual, currency, active, createdByUserId) VALUES (?, ?, ?, 5000, 0, 0, 0, 0.09, 0, 0, 'SAR', true, ?), (?, ?, ?, 5000, 0, 0, 0, 0.09, 0, 0, 'SAR', true, ?)", [SAL_C, T, EMP_C, users.manager, SAL_D, T, EMP_D, users.manager]);
    await connection.query("INSERT INTO employee_assignments (id, tenantId, projectId, employeeId, projectResourceId, wbsItemId, plannedStartAt, plannedFinishAt, plannedHours, status, createdByUserId) VALUES (?, ?, ?, ?, ?, ?, '2026-11-01', '2026-11-30', 100, 'active', ?), (?, ?, ?, ?, ?, ?, '2026-11-01', '2026-11-30', 100, 'active', ?)", [ASG_C, T, P, EMP_C, RES, WBS, users.manager, ASG_D, T, P, EMP_D, RES, WBS, users.manager]);
    await connection.query("INSERT INTO employee_time_entries (id, tenantId, assignmentId, employeeId, projectId, workDate, actualHours, status, createdByUserId) VALUES (?, ?, ?, ?, ?, '2026-11-04', 8, 'submitted', ?), (?, ?, ?, ?, ?, '2026-11-05', 8, 'submitted', ?)", [TE4, T, ASG_C, EMP_C, P, users.manager, TE5, T, ASG_D, EMP_D, P, users.manager]);
    await connection.query("INSERT INTO payroll_runs (id, tenantId, periodStart, periodEnd, status, createdByUserId, approvedByUserId, approvedAt) VALUES (?, ?, '2026-11-01', '2026-11-30', 'approved', ?, ?, NOW())", [RUN_NOV, T, users.manager, users.finance]);
    await connection.query("INSERT INTO payroll_entries (id, tenantId, payrollRunId, employeeId, salaryStructureId, baseSalary, housingAllowance, transportAllowance, hardshipAllowance, gosiDeduction, otherDeductions, eosMonthlyAccrual, currency) VALUES (?, ?, ?, ?, ?, 5000, 0, 0, 0, 450, 0, 300.50, 'SAR'), (?, ?, ?, ?, ?, 5000, 0, 0, 0, 450, 0, 200.25, 'SAR')", [PE_C, T, RUN_NOV, EMP_C, SAL_C, PE_D, T, RUN_NOV, EMP_D, SAL_D]);
    // G-122: a later approved run (December, employee C 300.50) and a draft run (January, 999 for C) that must not be counted
    await connection.query("INSERT INTO payroll_runs (id, tenantId, periodStart, periodEnd, status, createdByUserId, approvedByUserId, approvedAt) VALUES (?, ?, '2026-12-01', '2026-12-31', 'approved', ?, ?, NOW()), (?, ?, '2027-01-01', '2027-01-31', 'draft', ?, NULL, NULL)", [RUN_DEC, T, users.manager, users.finance, RUN_JAN, T, users.manager]);
    await connection.query("INSERT INTO payroll_entries (id, tenantId, payrollRunId, employeeId, salaryStructureId, baseSalary, housingAllowance, transportAllowance, hardshipAllowance, gosiDeduction, otherDeductions, eosMonthlyAccrual, currency) VALUES (?, ?, ?, ?, ?, 5000, 0, 0, 0, 450, 0, 300.50, 'SAR'), (?, ?, ?, ?, ?, 5000, 0, 0, 0, 450, 0, 999, 'SAR')", [PE_C2, T, RUN_DEC, EMP_C, SAL_C, PE_C3, T, RUN_JAN, EMP_C, SAL_C]);
  }, 60_000);

  afterAll(async () => { await clear(); await connection.end(); });

  const costOf = async (timeEntryId: string) => { const [rows] = await connection.query<{ amount: string; wbsItemId: string; category: string; sourceType: string; rateSource: string }[]>("SELECT c.amount, c.wbsItemId, c.category, c.sourceType, t.rateSource FROM employee_time_entries t INNER JOIN cost_entries c ON c.id = t.costEntryId WHERE t.id = ?", [timeEntryId]); return rows[0]; };
  const transition = async (id: string) => (await import("./db")).transitionEmployeeTimeEntryForTenant({ userId: users.manager, tenantId: T, projectId: P, timeEntryId: id, status: "approved" });

  it("starts from the owner's defaults (insurance 11.75% / 2%, end of service half a month then a month, Sunday-Thursday, 8 hours) and says so", async () => {
    const finance = callerFor(users.finance, "lab-finance");
    expect(await finance.labourSettings.get({ tenantId: T })).toEqual({ employerGosiRateSaudi: 0.1175, employerGosiRateNonSaudi: 0.02, indirectLoadingPercent: 0, hoursPerDay: 8, workingDays: [0, 1, 2, 3, 4], eosFirstPeriodYears: 5, eosFirstPeriodMonthsPerYear: 0.5, eosLaterMonthsPerYear: 1, isDefault: true, canEdit: true });
  });

  it("prices approved hours from payroll, loaded, and posts them to the WBS as labour cost from the time entry", async () => {
    await transition(TE1);
    // 10,000 pay + 1,116.25 insurance (11.75% of basic + housing, a Saudi) + 416.67 end of service (10,000 x 0.5 / 12, second year) = 11,532.92; / 168 h = 68.65 per hour; 8 h = 549.20
    expect(await costOf(TE1)).toMatchObject({ amount: "549.20", wbsItemId: WBS, category: "labour", sourceType: "time_entry", rateSource: "loaded" });
  });

  it("follows the tenant's own factors from the moment they are saved", async () => {
    const finance = callerFor(users.finance, "lab-finance");
    // the tenant adds indirects of 10% of basic + allowances: (11,532.92 + 1,000) / 168 = 74.60 per hour
    await finance.labourSettings.save({ tenantId: T, employerGosiRateSaudi: 0.1175, employerGosiRateNonSaudi: 0.02, indirectLoadingPercent: 10, hoursPerDay: 8, workingDays: [0, 1, 2, 3, 4], eosFirstPeriodYears: 5, eosFirstPeriodMonthsPerYear: 0.5, eosLaterMonthsPerYear: 1 });
    await transition(TE2);
    expect(await costOf(TE2)).toMatchObject({ amount: "596.80", rateSource: "loaded" }); // 8 x 74.60
    // the earlier entry is history: it keeps the price it was approved at
    expect((await costOf(TE1)).amount).toBe("549.20");
    const [audit] = await connection.query<{ metadata: string }[]>("SELECT metadata FROM audit_logs WHERE tenantId = ? AND action = 'tenant.labour_settings_saved'", [T]);
    expect(JSON.parse(audit[0].metadata)).toMatchObject({ before: { employerGosiRateSaudi: 0.1175, indirectLoadingPercent: 0 }, after: { employerGosiRateSaudi: 0.1175, indirectLoadingPercent: 10 } });
  });

  it("falls back to the resource plan rate for an employee with no salary structure, and records that it did", async () => {
    await transition(TE3);
    expect(await costOf(TE3)).toMatchObject({ amount: "400.00", rateSource: "resource" }); // 8 x 50
  });

  it("feeds actual cost and CPI of the live EVM, and reports only totals: the effective loading factor, never a rate", async () => {
    const db = (await getDb())!;
    const rows = await loadProfitabilityRows(db, scope);
    const evm = liveEvm(rows, new Date("2026-11-15T00:00:00Z"), "ac_plus_remaining");
    if ("error" in evm) throw new Error(evm.error);
    // AC = 549.20 + 596.80 + 400 = 1,546.00; EV = 10% x 100,000 = 10,000 -> CPI = 10,000 / 1,546
    expect(evm.ac).toBeCloseTo(1546, 2);
    expect(evm.ev).toBe(10000);
    expect(evm.cpi).toBeCloseTo(10000 / 1546, 4);
    const managerCaller = callerFor(users.manager, "lab-manager");
    const labour = await managerCaller.profitability.labour(scope);
    // loaded 549.20 + 596.80 = 1,146.00 over the same 16 hours at pay alone (2 x 8 x 59.52 = 952.32) = 1.2034
    expect(labour).toMatchObject({ approvedEntries: 3, loadedEntries: 2, resourceEntries: 1, hours: 24, loadedCost: 1146, effectiveLoadingFactor: 1.2034, isDefault: false });
    expect(JSON.stringify(labour)).not.toMatch(/baseSalary|hourlyCost|68\.65|74\.6\b/);
  });

  it("applies the tenant's working calendar to assignment capacity (G-124): Monday-Friday and 10 hours turn a refused plan into an accepted one", async () => {
    const { createEmployeeAssignmentForTenant } = await import("./db");
    // Employee B already carries 100 planned hours in October. 120 more = 220 against a capacity of 21 x 8 = 168 on the default week.
    const plan = { userId: users.manager, ...scope, employeeId: EMP_B, projectResourceId: RES, plannedStartAt: day("2026-10-01"), plannedFinishAt: day("2026-10-31"), plannedHours: 120 };
    const refused = await createEmployeeAssignmentForTenant(plan);
    expect(refused.capacity).toMatchObject({ workingDays: 21, availableHours: 168, exceedsCapacity: true });
    // Monday-Friday = 22 days and 10-hour days = 220 hours: the same plan fits
    await callerFor(users.finance, "lab-finance").labourSettings.save({ tenantId: T, employerGosiRateSaudi: 0.1175, employerGosiRateNonSaudi: 0.02, indirectLoadingPercent: 10, hoursPerDay: 10, workingDays: [1, 2, 3, 4, 5], eosFirstPeriodYears: 5, eosFirstPeriodMonthsPerYear: 0.5, eosLaterMonthsPerYear: 1 });
    await connection.query("DELETE FROM employee_assignments WHERE id = ?", [refused.id]);
    const accepted = await createEmployeeAssignmentForTenant(plan);
    expect(accepted.capacity).toMatchObject({ workingDays: 22, availableHours: 220, exceedsCapacity: false });
  });

  it("lets only the permitted save settings, refuses nonsense, and keeps another tenant's settings out of reach", async () => {
    const manager = callerFor(users.manager, "lab-manager");
    const finance = callerFor(users.finance, "lab-finance");
    const input = { tenantId: T, employerGosiRateSaudi: 0.1, employerGosiRateNonSaudi: 0.02, indirectLoadingPercent: 5, hoursPerDay: 8, workingDays: [0, 1, 2, 3, 4], eosFirstPeriodYears: 5, eosFirstPeriodMonthsPerYear: 0.5, eosLaterMonthsPerYear: 1 };
    await expect(manager.labourSettings.save(input)).rejects.toThrow("PROJECT_OS_PERMISSION_DENIED.");
    await expect(callerFor(users.plain, "lab-plain").labourSettings.get({ tenantId: T })).rejects.toThrow("PROJECT_OS_PERMISSION_DENIED.");
    await expect(finance.labourSettings.save({ ...input, workingDays: [1, 1, 2] })).rejects.toThrow("PROJECT_OS_LABOUR_SETTINGS_INVALID");
    await expect(finance.labourSettings.save({ ...input, tenantId: T_OTHER })).rejects.toThrow();
    // a cash-flow reader can read the settings but not change them
    expect(await manager.labourSettings.get({ tenantId: T })).toMatchObject({ canEdit: false, hoursPerDay: 10 });
    // the refused saves changed nothing
    expect(await finance.labourSettings.get({ tenantId: T })).toMatchObject({ employerGosiRateSaudi: 0.1175, indirectLoadingPercent: 10, hoursPerDay: 10, workingDays: [1, 2, 3, 4, 5] });
  });

  // G-123: the same worker-hours must cost the project once, whichever route reaches them first.
  it("refuses to allocate payroll for an employee whose hours in the period are already costed through approved time entries", async () => {
    const finance = callerFor(users.finance, "lab-finance");
    await transition(TE4); // November 4, employee C: priced and posted as labour cost
    const [[before]] = await connection.query<any[]>("SELECT (SELECT COUNT(*) FROM payroll_allocations WHERE tenantId = ?) AS allocations, (SELECT COUNT(*) FROM cost_entries WHERE tenantId = ? AND sourceType = 'payroll_allocation') AS costs", [T, T]);
    await expect(finance.employees.payroll.allocateCost({ tenantId: T, payrollEntryId: PE_C, projectId: P, wbsItemId: WBS, amount: 5000, incurredAt: day("2026-11-30") })).rejects.toThrow("PROJECT_OS_PAYROLL_ALLOCATION_TIME_COSTED");
    const [[after]] = await connection.query<any[]>("SELECT (SELECT COUNT(*) FROM payroll_allocations WHERE tenantId = ?) AS allocations, (SELECT COUNT(*) FROM cost_entries WHERE tenantId = ? AND sourceType = 'payroll_allocation') AS costs", [T, T]);
    expect(after).toEqual(before); // nothing written by the refused allocation
  });

  it("refuses to approve hours for an employee whose pay for that period is already allocated from payroll", async () => {
    const finance = callerFor(users.finance, "lab-finance");
    const allocation = await finance.employees.payroll.allocateCost({ tenantId: T, payrollEntryId: PE_D, projectId: P, wbsItemId: WBS, amount: 5000, incurredAt: day("2026-11-30") }); // employee D has no approved time yet: allowed
    expect(allocation.costEntryId).toBeTruthy();
    await expect(transition(TE5)).rejects.toThrow("PROJECT_OS_TIME_ENTRY_PAYROLL_ALLOCATED");
    const [rows] = await connection.query<{ status: string; costEntryId: string | null }[]>("SELECT status, costEntryId FROM employee_time_entries WHERE id = ?", [TE5]);
    expect(rows[0]).toEqual({ status: "submitted", costEntryId: null }); // still waiting, no second cost
  });

  it("leaves other employees and other periods alone: employee C (time-costed) is not blocked by employee D's allocation, and a different month is a different cost", async () => {
    const [[sum]] = await connection.query<any[]>("SELECT COALESCE(SUM(amount), 0) AS total FROM cost_entries WHERE tenantId = ? AND category = 'labour' AND incurredAt >= '2026-11-01' AND incurredAt < '2026-12-01'", [T]);
    expect(Number(sum.total)).toBeGreaterThan(5000); // D's payroll allocation (5000) plus C's one time-entry cost: each counted once
    expect((await connection.query<any[]>("SELECT COUNT(*) AS n FROM cost_entries WHERE tenantId = ? AND sourceType = 'time_entry' AND incurredAt >= '2026-11-01'", [T]))[0][0].n).toBe(1);
    expect((await connection.query<any[]>("SELECT COUNT(*) AS n FROM cost_entries WHERE tenantId = ? AND sourceType = 'payroll_allocation'", [T]))[0][0].n).toBe(1);
  });

  // G-122: November C 300.50 + D 200.25 = 500.75; December C 300.50 -> cumulative 801.25; the January draft (999) is not counted.
  it("shows the end-of-service liability month by month from approved runs only, and only to someone allowed to read pay", async () => {
    const finance = callerFor(users.finance, "lab-finance");
    const result = await finance.employees.payroll.eosLiability({ tenantId: T });
    expect(result.months).toEqual([{ month: "2026-11", accrued: 500.75, cumulative: 500.75, employees: 2 }, { month: "2026-12", accrued: 300.5, cumulative: 801.25, employees: 1 }]);
    expect(result.total).toBe(801.25);
    expect(result.employees.map(row => [row.employeeNumber, row.cumulative])).toEqual([["E-C", 601], ["E-D", 200.25]]);
    expect(result.currencies).toEqual(["SAR"]);
    const [[audit]] = await connection.query<any[]>("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action = 'payroll.eos_liability_viewed' AND actorUserId = ?", [T, users.finance]);
    expect(Number(audit.n)).toBe(1);
    // the draft January run becomes part of the liability the moment it is approved
    await connection.query("UPDATE payroll_runs SET status = 'approved' WHERE id = ?", [RUN_JAN]);
    expect((await finance.employees.payroll.eosLiability({ tenantId: T })).total).toBe(1800.25);
    await connection.query("UPDATE payroll_runs SET status = 'draft' WHERE id = ?", [RUN_JAN]);
    await expect(callerFor(users.manager, "lab-manager").employees.payroll.eosLiability({ tenantId: T })).rejects.toThrow("PROJECT_OS_PERMISSION_DENIED.");
    await expect(callerFor(users.plain, "lab-plain").employees.payroll.eosLiability({ tenantId: T })).rejects.toThrow("PROJECT_OS_PERMISSION_DENIED.");
  });
});
