import {
  boolean,
  index,
  int,
  mysqlEnum,
  mysqlTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const productCodes = ["EXECUTIVE", "PMO", "PROJECT"] as const;
export const subscriptionPackageCodes = [
  "EXECUTIVE",
  "PMO",
  "PROJECT",
  "EXECUTIVE + PMO",
  "PMO + PROJECT",
  "EXECUTIVE + PROJECT",
  "ALL-IN-ONE",
] as const;

export const companies = mysqlTable(
  "companies",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    legalName: varchar("legalName", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull(),
    status: mysqlEnum("status", ["active", "suspended", "archived"]).default("active").notNull(),
    defaultLocale: mysqlEnum("defaultLocale", ["ar", "en"]).default("ar").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("companies_slug_unique").on(table.slug)],
);

export const memberships = mysqlTable(
  "memberships",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    userId: int("userId").notNull().references(() => users.id),
    status: mysqlEnum("status", ["invited", "active", "suspended", "revoked"]).default("invited").notNull(),
    joinedAt: timestamp("joinedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("memberships_tenant_user_unique").on(table.tenantId, table.userId),
    index("memberships_user_tenant_idx").on(table.userId, table.tenantId),
  ],
);

export const subscriptions = mysqlTable(
  "subscriptions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    packageCode: mysqlEnum("packageCode", subscriptionPackageCodes).notNull(),
    status: mysqlEnum("status", ["trialing", "active", "past_due", "cancelled", "expired"]).default("trialing").notNull(),
    startsAt: timestamp("startsAt").notNull(),
    endsAt: timestamp("endsAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("subscriptions_tenant_status_idx").on(table.tenantId, table.status)],
);

export const tenantEntitlements = mysqlTable(
  "tenant_entitlements",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    subscriptionId: varchar("subscriptionId", { length: 36 }).notNull().references(() => subscriptions.id),
    productCode: mysqlEnum("productCode", productCodes).notNull(),
    active: boolean("active").default(true).notNull(),
    startsAt: timestamp("startsAt").notNull(),
    endsAt: timestamp("endsAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("tenant_entitlements_subscription_product_unique").on(table.subscriptionId, table.productCode),
    index("tenant_entitlements_tenant_product_idx").on(table.tenantId, table.productCode, table.active),
  ],
);

export const roles = mysqlTable(
  "roles",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    productCode: mysqlEnum("productCode", productCodes),
    description: text("description"),
    systemManaged: boolean("systemManaged").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("roles_tenant_code_unique").on(table.tenantId, table.code)],
);

export const permissions = mysqlTable(
  "permissions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    code: varchar("code", { length: 120 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    productCode: mysqlEnum("productCode", productCodes).notNull(),
    description: text("description"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("permissions_code_unique").on(table.code)],
);

export const rolePermissions = mysqlTable(
  "role_permissions",
  {
    roleId: varchar("roleId", { length: 36 }).notNull().references(() => roles.id),
    permissionId: varchar("permissionId", { length: 36 }).notNull().references(() => permissions.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [primaryKey({ columns: [table.roleId, table.permissionId], name: "role_permissions_pk" })],
);

export const membershipRoles = mysqlTable(
  "membership_roles",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    membershipId: varchar("membershipId", { length: 36 }).notNull().references(() => memberships.id),
    roleId: varchar("roleId", { length: 36 }).notNull().references(() => roles.id),
    scopeType: mysqlEnum("scopeType", ["company", "portfolio", "program", "project"]).default("company").notNull(),
    scopeId: varchar("scopeId", { length: 36 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("membership_roles_scope_unique").on(table.membershipId, table.roleId, table.scopeType, table.scopeId),
    index("membership_roles_membership_idx").on(table.membershipId),
  ],
);

export const auditLogs = mysqlTable(
  "audit_logs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    actorUserId: int("actorUserId").references(() => users.id),
    action: varchar("action", { length: 120 }).notNull(),
    entityType: varchar("entityType", { length: 120 }).notNull(),
    entityId: varchar("entityId", { length: 36 }),
    requestId: varchar("requestId", { length: 80 }),
    metadata: text("metadata"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("audit_logs_tenant_entity_idx").on(table.tenantId, table.entityType, table.entityId)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type ProductCode = (typeof productCodes)[number];
export type SubscriptionPackageCode = (typeof subscriptionPackageCodes)[number];

