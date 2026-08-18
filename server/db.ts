import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { TRPCError } from "@trpc/server";
import { createHash, randomBytes } from "node:crypto";
import {
  type InsertUser,
  type ProductCode,
  type SubscriptionPackageCode,
  auditLogs,
  companies,
  commitments,
  contracts,
  memberships,
  membershipInvitations,
  membershipRoles,
  permissions,
  portfolios,
  programs,
  projects,
  projectHealthSnapshots,
  activities,
  risks,
  issues,
  actions,
  decisions,
  wbsItems,
  costEntries,
  budgetLines,
  progressEntries,
  evmSnapshots,
  documentVersions,
  projectDocuments,
  rfis,
  rolePermissions,
  roles,
  subscriptions,
  tenantEntitlements,
  users,
} from "../drizzle/schema";
import { productsForPackage, type TenantAccessSnapshot } from "./domain/authorization";
import { assertTenantAccess } from "./domain/authorization";
import { calculateEvm, type EvmInput } from "./domain/evm";
import { calculateOperationalEvm, type OperationalEvmSources } from "./domain/operationalEvm";
import { calculateProjectHealth } from "./domain/projectHealth";
import { ENV } from "./_core/env";
import { storagePut } from "./storage";

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) return;

  const values: InsertUser = { openId: user.openId, lastSignedIn: user.lastSignedIn ?? new Date() };
  const updateSet: Record<string, unknown> = { lastSignedIn: values.lastSignedIn };
  for (const field of ["name", "email", "loginMethod"] as const) {
    if (user[field] !== undefined) {
      values[field] = user[field] ?? null;
      updateSet[field] = user[field] ?? null;
    }
  }
  values.role = user.role ?? (user.openId === ENV.ownerOpenId ? "admin" : "user");
  updateSet.role = values.role;
  await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result[0];
}

export async function getTenantAccessSnapshot(input: { userId: number; tenantId: string }): Promise<TenantAccessSnapshot | null> {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");

  const membership = await db
    .select({ id: memberships.id, status: memberships.status })
    .from(memberships)
    .where(and(eq(memberships.tenantId, input.tenantId), eq(memberships.userId, input.userId)))
    .limit(1);
  const currentMembership = membership[0];
  if (!currentMembership) return null;

  const [entitlements, scopes, grantedPermissions] = await Promise.all([
    db.select({ productCode: tenantEntitlements.productCode }).from(tenantEntitlements).where(and(eq(tenantEntitlements.tenantId, input.tenantId), eq(tenantEntitlements.active, true))),
    db.select({ scopeType: membershipRoles.scopeType, scopeId: membershipRoles.scopeId }).from(membershipRoles).where(eq(membershipRoles.membershipId, currentMembership.id)),
    db
      .select({ code: permissions.code })
      .from(membershipRoles)
      .innerJoin(roles, eq(membershipRoles.roleId, roles.id))
      .innerJoin(rolePermissions, eq(roles.id, rolePermissions.roleId))
      .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
      .where(eq(membershipRoles.membershipId, currentMembership.id)),
  ]);

  return {
    tenantId: input.tenantId,
    membershipStatus: currentMembership.status,
    entitledProducts: Array.from(new Set(entitlements.map(item => item.productCode as ProductCode))),
    permissionCodes: Array.from(new Set(grantedPermissions.map(item => item.code))),
    scopes,
  };
}

async function assertTenantManager(userId: number, tenantId: string): Promise<void> {
  const snapshot = await getTenantAccessSnapshot({ userId, tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId, product: "EXECUTIVE", permission: "tenant.manage" });
}

async function assertTenantScopeOwnership(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, tenantId: string, scopeType: "company" | "portfolio" | "program" | "project", scopeId?: string): Promise<void> {
  if (scopeType === "company") {
    if (scopeId) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_INVALID_SCOPE" });
    return;
  }
  if (!scopeId) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_INVALID_SCOPE" });
  const [scope] = scopeType === "portfolio"
    ? await db.select({ id: portfolios.id }).from(portfolios).where(and(eq(portfolios.id, scopeId), eq(portfolios.tenantId, tenantId))).limit(1)
    : scopeType === "program"
      ? await db.select({ id: programs.id }).from(programs).where(and(eq(programs.id, scopeId), eq(programs.tenantId, tenantId))).limit(1)
      : await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, scopeId), eq(projects.tenantId, tenantId))).limit(1);
  if (!scope) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_INVALID_SCOPE" });
}

export async function getTenantAdministration(input: { userId: number; tenantId: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  await assertTenantManager(input.userId, input.tenantId);
  const [memberRows, roleRows, permissionRows] = await Promise.all([
    db.select({ membershipId: memberships.id, userId: users.id, name: users.name, email: users.email, status: memberships.status, joinedAt: memberships.joinedAt }).from(memberships).innerJoin(users, eq(memberships.userId, users.id)).where(eq(memberships.tenantId, input.tenantId)),
    db.select({ id: roles.id, code: roles.code, name: roles.name, productCode: roles.productCode, systemManaged: roles.systemManaged }).from(roles).where(eq(roles.tenantId, input.tenantId)),
    db.select({ code: permissions.code, name: permissions.name, productCode: permissions.productCode }).from(permissions),
  ]);
  const membershipAssignments = await Promise.all(memberRows.map(async member => {
    const roleAssignments = await db.select({ assignmentId: membershipRoles.id, roleId: membershipRoles.roleId, roleCode: roles.code, roleName: roles.name, scopeType: membershipRoles.scopeType, scopeId: membershipRoles.scopeId }).from(membershipRoles).innerJoin(roles, eq(membershipRoles.roleId, roles.id)).where(eq(membershipRoles.membershipId, member.membershipId));
    const rolesWithScopeNames = await Promise.all(roleAssignments.map(async assignment => {
      if (assignment.scopeType === "company") return { ...assignment, scopeName: null };
      const [scope] = assignment.scopeType === "portfolio"
        ? await db.select({ name: portfolios.name }).from(portfolios).where(and(eq(portfolios.id, assignment.scopeId!), eq(portfolios.tenantId, input.tenantId))).limit(1)
        : assignment.scopeType === "program"
          ? await db.select({ name: programs.name }).from(programs).where(and(eq(programs.id, assignment.scopeId!), eq(programs.tenantId, input.tenantId))).limit(1)
          : await db.select({ name: projects.name }).from(projects).where(and(eq(projects.id, assignment.scopeId!), eq(projects.tenantId, input.tenantId))).limit(1);
      return { ...assignment, scopeName: scope?.name ?? null };
    }));
    return { membershipId: member.membershipId, roles: rolesWithScopeNames };
  }));
  const rolesWithPermissions = await Promise.all(roleRows.map(async role => ({
    ...role,
    permissions: await db.select({ code: permissions.code }).from(rolePermissions).innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id)).where(eq(rolePermissions.roleId, role.id)),
  })));
  const assignmentsByMembership = new Map(membershipAssignments.map(item => [item.membershipId, item.roles]));
  return { members: memberRows.map(member => ({ ...member, roles: assignmentsByMembership.get(member.membershipId) ?? [] })), roles: rolesWithPermissions, permissions: permissionRows };
}

export async function findAssignableTenantUser(input: { userId: number; tenantId: string; email: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  await assertTenantManager(input.userId, input.tenantId);
  const [candidate] = await db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(eq(users.email, input.email.trim().toLowerCase())).limit(1);
  if (!candidate) return null;
  const [existingMembership] = await db.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.tenantId, input.tenantId), eq(memberships.userId, candidate.id))).limit(1);
  if (existingMembership) return null;
  return candidate;
}

