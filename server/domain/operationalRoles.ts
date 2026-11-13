export const operationalPermissionCatalog = [
  { code: "project.inventory.manage", name: "Manage warehouse inventory", productCode: "PROJECT" as const },
  { code: "project.procurement.manage", name: "Manage procurement", productCode: "PROJECT" as const },
  { code: "project.budget.manage", name: "Manage project budgets", productCode: "PROJECT" as const },
  { code: "project.cost.enter", name: "Enter actual costs", productCode: "PROJECT" as const },
  { code: "project.cashflow.read", name: "View project cash flow", productCode: "PROJECT" as const },
  { code: "project.commitment.manage", name: "Manage commitments", productCode: "PROJECT" as const },
  { code: "project.invoice.match", name: "Match supplier invoices", productCode: "PROJECT" as const },
  { code: "project.payroll.run", name: "Run payroll", productCode: "PROJECT" as const },
  { code: "project.payroll.approve", name: "Approve payroll", productCode: "PROJECT" as const },
  { code: "project.payroll.sensitive.read", name: "Read protected payroll details", productCode: "PROJECT" as const },
  { code: "project.hr.manage", name: "Manage employee records", productCode: "PROJECT" as const },
  { code: "project.hr.sensitive.read", name: "Read protected employee identity data", productCode: "PROJECT" as const },
  { code: "project.payroll.structure", name: "Manage payroll structures", productCode: "PROJECT" as const },
  { code: "project.attendance.manage", name: "Manage attendance", productCode: "PROJECT" as const },
  { code: "project.performance.read_own", name: "Read own performance indicators", productCode: "PROJECT" as const },
  { code: "project.performance.manage", name: "Manage performance indicators", productCode: "PROJECT" as const },
  { code: "project.wbs.manage", name: "Manage WBS", productCode: "PROJECT" as const },
  { code: "project.schedule.manage", name: "Manage schedules", productCode: "PROJECT" as const },
  { code: "project.evm.manage", name: "Manage EVM snapshots", productCode: "PROJECT" as const },
  { code: "project.progress.manage", name: "Report project progress", productCode: "PROJECT" as const },
  { code: "project.field.manage", name: "Manage field reports", productCode: "PROJECT" as const },
  { code: "project.quality.manage", name: "Manage quality inspections", productCode: "PROJECT" as const },
  { code: "project.hse.manage", name: "Manage HSE observations", productCode: "PROJECT" as const },
  { code: "project.rfi.manage", name: "Manage RFIs", productCode: "PROJECT" as const },
  { code: "project.ncr.manage", name: "Manage NCRs", productCode: "PROJECT" as const },
  { code: "project.material.request", name: "Request project materials", productCode: "PROJECT" as const },
  { code: "project.pmc.read", name: "View project control (PMC)", productCode: "PROJECT" as const },
  { code: "project.pmc.update", name: "Update unit-activity status (PMC)", productCode: "PROJECT" as const },
  { code: "project.pmc.manage", name: "Manage the PMC catalogue, baselines and imports", productCode: "PROJECT" as const },
  // Q-5: the QC engineer's «received / not received» for a villa's activity (pmc_qc_receipts). Only the quality role holds it: the site engineer, who also
  // manages quality inspections, cannot mark his own work as received.
  { code: "project.qc.receive", name: "Mark villas as received by QC", productCode: "PROJECT" as const },
  { code: "project.settings.labour", name: "Configure labour cost loading and the working calendar", productCode: "PROJECT" as const },
  { code: "project.manage", name: "Manage governed project operations", productCode: "PROJECT" as const },
  // Q-12 (c): invite people onto THIS project (scope «project» only) with a project role; see projectInviteRoleRefusal for what such a role may not carry.
  { code: "project.team.invite", name: "Invite people onto the project", productCode: "PROJECT" as const },
  // Technical and architectural coordination (work order 5): the drawing register, transmittals, design comments and consultant submittals.
  { code: "project.design.manage", name: "Manage the drawing register, transmittals, design comments and submittals", productCode: "PROJECT" as const },
  { code: "project.design.architectural", name: "Coordinate architectural drawings (architecture, interior, landscape)", productCode: "PROJECT" as const },
  { code: "project.design.technical", name: "Coordinate technical drawings (structure, civil, MEP, fire)", productCode: "PROJECT" as const },
  { code: "project.design.approve", name: "Approve drawings for construction and record consultant replies", productCode: "PROJECT" as const },
  // Tenders before award (work order 5): packages and invitations, bids, levelling, award.
  { code: "project.tender.manage", name: "Manage tender packages and invitations", productCode: "PROJECT" as const },
  { code: "project.tender.bids", name: "Enter and correct bids", productCode: "PROJECT" as const },
  { code: "project.tender.level", name: "Level and compare bids", productCode: "PROJECT" as const },
  { code: "project.tender.award", name: "Award a tender", productCode: "PROJECT" as const },
  // Project creation is its own power (AFTER_MIGRATION O-W3). Nothing checks it yet: the check moves from project.write in a later change.
  { code: "project.create", name: "Create projects", productCode: "PROJECT" as const },
  // Payments (AFTER_MIGRATION R-2): the accountant prepares, the finance manager approves; paymentApproval.ts refuses one person doing both to the same payment.
  { code: "payment.prepare", name: "Prepare a payment", productCode: "PROJECT" as const },
  { code: "payment.approve", name: "Approve a payment", productCode: "PROJECT" as const },
  // The schedule and the master plan (AFTER_MIGRATION R-3). The write checks move to it in a later change.
  { code: "schedule.write", name: "Write the schedule and the master plan", productCode: "PROJECT" as const },
] as const;

