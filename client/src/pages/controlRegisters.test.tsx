import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ExecutiveDashboard from "./ExecutiveDashboard";
import PmoDashboard from "./PmoDashboard";
import ProjectControls from "./ProjectControls";
import { commitmentFormAfterResponse, contractFormAfterResponse } from "./ProjectContracts";
import ProjectRegistry, { lifecycleFeedbackTargetsProject } from "./ProjectRegistry";
import TenantAdministration from "./TenantAdministration";

const state = vi.hoisted(() => ({
  isArabic: false,
  executiveMutationPending: false,
  tenantAssignmentSuccess: false,
  tenantAssignmentError: null as unknown,
  tenantRoleSuccess: false,
  tenantRoleError: null as unknown,
  tenantExistingRoleAssignmentSuccess: false,
  tenantExistingRoleAssignmentError: null as unknown,
  tenantRoleRevocationSuccess: false,
  tenantRoleRevocationError: null as unknown,
  tenantRoleUpdateSuccess: false,
  tenantRoleUpdateError: null as unknown,
  tenantInvitationError: null as unknown,
  pmoPortfolioError: null as unknown,
  pmoPortfolioSuccess: false,
  pmoProgramError: null as unknown,
  pmoProgramSuccess: false,
  pmoProjectLinkError: null as unknown,
  pmoProjectLinkSuccess: false,
  pmoEscalationError: null as unknown,
  pmoEscalationSuccess: false,
  projectLifecycleError: null as unknown,
  projectLifecycleSuccess: false,
  projectRegistryData: [{ id: "project-1", code: "PRJ-01", name: "North Link", projectType: "Infrastructure", lifecycleStage: "planning", status: "active", currentBudget: "1000", actualCost: "400", forecastCost: "1100" }],
  contractRegisterError: null as unknown,
  documentRegisterError: null as unknown,
  documentTransitionError: null as unknown,
  rfiError: null as unknown,
  ncrError: null as unknown,
  projectHealthError: null as unknown,
  contractRegisterData: { contracts: [{ id: "contract-1", code: "CTR-01", title: "Civil Works", counterparty: "Build Co", contractValue: "1000", currency: "USD", status: "draft", startAt: null, endAt: null }], commitments: [{ id: "commitment-1", contractId: "contract-1", code: "COM-01", description: "Steel package", amount: "250", currency: "USD", status: "draft", committedAt: null }] },
  documentRegisterData: { documents: [{ id: "document-1", documentNumber: "DRW-01", title: "Foundation drawing", category: "drawing", status: "for_review", createdAt: new Date("2026-08-18T00:00:00.000Z") }], versions: [{ id: "version-1", documentId: "document-1", versionNumber: 1, originalName: "foundation.pdf", mimeType: "application/pdf", sizeBytes: 2048, checksumSha256: "abc", createdAt: new Date("2026-08-18T00:00:00.000Z") }] },
  rfiData: [{ id: "rfi-1", rfiNumber: "RFI-01", subject: "Foundation detail", question: "Please clarify foundation reinforcement details.", status: "submitted", dueAt: null, submittedAt: null, createdAt: new Date("2026-08-18T00:00:00.000Z") }],
  ncrData: [{ id: "ncr-1", ncrNumber: "NCR-01", title: "Reinforcement deviation", description: "Reinforcement does not match the approved drawing.", status: "open", dueAt: null, createdAt: new Date("2026-08-18T00:00:00.000Z") }],
  pmoData: {
    portfolios: [],
    programs: [],
    projects: [{ id: "project-1", code: "PRJ-01", name: "North Link" }],
    risks: [],
    issues: [{ id: "issue-critical", projectId: "project-1", code: "ISS-01", title: "Critical access blockage", priority: "critical", escalationStatus: "none", status: "open", dueAt: null }],
    actions: [
      { id: "action-open", projectId: "project-1", title: "Mitigate access constraint", priority: "high", escalationStatus: "none", status: "in_progress", dueAt: new Date("2020-01-01T00:00:00.000Z") },
      { id: "action-done", projectId: "project-1", title: "Closed action", priority: "low", escalationStatus: "none", status: "completed", dueAt: null },
    ],
    decisions: [],
    rfis: [],
    ncrs: [],
  },
  executiveData: {
    totals: { budget: 0, actual: 0, forecast: 0 },
    projects: [] as Array<{ id: string; code: string; name: string; status: string; forecastCost: number; health: { status: string } | null }> ,
    decisions: [],
    cashFlow: { plannedBudget: 1000, actualCost: 300, committedAmount: 250, totalExposure: 550, remainingBudget: 450 },
    cashFlowByProject: [{ id: "project-1", code: "PRJ-01", name: "North Link", plannedBudget: 1000, actualCost: 300, committedAmount: 250, totalExposure: 550, remainingBudget: 450 }],
    cashFlowByPortfolio: [{ portfolioId: "portfolio-1", code: "PORT-01", name: "Strategic Works", projectCount: 1, plannedBudget: 1000, actualCost: 300, committedAmount: 250, totalExposure: 550, remainingBudget: 450 }],
  },
  projectControlsData: {
    project: { code: "PRJ-01", name: "North Link" },
    wbs: [{ id: "wbs-1", code: "1.0", name: "Civil works", plannedValue: "100", progressPercent: "0" }],
    activities: [{ id: "activity-1", wbsItemId: "wbs-1", code: "A-01", name: "Mobilize crew", status: "not_started", plannedValue: "50", earnedValue: "0", plannedStartAt: new Date("2026-08-17T00:00:00.000Z"), plannedFinishAt: new Date("2026-08-20T00:00:00.000Z") }],
    budgets: [],
    costs: [],
    progress: [],
    latestEvm: null,
    latestHealth: { id: "health-1", periodAt: new Date("2026-08-18T00:00:00.000Z"), overallScore: "82", status: "amber", confidence: "medium", drivers: "{\"overdueRfiCount\":2,\"overdueNcrCount\":1}", exceptions: "[{\"code\":\"CPI_CRITICAL\",\"severity\":\"critical\",\"message\":\"RAW SERVER MESSAGE\",\"recommendedAction\":\"RAW SERVER ACTION\"}]" },
  },
  tenantAdminData: {
    members: [{ membershipId: "member-1", userId: 12, name: "Amina", email: "amina@example.com", status: "active", joinedAt: null, roles: [{ assignmentId: "assignment-1", roleId: "role-1", roleCode: "PMO_MANAGER", roleName: "PMO Manager", scopeType: "project", scopeId: "project-opaque-id", scopeName: "Airport Terminal" }] }],
    roles: [{ id: "role-1", code: "PMO_MANAGER", name: "PMO Manager", productCode: "PMO", systemManaged: false, permissions: [{ code: "pmo.write" }] }],
    permissions: [{ code: "pmo.write", name: "Manage PMO", productCode: "PMO" }],
  },
}));

vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <span>Language toggle</span> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.isArabic }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: (_error: unknown, isArabic: boolean) => isArabic ? "خطأ موضّع" : "Localized error" }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: null, logout: vi.fn(), loading: false }) }));
vi.mock("./ProjectMaterials", () => ({ ProjectMaterials: () => null }));
vi.mock("./ProjectWarehouses", () => ({ ProjectWarehouses: () => null }));
vi.mock("./ProjectProcurement", () => ({ ProjectProcurement: () => null }));
vi.mock("./ProjectGoodsReceipts", () => ({ ProjectGoodsReceipts: () => null }));
vi.mock("wouter", () => ({
  Link: ({ children, ...props }: { children: React.ReactNode }) => <a {...props}>{children}</a>,
  useParams: () => ({ tenantId: "tenant-1" }),
}));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({
      dashboards: {
        invalidate: vi.fn(),
      },
      tenant: {
        administration: { invalidate: vi.fn() },
      },
    }),
    profitability: { portfolio: { useQuery: () => ({ isLoading: false, error: null, data: { total: { currency: "SAR", fpac: 0 }, projects: [], unavailable: [] } }) } },
    dashboards: {
      pmoPortfolioSetup: { useQuery: () => ({ isLoading: false, error: null, data: { portfolios: state.pmoData.portfolios, programs: state.pmoData.programs, projects: state.pmoData.projects, decisions: state.pmoData.decisions, rfis: state.pmoData.rfis, ncrs: state.pmoData.ncrs } }) },
      pmoRisks: { useQuery: () => ({ isLoading: false, error: null, data: { risks: state.pmoData.risks } }) },
      pmoIssues: { useQuery: () => ({ isLoading: false, error: null, data: { issues: state.pmoData.issues } }) },
      pmoActions: { useQuery: () => ({ isLoading: false, error: null, data: { actions: state.pmoData.actions } }) },
      pmoPlanning: { useQuery: () => ({ isLoading: false, error: null, data: { planningOverview: { projects: [], summary: { totalProjects: 0, criticalProjects: 0, warningProjects: 0, dataRequiredProjects: 0, delayedProjects: 0 } } } }) },
      pmoTodayExceptions: { useQuery: () => ({ isLoading: false, error: null, data: { todayExceptions: [] } }) },
      executiveMetrics: { useQuery: () => ({ isLoading: false, error: null, data: { totals: state.executiveData.totals } }) },
      executiveProjects: { useQuery: () => ({ isLoading: false, error: null, data: { projects: state.executiveData.projects } }) },
      executiveDecisions: { useQuery: () => ({ isLoading: false, error: null, data: { decisions: state.executiveData.decisions } }) },
      executiveCashFlow: { useQuery: () => ({ isLoading: false, error: null, data: { cashFlow: state.executiveData.cashFlow, cashFlowByProject: state.executiveData.cashFlowByProject, cashFlowByPortfolio: state.executiveData.cashFlowByPortfolio } }) },
      reportSectionIssue: { useMutation: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, error: null }) },
    },
    navigation: { get: { useQuery: () => ({ isLoading: false, error: null, data: [] }) } },
    masterPlans: {
      list: { useQuery: () => ({ isLoading: false, error: null, data: { plans: [], versions: [], entities: [] }, refetch: vi.fn() }) },
      visualizationRules: { useQuery: () => ({ isLoading: false, error: null, data: [], refetch: vi.fn() }) },
      saveVisualizationRule: { useMutation: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, error: null }) },
      listSnapshots: { useQuery: () => ({ isLoading: false, error: null, data: [], refetch: vi.fn() }) },
      createSnapshot: { useMutation: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, error: null }) },
      create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
      createVersion: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
      createSpatialEntity: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
      applyExcelMapping: { useMutation: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, error: null }) },
      importSpatialEntities: { useMutation: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, error: null }) },
    },
    dataImports: {
      list: { useQuery: () => ({ isLoading: false, error: null, data: [], refetch: vi.fn() }) },
      detail: { useQuery: () => ({ isLoading: false, error: null, data: null, refetch: vi.fn() }) },
      analyze: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, data: null }) },
      reanalyze: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, data: null }) },
      confirm: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, data: null }) },
      export: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, data: null }) },
    },
    projects: {
      getControls: { useQuery: () => ({ isLoading: false, error: null, data: state.projectControlsData, refetch: vi.fn() }) },
      getControlsSchedule: { useQuery: () => ({ isLoading: false, error: null, data: { project: state.projectControlsData.project, wbs: state.projectControlsData.wbs, activities: state.projectControlsData.activities }, refetch: vi.fn() }) },
      getControlsFinancials: { useQuery: () => ({ isLoading: false, error: null, data: { wbs: state.projectControlsData.wbs, budgets: state.projectControlsData.budgets, costs: state.projectControlsData.costs, progress: state.projectControlsData.progress }, refetch: vi.fn() }) },
      getControlsPerformance: { useQuery: () => ({ isLoading: false, error: null, data: { latestEvm: state.projectControlsData.latestEvm, latestHealth: state.projectControlsData.latestHealth, cashFlow: null }, refetch: vi.fn() }) },
      list: { useQuery: () => ({ isLoading: false, error: null, data: state.projectRegistryData, refetch: vi.fn() }) },
      create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
      transitionLifecycle: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: state.projectLifecycleError, isSuccess: state.projectLifecycleSuccess }) },
    },
    contracts: {
      getProjectRegister: { useQuery: () => ({ isLoading: false, error: state.contractRegisterError, data: state.contractRegisterData, refetch: vi.fn() }) },
      create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
      createCommitment: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
    },
    documents: {
      getProjectRegister: { useQuery: () => ({ isLoading: false, error: state.documentRegisterError, data: state.documentRegisterData, refetch: vi.fn() }) },
      createWithVersion: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
      addVersion: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
      transitionStatus: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: state.documentTransitionError }) },
    },
    rfis: {
      list: { useQuery: () => ({ isLoading: false, error: state.rfiError, data: state.rfiData, refetch: vi.fn() }) },
      create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: state.rfiError }) },
      transitionStatus: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: state.rfiError }) },
    },
    ncrs: {
      list: { useQuery: () => ({ isLoading: false, error: state.ncrError, data: state.ncrData, refetch: vi.fn() }) },
      create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: state.ncrError }) },
      transitionStatus: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: state.ncrError }) },
    },
    hse: {
      list: { useQuery: () => ({ isLoading: false, error: null, data: [], refetch: vi.fn() }) },
      create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, data: null }) },
      transitionStatus: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, data: null }) },
    },
    fieldReports: {
      list: { useQuery: () => ({ isLoading: false, error: null, data: [], refetch: vi.fn() }) },
      create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, data: null }) },
      transitionStatus: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, data: null }) },
    },
    qualityInspections: {
      list: { useQuery: () => ({ isLoading: false, error: null, data: [], refetch: vi.fn() }) },
      create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, data: null }) },
      transitionStatus: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, data: null }) },
    },
    purchaseOrders: {
      list: { useQuery: () => ({ isLoading: false, error: null, data: [], refetch: vi.fn() }) },
      create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, data: null }) },
      transitionStatus: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, data: null }) },
    },
    controlLinks: {
      list: { useQuery: () => ({ isLoading: false, error: null, data: [], refetch: vi.fn() }) },
      create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, data: null, isSuccess: false }) },
    },
    changes: {
      list: { useQuery: () => ({ isLoading: false, error: null, data: [], refetch: vi.fn() }) },
      create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
      transitionStatus: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
    },
    notifications: {
      list: { useQuery: () => ({ isLoading: false, error: null, data: [], refetch: vi.fn() }) },
      acknowledge: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) },
    },
    tenant: {
      administration: { useQuery: () => ({ isLoading: false, error: null, data: state.tenantAdminData }) },
      findAssignableUser: { useQuery: () => ({ data: { id: 77, name: "Khalid", email: "khalid@example.com" }, error: null, isFetching: false }) },
      assignMember: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: state.tenantAssignmentError, isSuccess: state.tenantAssignmentSuccess }) },
      createRole: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: state.tenantRoleError, isSuccess: state.tenantRoleSuccess }) },
      updateRole: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: state.tenantRoleUpdateError, isSuccess: state.tenantRoleUpdateSuccess }) },
      createInvitation: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: state.tenantInvitationError, data: null }) },
      assignMembershipRole: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: state.tenantExistingRoleAssignmentError, isSuccess: state.tenantExistingRoleAssignmentSuccess }) },
      revokeMembershipRole: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: state.tenantRoleRevocationError, isSuccess: state.tenantRoleRevocationSuccess }) },
      transitionMembershipStatus: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false }) },
    },
    pmo: {
      createPortfolio: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: state.pmoPortfolioError, isSuccess: state.pmoPortfolioSuccess }) },
      createProgram: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: state.pmoProgramError, isSuccess: state.pmoProgramSuccess }) },
      linkProject: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: state.pmoProjectLinkError, isSuccess: state.pmoProjectLinkSuccess }) },
      createRisk: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false }) },
      createIssue: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false }) },
      createAction: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false }) },
      transitionIssueEscalation: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: state.pmoEscalationError, isSuccess: state.pmoEscalationSuccess }) },
      transitionActionEscalation: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: state.pmoEscalationError, isSuccess: state.pmoEscalationSuccess }) },
    },
    wbs: { create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false }) } },
    activities: { create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false }) } },
    budgets: { create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false }) } },
    costs: { createActual: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false }) } },
    progress: { create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false }) } },
    controls: {
      saveEvmSnapshot: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false }) },
      captureOperationalEvmSnapshot: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false, data: null }) },
      captureProjectHealthSnapshot: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: state.projectHealthError, isSuccess: false, data: null }) },
    },
    executive: {
      createDecision: { useMutation: () => ({ mutate: vi.fn(), isPending: state.executiveMutationPending, error: null, isSuccess: false }) },
    },
  },
}));

