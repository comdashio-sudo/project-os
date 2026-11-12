import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { auditLogs, companies } from "../drizzle/schema";
import { getDb, getTenantAccessSnapshot } from "./db";
import { assertTenantAccess } from "./domain/authorization";
import { safeUploadFileName, takeDirectUpload, uploadPrefix } from "./directUploadKeys";
import { logoKind, MAX_LOGO_BYTES, svgIsUnsafe } from "./projectProfile";
import { MAX_DIRECT_UPLOAD_BYTES, storageCreateUploadUrl, storageDelete, storageGetSignedUrl, storageMode, storagePut } from "./storage";
import { DB_STORAGE_MAX_FILE_BYTES, VERCEL_REQUEST_BODY_BYTES } from "./dbStorage";

// Q-12 part 1: a company's own details (its legal name and the language its screens and documents open in), edited from the «My companies» screen.
// The same authority as every other company setting: tenant.manage at company scope. A person who is not a member of the company gets no snapshot and is refused
// before anything is read; row-level security is the second layer (the UPDATE returns no row for another company's id, and zero rows is a refusal, never a success).
export type CompanyProfile = { tenantId: string; legalName: string; slug: string; defaultLocale: "ar" | "en"; logo: { url: string | null } | null };
// Q-12 part 1 (b): the company's logo goes through the same direct upload as a project party's logo (PNG, JPEG or SVG, 2 MB, an SVG carrying script refused), with
// "company" in the place of the project id: project ids are UUIDs, so a company's pending uploads can never be taken as a project's and the reverse.
const COMPANY_SCOPE = "company";
const LOGO_TYPES = /^image\/(png|jpeg|svg\+xml)$/;
const logoOf = async (key: string | null) => (key ? { url: await storageGetSignedUrl(key).catch(() => null) } : null);

const refuse = (code: "FORBIDDEN" | "NOT_FOUND", message: string) => new TRPCError({ code, message });

async function database() { const db = await getDb(); if (!db) throw new Error("Database connection is not available"); return db; }

async function assertCompanyManager(userId: number, tenantId: string): Promise<void> {
  const snapshot = await getTenantAccessSnapshot({ userId, tenantId });
  if (!snapshot) throw refuse("FORBIDDEN", "PROJECT_OS_TENANT_ACCESS_DENIED");
  assertTenantAccess(snapshot, { tenantId, product: "EXECUTIVE", permission: "tenant.manage", scope: { type: "company" } });
}

export async function getCompanyProfile(input: { userId: number; tenantId: string }): Promise<CompanyProfile> {
  await assertCompanyManager(input.userId, input.tenantId);
  const [row] = await (await database()).select({ legalName: companies.legalName, slug: companies.slug, defaultLocale: companies.defaultLocale, logoKey: companies.logoKey }).from(companies).where(eq(companies.id, input.tenantId)).limit(1);
  if (!row) throw refuse("FORBIDDEN", "PROJECT_OS_TENANT_ACCESS_DENIED");
  return { tenantId: input.tenantId, legalName: row.legalName, slug: row.slug, defaultLocale: row.defaultLocale, logo: await logoOf(row.logoKey) };
}

