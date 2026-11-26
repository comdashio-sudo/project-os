// Q-61 (3): the project's link «schedule stage ← weight group», once per project (server/domain/scheduleStageMapping.ts decides). Read with project.pmc.read,
// saved with project.pmc.manage (pmcGate: the PMC feature, the subscription and the project scope), every query by tenant and project, the save and its
// audit row (before and after for each group) in one transaction. The screen also shows Q-61 (2)'s differences between the schedule and the villas.
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { and, eq, inArray } from "drizzle-orm";
import { auditLogs, pmcActivityDefinitions, pmcActivityGroups, pmcScheduleStageLinks } from "../drizzle/schema";
import { loadScheduleAndVillas } from "./scheduleVillaLinks";
import { linkScheduleToVillas, villaOfEachActivity } from "./domain/scheduleVillas";
import {
  stageMappingReadiness, stageOfActivity, suggestStageLinks, validateStageLinks,
  type ScheduleStage, type StageAnchor, type StageLink, type WeightGroup,
} from "./domain/scheduleStageMapping";
import { pmcGate, type Db, type Scope } from "./wo22Shared";

const mine = <T extends { tenantId: unknown; projectId: unknown }>(table: T, scope: Scope) => and(eq(table.tenantId as never, scope.tenantId), eq(table.projectId as never, scope.projectId));

