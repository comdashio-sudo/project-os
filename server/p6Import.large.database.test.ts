import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { TrpcContext } from "./_core/context";
import { ENV } from "./_core/env";
import { appRouter } from "./routers";
import { startFakeS3, type FakeS3 } from "./testing/fakeS3";
import { buildLargeP6Xer, LARGE_P6_COUNTS } from "./domain/smartImport/p6LargeFixture";

// Q-61 (1): a Primavera file with the table sizes of a large villa schedule — 16,469 activities, 46,592 relationships, 181,148 activity-code lines, 1,413 WBS nodes, over 10.5 MB —
// goes to Storage on a signed URL (never inside a request body), is read back by its upload key, analysed and written in full. A SYNTHETIC file: nothing real in it.
// On the code before this batch the write failed with «Maximum call stack size exceeded» (the ids of 181,148 new rows were spread into one push call).
const T = "79000000-0000-4000-8000-0000000000d1";
const P = "79000000-0000-4000-8000-0000000000d2";
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
let connection: fixtureDb.Connection; let s3: FakeS3; let userId = 0;
const scope = { tenantId: T, projectId: P };
const n = async (sql: string, params: unknown[] = []) => Number(((await connection.query<any[]>(sql, params))[0] as Array<{ n: number }>)[0].n);
const callerFor = () => appRouter.createCaller({ user: { id: userId, openId: "p6large-manager", name: "Manager", email: "p6large-manager@p6.example.test", loginMethod: "test", role: "user", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: { headers: {}, protocol: "https", ip: "127.0.0.1" } as TrpcContext["req"], res: {} as TrpcContext["res"] } as TrpcContext);

async function clear() {
  await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM data_import_sources WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM import_source_profiles WHERE tenantId = ?", [T]);
  await connection.query("DELETE r FROM data_import_row_results r INNER JOIN data_imports i ON i.id = r.importId WHERE i.tenantId = ?", [T]);
  await connection.query("DELETE FROM data_imports WHERE tenantId = ?", [T]);
  for (const table of ["activity_resource_assignments", "activity_code_assignments", "activity_code_values", "activity_code_types", "activity_relationships", "progress_entries", "activities", "schedule_calendars", "project_resources", "wbs_items"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [T]);
  await connection.query("DELETE FROM schedule_snapshot_activities WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM schedule_snapshots WHERE tenantId = ?", [T]);
  await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId = ?", [T]);
  await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [T]);
  for (const table of ["roles", "memberships", "tenant_entitlements", "subscriptions"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [T]);
  await connection.query("DELETE FROM projects WHERE id = ?", [P]); await connection.query("DELETE FROM companies WHERE id = ?", [T]);
  await connection.query("DELETE FROM users WHERE openId = 'p6large-manager'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL))("Q-61 (1): a large Primavera export through the upload key, on a real database", () => {
  beforeAll(async () => {
    s3 = await startFakeS3();
    Object.assign(ENV, { storageS3Endpoint: s3.endpoint, storageS3Region: "local", storageS3AccessKeyId: "AKIALOCALTEST", storageS3SecretAccessKey: "local-test-only-secret", storageBucket: s3.bucket });
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!); await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('p6large-manager','Manager','p6large-manager@p6.example.test','user')");
    userId = Number(((await connection.query<any[]>("SELECT id FROM users WHERE openId = 'p6large-manager'"))[0] as Array<{ id: number }>)[0].id);
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'P6 Large Tenant', 'p6-large-tenant')", [T]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'P6-LARGE', 'P6 large project', 'villas', 'SAR', 'active')", [P, T]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('p6large-sub', ?, 'ALL-IN-ONE', 'active', NOW())", [T]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('p6large-ent', ?, 'p6large-sub', 'PROJECT', true, NOW())", [T]);
    for (const code of ["project.read", "project.wbs.manage", "project.schedule.manage"]) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (UUID(), ?, ?, 'PROJECT')", [code, code]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('p6large-r', ?, 'P6LARGE_MANAGER','Manager','PROJECT')", [T]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'p6large-r', id FROM permissions WHERE code IN ('project.read','project.wbs.manage','project.schedule.manage')");
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('p6large-m', ?, ?, 'active')", [T, userId]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('p6large-mr','p6large-m','p6large-r','company')");
  }, 120_000);
  afterAll(async () => { await clear(); await connection.end(); await s3.close(); });

  it("a file over 10.5 MB goes up on the signed URL, is analysed (nothing written) and then written in full: 16,469 activities, 46,592 relationships, 181,148 code lines", async () => {
    const file = buildLargeP6Xer({ longNames: true });
    expect(file.bytes.length).toBeGreaterThan(10_500_000); // what a base64 body (14M characters) could not carry
    const manager = callerFor();
    const target = await manager.smartImport.createUpload({ ...scope, fileName: "large-schedule.xer" });
    const put = await fetch(target.uploadUrl, { method: "PUT", headers: target.headers, body: Buffer.from(file.bytes) });
    expect(put.ok).toBe(true);

    const analysis = await manager.smartImport.analyze({ ...scope, uploadKey: target.uploadKey, fileName: "large-schedule.xer" });
    const plan = analysis.p6Plan!;
    expect(plan.issues).toEqual([]); expect(plan.canConfirm).toBe(true);
    expect(plan.counts.activities.create).toBe(LARGE_P6_COUNTS.activities); expect(plan.counts.wbs.create).toBe(LARGE_P6_COUNTS.wbs);
    expect(plan.counts.relationships.create).toBe(LARGE_P6_COUNTS.relationships); expect(plan.counts.codeAssignments.create).toBe(LARGE_P6_COUNTS.codeAssignments);
    expect(await n("SELECT COUNT(*) AS n FROM activities WHERE tenantId = ?", [T])).toBe(0); // the analysis wrote nothing

    const confirmed = await manager.smartImport.confirm({ ...scope, uploadKey: target.uploadKey, fileName: "large-schedule.xer", kind: "xer", forced: {} as never, approvedHash: plan.fileHash });
    expect(confirmed).toMatchObject({ status: "completed", module: "p6", rowsSent: LARGE_P6_COUNTS.activities });
    expect(await n("SELECT COUNT(*) AS n FROM wbs_items WHERE tenantId = ?", [T])).toBe(LARGE_P6_COUNTS.wbs);
    expect(await n("SELECT COUNT(*) AS n FROM activities WHERE tenantId = ?", [T])).toBe(LARGE_P6_COUNTS.activities);
    expect(await n("SELECT COUNT(*) AS n FROM activity_relationships WHERE tenantId = ?", [T])).toBe(LARGE_P6_COUNTS.relationships);
    expect(await n("SELECT COUNT(*) AS n FROM activity_code_assignments WHERE tenantId = ?", [T])).toBe(LARGE_P6_COUNTS.codeAssignments);
    expect(await n("SELECT COUNT(*) AS n FROM activity_code_types WHERE tenantId = ?", [T])).toBe(LARGE_P6_COUNTS.codeTypes);
    // every villa's activities are reachable by their villa node (the shape the baseline calculation will read)
    expect(await n("SELECT COUNT(*) AS n FROM activities a INNER JOIN wbs_items w ON w.id = a.wbsItemId WHERE a.tenantId = ? AND w.code LIKE 'V%'", [T])).toBe(LARGE_P6_COUNTS.activities);
  }, 600_000);
});
