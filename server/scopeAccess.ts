// Which projects a person may see for ONE permission, decided per role assignment (work order 12, item 2).
//
// `getTenantAccessSnapshot` pools the permissions of every assignment and the scopes of every assignment separately, so a person with
// `project.read` on project A and some other role on project B appears to hold `project.read` on both (GAP_LIST G-142). The four dashboards
// below must not inherit that: here a scope counts only if the SAME assignment carries the permission asked for.
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { memberships, membershipRoles, permissions, projects, rolePermissions, roles, tenantEntitlements } from "../drizzle/schema";
import { getDb } from "./db";
import type { ProductCode } from "../drizzle/schema";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type ScopedAccess = {
  /** True when one qualifying assignment is company-wide. */
  company: boolean;
  /** Every project of the company this person may see for the permission. */
  projectIds: Set<string>;
};

const denied = () => new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_PERMISSION_DENIED" });

/**
 * @param permissions any one of these on an assignment makes that assignment count
 * @param requireCompanyScope the level is company-wide by definition (board view): a narrower assignment is refused, not narrowed
 */
export async function resolveScopedAccess(input: { userId: number; tenantId: string; product: ProductCode; permissions: readonly string[]; requireCompanyScope?: boolean }): Promise<ScopedAccess> {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const [membership] = await db.select({ id: memberships.id, status: memberships.status }).from(memberships).where(and(eq(memberships.tenantId, input.tenantId), eq(memberships.userId, input.userId))).limit(1);
  if (!membership) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  if (membership.status !== "active") throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  const [entitled] = await db.select({ id: tenantEntitlements.id }).from(tenantEntitlements).where(and(eq(tenantEntitlements.tenantId, input.tenantId), eq(tenantEntitlements.productCode, input.product), eq(tenantEntitlements.active, true))).limit(1);
  if (!entitled) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_PRODUCT_NOT_ENTITLED" });

  // One row per (assignment, permission) it carries: the scope and the permission travel together.
  const assignments = await db
    .select({ scopeType: membershipRoles.scopeType, scopeId: membershipRoles.scopeId })
    .from(membershipRoles)
    .innerJoin(roles, eq(membershipRoles.roleId, roles.id))
    .innerJoin(rolePermissions, eq(roles.id, rolePermissions.roleId))
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(and(eq(membershipRoles.membershipId, membership.id), inArray(permissions.code, [...input.permissions])));
  if (!assignments.length) throw denied();

  const company = assignments.some(item => item.scopeType === "company");
  if (input.requireCompanyScope && !company) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_PERMISSION_DENIED" });

  const rows = await db.select({ id: projects.id, portfolioId: projects.portfolioId, programId: projects.programId }).from(projects).where(eq(projects.tenantId, input.tenantId));
  const visible = new Set<string>();
  for (const project of rows) {
    const inScope = company || assignments.some(item =>
      (item.scopeType === "project" && item.scopeId === project.id)
      || (item.scopeType === "portfolio" && item.scopeId !== null && item.scopeId === project.portfolioId)
      || (item.scopeType === "program" && item.scopeId !== null && item.scopeId === project.programId));
    if (inScope) visible.add(project.id);
  }
  return { company, projectIds: visible };
}

/** The one question every project-level answer asks: is this project among the ones the caller's assignment covers? */
export function assertProjectInScope(access: ScopedAccess, projectId: string): void {
  if (!access.projectIds.has(projectId)) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_PERMISSION_DENIED" });
}

export type { Db };
