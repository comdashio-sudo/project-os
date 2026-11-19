import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";
import { appRouter } from "./routers";
import { startFakeS3, type FakeS3 } from "./testing/fakeS3";
import { buildP6Xer, P6_COUNTS } from "./domain/smartImport/p6Fixture";
import { analyzeP6Import, confirmP6Import } from "./p6Import";
import { activitySnapshot, clearP6Tenant, seedOutsiderTenant } from "./testing/p6Isolation";

// Work order 20, a Primavera P6 export (.xer): a SYNTHETIC file with the table sizes of a real export (p6Fixture.ts; nothing real in it) goes through the smart import box and is written in FULL —
// the WBS tree, the activities, their relationships, the resources and assignments, the activity codes and the calendars — not the activities alone.
const T = "79000000-0000-4000-8000-0000000000f1";
const P = "79000000-0000-4000-8000-0000000000f2";
const PB = "79000000-0000-4000-8000-0000000000f3"; // a second project of the SAME company (isolation between projects)
const T2 = "79000000-0000-4000-8000-0000000000f4"; // ANOTHER company, with its own project (isolation between companies)
const P2 = "79000000-0000-4000-8000-0000000000f5";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
let connection: fixtureDb.Connection;
let s3: FakeS3;
const users = { manager: 0, reader: 0, outsider: 0 };
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
  await connection.query("DELETE FROM schedule_snapshot_activities WHERE tenantId = ?", [T]); // Q-23
  await connection.query("DELETE FROM schedule_snapshots WHERE tenantId = ?", [T]); // Q-23
  await connection.query("DELETE FROM projects WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM companies WHERE id = ?", [T]);
  await clearP6Tenant(connection, T2);
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
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'P6-A', 'P6 project', 'villas', 'SAR', 'active'), (?, ?, 'P6-B', 'P6 project B', 'villas', 'SAR', 'active')", [P, T, PB, T]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('p6x-sub', ?, 'ALL-IN-ONE', 'active', NOW())", [T]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('p6x-ent', ?, 'p6x-sub', 'PROJECT', true, NOW())", [T]);
    for (const code of ["project.read", "project.wbs.manage", "project.schedule.manage", "project.manage"]) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (UUID(), ?, ?, 'PROJECT')", [code, code]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('p6x-r-manager', ?, 'P6X_MANAGER','Manager','PROJECT'), ('p6x-r-reader', ?, 'P6X_READER','Reader','PROJECT')", [T, T]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'p6x-r-manager', id FROM permissions WHERE code IN ('project.read','project.wbs.manage','project.schedule.manage','project.manage')"); // project.manage: the rollback below is refused for the MODULE, not for want of permission
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'p6x-r-reader', id FROM permissions WHERE code = 'project.read'");
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('p6x-m-manager', ?, ?, 'active'), ('p6x-m-reader', ?, ?, 'active')", [T, users.manager, T, users.reader]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('p6x-mr-manager','p6x-m-manager','p6x-r-manager','company'),('p6x-mr-reader','p6x-m-reader','p6x-r-reader','company')");
    users.outsider = await seedOutsiderTenant(connection, { tenantId: T2, projectId: P2, prefix: "p6x" });
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

  // ---- D-4 (#153), review items 2 and 4
  it("a confirmed P6 import cannot be rolled back: refused as PROJECT_OS_IMPORT_ROLLBACK_MODULE_UNSUPPORTED (even for project.manage), and no activity goes", async () => {
    const manager = callerFor(users.manager, "p6x-manager");
    const [record] = await one<{ id: string }>("SELECT id FROM data_imports WHERE tenantId = ? AND projectId = ? AND moduleCode = 'p6' AND status = 'completed' LIMIT 1", [T, P]);
    expect(record?.id).toBeTruthy();
    const before = await n("SELECT COUNT(*) AS n FROM activities WHERE tenantId = ? AND projectId = ?", [T, P]);
    expect(before).toBe(611);
    await expect(manager.dataImports.rollback({ ...scope, importId: record.id })).rejects.toThrow("PROJECT_OS_IMPORT_ROLLBACK_MODULE_UNSUPPORTED");
    expect(await n("SELECT COUNT(*) AS n FROM activities WHERE tenantId = ? AND projectId = ?", [T, P])).toBe(before);
    expect(await n("SELECT COUNT(*) AS n FROM data_imports WHERE id = ? AND status = 'completed'", [record.id])).toBe(1);
  }, 60_000);

  it("isolation between companies: a user who holds every schedule permission in ANOTHER company can neither analyse nor confirm on this project, and nothing is written", async () => {
    const outsider = callerFor(users.outsider, "p6x-outsider");
    const imports = await n("SELECT COUNT(*) AS n FROM data_imports WHERE tenantId IN (?, ?)", [T, T2]);
    const before = await activitySnapshot(connection, { tenantId: T, projectId: P });
    const bytes = buildP6Xer({ nameSuffix: " (outsider)" }).bytes;
    await expect(outsider.smartImport.createUpload({ ...scope, fileName: "x.xer" })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
    await expect(analyzeP6Import({ userId: users.outsider, ...scope, bytes })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
    await expect(confirmP6Import({ userId: users.outsider, ...scope, bytes, source: { key: "x", name: "x.xer" } })).rejects.toThrow("PROJECT_OS_TENANT_ACCESS_DENIED");
    // naming HIS OWN company with THIS project does not reach it either
    await expect(confirmP6Import({ userId: users.outsider, tenantId: T2, projectId: P, bytes, source: { key: "x", name: "x.xer" } })).rejects.toThrow(/PROJECT_OS_/);
    expect(await activitySnapshot(connection, { tenantId: T, projectId: P })).toEqual(before);
    expect(await n("SELECT COUNT(*) AS n FROM activities WHERE tenantId = ? OR projectId = ?", [T2, P2])).toBe(0);
    expect(await n("SELECT COUNT(*) AS n FROM data_imports WHERE tenantId IN (?, ?)", [T, T2])).toBe(imports);
    // positive control: the same outsider imports into HIS company's project
    const own = await confirmP6Import({ userId: users.outsider, tenantId: T2, projectId: P2, bytes, source: { key: "own", name: "own.xer" } });
    expect(own.canConfirm).toBe(true);
    expect(await n("SELECT COUNT(*) AS n FROM activities WHERE tenantId = ? AND projectId = ?", [T2, P2])).toBe(611);
    expect(await activitySnapshot(connection, { tenantId: T, projectId: P })).toEqual(before);
  }, 120_000);

  it("isolation between projects: importing the SAME activity codes into project B creates B's own 611 and leaves project A's activities exactly as they were", async () => {
    const manager = callerFor(users.manager, "p6x-manager");
    const before = await activitySnapshot(connection, { tenantId: T, projectId: P });
    const relationsA = await n("SELECT COUNT(*) AS n FROM activity_relationships WHERE tenantId = ? AND projectId = ?", [T, P]);
    const target = await manager.smartImport.createUpload({ tenantId: T, projectId: PB, fileName: "b.xer" });
    const put = await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: Buffer.from(buildP6Xer({ nameSuffix: " (B)" }).bytes) }); expect(put.ok).toBe(true);
    const plan = (await manager.smartImport.analyze({ tenantId: T, projectId: PB, uploadKey: target.uploadKey, fileName: "b.xer" })).p6Plan!;
    expect(plan.counts.activities).toMatchObject({ create: 611, update: 0 }); // B's codes are matched against B only
    await manager.smartImport.confirm({ tenantId: T, projectId: PB, uploadKey: target.uploadKey, fileName: "b.xer", kind: "xer", forced: {} as never, approvedHash: plan.fileHash });
    expect(await n("SELECT COUNT(*) AS n FROM activities WHERE tenantId = ? AND projectId = ? AND name LIKE '% (B)'", [T, PB])).toBe(611);
    expect(await activitySnapshot(connection, { tenantId: T, projectId: P })).toEqual(before);
    expect(await n("SELECT COUNT(*) AS n FROM activity_relationships WHERE tenantId = ? AND projectId = ?", [T, P])).toBe(relationsA);
  }, 120_000);

  it("a schedule link cannot join two projects: the database refuses a relationship whose activities are not both in its project (negative), and takes one that is (positive)", async () => {
    const [a] = await one<{ id: string }>("SELECT id FROM activities WHERE tenantId = ? AND projectId = ? AND code = 'A1000'", [T, P]);
    const [b1] = await one<{ id: string }>("SELECT id FROM activities WHERE tenantId = ? AND projectId = ? AND code = 'A1000'", [T, PB]);
    const [b2] = await one<{ id: string }>("SELECT id FROM activities WHERE tenantId = ? AND projectId = ? AND code = 'A1010'", [T, PB]);
    const insert = (id: string, pred: string, succ: string) => connection.query("INSERT INTO activity_relationships (id, tenantId, projectId, predecessorActivityId, successorActivityId, relationType) VALUES (?, ?, ?, ?, ?, 'SF')", [id, T, PB, pred, succ]);
    await expect(insert("79000000-0000-4000-8000-00000000f0a1", a.id, b1.id)).rejects.toThrow("ACTIVITY_RELATIONSHIP_CROSS_PROJECT");
    expect(await n("SELECT COUNT(*) AS n FROM activity_relationships WHERE id = '79000000-0000-4000-8000-00000000f0a1'")).toBe(0);
    await insert("79000000-0000-4000-8000-00000000f0a2", b1.id, b2.id);
    expect(await n("SELECT COUNT(*) AS n FROM activity_relationships WHERE id = '79000000-0000-4000-8000-00000000f0a2'")).toBe(1);
  }, 60_000);

  // G-209: the same guard on the schedule's other sibling tables. Both projects hold a full import written AFTER the guards existed (the positive: the
  // import's own rows pass); each negative points one of project B's rows at project A's row and is refused, and the row is left as it was.
  it("G-209: a code assignment, a resource assignment, a code value's parent or type, and an activity's calendar cannot reach another project", async () => {
    const first = async (sql: string, params: unknown[]) => (await one<Record<string, string>>(sql, params))[0];
    const crossing = async (sql: string, params: unknown[], message: string) => expect(connection.query(sql, params)).rejects.toThrow(message);
    // an activity's calendar
    const actB = await first("SELECT id, calendarId FROM activities WHERE tenantId = ? AND projectId = ? AND calendarId IS NOT NULL ORDER BY code LIMIT 1", [T, PB]);
    const calA = await first("SELECT id FROM schedule_calendars WHERE tenantId = ? AND projectId = ? LIMIT 1", [T, P]);
    const calB2 = await first("SELECT id FROM schedule_calendars WHERE tenantId = ? AND projectId = ? AND id <> ? LIMIT 1", [T, PB, actB.calendarId]);
    await crossing("UPDATE activities SET calendarId = ? WHERE id = ?", [calA.id, actB.id], "ACTIVITY_CALENDAR_CROSS_PROJECT");
    await connection.query("UPDATE activities SET calendarId = ? WHERE id = ?", [calB2.id, actB.id]); // positive: another calendar of B
    expect((await first("SELECT calendarId FROM activities WHERE id = ?", [actB.id])).calendarId).toBe(calB2.id);
    await connection.query("UPDATE activities SET calendarId = ? WHERE id = ?", [actB.calendarId, actB.id]);
    // a resource assignment
    const resB = await first("SELECT id, resourceId FROM activity_resource_assignments WHERE tenantId = ? AND projectId = ? LIMIT 1", [T, PB]);
    const resA = await first("SELECT id FROM project_resources WHERE tenantId = ? AND projectId = ? LIMIT 1", [T, P]);
    await crossing("UPDATE activity_resource_assignments SET resourceId = ? WHERE id = ?", [resA.id, resB.id], "ACTIVITY_RESOURCE_ASSIGNMENT_CROSS_PROJECT");
    const actA = await first("SELECT id FROM activities WHERE tenantId = ? AND projectId = ? LIMIT 1", [T, P]);
    await crossing("UPDATE activity_resource_assignments SET activityId = ? WHERE id = ?", [actA.id, resB.id], "ACTIVITY_RESOURCE_ASSIGNMENT_CROSS_PROJECT");
    expect((await first("SELECT resourceId FROM activity_resource_assignments WHERE id = ?", [resB.id])).resourceId).toBe(resB.resourceId);
    // a code assignment: A's value, and a value of B that belongs to another code type
    const codeB = await first("SELECT id, codeTypeId, codeValueId FROM activity_code_assignments WHERE tenantId = ? AND projectId = ? LIMIT 1", [T, PB]);
    const valueA = await first("SELECT id FROM activity_code_values WHERE tenantId = ? AND projectId = ? LIMIT 1", [T, P]);
    const otherTypeB = await first("SELECT id FROM activity_code_values WHERE tenantId = ? AND projectId = ? AND codeTypeId <> ? LIMIT 1", [T, PB, codeB.codeTypeId]);
    await crossing("UPDATE activity_code_assignments SET codeValueId = ? WHERE id = ?", [valueA.id, codeB.id], "ACTIVITY_CODE_ASSIGNMENT_CROSS_PROJECT");
    await crossing("UPDATE activity_code_assignments SET codeValueId = ? WHERE id = ?", [otherTypeB.id, codeB.id], "ACTIVITY_CODE_ASSIGNMENT_CROSS_PROJECT");
    expect((await first("SELECT codeValueId FROM activity_code_assignments WHERE id = ?", [codeB.id])).codeValueId).toBe(codeB.codeValueId);
    // a code value: A's code type, and a parent of A
    const valueB = await first("SELECT id, codeTypeId FROM activity_code_values WHERE tenantId = ? AND projectId = ? LIMIT 1", [T, PB]);
    const typeA = await first("SELECT id FROM activity_code_types WHERE tenantId = ? AND projectId = ? LIMIT 1", [T, P]);
    await crossing("UPDATE activity_code_values SET codeTypeId = ? WHERE id = ?", [typeA.id, valueB.id], "ACTIVITY_CODE_VALUE_CROSS_PROJECT");
    await crossing("UPDATE activity_code_values SET parentId = ? WHERE id = ?", [valueA.id, valueB.id], "ACTIVITY_CODE_VALUE_CROSS_PROJECT");
    expect(await n("SELECT COUNT(*) AS n FROM activity_code_values WHERE id = ? AND parentId IS NULL", [valueB.id])).toBe(1);
  }, 60_000);
});
