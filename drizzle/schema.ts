import {
  boolean,
  decimal,
  foreignKey,
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

export const employees = mysqlTable(
  "employees",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    employeeNumber: varchar("employeeNumber", { length: 80 }).notNull(),
    fullName: varchar("fullName", { length: 255 }).notNull(),
    jobTitle: varchar("jobTitle", { length: 160 }).notNull(),
    department: varchar("department", { length: 160 }).notNull(),
    hireDate: timestamp("hireDate").notNull(),
    employmentStatus: mysqlEnum("employmentStatus", ["active", "suspended", "terminated"]).default("active").notNull(),
    nationality: varchar("nationality", { length: 120 }),
    identityDocumentType: varchar("identityDocumentType", { length: 80 }),
    identityReference: varchar("identityReference", { length: 512 }),
    linkedUserId: int("linkedUserId").references(() => users.id),
    retentionPolicy: mysqlEnum("retentionPolicy", ["standard", "extended", "legal_hold"]).default("standard").notNull(),
    archivedAt: timestamp("archivedAt"),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("employees_tenant_number_unique").on(table.tenantId, table.employeeNumber),
    uniqueIndex("employees_tenant_user_unique").on(table.tenantId, table.linkedUserId),
    index("employees_tenant_status_idx").on(table.tenantId, table.employmentStatus),
  ],
);

export const employmentContracts = mysqlTable(
  "employment_contracts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    employeeId: varchar("employeeId", { length: 36 }).notNull().references(() => employees.id),
    contractType: mysqlEnum("contractType", ["permanent", "fixed_term", "temporary", "consulting"]).notNull(),
    startDate: timestamp("startDate").notNull(),
    endDate: timestamp("endDate"),
    probationEndDate: timestamp("probationEndDate"),
    renewalOfContractId: varchar("renewalOfContractId", { length: 36 }),
    status: mysqlEnum("status", ["active", "ended", "terminated"]).default("active").notNull(),
    terminationReason: varchar("terminationReason", { length: 1000 }),
    retentionPolicy: mysqlEnum("retentionPolicy", ["standard", "extended", "legal_hold"]).default("standard").notNull(),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("employment_contracts_tenant_employee_idx").on(table.tenantId, table.employeeId, table.status)],
);

export const salaryStructures = mysqlTable(
  "salary_structures",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    employeeId: varchar("employeeId", { length: 36 }).notNull().references(() => employees.id),
    baseSalary: decimal("baseSalary", { precision: 18, scale: 2 }).notNull(),
    housingAllowance: decimal("housingAllowance", { precision: 18, scale: 2 }).default("0").notNull(),
    transportAllowance: decimal("transportAllowance", { precision: 18, scale: 2 }).default("0").notNull(),
    hardshipAllowance: decimal("hardshipAllowance", { precision: 18, scale: 2 }).default("0").notNull(),
    gosiRate: decimal("gosiRate", { precision: 7, scale: 6 }).default("0").notNull(),
    otherDeductions: decimal("otherDeductions", { precision: 18, scale: 2 }).default("0").notNull(),
    eosMonthlyAccrual: decimal("eosMonthlyAccrual", { precision: 18, scale: 2 }).default("0").notNull(),
    // 'computed' = the accrual follows the length of service and the tenant's rule; 'manual' = the amount above, as entered before work order 3.
    eosAccrualMode: mysqlEnum("eosAccrualMode", ["computed", "manual"]).default("computed").notNull(),
    currency: varchar("currency", { length: 3 }).default("SAR").notNull(),
    active: boolean("active").default(true).notNull(),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("salary_structures_tenant_employee_unique").on(table.tenantId, table.employeeId), index("salary_structures_tenant_active_idx").on(table.tenantId, table.active)],
);

export const tenantSettings = mysqlTable(
  "tenant_settings",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    // Labour loading and the working calendar (G-015, G-016, G-124). Defaults load nothing and use the Sunday-Thursday week.
    // Deprecated: the single rate used before work order 3. Nothing reads it any more; the two columns below replace it. Kept (not dropped) so no data is lost.
    employerGosiRate: decimal("employerGosiRate", { precision: 7, scale: 6 }).default("0").notNull(),
    // Owner defaults (work order 3): 11.75% for a Saudi, 2% for anyone else, on basic + housing.
    employerGosiRateSaudi: decimal("employerGosiRateSaudi", { precision: 7, scale: 6 }).default("0.117500").notNull(),
    employerGosiRateNonSaudi: decimal("employerGosiRateNonSaudi", { precision: 7, scale: 6 }).default("0.020000").notNull(),
    // End-of-service accrual: months of pay per year of service, for the first N years and after (owner default: 0.5 for 5 years, then 1).
    eosFirstPeriodYears: int("eosFirstPeriodYears").default(5).notNull(),
    eosFirstPeriodMonthsPerYear: decimal("eosFirstPeriodMonthsPerYear", { precision: 5, scale: 2 }).default("0.50").notNull(),
    eosLaterMonthsPerYear: decimal("eosLaterMonthsPerYear", { precision: 5, scale: 2 }).default("1.00").notNull(),
    indirectLoadingPercent: decimal("indirectLoadingPercent", { precision: 7, scale: 4 }).default("0").notNull(),
    hoursPerDay: decimal("hoursPerDay", { precision: 5, scale: 2 }).default("8").notNull(),
    workingDays: varchar("workingDays", { length: 20 }).default("0,1,2,3,4").notNull(),
    updatedByUserId: int("updatedByUserId").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("tenant_settings_tenant_unique").on(table.tenantId)],
);

/**
 * A request the phone sent with its own identifier (G-033). A retry after a lost answer carries the same identifier and gets
 * the stored result back instead of running again, so a queued item sent twice never makes two records.
 */
export const clientRequests = mysqlTable(
  "client_requests",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    userId: int("userId").notNull().references(() => users.id),
    action: varchar("action", { length: 60 }).notNull(),
    status: mysqlEnum("status", ["started", "done"]).default("started").notNull(),
    resultJson: text("resultJson"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("client_requests_tenant_created_idx").on(table.tenantId, table.createdAt)],
);

