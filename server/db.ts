import { and, desc, eq, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { TRPCError } from "@trpc/server";
import {
  type InsertUser,
  type ProductCode,
  type SubscriptionPackageCode,
  auditLogs,
  companies,
  memberships,
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
import { ENV } from "./_core/env";

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

export async function getTenantAdministration(input: { userId: number; tenantId: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  await assertTenantManager(input.userId, input.tenantId);
  const [memberRows, roleRows, permissionRows] = await Promise.all([
    db.select({ membershipId: memberships.id, userId: users.id, name: users.name, email: users.email, status: memberships.status, joinedAt: memberships.joinedAt }).from(memberships).innerJoin(users, eq(memberships.userId, users.id)).where(eq(memberships.tenantId, input.tenantId)),
    db.select({ id: roles.id, code: roles.code, name: roles.name, productCode: roles.productCode, systemManaged: roles.systemManaged }).from(roles).where(eq(roles.tenantId, input.tenantId)),
    db.select({ code: permissions.code, name: permissions.name, productCode: permissions.productCode }).from(permissions),
  ]);
  const membershipAssignments = await Promise.all(memberRows.map(async member => ({
    membershipId: member.membershipId,
    roles: await db.select({ roleId: membershipRoles.roleId, roleCode: roles.code, roleName: roles.name, scopeType: membershipRoles.scopeType, scopeId: membershipRoles.scopeId }).from(membershipRoles).innerJoin(roles, eq(membershipRoles.roleId, roles.id)).where(eq(membershipRoles.membershipId, member.membershipId)),
  })));
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

export async function assignTenantMember(input: { actorUserId: number; tenantId: string; targetUserId: number; roleId: string; scopeType: "company" | "portfolio" | "program" | "project"; scopeId?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  await assertTenantManager(input.actorUserId, input.tenantId);
  if (input.actorUserId === input.targetUserId) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_SELF_PRIVILEGE_CHANGE_FORBIDDEN" });
  if (input.scopeType === "company" && input.scopeId) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_INVALID_SCOPE" });
  if (input.scopeType !== "company" && !input.scopeId) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_INVALID_SCOPE" });
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

  const [projectRows, wbs, activitiesForProject, budgets, costs, progress, latestEvm] = await Promise.all([
    db.select({ id: projects.id, code: projects.code, name: projects.name, currency: projects.currency, currentBudget: projects.currentBudget, actualCost: projects.actualCost, forecastCost: projects.forecastCost }).from(projects).where(and(eq(projects.id, input.projectId), eq(projects.tenantId, input.tenantId))).limit(1),
    db.select({ id: wbsItems.id, code: wbsItems.code, name: wbsItems.name, parentId: wbsItems.parentId, plannedValue: wbsItems.plannedValue, earnedValue: wbsItems.earnedValue, actualCost: wbsItems.actualCost, progressPercent: wbsItems.progressPercent }).from(wbsItems).where(and(eq(wbsItems.tenantId, input.tenantId), eq(wbsItems.projectId, input.projectId))),
    db.select({ id: activities.id, wbsItemId: activities.wbsItemId, code: activities.code, name: activities.name, status: activities.status, plannedValue: activities.plannedValue, earnedValue: activities.earnedValue, plannedStartAt: activities.plannedStartAt, plannedFinishAt: activities.plannedFinishAt }).from(activities).where(and(eq(activities.tenantId, input.tenantId), eq(activities.projectId, input.projectId))),
    db.select({ id: budgetLines.id, wbsItemId: budgetLines.wbsItemId, costCode: budgetLines.costCode, originalAmount: budgetLines.originalAmount, currentAmount: budgetLines.currentAmount }).from(budgetLines).where(and(eq(budgetLines.tenantId, input.tenantId), eq(budgetLines.projectId, input.projectId))),
    db.select({ id: costEntries.id, wbsItemId: costEntries.wbsItemId, amount: costEntries.amount, entryType: costEntries.entryType, status: costEntries.status, incurredAt: costEntries.incurredAt }).from(costEntries).where(and(eq(costEntries.tenantId, input.tenantId), eq(costEntries.projectId, input.projectId))).orderBy(desc(costEntries.incurredAt)),
    db.select({ id: progressEntries.id, wbsItemId: progressEntries.wbsItemId, progressPercent: progressEntries.progressPercent, status: progressEntries.status, measuredAt: progressEntries.measuredAt }).from(progressEntries).where(and(eq(progressEntries.tenantId, input.tenantId), eq(progressEntries.projectId, input.projectId))).orderBy(desc(progressEntries.measuredAt)),
    db.select({ id: evmSnapshots.id, periodAt: evmSnapshots.periodAt, pv: evmSnapshots.pv, ev: evmSnapshots.ev, ac: evmSnapshots.ac, cpi: evmSnapshots.cpi, spi: evmSnapshots.spi, eac: evmSnapshots.eac, etc: evmSnapshots.etc, vac: evmSnapshots.vac }).from(evmSnapshots).where(and(eq(evmSnapshots.tenantId, input.tenantId), eq(evmSnapshots.projectId, input.projectId))).orderBy(desc(evmSnapshots.periodAt)).limit(1),
  ]);

  return { project: projectRows[0]!, wbs, activities: activitiesForProject, budgets, costs, progress, latestEvm: latestEvm[0] ?? null };
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