/**
 * Permissions a template USED to carry and no longer should. A company that still has one is never changed silently: the removal is proposed to its administrator
 * (role_template_removals), who sees which role and how many people hold it, and approves or declines. Empty today; an entry is added here when a template drops a power.
 */
export const retiredTemplatePermissions: ReadonlyArray<{ roleCode: string; permission: string }> = [];

export type OperationalRoleDefinition = { code: string; name: string; productCode?: "PROJECT" | "EXECUTIVE" | "PMO"; permissions: readonly string[] };

/**
 * The ready-made roles every company gets: installed when the company is created and again by the administration read, as before (db.ts `installOperationalRoleTemplates`). The codes added after this list (project.create, payment.*, schedule.write) are in no template; the owner decides their placement (AFTER_MIGRATION R-1). A role is single-product, so the
 * two company-level views name theirs; the rest are PROJECT roles. The first nine existed before work order 5 and are unchanged; the seven after
 * PROJECT_MANAGER are the templates of work order 5, item 3. Each states what its holder DOES; the powers that must never meet in one person are in
 * `conflictingPermissionPairs`, and `assertNoPermissionConflict` refuses any role or combination that holds both.
 */
export const operationalRoleDefinitions = [
  { code: "WAREHOUSE_CUSTODIAN", name: "Warehouse Custodian", permissions: ["project.inventory.manage", "project.performance.read_own"] },
  { code: "PROCUREMENT_OFFICER", name: "Procurement Officer", permissions: ["project.procurement.manage", "project.performance.read_own"] },
  { code: "FINANCE_MANAGER", name: "Finance Manager", permissions: ["project.pmc.read", "project.budget.manage", "project.cost.enter", "project.cashflow.read", "project.commitment.manage", "project.invoice.match", "project.payroll.approve", "project.payroll.sensitive.read", "project.performance.read_own", "project.settings.labour"] },
  { code: "ACCOUNTANT", name: "Accountant", permissions: ["project.cost.enter", "project.invoice.match", "project.payroll.run", "project.performance.read_own"] },
  { code: "HR_MANAGER", name: "HR Manager", permissions: ["project.hr.manage", "project.hr.sensitive.read", "project.payroll.structure", "project.payroll.sensitive.read", "project.attendance.manage", "project.performance.manage", "project.performance.read_own"] },
  // Q-12 (d): the planning engineer sets projects up (project.create, held at company scope): creates one, writes its profile and companies, and invites its team, the project manager included
  { code: "PLANNING_ENGINEER", name: "Planning Engineer", permissions: ["project.create", "project.pmc.read", "project.pmc.manage", "project.wbs.manage", "project.schedule.manage", "project.evm.manage", "project.team.invite", "project.performance.read_own"] },
  { code: "SITE_ENGINEER", name: "Site Engineer", permissions: ["project.pmc.read", "project.pmc.update", "project.progress.manage", "project.field.manage", "project.quality.manage", "project.hse.manage", "project.rfi.manage", "project.ncr.manage", "project.material.request", "project.performance.read_own"] },
  { code: "QA_QC_MANAGER", name: "QA/QC Manager", permissions: ["project.read", "project.pmc.read", "project.pmc.update", "project.quality.manage", "project.qc.receive", "project.ncr.manage", "project.performance.read_own"] },
  { code: "HSE_MANAGER", name: "HSE Manager", permissions: ["project.hse.manage", "project.field.manage", "project.performance.read_own"] },
  {
    code: "PROJECT_MANAGER",
    name: "Project Manager",
    permissions: [
      "project.manage",
      "project.team.invite",
      "project.pmc.read",
      "project.pmc.update",
      "project.pmc.manage",
      "project.budget.manage",
      "project.cost.enter",
      "project.cashflow.read",
      "project.commitment.manage",
      "project.wbs.manage",
      "project.schedule.manage",
      "project.evm.manage",
      "project.progress.manage",
      "project.field.manage",
      "project.quality.manage",
      "project.hse.manage",
      "project.rfi.manage",
      "project.ncr.manage",
      "project.material.request",
      "project.attendance.manage",
      "project.performance.manage",
      "project.performance.read_own",
    ],
  },
  // ---- the templates of work order 5 (item 3). They carry project.read themselves: a person given one of them can open the project.
  // The executive and the PMO lead are company-level views of one product each; they open no project.
  { code: "EXECUTIVE", name: "Executive", productCode: "EXECUTIVE", permissions: ["executive.read"] },
  { code: "PMO_LEAD", name: "PMO Lead", productCode: "PMO", permissions: ["pmo.read", "pmo.write"] },
  // Controls the money without moving it: budgets, actual cost, cash flow, earned value and the levelling of tender bids. Holds neither commitments nor invoice matching.
  { code: "COST_CONTROLLER", name: "Cost Controller", permissions: ["project.read", "project.pmc.read", "project.budget.manage", "project.cost.enter", "project.cashflow.read", "project.evm.manage", "project.tender.level", "project.performance.read_own"] },
  // Keeps the work moving between teams and the consultant: site records, material requests, and the approval side of design (closing comments, recording consultant replies).
  { code: "PROJECT_COORDINATOR", name: "Project Coordinator", permissions: ["project.read", "project.pmc.read", "project.pmc.update", "project.rfi.manage", "project.field.manage", "project.material.request", "project.design.approve", "project.performance.read_own"] },
  // The two design coordinators issue and chase drawings in their own disciplines only; neither approves what they issue.
  { code: "DESIGN_COORDINATOR_ARCHITECTURAL", name: "Design Coordinator (Architectural)", permissions: ["project.read", "project.pmc.read", "project.design.manage", "project.design.architectural", "project.rfi.manage", "project.performance.read_own"] },
  { code: "DESIGN_COORDINATOR_TECHNICAL", name: "Design Coordinator (Technical)", permissions: ["project.read", "project.pmc.read", "project.design.manage", "project.design.technical", "project.rfi.manage", "project.performance.read_own"] },
  // Prepares tenders and enters the bids and manages the commitments they become; neither levels nor awards (the award stays with the company owner or a custom role).
  { code: "CONTRACTS_MANAGER", name: "Contracts Manager", permissions: ["project.read", "project.pmc.read", "project.commitment.manage", "project.tender.manage", "project.tender.bids", "project.performance.read_own"] },
] satisfies readonly OperationalRoleDefinition[];

