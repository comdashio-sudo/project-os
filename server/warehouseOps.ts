// Warehouse operations added by work order 12, item 3: returns to the shelf, transfers between projects, stock counts, finding a material by code/QR/name,
// and issuing into a (unit, activity) cell. Receipt, issue-to-work and the in-project transfer already exist in db.ts and are not redone here.
//
// Rules that are decisions rather than facts (recorded in docs/STATE.md):
//  - a return is a receipt movement at the issue's own unit cost AND a negative actual cost entry for the same amount: the original issue and its charge stay on the books;
//  - a stock count's difference becomes an inventory adjustment only (valued at the shelf's average); it is NOT booked as a project cost (no financial rule for shrinkage is described, OPEN);
//  - stock moved to another project carries exactly the value the source gave up, and books no cost on either side.
import { TRPCError } from "@trpc/server";
import { and, asc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import {
  auditLogs,
  costEntries,
  materialIssues,
  materialMasters,
  materialReturns,
  pmcActivityDefinitions,
  pmcUnits,
  projectWarehouses,
  warehouseInventoryTransactions,
  warehouseInventoryTransfers,
  warehouseStocktakeLines,
  warehouseStocktakes,
} from "../drizzle/schema";
import { assertInventoryReason, assertProjectWithinTenant, createMaterialIssueForTenant, getDb, getTenantAccessSnapshot, stockPositionOf } from "./db";
import { assertTenantAccess } from "./domain/authorization";
import { adjustmentAtAverage, pricedReceipt, transferValuation, valuedIssue } from "./domain/inventoryValuation";

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const round3 = (value: number) => Math.round((value + Number.EPSILON) * 1000) / 1000;

async function authorizeInventory(input: { userId: number; tenantId: string; projectId: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: "project.inventory.manage", scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  return db;
}

async function activeWarehouse(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, key: { tenantId: string; projectId: string; warehouseId: string }) {
  const [row] = await db.select({ id: projectWarehouses.id, active: projectWarehouses.active }).from(projectWarehouses)
    .where(and(eq(projectWarehouses.id, key.warehouseId), eq(projectWarehouses.tenantId, key.tenantId), eq(projectWarehouses.projectId, key.projectId))).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_WAREHOUSE_NOT_FOUND" });
  if (!row.active) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_WAREHOUSE_INACTIVE" });
  return row;
}

// ------------------------------------------------------------------------------------------------------------------------------ return

export async function returnMaterialToWarehouseForTenant(input: { userId: number; tenantId: string; projectId: string; materialIssueId: string; quantity: number; reason: string; returnedAt: Date; warehouseId?: string }) {
  const db = await authorizeInventory(input);
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_MATERIAL_RETURN_QUANTITY_INVALID" });
  assertInventoryReason(input.reason);
  const [issue] = await db.select().from(materialIssues).where(and(eq(materialIssues.id, input.materialIssueId), eq(materialIssues.tenantId, input.tenantId), eq(materialIssues.projectId, input.projectId))).limit(1);
  if (!issue) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_MATERIAL_ISSUE_NOT_FOUND" });
  const [issueMovement] = await db.select({ warehouseId: warehouseInventoryTransactions.warehouseId, unitCost: warehouseInventoryTransactions.unitCost, valueDelta: warehouseInventoryTransactions.valueDelta })
    .from(warehouseInventoryTransactions).where(eq(warehouseInventoryTransactions.id, issue.inventoryTransactionId)).limit(1);
  if (!issueMovement) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_MATERIAL_ISSUE_NOT_FOUND" });
  const warehouseId = input.warehouseId ?? issueMovement.warehouseId;
  await activeWarehouse(db, { tenantId: input.tenantId, projectId: input.projectId, warehouseId });

  const returnId = crypto.randomUUID(); const transactionId = crypto.randomUUID(); const costEntryId = crypto.randomUUID();
  let result!: { id: string; quantity: number; totalCost: number; returnableAfter: number };
  await db.transaction(async tx => {
    // The issue row is the lock: two returns of the same issue queue behind each other and the second sees the first.
    await tx.execute(sql`SELECT id FROM material_issues WHERE id = ${issue.id} FOR UPDATE`);
    await tx.execute(sql`SELECT id FROM project_warehouses WHERE id = ${warehouseId} FOR UPDATE`);
    const prior = await tx.select({ quantity: materialReturns.quantity, totalCost: materialReturns.totalCost }).from(materialReturns).where(eq(materialReturns.materialIssueId, issue.id));
    const returnedQuantity = round3(prior.reduce((total, row) => total + Number(row.quantity), 0));
    const returnedCost = round2(prior.reduce((total, row) => total + Number(row.totalCost), 0));
    const returnable = round3(Number(issue.issuedQuantity) - returnedQuantity);
    if (input.quantity > returnable) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_MATERIAL_RETURN_EXCEEDS_ISSUE" });
    // The last unit back reverses exactly what is left of the charge, so rounding never strands a few cents on the project.
    const totalCost = input.quantity === returnable ? round2(Number(issue.totalCost) - returnedCost) : round2(input.quantity * Number(issue.unitCost));
    const priced = issueMovement.valueDelta !== null && issueMovement.unitCost !== null ? pricedReceipt(input.quantity, Number(issueMovement.unitCost)) : { unitCost: null, valueDelta: null };
    await tx.insert(warehouseInventoryTransactions).values({
      id: transactionId, tenantId: input.tenantId, projectId: input.projectId, warehouseId, materialId: issue.materialId, transactionType: "receipt", quantityDelta: String(input.quantity),
      unitCost: priced.unitCost === null ? null : priced.unitCost.toFixed(4), valueDelta: priced.valueDelta === null ? null : priced.valueDelta.toFixed(2),
      referenceNumber: `RET-${issue.id.slice(0, 8)}`, note: input.reason, occurredAt: input.returnedAt, createdByUserId: input.userId,
    });
    await tx.insert(costEntries).values({
      id: costEntryId, tenantId: input.tenantId, projectId: input.projectId, wbsItemId: issue.wbsItemId, amount: String(-totalCost), entryType: "actual", status: "posted",
      incurredAt: input.returnedAt, category: "materials", sourceType: "material_return", sourceId: returnId,
    });
    await tx.insert(materialReturns).values({
      id: returnId, tenantId: input.tenantId, projectId: input.projectId, materialIssueId: issue.id, inventoryTransactionId: transactionId, costEntryId,
      quantity: String(input.quantity), unitCost: issue.unitCost, totalCost: String(totalCost), returnedAt: input.returnedAt, reason: input.reason, createdByUserId: input.userId,
    });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "warehouse.material_returned", entityType: "material_return", entityId: returnId,
      metadata: JSON.stringify({ projectId: input.projectId, warehouseId, materialIssueId: issue.id, materialId: issue.materialId, quantity: input.quantity, totalCost, costEntryId, inventoryTransactionId: transactionId }) });
    result = { id: returnId, quantity: input.quantity, totalCost, returnableAfter: round3(returnable - input.quantity) };
  });
  return result;
}

