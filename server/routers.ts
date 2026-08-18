import { z } from "zod";
import { productCodes } from "../drizzle/schema";
import { assignTenantMember, assignTenantMembershipRole, captureOperationalEvmSnapshot, createAction, createActivity, createBudgetLine, createCostEntry, createDecision, createIssue, createProgressEntry, createProjectForTenant, createRisk, createTenantForUser, createTenantRole, createWbsItem, findAssignableTenantUser, getExecutiveDashboard, getPmoDashboard, getProjectControlsForTenant, getTenantAccessSnapshot, getTenantAdministration, listProjectsForTenant, listTenantsForUser, revokeTenantMembershipRole, saveEvmSnapshot, updateTenantRole } from "./db";
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
  tenant: router({
    mine: protectedProcedure.query(({ ctx }) => listTenantsForUser(ctx.user.id)),
    administration: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => getTenantAdministration({ userId: ctx.user.id, ...input })),
    findAssignableUser: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), email: z.string().trim().email().max(320) })).query(({ ctx, input }) => findAssignableTenantUser({ userId: ctx.user.id, ...input })),
    createRole: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), code: z.string().trim().min(3).max(80).regex(/^[A-Za-z0-9_ -]+$/), name: z.string().trim().min(2).max(160), productCode: z.enum(productCodes), permissionCodes: z.array(z.string().trim().min(3).max(120)).min(1).max(30) })).mutation(({ ctx, input }) => createTenantRole({ actorUserId: ctx.user.id, ...input })),
    updateRole: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), roleId: z.string().uuid(), name: z.string().trim().min(2).max(160), permissionCodes: z.array(z.string().trim().min(3).max(120)).min(1).max(30) })).mutation(({ ctx, input }) => updateTenantRole({ actorUserId: ctx.user.id, ...input })),
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
  }),
  dashboards: router({
    executive: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => getExecutiveDashboard({ userId: ctx.user.id, ...input })),
    pmo: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => getPmoDashboard({ userId: ctx.user.id, ...input })),
  }),
  pmo: router({
    createRisk: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), code: z.string().trim().min(1).max(80), title: z.string().trim().min(2).max(255), probability: z.number().int().min(1).max(5), severity: z.number().int().min(1).max(5), dueAt: z.date().optional() })).mutation(({ ctx, input }) => createRisk({ userId: ctx.user.id, ...input })),
    createIssue: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), code: z.string().trim().min(1).max(80), title: z.string().trim().min(2).max(255), priority: z.enum(["low", "medium", "high", "critical"]), dueAt: z.date().optional() })).mutation(({ ctx, input }) => createIssue({ userId: ctx.user.id, ...input })),
    createAction: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), title: z.string().trim().min(2).max(255), priority: z.enum(["low", "medium", "high", "critical"]), dueAt: z.date().optional() })).mutation(({ ctx, input }) => createAction({ userId: ctx.user.id, ...input })),
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
