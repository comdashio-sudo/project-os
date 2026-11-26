import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyzeP6Import, confirmP6Import } from "./p6Import";
import { buildLargeP6Xer } from "./domain/smartImport/p6LargeFixture";

const T = "79000000-0000-4000-8000-0000000000d1";
const P = "79000000-0000-4000-8000-0000000000d2";
let connection: fixtureDb.Connection; let userId = 0;
async function clear() {
  await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM data_import_sources WHERE tenantId = ?", [T]);
  await connection.query("DELETE r FROM data_import_row_results r INNER JOIN data_imports i ON i.id = r.importId WHERE i.tenantId = ?", [T]);
  await connection.query("DELETE FROM data_imports WHERE tenantId = ?", [T]);
  for (const table of ["activity_resource_assignments", "activity_code_assignments", "activity_code_values", "activity_code_types", "activity_relationships", "progress_entries", "activities", "schedule_calendars", "project_resources", "wbs_items"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [T]);
  await connection.query("DELETE FROM schedule_snapshot_activities WHERE projectId = ?", [P]);
  await connection.query("DELETE FROM schedule_snapshots WHERE projectId = ?", [P]);
  await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId = ?", [T]);
  await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [T]);
  for (const t of ["roles", "memberships", "tenant_entitlements", "subscriptions"]) await connection.query(`DELETE FROM ${t} WHERE tenantId = ?`, [T]);
  await connection.query("DELETE FROM projects WHERE id = ?", [P]); await connection.query("DELETE FROM companies WHERE id = ?", [T]);
  await connection.query("DELETE FROM users WHERE openId = 'p6large-manager'");
}
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
// WIP for Q-61 (1): times the analysis and confirmation of a synthetic file with the table sizes of a large villa schedule. Opt-in, like the D-4 timing.
describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL) || process.env.PROJECT_OS_P6_PERF !== "1")("explore: owner-shaped P6 file", () => {
  beforeAll(async () => {
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
  afterAll(async () => { await clear(); await connection.end(); });
  it("measures", async () => {
    const file = buildLargeP6Xer();
    console.log(`LARGE: ${(file.bytes.length / 1e6).toFixed(1)} MB`, JSON.stringify(file.counts));
    const scope = { userId, tenantId: T, projectId: P };
    let t = performance.now();
    const plan = await analyzeP6Import({ ...scope, bytes: file.bytes });
    console.log(`LARGE analyze ${Math.round(performance.now() - t)} ms`, JSON.stringify({ issues: plan.issues, canConfirm: plan.canConfirm, counts: plan.counts }));
    t = performance.now();
    await confirmP6Import({ ...scope, bytes: file.bytes, source: { key: "large/first.xer", name: "first.xer" } });
    console.log(`LARGE confirm ${Math.round(performance.now() - t)} ms`);
    expect(plan.issues).toEqual([]);
  }, 1_800_000);
});