// ------------------------------------------------------------------------------------------------------------------ transfer between projects

export async function transferBetweenProjectsForTenant(input: { userId: number; tenantId: string; sourceProjectId: string; sourceWarehouseId: string; destinationProjectId: string; destinationWarehouseId: string; materialId: string; quantity: number; reason: string; transferredAt: Date; referenceNumber?: string }) {
  // The person must be allowed to move stock out of the first project AND into the second: both checks, neither assumed from the other. They come first:
  // a stranger is refused for lack of right, never told anything about the request's shape.
  const db = await authorizeInventory({ userId: input.userId, tenantId: input.tenantId, projectId: input.sourceProjectId });
  await authorizeInventory({ userId: input.userId, tenantId: input.tenantId, projectId: input.destinationProjectId });
  if (input.sourceProjectId === input.destinationProjectId) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_INVENTORY_TRANSFER_SAME_PROJECT" });
  if (!Number.isFinite(input.quantity) || input.quantity <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_INVENTORY_TRANSFER_QUANTITY_INVALID" });
  assertInventoryReason(input.reason);
  await activeWarehouse(db, { tenantId: input.tenantId, projectId: input.sourceProjectId, warehouseId: input.sourceWarehouseId });
  await activeWarehouse(db, { tenantId: input.tenantId, projectId: input.destinationProjectId, warehouseId: input.destinationWarehouseId });
  const [material] = await db.select({ id: materialMasters.id }).from(materialMasters).where(and(eq(materialMasters.id, input.materialId), eq(materialMasters.tenantId, input.tenantId))).limit(1);
  if (!material) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_MATERIAL_NOT_FOUND" });

  const transferId = crypto.randomUUID(); const outId = crypto.randomUUID(); const inId = crypto.randomUUID();
  const [firstLock, secondLock] = [input.sourceWarehouseId, input.destinationWarehouseId].sort();
  let sourceNext = 0;
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM project_warehouses WHERE id IN (${firstLock}, ${secondLock}) FOR UPDATE`);
    const position = await stockPositionOf(tx, { tenantId: input.tenantId, projectId: input.sourceProjectId, warehouseId: input.sourceWarehouseId, materialId: input.materialId });
    sourceNext = round3(position.quantity - input.quantity);
    if (sourceNext < 0) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_INVENTORY_INSUFFICIENT_STOCK" });
    const valuation = transferValuation(position, input.quantity);
    const priced = (movement: { unitCost: number | null; valueDelta: number | null }) => ({ unitCost: movement.unitCost === null ? null : movement.unitCost.toFixed(4), valueDelta: movement.valueDelta === null ? null : movement.valueDelta.toFixed(2) });
    await tx.insert(warehouseInventoryTransfers).values({
      id: transferId, tenantId: input.tenantId, projectId: input.sourceProjectId, sourceWarehouseId: input.sourceWarehouseId, destinationWarehouseId: input.destinationWarehouseId, destinationProjectId: input.destinationProjectId,
      materialId: input.materialId, quantity: String(input.quantity), referenceNumber: input.referenceNumber, note: input.reason, transferredAt: input.transferredAt, createdByUserId: input.userId,
    });
    await tx.insert(warehouseInventoryTransactions).values([
      { id: outId, tenantId: input.tenantId, projectId: input.sourceProjectId, warehouseId: input.sourceWarehouseId, materialId: input.materialId, transferId, transactionType: "issue", quantityDelta: String(-input.quantity), ...priced(valuation.source), referenceNumber: input.referenceNumber, note: input.reason, occurredAt: input.transferredAt, createdByUserId: input.userId },
      { id: inId, tenantId: input.tenantId, projectId: input.destinationProjectId, warehouseId: input.destinationWarehouseId, materialId: input.materialId, transferId, transactionType: "receipt", quantityDelta: String(input.quantity), ...priced(valuation.destination), referenceNumber: input.referenceNumber, note: input.reason, occurredAt: input.transferredAt, createdByUserId: input.userId },
    ]);
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "warehouse.transferred_between_projects", entityType: "warehouse_inventory_transfer", entityId: transferId,
      metadata: JSON.stringify({ sourceProjectId: input.sourceProjectId, destinationProjectId: input.destinationProjectId, sourceWarehouseId: input.sourceWarehouseId, destinationWarehouseId: input.destinationWarehouseId, materialId: input.materialId, quantity: input.quantity, value: valuation.destination.valueDelta }) });
  });
  return { id: transferId, sourceTransactionId: outId, destinationTransactionId: inId, sourceQuantityAfter: sourceNext };
}

// ------------------------------------------------------------------------------------------------------------------------------ stock count

export async function recordStocktakeForTenant(input: { userId: number; tenantId: string; projectId: string; warehouseId: string; note: string; reference?: string; countedAt: Date; lines: Array<{ materialId: string; countedQuantity: number }> }) {
  const db = await authorizeInventory(input);
  assertInventoryReason(input.note);
  if (!input.lines.length) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_STOCKTAKE_EMPTY" });
  if (new Set(input.lines.map(line => line.materialId)).size !== input.lines.length) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_STOCKTAKE_DUPLICATE_MATERIAL" });
  if (input.lines.some(line => !Number.isFinite(line.countedQuantity) || line.countedQuantity < 0)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_STOCKTAKE_QUANTITY_INVALID" });
  await activeWarehouse(db, input);
  const known = await db.select({ id: materialMasters.id }).from(materialMasters).where(and(eq(materialMasters.tenantId, input.tenantId), inArray(materialMasters.id, input.lines.map(line => line.materialId))));
  if (known.length !== input.lines.length) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_MATERIAL_NOT_FOUND" });

  const stocktakeId = crypto.randomUUID();
  const report: Array<{ materialId: string; systemQuantity: number; countedQuantity: number; variance: number; valueDelta: number | null; adjusted: boolean }> = [];
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM project_warehouses WHERE id = ${input.warehouseId} FOR UPDATE`);
    await tx.insert(warehouseStocktakes).values({ id: stocktakeId, tenantId: input.tenantId, projectId: input.projectId, warehouseId: input.warehouseId, reference: input.reference, note: input.note, countedAt: input.countedAt, createdByUserId: input.userId });
    for (const line of input.lines) {
      const position = await stockPositionOf(tx, { tenantId: input.tenantId, projectId: input.projectId, warehouseId: input.warehouseId, materialId: line.materialId });
      const variance = round3(line.countedQuantity - position.quantity);
      let transactionId: string | null = null; let valueDelta: number | null = null;
      if (variance !== 0) {
        const priced = variance > 0 ? adjustmentAtAverage(position, variance) : valuedIssue(position, -variance);
        valueDelta = priced.valueDelta; transactionId = crypto.randomUUID();
        await tx.insert(warehouseInventoryTransactions).values({
          id: transactionId, tenantId: input.tenantId, projectId: input.projectId, warehouseId: input.warehouseId, materialId: line.materialId, transactionType: "adjustment", quantityDelta: String(variance),
          unitCost: priced.unitCost === null ? null : priced.unitCost.toFixed(4), valueDelta: priced.valueDelta === null ? null : priced.valueDelta.toFixed(2),
          referenceNumber: input.reference ?? `COUNT-${stocktakeId.slice(0, 8)}`, note: `Stock count: ${input.note}`.slice(0, 500), occurredAt: input.countedAt, createdByUserId: input.userId,
        });
      }
      await tx.insert(warehouseStocktakeLines).values({ id: crypto.randomUUID(), tenantId: input.tenantId, projectId: input.projectId, stocktakeId, materialId: line.materialId, systemQuantity: String(position.quantity), countedQuantity: String(line.countedQuantity), variance: String(variance), valueDelta: valueDelta === null ? null : valueDelta.toFixed(2), inventoryTransactionId: transactionId });
      report.push({ materialId: line.materialId, systemQuantity: position.quantity, countedQuantity: line.countedQuantity, variance, valueDelta, adjusted: transactionId !== null });
    }
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "warehouse.stocktake_recorded", entityType: "warehouse_stocktake", entityId: stocktakeId,
      metadata: JSON.stringify({ projectId: input.projectId, warehouseId: input.warehouseId, lines: report.length, adjusted: report.filter(row => row.adjusted).length }) });
  });
  return { id: stocktakeId, lines: report, adjusted: report.filter(row => row.adjusted).length };
}

