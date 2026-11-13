import { operationalPermissionCatalog, operationalRoleDefinitions } from "./operationalRoles";

/**
 * The role matrix (docs/ROLE_MATRIX.md): for each role, per screen and per sensitive kind of data, the HIGHEST thing the role can do as the code applies it today:
 * "approve" (يعتمد) > "edit" (يعدّل) > "see" (يرى) > nothing (لا شيء). It describes; it changes no permission. The owner reads the table and decides.
 *
 * "As applied" means every cell is derived from two things the server really uses, never from a description of intent:
 *   1. the permission codes each role template carries (`operationalRoleDefinitions`, the very array that installs the roles into a company), and
 *   2. the permission codes the named server function demands (`sources`). `roleMatrix.test.ts` opens each source file, finds the function and fails when the codes it
 *      checks differ from the ones declared here -- so a check added, removed or widened in the code breaks the test until this file and the document are updated.
 *
 * Out of the matrix on purpose: the licence/plan gate (a feature outside the company's plan is refused for every role), the scope of an assignment (since G-142 / D-18 a
 * permission counts only on its own assignment's scope; the matrix assumes that scope covers the resource), and the segregation-of-duties pairs (`conflictingPermissionPairs`).
 */

export type Tier = "see" | "edit" | "approve";
/** One server function and the permission codes it accepts (any one of them is enough). */
export type Source = { file: string; fn: string; codes: readonly string[] };
export type MatrixAction = { tier: Tier; sources: readonly Source[] };
export type MatrixColumn = { id: string; title: string; kind: "screen" | "data"; actions: readonly MatrixAction[]; note?: string };

const s = (file: string, fn: string, ...codes: string[]): Source => ({ file, fn, codes });
const DB = "server/db.ts";
const DESIGN = "server/designService.ts";
const TENDER = "server/tenderService.ts";
const PMC = "server/pmcService.ts";
const SITE = "server/pmcSiteService.ts";
const PROFILE = "server/projectProfile.ts";
const LISTS = "server/projectReferenceLists.ts";

