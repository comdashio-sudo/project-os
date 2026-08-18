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
  claims,
  commitments,
  contracts,
  memberships,
  membershipInvitations,
  membershipRoles,
  changeRequests,
  internalNotifications,
  hseObservations,
  ncrs,
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
  projectResources,
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
import { calculateOperationalCashFlow } from "./domain/cashFlow";
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

  const [projectRows, wbs, activitiesForProject, budgets, costs, progress, latestEvm, latestHealth, commitmentRows] = await Promise.all([
    db.select({ id: projects.id, code: projects.code, name: projects.name, currency: projects.currency, currentBudget: projects.currentBudget, actualCost: projects.actualCost, forecastCost: projects.forecastCost }).from(projects).where(and(eq(projects.id, input.projectId), eq(projects.tenantId, input.tenantId))).limit(1),
    db.select({ id: wbsItems.id, code: wbsItems.code, name: wbsItems.name, parentId: wbsItems.parentId, plannedValue: wbsItems.plannedValue, earnedValue: wbsItems.earnedValue, actualCost: wbsItems.actualCost, progressPercent: wbsItems.progressPercent }).from(wbsItems).where(and(eq(wbsItems.tenantId, input.tenantId), eq(wbsItems.projectId, input.projectId))),
    db.select({ id: activities.id, wbsItemId: activities.wbsItemId, code: activities.code, name: activities.name, status: activities.status, plannedValue: activities.plannedValue, earnedValue: activities.earnedValue, plannedStartAt: activities.plannedStartAt, plannedFinishAt: activities.plannedFinishAt }).from(activities).where(and(eq(activities.tenantId, input.tenantId), eq(activities.projectId, input.projectId))),
    db.select({ id: budgetLines.id, wbsItemId: budgetLines.wbsItemId, costCode: budgetLines.costCode, originalAmount: budgetLines.originalAmount, currentAmount: budgetLines.currentAmount }).from(budgetLines).where(and(eq(budgetLines.tenantId, input.tenantId), eq(budgetLines.projectId, input.projectId))),
    db.select({ id: costEntries.id, wbsItemId: costEntries.wbsItemId, amount: costEntries.amount, entryType: costEntries.entryType, status: costEntries.status, incurredAt: costEntries.incurredAt }).from(costEntries).where(and(eq(costEntries.tenantId, input.tenantId), eq(costEntries.projectId, input.projectId))).orderBy(desc(costEntries.incurredAt)),
    db.select({ id: progressEntries.id, wbsItemId: progressEntries.wbsItemId, progressPercent: progressEntries.progressPercent, status: progressEntries.status, measuredAt: progressEntries.measuredAt }).from(progressEntries).where(and(eq(progressEntries.tenantId, input.tenantId), eq(progressEntries.projectId, input.projectId))).orderBy(desc(progressEntries.measuredAt)),
    db.select({ id: evmSnapshots.id, periodAt: evmSnapshots.periodAt, pv: evmSnapshots.pv, ev: evmSnapshots.ev, ac: evmSnapshots.ac, cpi: evmSnapshots.cpi, spi: evmSnapshots.spi, eac: evmSnapshots.eac, etc: evmSnapshots.etc, vac: evmSnapshots.vac }).from(evmSnapshots).where(and(eq(evmSnapshots.tenantId, input.tenantId), eq(evmSnapshots.projectId, input.projectId))).orderBy(desc(evmSnapshots.periodAt)).limit(1),
    db.select({ id: projectHealthSnapshots.id, periodAt: projectHealthSnapshots.periodAt, overallScore: projectHealthSnapshots.overallScore, status: projectHealthSnapshots.status, confidence: projectHealthSnapshots.confidence, drivers: projectHealthSnapshots.drivers, exceptions: projectHealthSnapshots.exceptions }).from(projectHealthSnapshots).where(and(eq(projectHealthSnapshots.tenantId, input.tenantId), eq(projectHealthSnapshots.projectId, input.projectId))).orderBy(desc(projectHealthSnapshots.periodAt)).limit(1),
    db.select({ id: commitments.id, amount: commitments.amount, status: commitments.status }).from(commitments).where(and(eq(commitments.tenantId, input.tenantId), eq(commitments.projectId, input.projectId))),
  ]);

  const cashFlow = calculateOperationalCashFlow({ budgetAmounts: budgets.map(row => Number(row.currentAmount)), costEntries: costs.map(row => ({ amount: Number(row.amount), status: row.status })), commitments: commitmentRows.map(row => ({ amount: Number(row.amount), status: row.status })) });
  return { project: projectRows[0]!, wbs, activities: activitiesForProject, budgets, costs, progress, latestEvm: latestEvm[0] ?? null, latestHealth: latestHealth[0] ?? null, cashFlow };
}

