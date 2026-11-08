// D-4 (#153), review item 4: the fixtures the two P6 database tests share for isolation — ANOTHER company (its own subscription, a user who holds every schedule
// permission THERE), and a second project in the SAME company. All names and ids are invented (*.example.test).
import type fixtureDb from "./pgCompat";

type Connection = fixtureDb.Connection;
const PERMISSIONS = ["project.read", "project.wbs.manage", "project.schedule.manage", "project.manage"];

/** The other company: `prefix` keeps its rows apart from the test's own (users `${prefix}-outsider`). Returns the outsider's user id. */
export async function seedOutsiderTenant(connection: Connection, input: { tenantId: string; projectId: string; prefix: string }): Promise<number> {
  const { tenantId, projectId, prefix } = input;
  await connection.query("INSERT INTO users (openId, name, email, role) VALUES (?, 'Outsider', ?, 'user')", [`${prefix}-outsider`, `${prefix}-outsider@other.example.test`]);
  const [rows] = await connection.query<{ id: number }[]>("SELECT id FROM users WHERE openId = ?", [`${prefix}-outsider`]);
  const userId = rows[0].id;
  await connection.query("INSERT INTO companies (id, legalName, slug) VALUES (?, 'Other Tenant', ?)", [tenantId, `${prefix}-other-tenant`]);
  await connection.query("INSERT INTO projects (id, tenantId, code, name, projectType, currency, status) VALUES (?, ?, 'OTHER', 'Other project', 'villas', 'SAR', 'active')", [projectId, tenantId]);
  await connection.query("INSERT INTO subscriptions (id, tenantId, packageCode, status, startsAt) VALUES (?, ?, 'ALL-IN-ONE', 'active', NOW())", [`${prefix}-o-sub`, tenantId]);
  await connection.query("INSERT INTO tenant_entitlements (id, tenantId, subscriptionId, productCode, active, startsAt) VALUES (?, ?, ?, 'PROJECT', true, NOW())", [`${prefix}-o-ent`, tenantId, `${prefix}-o-sub`]);
  for (const code of PERMISSIONS) await connection.query("INSERT IGNORE INTO permissions (id, code, name, productCode) VALUES (UUID(), ?, ?, 'PROJECT')", [code, code]);
  await connection.query("INSERT INTO roles (id, tenantId, code, name, productCode) VALUES (?, ?, 'OUTSIDER_MANAGER', 'Manager', 'PROJECT')", [`${prefix}-o-role`, tenantId]);
  await connection.query(`INSERT INTO role_permissions (roleId, permissionId) SELECT ?, id FROM permissions WHERE code IN (${PERMISSIONS.map(() => "?").join(",")})`, [`${prefix}-o-role`, ...PERMISSIONS]);
  await connection.query("INSERT INTO memberships (id, tenantId, userId, status) VALUES (?, ?, ?, 'active')", [`${prefix}-o-m`, tenantId, userId]);
  await connection.query("INSERT INTO membership_roles (id, membershipId, roleId, scopeType) VALUES (?, ?, ?, 'company')", [`${prefix}-o-mr`, `${prefix}-o-m`, `${prefix}-o-role`]);
  return userId;
}

/** Everything a P6 import can write for one company, then the company itself (the fixture's own rows only). */
export async function clearP6Tenant(connection: Connection, tenantId: string) {
  await connection.query("DELETE FROM audit_logs WHERE tenantId = ?", [tenantId]);
  await connection.query("DELETE FROM data_import_sources WHERE tenantId = ?", [tenantId]);
  await connection.query("DELETE FROM import_source_profiles WHERE tenantId = ?", [tenantId]);
  await connection.query("DELETE r FROM data_import_row_results r INNER JOIN data_imports i ON i.id = r.importId WHERE i.tenantId = ?", [tenantId]);
  await connection.query("DELETE FROM data_imports WHERE tenantId = ?", [tenantId]);
  for (const table of ["activity_resource_assignments", "activity_code_assignments", "activity_code_values", "activity_code_types", "activity_relationships", "progress_entries", "activities", "schedule_calendars", "project_resources", "wbs_items"]) await connection.query(`DELETE FROM ${table} WHERE tenantId = ?`, [tenantId]);
  await connection.query("DELETE FROM tenant_license_feature_overrides WHERE tenantLicenseId IN (SELECT id FROM tenant_licenses WHERE tenantId = ?)", [tenantId]);
  await connection.query("DELETE FROM tenant_licenses WHERE tenantId = ?", [tenantId]);
  await connection.query("DELETE mr FROM membership_roles mr INNER JOIN roles r ON r.id = mr.roleId WHERE r.tenantId = ?", [tenantId]);
  await connection.query("DELETE rp FROM role_permissions rp INNER JOIN roles r ON r.id = rp.roleId WHERE r.tenantId = ?", [tenantId]);
  await connection.query("DELETE FROM roles WHERE tenantId = ?", [tenantId]);
  await connection.query("DELETE FROM memberships WHERE tenantId = ?", [tenantId]);
  await connection.query("DELETE FROM tenant_entitlements WHERE tenantId = ?", [tenantId]);
  await connection.query("DELETE FROM subscriptions WHERE tenantId = ?", [tenantId]);
  await connection.query("DELETE FROM projects WHERE tenantId = ?", [tenantId]);
  await connection.query("DELETE FROM companies WHERE id = ?", [tenantId]);
}

/** What a project's activities look like now: compared before and after a write that must not reach them. */
export async function activitySnapshot(connection: Connection, input: { tenantId: string; projectId: string }) {
  const [rows] = await connection.query<Array<{ id: string; code: string; name: string; actualStartAt: Date | null; updatedAt: Date }>>("SELECT id, code, name, actualStartAt, updatedAt FROM activities WHERE tenantId = ? AND projectId = ? ORDER BY code", [input.tenantId, input.projectId]);
  return rows.map(row => `${row.id}|${row.code}|${row.name}|${row.actualStartAt?.toISOString() ?? ""}|${new Date(row.updatedAt).toISOString()}`);
}
