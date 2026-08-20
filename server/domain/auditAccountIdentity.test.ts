import { describe, expect, it } from "vitest";
import { buildRestrictedAppDatabaseUrl, getScopedAuditAdminUsername, getScopedAuditAppUsername } from "./auditAccountIdentity";

describe("getScopedAuditAppUsername", () => {
  it("retains the TiDB Cloud organization prefix and replaces the role suffix", () => {
    expect(getScopedAuditAppUsername("mysql://qNpSnWojfxmufZQ.root:secret@example.com:4000/project_os")).toBe("qNpSnWojfxmufZQ.project_os_app");
    expect(getScopedAuditAdminUsername("mysql://qNpSnWojfxmufZQ.root:secret@example.com:4000/project_os")).toBe("qNpSnWojfxmufZQ.audit_admin");
  });

  it("builds a restricted application URL without changing the database target", () => {
    const url = new URL(buildRestrictedAppDatabaseUrl("mysql://qNpSnWojfxmufZQ.root:root-secret@example.com:4000/project_os?ssl=true", "app-secret"));
    expect(url.username).toBe("qNpSnWojfxmufZQ.project_os_app");
    expect(url.password).toBe("app-secret");
    expect(`${url.host}${url.pathname}`).toBe("example.com:4000/project_os");
  });

  it("retains the administrative URL only when the explicit isolated-test flag is present", () => {
    const rootUrl = "mysql://qNpSnWojfxmufZQ.root:root-secret@example.com:4000/project_os?ssl=true";
    expect(buildRestrictedAppDatabaseUrl(rootUrl, "app-secret", true)).toBe(rootUrl);
  });
});
