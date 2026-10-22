import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { authSessions } from "../../drizzle/schema";
import { getDb } from "../db";
import { rowsAffected } from "./database";

// Server-side half of a session. The cookie only names a row; the row decides whether the session still counts.
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

async function database() {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  return db;
}

export type SessionStore = {
  create(input: { userId: number; expiresAt: Date; now?: Date }): Promise<string>;
  /** The user id of a live (unexpired, unrevoked) session, or null. */
  findLive(sessionId: string, now?: Date): Promise<number | null>;
  /** true only when this call ended a live session. */
  revoke(sessionId: string, now?: Date): Promise<boolean>;
  /** Ends every live session of one user and returns how many. */
  revokeAllForUser(userId: number, now?: Date): Promise<number>;
};

const affected = rowsAffected;

export const sessionStore: SessionStore = {
  async create({ userId, expiresAt, now = new Date() }) {
    const db = await database();
    const id = randomUUID();
    await db.insert(authSessions).values({ id, userId, createdAt: now, expiresAt });
    // Hygiene: a row that expired or was revoked a week ago is of no use. Best effort.
    await db.delete(authSessions).where(lt(authSessions.expiresAt, new Date(now.getTime() - RETENTION_MS))).catch(() => undefined);
    return id;
  },

  async findLive(sessionId, now = new Date()) {
    const db = await database();
    const [row] = await db.select({ userId: authSessions.userId }).from(authSessions).where(and(eq(authSessions.id, sessionId), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, now))).limit(1);
    return row?.userId ?? null;
  },

  async revoke(sessionId, now = new Date()) {
    const db = await database();
    return affected(await db.update(authSessions).set({ revokedAt: now }).where(and(eq(authSessions.id, sessionId), isNull(authSessions.revokedAt)))) === 1;
  },

  async revokeAllForUser(userId, now = new Date()) {
    const db = await database();
    return affected(await db.update(authSessions).set({ revokedAt: now }).where(and(eq(authSessions.userId, userId), isNull(authSessions.revokedAt), gt(authSessions.expiresAt, now))));
  },
};
