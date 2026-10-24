// What the company's ERP sends the platform (work order 12, item 9): suppliers, purchase orders, actual costs, and — kept but not applied — supplier invoices, payments
// and employee cost. A batch is idempotent: every record carries the ERP's own identifier, the mapping remembers what was applied for it, and sending the same record again
// says "unchanged". Nothing is written around the platform's own rules, and every record gets an outcome in the sync log. Decisions that were not in the order (docs/STATE.md):
//   · a purchase order from the ERP arrives as a DRAFT (the platform's own approval is not skipped), and only a draft is updated by a later send;
//   · an actual cost from the ERP is a posted actual cost on a WBS item that exists, and once posted it is not changed (a changed re-send is refused, not applied);
//   · invoices, payments and employee cost have no table here: they are STORED as received and reported "stored", not invented into one.
import { and, eq } from "drizzle-orm";
import { auditLogs, costEntries, integrationInboundRecords, integrationMappings, projects, purchaseOrders, suppliers, wbsItems } from "../../drizzle/schema";
import { getDb } from "../db";
import { emitWebhookEvent, kickWebhookDelivery } from "./webhooks";
import { finishSyncRun, recordSyncItems, stableHash, startSyncRun, type SyncItem } from "./sync";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
export type ErpEntity = "suppliers" | "purchase-orders" | "actual-costs" | "invoices" | "payments" | "employee-costs";
export const ERP_ENTITIES: readonly ErpEntity[] = ["suppliers", "purchase-orders", "actual-costs", "invoices", "payments", "employee-costs"];
const ENTITY_TYPE: Record<ErpEntity, string> = { suppliers: "supplier", "purchase-orders": "purchase_order", "actual-costs": "actual_cost", invoices: "invoice", payments: "payment", "employee-costs": "employee_cost" };
export type Actor = { tenantId: string; apiKeyId?: string; userId?: number };

type Mapping = { id: string; internalId: string | null; payloadHash: string | null };
const mappingOf = async (db: Db, tenantId: string, system: string, entityType: string, externalId: string): Promise<Mapping | undefined> =>
  (await db.select({ id: integrationMappings.id, internalId: integrationMappings.internalId, payloadHash: integrationMappings.payloadHash }).from(integrationMappings).where(and(eq(integrationMappings.tenantId, tenantId), eq(integrationMappings.system, system), eq(integrationMappings.entityType, entityType), eq(integrationMappings.externalId, externalId))).limit(1))[0];
async function remember(db: Db, tenantId: string, system: string, entityType: string, externalId: string, internalId: string | null, hash: string, internalCode?: string) {
  await db.insert(integrationMappings).values({ id: crypto.randomUUID(), tenantId, system, entityType, externalId, internalId, internalCode, payloadHash: hash, lastSyncedAt: new Date() })
    .onConflictDoUpdate({ target: [integrationMappings.tenantId, integrationMappings.system, integrationMappings.entityType, integrationMappings.externalId], set: { internalId, internalCode, payloadHash: hash, lastSyncedAt: new Date(), updatedAt: new Date() } });
}

/** A project by its code, or by the id the ERP uses for its cost center. */
async function findProject(db: Db, tenantId: string, system: string, ref: string) {
  const mapped = await mappingOf(db, tenantId, system, "cost_center", ref);
  const where = mapped?.internalId ? and(eq(projects.tenantId, tenantId), eq(projects.id, mapped.internalId)) : and(eq(projects.tenantId, tenantId), eq(projects.code, ref));
  return (await db.select({ id: projects.id, currency: projects.currency }).from(projects).where(where).limit(1))[0];
}
/** A WBS item of the project by the ERP's cost code (mapped), or by the WBS code itself. */
async function findWbs(db: Db, tenantId: string, projectId: string, system: string, costCode: string) {
  const mapped = await mappingOf(db, tenantId, system, "cost_code", costCode);
  const where = mapped?.internalId ? and(eq(wbsItems.tenantId, tenantId), eq(wbsItems.projectId, projectId), eq(wbsItems.id, mapped.internalId)) : and(eq(wbsItems.tenantId, tenantId), eq(wbsItems.projectId, projectId), eq(wbsItems.code, costCode));
  return (await db.select({ id: wbsItems.id }).from(wbsItems).where(where).limit(1))[0];
}

