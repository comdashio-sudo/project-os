// Q-70 (3): the activity summary of a project (server/domain/progressSummary.ts) — per activity, per block, per phase — read with project.pmc.read, every
// table filtered by the company and the project. A block or a phase narrows the villas first, so the activity table then speaks of that block or phase only.
import { pmcActivityDefinitions, pmcBlocks, pmcStatusFactors, pmcUnitActivityHistory, pmcUnitActivityProgress, pmcUnits } from "../drizzle/schema";
import { effectiveStatusFactors, type PmcUnitActivityStatus } from "./domain/pmc";
import { periodChange, statusesAsOf } from "./domain/progressPeriod";
import { summarizeProgress } from "./domain/progressSummary";
import { and, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { unitWeightOf } from "./domain/plannedCurve";
import { authorize, mine, type Scope } from "./pmcService";
import { readPmcScopeEngineers } from "./pmcScopeEngineers";
import { villaKey } from "./wo22Shared";

export async function getPmcActivitySummary(input: Scope & { blockCode?: string; phase?: string; from?: string; to?: string }) {
  // Q-72 (2): a period (days on site, UTC+3) asks for the change between its start and its end, computed from the history; without one the summary is as it was
  if (input.to && !input.from) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_PERIOD_FROM_REQUIRED" });
  if (input.from && input.to && input.to < input.from) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_PERIOD_INVERTED" });
  const db = await authorize(input, "project.pmc.read");
  const scope = { tenantId: input.tenantId, projectId: input.projectId };
  const [units, blocks, definitions, cells, factorRows] = await Promise.all([
    db.select({ id: pmcUnits.id, unitNumber: pmcUnits.unitNumber, villaLabel: pmcUnits.villaLabel, blockId: pmcUnits.blockId, phase: pmcUnits.phase, modelCode: pmcUnits.modelCode, unitWeight: pmcUnits.unitWeight }).from(pmcUnits).where(mine(pmcUnits, scope)),
    db.select({ id: pmcBlocks.id, code: pmcBlocks.code }).from(pmcBlocks).where(mine(pmcBlocks, scope)),
    db.select({ id: pmcActivityDefinitions.id, modelCode: pmcActivityDefinitions.modelCode, code: pmcActivityDefinitions.code, name: pmcActivityDefinitions.name, weightPercent: pmcActivityDefinitions.weightPercent }).from(pmcActivityDefinitions).where(mine(pmcActivityDefinitions, scope)),
    db.select({ id: pmcUnitActivityProgress.id, unitId: pmcUnitActivityProgress.unitId, activityDefinitionId: pmcUnitActivityProgress.activityDefinitionId, status: pmcUnitActivityProgress.status }).from(pmcUnitActivityProgress).where(mine(pmcUnitActivityProgress, scope)),
    db.select({ status: pmcStatusFactors.status, factor: pmcStatusFactors.factor }).from(pmcStatusFactors).where(mine(pmcStatusFactors, scope)),
  ]);
  const blockCode = new Map(blocks.map(block => [block.id, block.code]));
  const all = units.map(unit => ({ id: unit.id, villa: villaKey(unit.villaLabel ?? unit.unitNumber), blockCode: blockCode.get(unit.blockId) ?? "", phase: unit.phase, modelCode: unit.modelCode, unitWeight: unitWeightOf(unit.unitWeight) }));
  const chosen = all.filter(unit => (!input.blockCode || unit.blockCode === input.blockCode) && (!input.phase || (unit.phase ?? "").toUpperCase() === input.phase.trim().toUpperCase()));
  const definitionsIn = definitions.map(definition => ({ ...definition, weightPercent: Number(definition.weightPercent) }));
  const factors = effectiveStatusFactors(factorRows);
  const summaryOf = (statusOf: Map<string, PmcUnitActivityStatus>) => summarizeProgress({ units: chosen, definitions: definitionsIn, statusOf, factors });
  const currentStatus = new Map(cells.map(cell => [`${cell.unitId}:${cell.activityDefinitionId}`, cell.status as PmcUnitActivityStatus]));
  const summary = summaryOf(currentStatus);
  let period: ReturnType<typeof periodChange> & { from: string; to: string } | null = null;
  if (input.from) {
    const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
    const to = input.to ?? today;
    const history = await db.select({ cellId: pmcUnitActivityHistory.unitActivityProgressId, status: pmcUnitActivityHistory.toStatus, at: pmcUnitActivityHistory.changedAt }).from(pmcUnitActivityHistory)
      .where(and(mine(pmcUnitActivityHistory, scope), lte(pmcUnitActivityHistory.changedAt, new Date(`${to}T23:59:59.999+03:00`))));
    const cellKey = new Map(cells.map(cell => [cell.id, `${cell.unitId}:${cell.activityDefinitionId}`]));
    const asOf = (moment: Date) => new Map(Array.from(statusesAsOf(history.map(row => ({ cellId: row.cellId, status: row.status as PmcUnitActivityStatus, at: row.at })), moment).entries()).flatMap(([cell, status]) => (cellKey.has(cell) ? [[cellKey.get(cell)!, status] as const] : [])));
    const start = summaryOf(asOf(new Date(new Date(`${input.from}T00:00:00+03:00`).getTime() - 1)));
    const end = to >= today ? summary : summaryOf(asOf(new Date(`${to}T23:59:59.999+03:00`)));
    period = { ...periodChange(start, end), from: input.from, to };
  }
  const sorted = (values: Array<string | null>) => Array.from(new Set(values.filter((value): value is string => Boolean(value)))).sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  // Q-72 (4): the engineer in charge of each block and phase, beside its row
  const engineers = await readPmcScopeEngineers(db, scope);
  const withEngineer = <T extends { key: string }>(rows: T[], by: Map<string, { userId: number; name: string }>, upper: boolean) => rows.map(row => ({ ...row, engineer: by.get(upper ? row.key.toUpperCase() : row.key) ?? null }));
  return { ...summary, blocks: withEngineer(summary.blocks, engineers.blocks, false), phases: withEngineer(summary.phases, engineers.phases, true), period, filters: { blocks: sorted(all.map(unit => unit.blockCode)), phases: sorted(all.map(unit => unit.phase)) } };
}
