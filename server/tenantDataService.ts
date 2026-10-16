// The three calls behind "export my data" and "delete my company": preview what exists, ask to delete (first confirmation),
// confirm by typing the company name (second confirmation). Every one is for the company's TENANT_OWNER and no one else.
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { storageDelete, storageGetSignedUrl } from "./storage";
import { EXPORT_FRESH_DAYS, assertTenantOwner, countTenantData, deleteTenantData, issueDeletionToken, latestExportAt, recordAudit, verifyDeletionToken, type DeletionReport } from "./tenantData";

type Dependencies = { secret?: string; storageDelete?: (key: string) => Promise<void>; now?: () => Date };

const database = async () => {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  return db;
};

async function companyOf(db: Awaited<ReturnType<typeof database>>, tenantId: string) {
  const rows = (await db.execute(sql`SELECT id, legalName, status FROM companies WHERE id = ${tenantId}`)) as unknown as [Array<{ id: string; legalName: string; status: string }>, unknown];
  const company = rows[0][0];
  if (!company) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_TENANT_NOT_FOUND" });
  return company;
}

const fresh = (at: Date | null, now: Date) => at !== null && now.getTime() - at.getTime() <= EXPORT_FRESH_DAYS * 86_400_000;

export async function previewTenantData(input: { userId: number; tenantId: string }, deps: Dependencies = {}) {
  const db = await database();
  await assertTenantOwner(db, input.userId, input.tenantId);
  const now = (deps.now ?? (() => new Date()))();
  const company = await companyOf(db, input.tenantId);
  const counts = await countTenantData(db, input.tenantId);
  const exportedAt = await latestExportAt(db, input.tenantId);
  return { companyName: company.legalName, ...counts, lastExportAt: exportedAt, exportFresh: fresh(exportedAt, now), exportFreshDays: EXPORT_FRESH_DAYS };
}

/** First confirmation: needs a recent export; hands back a short-lived code and what would be erased. Deletes nothing. */
export async function requestTenantDeletion(input: { userId: number; tenantId: string }, deps: Dependencies = {}) {
  const db = await database();
  await assertTenantOwner(db, input.userId, input.tenantId);
  const now = (deps.now ?? (() => new Date()))();
  const company = await companyOf(db, input.tenantId);
  if (company.status === "archived") throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_TENANT_NOT_FOUND" });
  if (!fresh(await latestExportAt(db, input.tenantId), now)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "PROJECT_OS_DELETION_EXPORT_REQUIRED" });
  const counts = await countTenantData(db, input.tenantId);
  const { token, expiresAt } = issueDeletionToken({ secret: deps.secret ?? ENV.cookieSecret, tenantId: input.tenantId, userId: input.userId, totalRows: counts.totalRows, now });
  await recordAudit(db, { tenantId: input.tenantId, actorUserId: input.userId, action: "tenant.deletion_requested", metadata: { totalRows: counts.totalRows, files: counts.files, expiresAt: expiresAt.toISOString() } });
  return { confirmationToken: token, expiresAt, companyName: company.legalName, ...counts };
}

/** Second confirmation: the code from the first, plus the company name typed exactly. Then, and only then, the data goes. */
export async function confirmTenantDeletion(input: { userId: number; tenantId: string; confirmationToken: string; typedName: string }, deps: Dependencies = {}): Promise<DeletionReport> {
  const db = await database();
  await assertTenantOwner(db, input.userId, input.tenantId);
  const now = (deps.now ?? (() => new Date()))();
  verifyDeletionToken({ secret: deps.secret ?? ENV.cookieSecret, token: input.confirmationToken, tenantId: input.tenantId, userId: input.userId, now });
  const company = await companyOf(db, input.tenantId);
  if (input.typedName.trim() !== company.legalName) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_DELETION_NAME_MISMATCH" });
  if (!fresh(await latestExportAt(db, input.tenantId), now)) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "PROJECT_OS_DELETION_EXPORT_REQUIRED" });
  await recordAudit(db, { tenantId: input.tenantId, actorUserId: input.userId, action: "tenant.deletion_confirmed", metadata: { typedNameMatched: true } });
  return deleteTenantData({ db, tenantId: input.tenantId, actorUserId: input.userId, storageDelete: deps.storageDelete ?? storageDelete, now: deps.now });
}

export { storageGetSignedUrl };