export async function createTenantRole(input: { actorUserId: number; tenantId: string; code: string; name: string; productCode: ProductCode; permissionCodes: string[] }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  await assertTenantManager(input.actorUserId, input.tenantId);
  const normalizedCode = input.code.trim().toUpperCase();
  const permissionCodes = Array.from(new Set(input.permissionCodes.map(code => code.trim())));
  const [existingRole] = await db.select({ id: roles.id }).from(roles).where(and(eq(roles.tenantId, input.tenantId), eq(roles.code, normalizedCode))).limit(1);
  if (existingRole) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_ROLE_CODE_EXISTS" });
  const selectedPermissions = await db.select({ id: permissions.id, code: permissions.code, productCode: permissions.productCode }).from(permissions).where(inArray(permissions.code, permissionCodes));
  if (selectedPermissions.length !== permissionCodes.length || selectedPermissions.some(permission => permission.productCode !== input.productCode)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_INVALID_ROLE_PERMISSIONS" });
  }
  const roleId = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(roles).values({ id: roleId, tenantId: input.tenantId, code: normalizedCode, name: input.name.trim(), productCode: input.productCode, systemManaged: false });
    await tx.insert(rolePermissions).values(selectedPermissions.map(permission => ({ roleId, permissionId: permission.id })));
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.actorUserId, action: "tenant.role_created", entityType: "role", entityId: roleId, metadata: JSON.stringify({ code: normalizedCode, productCode: input.productCode, permissionCodes }) });
  });
  return { id: roleId, code: normalizedCode, permissionCount: selectedPermissions.length };
}

export async function updateTenantRole(input: { actorUserId: number; tenantId: string; roleId: string; name: string; permissionCodes: string[] }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  await assertTenantManager(input.actorUserId, input.tenantId);
  const [role] = await db.select({ id: roles.id, tenantId: roles.tenantId, productCode: roles.productCode, systemManaged: roles.systemManaged }).from(roles).where(eq(roles.id, input.roleId)).limit(1);
  if (!role || role.tenantId !== input.tenantId) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_ROLE_NOT_FOUND" });
  if (role.systemManaged) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_SYSTEM_ROLE_IMMUTABLE" });
  const [actorRoleAssignment] = await db.select({ membershipId: memberships.id }).from(memberships).innerJoin(membershipRoles, eq(memberships.id, membershipRoles.membershipId)).where(and(eq(memberships.tenantId, input.tenantId), eq(memberships.userId, input.actorUserId), eq(membershipRoles.roleId, role.id))).limit(1);
  if (actorRoleAssignment) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_SELF_PRIVILEGE_CHANGE_FORBIDDEN" });
  const permissionCodes = Array.from(new Set(input.permissionCodes.map(code => code.trim())));
  const selectedPermissions = await db.select({ id: permissions.id, code: permissions.code, productCode: permissions.productCode }).from(permissions).where(inArray(permissions.code, permissionCodes));
  if (selectedPermissions.length !== permissionCodes.length || selectedPermissions.some(permission => permission.productCode !== role.productCode)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_INVALID_ROLE_PERMISSIONS" });
  }
  await db.transaction(async tx => {
    await tx.update(roles).set({ name: input.name.trim() }).where(eq(roles.id, role.id));
    await tx.delete(rolePermissions).where(eq(rolePermissions.roleId, role.id));
    await tx.insert(rolePermissions).values(selectedPermissions.map(permission => ({ roleId: role.id, permissionId: permission.id })));
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.actorUserId, action: "tenant.role_updated", entityType: "role", entityId: role.id, metadata: JSON.stringify({ name: input.name.trim(), permissionCodes }) });
  });
  return { id: role.id, permissionCount: selectedPermissions.length };
}

export async function assignTenantMembershipRole(input: { actorUserId: number; tenantId: string; membershipId: string; roleId: string; scopeType: "company" | "portfolio" | "program" | "project"; scopeId?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  await assertTenantManager(input.actorUserId, input.tenantId);
  await assertTenantScopeOwnership(db, input.tenantId, input.scopeType, input.scopeId);
  const [membership] = await db.select({ id: memberships.id, tenantId: memberships.tenantId, userId: memberships.userId }).from(memberships).where(eq(memberships.id, input.membershipId)).limit(1);
  if (!membership || membership.tenantId !== input.tenantId) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_MEMBER_NOT_FOUND" });
  if (membership.userId === input.actorUserId) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_SELF_PRIVILEGE_CHANGE_FORBIDDEN" });
  const [role] = await db.select({ id: roles.id, tenantId: roles.tenantId }).from(roles).where(eq(roles.id, input.roleId)).limit(1);
  if (!role || role.tenantId !== input.tenantId) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_ROLE_NOT_FOUND" });
  const scopeCondition = input.scopeId ? eq(membershipRoles.scopeId, input.scopeId) : isNull(membershipRoles.scopeId);
  const [existingAssignment] = await db.select({ id: membershipRoles.id }).from(membershipRoles).where(and(eq(membershipRoles.membershipId, membership.id), eq(membershipRoles.roleId, role.id), eq(membershipRoles.scopeType, input.scopeType), scopeCondition)).limit(1);
  if (existingAssignment) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_ROLE_ASSIGNMENT_EXISTS" });
  const assignmentId = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(membershipRoles).values({ id: assignmentId, membershipId: membership.id, roleId: role.id, scopeType: input.scopeType, scopeId: input.scopeId ?? null });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.actorUserId, action: "tenant.membership_role_assigned", entityType: "membership_role", entityId: assignmentId, metadata: JSON.stringify({ membershipId: membership.id, targetUserId: membership.userId, roleId: role.id, scopeType: input.scopeType, scopeId: input.scopeId ?? null }) });
  });
  return { assignmentId, membershipId: membership.id, roleId: role.id };
}

export async function revokeTenantMembershipRole(input: { actorUserId: number; tenantId: string; assignmentId: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  await assertTenantManager(input.actorUserId, input.tenantId);
  const [assignment] = await db
    .select({ assignmentId: membershipRoles.id, membershipId: membershipRoles.membershipId, roleId: membershipRoles.roleId, scopeType: membershipRoles.scopeType, scopeId: membershipRoles.scopeId, userId: memberships.userId, tenantId: memberships.tenantId })
    .from(membershipRoles)
    .innerJoin(memberships, eq(membershipRoles.membershipId, memberships.id))
    .where(eq(membershipRoles.id, input.assignmentId))
    .limit(1);
  if (!assignment || assignment.tenantId !== input.tenantId) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_ROLE_ASSIGNMENT_NOT_FOUND" });
  if (assignment.userId === input.actorUserId) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_SELF_PRIVILEGE_CHANGE_FORBIDDEN" });
  await db.transaction(async tx => {
    await tx.delete(membershipRoles).where(eq(membershipRoles.id, assignment.assignmentId));
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.actorUserId, action: "tenant.membership_role_revoked", entityType: "membership_role", entityId: assignment.assignmentId, metadata: JSON.stringify({ membershipId: assignment.membershipId, targetUserId: assignment.userId, roleId: assignment.roleId, scopeType: assignment.scopeType, scopeId: assignment.scopeId }) });
  });
  return { assignmentId: assignment.assignmentId, membershipId: assignment.membershipId };
}

export async function assignTenantMember(input: { actorUserId: number; tenantId: string; targetUserId: number; roleId: string; scopeType: "company" | "portfolio" | "program" | "project"; scopeId?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  await assertTenantManager(input.actorUserId, input.tenantId);
  if (input.actorUserId === input.targetUserId) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_SELF_PRIVILEGE_CHANGE_FORBIDDEN" });
  await assertTenantScopeOwnership(db, input.tenantId, input.scopeType, input.scopeId);
  const [targetUser] = await db.select({ id: users.id }).from(users).where(eq(users.id, input.targetUserId));
  if (!targetUser) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_USER_NOT_FOUND" });
  const [role] = await db.select({ id: roles.id, tenantId: roles.tenantId }).from(roles).where(eq(roles.id, input.roleId));
  if (!role || role.tenantId !== input.tenantId) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_ROLE_NOT_FOUND" });
  const [existing] = await db.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.tenantId, input.tenantId), eq(memberships.userId, input.targetUserId)));
  if (existing) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_MEMBER_ALREADY_EXISTS" });
  const membershipId = crypto.randomUUID();
  const assignmentId = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(memberships).values({ id: membershipId, tenantId: input.tenantId, userId: input.targetUserId, status: "invited" });
    await tx.insert(membershipRoles).values({ id: assignmentId, membershipId, roleId: input.roleId, scopeType: input.scopeType, scopeId: input.scopeId ?? null });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.actorUserId, action: "tenant.member_assigned", entityType: "membership", entityId: membershipId, metadata: JSON.stringify({ targetUserId: input.targetUserId, roleId: input.roleId, scopeType: input.scopeType, scopeId: input.scopeId ?? null }) });
  });
  return { membershipId, assignmentId, status: "invited" as const };
}

