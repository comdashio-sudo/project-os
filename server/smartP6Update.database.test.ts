import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";
import { appRouter } from "./routers";
import { startFakeS3, type FakeS3 } from "./testing/fakeS3";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildP6Xer } from "./domain/smartImport/p6Fixture";
import { analyzeScheduleUpdate, confirmScheduleUpdate } from "./p6Update";
import { activitySnapshot, clearP6Tenant, seedOutsiderTenant } from "./testing/p6Isolation";

// Work order 20, a Primavera P6 «update activities» export in the legacy .xls format applied to a schedule already imported from the .xer.
// (was: a Primavera P6 export (.xer): a SYNTHETIC file with the table sizes of a real export (p6Fixture.ts; nothing real in it) goes through the smart import box and is written in FULL —
// the WBS tree, the activities, their relationships, the resources and assignments, the activity codes and the calendars — not the activities alone.
const T = "79000000-0000-4000-8000-0000000000a9";
const P = "79000000-0000-4000-8000-0000000000aa";
const PB = "79000000-0000-4000-8000-0000000000ab"; // a second project of the SAME company (isolation between projects)
const T2 = "79000000-0000-4000-8000-0000000000ac"; // ANOTHER company (isolation between companies)
const P2 = "79000000-0000-4000-8000-0000000000ad";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
let connection: fixtureDb.Connection;
let s3: FakeS3;
const users = { manager: 0, reader: 0, outsider: 0 };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@p6u.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
const scope = { tenantId: T, projectId: P };
const one = async <R,>(sql: string, params: unknown[] = []) => (await connection.query<any[]>(sql, params))[0] as R[];
const n = async (sql: string, params: unknown[] = []) => Number((await one<{ n: number }>(sql, params))[0].n);

async function clear() {
  await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM data_import_sources WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM import_source_profiles WHERE tenantId = ?", [T]);
  await connection.query("DELETE r FROM data_import_row_results r INNER JOIN data_imports i ON i.id = r.importId WHERE i.tenantId = ?", [T]);
  await connection.query("DELETE FROM data_imports WHERE tenantId = ?", [T]);
  for (const table of ["activity_resource_assignments", "activity_code_assignments", "activity_code_values", "activity_code_types", "activity_relationships", "progress_entries", "activities", "schedule_calendars", "project_resources", "wbs_items"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [T]);
  await connection.query("DELETE FROM tenant_license_feature_overrides WHERE tenantLicenseId IN (SELECT id FROM tenant_licenses WHERE tenantId = ?)", [T]);
  await connection.query("DELETE FROM tenant_licenses WHERE tenantId = ?", [T]);
  await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId = ?", [T]);
  await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [T]);
  await connection.query("DELETE FROM roles WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM memberships WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM subscriptions WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM projects WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM companies WHERE id = ?", [T]);
  await clearP6Tenant(connection, T2);
  await connection.query("DELETE FROM users WHERE openId LIKE 'p6u-%'");
}

