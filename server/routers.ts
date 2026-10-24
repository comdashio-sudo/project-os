import { API_SCOPES, createApiKeyForManager, listApiKeysForManager, revokeApiKeyForManager } from "./integrations/apiKeys";
import { EXPORT_ENTITIES } from "./integrations/erpOutbound";
import { createConnectionForManager, listConnectionsForManager, runConnectionForManager, setConnectionActiveForManager, testConnectionForManager } from "./integrations/connections";
import { listMappingsForManager, listSyncItemsForManager, listSyncRunsForManager, saveMappingsForManager } from "./integrations/manage";
import { MAPPING_TYPES } from "./integrations/mappings";
import { createWebhookEndpointForManager, listWebhookDeliveriesForManager, listWebhookEndpointsForManager, sendTestWebhookForManager, setWebhookEndpointActiveForManager, WEBHOOK_EVENTS } from "./integrations/webhooks";
import { integrationSystems } from "../drizzle/schema";
import { getCellCardForTenant } from "./cellCard";
import { closeConsultantSubmittalForTenant, createConsultantSubmittalForTenant, listConsultantSubmittalsForTenant, listSubmittalReplyCodesForTenant, replyConsultantSubmittalForTenant, saveSubmittalReplyCodesForManager, sendConsultantSubmittalForTenant, SUBMITTAL_TYPES } from "./consultantSubmittals";
import { getEffectivePolicyForProject, getTenantPolicyForManager, setTenantPolicyForManager } from "./qualityGate";
import { attachSiteReportPhotoForTenant, getSiteDailyReportForTenant, listFieldOptionsForTenant, listSiteDailyReportsForTenant, reviewSiteDailyReportForTenant, saveSiteDailyReportForTenant, submitSiteDailyReportForTenant } from "./siteReports";
import { findMaterialForTenant, getIssueCellOptionsForTenant, issueMaterialToCellForTenant, recordStocktakeForTenant, returnMaterialToWarehouseForTenant, transferBetweenProjectsForTenant } from "./warehouseOps";
import { getCompanyLevel, getPortfolioLevel, getProjectLevel, getWarehouseLevel } from "./scopeDashboards";
import { z } from "zod";
import { EXTERNAL_MODULES } from "./externalImports";
import { LEDGER_MODULES } from "@shared/ledgerImportColumns";
import { exportProjectData } from "./ledgerImports";
import { createDirectUpload, DIRECT_UPLOAD_PURPOSES } from "./directUpload";
import { riyalCurrency } from "./domain/currency";
import { productCodes } from "../drizzle/schema";
import { acceptMembershipInvitation, acknowledgeInternalNotification, getEndOfServiceLiabilityForTenant, addProjectDocumentVersion, assignTenantMember, assignTenantMembershipRole, captureOperationalEvmSnapshot, captureProjectHealthSnapshot, confirmAndImportData, createAction, createActivity, createAndAnalyzeDataImport, createBoqItemForTenant, createBudgetLine, createChangeRequestForTenant, createClaimForTenant, createCommitmentForTenant, createContractForTenant, createControlRecordLinkForTenant, createCostEntry, createDataExport, buildImportTemplateForUser, createDecision, createFieldReportForTenant, createHseObservationForTenant, createIssue, createMaterialMasterForTenant, createMasterPlanForTenant, createMasterPlanSpatialEntityForTenant, createMasterPlanVersionForTenant, createMembershipInvitation, createNcrForTenant, createPortfolioForTenant, createProgramForTenant, createProgressEntry, createProjectCommercialInvoiceForTenant, createProjectDocumentWithVersion, createProjectForTenant, createProjectResourceForTenant, createPurchaseOrderForTenant, createQualityInspectionForTenant, createRfiForTenant, createRisk, createSubcontractCertificateForTenant, createSubcontractContractForTenant, createTenantForUser, createTenantRole, createWbsItem, findAssignableTenantUser, generateProjectAdvisoryForTenant, getBoqItemsForTenant, getChangeRequestsForTenant, getClaimsForTenant, getCommercialCatalogForAdministrator, getContractsCommitmentsForTenant, getControlRecordLinksForTenant, getDataImportDetailForTenant, getDataImportsForTenant, getExecutiveDashboard, getFieldEntryContextForTenant, getFieldReportsForTenant, getHseObservationsForTenant, getInternalNotificationsForTenant, getMaterialCatalogForTenant, getMasterPlansForTenant, getNcrsForTenant, getPmoDashboard, getPortfolioProfitabilityForTenant, getProfitabilityCostBreakdownForTenant, getProfitabilityHistoryForTenant, getProjectCommercialInvoicesForTenant, getProjectProfitabilityForTenant, getProjectControlsForTenant, getProjectDocumentsForTenant, getProjectResourcesForTenant, getPurchaseOrdersForTenant, getQualityInspectionsForTenant, getRfisForTenant, getSubcontractCertificatesForTenant, getSubcontractContractsForTenant, getTenantAccessSnapshot, getTenantAdministration, getTenantLicenseForManager, getTenantNavigationForUser, linkProjectToProgramForTenant, listProjectsForTenant, listTenantsForUser, provisionTenantLicense, revokeTenantMembershipRole, saveEvmSnapshot, saveProjectMaterialOverrideForTenant, setTenantLicenseFeatureOverride, transitionActionEscalation, transitionChangeRequestStatus, transitionClaimStatus, transitionFieldReportStatus, transitionHseObservationStatus, transitionIssueEscalation, transitionNcrStatus, transitionProjectDocumentStatus, transitionProjectLifecycle, transitionPurchaseOrderStatus, transitionQualityInspectionStatus, transitionRfiStatus, transitionTenantLicenseStatus, transitionTenantMembershipStatus, updateProjectResourceAllocationForTenant, updateTenantRole , getProjectLabourCostForTenant, getTenantLabourSettings, saveTenantLabourSettings , getProjectCashFlowForTenant, transitionProjectCommercialInvoiceStatus , createTeamTimeEntriesForTenant, getTeamHoursSheetForTenant } from "./db";
import { confirmTenantDeletion, previewTenantData, requestTenantDeletion } from "./tenantDataService";
import { PMC_IMPORT_KINDS } from "./domain/pmcImport";
import { withClientRequest } from "./clientRequests";
import { exportPmcScreen, getPmcScreen } from "./pmcScreensService";
import { getPmcSiteMap, getPmcUnitCard, savePmcUnitGeometries, uploadPmcSitePlan } from "./pmcPlanService";
import { getPmcProgramme } from "./pmcProgrammeService";
import { PMC_SCREEN_NAMES, type PmcScreenName } from "./domain/pmcScreenExport";
import { analyzePmcImport, confirmPmcImport } from "./pmcImportService";
import { PMC_INSPECTION_STEPS, PMC_STATUSES, advancePmcInspectionStep, createPmcInspectionRequest, getPmcProgress, getPmcStatusFactors, listPmcInspectionRequests, listPmcVerificationStatuses, respondPmcInspection, savePmcVerificationStatuses, setPmcStatusFactors, setPmcUnitActivityStatus } from "./pmcService";
import { applyMasterPlanMappingFile, importMasterPlanSpatialEntitiesFromFile } from "./db";
import { createMasterPlanSnapshotForTenant, getMasterPlanSnapshotsForTenant, getMasterPlanVisualizationRulesForTenant, saveMasterPlanVisualizationRuleForTenant } from "./db";
import { getPmcProjectSummaryForTenant } from "./db";
import { createImportUpload, getImportProgress, previewImportDiff, registerImportUpload, requestImportConfirmation, requestImportReanalysis } from "./importJobs";
import { createMaterialIssueForTenant, createProjectWarehouseForTenant, getProjectWarehousesForTenant, recordWarehouseInventoryTransactionForTenant, transferWarehouseInventoryForTenant } from "./db";
import { createProcurementRequisitionForTenant, createSupplierForTenant, getProcurementRegisterForTenant, linkProcurementRequisitionPurchaseOrderForTenant, transitionProcurementRequisitionForTenant } from "./db";
import { createGoodsReceiptNoteForTenant, getGoodsReceiptNotesForTenant } from "./db";
import { confirmManualTenantPayment, createSelfServiceTenant, createTenantPayment, getPublicCommercialPlans, getTenantBillingForManager, issueTenantInvoice } from "./db";
import { claimSupportTicket, createKnowledgeArticleForTenant, createSupportTicketForTenant, getSupportTicketForTenant, listApprovedSupportSourceDocuments, listKnowledgeArticlesForTenant, listSupportTicketsForTenant, replyToSupportTicket, transitionSupportTicket } from "./db";
import { reportDashboardSectionIssueForTenant } from "./db";
import { getEmailNotificationPreferences, setEmailNotificationPreference, adjustPayrollAllocationForTenant, allocatePayrollEntryByHoursForTenant, allocateApprovedPayrollCostForTenant, archiveEmployeeForTenant, createEmployeeAttendanceForTenant, createEmployeeForTenant, createEmployeeTimeEntryForTenant, createEmploymentContractForTenant, createPayrollRunForTenant, getEmployeeAttendanceForTenant, getEmployeeIdentityForTenant, getEmployeeTimeEntriesForTenant, getEmployeesForTenant, getEmploymentContractsForTenant, getPayrollAllocationOptionsForTenant, getPayrollAllocationProjectsForTenant, getPayrollCapabilitiesForTenant, getPayrollRunDetailsForTenant, getPayrollRunsForTenant, getSalaryStructureForTenant, saveSalaryStructureForTenant, transitionEmployeeAttendanceForTenant, transitionEmployeeTimeEntryForTenant, transitionPayrollRunForTenant } from "./db";
import { createEmployeeAssignmentForTenant, getEmployeeAssignmentOptionsForTenant, getEmployeeAssignmentsForTenant } from "./db";
import { createEmployeePerformanceExclusionForTenant, createEmployeePerformanceObjectionForTenant, getEmployeePerformanceForTenant, transitionEmployeePerformanceObjectionForTenant } from "./db";
import { assertTenantAccess } from "./domain/authorization";
import { calculateEvm } from "./domain/evm";
import { addDesignRevision, approveDesignDrawing, cancelDesignDrawing, createDesignSubmittal, createDesignTransmittal, getDesignDashboard, listDesignComments, listDesignDrawings, listDesignRevisions, listDesignSubmittals, listDesignTransmittals, raiseDesignComment, registerDesignDrawing, transitionDesignComment, transitionDesignSubmittal, transitionDesignTransmittal } from "./designService";
import { COMMENT_SEVERITIES, COMMENT_STATUSES, DESIGN_DISCIPLINES, SUBMITTAL_REPLY_CODES, TRANSMITTAL_DIRECTIONS } from "./domain/designCoordination";
import { addTenderBidAdjustment, awardTender, createTenderPackage, disqualifyTenderBid, enterTenderBid, getTenderComparison, inviteTenderSupplier, listTenderInvitees, listTenderPackages, listTenderSuppliers, removeTenderBidAdjustment, reviseTenderBid, transitionTenderPackage, withdrawTenderBid } from "./tenderService";
import { ADJUSTMENT_KINDS } from "./domain/tenders";
import { setMasterPlanSnapshotSharing, setMasterPlanVersionGeometry, updateMasterPlanEntityLayout } from "./masterPlanTools";
import { masterPlanVisionRouter } from "./masterPlanVision";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { sdk } from "./_core/sdk";
import { sessionStore } from "./_core/sessionStore";
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