/** The schedule's stages: every activity that belongs to a villa, grouped by its stage; the name from the «Q Item» value, else the activity name most of them carry (villa number taken out). */
function scheduleStages(schedule: Awaited<ReturnType<typeof loadScheduleAndVillas>>): ScheduleStage[] {
  const villaOf = villaOfEachActivity(schedule.wbs, schedule.activities);
  const byStage = new Map<string, { activities: number; villas: Set<number>; names: Map<string, number> }>();
  for (const activity of schedule.activities) {
    const villa = villaOf.get(activity.id);
    if (villa === undefined) continue;
    const code = stageOfActivity(activity);
    if (!code) continue;
    const entry = byStage.get(code) ?? byStage.set(code, { activities: 0, villas: new Set(), names: new Map() }).get(code)!;
    entry.activities += 1; entry.villas.add(villa);
    const name = activity.name.replace(/\b(?:v|villa)[\s\-_]*\d{1,6}\b/gi, "").replace(/\s+/g, " ").replace(/^[\s\-–—:]+|[\s\-–—:]+$/g, "");
    if (name) entry.names.set(name, (entry.names.get(name) ?? 0) + 1);
  }
  return Array.from(byStage.entries()).sort((a, b) => a[0].localeCompare(b[0], "en", { numeric: true })).map(([code, entry]) => ({
    code, activities: entry.activities, villas: entry.villas.size,
    name: schedule.valueNames.get(code) ?? Array.from(entry.names.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "",
  }));
}

/** The weight groups with the weight each carries: the largest share of one villa over the models (a group may weigh 0 on one model and 12% on another). */
async function weightGroups(db: Db, scope: Scope): Promise<WeightGroup[]> {
  const [groups, definitions] = await Promise.all([
    db.select({ id: pmcActivityGroups.id, code: pmcActivityGroups.code, name: pmcActivityGroups.name, nameEn: pmcActivityGroups.nameEn }).from(pmcActivityGroups).where(mine(pmcActivityGroups, scope)),
    db.select({ groupId: pmcActivityDefinitions.groupId, modelCode: pmcActivityDefinitions.modelCode, weightPercent: pmcActivityDefinitions.weightPercent }).from(pmcActivityDefinitions).where(mine(pmcActivityDefinitions, scope)),
  ]);
  const perModel = new Map<string, number>();
  for (const row of definitions) { const key = `${row.groupId}\u0000${row.modelCode}`; perModel.set(key, (perModel.get(key) ?? 0) + Number(row.weightPercent)); }
  const weight = new Map<string, number>();
  for (const [key, value] of Array.from(perModel.entries())) { const groupId = key.split("\u0000")[0]; weight.set(groupId, Math.max(weight.get(groupId) ?? 0, value)); }
  return groups.map(group => ({ ...group, weight: Math.round((weight.get(group.id) ?? 0) * 1e4) / 1e4 })).sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
}

async function savedLinks(db: Db, scope: Scope): Promise<StageLink[]> {
  const rows = await db.select({ groupId: pmcScheduleStageLinks.groupId, stageCodesJson: pmcScheduleStageLinks.stageCodesJson, anchor: pmcScheduleStageLinks.anchor, suggestedScore: pmcScheduleStageLinks.suggestedScore }).from(pmcScheduleStageLinks).where(mine(pmcScheduleStageLinks, scope));
  return rows.map(row => ({ groupId: row.groupId, stageCodes: JSON.parse(row.stageCodesJson) as string[], anchor: row.anchor as StageAnchor, suggestedScore: row.suggestedScore === null ? null : Number(row.suggestedScore) }));
}

export async function getScheduleStageMapping(input: Scope) {
  const db = await pmcGate(input, "project.pmc.read");
  const [schedule, groups, links] = await Promise.all([loadScheduleAndVillas(db, input), weightGroups(db, input), savedLinks(db, input)]);
  const stages = scheduleStages(schedule);
  const byGroup = new Map(links.map(link => [link.groupId, link]));
  const suggestions = new Map(suggestStageLinks(groups.filter(group => !byGroup.has(group.id)), stages).map(item => [item.groupId, item]));
  const villaLinks = linkScheduleToVillas(schedule);
  return {
    stages,
    groups: groups.map(group => ({ ...group, link: byGroup.get(group.id) ?? null, suggestion: suggestions.get(group.id) ?? null })),
    readiness: stageMappingReadiness(groups, links, stages),
    differences: { activities: villaLinks.activities, unlinkedActivities: villaLinks.unlinkedActivities, villasMatched: villaLinks.villasMatched, missingInProject: villaLinks.missingInProject, withoutActivities: villaLinks.withoutActivities, mismatches: villaLinks.mismatches },
  };
}

/** A person's decision for some groups: each replaces that group's link (an empty stage list removes it). Refused whole, before anything is written, when a group is not this project's, a stage is not in the schedule, or a start/end anchor names more than one stage. */
export async function saveScheduleStageMapping(input: Scope & { links: Array<{ groupId: string; stageCodes: string[]; anchor: StageAnchor; suggestedScore?: number | null }> }) {
  const db = await pmcGate(input, "project.pmc.manage");
  const links: StageLink[] = input.links.map(link => ({ groupId: link.groupId, stageCodes: Array.from(new Set(link.stageCodes.map(code => code.trim().toUpperCase()).filter(Boolean))), anchor: link.anchor, suggestedScore: link.suggestedScore ?? null }));
  const groupIds = Array.from(new Set(links.map(link => link.groupId)));
  const known = new Set((await db.select({ id: pmcActivityGroups.id }).from(pmcActivityGroups).where(and(mine(pmcActivityGroups, input), inArray(pmcActivityGroups.id, groupIds.length ? groupIds : ["-"])))).map(row => row.id));
  if (groupIds.some(id => !known.has(id))) throw new TRPCError({ code: "NOT_FOUND", message: "PROJECT_OS_PMC_GROUP_NOT_FOUND" });
  const stages = scheduleStages(await loadScheduleAndVillas(db, input));
  const issues = validateStageLinks(links, stages);
  if (issues.length) throw new TRPCError({ code: "BAD_REQUEST", message: "PROJECT_OS_PMC_STAGE_LINK_INVALID", cause: { issues } });
  const before = new Map((await savedLinks(db, input)).map(link => [link.groupId, link]));
  let saved = 0; let removed = 0;
  await db.transaction(async tx => {
    for (const link of links) {
      await tx.delete(pmcScheduleStageLinks).where(and(mine(pmcScheduleStageLinks, input), eq(pmcScheduleStageLinks.groupId, link.groupId)));
      if (!link.stageCodes.length) { if (before.has(link.groupId)) removed += 1; continue; }
      await tx.insert(pmcScheduleStageLinks).values({ id: randomUUID(), tenantId: input.tenantId, projectId: input.projectId, groupId: link.groupId, stageCodesJson: JSON.stringify(link.stageCodes), anchor: link.anchor, suggestedScore: link.suggestedScore === null ? null : String(link.suggestedScore), updatedByUserId: input.userId });
      saved += 1;
    }
    await tx.insert(auditLogs).values({
      id: randomUUID(), tenantId: input.tenantId, actorUserId: input.userId, action: "pmc.schedule_stage_links_saved", entityType: "project", entityId: input.projectId,
      metadata: JSON.stringify({ saved, removed, changes: links.map(link => { const old = before.get(link.groupId); return { groupId: link.groupId, before: old ? { stageCodes: old.stageCodes, anchor: old.anchor } : null, after: link.stageCodes.length ? { stageCodes: link.stageCodes, anchor: link.anchor, suggested: link.suggestedScore !== null } : null }; }) }),
    });
  });
  const groups = await weightGroups(db, input);
  return { saved, removed, readiness: stageMappingReadiness(groups, await savedLinks(db, input), stages) };
}