export async function createMembershipInvitation(input: { actorUserId: number; tenantId: string; email: string; roleId: string; scopeType: "company" | "portfolio" | "program" | "project"; scopeId?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  await assertTenantManager(input.actorUserId, input.tenantId);
  await assertTenantScopeOwnership(db, input.tenantId, input.scopeType, input.scopeId);
  const email = input.email.trim().toLowerCase();
  const [role] = await db.select({ id: roles.id, tenantId: roles.tenantId }).from(roles).where(eq(roles.id, input.roleId)).limit(1);
  if (!role || role.tenantId !== input.tenantId) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_ROLE_NOT_FOUND" });
  const [existingMembership] = await db.select({ id: memberships.id }).from(memberships).innerJoin(users, eq(memberships.userId, users.id)).where(and(eq(memberships.tenantId, input.tenantId), eq(users.email, email))).limit(1);
  if (existingMembership) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_MEMBER_ALREADY_EXISTS" });
  const [pendingInvitation] = await db.select({ id: membershipInvitations.id }).from(membershipInvitations).where(and(eq(membershipInvitations.tenantId, input.tenantId), eq(membershipInvitations.email, email), eq(membershipInvitations.status, "pending"))).limit(1);
  if (pendingInvitation) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_INVITATION_ALREADY_PENDING" });
  const invitationId = crypto.randomUUID();
  const inviteToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(inviteToken).digest("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  await db.transaction(async tx => {
    await tx.insert(membershipInvitations).values({ id: invitationId, tenantId: input.tenantId, email, roleId: role.id, scopeType: input.scopeType, scopeId: input.scopeId ?? null, tokenHash, status: "pending", invitedByUserId: input.actorUserId, expiresAt });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.actorUserId, action: "tenant.member_invited", entityType: "membership_invitation", entityId: invitationId, metadata: JSON.stringify({ email, roleId: role.id, scopeType: input.scopeType, scopeId: input.scopeId ?? null, expiresAt: expiresAt.toISOString() }) });
  });
  return { invitationId, email, expiresAt, inviteToken };
}

export async function acceptMembershipInvitation(input: { userId: number; inviteToken: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const tokenHash = createHash("sha256").update(input.inviteToken).digest("hex");
  const [invitation] = await db.select({ id: membershipInvitations.id, tenantId: membershipInvitations.tenantId, email: membershipInvitations.email, roleId: membershipInvitations.roleId, scopeType: membershipInvitations.scopeType, scopeId: membershipInvitations.scopeId, expiresAt: membershipInvitations.expiresAt }).from(membershipInvitations).where(and(eq(membershipInvitations.tokenHash, tokenHash), eq(membershipInvitations.status, "pending"))).limit(1);
  if (!invitation || invitation.expiresAt.getTime() <= Date.now()) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_INVITATION_INVALID_OR_EXPIRED" });
  const [user] = await db.select({ id: users.id, email: users.email }).from(users).where(eq(users.id, input.userId)).limit(1);
  if (!user?.email || user.email.trim().toLowerCase() !== invitation.email) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_INVITATION_EMAIL_MISMATCH" });
  const [existingMembership] = await db.select({ id: memberships.id }).from(memberships).where(and(eq(memberships.tenantId, invitation.tenantId), eq(memberships.userId, input.userId))).limit(1);
  if (existingMembership) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_MEMBER_ALREADY_EXISTS" });
  const membershipId = crypto.randomUUID();
  const assignmentId = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(memberships).values({ id: membershipId, tenantId: invitation.tenantId, userId: input.userId, status: "active", joinedAt: new Date() });
    await tx.insert(membershipRoles).values({ id: assignmentId, membershipId, roleId: invitation.roleId, scopeType: invitation.scopeType, scopeId: invitation.scopeId });
    await tx.update(membershipInvitations).set({ status: "accepted", acceptedByUserId: input.userId, acceptedAt: new Date() }).where(eq(membershipInvitations.id, invitation.id));
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: invitation.tenantId, actorUserId: input.userId, action: "tenant.invitation_accepted", entityType: "membership_invitation", entityId: invitation.id, metadata: JSON.stringify({ membershipId, assignmentId }) });
  });
  return { tenantId: invitation.tenantId, membershipId, assignmentId };
}

export async function writeAuditLog(input: {
  id: string;
  tenantId: string;
  actorUserId: number | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  requestId?: string | null;
  metadata?: string | null;
}): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  await db.insert(auditLogs).values(input);
}

async function assertProjectWithinTenant(input: { tenantId: string; projectId: string }): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");

  const project = await db
    .select({ id: projects.id })
    .from(projects)
    .where(and(eq(projects.id, input.projectId), eq(projects.tenantId, input.tenantId)))
    .limit(1);

  if (!project[0]) throw new Error("PROJECT_OS_PROJECT_NOT_FOUND");
}

async function assertWbsItemWithinProject(input: { tenantId: string; projectId: string; wbsItemId: string }): Promise<void> {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");

  const wbsItem = await db
    .select({ id: wbsItems.id })
    .from(wbsItems)
    .where(
      and(
        eq(wbsItems.id, input.wbsItemId),
        eq(wbsItems.tenantId, input.tenantId),
        eq(wbsItems.projectId, input.projectId),
      ),
    )
    .limit(1);

  if (!wbsItem[0]) throw new Error("PROJECT_OS_WBS_SCOPE_MISMATCH");
}

const ownerPermissions = [
  { code: "tenant.manage", name: "Manage tenant settings", productCode: "EXECUTIVE" as const },
  { code: "executive.read", name: "View Level 1", productCode: "EXECUTIVE" as const },
  { code: "pmo.read", name: "View Level 2", productCode: "PMO" as const },
  { code: "pmo.write", name: "Manage Level 2", productCode: "PMO" as const },
  { code: "project.read", name: "View Level 3", productCode: "PROJECT" as const },
  { code: "project.write", name: "Manage Level 3", productCode: "PROJECT" as const },
];

export async function createTenantForUser(input: {
  userId: number;
  legalName: string;
  slug: string;
  packageCode: SubscriptionPackageCode;
}): Promise<{ tenantId: string; subscriptionId: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");

  const tenantId = crypto.randomUUID();
  const subscriptionId = crypto.randomUUID();
  const membershipId = crypto.randomUUID();
  const ownerRoleId = crypto.randomUUID();
  const now = new Date();

  await db.transaction(async tx => {
    await tx.insert(companies).values({ id: tenantId, legalName: input.legalName, slug: input.slug, status: "active", defaultLocale: "ar" });
    await tx.insert(subscriptions).values({ id: subscriptionId, tenantId, packageCode: input.packageCode, status: "active", startsAt: now });
    await tx.insert(tenantEntitlements).values(
      productsForPackage(input.packageCode).map(productCode => ({
        id: crypto.randomUUID(),
        tenantId,
        subscriptionId,
        productCode,
        active: true,
        startsAt: now,
      })),
    );
    await tx.insert(memberships).values({ id: membershipId, tenantId, userId: input.userId, status: "active", joinedAt: now });
    await tx.insert(roles).values({ id: ownerRoleId, tenantId, code: "TENANT_OWNER", name: "Tenant Owner", systemManaged: true });
    for (const permission of ownerPermissions) {
      await tx.insert(permissions).values({ id: crypto.randomUUID(), ...permission }).onDuplicateKeyUpdate({ set: { name: permission.name } });
    }
    const permissionRows = await tx.select({ id: permissions.id }).from(permissions);
    const permissionIds = permissionRows.filter(row => row.id).map(row => row.id);
    await tx.insert(rolePermissions).values(permissionIds.map(permissionId => ({ roleId: ownerRoleId, permissionId })));
    await tx.insert(membershipRoles).values({ id: crypto.randomUUID(), membershipId, roleId: ownerRoleId, scopeType: "company" });
    await tx.insert(auditLogs).values({
      id: crypto.randomUUID(),
      tenantId,
      actorUserId: input.userId,
      action: "tenant.created",
      entityType: "company",
      entityId: tenantId,
      metadata: JSON.stringify({ packageCode: input.packageCode }),
    });
  });
  return { tenantId, subscriptionId };
}

