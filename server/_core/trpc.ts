import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { getProjectError } from "@shared/projectErrors";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import type { TrpcContext } from "./context";
import { runWithDbContext, type DbContext } from "./database";
import { dbContextForUser } from "./requestContext";

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    // An unexpected failure inside a procedure says "server error", not "check your data": the person did nothing wrong.
    const known = getProjectError(error.message);
    const projectError = error.code === "INTERNAL_SERVER_ERROR" && known.code === "PROJECT_OS_REQUEST_FAILED" ? getProjectError("PROJECT_OS_SERVER_ERROR") : known;
    const { stack: _internalStack, ...safeData } = shape.data;
    return {
      ...shape,
      message: projectError.messages.en,
      data: {
        ...safeData,
        projectError,
      },
    };
  },
});

export const router = t.router;
export const publicProcedure = t.procedure;

// The caller's companies are resolved once per context (a batched HTTP request shares one) and installed for everything the procedure does,
// so the database's row-level security sees them (server/_core/database.ts).
const contexts = new WeakMap<TrpcContext, Promise<DbContext>>();
const dbContextOf = (ctx: TrpcContext, user: NonNullable<TrpcContext["user"]>) => {
  let pending = contexts.get(ctx);
  if (!pending) { pending = dbContextForUser(user); contexts.set(ctx, pending); }
  return pending;
};

const requireUser = t.middleware(async opts => {
  const { ctx, next } = opts;

  if (!ctx.user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: UNAUTHED_ERR_MSG });
  }
  const user = ctx.user;
  const context = await dbContextOf(ctx, user);

  return runWithDbContext(context, () => next({
    ctx: {
      ...ctx,
      user,
    },
  }));
});

export const protectedProcedure = t.procedure.use(requireUser);

export const adminProcedure = t.procedure.use(
  t.middleware(async opts => {
    const { ctx, next } = opts;

    if (!ctx.user || ctx.user.role !== 'admin') {
      throw new TRPCError({ code: "FORBIDDEN", message: NOT_ADMIN_ERR_MSG });
    }

    const user = ctx.user;
    const context = await dbContextOf(ctx, user);
    return runWithDbContext(context, () => next({
      ctx: {
        ...ctx,
        user,
      },
    }));
  }),
);
