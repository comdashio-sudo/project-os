// API keys for the company's other systems (work order 12, items 8 and 9). A key belongs to one company and carries named powers (scopes); it is shown once and only
// its SHA-256 is kept; calls are counted per minute in the database; the company's manager makes and revokes keys and every one of those acts is audited.
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, sql } from "drizzle-orm";
import { apiKeys, apiRateWindows, auditLogs } from "../../drizzle/schema";
import { runWithDbContext, withSystemContext } from "../_core/database";
import { assertTenantManager, getDb } from "../db";

export const API_SCOPES = ["erp.write", "erp.read", "export.read", "external.write", "mappings.write", "sync.read"] as const;
export type ApiScope = (typeof API_SCOPES)[number];
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

export type AuthenticatedKey = { keyId: string; tenantId: string; name: string; scopes: ApiScope[]; rateLimitPerMinute: number };

export async function createApiKeyForManager(input: { userId: number; tenantId: string; name: string; scopes: ApiScope[]; rateLimitPerMinute?: number; expiresInDays?: number }) {
  await assertTenantManager(input.userId, input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const scopes = Array.from(new Set(input.scopes));
  if (!scopes.length || scopes.some(scope => !API_SCOPES.includes(scope))) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_API_SCOPES_INVALID" });
  const prefix = `pos_${randomBytes(4).toString("hex")}`;
  const secret = randomBytes(24).toString("base64url");
  const key = `${prefix}_${secret}`;
  const id = crypto.randomUUID();
  const expiresAt = input.expiresInDays ? new Date(Date.now() + input.expiresInDays * 86_400_000) : null;
  await db.transaction(async tx => {
    await tx.insert(apiKeys).values({ id, tenantId: input.tenantId, name: input.name, keyPrefix: prefix, keyHash: sha256(key), scopes: scopes.join(","), rateLimitPerMinute: input.rateLimitPerMinute ?? 120, expiresAt, createdByUserId: input.userId });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "integration.api_key_created", entityType: "api_key", entityId: id, metadata: JSON.stringify({ name: input.name, prefix, scopes, rateLimitPerMinute: input.rateLimitPerMinute ?? 120, expiresAt }) });
  });
  // The only time the key is readable.
  return { id, key, keyPrefix: prefix, scopes, expiresAt };
}

export async function listApiKeysForManager(input: { userId: number; tenantId: string }) {
  await assertTenantManager(input.userId, input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  return db.select({ id: apiKeys.id, name: apiKeys.name, keyPrefix: apiKeys.keyPrefix, scopes: apiKeys.scopes, rateLimitPerMinute: apiKeys.rateLimitPerMinute, expiresAt: apiKeys.expiresAt, revokedAt: apiKeys.revokedAt, lastUsedAt: apiKeys.lastUsedAt, createdAt: apiKeys.createdAt })
    .from(apiKeys).where(eq(apiKeys.tenantId, input.tenantId)).orderBy(desc(apiKeys.createdAt));
}

export async function revokeApiKeyForManager(input: { userId: number; tenantId: string; keyId: string }) {
  await assertTenantManager(input.userId, input.tenantId);
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const revoked = await db.transaction(async tx => {
    const changed = await tx.update(apiKeys).set({ revokedAt: new Date() }).where(and(eq(apiKeys.id, input.keyId), eq(apiKeys.tenantId, input.tenantId), sql`${apiKeys.revokedAt} IS NULL`)).returning({ id: apiKeys.id, prefix: apiKeys.keyPrefix });
    if (changed.length) await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "integration.api_key_revoked", entityType: "api_key", entityId: input.keyId, metadata: JSON.stringify({ prefix: changed[0].prefix }) });
    return changed.length > 0;
  });
  if (!revoked) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_API_KEY_NOT_FOUND" });
  return { id: input.keyId, revoked: true as const };
}

/** The key behind a bearer token, or null: unknown, revoked, expired. Looked up by prefix, compared by hash in constant time. */
export async function authenticateApiKey(token: string | undefined, now = new Date()): Promise<AuthenticatedKey | null> {
  const match = /^(pos_[0-9a-f]{8})_[A-Za-z0-9_-]{20,}$/.exec(token ?? "");
  if (!match) return null;
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const row = await withSystemContext("authenticate an API key", async () => (await db.select().from(apiKeys).where(eq(apiKeys.keyPrefix, match[1])).limit(1))[0]);
  if (!row || row.revokedAt || (row.expiresAt && row.expiresAt <= now)) return null;
  const expected = Buffer.from(row.keyHash, "hex"); const given = Buffer.from(sha256(token!), "hex");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  // last-use is a courtesy, written at most once a minute
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() > 60_000) void withSystemContext("note an API key's use", async () => db.update(apiKeys).set({ lastUsedAt: now }).where(eq(apiKeys.id, row.id))).catch(() => undefined);
  return { keyId: row.id, tenantId: row.tenantId, name: row.name, scopes: row.scopes.split(",").filter((scope): scope is ApiScope => (API_SCOPES as readonly string[]).includes(scope)), rateLimitPerMinute: row.rateLimitPerMinute };
}

/** Counts this call in the current minute. Returns whether it is within the key's limit and how long until the window turns over. */
export async function consumeApiRate(key: AuthenticatedKey, now = new Date()): Promise<{ allowed: boolean; remaining: number; retryAfterSeconds: number }> {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const windowStart = new Date(Math.floor(now.getTime() / 60_000) * 60_000);
  const [row] = await runWithDbContext({ userId: null, tenantIds: [key.tenantId], system: false }, async () =>
    db.insert(apiRateWindows).values({ keyId: key.keyId, tenantId: key.tenantId, windowStart, calls: 1 })
      .onConflictDoUpdate({ target: [apiRateWindows.keyId, apiRateWindows.windowStart], set: { calls: sql`${apiRateWindows.calls} + 1` } }).returning({ calls: apiRateWindows.calls }));
  return { allowed: row.calls <= key.rateLimitPerMinute, remaining: Math.max(0, key.rateLimitPerMinute - row.calls), retryAfterSeconds: Math.max(1, Math.ceil((windowStart.getTime() + 60_000 - now.getTime()) / 1000)) };
}

/** Old windows are of no use; the daily job drops those older than a day. */
export async function pruneApiRateWindows(now = new Date()) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  return withSystemContext("prune API rate windows", async () => { const gone = await db.delete(apiRateWindows).where(sql`${apiRateWindows.windowStart} < ${new Date(now.getTime() - 86_400_000)}`).returning({ keyId: apiRateWindows.keyId }); return gone.length; });
}
