import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { operationalPermissionCatalog, operationalRoleDefinitions } from "./operationalRoles";

// AFTER_MIGRATION W-F / R-1 and the matrix of 22 Oct 2026. The database behaviour is in server/operationalTemplates.database.test.ts;
// these checks read the code, so they run without a database.
const db = readFileSync(new URL("../db.ts", import.meta.url), "utf8");
const role = (code: string) => operationalRoleDefinitions.find(definition => definition.code === code);
const catalogOf = (code: string) => operationalPermissionCatalog.find(permission => permission.code === code);

/** The source of one top-level function of db.ts, from its declaration to the closing brace at column 0. */
function functionSource(name: string) {
  const start = db.search(new RegExp(`(?:export )?(?:async )?function ${name}\\(`));
  if (start < 0) throw new Error(`${name} is not in db.ts`);
  const end = db.indexOf("\n}\n", start);
  return db.slice(start, end + 3);
}

describe("permission catalog and role matrix of the 22 Oct decisions", () => {
  it("the catalog contains the new codes, each named and in the PROJECT product", () => {
    for (const code of ["project.create", "payment.prepare", "payment.approve", "schedule.write"]) {
      expect(catalogOf(code), code).toBeDefined();
      expect(catalogOf(code)?.productCode).toBe("PROJECT");
      expect(catalogOf(code)?.name.length, `${code} has a name`).toBeGreaterThan(0);
    }
  });

  it("the accountant prepares payments and the finance manager approves them, and neither holds the other's code", () => {
    expect(role("ACCOUNTANT")?.permissions).toContain("payment.prepare");
    expect(role("ACCOUNTANT")?.permissions).not.toContain("payment.approve");
    expect(role("FINANCE_MANAGER")?.permissions).toContain("payment.approve");
    expect(role("FINANCE_MANAGER")?.permissions).not.toContain("payment.prepare");
  });

  it("the planning engineer holds schedule.write and never project.write", () => {
    expect(role("PLANNING_ENGINEER")?.permissions).toContain("schedule.write");
    expect(role("PLANNING_ENGINEER")?.permissions).not.toContain("project.write");
  });

  it("no ready-made role holds the generic project.write", () => {
    for (const definition of operationalRoleDefinitions) expect(definition.permissions, definition.code).not.toContain("project.write");
  });
});

describe("ready-made roles are written only when a company is created", () => {
  it("the administration read (ensureTenantOperationalRoles) writes the catalog and the owner grant, and no template", () => {
    const body = functionSource("ensureTenantOperationalRoles");
    expect(body).toContain("allCatalogPermissions");
    expect(body).toContain('eq(roles.code, "TENANT_OWNER")');
    expect(body).not.toContain("operationalRoleDefinitions");
    expect(body).not.toContain("installOperationalRoleTemplates");
    expect(body).not.toMatch(/insert\(roles\)/);
  });

  it("the read path that calls it does not install templates either", () => {
    const body = functionSource("getTenantAdministration");
    expect(body).toContain("ensureTenantOperationalRoles(db, input.tenantId)");
    expect(body).not.toContain("installOperationalRoleTemplates");
  });

  it("both company-creation transactions install the templates, after the catalog and the owner's role", () => {
    for (const name of ["createTenantForUserUnscoped", "createSelfServiceTenantUnscoped"]) {
      const body = functionSource(name);
      const install = body.indexOf("await installOperationalRoleTemplates(tx, tenantId);");
      expect(install, `${name} installs the templates`).toBeGreaterThan(-1);
      expect(body.indexOf("allCatalogPermissions"), `${name} inserts the catalog before installing`).toBeLessThan(install);
      expect(body.indexOf('code: "TENANT_OWNER"'), `${name} creates the owner role before installing`).toBeLessThan(install);
    }
  });

  it("the installer is the only writer of template roles, and it is called from nowhere else", () => {
    const calls = [...db.matchAll(/installOperationalRoleTemplates\(/g)].length;
    // one definition and two calls: createTenantForUserUnscoped and createSelfServiceTenantUnscoped
    expect(calls).toBe(3);
    expect(functionSource("installOperationalRoleTemplates")).toContain("operationalRoleDefinitions");
  });
});
