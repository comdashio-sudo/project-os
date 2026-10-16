import { and, count, desc, eq, gt, gte, isNull, lt, sql } from "drizzle-orm";
import { loginCodes } from "../../../drizzle/schema";
import { getDb } from "../../db";
import type { LoginCodeRepository, LoginCodeRow } from "./emailCode";

const RETENTION_MS = 2 * 24 * 60 * 60 * 1000;

async function database() {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  return db;
}

export function createDbLoginCodeRepository(): LoginCodeRepository {
  return {
    async countSince(emailHash, since) {
      const db = await database();
      const [row] = await db.select({ total: count() }).from(loginCodes).where(and(eq(loginCodes.emailHash, emailHash), gte(loginCodes.createdAt, since)));
      return Number(row?.total ?? 0);
    },

    async latestCreatedAt(emailHash) {
      const db = await database();
      const [row] = await db.select({ createdAt: loginCodes.createdAt }).from(loginCodes).where(eq(loginCodes.emailHash, emailHash)).orderBy(desc(loginCodes.createdAt)).limit(1);
      return row?.createdAt ?? null;
    },

    async retireOpen(emailHash, now) {
      const db = await database();
      await db.update(loginCodes).set({ consumedAt: now }).where(and(eq(loginCodes.emailHash, emailHash), isNull(loginCodes.consumedAt)));
    },

    async insert(row) {
      const db = await database();
      await db.insert(loginCodes).values(row);
      // Hygiene: rows past the rate-limit window are of no use. Best effort.
      await db.delete(loginCodes).where(lt(loginCodes.createdAt, new Date(row.createdAt.getTime() - RETENTION_MS))).catch(() => undefined);
    },

    async findOpen(emailHash, now): Promise<LoginCodeRow | null> {
      const db = await database();
      const [row] = await db
        .select()
        .from(loginCodes)
        .where(and(eq(loginCodes.emailHash, emailHash), isNull(loginCodes.consumedAt), gt(loginCodes.expiresAt, now)))
        .orderBy(desc(loginCodes.createdAt))
        .limit(1);
      return row ?? null;
    },

    async claimAttempt(id, max) {
      const db = await database();
      // One statement: the row changes only while it still has a free guess, so the count never passes `max`.
      const [result] = await db.update(loginCodes).set({ attempts: sql`${loginCodes.attempts} + 1` }).where(and(eq(loginCodes.id, id), isNull(loginCodes.consumedAt), lt(loginCodes.attempts, max)));
      return Number((result as { affectedRows?: number }).affectedRows ?? 0) === 1;
    },

    async consume(id, now) {
      const db = await database();
      const [result] = await db.update(loginCodes).set({ consumedAt: now }).where(and(eq(loginCodes.id, id), isNull(loginCodes.consumedAt)));
      return Number((result as { affectedRows?: number }).affectedRows ?? 0) === 1;
    },
  };
}
