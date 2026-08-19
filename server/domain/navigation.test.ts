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
});
