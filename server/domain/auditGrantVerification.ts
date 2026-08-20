export type AuditPrivilegeProbe = { operation: "update" | "delete"; denied: boolean; errorCode?: string };

export function evaluateAuditGrantVerification(input: { grants: string[]; probes: AuditPrivilegeProbe[] }) {
  const updateProbe = input.probes.find(probe => probe.operation === "update");
  const deleteProbe = input.probes.find(probe => probe.operation === "delete");
  const grantText = input.grants.join("\n").toUpperCase();
  const hasAuditReadAndWritePath = grantText.includes("AUDIT_LOGS") && grantText.includes("SELECT") && grantText.includes("INSERT");
  const hasForbiddenAuditGrant = /(?:ALL PRIVILEGES|UPDATE|DELETE) ON .*AUDIT_LOGS/.test(grantText);
  return {
    approved: Boolean(updateProbe?.denied && deleteProbe?.denied && hasAuditReadAndWritePath && !hasForbiddenAuditGrant),
    checks: { updateDenied: Boolean(updateProbe?.denied), deleteDenied: Boolean(deleteProbe?.denied), hasAuditReadAndWritePath, hasForbiddenAuditGrant },
  };
}
