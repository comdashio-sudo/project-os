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

export type AccessGrant = { code: string; scopeType: ScopeType; scopeId: string | null };

export type TenantAccessSnapshot = {
  tenantId: string;
  membershipStatus: MembershipStatus | null;
  entitledProducts: readonly ProductCode[];
  /**
   * The permission codes of EVERY assignment, pooled, and the scopes of every assignment, pooled. For display (the access summary) and for the
   * separation-of-duties rule only: never a basis for a decision, because pooling loses which scope a permission was granted on (G-142, D-18).
   * Decide with `holdsPermission` (or `assertTenantAccess`), which reads `grants`. server/domain/accessGrants.static.test.ts enforces this.
   */
  permissionCodes: readonly string[];
  scopes: readonly { scopeType: ScopeType; scopeId: string | null }[];
  /** One entry per (assignment, permission it carries): the permission and the scope it was granted on travel together. */
  grants: readonly AccessGrant[];
};

/** Does one grant's scope cover the requested scope? A company-wide grant covers everything; any other covers exactly its own scope. */
const grantCovers = (grant: Pick<AccessGrant, "scopeType" | "scopeId">, requested: { type: ScopeType; id?: string }) => grant.scopeType === "company" || (grant.scopeType === requested.type && grant.scopeId === requested.id);

/**
 * True only when ONE assignment carries one of the permissions AND covers the scope (G-142, D-18). A viewer on project A who manages project B
 * does not manage A. Without a scope the question is «on any assignment at all», as it always was for an unscoped check.
 */
export function holdsPermission(snapshot: Pick<TenantAccessSnapshot, "grants">, permission: string | readonly string[], scope?: { type: ScopeType; id?: string }): boolean {
  const accepted = typeof permission === "string" ? [permission] : permission;
  return snapshot.grants.some(grant => accepted.includes(grant.code) && (!scope || grantCovers(grant, scope)));
}

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
  // the permission and the scope must come from the same assignment (G-142, D-18)
  if (!holdsPermission(snapshot, request.permission, request.scope)) {
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