export const payrollRuns = mysqlTable(
  "payroll_runs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    periodStart: timestamp("periodStart").notNull(),
    periodEnd: timestamp("periodEnd").notNull(),
    status: mysqlEnum("status", ["draft", "review", "approved", "paid"]).default("draft").notNull(),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    reviewedByUserId: int("reviewedByUserId").references(() => users.id),
    approvedByUserId: int("approvedByUserId").references(() => users.id),
    approvedAt: timestamp("approvedAt"),
    paidAt: timestamp("paidAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("payroll_runs_tenant_period_unique").on(table.tenantId, table.periodStart, table.periodEnd), index("payroll_runs_tenant_status_idx").on(table.tenantId, table.status)],
);

export const payrollEntries = mysqlTable(
  "payroll_entries",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    payrollRunId: varchar("payrollRunId", { length: 36 }).notNull().references(() => payrollRuns.id),
    employeeId: varchar("employeeId", { length: 36 }).notNull().references(() => employees.id),
    salaryStructureId: varchar("salaryStructureId", { length: 36 }).notNull().references(() => salaryStructures.id),
    baseSalary: decimal("baseSalary", { precision: 18, scale: 2 }).notNull(),
    housingAllowance: decimal("housingAllowance", { precision: 18, scale: 2 }).notNull(),
    transportAllowance: decimal("transportAllowance", { precision: 18, scale: 2 }).notNull(),
    hardshipAllowance: decimal("hardshipAllowance", { precision: 18, scale: 2 }).notNull(),
    gosiDeduction: decimal("gosiDeduction", { precision: 18, scale: 2 }).notNull(),
    otherDeductions: decimal("otherDeductions", { precision: 18, scale: 2 }).notNull(),
    eosMonthlyAccrual: decimal("eosMonthlyAccrual", { precision: 18, scale: 2 }).notNull(),
    // The loaded cost the run was made with, kept on the entry so a later change of the tenant's rates never moves a closed month.
    employerSocialInsurance: decimal("employerSocialInsurance", { precision: 18, scale: 2 }).default("0").notNull(),
    indirectLoading: decimal("indirectLoading", { precision: 18, scale: 2 }).default("0").notNull(),
    nationalityClass: varchar("nationalityClass", { length: 12 }),
    currency: varchar("currency", { length: 3 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("payroll_entries_run_employee_unique").on(table.payrollRunId, table.employeeId), index("payroll_entries_tenant_run_idx").on(table.tenantId, table.payrollRunId)],
);

export const payrollAllocations = mysqlTable(
  "payroll_allocations",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    payrollEntryId: varchar("payrollEntryId", { length: 36 }).notNull().references(() => payrollEntries.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    wbsItemId: varchar("wbsItemId", { length: 36 }).references(() => wbsItems.id),
    activityId: varchar("activityId", { length: 36 }).references(() => activities.id),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    costEntryId: varchar("costEntryId", { length: 36 }).references(() => costEntries.id),
    // 'auto_hours' = shared out by the approved hours of the period; the hours and the share are kept so the split can be re-derived.
    source: mysqlEnum("source", ["manual", "auto_hours"]).default("manual").notNull(),
    hoursBasis: decimal("hoursBasis", { precision: 12, scale: 2 }),
    sharePercent: decimal("sharePercent", { precision: 9, scale: 4 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("payroll_allocations_tenant_project_idx").on(table.tenantId, table.projectId), uniqueIndex("payroll_allocations_cost_entry_unique").on(table.costEntryId)],
);

/** Every manual change to a payroll allocation: who, what it was, what it became, and why. The reason is not optional. */
export const payrollAllocationAdjustments = mysqlTable(
  "payroll_allocation_adjustments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    allocationId: varchar("allocationId", { length: 36 }).notNull(),
    previousAmount: decimal("previousAmount", { precision: 18, scale: 2 }).notNull(),
    newAmount: decimal("newAmount", { precision: 18, scale: 2 }).notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    adjustedByUserId: int("adjustedByUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("payroll_allocation_adjustments_allocation_idx").on(table.allocationId, table.createdAt),
    index("payroll_allocation_adjustments_tenant_idx").on(table.tenantId, table.createdAt),
    foreignKey({ columns: [table.tenantId], foreignColumns: [companies.id], name: "paa_tenant_fk" }),
    foreignKey({ columns: [table.allocationId], foreignColumns: [payrollAllocations.id], name: "paa_allocation_fk" }),
    foreignKey({ columns: [table.adjustedByUserId], foreignColumns: [users.id], name: "paa_user_fk" }),
  ],
);

/**
 * E-mail waiting to be sent (work order 3, decision 6). Nothing is written here unless e-mail notifications are switched on AND a mail sender is configured,
 * so turning them on later never sends a backlog. `dedupeKey` makes every producer safe to run twice: one escalation, one reminder per day, one digest per day.
 */
export const emailOutbox = mysqlTable(
  "email_outbox",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    recipientUserId: int("recipientUserId").notNull(),
    kind: mysqlEnum("kind", ["support_escalation", "approvals_waiting", "daily_digest"]).notNull(),
    dedupeKey: varchar("dedupeKey", { length: 160 }).notNull(),
    subject: varchar("subject", { length: 300 }).notNull(),
    bodyText: text("bodyText").notNull(),
    bodyHtml: text("bodyHtml").notNull(),
    status: mysqlEnum("status", ["pending", "sent", "failed", "skipped"]).default("pending").notNull(),
    attempts: int("attempts").default(0).notNull(),
    // The sender's status line only: never the response body, which can name the recipient.
    lastError: varchar("lastError", { length: 200 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    sentAt: timestamp("sentAt"),
  },
  table => [
    uniqueIndex("email_outbox_dedupe_unique").on(table.tenantId, table.recipientUserId, table.kind, table.dedupeKey),
    index("email_outbox_status_created_idx").on(table.status, table.createdAt),
    foreignKey({ columns: [table.tenantId], foreignColumns: [companies.id], name: "eo_tenant_fk" }),
    foreignKey({ columns: [table.recipientUserId], foreignColumns: [users.id], name: "eo_user_fk" }),
  ],
);

/** A person's choice, per kind of e-mail, in one company. No row means the default: on. */
export const emailNotificationPreferences = mysqlTable(
  "email_notification_preferences",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    userId: int("userId").notNull(),
    kind: mysqlEnum("kind", ["support_escalation", "approvals_waiting", "daily_digest"]).notNull(),
    enabled: boolean("enabled").notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("email_preferences_unique").on(table.tenantId, table.userId, table.kind),
    foreignKey({ columns: [table.tenantId], foreignColumns: [companies.id], name: "enp_tenant_fk" }),
    foreignKey({ columns: [table.userId], foreignColumns: [users.id], name: "enp_user_fk" }),
  ],
);

export const employeeAssignments = mysqlTable(
  "employee_assignments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    employeeId: varchar("employeeId", { length: 36 }).notNull().references(() => employees.id),
    projectResourceId: varchar("projectResourceId", { length: 36 }).notNull().references(() => projectResources.id),
    wbsItemId: varchar("wbsItemId", { length: 36 }).references(() => wbsItems.id),
    activityId: varchar("activityId", { length: 36 }).references(() => activities.id),
    plannedStartAt: timestamp("plannedStartAt").notNull(),
    plannedFinishAt: timestamp("plannedFinishAt").notNull(),
    plannedHours: decimal("plannedHours", { precision: 12, scale: 2 }).notNull(),
    status: mysqlEnum("status", ["planned", "active", "closed", "cancelled"]).default("planned").notNull(),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("employee_assignments_tenant_project_idx").on(table.tenantId, table.projectId, table.status), index("employee_assignments_employee_window_idx").on(table.tenantId, table.employeeId, table.plannedStartAt, table.plannedFinishAt)],
);

export const employeeAttendance = mysqlTable(
  "employee_attendance",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    employeeId: varchar("employeeId", { length: 36 }).notNull().references(() => employees.id),
    attendanceDate: timestamp("attendanceDate").notNull(),
    attendanceStatus: mysqlEnum("attendanceStatus", ["present", "absent", "leave", "secondment"]).notNull(),
    status: mysqlEnum("status", ["draft", "submitted", "approved", "rejected"]).default("draft").notNull(),
    note: varchar("note", { length: 1000 }),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    reviewedByUserId: int("reviewedByUserId").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("employee_attendance_tenant_day_unique").on(table.tenantId, table.employeeId, table.attendanceDate), index("employee_attendance_tenant_status_idx").on(table.tenantId, table.status, table.attendanceDate)],
);

export const employeeTimeEntries = mysqlTable(
  "employee_time_entries",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    assignmentId: varchar("assignmentId", { length: 36 }).notNull().references(() => employeeAssignments.id),
    employeeId: varchar("employeeId", { length: 36 }).notNull().references(() => employees.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    workDate: timestamp("workDate").notNull(),
    actualHours: decimal("actualHours", { precision: 8, scale: 2 }).notNull(),
    reportedProgressPercent: decimal("reportedProgressPercent", { precision: 5, scale: 2 }),
    status: mysqlEnum("status", ["draft", "submitted", "approved", "rejected"]).default("draft").notNull(),
    costEntryId: varchar("costEntryId", { length: 36 }).references(() => costEntries.id),
    // How the cost of the approved hours was priced: from payroll (loaded) or from the resource plan rate. The rate itself is not kept here: it would reveal pay.
    rateSource: mysqlEnum("rateSource", ["loaded", "resource"]),
    progressEntryId: varchar("progressEntryId", { length: 36 }).references(() => progressEntries.id),
    // Set when an approved payroll shared this employee's pay out by hours: the provisional cost of these hours was replaced by the payroll's, so it must not be counted again.
    supersededByPayrollEntryId: varchar("supersededByPayrollEntryId", { length: 36 }),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    reviewedByUserId: int("reviewedByUserId").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("employee_time_entries_assignment_day_unique").on(table.assignmentId, table.workDate), uniqueIndex("employee_time_entries_cost_entry_unique").on(table.costEntryId), index("employee_time_entries_tenant_project_idx").on(table.tenantId, table.projectId, table.status, table.workDate)],
);

export const employeePerformanceExclusions = mysqlTable(
  "employee_performance_exclusions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    projectId: varchar("projectId", { length: 36 }).notNull(),
    employeeId: varchar("employeeId", { length: 36 }).notNull(),
    sourceType: mysqlEnum("sourceType", ["activity", "action", "rfi", "ncr", "quality_inspection", "field_report", "material_request"]).notNull(),
    sourceId: varchar("sourceId", { length: 36 }).notNull(),
    reason: varchar("reason", { length: 1000 }).notNull(),
    createdByUserId: int("createdByUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("epe_source_unique").on(table.tenantId, table.employeeId, table.sourceType, table.sourceId),
    index("epe_tenant_project_employee_idx").on(table.tenantId, table.projectId, table.employeeId),
    foreignKey({ columns: [table.tenantId], foreignColumns: [companies.id], name: "epe_tenant_fk" }),
    foreignKey({ columns: [table.projectId], foreignColumns: [projects.id], name: "epe_project_fk" }),
    foreignKey({ columns: [table.employeeId], foreignColumns: [employees.id], name: "epe_employee_fk" }),
    foreignKey({ columns: [table.createdByUserId], foreignColumns: [users.id], name: "epe_creator_fk" }),
  ],
);

export const employeePerformanceObjections = mysqlTable(
  "employee_performance_objections",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    projectId: varchar("projectId", { length: 36 }).notNull(),
    employeeId: varchar("employeeId", { length: 36 }).notNull(),
    statement: text("statement").notNull(),
    status: mysqlEnum("status", ["submitted", "under_review", "resolved", "rejected"]).default("submitted").notNull(),
    resolutionNote: varchar("resolutionNote", { length: 1000 }),
    createdByUserId: int("createdByUserId").notNull(),
    reviewedByUserId: int("reviewedByUserId"),
    reviewedAt: timestamp("reviewedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    index("epo_tenant_project_employee_idx").on(table.tenantId, table.projectId, table.employeeId, table.status),
    foreignKey({ columns: [table.tenantId], foreignColumns: [companies.id], name: "epo_tenant_fk" }),
    foreignKey({ columns: [table.projectId], foreignColumns: [projects.id], name: "epo_project_fk" }),
    foreignKey({ columns: [table.employeeId], foreignColumns: [employees.id], name: "epo_employee_fk" }),
    foreignKey({ columns: [table.createdByUserId], foreignColumns: [users.id], name: "epo_creator_fk" }),
    foreignKey({ columns: [table.reviewedByUserId], foreignColumns: [users.id], name: "epo_reviewer_fk" }),
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
    status: mysqlEnum("status", ["trialing", "active", "past_due", "suspended", "cancelled", "expired", "grace_period"]).default("trialing").notNull(),
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

export const commercialPlans = mysqlTable(
  "commercial_plans",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    packageCode: mysqlEnum("packageCode", subscriptionPackageCodes).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("commercial_plans_code_unique").on(table.code), index("commercial_plans_package_active_idx").on(table.packageCode, table.active)],
);

export const commercialFeatures = mysqlTable(
  "commercial_features",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    code: varchar("code", { length: 120 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    productCode: mysqlEnum("productCode", productCodes).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("commercial_features_code_unique").on(table.code), index("commercial_features_product_active_idx").on(table.productCode, table.active)],
);

export const planFeatureEntitlements = mysqlTable(
  "plan_feature_entitlements",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    planId: varchar("planId", { length: 36 }).notNull().references(() => commercialPlans.id),
    featureId: varchar("featureId", { length: 36 }).notNull().references(() => commercialFeatures.id),
    active: boolean("active").default(true).notNull(),
    limitValue: int("limitValue"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("plan_feature_entitlements_plan_feature_unique").on(table.planId, table.featureId), index("plan_feature_entitlements_feature_idx").on(table.featureId)],
);

export const tenantLicenses = mysqlTable(
  "tenant_licenses",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    subscriptionId: varchar("subscriptionId", { length: 36 }).notNull().references(() => subscriptions.id),
    planId: varchar("planId", { length: 36 }).notNull().references(() => commercialPlans.id),
    status: mysqlEnum("status", ["trialing", "active", "past_due", "suspended", "cancelled", "expired", "grace_period"]).default("trialing").notNull(),
    seats: int("seats").default(1).notNull(),
    priceAmount: decimal("priceAmount", { precision: 18, scale: 2 }).default("0").notNull(),
    discountAmount: decimal("discountAmount", { precision: 18, scale: 2 }).default("0").notNull(),
    manualActivation: boolean("manualActivation").default(false).notNull(),
    startsAt: timestamp("startsAt").notNull(),
    endsAt: timestamp("endsAt"),
    trialEndsAt: timestamp("trialEndsAt"),
    graceEndsAt: timestamp("graceEndsAt"),
    createdByUserId: int("createdByUserId").references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("tenant_licenses_subscription_unique").on(table.subscriptionId), index("tenant_licenses_tenant_status_idx").on(table.tenantId, table.status), index("tenant_licenses_plan_idx").on(table.planId)],
);

export const selfServiceSignupAttempts = mysqlTable(
  "self_service_signup_attempts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: int("userId").notNull().references(() => users.id),
    emailHash: varchar("emailHash", { length: 64 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("ssa_user_created_idx").on(table.userId, table.createdAt), index("ssa_email_created_idx").on(table.emailHash, table.createdAt)],
);

export const invoiceCounters = mysqlTable("invoice_counters", {
  id: varchar("id", { length: 40 }).primaryKey(),
  nextNumber: int("nextNumber").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const invoices = mysqlTable(
  "invoices",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    subscriptionId: varchar("subscriptionId", { length: 36 }).notNull().references(() => subscriptions.id),
    sequenceNumber: int("sequenceNumber").notNull(),
    invoiceNumber: varchar("invoiceNumber", { length: 64 }).notNull(),
    status: mysqlEnum("status", ["issued", "void"]).default("issued").notNull(),
    issuedAt: timestamp("issuedAt").notNull(),
    currency: varchar("currency", { length: 3 }).default("SAR").notNull(),
    sellerName: varchar("sellerName", { length: 255 }).notNull(),
    sellerTaxNumber: varchar("sellerTaxNumber", { length: 80 }).notNull(),
    buyerName: varchar("buyerName", { length: 255 }).notNull(),
    buyerTaxNumber: varchar("buyerTaxNumber", { length: 80 }).notNull(),
    subtotalAmount: decimal("subtotalAmount", { precision: 18, scale: 2 }).notNull(),
    vatAmount: decimal("vatAmount", { precision: 18, scale: 2 }).notNull(),
    totalAmount: decimal("totalAmount", { precision: 18, scale: 2 }).notNull(),
    renderer: mysqlEnum("renderer", ["structured_json"]).default("structured_json").notNull(),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("inv_sequence_unique").on(table.sequenceNumber), uniqueIndex("inv_number_unique").on(table.invoiceNumber), index("inv_tenant_issued_idx").on(table.tenantId, table.issuedAt)],
);

export const paymentRecords = mysqlTable(
  "payment_records",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    subscriptionId: varchar("subscriptionId", { length: 36 }).notNull().references(() => subscriptions.id),
    invoiceId: varchar("invoiceId", { length: 36 }).references(() => invoices.id),
    provider: mysqlEnum("provider", ["manual", "mock"]).notNull(),
    operation: mysqlEnum("operation", ["create", "renew", "cancel", "refund"]).notNull(),
    status: mysqlEnum("status", ["pending", "confirmed", "cancelled", "refunded", "failed"]).notNull(),
    providerReference: varchar("providerReference", { length: 120 }).notNull(),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("SAR").notNull(),
    metadata: text("metadata"),
    confirmedAt: timestamp("confirmedAt"),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("pay_provider_ref_unique").on(table.provider, table.providerReference), index("pay_tenant_sub_idx").on(table.tenantId, table.subscriptionId)],
);

export const supportTickets = mysqlTable(
  "support_tickets",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    ownerUserId: int("ownerUserId").references(() => users.id),
    subject: varchar("subject", { length: 255 }).notNull(),
    category: mysqlEnum("category", ["technical", "billing", "account", "general"]).notNull(),
    priority: mysqlEnum("priority", ["low", "normal", "high", "urgent"]).default("normal").notNull(),
    status: mysqlEnum("status", ["open", "waiting_customer", "in_progress", "resolved", "closed"]).default("open").notNull(),
    escalationStatus: mysqlEnum("escalationStatus", ["none", "requested", "escalated"]).default("none").notNull(),
    tagsJson: varchar("tagsJson", { length: 1000 }).default("[]").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("spt_tenant_status_idx").on(table.tenantId, table.status, table.updatedAt), index("spt_owner_status_idx").on(table.ownerUserId, table.status)],
);

export const supportMessages = mysqlTable(
  "support_messages",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    ticketId: varchar("ticketId", { length: 36 }).notNull().references(() => supportTickets.id),
    authorUserId: int("authorUserId").references(() => users.id),
    senderType: mysqlEnum("senderType", ["customer", "agent", "assistant", "system"]).notNull(),
    body: text("body").notNull(),
    citationsJson: text("citationsJson"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("spm_ticket_created_idx").on(table.ticketId, table.createdAt), index("spm_tenant_created_idx").on(table.tenantId, table.createdAt)],
);

export const knowledgeArticles = mysqlTable(
  "knowledge_articles",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    sourceDocumentId: varchar("sourceDocumentId", { length: 36 }).notNull().references(() => projectDocuments.id),
    title: varchar("title", { length: 255 }).notNull(),
    content: text("content").notNull(),
    status: mysqlEnum("status", ["draft", "published", "archived"]).default("draft").notNull(),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    publishedByUserId: int("publishedByUserId").references(() => users.id),
    publishedAt: timestamp("publishedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("kba_document_unique").on(table.sourceDocumentId), index("kba_tenant_status_idx").on(table.tenantId, table.status, table.updatedAt)],
);

export const scheduledJobs = mysqlTable(
  "scheduled_jobs",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    purpose: mysqlEnum("purpose", ["license_lifecycle"]).notNull(),
    scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }).unique(),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [index("scheduled_jobs_task_uid_idx").on(table.scheduleCronTaskUid)],
);

export const tenantLicenseFeatureOverrides = mysqlTable(
  "tenant_license_feature_overrides",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantLicenseId: varchar("tenantLicenseId", { length: 36 }).notNull().references(() => tenantLicenses.id),
    featureId: varchar("featureId", { length: 36 }).notNull().references(() => commercialFeatures.id),
    active: boolean("active").default(true).notNull(),
    limitValue: int("limitValue"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("tenant_license_feature_overrides_license_feature_unique").on(table.tenantLicenseId, table.featureId), index("tenant_license_feature_overrides_feature_idx").on(table.featureId)],
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
    // Who the other side is (G-103): a client has no register, so it stays a name; a supplier is chosen from the tenant's supplier register and its name is copied from there.
    counterpartyKind: mysqlEnum("counterpartyKind", ["client", "supplier", "other"]).default("other").notNull(),
    supplierId: varchar("supplierId", { length: 36 }),
    contractValue: decimal("contractValue", { precision: 18, scale: 2 }).default("0").notNull(),
    currency: varchar("currency", { length: 3 }).default("USD").notNull(),
    status: mysqlEnum("status", ["draft", "active", "suspended", "closed", "cancelled"]).default("draft").notNull(),
    startAt: timestamp("startAt"),
    endAt: timestamp("endAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("contracts_project_code_unique").on(table.projectId, table.code), index("contracts_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status), index("contracts_supplier_idx").on(table.supplierId), foreignKey({ columns: [table.supplierId], foreignColumns: [suppliers.id], name: "contracts_supplier_fk" })],
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

export const masterPlanSnapshots = mysqlTable(
  "master_plan_snapshots",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    masterPlanVersionId: varchar("masterPlanVersionId", { length: 36 }).notNull(),
    label: varchar("label", { length: 160 }).notNull(),
    metric: mysqlEnum("metric", ["progress", "status", "cost", "risk", "quality", "hse", "production", "custom"]).notNull(),
    filtersJson: text("filtersJson").notNull(),
    viewportJson: text("viewportJson").notNull(),
    layersJson: text("layersJson").notNull(),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    foreignKey({ columns: [table.masterPlanVersionId], foreignColumns: [masterPlanVersions.id], name: "mps_plan_version_fk" }),
    index("master_plan_snapshots_tenant_project_version_creator_idx").on(table.tenantId, table.projectId, table.masterPlanVersionId, table.createdByUserId, table.createdAt),
  ],
);

export const masterPlanVisualizationRules = mysqlTable(
  "master_plan_visualization_rules",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    projectId: varchar("projectId", { length: 36 }).notNull(),
    metric: mysqlEnum("metric", ["progress", "status", "cost"]).notNull(),
    rulesJson: text("rulesJson").notNull(),
    createdByUserId: int("createdByUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    foreignKey({ columns: [table.tenantId], foreignColumns: [companies.id], name: "mpvr_tenant_fk" }),
    foreignKey({ columns: [table.projectId], foreignColumns: [projects.id], name: "mpvr_project_fk" }),
    foreignKey({ columns: [table.createdByUserId], foreignColumns: [users.id], name: "mpvr_creator_fk" }),
    uniqueIndex("master_plan_visualization_rules_project_metric_unique").on(table.tenantId, table.projectId, table.metric),
    index("master_plan_visualization_rules_tenant_project_idx").on(table.tenantId, table.projectId, table.updatedAt),
  ],
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

export const fieldReports = mysqlTable(
  "field_reports",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    reportNumber: varchar("reportNumber", { length: 120 }).notNull(),
    reportType: mysqlEnum("reportType", ["daily", "inspection", "progress"]).notNull(),
    reportedAt: timestamp("reportedAt").notNull(),
    shift: mysqlEnum("shift", ["day", "night"]).default("day").notNull(),
    workforceCount: int("workforceCount").default(0).notNull(),
    weather: varchar("weather", { length: 160 }),
    summary: text("summary").notNull(),
    status: mysqlEnum("status", ["draft", "submitted", "reviewed", "approved", "rejected"]).default("draft").notNull(),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("field_reports_project_number_unique").on(table.projectId, table.reportNumber),
    index("field_reports_tenant_project_date_status_idx").on(table.tenantId, table.projectId, table.reportedAt, table.status),
  ],
);

export const qualityInspections = mysqlTable(
  "quality_inspections",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    inspectionNumber: varchar("inspectionNumber", { length: 120 }).notNull(),
    inspectionType: mysqlEnum("inspectionType", ["hold_point", "witness", "surveillance", "testing"]).notNull(),
    inspectedAt: timestamp("inspectedAt").notNull(),
    outcome: mysqlEnum("outcome", ["pass", "fail", "conditional"]).notNull(),
    summary: text("summary").notNull(),
    status: mysqlEnum("status", ["draft", "submitted", "accepted", "rejected"]).default("draft").notNull(),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("quality_inspections_project_number_unique").on(table.projectId, table.inspectionNumber),
    index("quality_inspections_tenant_project_date_status_idx").on(table.tenantId, table.projectId, table.inspectedAt, table.status),
  ],
);