export async function listTenantsForUser(userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const tenantMemberships = await db
    .select({ tenantId: memberships.tenantId, legalName: companies.legalName, slug: companies.slug, status: memberships.status })
    .from(memberships)
    .innerJoin(companies, eq(memberships.tenantId, companies.id))
    .where(eq(memberships.userId, userId));
  return Promise.all(tenantMemberships.map(async tenant => ({
    ...tenant,
    products: (await db.select({ productCode: tenantEntitlements.productCode }).from(tenantEntitlements).where(and(eq(tenantEntitlements.tenantId, tenant.tenantId), eq(tenantEntitlements.active, true)))).map(item => item.productCode),
  })));
}

export async function createProjectForTenant(input: {
  userId: number;
  tenantId: string;
  code: string;
  name: string;
  projectType: string;
  currency: string;
}): Promise<{ id: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new Error("Tenant membership is not available");
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.write" });
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(projects).values({ id, tenantId: input.tenantId, code: input.code, name: input.name, projectType: input.projectType, currency: input.currency, status: "draft" });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "project.created", entityType: "project", entityId: id, metadata: JSON.stringify({ code: input.code, projectType: input.projectType }) });
  });
  return { id };
}

type LifecycleStage = "opportunity" | "pre_award" | "tender" | "award" | "mobilization" | "planning" | "design" | "procurement" | "execution" | "commissioning" | "handover" | "closeout" | "post_project_review";

const lifecycleTransitions: Record<LifecycleStage, readonly LifecycleStage[]> = {
  opportunity: ["pre_award"],
  pre_award: ["tender", "award"],
  tender: ["award"],
  award: ["mobilization"],
  mobilization: ["planning"],
  planning: ["design", "procurement", "execution"],
  design: ["procurement", "execution"],
  procurement: ["execution"],
  execution: ["commissioning"],
  commissioning: ["handover"],
  handover: ["closeout"],
  closeout: ["post_project_review"],
  post_project_review: [],
};

export async function transitionProjectLifecycle(input: { userId: number; tenantId: string; projectId: string; lifecycleStage: LifecycleStage }): Promise<{ projectId: string; lifecycleStage: LifecycleStage }> {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.write" });
  const [project] = await db.select({ id: projects.id, lifecycleStage: projects.lifecycleStage }).from(projects).where(and(eq(projects.id, input.projectId), eq(projects.tenantId, input.tenantId))).limit(1);
  if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_PROJECT_NOT_FOUND" });
  if (!lifecycleTransitions[project.lifecycleStage].includes(input.lifecycleStage)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_LIFECYCLE_TRANSITION_INVALID" });
  await db.transaction(async tx => {
    await tx.update(projects).set({ lifecycleStage: input.lifecycleStage }).where(and(eq(projects.id, input.projectId), eq(projects.tenantId, input.tenantId)));
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "project.lifecycle_transitioned", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ from: project.lifecycleStage, to: input.lifecycleStage }) });
  });
  return { projectId: input.projectId, lifecycleStage: input.lifecycleStage };
}

export async function createPortfolioForTenant(input: { userId: number; tenantId: string; code: string; name: string }): Promise<{ id: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PMO", permission: "pmo.write" });
  const id = crypto.randomUUID();
  const code = input.code.trim().toUpperCase();
  await db.transaction(async tx => {
    await tx.insert(portfolios).values({ id, tenantId: input.tenantId, code, name: input.name.trim(), status: "active" });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "portfolio.created", entityType: "portfolio", entityId: id, metadata: JSON.stringify({ code }) });
  });
  return { id };
}

export async function createProgramForTenant(input: { userId: number; tenantId: string; portfolioId?: string; code: string; name: string }): Promise<{ id: string }> {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PMO", permission: "pmo.write" });
  if (input.portfolioId) {
    const [portfolio] = await db.select({ id: portfolios.id }).from(portfolios).where(and(eq(portfolios.id, input.portfolioId), eq(portfolios.tenantId, input.tenantId))).limit(1);
    if (!portfolio) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_PORTFOLIO_NOT_FOUND" });
  }
  const id = crypto.randomUUID();
  const code = input.code.trim().toUpperCase();
  await db.transaction(async tx => {
    await tx.insert(programs).values({ id, tenantId: input.tenantId, portfolioId: input.portfolioId ?? null, code, name: input.name.trim(), status: "active" });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "program.created", entityType: "program", entityId: id, metadata: JSON.stringify({ code, portfolioId: input.portfolioId ?? null }) });
  });
  return { id };
}

export async function linkProjectToProgramForTenant(input: { userId: number; tenantId: string; projectId: string; programId?: string; portfolioId?: string }): Promise<{ projectId: string; programId: string | null; portfolioId: string | null }> {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PMO", permission: "pmo.write" });
  const [project] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, input.projectId), eq(projects.tenantId, input.tenantId))).limit(1);
  if (!project) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_PROJECT_NOT_FOUND" });
  const [program] = input.programId ? await db.select({ id: programs.id, portfolioId: programs.portfolioId }).from(programs).where(and(eq(programs.id, input.programId), eq(programs.tenantId, input.tenantId))).limit(1) : [null];
  if (input.programId && !program) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_PROGRAM_NOT_FOUND" });
  const targetPortfolioId = input.portfolioId ?? program?.portfolioId ?? null;
  if (input.portfolioId) {
    const [portfolio] = await db.select({ id: portfolios.id }).from(portfolios).where(and(eq(portfolios.id, input.portfolioId), eq(portfolios.tenantId, input.tenantId))).limit(1);
    if (!portfolio) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_PORTFOLIO_NOT_FOUND" });
  }
  if (program?.portfolioId && input.portfolioId && program.portfolioId !== input.portfolioId) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_PROGRAM_PORTFOLIO_MISMATCH" });
  await db.transaction(async tx => {
    await tx.update(projects).set({ programId: input.programId ?? null, portfolioId: targetPortfolioId }).where(and(eq(projects.id, input.projectId), eq(projects.tenantId, input.tenantId)));
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "project.program_linked", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ programId: input.programId ?? null, portfolioId: targetPortfolioId }) });
  });
  return { projectId: input.projectId, programId: input.programId ?? null, portfolioId: targetPortfolioId };
}