export type SupplierRecord = { externalId: string; code: string; legalName: string; contactName?: string; contactEmail?: string; contactPhone?: string; active?: boolean };
export type PurchaseOrderRecord = { externalId: string; project: string; number: string; supplier?: string; supplierName?: string; orderDate: string; amount: number; currency?: string; summary?: string; costCode?: string };
export type ActualCostRecord = { externalId: string; project: string; costCode: string; amount: number; incurredAt: string; category?: "materials" | "labour" | "subcontract" | "other"; description?: string };
export type GenericRecord = { externalId: string } & Record<string, unknown>;

type Applied = Omit<SyncItem, "entityType" | "externalId">;
const reject = (reason: string, detail?: string): Applied => ({ outcome: "rejected", reason, detail });

async function applySupplier(db: Db, actor: Actor, system: string, record: SupplierRecord): Promise<Applied> {
  const hash = stableHash(record);
  const mapped = await mappingOf(db, actor.tenantId, system, "supplier", record.externalId);
  const byCode = (await db.select({ id: suppliers.id }).from(suppliers).where(and(eq(suppliers.tenantId, actor.tenantId), eq(suppliers.code, record.code))).limit(1))[0];
  const target = mapped?.internalId ? { id: mapped.internalId } : byCode;
  if (byCode && mapped?.internalId && byCode.id !== mapped.internalId) return reject("SUPPLIER_CODE_TAKEN", record.code);
  // A supplier the platform already has under this code is adopted by the first ERP id that names it; once another ERP id owns it, the code is taken.
  if (byCode && !mapped?.internalId) {
    const [owner] = await db.select({ externalId: integrationMappings.externalId }).from(integrationMappings).where(and(eq(integrationMappings.tenantId, actor.tenantId), eq(integrationMappings.system, system), eq(integrationMappings.entityType, "supplier"), eq(integrationMappings.internalId, byCode.id))).limit(1);
    if (owner && owner.externalId !== record.externalId) return reject("SUPPLIER_CODE_TAKEN", record.code);
  }
  if (target && mapped?.payloadHash === hash) return { outcome: "unchanged" };
  const values = { code: record.code, legalName: record.legalName, contactName: record.contactName ?? null, contactEmail: record.contactEmail ?? null, contactPhone: record.contactPhone ?? null, active: record.active ?? true };
  if (target) {
    await db.update(suppliers).set({ ...values, updatedAt: new Date() }).where(and(eq(suppliers.id, target.id), eq(suppliers.tenantId, actor.tenantId)));
    await remember(db, actor.tenantId, system, "supplier", record.externalId, target.id, hash, record.code);
    return { outcome: "updated" };
  }
  const id = crypto.randomUUID();
  // suppliers.created_by_user_id is a real person; an integration has none, so the company's key creator is not guessed — the first admin of the company stands in
  const creator = await integrationActorUserId(db, actor);
  await db.insert(suppliers).values({ id, tenantId: actor.tenantId, ...values, createdByUserId: creator });
  await remember(db, actor.tenantId, system, "supplier", record.externalId, id, hash, record.code);
  return { outcome: "created" };
}

/** Tables that record a person (created_by) need one: the person who made the key that is calling, or the person who started the pull. */
async function integrationActorUserId(db: Db, actor: Actor): Promise<number> {
  if (actor.userId) return actor.userId;
  if (actor.apiKeyId) {
    const { apiKeys } = await import("../../drizzle/schema");
    const [key] = await db.select({ userId: apiKeys.createdByUserId }).from(apiKeys).where(eq(apiKeys.id, actor.apiKeyId)).limit(1);
    if (key) return key.userId;
  }
  throw new Error("INTEGRATION_ACTOR_MISSING");
}

