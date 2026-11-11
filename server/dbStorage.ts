// D-79 (P-85): file storage inside the database, used automatically when the S3 variables are absent (server/storage.ts chooses), with the SAME interface,
// so no caller changes and a later move to S3 is a copy of these rows, not a code change.
//
// - A file is a row of stored_files owned by the company named in its key (every key the server builds is uploads|tenants|imports|pmc/<company>/...).
//   Row-level security (project_os_apply_conventions) keeps it inside that company: a statement made for another company's key reads nothing and writes nothing.
// - A "signed URL" is /api/storage/file/<token>: a token signed by this server that names one key and expires in 15 minutes, minted only for a caller that
//   already passed the authorization checks (as an S3 presigned URL is). A direct upload is PUT /api/storage/upload/<token> in the same way.
// - Up to 5 MB a file (also a CHECK in the table) and 100 MB a company. Vercel cuts a request body at 4.5 MB, so a browser upload through it is announced as 4.5 MB.
export const VERCEL_REQUEST_BODY_BYTES = 4.5 * 1024 * 1024;
import { TRPCError } from "@trpc/server";
import { and, eq, like, sql } from "drizzle-orm";
import express, { type Express, type Request, type Response } from "express";
import { jwtVerify, SignJWT } from "jose";
import { randomUUID } from "node:crypto";
import { storedFiles } from "../drizzle/schema";
import { getDb, withSystemContext } from "./_core/database";
import { ENV } from "./_core/env";
import { logError } from "./_core/logger";
import { appendHashSuffix, normalizeKey, SIGNED_URL_TTL_SECONDS, type StorageBody } from "./storage";

export const DB_STORAGE_MAX_FILE_BYTES = 5 * 1024 * 1024;
export const DB_STORAGE_MAX_TENANT_BYTES = 100 * 1024 * 1024;
const KEY_ROOTS = new Set(["uploads", "tenants", "imports", "pmc"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The company a key belongs to (its second segment). A key outside the known shapes is refused: nothing is stored without an owner. */
export function tenantOfKey(key: string): string {
  const [root, tenantId] = key.split("/");
  if (!KEY_ROOTS.has(root) || !tenantId || !UUID.test(tenantId)) throw new Error("Storage key does not name a company");
  return tenantId;
}

const tooLarge = () => new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "PROJECT_OS_STORAGE_FILE_TOO_LARGE" });
const overQuota = () => new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "PROJECT_OS_STORAGE_QUOTA_EXCEEDED" });
/** The same floor as the session (sdk.ts): with no real secret the key would be a constant anyone can read in the source, and every link could be forged. */
export const MIN_STORAGE_SECRET_LENGTH = 16;
const secret = () => {
  if ((ENV.cookieSecret ?? "").length < MIN_STORAGE_SECRET_LENGTH) throw new Error("JWT_SECRET is missing or shorter than 16 characters: storage links cannot be signed");
  return new TextEncoder().encode(`project-os-db-storage|${ENV.cookieSecret}`);
};
type Grant = { key: string; op: "get" | "put"; contentType?: string };

export async function signStorageToken(grant: Grant, now = Date.now()): Promise<string> {
  return new SignJWT(grant).setProtectedHeader({ alg: "HS256" }).setExpirationTime(Math.floor(now / 1000) + SIGNED_URL_TTL_SECONDS).sign(secret());
}
/** The grant a token carries, or null: a bad signature, an expired token, or one minted for the other operation. */
export async function readStorageToken(token: string, op: Grant["op"]): Promise<Grant | null> {
  if ((ENV.cookieSecret ?? "").length < MIN_STORAGE_SECRET_LENGTH) return null; // refuse every link rather than accept one signed with a guessable key
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return payload.op === op && typeof payload.key === "string" ? (payload as unknown as Grant) : null;
  } catch { return null; }
}

async function database() { const db = await getDb(); if (!db) throw new Error("Database connection is not available"); return db; }
const urlFor = async (key: string) => `/api/storage/file/${await signStorageToken({ key, op: "get" })}`;