export async function listProjectsForTenant(input: { userId: number; tenantId: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new Error("Tenant membership is not available");
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.read" });
  return db.select({ id: projects.id, code: projects.code, name: projects.name, projectType: projects.projectType, lifecycleStage: projects.lifecycleStage, status: projects.status, currency: projects.currency, currentBudget: projects.currentBudget, actualCost: projects.actualCost, forecastCost: projects.forecastCost }).from(projects).where(eq(projects.tenantId, input.tenantId));
}

export async function getProjectControlsForTenant(input: { userId: number; tenantId: string; projectId: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");

  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.read", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });

  const [projectRows, wbs, activitiesForProject, budgets, costs, progress, latestEvm, latestHealth] = await Promise.all([
    db.select({ id: projects.id, code: projects.code, name: projects.name, currency: projects.currency, currentBudget: projects.currentBudget, actualCost: projects.actualCost, forecastCost: projects.forecastCost }).from(projects).where(and(eq(projects.id, input.projectId), eq(projects.tenantId, input.tenantId))).limit(1),
    db.select({ id: wbsItems.id, code: wbsItems.code, name: wbsItems.name, parentId: wbsItems.parentId, plannedValue: wbsItems.plannedValue, earnedValue: wbsItems.earnedValue, actualCost: wbsItems.actualCost, progressPercent: wbsItems.progressPercent }).from(wbsItems).where(and(eq(wbsItems.tenantId, input.tenantId), eq(wbsItems.projectId, input.projectId))),
    db.select({ id: activities.id, wbsItemId: activities.wbsItemId, code: activities.code, name: activities.name, status: activities.status, plannedValue: activities.plannedValue, earnedValue: activities.earnedValue, plannedStartAt: activities.plannedStartAt, plannedFinishAt: activities.plannedFinishAt }).from(activities).where(and(eq(activities.tenantId, input.tenantId), eq(activities.projectId, input.projectId))),
    db.select({ id: budgetLines.id, wbsItemId: budgetLines.wbsItemId, costCode: budgetLines.costCode, originalAmount: budgetLines.originalAmount, currentAmount: budgetLines.currentAmount }).from(budgetLines).where(and(eq(budgetLines.tenantId, input.tenantId), eq(budgetLines.projectId, input.projectId))),
    db.select({ id: costEntries.id, wbsItemId: costEntries.wbsItemId, amount: costEntries.amount, entryType: costEntries.entryType, status: costEntries.status, incurredAt: costEntries.incurredAt }).from(costEntries).where(and(eq(costEntries.tenantId, input.tenantId), eq(costEntries.projectId, input.projectId))).orderBy(desc(costEntries.incurredAt)),
    db.select({ id: progressEntries.id, wbsItemId: progressEntries.wbsItemId, progressPercent: progressEntries.progressPercent, status: progressEntries.status, measuredAt: progressEntries.measuredAt }).from(progressEntries).where(and(eq(progressEntries.tenantId, input.tenantId), eq(progressEntries.projectId, input.projectId))).orderBy(desc(progressEntries.measuredAt)),
    db.select({ id: evmSnapshots.id, periodAt: evmSnapshots.periodAt, pv: evmSnapshots.pv, ev: evmSnapshots.ev, ac: evmSnapshots.ac, cpi: evmSnapshots.cpi, spi: evmSnapshots.spi, eac: evmSnapshots.eac, etc: evmSnapshots.etc, vac: evmSnapshots.vac }).from(evmSnapshots).where(and(eq(evmSnapshots.tenantId, input.tenantId), eq(evmSnapshots.projectId, input.projectId))).orderBy(desc(evmSnapshots.periodAt)).limit(1),
    db.select({ id: projectHealthSnapshots.id, periodAt: projectHealthSnapshots.periodAt, overallScore: projectHealthSnapshots.overallScore, status: projectHealthSnapshots.status, confidence: projectHealthSnapshots.confidence, drivers: projectHealthSnapshots.drivers, exceptions: projectHealthSnapshots.exceptions }).from(projectHealthSnapshots).where(and(eq(projectHealthSnapshots.tenantId, input.tenantId), eq(projectHealthSnapshots.projectId, input.projectId))).orderBy(desc(projectHealthSnapshots.periodAt)).limit(1),
  ]);

  return { project: projectRows[0]!, wbs, activities: activitiesForProject, budgets, costs, progress, latestEvm: latestEvm[0] ?? null, latestHealth: latestHealth[0] ?? null };
}

export async function getExecutiveDashboard(input: { userId: number; tenantId: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "EXECUTIVE", permission: "executive.read" });

  const [projectRows, healthRows, decisionRows] = await Promise.all([
    db.select({ id: projects.id, code: projects.code, name: projects.name, status: projects.status, currentBudget: projects.currentBudget, actualCost: projects.actualCost, forecastCost: projects.forecastCost, forecastFinishAt: projects.forecastFinishAt }).from(projects).where(eq(projects.tenantId, input.tenantId)),
    db.select({ projectId: projectHealthSnapshots.projectId, status: projectHealthSnapshots.status, overallScore: projectHealthSnapshots.overallScore, confidence: projectHealthSnapshots.confidence, periodAt: projectHealthSnapshots.periodAt }).from(projectHealthSnapshots).where(eq(projectHealthSnapshots.tenantId, input.tenantId)).orderBy(desc(projectHealthSnapshots.periodAt)),
    db.select({ id: decisions.id, projectId: decisions.projectId, problem: decisions.problem, status: decisions.status, costImpact: decisions.costImpact, scheduleImpactDays: decisions.scheduleImpactDays, createdAt: decisions.createdAt }).from(decisions).where(eq(decisions.tenantId, input.tenantId)).orderBy(desc(decisions.createdAt)),
  ]);

  const latestHealthByProject = new Map<string, (typeof healthRows)[number]>();
  healthRows.forEach(item => { if (!latestHealthByProject.has(item.projectId)) latestHealthByProject.set(item.projectId, item); });
  const projectsWithHealth = projectRows.map(project => ({ ...project, health: latestHealthByProject.get(project.id) ?? null }));
  const totals = projectRows.reduce((accumulator, project) => ({ budget: accumulator.budget + Number(project.currentBudget), actual: accumulator.actual + Number(project.actualCost), forecast: accumulator.forecast + Number(project.forecastCost) }), { budget: 0, actual: 0, forecast: 0 });
  return { totals, projects: projectsWithHealth, decisions: decisionRows.filter(item => !["implemented", "rejected"].includes(item.status)) };
}

export async function getPmoDashboard(input: { userId: number; tenantId: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PMO", permission: "pmo.read" });

  const [portfolioRows, programRows, projectRows, riskRows, issueRows, actionRows] = await Promise.all([
    db.select({ id: portfolios.id, code: portfolios.code, name: portfolios.name, status: portfolios.status }).from(portfolios).where(eq(portfolios.tenantId, input.tenantId)),
    db.select({ id: programs.id, portfolioId: programs.portfolioId, code: programs.code, name: programs.name, status: programs.status }).from(programs).where(eq(programs.tenantId, input.tenantId)),
    db.select({ id: projects.id, portfolioId: projects.portfolioId, programId: projects.programId, code: projects.code, name: projects.name, lifecycleStage: projects.lifecycleStage, status: projects.status }).from(projects).where(eq(projects.tenantId, input.tenantId)),
    db.select({ id: risks.id, projectId: risks.projectId, code: risks.code, title: risks.title, probability: risks.probability, severity: risks.severity, status: risks.status, dueAt: risks.dueAt }).from(risks).where(eq(risks.tenantId, input.tenantId)),
    db.select({ id: issues.id, projectId: issues.projectId, code: issues.code, title: issues.title, priority: issues.priority, escalationStatus: issues.escalationStatus, status: issues.status, dueAt: issues.dueAt }).from(issues).where(eq(issues.tenantId, input.tenantId)),
    db.select({ id: actions.id, projectId: actions.projectId, title: actions.title, priority: actions.priority, status: actions.status, dueAt: actions.dueAt }).from(actions).where(eq(actions.tenantId, input.tenantId)),
  ]);

  return { portfolios: portfolioRows, programs: programRows, projects: projectRows, risks: riskRows, issues: issueRows, actions: actionRows };
}

export async function getContractsCommitmentsForTenant(input: { userId: number; tenantId: string; projectId: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.read", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const [contractRows, commitmentRows] = await Promise.all([
    db.select({ id: contracts.id, code: contracts.code, title: contracts.title, counterparty: contracts.counterparty, contractValue: contracts.contractValue, currency: contracts.currency, status: contracts.status, startAt: contracts.startAt, endAt: contracts.endAt }).from(contracts).where(and(eq(contracts.tenantId, input.tenantId), eq(contracts.projectId, input.projectId))).orderBy(desc(contracts.createdAt)),
    db.select({ id: commitments.id, contractId: commitments.contractId, code: commitments.code, description: commitments.description, amount: commitments.amount, currency: commitments.currency, status: commitments.status, committedAt: commitments.committedAt }).from(commitments).where(and(eq(commitments.tenantId, input.tenantId), eq(commitments.projectId, input.projectId))).orderBy(desc(commitments.createdAt)),
  ]);
  return { contracts: contractRows, commitments: commitmentRows };
}

function decodeDocumentContent(contentBase64: string) {
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(contentBase64) || contentBase64.length % 4 !== 0) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_DOCUMENT_CONTENT_INVALID" });
  const content = Buffer.from(contentBase64, "base64");
  if (content.length === 0 || content.length > 10 * 1024 * 1024) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_DOCUMENT_CONTENT_INVALID" });
  return content;
}

