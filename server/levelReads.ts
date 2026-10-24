// The reads the four level dashboards need beyond `scopes.*` (work order 16, G-190 to G-194). Each answer is scoped the way the level is:
// the caller's OWN assignment decides which projects count (scopeAccess.ts), a permission counts only on the assignment that carries it, and
// every query filters by tenant and by those projects. A refusal is FORBIDDEN, never an empty answer that looks like a zero.
import { TRPCError } from "@trpc/server";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { protectedProcedure, router } from "./_core/trpc";
import { commitments, consultantSubmittals, contracts, materialMasters, projectWarehouses, projects, purchaseOrders, warehouseInventoryTransactions } from "../drizzle/schema";
import { getDb } from "./db";
import { materialApprovalState } from "./qualityGate";
import { assertProjectInScope, resolveScopedAccess, type ScopedAccess } from "./scopeAccess";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** A level the caller cannot enter is FORBIDDEN from resolveScopedAccess; that is "not reachable", not an error. Any other failure is raised. */
async function reachable(run: () => Promise<ScopedAccess>): Promise<ScopedAccess | null> {
  try { return await run(); } catch (error) { if (error instanceof TRPCError && error.code === "FORBIDDEN") return null; throw error; }
}

export type LevelEntry = { level: "company" } | { level: "portfolio" } | { level: "project"; projectId: string } | { level: "warehouse"; projectId: string };

/**
 * Where a person enters: the highest level they hold, decided per assignment (company over portfolio over project over warehouse).
 * A warehouse keeper with no project.read enters the warehouse of the first project their inventory assignment covers (by code).
 * `null` when the person holds no level in this company.
 */
export async function getLevelEntry(input: { userId: number; tenantId: string }): Promise<LevelEntry | null> {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  if (await reachable(() => resolveScopedAccess({ userId: input.userId, tenantId: input.tenantId, product: "EXECUTIVE", permissions: ["executive.read"], requireCompanyScope: true }))) return { level: "company" };
  if (await reachable(() => resolveScopedAccess({ userId: input.userId, tenantId: input.tenantId, product: "PMO", permissions: ["pmo.read"] }))) return { level: "portfolio" };
  const project = await firstProjectOf(db, input.tenantId, await reachable(() => resolveScopedAccess({ userId: input.userId, tenantId: input.tenantId, product: "PROJECT", permissions: ["project.read", "project.manage"] })));
  if (project) return { level: "project", projectId: project };
  const keeper = await firstProjectOf(db, input.tenantId, await reachable(() => resolveScopedAccess({ userId: input.userId, tenantId: input.tenantId, product: "PROJECT", permissions: ["project.inventory.manage"] })));
  return keeper ? { level: "warehouse", projectId: keeper } : null;
}

async function firstProjectOf(db: Db, tenantId: string, access: ScopedAccess | null): Promise<string | null> {
  if (!access || access.projectIds.size === 0) return null;
  const rows = await db.select({ id: projects.id, code: projects.code }).from(projects).where(and(eq(projects.tenantId, tenantId), inArray(projects.id, Array.from(access.projectIds))));
  return rows.slice().sort((a, b) => a.code.localeCompare(b.code))[0]?.id ?? null;
}

export type SubmittalCounts = { total: number; draft: number; awaitingReply: number; replied: number; closed: number };

