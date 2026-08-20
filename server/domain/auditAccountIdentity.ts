export function getScopedAuditAppUsername(rootDatabaseUrl: string) {
  const rootUsername = decodeURIComponent(new URL(rootDatabaseUrl).username);
  const prefix = rootUsername.split(".")[0];
  if (!prefix) throw new Error("Database account does not contain a TiDB Cloud user prefix.");
  return `${prefix}.project_os_app`;
}

export function getScopedAuditAdminUsername(rootDatabaseUrl: string) {
  const rootUsername = decodeURIComponent(new URL(rootDatabaseUrl).username);
  const prefix = rootUsername.split(".")[0];
  if (!prefix) throw new Error("Database account does not contain a TiDB Cloud user prefix.");
  return `${prefix}.audit_admin`;
}

export function buildRestrictedAppDatabaseUrl(rootDatabaseUrl: string, appPassword?: string, useAdministrativeConnection = false) {
  if (!appPassword || useAdministrativeConnection) return rootDatabaseUrl;
  const url = new URL(rootDatabaseUrl);
  url.username = getScopedAuditAppUsername(rootDatabaseUrl);
  url.password = appPassword;
  return url.toString();
}