export const matrixColumns: readonly MatrixColumn[] = [
  { id: "projects", title: "المشاريع والضوابط", kind: "screen", actions: [
    { tier: "see", sources: [s(DB, "listProjectsForTenant", "project.read"), s(DB, "getProjectControlsForTenant", "project.read")] },
    { tier: "edit", sources: [s(DB, "createProjectForTenant", "project.write", "project.create")] },
  ] },
  { id: "setup", title: "تفعيل المشروع", kind: "screen", actions: [
    { tier: "see", sources: [s(PROFILE, "getProjectProfile", "project.read", "project.manage", "project.create"), s(PROFILE, "listProjectCompanies", "project.read", "project.manage", "project.create")] },
    { tier: "edit", sources: [s(PROFILE, "saveProjectProfile", "project.manage", "project.create"), s(PROFILE, "saveProjectCompany", "project.manage", "project.create"), s(PROFILE, "deactivateProjectCompany", "project.manage", "project.create")] },
  ], note: "بيانات المشروع وشعاراته والشركات المشاركة (D-42 أ). سلسلة الاعتماد (D-42 ب، #227) تُضاف بعد دمجها." },
  { id: "referenceLists", title: "القوائم المرجعية", kind: "screen", actions: [
    { tier: "see", sources: [s(LISTS, "listLabourRoles", "project.read", "project.field.manage", "project.manage"), s(LISTS, "listEquipment", "project.read", "project.field.manage", "project.manage"), s(LISTS, "listSiteActivityMeasures", "project.read", "project.field.manage", "project.manage")] },
    { tier: "edit", sources: [
      s(LISTS, "seedDefaultLabourRoles", "project.manage"), s(LISTS, "saveLabourRole", "project.manage"), s(LISTS, "setLabourRoleActive", "project.manage"),
      s(LISTS, "saveEquipment", "project.manage"), s(LISTS, "setEquipmentActive", "project.manage"), s(LISTS, "setSiteActivityMeasure", "project.manage"),
    ] },
  ], note: "أدوار العمالة والمعدات ووحدة النشاط وكميته الكلية (D-44 أ). مهندس الموقع يقرؤها لأنه يملأ منها التقرير اليومي." },
  { id: "executive", title: "لوحة التنفيذي", kind: "screen", actions: [
    { tier: "see", sources: [s(DB, "computeExecutiveDashboard", "executive.read")] },
  ] },
  { id: "pmo", title: "لوحة PMO", kind: "screen", actions: [
    { tier: "see", sources: [s(DB, "getPmoDashboard", "pmo.read")] },
    { tier: "edit", sources: [s(DB, "createPortfolioForTenant", "pmo.write")] },
  ] },
  { id: "pmc", title: "ضبط المشروع PMC", kind: "screen", actions: [
    { tier: "see", sources: [s(PMC, "listPmcVerificationStatuses", "project.pmc.read")] },
    { tier: "edit", sources: [s(PMC, "setPmcUnitActivityStatus", "project.pmc.update"), s(PMC, "setPmcStatusFactors", "project.pmc.manage")] },
  ] },
  { id: "siteConsultant", title: "الموقع والاستشاري", kind: "screen", actions: [
    { tier: "see", sources: [
      s(SITE, "listSiteActivities", "project.pmc.read"), s(SITE, "pmcComparison", "project.pmc.read"), s(SITE, "pmcSourcePercentages", "project.pmc.read"), s(SITE, "siteCellHistory", "project.pmc.read"),
      s("server/wo22Exports.ts", "exportComparisonWorkbook", "project.pmc.read"), s("server/consultantImport.ts", "listConsultantColumns", "project.pmc.read"),
    ] },
    { tier: "edit", sources: [
      s(SITE, "updateSiteStatus", "project.pmc.update"), s(SITE, "actOnDifferences", "project.pmc.update"), s(SITE, "savePmcCellNote", "project.pmc.update"),
      s(SITE, "confirmSiteActivityLinks", "project.pmc.manage"), s("server/consultantImport.ts", "linkConsultantColumns", "project.pmc.manage"),
    ] },
  ], note: "أمر العمل 22 (D-5). القيمة المكتسبة بالريال في عمود «التكاليف والميزانية» (project.budget.manage)." },
  { id: "imports", title: "الاستيراد والتراجع", kind: "screen", actions: [
    { tier: "edit", sources: [
      s("server/p6Import.ts", "inTransaction", "project.schedule.manage", "project.wbs.manage"), s("server/p6Update.ts", "confirmScheduleUpdate", "project.schedule.manage", "project.wbs.manage"),
      s("server/matrixImport.ts", "confirmMatrixImport", "project.pmc.manage"), s("server/consultantImport.ts", "confirmConsultantImport", "project.pmc.manage"), s("server/siteLegacyImport.ts", "confirmSiteLegacyImport", "project.pmc.manage"),
      s("server/importAttempts.ts", "discardImportAttempt", "project.wbs.manage", "project.budget.manage", "project.commitment.manage", "project.procurement.manage", "project.inventory.manage", "project.schedule.manage"),
      s("server/importAttempts.ts", "rollbackImport", "project.manage"),
    ] },
  ], note: "استيراد P6 وتحديثه والمصفوفة وتصدير الاستشاري ودفتر الموقع القديم (D-4، D-5)، وحذف المحاولة (أي صلاحية استيراد) والتراجع (project.manage) (D-1)." },
  { id: "site", title: "الموقع والجودة والسلامة", kind: "screen", actions: [
    { tier: "see", sources: [s(DB, "getRfisForTenant", "project.read"), s(DB, "getNcrsForTenant", "project.read")] },
    { tier: "edit", sources: [
      s(DB, "createRfiForTenant", "project.rfi.manage"), s(DB, "createNcrForTenant", "project.ncr.manage"), s(DB, "createQualityInspectionForTenant", "project.quality.manage"),
      s(DB, "createHseObservationForTenant", "project.hse.manage"), s(DB, "createFieldReportForTenant", "project.field.manage"),
    ] },
  ] },
  { id: "supply", title: "المشتريات والمستودع", kind: "screen", actions: [
    { tier: "see", sources: [s(DB, "getProcurementRegisterForTenant", "project.read"), s(DB, "getProjectWarehousesForTenant", "project.read")] },
    { tier: "edit", sources: [
      s(DB, "createPurchaseOrderForTenant", "project.procurement.manage"), s(DB, "createGoodsReceiptNoteForTenant", "project.inventory.manage"),
      s(DB, "createMaterialIssueForTenant", "project.inventory.manage"), s(DB, "createProcurementRequisitionForTenant", "project.material.request", "project.procurement.manage"),
    ] },
  ] },
  { id: "planning", title: "الخطة والتقدم", kind: "screen", actions: [
    { tier: "see", sources: [s(DB, "getProjectResourcesForTenant", "project.read")] },
    { tier: "edit", sources: [
      s(DB, "createWbsItem", "project.wbs.manage"), s(DB, "createActivity", "project.schedule.manage"), s(DB, "saveEvmSnapshot", "project.evm.manage"), s(DB, "createProgressEntry", "project.progress.manage"),
    ] },
  ] },
  { id: "design", title: "المخططات والتصميم", kind: "screen", actions: [
    { tier: "see", sources: [s(DESIGN, "listDesignDrawings", "project.read")] },
    { tier: "edit", sources: [s(DESIGN, "registerDesignDrawing", "project.design.manage")] },
    { tier: "approve", sources: [s(DESIGN, "approveDesignDrawing", "project.design.approve")] },
  ] },
  { id: "tenders", title: "المناقصات", kind: "screen", actions: [
    { tier: "see", sources: [s(TENDER, "getTenderComparison", "project.read")] },
    { tier: "edit", sources: [s(TENDER, "createTenderPackage", "project.tender.manage"), s(TENDER, "enterTenderBid", "project.tender.bids"), s(TENDER, "addTenderBidAdjustment", "project.tender.level")] },
    { tier: "approve", sources: [s(TENDER, "awardTender", "project.tender.award")] },
  ] },
  { id: "profit", title: "الربح", kind: "data", actions: [
    { tier: "see", sources: [s(DB, "getProjectProfitabilityForTenant", "project.cashflow.read"), s(DB, "getPortfolioProfitabilityForTenant", "executive.read")] },
  ], note: "الربحية قراءة فقط؛ لا تُحرَّر ولا تُعتمد." },
  { id: "costs", title: "التكاليف والميزانية", kind: "data", actions: [
    { tier: "see", sources: [s(DB, "getProjectControlsForTenant", "project.read"), s(DB, "getProjectCashFlowForTenant", "project.cashflow.read"), s(SITE, "pmcEarnedValue", "project.budget.manage")] },
    { tier: "edit", sources: [s(DB, "createBudgetLine", "project.budget.manage"), s(DB, "createCostEntry", "project.cost.enter")] },
  ], note: "«يرى» تأتي من project.read وحدها: getProjectControlsForTenant تُرجع الميزانية وقيود التكلفة والتدفق النقدي لكل من يفتح المشروع (انظر القسم الثالث في الوثيقة)." },
  { id: "contracts", title: "قيم العقود والالتزامات", kind: "data", actions: [
    { tier: "see", sources: [s(DB, "getContractsCommitmentsForTenant", "project.read"), s(DB, "getBoqItemsForTenant", "project.read"), s(DB, "getSubcontractContractsForTenant", "project.read")] },
    { tier: "edit", sources: [
      s(DB, "createContractForTenant", "project.commitment.manage"), s(DB, "createCommitmentForTenant", "project.commitment.manage"),
      s(DB, "createProjectCommercialInvoiceForTenant", "project.invoice.match"), s(DB, "createBoqItemForTenant", "project.wbs.manage"),
    ] },
  ] },
  { id: "payroll", title: "الرواتب", kind: "data", actions: [
    { tier: "see", sources: [s(DB, "getSalaryStructureForTenant", "project.payroll.sensitive.read"), s(DB, "getPayrollRunDetailsForTenant", "project.payroll.sensitive.read")] },
    { tier: "edit", sources: [s(DB, "saveSalaryStructureForTenant", "project.payroll.structure"), s(DB, "createPayrollRunForTenant", "project.payroll.run")] },
    { tier: "approve", sources: [s(DB, "allocateApprovedPayrollCostForTenant", "project.payroll.approve")] },
  ] },
  { id: "people", title: "سجل الموظفين وهوياتهم", kind: "data", actions: [
    { tier: "see", sources: [s(DB, "getEmployeeIdentityForTenant", "project.hr.sensitive.read")] },
    { tier: "edit", sources: [s(DB, "createEmployeeForTenant", "project.hr.manage")] },
  ] },
  { id: "beneficiaries", title: "بيانات المستفيدين", kind: "data", actions: [], note: "لا يخزّن المخطط أي بيانات مستفيدين (سياسة البيانات)؛ فلا فعل يُمنح. يفشل الاختبار إن ظهر عمود بهذا المعنى في المخطط." },
  { id: "approvals", title: "الاعتمادات (أي اعتماد مُطبَّق)", kind: "data", actions: [
    { tier: "approve", sources: [s(DESIGN, "approveDesignDrawing", "project.design.approve"), s(TENDER, "awardTender", "project.tender.award"), s(DB, "allocateApprovedPayrollCostForTenant", "project.payroll.approve")] },
  ], note: "يجمع اعتماد المخططات وترسية المناقصة واعتماد الرواتب. اعتماد الدفعات (payment.approve) غير مُطبَّق في الكود." },
];

