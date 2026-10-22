// Judges the evidence scripts/verify-db-security.mjs collects as the restricted application role. Pure: no connection, so every
// branch is testable without a database. A check passes only on positive evidence; missing evidence is a failure, never a pass.
export type AuditPrivilegeProbe = { operation: "update" | "delete" | "truncate"; denied: boolean; errorCode?: string };

export type AuditPrivileges = { select: boolean; insert: boolean; update: boolean; delete: boolean; truncate: boolean; references: boolean; trigger: boolean };

export type DbSecurityEvidence = {
  /** has_table_privilege(app role, 'audit_logs', …) for each privilege. */
  auditPrivileges: AuditPrivileges;
  /** Real statements run in a rolled-back transaction; a destructive one is only attempted when the privilege read says it is already denied. */
  probes: AuditPrivilegeProbe[];
  /** pg_class over schema public. */
  tables: { total: number; withoutRowLevelSecurity: string[]; unreadable: string[] };
  /** Rows the role sees in tenant tables with no per-request context set (must be 0), and rows it sees as a stranger tenant (must be 0). */
  noContextTenantRows: number | null;
  strangerTenantRows: number | null;
  /** Table privileges held by the Data API roles that exist (anon, authenticated, service_role). */
  dataApiRoleTablePrivileges: number;
  role: { superuser: boolean; bypassRls: boolean; canCreateInPublic: boolean; canReadPgAuthid: boolean };
};

export function evaluateAuditGrantVerification(evidence: DbSecurityEvidence) {
  const probe = (operation: AuditPrivilegeProbe["operation"]) => evidence.probes.find(entry => entry.operation === operation);
  const p = evidence.auditPrivileges;
  const checks = {
    hasAuditReadAndWritePath: p.select && p.insert,
    hasForbiddenAuditGrant: p.update || p.delete || p.truncate || p.references || p.trigger,
    updateDenied: Boolean(probe("update")?.denied),
    deleteDenied: Boolean(probe("delete")?.denied),
    truncateDenied: Boolean(probe("truncate")?.denied),
    everyTableHasRowLevelSecurity: evidence.tables.total > 0 && evidence.tables.withoutRowLevelSecurity.length === 0,
    everyTableReadable: evidence.tables.total > 0 && evidence.tables.unreadable.length === 0,
    noContextSeesNoTenantRows: evidence.noContextTenantRows === 0,
    strangerTenantSeesNoRows: evidence.strangerTenantRows === 0,
    dataApiRolesHoldNothing: evidence.dataApiRoleTablePrivileges === 0,
    roleIsRestricted: !evidence.role.superuser && !evidence.role.bypassRls && !evidence.role.canCreateInPublic && !evidence.role.canReadPgAuthid,
  };
  const approved = checks.hasAuditReadAndWritePath && !checks.hasForbiddenAuditGrant && checks.updateDenied && checks.deleteDenied && checks.truncateDenied
    && checks.everyTableHasRowLevelSecurity && checks.everyTableReadable && checks.noContextSeesNoTenantRows && checks.strangerTenantSeesNoRows
    && checks.dataApiRolesHoldNothing && checks.roleIsRestricted;
  return { approved, checks };
}
