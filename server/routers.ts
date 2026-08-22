import { z } from "zod";
import { productCodes } from "../drizzle/schema";
import { acceptMembershipInvitation, acknowledgeInternalNotification, addProjectDocumentVersion, assignTenantMember, assignTenantMembershipRole, captureOperationalEvmSnapshot, captureProjectHealthSnapshot, confirmAndImportData, createAction, createActivity, createAndAnalyzeDataImport, createBudgetLine, createChangeRequestForTenant, createClaimForTenant, createCommitmentForTenant, createContractForTenant, createControlRecordLinkForTenant, createCostEntry, createDataExport, createDecision, createFieldReportForTenant, createHseObservationForTenant, createIssue, createMaterialMasterForTenant, createMasterPlanForTenant, createMasterPlanSpatialEntityForTenant, createMasterPlanVersionForTenant, createMembershipInvitation, createNcrForTenant, createPortfolioForTenant, createProgramForTenant, createProgressEntry, createProjectDocumentWithVersion, createProjectForTenant, createProjectResourceForTenant, createPurchaseOrderForTenant, createQualityInspectionForTenant, createRfiForTenant, createRisk, createTenantForUser, createTenantRole, createWbsItem, findAssignableTenantUser, generateProjectAdvisoryForTenant, getChangeRequestsForTenant, getClaimsForTenant, getCommercialCatalogForAdministrator, getContractsCommitmentsForTenant, getControlRecordLinksForTenant, getDataImportDetailForTenant, getDataImportsForTenant, getExecutiveDashboard, getFieldReportsForTenant, getHseObservationsForTenant, getInternalNotificationsForTenant, getMaterialCatalogForTenant, getMasterPlansForTenant, getNcrsForTenant, getPmoDashboard, getProjectControlsForTenant, getProjectDocumentsForTenant, getProjectResourcesForTenant, getPurchaseOrdersForTenant, getQualityInspectionsForTenant, getRfisForTenant, getTenantAccessSnapshot, getTenantAdministration, getTenantLicenseForManager, getTenantNavigationForUser, linkProjectToProgramForTenant, listProjectsForTenant, listTenantsForUser, provisionTenantLicense, revokeTenantMembershipRole, saveEvmSnapshot, saveProjectMaterialOverrideForTenant, setTenantLicenseFeatureOverride, transitionActionEscalation, transitionChangeRequestStatus, transitionClaimStatus, transitionFieldReportStatus, transitionHseObservationStatus, transitionIssueEscalation, transitionNcrStatus, transitionProjectDocumentStatus, transitionProjectLifecycle, transitionPurchaseOrderStatus, transitionQualityInspectionStatus, transitionRfiStatus, transitionTenantLicenseStatus, transitionTenantMembershipStatus, updateProjectResourceAllocationForTenant, updateTenantRole } from "./db";
import { applyMasterPlanMappingFile, importMasterPlanSpatialEntitiesFromFile } from "./db";
import { createMasterPlanSnapshotForTenant, getMasterPlanSnapshotsForTenant, getMasterPlanVisualizationRulesForTenant, saveMasterPlanVisualizationRuleForTenant } from "./db";
import { reanalyzeDataImport } from "./db";
import { createMaterialIssueForTenant, createProjectWarehouseForTenant, getProjectWarehousesForTenant, recordWarehouseInventoryTransactionForTenant, transferWarehouseInventoryForTenant } from "./db";
import { createProcurementRequisitionForTenant, createSupplierForTenant, getProcurementRegisterForTenant, linkProcurementRequisitionPurchaseOrderForTenant, transitionProcurementRequisitionForTenant } from "./db";
import { createGoodsReceiptNoteForTenant, getGoodsReceiptNotesForTenant } from "./db";
import { confirmManualTenantPayment, createSelfServiceTenant, createTenantPayment, getPublicCommercialPlans, getTenantBillingForManager, issueTenantInvoice } from "./db";
import { claimSupportTicket, createKnowledgeArticleForTenant, createSupportTicketForTenant, getSupportTicketForTenant, listApprovedSupportSourceDocuments, listKnowledgeArticlesForTenant, listSupportTicketsForTenant, replyToSupportTicket, transitionSupportTicket } from "./db";
import { reportDashboardSectionIssueForTenant } from "./db";
import { allocateApprovedPayrollCostForTenant, archiveEmployeeForTenant, createEmployeeAttendanceForTenant, createEmployeeForTenant, createEmployeeTimeEntryForTenant, createEmploymentContractForTenant, createPayrollRunForTenant, getEmployeeAttendanceForTenant, getEmployeeIdentityForTenant, getEmployeeTimeEntriesForTenant, getEmployeesForTenant, getEmploymentContractsForTenant, getPayrollAllocationOptionsForTenant, getPayrollAllocationProjectsForTenant, getPayrollCapabilitiesForTenant, getPayrollRunDetailsForTenant, getPayrollRunsForTenant, getSalaryStructureForTenant, saveSalaryStructureForTenant, transitionEmployeeAttendanceForTenant, transitionEmployeeTimeEntryForTenant, transitionPayrollRunForTenant } from "./db";
import { createEmployeeAssignmentForTenant, getEmployeeAssignmentOptionsForTenant, getEmployeeAssignmentsForTenant } from "./db";
import { createEmployeePerformanceExclusionForTenant, createEmployeePerformanceObjectionForTenant, getEmployeePerformanceForTenant, transitionEmployeePerformanceObjectionForTenant } from "./db";
import { assertTenantAccess } from "./domain/authorization";
import { calculateEvm } from "./domain/evm";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";

const scopeSchema = z.object({
  type: z.enum(["company", "portfolio", "program", "project"]),
  id: z.string().uuid().optional(),
});