const pmcFiltersInput = z.object({ zone: z.string().max(80).optional(), block: z.string().max(80).optional(), unitFrom: z.number().int().min(0).optional(), unitTo: z.number().int().min(0).optional(), group: z.string().max(80).optional(), stage: z.string().max(80).optional(), activity: z.string().max(80).optional(), contractor: z.string().max(255).optional(), consultant: z.string().max(255).optional(), since: z.date().optional(), until: z.date().optional() }).optional();
const pmcScreenInput = z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), filters: pmcFiltersInput });
const pmcScreen = <N extends PmcScreenName>(screen: N) => protectedProcedure.input(pmcScreenInput).query(({ ctx, input }) => getPmcScreen({ userId: ctx.user.id, screen, ...input }));

const importModuleSchema = z.enum(["wbs", "budget", "contracts", "materials", "schedule", "openingBalances"]);
// the general importer's modules plus the PMC and master-plan imports, which now travel the same direct-upload path (server/externalImports.ts)
const uploadModuleSchema = z.union([importModuleSchema, z.enum(EXTERNAL_MODULES)]);
const importContextSchema = z.object({ masterPlanVersionId: z.string().uuid().optional() }).strict();
const importDuplicateModeSchema = z.enum(["create_only", "update_existing", "upsert", "skip_duplicates", "fail_on_duplicate"]);
/** Which file formats a module accepts: a schedule is xlsx or XER, every other module xlsx or csv. */
const importFormatRule = (value: { moduleCode: string; sourceFormat: string }, context: z.RefinementCtx) => {
  if (value.moduleCode === "schedule" && value.sourceFormat !== "xlsx" && value.sourceFormat !== "xer") context.addIssue({ code: "custom", message: "PROJECT_OS_SCHEDULE_FORMAT_INVALID" });
  if (value.moduleCode !== "schedule" && value.sourceFormat === "xer") context.addIssue({ code: "custom", message: "PROJECT_OS_IMPORT_FORMAT_INVALID" });
};

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    // Logging out ends the session in the database first, so the token is dead even if a copy of it was kept; only then is the cookie cleared.
    logout: publicProcedure.mutation(async ({ ctx }) => {
      const sessionId = ctx.sessionId ?? (await sdk.sessionIdOf(ctx.req));
      if (sessionId) await sessionStore.revoke(sessionId);
      ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true } as const;
    }),
    // "Sign out everywhere": every live session of this person, on every device, including this one.
    logoutEverywhere: protectedProcedure.mutation(async ({ ctx }) => {
      const ended = await sessionStore.revokeAllForUser(ctx.user.id);
      ctx.res.clearCookie(COOKIE_NAME, { ...getSessionCookieOptions(ctx.req), maxAge: -1 });
      return { success: true, ended } as const;
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
  // What the signed-in person may do in this company, for the screen to hide and disable the controls they cannot use.
  // This is presentation only: every write is still refused by the server on its own (the same snapshot, the same check).
  // A person who is not a member gets the same shape with nothing granted, so the screen never has to guess.
  // Roles are scoped (company or one project), so the scopes travel with the codes and the screen applies the server's own rule.
  accessSummary: router({
    mine: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(async ({ ctx, input }) => {
      const snapshot = await getTenantAccessSnapshot({ userId: ctx.user.id, tenantId: input.tenantId });
      if (!snapshot || snapshot.membershipStatus !== "active") return { member: false as const, products: [] as string[], permissions: [] as string[], scopes: [] as { scopeType: string; scopeId: string | null }[] };
      return { member: true as const, products: snapshot.entitledProducts as string[], permissions: [...snapshot.permissionCodes].sort(), scopes: snapshot.scopes.map(scope => ({ scopeType: scope.scopeType as string, scopeId: (scope.scopeId ?? null) as string | null })) };
    }),
  }),
  navigation: router({
    get: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid().optional() })).query(({ ctx, input }) => getTenantNavigationForUser({ userId: ctx.user.id, ...input })),
  }),
  pmc: router({
    summary: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getPmcProjectSummaryForTenant({ userId: ctx.user.id, ...input })),
    progress: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getPmcProgress({ userId: ctx.user.id, ...input })),
    setUnitActivityStatus: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), unitId: z.string().uuid(), activityDefinitionId: z.string().uuid(), status: z.enum(PMC_STATUSES), verificationStatusId: z.string().uuid().nullable().optional(), note: z.string().trim().max(1000).optional() })).mutation(({ ctx, input }) => setPmcUnitActivityStatus({ userId: ctx.user.id, ...input })),
    statusFactors: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getPmcStatusFactors({ userId: ctx.user.id, ...input })),
    setStatusFactors: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), factors: z.object({ NOT_STARTED: z.number().min(0).max(1), IN_PROGRESS: z.number().min(0).max(1), UNDER_REVIEW: z.number().min(0).max(1), COMPLETE: z.number().min(0).max(1) }).partial() })).mutation(({ ctx, input }) => setPmcStatusFactors({ userId: ctx.user.id, ...input })),
    verificationStatuses: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => listPmcVerificationStatuses({ userId: ctx.user.id, ...input })),
    saveVerificationStatuses: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), statuses: z.array(z.object({ code: z.string().trim().min(1).max(80), label: z.string().trim().min(1).max(160), sortOrder: z.number().int().min(0).max(10_000), active: z.boolean(), pending: z.boolean().optional() })).min(1).max(50) })).mutation(({ ctx, input }) => savePmcVerificationStatuses({ userId: ctx.user.id, ...input })),
    inspections: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => listPmcInspectionRequests({ userId: ctx.user.id, ...input })),
    createInspection: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), requestCode: z.string().trim().min(1).max(80), activityDefinitionId: z.string().uuid(), unitIds: z.array(z.string().uuid()).min(1).max(500), contractorLabel: z.string().trim().max(255).optional(), consultantLabel: z.string().trim().max(255).optional(), requestedAt: z.date(), notes: z.string().trim().max(5000).optional() })).mutation(({ ctx, input }) => createPmcInspectionRequest({ userId: ctx.user.id, ...input })),
    advanceInspection: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), inspectionRequestId: z.string().uuid(), stepCode: z.enum(PMC_INSPECTION_STEPS), outcome: z.enum(["complete", "rejected"]), nextHolderLabel: z.string().trim().max(255).optional() })).mutation(({ ctx, input }) => advancePmcInspectionStep({ userId: ctx.user.id, ...input })),
    latestUpdates: pmcScreen("latestUpdates"),
    approvals: pmcScreen("approvals"),
    inspectionFlow: pmcScreen("inspections"),
    activitiesMatrix: pmcScreen("activities"),
    zonesView: pmcScreen("zones"),
    weeklyReport: pmcScreen("weekly"),
    monthlyReport: pmcScreen("monthly"),
    pendingAtVerifier: pmcScreen("pending"),
    stagesView: pmcScreen("stages"),
    programme: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getPmcProgramme({ userId: ctx.user.id, ...input })),
    siteMap: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), activityCode: z.string().max(80).optional() })).query(({ ctx, input }) => getPmcSiteMap({ userId: ctx.user.id, ...input })),
    unitCard: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), unitNumber: z.number().int().min(0) })).query(({ ctx, input }) => getPmcUnitCard({ userId: ctx.user.id, ...input })),
    uploadSitePlan: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), fileName: z.string().trim().min(1).max(255) }).and(z.union([z.object({ base64: z.string().min(1).max(12_000_000) }), z.object({ uploadKey: z.string().min(1).max(1024) })]))).mutation(({ ctx, input }) => uploadPmcSitePlan({ userId: ctx.user.id, ...input })),
    saveUnitGeometries: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), geojson: z.string().min(2).max(8_000_000) })).mutation(({ ctx, input }) => savePmcUnitGeometries({ userId: ctx.user.id, ...input })),
    exportScreen: protectedProcedure.input(pmcScreenInput.extend({ screen: z.enum(PMC_SCREEN_NAMES), locale: z.enum(["ar", "en"]) })).mutation(({ ctx, input }) => exportPmcScreen({ userId: ctx.user.id, ...input })),
    analyzeImport: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), kind: z.enum(PMC_IMPORT_KINDS), format: z.enum(["xlsx", "csv"]), base64: z.string().min(1).max(12_000_000) })).mutation(({ ctx, input }) => analyzePmcImport({ userId: ctx.user.id, ...input })),
    confirmImport: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), kind: z.enum(PMC_IMPORT_KINDS), format: z.enum(["xlsx", "csv"]), base64: z.string().min(1).max(12_000_000), approvedHash: z.string().length(64) })).mutation(({ ctx, input }) => confirmPmcImport({ userId: ctx.user.id, ...input })),
    respondInspection: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), inspectionRequestId: z.string().uuid(), responseCode: z.enum(["A", "B", "C", "UR"]) })).mutation(({ ctx, input }) => respondPmcInspection({ userId: ctx.user.id, ...input })),
  }),
  notifications: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => getInternalNotificationsForTenant({ userId: ctx.user.id, ...input })),
    acknowledge: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), notificationId: z.string().uuid() })).mutation(({ ctx, input }) => acknowledgeInternalNotification({ userId: ctx.user.id, ...input })),
    emailPreferences: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => getEmailNotificationPreferences({ userId: ctx.user.id, ...input })),
    setEmailPreference: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), kind: z.enum(["support_escalation", "approvals_waiting", "daily_digest"]), enabled: z.boolean() })).mutation(({ ctx, input }) => setEmailNotificationPreference({ userId: ctx.user.id, ...input })),
  }),
  controlLinks: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getControlRecordLinksForTenant({ userId: ctx.user.id, ...input })),
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), sourceType: z.enum(["risk", "issue", "action", "decision"]), sourceId: z.string().uuid(), targetType: z.enum(["risk", "issue", "action", "decision", "rfi", "ncr"]), targetId: z.string().uuid() })).mutation(({ ctx, input }) => createControlRecordLinkForTenant({ userId: ctx.user.id, ...input })),
  }),
  dataImports: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid().optional() })).query(({ ctx, input }) => getDataImportsForTenant({ userId: ctx.user.id, ...input })),
    detail: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), importId: z.string().uuid() })).query(({ ctx, input }) => getDataImportDetailForTenant({ userId: ctx.user.id, ...input })),
    analyze: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), moduleCode: z.enum(["wbs", "budget", "contracts", "materials", "schedule", "openingBalances"]), fileName: z.string().trim().min(1).max(255), sourceFormat: z.enum(["xlsx", "csv", "xer"]), base64: z.string().min(1).max(14_000_000), duplicateMode: z.enum(["create_only", "update_existing", "upsert", "skip_duplicates", "fail_on_duplicate"]).optional(), mappingOverride: z.record(z.string().min(1).max(64), z.string().min(1).max(128)).optional() }).superRefine((value, context) => { if (value.moduleCode === "schedule" && value.sourceFormat !== "xlsx" && value.sourceFormat !== "xer") context.addIssue({ code: "custom", message: "PROJECT_OS_SCHEDULE_FORMAT_INVALID" }); if (value.moduleCode !== "schedule" && value.sourceFormat === "xer") context.addIssue({ code: "custom", message: "PROJECT_OS_IMPORT_FORMAT_INVALID" }); if (value.mappingOverride && Object.keys(value.mappingOverride).length > 6) context.addIssue({ code: "custom", message: "PROJECT_OS_IMPORT_MAPPING_INVALID" }); })).mutation(({ ctx, input }) => createAndAnalyzeDataImport({ userId: ctx.user.id, ...input })),
    reanalyze: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), importId: z.string().uuid(), mappingOverride: z.record(z.string().min(1).max(64), z.string().min(1).max(128)) }).refine(value => Object.keys(value.mappingOverride).length <= 6, { message: "PROJECT_OS_IMPORT_MAPPING_INVALID" })).mutation(({ ctx, input }) => requestImportReanalysis({ userId: ctx.user.id, ...input })),
    confirm: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), importId: z.string().uuid(), approvedDiffHash: z.string().regex(/^[0-9a-f]{64}$/).optional() })).mutation(({ ctx, input }) => requestImportConfirmation({ userId: ctx.user.id, ...input })),
    // Export → edit → re-import: what the file would change, row by row, before anything is written.
    diff: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), importId: z.string().uuid(), kind: z.enum(["new", "modified", "conflict", "all"]).optional(), offset: z.number().int().min(0).max(10_000_000).optional() })).query(({ ctx, input }) => previewImportDiff({ userId: ctx.user.id, ...input })),
    // The blank import template of a module, generated from the importer's own field table.
    template: protectedProcedure.input(z.object({ moduleCode: z.union([importModuleSchema, z.enum(LEDGER_MODULES)]), locale: z.enum(["ar", "en"]) })).mutation(({ input }) => buildImportTemplateForUser(input)),
    // Direct upload (work order 6): the file goes browser → Storage by a signed URL, and is analysed / imported by a job the screen polls.
    createUpload: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), moduleCode: uploadModuleSchema, fileName: z.string().trim().min(1).max(255), sourceFormat: z.enum(["xlsx", "csv", "xer"]), context: importContextSchema.optional() }).superRefine(importFormatRule)).mutation(({ ctx, input }) => createImportUpload({ userId: ctx.user.id, ...input })),
    registerUpload: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), moduleCode: uploadModuleSchema, fileName: z.string().trim().min(1).max(255), sourceFormat: z.enum(["xlsx", "csv", "xer"]), uploadKey: z.string().min(1).max(1024), context: importContextSchema.optional(), duplicateMode: importDuplicateModeSchema.optional(), mappingOverride: z.record(z.string().min(1).max(64), z.string().min(1).max(128)).refine(value => Object.keys(value).length <= 6, { message: "PROJECT_OS_IMPORT_MAPPING_INVALID" }).optional() }).superRefine(importFormatRule)).mutation(({ ctx, input }) => registerImportUpload({ userId: ctx.user.id, ...input })),
    progress: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), importId: z.string().uuid() })).query(({ ctx, input }) => getImportProgress({ userId: ctx.user.id, ...input })),
    export: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), moduleCode: z.enum(["wbs", "budget", "activities", "contracts", "materials", ...LEDGER_MODULES]), format: z.enum(["xlsx", "csv"]), locale: z.enum(["ar", "en"]) })).mutation(({ ctx, input }) => exportProjectData({ userId: ctx.user.id, ...input })),
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
    issueInvoice: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), subscriptionId: z.string().uuid(), subtotalAmount: z.number().finite().min(0), sellerName: z.string().trim().min(2).max(255), sellerTaxNumber: z.string().trim().min(2).max(80), buyerName: z.string().trim().min(2).max(255), buyerTaxNumber: z.string().trim().min(2).max(80), currency: riyalCurrency().optional() })).mutation(({ ctx, input }) => issueTenantInvoice({ userId: ctx.user.id, ...input })),
    createPayment: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), subscriptionId: z.string().uuid(), provider: z.enum(["manual", "mock"]), operation: z.enum(["create", "renew", "cancel", "refund"]), amount: z.number().finite().min(0), currency: riyalCurrency().optional(), invoiceId: z.string().uuid().optional() })).mutation(({ ctx, input }) => createTenantPayment({ userId: ctx.user.id, ...input })),
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
  masterPlanVision: masterPlanVisionRouter,
  masterPlans: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getMasterPlansForTenant({ userId: ctx.user.id, ...input })),
    visualizationRules: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getMasterPlanVisualizationRulesForTenant({ userId: ctx.user.id, ...input })),
    setVersionGeometry: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), masterPlanVersionId: z.string().uuid(), rotationDegrees: z.number().finite().min(-360).max(360), mapWidthMeters: z.number().finite().positive().max(100000).nullable().optional(), mapHeightMeters: z.number().finite().positive().max(100000).nullable().optional() })).mutation(({ ctx, input }) => setMasterPlanVersionGeometry({ userId: ctx.user.id, ...input })),
    updateEntityLayout: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), entityId: z.string().uuid(), parentEntityId: z.string().uuid().nullable().optional(), geometry: z.object({ x: z.number().finite(), y: z.number().finite(), width: z.number().finite(), height: z.number().finite() }).optional() })).mutation(({ ctx, input }) => updateMasterPlanEntityLayout({ userId: ctx.user.id, ...input })),
    setSnapshotSharing: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), snapshotId: z.string().uuid(), shared: z.boolean() })).mutation(({ ctx, input }) => setMasterPlanSnapshotSharing({ userId: ctx.user.id, ...input })),
    saveVisualizationRule: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() }).and(masterPlanVisualizationRuleSchema)).mutation(({ ctx, input }) => saveMasterPlanVisualizationRuleForTenant({ userId: ctx.user.id, ...input })),
    listSnapshots: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), masterPlanVersionId: z.string().uuid().optional() })).query(({ ctx, input }) => getMasterPlanSnapshotsForTenant({ userId: ctx.user.id, ...input })),
    createSnapshot: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), masterPlanVersionId: z.string().uuid(), label: z.string().trim().min(1).max(160), metric: z.enum(["progress", "status", "cost", "risk", "quality", "hse", "production", "custom"]), filters: z.object({ status: z.array(z.enum(["not_started", "in_progress", "completed", "blocked"])).max(4).optional(), entityTypes: z.array(z.enum(["block", "building", "zone", "unit", "area"])).max(5).optional(), codes: z.array(z.string().trim().min(1).max(120)).max(100).optional(), search: z.string().trim().max(120).optional(), wbsItemId: z.string().uuid().optional(), activityId: z.string().uuid().optional() }).strict(), viewport: z.object({ x: z.number().finite().min(-30).max(30), y: z.number().finite().min(-30).max(30), zoom: z.number().finite().min(0.25).max(10) }).strict(), layers: z.array(z.string().trim().min(1).max(80)).max(20) })).mutation(({ ctx, input }) => createMasterPlanSnapshotForTenant({ userId: ctx.user.id, ...input })),
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), code: z.string().trim().min(1).max(80), title: z.string().trim().min(1).max(255), description: z.string().trim().max(5000).optional(), sourceFileName: z.string().trim().min(1).max(255).optional(), sourceMimeType: z.string().trim().min(1).max(120).optional(), sourceContentBase64: z.string().min(4).max(14_000_000).optional() })).mutation(({ ctx, input }) => createMasterPlanForTenant({ userId: ctx.user.id, ...input })),
    createVersion: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), masterPlanId: z.string().uuid(), versionKind: z.enum(["revision", "updated"]), description: z.string().trim().max(5000).optional(), changeSummary: z.string().trim().max(5000).optional(), sourceFileName: z.string().trim().min(1).max(255).optional(), sourceMimeType: z.string().trim().min(1).max(120).optional(), sourceContentBase64: z.string().min(4).max(14_000_000).optional() })).mutation(({ ctx, input }) => createMasterPlanVersionForTenant({ userId: ctx.user.id, ...input })),
    createSpatialEntity: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), masterPlanVersionId: z.string().uuid(), parentEntityId: z.string().uuid().optional(), code: z.string().trim().min(1).max(120), name: z.string().trim().min(1).max(255), entityType: z.enum(["block", "building", "zone", "unit", "area"]), geometry: z.object({ x: z.number().finite(), y: z.number().finite(), width: z.number().finite(), height: z.number().finite() }), status: z.enum(["not_started", "in_progress", "completed", "blocked"]), progressPercent: z.number().min(0).max(100), plannedValue: z.number().min(0).optional(), actualValue: z.number().min(0).optional(), forecastValue: z.number().min(0).optional(), wbsItemId: z.string().uuid().optional(), activityId: z.string().uuid().optional() })).mutation(({ ctx, input }) => createMasterPlanSpatialEntityForTenant({ userId: ctx.user.id, ...input })),
    applyExcelMapping: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), masterPlanVersionId: z.string().uuid(), format: z.enum(["xlsx", "csv"]), base64: z.string().min(1).max(14_000_000) })).mutation(({ ctx, input }) => applyMasterPlanMappingFile({ userId: ctx.user.id, ...input })),
    importSpatialEntities: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), masterPlanVersionId: z.string().uuid(), format: z.enum(["xlsx", "csv"]), base64: z.string().min(1).max(14_000_000) })).mutation(({ ctx, input }) => importMasterPlanSpatialEntitiesFromFile({ userId: ctx.user.id, ...input })),
  }),
  tenantData: router({
    preview: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => previewTenantData({ userId: ctx.user.id, ...input })),
    requestDeletion: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).mutation(({ ctx, input }) => requestTenantDeletion({ userId: ctx.user.id, ...input })),
    confirmDeletion: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), confirmationToken: z.string().min(20).max(2000), typedName: z.string().min(1).max(255), understandsItCannotBeUndone: z.literal(true) })).mutation(({ ctx, input }) => confirmTenantDeletion({ userId: ctx.user.id, tenantId: input.tenantId, confirmationToken: input.confirmationToken, typedName: input.typedName })),
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
  labourSettings: router({
    get: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => getTenantLabourSettings({ userId: ctx.user.id, ...input })),
    save: protectedProcedure
      .input(z.object({ tenantId: z.string().uuid(), employerGosiRateSaudi: z.number().min(0).max(0.5), employerGosiRateNonSaudi: z.number().min(0).max(0.5), indirectLoadingPercent: z.number().min(0).max(300), hoursPerDay: z.number().gt(0).max(24), workingDays: z.array(z.number().int().min(0).max(6)).min(1).max(7), eosFirstPeriodYears: z.number().int().min(0).max(50), eosFirstPeriodMonthsPerYear: z.number().min(0).max(3), eosLaterMonthsPerYear: z.number().min(0).max(3) }))
      .mutation(({ ctx, input }) => saveTenantLabourSettings({ userId: ctx.user.id, ...input })),
  }),
  profitability: router({
    project: protectedProcedure
      .input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), eacMethod: z.enum(["bac_over_cpi", "ac_plus_remaining", "ac_plus_remaining_over_cpi_spi"]).optional() }))
      .query(({ ctx, input }) => getProjectProfitabilityForTenant({ userId: ctx.user.id, ...input })),
    cashFlow: protectedProcedure
      .input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() }))
      .query(({ ctx, input }) => getProjectCashFlowForTenant({ userId: ctx.user.id, ...input })),
    labour: protectedProcedure
      .input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() }))
      .query(({ ctx, input }) => getProjectLabourCostForTenant({ userId: ctx.user.id, ...input })),
    costBreakdown: protectedProcedure
      .input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), wbsItemId: z.string().uuid().optional() }))
      .query(({ ctx, input }) => getProfitabilityCostBreakdownForTenant({ userId: ctx.user.id, ...input })),
    history: protectedProcedure
      .input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() }))
      .query(({ ctx, input }) => getProfitabilityHistoryForTenant({ userId: ctx.user.id, ...input })),
    portfolio: protectedProcedure
      .input(z.object({ tenantId: z.string().uuid() }))
      .query(({ ctx, input }) => getPortfolioProfitabilityForTenant({ userId: ctx.user.id, ...input })),
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
  // Work order 12, items 4 to 7: the site's daily report, the consultant's submittals, the company's quality policy, and the card of a unit or an activity.
  siteReports: router({
    options: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => listFieldOptionsForTenant({ userId: ctx.user.id, ...input })),
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), status: z.enum(["draft", "submitted", "approved", "rejected"]).optional() })).query(({ ctx, input }) => listSiteDailyReportsForTenant({ userId: ctx.user.id, ...input })),
    get: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), reportId: z.string().uuid() })).query(({ ctx, input }) => getSiteDailyReportForTenant({ userId: ctx.user.id, ...input })),
    save: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), weather: z.string().trim().max(24).optional(), temperatureC: z.number().min(-50).max(70).optional(), summary: z.string().trim().max(5000).optional(), obstacles: z.string().trim().max(5000).optional(), lines: z.array(z.object({ lineType: z.enum(["labour", "equipment", "work"]), label: z.string().trim().max(160).optional(), quantity: z.number().finite().min(0).max(100000).optional(), hours: z.number().finite().min(0).max(24).optional(), description: z.string().trim().max(2000).optional(), pmcUnitId: z.string().uuid().optional(), pmcActivityDefinitionId: z.string().uuid().optional(), reportedStatus: z.enum(["NOT_STARTED", "IN_PROGRESS", "UNDER_REVIEW", "COMPLETE"]).optional() })).max(300) })).mutation(({ ctx, input }) => saveSiteDailyReportForTenant({ userId: ctx.user.id, ...input })),
    submit: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), reportId: z.string().uuid() })).mutation(({ ctx, input }) => submitSiteDailyReportForTenant({ userId: ctx.user.id, ...input })),
    review: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), reportId: z.string().uuid(), decision: z.enum(["approve", "reject"]), note: z.string().trim().max(500).optional(), dryRun: z.boolean().optional() })).mutation(({ ctx, input }) => reviewSiteDailyReportForTenant({ userId: ctx.user.id, ...input })),
    attachPhoto: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), reportId: z.string().uuid(), uploadKey: z.string().min(10).max(600), fileName: z.string().trim().min(1).max(255), caption: z.string().trim().max(255).optional() })).mutation(({ ctx, input }) => attachSiteReportPhotoForTenant({ userId: ctx.user.id, ...input })),
  }),
  submittals: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), status: z.enum(["draft", "sent", "replied", "closed"]).optional(), submittalType: z.enum(SUBMITTAL_TYPES).optional() })).query(({ ctx, input }) => listConsultantSubmittalsForTenant({ userId: ctx.user.id, ...input })),
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), submittalType: z.enum(SUBMITTAL_TYPES), submittalNumber: z.string().trim().min(1).max(120), title: z.string().trim().min(2).max(255), materialId: z.string().uuid().optional(), pmcUnitId: z.string().uuid().optional(), pmcActivityDefinitionId: z.string().uuid().optional(), dueAt: z.date().optional(), resubmissionOfId: z.string().uuid().optional(), consultant: z.string().trim().max(160).optional() })).mutation(({ ctx, input }) => createConsultantSubmittalForTenant({ userId: ctx.user.id, ...input })),
    send: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), submittalId: z.string().uuid(), sentAt: z.date().optional() })).mutation(({ ctx, input }) => sendConsultantSubmittalForTenant({ userId: ctx.user.id, ...input })),
    reply: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), submittalId: z.string().uuid(), replyCode: z.string().trim().min(1).max(8), replyNote: z.string().trim().max(500).optional(), repliedAt: z.date().optional() })).mutation(({ ctx, input }) => replyConsultantSubmittalForTenant({ userId: ctx.user.id, ...input })),
    close: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), submittalId: z.string().uuid() })).mutation(({ ctx, input }) => closeConsultantSubmittalForTenant({ userId: ctx.user.id, ...input })),
    replyCodes: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => listSubmittalReplyCodesForTenant({ userId: ctx.user.id, ...input })),
    saveReplyCodes: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), codes: z.array(z.object({ code: z.string().trim().min(1).max(4), labelAr: z.string().trim().min(1).max(120), labelEn: z.string().trim().min(1).max(120), approved: z.boolean(), active: z.boolean() })).min(2).max(12) })).mutation(({ ctx, input }) => saveSubmittalReplyCodesForManager({ userId: ctx.user.id, ...input })),
  }),
  policy: router({
    effective: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getEffectivePolicyForProject({ userId: ctx.user.id, ...input })),
    get: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => getTenantPolicyForManager({ userId: ctx.user.id, ...input })),
    set: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), qcCompletionMode: z.enum(["off", "warn", "block"]), qcAcceptedCodes: z.array(z.string().trim().min(1).max(4)).min(1).max(8), materialApprovalMode: z.enum(["off", "warn", "block"]), ncrAcceptanceMode: z.enum(["off", "warn", "block"]).optional() })).mutation(({ ctx, input }) => setTenantPolicyForManager({ userId: ctx.user.id, ...input })),
  }),
  cells: router({
    card: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), unitId: z.string().uuid(), activityDefinitionId: z.string().uuid().optional() })).query(({ ctx, input }) => getCellCardForTenant({ userId: ctx.user.id, ...input })),
  }),
  // Work order 12, items 8 and 9: the company manager's side of the integration layer (keys, webhooks, the exchange log, the mappings).
  integrations: router({
    scopes: protectedProcedure.query(() => ({ scopes: API_SCOPES, events: WEBHOOK_EVENTS, systems: integrationSystems, mappingTypes: MAPPING_TYPES, exportEntities: EXPORT_ENTITIES })),
    listKeys: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => listApiKeysForManager({ userId: ctx.user.id, ...input })),
    createKey: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), name: z.string().trim().min(2).max(120), scopes: z.array(z.enum(API_SCOPES)).min(1), rateLimitPerMinute: z.number().int().min(10).max(6000).optional(), expiresInDays: z.number().int().min(1).max(3650).optional() })).mutation(({ ctx, input }) => createApiKeyForManager({ userId: ctx.user.id, ...input })),
    revokeKey: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), keyId: z.string().uuid() })).mutation(({ ctx, input }) => revokeApiKeyForManager({ userId: ctx.user.id, ...input })),
    listWebhooks: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => listWebhookEndpointsForManager({ userId: ctx.user.id, ...input })),
    createWebhook: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), url: z.string().trim().url().max(500), events: z.array(z.string().max(40)).min(1).max(12) })).mutation(({ ctx, input }) => createWebhookEndpointForManager({ userId: ctx.user.id, ...input })),
    setWebhookActive: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), endpointId: z.string().uuid(), active: z.boolean() })).mutation(({ ctx, input }) => setWebhookEndpointActiveForManager({ userId: ctx.user.id, ...input })),
    webhookDeliveries: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), endpointId: z.string().uuid().optional() })).query(({ ctx, input }) => listWebhookDeliveriesForManager({ userId: ctx.user.id, ...input })),
    testWebhook: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), endpointId: z.string().uuid() })).mutation(({ ctx, input }) => sendTestWebhookForManager({ userId: ctx.user.id, ...input })),
    syncRuns: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => listSyncRunsForManager({ userId: ctx.user.id, ...input })),
    syncItems: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), runId: z.string().uuid(), outcome: z.enum(["created", "updated", "unchanged", "stored", "rejected"]).optional() })).query(({ ctx, input }) => listSyncItemsForManager({ userId: ctx.user.id, ...input })),
    mappings: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), system: z.string().max(24).optional(), type: z.enum(MAPPING_TYPES).optional() })).query(({ ctx, input }) => listMappingsForManager({ userId: ctx.user.id, ...input })),
    saveMappings: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), system: z.string().trim().min(1).max(24), type: z.enum(MAPPING_TYPES), records: z.array(z.object({ externalId: z.string().trim().min(1).max(120), ref: z.string().trim().min(1).max(120), project: z.string().trim().max(80).optional() })).min(1).max(1000) })).mutation(({ ctx, input }) => saveMappingsForManager({ userId: ctx.user.id, ...input })),
    listConnections: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => listConnectionsForManager({ userId: ctx.user.id, ...input })),
    createConnection: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), system: z.string().trim().min(1).max(24), name: z.string().trim().min(2).max(120), baseUrl: z.string().trim().url().max(500), database: z.string().trim().max(120).optional(), username: z.string().trim().max(255).optional(), secret: z.string().min(1).max(500), settings: z.record(z.string(), z.unknown()).optional(), scheduledDaily: z.boolean().optional() })).mutation(({ ctx, input }) => createConnectionForManager({ userId: ctx.user.id, ...input })),
    setConnectionActive: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), connectionId: z.string().uuid(), active: z.boolean(), scheduledDaily: z.boolean().optional() })).mutation(({ ctx, input }) => setConnectionActiveForManager({ userId: ctx.user.id, ...input })),
    testConnection: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), connectionId: z.string().uuid() })).mutation(({ ctx, input }) => testConnectionForManager({ userId: ctx.user.id, ...input })),
    runConnection: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), connectionId: z.string().uuid(), direction: z.enum(["in", "out", "both"]) })).mutation(({ ctx, input }) => runConnectionForManager({ userId: ctx.user.id, ...input })),
  }),
  // The four levels a role works at (work order 12, item 2): each answers over exactly the projects the caller's own assignment covers.
  scopes: router({
    company: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => getCompanyLevel({ userId: ctx.user.id, ...input })),
    portfolio: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => getPortfolioLevel({ userId: ctx.user.id, ...input })),
    project: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getProjectLevel({ userId: ctx.user.id, ...input })),
    warehouse: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), warehouseId: z.string().uuid() })).query(({ ctx, input }) => getWarehouseLevel({ userId: ctx.user.id, ...input })),
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
      currency: riyalCurrency(),
    })).mutation(({ ctx, input }) => createProjectForTenant({ userId: ctx.user.id, ...input })),
    transitionLifecycle: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), lifecycleStage: z.enum(["opportunity", "pre_award", "tender", "award", "mobilization", "planning", "design", "procurement", "execution", "commissioning", "handover", "closeout", "post_project_review"]) })).mutation(({ ctx, input }) => transitionProjectLifecycle({ userId: ctx.user.id, ...input })),
  }),
  contracts: router({
    getProjectRegister: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getContractsCommitmentsForTenant({ userId: ctx.user.id, ...input })),
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), code: z.string().trim().min(1).max(80), title: z.string().trim().min(2).max(255), counterparty: z.string().trim().min(2).max(255), counterpartyKind: z.enum(["client", "supplier", "other"]).optional(), supplierId: z.string().uuid().optional(), contractValue: z.number().finite().nonnegative(), currency: riyalCurrency(), startAt: z.date().optional(), endAt: z.date().optional() })).mutation(({ ctx, input }) => createContractForTenant({ userId: ctx.user.id, ...input })),
    createCommitment: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), contractId: z.string().uuid().optional(), code: z.string().trim().min(1).max(80), description: z.string().trim().min(2).max(255), amount: z.number().finite().positive(), currency: riyalCurrency(), committedAt: z.date().optional() })).mutation(({ ctx, input }) => createCommitmentForTenant({ userId: ctx.user.id, ...input })),
  }),
  // The signed URL a browser uploads an attachment or a site plan to (G-139); the screen's own procedure then takes the `uploadKey`.
  directUploads: router({
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), purpose: z.enum(DIRECT_UPLOAD_PURPOSES), fileName: z.string().trim().min(1).max(255), contentType: z.string().trim().min(3).max(120) })).mutation(({ ctx, input }) => createDirectUpload({ userId: ctx.user.id, ...input })),
  }),
  documents: router({
    getProjectRegister: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getProjectDocumentsForTenant({ userId: ctx.user.id, ...input })),
    createWithVersion: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), documentNumber: z.string().trim().min(1).max(120), title: z.string().trim().min(2).max(255), category: z.enum(["drawing", "specification", "method_statement", "report", "correspondence", "commercial", "other"]), originalName: z.string().trim().min(1).max(255), mimeType: z.string().trim().min(3).max(120), }).and(z.union([z.object({ contentBase64: z.string().min(4).max(14_000_000) }), z.object({ uploadKey: z.string().min(1).max(1024) })]))).mutation(({ ctx, input }) => createProjectDocumentWithVersion({ userId: ctx.user.id, ...input })),
    addVersion: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), documentId: z.string().uuid(), originalName: z.string().trim().min(1).max(255), mimeType: z.string().trim().min(3).max(120), }).and(z.union([z.object({ contentBase64: z.string().min(4).max(14_000_000) }), z.object({ uploadKey: z.string().min(1).max(1024) })]))).mutation(({ ctx, input }) => addProjectDocumentVersion({ userId: ctx.user.id, ...input })),
    transitionStatus: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), documentId: z.string().uuid(), nextStatus: z.enum(["draft", "for_review", "approved", "superseded", "archived"]) })).mutation(({ ctx, input }) => transitionProjectDocumentStatus({ userId: ctx.user.id, ...input })),
  }),
  rfis: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getRfisForTenant({ userId: ctx.user.id, ...input })),
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), rfiNumber: z.string().trim().min(1).max(120), subject: z.string().trim().min(2).max(255), question: z.string().trim().min(5).max(10_000), dueAt: z.date().optional() })).mutation(({ ctx, input }) => createRfiForTenant({ userId: ctx.user.id, ...input })),
    transitionStatus: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), rfiId: z.string().uuid(), nextStatus: z.enum(["draft", "submitted", "under_review", "answered", "closed", "cancelled"]) })).mutation(({ ctx, input }) => transitionRfiStatus({ userId: ctx.user.id, ...input })),
  }),
  design: router({
    dashboard: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getDesignDashboard({ userId: ctx.user.id, ...input })),
    drawings: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => listDesignDrawings({ userId: ctx.user.id, ...input })),
    revisions: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), drawingId: z.string().uuid() })).query(({ ctx, input }) => listDesignRevisions({ userId: ctx.user.id, ...input })),
    transmittals: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => listDesignTransmittals({ userId: ctx.user.id, ...input })),
    comments: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => listDesignComments({ userId: ctx.user.id, ...input })),
    submittals: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => listDesignSubmittals({ userId: ctx.user.id, ...input })),
    registerDrawing: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), drawingNumber: z.string().trim().min(1).max(120), title: z.string().trim().min(2).max(255), discipline: z.enum(DESIGN_DISCIPLINES), revision: z.string().trim().min(1).max(20), description: z.string().trim().max(500).optional() })).mutation(({ ctx, input }) => registerDesignDrawing({ userId: ctx.user.id, ...input })),
    addRevision: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), drawingId: z.string().uuid(), revision: z.string().trim().min(1).max(20), description: z.string().trim().max(500).optional() })).mutation(({ ctx, input }) => addDesignRevision({ userId: ctx.user.id, ...input })),
    cancelDrawing: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), drawingId: z.string().uuid() })).mutation(({ ctx, input }) => cancelDesignDrawing({ userId: ctx.user.id, ...input })),
    approveDrawing: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), drawingId: z.string().uuid() })).mutation(({ ctx, input }) => approveDesignDrawing({ userId: ctx.user.id, ...input })),
    createTransmittal: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), transmittalNumber: z.string().trim().min(1).max(120), direction: z.enum(TRANSMITTAL_DIRECTIONS), counterparty: z.string().trim().min(2).max(255), subject: z.string().trim().min(2).max(255), revisionIds: z.array(z.string().uuid()).min(1).max(200) })).mutation(({ ctx, input }) => createDesignTransmittal({ userId: ctx.user.id, ...input })),
    transitionTransmittal: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), transmittalId: z.string().uuid(), nextStatus: z.enum(["sent", "acknowledged"]) })).mutation(({ ctx, input }) => transitionDesignTransmittal({ userId: ctx.user.id, ...input })),
    raiseComment: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), drawingId: z.string().uuid(), commentNumber: z.string().trim().min(1).max(120), raisedBy: z.string().trim().min(2).max(255), severity: z.enum(COMMENT_SEVERITIES), commentText: z.string().trim().min(3).max(4000), dueAt: z.date().optional() })).mutation(({ ctx, input }) => raiseDesignComment({ userId: ctx.user.id, ...input })),
    transitionComment: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), commentId: z.string().uuid(), nextStatus: z.enum(COMMENT_STATUSES), responseText: z.string().trim().max(4000).optional() })).mutation(({ ctx, input }) => transitionDesignComment({ userId: ctx.user.id, ...input })),
    createSubmittal: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), submittalNumber: z.string().trim().min(1).max(120), title: z.string().trim().min(2).max(255), discipline: z.enum(DESIGN_DISCIPLINES), drawingId: z.string().uuid().optional(), resubmissionOfId: z.string().uuid().optional(), dueAt: z.date().optional(), consultant: z.string().trim().max(160).optional() })).mutation(({ ctx, input }) => createDesignSubmittal({ userId: ctx.user.id, ...input })),
    transitionSubmittal: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), submittalId: z.string().uuid(), nextStatus: z.enum(["submitted", "replied", "closed"]), replyCode: z.enum(SUBMITTAL_REPLY_CODES).optional(), replyNote: z.string().trim().max(4000).optional() })).mutation(({ ctx, input }) => transitionDesignSubmittal({ userId: ctx.user.id, ...input })),
  }),
  tenders: router({
    suppliers: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => listTenderSuppliers({ userId: ctx.user.id, ...input })),
    packages: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), limit: z.number().int().min(1).max(500).optional(), offset: z.number().int().min(0).optional() })).query(({ ctx, input }) => listTenderPackages({ userId: ctx.user.id, ...input })),
    invitees: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), packageId: z.string().uuid() })).query(({ ctx, input }) => listTenderInvitees({ userId: ctx.user.id, ...input })),
    comparison: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), packageId: z.string().uuid() })).query(({ ctx, input }) => getTenderComparison({ userId: ctx.user.id, ...input })),
    createPackage: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), packageCode: z.string().trim().min(1).max(120), title: z.string().trim().min(2).max(255), scopeSummary: z.string().trim().max(4000).optional(), estimateAmount: z.number().finite().min(0).optional(), currency: riyalCurrency("PROJECT_OS_TENDER_CURRENCY_NOT_SAR"), closingAt: z.date().optional() })).mutation(({ ctx, input }) => createTenderPackage({ userId: ctx.user.id, ...input })),
    invite: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), packageId: z.string().uuid(), supplierId: z.string().uuid() })).mutation(({ ctx, input }) => inviteTenderSupplier({ userId: ctx.user.id, ...input })),
    transitionPackage: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), packageId: z.string().uuid(), nextStatus: z.enum(["open", "closed", "cancelled"]) })).mutation(({ ctx, input }) => transitionTenderPackage({ userId: ctx.user.id, ...input })),
    enterBid: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), packageId: z.string().uuid(), supplierId: z.string().uuid(), amount: z.number().finite().positive(), currency: riyalCurrency("PROJECT_OS_TENDER_CURRENCY_NOT_SAR").optional(), durationDays: z.number().int().min(1).max(5000).optional(), validityDays: z.number().int().min(1).max(1000).optional(), notes: z.string().trim().max(4000).optional() })).mutation(({ ctx, input }) => enterTenderBid({ userId: ctx.user.id, ...input })),
    reviseBid: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), bidId: z.string().uuid(), amount: z.number().finite().positive(), durationDays: z.number().int().min(1).max(5000).optional(), validityDays: z.number().int().min(1).max(1000).optional(), notes: z.string().trim().max(4000).optional() })).mutation(({ ctx, input }) => reviseTenderBid({ userId: ctx.user.id, ...input })),
    withdrawBid: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), bidId: z.string().uuid(), reason: z.string().trim().max(500).optional() })).mutation(({ ctx, input }) => withdrawTenderBid({ userId: ctx.user.id, ...input })),
    disqualifyBid: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), bidId: z.string().uuid(), reason: z.string().trim().min(3).max(500) })).mutation(({ ctx, input }) => disqualifyTenderBid({ userId: ctx.user.id, ...input })),
    addAdjustment: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), bidId: z.string().uuid(), kind: z.enum(ADJUSTMENT_KINDS), description: z.string().trim().min(3).max(500), amount: z.number().finite().refine(value => value !== 0) })).mutation(({ ctx, input }) => addTenderBidAdjustment({ userId: ctx.user.id, ...input })),
    removeAdjustment: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), adjustmentId: z.string().uuid() })).mutation(({ ctx, input }) => removeTenderBidAdjustment({ userId: ctx.user.id, ...input })),
    award: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), packageId: z.string().uuid(), bidId: z.string().uuid(), contractCode: z.string().trim().min(1).max(70), justification: z.string().trim().max(2000).optional() })).mutation(({ ctx, input }) => awardTender({ userId: ctx.user.id, ...input })),
  }),
  ncrs: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getNcrsForTenant({ userId: ctx.user.id, ...input })),
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), ncrNumber: z.string().trim().min(1).max(120), title: z.string().trim().min(2).max(255), description: z.string().trim().min(5).max(10_000), dueAt: z.date().optional(), pmcUnitId: z.string().uuid().optional(), pmcActivityDefinitionId: z.string().uuid().optional() })).mutation(({ ctx, input }) => createNcrForTenant({ userId: ctx.user.id, ...input })),
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
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), contractId: z.string().uuid().optional(), commitmentId: z.string().uuid().optional(), wbsItemId: z.string().uuid().optional(), supplierId: z.string().uuid().optional(), purchaseOrderNumber: z.string().trim().min(1).max(120), supplierName: z.string().trim().min(2).max(240).optional(), orderDate: z.date(), amount: z.number().finite().positive().max(999_999_999_999.99), currency: riyalCurrency(), summary: z.string().trim().min(5).max(10_000) })).mutation(({ ctx, input }) => createPurchaseOrderForTenant({ userId: ctx.user.id, ...input })),
    transitionStatus: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), purchaseOrderId: z.string().uuid(), nextStatus: z.enum(["draft", "submitted", "approved", "issued", "received", "cancelled"]) })).mutation(({ ctx, input }) => transitionPurchaseOrderStatus({ userId: ctx.user.id, ...input })),
  }),
  resources: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getProjectResourcesForTenant({ userId: ctx.user.id, ...input })),
    create: protectedProcedure
      .input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), resourceCode: z.string().trim().min(1).max(120), name: z.string().trim().min(2).max(255), resourceType: z.enum(["labor", "equipment", "material", "service"]), plannedUnits: z.number().finite().nonnegative(), allocatedUnits: z.number().finite().nonnegative(), unitCost: z.number().finite().nonnegative(), currency: riyalCurrency() }).refine(value => value.allocatedUnits <= value.plannedUnits, { message: "PROJECT_OS_RESOURCE_ALLOCATION_EXCEEDS_PLAN", path: ["allocatedUnits"] }))
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
        save: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), employeeId: z.string().uuid(), baseSalary: z.number().finite().nonnegative(), housingAllowance: z.number().finite().nonnegative().default(0), transportAllowance: z.number().finite().nonnegative().default(0), hardshipAllowance: z.number().finite().nonnegative().default(0), gosiRate: z.number().finite().min(0).max(1).default(0), otherDeductions: z.number().finite().nonnegative().default(0), eosAccrualMode: z.enum(["computed", "manual"]).default("computed"), eosMonthlyAccrual: z.number().finite().nonnegative().default(0), currency: riyalCurrency() })).mutation(({ ctx, input }) => saveSalaryStructureForTenant({ userId: ctx.user.id, ...input })),
      }),
      createRun: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), periodStart: z.date(), periodEnd: z.date() }).refine(value => value.periodEnd >= value.periodStart, { message: "PROJECT_OS_PAYROLL_PERIOD_INVALID", path: ["periodEnd"] })).mutation(({ ctx, input }) => createPayrollRunForTenant({ userId: ctx.user.id, ...input })),
      eosLiability: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => getEndOfServiceLiabilityForTenant({ userId: ctx.user.id, ...input })),
      details: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), payrollRunId: z.string().uuid() })).query(({ ctx, input }) => getPayrollRunDetailsForTenant({ userId: ctx.user.id, ...input })),
      transition: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), payrollRunId: z.string().uuid(), status: z.enum(["review", "approved", "paid"]) })).mutation(({ ctx, input }) => transitionPayrollRunForTenant({ userId: ctx.user.id, ...input })),
      allocateByHours: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), payrollEntryId: z.string().uuid() })).mutation(({ ctx, input }) => allocatePayrollEntryByHoursForTenant({ userId: ctx.user.id, ...input })),
      adjustAllocation: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), allocationId: z.string().uuid(), newAmount: z.number().finite().nonnegative(), reason: z.string().trim().min(5).max(500) })).mutation(({ ctx, input }) => adjustPayrollAllocationForTenant({ userId: ctx.user.id, ...input })),
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
    recordInventory: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), warehouseId: z.string().uuid(), materialId: z.string().uuid(), requisitionId: z.string().uuid().optional(), transactionType: z.enum(["receipt", "issue", "adjustment"]), quantityDelta: z.number().finite().refine(value => value !== 0, { message: "PROJECT_OS_INVENTORY_DELTA_INVALID" }), unitCost: z.number().finite().positive({ message: "PROJECT_OS_INVENTORY_UNIT_COST_INVALID" }).optional(), referenceNumber: z.string().trim().max(120).optional(), note: z.string().trim().max(500).optional(), occurredAt: z.date() })).mutation(({ ctx, input }) => recordWarehouseInventoryTransactionForTenant({ userId: ctx.user.id, ...input })),
    issueToWork: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), warehouseId: z.string().uuid(), materialId: z.string().uuid(), wbsItemId: z.string().uuid(), activityId: z.string().uuid().optional(), issuedQuantity: z.number().finite().positive({ message: "PROJECT_OS_MATERIAL_ISSUE_AMOUNT_INVALID" }), unitCost: z.number().finite().positive({ message: "PROJECT_OS_MATERIAL_ISSUE_AMOUNT_INVALID" }).optional(), referenceNumber: z.string().trim().max(120).optional(), note: z.string().trim().max(500).optional(), issuedAt: z.date(), clientRequestId: z.string().uuid().optional() })).mutation(({ ctx, input: { clientRequestId, ...input } }) => withClientRequest({ tenantId: input.tenantId, userId: ctx.user.id, requestId: clientRequestId, action: "warehouses.issueToWork" }, () => createMaterialIssueForTenant({ userId: ctx.user.id, ...input }))),
    transferInventory: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), sourceWarehouseId: z.string().uuid(), destinationWarehouseId: z.string().uuid(), materialId: z.string().uuid(), quantity: z.number().finite().positive({ message: "PROJECT_OS_INVENTORY_TRANSFER_QUANTITY_INVALID" }), referenceNumber: z.string().trim().max(120).optional(), note: z.string().trim().max(500).optional(), transferredAt: z.date() })).mutation(({ ctx, input }) => transferWarehouseInventoryForTenant({ userId: ctx.user.id, ...input })),
    // Work order 12, item 3
    returnToWarehouse: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), materialIssueId: z.string().uuid(), quantity: z.number().finite().positive({ message: "PROJECT_OS_MATERIAL_RETURN_QUANTITY_INVALID" }), reason: z.string().trim().max(500), returnedAt: z.date(), warehouseId: z.string().uuid().optional(), clientRequestId: z.string().uuid().optional() })).mutation(({ ctx, input: { clientRequestId, ...input } }) => withClientRequest({ tenantId: input.tenantId, userId: ctx.user.id, requestId: clientRequestId, action: "warehouses.returnToWarehouse" }, () => returnMaterialToWarehouseForTenant({ userId: ctx.user.id, ...input }))),
    transferBetweenProjects: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), sourceProjectId: z.string().uuid(), sourceWarehouseId: z.string().uuid(), destinationProjectId: z.string().uuid(), destinationWarehouseId: z.string().uuid(), materialId: z.string().uuid(), quantity: z.number().finite().positive({ message: "PROJECT_OS_INVENTORY_TRANSFER_QUANTITY_INVALID" }), reason: z.string().trim().max(500), transferredAt: z.date(), referenceNumber: z.string().trim().max(120).optional() })).mutation(({ ctx, input }) => transferBetweenProjectsForTenant({ userId: ctx.user.id, ...input })),
    stocktake: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), warehouseId: z.string().uuid(), note: z.string().trim().max(500), reference: z.string().trim().max(120).optional(), countedAt: z.date(), lines: z.array(z.object({ materialId: z.string().uuid(), countedQuantity: z.number().finite().min(0) })).min(1).max(2000) })).mutation(({ ctx, input }) => recordStocktakeForTenant({ userId: ctx.user.id, ...input })),
    cellOptions: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getIssueCellOptionsForTenant({ userId: ctx.user.id, ...input })),
    findMaterial: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), warehouseId: z.string().uuid(), query: z.string().trim().min(1).max(120) })).query(({ ctx, input }) => findMaterialForTenant({ userId: ctx.user.id, ...input })),
    issueToCell: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), warehouseId: z.string().uuid(), materialId: z.string().uuid(), pmcUnitId: z.string().uuid(), pmcActivityDefinitionId: z.string().uuid(), issuedQuantity: z.number().finite().positive({ message: "PROJECT_OS_MATERIAL_ISSUE_AMOUNT_INVALID" }), issuedAt: z.date(), referenceNumber: z.string().trim().max(120).optional(), note: z.string().trim().max(500).optional(), clientRequestId: z.string().uuid().optional() })).mutation(({ ctx, input: { clientRequestId, ...input } }) => withClientRequest({ tenantId: input.tenantId, userId: ctx.user.id, requestId: clientRequestId, action: "warehouses.issueToCell" }, () => issueMaterialToCellForTenant({ userId: ctx.user.id, ...input }))),
  }),
  goodsReceipts: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getGoodsReceiptNotesForTenant({ userId: ctx.user.id, ...input })),
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), grnNumber: z.string().trim().min(1).max(120), purchaseOrderId: z.string().uuid(), materialId: z.string().uuid(), receivedQuantity: z.number().finite().nonnegative(), rejectedQuantity: z.number().finite().nonnegative(), unitCost: z.number().finite().positive(), unitOfMeasure: z.string().trim().min(1).max(40), receivedAt: z.date(), receiptMode: z.enum(["warehouse_stock", "direct_to_site"]).default("warehouse_stock"), warehouseId: z.string().uuid().optional(), qualityInspectionId: z.string().uuid().optional(), ncrId: z.string().uuid().optional(), note: z.string().trim().max(10_000).optional(), clientRequestId: z.string().uuid().optional() }).refine(value => value.receivedQuantity + value.rejectedQuantity > 0, { message: "PROJECT_OS_GRN_QUANTITY_INVALID" }).refine(value => value.rejectedQuantity > 0 ? Boolean(value.qualityInspectionId && value.ncrId) : !value.qualityInspectionId && !value.ncrId, { message: "PROJECT_OS_GRN_REJECTION_EVIDENCE_REQUIRED" })).mutation(({ ctx, input: { clientRequestId, ...input } }) => withClientRequest({ tenantId: input.tenantId, userId: ctx.user.id, requestId: clientRequestId, action: "goodsReceipts.create" }, () => createGoodsReceiptNoteForTenant({ userId: ctx.user.id, ...input }))),
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
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), contractId: z.string().uuid().optional(), claimNumber: z.string().trim().min(1).max(120), title: z.string().trim().min(2).max(255), description: z.string().trim().min(5).max(10_000), claimedAmount: z.number().finite().nonnegative(), currency: riyalCurrency() })).mutation(({ ctx, input }) => createClaimForTenant({ userId: ctx.user.id, ...input })),
    transitionStatus: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), claimId: z.string().uuid(), nextStatus: z.enum(["submitted", "under_review", "approved", "rejected", "withdrawn"]), approvedAmount: z.number().finite().nonnegative().optional() })).mutation(({ ctx, input }) => transitionClaimStatus({ userId: ctx.user.id, ...input })),
  }),
  advisor: router({
    project: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), locale: z.enum(["ar", "en"]) })).mutation(({ ctx, input }) => generateProjectAdvisoryForTenant({ userId: ctx.user.id, ...input })),
  }),
  boq: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getBoqItemsForTenant({ userId: ctx.user.id, ...input })),
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), wbsItemId: z.string().uuid().optional(), code: z.string().trim().min(1).max(80), description: z.string().trim().min(1), unitOfMeasure: z.string().trim().min(1).max(40), quantity: z.number().finite(), unitRate: z.number().finite(), currency: riyalCurrency().optional() })).mutation(({ ctx, input }) => createBoqItemForTenant({ userId: ctx.user.id, ...input })),
  }),
  subcontracts: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getSubcontractContractsForTenant({ userId: ctx.user.id, ...input })),
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), code: z.string().trim().min(1).max(80), title: z.string().trim().min(1).max(255), subcontractorName: z.string().trim().min(1).max(255), supplierId: z.string().uuid().optional(), contractValue: z.number().finite().min(0), retentionPercent: z.number().finite().min(0).max(100).optional(), advancePercent: z.number().finite().min(0).max(100).optional() })).mutation(({ ctx, input }) => createSubcontractContractForTenant({ userId: ctx.user.id, ...input })),
    listCertificates: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), subcontractId: z.string().uuid().optional() })).query(({ ctx, input }) => getSubcontractCertificatesForTenant({ userId: ctx.user.id, ...input })),
    createCertificate: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), subcontractId: z.string().uuid(), certificateNumber: z.string().trim().min(1).max(80), periodStart: z.date(), periodEnd: z.date(), lines: z.array(z.object({ boqItemId: z.string().uuid(), currentQuantity: z.number().finite() })).min(1) })).mutation(({ ctx, input }) => createSubcontractCertificateForTenant({ userId: ctx.user.id, ...input })),
  }),
  projectInvoices: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getProjectCommercialInvoicesForTenant({ userId: ctx.user.id, ...input })),
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), invoiceNumber: z.string().trim().min(1).max(80), invoiceDate: z.date(), clientName: z.string().trim().min(1).max(255), amount: z.number().finite().min(0), vatAmount: z.number().finite().min(0), currency: riyalCurrency().optional() })).mutation(({ ctx, input }) => createProjectCommercialInvoiceForTenant({ userId: ctx.user.id, ...input })),
    transitionStatus: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), invoiceId: z.string().uuid(), nextStatus: z.enum(["issued", "paid", "void"]), paidAt: z.date().optional() })).mutation(({ ctx, input }) => transitionProjectCommercialInvoiceStatus({ userId: ctx.user.id, ...input })),
  }),
  changes: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getChangeRequestsForTenant({ userId: ctx.user.id, ...input })),
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), changeNumber: z.string().trim().min(1).max(120), title: z.string().trim().min(2).max(255), description: z.string().trim().min(5).max(10_000), impactScheduleDays: z.number().int().min(0).max(3650), impactCost: z.number().finite().nonnegative(), contractValueImpact: z.number().finite().min(-1_000_000_000_000).max(1_000_000_000_000).optional(), currency: riyalCurrency() })).mutation(({ ctx, input }) => createChangeRequestForTenant({ userId: ctx.user.id, ...input })),
    transitionStatus: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), changeRequestId: z.string().uuid(), nextStatus: z.enum(["draft", "submitted", "under_review", "approved", "rejected", "cancelled"]) })).mutation(({ ctx, input }) => transitionChangeRequestStatus({ userId: ctx.user.id, ...input })),
  }),
  fieldEntry: router({
    context: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getFieldEntryContextForTenant({ userId: ctx.user.id, ...input })),
  }),
  wbs: router({
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), code: z.string().trim().min(1).max(80), name: z.string().trim().min(2).max(255), parentId: z.string().uuid().optional(), plannedValue: z.number().finite().nonnegative().optional() })).mutation(({ ctx, input }) => createWbsItem({ userId: ctx.user.id, ...input })),
  }),
  activities: router({
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), wbsItemId: z.string().uuid().optional(), code: z.string().trim().min(1).max(80), name: z.string().trim().min(2).max(255), plannedValue: z.number().finite().nonnegative().optional(), plannedStartAt: z.date(), plannedFinishAt: z.date() })).mutation(({ ctx, input }) => createActivity({ userId: ctx.user.id, ...input })),
  }),
  costs: router({
    createActual: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), wbsItemId: z.string().uuid().optional(), amount: z.number().finite().positive(), incurredAt: z.date(), category: z.enum(["materials", "labour", "subcontract", "other"]).optional() })).mutation(({ ctx, input }) => createCostEntry({ userId: ctx.user.id, ...input })),
  }),
  teamHours: router({
    sheet: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), workDate: z.date() })).query(({ ctx, input }) => getTeamHoursSheetForTenant({ userId: ctx.user.id, ...input })),
    save: protectedProcedure
      .input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), workDate: z.date(), entries: z.array(z.object({ assignmentId: z.string().uuid(), actualHours: z.number().gt(0).max(24), reportedProgressPercent: z.number().min(0).max(100).optional() })).min(1).max(200), clientRequestId: z.string().uuid().optional() }))
      .mutation(({ ctx, input: { clientRequestId, ...input } }) => withClientRequest({ tenantId: input.tenantId, userId: ctx.user.id, requestId: clientRequestId, action: "teamHours.save" }, () => createTeamTimeEntriesForTenant({ userId: ctx.user.id, ...input }))),
  }),
  progress: router({
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), wbsItemId: z.string().uuid(), percentComplete: z.number().min(0).max(100), reportedAt: z.date(), clientRequestId: z.string().uuid().optional() })).mutation(({ ctx, input: { clientRequestId, ...input } }) => withClientRequest({ tenantId: input.tenantId, userId: ctx.user.id, requestId: clientRequestId, action: "progress.create" }, () => createProgressEntry({ userId: ctx.user.id, ...input }))),
  }),
  budgets: router({
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), wbsItemId: z.string().uuid().optional(), costCode: z.string().trim().min(1).max(80), originalAmount: z.number().finite().nonnegative(), currentAmount: z.number().finite().nonnegative() })).mutation(({ ctx, input }) => createBudgetLine({ userId: ctx.user.id, ...input })),
  }),
});

export type AppRouter = typeof appRouter;
