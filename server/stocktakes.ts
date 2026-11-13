// G-104 (D-32 part 2): the stocktake document. Opening one copies, for one warehouse, the system quantity of every material on its shelf; the counter
// records what is really there; approving it posts one adjustment per material that differs — valued the way an adjustment is valued today (an issue at
// the weighted average when the shelf has less, the average when it has more) — in ONE transaction with the approval and its audit row.
// Every call: the company and project isolation, the named permission project.inventory.manage on that project, and the entitled product (assertTenantAccess).
// Approval is segregated: the person who opened the count may not approve it.
import { TRPCError } from "@trpc/server";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { auditLogs, materialMasters, projectWarehouses, stocktakeLines, stocktakes, warehouseInventoryTransactions } from "../drizzle/schema";
import { assertTenantAccess } from "./domain/authorization";
import { adjustmentAtAverage, valuedIssue } from "./domain/inventoryValuation";
import { assertInventoryReason, assertProjectWithinTenant, getDb, getTenantAccessSnapshot, stockPositionOf } from "./db";

type Scope = { userId: number; tenantId: string; projectId: string };
const PERMISSION = "project.inventory.manage";

async function authorized(input: Scope) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const snapshot = await getTenantAccessSnapshot({ userId: input.userId, tenantId: input.tenantId });
  if (!snapshot) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_TENANT_ACCESS_DENIED" });
  assertTenantAccess(snapshot, { tenantId: input.tenantId, product: "PROJECT", permission: PERMISSION, scope: { type: "project", id: input.projectId } });
  await assertProjectWithinTenant({ tenantId: input.tenantId, projectId: input.projectId });
  return db;
}

