import { describe, expect, it } from "vitest";
import { evaluateAuditGrantVerification, type DbSecurityEvidence } from "./auditGrantVerification";

const good = (): DbSecurityEvidence => ({
  auditPrivileges: { select: true, insert: true, update: false, delete: false, truncate: false, references: false, trigger: false },
  probes: [{ operation: "update", denied: true, errorCode: "42501" }, { operation: "delete", denied: true, errorCode: "42501" }, { operation: "truncate", denied: true, errorCode: "42501" }],
  tables: { total: 118, withoutRowLevelSecurity: [], unreadable: [] },
  noContextTenantRows: 0,
  strangerTenantRows: 0,
  dataApiRoleTablePrivileges: 0,
  role: { superuser: false, bypassRls: false, canCreateInPublic: false, canReadPgAuthid: false },
  objects: { sequencesUnusable: [], functionsOpenToPublic: [], newFunctionsClosedByDefault: true },
});

describe("evaluateAuditGrantVerification", () => {
  it("approves only a role with audit read/insert, denied update/delete/truncate probes, row-level security everywhere and nothing for the Data API roles", () => {
    expect(evaluateAuditGrantVerification(good())).toMatchObject({ approved: true, checks: { updateDenied: true, deleteDenied: true, truncateDenied: true, hasAuditReadAndWritePath: true, hasForbiddenAuditGrant: false } });
  });

  it("rejects a role that holds UPDATE on the audit table even when a probe was not run", () => {
    const evidence = good();
    evidence.auditPrivileges.update = true;
    evidence.probes = evidence.probes.filter(entry => entry.operation !== "update");
    expect(evaluateAuditGrantVerification(evidence)).toMatchObject({ approved: false, checks: { hasForbiddenAuditGrant: true, updateDenied: false } });
  });

  it("rejects each of delete and truncate being allowed", () => {
    for (const operation of ["delete", "truncate"] as const) {
      const evidence = good();
      evidence.probes = evidence.probes.map(entry => (entry.operation === operation ? { operation, denied: false } : entry));
      expect(evaluateAuditGrantVerification(evidence).approved, operation).toBe(false);
    }
  });

  it("rejects a table without row-level security and a table the role cannot read, naming neither as fine", () => {
    const noRls = good(); noRls.tables.withoutRowLevelSecurity = ["zz_new"];
    expect(evaluateAuditGrantVerification(noRls)).toMatchObject({ approved: false, checks: { everyTableHasRowLevelSecurity: false } });
    const unreadable = good(); unreadable.tables.unreadable = ["zz_new"];
    expect(evaluateAuditGrantVerification(unreadable)).toMatchObject({ approved: false, checks: { everyTableReadable: false } });
  });

  it("rejects when tenant rows are visible without context or to a stranger tenant, and treats missing evidence as a failure", () => {
    const leaky = good(); leaky.noContextTenantRows = 3;
    expect(evaluateAuditGrantVerification(leaky).checks.noContextSeesNoTenantRows).toBe(false);
    const stranger = good(); stranger.strangerTenantRows = 1;
    expect(evaluateAuditGrantVerification(stranger).checks.strangerTenantSeesNoRows).toBe(false);
    const unknown = good(); unknown.noContextTenantRows = null;
    expect(evaluateAuditGrantVerification(unknown).approved).toBe(false);
    const empty = good(); empty.tables.total = 0;
    expect(evaluateAuditGrantVerification(empty).approved).toBe(false);
  });

  it("rejects Data API role privileges and a role that can bypass RLS, create objects or read pg_authid", () => {
    const dataApi = good(); dataApi.dataApiRoleTablePrivileges = 4;
    expect(evaluateAuditGrantVerification(dataApi).checks.dataApiRolesHoldNothing).toBe(false);
    for (const key of ["superuser", "bypassRls", "canCreateInPublic", "canReadPgAuthid"] as const) {
      const evidence = good(); evidence.role[key] = true;
      expect(evaluateAuditGrantVerification(evidence), key).toMatchObject({ approved: false, checks: { roleIsRestricted: false } });
    }
  });

  it("rejects a sequence the role cannot use, a function open to PUBLIC, and a default that would open the next function", () => {
    const sequence = good(); sequence.objects.sequencesUnusable = ["users_id_seq"];
    expect(evaluateAuditGrantVerification(sequence)).toMatchObject({ approved: false, checks: { everySequenceUsable: false } });
    const open = good(); open.objects.functionsOpenToPublic = ["project_os_users_protect_admin"];
    expect(evaluateAuditGrantVerification(open)).toMatchObject({ approved: false, checks: { noFunctionOpenToPublic: false } });
    const next = good(); next.objects.newFunctionsClosedByDefault = false;
    expect(evaluateAuditGrantVerification(next)).toMatchObject({ approved: false, checks: { newFunctionsClosedByDefault: false } });
  });
});