/** Writes one object (replacing the same key), within the file and company limits. Runs in whatever database context the caller is in, so RLS applies. */
async function write(key: string, bytes: Buffer, contentType: string): Promise<void> {
  if (bytes.length > DB_STORAGE_MAX_FILE_BYTES) throw tooLarge();
  const tenantId = tenantOfKey(key);
  const db = await database();
  await db.transaction(async tx => {
    // one writer per company at a time, so two uploads cannot both slip under the quota
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`stored_files:${tenantId}`}))`);
    const [used] = await tx.select({ total: sql<string>`coalesce(sum(${storedFiles.size}), 0)` }).from(storedFiles).where(and(eq(storedFiles.tenantId, tenantId), sql`${storedFiles.key} <> ${key}`));
    if (Number(used?.total ?? 0) + bytes.length > DB_STORAGE_MAX_TENANT_BYTES) throw overQuota();
    const written = await tx.insert(storedFiles).values({ id: randomUUID(), tenantId, key, contentType, size: bytes.length, data: bytes })
      .onConflictDoUpdate({ target: storedFiles.key, set: { contentType, size: bytes.length, data: bytes, updatedAt: new Date() }, where: eq(storedFiles.tenantId, tenantId) })
      .returning({ id: storedFiles.id });
    // the proof of a write is the row it returns: none means the key belongs to another company or RLS refused it — never a silent success
    if (written.length !== 1) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  });
}
const rowOf = async (key: string) => (await (await database()).select().from(storedFiles).where(eq(storedFiles.key, key)).limit(1))[0];

export function createDatabaseStorage() {
  return {
    async storagePut(relKey: string, data: StorageBody, contentType = "application/octet-stream"): Promise<{ key: string; url: string }> {
      const key = appendHashSuffix(normalizeKey(relKey));
      await write(key, typeof data === "string" ? Buffer.from(data) : Buffer.from(data), contentType);
      return { key, url: await urlFor(key) };
    },
    async storageGet(relKey: string): Promise<{ key: string; url: string }> { const key = normalizeKey(relKey); return { key, url: await urlFor(key) }; },
    async storageGetSignedUrl(relKey: string): Promise<string> { return urlFor(normalizeKey(relKey)); },
    async storageCreateUploadUrl(relKey: string, contentType = "application/octet-stream"): Promise<{ key: string; url: string; headers: Record<string, string>; expiresInSeconds: number }> {
      const key = normalizeKey(relKey); tenantOfKey(key);
      return { key, url: `/api/storage/upload/${await signStorageToken({ key, op: "put", contentType })}`, headers: { "Content-Type": contentType }, expiresInSeconds: SIGNED_URL_TTL_SECONDS };
    },
    async storageHead(relKey: string): Promise<{ size: number; contentType: string | null } | null> {
      const [row] = await (await database()).select({ size: storedFiles.size, contentType: storedFiles.contentType }).from(storedFiles).where(eq(storedFiles.key, normalizeKey(relKey))).limit(1);
      return row ? { size: row.size, contentType: row.contentType } : null;
    },
    async storageRead(relKey: string): Promise<Buffer> {
      const row = await rowOf(normalizeKey(relKey));
      if (!row) throw new Error("Storage object not found");
      return Buffer.from(row.data);
    },
    async storageList(prefix: string): Promise<Array<{ key: string; lastModified: Date | null }>> {
      const escaped = normalizeKey(prefix).replace(/[\\%_]/g, char => `\\${char}`);
      return (await (await database()).select({ key: storedFiles.key, lastModified: storedFiles.updatedAt }).from(storedFiles).where(like(storedFiles.key, `${escaped}%`)));
    },
    async storageDelete(relKey: string): Promise<void> { await (await database()).delete(storedFiles).where(eq(storedFiles.key, normalizeKey(relKey))); },
  };
}

/**
 * The two doors a token opens. The token is the authorization (as an S3 presigned URL is): it was minted by this server for a caller that passed the checks, names
 * one key, and expires in 15 minutes. The row is read in the system context because the browser that follows the link carries no company context of its own.
 */
export function registerDatabaseStorageRoutes(app: Express) {
  app.get("/api/storage/file/:token", async (req: Request, res: Response) => {
    const grant = await readStorageToken(String(req.params.token), "get");
    if (!grant) return res.status(403).json({ code: "PROJECT_OS_STORAGE_LINK_INVALID" });
    try {
      const row = await withSystemContext("stored file: a signed link minted after the caller's own checks", () => rowOf(grant.key));
      if (!row) return res.status(404).json({ code: "PROJECT_OS_STORAGE_NOT_FOUND" });
      // served as data, never as a page: no sniffing, no script, no frame (an uploaded SVG cannot run anything here)
      res.set({ "Content-Type": row.contentType, "Content-Length": String(row.size), "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'; sandbox", "Cache-Control": "private, max-age=300" });
      return res.status(200).end(Buffer.from(row.data));
    } catch (error) { logError("storage.db_read_failed", error); return res.status(500).json({ code: "PROJECT_OS_SERVER_ERROR" }); }
  });

  app.put("/api/storage/upload/:token", express.raw({ type: () => true, limit: DB_STORAGE_MAX_FILE_BYTES }), async (req: Request, res: Response) => {
    const grant = await readStorageToken(String(req.params.token), "put");
    if (!grant) return res.status(403).json({ code: "PROJECT_OS_STORAGE_LINK_INVALID" });
    const body = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
    try {
      const tenantId = tenantOfKey(grant.key);
      await withSystemContext("direct upload: a signed link minted for this company's key", async () => {
        // the key's company is fixed by the server-signed token; the write still goes through the quota and the one-row-per-key rule
        await write(grant.key, body, grant.contentType ?? "application/octet-stream");
      });
      return res.status(200).json({ ok: true, key: grant.key, tenantId });
    } catch (error) {
      if (error instanceof TRPCError) return res.status(413).json({ code: error.message });
      logError("storage.db_upload_failed", error); return res.status(500).json({ code: "PROJECT_OS_SERVER_ERROR" });
    }
  });
  // express.raw answers an over-limit body itself; say it in the product's words
  app.use("/api/storage/upload", (error: { type?: string }, _req: Request, res: Response, next: (error?: unknown) => void) => (error?.type === "entity.too.large" ? res.status(413).json({ code: "PROJECT_OS_STORAGE_FILE_TOO_LARGE" }) : next(error)));
}
