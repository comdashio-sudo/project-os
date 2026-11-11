import {
  boolean,
  check,
  customType,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  time,
  timestamp,
  unique,
  uniqueIndex,
  varchar,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const usersRoleEnum = pgEnum("users_role", ["user", "admin"]);
export const users = pgTable("users", {
  id: integer("id").primaryKey().generatedByDefaultAsIdentity(),
  openId: varchar("open_id", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("login_method", { length: 64 }),
  role: usersRoleEnum("role").default("user").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  lastSignedIn: timestamp("last_signed_in", { withTimezone: true }).defaultNow().notNull(),
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

export const companiesStatusEnum = pgEnum("companies_status", ["active", "suspended", "archived"]);
export const companiesDefaultLocaleEnum = pgEnum("companies_default_locale", ["ar", "en"]);
export const companies = pgTable(
  "companies",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    legalName: varchar("legal_name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull(),
    status: companiesStatusEnum("status").default("active").notNull(),
    defaultLocale: companiesDefaultLocaleEnum("default_locale").default("ar").notNull(),
    // D-81 (owner's decision 2026-11-09): two-step verification is optional and off by default for everyone. A company that wants it for its members switches this on (migration 0023).
    requireTwoStep: boolean("require_two_step").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("companies_slug_unique").on(table.slug)],
);

export const membershipsStatusEnum = pgEnum("memberships_status", ["invited", "active", "suspended", "revoked"]);
export const memberships = pgTable(
  "memberships",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    userId: integer("user_id").notNull().references(() => users.id),
    status: membershipsStatusEnum("status").default("invited").notNull(),
    joinedAt: timestamp("joined_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("memberships_tenant_user_unique").on(table.tenantId, table.userId),
    index("memberships_user_tenant_idx").on(table.userId, table.tenantId),
    // the target of a (membership, company) foreign key: a row that names a person of company X cannot point at a membership of company Y (0021)
    unique("memberships_id_tenant_unique").on(table.id, table.tenantId),
  ],
);

export const employeesEmploymentStatusEnum = pgEnum("employees_employment_status", ["active", "suspended", "terminated"]);
export const employeesRetentionPolicyEnum = pgEnum("employees_retention_policy", ["standard", "extended", "legal_hold"]);
export const employees = pgTable(
  "employees",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    employeeNumber: varchar("employee_number", { length: 80 }).notNull(),
    fullName: varchar("full_name", { length: 255 }).notNull(),
    jobTitle: varchar("job_title", { length: 160 }).notNull(),
    department: varchar("department", { length: 160 }).notNull(),
    hireDate: timestamp("hire_date", { withTimezone: true }).notNull(),
    employmentStatus: employeesEmploymentStatusEnum("employment_status").default("active").notNull(),
    nationality: varchar("nationality", { length: 120 }),
    identityDocumentType: varchar("identity_document_type", { length: 80 }),
    identityReference: varchar("identity_reference", { length: 512 }),
    linkedUserId: integer("linked_user_id").references(() => users.id),
    retentionPolicy: employeesRetentionPolicyEnum("retention_policy").default("standard").notNull(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("employees_tenant_number_unique").on(table.tenantId, table.employeeNumber),
    uniqueIndex("employees_tenant_user_unique").on(table.tenantId, table.linkedUserId),
    index("employees_tenant_status_idx").on(table.tenantId, table.employmentStatus),
  ],
);

export const employmentContractsContractTypeEnum = pgEnum("employment_contracts_contract_type", ["permanent", "fixed_term", "temporary", "consulting"]);
export const employmentContractsStatusEnum = pgEnum("employment_contracts_status", ["active", "ended", "terminated"]);
export const employmentContractsRetentionPolicyEnum = pgEnum("employment_contracts_retention_policy", ["standard", "extended", "legal_hold"]);
export const employmentContracts = pgTable(
  "employment_contracts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employees.id),
    contractType: employmentContractsContractTypeEnum("contract_type").notNull(),
    startDate: timestamp("start_date", { withTimezone: true }).notNull(),
    endDate: timestamp("end_date", { withTimezone: true }),
    probationEndDate: timestamp("probation_end_date", { withTimezone: true }),
    renewalOfContractId: varchar("renewal_of_contract_id", { length: 36 }),
    status: employmentContractsStatusEnum("status").default("active").notNull(),
    terminationReason: varchar("termination_reason", { length: 1000 }),
    retentionPolicy: employmentContractsRetentionPolicyEnum("retention_policy").default("standard").notNull(),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("employment_contracts_tenant_employee_idx").on(table.tenantId, table.employeeId, table.status)],
);

export const salaryStructuresEosAccrualModeEnum = pgEnum("salary_structures_eos_accrual_mode", ["computed", "manual"]);
export const salaryStructures = pgTable(
  "salary_structures",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employees.id),
    baseSalary: numeric("base_salary", { precision: 18, scale: 2 }).notNull(),
    housingAllowance: numeric("housing_allowance", { precision: 18, scale: 2 }).default("0").notNull(),
    transportAllowance: numeric("transport_allowance", { precision: 18, scale: 2 }).default("0").notNull(),
    hardshipAllowance: numeric("hardship_allowance", { precision: 18, scale: 2 }).default("0").notNull(),
    gosiRate: numeric("gosi_rate", { precision: 7, scale: 6 }).default("0").notNull(),
    otherDeductions: numeric("other_deductions", { precision: 18, scale: 2 }).default("0").notNull(),
    eosMonthlyAccrual: numeric("eos_monthly_accrual", { precision: 18, scale: 2 }).default("0").notNull(),
    // 'computed' = the accrual follows the length of service and the tenant's rule; 'manual' = the amount above, as entered before work order 3.
    eosAccrualMode: salaryStructuresEosAccrualModeEnum("eos_accrual_mode").default("computed").notNull(),
    currency: varchar("currency", { length: 3 }).default("SAR").notNull(),
    active: boolean("active").default(true).notNull(),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("salary_structures_tenant_employee_unique").on(table.tenantId, table.employeeId), index("salary_structures_tenant_active_idx").on(table.tenantId, table.active)],
);

export const tenantSettings = pgTable(
  "tenant_settings",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    // Labour loading and the working calendar (G-015, G-016, G-124). Defaults load nothing and use the Sunday-Thursday week.
    // Deprecated: the single rate used before work order 3. Nothing reads it any more; the two columns below replace it. Kept (not dropped) so no data is lost.
    employerGosiRate: numeric("employer_gosi_rate", { precision: 7, scale: 6 }).default("0").notNull(),
    // Owner defaults (work order 3): 11.75% for a Saudi, 2% for anyone else, on basic + housing.
    employerGosiRateSaudi: numeric("employer_gosi_rate_saudi", { precision: 7, scale: 6 }).default("0.117500").notNull(),
    employerGosiRateNonSaudi: numeric("employer_gosi_rate_non_saudi", { precision: 7, scale: 6 }).default("0.020000").notNull(),
    // End-of-service accrual: months of pay per year of service, for the first N years and after (owner default: 0.5 for 5 years, then 1).
    eosFirstPeriodYears: integer("eos_first_period_years").default(5).notNull(),
    eosFirstPeriodMonthsPerYear: numeric("eos_first_period_months_per_year", { precision: 5, scale: 2 }).default("0.50").notNull(),
    eosLaterMonthsPerYear: numeric("eos_later_months_per_year", { precision: 5, scale: 2 }).default("1.00").notNull(),
    indirectLoadingPercent: numeric("indirect_loading_percent", { precision: 7, scale: 4 }).default("0").notNull(),
    hoursPerDay: numeric("hours_per_day", { precision: 5, scale: 2 }).default("8").notNull(),
    workingDays: varchar("working_days", { length: 20 }).default("0,1,2,3,4").notNull(),
    updatedByUserId: integer("updated_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("tenant_settings_tenant_unique").on(table.tenantId)],
);

/**
 * A request the phone sent with its own identifier (G-033). A retry after a lost answer carries the same identifier and gets
 * the stored result back instead of running again, so a queued item sent twice never makes two records.
 */
export const clientRequestsStatusEnum = pgEnum("client_requests_status", ["started", "done"]);
export const clientRequests = pgTable(
  "client_requests",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    userId: integer("user_id").notNull().references(() => users.id),
    action: varchar("action", { length: 60 }).notNull(),
    status: clientRequestsStatusEnum("status").default("started").notNull(),
    resultJson: text("result_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("client_requests_tenant_created_idx").on(table.tenantId, table.createdAt)],
);

export const payrollRunsStatusEnum = pgEnum("payroll_runs_status", ["draft", "review", "approved", "paid"]);
export const payrollRuns = pgTable(
  "payroll_runs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    status: payrollRunsStatusEnum("status").default("draft").notNull(),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    reviewedByUserId: integer("reviewed_by_user_id").references(() => users.id),
    approvedByUserId: integer("approved_by_user_id").references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("payroll_runs_tenant_period_unique").on(table.tenantId, table.periodStart, table.periodEnd), index("payroll_runs_tenant_status_idx").on(table.tenantId, table.status)],
);

export const payrollEntries = pgTable(
  "payroll_entries",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    payrollRunId: varchar("payroll_run_id", { length: 36 }).notNull().references(() => payrollRuns.id),
    employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employees.id),
    salaryStructureId: varchar("salary_structure_id", { length: 36 }).notNull().references(() => salaryStructures.id),
    baseSalary: numeric("base_salary", { precision: 18, scale: 2 }).notNull(),
    housingAllowance: numeric("housing_allowance", { precision: 18, scale: 2 }).notNull(),
    transportAllowance: numeric("transport_allowance", { precision: 18, scale: 2 }).notNull(),
    hardshipAllowance: numeric("hardship_allowance", { precision: 18, scale: 2 }).notNull(),
    gosiDeduction: numeric("gosi_deduction", { precision: 18, scale: 2 }).notNull(),
    otherDeductions: numeric("other_deductions", { precision: 18, scale: 2 }).notNull(),
    eosMonthlyAccrual: numeric("eos_monthly_accrual", { precision: 18, scale: 2 }).notNull(),
    // The loaded cost the run was made with, kept on the entry so a later change of the tenant's rates never moves a closed month.
    employerSocialInsurance: numeric("employer_social_insurance", { precision: 18, scale: 2 }).default("0").notNull(),
    indirectLoading: numeric("indirect_loading", { precision: 18, scale: 2 }).default("0").notNull(),
    nationalityClass: varchar("nationality_class", { length: 12 }),
    currency: varchar("currency", { length: 3 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("payroll_entries_run_employee_unique").on(table.payrollRunId, table.employeeId), index("payroll_entries_tenant_run_idx").on(table.tenantId, table.payrollRunId)],
);

export const payrollAllocationsSourceEnum = pgEnum("payroll_allocations_source", ["manual", "auto_hours"]);
export const payrollAllocations = pgTable(
  "payroll_allocations",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    payrollEntryId: varchar("payroll_entry_id", { length: 36 }).notNull().references(() => payrollEntries.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    wbsItemId: varchar("wbs_item_id", { length: 36 }).references(() => wbsItems.id),
    activityId: varchar("activity_id", { length: 36 }).references(() => activities.id),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    costEntryId: varchar("cost_entry_id", { length: 36 }).references(() => costEntries.id),
    // 'auto_hours' = shared out by the approved hours of the period; the hours and the share are kept so the split can be re-derived.
    source: payrollAllocationsSourceEnum("source").default("manual").notNull(),
    hoursBasis: numeric("hours_basis", { precision: 12, scale: 2 }),
    sharePercent: numeric("share_percent", { precision: 9, scale: 4 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("payroll_allocations_tenant_project_idx").on(table.tenantId, table.projectId), uniqueIndex("payroll_allocations_cost_entry_unique").on(table.costEntryId)],
);

/** Every manual change to a payroll allocation: who, what it was, what it became, and why. The reason is not optional. */
export const payrollAllocationAdjustments = pgTable(
  "payroll_allocation_adjustments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    allocationId: varchar("allocation_id", { length: 36 }).notNull(),
    previousAmount: numeric("previous_amount", { precision: 18, scale: 2 }).notNull(),
    newAmount: numeric("new_amount", { precision: 18, scale: 2 }).notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    adjustedByUserId: integer("adjusted_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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
export const emailOutboxKindEnum = pgEnum("email_outbox_kind", ["support_escalation", "approvals_waiting", "daily_digest"]);
export const emailOutboxStatusEnum = pgEnum("email_outbox_status", ["pending", "sent", "failed", "skipped"]);
export const emailOutbox = pgTable(
  "email_outbox",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    recipientUserId: integer("recipient_user_id").notNull(),
    kind: emailOutboxKindEnum("kind").notNull(),
    dedupeKey: varchar("dedupe_key", { length: 160 }).notNull(),
    subject: varchar("subject", { length: 300 }).notNull(),
    bodyText: text("body_text").notNull(),
    bodyHtml: text("body_html").notNull(),
    status: emailOutboxStatusEnum("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    // The sender's status line only: never the response body, which can name the recipient.
    lastError: varchar("last_error", { length: 200 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
  },
  table => [
    uniqueIndex("email_outbox_dedupe_unique").on(table.tenantId, table.recipientUserId, table.kind, table.dedupeKey),
    index("email_outbox_status_created_idx").on(table.status, table.createdAt),
    foreignKey({ columns: [table.tenantId], foreignColumns: [companies.id], name: "eo_tenant_fk" }),
    foreignKey({ columns: [table.recipientUserId], foreignColumns: [users.id], name: "eo_user_fk" }),
  ],
);

/** A person's choice, per kind of e-mail, in one company. No row means the default: on. */
export const emailNotificationPreferencesKindEnum = pgEnum("email_notification_preferences_kind", ["support_escalation", "approvals_waiting", "daily_digest"]);
export const emailNotificationPreferences = pgTable(
  "email_notification_preferences",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    userId: integer("user_id").notNull(),
    kind: emailNotificationPreferencesKindEnum("kind").notNull(),
    enabled: boolean("enabled").notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("email_preferences_unique").on(table.tenantId, table.userId, table.kind),
    foreignKey({ columns: [table.tenantId], foreignColumns: [companies.id], name: "enp_tenant_fk" }),
    foreignKey({ columns: [table.userId], foreignColumns: [users.id], name: "enp_user_fk" }),
  ],
);

export const employeeAssignmentsStatusEnum = pgEnum("employee_assignments_status", ["planned", "active", "closed", "cancelled"]);
export const employeeAssignments = pgTable(
  "employee_assignments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employees.id),
    projectResourceId: varchar("project_resource_id", { length: 36 }).notNull(),
    wbsItemId: varchar("wbs_item_id", { length: 36 }).references(() => wbsItems.id),
    activityId: varchar("activity_id", { length: 36 }).references(() => activities.id),
    plannedStartAt: timestamp("planned_start_at", { withTimezone: true }).notNull(),
    plannedFinishAt: timestamp("planned_finish_at", { withTimezone: true }).notNull(),
    plannedHours: numeric("planned_hours", { precision: 12, scale: 2 }).notNull(),
    status: employeeAssignmentsStatusEnum("status").default("planned").notNull(),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [foreignKey({ columns: [table.projectResourceId], foreignColumns: [projectResources.id], name: "employee_assignments_resource_fk" }), index("employee_assignments_tenant_project_idx").on(table.tenantId, table.projectId, table.status), index("employee_assignments_employee_window_idx").on(table.tenantId, table.employeeId, table.plannedStartAt, table.plannedFinishAt)],
);

export const employeeAttendanceAttendanceStatusEnum = pgEnum("employee_attendance_attendance_status", ["present", "absent", "leave", "secondment"]);
export const employeeAttendanceStatusEnum = pgEnum("employee_attendance_status", ["draft", "submitted", "approved", "rejected"]);
export const employeeAttendance = pgTable(
  "employee_attendance",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employees.id),
    attendanceDate: timestamp("attendance_date", { withTimezone: true }).notNull(),
    attendanceStatus: employeeAttendanceAttendanceStatusEnum("attendance_status").notNull(),
    status: employeeAttendanceStatusEnum("status").default("draft").notNull(),
    note: varchar("note", { length: 1000 }),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    reviewedByUserId: integer("reviewed_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("employee_attendance_tenant_day_unique").on(table.tenantId, table.employeeId, table.attendanceDate), index("employee_attendance_tenant_status_idx").on(table.tenantId, table.status, table.attendanceDate)],
);

export const employeeTimeEntriesStatusEnum = pgEnum("employee_time_entries_status", ["draft", "submitted", "approved", "rejected"]);
export const employeeTimeEntriesRateSourceEnum = pgEnum("employee_time_entries_rate_source", ["loaded", "resource"]);
export const employeeTimeEntries = pgTable(
  "employee_time_entries",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    assignmentId: varchar("assignment_id", { length: 36 }).notNull().references(() => employeeAssignments.id),
    employeeId: varchar("employee_id", { length: 36 }).notNull().references(() => employees.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    workDate: timestamp("work_date", { withTimezone: true }).notNull(),
    actualHours: numeric("actual_hours", { precision: 8, scale: 2 }).notNull(),
    reportedProgressPercent: numeric("reported_progress_percent", { precision: 5, scale: 2 }),
    status: employeeTimeEntriesStatusEnum("status").default("draft").notNull(),
    costEntryId: varchar("cost_entry_id", { length: 36 }).references(() => costEntries.id),
    // How the cost of the approved hours was priced: from payroll (loaded) or from the resource plan rate. The rate itself is not kept here: it would reveal pay.
    rateSource: employeeTimeEntriesRateSourceEnum("rate_source"),
    progressEntryId: varchar("progress_entry_id", { length: 36 }).references(() => progressEntries.id),
    // Set when an approved payroll shared this employee's pay out by hours: the provisional cost of these hours was replaced by the payroll's, so it must not be counted again.
    supersededByPayrollEntryId: varchar("superseded_by_payroll_entry_id", { length: 36 }),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    reviewedByUserId: integer("reviewed_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("employee_time_entries_assignment_day_unique").on(table.assignmentId, table.workDate), uniqueIndex("employee_time_entries_cost_entry_unique").on(table.costEntryId), index("employee_time_entries_tenant_project_idx").on(table.tenantId, table.projectId, table.status, table.workDate)],
);

export const employeePerformanceExclusionsSourceTypeEnum = pgEnum("employee_performance_exclusions_source_type", ["activity", "action", "rfi", "ncr", "quality_inspection", "field_report", "material_request"]);
export const employeePerformanceExclusions = pgTable(
  "employee_performance_exclusions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    projectId: varchar("project_id", { length: 36 }).notNull(),
    employeeId: varchar("employee_id", { length: 36 }).notNull(),
    sourceType: employeePerformanceExclusionsSourceTypeEnum("source_type").notNull(),
    sourceId: varchar("source_id", { length: 36 }).notNull(),
    reason: varchar("reason", { length: 1000 }).notNull(),
    createdByUserId: integer("created_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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

export const employeePerformanceObjectionsStatusEnum = pgEnum("employee_performance_objections_status", ["submitted", "under_review", "resolved", "rejected"]);
export const employeePerformanceObjections = pgTable(
  "employee_performance_objections",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    projectId: varchar("project_id", { length: 36 }).notNull(),
    employeeId: varchar("employee_id", { length: 36 }).notNull(),
    statement: text("statement").notNull(),
    status: employeePerformanceObjectionsStatusEnum("status").default("submitted").notNull(),
    resolutionNote: varchar("resolution_note", { length: 1000 }),
    createdByUserId: integer("created_by_user_id").notNull(),
    reviewedByUserId: integer("reviewed_by_user_id"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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

export const membershipInvitationsScopeTypeEnum = pgEnum("membership_invitations_scope_type", ["company", "portfolio", "program", "project"]);
export const membershipInvitationsStatusEnum = pgEnum("membership_invitations_status", ["pending", "accepted", "expired", "revoked"]);
export const membershipInvitations = pgTable(
  "membership_invitations",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    email: varchar("email", { length: 320 }).notNull(),
    roleId: varchar("role_id", { length: 36 }).notNull().references(() => roles.id),
    scopeType: membershipInvitationsScopeTypeEnum("scope_type").notNull(),
    scopeId: varchar("scope_id", { length: 36 }),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    status: membershipInvitationsStatusEnum("status").default("pending").notNull(),
    invitedByUserId: integer("invited_by_user_id").notNull().references(() => users.id),
    acceptedByUserId: integer("accepted_by_user_id").references(() => users.id),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("membership_invitations_token_hash_unique").on(table.tokenHash),
    index("membership_invitations_tenant_email_status_idx").on(table.tenantId, table.email, table.status),
    index("membership_invitations_email_status_idx").on(table.email, table.status),
  ],
);

export const subscriptionsPackageCodeEnum = pgEnum("subscriptions_package_code", subscriptionPackageCodes);
export const subscriptionsStatusEnum = pgEnum("subscriptions_status", ["trialing", "active", "past_due", "suspended", "cancelled", "expired", "grace_period"]);
export const subscriptions = pgTable(
  "subscriptions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    packageCode: subscriptionsPackageCodeEnum("package_code").notNull(),
    status: subscriptionsStatusEnum("status").default("trialing").notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("subscriptions_tenant_status_idx").on(table.tenantId, table.status)],
);

export const tenantEntitlementsProductCodeEnum = pgEnum("tenant_entitlements_product_code", productCodes);
export const tenantEntitlements = pgTable(
  "tenant_entitlements",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    subscriptionId: varchar("subscription_id", { length: 36 }).notNull().references(() => subscriptions.id),
    productCode: tenantEntitlementsProductCodeEnum("product_code").notNull(),
    active: boolean("active").default(true).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("tenant_entitlements_subscription_product_unique").on(table.subscriptionId, table.productCode),
    index("tenant_entitlements_tenant_product_idx").on(table.tenantId, table.productCode, table.active),
  ],
);

export const commercialPlansPackageCodeEnum = pgEnum("commercial_plans_package_code", subscriptionPackageCodes);
export const commercialPlans = pgTable(
  "commercial_plans",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    packageCode: commercialPlansPackageCodeEnum("package_code").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("commercial_plans_code_unique").on(table.code), index("commercial_plans_package_active_idx").on(table.packageCode, table.active)],
);

export const commercialFeaturesProductCodeEnum = pgEnum("commercial_features_product_code", productCodes);
export const commercialFeatures = pgTable(
  "commercial_features",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    code: varchar("code", { length: 120 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    productCode: commercialFeaturesProductCodeEnum("product_code").notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("commercial_features_code_unique").on(table.code), index("commercial_features_product_active_idx").on(table.productCode, table.active)],
);

export const planFeatureEntitlements = pgTable(
  "plan_feature_entitlements",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    planId: varchar("plan_id", { length: 36 }).notNull().references(() => commercialPlans.id),
    featureId: varchar("feature_id", { length: 36 }).notNull().references(() => commercialFeatures.id),
    active: boolean("active").default(true).notNull(),
    limitValue: integer("limit_value"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("plan_feature_entitlements_plan_feature_unique").on(table.planId, table.featureId), index("plan_feature_entitlements_feature_idx").on(table.featureId)],
);

export const tenantLicensesStatusEnum = pgEnum("tenant_licenses_status", ["trialing", "active", "past_due", "suspended", "cancelled", "expired", "grace_period"]);
export const tenantLicenses = pgTable(
  "tenant_licenses",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    subscriptionId: varchar("subscription_id", { length: 36 }).notNull().references(() => subscriptions.id),
    planId: varchar("plan_id", { length: 36 }).notNull().references(() => commercialPlans.id),
    status: tenantLicensesStatusEnum("status").default("trialing").notNull(),
    seats: integer("seats").default(1).notNull(),
    priceAmount: numeric("price_amount", { precision: 18, scale: 2 }).default("0").notNull(),
    discountAmount: numeric("discount_amount", { precision: 18, scale: 2 }).default("0").notNull(),
    manualActivation: boolean("manual_activation").default(false).notNull(),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }),
    trialEndsAt: timestamp("trial_ends_at", { withTimezone: true }),
    graceEndsAt: timestamp("grace_ends_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("tenant_licenses_subscription_unique").on(table.subscriptionId), index("tenant_licenses_tenant_status_idx").on(table.tenantId, table.status), index("tenant_licenses_plan_idx").on(table.planId)],
);

export const selfServiceSignupAttempts = pgTable(
  "self_service_signup_attempts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: integer("user_id").notNull().references(() => users.id),
    emailHash: varchar("email_hash", { length: 64 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("ssa_user_created_idx").on(table.userId, table.createdAt), index("ssa_email_created_idx").on(table.emailHash, table.createdAt)],
);

export const invoiceCounters = pgTable("invoice_counters", {
  id: varchar("id", { length: 40 }).primaryKey(),
  nextNumber: integer("next_number").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const invoicesStatusEnum = pgEnum("invoices_status", ["issued", "void"]);
export const invoicesRendererEnum = pgEnum("invoices_renderer", ["structured_json"]);
export const invoices = pgTable(
  "invoices",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    subscriptionId: varchar("subscription_id", { length: 36 }).notNull().references(() => subscriptions.id),
    sequenceNumber: integer("sequence_number").notNull(),
    invoiceNumber: varchar("invoice_number", { length: 64 }).notNull(),
    status: invoicesStatusEnum("status").default("issued").notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(),
    currency: varchar("currency", { length: 3 }).default("SAR").notNull(),
    sellerName: varchar("seller_name", { length: 255 }).notNull(),
    sellerTaxNumber: varchar("seller_tax_number", { length: 80 }).notNull(),
    buyerName: varchar("buyer_name", { length: 255 }).notNull(),
    buyerTaxNumber: varchar("buyer_tax_number", { length: 80 }).notNull(),
    subtotalAmount: numeric("subtotal_amount", { precision: 18, scale: 2 }).notNull(),
    vatAmount: numeric("vat_amount", { precision: 18, scale: 2 }).notNull(),
    totalAmount: numeric("total_amount", { precision: 18, scale: 2 }).notNull(),
    renderer: invoicesRendererEnum("renderer").default("structured_json").notNull(),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("inv_sequence_unique").on(table.sequenceNumber), uniqueIndex("inv_number_unique").on(table.invoiceNumber), index("inv_tenant_issued_idx").on(table.tenantId, table.issuedAt)],
);

export const paymentRecordsProviderEnum = pgEnum("payment_records_provider", ["manual", "mock"]);
export const paymentRecordsOperationEnum = pgEnum("payment_records_operation", ["create", "renew", "cancel", "refund"]);
export const paymentRecordsStatusEnum = pgEnum("payment_records_status", ["pending", "confirmed", "cancelled", "refunded", "failed"]);
export const paymentRecords = pgTable(
  "payment_records",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    subscriptionId: varchar("subscription_id", { length: 36 }).notNull().references(() => subscriptions.id),
    invoiceId: varchar("invoice_id", { length: 36 }).references(() => invoices.id),
    provider: paymentRecordsProviderEnum("provider").notNull(),
    operation: paymentRecordsOperationEnum("operation").notNull(),
    status: paymentRecordsStatusEnum("status").notNull(),
    providerReference: varchar("provider_reference", { length: 120 }).notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("SAR").notNull(),
    metadata: text("metadata"),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("pay_provider_ref_unique").on(table.provider, table.providerReference), index("pay_tenant_sub_idx").on(table.tenantId, table.subscriptionId)],
);

export const supportTicketsCategoryEnum = pgEnum("support_tickets_category", ["technical", "billing", "account", "general"]);
export const supportTicketsPriorityEnum = pgEnum("support_tickets_priority", ["low", "normal", "high", "urgent"]);
export const supportTicketsStatusEnum = pgEnum("support_tickets_status", ["open", "waiting_customer", "in_progress", "resolved", "closed"]);
export const supportTicketsEscalationStatusEnum = pgEnum("support_tickets_escalation_status", ["none", "requested", "escalated"]);
export const supportTickets = pgTable(
  "support_tickets",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    ownerUserId: integer("owner_user_id").references(() => users.id),
    subject: varchar("subject", { length: 255 }).notNull(),
    category: supportTicketsCategoryEnum("category").notNull(),
    priority: supportTicketsPriorityEnum("priority").default("normal").notNull(),
    status: supportTicketsStatusEnum("status").default("open").notNull(),
    escalationStatus: supportTicketsEscalationStatusEnum("escalation_status").default("none").notNull(),
    tagsJson: varchar("tags_json", { length: 1000 }).default("[]").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("spt_tenant_status_idx").on(table.tenantId, table.status, table.updatedAt), index("spt_owner_status_idx").on(table.ownerUserId, table.status)],
);

export const supportMessagesSenderTypeEnum = pgEnum("support_messages_sender_type", ["customer", "agent", "assistant", "system"]);
export const supportMessages = pgTable(
  "support_messages",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    ticketId: varchar("ticket_id", { length: 36 }).notNull().references(() => supportTickets.id),
    authorUserId: integer("author_user_id").references(() => users.id),
    senderType: supportMessagesSenderTypeEnum("sender_type").notNull(),
    body: text("body").notNull(),
    citationsJson: text("citations_json"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("spm_ticket_created_idx").on(table.ticketId, table.createdAt), index("spm_tenant_created_idx").on(table.tenantId, table.createdAt)],
);

export const knowledgeArticlesStatusEnum = pgEnum("knowledge_articles_status", ["draft", "published", "archived"]);
export const knowledgeArticles = pgTable(
  "knowledge_articles",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    sourceDocumentId: varchar("source_document_id", { length: 36 }).notNull().references(() => projectDocuments.id),
    title: varchar("title", { length: 255 }).notNull(),
    content: text("content").notNull(),
    status: knowledgeArticlesStatusEnum("status").default("draft").notNull(),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    publishedByUserId: integer("published_by_user_id").references(() => users.id),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("kba_document_unique").on(table.sourceDocumentId), index("kba_tenant_status_idx").on(table.tenantId, table.status, table.updatedAt)],
);

export const scheduledJobsPurposeEnum = pgEnum("scheduled_jobs_purpose", ["license_lifecycle"]);
export const scheduledJobs = pgTable(
  "scheduled_jobs",
  {
    id: varchar("id", { length: 64 }).primaryKey(),
    purpose: scheduledJobsPurposeEnum("purpose").notNull(),
    scheduleCronTaskUid: varchar("schedule_cron_task_uid", { length: 65 }).unique(),
    enabled: boolean("enabled").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("scheduled_jobs_task_uid_idx").on(table.scheduleCronTaskUid)],
);

export const tenantLicenseFeatureOverrides = pgTable(
  "tenant_license_feature_overrides",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantLicenseId: varchar("tenant_license_id", { length: 36 }).notNull(),
    featureId: varchar("feature_id", { length: 36 }).notNull(),
    active: boolean("active").default(true).notNull(),
    limitValue: integer("limit_value"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [foreignKey({ columns: [table.featureId], foreignColumns: [commercialFeatures.id], name: "tl_feature_overrides_feature_fk" }), foreignKey({ columns: [table.tenantLicenseId], foreignColumns: [tenantLicenses.id], name: "tl_feature_overrides_license_fk" }), uniqueIndex("tenant_license_feature_overrides_license_feature_unique").on(table.tenantLicenseId, table.featureId), index("tenant_license_feature_overrides_feature_idx").on(table.featureId)],
);

export const rolesProductCodeEnum = pgEnum("roles_product_code", productCodes);
export const roles = pgTable(
  "roles",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    productCode: rolesProductCodeEnum("product_code"),
    description: text("description"),
    systemManaged: boolean("system_managed").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("roles_tenant_code_unique").on(table.tenantId, table.code)],
);

export const permissionsProductCodeEnum = pgEnum("permissions_product_code", productCodes);
export const permissions = pgTable(
  "permissions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    code: varchar("code", { length: 120 }).notNull(),
    name: varchar("name", { length: 160 }).notNull(),
    productCode: permissionsProductCodeEnum("product_code").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("permissions_code_unique").on(table.code)],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    roleId: varchar("role_id", { length: 36 }).notNull().references(() => roles.id),
    permissionId: varchar("permission_id", { length: 36 }).notNull().references(() => permissions.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [primaryKey({ columns: [table.roleId, table.permissionId], name: "role_permissions_pk" })],
);

// Work order 17, item 2: a ready-made role template stops carrying a permission. Adding one reaches existing companies by itself (with an audit row); taking one
// away is only PROPOSED here and applied when the company's administrator approves it after seeing the preview.
export const roleTemplateRemovalStatus = pgEnum("role_template_removal_status", ["pending", "approved", "declined"]);
export const roleTemplateRemovals = pgTable(
  "role_template_removals",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    roleId: varchar("role_id", { length: 36 }).notNull().references(() => roles.id),
    permissionId: varchar("permission_id", { length: 36 }).notNull().references(() => permissions.id),
    status: roleTemplateRemovalStatus("status").default("pending").notNull(),
    proposedAt: timestamp("proposed_at", { withTimezone: true }).defaultNow().notNull(),
    decidedByUserId: integer("decided_by_user_id").references(() => users.id),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
  },
  table => [uniqueIndex("role_template_removals_role_permission_uq").on(table.roleId, table.permissionId), index("role_template_removals_tenant_status_idx").on(table.tenantId, table.status)],
);

export const membershipRolesScopeTypeEnum = pgEnum("membership_roles_scope_type", ["company", "portfolio", "program", "project"]);
export const membershipRoles = pgTable(
  "membership_roles",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    membershipId: varchar("membership_id", { length: 36 }).notNull().references(() => memberships.id),
    roleId: varchar("role_id", { length: 36 }).notNull().references(() => roles.id),
    scopeType: membershipRolesScopeTypeEnum("scope_type").default("company").notNull(),
    scopeId: varchar("scope_id", { length: 36 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("membership_roles_scope_unique").on(table.membershipId, table.roleId, table.scopeType, table.scopeId),
    index("membership_roles_membership_idx").on(table.membershipId),
  ],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    actorUserId: integer("actor_user_id").references(() => users.id),
    action: varchar("action", { length: 120 }).notNull(),
    entityType: varchar("entity_type", { length: 120 }).notNull(),
    entityId: varchar("entity_id", { length: 36 }),
    requestId: varchar("request_id", { length: 80 }),
    metadata: text("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("audit_logs_tenant_entity_idx").on(table.tenantId, table.entityType, table.entityId)],
);

export const internalNotifications = pgTable(
  "internal_notifications",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    recipientUserId: integer("recipient_user_id").notNull().references(() => users.id),
    projectId: varchar("project_id", { length: 36 }).references(() => projects.id),
    notificationCode: varchar("notification_code", { length: 120 }).notNull(),
    entityType: varchar("entity_type", { length: 120 }),
    entityId: varchar("entity_id", { length: 36 }),
    payload: text("payload").notNull(),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("internal_notifications_recipient_tenant_ack_idx").on(table.recipientUserId, table.tenantId, table.acknowledgedAt), index("internal_notifications_tenant_project_idx").on(table.tenantId, table.projectId)],
);

export const portfoliosStatusEnum = pgEnum("portfolios_status", ["active", "on_hold", "closed"]);
export const portfolios = pgTable(
  "portfolios",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    status: portfoliosStatusEnum("status").default("active").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("portfolios_tenant_code_unique").on(table.tenantId, table.code)],
);

export const programsStatusEnum = pgEnum("programs_status", ["active", "on_hold", "closed"]);
export const programs = pgTable(
  "programs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    portfolioId: varchar("portfolio_id", { length: 36 }).references(() => portfolios.id),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    status: programsStatusEnum("status").default("active").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("programs_tenant_code_unique").on(table.tenantId, table.code), index("programs_tenant_portfolio_idx").on(table.tenantId, table.portfolioId)],
);

export const projectsLifecycleStageEnum = pgEnum("projects_lifecycle_stage", ["opportunity", "pre_award", "tender", "award", "mobilization", "planning", "design", "procurement", "execution", "commissioning", "handover", "closeout", "post_project_review"]);
export const projectsStatusEnum = pgEnum("projects_status", ["draft", "active", "on_hold", "closed", "cancelled"]);
export const projects = pgTable(
  "projects",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    portfolioId: varchar("portfolio_id", { length: 36 }).references(() => portfolios.id),
    programId: varchar("program_id", { length: 36 }).references(() => programs.id),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    projectType: varchar("project_type", { length: 120 }).notNull(),
    lifecycleStage: projectsLifecycleStageEnum("lifecycle_stage").default("planning").notNull(),
    status: projectsStatusEnum("status").default("draft").notNull(),
    currency: varchar("currency", { length: 3 }).default("SAR").notNull(),
    contractValue: numeric("contract_value", { precision: 18, scale: 2 }).default("0").notNull(),
    originalBudget: numeric("original_budget", { precision: 18, scale: 2 }).default("0").notNull(),
    currentBudget: numeric("current_budget", { precision: 18, scale: 2 }).default("0").notNull(),
    actualCost: numeric("actual_cost", { precision: 18, scale: 2 }).default("0").notNull(),
    committedCost: numeric("committed_cost", { precision: 18, scale: 2 }).default("0").notNull(),
    forecastCost: numeric("forecast_cost", { precision: 18, scale: 2 }).default("0").notNull(),
    plannedStartAt: timestamp("planned_start_at", { withTimezone: true }),
    plannedFinishAt: timestamp("planned_finish_at", { withTimezone: true }),
    forecastFinishAt: timestamp("forecast_finish_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("projects_tenant_code_unique").on(table.tenantId, table.code), index("projects_tenant_portfolio_idx").on(table.tenantId, table.portfolioId), index("projects_tenant_program_idx").on(table.tenantId, table.programId)],
);

export const contractsCounterpartyKindEnum = pgEnum("contracts_counterparty_kind", ["client", "supplier", "other"]);
export const contractsStatusEnum = pgEnum("contracts_status", ["draft", "active", "suspended", "closed", "cancelled"]);
export const contracts = pgTable(
  "contracts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    code: varchar("code", { length: 80 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    counterparty: varchar("counterparty", { length: 255 }).notNull(),
    // Who the other side is (G-103): a client has no register, so it stays a name; a supplier is chosen from the tenant's supplier register and its name is copied from there.
    counterpartyKind: contractsCounterpartyKindEnum("counterparty_kind").default("other").notNull(),
    supplierId: varchar("supplier_id", { length: 36 }),
    contractValue: numeric("contract_value", { precision: 18, scale: 2 }).default("0").notNull(),
    currency: varchar("currency", { length: 3 }).default("SAR").notNull(),
    status: contractsStatusEnum("status").default("draft").notNull(),
    startAt: timestamp("start_at", { withTimezone: true }),
    endAt: timestamp("end_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("contracts_project_code_unique").on(table.projectId, table.code), index("contracts_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status), index("contracts_supplier_idx").on(table.supplierId), foreignKey({ columns: [table.supplierId], foreignColumns: [suppliers.id], name: "contracts_supplier_fk" })],
);

export const commitmentsStatusEnum = pgEnum("commitments_status", ["draft", "committed", "released", "cancelled"]);
export const commitments = pgTable(
  "commitments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    contractId: varchar("contract_id", { length: 36 }).references(() => contracts.id),
    code: varchar("code", { length: 80 }).notNull(),
    description: varchar("description", { length: 255 }).notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("SAR").notNull(),
    status: commitmentsStatusEnum("status").default("draft").notNull(),
    committedAt: timestamp("committed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("commitments_project_code_unique").on(table.projectId, table.code), index("commitments_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status), index("commitments_contract_idx").on(table.contractId)],
);

export const projectDocumentsCategoryEnum = pgEnum("project_documents_category", ["drawing", "specification", "method_statement", "report", "correspondence", "commercial", "other"]);
export const projectDocumentsStatusEnum = pgEnum("project_documents_status", ["draft", "for_review", "approved", "superseded", "archived"]);
export const projectDocuments = pgTable(
  "project_documents",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    documentNumber: varchar("document_number", { length: 120 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    category: projectDocumentsCategoryEnum("category").default("other").notNull(),
    status: projectDocumentsStatusEnum("status").default("draft").notNull(),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("project_documents_project_number_unique").on(table.projectId, table.documentNumber), index("project_documents_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status)],
);

export const documentVersions = pgTable(
  "document_versions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    documentId: varchar("document_id", { length: 36 }).notNull().references(() => projectDocuments.id),
    versionNumber: integer("version_number").notNull(),
    originalName: varchar("original_name", { length: 255 }).notNull(),
    storageKey: varchar("storage_key", { length: 512 }).notNull(),
    mimeType: varchar("mime_type", { length: 120 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    checksumSha256: varchar("checksum_sha256", { length: 64 }).notNull(),
    uploadedByUserId: integer("uploaded_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("document_versions_document_version_unique").on(table.documentId, table.versionNumber), index("document_versions_tenant_project_document_idx").on(table.tenantId, table.projectId, table.documentId)],
);

export const masterPlansStatusEnum = pgEnum("master_plans_status", ["active", "superseded", "archived"]);
export const masterPlans = pgTable(
  "master_plans",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    code: varchar("code", { length: 80 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    status: masterPlansStatusEnum("status").default("active").notNull(),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("master_plans_project_code_unique").on(table.projectId, table.code), index("master_plans_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status)],
);

export const masterPlanVersionsVersionKindEnum = pgEnum("master_plan_versions_version_kind", ["original", "revision", "updated"]);
export const masterPlanVersions = pgTable(
  "master_plan_versions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    masterPlanId: varchar("master_plan_id", { length: 36 }).notNull().references(() => masterPlans.id),
    versionNumber: integer("version_number").notNull(),
    versionKind: masterPlanVersionsVersionKindEnum("version_kind").notNull(),
    description: text("description"),
    changeSummary: text("change_summary"),
    sourceFileName: varchar("source_file_name", { length: 255 }),
    storageKey: varchar("storage_key", { length: 512 }),
    checksumSha256: varchar("checksum_sha256", { length: 64 }),
    // The plan underlay's turn (degrees, -180..180) and the real size of the plan area in metres, so an entity's map units read as metres (G-135).
    rotationDegrees: integer("rotation_degrees").default(0).notNull(),
    mapWidthMeters: numeric("map_width_meters", { precision: 12, scale: 2 }),
    mapHeightMeters: numeric("map_height_meters", { precision: 12, scale: 2 }),
    uploadedByUserId: integer("uploaded_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("master_plan_versions_plan_version_unique").on(table.masterPlanId, table.versionNumber), index("master_plan_versions_tenant_project_plan_idx").on(table.tenantId, table.projectId, table.masterPlanId)],
);

export const masterPlanSnapshotsMetricEnum = pgEnum("master_plan_snapshots_metric", ["progress", "status", "cost", "risk", "quality", "hse", "production", "custom"]);
export const masterPlanSnapshots = pgTable(
  "master_plan_snapshots",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    masterPlanVersionId: varchar("master_plan_version_id", { length: 36 }).notNull(),
    label: varchar("label", { length: 160 }).notNull(),
    metric: masterPlanSnapshotsMetricEnum("metric").notNull(),
    filtersJson: text("filters_json").notNull(),
    viewportJson: text("viewport_json").notNull(),
    layersJson: text("layers_json").notNull(),
    // false: only its creator sees it (the original rule); true: everyone who can read this project's Master Plan (G-136)
    sharedWithProject: boolean("shared_with_project").default(false).notNull(),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    foreignKey({ columns: [table.masterPlanVersionId], foreignColumns: [masterPlanVersions.id], name: "mps_plan_version_fk" }),
    index("master_plan_snapshots_tenant_project_version_creator_idx").on(table.tenantId, table.projectId, table.masterPlanVersionId, table.createdByUserId, table.createdAt),
  ],
);

export const masterPlanVisualizationRulesMetricEnum = pgEnum("master_plan_visualization_rules_metric", ["progress", "status", "cost"]);
export const masterPlanVisualizationRules = pgTable(
  "master_plan_visualization_rules",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    projectId: varchar("project_id", { length: 36 }).notNull(),
    metric: masterPlanVisualizationRulesMetricEnum("metric").notNull(),
    rulesJson: text("rules_json").notNull(),
    createdByUserId: integer("created_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    foreignKey({ columns: [table.tenantId], foreignColumns: [companies.id], name: "mpvr_tenant_fk" }),
    foreignKey({ columns: [table.projectId], foreignColumns: [projects.id], name: "mpvr_project_fk" }),
    foreignKey({ columns: [table.createdByUserId], foreignColumns: [users.id], name: "mpvr_creator_fk" }),
    uniqueIndex("master_plan_visualization_rules_project_metric_unique").on(table.tenantId, table.projectId, table.metric),
    index("master_plan_visualization_rules_tenant_project_idx").on(table.tenantId, table.projectId, table.updatedAt),
  ],
);

export const masterPlanSpatialEntitiesEntityTypeEnum = pgEnum("master_plan_spatial_entities_entity_type", ["block", "building", "zone", "unit", "area"]);
export const masterPlanSpatialEntitiesStatusEnum = pgEnum("master_plan_spatial_entities_status", ["not_started", "in_progress", "completed", "blocked"]);
export const masterPlanSpatialEntities = pgTable(
  "master_plan_spatial_entities",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    masterPlanVersionId: varchar("master_plan_version_id", { length: 36 }).notNull(),
    parentEntityId: varchar("parent_entity_id", { length: 36 }),
    code: varchar("code", { length: 120 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    entityType: masterPlanSpatialEntitiesEntityTypeEnum("entity_type").notNull(),
    geometry: text("geometry").notNull(),
    status: masterPlanSpatialEntitiesStatusEnum("status").default("not_started").notNull(),
    progressPercent: numeric("progress_percent", { precision: 5, scale: 2 }).default("0").notNull(),
    plannedValue: numeric("planned_value", { precision: 18, scale: 2 }).default("0").notNull(),
    actualValue: numeric("actual_value", { precision: 18, scale: 2 }).default("0").notNull(),
    forecastValue: numeric("forecast_value", { precision: 18, scale: 2 }).default("0").notNull(),
    wbsItemId: varchar("wbs_item_id", { length: 36 }).references(() => wbsItems.id),
    activityId: varchar("activity_id", { length: 36 }).references(() => activities.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [foreignKey({ columns: [table.masterPlanVersionId], foreignColumns: [masterPlanVersions.id], name: "mp_spatial_entities_version_fk" }), uniqueIndex("master_plan_spatial_entities_version_code_unique").on(table.masterPlanVersionId, table.code), index("master_plan_spatial_entities_tenant_project_version_idx").on(table.tenantId, table.projectId, table.masterPlanVersionId), index("master_plan_spatial_entities_version_status_idx").on(table.masterPlanVersionId, table.status)],
);

// Master Plan drawing (G-189): the drawing of one master plan version, its uploaded file versions (never deleted), the polygons the reader found,
// and the links a person confirmed from a polygon to a unit. Foreign keys are named here because the generated names would run past 63 characters.
export const masterPlanDrawings = pgTable(
  "master_plan_drawings",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    projectId: varchar("project_id", { length: 36 }).notNull(),
    masterPlanVersionId: varchar("master_plan_version_id", { length: 36 }).notNull(),
    createdByUserId: integer("created_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    foreignKey({ columns: [table.tenantId], foreignColumns: [companies.id], name: "mpd_tenant_fk" }),
    foreignKey({ columns: [table.projectId], foreignColumns: [projects.id], name: "mpd_project_fk" }),
    foreignKey({ columns: [table.masterPlanVersionId], foreignColumns: [masterPlanVersions.id], name: "mpd_version_fk" }),
    foreignKey({ columns: [table.createdByUserId], foreignColumns: [users.id], name: "mpd_creator_fk" }),
    uniqueIndex("master_plan_drawings_version_unique").on(table.masterPlanVersionId),
    index("master_plan_drawings_tenant_project_idx").on(table.tenantId, table.projectId),
  ],
);

export const masterPlanDrawingVersions = pgTable(
  "master_plan_drawing_versions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    projectId: varchar("project_id", { length: 36 }).notNull(),
    drawingId: varchar("drawing_id", { length: 36 }).notNull(),
    versionNumber: integer("version_number").notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 120 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    pageCount: integer("page_count").notNull(),
    checksumSha256: varchar("checksum_sha256", { length: 64 }).notNull(),
    storageKey: varchar("storage_key", { length: 512 }).notNull(),
    uploadedByUserId: integer("uploaded_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    foreignKey({ columns: [table.tenantId], foreignColumns: [companies.id], name: "mpdv_tenant_fk" }),
    foreignKey({ columns: [table.projectId], foreignColumns: [projects.id], name: "mpdv_project_fk" }),
    foreignKey({ columns: [table.drawingId], foreignColumns: [masterPlanDrawings.id], name: "mpdv_drawing_fk" }),
    foreignKey({ columns: [table.uploadedByUserId], foreignColumns: [users.id], name: "mpdv_uploader_fk" }),
    uniqueIndex("master_plan_drawing_versions_drawing_version_unique").on(table.drawingId, table.versionNumber),
    index("master_plan_drawing_versions_tenant_project_drawing_idx").on(table.tenantId, table.projectId, table.drawingId),
  ],
);

export const masterPlanDrawingPolygons = pgTable(
  "master_plan_drawing_polygons",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    projectId: varchar("project_id", { length: 36 }).notNull(),
    drawingId: varchar("drawing_id", { length: 36 }).notNull(),
    // the polygon's own id in the drawing as the reader gave it (for a DXF, "P1", "P2", ...); the browser keeps using it
    ref: varchar("ref", { length: 80 }).notNull(),
    label: varchar("label", { length: 120 }).default("").notNull(),
    points: text("points").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    foreignKey({ columns: [table.tenantId], foreignColumns: [companies.id], name: "mpdp_tenant_fk" }),
    foreignKey({ columns: [table.projectId], foreignColumns: [projects.id], name: "mpdp_project_fk" }),
    foreignKey({ columns: [table.drawingId], foreignColumns: [masterPlanDrawings.id], name: "mpdp_drawing_fk" }),
    uniqueIndex("master_plan_drawing_polygons_drawing_ref_unique").on(table.drawingId, table.ref),
    index("master_plan_drawing_polygons_tenant_project_drawing_idx").on(table.tenantId, table.projectId, table.drawingId),
  ],
);

export const masterPlanDrawingLinks = pgTable(
  "master_plan_drawing_links",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    projectId: varchar("project_id", { length: 36 }).notNull(),
    drawingId: varchar("drawing_id", { length: 36 }).notNull(),
    polygonId: varchar("polygon_id", { length: 36 }).notNull(),
    entityId: varchar("entity_id", { length: 36 }).notNull(),
    confirmedByUserId: integer("confirmed_by_user_id").notNull(),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    foreignKey({ columns: [table.tenantId], foreignColumns: [companies.id], name: "mpdl_tenant_fk" }),
    foreignKey({ columns: [table.projectId], foreignColumns: [projects.id], name: "mpdl_project_fk" }),
    foreignKey({ columns: [table.drawingId], foreignColumns: [masterPlanDrawings.id], name: "mpdl_drawing_fk" }),
    foreignKey({ columns: [table.polygonId], foreignColumns: [masterPlanDrawingPolygons.id], name: "mpdl_polygon_fk" }),
    foreignKey({ columns: [table.entityId], foreignColumns: [masterPlanSpatialEntities.id], name: "mpdl_entity_fk" }),
    foreignKey({ columns: [table.confirmedByUserId], foreignColumns: [users.id], name: "mpdl_confirmer_fk" }),
    uniqueIndex("master_plan_drawing_links_polygon_unique").on(table.polygonId),
    uniqueIndex("master_plan_drawing_links_drawing_entity_unique").on(table.drawingId, table.entityId),
    index("master_plan_drawing_links_tenant_project_drawing_idx").on(table.tenantId, table.projectId, table.drawingId),
  ],
);


export const rfisStatusEnum = pgEnum("rfis_status", ["draft", "submitted", "under_review", "answered", "closed", "cancelled"]);
export const rfis = pgTable(
  "rfis",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    rfiNumber: varchar("rfi_number", { length: 120 }).notNull(),
    subject: varchar("subject", { length: 255 }).notNull(),
    question: text("question").notNull(),
    status: rfisStatusEnum("status").default("draft").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("rfis_project_number_unique").on(table.projectId, table.rfiNumber), index("rfis_tenant_project_status_due_idx").on(table.tenantId, table.projectId, table.status, table.dueAt)],
);

export const ncrsStatusEnum = pgEnum("ncrs_status", ["open", "under_investigation", "corrective_action", "verification", "closed", "cancelled"]);
export const ncrs = pgTable(
  "ncrs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    ncrNumber: varchar("ncr_number", { length: 120 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    status: ncrsStatusEnum("status").default("open").notNull(),
    // The cell (unit x activity) the non-conformance was found in; both empty for a site-wide NCR (work order 12, item 6).
    pmcUnitId: varchar("pmc_unit_id", { length: 36 }),
    pmcActivityDefinitionId: varchar("pmc_activity_definition_id", { length: 36 }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("ncrs_project_number_unique").on(table.projectId, table.ncrNumber), index("ncrs_tenant_project_status_due_idx").on(table.tenantId, table.projectId, table.status, table.dueAt)],
);

export const hseObservationsCategoryEnum = pgEnum("hse_observations_category", ["safety", "health", "environment"]);
export const hseObservationsSeverityEnum = pgEnum("hse_observations_severity", ["low", "medium", "high", "critical"]);
export const hseObservationsStatusEnum = pgEnum("hse_observations_status", ["open", "assigned", "remediation", "verification", "closed", "cancelled"]);
export const hseObservations = pgTable(
  "hse_observations",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    observationNumber: varchar("observation_number", { length: 120 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    category: hseObservationsCategoryEnum("category").notNull(),
    severity: hseObservationsSeverityEnum("severity").default("medium").notNull(),
    status: hseObservationsStatusEnum("status").default("open").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("hse_observations_project_number_unique").on(table.projectId, table.observationNumber), index("hse_observations_tenant_project_status_due_idx").on(table.tenantId, table.projectId, table.status, table.dueAt)],
);

export const fieldReportsReportTypeEnum = pgEnum("field_reports_report_type", ["daily", "inspection", "progress"]);
export const fieldReportsShiftEnum = pgEnum("field_reports_shift", ["day", "night"]);
export const fieldReportsStatusEnum = pgEnum("field_reports_status", ["draft", "submitted", "reviewed", "approved", "rejected"]);
export const fieldReports = pgTable(
  "field_reports",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    reportNumber: varchar("report_number", { length: 120 }).notNull(),
    reportType: fieldReportsReportTypeEnum("report_type").notNull(),
    reportedAt: timestamp("reported_at", { withTimezone: true }).notNull(),
    shift: fieldReportsShiftEnum("shift").default("day").notNull(),
    workforceCount: integer("workforce_count").default(0).notNull(),
    weather: varchar("weather", { length: 160 }),
    summary: text("summary").notNull(),
    status: fieldReportsStatusEnum("status").default("draft").notNull(),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("field_reports_project_number_unique").on(table.projectId, table.reportNumber),
    index("field_reports_tenant_project_date_status_idx").on(table.tenantId, table.projectId, table.reportedAt, table.status),
  ],
);

export const qualityInspectionsInspectionTypeEnum = pgEnum("quality_inspections_inspection_type", ["hold_point", "witness", "surveillance", "testing"]);
export const qualityInspectionsOutcomeEnum = pgEnum("quality_inspections_outcome", ["pass", "fail", "conditional"]);
export const qualityInspectionsStatusEnum = pgEnum("quality_inspections_status", ["draft", "submitted", "accepted", "rejected"]);
export const qualityInspections = pgTable(
  "quality_inspections",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    inspectionNumber: varchar("inspection_number", { length: 120 }).notNull(),
    inspectionType: qualityInspectionsInspectionTypeEnum("inspection_type").notNull(),
    inspectedAt: timestamp("inspected_at", { withTimezone: true }).notNull(),
    outcome: qualityInspectionsOutcomeEnum("outcome").notNull(),
    summary: text("summary").notNull(),
    status: qualityInspectionsStatusEnum("status").default("draft").notNull(),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("quality_inspections_project_number_unique").on(table.projectId, table.inspectionNumber),
    index("quality_inspections_tenant_project_date_status_idx").on(table.tenantId, table.projectId, table.inspectedAt, table.status),
  ],
);

export const purchaseOrdersStatusEnum = pgEnum("purchase_orders_status", ["draft", "submitted", "approved", "issued", "received", "cancelled"]);
export const purchaseOrders = pgTable(
  "purchase_orders",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    contractId: varchar("contract_id", { length: 36 }).references(() => contracts.id),
    commitmentId: varchar("commitment_id", { length: 36 }).references(() => commitments.id),
    // The WBS item the order is for, so its open commitment can be shown beside plan, actual and forecast at that level.
    wbsItemId: varchar("wbs_item_id", { length: 36 }).references(() => wbsItems.id),
    // The supplier register entry the order is placed with (G-103); supplierName stays as the name printed on the order and is copied from the register when an entry is chosen.
    supplierId: varchar("supplier_id", { length: 36 }),
    purchaseOrderNumber: varchar("purchase_order_number", { length: 120 }).notNull(),
    supplierName: varchar("supplier_name", { length: 240 }).notNull(),
    orderDate: timestamp("order_date", { withTimezone: true }).notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    summary: text("summary").notNull(),
    status: purchaseOrdersStatusEnum("status").default("draft").notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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

export const goodsReceiptNotesReceiptModeEnum = pgEnum("goods_receipt_notes_receipt_mode", ["warehouse_stock", "direct_to_site"]);
export const goodsReceiptNotes = pgTable(
  "goods_receipt_notes",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    projectId: varchar("project_id", { length: 36 }).notNull(),
    purchaseOrderId: varchar("purchase_order_id", { length: 36 }).notNull(),
    materialId: varchar("material_id", { length: 36 }).notNull(),
    qualityInspectionId: varchar("quality_inspection_id", { length: 36 }),
    ncrId: varchar("ncr_id", { length: 36 }),
    grnNumber: varchar("grn_number", { length: 120 }).notNull(),
    receivedQuantity: numeric("received_quantity", { precision: 18, scale: 3 }).notNull(),
    rejectedQuantity: numeric("rejected_quantity", { precision: 18, scale: 3 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 18, scale: 2 }).notNull().default("0"),
    unitOfMeasure: varchar("unit_of_measure", { length: 40 }).notNull(),
    receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
    note: text("note"),
    costEntryId: varchar("cost_entry_id", { length: 36 }).references(() => costEntries.id),
    // 'warehouse_stock' raises the shelf and charges the cost when the material is issued to a WBS item; 'direct_to_site' charges the cost at receipt and never touches the shelf.
    // Rows that existed before stock valuation are 'direct_to_site': their cost was booked at receipt and no stock was ever raised.
    receiptMode: goodsReceiptNotesReceiptModeEnum("receipt_mode").default("direct_to_site").notNull(),
    warehouseId: varchar("warehouse_id", { length: 36 }),
    inventoryTransactionId: varchar("inventory_transaction_id", { length: 36 }),
    createdByUserId: integer("created_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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

export const suppliers = pgTable(
  "suppliers",
  { id: varchar("id", { length: 36 }).primaryKey(), tenantId: varchar("tenant_id", { length: 36 }).notNull(), code: varchar("code", { length: 80 }).notNull(), legalName: varchar("legal_name", { length: 240 }).notNull(), contactName: varchar("contact_name", { length: 160 }), contactEmail: varchar("contact_email", { length: 254 }), contactPhone: varchar("contact_phone", { length: 60 }), active: boolean("active").default(true).notNull(), createdByUserId: integer("created_by_user_id").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull() },
  table => [uniqueIndex("suppliers_tenant_code_unique").on(table.tenantId, table.code), index("suppliers_tenant_active_idx").on(table.tenantId, table.active), foreignKey({ columns: [table.tenantId], foreignColumns: [companies.id], name: "sup_tenant_fk" }), foreignKey({ columns: [table.createdByUserId], foreignColumns: [users.id], name: "sup_creator_fk" })],
);

export const procurementRequisitionsStatusEnum = pgEnum("procurement_requisitions_status", ["draft", "submitted", "approved", "partially_issued", "closed", "rejected", "cancelled"]);
export const procurementRequisitions = pgTable(
  "procurement_requisitions",
  { id: varchar("id", { length: 36 }).primaryKey(), tenantId: varchar("tenant_id", { length: 36 }).notNull(), projectId: varchar("project_id", { length: 36 }).notNull(), requisitionNumber: varchar("requisition_number", { length: 120 }).notNull(), supplierId: varchar("supplier_id", { length: 36 }), materialId: varchar("material_id", { length: 36 }), wbsItemId: varchar("wbs_item_id", { length: 36 }), activityId: varchar("activity_id", { length: 36 }), purchaseOrderId: varchar("purchase_order_id", { length: 36 }), purchaseOrderLinkedAt: timestamp("purchase_order_linked_at", { withTimezone: true }), purchaseOrderLinkedByUserId: integer("purchase_order_linked_by_user_id"), description: text("description").notNull(), requestedQuantity: numeric("requested_quantity", { precision: 18, scale: 3 }).notNull(), unitOfMeasure: varchar("unit_of_measure", { length: 40 }).notNull(), requiredAt: timestamp("required_at", { withTimezone: true }).notNull(), status: procurementRequisitionsStatusEnum("status").default("draft").notNull(), reviewedAt: timestamp("reviewed_at", { withTimezone: true }), createdByUserId: integer("created_by_user_id").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull() },
  table => [uniqueIndex("procurement_requisitions_project_number_unique").on(table.projectId, table.requisitionNumber), index("procurement_requisitions_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status), index("procurement_requisitions_purchase_order_idx").on(table.purchaseOrderId), foreignKey({ columns: [table.tenantId], foreignColumns: [companies.id], name: "prq_tenant_fk" }), foreignKey({ columns: [table.projectId], foreignColumns: [projects.id], name: "prq_project_fk" }), foreignKey({ columns: [table.supplierId], foreignColumns: [suppliers.id], name: "prq_supplier_fk" }), foreignKey({ columns: [table.materialId], foreignColumns: [materialMasters.id], name: "prq_material_fk" }), foreignKey({ columns: [table.wbsItemId], foreignColumns: [wbsItems.id], name: "prq_wbs_fk" }), foreignKey({ columns: [table.activityId], foreignColumns: [activities.id], name: "prq_activity_fk" }), foreignKey({ columns: [table.purchaseOrderId], foreignColumns: [purchaseOrders.id], name: "prq_purchase_order_fk" }), foreignKey({ columns: [table.purchaseOrderLinkedByUserId], foreignColumns: [users.id], name: "prq_po_linker_fk" }), foreignKey({ columns: [table.createdByUserId], foreignColumns: [users.id], name: "prq_creator_fk" })],
);

export const materialMasters = pgTable(
  "material_masters",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    code: varchar("code", { length: 120 }).notNull(),
    description: varchar("description", { length: 255 }).notNull(),
    unitOfMeasure: varchar("unit_of_measure", { length: 40 }).notNull(),
    category: varchar("category", { length: 120 }).notNull(),
    referenceSpecification: varchar("reference_specification", { length: 255 }),
    active: boolean("active").default(true).notNull(),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("material_masters_tenant_code_unique").on(table.tenantId, table.code),
    index("material_masters_tenant_category_active_idx").on(table.tenantId, table.category, table.active),
  ],
);

export const projectMaterialOverrides = pgTable(
  "project_material_overrides",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    materialId: varchar("material_id", { length: 36 }).notNull().references(() => materialMasters.id),
    projectDescription: varchar("project_description", { length: 255 }),
    referenceSpecification: varchar("reference_specification", { length: 255 }),
    reorderLevel: numeric("reorder_level", { precision: 18, scale: 3 }),
    active: boolean("active").default(true).notNull(),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("project_material_overrides_project_material_unique").on(table.projectId, table.materialId),
    index("project_material_overrides_tenant_project_idx").on(table.tenantId, table.projectId, table.materialId),
  ],
);

export const projectWarehouses = pgTable(
  "project_warehouses",
  { id: varchar("id", { length: 36 }).primaryKey(), tenantId: varchar("tenant_id", { length: 36 }).notNull(), projectId: varchar("project_id", { length: 36 }).notNull(), code: varchar("code", { length: 80 }).notNull(), name: varchar("name", { length: 160 }).notNull(), locationDescription: varchar("location_description", { length: 255 }), active: boolean("active").default(true).notNull(), createdByUserId: integer("created_by_user_id").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull() },
  table => [uniqueIndex("project_warehouses_project_code_unique").on(table.projectId, table.code), index("project_warehouses_tenant_project_active_idx").on(table.tenantId, table.projectId, table.active), foreignKey({ columns: [table.tenantId], foreignColumns: [companies.id], name: "pwh_tenant_fk" }), foreignKey({ columns: [table.projectId], foreignColumns: [projects.id], name: "pwh_project_fk" }), foreignKey({ columns: [table.createdByUserId], foreignColumns: [users.id], name: "pwh_creator_fk" })],
);

export const warehouseInventoryTransfers = pgTable(
  "warehouse_inventory_transfers",
  { id: varchar("id", { length: 36 }).primaryKey(), tenantId: varchar("tenant_id", { length: 36 }).notNull(), projectId: varchar("project_id", { length: 36 }).notNull(), sourceWarehouseId: varchar("source_warehouse_id", { length: 36 }).notNull(), destinationWarehouseId: varchar("destination_warehouse_id", { length: 36 }).notNull(), /* set only when the stock moved to another project of the company (work order 12, item 3) */ destinationProjectId: varchar("destination_project_id", { length: 36 }), materialId: varchar("material_id", { length: 36 }).notNull(), quantity: numeric("quantity", { precision: 18, scale: 3 }).notNull(), referenceNumber: varchar("reference_number", { length: 120 }), note: varchar("note", { length: 500 }), transferredAt: timestamp("transferred_at", { withTimezone: true }).notNull(), createdByUserId: integer("created_by_user_id").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull() },
  table => [index("witf_tenant_project_date_idx").on(table.tenantId, table.projectId, table.transferredAt), index("witf_source_destination_idx").on(table.sourceWarehouseId, table.destinationWarehouseId), foreignKey({ columns: [table.tenantId], foreignColumns: [companies.id], name: "witf_tenant_fk" }), foreignKey({ columns: [table.projectId], foreignColumns: [projects.id], name: "witf_project_fk" }), foreignKey({ columns: [table.sourceWarehouseId], foreignColumns: [projectWarehouses.id], name: "witf_source_fk" }), foreignKey({ columns: [table.destinationWarehouseId], foreignColumns: [projectWarehouses.id], name: "witf_destination_fk" }), foreignKey({ columns: [table.materialId], foreignColumns: [materialMasters.id], name: "witf_material_fk" }), foreignKey({ columns: [table.createdByUserId], foreignColumns: [users.id], name: "witf_creator_fk" })],
);

export const warehouseInventoryTransactionsTransactionTypeEnum = pgEnum("warehouse_inventory_transactions_transaction_type", ["receipt", "issue", "adjustment"]);
export const warehouseInventoryTransactions = pgTable(
  "warehouse_inventory_transactions",
  { id: varchar("id", { length: 36 }).primaryKey(), tenantId: varchar("tenant_id", { length: 36 }).notNull(), projectId: varchar("project_id", { length: 36 }).notNull(), warehouseId: varchar("warehouse_id", { length: 36 }).notNull(), materialId: varchar("material_id", { length: 36 }).notNull(), requisitionId: varchar("requisition_id", { length: 36 }), transferId: varchar("transfer_id", { length: 36 }), transactionType: warehouseInventoryTransactionsTransactionTypeEnum("transaction_type").notNull(), quantityDelta: numeric("quantity_delta", { precision: 18, scale: 3 }).notNull(), unitCost: numeric("unit_cost", { precision: 18, scale: 4 }), valueDelta: numeric("value_delta", { precision: 18, scale: 2 }), referenceNumber: varchar("reference_number", { length: 120 }), note: varchar("note", { length: 500 }), occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(), createdByUserId: integer("created_by_user_id").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull() },
  table => [index("warehouse_inventory_transactions_tenant_project_date_idx").on(table.tenantId, table.projectId, table.occurredAt), index("warehouse_inventory_transactions_warehouse_material_idx").on(table.warehouseId, table.materialId), index("warehouse_inventory_transactions_requisition_idx").on(table.requisitionId, table.transactionType), index("wit_transfer_idx").on(table.transferId), foreignKey({ columns: [table.tenantId], foreignColumns: [companies.id], name: "wit_tenant_fk" }), foreignKey({ columns: [table.projectId], foreignColumns: [projects.id], name: "wit_project_fk" }), foreignKey({ columns: [table.warehouseId], foreignColumns: [projectWarehouses.id], name: "wit_warehouse_fk" }), foreignKey({ columns: [table.materialId], foreignColumns: [materialMasters.id], name: "wit_material_fk" }), foreignKey({ columns: [table.requisitionId], foreignColumns: [procurementRequisitions.id], name: "wit_requisition_fk" }), foreignKey({ columns: [table.transferId], foreignColumns: [warehouseInventoryTransfers.id], name: "wit_transfer_fk" }), foreignKey({ columns: [table.createdByUserId], foreignColumns: [users.id], name: "wit_creator_fk" })],
);

export const materialIssues = pgTable(
  "material_issues",
  { id: varchar("id", { length: 36 }).primaryKey(), tenantId: varchar("tenant_id", { length: 36 }).notNull(), projectId: varchar("project_id", { length: 36 }).notNull(), inventoryTransactionId: varchar("inventory_transaction_id", { length: 36 }).notNull(), costEntryId: varchar("cost_entry_id", { length: 36 }).notNull(), materialId: varchar("material_id", { length: 36 }).notNull(), wbsItemId: varchar("wbs_item_id", { length: 36 }).notNull(), activityId: varchar("activity_id", { length: 36 }), /* the cell the material went into: a unit and its inspection activity (work order 12, item 3) */ pmcUnitId: varchar("pmc_unit_id", { length: 36 }), pmcActivityDefinitionId: varchar("pmc_activity_definition_id", { length: 36 }), issuedQuantity: numeric("issued_quantity", { precision: 18, scale: 3 }).notNull(), unitCost: numeric("unit_cost", { precision: 18, scale: 2 }).notNull(), totalCost: numeric("total_cost", { precision: 18, scale: 2 }).notNull(), issuedAt: timestamp("issued_at", { withTimezone: true }).notNull(), createdByUserId: integer("created_by_user_id").notNull(), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull() },
  table => [uniqueIndex("material_issues_tx_unique").on(table.inventoryTransactionId), uniqueIndex("material_issues_cost_unique").on(table.costEntryId), index("material_issues_tenant_project_idx").on(table.tenantId, table.projectId, table.issuedAt), index("material_issues_wbs_activity_idx").on(table.wbsItemId, table.activityId), foreignKey({ columns: [table.tenantId], foreignColumns: [companies.id], name: "mi_tenant_fk" }), foreignKey({ columns: [table.projectId], foreignColumns: [projects.id], name: "mi_project_fk" }), foreignKey({ columns: [table.inventoryTransactionId], foreignColumns: [warehouseInventoryTransactions.id], name: "mi_tx_fk" }), foreignKey({ columns: [table.costEntryId], foreignColumns: [costEntries.id], name: "mi_cost_fk" }), foreignKey({ columns: [table.materialId], foreignColumns: [materialMasters.id], name: "mi_material_fk" }), foreignKey({ columns: [table.wbsItemId], foreignColumns: [wbsItems.id], name: "mi_wbs_fk" }), foreignKey({ columns: [table.activityId], foreignColumns: [activities.id], name: "mi_activity_fk" }), foreignKey({ columns: [table.createdByUserId], foreignColumns: [users.id], name: "mi_creator_fk" })],
);

// Material taken back from the work to the shelf (work order 12, item 3). The issue and its cost entry stay as they were; the return is its own
// receipt movement and its own NEGATIVE actual cost entry at the unit cost of the issue, so what was charged and what was undone are both on the books.
export const materialReturns = pgTable(
  "material_returns",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    materialIssueId: varchar("material_issue_id", { length: 36 }).notNull().references(() => materialIssues.id),
    inventoryTransactionId: varchar("inventory_transaction_id", { length: 36 }).notNull(),
    costEntryId: varchar("cost_entry_id", { length: 36 }).notNull().references(() => costEntries.id),
    quantity: numeric("quantity", { precision: 18, scale: 3 }).notNull(),
    unitCost: numeric("unit_cost", { precision: 18, scale: 2 }).notNull(),
    totalCost: numeric("total_cost", { precision: 18, scale: 2 }).notNull(),
    returnedAt: timestamp("returned_at", { withTimezone: true }).notNull(),
    reason: varchar("reason", { length: 500 }).notNull(),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [foreignKey({ columns: [table.inventoryTransactionId], foreignColumns: [warehouseInventoryTransactions.id], name: "material_returns_tx_fk" }), uniqueIndex("material_returns_tx_unique").on(table.inventoryTransactionId), uniqueIndex("material_returns_cost_unique").on(table.costEntryId), index("material_returns_issue_idx").on(table.materialIssueId), index("material_returns_tenant_project_idx").on(table.tenantId, table.projectId, table.returnedAt)],
);

// A stock count: what the books said, what was counted, and the adjustment each difference became (work order 12, item 3).
export const warehouseStocktakes = pgTable(
  "warehouse_stocktakes",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    warehouseId: varchar("warehouse_id", { length: 36 }).notNull().references(() => projectWarehouses.id),
    reference: varchar("reference", { length: 120 }),
    note: varchar("note", { length: 500 }).notNull(),
    countedAt: timestamp("counted_at", { withTimezone: true }).notNull(),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("warehouse_stocktakes_tenant_project_idx").on(table.tenantId, table.projectId, table.countedAt), index("warehouse_stocktakes_warehouse_idx").on(table.warehouseId)],
);

export const warehouseStocktakeLines = pgTable(
  "warehouse_stocktake_lines",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    stocktakeId: varchar("stocktake_id", { length: 36 }).notNull(),
    materialId: varchar("material_id", { length: 36 }).notNull().references(() => materialMasters.id),
    systemQuantity: numeric("system_quantity", { precision: 18, scale: 3 }).notNull(),
    countedQuantity: numeric("counted_quantity", { precision: 18, scale: 3 }).notNull(),
    variance: numeric("variance", { precision: 18, scale: 3 }).notNull(),
    valueDelta: numeric("value_delta", { precision: 18, scale: 2 }),
    inventoryTransactionId: varchar("inventory_transaction_id", { length: 36 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [foreignKey({ columns: [table.stocktakeId], foreignColumns: [warehouseStocktakes.id], name: "wh_stocktake_lines_stocktake_fk" }), foreignKey({ columns: [table.inventoryTransactionId], foreignColumns: [warehouseInventoryTransactions.id], name: "wh_stocktake_lines_tx_fk" }), uniqueIndex("warehouse_stocktake_lines_material_unique").on(table.stocktakeId, table.materialId), index("warehouse_stocktake_lines_tenant_project_idx").on(table.tenantId, table.projectId)],
);

export const changeRequestsStatusEnum = pgEnum("change_requests_status", ["draft", "submitted", "under_review", "approved", "rejected", "cancelled"]);
export const changeRequests = pgTable(
  "change_requests",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    changeNumber: varchar("change_number", { length: 120 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    impactScheduleDays: integer("impact_schedule_days").default(0).notNull(),
    impactCost: numeric("impact_cost", { precision: 18, scale: 2 }).default("0").notNull(),
    // Effect of an APPROVED change order on the client contract value (can be negative).
    // impactCost is the cost side; this is the price side the profitability screen adds.
    contractValueImpact: numeric("contract_value_impact", { precision: 18, scale: 2 }).default("0").notNull(),
    currency: varchar("currency", { length: 3 }).default("SAR").notNull(),
    status: changeRequestsStatusEnum("status").default("draft").notNull(),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedByUserId: integer("reviewed_by_user_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("change_requests_project_number_unique").on(table.projectId, table.changeNumber), index("change_requests_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status)],
);

export const claimsStatusEnum = pgEnum("claims_status", ["draft", "submitted", "under_review", "approved", "rejected", "withdrawn"]);
export const claims = pgTable(
  "claims",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    contractId: varchar("contract_id", { length: 36 }).references(() => contracts.id),
    claimNumber: varchar("claim_number", { length: 120 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description").notNull(),
    claimedAmount: numeric("claimed_amount", { precision: 18, scale: 2 }).notNull(),
    approvedAmount: numeric("approved_amount", { precision: 18, scale: 2 }),
    currency: varchar("currency", { length: 3 }).default("SAR").notNull(),
    status: claimsStatusEnum("status").default("draft").notNull(),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    resolvedAt: timestamp("resolved_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("claims_project_number_unique").on(table.projectId, table.claimNumber), index("claims_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status), index("claims_contract_idx").on(table.contractId)],
);

export const projectResourcesResourceTypeEnum = pgEnum("project_resources_resource_type", ["labor", "equipment", "material", "service"]);
export const projectResources = pgTable(
  "project_resources",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    resourceCode: varchar("resource_code", { length: 120 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    resourceType: projectResourcesResourceTypeEnum("resource_type").notNull(),
    plannedUnits: numeric("planned_units", { precision: 14, scale: 2 }).default("0").notNull(),
    allocatedUnits: numeric("allocated_units", { precision: 14, scale: 2 }).default("0").notNull(),
    unitCost: numeric("unit_cost", { precision: 18, scale: 2 }).default("0").notNull(),
    currency: varchar("currency", { length: 3 }).default("SAR").notNull(),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("project_resources_project_code_unique").on(table.projectId, table.resourceCode), index("project_resources_tenant_project_type_idx").on(table.tenantId, table.projectId, table.resourceType)],
);

export const wbsItems = pgTable(
  "wbs_items",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    parentId: varchar("parent_id", { length: 36 }),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    plannedValue: numeric("planned_value", { precision: 18, scale: 2 }).default("0").notNull(),
    earnedValue: numeric("earned_value", { precision: 18, scale: 2 }).default("0").notNull(),
    actualCost: numeric("actual_cost", { precision: 18, scale: 2 }).default("0").notNull(),
    progressPercent: numeric("progress_percent", { precision: 5, scale: 2 }).default("0").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("wbs_items_project_code_unique").on(table.projectId, table.code), index("wbs_items_tenant_project_idx").on(table.tenantId, table.projectId)],
);

export const activitiesStatusEnum = pgEnum("activities_status", ["not_started", "in_progress", "completed", "blocked"]);
export const activities = pgTable(
  "activities",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    wbsItemId: varchar("wbs_item_id", { length: 36 }).references(() => wbsItems.id),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    status: activitiesStatusEnum("status").default("not_started").notNull(),
    plannedValue: numeric("planned_value", { precision: 18, scale: 2 }).default("0").notNull(),
    earnedValue: numeric("earned_value", { precision: 18, scale: 2 }).default("0").notNull(),
    plannedStartAt: timestamp("planned_start_at", { withTimezone: true }),
    plannedFinishAt: timestamp("planned_finish_at", { withTimezone: true }),
    actualStartAt: timestamp("actual_start_at", { withTimezone: true }),
    actualFinishAt: timestamp("actual_finish_at", { withTimezone: true }),
    // From a Primavera P6 import (work order 20): the source system's id, the kind of activity, its calendar, its durations, completion and float. Null for an activity entered by hand.
    externalId: varchar("external_id", { length: 40 }),
    taskType: varchar("task_type", { length: 24 }),
    calendarId: varchar("calendar_id", { length: 36 }),
    durationHours: numeric("duration_hours", { precision: 10, scale: 2 }),
    remainingHours: numeric("remaining_hours", { precision: 10, scale: 2 }),
    percentComplete: numeric("percent_complete", { precision: 5, scale: 2 }),
    totalFloatHours: numeric("total_float_hours", { precision: 10, scale: 2 }),
    constraintType: varchar("constraint_type", { length: 24 }),
    constraintDate: timestamp("constraint_date", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("activities_project_code_unique").on(table.projectId, table.code), index("activities_tenant_project_idx").on(table.tenantId, table.projectId)],
);

export const budgetLines = pgTable(
  "budget_lines",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    wbsItemId: varchar("wbs_item_id", { length: 36 }).references(() => wbsItems.id),
    costCode: varchar("cost_code", { length: 80 }).notNull(),
    originalAmount: numeric("original_amount", { precision: 18, scale: 2 }).default("0").notNull(),
    currentAmount: numeric("current_amount", { precision: 18, scale: 2 }).default("0").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("budget_lines_tenant_project_idx").on(table.tenantId, table.projectId)],
);

export const costEntriesEntryTypeEnum = pgEnum("cost_entries_entry_type", ["actual", "accrual", "adjustment"]);
export const costEntriesStatusEnum = pgEnum("cost_entries_status", ["draft", "posted", "void"]);
export const costEntriesCategoryEnum = pgEnum("cost_entries_category", ["materials", "labour", "subcontract", "other"]);
export const costEntries = pgTable(
  "cost_entries",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    wbsItemId: varchar("wbs_item_id", { length: 36 }).references(() => wbsItems.id),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    entryType: costEntriesEntryTypeEnum("entry_type").notNull(),
    status: costEntriesStatusEnum("status").default("draft").notNull(),
    incurredAt: timestamp("incurred_at", { withTimezone: true }).notNull(),
    // What the cost is and the document it came from, so profit can be drilled down to its source.
    category: costEntriesCategoryEnum("category").default("other").notNull(),
    sourceType: varchar("source_type", { length: 40 }),
    sourceId: varchar("source_id", { length: 36 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("cost_entries_tenant_project_date_idx").on(table.tenantId, table.projectId, table.incurredAt)],
);

export const progressEntriesStatusEnum = pgEnum("progress_entries_status", ["draft", "submitted", "validated", "rejected"]);
export const progressEntries = pgTable(
  "progress_entries",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    wbsItemId: varchar("wbs_item_id", { length: 36 }).references(() => wbsItems.id),
    activityId: varchar("activity_id", { length: 36 }).references(() => activities.id),
    progressPercent: numeric("progress_percent", { precision: 5, scale: 2 }).notNull(),
    status: progressEntriesStatusEnum("status").default("draft").notNull(),
    measuredAt: timestamp("measured_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("progress_entries_tenant_project_date_idx").on(table.tenantId, table.projectId, table.measuredAt)],
);

export const evmSnapshotsEacMethodEnum = pgEnum("evm_snapshots_eac_method", ["bac_over_cpi", "ac_plus_remaining", "ac_plus_remaining_over_cpi_spi", "manual"]);
export const evmSnapshots = pgTable(
  "evm_snapshots",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    periodAt: timestamp("period_at", { withTimezone: true }).notNull(),
    pv: numeric("pv", { precision: 18, scale: 2 }).notNull(),
    ev: numeric("ev", { precision: 18, scale: 2 }).notNull(),
    ac: numeric("ac", { precision: 18, scale: 2 }).notNull(),
    bac: numeric("bac", { precision: 18, scale: 2 }).notNull(),
    cv: numeric("cv", { precision: 18, scale: 2 }).notNull(),
    sv: numeric("sv", { precision: 18, scale: 2 }).notNull(),
    cpi: numeric("cpi", { precision: 12, scale: 4 }),
    spi: numeric("spi", { precision: 12, scale: 4 }),
    eac: numeric("eac", { precision: 18, scale: 2 }).notNull(),
    etc: numeric("etc", { precision: 18, scale: 2 }).notNull(),
    vac: numeric("vac", { precision: 18, scale: 2 }).notNull(),
    tcpi: numeric("tcpi", { precision: 12, scale: 4 }),
    eacMethod: evmSnapshotsEacMethodEnum("eac_method").notNull(),
    // Profitability extension (null on snapshots taken before it existed).
    adjustedContractValue: numeric("adjusted_contract_value", { precision: 18, scale: 2 }),
    fpac: numeric("fpac", { precision: 18, scale: 2 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("evm_snapshots_project_period_unique").on(table.projectId, table.periodAt), index("evm_snapshots_tenant_project_idx").on(table.tenantId, table.projectId)],
);

export const risksStatusEnum = pgEnum("risks_status", ["open", "mitigating", "accepted", "closed"]);
export const risks = pgTable(
  "risks",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    code: varchar("code", { length: 80 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    cause: text("cause"),
    event: text("event"),
    impact: text("impact"),
    probability: integer("probability").notNull(),
    severity: integer("severity").notNull(),
    residualProbability: integer("residual_probability"),
    residualSeverity: integer("residual_severity"),
    response: text("response"),
    mitigation: text("mitigation"),
    trigger: text("trigger"),
    ownerMembershipId: varchar("owner_membership_id", { length: 36 }).references(() => memberships.id),
    dueAt: timestamp("due_at", { withTimezone: true }),
    status: risksStatusEnum("status").default("open").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("risks_project_code_unique").on(table.projectId, table.code), index("risks_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status)],
);

export const issuesPriorityEnum = pgEnum("issues_priority", ["low", "medium", "high", "critical"]);
export const issuesEscalationStatusEnum = pgEnum("issues_escalation_status", ["none", "pending", "escalated"]);
export const issuesStatusEnum = pgEnum("issues_status", ["open", "in_progress", "resolved", "closed"]);
export const issues = pgTable(
  "issues",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    code: varchar("code", { length: 80 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    cause: text("cause"),
    impact: text("impact"),
    priority: issuesPriorityEnum("priority").default("medium").notNull(),
    ownerMembershipId: varchar("owner_membership_id", { length: 36 }).references(() => memberships.id),
    dueAt: timestamp("due_at", { withTimezone: true }),
    escalationStatus: issuesEscalationStatusEnum("escalation_status").default("none").notNull(),
    status: issuesStatusEnum("status").default("open").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("issues_project_code_unique").on(table.projectId, table.code), index("issues_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status)],
);

export const actionsPriorityEnum = pgEnum("actions_priority", ["low", "medium", "high", "critical"]);
export const actionsEscalationStatusEnum = pgEnum("actions_escalation_status", ["none", "pending", "escalated"]);
export const actionsStatusEnum = pgEnum("actions_status", ["open", "in_progress", "completed", "cancelled"]);
export const actions = pgTable(
  "actions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).references(() => projects.id),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    priority: actionsPriorityEnum("priority").default("medium").notNull(),
    ownerMembershipId: varchar("owner_membership_id", { length: 36 }).references(() => memberships.id),
    dueAt: timestamp("due_at", { withTimezone: true }),
    evidenceDocumentId: varchar("evidence_document_id", { length: 36 }),
    escalationStatus: actionsEscalationStatusEnum("escalation_status").default("none").notNull(),
    status: actionsStatusEnum("status").default("open").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("actions_tenant_project_due_idx").on(table.tenantId, table.projectId, table.dueAt)],
);

export const decisionsStatusEnum = pgEnum("decisions_status", ["draft", "submitted", "approved", "rejected", "implemented"]);
export const decisions = pgTable(
  "decisions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).references(() => projects.id),
    problem: text("problem").notNull(),
    options: text("options").notNull(),
    recommendation: text("recommendation"),
    costImpact: numeric("cost_impact", { precision: 18, scale: 2 }),
    scheduleImpactDays: integer("schedule_impact_days"),
    riskImpact: text("risk_impact"),
    decisionOwnerMembershipId: varchar("decision_owner_membership_id", { length: 36 }).references(() => memberships.id),
    decision: text("decision"),
    status: decisionsStatusEnum("status").default("draft").notNull(),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("decisions_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status)],
);

export const controlRecordLinksSourceTypeEnum = pgEnum("control_record_links_source_type", ["risk", "issue", "action", "decision"]);
export const controlRecordLinksTargetTypeEnum = pgEnum("control_record_links_target_type", ["risk", "issue", "action", "decision", "rfi", "ncr"]);
export const controlRecordLinks = pgTable(
  "control_record_links",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    sourceType: controlRecordLinksSourceTypeEnum("source_type").notNull(),
    sourceId: varchar("source_id", { length: 36 }).notNull(),
    targetType: controlRecordLinksTargetTypeEnum("target_type").notNull(),
    targetId: varchar("target_id", { length: 36 }).notNull(),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("control_record_links_project_source_target_unique").on(table.projectId, table.sourceType, table.sourceId, table.targetType, table.targetId),
    index("control_record_links_tenant_project_source_idx").on(table.tenantId, table.projectId, table.sourceType, table.sourceId),
    index("control_record_links_tenant_project_target_idx").on(table.tenantId, table.projectId, table.targetType, table.targetId),
  ],
);

export const projectHealthSnapshotsStatusEnum = pgEnum("project_health_snapshots_status", ["green", "amber", "red"]);
export const projectHealthSnapshotsConfidenceEnum = pgEnum("project_health_snapshots_confidence", ["low", "medium", "high"]);
export const projectHealthSnapshots = pgTable(
  "project_health_snapshots",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    periodAt: timestamp("period_at", { withTimezone: true }).notNull(),
    overallScore: numeric("overall_score", { precision: 5, scale: 2 }).notNull(),
    status: projectHealthSnapshotsStatusEnum("status").notNull(),
    confidence: projectHealthSnapshotsConfidenceEnum("confidence").notNull(),
    drivers: text("drivers").notNull(),
    exceptions: text("exceptions").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("project_health_period_unique").on(table.projectId, table.periodAt), index("project_health_tenant_project_idx").on(table.tenantId, table.projectId)],
);

export const dataImportsSourceFormatEnum = pgEnum("data_imports_source_format", ["xlsx", "csv", "xer", "xls"]);
export const dataImportsStatusEnum = pgEnum("data_imports_status", ["uploaded", "analyzing", "validated", "confirmed", "importing", "completed", "failed", "cancelled"]);
export const dataImportsDuplicateModeEnum = pgEnum("data_imports_duplicate_mode", ["create_only", "update_existing", "upsert", "skip_duplicates", "fail_on_duplicate"]);
export const dataImports = pgTable(
  "data_imports",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).references(() => projects.id),
    moduleCode: varchar("module_code", { length: 64 }).notNull(),
    templateCode: varchar("template_code", { length: 64 }).notNull(),
    sourceFormat: dataImportsSourceFormatEnum("source_format").notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    fileKey: varchar("file_key", { length: 512 }).notNull(),
    fileHash: varchar("file_hash", { length: 64 }).notNull(),
    status: dataImportsStatusEnum("status").default("uploaded").notNull(),
    duplicateMode: dataImportsDuplicateModeEnum("duplicate_mode").default("fail_on_duplicate").notNull(),
    totalRows: integer("total_rows").default(0).notNull(), validRows: integer("valid_rows").default(0).notNull(), invalidRows: integer("invalid_rows").default(0).notNull(), createdRows: integer("created_rows").default(0).notNull(), updatedRows: integer("updated_rows").default(0).notNull(), skippedRows: integer("skipped_rows").default(0).notNull(),
    mappingJson: text("mapping_json"), summaryJson: text("summary_json"),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    // Background job state (work order 6, direct upload): a file larger than a request can carry is analysed and imported by a job whose progress the
    // user sees. `analyzing`/`importing` are the in-flight statuses; `failed` carries `failureReason` (a code the UI translates). `heartbeatAt` and
    // `attempts` let a stalled job (function killed at its time limit) be resumed, a bounded number of times, by the next poll or the daily sweep.
    progressPercent: integer("progress_percent").default(0).notNull(), progressStage: varchar("progress_stage", { length: 32 }), failureReason: varchar("failure_reason", { length: 128 }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }), attempts: integer("attempts").default(0).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }), completedAt: timestamp("completed_at", { withTimezone: true }), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(), updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  // Only a CONFIRMED import (confirmed / importing / completed) holds its file's hash. A rejected or unconfirmed analysis wrote nothing and releases it: the same file may be uploaded again.
  table => [index("data_imports_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status), uniqueIndex("data_imports_tenant_file_hash_unique").on(table.tenantId, table.fileHash).where(sql`${table.status} IN ('confirmed', 'importing', 'completed')`)],
);

export const dataImportErrorsSeverityEnum = pgEnum("data_import_errors_severity", ["error", "warning"]);
export const dataImportErrors = pgTable(
  "data_import_errors",
  { id: varchar("id", { length: 36 }).primaryKey(), importId: varchar("import_id", { length: 36 }).notNull().references(() => dataImports.id), rowNumber: integer("row_number").notNull(), columnName: varchar("column_name", { length: 128 }), value: text("value"), code: varchar("code", { length: 96 }).notNull(), severity: dataImportErrorsSeverityEnum("severity").notNull(), suggestedFix: text("suggested_fix"), createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull() },
  table => [index("data_import_errors_import_row_idx").on(table.importId, table.rowNumber)],
);

export const dataImportRowResultsActionEnum = pgEnum("data_import_row_results_action", ["created", "updated", "skipped"]);
export const dataImportRowResults = pgTable(
  "data_import_row_results",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    importId: varchar("import_id", { length: 36 }).notNull().references(() => dataImports.id),
    rowNumber: integer("row_number").notNull(),
    rowKey: varchar("row_key", { length: 160 }).notNull(),
    action: dataImportRowResultsActionEnum("action").notNull(),
    entityId: varchar("entity_id", { length: 36 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    index("data_import_row_results_import_row_idx").on(table.importId, table.rowNumber),
    uniqueIndex("data_import_row_results_import_row_action_unique").on(table.importId, table.rowNumber, table.action),
  ],
);

export const boqItemsStatusEnum = pgEnum("boq_items_status", ["active", "cancelled"]);
export const boqItems = pgTable(
  "boq_items",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    projectId: varchar("project_id", { length: 36 }).notNull(),
    wbsItemId: varchar("wbs_item_id", { length: 36 }),
    code: varchar("code", { length: 80 }).notNull(),
    description: text("description").notNull(),
    unitOfMeasure: varchar("unit_of_measure", { length: 40 }).notNull(),
    quantity: numeric("quantity", { precision: 18, scale: 3 }).notNull(),
    unitRate: numeric("unit_rate", { precision: 18, scale: 2 }).notNull(),
    totalAmount: numeric("total_amount", { precision: 18, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("SAR").notNull(),
    status: boqItemsStatusEnum("status").default("active").notNull(),
    createdByUserId: integer("created_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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

export const subcontractContractsStatusEnum = pgEnum("subcontract_contracts_status", ["draft", "active", "suspended", "closed", "cancelled"]);
export const subcontractContracts = pgTable(
  "subcontract_contracts",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    projectId: varchar("project_id", { length: 36 }).notNull(),
    code: varchar("code", { length: 80 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    subcontractorName: varchar("subcontractor_name", { length: 255 }).notNull(),
    // The supplier-register entry the subcontract is with (G-103); the name above is copied from it when one is chosen.
    supplierId: varchar("supplier_id", { length: 36 }),
    contractValue: numeric("contract_value", { precision: 18, scale: 2 }).notNull(),
    retentionPercent: numeric("retention_percent", { precision: 5, scale: 2 }).default("0").notNull(),
    advancePaymentPercent: numeric("advance_percent", { precision: 5, scale: 2 }).default("0").notNull(),
    status: subcontractContractsStatusEnum("status").default("draft").notNull(),
    createdByUserId: integer("created_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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

export const subcontractCertificatesStatusEnum = pgEnum("subcontract_certificates_status", ["draft", "submitted", "approved", "paid", "cancelled"]);
export const subcontractCertificates = pgTable(
  "subcontract_certificates",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    projectId: varchar("project_id", { length: 36 }).notNull(),
    subcontractId: varchar("subcontract_id", { length: 36 }).notNull(),
    certificateNumber: varchar("certificate_number", { length: 80 }).notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    grossAmount: numeric("gross_amount", { precision: 18, scale: 2 }).notNull(),
    retentionAmount: numeric("retention_amount", { precision: 18, scale: 2 }).default("0").notNull(),
    advanceRecoveryAmount: numeric("advance_recovery_amount", { precision: 18, scale: 2 }).default("0").notNull(),
    netAmount: numeric("net_amount", { precision: 18, scale: 2 }).notNull(),
    status: subcontractCertificatesStatusEnum("status").default("draft").notNull(),
    approvedByUserId: integer("approved_by_user_id"),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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

export const subcontractCertificateLines = pgTable(
  "subcontract_certificate_lines",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    certificateId: varchar("certificate_id", { length: 36 }).notNull(),
    boqItemId: varchar("boq_item_id", { length: 36 }).notNull(),
    previousQuantity: numeric("previous_quantity", { precision: 18, scale: 3 }).notNull(),
    currentQuantity: numeric("current_quantity", { precision: 18, scale: 3 }).notNull(),
    cumulativeQuantity: numeric("cumulative_quantity", { precision: 18, scale: 3 }).notNull(),
    unitRate: numeric("unit_rate", { precision: 18, scale: 2 }).notNull(),
    currentAmount: numeric("current_amount", { precision: 18, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("subcert_line_unique").on(table.certificateId, table.boqItemId),
    foreignKey({ columns: [table.certificateId], foreignColumns: [subcontractCertificates.id], name: "subline_cert_fk" }),
    foreignKey({ columns: [table.boqItemId], foreignColumns: [boqItems.id], name: "subline_boq_fk" }),
  ]
);

export const projectCommercialInvoicesStatusEnum = pgEnum("project_commercial_invoices_status", ["draft", "issued", "paid", "void"]);
export const projectCommercialInvoices = pgTable(
  "project_commercial_invoices",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull(),
    projectId: varchar("project_id", { length: 36 }).notNull(),
    invoiceNumber: varchar("invoice_number", { length: 80 }).notNull(),
    invoiceDate: timestamp("invoice_date", { withTimezone: true }).notNull(),
    clientName: varchar("client_name", { length: 255 }).notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    vatAmount: numeric("vat_amount", { precision: 18, scale: 2 }).notNull(),
    totalAmount: numeric("total_amount", { precision: 18, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("SAR").notNull(),
    status: projectCommercialInvoicesStatusEnum("status").default("draft").notNull(),
    // When the money arrived: what places a receipt in a month of the cash flow.
    paidAt: timestamp("paid_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
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


export const pmcZones = pgTable(
  "pmc_zones",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("pmc_zones_project_code_unique").on(table.projectId, table.code), index("pmc_zones_tenant_project_idx").on(table.tenantId, table.projectId)],
);

export const pmcBlocks = pgTable(
  "pmc_blocks",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    zoneId: varchar("zone_id", { length: 36 }).notNull().references(() => pmcZones.id),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("pmc_blocks_project_code_unique").on(table.projectId, table.code), index("pmc_blocks_tenant_project_zone_idx").on(table.tenantId, table.projectId, table.zoneId)],
);

export const pmcUnits = pgTable(
  "pmc_units",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    blockId: varchar("block_id", { length: 36 }).notNull().references(() => pmcBlocks.id),
    unitNumber: integer("unit_number").notNull(),
    modelCode: varchar("model_code", { length: 80 }).notNull(),
    saleStatus: varchar("sale_status", { length: 80 }),
    // The unit's code in the company's ERP (e.g. an Oracle code «zone-block-plot»): the foreign key that ties this unit to the other system. Unique inside a project when present.
    externalCode: varchar("external_code", { length: 120 }),
    // Work order 22: the villa number as the site and the consultant write it («268»): the key that ties a unit across the three sources. Unique inside a project when present.
    villaLabel: varchar("villa_label", { length: 40 }),
    // Work order 22: net sellable area (m²) and unit price (SAR/m²). Financial: read and written only with project.budget.manage.
    netSellableArea: numeric("net_sellable_area", { precision: 12, scale: 2 }),
    unitPrice: numeric("unit_price", { precision: 14, scale: 2 }),
    geometryJson: text("geometry_json"),
    unitWeight: numeric("unit_weight", { precision: 12, scale: 4 }).default("1").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("pmc_units_project_number_unique").on(table.projectId, table.unitNumber), uniqueIndex("pmc_units_project_external_code_unique").on(table.projectId, table.externalCode).where(sql`${table.externalCode} IS NOT NULL`), uniqueIndex("pmc_units_project_villa_label_unique").on(table.projectId, table.villaLabel).where(sql`${table.villaLabel} IS NOT NULL`), index("pmc_units_tenant_project_block_idx").on(table.tenantId, table.projectId, table.blockId)],
);

export const pmcActivityGroups = pgTable(
  "pmc_activity_groups",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("pmc_groups_project_code_unique").on(table.projectId, table.code), index("pmc_groups_tenant_project_idx").on(table.tenantId, table.projectId)],
);

export const pmcActivityStages = pgTable(
  "pmc_activity_stages",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    groupId: varchar("group_id", { length: 36 }).notNull().references(() => pmcActivityGroups.id),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("pmc_stages_project_code_unique").on(table.projectId, table.code), index("pmc_stages_tenant_project_group_idx").on(table.tenantId, table.projectId, table.groupId)],
);

export const pmcActivityDefinitions = pgTable(
  "pmc_activity_definitions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    groupId: varchar("group_id", { length: 36 }).notNull().references(() => pmcActivityGroups.id),
    stageId: varchar("stage_id", { length: 36 }).notNull().references(() => pmcActivityStages.id),
    wbsItemId: varchar("wbs_item_id", { length: 36 }).references(() => wbsItems.id),
    modelCode: varchar("model_code", { length: 80 }).notNull(),
    code: varchar("code", { length: 80 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    weightPercent: numeric("weight_percent", { precision: 7, scale: 4 }).notNull(),
    // Work order 22: the inspection request (WIR) number the monthly report writes above the activity; the key shared with the consultant's export.
    wirCode: varchar("wir_code", { length: 40 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("pmc_activity_defs_model_code_unique").on(table.projectId, table.modelCode, table.code), index("pmc_activity_defs_tenant_project_model_idx").on(table.tenantId, table.projectId, table.modelCode)],
);

export const pmcUnitActivityProgressStatusEnum = pgEnum("pmc_unit_activity_progress_status", ["NOT_STARTED", "IN_PROGRESS", "UNDER_REVIEW", "COMPLETE"]);
export const pmcUnitActivityProgress = pgTable(
  "pmc_unit_activity_progress",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    unitId: varchar("unit_id", { length: 36 }).notNull().references(() => pmcUnits.id),
    activityDefinitionId: varchar("activity_definition_id", { length: 36 }).notNull(),
    status: pmcUnitActivityProgressStatusEnum("status").default("NOT_STARTED").notNull(),
    // Where the cell stands in the verifier / disbursement list the project configured.
    verificationStatusId: varchar("verification_status_id", { length: 36 }),
    assignedUserId: integer("assigned_user_id").references(() => users.id),
    lastChangedByUserId: integer("last_changed_by_user_id").references(() => users.id),
    lastChangedAt: timestamp("last_changed_at", { withTimezone: true }).defaultNow().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("pmc_unit_activity_unique").on(table.unitId, table.activityDefinitionId), index("pmc_unit_progress_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status), foreignKey({ columns: [table.activityDefinitionId], foreignColumns: [pmcActivityDefinitions.id], name: "pmc_progress_activity_fk" }), foreignKey({ columns: [table.verificationStatusId], foreignColumns: [pmcVerificationStatuses.id], name: "pmc_progress_verification_fk" })],
);

export const pmcUnitActivityHistoryFromStatusEnum = pgEnum("pmc_unit_activity_history_from_status", ["NOT_STARTED", "IN_PROGRESS", "UNDER_REVIEW", "COMPLETE"]);
export const pmcUnitActivityHistoryToStatusEnum = pgEnum("pmc_unit_activity_history_to_status", ["NOT_STARTED", "IN_PROGRESS", "UNDER_REVIEW", "COMPLETE"]);
export const pmcUnitActivityHistory = pgTable(
  "pmc_unit_activity_history",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    unitActivityProgressId: varchar("unit_activity_progress_id", { length: 36 }).notNull(),
    fromStatus: pmcUnitActivityHistoryFromStatusEnum("from_status"),
    toStatus: pmcUnitActivityHistoryToStatusEnum("to_status").notNull(),
    changedByUserId: integer("changed_by_user_id").notNull().references(() => users.id),
    changedAt: timestamp("changed_at", { withTimezone: true }).defaultNow().notNull(),
    note: varchar("note", { length: 1000 }),
  },
  table => [index("pmc_history_tenant_project_changed_idx").on(table.tenantId, table.projectId, table.changedAt), foreignKey({ columns: [table.unitActivityProgressId], foreignColumns: [pmcUnitActivityProgress.id], name: "pmc_hist_progress_fk" })],
);

export const pmcVerificationStatuses = pgTable(
  "pmc_verification_statuses",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    code: varchar("code", { length: 80 }).notNull(),
    label: varchar("label", { length: 160 }).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    active: boolean("active").default(true).notNull(),
    // A status that means "waiting on the verifier"; screen 9 lists cells in these and how long they have waited.
    pending: boolean("pending").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("pmc_verification_status_project_code_unique").on(table.projectId, table.code), index("pmc_verification_status_tenant_project_idx").on(table.tenantId, table.projectId, table.active)],
);

export const pmcInspectionRequestsResponseCodeEnum = pgEnum("pmc_inspection_requests_response_code", ["A", "B", "C", "UR"]);
export const pmcInspectionRequests = pgTable(
  "pmc_inspection_requests",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    requestCode: varchar("request_code", { length: 80 }).notNull(),
    activityDefinitionId: varchar("activity_definition_id", { length: 36 }).notNull(),
    // Superseded by pmc_inspection_request_units; kept so rows written before 0055 stay readable.
    unitIdsJson: text("unit_ids_json"),
    contractorLabel: varchar("contractor_label", { length: 255 }),
    consultantLabel: varchar("consultant_label", { length: 255 }),
    responseCode: pmcInspectionRequestsResponseCodeEnum("response_code"),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("pmc_inspections_project_code_unique").on(table.projectId, table.requestCode), index("pmc_inspections_tenant_project_activity_idx").on(table.tenantId, table.projectId, table.activityDefinitionId), foreignKey({ columns: [table.activityDefinitionId], foreignColumns: [pmcActivityDefinitions.id], name: "pmc_insp_activity_fk" })],
);

export const pmcInspectionStepsStatusEnum = pgEnum("pmc_inspection_steps_status", ["pending", "in_progress", "complete", "rejected"]);
export const pmcInspectionSteps = pgTable(
  "pmc_inspection_steps",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    inspectionRequestId: varchar("inspection_request_id", { length: 36 }).notNull(),
    stepCode: varchar("step_code", { length: 80 }).notNull(),
    stepOrder: integer("step_order").default(0).notNull(),
    holderLabel: varchar("holder_label", { length: 255 }),
    status: pmcInspectionStepsStatusEnum("status").default("pending").notNull(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("pmc_inspection_step_unique").on(table.inspectionRequestId, table.stepCode), index("pmc_inspection_steps_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status), foreignKey({ columns: [table.inspectionRequestId], foreignColumns: [pmcInspectionRequests.id], name: "pmc_step_request_fk" })],
);

export const pmcBaselines = pgTable(
  "pmc_baselines",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    activityDefinitionId: varchar("activity_definition_id", { length: 36 }).notNull(),
    periodAt: timestamp("period_at", { withTimezone: true }).notNull(),
    plannedPercent: numeric("planned_percent", { precision: 7, scale: 4 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("pmc_baseline_activity_period_unique").on(table.activityDefinitionId, table.periodAt), index("pmc_baselines_tenant_project_period_idx").on(table.tenantId, table.projectId, table.periodAt), foreignKey({ columns: [table.activityDefinitionId], foreignColumns: [pmcActivityDefinitions.id], name: "pmc_base_activity_fk" })],
);

export const pmcInspectionRequestUnits = pgTable(
  "pmc_inspection_request_units",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    inspectionRequestId: varchar("inspection_request_id", { length: 36 }).notNull(),
    unitId: varchar("unit_id", { length: 36 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
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
export const pmcStatusFactorsStatusEnum = pgEnum("pmc_status_factors_status", ["NOT_STARTED", "IN_PROGRESS", "UNDER_REVIEW", "COMPLETE"]);
export const pmcStatusFactors = pgTable(
  "pmc_status_factors",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    status: pmcStatusFactorsStatusEnum("status").notNull(),
    factor: numeric("factor", { precision: 5, scale: 4 }).notNull(),
    updatedByUserId: integer("updated_by_user_id").references(() => users.id),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("pmc_status_factor_unique").on(table.projectId, table.status), index("pmc_status_factors_tenant_project_idx").on(table.tenantId, table.projectId)],
);

// The site plan a user uploads (PNG or JPEG). The newest row is the plan in use; unit
// polygons are stored on pmc_units.geometryJson in coordinates normalised to this
// image (0..1, origin at the top left), so any resolution works.
export const pmcSitePlans = pgTable(
  "pmc_site_plans",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    fileKey: varchar("file_key", { length: 512 }).notNull(),
    fileName: varchar("file_name", { length: 255 }).notNull(),
    mimeType: varchar("mime_type", { length: 64 }).notNull(),
    widthPx: integer("width_px").notNull(),
    heightPx: integer("height_px").notNull(),
    fileHash: varchar("file_hash", { length: 64 }).notNull(),
    uploadedByUserId: integer("uploaded_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("pmc_site_plans_tenant_project_idx").on(table.tenantId, table.projectId, table.createdAt)],
);

// One-time e-mail sign-in codes. The table holds a hash of the normalized
// address and an HMAC of the code, never either value itself.
// One row per signed-in browser. The session cookie is a signed token that names a row here (`sid`), and a request is accepted only while the row is
// unexpired and unrevoked: that is what lets "log out" end a session in the server, not just in the browser that asked.
export const authSessions = pgTable(
  "auth_sessions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    userId: integer("user_id").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    /** The last request this session made (refreshed at most every five minutes). A session idle for 24 hours is over; null (a session from before the column) counts as created_at. */
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }),
    /** When this session passed the second step (an authenticator code or a recovery code). Null = not yet; a session for a user who must use two-step verification is refused everything but the verification itself until it is set. */
    mfaVerifiedAt: timestamp("mfa_verified_at", { withTimezone: true }),
  },
  table => [
    foreignKey({ columns: [table.userId], foreignColumns: [users.id], name: "auth_sessions_user_fk" }).onDelete("cascade"),
    index("auth_sessions_user_idx").on(table.userId, table.revokedAt),
  ],
);

// Two-step verification (TOTP, RFC 6238) for the platform owner and company administrators. One row per person. The secret is stored sealed (AES-256-GCM),
// never readable from a database copy alone; recovery codes are stored as hashes and each works once. `confirmed_at` null = enrolment started, not finished.
export const userMfa = pgTable("user_mfa", {
  userId: integer("user_id").primaryKey().references(() => users.id, { onDelete: "cascade" }),
  secretSealed: text("secret_sealed").notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  /** JSON array of sha256 hashes of the recovery codes not yet used. */
  recoveryHashes: text("recovery_hashes").default("[]").notNull(),
  /** The newest time-step already accepted: a code is good once (no replay inside its window). */
  lastUsedStep: integer("last_used_step"),
  failures: integer("failures").default(0).notNull(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  /** D-81: the person switched the second step on for himself (profile). An enrolment made while it was compulsory (before D-81) reads false: it asks for nothing. */
  requiredBySelf: boolean("required_by_self").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Wrong sign-in codes per address (a hash, never the address). Supabase Auth owns the code itself; this is the guess limit it does not give:
// five wrong codes lock the address for fifteen minutes, whatever IP they come from, and a new code request does not clear the count.
export const authCodeAttempts = pgTable("auth_code_attempts", {
  emailHash: varchar("email_hash", { length: 64 }).primaryKey(),
  failures: integer("failures").default(0).notNull(),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true }).defaultNow().notNull(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// Per-WBS EAC captured with each profitability snapshot: the history that lets
// the screen say which work items moved the profit since the last snapshot.
export const evmWbsSnapshots = pgTable(
  "evm_wbs_snapshots",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    snapshotId: varchar("snapshot_id", { length: 36 }).notNull().references(() => evmSnapshots.id),
    wbsItemId: varchar("wbs_item_id", { length: 36 }).references(() => wbsItems.id),
    bac: numeric("bac", { precision: 18, scale: 2 }).notNull(),
    ac: numeric("ac", { precision: 18, scale: 2 }).notNull(),
    eac: numeric("eac", { precision: 18, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("evm_wbs_snapshots_unique").on(table.snapshotId, table.wbsItemId),
    index("evm_wbs_snapshots_project_idx").on(table.tenantId, table.projectId),
  ],
);

// ---------------------------------------------------------------- Technical and architectural coordination (work order 5, item 7)
// Every row carries the tenant and the project; every query filters on both. Numbers are typed by the coordinator and unique within the project (as RFIs are).
export const designDrawingsDisciplineEnum = pgEnum("design_drawings_discipline", ["architectural", "interior", "landscape", "structural", "civil", "mechanical", "electrical", "plumbing", "fire_fighting", "other"]);
export const designDrawingsStatusEnum = pgEnum("design_drawings_status", ["registered", "under_review", "approved", "cancelled"]);
export const designDrawings = pgTable(
  "design_drawings",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    drawingNumber: varchar("drawing_number", { length: 120 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    discipline: designDrawingsDisciplineEnum("discipline").notNull(),
    status: designDrawingsStatusEnum("status").default("registered").notNull(),
    currentRevision: varchar("current_revision", { length: 20 }).notNull(),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("design_drawings_project_number_unique").on(table.projectId, table.drawingNumber), index("design_drawings_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status, table.discipline)],
);

export const designDrawingRevisions = pgTable(
  "design_drawing_revisions",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    drawingId: varchar("drawing_id", { length: 36 }).notNull().references(() => designDrawings.id),
    revision: varchar("revision", { length: 20 }).notNull(),
    description: varchar("description", { length: 500 }),
    isCurrent: boolean("is_current").default(true).notNull(),
    issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow().notNull(),
    issuedByUserId: integer("issued_by_user_id").notNull().references(() => users.id),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    approvedByUserId: integer("approved_by_user_id").references(() => users.id),
  },
  table => [uniqueIndex("design_revisions_drawing_revision_unique").on(table.drawingId, table.revision), index("design_revisions_tenant_project_idx").on(table.tenantId, table.projectId, table.drawingId)],
);

export const designTransmittalsDirectionEnum = pgEnum("design_transmittals_direction", ["outgoing", "incoming"]);
export const designTransmittalsStatusEnum = pgEnum("design_transmittals_status", ["draft", "sent", "acknowledged"]);
export const designTransmittals = pgTable(
  "design_transmittals",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    transmittalNumber: varchar("transmittal_number", { length: 120 }).notNull(),
    direction: designTransmittalsDirectionEnum("direction").default("outgoing").notNull(),
    counterparty: varchar("counterparty", { length: 255 }).notNull(),
    subject: varchar("subject", { length: 255 }).notNull(),
    status: designTransmittalsStatusEnum("status").default("draft").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("design_transmittals_project_number_unique").on(table.projectId, table.transmittalNumber), index("design_transmittals_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status)],
);

export const designTransmittalItems = pgTable(
  "design_transmittal_items",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    transmittalId: varchar("transmittal_id", { length: 36 }).notNull(),
    revisionId: varchar("revision_id", { length: 36 }).notNull(),
  },
  // named by hand: the generated name for this foreign key is longer than the 63 characters PostgreSQL allows
  table => [foreignKey({ columns: [table.transmittalId], foreignColumns: [designTransmittals.id], name: "design_trm_items_transmittal_fk" }), foreignKey({ columns: [table.revisionId], foreignColumns: [designDrawingRevisions.id], name: "design_trm_items_revision_fk" }), uniqueIndex("design_transmittal_items_unique").on(table.transmittalId, table.revisionId), index("design_transmittal_items_revision_idx").on(table.revisionId)],
);

export const designCommentsSeverityEnum = pgEnum("design_comments_severity", ["minor", "major", "critical"]);
export const designCommentsStatusEnum = pgEnum("design_comments_status", ["open", "responded", "closed"]);
export const designComments = pgTable(
  "design_comments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    drawingId: varchar("drawing_id", { length: 36 }).notNull().references(() => designDrawings.id),
    revisionId: varchar("revision_id", { length: 36 }).notNull().references(() => designDrawingRevisions.id),
    commentNumber: varchar("comment_number", { length: 120 }).notNull(),
    raisedBy: varchar("raised_by", { length: 255 }).notNull(),
    severity: designCommentsSeverityEnum("severity").default("minor").notNull(),
    commentText: text("comment_text").notNull(),
    status: designCommentsStatusEnum("status").default("open").notNull(),
    responseText: text("response_text"),
    respondedAt: timestamp("responded_at", { withTimezone: true }),
    respondedByUserId: integer("responded_by_user_id").references(() => users.id),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedByUserId: integer("closed_by_user_id").references(() => users.id),
    dueAt: timestamp("due_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("design_comments_project_number_unique").on(table.projectId, table.commentNumber), index("design_comments_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status, table.dueAt), index("design_comments_drawing_idx").on(table.drawingId, table.status)],
);

// ---------------------------------------------------------------- Tenders before award (work order 5, item 8)
// A package is invited, bid on, levelled and awarded; the award creates the contract and the commitment in the same transaction.
export const tenderPackagesStatusEnum = pgEnum("tender_packages_status", ["draft", "open", "closed", "awarded", "cancelled"]);
export const tenderPackages = pgTable(
  "tender_packages",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    packageCode: varchar("package_code", { length: 120 }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    scopeSummary: text("scope_summary"),
    estimateAmount: numeric("estimate_amount", { precision: 18, scale: 2 }),
    currency: varchar("currency", { length: 3 }).default("SAR").notNull(),
    status: tenderPackagesStatusEnum("status").default("draft").notNull(),
    closingAt: timestamp("closing_at", { withTimezone: true }),
    awardedBidId: varchar("awarded_bid_id", { length: 36 }),
    awardedContractId: varchar("awarded_contract_id", { length: 36 }),
    awardedCommitmentId: varchar("awarded_commitment_id", { length: 36 }),
    awardedAt: timestamp("awarded_at", { withTimezone: true }),
    awardedByUserId: integer("awarded_by_user_id").references(() => users.id),
    awardJustification: text("award_justification"),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("tender_packages_project_code_unique").on(table.projectId, table.packageCode), index("tender_packages_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status, table.createdAt)],
);

export const tenderInviteesStatusEnum = pgEnum("tender_invitees_status", ["invited", "declined", "submitted"]);
export const tenderInvitees = pgTable(
  "tender_invitees",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    packageId: varchar("package_id", { length: 36 }).notNull().references(() => tenderPackages.id),
    supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => suppliers.id),
    status: tenderInviteesStatusEnum("status").default("invited").notNull(),
    invitedAt: timestamp("invited_at", { withTimezone: true }).defaultNow().notNull(),
    invitedByUserId: integer("invited_by_user_id").notNull().references(() => users.id),
  },
  table => [uniqueIndex("tender_invitees_package_supplier_unique").on(table.packageId, table.supplierId), index("tender_invitees_tenant_project_idx").on(table.tenantId, table.projectId)],
);

export const tenderBidsStatusEnum = pgEnum("tender_bids_status", ["submitted", "withdrawn", "disqualified"]);
export const tenderBids = pgTable(
  "tender_bids",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    packageId: varchar("package_id", { length: 36 }).notNull().references(() => tenderPackages.id),
    supplierId: varchar("supplier_id", { length: 36 }).notNull().references(() => suppliers.id),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).default("SAR").notNull(),
    durationDays: integer("duration_days"),
    validityDays: integer("validity_days"),
    notes: text("notes"),
    status: tenderBidsStatusEnum("status").default("submitted").notNull(),
    statusReason: varchar("status_reason", { length: 500 }),
    enteredByUserId: integer("entered_by_user_id").notNull().references(() => users.id),
    enteredAt: timestamp("entered_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("tender_bids_package_supplier_unique").on(table.packageId, table.supplierId), index("tender_bids_package_status_idx").on(table.packageId, table.status), index("tender_bids_tenant_project_idx").on(table.tenantId, table.projectId)],
);

export const tenderBidAdjustmentsKindEnum = pgEnum("tender_bid_adjustments_kind", ["scope_gap", "exclusion", "correction", "discount"]);
export const tenderBidAdjustments = pgTable(
  "tender_bid_adjustments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    packageId: varchar("package_id", { length: 36 }).notNull().references(() => tenderPackages.id),
    bidId: varchar("bid_id", { length: 36 }).notNull().references(() => tenderBids.id),
    kind: tenderBidAdjustmentsKindEnum("kind").notNull(),
    description: varchar("description", { length: 500 }).notNull(),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("tender_adjustments_bid_idx").on(table.bidId), index("tender_adjustments_package_idx").on(table.packageId)],
);

// ------------------------------------------------------------------------------------------------------------------------------------
// Work order 12, items 4 to 7: the site's daily report, the consultant's submittals, quality, and what ties them to a unit and an activity.

export const siteDailyReportsStatusEnum = pgEnum("site_daily_reports_status", ["draft", "submitted", "approved", "rejected"]);
// One report per engineer per project per day. The project manager's approval is what moves the progress of the cells the report names.
export const siteDailyReports = pgTable(
  "site_daily_reports",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    reportDate: date("report_date", { mode: "string" }).notNull(),
    weather: varchar("weather", { length: 24 }),
    temperatureC: numeric("temperature_c", { precision: 5, scale: 1 }),
    summary: text("summary"),
    obstacles: text("obstacles"),
    // Work order 22 (the site's daily sheet it replaces): which contractor, its own and its subcontractors' labour, the inspection status of the day, today's progress,
    // the days the contractor says remain, and recommendations. Equipment and the labour by WBS code are lines (line_type equipment / labour, wbs_code).
    contractorId: varchar("contractor_id", { length: 36 }),
    mainLabourCount: integer("main_labour_count"),
    subLabourCount: integer("sub_labour_count"),
    inspectionStatus: varchar("inspection_status", { length: 24 }),
    dayProgressPercent: numeric("day_progress_percent", { precision: 7, scale: 4 }),
    remainingDays: integer("remaining_days"),
    recommendations: text("recommendations"),
    // «مُستورد» for a report brought in from the old sheet; empty for one written here
    sourceLabel: varchar("source_label", { length: 60 }),
    status: siteDailyReportsStatusEnum("status").default("draft").notNull(),
    preparedByUserId: integer("prepared_by_user_id").notNull().references(() => users.id),
    submittedAt: timestamp("submitted_at", { withTimezone: true }),
    reviewedByUserId: integer("reviewed_by_user_id").references(() => users.id),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: varchar("review_note", { length: 500 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  // one report per engineer per project per day — and, since work order 22, per contractor of that day (the old sheet held one row per contractor per day)
  table => [uniqueIndex("site_daily_reports_project_date_preparer_unique").on(table.projectId, table.reportDate, table.preparedByUserId, sql`coalesce(${table.contractorId}, '')`), index("site_daily_reports_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status)],
);

export const siteDailyReportLinesTypeEnum = pgEnum("site_daily_report_lines_line_type", ["labour", "equipment", "work"]);
export const siteDailyReportLines = pgTable(
  "site_daily_report_lines",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    reportId: varchar("report_id", { length: 36 }).notNull().references(() => siteDailyReports.id),
    lineType: siteDailyReportLinesTypeEnum("line_type").notNull(),
    pmcActivityDefinitionId: varchar("pmc_activity_definition_id", { length: 36 }),
    pmcUnitId: varchar("pmc_unit_id", { length: 36 }),
    // a trade or a piece of equipment; empty for a work line
    label: varchar("label", { length: 160 }),
    // Work order 22: labour counted by WBS code («DC-01 Earth Works»)
    wbsCode: varchar("wbs_code", { length: 40 }),
    // headcount for labour, number of machines for equipment
    quantity: numeric("quantity", { precision: 10, scale: 2 }),
    hours: numeric("hours", { precision: 6, scale: 2 }),
    description: text("description"),
    // work lines only: the status the cell is reported to have reached; applied when the report is approved
    reportedStatus: pmcUnitActivityProgressStatusEnum("reported_status"),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("site_daily_report_lines_report_idx").on(table.reportId), index("site_daily_report_lines_cell_idx").on(table.pmcUnitId, table.pmcActivityDefinitionId)],
);

export const siteDailyReportPhotos = pgTable(
  "site_daily_report_photos",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    reportId: varchar("report_id", { length: 36 }).notNull().references(() => siteDailyReports.id),
    storageKey: varchar("storage_key", { length: 512 }).notNull(),
    fileName: varchar("file_name", { length: 160 }).notNull(),
    contentType: varchar("content_type", { length: 80 }).notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    caption: varchar("caption", { length: 255 }),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("site_daily_report_photos_report_idx").on(table.reportId), uniqueIndex("site_daily_report_photos_key_unique").on(table.storageKey)],
);

export const consultantSubmittalsTypeEnum = pgEnum("consultant_submittals_type", ["shop_drawing", "material_approval", "method_statement", "sample"]);
export const consultantSubmittalsStatusEnum = pgEnum("consultant_submittals_status", ["draft", "sent", "replied", "closed"]);
// What the contractor sends the consultant for approval: execution drawings, a material, a method statement, a sample. A resubmission is a new row with the next revision.
export const consultantSubmittals = pgTable(
  "consultant_submittals",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    submittalType: consultantSubmittalsTypeEnum("submittal_type").notNull(),
    submittalNumber: varchar("submittal_number", { length: 120 }).notNull(),
    revision: integer("revision").default(0).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    status: consultantSubmittalsStatusEnum("status").default("draft").notNull(),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    repliedAt: timestamp("replied_at", { withTimezone: true }),
    // one of the company's own reply codes (submittal_reply_codes)
    replyCode: varchar("reply_code", { length: 8 }),
    replyNote: text("reply_note"),
    pmcActivityDefinitionId: varchar("pmc_activity_definition_id", { length: 36 }),
    pmcUnitId: varchar("pmc_unit_id", { length: 36 }),
    // a material approval names the material it approves
    materialId: varchar("material_id", { length: 36 }),
    // who it was sent to (the consultant's name or office): the register shows the answers per consultant
    consultant: varchar("consultant", { length: 160 }),
    // work order 14: the design-coordination submittals live in this table too (design_submittals was merged into it). A design discipline, the drawing it
    // covers, and — when a C/D answer is followed by a fresh submittal under a new number — the one it replaces.
    discipline: varchar("discipline", { length: 24 }),
    drawingId: varchar("drawing_id", { length: 36 }).references(() => designDrawings.id),
    resubmissionOfId: varchar("resubmission_of_id", { length: 36 }),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    sentByUserId: integer("sent_by_user_id").references(() => users.id),
    repliedByUserId: integer("replied_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("consultant_submittals_number_revision_unique").on(table.projectId, table.submittalNumber, table.revision), index("consultant_submittals_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status), index("consultant_submittals_material_idx").on(table.projectId, table.materialId)],
);

// The reply codes a company uses (A/B/C/D by default) and whether each one counts as an approval.
export const submittalReplyCodes = pgTable(
  "submittal_reply_codes",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    code: varchar("code", { length: 8 }).notNull(),
    labelAr: varchar("label_ar", { length: 120 }).notNull(),
    labelEn: varchar("label_en", { length: 120 }).notNull(),
    approved: boolean("approved").default(false).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("submittal_reply_codes_tenant_code_unique").on(table.tenantId, table.code)],
);

export const tenantPoliciesModeEnum = pgEnum("tenant_policies_mode", ["off", "warn", "block"]);
// The company's choices for the rules that tie quality, submittals and the warehouse to progress (work order 12, item 7). Absent row = the defaults below.
export const tenantPolicies = pgTable(
  "tenant_policies",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    // an activity cannot be COMPLETE before the consultant accepted an inspection of that unit and activity
    qcCompletionMode: tenantPoliciesModeEnum("qc_completion_mode").default("warn").notNull(),
    // which inspection response codes count as an acceptance (comma separated)
    qcAcceptedCodes: varchar("qc_accepted_codes", { length: 40 }).default("A,B").notNull(),
    // issuing a material whose approval submittal has not been approved
    materialApprovalMode: tenantPoliciesModeEnum("material_approval_mode").default("warn").notNull(),
    // work order 14: an open NCR on a unit and activity keeps an inspection from counting as accepted (block, the default), only warns, or is ignored
    ncrAcceptanceMode: tenantPoliciesModeEnum("ncr_acceptance_mode").default("block").notNull(),
    updatedByUserId: integer("updated_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("tenant_policies_tenant_unique").on(table.tenantId)],
);

// ------------------------------------------------------------------------------------------------------------------------------------
// Work order 12, items 8 and 9: the company's integration layer. API keys with named powers, outbound signed webhooks, the mapping between the
// company's other systems' identifiers and ours, and the log of every exchange (what arrived, what was refused, why).

export const apiKeys = pgTable(
  "api_keys",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    name: varchar("name", { length: 120 }).notNull(),
    // the first characters of the key, shown in lists and used to find it; the key itself is shown once and only its SHA-256 is kept
    keyPrefix: varchar("key_prefix", { length: 16 }).notNull(),
    keyHash: varchar("key_hash", { length: 64 }).notNull(),
    // comma separated powers: erp.write erp.read export.read external.write mappings.write sync.read
    scopes: varchar("scopes", { length: 400 }).notNull(),
    rateLimitPerMinute: integer("rate_limit_per_minute").default(120).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("api_keys_prefix_unique").on(table.keyPrefix), index("api_keys_tenant_idx").on(table.tenantId)],
);

// How many calls a key has made in each minute: the limit is counted in the database, so two server instances share one count.
export const apiRateWindows = pgTable(
  "api_rate_windows",
  {
    keyId: varchar("key_id", { length: 36 }).notNull().references(() => apiKeys.id),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
    calls: integer("calls").default(0).notNull(),
  },
  table => [primaryKey({ columns: [table.keyId, table.windowStart] })],
);

export const webhookEndpoints = pgTable(
  "webhook_endpoints",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    url: varchar("url", { length: 500 }).notNull(),
    // sealed with the server's integration key (AES-256-GCM); the signing secret is shown once when the endpoint is made
    secretSealed: text("secret_sealed").notNull(),
    // comma separated event types, or * for all
    events: varchar("events", { length: 400 }).default("*").notNull(),
    active: boolean("active").default(true).notNull(),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("webhook_endpoints_tenant_idx").on(table.tenantId, table.active)],
);

export const webhookDeliveriesStatusEnum = pgEnum("webhook_deliveries_status", ["pending", "delivered", "failed"]);
export const webhookDeliveries = pgTable(
  "webhook_deliveries",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    endpointId: varchar("endpoint_id", { length: 36 }).notNull().references(() => webhookEndpoints.id),
    eventType: varchar("event_type", { length: 80 }).notNull(),
    payload: text("payload").notNull(),
    status: webhookDeliveriesStatusEnum("status").default("pending").notNull(),
    attempts: integer("attempts").default(0).notNull(),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).defaultNow().notNull(),
    lastStatusCode: integer("last_status_code"),
    lastError: varchar("last_error", { length: 300 }),
    deliveredAt: timestamp("delivered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("webhook_deliveries_due_idx").on(table.status, table.nextAttemptAt), index("webhook_deliveries_tenant_idx").on(table.tenantId, table.createdAt)],
);

export const integrationSystems = ["generic", "odoo", "sap_b1", "dynamics365", "netsuite", "quality", "submittals"] as const;
// An identifier in another system and what it means here. entity_type: supplier, project, material, cost_code (our WBS item), cost_center (our project), purchase_order, actual_cost, submittal, inspection.
export const integrationMappings = pgTable(
  "integration_mappings",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    system: varchar("system", { length: 24 }).notNull(),
    entityType: varchar("entity_type", { length: 24 }).notNull(),
    externalId: varchar("external_id", { length: 120 }).notNull(),
    internalId: varchar("internal_id", { length: 36 }),
    internalCode: varchar("internal_code", { length: 120 }),
    // what was last applied for this identifier, to say "unchanged" the second time
    payloadHash: varchar("payload_hash", { length: 64 }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("integration_mappings_unique").on(table.tenantId, table.system, table.entityType, table.externalId), index("integration_mappings_internal_idx").on(table.tenantId, table.entityType, table.internalId)],
);

export const integrationSyncRunsStatusEnum = pgEnum("integration_sync_runs_status", ["running", "ok", "partial", "failed"]);
export const integrationSyncRuns = pgTable(
  "integration_sync_runs",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    system: varchar("system", { length: 24 }).notNull(),
    // in = to the platform, out = from the platform
    direction: varchar("direction", { length: 4 }).notNull(),
    trigger: varchar("trigger", { length: 12 }).notNull(),
    entityType: varchar("entity_type", { length: 24 }),
    status: integrationSyncRunsStatusEnum("status").default("running").notNull(),
    received: integer("received").default(0).notNull(),
    accepted: integer("accepted").default(0).notNull(),
    rejected: integer("rejected").default(0).notNull(),
    apiKeyId: varchar("api_key_id", { length: 36 }),
    startedByUserId: integer("started_by_user_id"),
    startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
    errorSummary: varchar("error_summary", { length: 300 }),
  },
  table => [index("integration_sync_runs_tenant_idx").on(table.tenantId, table.startedAt)],
);

export const integrationSyncItems = pgTable(
  "integration_sync_items",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    runId: varchar("run_id", { length: 36 }).notNull().references(() => integrationSyncRuns.id),
    entityType: varchar("entity_type", { length: 24 }).notNull(),
    externalId: varchar("external_id", { length: 120 }),
    // created, updated, unchanged, stored (kept, not applied), rejected
    outcome: varchar("outcome", { length: 12 }).notNull(),
    reason: varchar("reason", { length: 80 }),
    detail: varchar("detail", { length: 300 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("integration_sync_items_run_idx").on(table.runId), index("integration_sync_items_tenant_outcome_idx").on(table.tenantId, table.outcome)],
);

// What an ERP sent that the platform has no table for yet (supplier invoices, payments, employee cost): kept as it arrived, flagged not applied, so nothing is lost and nothing is invented.
export const integrationInboundRecords = pgTable(
  "integration_inbound_records",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    system: varchar("system", { length: 24 }).notNull(),
    entityType: varchar("entity_type", { length: 24 }).notNull(),
    externalId: varchar("external_id", { length: 120 }).notNull(),
    payload: text("payload").notNull(),
    runId: varchar("run_id", { length: 36 }).references(() => integrationSyncRuns.id),
    receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("integration_inbound_records_unique").on(table.tenantId, table.system, table.entityType, table.externalId)],
);

// A connection from the platform to a company's other system (Odoo, SAP Business One, Dynamics 365, NetSuite). The password or key is sealed with the server's integration key and never read back.
export const integrationConnections = pgTable(
  "integration_connections",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    system: varchar("system", { length: 24 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    baseUrl: varchar("base_url", { length: 300 }).notNull(),
    database: varchar("database", { length: 120 }),
    username: varchar("username", { length: 160 }),
    secretSealed: text("secret_sealed"),
    // JSON: which project and which cost center map where, the batch size, the entities to pull
    settings: text("settings"),
    active: boolean("active").default(true).notNull(),
    // pulled by the daily job when set
    scheduledDaily: boolean("scheduled_daily").default(false).notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("integration_connections_tenant_system_name_unique").on(table.tenantId, table.system, table.name)],
);

// Work order 20, smart import. A profile remembers how one SOURCE's columns map (e.g. «جدول كميات مقاول X»), so the next file of the same shape is read without asking again.
export const importSourceProfiles = pgTable(
  "import_source_profiles",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    name: varchar("name", { length: 160 }).notNull(),
    kind: varchar("kind", { length: 32 }).notNull(),
    // the normalised header words of the file the profile was learned from: a later file whose headers overlap enough is the same source
    headerSignature: text("header_signature").notNull(),
    columnMapJson: text("column_map_json").notNull(),
    timesUsed: integer("times_used").default(0).notNull(),
    createdByUserId: integer("created_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("import_source_profiles_tenant_name_unique").on(table.tenantId, table.name)],
);

// The original file an import was read from: kept in Storage and linked to the import (and so to every row it wrote, through data_import_row_results).
export const dataImportSources = pgTable(
  "data_import_sources",
  {
    importId: varchar("import_id", { length: 36 }).primaryKey().references(() => dataImports.id),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).references(() => projects.id),
    sourceKey: varchar("source_key", { length: 512 }).notNull(),
    sourceName: varchar("source_name", { length: 255 }).notNull(),
    detectedKind: varchar("detected_kind", { length: 32 }).notNull(),
    sheetName: varchar("sheet_name", { length: 160 }),
    mappingJson: text("mapping_json").notNull(),
    profileId: varchar("profile_id", { length: 36 }),
    mergedCellsFilled: integer("merged_cells_filled").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("data_import_sources_tenant_project_idx").on(table.tenantId, table.projectId)],
);

// What the optional AI reading (PDF, scans, free text) has cost this company this month. Off by default; when on, a company-wide monthly cap stops it.
export const smartReadingUsage = pgTable(
  "smart_reading_usage",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    month: varchar("month", { length: 7 }).notNull(),
    calls: integer("calls").default(0).notNull(),
    estimatedMicroUsd: integer("estimated_micro_usd").default(0).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("smart_reading_usage_tenant_month_unique").on(table.tenantId, table.month)],
);

// ---- Primavera P6 import (work order 20): what a schedule holds besides its activities.
export const scheduleCalendars = pgTable(
  "schedule_calendars",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    externalId: varchar("external_id", { length: 40 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    calendarType: varchar("calendar_type", { length: 40 }),
    isDefault: boolean("is_default").default(false).notNull(),
    hoursPerDay: numeric("hours_per_day", { precision: 6, scale: 2 }).default("8").notNull(),
    hoursPerWeek: numeric("hours_per_week", { precision: 6, scale: 2 }).default("40").notNull(),
    // the calendar's own definition as the source system wrote it (working days, exceptions): kept whole, not interpreted
    definition: text("definition"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("schedule_calendars_project_external_unique").on(table.projectId, table.externalId)],
);

export const activityRelationships = pgTable(
  "activity_relationships",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    predecessorActivityId: varchar("predecessor_activity_id", { length: 36 }).notNull().references(() => activities.id),
    successorActivityId: varchar("successor_activity_id", { length: 36 }).notNull().references(() => activities.id),
    relationType: varchar("relation_type", { length: 2 }).notNull(),
    lagHours: numeric("lag_hours", { precision: 10, scale: 2 }).default("0").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("activity_relationships_pair_unique").on(table.projectId, table.predecessorActivityId, table.successorActivityId, table.relationType),
    index("activity_relationships_successor_idx").on(table.projectId, table.successorActivityId),
    check("activity_relationships_type_check", sql`${table.relationType} IN ('FS', 'SS', 'FF', 'SF')`),
    check("activity_relationships_not_self_check", sql`${table.predecessorActivityId} <> ${table.successorActivityId}`),
  ],
);

export const activityCodeTypes = pgTable(
  "activity_code_types",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    externalId: varchar("external_id", { length: 40 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    scope: varchar("scope", { length: 40 }),
    sequence: integer("sequence").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("activity_code_types_project_external_unique").on(table.projectId, table.externalId)],
);

export const activityCodeValues = pgTable(
  "activity_code_values",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    codeTypeId: varchar("code_type_id", { length: 36 }).notNull().references(() => activityCodeTypes.id),
    parentId: varchar("parent_id", { length: 36 }),
    externalId: varchar("external_id", { length: 40 }).notNull(),
    shortName: varchar("short_name", { length: 80 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    sequence: integer("sequence").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("activity_code_values_project_external_unique").on(table.projectId, table.externalId), index("activity_code_values_type_idx").on(table.projectId, table.codeTypeId)],
);

export const activityCodeAssignments = pgTable(
  "activity_code_assignments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    activityId: varchar("activity_id", { length: 36 }).notNull().references(() => activities.id),
    codeTypeId: varchar("code_type_id", { length: 36 }).notNull(),
    codeValueId: varchar("code_value_id", { length: 36 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("activity_code_assignments_activity_type_unique").on(table.activityId, table.codeTypeId), index("activity_code_assignments_value_idx").on(table.projectId, table.codeValueId),
    foreignKey({ columns: [table.codeTypeId], foreignColumns: [activityCodeTypes.id], name: "act_code_assign_type_fk" }),
    foreignKey({ columns: [table.codeValueId], foreignColumns: [activityCodeValues.id], name: "act_code_assign_value_fk" }),
  ],
);

export const activityResourceAssignments = pgTable(
  "activity_resource_assignments",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    activityId: varchar("activity_id", { length: 36 }).notNull().references(() => activities.id),
    resourceId: varchar("resource_id", { length: 36 }).notNull(),
    externalId: varchar("external_id", { length: 40 }).notNull(),
    plannedUnits: numeric("planned_units", { precision: 14, scale: 2 }).default("0").notNull(),
    actualUnits: numeric("actual_units", { precision: 14, scale: 2 }).default("0").notNull(),
    remainingUnits: numeric("remaining_units", { precision: 14, scale: 2 }).default("0").notNull(),
    plannedCost: numeric("planned_cost", { precision: 18, scale: 2 }).default("0").notNull(),
    actualCost: numeric("actual_cost", { precision: 18, scale: 2 }).default("0").notNull(),
    remainingCost: numeric("remaining_cost", { precision: 18, scale: 2 }).default("0").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("activity_resource_assignments_project_external_unique").on(table.projectId, table.externalId), index("activity_resource_assignments_activity_idx").on(table.projectId, table.activityId),
    foreignKey({ columns: [table.resourceId], foreignColumns: [projectResources.id], name: "act_resource_assign_resource_fk" }),
  ],
);

// ------------------------------------------------------------------------------------------------------------------------------------
// Work order 22 (the 390-villa project): the site ↔ the consultant ↔ the monthly report. Three independent sources per cell (unit × activity):
//   - the MONTHLY REPORT is the catalogue (pmc_activity_definitions, 128 activities per model, each with its WIR number) and pmc_unit_activity_progress;
//   - the SITE records its own state on its own list of activities (pmc_site_activities, 114), per unit, with a dated history (pmc_site_cells / _events);
//   - the CONSULTANT's export says, per unit and per column (WIR), received or not (pmc_consultant_cells / _events), its columns linked to the catalogue.
// The site list and the catalogue are linked by pmc_site_activity_links (suggested by name, confirmed once by the owner; one site activity may cover several).

export const pmcSiteActivities = pgTable(
  "pmc_site_activities",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    code: varchar("code", { length: 80 }).notNull(),
    csiName: varchar("csi_name", { length: 255 }).notNull(),
    subName: varchar("sub_name", { length: 255 }),
    name: varchar("name", { length: 255 }).notNull(),
    // share of one villa (the list adds up to 1.0)
    weight: numeric("weight", { precision: 10, scale: 8 }).notNull(),
    // the villa types (models) the activity applies to; empty = every type
    modelCodesJson: text("model_codes_json"),
    sortOrder: integer("sort_order").default(0).notNull(),
    // D-44 (0022): what the activity is measured in (a villa, linear metres, square metres, pieces) and, for anything but a villa, the whole quantity to be done
    measureUnit: varchar("measure_unit", { length: 8 }).default("villa").notNull(),
    totalQuantity: numeric("total_quantity", { precision: 14, scale: 3 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("pmc_site_activities_project_code_unique").on(table.projectId, table.code), index("pmc_site_activities_tenant_project_idx").on(table.tenantId, table.projectId),
    check("pmc_site_activities_measure_check", sql`${table.measureUnit} IN ('villa', 'lm', 'm2', 'piece') AND (${table.totalQuantity} IS NULL OR ${table.totalQuantity} > 0) AND (${table.measureUnit} = 'villa' OR ${table.totalQuantity} IS NOT NULL)`),
  ],
);

export const pmcSiteActivityLinks = pgTable(
  "pmc_site_activity_links",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    siteActivityId: varchar("site_activity_id", { length: 36 }).notNull(),
    // the catalogue activity code (the same code on every model)
    activityCode: varchar("activity_code", { length: 80 }).notNull(),
    // how close the names are (0..1) when the platform suggested it
    score: numeric("score", { precision: 5, scale: 4 }),
    confirmed: boolean("confirmed").default(false).notNull(),
    confirmedByUserId: integer("confirmed_by_user_id").references(() => users.id),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("pmc_site_links_activity_code_unique").on(table.siteActivityId, table.activityCode),
    index("pmc_site_links_tenant_project_idx").on(table.tenantId, table.projectId),
    foreignKey({ columns: [table.siteActivityId], foreignColumns: [pmcSiteActivities.id], name: "pmc_site_links_activity_fk" }),
  ],
);

export const pmcSiteStatusEnum = pgEnum("pmc_site_status", ["NOT_STARTED", "IN_PROGRESS", "DONE", "INSPECTION_REQUESTED", "QC_APPROVED"]);
export const pmcSiteCells = pgTable(
  "pmc_site_cells",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    unitId: varchar("unit_id", { length: 36 }).notNull(),
    siteActivityId: varchar("site_activity_id", { length: 36 }).notNull(),
    status: pmcSiteStatusEnum("status").default("NOT_STARTED").notNull(),
    // the date of the current status, and the date each status was reached
    statusOn: date("status_on", { mode: "string" }),
    notStartedOn: date("not_started_on", { mode: "string" }),
    inProgressOn: date("in_progress_on", { mode: "string" }),
    doneOn: date("done_on", { mode: "string" }),
    inspectionRequestedOn: date("inspection_requested_on", { mode: "string" }),
    qcApprovedOn: date("qc_approved_on", { mode: "string" }),
    updatedByUserId: integer("updated_by_user_id").references(() => users.id),
    // «مُستورد» for a status brought in from the old sheet (never a personal e-mail)
    updatedByLabel: varchar("updated_by_label", { length: 120 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("pmc_site_cells_unit_activity_unique").on(table.unitId, table.siteActivityId),
    index("pmc_site_cells_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status),
    foreignKey({ columns: [table.unitId], foreignColumns: [pmcUnits.id], name: "pmc_site_cells_unit_fk" }),
    foreignKey({ columns: [table.siteActivityId], foreignColumns: [pmcSiteActivities.id], name: "pmc_site_cells_activity_fk" }),
  ],
);

export const pmcSiteCellEvents = pgTable(
  "pmc_site_cell_events",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    cellId: varchar("cell_id", { length: 36 }).notNull(),
    fromStatus: pmcSiteStatusEnum("from_status"),
    toStatus: pmcSiteStatusEnum("to_status").notNull(),
    statusOn: date("status_on", { mode: "string" }).notNull(),
    enteredByUserId: integer("entered_by_user_id").references(() => users.id),
    enteredByLabel: varchar("entered_by_label", { length: 120 }),
    // site (an engineer's update) · legacy (the old sheet, once) · comparison (an action on a difference)
    source: varchar("source", { length: 24 }).notNull(),
    // one update of several villas at once shares a batch
    batchId: varchar("batch_id", { length: 36 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("pmc_site_events_tenant_project_idx").on(table.tenantId, table.projectId, table.createdAt), index("pmc_site_events_cell_idx").on(table.cellId), foreignKey({ columns: [table.cellId], foreignColumns: [pmcSiteCells.id], name: "pmc_site_events_cell_fk" })],
);

export const pmcConsultantStatusEnum = pgEnum("pmc_consultant_status", ["NOT_RECEIVED", "RECEIVED", "APPROVED", "REJECTED", "CODE_A", "CODE_B", "CODE_C", "CODE_D"]);
// One column of the consultant's export: its WIR, its place in the CSI tree, and the catalogue activity it is linked to (by the WIR, or by the owner once).
export const pmcConsultantColumns = pgTable(
  "pmc_consultant_columns",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    sourceKey: varchar("source_key", { length: 255 }).notNull(),
    wirCode: varchar("wir_code", { length: 40 }),
    sectionName: varchar("section_name", { length: 255 }),
    subgroupName: varchar("subgroup_name", { length: 255 }),
    activityName: varchar("activity_name", { length: 255 }).notNull(),
    locationName: varchar("location_name", { length: 120 }),
    weight: numeric("weight", { precision: 10, scale: 8 }),
    // the percentage the consultant's own export shows beside the WIR (compared, never written into a cell)
    reportedPercent: numeric("reported_percent", { precision: 9, scale: 6 }),
    activityCode: varchar("activity_code", { length: 80 }),
    // wir (the same number in both sources) · owner (matched by hand, once)
    linkMethod: varchar("link_method", { length: 16 }),
    linkedByUserId: integer("linked_by_user_id").references(() => users.id),
    linkedAt: timestamp("linked_at", { withTimezone: true }),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("pmc_consultant_columns_project_key_unique").on(table.projectId, table.sourceKey), index("pmc_consultant_columns_tenant_project_idx").on(table.tenantId, table.projectId)],
);

export const pmcConsultantCells = pgTable(
  "pmc_consultant_cells",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    unitId: varchar("unit_id", { length: 36 }).notNull(),
    columnId: varchar("column_id", { length: 36 }).notNull(),
    status: pmcConsultantStatusEnum("status").default("NOT_RECEIVED").notNull(),
    // the date of the export that first showed it received (the age of a difference counts from here)
    firstReceivedOn: date("first_received_on", { mode: "string" }),
    statusOn: date("status_on", { mode: "string" }),
    lastImportId: varchar("last_import_id", { length: 36 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("pmc_consultant_cells_unit_column_unique").on(table.unitId, table.columnId),
    index("pmc_consultant_cells_tenant_project_status_idx").on(table.tenantId, table.projectId, table.status),
    foreignKey({ columns: [table.unitId], foreignColumns: [pmcUnits.id], name: "pmc_consultant_cells_unit_fk" }),
    foreignKey({ columns: [table.columnId], foreignColumns: [pmcConsultantColumns.id], name: "pmc_consultant_cells_column_fk" }),
  ],
);

export const pmcConsultantCellEvents = pgTable(
  "pmc_consultant_cell_events",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    cellId: varchar("cell_id", { length: 36 }).notNull(),
    fromStatus: pmcConsultantStatusEnum("from_status"),
    toStatus: pmcConsultantStatusEnum("to_status").notNull(),
    observedOn: date("observed_on", { mode: "string" }).notNull(),
    importId: varchar("import_id", { length: 36 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [index("pmc_consultant_events_tenant_project_idx").on(table.tenantId, table.projectId, table.createdAt), index("pmc_consultant_events_cell_idx").on(table.cellId), foreignKey({ columns: [table.cellId], foreignColumns: [pmcConsultantCells.id], name: "pmc_consultant_events_cell_fk" })],
);

// The site's note on a difference (unit × catalogue activity), written by a person on the comparison screen.
export const pmcCellNotes = pgTable(
  "pmc_cell_notes",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    unitId: varchar("unit_id", { length: 36 }).notNull(),
    activityCode: varchar("activity_code", { length: 80 }).notNull(),
    note: varchar("note", { length: 2000 }).notNull(),
    updatedByUserId: integer("updated_by_user_id").notNull().references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("pmc_cell_notes_unit_activity_unique").on(table.unitId, table.activityCode), index("pmc_cell_notes_tenant_project_idx").on(table.tenantId, table.projectId), foreignKey({ columns: [table.unitId], foreignColumns: [pmcUnits.id], name: "pmc_cell_notes_unit_fk" })],
);

export const pmcContractors = pgTable(
  "pmc_contractors",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    name: varchar("name", { length: 255 }).notNull(),
    number: varchar("number", { length: 80 }),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("pmc_contractors_project_name_unique").on(table.projectId, table.name), index("pmc_contractors_tenant_project_idx").on(table.tenantId, table.projectId)],
);

// The planned monthly curve from the schedule (the «PLanned P6» sheet): the S-curve's planned line. The actual line is computed from the site's dated statuses.
export const pmcPlanMonths = pgTable(
  "pmc_plan_months",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    month: date("month", { mode: "string" }).notNull(),
    plannedCost: numeric("planned_cost", { precision: 18, scale: 2 }),
    plannedPercent: numeric("planned_percent", { precision: 10, scale: 8 }).notNull(),
    cumulativePercent: numeric("cumulative_percent", { precision: 10, scale: 8 }).notNull(),
    importId: varchar("import_id", { length: 36 }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex("pmc_plan_months_project_month_unique").on(table.projectId, table.month), index("pmc_plan_months_tenant_project_idx").on(table.tenantId, table.projectId)],
);


// Work order 23, P-17 (D-42 a): what a project carries beyond its code and name — where it is, the contract, the three parties with their logos, the working week and hours, and
// the prefix its reports are numbered with. One row per project. A logo is a storage key under uploads/{tenant}/{project}/logo/ (never a URL); it is shown by a signed link.
export const projectProfiles = pgTable(
  "project_profiles",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    location: varchar("location", { length: 255 }),
    contractNumber: varchar("contract_number", { length: 80 }),
    clientName: varchar("client_name", { length: 255 }),
    consultantName: varchar("consultant_name", { length: 255 }),
    contractorName: varchar("contractor_name", { length: 255 }),
    clientLogoKey: varchar("client_logo_key", { length: 512 }),
    consultantLogoKey: varchar("consultant_logo_key", { length: 512 }),
    contractorLogoKey: varchar("contractor_logo_key", { length: 512 }),
    // the working days as ascending distinct digits, 0 = Sunday … 6 = Saturday («01234» = Sunday to Thursday)
    workDays: varchar("work_days", { length: 7 }).default("01234").notNull(),
    workStart: time("work_start"),
    workEnd: time("work_end"),
    reportPrefix: varchar("report_prefix", { length: 16 }),
    updatedByUserId: integer("updated_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("project_profiles_tenant_project_unique").on(table.tenantId, table.projectId),
    check("project_profiles_work_days_check", sql`${table.workDays} ~ '^0?1?2?3?4?5?6?$' AND ${table.workDays} <> ''`),
    check("project_profiles_work_hours_check", sql`(${table.workStart} IS NULL) = (${table.workEnd} IS NULL) AND (${table.workStart} IS NULL OR ${table.workStart} < ${table.workEnd})`),
    check("project_profiles_report_prefix_check", sql`${table.reportPrefix} IS NULL OR ${table.reportPrefix} ~ '^[A-Z0-9][A-Z0-9-]{0,15}$'`),
  ],
);

// The companies taking part in a project: one main contractor (at most one active, held by the partial unique index, not by a check in code) and any number of subcontractors.
// Separate from pmc_contractors (the consultant tracker's contractor list from 0019); unifying the two is G-210 in docs/GAP_LIST.md.
export const projectCompanies = pgTable(
  "project_companies",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    name: varchar("name", { length: 255 }).notNull(),
    role: varchar("role", { length: 8 }).notNull(),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    check("project_companies_role_check", sql`${table.role} IN ('main', 'sub')`),
    uniqueIndex("project_companies_one_active_main").on(table.projectId).where(sql`${table.role} = 'main' AND ${table.active}`),
    index("project_companies_tenant_project_idx").on(table.tenantId, table.projectId),
    // D-44 (0022): what project_equipment's owner refers to, so an owner from another project or company is impossible
    unique("project_companies_id_tenant_project_unique").on(table.id, table.tenantId, table.projectId),
  ],
);

// Work order 23, P-18 (D-42 b): who prepares, reviews and approves a project's reports — one person per step, a membership of the SAME company
// (held by the composite foreign key, not by a check in code). That the person has a role on the project is checked when the step is assigned.
export const projectReportApprovers = pgTable(
  "project_report_approvers",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    step: varchar("step", { length: 8 }).notNull(),
    membershipId: varchar("membership_id", { length: 36 }).notNull(),
    assignedByUserId: integer("assigned_by_user_id").references(() => users.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    check("project_report_approvers_step_check", sql`${table.step} IN ('prepare', 'review', 'approve')`),
    uniqueIndex("project_report_approvers_project_step_unique").on(table.tenantId, table.projectId, table.step),
    foreignKey({ name: "project_report_approvers_membership_tenant_fk", columns: [table.membershipId, table.tenantId], foreignColumns: [memberships.id, memberships.tenantId] }),
    index("project_report_approvers_membership_idx").on(table.membershipId),
  ],
);

// D-44 (a), P-35: the project's reference lists the daily report chooses from. Labour roles (direct = the trades on the work, indirect = staff and support), copied from
// shared/defaultLabourRoles.ts by an idempotent procedure (default_key marks a copied row, so copying again adds nothing even after a rename) and edited after.
export const projectLabourRoles = pgTable(
  "project_labour_roles",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    name: varchar("name", { length: 120 }).notNull(),
    category: varchar("category", { length: 8 }).notNull(),
    defaultKey: varchar("default_key", { length: 64 }),
    active: boolean("active").default(true).notNull(),
    sortOrder: integer("sort_order").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    check("project_labour_roles_category_check", sql`${table.category} IN ('direct', 'indirect')`),
    uniqueIndex("project_labour_roles_project_name_unique").on(table.projectId, sql`lower(${table.name})`),
    uniqueIndex("project_labour_roles_project_default_unique").on(table.projectId, table.defaultKey).where(sql`${table.defaultKey} IS NOT NULL`),
    index("project_labour_roles_tenant_project_idx").on(table.tenantId, table.projectId),
  ],
);

// The equipment on the project. The owner is one of the companies on the SAME project (composite foreign key, not a check in code); a plate or size is unique per project.
export const projectEquipment = pgTable(
  "project_equipment",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    projectId: varchar("project_id", { length: 36 }).notNull().references(() => projects.id),
    equipmentType: varchar("equipment_type", { length: 120 }).notNull(),
    model: varchar("model", { length: 120 }),
    plateOrSize: varchar("plate_or_size", { length: 80 }),
    ownerCompanyId: varchar("owner_company_id", { length: 36 }),
    active: boolean("active").default(true).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    foreignKey({ name: "project_equipment_owner_same_project_fk", columns: [table.ownerCompanyId, table.tenantId, table.projectId], foreignColumns: [projectCompanies.id, projectCompanies.tenantId, projectCompanies.projectId] }),
    uniqueIndex("project_equipment_project_plate_unique").on(table.projectId, sql`lower(${table.plateOrSize})`).where(sql`${table.plateOrSize} IS NOT NULL`),
    index("project_equipment_tenant_project_idx").on(table.tenantId, table.projectId),
  ],
);

// D-79: file storage inside the database, used automatically when the S3 variables are absent (server/dbStorage.ts, same interface as server/storage.ts).
// One row per stored object, owned by the company named in its key (uploads|tenants|imports|pmc/<company>/...), so row-level security keeps it inside the company.
const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });
export const storedFiles = pgTable(
  "stored_files",
  {
    id: varchar("id", { length: 36 }).primaryKey(),
    tenantId: varchar("tenant_id", { length: 36 }).notNull().references(() => companies.id),
    key: varchar("key", { length: 1024 }).notNull(),
    contentType: varchar("content_type", { length: 255 }).default("application/octet-stream").notNull(),
    size: integer("size").notNull(),
    data: bytea("data").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex("stored_files_key_unique").on(table.key),
    index("stored_files_tenant_idx").on(table.tenantId),
    check("stored_files_size_check", sql`${table.size} >= 0 AND ${table.size} <= 5242880 AND octet_length(${table.data}) = ${table.size}`),
    // the key names its owner, and only that owner: a key moved to another company's prefix (or written under it) is impossible, not merely refused (review of #242)
    check("stored_files_key_owner_check", sql`split_part(${table.key}, '/', 2) = ${table.tenantId}`),
  ],
);