/** Permission codes that exist in the catalogue and are granted to roles, yet no server function checks them (the test proves it by searching the server sources). */
export const unenforcedCodes: readonly string[] = ["payment.prepare", "payment.approve", "schedule.write"];

/**
 * Codes the server checks, but in places that are not a column of the matrix (yet). Each is named with its reason; the coverage guard in roleMatrix.test.ts fails when a
 * catalogue code is neither in a column, nor here, nor in `unenforcedCodes` -- so a new permission cannot arrive without the owner seeing where it stands.
 */
export const outsideColumns: Readonly<Record<string, string>> = {
  "tenant.manage": "إدارة الشركة نفسها (الأدوار والدعوات والفوترة والدعم): مالك الشركة وحده، بتكليف بنطاق الشركة منذ G-142.",
  "project.attendance.manage": "الحضور في شاشة القوى العاملة (server/db.ts)؛ لا عمود لها في المصفوفة بعد.",
  "project.performance.read_own": "أداء الشخص نفسه («أدائي») في شاشة القوى العاملة؛ لا عمود.",
  "project.performance.manage": "تقييم الأداء في شاشة القوى العاملة؛ لا عمود.",
  "project.settings.labour": "إعدادات تحميل تكلفة العمالة على مستوى الشركة (server/db.ts)؛ لا عمود.",
  "project.qc.receive": "Q-5: استلام QC (مستلم / غير مستلم) لعدة فلل مرة واحدة (server/pmcQcReceipts.ts updatePmcQcReceipts)؛ يملكه دور QA_QC_MANAGER وحده، لا عمود.",
  "project.team.invite": "Q-12 (ج): دعوة أشخاص إلى مشروع واحد بدور مشروع مسموح (server/db.ts createMembershipInvitation، القاعدة projectInviteRoleRefusal)؛ لا عمود.",
  "project.design.architectural": "تخصص منسق التصميم: يضيّق «يعدّل» في المخططات إلى التخصص المعماري (server/domain/designCoordination.ts).",
  "project.design.technical": "تخصص منسق التصميم: يضيّق «يعدّل» في المخططات إلى التخصص الفني (server/domain/designCoordination.ts).",
};

