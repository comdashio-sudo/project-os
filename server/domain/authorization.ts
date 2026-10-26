import { TRPCError } from "@trpc/server";
import type { ProductCode, SubscriptionPackageCode } from "../../drizzle/schema";

export const packageProducts: Record<SubscriptionPackageCode, readonly ProductCode[]> = {
  EXECUTIVE: ["EXECUTIVE"],
  PMO: ["PMO"],
  PROJECT: ["PROJECT"],
  "EXECUTIVE + PMO": ["EXECUTIVE", "PMO"],
  "PMO + PROJECT": ["PMO", "PROJECT"],
  "EXECUTIVE + PROJECT": ["EXECUTIVE", "PROJECT"],
  "ALL-IN-ONE": ["EXECUTIVE", "PMO", "PROJECT"],
};

export type MembershipStatus = "invited" | "active" | "suspended" | "revoked";
export type ScopeType = "company" | "portfolio" | "program" | "project";

export type TenantAccessSnapshot = {
  tenantId: string;
  membershipStatus: MembershipStatus | null;
  entitledProducts: readonly ProductCode[];
  permissionCodes: readonly string[];
  scopes: readonly { scopeType: ScopeType; scopeId: string | null }[];
};

export function productsForPackage(packageCode: SubscriptionPackageCode): readonly ProductCode[] {
  return packageProducts[packageCode];
}

export function assertTenantAccess(
  snapshot: TenantAccessSnapshot,
  request: { tenantId: string; product: ProductCode; permission: string | readonly string[]; scope?: { type: ScopeType; id?: string } },
): void {
  if (!request.tenantId || request.tenantId !== snapshot.tenantId) {
    throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  }
  if (snapshot.membershipStatus !== "active") {
    throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  }
  if (!snapshot.entitledProducts.includes(request.product)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_PRODUCT_NOT_ENTITLED" });
  }
  const accepted = typeof request.permission === "string" ? [request.permission] : request.permission;
  if (!accepted.some(code => snapshot.permissionCodes.includes(code))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_PERMISSION_DENIED" });
  }
  if (request.scope && !hasScopeAccess(snapshot.scopes, request.scope)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_PERMISSION_DENIED" });
  }
}

export function hasScopeAccess(
  grantedScopes: TenantAccessSnapshot["scopes"],
  requestedScope: { type: ScopeType; id?: string },
): boolean {
  return grantedScopes.some(scope => {
    if (scope.scopeType === "company") return true;
    return scope.scopeType === requestedScope.type && scope.scopeId === requestedScope.id;
  });
}

