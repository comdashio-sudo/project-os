import { describe, expect, it } from "vitest";
import { assertTestDatabaseUrl, databaseNameFromUrl, INTEGRATION_TEST_DATABASE, isTestDatabaseUrl } from "./testDatabase";

const host = "gateway.example.test:4000";

describe("test database guard", () => {
  it("accepts only the named test database", () => {
    expect(isTestDatabaseUrl(`mysql://user:pw@${host}/${INTEGRATION_TEST_DATABASE}?ssl=true`)).toBe(true);
    expect(isTestDatabaseUrl(`mysql2://user:pw@${host}/${INTEGRATION_TEST_DATABASE}`)).toBe(true);
  });

  it("refuses a production database, a missing name and non-mysql URLs", () => {
    expect(isTestDatabaseUrl(`mysql://user:pw@${host}/project_os`)).toBe(false);
    expect(isTestDatabaseUrl(`mysql://user:pw@${host}/`)).toBe(false);
    expect(isTestDatabaseUrl(`mysql://user:pw@${host}/${INTEGRATION_TEST_DATABASE}_copy`)).toBe(false);
    expect(isTestDatabaseUrl(`postgres://user:pw@${host}/${INTEGRATION_TEST_DATABASE}`)).toBe(false);
    expect(isTestDatabaseUrl(undefined)).toBe(false);
    expect(isTestDatabaseUrl("not a url")).toBe(false);
  });

  it("names the database in the refusal but never the credentials", () => {
    const productionUrl = `mysql://root-user:secret-value@${host}/project_os`; // secret-scan:allow fake value
    expect(() => assertTestDatabaseUrl(productionUrl, "DATABASE_URL")).toThrow(/"project_os"/);
    try {
      assertTestDatabaseUrl(productionUrl, "DATABASE_URL");
    } catch (error) {
      expect(String(error)).not.toContain("secret-value");
      expect(String(error)).not.toContain("root-user");
    }
    expect(() => assertTestDatabaseUrl(`mysql://u:p@${host}/${INTEGRATION_TEST_DATABASE}`, "DATABASE_URL")).not.toThrow();
  });

  it("reads the database name without the leading slash", () => {
    expect(databaseNameFromUrl(`mysql://u:p@${host}/${INTEGRATION_TEST_DATABASE}`)).toBe(INTEGRATION_TEST_DATABASE);
  });
});
