import { z } from "zod";
import { productCodes } from "../drizzle/schema";
import { createBudgetLine, createCostEntry, createProgressEntry, createProjectForTenant, createTenantForUser, createWbsItem, getTenantAccessSnapshot, listProjectsForTenant, listTenantsForUser, saveEvmSnapshot } from "./db";
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
  }),
  projects: router({
    list: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => listProjectsForTenant({ userId: ctx.user.id, ...input })),
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
