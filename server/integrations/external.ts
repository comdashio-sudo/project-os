// What the company's submittal and quality systems send the platform (work order 12, item 8): consultant submittals and inspection requests with their answers, by the other
// system's own identifier, upserted so a re-send changes nothing. The other system is the source of truth for what it sends; the platform's gates still read the result — an
// inspection answered A or B there is the acceptance the quality gate asks for here. Every record gets an outcome in the sync log.
import { and, eq, inArray } from "drizzle-orm";
import { apiKeys, auditLogs, consultantSubmittals, integrationMappings, materialMasters, pmcActivityDefinitions, pmcInspectionRequestUnits, pmcInspectionRequests, pmcUnits, projects } from "../../drizzle/schema";
import { getDb } from "../db";
import { ensureReplyCodes } from "../qualityGate";
import { SUBMITTAL_TYPES } from "../consultantSubmittals";
import { emitWebhookEvent, kickWebhookDelivery } from "./webhooks";
import { finishSyncRun, recordSyncItems, stableHash, startSyncRun, type SyncItem } from "./sync";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Applied = Omit<SyncItem, "entityType" | "externalId">;
const reject = (reason: string, detail?: string): Applied => ({ outcome: "rejected", reason, detail });
export type ExternalActor = { tenantId: string; apiKeyId?: string; userId?: number };
export type ExternalSubmittal = { externalId: string; project: string; type: string; number: string; revision?: number; title: string; sentAt?: string; dueAt?: string; repliedAt?: string; replyCode?: string; replyNote?: string; material?: string; unit?: number; activity?: string };
export type ExternalInspection = { externalId: string; project: string; requestCode: string; units: number[]; activity: string; requestedAt: string; responseCode?: "A" | "B" | "C" | "UR" | null; contractor?: string; consultant?: string };

async function mappingOf(db: Db, tenantId: string, system: string, entityType: string, externalId: string) {
  return (await db.select({ internalId: integrationMappings.internalId, payloadHash: integrationMappings.payloadHash }).from(integrationMappings).where(and(eq(integrationMappings.tenantId, tenantId), eq(integrationMappings.system, system), eq(integrationMappings.entityType, entityType), eq(integrationMappings.externalId, externalId))).limit(1))[0];
}
async function remember(db: Db, tenantId: string, system: string, entityType: string, externalId: string, internalId: string, hash: string, code?: string) {
  await db.insert(integrationMappings).values({ id: crypto.randomUUID(), tenantId, system, entityType, externalId, internalId, internalCode: code, payloadHash: hash, lastSyncedAt: new Date() })
    .onConflictDoUpdate({ target: [integrationMappings.tenantId, integrationMappings.system, integrationMappings.entityType, integrationMappings.externalId], set: { internalId, internalCode: code, payloadHash: hash, lastSyncedAt: new Date(), updatedAt: new Date() } });
}
async function keyOwner(db: Db, actor: ExternalActor): Promise<number> {
  if (actor.userId) return actor.userId;
  const [key] = actor.apiKeyId ? await db.select({ userId: apiKeys.createdByUserId }).from(apiKeys).where(eq(apiKeys.id, actor.apiKeyId)).limit(1) : [];
  if (!key) throw new Error("INTEGRATION_ACTOR_MISSING");
  return key.userId;
}
const when = (value: string | undefined): Date | null | "bad" => { if (!value) return null; const date = new Date(value); return Number.isNaN(date.getTime()) ? "bad" : date; };

