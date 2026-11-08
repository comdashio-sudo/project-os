import fixtureDb from "./testing/pgCompat";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { analyzeP6Import, confirmP6Import } from "./p6Import";
import { buildP6Xer } from "./domain/smartImport/p6Fixture";

// D-4 (#153), review item 3: the time to re-import a schedule in which EVERY one of 10,000 activities changed (a SYNTHETIC file, nothing real in it).
// The first import creates the 10,000; the second (the same schedule, each name suffixed) updates all of them — analysed (rolled back) then confirmed.
// Opt-in (PROJECT_OS_P6_PERF=1): it measures, it does not gate. The numbers before/after the batched UPDATE are in docs/STATE.md (D-4).
const T = "79000000-0000-4000-8000-0000000000c1";
const P = "79000000-0000-4000-8000-0000000000c2";
const COUNT = 10_000;
const isUrl = (value: string | undefined) => { try { const url = new URL(value ?? ""); return /^postgres(?:ql)?:$/.test(url.protocol) && Boolean(url.hostname); } catch { return false; } };
let connection: fixtureDb.Connection;
let userId = 0;
const n = async (sql: string, params: unknown[] = []) => Number(((await connection.query<any[]>(sql, params))[0] as Array<{ n: number }>)[0].n);

async function clear() {
  await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM data_import_sources WHERE tenantId = ?", [T]);
  await connection.query("DELETE r FROM data_import_row_results r INNER JOIN data_imports i ON i.id = r.importId WHERE i.tenantId = ?", [T]);
  await connection.query("DELETE FROM data_imports WHERE tenantId = ?", [T]);
  for (const table of ["activity_resource_assignments", "activity_code_assignments", "activity_code_values", "activity_code_types", "activity_relationships", "progress_entries", "activities", "schedule_calendars", "project_resources", "wbs_items"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [T]);
  await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId = ?", [T]);
  await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [T]);
  await connection.query("DELETE FROM roles WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM memberships WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM subscriptions WHERE tenantId = ?", [T]);
  await connection.query("DELETE FROM projects WHERE id = ?", [P]);
  await connection.query("DELETE FROM companies WHERE id = ?", [T]);
  await connection.query("DELETE FROM users WHERE openId = 'p6perf-manager'");
}

describe.skipIf(!isUrl(process.env.TEST_DATABASE_URL) || process.env.PROJECT_OS_P6_PERF !== "1")("timing: a P6 re-import that changes 10,000 activities", () => {
  beforeAll(async () => {
    connection = await fixtureDb.createConnection(process.env.TEST_DATABASE_URL!);
    await clear();
    await connection.query("INSERT INTO users (openId, name, email, role) VALUES ('p6perf-manager','Manager','p6perf-manager@p6.example.test','user')");
    userId = Number(((await connection.query<any[]>("SELECT id FROM users WHERE openId = 'p6perf-manager'"))[0] as Array<{ id: number }>)[0].id);
    await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'P6 Perf Tenant', 'p6-perf-tenant')", [T]);
    await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'P6-PERF', 'P6 perf project', 'villas', 'SAR', 'active')", [P, T]);
    await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES ('p6perf-sub', ?, 'ALL-IN-ONE', 'active', NOW())", [T]);
    await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES ('p6perf-ent', ?, 'p6perf-sub', 'PROJECT', true, NOW())", [T]);
    for (const code of ["project.read", "project.wbs.manage", "project.schedule.manage"]) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (UUID(), ?, ?, 'PROJECT')", [code, code]);
    await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES ('p6perf-r', ?, 'P6PERF_MANAGER','Manager','PROJECT')", [T]);
    await connection.query("INSERT INTO role_permissions (roleId, permissionId) SELECT 'p6perf-r', id FROM permissions WHERE code IN ('project.read','project.wbs.manage','project.schedule.manage')");
    await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES ('p6perf-m', ?, ?, 'active')", [T, userId]);
    await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES ('p6perf-mr','p6perf-m','p6perf-r','company')");
  }, 120_000);
  afterAll(async () => { await clear(); await connection.end(); });

  it("creates 10,000 activities, then times the analysis and the confirmation of a file that changes every one of them", async () => {
    const scope = { userId, tenantId: T, projectId: P };
    const first = buildP6Xer({ activities: COUNT, withActuals: false });
    await confirmP6Import({ ...scope, bytes: first.bytes, source: { key: "perf/first.xer", name: "first.xer" } });
    expect(await n("SELECT COUNT(*) AS n FROM activities WHERE tenantId = ?", [T])).toBe(COUNT);

    const second = buildP6Xer({ activities: COUNT, withActuals: false, nameSuffix: " (v2)" });
    let started = performance.now();
    const plan = await analyzeP6Import({ ...scope, bytes: second.bytes });
    const analyzeMs = Math.round(performance.now() - started);
    expect(plan.counts.activities).toMatchObject({ create: 0, update: COUNT });
    started = performance.now();
    await confirmP6Import({ ...scope, bytes: second.bytes, source: { key: "perf/second.xer", name: "second.xer" } });
    const confirmMs = Math.round(performance.now() - started);
    expect(await n("SELECT COUNT(*) AS n FROM activities WHERE tenantId = ? AND name LIKE '% (v2)'", [T])).toBe(COUNT);
    console.log(`P6 PERF: ${COUNT} changed activities — analyze ${analyzeMs} ms, confirm ${confirmMs} ms`);
  }, 900_000);
});
