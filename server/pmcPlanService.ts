// Site plan (screen 3): the uploaded plan image, the polygon of each unit, the map
// colouring and the unit card. Reading needs project.pmc.read; changing the plan
// or the polygons needs project.pmc.manage.
import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray } from "drizzle-orm";
import { auditLogs, pmcSitePlans, pmcUnits, projects } from "../drizzle/schema";
import { assertProjectWithinTenant, assertTenantFeatureAccess, ensureDefaultCommercialCatalog, getDb } from "./db";
import { imageSize, parseGeoJsonUnits } from "./domain/pmcGeometry";
import { siteMap, unitCard } from "./domain/pmcScreens";
import { authorizePmcRead, loadPmcDataset } from "./pmcScreensService";
import { storageGetSignedUrl, storagePut } from "./storage";

type Scope = { userId: number; tenantId: string; projectId: string };
const MAX_PLAN_BYTES = 8 * 1024 * 1024;
const refuse = (code: "BAD_REQUEST" | "NOT_FOUND", message: string) => new TRPCError({ code, message });

async function authorizeManage(input: Scope) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  await ensureDefaultCommercialCatalog(db);
  await assertTenantFeatureAccess({ userId: input.userId, tenantId: input.tenantId, product: "PROJECT", permission: "project.pmc.manage", featureCode: "PMC", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  return db;
}

/** Stores a PNG or JPEG as the project's site plan; the newest upload is the one in use. */
export async function uploadPmcSitePlan(input: Scope & { fileName: string; base64: string }) {
  const db = await authorizeManage(input);
  const bytes = Buffer.from(input.base64, "base64");
  if (bytes.length === 0 || bytes.length > MAX_PLAN_BYTES) throw refuse("BAD_REQUEST", "PROJECT_OS_PMC_PLAN_FILE_INVALID");
  const size = imageSize(bytes);
  if (!size) throw refuse("BAD_REQUEST", "PROJECT_OS_PMC_PLAN_FORMAT_UNSUPPORTED");
  if (size.width < 100 || size.height < 100 || size.width > 12_000 || size.height > 12_000) throw refuse("BAD_REQUEST", "PROJECT_OS_PMC_PLAN_DIMENSIONS_INVALID");
  const id = crypto.randomUUID();
  const safeName = input.fileName.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "plan";
  const stored = await storagePut(`pmc/${input.tenantId}/${input.projectId}/site-plans/${id}-${safeName}`, bytes, size.mimeType);
  const fileHash = createHash("sha256").update(bytes).digest("hex");
  await db.transaction(async tx => {
    await tx.insert(pmcSitePlans).values({ id, tenantId: input.tenantId, projectId: input.projectId, fileKey: stored.key, fileName: safeName, mimeType: size.mimeType, widthPx: size.width, heightPx: size.height, fileHash, uploadedByUserId: input.userId });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.site_plan_uploaded", entityType: "pmc_site_plan", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, widthPx: size.width, heightPx: size.height, fileHash }) });
  });
  return { id, widthPx: size.width, heightPx: size.height, mimeType: size.mimeType };
}

/**
 * Saves the polygon of each unit from a GeoJSON FeatureCollection (`properties.unitNumber`,
 * coordinates normalised to the plan). All or nothing: if any feature is wrong, or names a
 * unit the project does not have, nothing is saved and every problem is reported.
 */
export async function savePmcUnitGeometries(input: Scope & { geojson: string }) {
  const db = await authorizeManage(input);
  const parsed = parseGeoJsonUnits(input.geojson);
  if (parsed.errors.length) return { saved: 0, errors: parsed.errors };
  const numbers = parsed.units.map(unit => unit.unitNumber);
  const units = await db.select({ id: pmcUnits.id, unitNumber: pmcUnits.unitNumber }).from(pmcUnits).where(and(eq(pmcUnits.tenantId, input.tenantId), eq(pmcUnits.projectId, input.projectId), inArray(pmcUnits.unitNumber, numbers)));
  const idOf = new Map(units.map(unit => [unit.unitNumber, unit.id]));
  const unknown = parsed.units.map((unit, index) => ({ unit, index })).filter(({ unit }) => !idOf.has(unit.unitNumber));
  if (unknown.length) return { saved: 0, errors: unknown.map(({ unit, index }) => ({ index, unitNumber: unit.unitNumber, code: "PMC_UNIT_NOT_FOUND" })) };
  await db.transaction(async tx => {
    for (const unit of parsed.units) await tx.update(pmcUnits).set({ geometryJson: JSON.stringify(unit.geometry) }).where(eq(pmcUnits.id, idOf.get(unit.unitNumber)!));
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.unit_geometries_saved", entityType: "project", entityId: input.projectId, metadata: JSON.stringify({ units: parsed.units.length }) });
  });
  return { saved: parsed.units.length, errors: [] as Array<{ index: number; unitNumber: number | null; code: string }> };
}

/** The plan (with a short-lived link to the image) and every unit with its polygon and colour source. */
export async function getPmcSiteMap(input: Scope & { activityCode?: string; now?: Date }) {
  const db = await authorizePmcRead(input);
  const [plan] = await db.select().from(pmcSitePlans).where(and(eq(pmcSitePlans.tenantId, input.tenantId), eq(pmcSitePlans.projectId, input.projectId))).orderBy(desc(pmcSitePlans.createdAt)).limit(1);
  const dataset = await loadPmcDataset(db, input, input.now ?? new Date());
  const [project] = await db.select({ currency: projects.currency }).from(projects).where(and(eq(projects.id, input.projectId), eq(projects.tenantId, input.tenantId))).limit(1);
  return {
    currency: project?.currency ?? "SAR",
    plan: plan ? { url: await storageGetSignedUrl(plan.fileKey), widthPx: plan.widthPx, heightPx: plan.heightPx, fileName: plan.fileName, uploadedAt: plan.createdAt } : null,
    activities: Array.from(new Map(dataset.definitions.map(d => [d.code, { code: d.code, name: d.name }])).values()).sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })),
    units: siteMap(dataset, input.activityCode),
    withoutPolygon: dataset.units.filter(unit => !unit.geometry).length,
  };
}

export async function getPmcUnitCard(input: Scope & { unitNumber: number; now?: Date }) {
  const db = await authorizePmcRead(input);
  const dataset = await loadPmcDataset(db, input, input.now ?? new Date());
  const card = unitCard(dataset, input.unitNumber);
  if (!card) throw refuse("NOT_FOUND", "PROJECT_OS_PMC_UNIT_NOT_FOUND");
  return card;
}
