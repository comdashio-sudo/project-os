// Q-70 (3): «ملخص البنود» — for each activity: how many villas it applies to, how many are complete, in progress and not started, the completion share and
// the earned share (the status factors of the project, weighted by villa weight); and for each block and each phase: the villas, their weighted progress
// and the completed cells. Computed with the same rules as the project's PMC progress (calculateUnitProgress / calculateProjectProgress), so the numbers
// agree with the PMC page. Pure: the caller reads the rows.
import { calculateProjectProgress, calculateUnitProgress, type PmcUnitActivityStatus } from "./pmc";

export type SummaryUnit = { id: string; villa: string; blockCode: string; phase: string | null; modelCode: string; unitWeight: number };
export type SummaryDefinition = { id: string; modelCode: string; code: string; name: string; weightPercent: number };
export type ActivitySummary = { code: string; name: string; villas: number; complete: number; underReview: number; inProgress: number; notStarted: number; completionPercent: number; earnedPercent: number };
export type GroupSummary = { key: string; villas: number; progressPercent: number | null; villasWithoutNumber: number; completeCells: number; totalCells: number };

/** Weighted progress of villas that have a number; null — never a throw — when their total weight is 0 (a villa may weigh 0: review of #576, C). */
function weighted(units: SummaryUnit[], progressOf: ReadonlyMap<string, number | null>): number | null {
  const counted = units.filter(unit => progressOf.get(unit.id) != null);
  if (!counted.length || counted.reduce((sum, unit) => sum + unit.unitWeight, 0) <= 0) return null;
  return round(calculateProjectProgress(counted.map(unit => ({ progressPercent: progressOf.get(unit.id)!, unitWeight: unit.unitWeight }))));
}

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function summarizeProgress(input: { units: SummaryUnit[]; definitions: SummaryDefinition[]; statusOf: ReadonlyMap<string, PmcUnitActivityStatus>; factors: Record<PmcUnitActivityStatus, number> }) {
  const byModel = new Map<string, SummaryDefinition[]>();
  for (const definition of input.definitions) byModel.set(definition.modelCode, [...(byModel.get(definition.modelCode) ?? []), definition]);
  const statusFor = (unit: SummaryUnit, definition: SummaryDefinition) => input.statusOf.get(`${unit.id}:${definition.id}`) ?? "NOT_STARTED";

  // activities by code: one activity may be defined once per model, the villas of every model that has it are counted together
  type Tally = { code: string; name: string; villas: number; complete: number; underReview: number; inProgress: number; notStarted: number; weight: number; earned: number };
  const tallies = new Map<string, Tally>();
  // each villa's progress, by the PMC rule (a model whose weights do not total 100 gives no number, with no guess)
  const progressOf = new Map<string, number | null>();
  for (const unit of input.units) {
    const definitions = byModel.get(unit.modelCode) ?? [];
    for (const definition of definitions) {
      const status = statusFor(unit, definition);
      const tally = tallies.get(definition.code) ?? { code: definition.code, name: definition.name, villas: 0, complete: 0, underReview: 0, inProgress: 0, notStarted: 0, weight: 0, earned: 0 };
      tally.villas += 1;
      // «under review» is its own count (review of #576, C: it was folded into «in progress» without saying so)
      if (status === "COMPLETE") tally.complete += 1; else if (status === "UNDER_REVIEW") tally.underReview += 1; else if (status === "NOT_STARTED") tally.notStarted += 1; else tally.inProgress += 1;
      tally.weight += unit.unitWeight; tally.earned += unit.unitWeight * (input.factors[status] ?? 0);
      tallies.set(definition.code, tally);
    }
    try { progressOf.set(unit.id, calculateUnitProgress({ statusFactors: input.factors, activities: definitions.map(definition => ({ weightPercent: definition.weightPercent, status: statusFor(unit, definition) })) })); }
    catch { progressOf.set(unit.id, null); }
  }
  const activities: ActivitySummary[] = Array.from(tallies.values())
    .sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }))
    .map(tally => ({ code: tally.code, name: tally.name, villas: tally.villas, complete: tally.complete, underReview: tally.underReview, inProgress: tally.inProgress, notStarted: tally.notStarted, completionPercent: tally.villas ? round((tally.complete / tally.villas) * 100) : 0, earnedPercent: tally.weight ? round((tally.earned / tally.weight) * 100) : 0 }));

  const groupBy = (keyOf: (unit: SummaryUnit) => string | null): GroupSummary[] => {
    const groups = new Map<string, SummaryUnit[]>();
    for (const unit of input.units) { const key = keyOf(unit); if (key) groups.set(key, [...(groups.get(key) ?? []), unit]); }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true })).map(([key, units]) => {
      const counted = units.filter(unit => progressOf.get(unit.id) != null);
      let completeCells = 0; let totalCells = 0;
      for (const unit of units) for (const definition of byModel.get(unit.modelCode) ?? []) { totalCells += 1; if (statusFor(unit, definition) === "COMPLETE") completeCells += 1; }
      return { key, villas: units.length, progressPercent: weighted(units, progressOf), villasWithoutNumber: units.length - counted.length, completeCells, totalCells };
    });
  };
  const counted = input.units.filter(unit => progressOf.get(unit.id) != null);
  const project = weighted(input.units, progressOf);
  const blocks = groupBy(unit => unit.blockCode || null); const phases = groupBy(unit => unit.phase);
  // Q-72 (3): the villas and the cells of the blocks (and of the phases) add up to the project's — or the difference is named (a villa with no block, or no phase, is in the project and in no group)
  const totalCells = Array.from(tallies.values()).reduce((sum, tally) => sum + tally.villas, 0);
  const reconcile = (groups: GroupSummary[]) => { const villas = groups.reduce((sum, group) => sum + group.villas, 0); const cells = groups.reduce((sum, group) => sum + group.totalCells, 0);
    return { villas, villasMissing: input.units.length - villas, cells, cellsMissing: totalCells - cells, matches: villas === input.units.length && cells === totalCells }; };
  return { activities, blocks, phases, reconciliation: { blocks: reconcile(blocks), phases: reconcile(phases) }, project: { villas: input.units.length, progressPercent: project, villasWithoutNumber: input.units.length - counted.length } };
}
