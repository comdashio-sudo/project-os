// The mapping between the other system's identifiers and ours (work order 12, item 9): suppliers, projects, materials, cost codes (a WBS item of a project) and cost centers
// (a project). A mapping says "this ERP code means that record here"; the inbound records read it before they fall back to matching by code.
import { and, eq } from "drizzle-orm";
import { integrationMappings, materialMasters, projects, suppliers, wbsItems } from "../../drizzle/schema";
import { getDb } from "../db";
import { finishSyncRun, recordSyncItems, startSyncRun, type SyncItem } from "./sync";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export const MAPPING_TYPES = ["supplier", "project", "material", "cost_code", "cost_center"] as const;
export type MappingType = (typeof MAPPING_TYPES)[number];
export type MappingRecord = { externalId: string; ref: string; project?: string };

async function resolve(db: Db, tenantId: string, type: MappingType, record: MappingRecord): Promise<{ id: string; code: string } | { error: string; detail?: string }> {
  const one = async <T extends { id: string }>(rows: Promise<T[]>, code: string) => { const [row] = await rows; return row ? { id: row.id, code } : { error: "REF_UNKNOWN", detail: record.ref }; };
  if (type === "supplier") return one(db.select({ id: suppliers.id }).from(suppliers).where(and(eq(suppliers.tenantId, tenantId), eq(suppliers.code, record.ref))).limit(1), record.ref);
  if (type === "project" || type === "cost_center") return one(db.select({ id: projects.id }).from(projects).where(and(eq(projects.tenantId, tenantId), eq(projects.code, record.ref))).limit(1), record.ref);
  if (type === "material") return one(db.select({ id: materialMasters.id }).from(materialMasters).where(and(eq(materialMasters.tenantId, tenantId), eq(materialMasters.code, record.ref))).limit(1), record.ref);
  if (!record.project) return { error: "PROJECT_REQUIRED", detail: "a cost code is a WBS item of one project" };
  const [project] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.tenantId, tenantId), eq(projects.code, record.project))).limit(1);
  if (!project) return { error: "PROJECT_UNKNOWN", detail: record.project };
  return one(db.select({ id: wbsItems.id }).from(wbsItems).where(and(eq(wbsItems.tenantId, tenantId), eq(wbsItems.projectId, project.id), eq(wbsItems.code, record.ref))).limit(1), record.ref);
}

export async function saveMappings(input: { tenantId: string; system: string; type: MappingType; records: MappingRecord[]; apiKeyId?: string; userId?: number; trigger?: "api" | "manual" }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const runId = await startSyncRun(db, { tenantId: input.tenantId, system: input.system, direction: "in", trigger: input.trigger ?? "api", entityType: `map:${input.type}`, apiKeyId: input.apiKeyId, startedByUserId: input.userId });
  const items: SyncItem[] = [];
  for (const record of input.records) {
    const target = await resolve(db, input.tenantId, input.type, record);
    if ("error" in target) { items.push({ entityType: `map:${input.type}`, externalId: record.externalId, outcome: "rejected", reason: target.error, detail: target.detail }); continue; }
    const [existing] = await db.select({ id: integrationMappings.id, internalId: integrationMappings.internalId }).from(integrationMappings).where(and(eq(integrationMappings.tenantId, input.tenantId), eq(integrationMappings.system, input.system), eq(integrationMappings.entityType, input.type), eq(integrationMappings.externalId, record.externalId))).limit(1);
    await db.insert(integrationMappings).values({ id: crypto.randomUUID(), tenantId: input.tenantId, system: input.system, entityType: input.type, externalId: record.externalId, internalId: target.id, internalCode: target.code, lastSyncedAt: new Date() })
      .onConflictDoUpdate({ target: [integrationMappings.tenantId, integrationMappings.system, integrationMappings.entityType, integrationMappings.externalId], set: { internalId: target.id, internalCode: target.code, updatedAt: new Date() } });
    items.push({ entityType: `map:${input.type}`, externalId: record.externalId, outcome: !existing ? "created" : existing.internalId === target.id ? "unchanged" : "updated" });
  }
  await recordSyncItems(db, input.tenantId, runId, items);
  return { ...(await finishSyncRun(db, runId, items)), items: items.map(({ entityType: _type, ...item }) => item) };
}

export async function listMappings(input: { tenantId: string; system?: string; type?: MappingType }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  return db.select({ system: integrationMappings.system, type: integrationMappings.entityType, externalId: integrationMappings.externalId, internalId: integrationMappings.internalId, internalCode: integrationMappings.internalCode, lastSyncedAt: integrationMappings.lastSyncedAt })
    .from(integrationMappings).where(and(eq(integrationMappings.tenantId, input.tenantId), input.system ? eq(integrationMappings.system, input.system) : undefined, input.type ? eq(integrationMappings.entityType, input.type) : undefined)).orderBy(integrationMappings.system, integrationMappings.entityType, integrationMappings.externalId).limit(2000);
}
