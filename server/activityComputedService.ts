// Q-71 (1) batch 2: each P6 schedule activity's progress computed from the villas' PMC cells (server/domain/activityComputedProgress.ts) — its villa from the
// WBS, its stage from its Q code, the weight groups linked to that stage (Q-61 (3)). Read with project.pmc.read (pmcGate); every query by company and
// project. A project with no stage linked yet answers `linked: false` and computes nothing (the schedule shows no computed column then).
import { and, inArray } from "drizzle-orm";
import { pmcActivityDefinitions, pmcStatusFactors, pmcUnitActivityProgress } from "../drizzle/schema";
import { computeActivityProgress } from "./domain/activityComputedProgress";
import { effectiveStatusFactors, type PmcUnitActivityStatus } from "./domain/pmc";
import { stageOfActivity } from "./domain/scheduleStageMapping";
import { villaOfEachActivity } from "./domain/scheduleVillas";
import { savedLinks, weightGroups } from "./scheduleStageMapping";
import { loadScheduleAndVillas } from "./scheduleVillaLinks";
import { mine } from "./pmcService";
import { pmcGate, type Scope } from "./wo22Shared";

export async function getActivityComputedProgress(input: Scope) {
  const db = await pmcGate(input, "project.pmc.read");
  const scope = { tenantId: input.tenantId, projectId: input.projectId };
  const [schedule, links, groups, definitions, factorRows] = await Promise.all([
    loadScheduleAndVillas(db, scope), savedLinks(db, input), weightGroups(db, input),
    db.select({ id: pmcActivityDefinitions.id, groupId: pmcActivityDefinitions.groupId, modelCode: pmcActivityDefinitions.modelCode, weightPercent: pmcActivityDefinitions.weightPercent }).from(pmcActivityDefinitions).where(mine(pmcActivityDefinitions, scope)),
    db.select({ status: pmcStatusFactors.status, factor: pmcStatusFactors.factor }).from(pmcStatusFactors).where(mine(pmcStatusFactors, scope)),
  ]);
  if (!links.length) return { linked: false as const, activities: [] };
  // review of #584 (B, note 1): only the cells of definitions in a linked group are read — not every cell of the project (1,230 × 216 on the owner's)
  const linkedGroups = new Set(links.map(link => link.groupId));
  const neededIds = definitions.filter(definition => definition.groupId && linkedGroups.has(definition.groupId)).map(definition => definition.id);
  const cells: Array<{ unitId: string; activityDefinitionId: string; status: string }> = [];
  for (let index = 0; index < neededIds.length; index += 500) {
    cells.push(...await db.select({ unitId: pmcUnitActivityProgress.unitId, activityDefinitionId: pmcUnitActivityProgress.activityDefinitionId, status: pmcUnitActivityProgress.status }).from(pmcUnitActivityProgress)
      .where(and(mine(pmcUnitActivityProgress, scope), inArray(pmcUnitActivityProgress.activityDefinitionId, neededIds.slice(index, index + 500)))));
  }
  const villaOf = villaOfEachActivity(schedule.wbs, schedule.activities);
  const codeOf = new Map(groups.map(group => [group.id, group.code]));
  const rows = computeActivityProgress({
    activities: schedule.activities.map(activity => ({ id: activity.id, villa: villaOf.get(activity.id) ?? null, stage: stageOfActivity(activity) })),
    links: links.map(link => ({ groupId: link.groupId, stageCodes: link.stageCodes })),
    definitions: definitions.filter(definition => definition.groupId).map(definition => ({ id: definition.id, groupId: definition.groupId!, modelCode: definition.modelCode, weightPercent: Number(definition.weightPercent) })),
    units: schedule.villas.map(villa => ({ id: villa.id, unitNumber: villa.unitNumber, modelCode: villa.modelCode })),
    statusOf: new Map(cells.map(cell => [`${cell.unitId}:${cell.activityDefinitionId}`, cell.status as PmcUnitActivityStatus])),
    factors: effectiveStatusFactors(factorRows),
  });
  return { linked: true as const, activities: rows.map(row => ({ ...row, groupCodes: row.groupIds.map(id => codeOf.get(id) ?? id).sort((a, b) => a.localeCompare(b, "en", { numeric: true })) })) };
}