async function applyPurchaseOrder(db: Db, actor: Actor, system: string, record: PurchaseOrderRecord): Promise<Applied> {
  if (!(Number(record.amount) > 0)) return reject("AMOUNT_INVALID");
  if ((record.currency ?? "SAR") !== "SAR") return reject("CURRENCY_NOT_SAR", record.currency);
  const orderDate = new Date(record.orderDate);
  if (Number.isNaN(orderDate.getTime())) return reject("DATE_INVALID", "orderDate");
  const project = await findProject(db, actor.tenantId, system, record.project);
  if (!project) return reject("PROJECT_UNKNOWN", record.project);
  let supplierId: string | null = null; let supplierName = record.supplierName ?? "";
  if (record.supplier) {
    const mapped = await mappingOf(db, actor.tenantId, system, "supplier", record.supplier);
    const [supplier] = await db.select({ id: suppliers.id, legalName: suppliers.legalName }).from(suppliers).where(mapped?.internalId ? and(eq(suppliers.tenantId, actor.tenantId), eq(suppliers.id, mapped.internalId)) : and(eq(suppliers.tenantId, actor.tenantId), eq(suppliers.code, record.supplier))).limit(1);
    if (!supplier) return reject("SUPPLIER_UNKNOWN", record.supplier);
    supplierId = supplier.id; supplierName = supplier.legalName;
  }
  if (!supplierName) return reject("SUPPLIER_REQUIRED");
  let wbsItemId: string | null = null;
  if (record.costCode) { const wbs = await findWbs(db, actor.tenantId, project.id, system, record.costCode); if (!wbs) return reject("COST_CODE_UNKNOWN", record.costCode); wbsItemId = wbs.id; }
  const hash = stableHash(record);
  const mapped = await mappingOf(db, actor.tenantId, system, "purchase_order", record.externalId);
  if (mapped?.internalId) {
    if (mapped.payloadHash === hash) return { outcome: "unchanged" };
    const [existing] = await db.select({ status: purchaseOrders.status }).from(purchaseOrders).where(and(eq(purchaseOrders.id, mapped.internalId), eq(purchaseOrders.tenantId, actor.tenantId))).limit(1);
    if (!existing) return reject("PURCHASE_ORDER_MISSING", "mapped order no longer exists");
    if (existing.status !== "draft") return reject("PURCHASE_ORDER_NOT_DRAFT", existing.status);
    await db.update(purchaseOrders).set({ supplierId, supplierName, orderDate, amount: String(record.amount), summary: record.summary ?? "", wbsItemId, updatedAt: new Date() }).where(and(eq(purchaseOrders.id, mapped.internalId), eq(purchaseOrders.tenantId, actor.tenantId)));
    await remember(db, actor.tenantId, system, "purchase_order", record.externalId, mapped.internalId, hash, record.number);
    return { outcome: "updated" };
  }
  const [clash] = await db.select({ id: purchaseOrders.id }).from(purchaseOrders).where(and(eq(purchaseOrders.projectId, project.id), eq(purchaseOrders.purchaseOrderNumber, record.number))).limit(1);
  if (clash) return reject("PURCHASE_ORDER_NUMBER_TAKEN", record.number);
  const id = crypto.randomUUID();
  await db.insert(purchaseOrders).values({ id, tenantId: actor.tenantId, projectId: project.id, supplierId, supplierName, purchaseOrderNumber: record.number, orderDate, amount: String(record.amount), currency: "SAR", summary: record.summary ?? "", wbsItemId, status: "draft", createdByUserId: await integrationActorUserId(db, actor) });
  await remember(db, actor.tenantId, system, "purchase_order", record.externalId, id, hash, record.number);
  return { outcome: "created" };
}

async function applyActualCost(db: Db, actor: Actor, system: string, record: ActualCostRecord): Promise<Applied> {
  if (!Number.isFinite(record.amount) || record.amount === 0) return reject("AMOUNT_INVALID");
  const incurredAt = new Date(record.incurredAt);
  if (Number.isNaN(incurredAt.getTime())) return reject("DATE_INVALID", "incurredAt");
  const project = await findProject(db, actor.tenantId, system, record.project);
  if (!project) return reject("PROJECT_UNKNOWN", record.project);
  const wbs = await findWbs(db, actor.tenantId, project.id, system, record.costCode);
  if (!wbs) return reject("COST_CODE_UNKNOWN", record.costCode);
  const hash = stableHash(record);
  const mapped = await mappingOf(db, actor.tenantId, system, "actual_cost", record.externalId);
  if (mapped?.internalId) return mapped.payloadHash === hash ? { outcome: "unchanged" } : reject("COST_ALREADY_POSTED", "a posted cost is not changed by a re-send");
  const id = crypto.randomUUID();
  await db.insert(costEntries).values({ id, tenantId: actor.tenantId, projectId: project.id, wbsItemId: wbs.id, amount: String(Math.round(record.amount * 100) / 100), entryType: "actual", status: "posted", incurredAt, category: record.category ?? "other", sourceType: "erp", sourceId: id });
  await remember(db, actor.tenantId, system, "actual_cost", record.externalId, id, hash);
  return { outcome: "created" };
}