export async function getExecutiveDashboard(input: { userId: number; tenantId: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "EXECUTIVE", permission: "executive.read" });

  const [projectRows, healthRows, decisionRows, budgetRows, costRows, commitmentRows, portfolioRows] = await Promise.all([
    db.select({ id: projects.id, portfolioId: projects.portfolioId, code: projects.code, name: projects.name, status: projects.status, currentBudget: projects.currentBudget, actualCost: projects.actualCost, forecastCost: projects.forecastCost, forecastFinishAt: projects.forecastFinishAt }).from(projects).where(eq(projects.tenantId, input.tenantId)),
    db.select({ projectId: projectHealthSnapshots.projectId, status: projectHealthSnapshots.status, overallScore: projectHealthSnapshots.overallScore, confidence: projectHealthSnapshots.confidence, periodAt: projectHealthSnapshots.periodAt }).from(projectHealthSnapshots).where(eq(projectHealthSnapshots.tenantId, input.tenantId)).orderBy(desc(projectHealthSnapshots.periodAt)),
    db.select({ id: decisions.id, projectId: decisions.projectId, problem: decisions.problem, status: decisions.status, costImpact: decisions.costImpact, scheduleImpactDays: decisions.scheduleImpactDays, createdAt: decisions.createdAt }).from(decisions).where(eq(decisions.tenantId, input.tenantId)).orderBy(desc(decisions.createdAt)),
    db.select({ projectId: budgetLines.projectId, amount: budgetLines.currentAmount }).from(budgetLines).where(eq(budgetLines.tenantId, input.tenantId)),
    db.select({ projectId: costEntries.projectId, amount: costEntries.amount, status: costEntries.status }).from(costEntries).where(eq(costEntries.tenantId, input.tenantId)),
    db.select({ projectId: commitments.projectId, amount: commitments.amount, status: commitments.status }).from(commitments).where(eq(commitments.tenantId, input.tenantId)),
    db.select({ id: portfolios.id, code: portfolios.code, name: portfolios.name }).from(portfolios).where(eq(portfolios.tenantId, input.tenantId)),
  ]);

  const latestHealthByProject = new Map<string, (typeof healthRows)[number]>();
  healthRows.forEach(item => { if (!latestHealthByProject.has(item.projectId)) latestHealthByProject.set(item.projectId, item); });
  const projectsWithHealth = projectRows.map(project => ({ ...project, health: latestHealthByProject.get(project.id) ?? null }));
  const totals = projectRows.reduce((accumulator, project) => ({ budget: accumulator.budget + Number(project.currentBudget), actual: accumulator.actual + Number(project.actualCost), forecast: accumulator.forecast + Number(project.forecastCost) }), { budget: 0, actual: 0, forecast: 0 });
  const budgetsByProject = new Map<string, number[]>(); budgetRows.forEach(item => budgetsByProject.set(item.projectId, [...(budgetsByProject.get(item.projectId) ?? []), Number(item.amount)]));
  const costsByProject = new Map<string, { amount: number; status: "draft" | "posted" | "void" }[]>(); costRows.forEach(item => costsByProject.set(item.projectId, [...(costsByProject.get(item.projectId) ?? []), { amount: Number(item.amount), status: item.status }]));
  const commitmentsByProject = new Map<string, { amount: number; status: string }[]>(); commitmentRows.forEach(item => commitmentsByProject.set(item.projectId, [...(commitmentsByProject.get(item.projectId) ?? []), { amount: Number(item.amount), status: item.status }]));
  const cashFlowByProject = projectRows.map(project => ({ id: project.id, code: project.code, name: project.name, ...calculateOperationalCashFlow({ budgetAmounts: budgetsByProject.get(project.id) ?? [], costEntries: costsByProject.get(project.id) ?? [], commitments: commitmentsByProject.get(project.id) ?? [] }) }));
  const cashFlow = cashFlowByProject.reduce((accumulator, project) => ({ plannedBudget: accumulator.plannedBudget + project.plannedBudget, actualCost: accumulator.actualCost + project.actualCost, committedAmount: accumulator.committedAmount + project.committedAmount, totalExposure: accumulator.totalExposure + project.totalExposure, remainingBudget: accumulator.remainingBudget + project.remainingBudget }), { plannedBudget: 0, actualCost: 0, committedAmount: 0, totalExposure: 0, remainingBudget: 0 });
  const portfolioById = new Map(portfolioRows.map(item => [item.id, item]));
  const cashFlowPortfolioAccumulator = new Map<string | null, { portfolioId: string | null; code: string | null; name: string | null; projectCount: number; plannedBudget: number; actualCost: number; committedAmount: number; totalExposure: number; remainingBudget: number }>();
  projectRows.forEach(project => { const source = cashFlowByProject.find(item => item.id === project.id)!; const previous = cashFlowPortfolioAccumulator.get(project.portfolioId) ?? { portfolioId: project.portfolioId, code: project.portfolioId ? portfolioById.get(project.portfolioId)?.code ?? null : null, name: project.portfolioId ? portfolioById.get(project.portfolioId)?.name ?? null : null, projectCount: 0, plannedBudget: 0, actualCost: 0, committedAmount: 0, totalExposure: 0, remainingBudget: 0 }; cashFlowPortfolioAccumulator.set(project.portfolioId, { ...previous, projectCount: previous.projectCount + 1, plannedBudget: previous.plannedBudget + source.plannedBudget, actualCost: previous.actualCost + source.actualCost, committedAmount: previous.committedAmount + source.committedAmount, totalExposure: previous.totalExposure + source.totalExposure, remainingBudget: previous.remainingBudget + source.remainingBudget }); });
  return { totals, projects: projectsWithHealth, decisions: decisionRows.filter(item => !["implemented", "rejected"].includes(item.status)), cashFlow, cashFlowByProject, cashFlowByPortfolio: Array.from(cashFlowPortfolioAccumulator.values()) };
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
    db.select({ id: actions.id, projectId: actions.projectId, title: actions.title, priority: actions.priority, escalationStatus: actions.escalationStatus, status: actions.status, dueAt: actions.dueAt }).from(actions).where(eq(actions.tenantId, input.tenantId)),
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

