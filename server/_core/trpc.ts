import { NOT_ADMIN_ERR_MSG, UNAUTHED_ERR_MSG } from '@shared/const';
import { getProjectError, projectErrorMessages, type ProjectErrorCode } from "@shared/projectErrors";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError } from "zod";
import type { TrpcContext } from "./context";
import { runWithDbContext, type DbContext } from "./database";
import { dbContextForUser } from "./requestContext";

// A schema rule whose message is a catalogue code gives that code; any other refused rule gives the generic "check the marked field" message.
export function zodIssueError(message: string): { code: ProjectErrorCode; messages: ReturnType<typeof getProjectError>["messages"] } {
  return Object.hasOwn(projectErrorMessages, message) ? getProjectError(message as ProjectErrorCode) : getProjectError("PROJECT_OS_INPUT_INVALID");
}

const t = initTRPC.context<TrpcContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    // A request the input schema refused says what was wrong, not "request failed": the first refused rule names the field, and a rule whose
    // message is a catalogue code says exactly what is wrong with it (for example a short name with a capital letter). Other rules are shown as
    // "check the field that is marked", never as the raw English of the schema.
    const issue = error.cause instanceof ZodError ? error.cause.issues[0] : undefined;
    const known = issue ? zodIssueError(issue.message) : getProjectError(error.message);
    // An unexpected failure inside a procedure says "server error", not "check your data": the person did nothing wrong.
    const projectError = error.code === "INTERNAL_SERVER_ERROR" && known.code === "PROJECT_OS_REQUEST_FAILED" ? getProjectError("PROJECT_OS_SERVER_ERROR") : known;
    const { stack: _internalStack, ...safeData } = shape.data;
    return {
      ...shape,
      message: projectError.messages.en,
      data: {
        ...safeData,
        projectError,
        ...(issue ? { field: issue.path.map(String).join(".") } : {}),
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