/** What the company owner (TENANT_OWNER) holds: the six base codes of `ownerPermissions` in db.ts plus the whole operational catalogue. The test ties the six to db.ts. */
export const ownerBaseCodes = ["tenant.manage", "executive.read", "pmo.read", "pmo.write", "project.read", "project.write"] as const;

export const roleNamesAr = {
  WAREHOUSE_CUSTODIAN: "أمين المستودع",
  PROCUREMENT_OFFICER: "مسؤول المشتريات والتوريد",
  FINANCE_MANAGER: "المدير المالي",
  ACCOUNTANT: "المحاسب",
  HR_MANAGER: "مدير الموارد البشرية",
  PLANNING_ENGINEER: "مهندس التخطيط",
  SITE_ENGINEER: "مهندس الموقع",
  QA_QC_MANAGER: "مدير الجودة وضبط الجودة",
  HSE_MANAGER: "مدير الصحة والسلامة والبيئة",
  PROJECT_MANAGER: "مدير المشروع",
  EXECUTIVE: "المستوى التنفيذي",
  PMO_LEAD: "مسؤول مكتب إدارة المشاريع (PMO)",
  COST_CONTROLLER: "مراقب التكلفة (كوست كنترول)",
  PROJECT_COORDINATOR: "منسق المشروع",
  DESIGN_COORDINATOR_ARCHITECTURAL: "منسق التصميم المعماري",
  DESIGN_COORDINATOR_TECHNICAL: "منسق التصميم الفني",
  CONTRACTS_MANAGER: "مدير العقود",
} as const;

