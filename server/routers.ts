import { z } from "zod";
import { productCodes } from "../drizzle/schema";
import { acceptMembershipInvitation, acknowledgeInternalNotification, addProjectDocumentVersion, assignTenantMember, assignTenantMembershipRole, captureOperationalEvmSnapshot, captureProjectHealthSnapshot, confirmAndImportData, createAction, createActivity, createAndAnalyzeDataImport, createBudgetLine, createChangeRequestForTenant, createClaimForTenant, createCommitmentForTenant, createContractForTenant, createCostEntry, createDataExport, createDecision, createHseObservationForTenant, createIssue, createMasterPlanForTenant, createMasterPlanSpatialEntityForTenant, createMasterPlanVersionForTenant, createMembershipInvitation, createNcrForTenant, createPortfolioForTenant, createProgramForTenant, createProgressEntry, createProjectDocumentWithVersion, createProjectForTenant, createProjectResourceForTenant, createRfiForTenant, createRisk, createTenantForUser, createTenantRole, createWbsItem, findAssignableTenantUser, generateProjectAdvisoryForTenant, getChangeRequestsForTenant, getClaimsForTenant, getCommercialCatalogForAdministrator, getContractsCommitmentsForTenant, getDataImportsForTenant, getExecutiveDashboard, getHseObservationsForTenant, getInternalNotificationsForTenant, getMasterPlansForTenant, getNcrsForTenant, getPmoDashboard, getProjectControlsForTenant, getProjectDocumentsForTenant, getProjectResourcesForTenant, getRfisForTenant, getTenantAccessSnapshot, getTenantAdministration, getTenantLicenseForManager, getTenantNavigationForUser, linkProjectToProgramForTenant, listProjectsForTenant, listTenantsForUser, provisionTenantLicense, revokeTenantMembershipRole, saveEvmSnapshot, setTenantLicenseFeatureOverride, transitionActionEscalation, transitionChangeRequestStatus, transitionClaimStatus, transitionHseObservationStatus, transitionIssueEscalation, transitionNcrStatus, transitionProjectDocumentStatus, transitionProjectLifecycle, transitionRfiStatus, transitionTenantLicenseStatus, updateProjectResourceAllocationForTenant, updateTenantRole } from "./db";
import { applyMasterPlanMappingFile, importMasterPlanSpatialEntitiesFromFile } from "./db";
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
  dataImports: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid().optional() })).query(({ ctx, input }) => getDataImportsForTenant({ userId: ctx.user.id, ...input })),
    analyze: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), moduleCode: z.enum(["wbs", "budget"]), fileName: z.string().trim().min(1).max(255), sourceFormat: z.enum(["xlsx", "csv"]), base64: z.string().min(1).max(14_000_000) })).mutation(({ ctx, input }) => createAndAnalyzeDataImport({ userId: ctx.user.id, ...input })),
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
  masterPlans: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getMasterPlansForTenant({ userId: ctx.user.id, ...input })),
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
    pmo: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => getPmoDashboard({ userId: ctx.user.id, ...input })),
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
  resources: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getProjectResourcesForTenant({ userId: ctx.user.id, ...input })),
    create: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), resourceCode: z.string().trim().min(1).max(120), name: z.string().trim().min(2).max(255), resourceType: z.enum(["labor", "equipment", "material", "service"]), plannedUnits: z.number().finite().nonnegative(), allocatedUnits: z.number().finite().nonnegative(), unitCost: z.number().finite().nonnegative(), currency: z.string().length(3).transform(value => value.toUpperCase()) }).refine(value => value.allocatedUnits <= value.plannedUnits, { message: "PROJECT_OS_RESOURCE_ALLOCATION_EXCEEDS_PLAN", path: ["allocatedUnits"] })).mutation(({ ctx, input }) => createProjectResourceForTenant({ userId: ctx.user.id, ...input })),
    updateAllocation: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), resourceId: z.string().uuid(), allocatedUnits: z.number().finite().nonnegative() })).mutation(({ ctx, input }) => updateProjectResourceAllocationForTenant({ userId: ctx.user.id, ...input })),
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
