// Q-70 (3): the activity summary of a project (server/domain/progressSummary.ts) — per activity, per block, per phase — read with project.pmc.read, every
// table filtered by the company and the project. A block or a phase narrows the villas first, so the activity table then speaks of that block or phase only.
import { pmcActivityDefinitions, pmcBlocks, pmcStatusFactors, pmcUnitActivityProgress, pmcUnits } from "../drizzle/schema";
import { effectiveStatusFactors, type PmcUnitActivityStatus } from "./domain/pmc";
import { summarizeProgress } from "./domain/progressSummary";
import { unitWeightOf } from "./domain/plannedCurve";
import { authorize, mine, type Scope } from "./pmcService";
import { villaKey } from "./wo22Shared";

export async function getPmcActivitySummary(input: Scope & { blockCode?: string; phase?: string }) {
  const db = await authorize(input, "project.pmc.read");
  const scope = { tenantId: input.tenantId, projectId: input.projectId };
  const [units, blocks, definitions, cells, factorRows] = await Promise.all([
    db.select({ id: pmcUnits.id, unitNumber: pmcUnits.unitNumber, villaLabel: pmcUnits.villaLabel, blockId: pmcUnits.blockId, phase: pmcUnits.phase, modelCode: pmcUnits.modelCode, unitWeight: pmcUnits.unitWeight }).from(pmcUnits).where(mine(pmcUnits, scope)),
    db.select({ id: pmcBlocks.id, code: pmcBlocks.code }).from(pmcBlocks).where(mine(pmcBlocks, scope)),
    db.select({ id: pmcActivityDefinitions.id, modelCode: pmcActivityDefinitions.modelCode, code: pmcActivityDefinitions.code, name: pmcActivityDefinitions.name, weightPercent: pmcActivityDefinitions.weightPercent }).from(pmcActivityDefinitions).where(mine(pmcActivityDefinitions, scope)),
    db.select({ unitId: pmcUnitActivityProgress.unitId, activityDefinitionId: pmcUnitActivityProgress.activityDefinitionId, status: pmcUnitActivityProgress.status }).from(pmcUnitActivityProgress).where(mine(pmcUnitActivityProgress, scope)),
    db.select({ status: pmcStatusFactors.status, factor: pmcStatusFactors.factor }).from(pmcStatusFactors).where(mine(pmcStatusFactors, scope)),
  ]);
  const blockCode = new Map(blocks.map(block => [block.id, block.code]));
  const all = units.map(unit => ({ id: unit.id, villa: villaKey(unit.villaLabel ?? unit.unitNumber), blockCode: blockCode.get(unit.blockId) ?? "", phase: unit.phase, modelCode: unit.modelCode, unitWeight: unitWeightOf(unit.unitWeight) }));
  const chosen = all.filter(unit => (!input.blockCode || unit.blockCode === input.blockCode) && (!input.phase || (unit.phase ?? "").toUpperCase() === input.phase.trim().toUpperCase()));
  const summary = summarizeProgress({
    units: chosen, definitions: definitions.map(definition => ({ ...definition, weightPercent: Number(definition.weightPercent) })),
    statusOf: new Map(cells.map(cell => [`${cell.unitId}:${cell.activityDefinitionId}`, cell.status as PmcUnitActivityStatus])), factors: effectiveStatusFactors(factorRows),
  });
  const sorted = (values: Array<string | null>) => Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  return { ...summary, filters: { blocks: sorted(all.map(unit => unit.blockCode)), phases: sorted(all.map(unit => unit.phase)) } };
}