const ncrStatusTransitions: Record<string, readonly string[]> = { open: ["under_investigation", "cancelled"], under_investigation: ["corrective_action", "cancelled"], corrective_action: ["verification", "cancelled"], verification: ["closed", "corrective_action"], closed: [], cancelled: [] };

export async function getNcrsForTenant(input: { userId: number; tenantId: string; projectId: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.read", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  return db.select({ id: ncrs.id, ncrNumber: ncrs.ncrNumber, title: ncrs.title, description: ncrs.description, status: ncrs.status, dueAt: ncrs.dueAt, createdAt: ncrs.createdAt }).from(ncrs).where(and(eq(ncrs.tenantId, input.tenantId), eq(ncrs.projectId, input.projectId))).orderBy(desc(ncrs.createdAt));
}

export async function createNcrForTenant(input: { userId: number; tenantId: string; projectId: string; ncrNumber: string; title: string; description: string; dueAt?: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(ncrs).values({ id, tenantId: input.tenantId, projectId: input.projectId, ncrNumber: input.ncrNumber, title: input.title, description: input.description, dueAt: input.dueAt, createdByUserId: input.userId });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "ncrs.created", entityType: "ncr", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, ncrNumber: input.ncrNumber }) });
  });
  return { id, status: "open" as const };
}

export async function transitionNcrStatus(input: { userId: number; tenantId: string; projectId: string; ncrId: string; nextStatus: "open" | "under_investigation" | "corrective_action" | "verification" | "closed" | "cancelled" }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const [ncr] = await db.select({ id: ncrs.id, status: ncrs.status }).from(ncrs).where(and(eq(ncrs.id, input.ncrId), eq(ncrs.tenantId, input.tenantId), eq(ncrs.projectId, input.projectId))).limit(1);
  if (!ncr) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_NCR_NOT_FOUND" });
  if (!ncrStatusTransitions[ncr.status].includes(input.nextStatus)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_NCR_TRANSITION_INVALID" });
  await db.transaction(async tx => {
    await tx.update(ncrs).set({ status: input.nextStatus }).where(and(eq(ncrs.id, input.ncrId), eq(ncrs.tenantId, input.tenantId), eq(ncrs.projectId, input.projectId)));
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "ncrs.status_transitioned", entityType: "ncr", entityId: input.ncrId, metadata: JSON.stringify({ projectId: input.projectId, previousStatus: ncr.status, nextStatus: input.nextStatus }) });
  });
  return { id: input.ncrId, previousStatus: ncr.status, status: input.nextStatus };
}

