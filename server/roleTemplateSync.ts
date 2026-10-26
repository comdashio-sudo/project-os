// Work order 17, item 2: how a change to a ready-made role template reaches the companies that already exist.
//   - an ADDED permission is applied by itself and written to the company's audit trail (db.ts, installOperationalRoleTemplates);
//   - a REMOVED permission (domain/operationalRoles.ts, retiredTemplatePermissions) is only PROPOSED here; it changes nothing until the company's
//     administrator has seen a preview (which role, how many people hold it) and approved it. A declined removal is remembered and never proposed again.
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { auditLogs, membershipRoles, permissions, roleTemplateRemovals, rolePermissions, roles } from "../drizzle/schema";
import { retiredTemplatePermissions } from "./domain/operationalRoles";
import type { getDb } from "./db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Retired = ReadonlyArray<{ roleCode: string; permission: string }>;

/** For each retired power a company's template role still holds, record one pending proposal (once). Returns how many were newly proposed. */
export async function proposeRetiredTemplateRemovals(tx: Tx | Db, tenantId: string, retired: Retired = retiredTemplatePermissions): Promise<number> {
  let proposed = 0;
  for (const item of retired) {
    const [row] = await tx.select({ roleId: roles.id, permissionId: permissions.id }).from(roles)
      .innerJoin(permissions, eq(permissions.code, item.permission))
      .innerJoin(rolePermissions, and(eq(rolePermissions.roleId, roles.id), eq(rolePermissions.permissionId, permissions.id)))
      .where(and(eq(roles.tenantId, tenantId), eq(roles.code, item.roleCode), eq(roles.systemManaged, true))).limit(1);
    if (!row) continue;
    const inserted = await tx.insert(roleTemplateRemovals).values({ id: randomUUID(), tenantId, roleId: row.roleId, permissionId: row.permissionId }).onConflictDoNothing().returning({ id: roleTemplateRemovals.id });
    if (!inserted.length) continue;
    proposed++;
    await tx.insert(auditLogs).values({ id: randomUUID(), tenantId, actorUserId: null, action: "role_template.removal_proposed", entityType: "role", entityId: row.roleId, metadata: JSON.stringify({ role: item.roleCode, permission: item.permission }) });
  }
  return proposed;
}

export type TemplateRemovalPreview = { id: string; roleId: string; roleCode: string; roleName: string; permissionCode: string; permissionName: string; holders: number; status: "pending" | "approved" | "declined"; proposedAt: string };

/** What the administrator is asked to approve: each proposal with the role, the power, and how many people hold that role (the people who would lose it). */
export async function listTemplateRemovals(db: Db, tenantId: string, status: "pending" | "approved" | "declined" = "pending"): Promise<TemplateRemovalPreview[]> {
  const rows = await db.select({ id: roleTemplateRemovals.id, roleId: roles.id, roleCode: roles.code, roleName: roles.name, permissionCode: permissions.code, permissionName: permissions.name, status: roleTemplateRemovals.status, proposedAt: roleTemplateRemovals.proposedAt })
    .from(roleTemplateRemovals).innerJoin(roles, eq(roles.id, roleTemplateRemovals.roleId)).innerJoin(permissions, eq(permissions.id, roleTemplateRemovals.permissionId))
    .where(and(eq(roleTemplateRemovals.tenantId, tenantId), eq(roleTemplateRemovals.status, status)));
  const out: TemplateRemovalPreview[] = [];
  for (const row of rows) {
    const [held] = await db.select({ n: sql<number>`count(distinct ${membershipRoles.membershipId})::int` }).from(membershipRoles).where(eq(membershipRoles.roleId, row.roleId));
    out.push({ ...row, holders: Number(held?.n ?? 0), proposedAt: row.proposedAt.toISOString() });
  }
  return out;
}

/** The administrator's decision. Approving removes the power from the role (and is audited); declining keeps it (and is audited). Only pending proposals of this company can be decided. */
export async function decideTemplateRemovals(db: Db, input: { tenantId: string; actorUserId: number; ids: string[]; decision: "approve" | "decline" }): Promise<{ decided: number }> {
  return db.transaction(async tx => {
    const pending = await tx.select({ id: roleTemplateRemovals.id, roleId: roleTemplateRemovals.roleId, permissionId: roleTemplateRemovals.permissionId }).from(roleTemplateRemovals)
      .where(and(eq(roleTemplateRemovals.tenantId, input.tenantId), eq(roleTemplateRemovals.status, "pending"), inArray(roleTemplateRemovals.id, input.ids)));
    if (pending.length !== new Set(input.ids).size) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_TEMPLATE_REMOVAL_NOT_PENDING" });
    for (const item of pending) {
      if (input.decision === "approve") await tx.delete(rolePermissions).where(and(eq(rolePermissions.roleId, item.roleId), eq(rolePermissions.permissionId, item.permissionId)));
      const updated = await tx.update(roleTemplateRemovals).set({ status: input.decision === "approve" ? "approved" : "declined", decidedByUserId: input.actorUserId, decidedAt: new Date() }).where(and(eq(roleTemplateRemovals.id, item.id), eq(roleTemplateRemovals.status, "pending"))).returning({ id: roleTemplateRemovals.id });
      if (!updated.length) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_TEMPLATE_REMOVAL_NOT_PENDING" });
      await tx.insert(auditLogs).values({ id: randomUUID(), tenantId: input.tenantId, actorUserId: input.actorUserId, action: input.decision === "approve" ? "role_template.removal_approved" : "role_template.removal_declined", entityType: "role", entityId: item.roleId, metadata: JSON.stringify({ removalId: item.id }) });
    }
    return { decided: pending.length };
  });
}
