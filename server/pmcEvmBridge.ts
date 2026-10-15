// PMC -> EVM bridge (work order rule 7). Whenever PMC progress can change (a status, a
// import of statuses/catalog/locations, the status factors), the progress of every WBS item
// linked to an activity is recomputed from the cells and, where it moved, written as a new
// "submitted" progress entry - the only thing operational EVM reads as earned value. It runs
// inside the caller's transaction, so cells, history and the EVM input change together.
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { auditLogs, pmcActivityDefinitions, pmcStatusFactors, pmcUnitActivityProgress, pmcUnits, progressEntries, wbsItems } from "../drizzle/schema";
import { effectiveStatusFactors, type PmcUnitActivityStatus } from "./domain/pmc";
import { planEvmBridge, wbsProgressFromPmc } from "./domain/pmcEvmBridge";
import type { getDb } from "./db";

type Db = NonNullable<Awaited<ReturnType<typeof getDb>>>;
type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];
type Scope = { userId: number; tenantId: string; projectId: string };
const mine = <T extends { tenantId: unknown; projectId: unknown }>(table: T, scope: Scope) => and(eq(table.tenantId as never, scope.tenantId), eq(table.projectId as never, scope.projectId));

export type PmcEvmEffect = { linkedItems: number; changed: Array<{ wbsItemId: string; code: string; before: number | null; after: number }>; evBefore: number; evAfter: number };

export async function syncPmcProgressToEvm(tx: Tx, scope: Scope, now: Date): Promise<PmcEvmEffect> {
  const definitions = await tx.select({ id: pmcActivityDefinitions.id, modelCode: pmcActivityDefinitions.modelCode, weightPercent: pmcActivityDefinitions.weightPercent, wbsItemId: pmcActivityDefinitions.wbsItemId }).from(pmcActivityDefinitions).where(and(mine(pmcActivityDefinitions, scope), isNotNull(pmcActivityDefinitions.wbsItemId)));
  if (!definitions.length) return { linkedItems: 0, changed: [], evBefore: 0, evAfter: 0 };
  const [units, cells, factorRows, wbs, entries] = await Promise.all([
    tx.select({ id: pmcUnits.id, modelCode: pmcUnits.modelCode, weight: pmcUnits.unitWeight }).from(pmcUnits).where(mine(pmcUnits, scope)),
    tx.select({ unitId: pmcUnitActivityProgress.unitId, definitionId: pmcUnitActivityProgress.activityDefinitionId, status: pmcUnitActivityProgress.status }).from(pmcUnitActivityProgress).where(mine(pmcUnitActivityProgress, scope)),
    tx.select({ status: pmcStatusFactors.status, factor: pmcStatusFactors.factor }).from(pmcStatusFactors).where(mine(pmcStatusFactors, scope)),
    tx.select({ id: wbsItems.id, code: wbsItems.code, plannedValue: wbsItems.plannedValue }).from(wbsItems).where(mine(wbsItems, scope)),
    tx.select({ wbsItemId: progressEntries.wbsItemId, progressPercent: progressEntries.progressPercent, measuredAt: progressEntries.measuredAt }).from(progressEntries).where(and(mine(progressEntries, scope), eq(progressEntries.status, "submitted"), isNotNull(progressEntries.wbsItemId))).orderBy(desc(progressEntries.measuredAt), desc(progressEntries.createdAt)),
  ]);
  const computed = wbsProgressFromPmc({
    units: units.map(unit => ({ id: unit.id, modelCode: unit.modelCode, weight: Number(unit.weight) })),
    definitions: definitions.map(definition => ({ id: definition.id, modelCode: definition.modelCode, weightPercent: Number(definition.weightPercent), wbsItemId: definition.wbsItemId! })),
    cells: cells.map(cell => ({ unitId: cell.unitId, definitionId: cell.definitionId, status: cell.status as PmcUnitActivityStatus })),
    factors: effectiveStatusFactors(factorRows),
  });
  // Entries come newest first: the first one seen per WBS item is the latest, which is what EVM reads.
  const latest = new Map<string, number>();
  const latestAt = new Map<string, Date>();
  for (const entry of entries) if (!latest.has(entry.wbsItemId!)) { latest.set(entry.wbsItemId!, Number(entry.progressPercent)); latestAt.set(entry.wbsItemId!, entry.measuredAt); }
  const plan = planEvmBridge({ wbs: wbs.map(item => ({ id: item.id, code: item.code, plannedValue: Number(item.plannedValue) })), latest, computed });
  if (plan.changed.length) {
    await tx.insert(progressEntries).values(plan.changed.map(change => {
      // EVM keeps the first of two entries with the same timestamp, and timestamps have one-second
      // resolution: an entry is always stamped after the one it supersedes.
      const previous = latestAt.get(change.wbsItemId);
      const measuredAt = previous && previous >= now ? new Date(previous.getTime() + 1000) : now;
      return { id: crypto.randomUUID(), tenantId: scope.tenantId, projectId: scope.projectId, wbsItemId: change.wbsItemId, progressPercent: String(change.after), status: "submitted" as const, measuredAt };
    }));
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), tenantId: scope.tenantId, actorUserId: scope.userId, action: "pmc.evm_bridge_synced", entityType: "project", entityId: scope.projectId, metadata: JSON.stringify({ items: plan.changed.map(change => ({ wbs: change.code, before: change.before, after: change.after })), evBefore: plan.evBefore, evAfter: plan.evAfter }) });
  }
  return { linkedItems: computed.size, changed: plan.changed.map(({ wbsItemId, code, before, after }) => ({ wbsItemId, code, before, after })), evBefore: plan.evBefore, evAfter: plan.evAfter };
}
