// Work order 22: what the site / consultant / monthly-report services share — the PMC gate (licence feature + named permission + tenant + project),
// "today" on the site's clock, and the villa-number key that ties a unit across the three sources.
import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { dataImports, pmcUnits } from "../drizzle/schema";
import { assertProjectWithinTenant, assertTenantFeatureAccess, ensureDefaultCommercialCatalog, getDb } from "./db";

export type Scope = { userId: number; tenantId: string; projectId: string };
export type PmcPermission = "project.pmc.read" | "project.pmc.update" | "project.pmc.manage";
/** Area, unit price and the earned value in riyals are financial: only with this permission (never shown, never written without it). */
export const FINANCIAL_PERMISSION = "project.budget.manage";

export async function pmcGate(input: Scope, permission: PmcPermission | typeof FINANCIAL_PERMISSION) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  await ensureDefaultCommercialCatalog(db);
  await assertTenantFeatureAccess({ userId: input.userId, tenantId: input.tenantId, product: "PROJECT", permission, featureCode: "PMC", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  return db;
}
export type Db = Awaited<ReturnType<typeof pmcGate>>;

/** Does this person hold the permission? (for showing or leaving out a financial column; never a substitute for the gate on a write) */
export async function holds(input: Scope, permission: string) {
  try { await assertTenantFeatureAccess({ userId: input.userId, tenantId: input.tenantId, product: "PROJECT", permission, featureCode: "PMC", scope: { type: "project", id: input.projectId } }); return true; }
  catch { return false; }
}

/** The calendar day on site (Saudi Arabia, UTC+3, no daylight saving): «a date in the future» is judged against this, not against the server's UTC midnight. */
export function siteToday(now = new Date()) { return new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 10); }
export const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** «0268», «V-268», «268» → «268» */
export const villaKey = (value: string | number | null | undefined) => { const match = String(value ?? "").match(/\d+/g); return match ? String(Number(match[match.length - 1])) : String(value ?? "").trim().toLowerCase(); };

export type UnitRow = { id: string; unitNumber: number; villaLabel: string | null; modelCode: string; blockId: string };
export async function unitsByVilla(db: Pick<Db, "select">, input: Scope) {
  const units = await db.select({ id: pmcUnits.id, unitNumber: pmcUnits.unitNumber, villaLabel: pmcUnits.villaLabel, modelCode: pmcUnits.modelCode, blockId: pmcUnits.blockId }).from(pmcUnits).where(and(eq(pmcUnits.tenantId, input.tenantId), eq(pmcUnits.projectId, input.projectId)));
  const byVilla = new Map<string, UnitRow>();
  for (const unit of units) byVilla.set(villaKey(unit.villaLabel ?? unit.unitNumber), unit);
  return { units, byVilla };
}

export const chunks = <T,>(items: T[], size = 500) => Array.from({ length: Math.ceil(items.length / size) }, (_unused, index) => items.slice(index * size, (index + 1) * size));

/** The same file is refused only once a copy of it was CONFIRMED (the rule of the import log: a refused or unconfirmed attempt never blocks it). */
export async function assertNotImportedYet(db: Pick<Db, "select">, input: { tenantId: string; fileHash: string }) {
  const [hit] = await db.select({ id: dataImports.id }).from(dataImports).where(and(eq(dataImports.tenantId, input.tenantId), eq(dataImports.fileHash, input.fileHash), inArray(dataImports.status, ["confirmed", "importing", "completed"]))).limit(1);
  if (hit) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_IMPORT_DUPLICATE_DETECTED" });
}