const hseStatusTransitions: Record<string, readonly string[]> = { open: ["assigned", "cancelled"], assigned: ["remediation", "cancelled"], remediation: ["verification", "cancelled"], verification: ["closed", "remediation"], closed: [], cancelled: [] };

const changeRequestTransitions: Record<string, readonly string[]> = { draft: ["submitted", "cancelled"], submitted: ["under_review", "cancelled"], under_review: ["approved", "rejected", "cancelled"], approved: [], rejected: [], cancelled: [] };

export async function getChangeRequestsForTenant(input: { userId: number; tenantId: string; projectId: string }) {
  const db = await getDb(); if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.read", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  return db.select({ id: changeRequests.id, changeNumber: changeRequests.changeNumber, title: changeRequests.title, description: changeRequests.description, impactScheduleDays: changeRequests.impactScheduleDays, impactCost: changeRequests.impactCost, currency: changeRequests.currency, status: changeRequests.status, createdAt: changeRequests.createdAt }).from(changeRequests).where(and(eq(changeRequests.tenantId, input.tenantId), eq(changeRequests.projectId, input.projectId))).orderBy(desc(changeRequests.createdAt));
}

export async function createChangeRequestForTenant(input: { userId: number; tenantId: string; projectId: string; changeNumber: string; title: string; description: string; impactScheduleDays: number; impactCost: number; currency: string }) {
  const db = await getDb(); if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const id = crypto.randomUUID();
  await db.transaction(async tx => { await tx.insert(changeRequests).values({ id, tenantId: input.tenantId, projectId: input.projectId, changeNumber: input.changeNumber, title: input.title, description: input.description, impactScheduleDays: input.impactScheduleDays, impactCost: String(input.impactCost), currency: input.currency, createdByUserId: input.userId }); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "project.change_request_created", entityType: "change_request", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, changeNumber: input.changeNumber, impactScheduleDays: input.impactScheduleDays, impactCost: input.impactCost, currency: input.currency }) }); });
  return { id, status: "draft" as const };
}

export async function transitionChangeRequestStatus(input: { userId: number; tenantId: string; projectId: string; changeRequestId: string; nextStatus: "draft" | "submitted" | "under_review" | "approved" | "rejected" | "cancelled" }) {
  const db = await getDb(); if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const [request] = await db.select({ id: changeRequests.id, status: changeRequests.status }).from(changeRequests).where(and(eq(changeRequests.id, input.changeRequestId), eq(changeRequests.tenantId, input.tenantId), eq(changeRequests.projectId, input.projectId))).limit(1);
  if (!request) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_CHANGE_REQUEST_NOT_FOUND" });
  if (!changeRequestTransitions[request.status].includes(input.nextStatus)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_CHANGE_REQUEST_TRANSITION_INVALID" });
  const isReviewOutcome = ["approved", "rejected"].includes(input.nextStatus);
  await db.transaction(async tx => { await tx.update(changeRequests).set({ status: input.nextStatus, submittedAt: input.nextStatus === "submitted" ? new Date() : undefined, reviewedByUserId: isReviewOutcome ? input.userId : undefined, reviewedAt: isReviewOutcome ? new Date() : undefined }).where(and(eq(changeRequests.id, input.changeRequestId), eq(changeRequests.tenantId, input.tenantId), eq(changeRequests.projectId, input.projectId))); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "project.change_request_status_transitioned", entityType: "change_request", entityId: input.changeRequestId, metadata: JSON.stringify({ projectId: input.projectId, previousStatus: request.status, nextStatus: input.nextStatus }) }); });
  return { id: input.changeRequestId, previousStatus: request.status, status: input.nextStatus };
}

export async function getHseObservationsForTenant(input: { userId: number; tenantId: string; projectId: string }) {
  const db = await getDb(); if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.read", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  return db.select({ id: hseObservations.id, observationNumber: hseObservations.observationNumber, title: hseObservations.title, description: hseObservations.description, category: hseObservations.category, severity: hseObservations.severity, status: hseObservations.status, dueAt: hseObservations.dueAt, createdAt: hseObservations.createdAt }).from(hseObservations).where(and(eq(hseObservations.tenantId, input.tenantId), eq(hseObservations.projectId, input.projectId))).orderBy(desc(hseObservations.createdAt));
}