async function applySubmittal(db: Db, actor: ExternalActor, system: string, record: ExternalSubmittal): Promise<Applied> {
  if (!(SUBMITTAL_TYPES as readonly string[]).includes(record.type)) return reject("TYPE_UNKNOWN", record.type);
  const sentAt = when(record.sentAt); const dueAt = when(record.dueAt); const repliedAt = when(record.repliedAt);
  if (sentAt === "bad" || dueAt === "bad" || repliedAt === "bad") return reject("DATE_INVALID");
  if (repliedAt && !sentAt) return reject("REPLY_WITHOUT_SENT");
  if (repliedAt && sentAt && repliedAt < sentAt) return reject("REPLY_BEFORE_SENT");
  if (record.replyCode && !repliedAt) return reject("REPLY_CODE_WITHOUT_DATE");
  const [project] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.tenantId, actor.tenantId), eq(projects.code, record.project))).limit(1);
  if (!project) return reject("PROJECT_UNKNOWN", record.project);
  let replyCode: string | null = null;
  if (record.replyCode) {
    const code = (await ensureReplyCodes(db, actor.tenantId)).find(item => item.code === record.replyCode!.trim().toUpperCase() && item.active);
    if (!code) return reject("REPLY_CODE_UNKNOWN", record.replyCode);
    replyCode = code.code;
  }
  let materialId: string | null = null;
  if (record.material) { const [m] = await db.select({ id: materialMasters.id }).from(materialMasters).where(and(eq(materialMasters.tenantId, actor.tenantId), eq(materialMasters.code, record.material))).limit(1); if (!m) return reject("MATERIAL_UNKNOWN", record.material); materialId = m.id; }
  if (record.type === "material_approval" && !materialId) return reject("MATERIAL_REQUIRED");
  let unit: { id: string; modelCode: string } | undefined;
  if (record.unit !== undefined) { [unit] = await db.select({ id: pmcUnits.id, modelCode: pmcUnits.modelCode }).from(pmcUnits).where(and(eq(pmcUnits.projectId, project.id), eq(pmcUnits.unitNumber, record.unit))).limit(1); if (!unit) return reject("UNIT_UNKNOWN", String(record.unit)); }
  let activityId: string | null = null;
  if (record.activity) {
    const [activity] = await db.select({ id: pmcActivityDefinitions.id }).from(pmcActivityDefinitions).where(and(eq(pmcActivityDefinitions.projectId, project.id), eq(pmcActivityDefinitions.code, record.activity), unit ? eq(pmcActivityDefinitions.modelCode, unit.modelCode) : undefined)).limit(1);
    if (!activity) return reject("ACTIVITY_UNKNOWN", record.activity); activityId = activity.id;
  }
  const status = replyCode ? "replied" : sentAt ? "sent" : "draft";
  const revision = record.revision ?? 0;
  const hash = stableHash(record);
  const mapped = await mappingOf(db, actor.tenantId, system, "submittal", record.externalId);
  const values = { submittalType: record.type as (typeof SUBMITTAL_TYPES)[number], submittalNumber: record.number, revision, title: record.title, status: status as "draft" | "sent" | "replied", sentAt, dueAt, repliedAt, replyCode, replyNote: record.replyNote ?? null, materialId, pmcUnitId: unit?.id ?? null, pmcActivityDefinitionId: activityId };
  if (mapped?.internalId) {
    if (mapped.payloadHash === hash) return { outcome: "unchanged" };
    await db.update(consultantSubmittals).set({ ...values, updatedAt: new Date() }).where(and(eq(consultantSubmittals.id, mapped.internalId), eq(consultantSubmittals.tenantId, actor.tenantId)));
    await remember(db, actor.tenantId, system, "submittal", record.externalId, mapped.internalId, hash, record.number);
    return { outcome: "updated" };
  }
  const [clash] = await db.select({ id: consultantSubmittals.id }).from(consultantSubmittals).where(and(eq(consultantSubmittals.projectId, project.id), eq(consultantSubmittals.submittalNumber, record.number), eq(consultantSubmittals.revision, revision))).limit(1);
  if (clash) return reject("NUMBER_REVISION_TAKEN", `${record.number} r${revision}`);
  const id = crypto.randomUUID();
  await db.insert(consultantSubmittals).values({ id, tenantId: actor.tenantId, projectId: project.id, ...values, createdByUserId: await keyOwner(db, actor) });
  await remember(db, actor.tenantId, system, "submittal", record.externalId, id, hash, record.number);
  return { outcome: "created" };
}

