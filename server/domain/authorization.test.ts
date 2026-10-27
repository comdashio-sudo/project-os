import { describe, expect, it } from "vitest";
import { assertTenantAccess, productsForPackage, type TenantAccessSnapshot } from "./authorization";

const access: TenantAccessSnapshot = {
  tenantId: "tenant-a",
  membershipStatus: "active",
  entitledProducts: ["PMO", "PROJECT"],
  permissionCodes: ["project.read", "project.write"],
  scopes: [{ scopeType: "project", scopeId: "project-1" }],
};

describe("commercial packages", () => {
  it("maps ALL-IN-ONE to all three products", () => {
    expect(productsForPackage("ALL-IN-ONE")).toEqual(["EXECUTIVE", "PMO", "PROJECT"]);
  });

  it("preserves standalone PMO boundaries", () => {
    expect(productsForPackage("PMO")).toEqual(["PMO"]);
  });
});

describe("tenant authorization", () => {
  it("allows an entitled member with a permission in the assigned project scope", () => {
    expect(() =>
      assertTenantAccess(access, {
        tenantId: "tenant-a",
        product: "PROJECT",
        permission: "project.read",
        scope: { type: "project", id: "project-1" },
      }),
    ).not.toThrow();
  });

  it("rejects a cross-tenant request", () => {
    expect(() =>
      assertTenantAccess(access, { tenantId: "tenant-b", product: "PROJECT", permission: "project.read" }),
    ).toThrow(/PROJECT_OS_TENANT_ACCESS_DENIED/);
  });

  it("rejects an entitlement bypass", () => {
    expect(() =>
      assertTenantAccess(access, { tenantId: "tenant-a", product: "EXECUTIVE", permission: "project.read" }),
    ).toThrow(/PROJECT_OS_PRODUCT_NOT_ENTITLED/);
  });

  it("rejects a role-scope bypass", () => {
    expect(() =>
      assertTenantAccess(access, {
        tenantId: "tenant-a",
        product: "PROJECT",
        permission: "project.read",
        scope: { type: "project", id: "project-2" },
      }),
    ).toThrow(/PROJECT_OS_PERMISSION_DENIED/);
  });
});