export async function createHseObservationForTenant(input: { userId: number; tenantId: string; projectId: string; observationNumber: string; title: string; description: string; category: "safety" | "health" | "environment"; severity: "low" | "medium" | "high" | "critical"; dueAt?: Date }) {
  const db = await getDb(); if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const id = crypto.randomUUID();
  await db.transaction(async tx => { await tx.insert(hseObservations).values({ id, tenantId: input.tenantId, projectId: input.projectId, observationNumber: input.observationNumber, title: input.title, description: input.description, category: input.category, severity: input.severity, dueAt: input.dueAt, createdByUserId: input.userId }); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "hse.observation_created", entityType: "hse_observation", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, observationNumber: input.observationNumber, category: input.category, severity: input.severity }) }); });
  return { id, status: "open" as const };
}

export async function transitionHseObservationStatus(input: { userId: number; tenantId: string; projectId: string; observationId: string; nextStatus: "open" | "assigned" | "remediation" | "verification" | "closed" | "cancelled" }) {
  const db = await getDb(); if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const [observation] = await db.select({ id: hseObservations.id, status: hseObservations.status }).from(hseObservations).where(and(eq(hseObservations.id, input.observationId), eq(hseObservations.tenantId, input.tenantId), eq(hseObservations.projectId, input.projectId))).limit(1);
  if (!observation) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_HSE_OBSERVATION_NOT_FOUND" });
  if (!hseStatusTransitions[observation.status].includes(input.nextStatus)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_HSE_TRANSITION_INVALID" });
  await db.transaction(async tx => { await tx.update(hseObservations).set({ status: input.nextStatus }).where(and(eq(hseObservations.id, input.observationId), eq(hseObservations.tenantId, input.tenantId), eq(hseObservations.projectId, input.projectId))); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "hse.observation_status_transitioned", entityType: "hse_observation", entityId: input.observationId, metadata: JSON.stringify({ projectId: input.projectId, previousStatus: observation.status, nextStatus: input.nextStatus }) }); });
  return { id: input.observationId, previousStatus: observation.status, status: input.nextStatus };
}

export async function getProjectResourcesForTenant(input: { userId: number; tenantId: string; projectId: string }) {
  const db = await getDb(); if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.read", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  return db.select({ id: projectResources.id, resourceCode: projectResources.resourceCode, name: projectResources.name, resourceType: projectResources.resourceType, plannedUnits: projectResources.plannedUnits, allocatedUnits: projectResources.allocatedUnits, unitCost: projectResources.unitCost, currency: projectResources.currency, createdAt: projectResources.createdAt }).from(projectResources).where(and(eq(projectResources.tenantId, input.tenantId), eq(projectResources.projectId, input.projectId))).orderBy(desc(projectResources.createdAt));
}

export async function createProjectResourceForTenant(input: { userId: number; tenantId: string; projectId: string; resourceCode: string; name: string; resourceType: "labor" | "equipment" | "material" | "service"; plannedUnits: number; allocatedUnits: number; unitCost: number; currency: string }) {
  if (input.allocatedUnits > input.plannedUnits) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_RESOURCE_ALLOCATION_EXCEEDS_PLAN" });
  const db = await getDb(); if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const id = crypto.randomUUID();
  await db.transaction(async tx => { await tx.insert(projectResources).values({ id, tenantId: input.tenantId, projectId: input.projectId, resourceCode: input.resourceCode, name: input.name, resourceType: input.resourceType, plannedUnits: String(input.plannedUnits), allocatedUnits: String(input.allocatedUnits), unitCost: String(input.unitCost), currency: input.currency, createdByUserId: input.userId }); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "project.resource_created", entityType: "project_resource", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, resourceCode: input.resourceCode, resourceType: input.resourceType, plannedUnits: input.plannedUnits, allocatedUnits: input.allocatedUnits }) }); });
  return { id };
}

export async function updateProjectResourceAllocationForTenant(input: { userId: number; tenantId: string; projectId: string; resourceId: string; allocatedUnits: number }) {
  const db = await getDb(); if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const [resource] = await db.select({ id: projectResources.id, plannedUnits: projectResources.plannedUnits, allocatedUnits: projectResources.allocatedUnits }).from(projectResources).where(and(eq(projectResources.id, input.resourceId), eq(projectResources.tenantId, input.tenantId), eq(projectResources.projectId, input.projectId))).limit(1);
  if (!resource) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_RESOURCE_NOT_FOUND" });
  if (input.allocatedUnits > Number(resource.plannedUnits)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_RESOURCE_ALLOCATION_EXCEEDS_PLAN" });
  await db.transaction(async tx => { await tx.update(projectResources).set({ allocatedUnits: String(input.allocatedUnits) }).where(and(eq(projectResources.id, input.resourceId), eq(projectResources.tenantId, input.tenantId), eq(projectResources.projectId, input.projectId))); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "project.resource_allocation_updated", entityType: "project_resource", entityId: input.resourceId, metadata: JSON.stringify({ projectId: input.projectId, previousAllocatedUnits: Number(resource.allocatedUnits), allocatedUnits: input.allocatedUnits }) }); });
  return { id: input.resourceId, previousAllocatedUnits: Number(resource.allocatedUnits), allocatedUnits: input.allocatedUnits };
}

