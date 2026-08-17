import { z } from "zod";
import { productCodes } from "../drizzle/schema";
import { getTenantAccessSnapshot } from "./db";
import { assertTenantAccess } from "./domain/authorization";
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
});

export type AppRouter = typeof appRouter;

