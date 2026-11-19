import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import type { TrpcContext } from "./_core/context";
import { appRouter } from "./routers";
import { buildP6Xer } from "./domain/smartImport/p6Fixture";
import { analyzeP6Import, confirmP6Import } from "./p6Import";
import { confirmScheduleUpdate } from "./p6Update";
import { clearP6Tenant, seedOutsiderTenant } from "./testing/p6Isolation";

// Q-23 (live schedule, first batch). A SYNTHETIC P6 export of 50 activities (p6Fixture.ts; nothing real in it) is confirmed: its snapshot is the project's
// BASELINE, dated by the file's own data date. An activity update then leaves a second snapshot (not a baseline). The live schedule is checked against
// numbers the test computes itself from the database: variance in days against the baseline, critical by P6 float, planned against actual at the data date,
// the two-week look-ahead. Analysis writes no snapshot; a project with no import has no baseline (null, not 0); another company and a reader scoped to
// another project are refused. Real database, real router, restricted role.
const T = "23000000-0000-4000-8000-0000000000a1";
const P = "23000000-0000-4000-8000-0000000000a2";
const PB = "23000000-0000-4000-8000-0000000000a3";
const T2 = "23000000-0000-4000-8000-0000000000a4";
const P2 = "23000000-0000-4000-8000-0000000000a5";
const DAY = 86_400_000;
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
let connection: fixtureDb.Connection;
const users = { manager: 0, reader: 0, scoped: 0, outsider: 0 };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@q23.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() } } as unknown as TrpcContext);
const code = (promise: Promise<unknown>) => promise.then(() => "no error", (error: { message?: string }) => error.message ?? "error");
const one = async <R,>(sql: string, params: unknown[] = []) => (await connection.query<any[]>(sql, params))[0] as R[];
const n = async (sql: string, params: unknown[] = []) => Number((await one<{ n: number }>(sql, params))[0].n);