export const matrixRoles: readonly { code: string; ar: string; permissions: readonly string[] }[] = [
  { code: "TENANT_OWNER", ar: "مالك الشركة", permissions: [...ownerBaseCodes, ...operationalPermissionCatalog.map(entry => entry.code)] },
  ...operationalRoleDefinitions.map(role => ({ code: role.code, ar: roleNamesAr[role.code as keyof typeof roleNamesAr], permissions: role.permissions as readonly string[] })),
];


export const cellText = { approve: "يعتمد", edit: "يعدّل", see: "يرى", none: "لا شيء" } as const;
const tierRank: Record<Tier, number> = { see: 1, edit: 2, approve: 3 };

export const codesOfAction = (action: MatrixAction) => new Set(action.sources.flatMap(source => source.codes));

/** The highest tier a holder of `permissions` reaches in the column, or "none". */
export function cellFor(column: MatrixColumn, permissions: readonly string[]): Tier | "none" {
  let best: Tier | "none" = "none";
  for (const action of column.actions) {
    if (!Array.from(codesOfAction(action)).some(code => permissions.includes(code))) continue;
    if (best === "none" || tierRank[action.tier] > tierRank[best]) best = action.tier;
  }
  return best;
}

const row = (cells: readonly string[]) => `| ${cells.join(" | ")} |`;

export function renderRoleMatrix(): string {
  const lines = [row(["الدور", ...matrixColumns.map(column => column.title)]), row(["---", ...matrixColumns.map(() => ":---:")])];
  for (const role of matrixRoles) lines.push(row([`${role.ar} (\`${role.code}\`)`, ...matrixColumns.map(column => cellText[cellFor(column, role.permissions)])]));
  return lines.join("\n");
}

/** Roles whose template lacks `project.read`: what the single base role `project.read` (the "viewer" role the acceptance round gives them) would add, cell by cell. */
export function renderViewerAdditions(): string {
  const lines: string[] = [];
  for (const role of matrixRoles) {
    if (role.permissions.includes("project.read")) continue;
    const added = matrixColumns.flatMap(column => {
      const before = cellFor(column, role.permissions);
      const after = cellFor(column, [...role.permissions, "project.read"]);
      return before === after ? [] : [`${column.title}: ${cellText[before]} ← ${cellText[after]}`];
    });
    lines.push(`- ${role.ar} (\`${role.code}\`): ${added.length ? added.join("؛ ") : "لا تغيير"}`);
  }
  return lines.join("\n");
}

/** The owner's short list: for each sensitive column (profit, costs and budget, payroll), which roles reach which tier -- one line per column. */
export const sensitiveColumnIds = ["profit", "costs", "payroll"] as const;
export function renderSensitiveSummary(): string {
  return sensitiveColumnIds.map(id => {
    const column = matrixColumns.find(item => item.id === id)!;
    const tiers = (["approve", "edit", "see"] as const).map(tier => {
      const holders = matrixRoles.filter(role => cellFor(column, role.permissions) === tier).map(role => role.ar);
      return holders.length ? `${cellText[tier]}: ${holders.join("، ")}` : null;
    }).filter(Boolean);
    return `- **${column.title}** — ${tiers.join(" · ")}؛ والباقون: لا شيء.`;
  }).join("\n");
}