// ------------------------------------------------------------------------------------------------------------------------------ find a material

const MATERIAL_QR_PREFIX = "MAT:";

/** What a QR label or a typed search points at: an exact code first (a scan), then the codes and names that contain the text. */
export async function findMaterialForTenant(input: { userId: number; tenantId: string; projectId: string; warehouseId: string; query: string }) {
  const db = await authorizeInventory(input);
  await activeWarehouse(db, input);
  const text = (input.query.startsWith(MATERIAL_QR_PREFIX) ? input.query.slice(MATERIAL_QR_PREFIX.length) : input.query).trim();
  if (!text) return [];
  const escaped = text.replace(/[\\%_]/g, match => `\\${match}`);
  const rows = await db.select({ id: materialMasters.id, code: materialMasters.code, description: materialMasters.description, unit: materialMasters.unitOfMeasure }).from(materialMasters)
    .where(and(eq(materialMasters.tenantId, input.tenantId), eq(materialMasters.active, true), or(ilike(materialMasters.code, `%${escaped}%`), ilike(materialMasters.description, `%${escaped}%`))))
    .orderBy(asc(materialMasters.code)).limit(20);
  // An exact code is the scan result: it goes first and, when it is the only exact match, alone.
  const exact = rows.filter(row => row.code.toLowerCase() === text.toLowerCase());
  const chosen = exact.length === 1 ? exact : rows;
  if (!chosen.length) return [];
  const onHand = await db.select({ materialId: warehouseInventoryTransactions.materialId, quantity: sql<string>`COALESCE(SUM(${warehouseInventoryTransactions.quantityDelta}), 0)` }).from(warehouseInventoryTransactions)
    .where(and(eq(warehouseInventoryTransactions.tenantId, input.tenantId), eq(warehouseInventoryTransactions.projectId, input.projectId), eq(warehouseInventoryTransactions.warehouseId, input.warehouseId), inArray(warehouseInventoryTransactions.materialId, chosen.map(row => row.id))))
    .groupBy(warehouseInventoryTransactions.materialId);
  const quantityOf = new Map(onHand.map(row => [row.materialId, Number(row.quantity)]));
  return chosen.map(row => ({ ...row, onHand: quantityOf.get(row.id) ?? 0, exact: exact.length === 1 }));
}