async function storeOnly(db: Db, actor: Actor, system: string, entityType: string, runId: string, record: GenericRecord): Promise<Applied> {
  const hash = stableHash(record);
  const [existing] = await db.select({ payload: integrationInboundRecords.payload }).from(integrationInboundRecords).where(and(eq(integrationInboundRecords.tenantId, actor.tenantId), eq(integrationInboundRecords.system, system), eq(integrationInboundRecords.entityType, entityType), eq(integrationInboundRecords.externalId, record.externalId))).limit(1);
  const payload = JSON.stringify(record);
  if (existing && stableHash(JSON.parse(existing.payload)) === hash) return { outcome: "unchanged" };
  await db.insert(integrationInboundRecords).values({ id: crypto.randomUUID(), tenantId: actor.tenantId, system, entityType, externalId: record.externalId, payload, runId })
    .onConflictDoUpdate({ target: [integrationInboundRecords.tenantId, integrationInboundRecords.system, integrationInboundRecords.entityType, integrationInboundRecords.externalId], set: { payload, runId, receivedAt: new Date() } });
  return { outcome: "stored", reason: "NO_TABLE", detail: "kept as received; the platform has no table to apply it to" };
}

export async function applyErpBatch(input: { actor: Actor; system: string; entity: ErpEntity; records: ReadonlyArray<unknown>; trigger?: "api" | "manual" | "scheduled" }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const entityType = ENTITY_TYPE[input.entity];
  const runId = await startSyncRun(db, { tenantId: input.actor.tenantId, system: input.system, direction: "in", trigger: input.trigger ?? "api", entityType, apiKeyId: input.actor.apiKeyId, startedByUserId: input.actor.userId });
  const items: SyncItem[] = [];
  for (const raw of input.records) {
    const record = raw as GenericRecord;
    const externalId = typeof record?.externalId === "string" && record.externalId.trim() ? record.externalId.trim() : null;
    if (!externalId) { items.push({ entityType, externalId: null, ...reject("EXTERNAL_ID_MISSING") }); continue; }
    try {
      // each record is its own unit: one refused or failed record never takes the rest of the batch with it
      const applied = await db.transaction(async tx => {
        const handle = tx as unknown as Db;
        switch (input.entity) {
          case "suppliers": return applySupplier(handle, input.actor, input.system, record as unknown as SupplierRecord);
          case "purchase-orders": return applyPurchaseOrder(handle, input.actor, input.system, record as unknown as PurchaseOrderRecord);
          case "actual-costs": return applyActualCost(handle, input.actor, input.system, record as unknown as ActualCostRecord);
          default: return storeOnly(handle, input.actor, input.system, entityType, runId, record);
        }
      });
      items.push({ entityType, externalId, ...applied });
    } catch (error) {
      items.push({ entityType, externalId, ...reject("APPLY_FAILED", error instanceof Error ? error.message.slice(0, 200) : "error") });
    }
  }
  await recordSyncItems(db, input.actor.tenantId, runId, items);
  const summary = await finishSyncRun(db, runId, items);
  await db.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.actor.tenantId, actorUserId: input.actor.userId ?? null, action: "integration.erp_batch_applied", entityType: "integration_sync_run", entityId: runId, metadata: JSON.stringify({ system: input.system, entity: input.entity, apiKeyId: input.actor.apiKeyId ?? null, ...summary }) });
  await emitWebhookEvent(db, input.actor.tenantId, "sync.completed", { system: input.system, entity: input.entity, ...summary });
  kickWebhookDelivery();
  return { ...summary, items: items.map(({ entityType: _type, ...item }) => item) };
}