const claimStatusTransitions: Record<string, readonly string[]> = { draft: ["submitted", "withdrawn"], submitted: ["under_review", "withdrawn"], under_review: ["approved", "rejected", "withdrawn"], approved: [], rejected: [], withdrawn: [] };

export async function getClaimsForTenant(input: { userId: number; tenantId: string; projectId: string }) {
  const db = await getDb(); if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.read", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  return db.select({ id: claims.id, contractId: claims.contractId, claimNumber: claims.claimNumber, title: claims.title, description: claims.description, claimedAmount: claims.claimedAmount, approvedAmount: claims.approvedAmount, currency: claims.currency, status: claims.status, submittedAt: claims.submittedAt, resolvedAt: claims.resolvedAt, createdAt: claims.createdAt }).from(claims).where(and(eq(claims.tenantId, input.tenantId), eq(claims.projectId, input.projectId))).orderBy(desc(claims.createdAt));
}

export async function createClaimForTenant(input: { userId: number; tenantId: string; projectId: string; contractId?: string; claimNumber: string; title: string; description: string; claimedAmount: number; currency: string }) {
  const db = await getDb(); if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  if (input.contractId) { const [contract] = await db.select({ id: contracts.id }).from(contracts).where(and(eq(contracts.id, input.contractId), eq(contracts.tenantId, input.tenantId), eq(contracts.projectId, input.projectId))).limit(1); if (!contract) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_CONTRACT_NOT_FOUND" }); }
  const id = crypto.randomUUID();
  await db.transaction(async tx => { await tx.insert(claims).values({ id, tenantId: input.tenantId, projectId: input.projectId, contractId: input.contractId, claimNumber: input.claimNumber, title: input.title, description: input.description, claimedAmount: String(input.claimedAmount), currency: input.currency, createdByUserId: input.userId }); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "project.claim_created", entityType: "claim", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, claimNumber: input.claimNumber, claimedAmount: input.claimedAmount, contractId: input.contractId ?? null }) }); });
  return { id, status: "draft" as const };
}

