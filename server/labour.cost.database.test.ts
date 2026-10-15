import mysql from "mysql2/promise";
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
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^mysql(?:2)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };

let connection: mysql.Connection;
const users = { manager: 0, finance: 0, plain: 0 };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@labour.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const scope = { tenantId: T, projectId: P };
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

async function clear() {
  const t = [T, T_OTHER];
  await connection.query("DELETE FROM audit_logs WHERE tenantId IN (?, ?)", t);
  await connection.query("UPDATE employee_time_entries SET costEntryId = NULL, progressEntryId = NULL WHERE tenantId IN (?, ?)", t);
  for (const table of ["employee_time_entries", "employee_assignments", "cost_entries", "progress_entries", "budget_lines", "project_resources", "salary_structures", "employees", "tenant_settings", "wbs_items"]) await connection.query(`DELETE FROM ${table} WHERE tenantId IN (?, ?)`, t);
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
    connection = await mysql.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('lab-manager','Lab Manager','lab-manager@labour.example.test','user'),('lab-finance','Lab Finance','lab-finance@labour.example.test','user'),('lab-plain','Lab Plain','lab-plain@labour.example.test','user')");
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'lab-%'");
    const idOf = (openId: string) => rows.find(row => row.openId === openId)!.id;
    users.manager = idOf("lab-manager"); users.finance = idOf("lab-finance"); users.plain = idOf("lab-plain");
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Labour Tenant', 'labour-tenant'), (?, 'Labour Other', 'labour-other')", [T, T_OTHER]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'LB-A', 'Labour project', 'villas', 'SAR', 'active')", [P, T]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('lab-sub', ?, 'ALL-IN-ONE', 'active', NOW())", [T]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('lab-ent', ?, 'lab-sub', 'PROJECT', true, NOW())", [T]);
    const codes = ["project.read", "project.manage", "project.cashflow.read", "project.settings.labour"];
    for (const code of codes) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (UUID(), ?, ?, 'PROJECT')", [code, code]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('lab-role-manager', ?, 'LAB_MANAGER','Manager','PROJECT'), ('lab-role-finance', ?, 'LAB_FINANCE','Finance','PROJECT'), ('lab-role-plain', ?, 'LAB_PLAIN','Plain','PROJECT')", [T, T, T]);
    const grant = (role: string, list: string[]) => connection.query(`INSERT INTO role_permissions (roleId, permissionId) SELECT ?, id FROM permissions WHERE code IN (${list.map(() => "?").join(",")})`, [role, ...list]);
    await grant("lab-role-manager", ["project.read", "project.manage", "project.cashflow.read"]);
    await grant("lab-role-finance", ["project.read", "project.cashflow.read", "project.settings.labour"]);
    await grant("lab-role-plain", ["project.read"]);
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('lab-m-manager', ?, ?, 'active'),('lab-m-finance', ?, ?, 'active'),('lab-m-plain', ?, ?, 'active')", [T, users.manager, T, users.finance, T, users.plain]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('lab-mr-manager','lab-m-manager','lab-role-manager','company'),('lab-mr-finance','lab-m-finance','lab-role-finance','company'),('lab-mr-plain','lab-m-plain','lab-role-plain','company')");
    await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name, plannedValue) VALUES (?, ?, ?, 'LB-1', 'Labour work', 100000)", [WBS, T, P]);
    await connection.query("INSERT INTO budget_lines (id, tenantId, projectId, wbsItemId, costCode, originalAmount, currentAmount) VALUES (?, ?, ?, ?, 'LAB', 90000, 90000)", [uid(900), T, P, WBS]);
    // 10% progress of a 100,000 item -> earned value 10,000
    await connection.query("INSERT INTO progress_entries (id, tenantId, projectId, wbsItemId, progressPercent, status, measuredAt) VALUES (?, ?, ?, ?, 10, 'submitted', '2026-10-01 00:00:00')", [uid(901), T, P, WBS]);
    await connection.query("INSERT INTO employees (id, tenantId, employeeNumber, fullName, jobTitle, department, hireDate, employmentStatus, createdByUserId) VALUES (?, ?, 'E-A', 'Employee A', 'Foreman', 'Site', '2024-01-01', 'active', ?), (?, ?, 'E-B', 'Employee B', 'Labourer', 'Site', '2024-01-01', 'active', ?)", [EMP_A, T, users.manager, EMP_B, T, users.manager]);
    // A: 8000 basic + 1500 housing + 500 transport = 10,000 direct; end-of-service accrual 700. B has no salary structure.
    await connection.query("INSERT INTO salary_structures (id, tenantId, employeeId, baseSalary, housingAllowance, transportAllowance, hardshipAllowance, gosiRate, otherDeductions, eosMonthlyAccrual, currency, active, createdByUserId) VALUES (?, ?, ?, 8000, 1500, 500, 0, 0.09, 0, 700, 'SAR', true, ?)", [SAL_A, T, EMP_A, users.manager]);
    await connection.query("INSERT INTO project_resources (id, tenantId, projectId, resourceCode, name, resourceType, plannedUnits, allocatedUnits, unitCost, currency, createdByUserId) VALUES (?, ?, ?, 'LAB-RES', 'Labour', 'labor', 1000, 0, 50, 'SAR', ?)", [RES, T, P, users.manager]);
    await connection.query("INSERT INTO employee_assignments (id, tenantId, projectId, employeeId, projectResourceId, wbsItemId, plannedStartAt, plannedFinishAt, plannedHours, status, createdByUserId) VALUES (?, ?, ?, ?, ?, ?, '2026-10-01', '2026-10-31', 100, 'active', ?), (?, ?, ?, ?, ?, ?, '2026-10-01', '2026-10-31', 100, 'active', ?)", [ASG_A, T, P, EMP_A, RES, WBS, users.manager, ASG_B, T, P, EMP_B, RES, WBS, users.manager]);
    const entry = (id: string, assignment: string, employee: string, date: string) => connection.query("INSERT INTO employee_time_entries (id, tenantId, assignmentId, employeeId, projectId, workDate, actualHours, status, createdByUserId) VALUES (?, ?, ?, ?, ?, ?, 8, 'submitted', ?)", [id, T, assignment, employee, P, date, users.manager]);
    await entry(TE1, ASG_A, EMP_A, "2026-10-04"); await entry(TE2, ASG_A, EMP_A, "2026-10-05"); await entry(TE3, ASG_B, EMP_B, "2026-10-04");
  }, 60_000);

  afterAll(async () => { await clear(); await connection.end(); });

  const costOf = async (timeEntryId: string) => { const [rows] = await connection.query<{ amount: string; wbsItemId: string; category: string; sourceType: string; rateSource: string }[]>("SELECT c.amount, c.wbsItemId, c.category, c.sourceType, t.rateSource FROM employee_time_entries t INNER JOIN cost_entries c ON c.id = t.costEntryId WHERE t.id = ?", [timeEntryId]); return rows[0]; };
  const transition = async (id: string) => (await import("./db")).transitionEmployeeTimeEntryForTenant({ userId: users.manager, tenantId: T, projectId: P, timeEntryId: id, status: "approved" });

  it("starts from the defaults: no loading, Sunday-Thursday, 8 hours, and says so", async () => {
    const finance = callerFor(users.finance, "lab-finance");
    expect(await finance.labourSettings.get({ tenantId: T })).toEqual({ employerGosiRate: 0, indirectLoadingPercent: 0, hoursPerDay: 8, workingDays: [0, 1, 2, 3, 4], isDefault: true, canEdit: true });
  });

  it("prices approved hours from payroll, loaded, and posts them to the WBS as labour cost from the time entry", async () => {
    await transition(TE1);
    // (10,000 + 700 end-of-service) / 168 h = 63.69 per hour; 8 h = 509.52
    expect(await costOf(TE1)).toMatchObject({ amount: "509.52", wbsItemId: WBS, category: "labour", sourceType: "time_entry", rateSource: "loaded" });
  });

  it("follows the tenant's own factors from the moment they are saved", async () => {
    const finance = callerFor(users.finance, "lab-finance");
    // employer insurance 11.75% and indirects 10% of basic + allowances: (10,000 + 1,175 + 700 + 1,000) / 168 = 76.64 per hour
    await finance.labourSettings.save({ tenantId: T, employerGosiRate: 0.1175, indirectLoadingPercent: 10, hoursPerDay: 8, workingDays: [0, 1, 2, 3, 4] });
    await transition(TE2);
    expect(await costOf(TE2)).toMatchObject({ amount: "613.12", rateSource: "loaded" }); // 8 x 76.64
    // the earlier entry is history: it keeps the price it was approved at
    expect((await costOf(TE1)).amount).toBe("509.52");
    const [audit] = await connection.query<{ metadata: string }[]>("SELECT metadata FROM audit_logs WHERE tenantId = ? AND action = 'tenant.labour_settings_saved'", [T]);
    expect(JSON.parse(audit[0].metadata)).toMatchObject({ before: { employerGosiRate: 0, indirectLoadingPercent: 0 }, after: { employerGosiRate: 0.1175, indirectLoadingPercent: 10 } });
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
    // AC = 509.52 + 613.12 + 400 = 1,522.64; EV = 10% x 100,000 = 10,000 -> CPI = 10,000 / 1,522.64
    expect(evm.ac).toBeCloseTo(1522.64, 2);
    expect(evm.ev).toBe(10000);
    expect(evm.cpi).toBeCloseTo(10000 / 1522.64, 4);
    const managerCaller = callerFor(users.manager, "lab-manager");
    const labour = await managerCaller.profitability.labour(scope);
    // loaded 509.52 + 613.12 = 1,122.64 over the same 16 hours at pay alone (2 x 8 x 59.52 = 952.32) = 1.1788
    expect(labour).toMatchObject({ approvedEntries: 3, loadedEntries: 2, resourceEntries: 1, hours: 24, loadedCost: 1122.64, effectiveLoadingFactor: 1.1788, isDefault: false });
    expect(JSON.stringify(labour)).not.toMatch(/baseSalary|hourlyCost|63\.69|76\.64/);
  });

  it("applies the tenant's working calendar to assignment capacity (G-124): Monday-Friday and 10 hours turn a refused plan into an accepted one", async () => {
    const { createEmployeeAssignmentForTenant } = await import("./db");
    // Employee B already carries 100 planned hours in October. 120 more = 220 against a capacity of 21 x 8 = 168 on the default week.
    const plan = { userId: users.manager, ...scope, employeeId: EMP_B, projectResourceId: RES, plannedStartAt: day("2026-10-01"), plannedFinishAt: day("2026-10-31"), plannedHours: 120 };
    const refused = await createEmployeeAssignmentForTenant(plan);
    expect(refused.capacity).toMatchObject({ workingDays: 21, availableHours: 168, exceedsCapacity: true });
    // Monday-Friday = 22 days and 10-hour days = 220 hours: the same plan fits
    await callerFor(users.finance, "lab-finance").labourSettings.save({ tenantId: T, employerGosiRate: 0.1175, indirectLoadingPercent: 10, hoursPerDay: 10, workingDays: [1, 2, 3, 4, 5] });
    await connection.query("DELETE FROM employee_assignments WHERE id = ?", [refused.id]);
    const accepted = await createEmployeeAssignmentForTenant(plan);
    expect(accepted.capacity).toMatchObject({ workingDays: 22, availableHours: 220, exceedsCapacity: false });
  });

  it("lets only the permitted save settings, refuses nonsense, and keeps another tenant's settings out of reach", async () => {
    const manager = callerFor(users.manager, "lab-manager");
    const finance = callerFor(users.finance, "lab-finance");
    const input = { tenantId: T, employerGosiRate: 0.1, indirectLoadingPercent: 5, hoursPerDay: 8, workingDays: [0, 1, 2, 3, 4] };
    await expect(manager.labourSettings.save(input)).rejects.toThrow("Required permission is not granted.");
    await expect(callerFor(users.plain, "lab-plain").labourSettings.get({ tenantId: T })).rejects.toThrow("Required permission is not granted.");
    await expect(finance.labourSettings.save({ ...input, workingDays: [1, 1, 2] })).rejects.toThrow("PROJECT_OS_LABOUR_SETTINGS_INVALID");
    await expect(finance.labourSettings.save({ ...input, tenantId: T_OTHER })).rejects.toThrow();
    // a cash-flow reader can read the settings but not change them
    expect(await manager.labourSettings.get({ tenantId: T })).toMatchObject({ canEdit: false, hoursPerDay: 10 });
    // the refused saves changed nothing
    expect(await finance.labourSettings.get({ tenantId: T })).toMatchObject({ employerGosiRate: 0.1175, indirectLoadingPercent: 10, hoursPerDay: 10, workingDays: [1, 2, 3, 4, 5] });
  });
});
