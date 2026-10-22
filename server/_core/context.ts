import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { Request } from "express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
  /** the session that authenticated this request (absent for public calls and in tests that build a context by hand) */
  sessionId?: string;
};

type Authenticated = { user: User; sessionId: string } | null;

// A request is authenticated once: the database context middleware needs the user before the route runs, and tRPC's context asks again.
const authenticated = new WeakMap<object, Promise<Authenticated>>();

/** The session behind this request, or null for a public call. Looked up once per request, however many callers ask. */
export function authenticateOnce(req: Request): Promise<Authenticated> {
  let pending = authenticated.get(req);
  if (!pending) {
    // Authentication is optional for public procedures.
    pending = sdk.authenticateSession(req).then(
      ({ user, sessionId }) => ({ user, sessionId }),
      () => null,
    );
    authenticated.set(req, pending);
  }
  return pending;
}

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  const result = await authenticateOnce(opts.req as Request);
  return {
    req: opts.req,
    res: opts.res,
    user: result?.user ?? null,
    sessionId: result?.sessionId,
  };
}