const masterPlanVisualizationRuleSchema = z.discriminatedUnion("metric", [
  z.object({ metric: z.literal("progress"), rules: z.object({ lowMax: z.number().min(0).max(100), mediumMax: z.number().min(0).max(100), lowColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/), mediumColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/), highColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/) }).strict().refine(value => value.mediumMax > value.lowMax, { message: "PROJECT_OS_MASTER_PLAN_RULES_INVALID" }) }),
  z.object({ metric: z.literal("status"), rules: z.object({ notStartedColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/), inProgressColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/), completedColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/), blockedColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/) }).strict() }),
  z.object({ metric: z.literal("cost"), rules: z.object({ favorableMax: z.number().min(-100).max(10_000), warningMax: z.number().min(-100).max(10_000), favorableColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/), warningColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/), unfavorableColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/) }).strict().refine(value => value.warningMax > value.favorableMax, { message: "PROJECT_OS_MASTER_PLAN_RULES_INVALID" }) }),
]);

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),
  access: router({
    check: protectedProcedure
      .input(z.object({
        tenantId: z.string().uuid(),
        product: z.enum(productCodes),
        permission: z.string().min(3).max(120),
        scope: scopeSchema.optional(),
      }))
      .query(async ({ ctx, input }) => {
        const snapshot = await getTenantAccessSnapshot({ userId: ctx.user.id, tenantId: input.tenantId });
        if (!snapshot) return { allowed: false as const, reason: "Membership was not found for this tenant." };
        assertTenantAccess(snapshot, input);
        return { allowed: true as const };
      }),
  }),
  navigation: router({
    get: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid().optional() })).query(({ ctx, input }) => getTenantNavigationForUser({ userId: ctx.user.id, ...input })),
  }),
  notifications: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => getInternalNotificationsForTenant({ userId: ctx.user.id, ...input })),
    acknowledge: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), notificationId: z.string().uuid() })).mutation(({ ctx, input }) => acknowledgeInternalNotification({ userId: ctx.user.id, ...input })),
  }),
  controlLinks: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getControlRecordLinksForTenant({ userId: ctx.user.id, ...input })),
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), sourceType: z.enum(["risk", "issue", "action", "decision"]), sourceId: z.string().uuid(), targetType: z.enum(["risk", "issue", "action", "decision", "rfi", "ncr"]), targetId: z.string().uuid() })).mutation(({ ctx, input }) => createControlRecordLinkForTenant({ userId: ctx.user.id, ...input })),
  }),
  dataImports: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid().optional() })).query(({ ctx, input }) => getDataImportsForTenant({ userId: ctx.user.id, ...input })),
    detail: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), importId: z.string().uuid() })).query(({ ctx, input }) => getDataImportDetailForTenant({ userId: ctx.user.id, ...input })),
    analyze: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), moduleCode: z.enum(["wbs", "budget", "contracts", "materials", "schedule"]), fileName: z.string().trim().min(1).max(255), sourceFormat: z.enum(["xlsx", "csv", "xer"]), base64: z.string().min(1).max(14_000_000), duplicateMode: z.enum(["create_only", "update_existing", "upsert", "skip_duplicates", "fail_on_duplicate"]).optional(), mappingOverride: z.record(z.string().min(1).max(64), z.string().min(1).max(128)).optional() }).superRefine((value, context) => { if (value.moduleCode === "schedule" && value.sourceFormat !== "xlsx" && value.sourceFormat !== "xer") context.addIssue({ code: "custom", message: "PROJECT_OS_SCHEDULE_FORMAT_INVALID" }); if (value.moduleCode !== "schedule" && value.sourceFormat === "xer") context.addIssue({ code: "custom", message: "PROJECT_OS_IMPORT_FORMAT_INVALID" }); if (value.mappingOverride && Object.keys(value.mappingOverride).length > 6) context.addIssue({ code: "custom", message: "PROJECT_OS_IMPORT_MAPPING_INVALID" }); })).mutation(({ ctx, input }) => createAndAnalyzeDataImport({ userId: ctx.user.id, ...input })),
    reanalyze: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), importId: z.string().uuid(), mappingOverride: z.record(z.string().min(1).max(64), z.string().min(1).max(128)) }).refine(value => Object.keys(value.mappingOverride).length <= 6, { message: "PROJECT_OS_IMPORT_MAPPING_INVALID" })).mutation(({ ctx, input }) => reanalyzeDataImport({ userId: ctx.user.id, ...input })),
    confirm: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), importId: z.string().uuid() })).mutation(({ ctx, input }) => confirmAndImportData({ userId: ctx.user.id, ...input })),
    export: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), moduleCode: z.enum(["wbs", "budget", "activities"]), format: z.enum(["xlsx", "csv"]), locale: z.enum(["ar", "en"]) })).mutation(({ ctx, input }) => createDataExport({ userId: ctx.user.id, ...input })),
  }),
  licensing: router({
    catalog: protectedProcedure.query(({ ctx }) => getCommercialCatalogForAdministrator({ userId: ctx.user.id })),
    tenantLicense: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => getTenantLicenseForManager({ userId: ctx.user.id, ...input })),
    provision: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), planCode: z.string().trim().min(3).max(80), status: z.enum(["trialing", "active", "past_due", "suspended", "cancelled", "expired", "grace_period"]), seats: z.number().int().min(1).max(100000), priceAmount: z.number().min(0).optional(), discountAmount: z.number().min(0).optional(), startsAt: z.date().optional(), endsAt: z.date().optional(), trialEndsAt: z.date().optional(), graceEndsAt: z.date().optional(), manualActivation: z.boolean() })).mutation(({ ctx, input }) => provisionTenantLicense({ actorUserId: ctx.user.id, ...input })),
    transition: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), licenseId: z.string().uuid(), nextStatus: z.enum(["trialing", "active", "past_due", "suspended", "cancelled", "expired", "grace_period"]) })).mutation(({ ctx, input }) => transitionTenantLicenseStatus({ actorUserId: ctx.user.id, ...input })),
    setFeatureOverride: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), licenseId: z.string().uuid(), featureCode: z.string().trim().min(3).max(120), active: z.boolean(), limitValue: z.number().int().min(0).optional() })).mutation(({ ctx, input }) => setTenantLicenseFeatureOverride({ actorUserId: ctx.user.id, ...input })),
  }),
  selfService: router({
    plans: protectedProcedure.query(() => getPublicCommercialPlans()),
    signup: protectedProcedure.input(z.object({ legalName: z.string().trim().min(2).max(255), slug: z.string().trim().min(3).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/), planCode: z.string().trim().min(3).max(80), seats: z.number().int().min(1).max(100000) })).mutation(({ ctx, input }) => createSelfServiceTenant({ userId: ctx.user.id, ...input })),
  }),
  billing: router({
    register: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => getTenantBillingForManager({ userId: ctx.user.id, ...input })),
    issueInvoice: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), subscriptionId: z.string().uuid(), subtotalAmount: z.number().finite().min(0), sellerName: z.string().trim().min(2).max(255), sellerTaxNumber: z.string().trim().min(2).max(80), buyerName: z.string().trim().min(2).max(255), buyerTaxNumber: z.string().trim().min(2).max(80), currency: z.string().trim().regex(/^[A-Z]{3}$/).optional() })).mutation(({ ctx, input }) => issueTenantInvoice({ userId: ctx.user.id, ...input })),
    createPayment: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), subscriptionId: z.string().uuid(), provider: z.enum(["manual", "mock"]), operation: z.enum(["create", "renew", "cancel", "refund"]), amount: z.number().finite().min(0), currency: z.string().trim().regex(/^[A-Z]{3}$/).optional(), invoiceId: z.string().uuid().optional() })).mutation(({ ctx, input }) => createTenantPayment({ userId: ctx.user.id, ...input })),
    confirmManualPayment: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), paymentId: z.string().uuid() })).mutation(({ ctx, input }) => confirmManualTenantPayment({ actorUserId: ctx.user.id, ...input })),
  }),
  support: router({
    tickets: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => listSupportTicketsForTenant({ userId: ctx.user.id, ...input })),
    ticket: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), ticketId: z.string().uuid() })).query(({ ctx, input }) => getSupportTicketForTenant({ userId: ctx.user.id, ...input })),
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), subject: z.string().trim().min(3).max(255), category: z.enum(["technical", "billing", "account", "general"]), priority: z.enum(["low", "normal", "high", "urgent"]), body: z.string().trim().min(3).max(8000), tags: z.array(z.string().trim().min(1).max(40).regex(/^[a-zA-Z0-9:_-]+$/)).max(10).optional() })).mutation(({ ctx, input }) => createSupportTicketForTenant({ userId: ctx.user.id, ...input })),
    reply: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), ticketId: z.string().uuid(), body: z.string().trim().min(3).max(8000) })).mutation(({ ctx, input }) => replyToSupportTicket({ userId: ctx.user.id, ...input })),
    transition: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), ticketId: z.string().uuid(), status: z.enum(["open", "waiting_customer", "in_progress", "resolved", "closed"]), escalationStatus: z.enum(["none", "requested", "escalated"]).optional(), ownerUserId: z.number().int().positive().nullable().optional(), tags: z.array(z.string().trim().min(1).max(40).regex(/^[a-zA-Z0-9:_-]+$/)).max(10).optional() })).mutation(({ ctx, input }) => transitionSupportTicket({ userId: ctx.user.id, ...input })),
    claim: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), ticketId: z.string().uuid() })).mutation(({ ctx, input }) => claimSupportTicket({ userId: ctx.user.id, ...input })),
    knowledge: router({
      list: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => listKnowledgeArticlesForTenant({ userId: ctx.user.id, ...input })),
      sources: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => listApprovedSupportSourceDocuments({ userId: ctx.user.id, ...input })),
      create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), sourceDocumentId: z.string().uuid(), title: z.string().trim().min(3).max(255), content: z.string().trim().min(3).max(12000), publish: z.boolean() })).mutation(({ ctx, input }) => createKnowledgeArticleForTenant({ userId: ctx.user.id, ...input })),
    }),
  }),
  masterPlans: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getMasterPlansForTenant({ userId: ctx.user.id, ...input })),
    visualizationRules: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getMasterPlanVisualizationRulesForTenant({ userId: ctx.user.id, ...input })),
    saveVisualizationRule: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() }).and(masterPlanVisualizationRuleSchema)).mutation(({ ctx, input }) => saveMasterPlanVisualizationRuleForTenant({ userId: ctx.user.id, ...input })),
    listSnapshots: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), masterPlanVersionId: z.string().uuid().optional() })).query(({ ctx, input }) => getMasterPlanSnapshotsForTenant({ userId: ctx.user.id, ...input })),
    createSnapshot: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), masterPlanVersionId: z.string().uuid(), label: z.string().trim().min(1).max(160), metric: z.enum(["progress", "status", "cost", "risk", "quality", "hse", "production", "custom"]), filters: z.object({ status: z.array(z.enum(["not_started", "in_progress", "completed", "blocked"])).max(4).optional(), entityTypes: z.array(z.enum(["block", "building", "zone", "unit", "area"])).max(5).optional(), codes: z.array(z.string().trim().min(1).max(120)).max(100).optional(), search: z.string().trim().max(120).optional(), wbsItemId: z.string().uuid().optional(), activityId: z.string().uuid().optional() }).strict(), viewport: z.object({ x: z.number().finite().min(-30).max(30), y: z.number().finite().min(-30).max(30), zoom: z.number().finite().min(0.25).max(10) }).strict(), layers: z.array(z.string().trim().min(1).max(80)).max(20) })).mutation(({ ctx, input }) => createMasterPlanSnapshotForTenant({ userId: ctx.user.id, ...input })),
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), code: z.string().trim().min(1).max(80), title: z.string().trim().min(1).max(255), description: z.string().trim().max(5000).optional(), sourceFileName: z.string().trim().min(1).max(255).optional(), sourceMimeType: z.string().trim().min(1).max(120).optional(), sourceContentBase64: z.string().min(4).max(14_000_000).optional() })).mutation(({ ctx, input }) => createMasterPlanForTenant({ userId: ctx.user.id, ...input })),
    createVersion: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), masterPlanId: z.string().uuid(), versionKind: z.enum(["revision", "updated"]), description: z.string().trim().max(5000).optional(), changeSummary: z.string().trim().max(5000).optional(), sourceFileName: z.string().trim().min(1).max(255).optional(), sourceMimeType: z.string().trim().min(1).max(120).optional(), sourceContentBase64: z.string().min(4).max(14_000_000).optional() })).mutation(({ ctx, input }) => createMasterPlanVersionForTenant({ userId: ctx.user.id, ...input })),
    createSpatialEntity: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), masterPlanVersionId: z.string().uuid(), parentEntityId: z.string().uuid().optional(), code: z.string().trim().min(1).max(120), name: z.string().trim().min(1).max(255), entityType: z.enum(["block", "building", "zone", "unit", "area"]), geometry: z.object({ x: z.number().finite(), y: z.number().finite(), width: z.number().finite(), height: z.number().finite() }), status: z.enum(["not_started", "in_progress", "completed", "blocked"]), progressPercent: z.number().min(0).max(100), plannedValue: z.number().min(0).optional(), actualValue: z.number().min(0).optional(), forecastValue: z.number().min(0).optional(), wbsItemId: z.string().uuid().optional(), activityId: z.string().uuid().optional() })).mutation(({ ctx, input }) => createMasterPlanSpatialEntityForTenant({ userId: ctx.user.id, ...input })),
    applyExcelMapping: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), masterPlanVersionId: z.string().uuid(), format: z.enum(["xlsx", "csv"]), base64: z.string().min(1).max(14_000_000) })).mutation(({ ctx, input }) => applyMasterPlanMappingFile({ userId: ctx.user.id, ...input })),
    importSpatialEntities: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), masterPlanVersionId: z.string().uuid(), format: z.enum(["xlsx", "csv"]), base64: z.string().min(1).max(14_000_000) })).mutation(({ ctx, input }) => importMasterPlanSpatialEntitiesFromFile({ userId: ctx.user.id, ...input })),
  }),
  tenant: router({
    mine: protectedProcedure.query(({ ctx }) => listTenantsForUser(ctx.user.id)),
    administration: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => getTenantAdministration({ userId: ctx.user.id, ...input })),
    findAssignableUser: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), email: z.string().trim().email().max(320) })).query(({ ctx, input }) => findAssignableTenantUser({ userId: ctx.user.id, ...input })),
    createRole: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), code: z.string().trim().min(3).max(80).regex(/^[A-Za-z0-9_ -]+$/), name: z.string().trim().min(2).max(160), productCode: z.enum(productCodes), permissionCodes: z.array(z.string().trim().min(3).max(120)).min(1).max(30) })).mutation(({ ctx, input }) => createTenantRole({ actorUserId: ctx.user.id, ...input })),
    updateRole: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), roleId: z.string().uuid(), name: z.string().trim().min(2).max(160), permissionCodes: z.array(z.string().trim().min(3).max(120)).min(1).max(30) })).mutation(({ ctx, input }) => updateTenantRole({ actorUserId: ctx.user.id, ...input })),
    createInvitation: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), email: z.string().trim().email().max(320), roleId: z.string().uuid(), scopeType: z.enum(["company", "portfolio", "program", "project"]), scopeId: z.string().uuid().optional() })).mutation(({ ctx, input }) => createMembershipInvitation({ actorUserId: ctx.user.id, ...input })),
    acceptInvitation: protectedProcedure.input(z.object({ inviteToken: z.string().min(32).max(256) })).mutation(({ ctx, input }) => acceptMembershipInvitation({ userId: ctx.user.id, ...input })),
    assignMembershipRole: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), membershipId: z.string().uuid(), roleId: z.string().uuid(), scopeType: z.enum(["company", "portfolio", "program", "project"]), scopeId: z.string().uuid().optional() })).mutation(({ ctx, input }) => assignTenantMembershipRole({ actorUserId: ctx.user.id, ...input })),
    revokeMembershipRole: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), assignmentId: z.string().uuid() })).mutation(({ ctx, input }) => revokeTenantMembershipRole({ actorUserId: ctx.user.id, ...input })),
    transitionMembershipStatus: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), membershipId: z.string().uuid(), nextStatus: z.enum(["active", "suspended"]) })).mutation(({ ctx, input }) => transitionTenantMembershipStatus({ actorUserId: ctx.user.id, ...input })),
    assignMember: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), targetUserId: z.number().int().positive(), roleId: z.string().uuid(), scopeType: z.enum(["company", "portfolio", "program", "project"]), scopeId: z.string().uuid().optional() })).mutation(({ ctx, input }) => assignTenantMember({ actorUserId: ctx.user.id, ...input })),
    create: protectedProcedure
      .input(z.object({
        legalName: z.string().trim().min(2).max(255),
        slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(120),
        packageCode: z.enum(["EXECUTIVE", "PMO", "PROJECT", "EXECUTIVE + PMO", "PMO + PROJECT", "EXECUTIVE + PROJECT", "ALL-IN-ONE"]),
      }))
      .mutation(({ ctx, input }) => createTenantForUser({ ...input, userId: ctx.user.id })),
  }),
  controls: router({
    calculateEvm: protectedProcedure
      .input(z.object({
        pv: z.number().finite().nonnegative(),
        ev: z.number().finite().nonnegative(),
        ac: z.number().finite().nonnegative(),
        bac: z.number().finite().nonnegative(),
        eacMethod: z.enum(["bac_over_cpi", "ac_plus_remaining", "ac_plus_remaining_over_cpi_spi", "manual"]),
        manualEac: z.number().finite().nonnegative().optional(),
      }))
      .query(({ input }) => calculateEvm(input)),
    saveEvmSnapshot: protectedProcedure
      .input(z.object({
        tenantId: z.string().uuid(), projectId: z.string().uuid(), periodAt: z.date(),
        pv: z.number().finite().nonnegative(), ev: z.number().finite().nonnegative(), ac: z.number().finite().nonnegative(), bac: z.number().finite().nonnegative(),
        eacMethod: z.enum(["bac_over_cpi", "ac_plus_remaining", "ac_plus_remaining_over_cpi_spi", "manual"]), manualEac: z.number().finite().nonnegative().optional(),
      }))
      .mutation(({ ctx, input }) => saveEvmSnapshot({ userId: ctx.user.id, ...input })),
    captureOperationalEvmSnapshot: protectedProcedure
      .input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), periodAt: z.date(), eacMethod: z.enum(["bac_over_cpi", "ac_plus_remaining", "ac_plus_remaining_over_cpi_spi"]) }))
      .mutation(({ ctx, input }) => captureOperationalEvmSnapshot({ userId: ctx.user.id, ...input })),
    captureProjectHealthSnapshot: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), periodAt: z.date() })).mutation(({ ctx, input }) => captureProjectHealthSnapshot({ userId: ctx.user.id, ...input })),
  }),
  dashboards: router({
    executive: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => getExecutiveDashboard({ userId: ctx.user.id, ...input })),
    executiveOverview: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(async ({ ctx, input }) => {
      const dashboard = await getExecutiveDashboard({ userId: ctx.user.id, ...input });
      return { totals: dashboard.totals, projects: dashboard.projects, decisions: dashboard.decisions };
    }),
    executiveMetrics: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(async ({ ctx, input }) => {
      const dashboard = await getExecutiveDashboard({ userId: ctx.user.id, ...input });
      return { totals: dashboard.totals };
    }),
    executiveProjects: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(async ({ ctx, input }) => {
      const dashboard = await getExecutiveDashboard({ userId: ctx.user.id, ...input });
      return { projects: dashboard.projects };
    }),
    executiveDecisions: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(async ({ ctx, input }) => {
      const dashboard = await getExecutiveDashboard({ userId: ctx.user.id, ...input });
      return { decisions: dashboard.decisions };
    }),
    executiveCashFlow: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(async ({ ctx, input }) => {
      const dashboard = await getExecutiveDashboard({ userId: ctx.user.id, ...input });
      return { cashFlow: dashboard.cashFlow, cashFlowByProject: dashboard.cashFlowByProject, cashFlowByPortfolio: dashboard.cashFlowByPortfolio };
    }),
    pmo: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => getPmoDashboard({ userId: ctx.user.id, ...input })),
    pmoRegisters: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(async ({ ctx, input }) => {
      const dashboard = await getPmoDashboard({ userId: ctx.user.id, ...input });
      return { portfolios: dashboard.portfolios, programs: dashboard.programs, projects: dashboard.projects, risks: dashboard.risks, issues: dashboard.issues, actions: dashboard.actions, decisions: dashboard.decisions, rfis: dashboard.rfis, ncrs: dashboard.ncrs };
    }),
    pmoPortfolioSetup: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(async ({ ctx, input }) => {
      const dashboard = await getPmoDashboard({ userId: ctx.user.id, ...input });
      return { portfolios: dashboard.portfolios, programs: dashboard.programs, projects: dashboard.projects, decisions: dashboard.decisions, rfis: dashboard.rfis, ncrs: dashboard.ncrs };
    }),
    pmoRisks: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(async ({ ctx, input }) => ({ risks: (await getPmoDashboard({ userId: ctx.user.id, ...input })).risks })),
    pmoIssues: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(async ({ ctx, input }) => ({ issues: (await getPmoDashboard({ userId: ctx.user.id, ...input })).issues })),
    pmoActions: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(async ({ ctx, input }) => ({ actions: (await getPmoDashboard({ userId: ctx.user.id, ...input })).actions })),
    pmoPlanning: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(async ({ ctx, input }) => {
      const dashboard = await getPmoDashboard({ userId: ctx.user.id, ...input });
      return { planningOverview: dashboard.planningOverview };
    }),
    pmoTodayExceptions: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(async ({ ctx, input }) => {
      const dashboard = await getPmoDashboard({ userId: ctx.user.id, ...input });
      return { todayExceptions: dashboard.todayExceptions };
    }),
    reportSectionIssue: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), product: z.enum(["EXECUTIVE", "PMO", "PROJECT"]), sectionKey: z.string().trim().min(2).max(80).regex(/^[a-z0-9:_-]+$/), state: z.enum(["error", "partial"]), projectId: z.string().uuid().optional() }).superRefine((value, context) => { if (value.product === "PROJECT" && !value.projectId) context.addIssue({ code: "custom", message: "PROJECT_OS_REQUEST_FAILED" }); if (value.product !== "PROJECT" && value.projectId) context.addIssue({ code: "custom", message: "PROJECT_OS_REQUEST_FAILED" }); })).mutation(({ ctx, input }) => reportDashboardSectionIssueForTenant({ userId: ctx.user.id, ...input })),
  }),
  pmo: router({
    createPortfolio: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), code: z.string().trim().min(2).max(80), name: z.string().trim().min(2).max(255) })).mutation(({ ctx, input }) => createPortfolioForTenant({ userId: ctx.user.id, ...input })),
    createProgram: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), portfolioId: z.string().uuid().optional(), code: z.string().trim().min(2).max(80), name: z.string().trim().min(2).max(255) })).mutation(({ ctx, input }) => createProgramForTenant({ userId: ctx.user.id, ...input })),
    linkProject: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), programId: z.string().uuid().optional(), portfolioId: z.string().uuid().optional() })).mutation(({ ctx, input }) => linkProjectToProgramForTenant({ userId: ctx.user.id, ...input })),
    createRisk: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), code: z.string().trim().min(1).max(80), title: z.string().trim().min(2).max(255), probability: z.number().int().min(1).max(5), severity: z.number().int().min(1).max(5), dueAt: z.date().optional() })).mutation(({ ctx, input }) => createRisk({ userId: ctx.user.id, ...input })),
    createIssue: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), code: z.string().trim().min(1).max(80), title: z.string().trim().min(2).max(255), priority: z.enum(["low", "medium", "high", "critical"]), dueAt: z.date().optional() })).mutation(({ ctx, input }) => createIssue({ userId: ctx.user.id, ...input })),
    createAction: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), title: z.string().trim().min(2).max(255), priority: z.enum(["low", "medium", "high", "critical"]), dueAt: z.date().optional() })).mutation(({ ctx, input }) => createAction({ userId: ctx.user.id, ...input })),
    transitionIssueEscalation: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), issueId: z.string().uuid(), nextStatus: z.enum(["pending", "escalated"]) })).mutation(({ ctx, input }) => transitionIssueEscalation({ userId: ctx.user.id, ...input })),
    transitionActionEscalation: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), actionId: z.string().uuid(), nextStatus: z.enum(["pending", "escalated"]) })).mutation(({ ctx, input }) => transitionActionEscalation({ userId: ctx.user.id, ...input })),
  }),
  executive: router({
    createDecision: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), problem: z.string().trim().min(2).max(5000), options: z.string().trim().min(2).max(5000), recommendation: z.string().trim().max(5000).optional() })).mutation(({ ctx, input }) => createDecision({ userId: ctx.user.id, ...input })),
  }),
  projects: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => listProjectsForTenant({ userId: ctx.user.id, ...input })),
    getControls: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getProjectControlsForTenant({ userId: ctx.user.id, ...input })),
    getControlsSchedule: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(async ({ ctx, input }) => {
      const controls = await getProjectControlsForTenant({ userId: ctx.user.id, ...input });
      return { project: controls.project, wbs: controls.wbs, activities: controls.activities };
    }),
    getControlsFinancials: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(async ({ ctx, input }) => {
      const controls = await getProjectControlsForTenant({ userId: ctx.user.id, ...input });
      return { wbs: controls.wbs, budgets: controls.budgets, costs: controls.costs, progress: controls.progress };
    }),
    getControlsPerformance: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(async ({ ctx, input }) => {
      const controls = await getProjectControlsForTenant({ userId: ctx.user.id, ...input });
      return { latestEvm: controls.latestEvm, latestHealth: controls.latestHealth, cashFlow: controls.cashFlow };
    }),
    create: protectedProcedure.input(z.object({
      tenantId: z.string().uuid(),
      code: z.string().trim().min(2).max(80),
      name: z.string().trim().min(2).max(255),
      projectType: z.string().trim().min(2).max(120),
      currency: z.string().length(3).transform(value => value.toUpperCase()),
    })).mutation(({ ctx, input }) => createProjectForTenant({ userId: ctx.user.id, ...input })),
    transitionLifecycle: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), lifecycleStage: z.enum(["opportunity", "pre_award", "tender", "award", "mobilization", "planning", "design", "procurement", "execution", "commissioning", "handover", "closeout", "post_project_review"]) })).mutation(({ ctx, input }) => transitionProjectLifecycle({ userId: ctx.user.id, ...input })),
  }),
  contracts: router({
    getProjectRegister: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getContractsCommitmentsForTenant({ userId: ctx.user.id, ...input })),
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), code: z.string().trim().min(1).max(80), title: z.string().trim().min(2).max(255), counterparty: z.string().trim().min(2).max(255), contractValue: z.number().finite().nonnegative(), currency: z.string().length(3).transform(value => value.toUpperCase()), startAt: z.date().optional(), endAt: z.date().optional() })).mutation(({ ctx, input }) => createContractForTenant({ userId: ctx.user.id, ...input })),
    createCommitment: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), contractId: z.string().uuid().optional(), code: z.string().trim().min(1).max(80), description: z.string().trim().min(2).max(255), amount: z.number().finite().positive(), currency: z.string().length(3).transform(value => value.toUpperCase()), committedAt: z.date().optional() })).mutation(({ ctx, input }) => createCommitmentForTenant({ userId: ctx.user.id, ...input })),
  }),
  documents: router({
    getProjectRegister: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getProjectDocumentsForTenant({ userId: ctx.user.id, ...input })),
    createWithVersion: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), documentNumber: z.string().trim().min(1).max(120), title: z.string().trim().min(2).max(255), category: z.enum(["drawing", "specification", "method_statement", "report", "correspondence", "commercial", "other"]), originalName: z.string().trim().min(1).max(255), mimeType: z.string().trim().min(3).max(120), contentBase64: z.string().min(4).max(14_000_000) })).mutation(({ ctx, input }) => createProjectDocumentWithVersion({ userId: ctx.user.id, ...input })),
    addVersion: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), documentId: z.string().uuid(), originalName: z.string().trim().min(1).max(255), mimeType: z.string().trim().min(3).max(120), contentBase64: z.string().min(4).max(14_000_000) })).mutation(({ ctx, input }) => addProjectDocumentVersion({ userId: ctx.user.id, ...input })),
    transitionStatus: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), documentId: z.string().uuid(), nextStatus: z.enum(["draft", "for_review", "approved", "superseded", "archived"]) })).mutation(({ ctx, input }) => transitionProjectDocumentStatus({ userId: ctx.user.id, ...input })),
  }),
  rfis: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getRfisForTenant({ userId: ctx.user.id, ...input })),
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), rfiNumber: z.string().trim().min(1).max(120), subject: z.string().trim().min(2).max(255), question: z.string().trim().min(5).max(10_000), dueAt: z.date().optional() })).mutation(({ ctx, input }) => createRfiForTenant({ userId: ctx.user.id, ...input })),
    transitionStatus: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), rfiId: z.string().uuid(), nextStatus: z.enum(["draft", "submitted", "under_review", "answered", "closed", "cancelled"]) })).mutation(({ ctx, input }) => transitionRfiStatus({ userId: ctx.user.id, ...input })),
  }),
  ncrs: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getNcrsForTenant({ userId: ctx.user.id, ...input })),
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), ncrNumber: z.string().trim().min(1).max(120), title: z.string().trim().min(2).max(255), description: z.string().trim().min(5).max(10_000), dueAt: z.date().optional() })).mutation(({ ctx, input }) => createNcrForTenant({ userId: ctx.user.id, ...input })),
    transitionStatus: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), ncrId: z.string().uuid(), nextStatus: z.enum(["open", "under_investigation", "corrective_action", "verification", "closed", "cancelled"]) })).mutation(({ ctx, input }) => transitionNcrStatus({ userId: ctx.user.id, ...input })),
  }),
  hse: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getHseObservationsForTenant({ userId: ctx.user.id, ...input })),
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), observationNumber: z.string().trim().min(1).max(120), title: z.string().trim().min(2).max(255), description: z.string().trim().min(5).max(10_000), category: z.enum(["safety", "health", "environment"]), severity: z.enum(["low", "medium", "high", "critical"]), dueAt: z.date().optional() })).mutation(({ ctx, input }) => createHseObservationForTenant({ userId: ctx.user.id, ...input })),
    transitionStatus: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), observationId: z.string().uuid(), nextStatus: z.enum(["open", "assigned", "remediation", "verification", "closed", "cancelled"]) })).mutation(({ ctx, input }) => transitionHseObservationStatus({ userId: ctx.user.id, ...input })),
  }),
  fieldReports: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getFieldReportsForTenant({ userId: ctx.user.id, ...input })),
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), reportNumber: z.string().trim().min(1).max(120), reportType: z.enum(["daily", "inspection", "progress"]), reportedAt: z.date(), shift: z.enum(["day", "night"]), workforceCount: z.number().int().min(0).max(100_000), weather: z.string().trim().max(160).optional(), summary: z.string().trim().min(5).max(10_000) })).mutation(({ ctx, input }) => createFieldReportForTenant({ userId: ctx.user.id, ...input })),
    transitionStatus: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), reportId: z.string().uuid(), nextStatus: z.enum(["draft", "submitted", "reviewed", "approved", "rejected"]) })).mutation(({ ctx, input }) => transitionFieldReportStatus({ userId: ctx.user.id, ...input })),
  }),
  qualityInspections: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getQualityInspectionsForTenant({ userId: ctx.user.id, ...input })),
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), inspectionNumber: z.string().trim().min(1).max(120), inspectionType: z.enum(["hold_point", "witness", "surveillance", "testing"]), inspectedAt: z.date(), outcome: z.enum(["pass", "fail", "conditional"]), summary: z.string().trim().min(5).max(10_000) })).mutation(({ ctx, input }) => createQualityInspectionForTenant({ userId: ctx.user.id, ...input })),
    transitionStatus: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), inspectionId: z.string().uuid(), nextStatus: z.enum(["draft", "submitted", "accepted", "rejected"]) })).mutation(({ ctx, input }) => transitionQualityInspectionStatus({ userId: ctx.user.id, ...input })),
  }),
  purchaseOrders: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getPurchaseOrdersForTenant({ userId: ctx.user.id, ...input })),
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), contractId: z.string().uuid().optional(), commitmentId: z.string().uuid().optional(), purchaseOrderNumber: z.string().trim().min(1).max(120), supplierName: z.string().trim().min(2).max(240), orderDate: z.date(), amount: z.number().finite().positive().max(999_999_999_999.99), currency: z.string().regex(/^[A-Z]{3}$/), summary: z.string().trim().min(5).max(10_000) })).mutation(({ ctx, input }) => createPurchaseOrderForTenant({ userId: ctx.user.id, ...input })),
    transitionStatus: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), purchaseOrderId: z.string().uuid(), nextStatus: z.enum(["draft", "submitted", "approved", "issued", "received", "cancelled"]) })).mutation(({ ctx, input }) => transitionPurchaseOrderStatus({ userId: ctx.user.id, ...input })),
  }),
  resources: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getProjectResourcesForTenant({ userId: ctx.user.id, ...input })),
    create: protectedProcedure
      .input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), resourceCode: z.string().trim().min(1).max(120), name: z.string().trim().min(2).max(255), resourceType: z.enum(["labor", "equipment", "material", "service"]), plannedUnits: z.number().finite().nonnegative(), allocatedUnits: z.number().finite().nonnegative(), unitCost: z.number().finite().nonnegative(), currency: z.string().length(3).transform(value => value.toUpperCase()) }).refine(value => value.allocatedUnits <= value.plannedUnits, { message: "PROJECT_OS_RESOURCE_ALLOCATION_EXCEEDS_PLAN", path: ["allocatedUnits"] }))
      .mutation(({ ctx, input }) => createProjectResourceForTenant({ userId: ctx.user.id, ...input })),
    updateAllocation: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), resourceId: z.string().uuid(), allocatedUnits: z.number().finite().nonnegative() })).mutation(({ ctx, input }) => updateProjectResourceAllocationForTenant({ userId: ctx.user.id, ...input })),
  }),
  assignments: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getEmployeeAssignmentsForTenant({ userId: ctx.user.id, ...input })),
    options: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getEmployeeAssignmentOptionsForTenant({ userId: ctx.user.id, ...input })),
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), employeeId: z.string().uuid(), projectResourceId: z.string().uuid(), wbsItemId: z.string().uuid().optional(), activityId: z.string().uuid().optional(), plannedStartAt: z.date(), plannedFinishAt: z.date(), plannedHours: z.number().finite().positive() }).refine(value => value.plannedFinishAt >= value.plannedStartAt, { message: "PROJECT_OS_ASSIGNMENT_WINDOW_INVALID", path: ["plannedFinishAt"] })).mutation(({ ctx, input }) => createEmployeeAssignmentForTenant({ userId: ctx.user.id, ...input })),
    timeEntries: router({
      list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getEmployeeTimeEntriesForTenant({ userId: ctx.user.id, ...input })),
      create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), assignmentId: z.string().uuid(), workDate: z.date(), actualHours: z.number().finite().positive().max(24), reportedProgressPercent: z.number().finite().min(0).max(100).optional() })).mutation(({ ctx, input }) => createEmployeeTimeEntryForTenant({ userId: ctx.user.id, ...input })),
      transition: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), timeEntryId: z.string().uuid(), status: z.enum(["submitted", "approved", "rejected"]) })).mutation(({ ctx, input }) => transitionEmployeeTimeEntryForTenant({ userId: ctx.user.id, ...input })),
    }),
  }),
  performance: router({
    get: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), employeeId: z.string().uuid().optional() })).query(({ ctx, input }) => getEmployeePerformanceForTenant({ userId: ctx.user.id, ...input })),
    exclude: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), employeeId: z.string().uuid(), sourceType: z.enum(["activity", "action", "rfi", "ncr", "quality_inspection", "field_report", "material_request"]), sourceId: z.string().uuid(), reason: z.string().trim().min(10).max(1000) })).mutation(({ ctx, input }) => createEmployeePerformanceExclusionForTenant({ userId: ctx.user.id, ...input })),
    objections: router({
      create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), statement: z.string().trim().min(20).max(8000) })).mutation(({ ctx, input }) => createEmployeePerformanceObjectionForTenant({ userId: ctx.user.id, ...input })),
      transition: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), objectionId: z.string().uuid(), status: z.enum(["under_review", "resolved", "rejected"]), resolutionNote: z.string().trim().min(10).max(1000).optional() })).mutation(({ ctx, input }) => transitionEmployeePerformanceObjectionForTenant({ userId: ctx.user.id, ...input })),
    }),
  }),
  employees: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => getEmployeesForTenant({ userId: ctx.user.id, ...input })),
    attendance: router({
      list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid().optional(), employeeId: z.string().uuid().optional() })).query(({ ctx, input }) => getEmployeeAttendanceForTenant({ userId: ctx.user.id, ...input })),
      create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid().optional(), employeeId: z.string().uuid(), attendanceDate: z.date(), attendanceStatus: z.enum(["present", "absent", "leave", "secondment"]), note: z.string().trim().max(1000).optional() })).mutation(({ ctx, input }) => createEmployeeAttendanceForTenant({ userId: ctx.user.id, ...input })),
      transition: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid().optional(), attendanceId: z.string().uuid(), status: z.enum(["submitted", "approved", "rejected"]) })).mutation(({ ctx, input }) => transitionEmployeeAttendanceForTenant({ userId: ctx.user.id, ...input })),
    }),
    identity: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), employeeId: z.string().uuid() })).query(({ ctx, input }) => getEmployeeIdentityForTenant({ userId: ctx.user.id, ...input })),
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), employeeNumber: z.string().trim().min(1).max(80), fullName: z.string().trim().min(2).max(255), jobTitle: z.string().trim().min(2).max(160), department: z.string().trim().min(2).max(160), hireDate: z.date(), nationality: z.string().trim().max(120).optional(), identityDocumentType: z.string().trim().max(80).optional(), identityReference: z.string().trim().max(512).optional(), linkedUserId: z.number().int().positive().optional(), retentionPolicy: z.enum(["standard", "extended", "legal_hold"]).default("standard") })).mutation(({ ctx, input }) => createEmployeeForTenant({ userId: ctx.user.id, ...input })),
    archive: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), employeeId: z.string().uuid() })).mutation(({ ctx, input }) => archiveEmployeeForTenant({ userId: ctx.user.id, ...input })),
    contracts: router({
      list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), employeeId: z.string().uuid() })).query(({ ctx, input }) => getEmploymentContractsForTenant({ userId: ctx.user.id, ...input })),
      create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), employeeId: z.string().uuid(), contractType: z.enum(["permanent", "fixed_term", "temporary", "consulting"]), startDate: z.date(), endDate: z.date().optional(), probationEndDate: z.date().optional(), renewalOfContractId: z.string().uuid().optional(), retentionPolicy: z.enum(["standard", "extended", "legal_hold"]).default("standard") }).refine(value => !value.endDate || value.endDate >= value.startDate, { message: "PROJECT_OS_EMPLOYMENT_CONTRACT_DATES_INVALID", path: ["endDate"] }).refine(value => !value.probationEndDate || value.probationEndDate >= value.startDate, { message: "PROJECT_OS_EMPLOYMENT_CONTRACT_DATES_INVALID", path: ["probationEndDate"] })).mutation(({ ctx, input }) => createEmploymentContractForTenant({ userId: ctx.user.id, ...input })),
    }),
    payroll: router({
      capabilities: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => getPayrollCapabilitiesForTenant({ userId: ctx.user.id, ...input })),
      runs: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => getPayrollRunsForTenant({ userId: ctx.user.id, ...input })),
      allocationProjects: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => getPayrollAllocationProjectsForTenant({ userId: ctx.user.id, ...input })),
      allocationOptions: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getPayrollAllocationOptionsForTenant({ userId: ctx.user.id, ...input })),
      salaryStructure: router({
        get: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), employeeId: z.string().uuid() })).query(({ ctx, input }) => getSalaryStructureForTenant({ userId: ctx.user.id, ...input })),
        save: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), employeeId: z.string().uuid(), baseSalary: z.number().finite().nonnegative(), housingAllowance: z.number().finite().nonnegative().default(0), transportAllowance: z.number().finite().nonnegative().default(0), hardshipAllowance: z.number().finite().nonnegative().default(0), gosiRate: z.number().finite().min(0).max(1).default(0), otherDeductions: z.number().finite().nonnegative().default(0), eosMonthlyAccrual: z.number().finite().nonnegative().default(0), currency: z.string().length(3).transform(value => value.toUpperCase()) })).mutation(({ ctx, input }) => saveSalaryStructureForTenant({ userId: ctx.user.id, ...input })),
      }),
      createRun: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), periodStart: z.date(), periodEnd: z.date() }).refine(value => value.periodEnd >= value.periodStart, { message: "PROJECT_OS_PAYROLL_PERIOD_INVALID", path: ["periodEnd"] })).mutation(({ ctx, input }) => createPayrollRunForTenant({ userId: ctx.user.id, ...input })),
      details: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), payrollRunId: z.string().uuid() })).query(({ ctx, input }) => getPayrollRunDetailsForTenant({ userId: ctx.user.id, ...input })),
      transition: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), payrollRunId: z.string().uuid(), status: z.enum(["review", "approved", "paid"]) })).mutation(({ ctx, input }) => transitionPayrollRunForTenant({ userId: ctx.user.id, ...input })),
      allocateCost: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), payrollEntryId: z.string().uuid(), projectId: z.string().uuid(), wbsItemId: z.string().uuid().optional(), activityId: z.string().uuid().optional(), amount: z.number().finite().positive(), incurredAt: z.date() })).mutation(({ ctx, input }) => allocateApprovedPayrollCostForTenant({ userId: ctx.user.id, ...input })),
    }),
  }),
  materials: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getMaterialCatalogForTenant({ userId: ctx.user.id, ...input })),
    createMaster: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), code: z.string().trim().min(1).max(120), description: z.string().trim().min(2).max(255), unitOfMeasure: z.string().trim().min(1).max(40), category: z.string().trim().min(2).max(120), referenceSpecification: z.string().trim().max(255).optional() })).mutation(({ ctx, input }) => createMaterialMasterForTenant({ userId: ctx.user.id, ...input })),
    saveProjectOverride: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), materialId: z.string().uuid(), projectDescription: z.string().trim().max(255).optional(), referenceSpecification: z.string().trim().max(255).optional(), reorderLevel: z.number().finite().positive().nullable().optional(), active: z.boolean() })).mutation(({ ctx, input }) => saveProjectMaterialOverrideForTenant({ userId: ctx.user.id, ...input, reorderLevel: input.reorderLevel ?? undefined })),
  }),
  warehouses: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getProjectWarehousesForTenant({ userId: ctx.user.id, ...input })),
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), code: z.string().trim().min(1).max(80), name: z.string().trim().min(2).max(160), locationDescription: z.string().trim().max(255).optional() })).mutation(({ ctx, input }) => createProjectWarehouseForTenant({ userId: ctx.user.id, ...input })),
    recordInventory: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), warehouseId: z.string().uuid(), materialId: z.string().uuid(), requisitionId: z.string().uuid().optional(), transactionType: z.enum(["receipt", "issue", "adjustment"]), quantityDelta: z.number().finite().refine(value => value !== 0, { message: "PROJECT_OS_INVENTORY_DELTA_INVALID" }), referenceNumber: z.string().trim().max(120).optional(), note: z.string().trim().max(500).optional(), occurredAt: z.date() })).mutation(({ ctx, input }) => recordWarehouseInventoryTransactionForTenant({ userId: ctx.user.id, ...input })),
    issueToWork: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), warehouseId: z.string().uuid(), materialId: z.string().uuid(), wbsItemId: z.string().uuid(), activityId: z.string().uuid().optional(), issuedQuantity: z.number().finite().positive({ message: "PROJECT_OS_MATERIAL_ISSUE_AMOUNT_INVALID" }), unitCost: z.number().finite().positive({ message: "PROJECT_OS_MATERIAL_ISSUE_AMOUNT_INVALID" }), referenceNumber: z.string().trim().max(120).optional(), note: z.string().trim().max(500).optional(), issuedAt: z.date() })).mutation(({ ctx, input }) => createMaterialIssueForTenant({ userId: ctx.user.id, ...input })),
    transferInventory: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), sourceWarehouseId: z.string().uuid(), destinationWarehouseId: z.string().uuid(), materialId: z.string().uuid(), quantity: z.number().finite().positive({ message: "PROJECT_OS_INVENTORY_TRANSFER_QUANTITY_INVALID" }), referenceNumber: z.string().trim().max(120).optional(), note: z.string().trim().max(500).optional(), transferredAt: z.date() })).mutation(({ ctx, input }) => transferWarehouseInventoryForTenant({ userId: ctx.user.id, ...input })),
  }),
  goodsReceipts: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getGoodsReceiptNotesForTenant({ userId: ctx.user.id, ...input })),
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), grnNumber: z.string().trim().min(1).max(120), purchaseOrderId: z.string().uuid(), materialId: z.string().uuid(), receivedQuantity: z.number().finite().nonnegative(), rejectedQuantity: z.number().finite().nonnegative(), unitCost: z.number().finite().positive(), unitOfMeasure: z.string().trim().min(1).max(40), receivedAt: z.date(), qualityInspectionId: z.string().uuid().optional(), ncrId: z.string().uuid().optional(), note: z.string().trim().max(10_000).optional() }).refine(value => value.receivedQuantity + value.rejectedQuantity > 0, { message: "PROJECT_OS_GRN_QUANTITY_INVALID" }).refine(value => value.rejectedQuantity > 0 ? Boolean(value.qualityInspectionId && value.ncrId) : !value.qualityInspectionId && !value.ncrId, { message: "PROJECT_OS_GRN_REJECTION_EVIDENCE_REQUIRED" })).mutation(({ ctx, input }) => createGoodsReceiptNoteForTenant({ userId: ctx.user.id, ...input })),
  }),
  procurement: router({
    register: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getProcurementRegisterForTenant({ userId: ctx.user.id, ...input })),
    createSupplier: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), code: z.string().trim().min(1).max(80), legalName: z.string().trim().min(2).max(240), contactName: z.string().trim().max(160).optional(), contactEmail: z.string().trim().email().max(254).optional(), contactPhone: z.string().trim().max(60).optional() })).mutation(({ ctx, input }) => createSupplierForTenant({ userId: ctx.user.id, ...input })),
    createRequisition: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), requisitionNumber: z.string().trim().min(1).max(120), supplierId: z.string().uuid().optional(), materialId: z.string().uuid(), wbsItemId: z.string().uuid().optional(), activityId: z.string().uuid().optional(), description: z.string().trim().min(5).max(10_000), requestedQuantity: z.number().finite().positive(), unitOfMeasure: z.string().trim().min(1).max(40), requiredAt: z.date() })).mutation(({ ctx, input }) => createProcurementRequisitionForTenant({ userId: ctx.user.id, ...input })),
    transitionRequisition: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), requisitionId: z.string().uuid(), nextStatus: z.enum(["submitted", "approved", "rejected", "cancelled", "closed"]) })).mutation(({ ctx, input }) => transitionProcurementRequisitionForTenant({ userId: ctx.user.id, ...input })),
    linkPurchaseOrder: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), requisitionId: z.string().uuid(), purchaseOrderId: z.string().uuid() })).mutation(({ ctx, input }) => linkProcurementRequisitionPurchaseOrderForTenant({ userId: ctx.user.id, ...input })),
  }),
  claims: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getClaimsForTenant({ userId: ctx.user.id, ...input })),
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), contractId: z.string().uuid().optional(), claimNumber: z.string().trim().min(1).max(120), title: z.string().trim().min(2).max(255), description: z.string().trim().min(5).max(10_000), claimedAmount: z.number().finite().nonnegative(), currency: z.string().length(3).transform(value => value.toUpperCase()) })).mutation(({ ctx, input }) => createClaimForTenant({ userId: ctx.user.id, ...input })),
    transitionStatus: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), claimId: z.string().uuid(), nextStatus: z.enum(["submitted", "under_review", "approved", "rejected", "withdrawn"]), approvedAmount: z.number().finite().nonnegative().optional() })).mutation(({ ctx, input }) => transitionClaimStatus({ userId: ctx.user.id, ...input })),
  }),
  advisor: router({
    project: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), locale: z.enum(["ar", "en"]) })).mutation(({ ctx, input }) => generateProjectAdvisoryForTenant({ userId: ctx.user.id, ...input })),
  }),
  changes: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getChangeRequestsForTenant({ userId: ctx.user.id, ...input })),
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), changeNumber: z.string().trim().min(1).max(120), title: z.string().trim().min(2).max(255), description: z.string().trim().min(5).max(10_000), impactScheduleDays: z.number().int().min(0).max(3650), impactCost: z.number().finite().nonnegative(), currency: z.string().length(3).transform(value => value.toUpperCase()) })).mutation(({ ctx, input }) => createChangeRequestForTenant({ userId: ctx.user.id, ...input })),
    transitionStatus: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), changeRequestId: z.string().uuid(), nextStatus: z.enum(["draft", "submitted", "under_review", "approved", "rejected", "cancelled"]) })).mutation(({ ctx, input }) => transitionChangeRequestStatus({ userId: ctx.user.id, ...input })),
  }),
  wbs: router({
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), code: z.string().trim().min(1).max(80), name: z.string().trim().min(2).max(255), parentId: z.string().uuid().optional(), plannedValue: z.number().finite().nonnegative().optional() })).mutation(({ ctx, input }) => createWbsItem({ userId: ctx.user.id, ...input })),
  }),
  activities: router({
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), wbsItemId: z.string().uuid().optional(), code: z.string().trim().min(1).max(80), name: z.string().trim().min(2).max(255), plannedValue: z.number().finite().nonnegative().optional(), plannedStartAt: z.date(), plannedFinishAt: z.date() })).mutation(({ ctx, input }) => createActivity({ userId: ctx.user.id, ...input })),
  }),
  costs: router({
    createActual: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), wbsItemId: z.string().uuid().optional(), amount: z.number().finite().positive(), incurredAt: z.date() })).mutation(({ ctx, input }) => createCostEntry({ userId: ctx.user.id, ...input })),
  }),
  progress: router({
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), wbsItemId: z.string().uuid(), percentComplete: z.number().min(0).max(100), reportedAt: z.date() })).mutation(({ ctx, input }) => createProgressEntry({ userId: ctx.user.id, ...input })),
  }),
  budgets: router({
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), wbsItemId: z.string().uuid().optional(), costCode: z.string().trim().min(1).max(80), originalAmount: z.number().finite().nonnegative(), currentAmount: z.number().finite().nonnegative() })).mutation(({ ctx, input }) => createBudgetLine({ userId: ctx.user.id, ...input })),
  }),
});

export type AppRouter = typeof appRouter;
