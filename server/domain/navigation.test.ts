import { describe, expect, it } from "vitest";
import { buildTenantNavigation } from "./navigation";

describe("buildTenantNavigation", () => {
  it("returns only items backed by licensed products, permissions, and company scope", () => {
    const items = buildTenantNavigation({ tenantId: "tenant-a", projectId: "project-a", snapshot: { tenantId: "tenant-a", membershipStatus: "active", entitledProducts: ["EXECUTIVE", "PMO", "PROJECT"], permissionCodes: ["executive.read", "pmo.read", "project.read", "tenant.manage"], scopes: [{ scopeType: "company", scopeId: null }] } });
    expect(items.map(item => item.id)).toEqual(["levels", "executive-dashboard", "pmo-dashboard", "project-registry", "tenant-administration", "project-controls"]);
  });

  it("does not reveal tenant-wide or unrelated project links to a project-scoped project user", () => {
    const items = buildTenantNavigation({ tenantId: "tenant-a", projectId: "project-a", snapshot: { tenantId: "tenant-a", membershipStatus: "active", entitledProducts: ["PROJECT"], permissionCodes: ["project.read"], scopes: [{ scopeType: "project", scopeId: "project-a" }] } });
    expect(items.map(item => item.id)).toEqual(["levels", "project-controls"]);
    // the levels entry is company-wide and reveals no project; the project's own links are not offered for project-b
    expect(buildTenantNavigation({ tenantId: "tenant-a", projectId: "project-b", snapshot: { tenantId: "tenant-a", membershipStatus: "active", entitledProducts: ["PROJECT"], permissionCodes: ["project.read"], scopes: [{ scopeType: "project", scopeId: "project-a" }] } }).map(item => item.id)).toEqual(["levels"]);
  });

  it.each(["project.payroll.structure", "project.payroll.run", "project.payroll.approve", "project.payroll.sensitive.read"])("reveals one governed payroll route for %s", permission => {
    const items = buildTenantNavigation({ tenantId: "tenant-a", snapshot: { tenantId: "tenant-a", membershipStatus: "active", entitledProducts: ["PROJECT"], permissionCodes: [permission], scopes: [{ scopeType: "company", scopeId: null }] } });
    expect(items.filter(item => item.id === "payroll")).toEqual([expect.objectContaining({ href: "/payroll/tenant-a", labelKey: "navigation.payroll" })]);
  });
});

// The sidebar is one list computed here; these cases pin the exact ids a person sees by role, so a change to the list shows up as a diff.
describe("buildTenantNavigation by role", () => {
  const ids = (input: Parameters<typeof buildTenantNavigation>[0]) => buildTenantNavigation(input).map(item => item.id);
  const company = [{ scopeType: "company" as const, scopeId: null }];
  const allProducts = ["EXECUTIVE", "PMO", "PROJECT"] as const;
  // The company owner holds the whole catalog at company scope (server/db.ts ensureTenantOperationalRoles). Only the codes the navigation checks are listed.
  const ownerPermissions = ["executive.read", "pmo.read", "pmo.write", "project.read", "project.hr.manage", "project.payroll.structure", "project.payroll.run", "project.payroll.approve", "project.payroll.sensitive.read", "project.performance.read_own", "tenant.manage"];
  const companyModules = ["levels", "executive-dashboard", "pmo-dashboard", "project-registry", "employee-registry", "payroll", "tenant-administration"];

  it("shows nothing to a member who holds no permission, even with every product licensed", () => {
    expect(ids({ tenantId: "tenant-a", projectId: "project-a", snapshot: { tenantId: "tenant-a", membershipStatus: "active", entitledProducts: allProducts, permissionCodes: [], scopes: company } })).toEqual([]);
  });

  it("shows a single-product person only that product's module", () => {
    expect(ids({ tenantId: "tenant-a", snapshot: { tenantId: "tenant-a", membershipStatus: "active", entitledProducts: ["PMO"], permissionCodes: ["pmo.read", "pmo.write"], scopes: company } })).toEqual(["levels", "pmo-dashboard"]);
  });

  it("hides a permission whose product the tenant does not license", () => {
    expect(ids({ tenantId: "tenant-a", projectId: "project-a", snapshot: { tenantId: "tenant-a", membershipStatus: "active", entitledProducts: ["PMO"], permissionCodes: ["executive.read", "project.read", "project.hr.manage", "tenant.manage"], scopes: company } })).toEqual([]);
  });

  it("shows the company owner every company module, and the project modules once a project is open", () => {
    const owner = { tenantId: "tenant-a", membershipStatus: "active" as const, entitledProducts: allProducts, permissionCodes: ownerPermissions, scopes: company };
    expect(ids({ tenantId: "tenant-a", snapshot: owner })).toEqual(companyModules);
    // my-performance is listed here although the server refuses the page to a person with no employee record linked to the account.
    // That rule belongs to fix/ui-performance-self-only; this assertion changes with it.
    expect(ids({ tenantId: "tenant-a", projectId: "project-a", snapshot: owner })).toEqual([...companyModules, "project-controls", "my-performance"]);
  });

  it("shows nothing to a suspended owner", () => {
    expect(ids({ tenantId: "tenant-a", projectId: "project-a", snapshot: { tenantId: "tenant-a", membershipStatus: "suspended", entitledProducts: allProducts, permissionCodes: ownerPermissions, scopes: company } })).toEqual([]);
  });
});