async function applyInspection(db: Db, actor: ExternalActor, system: string, record: ExternalInspection): Promise<Applied> {
  const requestedAt = new Date(record.requestedAt);
  if (Number.isNaN(requestedAt.getTime())) return reject("DATE_INVALID", "requestedAt");
  if (!record.units?.length) return reject("UNITS_REQUIRED");
  if (record.responseCode && !["A", "B", "C", "UR"].includes(record.responseCode)) return reject("RESPONSE_CODE_UNKNOWN", String(record.responseCode));
  const [project] = await db.select({ id: projects.id }).from(projects).where(and(eq(projects.tenantId, actor.tenantId), eq(projects.code, record.project))).limit(1);
  if (!project) return reject("PROJECT_UNKNOWN", record.project);
  const unitRows = await db.select({ id: pmcUnits.id, number: pmcUnits.unitNumber, modelCode: pmcUnits.modelCode }).from(pmcUnits).where(and(eq(pmcUnits.projectId, project.id), inArray(pmcUnits.unitNumber, record.units)));
  const missing = record.units.filter(number => !unitRows.some(row => row.number === number));
  if (missing.length) return reject("UNIT_UNKNOWN", missing.slice(0, 5).join(","));
  const models = new Set(unitRows.map(row => row.modelCode));
  if (models.size !== 1) return reject("UNITS_MIXED_MODELS");
  const [activity] = await db.select({ id: pmcActivityDefinitions.id }).from(pmcActivityDefinitions).where(and(eq(pmcActivityDefinitions.projectId, project.id), eq(pmcActivityDefinitions.code, record.activity), eq(pmcActivityDefinitions.modelCode, unitRows[0].modelCode))).limit(1);
  if (!activity) return reject("ACTIVITY_UNKNOWN", record.activity);
  const hash = stableHash(record);
  const mapped = await mappingOf(db, actor.tenantId, system, "inspection", record.externalId);
  const response = record.responseCode ?? null;
  if (mapped?.internalId) {
    if (mapped.payloadHash === hash) return { outcome: "unchanged" };
    await db.update(pmcInspectionRequests).set({ responseCode: response, contractorLabel: record.contractor ?? null, consultantLabel: record.consultant ?? null, requestedAt, updatedAt: new Date() }).where(and(eq(pmcInspectionRequests.id, mapped.internalId), eq(pmcInspectionRequests.tenantId, actor.tenantId)));
    await remember(db, actor.tenantId, system, "inspection", record.externalId, mapped.internalId, hash, record.requestCode);
    return { outcome: "updated" };
  }
  const [clash] = await db.select({ id: pmcInspectionRequests.id }).from(pmcInspectionRequests).where(and(eq(pmcInspectionRequests.projectId, project.id), eq(pmcInspectionRequests.requestCode, record.requestCode))).limit(1);
  if (clash) return reject("REQUEST_CODE_TAKEN", record.requestCode);
  const id = crypto.randomUUID();
  await db.insert(pmcInspectionRequests).values({ id, tenantId: actor.tenantId, projectId: project.id, requestCode: record.requestCode, activityDefinitionId: activity.id, contractorLabel: record.contractor ?? null, consultantLabel: record.consultant ?? null, responseCode: response, requestedAt });
  await db.insert(pmcInspectionRequestUnits).values(unitRows.map(row => ({ id: crypto.randomUUID(), tenantId: actor.tenantId, projectId: project.id, inspectionRequestId: id, unitId: row.id })));
  await remember(db, actor.tenantId, system, "inspection", record.externalId, id, hash, record.requestCode);
  return { outcome: "created" };
}

export async function applyExternalBatch(input: { actor: ExternalActor; system: string; entity: "submittals" | "inspections"; records: ReadonlyArray<unknown>; trigger?: "api" | "manual" | "scheduled" }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const entityType = input.entity === "submittals" ? "submittal" : "inspection";
  const runId = await startSyncRun(db, { tenantId: input.actor.tenantId, system: input.system, direction: "in", trigger: input.trigger ?? "api", entityType, apiKeyId: input.actor.apiKeyId, startedByUserId: input.actor.userId });
  const items: SyncItem[] = [];
  for (const raw of input.records) {
    const record = raw as { externalId?: string };
    const externalId = typeof record?.externalId === "string" && record.externalId.trim() ? record.externalId.trim() : null;
    if (!externalId) { items.push({ entityType, externalId: null, ...reject("EXTERNAL_ID_MISSING") }); continue; }
    try {
      const applied = await db.transaction(async tx => {
        const handle = tx as unknown as Db;
        return input.entity === "submittals" ? applySubmittal(handle, input.actor, input.system, { ...(raw as ExternalSubmittal), externalId }) : applyInspection(handle, input.actor, input.system, { ...(raw as ExternalInspection), externalId });
      });
      items.push({ entityType, externalId, ...applied });
    } catch (error) { items.push({ entityType, externalId, ...reject("APPLY_FAILED", error instanceof Error ? error.message.slice(0, 200) : "error") }); }
  }
  await recordSyncItems(db, input.actor.tenantId, runId, items);
  const summary = await finishSyncRun(db, runId, items);
  await db.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.actor.tenantId, actorUserId: input.actor.userId ?? null, action: "integration.external_batch_applied", entityType: "integration_sync_run", entityId: runId, metadata: JSON.stringify({ system: input.system, entity: input.entity, apiKeyId: input.actor.apiKeyId ?? null, ...summary }) });
  await emitWebhookEvent(db, input.actor.tenantId, "sync.completed", { system: input.system, entity: input.entity, ...summary });
  kickWebhookDelivery();
  return { ...summary, items: items.map(({ entityType: _type, ...item }) => item) };
}
