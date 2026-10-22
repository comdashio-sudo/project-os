import mysql from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import * as serverDb from "./db";
import { appRouter } from "./routers";

// Team hours in one go (G-030) and requests that survive being sent twice (G-033), on a real database.
const T = "75000000-0000-4000-8000-0000000000a1";
const P = "75000000-0000-4000-8000-0000000000a2";
const uid = (n: number) => `75000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const [E1, E2, E3, A1, A2, A3, RES, WBS] = [101, 102, 103, 104, 105, 106, 107, 108].map(uid);
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

let connection: mysql.Connection;
const users = { foreman: 0, other: 0, plain: 0 };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@team.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const scope = { tenantId: T, projectId: P };
const db = serverDb as unknown as Record<string, (input: unknown) => Promise<any>>;

async function clear() {
  await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM client_requests WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM internal_notifications WHERE tenantId = ?", [T]);
  for (const table of ["employee_time_entries", "employee_attendance", "employee_assignments", "progress_entries", "project_resources", "employees", "wbs_items"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [T]);
  await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId = ?", [T]);
  await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [T]);
  await connection.query("DELETE FROM roles WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM memberships WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM subscriptions WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM projects WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM companies WHERE id = ?", [T]);
  await connection.query("DELETE FROM users WHERE openId LIKE 'tmh-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("team hours and idempotent phone requests on a real database", () => {
  beforeAll(async () => {
    connection = await mysql.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    const keys = ["foreman", "other", "plain"];
    await connection.query(`INSERT INTO users (openId, name, email, role) VALUES ${keys.map(() => "(?, ?, ?, 'user')").join(",")}`, keys.flatMap(key => [`tmh-${key}`, `Team ${key}`, `tmh-${key}@team.example.test`]));
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'tmh-%'");
    for (const key of keys) users[key as keyof typeof users] = rows.find(row => row.openId === `tmh-${key}`)!.id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Team Tenant', 'team-hours')", [T]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'TH-A', 'Team project', 'villas', 'SAR', 'active')", [P, T]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('tmh-sub', ?, 'ALL-IN-ONE', 'active', NOW())", [T]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('tmh-ent', ?, 'tmh-sub', 'PROJECT', true, NOW())", [T]);
    const codes = ["project.read", "project.manage", "project.progress.manage"];
    for (const code of codes) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (UUID(), ?, ?, 'PROJECT')", [code, code]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('tmh-r-foreman', ?, 'TMH_FOREMAN','Foreman','PROJECT'), ('tmh-r-other', ?, 'TMH_OTHER','Other','PROJECT'), ('tmh-r-plain', ?, 'TMH_PLAIN','Plain','PROJECT')", [T, T, T]);
    const grant = (role: string, list: string[]) => connection.query(`INSERT INTO role_permissions (roleId, permissionId) SELECT ?, id FROM permissions WHERE code IN (${list.map(() => "?").join(",")})`, [role, ...list]);
    await grant("tmh-r-foreman", ["project.read", "project.manage", "project.progress.manage"]);
    await grant("tmh-r-other", ["project.read", "project.manage", "project.progress.manage"]);
    await grant("tmh-r-plain", ["project.read"]);
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('tmh-m-foreman', ?, ?, 'active'),('tmh-m-other', ?, ?, 'active'),('tmh-m-plain', ?, ?, 'active')", [T, users.foreman, T, users.other, T, users.plain]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('tmh-mr-foreman','tmh-m-foreman','tmh-r-foreman','company'),('tmh-mr-other','tmh-m-other','tmh-r-other','company'),('tmh-mr-plain','tmh-m-plain','tmh-r-plain','company')");
    await connection.query("INSERT INTO wbs_items (id, tenantId, projectId, code, name, plannedValue) VALUES (?, ?, ?, '1', 'Block work', 1000)", [WBS, T, P]);
    await connection.query("INSERT INTO employees (id, tenantId, employeeNumber, fullName, jobTitle, department, hireDate, employmentStatus, createdByUserId) VALUES (?, ?, 'E-1', 'Worker One', 'Mason', 'Site', '2024-01-01', 'active', ?), (?, ?, 'E-2', 'Worker Two', 'Mason', 'Site', '2024-01-01', 'active', ?), (?, ?, 'E-3', 'Worker Three', 'Helper', 'Site', '2024-01-01', 'active', ?)", [E1, T, users.foreman, E2, T, users.foreman, E3, T, users.foreman]);
    await connection.query("INSERT INTO project_resources (id, tenantId, projectId, resourceCode, name, resourceType, plannedUnits, allocatedUnits, unitCost, currency, createdByUserId) VALUES (?, ?, ?, 'LAB', 'Labour', 'labor', 1000, 0, 40, 'SAR', ?)", [RES, T, P, users.foreman]);
    await connection.query("INSERT INTO employee_assignments (id, tenantId, projectId, employeeId, projectResourceId, wbsItemId, plannedStartAt, plannedFinishAt, plannedHours, status, createdByUserId) VALUES (?, ?, ?, ?, ?, ?, '2026-10-01', '2026-10-31', 100, 'active', ?), (?, ?, ?, ?, ?, ?, '2026-10-01', '2026-10-31', 100, 'active', ?), (?, ?, ?, ?, ?, ?, '2026-10-01', '2026-10-31', 100, 'active', ?)", [A1, T, P, E1, RES, WBS, users.foreman, A2, T, P, E2, RES, WBS, users.foreman, A3, T, P, E3, RES, WBS, users.foreman]);
    // attendance on 14 and 15 October: E1 and E2 present and approved; E3 present but not yet approved
    for (const date of ["2026-10-14", "2026-10-15"]) {
      await connection.query("INSERT INTO employee_attendance (id, tenantId, employeeId, attendanceDate, attendanceStatus, status, createdByUserId) VALUES (UUID(), ?, ?, ?, 'present', 'approved', ?), (UUID(), ?, ?, ?, 'present', 'approved', ?), (UUID(), ?, ?, ?, 'present', 'submitted', ?)", [T, E1, date, users.foreman, T, E2, date, users.foreman, T, E3, date, users.foreman]);
    }
  }, 60_000);

  afterAll(async () => { await clear(); await connection.end(); });
  const count = async (sql: string, params: unknown[]) => { const [rows] = await connection.query<{ n: number }[]>(sql, params); return Number(rows[0].n); };

  it("lists the team for the day, and says whose attendance is not approved yet", async () => {
    const foreman = callerFor(users.foreman, "tmh-foreman");
    const sheet = await foreman.teamHours.sheet({ ...scope, workDate: day("2026-10-14") });
    expect(sheet.rows.map(row => [row.employeeNumber, row.wbsCode, row.attendanceApproved, row.entered])).toEqual([["E-1", "1", true, null], ["E-2", "1", true, null], ["E-3", "1", false, null]]);
    // a day outside every assignment has an empty team
    expect((await foreman.teamHours.sheet({ ...scope, workDate: day("2026-12-01") })).rows).toEqual([]);
  });

  it("saves the whole team in one call, as drafts with an audit row each", async () => {
    const foreman = callerFor(users.foreman, "tmh-foreman");
    const result = await foreman.teamHours.save({ ...scope, workDate: day("2026-10-14"), entries: [{ assignmentId: A1, actualHours: 8 }, { assignmentId: A2, actualHours: 6, reportedProgressPercent: 20 }] });
    expect(result).toMatchObject({ saved: 2, errors: [] });
    const [rows] = await connection.query<{ actualHours: string; status: string; reportedProgressPercent: string | null }[]>("SELECT actualHours, status, reportedProgressPercent FROM employee_time_entries WHERE tenantId = ? ORDER BY actualHours DESC", [T]);
    expect(rows).toEqual([{ actualHours: "8.00", status: "draft", reportedProgressPercent: null }, { actualHours: "6.00", status: "draft", reportedProgressPercent: "20.00" }]);
    expect(await count("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action = 'employee.time_entry_created'", [T])).toBe(2);
    const sheet = await foreman.teamHours.sheet({ ...scope, workDate: day("2026-10-14") });
    expect(sheet.rows.map(row => row.entered)).toEqual([{ hours: 8, status: "draft" }, { hours: 6, status: "draft" }, null]);
  });

  it("saves nothing when any row is wrong, and names every wrong row", async () => {
    const before = await count("SELECT COUNT(*) AS n FROM employee_time_entries WHERE tenantId = ?", [T]);
    const result = await db.createTeamTimeEntriesForTenant({ userId: users.foreman, ...scope, workDate: day("2026-10-14"), entries: [{ assignmentId: A1, actualHours: 8 }, { assignmentId: A3, actualHours: 8 }, { assignmentId: uid(999), actualHours: 8 }, { assignmentId: A2, actualHours: 0 }, { assignmentId: A2, actualHours: 5 }] });
    expect(result.saved).toBe(0);
    expect(result.errors.map((e: { index: number; code: string }) => [e.index, e.code])).toEqual([
      [0, "PROJECT_OS_TIME_ENTRY_DAY_EXISTS"], // already entered above
      [1, "PROJECT_OS_ATTENDANCE_APPROVAL_REQUIRED"], // attendance submitted, not approved
      [2, "PROJECT_OS_TIME_ENTRY_ASSIGNMENT_INVALID"],
      [3, "PROJECT_OS_TIME_ENTRY_INVALID"],
      [4, "PROJECT_OS_TEAM_ENTRY_DUPLICATE"],
    ]);
    expect(await count("SELECT COUNT(*) AS n FROM employee_time_entries WHERE tenantId = ?", [T])).toBe(before);
  });

  it("gives the stored answer to a request sent twice, and does not run it a second time", async () => {
    const foreman = callerFor(users.foreman, "tmh-foreman");
    const clientRequestId = "75000000-0000-4000-8000-00000000f001";
    const input = { ...scope, workDate: day("2026-10-15"), entries: [{ assignmentId: A1, actualHours: 8 }, { assignmentId: A2, actualHours: 8 }], clientRequestId };
    const first = await foreman.teamHours.save(input);
    expect(first.saved).toBe(2);
    const second = await foreman.teamHours.save(input); // the phone never heard the first answer
    expect(second).toEqual(first);
    expect(await count("SELECT COUNT(*) AS n FROM employee_time_entries WHERE tenantId = ? AND workDate = '2026-10-15'", [T])).toBe(2);
  });

  it("applies the same to progress, and lets a request that failed be sent again with the same identifier", async () => {
    const foreman = callerFor(users.foreman, "tmh-foreman");
    const clientRequestId = "75000000-0000-4000-8000-00000000f002";
    // first attempt names a work item that does not exist: it fails, and the identifier is released
    await expect(foreman.progress.create({ ...scope, wbsItemId: uid(998), percentComplete: 30, reportedAt: new Date(), clientRequestId })).rejects.toThrow();
    expect(await count("SELECT COUNT(*) AS n FROM client_requests WHERE id = ?", [clientRequestId])).toBe(0);
    const sent = { ...scope, wbsItemId: WBS, percentComplete: 30, reportedAt: new Date(), clientRequestId };
    const first = await foreman.progress.create(sent);
    const second = await foreman.progress.create(sent);
    expect(second).toEqual(first);
    expect(await count("SELECT COUNT(*) AS n FROM progress_entries WHERE tenantId = ? AND wbsItemId = ?", [T, WBS])).toBe(1);
  });

  it("refuses an identifier used for another action or by another person, and a request still in flight", async () => {
    const foreman = callerFor(users.foreman, "tmh-foreman");
    const other = callerFor(users.other, "tmh-other");
    const key = "75000000-0000-4000-8000-00000000f002"; // used above for progress.create by the foreman
    await expect(foreman.teamHours.save({ ...scope, workDate: day("2026-10-14"), entries: [{ assignmentId: A1, actualHours: 8 }], clientRequestId: key })).rejects.toThrow("PROJECT_OS_CLIENT_REQUEST_REUSED");
    await expect(other.progress.create({ ...scope, wbsItemId: WBS, percentComplete: 30, reportedAt: new Date(), clientRequestId: key })).rejects.toThrow("PROJECT_OS_CLIENT_REQUEST_REUSED");
    expect(await count("SELECT COUNT(*) AS n FROM progress_entries WHERE tenantId = ?", [T])).toBe(1); // nothing new was written
    // a request recorded as started and never finished is not run again blindly
    const stuck = "75000000-0000-4000-8000-00000000f003";
    await connection.query("INSERT INTO client_requests (id, tenantId, userId, action, status) VALUES (?, ?, ?, 'progress.create', 'started')", [stuck, T, users.foreman]);
    await expect(foreman.progress.create({ ...scope, wbsItemId: WBS, percentComplete: 40, reportedAt: new Date(), clientRequestId: stuck })).rejects.toThrow("PROJECT_OS_CLIENT_REQUEST_IN_PROGRESS");
    expect(await count("SELECT COUNT(*) AS n FROM progress_entries WHERE tenantId = ?", [T])).toBe(1);
  });

  it("closes the team sheet and the bulk save to anyone without project.manage", async () => {
    const plain = callerFor(users.plain, "tmh-plain");
    await expect(plain.teamHours.sheet({ ...scope, workDate: day("2026-10-14") })).rejects.toThrow("Required permission is not granted.");
    await expect(plain.teamHours.save({ ...scope, workDate: day("2026-10-14"), entries: [{ assignmentId: A1, actualHours: 8 }] })).rejects.toThrow("Required permission is not granted.");
  });

  // G-130 found these two reads answering to a membership that was no longer active.
  it("does not let a suspended member read or acknowledge the tenant's notifications", async () => {
    const other = callerFor(users.other, "tmh-other");
    await connection.query("INSERT INTO internal_notifications (id, tenantId, recipientUserId, notificationCode, payload) VALUES ('tmh-n1', ?, ?, 'TEST', '{}')", [T, users.other]);
    expect((await other.notifications.list({ tenantId: T })).map(row => row.id)).toEqual(["tmh-n1"]); // active: sees its own
    await connection.query("UPDATE memberships SET status = 'suspended' WHERE id = 'tmh-m-other'");
    try {
      await expect(other.notifications.list({ tenantId: T })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
      await expect(other.notifications.acknowledge({ tenantId: T, notificationId: "75000000-0000-4000-8000-0000000000ff" })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
      const [rows] = await connection.query<{ acknowledgedAt: Date | null }[]>("SELECT acknowledgedAt FROM internal_notifications WHERE id = 'tmh-n1'");
      expect(rows[0].acknowledgedAt).toBeNull(); // nothing changed
    } finally { await connection.query("UPDATE memberships SET status = 'active' WHERE id = 'tmh-m-other'"); }
  });
});