// Work order 16 (G-193 to G-195): the levels entry is in the sidebar for anyone who can enter a level, and the PMO page stays company-only.
describe("buildTenantNavigation: the levels entry", () => {
  const ids = (input: Parameters<typeof buildTenantNavigation>[0]) => buildTenantNavigation(input).map(item => item.id);
  const snapshot = (overrides: Partial<Parameters<typeof buildTenantNavigation>[0]["snapshot"]>) => ({ tenantId: "tenant-a", membershipStatus: "active" as const, entitledProducts: ["PROJECT"] as const, permissionCodes: [] as string[], scopes: [{ scopeType: "project" as const, scopeId: "project-a" }], ...overrides });

  it("offers the portfolio level to a PMO person whose scope is one project, and keeps the PMO page company-only", () => {
    const input = { tenantId: "tenant-a", snapshot: snapshot({ entitledProducts: ["PMO"], permissionCodes: ["pmo.read"] }) };
    expect(ids(input)).toEqual(["levels"]);
  });

  it("offers the warehouse keeper the levels entry without project.read", () => {
    expect(ids({ tenantId: "tenant-a", snapshot: snapshot({ permissionCodes: ["project.inventory.manage"] }) })).toEqual(["levels"]);
  });

  it("offers a project person the levels entry, and the project's own links once a project is open", () => {
    expect(ids({ tenantId: "tenant-a", projectId: "project-a", snapshot: snapshot({ permissionCodes: ["project.read"] }) })).toEqual(["levels", "project-controls"]);
  });

  it("does not offer the levels entry to someone holding no level permission", () => {
    expect(ids({ tenantId: "tenant-a", snapshot: snapshot({ permissionCodes: ["project.hr.manage"], scopes: [{ scopeType: "company", scopeId: null }] }) })).not.toContain("levels");
  });

  it("does not offer the company level when the executive product is not licensed, nor to a suspended member", () => {
    expect(ids({ tenantId: "tenant-a", snapshot: snapshot({ entitledProducts: ["PMO"], permissionCodes: ["executive.read"], scopes: [{ scopeType: "company", scopeId: null }] }) })).toEqual([]);
    expect(ids({ tenantId: "tenant-a", snapshot: snapshot({ membershipStatus: "suspended", permissionCodes: ["project.read"] }) })).toEqual([]);
  });

  it("offers the company level only with a company-wide executive assignment", () => {
    expect(ids({ tenantId: "tenant-a", snapshot: snapshot({ entitledProducts: ["EXECUTIVE"], permissionCodes: ["executive.read"], scopes: [{ scopeType: "company", scopeId: null }] }) })).toEqual(["levels", "executive-dashboard"]);
    expect(ids({ tenantId: "tenant-a", snapshot: snapshot({ entitledProducts: ["EXECUTIVE"], permissionCodes: ["executive.read"], scopes: [{ scopeType: "project", scopeId: "project-a" }] }) })).toEqual([]);
  });
});

