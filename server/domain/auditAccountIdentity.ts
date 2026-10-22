// The restricted application role. PostgreSQL role names are plain (no organisation prefix), but a connection pooler in front of the database
// (Supabase's) addresses a role as `role.<project-ref>`; the suffix after the first dot of the administrative user is kept so the same
// project reference reaches the application role through the pooler.
export const APP_ROLE = "project_os_app";

export function getScopedAuditAppUsername(rootDatabaseUrl: string) {
  const rootUsername = decodeURIComponent(new URL(rootDatabaseUrl).username);
  const suffix = rootUsername.includes(".") ? rootUsername.slice(rootUsername.indexOf(".")) : "";
  return `${APP_ROLE}${suffix}`;
}

export function buildRestrictedAppDatabaseUrl(rootDatabaseUrl: string, appPassword?: string, useAdministrativeConnection = false) {
  if (!appPassword || useAdministrativeConnection) return rootDatabaseUrl;
  const url = new URL(rootDatabaseUrl);
  url.username = getScopedAuditAppUsername(rootDatabaseUrl);
  url.password = appPassword;
  return url.toString();
}