function documentStorageName(originalName: string) {
  return originalName.replace(/[^A-Za-z0-9._-]/g, "_").slice(0, 180) || "document.bin";
}

export async function getProjectDocumentsForTenant(input: { userId: number; tenantId: string; projectId: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.read", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const [documents, versions] = await Promise.all([
    db.select({ id: projectDocuments.id, documentNumber: projectDocuments.documentNumber, title: projectDocuments.title, category: projectDocuments.category, status: projectDocuments.status, createdAt: projectDocuments.createdAt }).from(projectDocuments).where(and(eq(projectDocuments.tenantId, input.tenantId), eq(projectDocuments.projectId, input.projectId))).orderBy(desc(projectDocuments.createdAt)),
    db.select({ id: documentVersions.id, documentId: documentVersions.documentId, versionNumber: documentVersions.versionNumber, originalName: documentVersions.originalName, mimeType: documentVersions.mimeType, sizeBytes: documentVersions.sizeBytes, checksumSha256: documentVersions.checksumSha256, createdAt: documentVersions.createdAt }).from(documentVersions).where(and(eq(documentVersions.tenantId, input.tenantId), eq(documentVersions.projectId, input.projectId))).orderBy(desc(documentVersions.versionNumber)),
  ]);
  return { documents, versions };
}

export async function createProjectDocumentWithVersion(input: { userId: number; tenantId: string; projectId: string; documentNumber: string; title: string; category: "drawing" | "specification" | "method_statement" | "report" | "correspondence" | "commercial" | "other"; originalName: string; mimeType: string; contentBase64: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const content = decodeDocumentContent(input.contentBase64);
  const documentId = crypto.randomUUID();
  const versionId = crypto.randomUUID();
  const checksumSha256 = createHash("sha256").update(content).digest("hex");
  const { key } = await storagePut(`tenants/${input.tenantId}/projects/${input.projectId}/documents/${documentId}/v1/${documentStorageName(input.originalName)}`, content, input.mimeType);
  await db.transaction(async tx => {
    await tx.insert(projectDocuments).values({ id: documentId, tenantId: input.tenantId, projectId: input.projectId, documentNumber: input.documentNumber, title: input.title, category: input.category, createdByUserId: input.userId });
    await tx.insert(documentVersions).values({ id: versionId, tenantId: input.tenantId, projectId: input.projectId, documentId, versionNumber: 1, originalName: input.originalName, storageKey: key, mimeType: input.mimeType, sizeBytes: content.length, checksumSha256, uploadedByUserId: input.userId });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "documents.document_created", entityType: "project_document", entityId: documentId, metadata: JSON.stringify({ projectId: input.projectId, versionId, versionNumber: 1, documentNumber: input.documentNumber, checksumSha256 }) });
  });
  return { id: documentId, versionId, versionNumber: 1 };
}

export async function addProjectDocumentVersion(input: { userId: number; tenantId: string; projectId: string; documentId: string; originalName: string; mimeType: string; contentBase64: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const [document] = await db.select({ id: projectDocuments.id }).from(projectDocuments).where(and(eq(projectDocuments.id, input.documentId), eq(projectDocuments.tenantId, input.tenantId), eq(projectDocuments.projectId, input.projectId))).limit(1);
  if (!document) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_DOCUMENT_NOT_FOUND" });
  const [latestVersion] = await db.select({ versionNumber: documentVersions.versionNumber }).from(documentVersions).where(and(eq(documentVersions.documentId, input.documentId), eq(documentVersions.tenantId, input.tenantId), eq(documentVersions.projectId, input.projectId))).orderBy(desc(documentVersions.versionNumber)).limit(1);
  const content = decodeDocumentContent(input.contentBase64);
  const versionNumber = (latestVersion?.versionNumber ?? 0) + 1;
  const versionId = crypto.randomUUID();
  const checksumSha256 = createHash("sha256").update(content).digest("hex");
  const { key } = await storagePut(`tenants/${input.tenantId}/projects/${input.projectId}/documents/${input.documentId}/v${versionNumber}/${documentStorageName(input.originalName)}`, content, input.mimeType);
  await db.transaction(async tx => {
    await tx.insert(documentVersions).values({ id: versionId, tenantId: input.tenantId, projectId: input.projectId, documentId: input.documentId, versionNumber, originalName: input.originalName, storageKey: key, mimeType: input.mimeType, sizeBytes: content.length, checksumSha256, uploadedByUserId: input.userId });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "documents.version_created", entityType: "document_version", entityId: versionId, metadata: JSON.stringify({ projectId: input.projectId, documentId: input.documentId, versionNumber, checksumSha256 }) });
  });
  return { id: versionId, documentId: input.documentId, versionNumber };
}

const documentStatusTransitions: Record<string, readonly string[]> = {
  draft: ["for_review", "archived"],
  for_review: ["draft", "approved"],
  approved: ["superseded", "archived"],
  superseded: ["archived"],
  archived: [],
};

export async function transitionProjectDocumentStatus(input: { userId: number; tenantId: string; projectId: string; documentId: string; nextStatus: "draft" | "for_review" | "approved" | "superseded" | "archived" }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const [document] = await db.select({ id: projectDocuments.id, status: projectDocuments.status }).from(projectDocuments).where(and(eq(projectDocuments.id, input.documentId), eq(projectDocuments.tenantId, input.tenantId), eq(projectDocuments.projectId, input.projectId))).limit(1);
  if (!document) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_DOCUMENT_NOT_FOUND" });
  if (!documentStatusTransitions[document.status].includes(input.nextStatus)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_DOCUMENT_WORKFLOW_TRANSITION_INVALID" });
  await db.transaction(async tx => {
    await tx.update(projectDocuments).set({ status: input.nextStatus }).where(and(eq(projectDocuments.id, input.documentId), eq(projectDocuments.tenantId, input.tenantId), eq(projectDocuments.projectId, input.projectId)));
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "documents.status_transitioned", entityType: "project_document", entityId: input.documentId, metadata: JSON.stringify({ projectId: input.projectId, previousStatus: document.status, nextStatus: input.nextStatus }) });
  });
  return { id: input.documentId, previousStatus: document.status, status: input.nextStatus };
}

const rfiStatusTransitions: Record<string, readonly string[]> = { draft: ["submitted", "cancelled"], submitted: ["under_review", "answered", "cancelled"], under_review: ["answered", "cancelled"], answered: ["closed"], closed: [], cancelled: [] };

