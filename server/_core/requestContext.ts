// The per-request database context (second layer of tenant isolation, see database.ts and drizzle/baseline-security.sql).
//
// Installed where a request becomes work (the tRPC procedure middleware and the tenant-export handler), so every path that reads or writes company
// data gets the caller's companies before any statement runs. A request with no signed-in user gets NO context, and a statement with no
// context sees no company row at all (the safe default).
//
//   - an ordinary user sees the companies where their membership is active or invited (an invited person must be able to read what they accept);
//   - a platform administrator (users.role = 'admin') acts across companies by design (licensing, support), so the request runs as system.
import { and, eq, inArray } from "drizzle-orm";
import type { RequestHandler } from "express";
import { memberships, type User } from "../../drizzle/schema";
import { getDb, withSystemContext, type DbContext } from "./database";

export async function dbContextForUser(user: User): Promise<DbContext> {
  if (user.role === "admin") return { userId: user.id, tenantIds: [], system: true, reason: "platform administrator" };
  const db = await getDb();
  if (!db) return { userId: user.id, tenantIds: [], system: false };
  // memberships is itself a company table: reading the caller's own rows is the one thing done before their context exists.
  const rows = await withSystemContext("resolve the caller's companies", async () => await db.select({ tenantId: memberships.tenantId }).from(memberships).where(and(eq(memberships.userId, user.id), inArray(memberships.status, ["invited", "active"]))));
  return { userId: user.id, tenantIds: Array.from(new Set(rows.map(row => row.tenantId))), system: false };
}

/** For scheduled jobs: they authenticate by their own bearer token and then work across every company. */
export const asSystem = (reason: string): RequestHandler => (_req, _res, next) => { void withSystemContext(reason, async () => next()); };