describe("control-register dashboards", () => {
  it("يعرض نموذج إجراء PMO وسجل الإجراءات المفتوحة باللغة الإنجليزية فقط", () => {
    state.isArabic = false;
    const markup = renderToStaticMarkup(<PmoDashboard />);

    expect(markup).toContain("Register action");
    expect(markup).toContain("Create portfolio");
    expect(markup).toContain("Create program");
    expect(markup).toContain("Link project to program");
    expect(markup).toContain("Action title");
    expect(markup).toContain("Open actions");
    expect(markup).toContain("Mitigate access constraint · High");
    expect(markup).not.toContain("Closed action");
  });

  it("يعرض نصوص نموذج الإجراء والأولوية باللغة العربية", () => {
    state.isArabic = true;
    const markup = renderToStaticMarkup(<PmoDashboard />);

    expect(markup).toContain("تسجيل إجراء");
    expect(markup).toContain("عنوان الإجراء");
    expect(markup).toContain("الإجراءات المفتوحة");
    expect(markup).toContain("Mitigate access constraint · مرتفعة");
  });

  it("يعرض التصعيدات المحكومة وخطأها الموطّن باللغتين", () => {
    state.isArabic = false;
    state.pmoEscalationSuccess = true;
    let markup = renderToStaticMarkup(<PmoDashboard />);
    expect(markup).toContain("Escalation: Not escalated");
    expect(markup).toContain("Request escalation");
    expect(markup).toContain("The escalation status was updated with audit evidence.");

    state.pmoEscalationSuccess = false;
    state.pmoEscalationError = {};
    markup = renderToStaticMarkup(<PmoDashboard />);
    expect(markup).toContain("Localized error");

    state.isArabic = true;
    markup = renderToStaticMarkup(<PmoDashboard />);
    expect(markup).toContain("التصعيد: غير مصعّد");
    expect(markup).toContain("طلب تصعيد");
    expect(markup).toContain("خطأ موضّع");

    state.isArabic = false;
    state.pmoEscalationError = null;
  });

  it("يعرض نجاح وفشل إنشاء المحفظة والبرنامج باللغتين", () => {
    state.isArabic = false;
    state.pmoPortfolioSuccess = true;
    state.pmoProgramError = {};
    let markup = renderToStaticMarkup(<PmoDashboard />);
    expect(markup).toContain("The master record was created and the PMO board has been refreshed.");
    expect(markup).toContain("Localized error");

    state.isArabic = true;
    state.pmoPortfolioSuccess = false;
    state.pmoPortfolioError = {};
    state.pmoProgramError = null;
    state.pmoProgramSuccess = true;
    markup = renderToStaticMarkup(<PmoDashboard />);
    expect(markup).toContain("تم إنشاء السجل الرئيسي وتحديث لوحة PMO.");
    expect(markup).toContain("خطأ موضّع");

    state.isArabic = false;
    state.pmoPortfolioError = null;
    state.pmoProgramSuccess = false;
  });

  it("يعرض نجاح وفشل ربط المشروع بالبرنامج باللغتين", () => {
    state.isArabic = false;
    state.pmoProjectLinkSuccess = true;
    let markup = renderToStaticMarkup(<PmoDashboard />);
    expect(markup).toContain("The project relationship was updated with audit evidence.");

    state.pmoProjectLinkSuccess = false;
    state.pmoProjectLinkError = {};
    markup = renderToStaticMarkup(<PmoDashboard />);
    expect(markup).toContain("Localized error");

    expect(markup).not.toContain("خطأ موضّع");

    state.isArabic = true;
    state.pmoProjectLinkError = null;
    state.pmoProjectLinkSuccess = true;
    markup = renderToStaticMarkup(<PmoDashboard />);
    expect(markup).toContain("تم تحديث ارتباط المشروع وتسجيل الدليل التدقيقي.");

    state.pmoProjectLinkSuccess = false;
    state.pmoProjectLinkError = {};
    markup = renderToStaticMarkup(<PmoDashboard />);
    expect(markup).toContain("خطأ موضّع");
    expect(markup).toContain("ربط مشروع ببرنامج");

    state.isArabic = false;
    state.pmoProjectLinkError = null;
  });

  it("يعرض إرشاد غياب المشروع وحالة الحفظ المتخصصة للقرار التنفيذي", () => {
    state.isArabic = false;
    state.executiveData.projects = [];
    state.executiveMutationPending = true;
    const markup = renderToStaticMarkup(<ExecutiveDashboard />);

    expect(markup).toContain("Create a project in your scope first so the decision can be linked to a specific project record.");
    expect(markup).toContain("Saving decision draft…");
  });

  it("يعرض ملخص التدفق النقدي التنفيذي وارتباطه بالمشروع باللغتين", () => {
    state.isArabic = false;
    let markup = renderToStaticMarkup(<ExecutiveDashboard />);
    expect(markup).toContain("Executive cash-flow summary");
    expect(markup).toContain("Total exposure");
    expect(markup).toContain("Cash flow by portfolio");
    expect(markup).toContain("PORT-01 · Strategic Works");
    expect(markup).toContain("PRJ-01 · North Link");
    state.isArabic = true;
    markup = renderToStaticMarkup(<ExecutiveDashboard />);
    expect(markup).toContain("ملخص التدفق النقدي التنفيذي");
    expect(markup).toContain("إجمالي التعرض");
    expect(markup).toContain("التدفق حسب المحفظة");
  });

  it("يعرض نموذج النشاط وسجل الجدولة وحالة النشاط باللغتين", () => {
    state.isArabic = false;
    let markup = renderToStaticMarkup(<ProjectControls />);
    expect(markup).toContain("Activities &amp; schedule");
    expect(markup).toContain("Schedule activity");
    expect(markup).toContain("A-01 · Mobilize crew");
    expect(markup).toContain("Not started");
    expect(markup).toContain("Calculated EVM capture");
    expect(markup).toContain("Calculate and save operational snapshot");
    expect(markup).toContain("Contracts &amp; commitments");
    expect(markup).toContain("CTR-01 · Civil Works");
    expect(markup).toContain("COM-01 · Steel package");
    expect(markup).toContain("Document register");
    expect(markup).toContain("DRW-01 · Foundation drawing");
    expect(markup).toContain("Next status");
    expect(markup).toContain("Update review status");
    expect(markup).toContain("RFI register");
    expect(markup).toContain("RFI-01 · Foundation detail");
    expect(markup).toContain("Update status");
    expect(markup).toContain("NCR register");
    expect(markup).toContain("NCR-01 · Reinforcement deviation");
    expect(markup).toContain("Next status");
    expect(markup).toContain("Project health");
    expect(markup).toContain("Calculate and save health snapshot");
    expect(markup).toContain("Latest snapshot: Score 82 · Amber · Confidence: Medium");
    expect(markup).toContain("Overdue RFIs: 2");
    expect(markup).toContain("Overdue NCRs: 1");
    expect(markup).toContain("Cost performance is below the critical control threshold.");
    expect(markup).not.toContain("RAW SERVER MESSAGE");

    state.isArabic = true;
    markup = renderToStaticMarkup(<ProjectControls />);
    expect(markup).toContain("الأنشطة والجدولة");
    expect(markup).toContain("جدولة نشاط");
    expect(markup).toContain("لم يبدأ");
    expect(markup).toContain("التقاط EVM محسوب");
    expect(markup).toContain("العقود والالتزامات");
    expect(markup).toContain("سجل المستندات");
    expect(markup).toContain("الحالة التالية");
    expect(markup).toContain("تحديث حالة المراجعة");
    expect(markup).toContain("سجل طلبات المعلومات");
    expect(markup).toContain("تحديث الحالة");
    expect(markup).toContain("سجل عدم المطابقة");
    expect(markup).toContain("NCR-01 · Reinforcement deviation");
    expect(markup).toContain("الحالة التالية");
    expect(markup).toContain("صحة المشروع");
    expect(markup).toContain("أحدث لقطة: الدرجة 82 · كهرماني · الثقة: متوسطة");
    expect(markup).toContain("طلبات معلومات متأخرة: 2");
    expect(markup).toContain("حالات عدم مطابقة متأخرة: 1");
    expect(markup).toContain("مؤشر أداء التكلفة دون حد التحكم الحرج.");
  });

  it("يعرض خطأ سجل العقود والالتزامات موضّعًا باللغتين", () => {
    state.isArabic = false;
    state.contractRegisterError = {};
    let markup = renderToStaticMarkup(<ProjectControls />);
    expect(markup).toContain("Localized error");

    state.isArabic = true;
    markup = renderToStaticMarkup(<ProjectControls />);
    expect(markup).toContain("خطأ موضّع");
    state.contractRegisterError = null;
    state.isArabic = false;
  });

  it("يعرض خطأ سجل NCR موضّعًا باللغتين", () => {
    state.isArabic = false;
    state.ncrError = {};
    let markup = renderToStaticMarkup(<ProjectControls />);
    expect(markup).toContain("Localized error");

    state.isArabic = true;
    markup = renderToStaticMarkup(<ProjectControls />);
    expect(markup).toContain("خطأ موضّع");
    state.ncrError = null;
    state.isArabic = false;
  });

  it("يعرض خطأ التقاط صحة المشروع موضّعًا باللغتين", () => {
    state.isArabic = false;
    state.projectHealthError = {};
    let markup = renderToStaticMarkup(<ProjectControls />);
    expect(markup).toContain("Localized error");

    state.isArabic = true;
    markup = renderToStaticMarkup(<ProjectControls />);
    expect(markup).toContain("خطأ موضّع");
    state.projectHealthError = null;
    state.isArabic = false;
  });

  it("يبقي مدخلات العقد والالتزام عند فشل الحفظ ولا يصفرها إلا عند النجاح", () => {
    const contractDraft = { code: "CTR-02", title: "Access road", counterparty: "Works Co", contractValue: "1500", currency: "SAR" };
    const commitmentDraft = { contractId: "contract-1", code: "COM-02", description: "Concrete package", amount: "375", currency: "SAR" };

    expect(contractFormAfterResponse(contractDraft, false)).toEqual(contractDraft);
    expect(commitmentFormAfterResponse(commitmentDraft, false)).toEqual(commitmentDraft);
    expect(contractFormAfterResponse(contractDraft, true).code).toBe("");
    expect(commitmentFormAfterResponse(commitmentDraft, true).code).toBe("");
  });

  it("يعرض خطأ سجل المستندات موضّعًا باللغتين", () => {
    state.isArabic = false;
    state.documentRegisterError = {};
    let markup = renderToStaticMarkup(<ProjectControls />);
    expect(markup).toContain("Localized error");

    state.isArabic = true;
    markup = renderToStaticMarkup(<ProjectControls />);
    expect(markup).toContain("خطأ موضّع");
    state.documentRegisterError = null;
    state.isArabic = false;
  });

  it("يعرض خطأ انتقال مراجعة المستند موضّعًا باللغتين", () => {
    state.isArabic = false;
    state.documentTransitionError = {};
    let markup = renderToStaticMarkup(<ProjectControls />);
    expect(markup).toContain("Localized error");

    state.isArabic = true;
    markup = renderToStaticMarkup(<ProjectControls />);
    expect(markup).toContain("خطأ موضّع");
    state.documentTransitionError = null;
    state.isArabic = false;
  });

  it("يعرض اختيار المستخدم وحالات نجاح وفشل الإسناد باللغتين", () => {
    state.isArabic = false;
    state.tenantAssignmentSuccess = false;
    state.tenantAssignmentError = null;
    let markup = renderToStaticMarkup(<TenantAdministration />);
    expect(markup).toContain("Organization members &amp; roles");
    expect(markup).toContain("Assign an existing member");
    expect(markup).toContain("Existing user email");
    expect(markup).toContain("Find user");
    expect(markup).toContain("Select user");
    expect(markup).toContain("Amina");
    expect(markup).toContain("PMO Manager · Scope: Airport Terminal");

    state.tenantAssignmentSuccess = true;
    markup = renderToStaticMarkup(<TenantAdministration />);
    expect(markup).toContain("The invited membership and role assignment were created.");

    state.tenantAssignmentSuccess = false;
    state.tenantAssignmentError = {};
    markup = renderToStaticMarkup(<TenantAdministration />);
    expect(markup).toContain("Localized error");

    state.isArabic = true;
    state.tenantAssignmentError = null;
    markup = renderToStaticMarkup(<TenantAdministration />);
    expect(markup).toContain("أعضاء وأدوار المؤسسة");
    expect(markup).toContain("إسناد عضو موجود");
    expect(markup).toContain("بريد المستخدم الموجود");
    expect(markup).toContain("التحقق من المستخدم");
    expect(markup).toContain("النطاق: Airport Terminal");
    state.isArabic = false;
  });

  it("يعرض نموذج الدور المخصص وحالتي نجاح وفشل إنشائه باللغتين", () => {
    state.isArabic = false;
    state.tenantRoleSuccess = false;
    state.tenantRoleError = null;
    let markup = renderToStaticMarkup(<TenantAdministration />);
    expect(markup).toContain("Create a custom role");
    expect(markup).toContain("Role code");
    expect(markup).toContain("Choose at least one permission");

    state.tenantRoleSuccess = true;
    markup = renderToStaticMarkup(<TenantAdministration />);
    expect(markup).toContain("The custom role and its permissions were created.");

    state.tenantRoleSuccess = false;
    state.tenantRoleError = {};
    markup = renderToStaticMarkup(<TenantAdministration />);
    expect(markup).toContain("Localized error");

    state.tenantRoleError = null;
    state.isArabic = true;
    markup = renderToStaticMarkup(<TenantAdministration />);
    expect(markup).toContain("إنشاء دور مخصص");
    expect(markup).toContain("رمز الدور");
    expect(markup).toContain("اختر صلاحية واحدة على الأقل");
    state.isArabic = false;
  });

  it("يعرض تعيين الدور لعضوية قائمة وحالتي نجاح وفشل الإسناد باللغتين", () => {
    state.isArabic = false;
    state.tenantExistingRoleAssignmentSuccess = false;
    state.tenantExistingRoleAssignmentError = null;
    let markup = renderToStaticMarkup(<TenantAdministration />);
    expect(markup).toContain("Assign a role to an existing membership");
    expect(markup).toContain("Select a member");
    expect(markup).toContain("Select a role to assign");

    state.tenantExistingRoleAssignmentSuccess = true;
    markup = renderToStaticMarkup(<TenantAdministration />);
    expect(markup).toContain("The role and scope were assigned to the membership with audit evidence.");

    state.tenantExistingRoleAssignmentSuccess = false;
    state.tenantExistingRoleAssignmentError = {};
    markup = renderToStaticMarkup(<TenantAdministration />);
    expect(markup).toContain("Localized error");

    state.tenantExistingRoleAssignmentError = null;
    state.isArabic = true;
    markup = renderToStaticMarkup(<TenantAdministration />);
    expect(markup).toContain("إسناد دور لعضوية قائمة");
    expect(markup).toContain("اختر عضوًا");
    state.isArabic = false;
  });

  it("يعرض إجراء إلغاء الدور وحالتي نجاح وفشل الإلغاء باللغتين", () => {
    state.isArabic = false;
    state.tenantRoleRevocationSuccess = false;
    state.tenantRoleRevocationError = null;
    let markup = renderToStaticMarkup(<TenantAdministration />);
    expect(markup).toContain("Revoke role assignment");

    state.tenantRoleRevocationSuccess = true;
    markup = renderToStaticMarkup(<TenantAdministration />);
    expect(markup).toContain("The role assignment was revoked with audit evidence.");

    state.tenantRoleRevocationSuccess = false;
    state.tenantRoleRevocationError = {};
    markup = renderToStaticMarkup(<TenantAdministration />);
    expect(markup).toContain("Localized error");

    state.tenantRoleRevocationError = null;
    state.isArabic = true;
    markup = renderToStaticMarkup(<TenantAdministration />);
    expect(markup).toContain("إلغاء إسناد الدور");
    state.isArabic = false;
  });

  it("يعرض تحديث الدور المخصص وحالتي نجاح وفشل التحديث باللغتين", () => {
    state.isArabic = false;
    state.tenantRoleUpdateSuccess = false;
    state.tenantRoleUpdateError = null;
    let markup = renderToStaticMarkup(<TenantAdministration />);
    expect(markup).toContain("Update a custom role");
    expect(markup).toContain("Select a custom role");

    state.tenantRoleUpdateSuccess = true;
    markup = renderToStaticMarkup(<TenantAdministration />);
    expect(markup).toContain("The role definition and permissions were updated with audit evidence.");

    state.tenantRoleUpdateSuccess = false;
    state.tenantRoleUpdateError = {};
    markup = renderToStaticMarkup(<TenantAdministration />);
    expect(markup).toContain("Localized error");

    state.tenantRoleUpdateError = null;
    state.isArabic = true;
    markup = renderToStaticMarkup(<TenantAdministration />);
    expect(markup).toContain("تحديث دور مخصص");
    expect(markup).toContain("اختر دورًا مخصصًا");
    state.isArabic = false;
  });

  it("يعرض اسم نطاق الدور المملوك للمستأجر بدل معرّف النطاق الخام", () => {
    const markup = renderToStaticMarkup(<TenantAdministration />);
    expect(markup).toContain("Airport Terminal");
    expect(markup).not.toContain("project-opaque-id");
  });

  it("يعرض نموذج دعوة العضوية باللغتين وحالة الخطأ الآمنة", () => {
    state.isArabic = false;
    state.tenantInvitationError = null;
    let markup = renderToStaticMarkup(<TenantAdministration />);
    expect(markup).toContain("Invite a new member");
    expect(markup).toContain("Create invitation link");

    state.tenantInvitationError = {};
    markup = renderToStaticMarkup(<TenantAdministration />);
    expect(markup).toContain("Localized error");

    state.tenantInvitationError = null;
    state.isArabic = true;
    markup = renderToStaticMarkup(<TenantAdministration />);
    expect(markup).toContain("دعوة عضو جديد");
    expect(markup).toContain("إنشاء رابط الدعوة");
    state.isArabic = false;
  });

  it("يعرض خطأ سجل RFI موضّعًا باللغتين", () => {
    state.isArabic = false;
    state.rfiError = {};
    let markup = renderToStaticMarkup(<ProjectControls />);
    expect(markup).toContain("Localized error");
    state.isArabic = true;
    markup = renderToStaticMarkup(<ProjectControls />);
    expect(markup).toContain("خطأ موضّع");
    state.rfiError = null;
    state.isArabic = false;
  });
  it("يعرض تحكم انتقال دورة الحياة وحالات النجاح والخطأ باللغتين", () => {
    state.isArabic = false;
    let markup = renderToStaticMarkup(<ProjectRegistry />);
    expect(markup).toContain("Lifecycle");
    expect(markup).toContain("Choose next stage");
    expect(markup).toContain('value="design"');
    expect(markup).toContain('value="execution"');
    expect(markup).not.toContain('value="opportunity"');
    expect(lifecycleFeedbackTargetsProject("project-1", "project-1")).toBe(true);
    expect(lifecycleFeedbackTargetsProject("project-1", "project-2")).toBe(false);

    state.isArabic = true;
    markup = renderToStaticMarkup(<ProjectRegistry />);
    expect(markup).toContain("دورة الحياة");
    expect(markup).toContain("اختر المرحلة التالية");
    state.isArabic = false;
  });
});
