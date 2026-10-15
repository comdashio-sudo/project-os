import type { PmcUnitActivityStatus } from "./pmc";

// Rule 7: the progress of a WBS item comes from PMC. A WBS item is linked to one or more
// activity definitions; its progress is the weighted completion of every (unit x linked
// activity) cell, so a linked activity that a unit does not have is not in the denominator.

export type BridgeUnit = { id: string; modelCode: string; weight: number };
export type BridgeDefinition = { id: string; modelCode: string; weightPercent: number; wbsItemId: string };
export type BridgeCell = { unitId: string; definitionId: string; status: PmcUnitActivityStatus };

const r2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/** Percent complete (2 decimals, as stored in progress_entries) per WBS item; null when the item has no weight to measure. */
export function wbsProgressFromPmc(input: { units: BridgeUnit[]; definitions: BridgeDefinition[]; cells: BridgeCell[]; factors: Record<PmcUnitActivityStatus, number> }) {
  const statusOf = new Map(input.cells.map(cell => [`${cell.unitId}:${cell.definitionId}`, cell.status]));
  const totals = new Map<string, { earned: number; weight: number }>();
  for (const definition of input.definitions) {
    const total = totals.get(definition.wbsItemId) ?? { earned: 0, weight: 0 };
    for (const unit of input.units) {
      if (unit.modelCode !== definition.modelCode) continue;
      const weight = unit.weight * definition.weightPercent;
      total.weight += weight;
      total.earned += weight * input.factors[statusOf.get(`${unit.id}:${definition.id}`) ?? "NOT_STARTED"];
    }
    totals.set(definition.wbsItemId, total);
  }
  return new Map(Array.from(totals, ([wbsItemId, total]) => [wbsItemId, total.weight > 0 ? r2((total.earned / total.weight) * 100) : null] as const));
}

export type BridgeChange = { wbsItemId: string; code: string; plannedValue: number; before: number | null; after: number };

/**
 * Which WBS items need a new progress entry, and what earned value (sum of planned value x
 * latest submitted progress) is before and after. An item with no entry yet and 0% is not
 * written: there is nothing to report and EV is unchanged.
 */
export function planEvmBridge(input: { wbs: Array<{ id: string; code: string; plannedValue: number }>; latest: Map<string, number>; computed: Map<string, number | null> }) {
  const changed: BridgeChange[] = [];
  for (const item of input.wbs) {
    const after = input.computed.get(item.id);
    if (after === null || after === undefined) continue;
    const before = input.latest.get(item.id) ?? null;
    if (before === null ? after === 0 : Math.abs(after - before) < 0.005) continue;
    changed.push({ wbsItemId: item.id, code: item.code, plannedValue: item.plannedValue, before, after });
  }
  const evBefore = input.wbs.reduce((sum, item) => sum + (item.plannedValue * (input.latest.get(item.id) ?? 0)) / 100, 0);
  const evAfter = evBefore + changed.reduce((sum, change) => sum + (change.plannedValue * (change.after - (change.before ?? 0))) / 100, 0);
  return { changed, evBefore: r2(evBefore), evAfter: r2(evAfter) };
}