/** The signed URL the browser PUTs the logo to (tenant.manage). Nothing is recorded: an abandoned upload is only an object the sweep removes. */
export async function createCompanyLogoUpload(input: { userId: number; tenantId: string; fileName: string; contentType: string }) {
  await assertCompanyManager(input.userId, input.tenantId);
  if (!LOGO_TYPES.test(input.contentType)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_UPLOAD_TYPE_INVALID" });
  const key = `${uploadPrefix({ tenantId: input.tenantId, projectId: COMPANY_SCOPE, purpose: "logo" })}${crypto.randomUUID()}/${safeUploadFileName(input.fileName)}`;
  const upload = await storageCreateUploadUrl(key, input.contentType);
  return { uploadKey: upload.key, uploadUrl: upload.url, headers: upload.headers, expiresInSeconds: upload.expiresInSeconds, maxBytes: storageMode() === "database" ? Math.min(DB_STORAGE_MAX_FILE_BYTES, VERCEL_REQUEST_BODY_BYTES) : MAX_DIRECT_UPLOAD_BYTES };
}

async function takeCompanyLogo(tenantId: string, uploadKey: string): Promise<string> {
  const taken = await takeDirectUpload({ tenantId, projectId: COMPANY_SCOPE, purpose: "logo", uploadKey, maxBytes: MAX_LOGO_BYTES, tooLarge: "PROJECT_OS_PROJECT_LOGO_TOO_LARGE" });
  const refusal = async (message: string) => { await taken.discard(); return new TRPCError({ code: "BAD_REQUEST", message }); };
  const kind = logoKind(taken.bytes);
  if (!kind) throw await refusal("PROJECT_OS_PROJECT_LOGO_TYPE_INVALID");
  if (kind === "svg" && svgIsUnsafe(taken.bytes.toString("utf8"))) throw await refusal("PROJECT_OS_PROJECT_LOGO_UNSAFE");
  const stored = await storagePut(`uploads/${tenantId}/${COMPANY_SCOPE}/logo/${crypto.randomUUID()}.${kind === "jpeg" ? "jpg" : kind}`, taken.bytes, kind === "svg" ? "image/svg+xml" : `image/${kind}`);
  await taken.discard();
  return stored.key;
}

/** logo: left out = keep it, null = remove it, { uploadKey } = replace it with the uploaded file. */
export async function updateCompanyProfile(input: { userId: number; tenantId: string; legalName: string; defaultLocale: "ar" | "en"; logo?: { uploadKey: string } | null }): Promise<CompanyProfile> {
  await assertCompanyManager(input.userId, input.tenantId);
  const db = await database();
  // the new logo is read, checked and stored before the transaction; if the transaction fails it is removed again
  const newKey = input.logo ? await takeCompanyLogo(input.tenantId, input.logo.uploadKey) : undefined;
  let oldKey: string | null = null;
  try {
    const result = await db.transaction(async tx => {
      const [before] = await tx.select({ legalName: companies.legalName, slug: companies.slug, defaultLocale: companies.defaultLocale, logoKey: companies.logoKey }).from(companies).where(eq(companies.id, input.tenantId)).limit(1);
      if (!before) throw refuse("FORBIDDEN", "PROJECT_OS_TENANT_ACCESS_DENIED");
      const logoKey = input.logo === undefined ? before.logoKey : (newKey ?? null);
      const updated = await tx.update(companies).set({ legalName: input.legalName, defaultLocale: input.defaultLocale, logoKey, updatedAt: new Date() }).where(eq(companies.id, input.tenantId)).returning({ id: companies.id });
      if (updated.length !== 1) throw refuse("FORBIDDEN", "PROJECT_OS_TENANT_ACCESS_DENIED");
      await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "tenant.profile_updated", entityType: "company", entityId: input.tenantId, metadata: JSON.stringify({ before: { legalName: before.legalName, defaultLocale: before.defaultLocale }, after: { legalName: input.legalName, defaultLocale: input.defaultLocale }, logo: input.logo === undefined ? "kept" : input.logo === null ? "removed" : "replaced" }) });
      if (input.logo !== undefined) oldKey = before.logoKey;
      return { tenantId: input.tenantId, legalName: input.legalName, slug: before.slug, defaultLocale: input.defaultLocale, logoKey };
    });
    // the logo this save replaced or removed is no longer referenced
    if (oldKey) await storageDelete(oldKey).catch(() => undefined);
    return { tenantId: result.tenantId, legalName: result.legalName, slug: result.slug, defaultLocale: result.defaultLocale, logo: await logoOf(result.logoKey) };
  } catch (error) {
    if (newKey) await storageDelete(newKey).catch(() => undefined);
    throw error;
  }
}
