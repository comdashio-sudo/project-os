import type mysql from "./pgCompat";
import { operationalPermissionCatalog } from "../domain/operationalRoles";
import { governedActionPermissions } from "../domain/operationalPermissions";

/** Every operational permission that some governed action asks for. */
export const governedPermissionCodes = Array.from(new Set(Object.values(governedActionPermissions).flat())) as string[];

/**
 * Test fixtures only: makes sure the permission rows exist and gives a role the listed ones, by plain SQL.
 * Fixtures go around the role-editing API on purpose, so a fixture "owner-like" role can hold powers the API
 * would refuse to put together (the separation-of-duties rule is tested separately, with the real roles).
 */
export async function grantOperationalPermissions(connection: mysql.Connection, roleId: string, codes: readonly string[] = governedPermissionCodes) {
  for (const code of codes) {
    const entry = operationalPermissionCatalog.find(permission => permission.code === code);
    if (!entry) throw new Error(`Unknown operational permission ${code}`);
    await connection.query("INSERT INTO permissions (id, code, name, productCode) VALUES (UUID(), ?, ?, ?) ON DUPLICATE KEY UPDATE name = VALUES(name)", [entry.code, entry.name, entry.productCode]);
    await connection.query("INSERT IGNORE INTO role_permissions (roleId, permissionId) SELECT ?, id FROM permissions WHERE code = ?", [roleId, code]);
  }
}