const conflictingOperationalRolePairs = [
  ["PROCUREMENT_OFFICER", "WAREHOUSE_CUSTODIAN"],
  ["ACCOUNTANT", "FINANCE_MANAGER"],
  ["HR_MANAGER", "ACCOUNTANT"],
] as const;

export function assertOperationalRoleSeparation(existingRoleCodes: string[], nextRoleCode: string) {
  const normalizedNext = nextRoleCode.trim().toUpperCase();
  const conflict = conflictingOperationalRolePairs.find(([left, right]) =>
    (normalizedNext === left && existingRoleCodes.includes(right)) ||
    (normalizedNext === right && existingRoleCodes.includes(left)),
  );
  if (conflict) throw new Error("PROJECT_OS_SEPARATION_OF_DUTIES_CONFLICT");
}

/**
 * Q-12 (c): a person who invites with project.team.invite (not tenant.manage) puts the invitee on ONE project. The role offered must be a PROJECT role whose
 * permissions all live inside a project — nothing company-wide (tenant.*, executive.*, pmo.*), no onward invitation (project.team.invite: no chain of delegation),
 * and no people's personal or pay data (project.hr.*, project.payroll.*, project.attendance.*). Returns the first permission that is refused, or null.
 */
export function projectInviteRoleRefusal(role: { productCode: string | null }, codes: readonly string[], inviter: { setsUpProjects?: boolean } = {}): string | null {
  if (role.productCode && role.productCode !== "PROJECT") return role.productCode;
  // Q-12 (d): whoever sets projects up for the company (project.create at company scope: the planning engineer) may also give the project manager's role, which
  // invites in turn and keeps the site's attendance; still never project.create itself (company-wide), nor staff or pay data
  const setUpMay = (code: string) => inviter.setsUpProjects === true && (code === "project.team.invite" || code.startsWith("project.attendance."));
  return codes.find(code => !code.startsWith("project.") || code === "project.create" || (!setUpMay(code) && (code === "project.team.invite" || /^project\.(hr|payroll|attendance)\./.test(code)))) ?? null;
}

/** Q-12 (d): project.create counts only when held for the whole company (a project-scoped grant of it sets up nothing). */
export const SETS_UP_PROJECTS = { permission: "project.create", scope: { type: "company" as const } };