export const purchaseOrders = mysqlTable(
  "purchase_orders",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    contractId: varchar("contractId", { length: 36 }).references(() => contracts.id),
    commitmentId: varchar("commitmentId", { length: 36 }).references(() => commitments.id),
    // The WBS item the order is for, so its open commitment can be shown beside plan, actual and forecast at that level.
    wbsItemId: varchar("wbsItemId", { length: 36 }).references(() => wbsItems.id),
    // The supplier register entry the order is placed with (G-103); supplierName stays as the name printed on the order and is copied from the register when an entry is chosen.
    supplierId: varchar("supplierId", { length: 36 }),
    purchaseOrderNumber: varchar("purchaseOrderNumber", { length: 120 }).notNull(),
    supplierName: varchar("supplierName", { length: 240 }).notNull(),
    orderDate: timestamp("orderDate").notNull(),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    summary: text("summary").notNull(),
    status: mysqlEnum("status", ["draft", "submitted", "approved", "issued", "received", "cancelled"]).default("draft").notNull(),
    receivedAt: timestamp("receivedAt"),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("purchase_orders_project_number_unique").on(table.projectId, table.purchaseOrderNumber),
    index("purchase_orders_tenant_project_date_status_idx").on(table.tenantId, table.projectId, table.orderDate, table.status),
    index("purchase_orders_contract_idx").on(table.contractId),
    index("purchase_orders_commitment_idx").on(table.commitmentId),
    index("purchase_orders_wbs_idx").on(table.wbsItemId),
    index("purchase_orders_supplier_idx").on(table.supplierId),
    foreignKey({ columns: [table.supplierId], foreignColumns: [suppliers.id], name: "purchase_orders_supplier_fk" }),
  ],
);

