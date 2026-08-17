import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  type InsertUser,
  type ProductCode,
  type SubscriptionPackageCode,
  auditLogs,
  companies,
  memberships,
  membershipRoles,
  permissions,
  projects,
  wbsItems,
  costEntries,
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

export async function saveEvmSnapshot(input: EvmInput & { userId: number; tenantId: string; projectId: string; periodAt: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new Error("Tenant membership is not available");
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.write", scope: { type: "project", id: input.projectId } });
  const project = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, input.projectId), eq(projects.tenantId, input.tenantId))).limit(1);
  if (!project[0]) throw new Error("Project was not found in the requested tenant.");
  const result = calculateEvm(input);
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.insert(evmSnapshots).values({ id, tenantId: input.tenantId, projectId: input.projectId, periodAt: input.periodAt, pv: String(result.pv), ev: String(result.ev), ac: String(result.ac), bac: String(result.bac), cv: String(result.cv), sv: String(result.sv), cpi: result.cpi === null ? null : String(result.cpi), spi: result.spi === null ? null : String(result.spi), eac: String(result.eac), etc: String(result.etc), vac: String(result.vac), tcpi: result.tcpi === null ? null : String(result.tcpi), eacMethod: result.eacMethod });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "evm.snapshot_created", entityType: "evm_snapshot", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, periodAt: input.periodAt.toISOString() }) });
  });
  return { id, ...result };
}

export async function createWbsItem(input: { userId: number; tenantId: string; projectId: string; code: string; name: string; parentId?: string; plannedValue?: number }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new Error("Tenant membership is not available");
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.write", scope: { type: "project", id: input.projectId } });
  const project = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.id, input.projectId), eq(projects.tenantId, input.tenantId))).limit(1);
  if (!project[0]) throw new Error("Project was not found in the requested tenant.");
  const id = crypto.randomUUID();
  await db.insert(wbsItems).values({ id, tenantId: input.tenantId, projectId: input.projectId, parentId: input.parentId, code: input.code, name: input.name, plannedValue: String(input.plannedValue ?? 0) });
  return { id };
}

export async function createCostEntry(input: { userId: number; tenantId: string; projectId: string; wbsItemId?: string; amount: number; incurredAt: Date }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new Error("Tenant membership is not available");
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.write", scope: { type: "project", id: input.projectId } });
  const id = crypto.randomUUID();
  await db.insert(costEntries).values({ id, tenantId: input.tenantId, projectId: input.projectId, wbsItemId: input.wbsItemId, amount: String(input.amount), entryType: "actual", status: "posted", incurredAt: input.incurredAt });
  return { id };
}