export async function getRfisForTenant(input: { userId: number; tenantId: string; projectId: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.read", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  return db.select({ id: rfis.id, rfiNumber: rfis.rfiNumber, subject: rfis.subject, question: rfis.question, status: rfis.status, dueAt: rfis.dueAt, submittedAt: rfis.submittedAt, createdAt: rfis.createdAt }).from(rfis).where(and(eq(rfis.tenantId, input.tenantId), eq(rfis.projectId, input.projectId))).orderBy(desc(rfis.createdAt));
}

export async function createRfiForTenant(input: { userId: number; tenantId: string; projectId: string; rfiNumber: string; subject: string; question: string; dueAt?: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(rfis).values({ id, tenantId: input.tenantId, projectId: input.projectId, rfiNumber: input.rfiNumber, subject: input.subject, question: input.question, dueAt: input.dueAt, createdByUserId: input.userId });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "rfis.created", entityType: "rfi", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, rfiNumber: input.rfiNumber }) });
  });
  return { id, status: "draft" as const };
}

export async function transitionRfiStatus(input: { userId: number; tenantId: string; projectId: string; rfiId: string; nextStatus: "draft" | "submitted" | "under_review" | "answered" | "closed" | "cancelled" }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const [rfi] = await db.select({ id: rfis.id, status: rfis.status }).from(rfis).where(and(eq(rfis.id, input.rfiId), eq(rfis.tenantId, input.tenantId), eq(rfis.projectId, input.projectId))).limit(1);
  if (!rfi) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_RFI_NOT_FOUND" });
  if (!rfiStatusTransitions[rfi.status].includes(input.nextStatus)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_RFI_TRANSITION_INVALID" });
  const now = new Date();
  await db.transaction(async tx => {
    await tx.update(rfis).set(input.nextStatus === "submitted" ? { status: input.nextStatus, submittedAt: now } : { status: input.nextStatus }).where(and(eq(rfis.id, input.rfiId), eq(rfis.tenantId, input.tenantId), eq(rfis.projectId, input.projectId)));
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "rfis.status_transitioned", entityType: "rfi", entityId: input.rfiId, metadata: JSON.stringify({ projectId: input.projectId, previousStatus: rfi.status, nextStatus: input.nextStatus }) });
  });
  return { id: input.rfiId, previousStatus: rfi.status, status: input.nextStatus };
}

export async function createContractForTenant(input: { userId: number; tenantId: string; projectId: string; code: string; title: string; counterparty: string; contractValue: number; currency: string; startAt?: Date; endAt?: Date }) {
  if (input.endAt && input.startAt && input.endAt < input.startAt) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_CONTRACT_DATES_INVALID" });
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(contracts).values({ id, tenantId: input.tenantId, projectId: input.projectId, code: input.code, title: input.title, counterparty: input.counterparty, contractValue: String(input.contractValue), currency: input.currency, startAt: input.startAt, endAt: input.endAt, status: "draft" });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "project.contract_created", entityType: "contract", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, code: input.code, contractValue: input.contractValue }) });
  });
  return { id };
}

export async function createCommitmentForTenant(input: { userId: number; tenantId: string; projectId: string; contractId?: string; code: string; description: string; amount: number; currency: string; committedAt?: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  if (input.contractId) {
    const [contract] = await db.select({ id: contracts.id }).from(contracts).where(and(eq(contracts.id, input.contractId), eq(contracts.tenantId, input.tenantId), eq(contracts.projectId, input.projectId))).limit(1);
    if (!contract) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_CONTRACT_NOT_FOUND" });
  }
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(commitments).values({ id, tenantId: input.tenantId, projectId: input.projectId, contractId: input.contractId, code: input.code, description: input.description, amount: String(input.amount), currency: input.currency, committedAt: input.committedAt, status: "draft" });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "project.commitment_created", entityType: "commitment", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, contractId: input.contractId ?? null, code: input.code, amount: input.amount }) });
  });
  return { id };
}

export async function createRisk(input: { userId: number; tenantId: string; projectId: string; code: string; title: string; probability: number; severity: number; dueAt?: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PMO", permission: "pmo.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const id = crypto.randomUUID();
  await db.transaction(async tx => { await tx.insert(risks).values({ id, tenantId: input.tenantId, projectId: input.projectId, code: input.code, title: input.title, probability: input.probability, severity: input.severity, dueAt: input.dueAt, status: "open" }); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmo.risk_created", entityType: "risk", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, code: input.code }) }); });
  return { id };
}

export async function createIssue(input: { userId: number; tenantId: string; projectId: string; code: string; title: string; priority: "low" | "medium" | "high" | "critical"; dueAt?: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PMO", permission: "pmo.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const id = crypto.randomUUID();
  await db.transaction(async tx => { await tx.insert(issues).values({ id, tenantId: input.tenantId, projectId: input.projectId, code: input.code, title: input.title, priority: input.priority, dueAt: input.dueAt, status: "open" }); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmo.issue_created", entityType: "issue", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, code: input.code }) }); });
  return { id };
}

export async function createAction(input: { userId: number; tenantId: string; projectId: string; title: string; priority: "low" | "medium" | "high" | "critical"; dueAt?: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PMO", permission: "pmo.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const id = crypto.randomUUID();
  await db.transaction(async tx => { await tx.insert(actions).values({ id, tenantId: input.tenantId, projectId: input.projectId, title: input.title, priority: input.priority, dueAt: input.dueAt, status: "open" }); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmo.action_created", entityType: "action", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, priority: input.priority }) }); });
  return { id };
}

export async function createDecision(input: { userId: number; tenantId: string; projectId: string; problem: string; options: string; recommendation?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "EXECUTIVE", permission: "tenant.manage", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const id = crypto.randomUUID();
  await db.transaction(async tx => { await tx.insert(decisions).values({ id, tenantId: input.tenantId, projectId: input.projectId, problem: input.problem, options: input.options, recommendation: input.recommendation, status: "draft" }); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "executive.decision_created", entityType: "decision", entityId: id, metadata: JSON.stringify({ projectId: input.projectId }) }); });
  return { id };
}

export async function saveEvmSnapshot(input: EvmInput & { userId: number; tenantId: string; projectId: string; periodAt: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new Error("Tenant membership is not available");
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const result = calculateEvm(input);
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(evmSnapshots).values({ id, tenantId: input.tenantId, projectId: input.projectId, periodAt: input.periodAt, pv: String(result.pv), ev: String(result.ev), ac: String(result.ac), bac: String(result.bac), cv: String(result.cv), sv: String(result.sv), cpi: result.cpi === null ? null : String(result.cpi), spi: result.spi === null ? null : String(result.spi), eac: String(result.eac), etc: String(result.etc), vac: String(result.vac), tcpi: result.tcpi === null ? null : String(result.tcpi), eacMethod: result.eacMethod });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "evm.snapshot_created", entityType: "evm_snapshot", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, periodAt: input.periodAt.toISOString() }) });
  });
  return { id, ...result };
}

export async function captureOperationalEvmSnapshot(input: { userId: number; tenantId: string; projectId: string; periodAt: Date; eacMethod: "bac_over_cpi" | "ac_plus_remaining" | "ac_plus_remaining_over_cpi_spi" }): Promise<{ id: string; sources: OperationalEvmSources } & ReturnType<typeof calculateOperationalEvm>> {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new Error("Tenant membership is not available");
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });

  const [activityRows, budgetRows, costRows, progressRows, wbsRows] = await Promise.all([
    db.select({ plannedValue: activities.plannedValue, plannedStartAt: activities.plannedStartAt, plannedFinishAt: activities.plannedFinishAt }).from(activities).where(and(eq(activities.tenantId, input.tenantId), eq(activities.projectId, input.projectId))),
    db.select({ currentAmount: budgetLines.currentAmount }).from(budgetLines).where(and(eq(budgetLines.tenantId, input.tenantId), eq(budgetLines.projectId, input.projectId))),
    db.select({ amount: costEntries.amount, status: costEntries.status, entryType: costEntries.entryType, incurredAt: costEntries.incurredAt }).from(costEntries).where(and(eq(costEntries.tenantId, input.tenantId), eq(costEntries.projectId, input.projectId))),
    db.select({ wbsItemId: progressEntries.wbsItemId, progressPercent: progressEntries.progressPercent, status: progressEntries.status, measuredAt: progressEntries.measuredAt }).from(progressEntries).where(and(eq(progressEntries.tenantId, input.tenantId), eq(progressEntries.projectId, input.projectId))),
    db.select({ id: wbsItems.id, plannedValue: wbsItems.plannedValue }).from(wbsItems).where(and(eq(wbsItems.tenantId, input.tenantId), eq(wbsItems.projectId, input.projectId))),
  ]);
  const result = calculateOperationalEvm({ periodAt: input.periodAt, activities: activityRows, budgets: budgetRows, costs: costRows, progress: progressRows, wbs: wbsRows, eacMethod: input.eacMethod });
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(evmSnapshots).values({ id, tenantId: input.tenantId, projectId: input.projectId, periodAt: input.periodAt, pv: String(result.pv), ev: String(result.ev), ac: String(result.ac), bac: String(result.bac), cv: String(result.cv), sv: String(result.sv), cpi: result.cpi === null ? null : String(result.cpi), spi: result.spi === null ? null : String(result.spi), eac: String(result.eac), etc: String(result.etc), vac: String(result.vac), tcpi: result.tcpi === null ? null : String(result.tcpi), eacMethod: result.eacMethod });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "evm.operational_snapshot_created", entityType: "evm_snapshot", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, periodAt: input.periodAt.toISOString(), source: "operational_records", sources: result.sources }) });
  });
  return { id, ...result };
}