export const goodsReceiptNotes = mysqlTable(
  "goods_receipt_notes",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    projectId: varchar("projectId", { length: 36 }).notNull(),
    purchaseOrderId: varchar("purchaseOrderId", { length: 36 }).notNull(),
    materialId: varchar("materialId", { length: 36 }).notNull(),
    qualityInspectionId: varchar("qualityInspectionId", { length: 36 }),
    ncrId: varchar("ncrId", { length: 36 }),
    grnNumber: varchar("grnNumber", { length: 120 }).notNull(),
    receivedQuantity: decimal("receivedQuantity", { precision: 18, scale: 3 }).notNull(),
    rejectedQuantity: decimal("rejectedQuantity", { precision: 18, scale: 3 }).notNull(),
    unitCost: decimal("unitCost", { precision: 18, scale: 2 }).notNull().default("0"),
    unitOfMeasure: varchar("unitOfMeasure", { length: 40 }).notNull(),
    receivedAt: timestamp("receivedAt").notNull(),
    note: text("note"),
    costEntryId: varchar("costEntryId", { length: 36 }).references(() => costEntries.id),
    // 'warehouse_stock' raises the shelf and charges the cost when the material is issued to a WBS item; 'direct_to_site' charges the cost at receipt and never touches the shelf.
    // Rows that existed before stock valuation are 'direct_to_site': their cost was booked at receipt and no stock was ever raised.
    receiptMode: mysqlEnum("receiptMode", ["warehouse_stock", "direct_to_site"]).default("direct_to_site").notNull(),
    warehouseId: varchar("warehouseId", { length: 36 }),
    inventoryTransactionId: varchar("inventoryTransactionId", { length: 36 }),
    createdByUserId: int("createdByUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("grn_project_number_unique").on(table.projectId, table.grnNumber),
    index("grn_tenant_project_date_idx").on(table.tenantId, table.projectId, table.receivedAt),
    index("grn_purchase_order_idx").on(table.purchaseOrderId),
    index("grn_material_idx").on(table.materialId),
    uniqueIndex("grn_cost_entry_unique").on(table.costEntryId),
    uniqueIndex("grn_inventory_transaction_unique").on(table.inventoryTransactionId),
    foreignKey({ columns: [table.tenantId], foreignColumns: [companies.id], name: "grn_tenant_fk" }),
    foreignKey({ columns: [table.projectId], foreignColumns: [projects.id], name: "grn_project_fk" }),
    foreignKey({ columns: [table.purchaseOrderId], foreignColumns: [purchaseOrders.id], name: "grn_purchase_order_fk" }),
    foreignKey({ columns: [table.materialId], foreignColumns: [materialMasters.id], name: "grn_material_fk" }),
    foreignKey({ columns: [table.qualityInspectionId], foreignColumns: [qualityInspections.id], name: "grn_quality_fk" }),
    foreignKey({ columns: [table.ncrId], foreignColumns: [ncrs.id], name: "grn_ncr_fk" }),
    foreignKey({ columns: [table.createdByUserId], foreignColumns: [users.id], name: "grn_creator_fk" }),
  ],
);

