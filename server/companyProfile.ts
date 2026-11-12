import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { auditLogs, companies } from "../drizzle/schema";
import { getDb, getTenantAccessSnapshot } from "./db";
import { assertTenantAccess } from "./domain/authorization";

// Q-12 part 1: a company's own details (its legal name and the language its screens and documents open in), edited from the «My companies» screen.
// The same authority as every other company setting: tenant.manage at company scope. A person who is not a member of the company gets no snapshot and is refused
// before anything is read; row-level security is the second layer (the UPDATE returns no row for another company's id, and zero rows is a refusal, never a success).
export type CompanyProfile = { tenantId: string; legalName: string; slug: string; defaultLocale: "ar" | "en" };

const refuse = (code: "FORBIDDEN" | "NOT_FOUND", message: string) => new TRPCError({ code, message });

async function database() { const db = await getDb(); if (!db) throw new Error("Database connection is not available"); return db; }

async function assertCompanyManager(userId: number, tenantId: string): Promise<void> {
  const snapshot = await getTenantAccessSnapshot({ userId, tenantId });
  if (!snapshot) throw refuse("FORBIDDEN", "PROJECT_OS_TENANT_ACCESS_DENIED");
  assertTenantAccess(snapshot, { tenantId, product: "EXECUTIVE", permission: "tenant.manage", scope: { type: "company" } });
}

export async function getCompanyProfile(input: { userId: number; tenantId: string }): Promise<CompanyProfile> {
  await assertCompanyManager(input.userId, input.tenantId);
  const [row] = await (await database()).select({ legalName: companies.legalName, slug: companies.slug, defaultLocale: companies.defaultLocale }).from(companies).where(eq(companies.id, input.tenantId)).limit(1);
  if (!row) throw refuse("FORBIDDEN", "PROJECT_OS_TENANT_ACCESS_DENIED");
  return { tenantId: input.tenantId, ...row };
}

export async function updateCompanyProfile(input: { userId: number; tenantId: string; legalName: string; defaultLocale: "ar" | "en" }): Promise<CompanyProfile> {
  await assertCompanyManager(input.userId, input.tenantId);
  const db = await database();
  return db.transaction(async tx => {
    const [before] = await tx.select({ legalName: companies.legalName, slug: companies.slug, defaultLocale: companies.defaultLocale }).from(companies).where(eq(companies.id, input.tenantId)).limit(1);
    if (!before) throw refuse("FORBIDDEN", "PROJECT_OS_TENANT_ACCESS_DENIED");
    const updated = await tx.update(companies).set({ legalName: input.legalName, defaultLocale: input.defaultLocale, updatedAt: new Date() }).where(eq(companies.id, input.tenantId)).returning({ id: companies.id });
    if (updated.length !== 1) throw refuse("FORBIDDEN", "PROJECT_OS_TENANT_ACCESS_DENIED");
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "tenant.profile_updated", entityType: "company", entityId: input.tenantId, metadata: JSON.stringify({ before: { legalName: before.legalName, defaultLocale: before.defaultLocale }, after: { legalName: input.legalName, defaultLocale: input.defaultLocale } }) });
    return { tenantId: input.tenantId, legalName: input.legalName, slug: before.slug, defaultLocale: input.defaultLocale };
  });
}
