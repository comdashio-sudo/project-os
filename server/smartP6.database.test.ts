import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";
import { appRouter } from "./routers";
import { startFakeS3, type FakeS3 } from "./testing/fakeS3";
import { buildP6Xer, P6_COUNTS } from "./domain/smartImport/p6Fixture";

// Work order 20, a Primavera P6 export (.xer): a SYNTHETIC file with the table sizes of a real export (p6Fixture.ts; nothing real in it) goes through the smart import box and is written in FULL —
// the WBS tree, the activities, their relationships, the resources and assignments, the activity codes and the calendars — not the activities alone.
const T = "79000000-0000-4000-8000-0000000000f1";
const P = "79000000-0000-4000-8000-0000000000f2";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
let connection: fixtureDb.Connection;
let s3: FakeS3;
const users = { manager: 0, reader: 0 };
const callerFor = (userId: number, openId: string) => appRouter.createCaller({ user: { id: userId, openId, name: openId, email: `${openId}@p6.example.test`, loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { protocol: "https", headers: {} } as TrpcContext["req"], res: {} as TrpcContext["res"] });
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
  await connection.query("DELETE FROM projects WHERE id = ?", [P]);
  await connection.query("DELETE FROM companies WHERE id = ?", [T]);
  await connection.query("DELETE FROM users WHERE openId LIKE 'p6x-%'");
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
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('p6x-manager','Manager','p6x-manager@p6.example.test','user'),('p6x-reader','Reader','p6x-reader@p6.example.test','user')");
    const [rows] = await connection.query<{ id: number; openId: string }[]>("SELECT id, openId FROM users WHERE openId LIKE 'p6x-%'");
    users.manager = rows.find(r => r.openId === "p6x-manager")!.id; users.reader = rows.find(r => r.openId === "p6x-reader")!.id;
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'P6 Tenant', 'p6-tenant')", [T]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'P6-A', 'P6 project', 'villas', 'SAR', 'active')", [P, T]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('p6x-sub', ?, 'ALL-IN-ONE', 'active', NOW())", [T]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('p6x-ent', ?, 'p6x-sub', 'PROJECT', true, NOW())", [T]);
    for (const code of ["project.read", "project.wbs.manage", "project.schedule.manage"]) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (UUID(), ?, ?, 'PROJECT')", [code, code]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('p6x-r-manager', ?, 'P6X_MANAGER','Manager','PROJECT'), ('p6x-r-reader', ?, 'P6X_READER','Reader','PROJECT')", [T, T]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'p6x-r-manager', id FROM permissions WHERE code IN ('project.read','project.wbs.manage','project.schedule.manage')");
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'p6x-r-reader', id FROM permissions WHERE code = 'project.read'");
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('p6x-m-manager', ?, ?, 'active'), ('p6x-m-reader', ?, ?, 'active')", [T, users.manager, T, users.reader]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('p6x-mr-manager','p6x-m-manager','p6x-r-manager','company'),('p6x-mr-reader','p6x-m-reader','p6x-r-reader','company')");
  }, 60_000);
  afterAll(async () => { await clear(); await connection.end(); await s3.close(); });

  it("analyses without writing, then imports EVERYTHING: WBS tree, 611 activities, 1,434 relationships, 6 resources with 1,022 assignments, 377 code assignments, 3 calendars — the currency comes from the project", async () => {
    const manager = callerFor(users.manager, "p6x-manager");
    const built = buildP6Xer();
    const target = await upload(manager, "schedule.xer", built.bytes);
    const analysis = await manager.smartImport.analyze({ ...scope, uploadKey: target.uploadKey, fileName: "schedule.xer" });
    expect(analysis.understanding.kind).toBe("xer");
    const plan = analysis.p6Plan!;
    expect(plan.issues).toEqual([]); expect(plan.canConfirm).toBe(true);
    expect(plan.header).toMatchObject({ version: "25.12", currency: "USD" });
    expect(plan.currency).toEqual({ file: "USD", project: "SAR", differs: true }); // the preview warns; the project's currency wins
    expect(plan.warnings.some(w => w.startsWith("XER_CURRENCY_DIFFERS:USD->SAR"))).toBe(true);
    expect(plan.skippedTables.map(t => t.table).sort()).toEqual(["CURRTYPE", "OBS"]);
    expect(plan.counts.wbs.create).toBe(P6_COUNTS.wbs); expect(plan.counts.activities.create).toBe(P6_COUNTS.activities); expect(plan.counts.relationships.create).toBe(P6_COUNTS.relationships);
    expect(plan.counts.assignments.create).toBe(P6_COUNTS.assignments); expect(plan.counts.resources.create).toBe(6); expect(plan.counts.calendars.create).toBe(3);
    expect(plan.counts.codeAssignments.create).toBe(P6_COUNTS.codeAssignments);
    expect(plan.summary).toMatchObject({ activities: 611, started: built.truth.started.length, finished: built.truth.finished.length });
    for (const table of ["activities", "wbs_items", "activity_relationships", "activity_resource_assignments", "project_resources", "schedule_calendars"]) expect(await n(`SELECT COUNT(*) AS n FROM ${table} WHERE tenantId = ?`, [T]), table).toBe(0); // rolled back

    const confirmed = await manager.smartImport.confirm({ ...scope, uploadKey: target.uploadKey, fileName: "schedule.xer", kind: "xer", forced: {} as never, approvedHash: plan.fileHash });
    expect(confirmed).toMatchObject({ status: "completed", module: "p6", rowsSent: 611 });
    expect(await n("SELECT COUNT(*) AS n FROM wbs_items WHERE tenantId = ?", [T])).toBe(140);
    expect(await n("SELECT COUNT(*) AS n FROM wbs_items WHERE tenantId = ? AND parentId IS NOT NULL", [T])).toBe(139); // the tree, not a flat list
    expect(await n("SELECT COUNT(*) AS n FROM activities WHERE tenantId = ?", [T])).toBe(611);
    expect(await n("SELECT COUNT(*) AS n FROM activities WHERE tenantId = ? AND status = 'completed'", [T])).toBe(120);
    expect(await n("SELECT COUNT(*) AS n FROM activities WHERE tenantId = ? AND status = 'in_progress'", [T])).toBe(19);
    expect(await n("SELECT COUNT(*) AS n FROM activities WHERE tenantId = ? AND actualStartAt IS NOT NULL", [T])).toBe(built.truth.started.length);
    expect(await n("SELECT COUNT(*) AS n FROM activities WHERE tenantId = ? AND calendarId IS NOT NULL AND externalId IS NOT NULL", [T])).toBe(611);
    expect(Number((await one<{ total: string }>("SELECT SUM(plannedValue) AS total FROM activities WHERE tenantId = ?", [T]))[0].total)).toBeCloseTo(built.truth.totalPlannedCost, 2);
    expect(await n("SELECT COUNT(*) AS n FROM activity_relationships WHERE tenantId = ?", [T])).toBe(1434);
    expect(await n("SELECT COUNT(DISTINCT relationType) AS n FROM activity_relationships WHERE tenantId = ?", [T])).toBe(4);
    expect(await n("SELECT COUNT(*) AS n FROM project_resources WHERE tenantId = ? AND currency = 'SAR'", [T])).toBe(6);
    expect(await n("SELECT COUNT(*) AS n FROM activity_resource_assignments WHERE tenantId = ?", [T])).toBe(1022);
    expect(await n("SELECT COUNT(*) AS n FROM activity_code_types WHERE tenantId = ?", [T])).toBe(2);
    expect(await n("SELECT COUNT(*) AS n FROM activity_code_values WHERE tenantId = ?", [T])).toBe(10);
    expect(await n("SELECT COUNT(*) AS n FROM activity_code_assignments WHERE tenantId = ?", [T])).toBe(377);
    expect(await n("SELECT COUNT(*) AS n FROM schedule_calendars WHERE tenantId = ?", [T])).toBe(3);
    const audit = await one<{ action: string }>("SELECT action FROM audit_logs WHERE tenantId = ? AND entityId = ?", [T, confirmed.importId]);
    expect(audit.map(row => row.action)).toContain("schedule.p6_import_confirmed");
    // the original file is reachable from an activity
    const [activity] = await one<{ id: string }>("SELECT id FROM activities WHERE tenantId = ? AND code = 'A1000'", [T]);
    const link = await manager.smartImport.source({ ...scope, entityId: activity.id });
    expect(link).toMatchObject({ found: true, fileName: "schedule.xer", kind: "xer" });
  }, 180_000);

  it("a newer export updates by the source's own keys: one renamed activity and one changed lag are the ONLY changes; nothing is deleted; the same file is refused", async () => {
    const manager = callerFor(users.manager, "p6x-manager");
    const text = new TextDecoder().decode(buildP6Xer().bytes).replace("Activity 5", "Activity five (renamed)").replace(/(%R\t20003\t[^\n]*\t)(\d+)\n/, (_m, head, lag) => `${head}${Number(lag) + 40}\n`);
    const target = await upload(manager, "schedule-v2.xer", new TextEncoder().encode(text));
    const plan = (await manager.smartImport.analyze({ ...scope, uploadKey: target.uploadKey, fileName: "schedule-v2.xer" })).p6Plan!;
    expect(plan.counts.activities).toMatchObject({ create: 0, update: 1, unchanged: 610, absent: 0 });
    expect(plan.counts.relationships.update).toBe(1);
    expect(plan.counts.wbs).toMatchObject({ create: 0, update: 0, unchanged: 140 });
    await manager.smartImport.confirm({ ...scope, uploadKey: target.uploadKey, fileName: "schedule-v2.xer", kind: "xer", forced: {} as never, approvedHash: plan.fileHash });
    expect(await n("SELECT COUNT(*) AS n FROM activities WHERE tenantId = ?", [T])).toBe(611);
    expect(await n("SELECT COUNT(*) AS n FROM activities WHERE tenantId = ? AND name = 'Activity five (renamed)'", [T])).toBe(1);
    await expect(manager.smartImport.confirm({ ...scope, uploadKey: (await upload(manager, "again.xer", new TextEncoder().encode(text))).uploadKey, fileName: "again.xer", kind: "xer", forced: {} as never })).rejects.toThrow();
  }, 180_000);

  it("refuses: a reader without schedule permission, a file with two projects — and writes nothing", async () => {
    const reader = callerFor(users.reader, "p6x-reader");
    await expect(reader.smartImport.createUpload({ ...scope, fileName: "x.xer" })).rejects.toThrow();
    const manager = callerFor(users.manager, "p6x-manager");
    const two = new TextDecoder().decode(buildP6Xer().bytes).replace("%R\t6001\t500", "%R\t6001\t501");
    const target = await upload(manager, "two.xer", new TextEncoder().encode(two));
    const plan = (await manager.smartImport.analyze({ ...scope, uploadKey: target.uploadKey, fileName: "two.xer" })).p6Plan!;
    expect(plan.canConfirm).toBe(false); expect(plan.issues.map(i => i.code)).toContain("XER_MULTIPLE_PROJECTS");
    await expect(manager.smartImport.confirm({ ...scope, uploadKey: target.uploadKey, fileName: "two.xer", kind: "xer", forced: {} as never })).rejects.toThrow("PROJECT_OS_IMPORT_VALIDATION_FAILED");
  }, 60_000);
});
