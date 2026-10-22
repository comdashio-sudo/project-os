import { describe, expect, it } from "vitest";
import { APP_ROLE, buildRestrictedAppDatabaseUrl, getScopedAuditAppUsername } from "./auditAccountIdentity";

describe("getScopedAuditAppUsername", () => {
  it("is the plain application role on a direct connection", () => {
    expect(getScopedAuditAppUsername("postgres://postgres:secret@db.example.test:5432/postgres")).toBe(APP_ROLE);
  });

  it("keeps the pooler's project reference after the dot and replaces the role", () => {
    expect(getScopedAuditAppUsername("postgres://postgres.abcdefghijklmnop:secret@pooler.example.test:6543/postgres")).toBe("project_os_app.abcdefghijklmnop");
  });

  it("builds a restricted application URL without changing the database target", () => {
    const url = new URL(buildRestrictedAppDatabaseUrl("postgres://postgres.abcdefghijklmnop:root-secret@pooler.example.test:6543/postgres?sslmode=require", "app-secret"));
    expect(url.username).toBe("project_os_app.abcdefghijklmnop");
    expect(url.password).toBe("app-secret");
    expect(`${url.host}${url.pathname}`).toBe("pooler.example.test:6543/postgres");
  });

  it("retains the administrative URL only when the explicit isolated-test flag is present", () => {
    const rootUrl = "postgres://postgres:root-secret@db.example.test:5432/project_os_integration_test";
    expect(buildRestrictedAppDatabaseUrl(rootUrl, "app-secret", true)).toBe(rootUrl);
    expect(buildRestrictedAppDatabaseUrl(rootUrl, undefined)).toBe(rootUrl);
  });
});