export async function transitionClaimStatus(input: { userId: number; tenantId: string; projectId: string; claimId: string; nextStatus: "submitted" | "under_review" | "approved" | "rejected" | "withdrawn"; approvedAmount?: number }) {
  const db = await getDb(); if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const [claim] = await db.select({ id: claims.id, status: claims.status, claimedAmount: claims.claimedAmount }).from(claims).where(and(eq(claims.id, input.claimId), eq(claims.tenantId, input.tenantId), eq(claims.projectId, input.projectId))).limit(1);
  if (!claim) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_CLAIM_NOT_FOUND" });
  if (!claimStatusTransitions[claim.status].includes(input.nextStatus)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_CLAIM_TRANSITION_INVALID" });
  if (input.nextStatus === "approved" && input.approvedAmount === undefined) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_CLAIM_APPROVAL_AMOUNT_REQUIRED" });
  if (input.nextStatus === "approved" && input.approvedAmount! > Number(claim.claimedAmount)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_CLAIM_APPROVAL_EXCEEDS_CLAIM" });
  const now = new Date(); const statusFields = input.nextStatus === "submitted" ? { submittedAt: now } : ["approved", "rejected", "withdrawn"].includes(input.nextStatus) ? { resolvedAt: now } : {};
  await db.transaction(async tx => { await tx.update(claims).set({ status: input.nextStatus, ...(input.nextStatus === "approved" ? { approvedAmount: String(input.approvedAmount) } : {}), ...statusFields }).where(and(eq(claims.id, input.claimId), eq(claims.tenantId, input.tenantId), eq(claims.projectId, input.projectId))); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "project.claim_status_transitioned", entityType: "claim", entityId: input.claimId, metadata: JSON.stringify({ projectId: input.projectId, previousStatus: claim.status, nextStatus: input.nextStatus, approvedAmount: input.nextStatus === "approved" ? input.approvedAmount : null }) }); });
  return { id: input.claimId, previousStatus: claim.status, status: input.nextStatus };
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

const escalationTransitions = {
  none: ["pending"],
  pending: ["escalated"],
  escalated: [],
} as const;

function canTransitionEscalation(current: "none" | "pending" | "escalated", next: "pending" | "escalated") {
  return escalationTransitions[current].includes(next as never);
}

export async function transitionIssueEscalation(input: { userId: number; tenantId: string; projectId: string; issueId: string; nextStatus: "pending" | "escalated" }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PMO", permission: "pmo.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const [issue] = await db.select({ id: issues.id, priority: issues.priority, status: issues.status, escalationStatus: issues.escalationStatus }).from(issues).where(and(eq(issues.id, input.issueId), eq(issues.tenantId, input.tenantId), eq(issues.projectId, input.projectId))).limit(1);
  if (!issue) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_ISSUE_NOT_FOUND" });
  if (!canTransitionEscalation(issue.escalationStatus, input.nextStatus)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_ESCALATION_TRANSITION_INVALID" });
  if (issue.priority !== "critical" || ["resolved", "closed"].includes(issue.status)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_ESCALATION_NOT_ELIGIBLE" });
  await db.transaction(async tx => {
    await tx.update(issues).set({ escalationStatus: input.nextStatus }).where(and(eq(issues.id, input.issueId), eq(issues.tenantId, input.tenantId), eq(issues.projectId, input.projectId)));
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmo.issue_escalation_transitioned", entityType: "issue", entityId: input.issueId, metadata: JSON.stringify({ projectId: input.projectId, previousStatus: issue.escalationStatus, nextStatus: input.nextStatus }) });
  });
  return { id: input.issueId, previousStatus: issue.escalationStatus, status: input.nextStatus };
}

export async function transitionActionEscalation(input: { userId: number; tenantId: string; projectId: string; actionId: string; nextStatus: "pending" | "escalated" }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PMO", permission: "pmo.write", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  const [action] = await db.select({ id: actions.id, dueAt: actions.dueAt, status: actions.status, escalationStatus: actions.escalationStatus }).from(actions).where(and(eq(actions.id, input.actionId), eq(actions.tenantId, input.tenantId), eq(actions.projectId, input.projectId))).limit(1);
  if (!action) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_ACTION_NOT_FOUND" });
  if (!canTransitionEscalation(action.escalationStatus, input.nextStatus)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_ESCALATION_TRANSITION_INVALID" });
  const isOverdue = action.dueAt !== null && action.dueAt < new Date() && !["completed", "cancelled"].includes(action.status);
  if (!isOverdue) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_ESCALATION_NOT_ELIGIBLE" });
  await db.transaction(async tx => {
    await tx.update(actions).set({ escalationStatus: input.nextStatus }).where(and(eq(actions.id, input.actionId), eq(actions.tenantId, input.tenantId), eq(actions.projectId, input.projectId)));
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmo.action_escalation_transitioned", entityType: "action", entityId: input.actionId, metadata: JSON.stringify({ projectId: input.projectId, previousStatus: action.escalationStatus, nextStatus: input.nextStatus }) });
  });
  return { id: input.actionId, previousStatus: action.escalationStatus, status: input.nextStatus };
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
  const [evmRows, riskRows, actionRows, rfiRows, ncrRows, hseRows] = await Promise.all([
    db.select({ cpi: evmSnapshots.cpi, spi: evmSnapshots.spi, eac: evmSnapshots.eac, bac: evmSnapshots.bac }).from(evmSnapshots).where(and(eq(evmSnapshots.tenantId, input.tenantId), eq(evmSnapshots.projectId, input.projectId))).orderBy(desc(evmSnapshots.periodAt)).limit(1),
    db.select({ probability: risks.probability, severity: risks.severity, status: risks.status }).from(risks).where(and(eq(risks.tenantId, input.tenantId), eq(risks.projectId, input.projectId))),
    db.select({ dueAt: actions.dueAt, status: actions.status }).from(actions).where(and(eq(actions.tenantId, input.tenantId), eq(actions.projectId, input.projectId))),
    db.select({ rfiNumber: rfis.rfiNumber, dueAt: rfis.dueAt, status: rfis.status }).from(rfis).where(and(eq(rfis.tenantId, input.tenantId), eq(rfis.projectId, input.projectId))),
    db.select({ ncrNumber: ncrs.ncrNumber, dueAt: ncrs.dueAt, status: ncrs.status }).from(ncrs).where(and(eq(ncrs.tenantId, input.tenantId), eq(ncrs.projectId, input.projectId))),
    db.select({ ncrNumber: hseObservations.observationNumber, dueAt: hseObservations.dueAt, status: hseObservations.status }).from(hseObservations).where(and(eq(hseObservations.tenantId, input.tenantId), eq(hseObservations.projectId, input.projectId))),
  ]);
  const latestEvm = evmRows[0] ?? null;
  const highRiskCount = riskRows.filter(risk => risk.status !== "closed" && risk.probability * risk.severity >= 16).length;
  const overdueActionCount = actionRows.filter(action => action.dueAt !== null && action.dueAt < now && !["completed", "cancelled"].includes(action.status)).length;
  const overdueRfiCount = rfiRows.filter(rfi => rfi.dueAt !== null && rfi.dueAt < now && !["closed", "cancelled"].includes(rfi.status)).length;
  const overdueNcrCount = ncrRows.filter(ncr => ncr.dueAt !== null && ncr.dueAt < now && !["closed", "cancelled"].includes(ncr.status)).length;
  const overdueHseCount = hseRows.filter(observation => observation.dueAt !== null && observation.dueAt < now && !["closed", "cancelled"].includes(observation.status)).length;
  const sources = { latestEvmFound: Boolean(latestEvm), highRiskCount, overdueActionCount, overdueApprovalCount: 0, overdueRfiCount, overdueNcrCount, overdueHseCount };
  const result = calculateProjectHealth({ cpi: latestEvm?.cpi === null || !latestEvm ? null : Number(latestEvm.cpi), spi: latestEvm?.spi === null || !latestEvm ? null : Number(latestEvm.spi), eac: latestEvm ? Number(latestEvm.eac) : null, bac: latestEvm ? Number(latestEvm.bac) : null, highRiskCount, overdueActionCount, overdueApprovalCount: 0, overdueRfiCount, overdueNcrCount, overdueHseCount });
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(projectHealthSnapshots).values({ id, tenantId: input.tenantId, projectId: input.projectId, periodAt: input.periodAt, overallScore: String(result.score), status: result.status, confidence: result.confidence, drivers: JSON.stringify(sources), exceptions: JSON.stringify(result.exceptions) });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "project.health_snapshot_captured", entityType: "project_health_snapshot", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, periodAt: input.periodAt.toISOString(), sources }) });
    if (result.exceptions.length) await tx.insert(internalNotifications).values({ id: crypto.randomUUID(), tenantId: input.tenantId, recipientUserId: input.userId, projectId: input.projectId, notificationCode: "PROJECT_HEALTH_EXCEPTION", entityType: "project_health_snapshot", entityId: id, payload: JSON.stringify({ exceptionCodes: result.exceptions.map(exception => exception.code), status: result.status, score: result.score }) });
  });
  return { id, sources, ...result };
}