export const suppliers = mysqlTable(
  "suppliers",
  { id: varchar("id", { length: 36 }).primaryKey(), tenantId: varchar("tenantId", { length: 36 }).notNull(), code: varchar("code", { length: 80 }).notNull(), legalName: varchar("legalName", { length: 240 }).notNull(), contactName: varchar("contactName", { length: 160 }), contactEmail: varchar("contactEmail", { length: 254 }), contactPhone: varchar("contactPhone", { length: 60 }), active: boolean("active").default(true).notNull(), createdByUserId: int("createdByUserId").notNull(), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() },
  table => [uniqueIndex("suppliers_tenant_code_unique").on(table.tenantId, table.code), index("suppliers_tenant_active_idx").on(table.tenantId, table.active), foreignKey({ columns: [table.tenantId], foreignColumns: [companies.id], name: "sup_tenant_fk" }), foreignKey({ columns: [table.createdByUserId], foreignColumns: [users.id], name: "sup_creator_fk" })],
);

export const procurementRequisitions = mysqlTable(
  "procurement_requisitions",
  { id: varchar("id", { length: 36 }).primaryKey(), tenantId: varchar("tenantId", { length: 36 }).notNull(), projectId: varchar("projectId", { length: 36 }).notNull(), requisitionNumber: varchar("requisitionNumber", { length: 120 }).notNull(), supplierId: varchar("supplierId", { length: 36 }), materialId: varchar("materialId", { length: 36 }), wbsItemId: varchar("wbsItemId", { length: 36 }), activityId: varchar("activityId", { length: 36 }), purchaseOrderId: varchar("purchaseOrderId", { length: 36 }), purchaseOrderLinkedAt: timestamp("purchaseOrderLinkedAt"), purchaseOrderLinkedByUserId: int("purchaseOrderLinkedByUserId"), description: text("description").notNull(), requestedQuantity: decimal("requestedQuantity", { precision: 18, scale: 3 }).notNull(), unitOfMeasure: varchar("unitOfMeasure", { length: 40 }).notNull(), requiredAt: timestamp("requiredAt").notNull(), status: mysqlEnum("status", ["draft", "submitted", "approved", "partially_issued", "closed", "rejected", "cancelled"]).default("draft").notNull(), reviewedAt: timestamp("reviewedAt"), createdByUserId: int("createdByUserId").notNull(), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() },
  table => [uniqueIndex("procurement_requisitions_project_number_unique").on(table.projectId, table.requisitionNumber), index("procurement_requisitions_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status), index("procurement_requisitions_purchase_order_idx").on(table.purchaseOrderId), foreignKey({ columns: [table.tenantId], foreignColumns: [companies.id], name: "prq_tenant_fk" }), foreignKey({ columns: [table.projectId], foreignColumns: [projects.id], name: "prq_project_fk" }), foreignKey({ columns: [table.supplierId], foreignColumns: [suppliers.id], name: "prq_supplier_fk" }), foreignKey({ columns: [table.materialId], foreignColumns: [materialMasters.id], name: "prq_material_fk" }), foreignKey({ columns: [table.wbsItemId], foreignColumns: [wbsItems.id], name: "prq_wbs_fk" }), foreignKey({ columns: [table.activityId], foreignColumns: [activities.id], name: "prq_activity_fk" }), foreignKey({ columns: [table.purchaseOrderId], foreignColumns: [purchaseOrders.id], name: "prq_purchase_order_fk" }), foreignKey({ columns: [table.purchaseOrderLinkedByUserId], foreignColumns: [users.id], name: "prq_po_linker_fk" }), foreignKey({ columns: [table.createdByUserId], foreignColumns: [users.id], name: "prq_creator_fk" })],
);

export const materialMasters = mysqlTable(
  "material_masters",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    code: varchar("code", { length: 120 }).notNull(),
    description: varchar("description", { length: 255 }).notNull(),
    unitOfMeasure: varchar("unitOfMeasure", { length: 40 }).notNull(),
    category: varchar("category", { length: 120 }).notNull(),
    referenceSpecification: varchar("referenceSpecification", { length: 255 }),
    active: boolean("active").default(true).notNull(),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("material_masters_tenant_code_unique").on(table.tenantId, table.code),
    index("material_masters_tenant_category_active_idx").on(table.tenantId, table.category, table.active),
  ],
);

export const projectMaterialOverrides = mysqlTable(
  "project_material_overrides",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    materialId: varchar("materialId", { length: 36 }).notNull().references(() => materialMasters.id),
    projectDescription: varchar("projectDescription", { length: 255 }),
    referenceSpecification: varchar("referenceSpecification", { length: 255 }),
    reorderLevel: decimal("reorderLevel", { precision: 18, scale: 3 }),
    active: boolean("active").default(true).notNull(),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("project_material_overrides_project_material_unique").on(table.projectId, table.materialId),
    index("project_material_overrides_tenant_project_idx").on(table.tenantId, table.projectId, table.materialId),
  ],
);

export const projectWarehouses = mysqlTable(
  "project_warehouses",
  { id: varchar("id", { length: 36 }).primaryKey(), tenantId: varchar("tenantId", { length: 36 }).notNull(), projectId: varchar("projectId", { length: 36 }).notNull(), code: varchar("code", { length: 80 }).notNull(), name: varchar("name", { length: 160 }).notNull(), locationDescription: varchar("locationDescription", { length: 255 }), active: boolean("active").default(true).notNull(), createdByUserId: int("createdByUserId").notNull(), createdAt: timestamp("createdAt").defaultNow().notNull(), updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull() },
  table => [uniqueIndex("project_warehouses_project_code_unique").on(table.projectId, table.code), index("project_warehouses_tenant_project_active_idx").on(table.tenantId, table.projectId, table.active), foreignKey({ columns: [table.tenantId], foreignColumns: [companies.id], name: "pwh_tenant_fk" }), foreignKey({ columns: [table.projectId], foreignColumns: [projects.id], name: "pwh_project_fk" }), foreignKey({ columns: [table.createdByUserId], foreignColumns: [users.id], name: "pwh_creator_fk" })],
);

export const warehouseInventoryTransfers = mysqlTable(
  "warehouse_inventory_transfers",
  { id: varchar("id", { length: 36 }).primaryKey(), tenantId: varchar("tenantId", { length: 36 }).notNull(), projectId: varchar("projectId", { length: 36 }).notNull(), sourceWarehouseId: varchar("sourceWarehouseId", { length: 36 }).notNull(), destinationWarehouseId: varchar("destinationWarehouseId", { length: 36 }).notNull(), materialId: varchar("materialId", { length: 36 }).notNull(), quantity: decimal("quantity", { precision: 18, scale: 3 }).notNull(), referenceNumber: varchar("referenceNumber", { length: 120 }), note: varchar("note", { length: 500 }), transferredAt: timestamp("transferredAt").notNull(), createdByUserId: int("createdByUserId").notNull(), createdAt: timestamp("createdAt").defaultNow().notNull() },
  table => [index("witf_tenant_project_date_idx").on(table.tenantId, table.projectId, table.transferredAt), index("witf_source_destination_idx").on(table.sourceWarehouseId, table.destinationWarehouseId), foreignKey({ columns: [table.tenantId], foreignColumns: [companies.id], name: "witf_tenant_fk" }), foreignKey({ columns: [table.projectId], foreignColumns: [projects.id], name: "witf_project_fk" }), foreignKey({ columns: [table.sourceWarehouseId], foreignColumns: [projectWarehouses.id], name: "witf_source_fk" }), foreignKey({ columns: [table.destinationWarehouseId], foreignColumns: [projectWarehouses.id], name: "witf_destination_fk" }), foreignKey({ columns: [table.materialId], foreignColumns: [materialMasters.id], name: "witf_material_fk" }), foreignKey({ columns: [table.createdByUserId], foreignColumns: [users.id], name: "witf_creator_fk" })],
);