type Caller = ReturnType<typeof callerFor>;
async function upload(caller: Caller, fileName: string, bytes: Uint8Array) {
  const target = await caller.smartImport.createUpload({ ...scope, fileName });
  const put = await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: Buffer.from(bytes) });
  if (!put.ok) throw new Error(`PUT failed ${put.status}`);
  return target;
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("a Primavera P6 export through the smart import box, on a real database", () => {
  beforeAll(async () => {
    s3 = await startFakeS3();
    Object.assign(ENV, { storageS3Endpoint: s3.endpoint, storageS3Region: "local", storageS3AccessKeyId: "AKIALOCALTEST", storageS3SecretAccessKey: "local-test-only-secret", storageBucket: s3.bucket });
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('p6u-manager','Manager','p6u-manager@p6u.example.test','user'),('p6u-reader','Reader','p6u-reader@p6u.example.test','user')");
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'p6u-%'");
    users.manager = rows.find(r => r.openId === "p6u-manager")!.id; users.reader = rows.find(r => r.openId === "p6u-reader")!.id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'P6U Tenant', 'p6u-tenant')", [T]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'P6-U', 'P6 project', 'villas', 'SAR', 'active'), (?, ?, 'P6-UB', 'P6 project B', 'villas', 'SAR', 'active')", [P, T, PB, T]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('p6u-sub', ?, 'ALL-IN-ONE', 'active', NOW())", [T]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('p6u-ent', ?, 'p6u-sub', 'PROJECT', true, NOW())", [T]);
    for (const code of ["project.read", "project.wbs.manage", "project.schedule.manage"]) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (UUID(), ?, ?, 'PROJECT')", [code, code]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('p6u-r-manager', ?, 'P6U_MANAGER','Manager','PROJECT'), ('p6u-r-reader', ?, 'P6U_READER','Reader','PROJECT')", [T, T]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'p6u-r-manager', id FROM permissions WHERE code IN ('project.read','project.wbs.manage','project.schedule.manage')");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'p6u-r-reader', id FROM permissions WHERE code = 'project.read'");
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('p6u-m-manager', ?, ?, 'active'), ('p6u-m-reader', ?, ?, 'active')", [T, users.manager, T, users.reader]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('p6u-mr-manager','p6u-m-manager','p6u-r-manager','company'),('p6u-mr-reader','p6u-m-reader','p6u-r-reader','company')");
    users.outsider = await seedOutsiderTenant(connection, { tenantId: T2, projectId: P2, prefix: "p6u" });
  }, 60_000);
  afterAll(async () => { await clear(); await connection.end(); await s3.close(); });

  it("the legacy .xls update is recognised, matched by activity id, and previewed: «139 activities will be updated, 139 started, 120 finished, 4 not in the schedule»", async () => {
    const manager = callerFor(users.manager, "p6u-manager");
    // the schedule as it was before any progress: every activity not started
    const baseline = await upload(manager, "baseline.xer", buildP6Xer({ withActuals: false }).bytes);
    const base = (await manager.smartImport.analyze({ ...scope, uploadKey: baseline.uploadKey, fileName: "baseline.xer" })).p6Plan!;
    await manager.smartImport.confirm({ ...scope, uploadKey: baseline.uploadKey, fileName: "baseline.xer", kind: "xer", forced: {} as never, approvedHash: base.fileHash });
    expect(await n("SELECT COUNT(*) AS n FROM activities WHERE tenantId = ? AND actualStartAt IS NOT NULL", [T])).toBe(0);

    const xls = readFileSync(join(__dirname, "testing", "fixtures", "p6-activity-update.xls"));
    const target = await upload(manager, "update-activities.xls", xls);
    const analysis = await manager.smartImport.analyze({ ...scope, uploadKey: target.uploadKey, fileName: "update-activities.xls" });
    expect(analysis.understanding).toMatchObject({ format: "xls", kind: "scheduleUpdate", sheet: "TASK" });
    expect(analysis.understanding.scheduleUpdate).toMatchObject({ rows: 615, withStart: 143, withFinish: 120, ignoredSheets: ["USERDATA"] });
    const plan = analysis.scheduleUpdatePlan!;
    console.log(`P6 UPDATE PREVIEW: ${plan.updated} activities will be updated, ${plan.started} started, ${plan.finished} finished, ${plan.unknown} not in the schedule`);
    expect(plan).toMatchObject({ updated: 139, started: 139, finished: 120, moved: 0, unknown: 4, unchanged: 472, canConfirm: true });
    expect(plan.unknownCodes.sort()).toEqual(["ZZ9000", "ZZ9010", "ZZ9020", "ZZ9030"]);
    expect(await n("SELECT COUNT(*) AS n FROM activities WHERE tenantId = ? AND actualStartAt IS NOT NULL", [T])).toBe(0); // the preview wrote nothing

    const confirmed = await manager.smartImport.confirm({ ...scope, uploadKey: target.uploadKey, fileName: "update-activities.xls", kind: "scheduleUpdate", forced: {} as never, approvedHash: plan.fileHash });
    expect(confirmed).toMatchObject({ status: "completed", module: "p6update", scheduleUpdate: { updated: 139, started: 139, finished: 120, unknown: 4 } });
    expect(await n("SELECT COUNT(*) AS n FROM activities WHERE tenantId = ? AND actualStartAt IS NOT NULL", [T])).toBe(139);
    expect(await n("SELECT COUNT(*) AS n FROM activities WHERE tenantId = ? AND actualFinishAt IS NOT NULL AND status = 'completed' AND percentComplete = 100", [T])).toBe(120);
    expect(await n("SELECT COUNT(*) AS n FROM activities WHERE tenantId = ? AND status = 'in_progress'", [T])).toBe(19);
    const [a1] = await one<{ actualStartAt: Date; actualFinishAt: Date }>("SELECT actualStartAt, actualFinishAt FROM activities WHERE tenantId = ? AND code = 'A1000'", [T]);
    expect(a1.actualStartAt.toISOString().slice(0, 10)).toBe("2023-10-02"); expect(a1.actualFinishAt.toISOString().slice(0, 10)).toBe("2023-10-14");
    expect(await n("SELECT COUNT(*) AS n FROM activities WHERE tenantId = ?", [T])).toBe(611); // nothing created: the 4 unknown ids are not invented
    const audit = await one<{ action: string }>("SELECT action FROM audit_logs WHERE tenantId = ? AND entityId = ?", [T, confirmed.importId]);
    expect(audit.map(row => row.action)).toContain("schedule.p6_update_confirmed");
    expect(await n("SELECT COUNT(*) AS n FROM data_imports WHERE tenantId = ? AND moduleCode = 'p6update' AND sourceFormat = 'xls'", [T])).toBe(1);

    // the same update again changes nothing
    const again = await upload(manager, "update-activities-2.xls", xls);
    const second = (await manager.smartImport.analyze({ ...scope, uploadKey: again.uploadKey, fileName: "update-activities-2.xls" })).scheduleUpdatePlan!;
    expect(second).toMatchObject({ updated: 0, started: 0, finished: 0, unchanged: 611 });
  }, 180_000);

  it("with no schedule imported yet there is nothing to match: every id is «not in the schedule» and the update cannot be confirmed", async () => {
    const manager = callerFor(users.manager, "p6u-manager");
    await connection.query("DELETE FROM activity_resource_assignments WHERE tenantId = ?", [T]); await connection.query("DELETE FROM activity_code_assignments WHERE tenantId = ?", [T]); await connection.query("DELETE FROM activity_relationships WHERE tenantId = ?", [T]);
    await connection.query("DELETE FROM activities WHERE tenantId = ?", [T]);
    const target = await upload(manager, "update-activities-3.xls", readFileSync(join(__dirname, "testing", "fixtures", "p6-activity-update.xls")));
    const plan = (await manager.smartImport.analyze({ ...scope, uploadKey: target.uploadKey, fileName: "update-activities-3.xls" })).scheduleUpdatePlan!;
    expect(plan.canConfirm).toBe(false); expect(plan.unknown).toBe(615); expect(plan.issues.map(i => i.code)).toContain("SCHEDULE_UPDATE_NO_SCHEDULE");
    await expect(manager.smartImport.confirm({ ...scope, uploadKey: target.uploadKey, fileName: "update-activities-3.xls", kind: "scheduleUpdate", forced: {} as never })).rejects.toThrow("PROJECT_OS_IMPORT_VALIDATION_FAILED");
  }, 60_000);

  // ---- D-4 (#153), review item 4: the progress update stays inside its company and its project
  it("isolation: an outsider cannot analyse or confirm an update here; an update applied to project B (same activity ids) leaves project A untouched", async () => {
    const manager = callerFor(users.manager, "p6u-manager");
    const xls = readFileSync(join(__dirname, "testing", "fixtures", "p6-activity-update.xls"));
    // the same not-started schedule in both projects (names differ only so the two files are not the same file)
    for (const [project, suffix] of [[P, " (A)"], [PB, " (B)"]] as const) {
      const target = await manager.smartImport.createUpload({ tenantId: T, projectId: project, fileName: `base${suffix}.xer` });
      expect((await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: Buffer.from(buildP6Xer({ withActuals: false, nameSuffix: suffix }).bytes) })).ok).toBe(true);
      const base = (await manager.smartImport.analyze({ tenantId: T, projectId: project, uploadKey: target.uploadKey, fileName: `base${suffix}.xer` })).p6Plan!;
      await manager.smartImport.confirm({ tenantId: T, projectId: project, uploadKey: target.uploadKey, fileName: `base${suffix}.xer`, kind: "xer", forced: {} as never, approvedHash: base.fileHash });
    }
    // fixture reset: the first test already confirmed this synthetic .xls in this company, and the same file is refused twice — its record goes so the file can be applied again
    await connection.query("DELETE r FROM data_import_row_results r INNER JOIN data_imports i ON i.id = r.importId WHERE i.tenantId = ? AND i.moduleCode = 'p6update'", [T]);
    await connection.query("DELETE FROM data_import_sources WHERE tenantId = ? AND importId IN (SELECT id FROM data_imports WHERE tenantId = ? AND moduleCode = 'p6update')", [T, T]);
    await connection.query("DELETE FROM data_imports WHERE tenantId = ? AND moduleCode = 'p6update'", [T]);
    const beforeA = await activitySnapshot(connection, { tenantId: T, projectId: P });
    expect(beforeA).toHaveLength(611);

    // between companies: refused by name, nothing written anywhere
    await expect(analyzeScheduleUpdate({ userId: users.outsider, tenantId: T, projectId: P, bytes: xls })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
    await expect(confirmScheduleUpdate({ userId: users.outsider, tenantId: T, projectId: P, bytes: xls, source: { key: "x", name: "x.xls" } })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
    await expect(confirmScheduleUpdate({ userId: users.outsider, tenantId: T2, projectId: P, bytes: xls, source: { key: "x", name: "x.xls" } })).rejects.toThrow(/PROJECT_OS_/);
    expect(await n("SELECT COUNT(*) AS n FROM data_imports WHERE tenantId IN (?, ?) AND moduleCode = 'p6update'", [T, T2])).toBe(0);
    expect(await activitySnapshot(connection, { tenantId: T, projectId: P })).toEqual(beforeA);

    // between projects: the update goes to B only
    const target = await manager.smartImport.createUpload({ tenantId: T, projectId: PB, fileName: "update-b.xls" });
    expect((await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: xls })).ok).toBe(true);
    const plan = (await manager.smartImport.analyze({ tenantId: T, projectId: PB, uploadKey: target.uploadKey, fileName: "update-b.xls" })).scheduleUpdatePlan!;
    expect(plan).toMatchObject({ updated: 139, started: 139, finished: 120 });
    await manager.smartImport.confirm({ tenantId: T, projectId: PB, uploadKey: target.uploadKey, fileName: "update-b.xls", kind: "scheduleUpdate", forced: {} as never, approvedHash: plan.fileHash });
    expect(await n("SELECT COUNT(*) AS n FROM activities WHERE tenantId = ? AND projectId = ? AND actualStartAt IS NOT NULL", [T, PB])).toBe(139);
    expect(await n("SELECT COUNT(*) AS n FROM activities WHERE tenantId = ? AND projectId = ? AND status = 'completed' AND percentComplete = 100", [T, PB])).toBe(120);
    expect(await activitySnapshot(connection, { tenantId: T, projectId: P })).toEqual(beforeA); // A: not one date, status or timestamp moved
  }, 180_000);
});