export async function getInternalNotificationsForTenant(input: { userId: number; tenantId: string }) {
  const db = await getDb(); if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  return db.select({ id: internalNotifications.id, notificationCode: internalNotifications.notificationCode, projectId: internalNotifications.projectId, entityType: internalNotifications.entityType, entityId: internalNotifications.entityId, payload: internalNotifications.payload, acknowledgedAt: internalNotifications.acknowledgedAt, createdAt: internalNotifications.createdAt }).from(internalNotifications).where(and(eq(internalNotifications.tenantId, input.tenantId), eq(internalNotifications.recipientUserId, input.userId))).orderBy(desc(internalNotifications.createdAt));
}

export async function acknowledgeInternalNotification(input: { userId: number; tenantId: string; notificationId: string }) {
  const db = await getDb(); if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  const [notification] = await db.select({ id: internalNotifications.id, acknowledgedAt: internalNotifications.acknowledgedAt }).from(internalNotifications).where(and(eq(internalNotifications.id, input.notificationId), eq(internalNotifications.tenantId, input.tenantId), eq(internalNotifications.recipientUserId, input.userId))).limit(1);
  if (!notification) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_NOTIFICATION_NOT_FOUND" });
  if (notification.acknowledgedAt) return { id: notification.id, acknowledgedAt: notification.acknowledgedAt };
  const acknowledgedAt = new Date();
  await db.transaction(async tx => { await tx.update(internalNotifications).set({ acknowledgedAt }).where(and(eq(internalNotifications.id, input.notificationId), eq(internalNotifications.tenantId, input.tenantId), eq(internalNotifications.recipientUserId, input.userId))); await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "internal_notification_acknowledged", entityType: "internal_notification", entityId: input.notificationId, metadata: JSON.stringify({ acknowledgedAt: acknowledgedAt.toISOString() }) }); });
  return { id: notification.id, acknowledgedAt };
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