export const warehouseInventoryTransactions = mysqlTable(
  "warehouse_inventory_transactions",
  { id: varchar("id", { length: 36 }).primaryKey(), tenantId: varchar("tenantId", { length: 36 }).notNull(), projectId: varchar("projectId", { length: 36 }).notNull(), warehouseId: varchar("warehouseId", { length: 36 }).notNull(), materialId: varchar("materialId", { length: 36 }).notNull(), requisitionId: varchar("requisitionId", { length: 36 }), transferId: varchar("transferId", { length: 36 }), transactionType: mysqlEnum("transactionType", ["receipt", "issue", "adjustment"]).notNull(), quantityDelta: decimal("quantityDelta", { precision: 18, scale: 3 }).notNull(), unitCost: decimal("unitCost", { precision: 18, scale: 4 }), valueDelta: decimal("valueDelta", { precision: 18, scale: 2 }), referenceNumber: varchar("referenceNumber", { length: 120 }), note: varchar("note", { length: 500 }), occurredAt: timestamp("occurredAt").notNull(), createdByUserId: int("createdByUserId").notNull(), createdAt: timestamp("createdAt").defaultNow().notNull() },
  table => [index("warehouse_inventory_transactions_tenant_project_date_idx").on(table.tenantId, table.projectId, table.occurredAt), index("warehouse_inventory_transactions_warehouse_material_idx").on(table.warehouseId, table.materialId), index("warehouse_inventory_transactions_requisition_idx").on(table.requisitionId, table.transactionType), index("wit_transfer_idx").on(table.transferId), foreignKey({ columns: [table.tenantId], foreignColumns: [companies.id], name: "wit_tenant_fk" }), foreignKey({ columns: [table.projectId], foreignColumns: [projects.id], name: "wit_project_fk" }), foreignKey({ columns: [table.warehouseId], foreignColumns: [projectWarehouses.id], name: "wit_warehouse_fk" }), foreignKey({ columns: [table.materialId], foreignColumns: [materialMasters.id], name: "wit_material_fk" }), foreignKey({ columns: [table.requisitionId], foreignColumns: [procurementRequisitions.id], name: "wit_requisition_fk" }), foreignKey({ columns: [table.transferId], foreignColumns: [warehouseInventoryTransfers.id], name: "wit_transfer_fk" }), foreignKey({ columns: [table.createdByUserId], foreignColumns: [users.id], name: "wit_creator_fk" })],
);

export const materialIssues = mysqlTable(
  "material_issues",
  { id: varchar("id", { length: 36 }).primaryKey(), tenantId: varchar("tenantId", { length: 36 }).notNull(), projectId: varchar("projectId", { length: 36 }).notNull(), inventoryTransactionId: varchar("inventoryTransactionId", { length: 36 }).notNull(), costEntryId: varchar("costEntryId", { length: 36 }).notNull(), materialId: varchar("materialId", { length: 36 }).notNull(), wbsItemId: varchar("wbsItemId", { length: 36 }).notNull(), activityId: varchar("activityId", { length: 36 }), issuedQuantity: decimal("issuedQuantity", { precision: 18, scale: 3 }).notNull(), unitCost: decimal("unitCost", { precision: 18, scale: 2 }).notNull(), totalCost: decimal("totalCost", { precision: 18, scale: 2 }).notNull(), issuedAt: timestamp("issuedAt").notNull(), createdByUserId: int("createdByUserId").notNull(), createdAt: timestamp("createdAt").defaultNow().notNull() },
  table => [uniqueIndex("material_issues_tx_unique").on(table.inventoryTransactionId), uniqueIndex("material_issues_cost_unique").on(table.costEntryId), index("material_issues_tenant_project_idx").on(table.tenantId, table.projectId, table.issuedAt), index("material_issues_wbs_activity_idx").on(table.wbsItemId, table.activityId), foreignKey({ columns: [table.tenantId], foreignColumns: [companies.id], name: "mi_tenant_fk" }), foreignKey({ columns: [table.projectId], foreignColumns: [projects.id], name: "mi_project_fk" }), foreignKey({ columns: [table.inventoryTransactionId], foreignColumns: [warehouseInventoryTransactions.id], name: "mi_tx_fk" }), foreignKey({ columns: [table.costEntryId], foreignColumns: [costEntries.id], name: "mi_cost_fk" }), foreignKey({ columns: [table.materialId], foreignColumns: [materialMasters.id], name: "mi_material_fk" }), foreignKey({ columns: [table.wbsItemId], foreignColumns: [wbsItems.id], name: "mi_wbs_fk" }), foreignKey({ columns: [table.activityId], foreignColumns: [activities.id], name: "mi_activity_fk" }), foreignKey({ columns: [table.createdByUserId], foreignColumns: [users.id], name: "mi_creator_fk" })],
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
    // Effect of an APPROVED change order on the client contract value (can be negative).
    // impactCost is the cost side; this is the price side the profitability screen adds.
    contractValueImpact: decimal("contractValueImpact", { precision: 18, scale: 2 }).default("0").notNull(),
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
    // What the cost is and the document it came from, so profit can be drilled down to its source.
    category: mysqlEnum("category", ["materials", "labour", "subcontract", "other"]).default("other").notNull(),
    sourceType: varchar("sourceType", { length: 40 }),
    sourceId: varchar("sourceId", { length: 36 }),
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
    // Profitability extension (null on snapshots taken before it existed).
    adjustedContractValue: decimal("adjustedContractValue", { precision: 18, scale: 2 }),
    fpac: decimal("fpac", { precision: 18, scale: 2 }),
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

export const controlRecordLinks = mysqlTable(
  "control_record_links",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    sourceType: mysqlEnum("sourceType", ["risk", "issue", "action", "decision"]).notNull(),
    sourceId: varchar("sourceId", { length: 36 }).notNull(),
    targetType: mysqlEnum("targetType", ["risk", "issue", "action", "decision", "rfi", "ncr"]).notNull(),
    targetId: varchar("targetId", { length: 36 }).notNull(),
    createdByUserId: int("createdByUserId").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("control_record_links_project_source_target_unique").on(table.projectId, table.sourceType, table.sourceId, table.targetType, table.targetId),
    index("control_record_links_tenant_project_source_idx").on(table.tenantId, table.projectId, table.sourceType, table.sourceId),
    index("control_record_links_tenant_project_target_idx").on(table.tenantId, table.projectId, table.targetType, table.targetId),
  ],
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
    sourceFormat: mysqlEnum("sourceFormat", ["xlsx", "csv", "xer"]).notNull(),
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

export const dataImportRowResults = mysqlTable(
  "data_import_row_results",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    importId: varchar("importId", { length: 36 }).notNull().references(() => dataImports.id),
    rowNumber: int("rowNumber").notNull(),
    rowKey: varchar("rowKey", { length: 160 }).notNull(),
    action: mysqlEnum("action", ["created", "updated", "skipped"]).notNull(),
    entityId: varchar("entityId", { length: 36 }),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    index("data_import_row_results_import_row_idx").on(table.importId, table.rowNumber),
    uniqueIndex("data_import_row_results_import_row_action_unique").on(table.importId, table.rowNumber, table.action),
  ],
);

