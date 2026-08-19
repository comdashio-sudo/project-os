import {
  boolean,
  decimal,
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

export const membershipInvitations = mysqlTable(
  "membership_invitations",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    email: varchar("email", { length: 320 }).notNull(),
    roleId: varchar("roleId", { length: 36 }).notNull().references(() => roles.id),
    scopeType: mysqlEnum("scopeType", ["company", "portfolio", "program", "project"]).notNull(),
    scopeId: varchar("scopeId", { length: 36 }),
    tokenHash: varchar("tokenHash", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["pending", "accepted", "expired", "revoked"]).default("pending").notNull(),
    invitedByUserId: int("invitedByUserId").notNull().references(() => users.id),
    acceptedByUserId: int("acceptedByUserId").references(() => users.id),
    expiresAt: timestamp("expiresAt").notNull(),
    acceptedAt: timestamp("acceptedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("membership_invitations_token_hash_unique").on(table.tokenHash),
    index("membership_invitations_tenant_email_status_idx").on(table.tenantId, table.email, table.status),
    index("membership_invitations_email_status_idx").on(table.email, table.status),
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

export const internalNotifications = mysqlTable(
  "internal_notifications",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    recipientUserId: int("recipientUserId").notNull().references(() => users.id),
    projectId: varchar("projectId", { length: 36 }).references(() => projects.id),
    notificationCode: varchar("notificationCode", { length: 120 }).notNull(),
    entityType: varchar("entityType", { length: 120 }),
    entityId: varchar("entityId", { length: 36 }),
    payload: text("payload").notNull(),
    acknowledgedAt: timestamp("acknowledgedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("internal_notifications_recipient_tenant_ack_idx").on(table.recipientUserId, table.tenantId, table.acknowledgedAt), index("internal_notifications_tenant_project_idx").on(table.tenantId, table.projectId)],
);

export const portfolios = mysqlTable(
  "portfolios",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    status: mysqlEnum("status", ["active", "on_hold", "closed"]).default("active").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("portfolios_tenant_code_unique").on(table.tenantId, table.code)],
);

export const programs = mysqlTable(
  "programs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    portfolioId: varchar("portfolioId", { length: 36 }).references(() => portfolios.id),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    status: mysqlEnum("status", ["active", "on_hold", "closed"]).default("active").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("programs_tenant_code_unique").on(table.tenantId, table.code), index("programs_tenant_portfolio_idx").on(table.tenantId, table.portfolioId)],
);

export const projects = mysqlTable(
  "projects",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    portfolioId: varchar("portfolioId", { length: 36 }).references(() => portfolios.id),
    programId: varchar("programId", { length: 36 }).references(() => programs.id),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    projectType: varchar("projectType", { length: 120 }).notNull(),
    lifecycleStage: mysqlEnum("lifecycleStage", ["opportunity", "pre_award", "tender", "award", "mobilization", "planning", "design", "procurement", "execution", "commissioning", "handover", "closeout", "post_project_review"]).default("planning").notNull(),
    status: mysqlEnum("status", ["draft", "active", "on_hold", "closed", "cancelled"]).default("draft").notNull(),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
    contractValue: decimal("contractValue", { precision: 18, scale: 2 }).default("0").notNull(),
    originalBudget: decimal("originalBudget", { precision: 18, scale: 2 }).default("0").notNull(),
    currentBudget: decimal("currentBudget", { precision: 18, scale: 2 }).default("0").notNull(),
    actualCost: decimal("actualCost", { precision: 18, scale: 2 }).default("0").notNull(),
    committedCost: decimal("committedCost", { precision: 18, scale: 2 }).default("0").notNull(),
    forecastCost: decimal("forecastCost", { precision: 18, scale: 2 }).default("0").notNull(),
    plannedStartAt: timestamp("plannedStartAt"),
    plannedFinishAt: timestamp("plannedFinishAt"),
    forecastFinishAt: timestamp("forecastFinishAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("projects_tenant_code_unique").on(table.tenantId, table.code), index("projects_tenant_portfolio_idx").on(table.tenantId, table.portfolioId), index("projects_tenant_program_idx").on(table.tenantId, table.programId)],
);

export const contracts = mysqlTable(
  "contracts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    code: varchar("code", { length: 80 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    counterparty: varchar("counterparty", { length: 255 }).notNull(),
    contractValue: decimal("contractValue", { precision: 18, scale: 2 }).default("0").notNull(),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
    status: mysqlEnum("status", ["draft", "active", "suspended", "closed", "cancelled"]).default("draft").notNull(),
    startAt: timestamp("startAt"),
    endAt: timestamp("endAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("contracts_project_code_unique").on(table.projectId, table.code), index("contracts_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status)],
);

export const commitments = mysqlTable(
  "commitments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    contractId: varchar("contractId", { length: 36 }).references(() => contracts.id),
    code: varchar("code", { length: 80 }).notNull(),
    description: varchar("description", { length: 255 }).notNull(),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
    status: mysqlEnum("status", ["draft", "committed", "released", "cancelled"]).default("draft").notNull(),
    committedAt: timestamp("committedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("commitments_project_code_unique").on(table.projectId, table.code), index("commitments_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status), index("commitments_contract_idx").on(table.contractId)],
);

export const projectDocuments = mysqlTable(
  "project_documents",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    documentNumber: varchar("documentNumber", { length: 120 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    category: mysqlEnum("category", ["drawing", "specification", "method_statement", "report", "correspondence", "commercial", "other"]).default("other").notNull(),
    status: mysqlEnum("status", ["draft", "for_review", "approved", "superseded", "archived"]).default("draft").notNull(),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("project_documents_project_number_unique").on(table.projectId, table.documentNumber), index("project_documents_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status)],
);

export const documentVersions = mysqlTable(
  "document_versions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    documentId: varchar("documentId", { length: 36 }).notNull().references(() => projectDocuments.id),
    versionNumber: int("versionNumber").notNull(),
    originalName: varchar("originalName", { length: 255 }).notNull(),
    storageKey: varchar("storageKey", { length: 512 }).notNull(),
    mimeType: varchar("mimeType", { length: 120 }).notNull(),
    sizeBytes: int("sizeBytes").notNull(),
    checksumSha256: varchar("checksumSha256", { length: 64 }).notNull(),
    uploadedByUserId: int("uploadedByUserId").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("document_versions_document_version_unique").on(table.documentId, table.versionNumber), index("document_versions_tenant_project_document_idx").on(table.tenantId, table.projectId, table.documentId)],
);

export const masterPlans = mysqlTable(
  "master_plans",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    code: varchar("code", { length: 80 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    status: mysqlEnum("status", ["active", "superseded", "archived"]).default("active").notNull(),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("master_plans_project_code_unique").on(table.projectId, table.code), index("master_plans_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status)],
);

export const masterPlanVersions = mysqlTable(
  "master_plan_versions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    masterPlanId: varchar("masterPlanId", { length: 36 }).notNull().references(() => masterPlans.id),
    versionNumber: int("versionNumber").notNull(),
    versionKind: mysqlEnum("versionKind", ["original", "revision", "updated"]).notNull(),
    description: text("description"),
    changeSummary: text("changeSummary"),
    sourceFileName: varchar("sourceFileName", { length: 255 }),
    storageKey: varchar("storageKey", { length: 512 }),
    checksumSha256: varchar("checksumSha256", { length: 64 }),
    uploadedByUserId: int("uploadedByUserId").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("master_plan_versions_plan_version_unique").on(table.masterPlanId, table.versionNumber), index("master_plan_versions_tenant_project_plan_idx").on(table.tenantId, table.projectId, table.masterPlanId)],
);

export const masterPlanSpatialEntities = mysqlTable(
  "master_plan_spatial_entities",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    masterPlanVersionId: varchar("masterPlanVersionId", { length: 36 }).notNull().references(() => masterPlanVersions.id),
    parentEntityId: varchar("parentEntityId", { length: 36 }),
    code: varchar("code", { length: 120 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    entityType: mysqlEnum("entityType", ["block", "building", "zone", "unit", "area"]).notNull(),
    geometry: text("geometry").notNull(),
    status: mysqlEnum("status", ["not_started", "in_progress", "completed", "blocked"]).default("not_started").notNull(),
    progressPercent: decimal("progressPercent", { precision: 5, scale: 2 }).default("0").notNull(),
    plannedValue: decimal("plannedValue", { precision: 18, scale: 2 }).default("0").notNull(),
    actualValue: decimal("actualValue", { precision: 18, scale: 2 }).default("0").notNull(),
    forecastValue: decimal("forecastValue", { precision: 18, scale: 2 }).default("0").notNull(),
    wbsItemId: varchar("wbsItemId", { length: 36 }).references(() => wbsItems.id),
    activityId: varchar("activityId", { length: 36 }).references(() => activities.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("master_plan_spatial_entities_version_code_unique").on(table.masterPlanVersionId, table.code), index("master_plan_spatial_entities_tenant_project_version_idx").on(table.tenantId, table.projectId, table.masterPlanVersionId), index("master_plan_spatial_entities_version_status_idx").on(table.masterPlanVersionId, table.status)],
);

export const rfis = mysqlTable(
  "rfis",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    rfiNumber: varchar("rfiNumber", { length: 120 }).notNull(),
    subject: varchar("subject", { length: 255 }).notNull(),
    question: text("question").notNull(),
    status: mysqlEnum("status", ["draft", "submitted", "under_review", "answered", "closed", "cancelled"]).default("draft").notNull(),
    dueAt: timestamp("dueAt"),
    submittedAt: timestamp("submittedAt"),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("rfis_project_number_unique").on(table.projectId, table.rfiNumber), index("rfis_tenant_project_status_due_idx").on(table.tenantId, table.projectId, table.status, table.dueAt)],
);

export const ncrs = mysqlTable(
  "ncrs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    ncrNumber: varchar("ncrNumber", { length: 120 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    status: mysqlEnum("status", ["open", "under_investigation", "corrective_action", "verification", "closed", "cancelled"]).default("open").notNull(),
    dueAt: timestamp("dueAt"),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("ncrs_project_number_unique").on(table.projectId, table.ncrNumber), index("ncrs_tenant_project_status_due_idx").on(table.tenantId, table.projectId, table.status, table.dueAt)],
);

export const hseObservations = mysqlTable(
  "hse_observations",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    observationNumber: varchar("observationNumber", { length: 120 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    category: mysqlEnum("category", ["safety", "health", "environment"]).notNull(),
    severity: mysqlEnum("severity", ["low", "medium", "high", "critical"]).default("medium").notNull(),
    status: mysqlEnum("status", ["open", "assigned", "remediation", "verification", "closed", "cancelled"]).default("open").notNull(),
    dueAt: timestamp("dueAt"),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("hse_observations_project_number_unique").on(table.projectId, table.observationNumber), index("hse_observations_tenant_project_status_due_idx").on(table.tenantId, table.projectId, table.status, table.dueAt)],
);

export const changeRequests = mysqlTable(
  "change_requests",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    changeNumber: varchar("changeNumber", { length: 120 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    impactScheduleDays: int("impactScheduleDays").default(0).notNull(),
    impactCost: decimal("impactCost", { precision: 18, scale: 2 }).default("0").notNull(),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
    status: mysqlEnum("status", ["draft", "submitted", "under_review", "approved", "rejected", "cancelled"]).default("draft").notNull(),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    submittedAt: timestamp("submittedAt"),
    reviewedByUserId: int("reviewedByUserId").references(() => users.id),
    reviewedAt: timestamp("reviewedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("change_requests_project_number_unique").on(table.projectId, table.changeNumber), index("change_requests_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status)],
);

export const claims = mysqlTable(
  "claims",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    contractId: varchar("contractId", { length: 36 }).references(() => contracts.id),
    claimNumber: varchar("claimNumber", { length: 120 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    claimedAmount: decimal("claimedAmount", { precision: 18, scale: 2 }).notNull(),
    approvedAmount: decimal("approvedAmount", { precision: 18, scale: 2 }),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
    status: mysqlEnum("status", ["draft", "submitted", "under_review", "approved", "rejected", "withdrawn"]).default("draft").notNull(),
    submittedAt: timestamp("submittedAt"),
    resolvedAt: timestamp("resolvedAt"),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("claims_project_number_unique").on(table.projectId, table.claimNumber), index("claims_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status), index("claims_contract_idx").on(table.contractId)],
);

export const projectResources = mysqlTable(
  "project_resources",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    resourceCode: varchar("resourceCode", { length: 120 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    resourceType: mysqlEnum("resourceType", ["labor", "equipment", "material", "service"]).notNull(),
    plannedUnits: decimal("plannedUnits", { precision: 14, scale: 2 }).default("0").notNull(),
    allocatedUnits: decimal("allocatedUnits", { precision: 14, scale: 2 }).default("0").notNull(),
    unitCost: decimal("unitCost", { precision: 18, scale: 2 }).default("0").notNull(),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("project_resources_project_code_unique").on(table.projectId, table.resourceCode), index("project_resources_tenant_project_type_idx").on(table.tenantId, table.projectId, table.resourceType)],
);

export const wbsItems = mysqlTable(
  "wbs_items",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    parentId: varchar("parentId", { length: 36 }),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    plannedValue: decimal("plannedValue", { precision: 18, scale: 2 }).default("0").notNull(),
    earnedValue: decimal("earnedValue", { precision: 18, scale: 2 }).default("0").notNull(),
    actualCost: decimal("actualCost", { precision: 18, scale: 2 }).default("0").notNull(),
    progressPercent: decimal("progressPercent", { precision: 5, scale: 2 }).default("0").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("wbs_items_project_code_unique").on(table.projectId, table.code), index("wbs_items_tenant_project_idx").on(table.tenantId, table.projectId)],
);

export const activities = mysqlTable(
  "activities",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    wbsItemId: varchar("wbsItemId", { length: 36 }).references(() => wbsItems.id),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    status: mysqlEnum("status", ["not_started", "in_progress", "completed", "blocked"]).default("not_started").notNull(),
    plannedValue: decimal("plannedValue", { precision: 18, scale: 2 }).default("0").notNull(),
    earnedValue: decimal("earnedValue", { precision: 18, scale: 2 }).default("0").notNull(),
    plannedStartAt: timestamp("plannedStartAt"),
    plannedFinishAt: timestamp("plannedFinishAt"),
    actualStartAt: timestamp("actualStartAt"),
    actualFinishAt: timestamp("actualFinishAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("activities_project_code_unique").on(table.projectId, table.code), index("activities_tenant_project_idx").on(table.tenantId, table.projectId)],
);

export const budgetLines = mysqlTable(
  "budget_lines",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    wbsItemId: varchar("wbsItemId", { length: 36 }).references(() => wbsItems.id),
    costCode: varchar("costCode", { length: 80 }).notNull(),
    originalAmount: decimal("originalAmount", { precision: 18, scale: 2 }).default("0").notNull(),
    currentAmount: decimal("currentAmount", { precision: 18, scale: 2 }).default("0").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("budget_lines_tenant_project_idx").on(table.tenantId, table.projectId)],
);

export const costEntries = mysqlTable(
  "cost_entries",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    wbsItemId: varchar("wbsItemId", { length: 36 }).references(() => wbsItems.id),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    entryType: mysqlEnum("entryType", ["actual", "accrual", "adjustment"]).notNull(),
    status: mysqlEnum("status", ["draft", "posted", "void"]).default("draft").notNull(),
    incurredAt: timestamp("incurredAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("cost_entries_tenant_project_date_idx").on(table.tenantId, table.projectId, table.incurredAt)],
);

export const progressEntries = mysqlTable(
  "progress_entries",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    wbsItemId: varchar("wbsItemId", { length: 36 }).references(() => wbsItems.id),
    activityId: varchar("activityId", { length: 36 }).references(() => activities.id),
    progressPercent: decimal("progressPercent", { precision: 5, scale: 2 }).notNull(),
    status: mysqlEnum("status", ["draft", "submitted", "validated", "rejected"]).default("draft").notNull(),
    measuredAt: timestamp("measuredAt").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("progress_entries_tenant_project_date_idx").on(table.tenantId, table.projectId, table.measuredAt)],
);

export const evmSnapshots = mysqlTable(
  "evm_snapshots",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    periodAt: timestamp("periodAt").notNull(),
    pv: decimal("pv", { precision: 18, scale: 2 }).notNull(),
    ev: decimal("ev", { precision: 18, scale: 2 }).notNull(),
    ac: decimal("ac", { precision: 18, scale: 2 }).notNull(),
    bac: decimal("bac", { precision: 18, scale: 2 }).notNull(),
    cv: decimal("cv", { precision: 18, scale: 2 }).notNull(),
    sv: decimal("sv", { precision: 18, scale: 2 }).notNull(),
    cpi: decimal("cpi", { precision: 12, scale: 4 }),
    spi: decimal("spi", { precision: 12, scale: 4 }),
    eac: decimal("eac", { precision: 18, scale: 2 }).notNull(),
    etc: decimal("etc", { precision: 18, scale: 2 }).notNull(),
    vac: decimal("vac", { precision: 18, scale: 2 }).notNull(),
    tcpi: decimal("tcpi", { precision: 12, scale: 4 }),
    eacMethod: mysqlEnum("eacMethod", ["bac_over_cpi", "ac_plus_remaining", "ac_plus_remaining_over_cpi_spi", "manual"]).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("evm_snapshots_project_period_unique").on(table.projectId, table.periodAt), index("evm_snapshots_tenant_project_idx").on(table.tenantId, table.projectId)],
);

export const risks = mysqlTable(
  "risks",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    code: varchar("code", { length: 80 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    cause: text("cause"),
    event: text("event"),
    impact: text("impact"),
    probability: int("probability").notNull(),
    severity: int("severity").notNull(),
    residualProbability: int("residualProbability"),
    residualSeverity: int("residualSeverity"),
    response: text("response"),
    mitigation: text("mitigation"),
    trigger: text("trigger"),
    ownerMembershipId: varchar("ownerMembershipId", { length: 36 }).references(() => memberships.id),
    dueAt: timestamp("dueAt"),
    status: mysqlEnum("status", ["open", "mitigating", "accepted", "closed"]).default("open").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("risks_project_code_unique").on(table.projectId, table.code), index("risks_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status)],
);

export const issues = mysqlTable(
  "issues",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    code: varchar("code", { length: 80 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    cause: text("cause"),
    impact: text("impact"),
    priority: mysqlEnum("priority", ["low", "medium", "high", "critical"]).default("medium").notNull(),
    ownerMembershipId: varchar("ownerMembershipId", { length: 36 }).references(() => memberships.id),
    dueAt: timestamp("dueAt"),
    escalationStatus: mysqlEnum("escalationStatus", ["none", "pending", "escalated"]).default("none").notNull(),
    status: mysqlEnum("status", ["open", "in_progress", "resolved", "closed"]).default("open").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("issues_project_code_unique").on(table.projectId, table.code), index("issues_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status)],
);

export const actions = mysqlTable(
  "actions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).references(() => projects.id),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    priority: mysqlEnum("priority", ["low", "medium", "high", "critical"]).default("medium").notNull(),
    ownerMembershipId: varchar("ownerMembershipId", { length: 36 }).references(() => memberships.id),
    dueAt: timestamp("dueAt"),
    evidenceDocumentId: varchar("evidenceDocumentId", { length: 36 }),
    escalationStatus: mysqlEnum("escalationStatus", ["none", "pending", "escalated"]).default("none").notNull(),
    status: mysqlEnum("status", ["open", "in_progress", "completed", "cancelled"]).default("open").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("actions_tenant_project_due_idx").on(table.tenantId, table.projectId, table.dueAt)],
);

export const decisions = mysqlTable(
  "decisions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).references(() => projects.id),
    problem: text("problem").notNull(),
    options: text("options").notNull(),
    recommendation: text("recommendation"),
    costImpact: decimal("costImpact", { precision: 18, scale: 2 }),
    scheduleImpactDays: int("scheduleImpactDays"),
    riskImpact: text("riskImpact"),
    decisionOwnerMembershipId: varchar("decisionOwnerMembershipId", { length: 36 }).references(() => memberships.id),
    decision: text("decision"),
    status: mysqlEnum("status", ["draft", "submitted", "approved", "rejected", "implemented"]).default("draft").notNull(),
    decidedAt: timestamp("decidedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("decisions_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status)],
);

export const projectHealthSnapshots = mysqlTable(
  "project_health_snapshots",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    periodAt: timestamp("periodAt").notNull(),
    overallScore: decimal("overallScore", { precision: 5, scale: 2 }).notNull(),
    status: mysqlEnum("status", ["green", "amber", "red"]).notNull(),
    confidence: mysqlEnum("confidence", ["low", "medium", "high"]).notNull(),
    drivers: text("drivers").notNull(),
    exceptions: text("exceptions").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("project_health_period_unique").on(table.projectId, table.periodAt), index("project_health_tenant_project_idx").on(table.tenantId, table.projectId)],
);

export const dataImports = mysqlTable(
  "data_imports",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).references(() => projects.id),
    moduleCode: varchar("moduleCode", { length: 64 }).notNull(),
    templateCode: varchar("templateCode", { length: 64 }).notNull(),
    sourceFormat: mysqlEnum("sourceFormat", ["xlsx", "csv"]).notNull(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    fileKey: varchar("fileKey", { length: 512 }).notNull(),
    fileHash: varchar("fileHash", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["uploaded", "validated", "confirmed", "importing", "completed", "failed", "cancelled"]).default("uploaded").notNull(),
    duplicateMode: mysqlEnum("duplicateMode", ["create_only", "update_existing", "upsert", "skip_duplicates", "fail_on_duplicate"]).default("fail_on_duplicate").notNull(),
    totalRows: int("totalRows").default(0).notNull(), validRows: int("validRows").default(0).notNull(), invalidRows: int("invalidRows").default(0).notNull(), createdRows: int("createdRows").default(0).notNull(), updatedRows: int("updatedRows").default(0).notNull(), skippedRows: int("skippedRows").default(0).notNull(),
    mappingJson: text("mappingJson"), summaryJson: text("summaryJson"),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    startedAt: timestamp("startedAt"), completedAt: timestamp("completedAt"), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("data_imports_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status), uniqueIndex("data_imports_tenant_file_hash_unique").on(table.tenantId, table.fileHash)],
);

export const dataImportErrors = mysqlTable(
  "data_import_errors",
  { id: varchar("id", { length: 36 }).primaryKey(), importId: varchar("importId", { length: 36 }).notNull().references(() => dataImports.id), rowNumber: int("rowNumber").notNull(), columnName: varchar("columnName", { length: 128 }), value: text("value"), code: varchar("code", { length: 96 }).notNull(), severity: mysqlEnum("severity", ["error", "warning"]).notNull(), suggestedFix: text("suggestedFix"), createdAt: timestamp("createdAt").defaultNow().notNull() },
  table => [index("data_import_errors_import_row_idx").on(table.importId, table.rowNumber)],
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type ProductCode = (typeof productCodes)[number];
export type SubscriptionPackageCode = (typeof subscriptionPackageCodes)[number];
