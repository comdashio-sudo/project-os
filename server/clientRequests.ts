// Idempotency for requests the phone may send twice (G-033). The phone puts its own identifier on a queued request; the
// first run stores its result under it, and any later run with the same identifier gets that result back.
import { TRPCError } from "@trpc/server";
import { and, eq } from "drizzle-orm";
import { clientRequests } from "../drizzle/schema";
import { getDb } from "./db";

type Scope = { tenantId: string; userId: number; requestId?: string; action: string };

const isDuplicateKey = (error: unknown) => {
  const candidate = error as { code?: unknown; errno?: unknown; cause?: { code?: unknown } } | null;
  return candidate?.code === "ER_DUP_ENTRY" || candidate?.cause?.code === "ER_DUP_ENTRY" || candidate?.errno === 1062;
};

/**
 * Runs `run` once per request identifier. Without an identifier it simply runs. A request that is still in flight is
 * refused rather than run a second time, and one that failed is forgotten so the phone can send it again.
 */
export async function withClientRequest<T>(scope: Scope, run: () => Promise<T>): Promise<T> {
  if (!scope.requestId) return run();
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  try {
    await db.insert(clientRequests).values({ id: scope.requestId, tenantId: scope.tenantId, userId: scope.userId, action: scope.action, status: "started" });
  } catch (error) {
    if (!isDuplicateKey(error)) throw error;
    const [existing] = await db.select().from(clientRequests).where(eq(clientRequests.id, scope.requestId)).limit(1);
    // The identifier belongs to one person's one action: anything else is a mistake, and must never reveal another user's result.
    if (!existing || existing.tenantId !== scope.tenantId || existing.userId !== scope.userId || existing.action !== scope.action) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_CLIENT_REQUEST_REUSED" });
    if (existing.status === "done" && existing.resultJson) return JSON.parse(existing.resultJson) as T;
    throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_CLIENT_REQUEST_IN_PROGRESS" });
  }
  try {
    const result = await run();
    await db.update(clientRequests).set({ status: "done", resultJson: JSON.stringify(result ?? null) }).where(and(eq(clientRequests.id, scope.requestId), eq(clientRequests.tenantId, scope.tenantId)));
    return result;
  } catch (error) {
    await db.delete(clientRequests).where(and(eq(clientRequests.id, scope.requestId), eq(clientRequests.tenantId, scope.tenantId), eq(clientRequests.status, "started")));
    throw error;
  }
}