export const boqItems = mysqlTable(
  "boq_items",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    projectId: varchar("projectId", { length: 36 }).notNull(),
    wbsItemId: varchar("wbsItemId", { length: 36 }),
    code: varchar("code", { length: 80 }).notNull(),
    description: text("description").notNull(),
    unitOfMeasure: varchar("unitOfMeasure", { length: 40 }).notNull(),
    quantity: decimal("quantity", { precision: 18, scale: 3 }).notNull(),
    unitRate: decimal("unitRate", { precision: 18, scale: 2 }).notNull(),
    totalAmount: decimal("totalAmount", { precision: 18, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("SAR").notNull(),
    status: mysqlEnum("status", ["active", "cancelled"]).default("active").notNull(),
    createdByUserId: int("createdByUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("boq_project_code_unique").on(table.projectId, table.code),
    index("boq_tenant_project_idx").on(table.tenantId, table.projectId),
    foreignKey({ columns: [table.tenantId], foreignColumns: [companies.id], name: "boq_tenant_fk" }),
    foreignKey({ columns: [table.projectId], foreignColumns: [projects.id], name: "boq_project_fk" }),
    foreignKey({ columns: [table.wbsItemId], foreignColumns: [wbsItems.id], name: "boq_wbs_fk" }),
    foreignKey({ columns: [table.createdByUserId], foreignColumns: [users.id], name: "boq_creator_fk" }),
  ]
);

export const subcontractContracts = mysqlTable(
  "subcontract_contracts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    projectId: varchar("projectId", { length: 36 }).notNull(),
    code: varchar("code", { length: 80 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    subcontractorName: varchar("subcontractorName", { length: 255 }).notNull(),
    // The supplier-register entry the subcontract is with (G-103); the name above is copied from it when one is chosen.
    supplierId: varchar("supplierId", { length: 36 }),
    contractValue: decimal("contractValue", { precision: 18, scale: 2 }).notNull(),
    retentionPercent: decimal("retentionPercent", { precision: 5, scale: 2 }).default("0").notNull(),
    advancePaymentPercent: decimal("advancePercent", { precision: 5, scale: 2 }).default("0").notNull(),
    status: mysqlEnum("status", ["draft", "active", "suspended", "closed", "cancelled"]).default("draft").notNull(),
    createdByUserId: int("createdByUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("subcontract_project_code_unique").on(table.projectId, table.code),
    index("subcontract_tenant_project_idx").on(table.tenantId, table.projectId),
    index("subcontract_supplier_idx").on(table.supplierId),
    foreignKey({ columns: [table.supplierId], foreignColumns: [suppliers.id], name: "subcon_supplier_fk" }),
    foreignKey({ columns: [table.tenantId], foreignColumns: [companies.id], name: "subcon_tenant_fk" }),
    foreignKey({ columns: [table.projectId], foreignColumns: [projects.id], name: "subcon_project_fk" }),
    foreignKey({ columns: [table.createdByUserId], foreignColumns: [users.id], name: "subcon_creator_fk" }),
  ]
);

export const subcontractCertificates = mysqlTable(
  "subcontract_certificates",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    projectId: varchar("projectId", { length: 36 }).notNull(),
    subcontractId: varchar("subcontractId", { length: 36 }).notNull(),
    certificateNumber: varchar("certificateNumber", { length: 80 }).notNull(),
    periodStart: timestamp("periodStart").notNull(),
    periodEnd: timestamp("periodEnd").notNull(),
    grossAmount: decimal("grossAmount", { precision: 18, scale: 2 }).notNull(),
    retentionAmount: decimal("retentionAmount", { precision: 18, scale: 2 }).default("0").notNull(),
    advanceRecoveryAmount: decimal("advanceRecoveryAmount", { precision: 18, scale: 2 }).default("0").notNull(),
    netAmount: decimal("netAmount", { precision: 18, scale: 2 }).notNull(),
    status: mysqlEnum("status", ["draft", "submitted", "approved", "paid", "cancelled"]).default("draft").notNull(),
    approvedByUserId: int("approvedByUserId"),
    approvedAt: timestamp("approvedAt"),
    createdByUserId: int("createdByUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("subcert_project_number_unique").on(table.projectId, table.certificateNumber),
    index("subcert_tenant_project_idx").on(table.tenantId, table.projectId),
    foreignKey({ columns: [table.tenantId], foreignColumns: [companies.id], name: "subcert_tenant_fk" }),
    foreignKey({ columns: [table.projectId], foreignColumns: [projects.id], name: "subcert_project_fk" }),
    foreignKey({ columns: [table.subcontractId], foreignColumns: [subcontractContracts.id], name: "subcert_contract_fk" }),
    foreignKey({ columns: [table.approvedByUserId], foreignColumns: [users.id], name: "subcert_approver_fk" }),
    foreignKey({ columns: [table.createdByUserId], foreignColumns: [users.id], name: "subcert_creator_fk" }),
  ]
);

export const subcontractCertificateLines = mysqlTable(
  "subcontract_certificate_lines",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    certificateId: varchar("certificateId", { length: 36 }).notNull(),
    boqItemId: varchar("boqItemId", { length: 36 }).notNull(),
    previousQuantity: decimal("previousQuantity", { precision: 18, scale: 3 }).notNull(),
    currentQuantity: decimal("currentQuantity", { precision: 18, scale: 3 }).notNull(),
    cumulativeQuantity: decimal("cumulativeQuantity", { precision: 18, scale: 3 }).notNull(),
    unitRate: decimal("unitRate", { precision: 18, scale: 2 }).notNull(),
    currentAmount: decimal("currentAmount", { precision: 18, scale: 2 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("subcert_line_unique").on(table.certificateId, table.boqItemId),
    foreignKey({ columns: [table.certificateId], foreignColumns: [subcontractCertificates.id], name: "subline_cert_fk" }),
    foreignKey({ columns: [table.boqItemId], foreignColumns: [boqItems.id], name: "subline_boq_fk" }),
  ]
);

export const projectCommercialInvoices = mysqlTable(
  "project_commercial_invoices",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull(),
    projectId: varchar("projectId", { length: 36 }).notNull(),
    invoiceNumber: varchar("invoiceNumber", { length: 80 }).notNull(),
    invoiceDate: timestamp("invoiceDate").notNull(),
    clientName: varchar("clientName", { length: 255 }).notNull(),
    amount: decimal("amount", { precision: 18, scale: 2 }).notNull(),
    vatAmount: decimal("vatAmount", { precision: 18, scale: 2 }).notNull(),
    totalAmount: decimal("totalAmount", { precision: 18, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("SAR").notNull(),
    status: mysqlEnum("status", ["draft", "issued", "paid", "void"]).default("draft").notNull(),
    // When the money arrived: what places a receipt in a month of the cash flow.
    paidAt: timestamp("paidAt"),
    createdByUserId: int("createdByUserId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [
    uniqueIndex("proj_inv_project_number_unique").on(table.projectId, table.invoiceNumber),
    index("proj_inv_tenant_project_idx").on(table.tenantId, table.projectId),
    foreignKey({ columns: [table.tenantId], foreignColumns: [companies.id], name: "proinv_tenant_fk" }),
    foreignKey({ columns: [table.projectId], foreignColumns: [projects.id], name: "proinv_project_fk" }),
    foreignKey({ columns: [table.createdByUserId], foreignColumns: [users.id], name: "proinv_creator_fk" }),
  ]
);

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type ProductCode = (typeof productCodes)[number];
export type SubscriptionPackageCode = (typeof subscriptionPackageCodes)[number];


export const pmcZones = mysqlTable(
  "pmc_zones",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("pmc_zones_project_code_unique").on(table.projectId, table.code), index("pmc_zones_tenant_project_idx").on(table.tenantId, table.projectId)],
);

export const pmcBlocks = mysqlTable(
  "pmc_blocks",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    zoneId: varchar("zoneId", { length: 36 }).notNull().references(() => pmcZones.id),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("pmc_blocks_project_code_unique").on(table.projectId, table.code), index("pmc_blocks_tenant_project_zone_idx").on(table.tenantId, table.projectId, table.zoneId)],
);

export const pmcUnits = mysqlTable(
  "pmc_units",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    blockId: varchar("blockId", { length: 36 }).notNull().references(() => pmcBlocks.id),
    unitNumber: int("unitNumber").notNull(),
    modelCode: varchar("modelCode", { length: 80 }).notNull(),
    saleStatus: varchar("saleStatus", { length: 80 }),
    geometryJson: text("geometryJson"),
    unitWeight: decimal("unitWeight", { precision: 12, scale: 4 }).default("1").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("pmc_units_project_number_unique").on(table.projectId, table.unitNumber), index("pmc_units_tenant_project_block_idx").on(table.tenantId, table.projectId, table.blockId)],
);

export const pmcActivityGroups = mysqlTable(
  "pmc_activity_groups",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("pmc_groups_project_code_unique").on(table.projectId, table.code), index("pmc_groups_tenant_project_idx").on(table.tenantId, table.projectId)],
);

export const pmcActivityStages = mysqlTable(
  "pmc_activity_stages",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    groupId: varchar("groupId", { length: 36 }).notNull().references(() => pmcActivityGroups.id),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("pmc_stages_project_code_unique").on(table.projectId, table.code), index("pmc_stages_tenant_project_group_idx").on(table.tenantId, table.projectId, table.groupId)],
);

export const pmcActivityDefinitions = mysqlTable(
  "pmc_activity_definitions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    groupId: varchar("groupId", { length: 36 }).notNull().references(() => pmcActivityGroups.id),
    stageId: varchar("stageId", { length: 36 }).notNull().references(() => pmcActivityStages.id),
    wbsItemId: varchar("wbsItemId", { length: 36 }).references(() => wbsItems.id),
    modelCode: varchar("modelCode", { length: 80 }).notNull(),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    weightPercent: decimal("weightPercent", { precision: 7, scale: 4 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("pmc_activity_defs_model_code_unique").on(table.projectId, table.modelCode, table.code), index("pmc_activity_defs_tenant_project_model_idx").on(table.tenantId, table.projectId, table.modelCode)],
);

export const pmcUnitActivityProgress = mysqlTable(
  "pmc_unit_activity_progress",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    unitId: varchar("unitId", { length: 36 }).notNull().references(() => pmcUnits.id),
    activityDefinitionId: varchar("activityDefinitionId", { length: 36 }).notNull(),
    status: mysqlEnum("status", ["NOT_STARTED", "IN_PROGRESS", "UNDER_REVIEW", "COMPLETE"]).default("NOT_STARTED").notNull(),
    // Where the cell stands in the verifier / disbursement list the project configured.
    verificationStatusId: varchar("verificationStatusId", { length: 36 }),
    assignedUserId: int("assignedUserId").references(() => users.id),
    lastChangedByUserId: int("lastChangedByUserId").references(() => users.id),
    lastChangedAt: timestamp("lastChangedAt").defaultNow().notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("pmc_unit_activity_unique").on(table.unitId, table.activityDefinitionId), index("pmc_unit_progress_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status), foreignKey({ columns: [table.activityDefinitionId], foreignColumns: [pmcActivityDefinitions.id], name: "pmc_progress_activity_fk" }), foreignKey({ columns: [table.verificationStatusId], foreignColumns: [pmcVerificationStatuses.id], name: "pmc_progress_verification_fk" })],
);

export const pmcUnitActivityHistory = mysqlTable(
  "pmc_unit_activity_history",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    unitActivityProgressId: varchar("unitActivityProgressId", { length: 36 }).notNull(),
    fromStatus: mysqlEnum("fromStatus", ["NOT_STARTED", "IN_PROGRESS", "UNDER_REVIEW", "COMPLETE"]),
    toStatus: mysqlEnum("toStatus", ["NOT_STARTED", "IN_PROGRESS", "UNDER_REVIEW", "COMPLETE"]).notNull(),
    changedByUserId: int("changedByUserId").notNull().references(() => users.id),
    changedAt: timestamp("changedAt").defaultNow().notNull(),
    note: varchar("note", { length: 1000 }),
  },
  table => [index("pmc_history_tenant_project_changed_idx").on(table.tenantId, table.projectId, table.changedAt), foreignKey({ columns: [table.unitActivityProgressId], foreignColumns: [pmcUnitActivityProgress.id], name: "pmc_hist_progress_fk" })],
);

export const pmcVerificationStatuses = mysqlTable(
  "pmc_verification_statuses",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    code: varchar("code", { length: 80 }).notNull(),
    label: varchar("label", { length: 160 }).notNull(),
    sortOrder: int("sortOrder").default(0).notNull(),
    active: boolean("active").default(true).notNull(),
    // A status that means "waiting on the verifier"; screen 9 lists cells in these and how long they have waited.
    pending: boolean("pending").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("pmc_verification_status_project_code_unique").on(table.projectId, table.code), index("pmc_verification_status_tenant_project_idx").on(table.tenantId, table.projectId, table.active)],
);

export const pmcInspectionRequests = mysqlTable(
  "pmc_inspection_requests",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    requestCode: varchar("requestCode", { length: 80 }).notNull(),
    activityDefinitionId: varchar("activityDefinitionId", { length: 36 }).notNull(),
    // Superseded by pmc_inspection_request_units; kept so rows written before 0055 stay readable.
    unitIdsJson: text("unitIdsJson"),
    contractorLabel: varchar("contractorLabel", { length: 255 }),
    consultantLabel: varchar("consultantLabel", { length: 255 }),
    responseCode: mysqlEnum("responseCode", ["A", "B", "C", "UR"]),
    requestedAt: timestamp("requestedAt").notNull(),
    notes: text("notes"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("pmc_inspections_project_code_unique").on(table.projectId, table.requestCode), index("pmc_inspections_tenant_project_activity_idx").on(table.tenantId, table.projectId, table.activityDefinitionId), foreignKey({ columns: [table.activityDefinitionId], foreignColumns: [pmcActivityDefinitions.id], name: "pmc_insp_activity_fk" })],
);

export const pmcInspectionSteps = mysqlTable(
  "pmc_inspection_steps",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    inspectionRequestId: varchar("inspectionRequestId", { length: 36 }).notNull(),
    stepCode: varchar("stepCode", { length: 80 }).notNull(),
    stepOrder: int("stepOrder").default(0).notNull(),
    holderLabel: varchar("holderLabel", { length: 255 }),
    status: mysqlEnum("status", ["pending", "in_progress", "complete", "rejected"]).default("pending").notNull(),
    completedAt: timestamp("completedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("pmc_inspection_step_unique").on(table.inspectionRequestId, table.stepCode), index("pmc_inspection_steps_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status), foreignKey({ columns: [table.inspectionRequestId], foreignColumns: [pmcInspectionRequests.id], name: "pmc_step_request_fk" })],
);

export const pmcBaselines = mysqlTable(
  "pmc_baselines",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    activityDefinitionId: varchar("activityDefinitionId", { length: 36 }).notNull(),
    periodAt: timestamp("periodAt").notNull(),
    plannedPercent: decimal("plannedPercent", { precision: 7, scale: 4 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [uniqueIndex("pmc_baseline_activity_period_unique").on(table.activityDefinitionId, table.periodAt), index("pmc_baselines_tenant_project_period_idx").on(table.tenantId, table.projectId, table.periodAt), foreignKey({ columns: [table.activityDefinitionId], foreignColumns: [pmcActivityDefinitions.id], name: "pmc_base_activity_fk" })],
);

export const pmcInspectionRequestUnits = mysqlTable(
  "pmc_inspection_request_units",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    inspectionRequestId: varchar("inspectionRequestId", { length: 36 }).notNull(),
    unitId: varchar("unitId", { length: 36 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("pmc_inspection_unit_unique").on(table.inspectionRequestId, table.unitId),
    index("pmc_inspection_units_tenant_project_idx").on(table.tenantId, table.projectId, table.unitId),
    foreignKey({ columns: [table.inspectionRequestId], foreignColumns: [pmcInspectionRequests.id], name: "pmc_inspection_unit_request_fk" }),
    foreignKey({ columns: [table.unitId], foreignColumns: [pmcUnits.id], name: "pmc_inspection_unit_unit_fk" }),
  ],
);

// Tenant decision per project: how much of an activity's weight counts at each
// status (for example UNDER_REVIEW = 0.9). Absent rows mean the defaults in domain/pmc.ts.
export const pmcStatusFactors = mysqlTable(
  "pmc_status_factors",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    status: mysqlEnum("status", ["NOT_STARTED", "IN_PROGRESS", "UNDER_REVIEW", "COMPLETE"]).notNull(),
    factor: decimal("factor", { precision: 5, scale: 4 }).notNull(),
    updatedByUserId: int("updatedByUserId").references(() => users.id),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  table => [uniqueIndex("pmc_status_factor_unique").on(table.projectId, table.status), index("pmc_status_factors_tenant_project_idx").on(table.tenantId, table.projectId)],
);

// The site plan a user uploads (PNG or JPEG). The newest row is the plan in use; unit
// polygons are stored on pmc_units.geometryJson in coordinates normalised to this
// image (0..1, origin at the top left), so any resolution works.
export const pmcSitePlans = mysqlTable(
  "pmc_site_plans",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    fileKey: varchar("fileKey", { length: 512 }).notNull(),
    fileName: varchar("fileName", { length: 255 }).notNull(),
    mimeType: varchar("mimeType", { length: 64 }).notNull(),
    widthPx: int("widthPx").notNull(),
    heightPx: int("heightPx").notNull(),
    fileHash: varchar("fileHash", { length: 64 }).notNull(),
    uploadedByUserId: int("uploadedByUserId").notNull().references(() => users.id),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("pmc_site_plans_tenant_project_idx").on(table.tenantId, table.projectId, table.createdAt)],
);

// One-time e-mail sign-in codes. The table holds a hash of the normalized
// address and an HMAC of the code, never either value itself.
// One row per signed-in browser. The session cookie is a signed token that names a row here (`sid`), and a request is accepted only while the row is
// unexpired and unrevoked: that is what lets "log out" end a session in the server, not just in the browser that asked.
export const authSessions = mysqlTable(
  "auth_sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: int("userId").notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    revokedAt: timestamp("revokedAt"),
  },
  table => [
    foreignKey({ columns: [table.userId], foreignColumns: [users.id], name: "auth_sessions_user_fk" }).onDelete("cascade"),
    index("auth_sessions_user_idx").on(table.userId, table.revokedAt),
  ],
);

export const loginCodes = mysqlTable(
  "login_codes",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    emailHash: varchar("emailHash", { length: 64 }).notNull(),
    codeHash: varchar("codeHash", { length: 64 }).notNull(),
    expiresAt: timestamp("expiresAt").notNull(),
    attempts: int("attempts").default(0).notNull(),
    consumedAt: timestamp("consumedAt"),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [index("login_codes_email_created_idx").on(table.emailHash, table.createdAt)],
);

// Per-WBS EAC captured with each profitability snapshot: the history that lets
// the screen say which work items moved the profit since the last snapshot.
export const evmWbsSnapshots = mysqlTable(
  "evm_wbs_snapshots",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenantId", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("projectId", { length: 36 }).notNull().references(() => projects.id),
    snapshotId: varchar("snapshotId", { length: 36 }).notNull().references(() => evmSnapshots.id),
    wbsItemId: varchar("wbsItemId", { length: 36 }).references(() => wbsItems.id),
    bac: decimal("bac", { precision: 18, scale: 2 }).notNull(),
    ac: decimal("ac", { precision: 18, scale: 2 }).notNull(),
    eac: decimal("eac", { precision: 18, scale: 2 }).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  table => [
    uniqueIndex("evm_wbs_snapshots_unique").on(table.snapshotId, table.wbsItemId),
    index("evm_wbs_snapshots_project_idx").on(table.tenantId, table.projectId),
  ],
);
