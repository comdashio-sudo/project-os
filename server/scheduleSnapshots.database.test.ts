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
    // the update leaves two: the activities as they stood BEFORE it (what undoing it puts back), then after it
    expect(snapshots.map(row => [row.source, Boolean(row.isBaseline), row.activityCount])).toEqual([["p6_import", true, 50], ["p6_update_before", false, 50], ["p6_update", false, 50]]);

    // re-planned by hand after the update: A1490 now starts 5 days after the data date (in the look-ahead), A1480 20 days after (outside it)
    const [{ dataDate }] = await one<{ dataDate: Date }>("SELECT dataDate FROM schedule_snapshots WHERE tenantId = ? AND projectId = ? AND isBaseline = false", [T, P]);
    const at = new Date(dataDate).getTime();
    await connection.query("UPDATE activities SET plannedStartAt = ?, plannedFinishAt = ? WHERE tenantId = ? AND projectId = ? AND code = 'A1490'", [new Date(at + 5 * DAY), new Date(at + 30 * DAY), T, P]);
    await connection.query("UPDATE activities SET plannedStartAt = ?, plannedFinishAt = ? WHERE tenantId = ? AND projectId = ? AND code = 'A1480'", [new Date(at + 20 * DAY), new Date(at + 40 * DAY), T, P]);

    const live = await callerFor(users.reader, "q23-reader").schedule.live({ tenantId: T, projectId: P });
    const row = (activity: string) => live.rows.find(item => item.code === activity)!;
    expect([row("A1000").startVarianceDays, row("A1000").finishVarianceDays, row("A1010").startVarianceDays, row("A1020").startVarianceDays, row("A1100").startVarianceDays]).toEqual([1, 2, 1, 1, 0]);
    const [baseline1490] = await one<{ plannedFinishAt: Date }>("SELECT s.plannedFinishAt FROM schedule_snapshot_activities s INNER JOIN schedule_snapshots h ON h.id = s.snapshotId AND h.isBaseline = true WHERE s.tenantId = ? AND s.projectId = ? AND s.code = 'A1490'", [T, P]);
    const utcDay = (ms: number) => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); };
    expect(row("A1490").finishVarianceDays).toBe((utcDay(at + 30 * DAY) - utcDay(new Date(baseline1490.plannedFinishAt).getTime())) / DAY);
    expect(live.summary).toEqual({
      activities: 50,
      critical: await n("SELECT COUNT(*) AS n FROM activities WHERE tenantId = ? AND projectId = ? AND status <> 'completed' AND totalFloatHours <= 0", [T, P]),
      plannedToStart: await n("SELECT COUNT(*) AS n FROM schedule_snapshot_activities s INNER JOIN schedule_snapshots h ON h.id = s.snapshotId AND h.isBaseline = true WHERE s.tenantId = ? AND s.projectId = ? AND s.plannedStartAt <= ?", [T, P, new Date(at)]),
      started: 5,
      plannedToFinish: await n("SELECT COUNT(*) AS n FROM schedule_snapshot_activities s INNER JOIN schedule_snapshots h ON h.id = s.snapshotId AND h.isBaseline = true WHERE s.tenantId = ? AND s.projectId = ? AND s.plannedFinishAt <= ?", [T, P, new Date(at)]),
      finished: 2,
      lateFinishing: await n("SELECT COUNT(*) AS n FROM activities a INNER JOIN schedule_snapshot_activities s ON s.activityId = a.id INNER JOIN schedule_snapshots h ON h.id = s.snapshotId AND h.isBaseline = true WHERE a.tenantId = ? AND a.projectId = ? AND (COALESCE(a.actualFinishAt, a.plannedFinishAt) AT TIME ZONE 'UTC')::date > (s.plannedFinishAt AT TIME ZONE 'UTC')::date", [T, P]),
      lookAhead: 1,
    });
    expect(live.summary.critical).toBeGreaterThan(0);
    expect(live.lookAhead).toEqual([row("A1490").id]);
    expect(row("A1000").critical).toBe(false); // complete: never critical, whatever its float
  }, 120_000);

  // G-208: undoing an activity update puts back what it changed, from the snapshot taken before it — never a delete; refused (nothing written) when it is not
  // the latest, or when an activity it changed was edited since, or for a reader without project.manage.
  it("G-208: an activity update is undone — refused for a reader, when not the latest, and when an activity it changed was edited since; then the activities are as before it", async () => {
    const manager = callerFor(users.manager, "q23-manager");
    const updates = await one<{ id: string }>("SELECT id FROM data_imports WHERE tenantId = ? AND projectId = ? AND moduleCode = 'p6update' ORDER BY createdAt", [T, P]);
    const first = updates[0].id;
    const actuals = async () => (await one<{ code: string; actualStartAt: Date | null; actualFinishAt: Date | null; status: string }>("SELECT code, actualStartAt, actualFinishAt, status FROM activities WHERE tenantId = ? AND projectId = ? AND code IN ('A1000','A1010','A1020','A1030','A1040','A1050') ORDER BY code", [T, P]))
      .map(row => [row.code, row.status, row.actualStartAt ? new Date(row.actualStartAt).toISOString().slice(0, 10) : null, row.actualFinishAt ? new Date(row.actualFinishAt).toISOString().slice(0, 10) : null]);
    const afterFirst = await actuals();
    expect(afterFirst.slice(0, 2)).toEqual([["A1000", "completed", "2023-10-02", "2023-10-17"], ["A1010", "completed", "2023-10-04", "2023-10-17"]]);
    // NEGATIVE: a reader (project.read) may not undo
    expect(await code(callerFor(users.reader, "q23-reader").dataImports.rollback({ tenantId: T, projectId: P, importId: first }))).toBe("PROJECT_OS_PERMISSION_DENIED");
    // a second update (A1050 starts) — now the first is not the latest
    const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("TASK"); sheet.addRow(["Activity ID", "(*)Start", "(*)Finish"]); sheet.addRow(["A1050", "2023-10-12", ""]);
    const second = (await confirmScheduleUpdate({ userId: users.manager, tenantId: T, projectId: P, bytes: new Uint8Array(await book.xlsx.writeBuffer()), source: { key: "q23/update-2.xlsx", name: "update-2.xlsx" } })).importId;
    expect(await code(manager.dataImports.rollback({ tenantId: T, projectId: P, importId: first }))).toBe("PROJECT_OS_SCHEDULE_ROLLBACK_NOT_LATEST");
    // NEGATIVE: an activity the second update changed is edited after it — undoing would erase that work, so it is refused and nothing moves
    await connection.query("UPDATE activities SET actualStartAt = ? WHERE tenantId = ? AND projectId = ? AND code = 'A1050'", [new Date("2023-10-13T00:00:00Z"), T, P]);
    const edited = await actuals();
    expect(await code(manager.dataImports.rollback({ tenantId: T, projectId: P, importId: second }))).toBe("PROJECT_OS_SCHEDULE_ROLLBACK_CHANGED_SINCE");
    expect(await actuals()).toEqual(edited);
    expect(await n("SELECT COUNT(*) AS n FROM data_imports WHERE id = ? AND status = 'completed'", [second])).toBe(1);
    await connection.query("UPDATE activities SET actualStartAt = ? WHERE tenantId = ? AND projectId = ? AND code = 'A1050'", [new Date("2023-10-12T00:00:00Z"), T, P]);
    // POSITIVE: the second undone, then the first — every activity back to the import's state (not started, no actual dates)
    expect(await manager.dataImports.rollback({ tenantId: T, projectId: P, importId: second })).toMatchObject({ rolledBack: true, restored: { activities: 1 } });
    expect((await actuals()).find(row => row[0] === "A1050")).toEqual(["A1050", "not_started", null, null]);
    expect(await manager.dataImports.rollback({ tenantId: T, projectId: P, importId: first })).toMatchObject({ rolledBack: true, restored: { activities: 5 } });
    expect(await actuals()).toEqual(["A1000", "A1010", "A1020", "A1030", "A1040", "A1050"].map(activity => [activity, "not_started", null, null]));
    // recorded: both imports cancelled, an audit row each, and the undo is itself a snapshot (append-only history; nothing deleted)
    expect(await n("SELECT COUNT(*) AS n FROM data_imports WHERE id IN (?, ?) AND status = 'cancelled'", [first, second])).toBe(2);
    expect(await n("SELECT COUNT(*) AS n FROM audit_logs WHERE tenantId = ? AND action = 'data_import_rolled_back' AND entityId IN (?, ?)", [T, first, second])).toBe(2);
    expect(await n("SELECT COUNT(*) AS n FROM schedule_snapshots WHERE tenantId = ? AND projectId = ? AND source = 'p6_rollback'", [T, P])).toBe(2);
    // and a cancelled update is not undone twice
    expect(await code(manager.dataImports.rollback({ tenantId: T, projectId: P, importId: first }))).toMatch(/^PROJECT_OS_IMPORT_ROLLBACK/);
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
