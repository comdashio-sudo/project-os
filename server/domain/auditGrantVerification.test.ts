import { describe, expect, it } from "vitest";
import { evaluateAuditGrantVerification } from "./auditGrantVerification";

describe("evaluateAuditGrantVerification", () => {
  it("approves only a grant set with audit read/insert and failed update/delete probes", () => {
    expect(evaluateAuditGrantVerification({ grants: ["GRANT SELECT, INSERT ON `project_os`.`audit_logs` TO 'project_os_app'@'%'"] , probes: [{ operation: "update", denied: true, errorCode: "ER_TABLEACCESS_DENIED_ERROR" }, { operation: "delete", denied: true, errorCode: "ER_TABLEACCESS_DENIED_ERROR" }] })).toMatchObject({ approved: true, checks: { updateDenied: true, deleteDenied: true, hasAuditReadAndWritePath: true, hasForbiddenAuditGrant: false } });
  });

  it("rejects an account that can update the audit table even if a probe was not run", () => {
    expect(evaluateAuditGrantVerification({ grants: ["GRANT SELECT, INSERT, UPDATE ON `project_os`.`audit_logs` TO 'project_os_app'@'%'"] , probes: [{ operation: "update", denied: false }, { operation: "delete", denied: true }] })).toMatchObject({ approved: false, checks: { hasForbiddenAuditGrant: true } });
  });
});