export async function captureProjectHealthSnapshot(input: { userId: number; tenantId: string; projectId: string; periodAt: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const now = new Date();
  const [evmRows, riskRows, actionRows] = await Promise.all([
    db.select({ cpi: evmSnapshots.cpi, spi: evmSnapshots.spi, eac: evmSnapshots.eac, bac: evmSnapshots.bac }).from(evmSnapshots).where(and(eq(evmSnapshots.tenantId, input.tenantId), eq(evmSnapshots.projectId, input.projectId))).orderBy(desc(evmSnapshots.periodAt)).limit(1),
    db.select({ probability: risks.probability, severity: risks.severity, status: risks.status }).from(risks).where(and(eq(risks.tenantId, input.tenantId), eq(risks.projectId, input.projectId))),
    db.select({ dueAt: actions.dueAt, status: actions.status }).from(actions).where(and(eq(actions.tenantId, input.tenantId), eq(actions.projectId, input.projectId))),
  ]);
  const latestEvm = evmRows[0] ?? null;
  const highRiskCount = riskRows.filter(risk => risk.status !== "closed" && risk.probability * risk.severity >= 16).length;
  const overdueActionCount = actionRows.filter(action => action.dueAt !== null && action.dueAt < now && !["completed", "cancelled"].includes(action.status)).length;
  const sources = { latestEvmFound: Boolean(latestEvm), highRiskCount, overdueActionCount, overdueApprovalCount: 0, overdueRfiCount: 0, overdueNcrCount: 0 };
  const result = calculateProjectHealth({ cpi: latestEvm?.cpi === null || !latestEvm ? null : Number(latestEvm.cpi), spi: latestEvm?.spi === null || !latestEvm ? null : Number(latestEvm.spi), eac: latestEvm ? Number(latestEvm.eac) : null, bac: latestEvm ? Number(latestEvm.bac) : null, highRiskCount, overdueActionCount, overdueApprovalCount: 0, overdueRfiCount: 0, overdueNcrCount: 0 });
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(projectHealthSnapshots).values({ id, tenantId: input.tenantId, projectId: input.projectId, periodAt: input.periodAt, overallScore: String(result.score), status: result.status, confidence: result.confidence, drivers: JSON.stringify(sources), exceptions: JSON.stringify(result.exceptions) });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "project.health_snapshot_captured", entityType: "project_health_snapshot", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, periodAt: input.periodAt.toISOString(), sources }) });
  });
  return { id, sources, ...result };
}

export async function createWbsItem(input: { userId: number; tenantId: string; projectId: string; code: string; name: string; parentId?: string; plannedValue?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new Error("Tenant membership is not available");
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  if (input.parentId) {
    await assertWbsItemWithinProject({ tenantId: input.tenantId, projectId: input.projectId, wbsItemId: input.parentId });
  }
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(wbsItems).values({ id, tenantId: input.tenantId, projectId: input.projectId, parentId: input.parentId, code: input.code, name: input.name, plannedValue: String(input.plannedValue ?? 0) });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "project.wbs_created", entityType: "wbs_item", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, code: input.code, parentId: input.parentId ?? null }) });
  });
  return { id };
}

export async function createActivity(input: { userId: number; tenantId: string; projectId: string; wbsItemId?: string; code: string; name: string; plannedValue?: number; plannedStartAt: Date; plannedFinishAt: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new Error("Tenant membership is not available");
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  if (input.wbsItemId) await assertWbsItemWithinProject({ tenantId: input.tenantId, projectId: input.projectId, wbsItemId: input.wbsItemId });
  if (input.plannedFinishAt < input.plannedStartAt) throw new Error("PROJECT_OS_ACTIVITY_SCHEDULE_INVALID");
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(activities).values({ id, tenantId: input.tenantId, projectId: input.projectId, wbsItemId: input.wbsItemId, code: input.code, name: input.name, plannedValue: String(input.plannedValue ?? 0), plannedStartAt: input.plannedStartAt, plannedFinishAt: input.plannedFinishAt, status: "not_started" });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "project.activity_created", entityType: "activity", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, wbsItemId: input.wbsItemId ?? null, code: input.code, plannedStartAt: input.plannedStartAt.toISOString(), plannedFinishAt: input.plannedFinishAt.toISOString() }) });
  });
  return { id };
}

export async function createCostEntry(input: { userId: number; tenantId: string; projectId: string; wbsItemId?: string; amount: number; incurredAt: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new Error("Tenant membership is not available");
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  if (input.wbsItemId) {
    await assertWbsItemWithinProject({ tenantId: input.tenantId, projectId: input.projectId, wbsItemId: input.wbsItemId });
  }
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(costEntries).values({ id, tenantId: input.tenantId, projectId: input.projectId, wbsItemId: input.wbsItemId, amount: String(input.amount), entryType: "actual", status: "posted", incurredAt: input.incurredAt });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "project.cost_entry_created", entityType: "cost_entry", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, wbsItemId: input.wbsItemId ?? null, amount: input.amount, incurredAt: input.incurredAt.toISOString() }) });
  });
  return { id };
}

export async function createProgressEntry(input: { userId: number; tenantId: string; projectId: string; wbsItemId: string; percentComplete: number; reportedAt: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new Error("Tenant membership is not available");
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  await assertWbsItemWithinProject({ tenantId: input.tenantId, projectId: input.projectId, wbsItemId: input.wbsItemId });
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(progressEntries).values({ id, tenantId: input.tenantId, projectId: input.projectId, wbsItemId: input.wbsItemId, progressPercent: String(input.percentComplete), measuredAt: input.reportedAt, status: "submitted" });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "project.progress_entry_created", entityType: "progress_entry", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, wbsItemId: input.wbsItemId, percentComplete: input.percentComplete, reportedAt: input.reportedAt.toISOString() }) });
  });
  return { id };
}

export async function createBudgetLine(input: { userId: number; tenantId: string; projectId: string; wbsItemId?: string; costCode: string; originalAmount: number; currentAmount: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new Error("Tenant membership is not available");
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  if (input.wbsItemId) {
    await assertWbsItemWithinProject({ tenantId: input.tenantId, projectId: input.projectId, wbsItemId: input.wbsItemId });
  }
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(budgetLines).values({ id, tenantId: input.tenantId, projectId: input.projectId, wbsItemId: input.wbsItemId, costCode: input.costCode, originalAmount: String(input.originalAmount), currentAmount: String(input.currentAmount) });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "project.budget_line_created", entityType: "budget_line", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, wbsItemId: input.wbsItemId ?? null, costCode: input.costCode, originalAmount: input.originalAmount, currentAmount: input.currentAmount }) });
  });
  return { id };
}