/** Opens a count of one warehouse: one line per material that has ever moved on its shelf, with the quantity the books say is there now. */
export async function openStocktake(input: Scope & { warehouseId: string; stocktakeNumber: string; note?: string }) {
  const db = await authorized(input);
  const [warehouse] = await db.select({ id: projectWarehouses.id, active: projectWarehouses.active }).from(projectWarehouses).where(and(eq(projectWarehouses.id, input.warehouseId), eq(projectWarehouses.tenantId, input.tenantId), eq(projectWarehouses.projectId, input.projectId))).limit(1);
  if (!warehouse) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_WAREHOUSE_NOT_FOUND" });
  if (!warehouse.active) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_WAREHOUSE_INACTIVE" });
  const [duplicate] = await db.select({ id: stocktakes.id }).from(stocktakes).where(and(eq(stocktakes.tenantId, input.tenantId), eq(stocktakes.projectId, input.projectId), eq(stocktakes.stocktakeNumber, input.stocktakeNumber))).limit(1);
  if (duplicate) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_STOCKTAKE_NUMBER_EXISTS" });
  const [open] = await db.select({ id: stocktakes.id }).from(stocktakes).where(and(eq(stocktakes.tenantId, input.tenantId), eq(stocktakes.projectId, input.projectId), eq(stocktakes.warehouseId, input.warehouseId), eq(stocktakes.status, "counting"))).limit(1);
  if (open) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_STOCKTAKE_ALREADY_OPEN" });
  const id = crypto.randomUUID();
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM project_warehouses WHERE id = ${input.warehouseId} FOR UPDATE`);
    const shelf = await tx.select({ materialId: warehouseInventoryTransactions.materialId, quantity: sql<string>`SUM(${warehouseInventoryTransactions.quantityDelta})` })
      .from(warehouseInventoryTransactions)
      .where(and(eq(warehouseInventoryTransactions.tenantId, input.tenantId), eq(warehouseInventoryTransactions.projectId, input.projectId), eq(warehouseInventoryTransactions.warehouseId, input.warehouseId)))
      .groupBy(warehouseInventoryTransactions.materialId);
    if (!shelf.length) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_STOCKTAKE_EMPTY_WAREHOUSE" });
    await tx.insert(stocktakes).values({ id, tenantId: input.tenantId, projectId: input.projectId, warehouseId: input.warehouseId, stocktakeNumber: input.stocktakeNumber, note: input.note?.trim() || null, createdByUserId: input.userId });
    await tx.insert(stocktakeLines).values(shelf.map(row => ({ id: crypto.randomUUID(), tenantId: input.tenantId, projectId: input.projectId, stocktakeId: id, materialId: row.materialId, systemQuantity: Number(row.quantity).toFixed(3) })));
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "stocktake_opened", entityType: "stocktake", entityId: id, metadata: JSON.stringify({ projectId: input.projectId, warehouseId: input.warehouseId, stocktakeNumber: input.stocktakeNumber, lines: shelf.length }) });
  });
  return { id, lines: (await readStocktake(db, { ...input, stocktakeId: id })).lines.length };
}

async function readStocktake(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, input: Scope & { stocktakeId: string }) {
  const [header] = await db.select().from(stocktakes).where(and(eq(stocktakes.id, input.stocktakeId), eq(stocktakes.tenantId, input.tenantId), eq(stocktakes.projectId, input.projectId))).limit(1);
  if (!header) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_STOCKTAKE_NOT_FOUND" });
  const lines = await db.select({ id: stocktakeLines.id, materialId: stocktakeLines.materialId, code: materialMasters.code, description: materialMasters.description, unitOfMeasure: materialMasters.unitOfMeasure, systemQuantity: stocktakeLines.systemQuantity, countedQuantity: stocktakeLines.countedQuantity, adjustmentTransactionId: stocktakeLines.adjustmentTransactionId })
    .from(stocktakeLines).innerJoin(materialMasters, and(eq(materialMasters.id, stocktakeLines.materialId), eq(materialMasters.tenantId, stocktakeLines.tenantId)))
    .where(and(eq(stocktakeLines.stocktakeId, header.id), eq(stocktakeLines.tenantId, input.tenantId), eq(stocktakeLines.projectId, input.projectId))).orderBy(asc(materialMasters.code));
  return {
    ...header,
    lines: lines.map(line => {
      const system = Number(line.systemQuantity); const counted = line.countedQuantity === null ? null : Number(line.countedQuantity);
      return { ...line, systemQuantity: system, countedQuantity: counted, variance: counted === null ? null : Math.round((counted - system) * 1000) / 1000 };
    }),
  };
}

export async function getStocktake(input: Scope & { stocktakeId: string }) {
  return readStocktake(await authorized(input), input);
}

export async function listStocktakes(input: Scope) {
  const db = await authorized(input);
  return db.select({ id: stocktakes.id, stocktakeNumber: stocktakes.stocktakeNumber, warehouseId: stocktakes.warehouseId, status: stocktakes.status, createdAt: stocktakes.createdAt, approvedAt: stocktakes.approvedAt })
    .from(stocktakes).where(and(eq(stocktakes.tenantId, input.tenantId), eq(stocktakes.projectId, input.projectId))).orderBy(desc(stocktakes.createdAt));
}

/** The counted quantity of lines of a count still open. A count may be corrected until it is approved. */
export async function recordStocktakeCounts(input: Scope & { stocktakeId: string; counts: Array<{ lineId: string; countedQuantity: number }> }) {
  const db = await authorized(input);
  if (input.counts.some(count => !Number.isFinite(count.countedQuantity) || count.countedQuantity < 0)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_STOCKTAKE_COUNT_INVALID" });
  const stocktake = await readStocktake(db, input);
  if (stocktake.status !== "counting") throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_STOCKTAKE_NOT_OPEN" });
  const lineIds = new Set(stocktake.lines.map(line => line.id));
  if (input.counts.some(count => !lineIds.has(count.lineId))) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_STOCKTAKE_LINE_NOT_FOUND" });
  await db.transaction(async tx => {
    for (const count of input.counts) {
      const written = await tx.update(stocktakeLines).set({ countedQuantity: count.countedQuantity.toFixed(3) }).where(and(eq(stocktakeLines.id, count.lineId), eq(stocktakeLines.tenantId, input.tenantId), eq(stocktakeLines.projectId, input.projectId), eq(stocktakeLines.stocktakeId, stocktake.id))).returning({ id: stocktakeLines.id });
      if (!written.length) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_STOCKTAKE_LINE_NOT_FOUND" }); // zero rows is a refusal, never success (rows = 0 rule)
    }
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "stocktake_counted", entityType: "stocktake", entityId: stocktake.id, metadata: JSON.stringify({ projectId: input.projectId, lines: input.counts.length }) });
  });
  return readStocktake(db, input);
}

/**
 * Approves a count: every line must be counted; the approver is not the person who opened it; a reason is given. One adjustment per line that differs,
 * against the shelf as it is now (the warehouse is locked), referenced by the stocktake's number — then the stocktake is approved and audited, all or nothing.
 */
export async function approveStocktake(input: Scope & { stocktakeId: string; reason: string }) {
  const db = await authorized(input);
  assertInventoryReason(input.reason);
  const stocktake = await readStocktake(db, input);
  if (stocktake.status !== "counting") throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_STOCKTAKE_NOT_OPEN" });
  if (stocktake.createdByUserId === input.userId) throw new TRPCError({ code: "FORBIDDEN", message: "PROJECT_OS_STOCKTAKE_SAME_APPROVER" });
  if (stocktake.lines.some(line => line.countedQuantity === null)) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_STOCKTAKE_NOT_FULLY_COUNTED" });
  const now = new Date(); let posted = 0;
  await db.transaction(async tx => {
    await tx.execute(sql`SELECT id FROM project_warehouses WHERE id = ${stocktake.warehouseId} FOR UPDATE`);
    for (const line of stocktake.lines) {
      if (!line.variance) continue;
      const position = await stockPositionOf(tx, { tenantId: input.tenantId, projectId: input.projectId, warehouseId: stocktake.warehouseId, materialId: line.materialId });
      const pricing = line.variance > 0 ? adjustmentAtAverage(position, line.variance) : valuedIssue(position, -line.variance);
      const transactionId = crypto.randomUUID();
      await tx.insert(warehouseInventoryTransactions).values({ id: transactionId, tenantId: input.tenantId, projectId: input.projectId, warehouseId: stocktake.warehouseId, materialId: line.materialId, transactionType: "adjustment", quantityDelta: line.variance.toFixed(3), unitCost: pricing.unitCost === null ? null : pricing.unitCost.toFixed(4), valueDelta: pricing.valueDelta === null ? null : pricing.valueDelta.toFixed(2), referenceNumber: stocktake.stocktakeNumber, note: input.reason.trim().slice(0, 500), occurredAt: now, createdByUserId: input.userId });
      const linked = await tx.update(stocktakeLines).set({ adjustmentTransactionId: transactionId }).where(and(eq(stocktakeLines.id, line.id), eq(stocktakeLines.tenantId, input.tenantId), eq(stocktakeLines.projectId, input.projectId))).returning({ id: stocktakeLines.id });
      if (!linked.length) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_STOCKTAKE_LINE_NOT_FOUND" });
      posted += 1;
    }
    const approved = await tx.update(stocktakes).set({ status: "approved", approvalReason: input.reason.trim().slice(0, 500), approvedByUserId: input.userId, approvedAt: now }).where(and(eq(stocktakes.id, stocktake.id), eq(stocktakes.tenantId, input.tenantId), eq(stocktakes.projectId, input.projectId), eq(stocktakes.status, "counting"))).returning({ id: stocktakes.id });
    if (!approved.length) throw new TRPCError({ code: "CONFLICT", message: "PROJECT_OS_STOCKTAKE_NOT_OPEN" });
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "stocktake_approved", entityType: "stocktake", entityId: stocktake.id, metadata: JSON.stringify({ projectId: input.projectId, warehouseId: stocktake.warehouseId, stocktakeNumber: stocktake.stocktakeNumber, adjustments: posted }) });
  });
  return { id: stocktake.id, adjustments: posted };
}
