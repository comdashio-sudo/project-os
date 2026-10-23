import { describe, expect, it } from "vitest";
import { buildTenantNavigation } from "./navigation";

describe("buildTenantNavigation", () => {
  it("returns only items backed by licensed products, permissions, and company scope", () => {
    const items = buildTenantNavigation({ tenantId: "tenant-a", projectId: "project-a", snapshot: { tenantId: "tenant-a", membershipStatus: "active", entitledProducts: ["EXECUTIVE", "PMO", "PROJECT"], permissionCodes: ["executive.read", "pmo.read", "project.read", "tenant.manage"], scopes: [{ scopeType: "company", scopeId: null }] } });
    expect(items.map(item => item.id)).toEqual(["executive-dashboard", "pmo-dashboard", "project-registry", "tenant-administration", "project-controls"]);
  });

  it("does not reveal tenant-wide or unrelated project links to a project-scoped project user", () => {
    const items = buildTenantNavigation({ tenantId: "tenant-a", projectId: "project-a", snapshot: { tenantId: "tenant-a", membershipStatus: "active", entitledProducts: ["PROJECT"], permissionCodes: ["project.read"], scopes: [{ scopeType: "project", scopeId: "project-a" }] } });
    expect(items.map(item => item.id)).toEqual(["project-controls"]);
    expect(buildTenantNavigation({ tenantId: "tenant-a", projectId: "project-b", snapshot: { tenantId: "tenant-a", membershipStatus: "active", entitledProducts: ["PROJECT"], permissionCodes: ["project.read"], scopes: [{ scopeType: "project", scopeId: "project-a" }] } })).toEqual([]);
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
  const companyModules = ["executive-dashboard", "pmo-dashboard", "project-registry", "employee-registry", "payroll", "tenant-administration"];

  it("shows nothing to a member who holds no permission, even with every product licensed", () => {
    expect(ids({ tenantId: "tenant-a", projectId: "project-a", snapshot: { tenantId: "tenant-a", membershipStatus: "active", entitledProducts: allProducts, permissionCodes: [], scopes: company } })).toEqual([]);
  });

  it("shows a single-product person only that product's module", () => {
    expect(ids({ tenantId: "tenant-a", snapshot: { tenantId: "tenant-a", membershipStatus: "active", entitledProducts: ["PMO"], permissionCodes: ["pmo.read", "pmo.write"], scopes: company } })).toEqual(["pmo-dashboard"]);
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
