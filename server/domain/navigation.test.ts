import { describe, expect, it } from "vitest";
import { buildTenantNavigation as build } from "./navigation";

// Each snapshot below stands for ONE assignment, so its grants are every listed permission on every listed scope (G-142, D-18: the real snapshot
// keeps the pairs it read; the merged case is tested in authorization.grants.test.ts).
type NavInput = Omit<Parameters<typeof build>[0], "snapshot"> & { snapshot: Omit<Parameters<typeof build>[0]["snapshot"], "grants"> };
const buildTenantNavigation = (input: NavInput) => build({ ...input, snapshot: { ...input.snapshot, grants: input.snapshot.permissionCodes.flatMap(code => input.snapshot.scopes.map(scope => ({ code, ...scope }))) } });

describe("buildTenantNavigation", () => {
  it("returns only items backed by licensed products, permissions, and company scope", () => {
    const items = buildTenantNavigation({ tenantId: "tenant-a", projectId: "project-a", snapshot: { tenantId: "tenant-a", membershipStatus: "active", entitledProducts: ["EXECUTIVE", "PMO", "PROJECT"], permissionCodes: ["executive.read", "pmo.read", "project.read", "tenant.manage"], scopes: [{ scopeType: "company", scopeId: null }] } });
    expect(items.map(item => item.id)).toEqual(["project-controls", "project-planning", "project-site", "project-supply", "project-commercial", "project-reports", "tenant-administration", "project-registry", "pmo-dashboard", "executive-dashboard", "levels"]);
  });

  it("does not reveal tenant-wide or unrelated project links to a project-scoped project user", () => {
    const items = buildTenantNavigation({ tenantId: "tenant-a", projectId: "project-a", snapshot: { tenantId: "tenant-a", membershipStatus: "active", entitledProducts: ["PROJECT"], permissionCodes: ["project.read"], scopes: [{ scopeType: "project", scopeId: "project-a" }] } });
    expect(items.map(item => item.id)).toEqual(["project-controls", "project-planning", "project-site", "project-supply", "project-commercial", "project-reports", "levels"]);
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
  const ids = (input: NavInput) => buildTenantNavigation(input).map(item => item.id);
  const company = [{ scopeType: "company" as const, scopeId: null }];
  const allProducts = ["EXECUTIVE", "PMO", "PROJECT"] as const;
  // The company owner holds the whole catalog at company scope (server/db.ts ensureTenantOperationalRoles). Only the codes the navigation checks are listed.
  const ownerPermissions = ["executive.read", "pmo.read", "pmo.write", "project.read", "project.hr.manage", "project.payroll.structure", "project.payroll.run", "project.payroll.approve", "project.payroll.sensitive.read", "project.performance.read_own", "tenant.manage"];
  // Q-36 (step 2): administration · projects and PMO · people and payroll · executive, with the levels under it
  const companyModules = ["tenant-administration", "project-registry", "pmo-dashboard", "employee-registry", "payroll", "executive-dashboard", "levels"];

  it("shows nothing to a member who holds no permission, even with every product licensed", () => {
    expect(ids({ tenantId: "tenant-a", projectId: "project-a", snapshot: { tenantId: "tenant-a", membershipStatus: "active", entitledProducts: allProducts, permissionCodes: [], scopes: company } })).toEqual([]);
  });

  it("shows a single-product person only that product's module", () => {
    expect(ids({ tenantId: "tenant-a", snapshot: { tenantId: "tenant-a", membershipStatus: "active", entitledProducts: ["PMO"], permissionCodes: ["pmo.read", "pmo.write"], scopes: company } })).toEqual(["pmo-dashboard", "levels"]);
  });

  it("hides a permission whose product the tenant does not license", () => {
    expect(ids({ tenantId: "tenant-a", projectId: "project-a", snapshot: { tenantId: "tenant-a", membershipStatus: "active", entitledProducts: ["PMO"], permissionCodes: ["executive.read", "project.read", "project.hr.manage", "tenant.manage"], scopes: company } })).toEqual([]);
  });

  it("shows the company owner every company module, and the project modules once a project is open", () => {
    const owner = { tenantId: "tenant-a", membershipStatus: "active" as const, entitledProducts: allProducts, permissionCodes: ownerPermissions, scopes: company };
    expect(ids({ tenantId: "tenant-a", snapshot: owner })).toEqual(companyModules);
    // my-performance is listed here although the server refuses the page to a person with no employee record linked to the account.
    // That rule belongs to fix/ui-performance-self-only; this assertion changes with it.
    expect(ids({ tenantId: "tenant-a", projectId: "project-a", snapshot: owner })).toEqual(["project-controls", "project-planning", "project-site", "project-supply", "project-commercial", "project-reports", "my-performance", ...companyModules]);
  });

  it("shows nothing to a suspended owner", () => {
    expect(ids({ tenantId: "tenant-a", projectId: "project-a", snapshot: { tenantId: "tenant-a", membershipStatus: "suspended", entitledProducts: allProducts, permissionCodes: ownerPermissions, scopes: company } })).toEqual([]);
  });
});

// Work order 16 (G-193 to G-195): the levels entry is in the sidebar for anyone who can enter a level, and the PMO page stays company-only.
describe("buildTenantNavigation: the levels entry", () => {
  const ids = (input: NavInput) => buildTenantNavigation(input).map(item => item.id);
  const snapshot = (overrides: Partial<NavInput["snapshot"]>) => ({ tenantId: "tenant-a", membershipStatus: "active" as const, entitledProducts: ["PROJECT"] as const, permissionCodes: [] as string[], scopes: [{ scopeType: "project" as const, scopeId: "project-a" }], ...overrides });

  it("offers the portfolio level to a PMO person whose scope is one project, and keeps the PMO page company-only", () => {
    const input = { tenantId: "tenant-a", snapshot: snapshot({ entitledProducts: ["PMO"], permissionCodes: ["pmo.read"] }) };
    expect(ids(input)).toEqual(["levels"]);
  });

  it("offers the warehouse keeper the levels entry without project.read", () => {
    expect(ids({ tenantId: "tenant-a", snapshot: snapshot({ permissionCodes: ["project.inventory.manage"] }) })).toEqual(["levels"]);
  });

  it("offers a project person the levels entry, and the project's own links once a project is open", () => {
    expect(ids({ tenantId: "tenant-a", projectId: "project-a", snapshot: snapshot({ permissionCodes: ["project.read"] }) })).toEqual(["project-controls", "project-planning", "project-site", "project-supply", "project-commercial", "project-reports", "levels"]);
  });

  it("does not offer the levels entry to someone holding no level permission", () => {
    expect(ids({ tenantId: "tenant-a", snapshot: snapshot({ permissionCodes: ["project.hr.manage"], scopes: [{ scopeType: "company", scopeId: null }] }) })).not.toContain("levels");
  });

  it("does not offer the company level when the executive product is not licensed, nor to a suspended member", () => {
    expect(ids({ tenantId: "tenant-a", snapshot: snapshot({ entitledProducts: ["PMO"], permissionCodes: ["executive.read"], scopes: [{ scopeType: "company", scopeId: null }] }) })).toEqual([]);
    expect(ids({ tenantId: "tenant-a", snapshot: snapshot({ membershipStatus: "suspended", permissionCodes: ["project.read"] }) })).toEqual([]);
  });

  it("offers the company level only with a company-wide executive assignment", () => {
    expect(ids({ tenantId: "tenant-a", snapshot: snapshot({ entitledProducts: ["EXECUTIVE"], permissionCodes: ["executive.read"], scopes: [{ scopeType: "company", scopeId: null }] }) })).toEqual(["executive-dashboard", "levels"]);
    expect(ids({ tenantId: "tenant-a", snapshot: snapshot({ entitledProducts: ["EXECUTIVE"], permissionCodes: ["executive.read"], scopes: [{ scopeType: "project", scopeId: "project-a" }] }) })).toEqual([]);
  });
});

describe("Q-36 (step 2): two groups, the project's first", () => {
  const all = ["EXECUTIVE", "PMO", "PROJECT"] as const;
  it("with a project open, every project item comes before every company item, and each item says its group", () => {
    const items = buildTenantNavigation({ tenantId: "t", projectId: "p", snapshot: { tenantId: "t", membershipStatus: "active", entitledProducts: [...all], permissionCodes: ["project.read", "project.manage", "tenant.manage", "executive.read"], scopes: [{ scopeType: "company", scopeId: null }] } });
    const groups = items.map(item => item.group);
    expect(groups.indexOf("company")).toBeGreaterThan(groups.lastIndexOf("project"));
    expect(items.filter(item => item.group === "project").map(item => item.id)).toEqual(["project-controls", "project-planning", "project-site", "project-supply", "project-commercial", "project-reports", "project-team"]);
    expect(items.find(item => item.id === "project-team")?.href).toBe("/projects/t/p/team");
  });
  it("NEGATIVE: the team link needs project.manage or project.team.invite on THIS project, as its page does; a reader of the project does not get it", () => {
    const reader = buildTenantNavigation({ tenantId: "t", projectId: "p", snapshot: { tenantId: "t", membershipStatus: "active", entitledProducts: ["PROJECT"], permissionCodes: ["project.read"], scopes: [{ scopeType: "project", scopeId: "p" }] } });
    expect(reader.map(item => item.id)).not.toContain("project-team");
    const inviterElsewhere = buildTenantNavigation({ tenantId: "t", projectId: "p", snapshot: { tenantId: "t", membershipStatus: "active", entitledProducts: ["PROJECT"], permissionCodes: ["project.team.invite"], scopes: [{ scopeType: "project", scopeId: "other" }] } });
    expect(inviterElsewhere.map(item => item.id)).not.toContain("project-team");
  });
  it("without a project, only the company group", () => {
    const items = buildTenantNavigation({ tenantId: "t", snapshot: { tenantId: "t", membershipStatus: "active", entitledProducts: [...all], permissionCodes: ["project.read", "tenant.manage"], scopes: [{ scopeType: "company", scopeId: null }] } });
    expect(new Set(items.map(item => item.group))).toEqual(new Set(["company"]));
  });
});

describe("Q-36 (step 2 b): «الموقع والتنفيذ»", () => {
  const nav = (codes: string[], scopeId: string | null = "p") => buildTenantNavigation({ tenantId: "t", projectId: "p", snapshot: { tenantId: "t", membershipStatus: "active", entitledProducts: ["PROJECT"], permissionCodes: codes, scopes: [scopeId ? { scopeType: "project", scopeId } : { scopeType: "company", scopeId: null }] } }).map(item => item.id);
  it("POSITIVE: whoever may open one of its four pages on this project gets the entry, right after «لوحة المشروع», at /projects/t/p/site", () => {
    for (const code of ["project.read", "project.pmc.read", "project.qc.receive", "project.hse.manage"]) expect(nav([code])).toContain("project-site");
    const items = buildTenantNavigation({ tenantId: "t", projectId: "p", snapshot: { tenantId: "t", membershipStatus: "active", entitledProducts: ["PROJECT"], permissionCodes: ["project.pmc.read"], scopes: [{ scopeType: "project", scopeId: "p" }] } });
    expect(items.find(item => item.id === "project-site")).toMatchObject({ group: "project", href: "/projects/t/p/site" });
  });
  it("NEGATIVE: a warehouse keeper (none of the four pages) does not get it, nor a site engineer of ANOTHER project, nor anyone without a licensed PROJECT product", () => {
    expect(nav(["project.inventory.manage"])).not.toContain("project-site");
    expect(nav(["project.read", "project.pmc.read"], "other")).not.toContain("project-site");
    const unlicensed = buildTenantNavigation({ tenantId: "t", projectId: "p", snapshot: { tenantId: "t", membershipStatus: "active", entitledProducts: ["PMO"], permissionCodes: ["project.read"], scopes: [{ scopeType: "project", scopeId: "p" }] } });
    expect(unlicensed.map(item => item.id)).not.toContain("project-site");
  });
});

describe("Q-36 (step 2 c): «التقارير»", () => {
  const nav = (codes: string[], scopeId = "p") => buildTenantNavigation({ tenantId: "t", projectId: "p", snapshot: { tenantId: "t", membershipStatus: "active", entitledProducts: ["PROJECT"], permissionCodes: codes, scopes: [{ scopeType: "project", scopeId }] } });
  it("POSITIVE: whoever may open one of the three reports gets the entry, right after «الموقع والتنفيذ», at /projects/t/p/reports", () => {
    for (const code of ["project.read", "project.pmc.read", "project.hse.manage"]) expect(nav([code]).map(item => item.id)).toContain("project-reports");
    expect(nav(["project.pmc.read"]).find(item => item.id === "project-reports")).toMatchObject({ group: "project", href: "/projects/t/p/reports" });
  });
  it("NEGATIVE: a warehouse keeper, or a reader of ANOTHER project, does not get it", () => {
    expect(nav(["project.inventory.manage"]).map(item => item.id)).not.toContain("project-reports");
    expect(nav(["project.read", "project.pmc.read"], "other").map(item => item.id)).not.toContain("project-reports");
  });
});

describe("Q-36 (step 4 b): the board's levels in the menu", () => {
  const nav = (codes: string[], scopeId = "p") => buildTenantNavigation({ tenantId: "t", projectId: "p", snapshot: { tenantId: "t", membershipStatus: "active", entitledProducts: ["PROJECT"], permissionCodes: codes, scopes: [{ scopeType: "project", scopeId }] } });
  it("POSITIVE (Q-56 2): whoever opens the project board gets «Planning and control» and «Warehouses and procurement», each a page of its own", () => {
    const items = nav(["project.read"]);
    expect(items.find(item => item.id === "project-planning")).toMatchObject({ group: "project", href: "/projects/t/p/planning" });
    expect(items.find(item => item.id === "project-supply")).toMatchObject({ group: "project", href: "/projects/t/p/supply" });
  });
  it("Q-56 (2): no item of the menu is a place inside another page (no «#»): each opens its own address", () => {
    const items = nav(["project.read", "project.pmc.read", "project.manage", "project.performance.read_own", "pmo.read", "executive.read", "tenant.manage"]);
    expect(items.length).toBeGreaterThan(5);
    expect(items.filter(item => item.href.includes("#")).map(item => item.href)).toEqual([]);
    const hrefs = items.map(item => item.href); expect(new Set(hrefs).size).toBe(hrefs.length);
  });
  it("NEGATIVE: not without the board's own permission (the board's gate, shared/pageAccess.ts), nor on another project", () => {
    expect(nav(["project.pmc.read"]).map(item => item.id)).not.toEqual(expect.arrayContaining(["project-planning"]));
    expect(nav(["project.pmc.read"]).map(item => item.id)).not.toContain("project-supply");
    expect(nav(["project.read"], "other").map(item => item.id)).not.toContain("project-planning");
  });
});