// ------------------------------------------------------------------------------------------------------------------------ issue into a cell

/** Issues stock to a unit's activity: the activity names its WBS item, so the person picks the material, the unit, the activity and the quantity — nothing else. */
export async function issueMaterialToCellForTenant(input: { userId: number; tenantId: string; projectId: string; warehouseId: string; materialId: string; pmcUnitId: string; pmcActivityDefinitionId: string; issuedQuantity: number; issuedAt: Date; referenceNumber?: string; note?: string }) {
  const db = await authorizeInventory(input);
  const [unit] = await db.select({ id: pmcUnits.id, modelCode: pmcUnits.modelCode }).from(pmcUnits).where(and(eq(pmcUnits.id, input.pmcUnitId), eq(pmcUnits.tenantId, input.tenantId), eq(pmcUnits.projectId, input.projectId))).limit(1);
  if (!unit) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_PMC_UNIT_NOT_FOUND" });
  const [definition] = await db.select({ id: pmcActivityDefinitions.id, modelCode: pmcActivityDefinitions.modelCode, wbsItemId: pmcActivityDefinitions.wbsItemId }).from(pmcActivityDefinitions)
    .where(and(eq(pmcActivityDefinitions.id, input.pmcActivityDefinitionId), eq(pmcActivityDefinitions.tenantId, input.tenantId), eq(pmcActivityDefinitions.projectId, input.projectId))).limit(1);
  if (!definition) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_PMC_ACTIVITY_NOT_FOUND" });
  // An activity belongs to a unit model: a villa of model A cannot take the material of model B's activity.
  if (definition.modelCode !== unit.modelCode) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_PMC_ACTIVITY_MODEL_MISMATCH" });
  if (!definition.wbsItemId) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_PMC_ACTIVITY_NOT_LINKED_TO_WBS" });
  return createMaterialIssueForTenant({
    userId: input.userId, tenantId: input.tenantId, projectId: input.projectId, warehouseId: input.warehouseId, materialId: input.materialId, wbsItemId: definition.wbsItemId,
    pmcUnitId: input.pmcUnitId, pmcActivityDefinitionId: input.pmcActivityDefinitionId, issuedQuantity: input.issuedQuantity, issuedAt: input.issuedAt, referenceNumber: input.referenceNumber, note: input.note,
  });
}