/** Level 3: the consultant submittals of one project (the «تسليمات» the portfolio already counts as waiting, by status). */
export async function getProjectDeliveries(input: { userId: number; tenantId: string; projectId: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const access = await resolveScopedAccess({ userId: input.userId, tenantId: input.tenantId, product: "PROJECT", permissions: ["project.read", "project.manage"] });
  assertProjectInScope(access, input.projectId);
  const rows = await db.select({ status: consultantSubmittals.status, n: sql<number>`count(*)::int` }).from(consultantSubmittals)
    .where(and(eq(consultantSubmittals.tenantId, input.tenantId), eq(consultantSubmittals.projectId, input.projectId))).groupBy(consultantSubmittals.status);
  const counts: SubmittalCounts = { total: 0, draft: 0, awaitingReply: 0, replied: 0, closed: 0 };
  for (const row of rows) {
    const n = Number(row.n);
    counts.total += n;
    if (row.status === "draft") counts.draft += n;
    else if (row.status === "sent") counts.awaitingReply += n;
    else if (row.status === "replied") counts.replied += n;
    else if (row.status === "closed") counts.closed += n;
  }
  return { level: "project" as const, projectId: input.projectId, submittals: counts };
}

export type UnapprovedMaterial = { materialId: string; code: string; description: string; state: "no_submittal" | "not_approved" };

/**
 * Level 4: the materials held in one warehouse (on hand above zero) that the project has not approved. The rule is the one the issue gate uses
 * (`materialApprovalState`): the latest material-approval submittal replied to with an approving code.
 */
export async function getWarehouseUnapprovedMaterials(input: { userId: number; tenantId: string; projectId: string; warehouseId: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const access = await resolveScopedAccess({ userId: input.userId, tenantId: input.tenantId, product: "PROJECT", permissions: ["project.inventory.manage", "project.read", "project.manage"] });
  assertProjectInScope(access, input.projectId);
  const [warehouse] = await db.select({ id: projectWarehouses.id }).from(projectWarehouses)
    .where(and(eq(projectWarehouses.id, input.warehouseId), eq(projectWarehouses.tenantId, input.tenantId), eq(projectWarehouses.projectId, input.projectId))).limit(1);
  if (!warehouse) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_WAREHOUSE_NOT_FOUND" });
  const onHand = await db.select({ materialId: warehouseInventoryTransactions.materialId, quantity: sql<string>`COALESCE(SUM(${warehouseInventoryTransactions.quantityDelta}), 0)` })
    .from(warehouseInventoryTransactions)
    .where(and(eq(warehouseInventoryTransactions.tenantId, input.tenantId), eq(warehouseInventoryTransactions.projectId, input.projectId), eq(warehouseInventoryTransactions.warehouseId, input.warehouseId)))
    .groupBy(warehouseInventoryTransactions.materialId);
  const held = onHand.filter(row => Number(row.quantity) > 0).map(row => row.materialId);
  if (held.length === 0) return { level: "warehouse" as const, warehouseId: input.warehouseId, stockedMaterials: 0, unapprovedCount: 0, unapproved: [] as UnapprovedMaterial[] };
  const masters = await db.select({ id: materialMasters.id, code: materialMasters.code, description: materialMasters.description }).from(materialMasters)
    .where(and(eq(materialMasters.tenantId, input.tenantId), inArray(materialMasters.id, held)));
  const unapproved: UnapprovedMaterial[] = [];
  for (const master of masters) {
    const state = await materialApprovalState(db, input.tenantId, input.projectId, master.id);
    if (state !== "approved") unapproved.push({ materialId: master.id, code: master.code, description: master.description, state });
  }
  unapproved.sort((a, b) => a.code.localeCompare(b.code));
  return { level: "warehouse" as const, warehouseId: input.warehouseId, stockedMaterials: held.length, unapprovedCount: unapproved.length, unapproved };
}

export type MoneyByCurrency = { count: number; byCurrency: { currency: string; amount: number }[] };

/** Level 1: the company's commitments over every project, one figure per kind and per currency (no sum across currencies). */
export async function getCompanyCommitments(input: { userId: number; tenantId: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database connection is not available");
  const access = await resolveScopedAccess({ userId: input.userId, tenantId: input.tenantId, product: "EXECUTIVE", permissions: ["executive.read"], requireCompanyScope: true });
  const ids = Array.from(access.projectIds);
  const empty: MoneyByCurrency = { count: 0, byCurrency: [] };
  if (ids.length === 0) return { level: "company" as const, projectCount: 0, contracts: empty, purchaseOrders: empty, commitments: empty };
  const byCurrency = (rows: { currency: string; n: number; amount: string }[]): MoneyByCurrency => ({
    count: rows.reduce((total, row) => total + Number(row.n), 0),
    byCurrency: rows.map(row => ({ currency: row.currency, amount: round2(Number(row.amount)) })).sort((a, b) => a.currency.localeCompare(b.currency)),
  });
  const [contractRows, orderRows, commitmentRows] = await Promise.all([
    db.select({ currency: contracts.currency, n: sql<number>`count(*)::int`, amount: sql<string>`COALESCE(SUM(${contracts.contractValue}), 0)` }).from(contracts)
      .where(and(eq(contracts.tenantId, input.tenantId), inArray(contracts.projectId, ids), eq(contracts.status, "active"))).groupBy(contracts.currency),
    db.select({ currency: purchaseOrders.currency, n: sql<number>`count(*)::int`, amount: sql<string>`COALESCE(SUM(${purchaseOrders.amount}), 0)` }).from(purchaseOrders)
      .where(and(eq(purchaseOrders.tenantId, input.tenantId), inArray(purchaseOrders.projectId, ids), inArray(purchaseOrders.status, ["approved", "issued"]))).groupBy(purchaseOrders.currency),
    db.select({ currency: commitments.currency, n: sql<number>`count(*)::int`, amount: sql<string>`COALESCE(SUM(${commitments.amount}), 0)` }).from(commitments)
      .where(and(eq(commitments.tenantId, input.tenantId), inArray(commitments.projectId, ids), eq(commitments.status, "committed"))).groupBy(commitments.currency),
  ]);
  return {
    level: "company" as const,
    projectCount: ids.length,
    contracts: byCurrency(contractRows),
    purchaseOrders: byCurrency(orderRows),
    commitments: byCurrency(commitmentRows),
  };
}

export const levelReadsRouter = router({
  entry: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => getLevelEntry({ userId: ctx.user.id, ...input })),
  projectDeliveries: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid() })).query(({ ctx, input }) => getProjectDeliveries({ userId: ctx.user.id, ...input })),
  warehouseUnapprovedMaterials: protectedProcedure.input(z.object({ tenantId: z.string().uuid(), projectId: z.string().uuid(), warehouseId: z.string().uuid() })).query(({ ctx, input }) => getWarehouseUnapprovedMaterials({ userId: ctx.user.id, ...input })),
  companyCommitments: protectedProcedure.input(z.object({ tenantId: z.string().uuid() })).query(({ ctx, input }) => getCompanyCommitments({ userId: ctx.user.id, ...input })),
});
