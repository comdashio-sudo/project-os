import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { operationalPermissionCatalog, operationalRoleDefinitions } from "./operationalRoles";

// AFTER_MIGRATION W-F and R-1. The database behaviour is in server/operationalTemplates.database.test.ts; these checks read the code,
// so they run without a database.
const db = readFileSync(new URL("../db.ts", import.meta.url), "utf8");
const addedCodes = ["project.create", "payment.prepare", "payment.approve", "schedule.write"];

/** The source of one top-level function of db.ts, from its declaration to the closing brace at column 0. */
function functionSource(name: string) {
  const start = db.search(new RegExp(`(?:export )?(?:async )?function ${name}\\(`));
  if (start < 0) throw new Error(`${name} is not in db.ts`);
  const end = db.indexOf("\n}\n", start);
  return db.slice(start, end + 3);
}

describe("catalog of the new codes", () => {
  it("the catalog contains the four codes, each named and in the PROJECT product", () => {
    for (const code of addedCodes) {
      const entry = operationalPermissionCatalog.find(permission => permission.code === code);
      expect(entry, code).toBeDefined();
      expect(entry?.productCode).toBe("PROJECT");
      expect(entry?.name.length, `${code} has a name`).toBeGreaterThan(0);
    }
  });

  it("no ready-made template holds any of the four codes, except project.create on the planning engineer (Q-12 d: the one who sets projects up)", () => {
    for (const definition of operationalRoleDefinitions) {
      for (const code of addedCodes) {
        if (code === "project.create" && definition.code === "PLANNING_ENGINEER") expect(definition.permissions).toContain(code);
        else expect(definition.permissions, `${definition.code} must not hold ${code}`).not.toContain(code);
      }
    }
  });

  it("no ready-made role holds the generic project.write", () => {
    for (const definition of operationalRoleDefinitions) expect(definition.permissions, definition.code).not.toContain("project.write");
  });
});

describe("where the ready-made roles are written", () => {
  it("the administration read installs the templates as before, and upserts the catalog and the owner grant", () => {
    const body = functionSource("ensureTenantOperationalRoles");
    expect(body).toContain("allCatalogPermissions");
    expect(body).toContain('eq(roles.code, "TENANT_OWNER")');
    expect(body).toContain("await installOperationalRoleTemplates(tx, tenantId, { audit: true });"); // work order 17: the read path also audits what it adds
  });

  it("both company-creation transactions install the templates after the catalog and the owner's role", () => {
    for (const name of ["createTenantForUserUnscoped", "createSelfServiceTenantUnscoped"]) {
      const body = functionSource(name);
      const install = body.indexOf("await installOperationalRoleTemplates(tx, tenantId);");
      expect(install, `${name} installs the templates`).toBeGreaterThan(-1);
      expect(body.indexOf("allCatalogPermissions"), `${name} inserts the catalog before installing`).toBeLessThan(install);
      expect(body.indexOf('code: "TENANT_OWNER"'), `${name} creates the owner role before installing`).toBeLessThan(install);
    }
  });

  it("the installer is called only by the read path and the two creation transactions", () => {
    // one definition and three calls
    expect([...db.matchAll(/installOperationalRoleTemplates\(/g)].length).toBe(4);
    expect(functionSource("installOperationalRoleTemplates")).toContain("operationalRoleDefinitions");
  });
});