async function clear() {
  await clearP6Tenant(connection, T);
  await clearP6Tenant(connection, T2);
  await connection.query("DELETE FROM users WHERE openId LIKE 'q23-%'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-23: schedule snapshots and the live schedule, on a real database", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('q23-manager','Manager','q23-manager@q23.example.test','user'),('q23-reader','Reader','q23-reader@q23.example.test','user'),('q23-scoped','Scoped','q23-scoped@q23.example.test','user')");
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'q23-%'");
    for (const key of ["manager", "reader", "scoped"] as const) users[key] = rows.find(r => r.openId === `q23-${key}`)!.id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Q23 Tenant', 'q23-tenant')", [T]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'Q23-A', 'Live schedule', 'villas', 'SAR', 'active'), (?, ?, 'Q23-B', 'No import yet', 'villas', 'SAR', 'active')", [P, T, PB, T]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('q23-sub', ?, 'ALL-IN-ONE', 'active', NOW())", [T]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('q23-ent', ?, 'q23-sub', 'PROJECT', true, NOW())", [T]);
    for (const permission of ["project.read", "project.wbs.manage", "project.schedule.manage", "project.manage"]) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (UUID(), ?, ?, 'PROJECT')", [permission, permission]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('q23-r-manager', ?, 'Q23_MANAGER','Manager','PROJECT'), ('q23-r-reader', ?, 'Q23_READER','Reader','PROJECT')", [T, T]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'q23-r-manager', id FROM permissions WHERE code IN ('project.read','project.wbs.manage','project.schedule.manage','project.manage')");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'q23-r-reader', id FROM permissions WHERE code = 'project.read'");
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('q23-m-manager', ?, ?, 'active'), ('q23-m-reader', ?, ?, 'active'), ('q23-m-scoped', ?, ?, 'active')", [T, users.manager, T, users.reader, T, users.scoped]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('q23-mr-manager','q23-m-manager','q23-r-manager','company'),('q23-mr-reader','q23-m-reader','q23-r-reader','company')");
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType, scopeId) VALUES ('q23-mr-scoped','q23-m-scoped','q23-r-reader','project', ?)", [PB]);
    users.outsider = await seedOutsiderTenant(connection, { tenantId: T2, projectId: P2, prefix: "q23" });
  }, 60_000);
  afterAll(async () => { if (connection) { await clear(); await connection.end(); } });

  it("analysis writes no snapshot; the confirmed import's snapshot is the BASELINE, dated by the file's data date, holding all 50 activities", async () => {
    const { bytes } = buildP6Xer({ activities: 50, withActuals: false });
    const scope = { userId: users.manager, tenantId: T, projectId: P };
    await analyzeP6Import({ ...scope, bytes });
    expect(await n("SELECT COUNT(*) AS n FROM schedule_snapshots WHERE tenantId = ?", [T])).toBe(0);
    const plan = await confirmP6Import({ ...scope, bytes, source: { key: "q23/baseline.xer", name: "baseline.xer" } });
    const [snapshot] = await one<{ source: string; isBaseline: boolean; activityCount: number; dataDate: Date; importId: string }>("SELECT source, isBaseline, activityCount, dataDate, importId FROM schedule_snapshots WHERE tenantId = ? AND projectId = ?", [T, P]);
    expect({ ...snapshot, isBaseline: Boolean(snapshot.isBaseline), dataDate: new Date(snapshot.dataDate).toISOString() }).toEqual({ source: "p6_import", isBaseline: true, activityCount: 50, dataDate: "2026-09-30T00:00:00.000Z", importId: plan.importId });
    expect(await n("SELECT COUNT(*) AS n FROM schedule_snapshot_activities a INNER JOIN activities x ON x.id = a.activityId AND x.plannedFinishAt = a.plannedFinishAt WHERE a.tenantId = ? AND a.projectId = ?", [T, P])).toBe(50);
  }, 120_000);

  it("an activity update leaves a second snapshot (NOT a baseline); the live schedule reads variance, critical, planned-vs-actual and the look-ahead from the database", async () => {
    const workbook = new ExcelJS.Workbook(); const sheet = workbook.addWorksheet("TASK");
    sheet.addRow(["Activity ID", "(*)Start", "(*)Finish"]);
    // the fixture plans activity i from 2023-10-01 + 2i to + 2i + 14: A1000 starts one day late and finishes two days late; A1010..A1040 start one day late
    sheet.addRow(["A1000", "2023-10-02", "2023-10-17"]);
    sheet.addRow(["A1010", "2023-10-04", "2023-10-17"]);
    for (const [activity, start] of [["A1020", "2023-10-06"], ["A1030", "2023-10-08"], ["A1040", "2023-10-10"]]) sheet.addRow([activity, start, ""]);
    await confirmScheduleUpdate({ userId: users.manager, tenantId: T, projectId: P, bytes: new Uint8Array(await workbook.xlsx.writeBuffer()), source: { key: "q23/update.xlsx", name: "update.xlsx" } });
    const snapshots = await one<{ source: string; isBaseline: boolean; activityCount: number }>("SELECT source, isBaseline, activityCount FROM schedule_snapshots WHERE tenantId = ? AND projectId = ? ORDER BY createdAt", [T, P]);
    expect(snapshots.map(row => [row.source, Boolean(row.isBaseline), row.activityCount])).toEqual([["p6_import", true, 50], ["p6_update", false, 50]]);

    // re-planned by hand after the update: A1490 now starts 5 days after the data date (in the look-ahead), A1480 20 days after (outside it)
    const [{ dataDate }] = await one<{ dataDate: Date }>("SELECT dataDate FROM schedule_snapshots WHERE tenantId = ? AND projectId = ? AND isBaseline = false", [T, P]);
    const at = new Date(dataDate).getTime();
    await connection.query("UPDATE activities SET plannedStartAt = ?, plannedFinishAt = ? WHERE tenantId = ? AND projectId = ? AND code = 'A1490'", [new Date(at + 5 * DAY), new Date(at + 30 * DAY), T, P]);
    await connection.query("UPDATE activities SET plannedStartAt = ?, plannedFinishAt = ? WHERE tenantId = ? AND projectId = ? AND code = 'A1480'", [new Date(at + 20 * DAY), new Date(at + 40 * DAY), T, P]);

    const live = await callerFor(users.reader, "q23-reader").schedule.live({ tenantId: T, projectId: P });
    const row = (activity: string) => live.rows.find(item => item.code === activity)!;
    expect([row("A1000").startVarianceDays, row("A1000").finishVarianceDays, row("A1010").startVarianceDays, row("A1020").startVarianceDays, row("A1100").startVarianceDays]).toEqual([1, 2, 1, 1, 0]);
    const [baseline1490] = await one<{ plannedFinishAt: Date }>("SELECT s.plannedFinishAt FROM schedule_snapshot_activities s INNER JOIN schedule_snapshots h ON h.id = s.snapshotId AND h.isBaseline = true WHERE s.tenantId = ? AND s.projectId = ? AND s.code = 'A1490'", [T, P]);
    expect(row("A1490").finishVarianceDays).toBe(Math.round((at + 30 * DAY - new Date(baseline1490.plannedFinishAt).getTime()) / DAY));
    expect(live.summary).toEqual({
      activities: 50,
      critical: await n("SELECT COUNT(*) AS n FROM activities WHERE tenantId = ? AND projectId = ? AND status <> 'completed' AND totalFloatHours <= 0", [T, P]),
      plannedToStart: await n("SELECT COUNT(*) AS n FROM schedule_snapshot_activities s INNER JOIN schedule_snapshots h ON h.id = s.snapshotId AND h.isBaseline = true WHERE s.tenantId = ? AND s.projectId = ? AND s.plannedStartAt <= ?", [T, P, new Date(at)]),
      started: 5,
      plannedToFinish: await n("SELECT COUNT(*) AS n FROM schedule_snapshot_activities s INNER JOIN schedule_snapshots h ON h.id = s.snapshotId AND h.isBaseline = true WHERE s.tenantId = ? AND s.projectId = ? AND s.plannedFinishAt <= ?", [T, P, new Date(at)]),
      finished: 2,
      lateFinishing: await n("SELECT COUNT(*) AS n FROM activities a INNER JOIN schedule_snapshot_activities s ON s.activityId = a.id INNER JOIN schedule_snapshots h ON h.id = s.snapshotId AND h.isBaseline = true WHERE a.tenantId = ? AND a.projectId = ? AND COALESCE(a.actualFinishAt, a.plannedFinishAt) > s.plannedFinishAt + INTERVAL '12 hours'", [T, P]),
      lookAhead: 1,
    });
    expect(live.summary.critical).toBeGreaterThan(0);
    expect(live.lookAhead).toEqual([row("A1490").id]);
    expect(row("A1000").critical).toBe(false); // complete: never critical, whatever its float
  }, 120_000);

  it("a project with no import has no baseline: the planned counts are null («not available»), not 0", async () => {
    const live = await callerFor(users.reader, "q23-reader").schedule.live({ tenantId: T, projectId: PB });
    expect(live.baseline).toBeNull();
    expect(live.summary).toMatchObject({ activities: 0, critical: null, plannedToStart: null, plannedToFinish: null, lateFinishing: null });
  });

  it("ISOLATION: another company is refused; a reader scoped to another project of the same company is refused on this one", async () => {
    expect(await code(callerFor(users.outsider, "q23-outsider").schedule.live({ tenantId: T, projectId: P }))).toBe("PROJECT_OS_TENANT_ACCESS_DENIED");
    expect(await code(callerFor(users.outsider, "q23-outsider").schedule.live({ tenantId: T2, projectId: P }))).toMatch(/^PROJECT_OS_/);
    expect(await code(callerFor(users.scoped, "q23-scoped").schedule.live({ tenantId: T, projectId: P }))).toMatch(/^PROJECT_OS_.*DENIED|FORBIDDEN/);
    expect((await callerFor(users.scoped, "q23-scoped").schedule.live({ tenantId: T, projectId: PB })).summary.activities).toBe(0);
  });
});
