// Q-61 (4): the planned S-curve of each villa, block, model and the project from the P6 BASELINE (the snapshot marked as baseline: its planned dates, so an
// activity a later import dropped or moved does not change the plan — review of #549, note 1) and the weights, through the link of Q-61 (3). Not computed —
// the reason returned by name — while a weighted group is unlinked, a linked stage has left the schedule, or there is no baseline. Against it, each villa's
// actual percentage from the site's own record (pmcSourcePercentages) when the site's activities are set up, and the villas behind plan today.
// Read with project.pmc.read (pmcGate), every query by tenant and project.
import { and, eq } from "drizzle-orm";
import { scheduleSnapshotActivities, scheduleSnapshots } from "../drizzle/schema";
import { plannedCurves, type CurveActivity } from "./domain/plannedCurve";
import { stageMappingReadiness, stageOfActivity } from "./domain/scheduleStageMapping";
import { villaOfEachActivity } from "./domain/scheduleVillas";
import { pmcSourcePercentages } from "./pmcSiteService";
import { savedLinks, scheduleStages, weightGroups } from "./scheduleStageMapping";
import { loadScheduleAndVillas } from "./scheduleVillaLinks";
import { pmcGate, type Scope } from "./wo22Shared";

const mine = <T extends { tenantId: unknown; projectId: unknown }>(table: T, scope: Scope) => and(eq(table.tenantId as never, scope.tenantId), eq(table.projectId as never, scope.projectId));

export async function getPlannedCurve(input: Scope & { now?: Date }) {
  const db = await pmcGate(input, "project.pmc.read");
  const now = input.now ?? new Date();
  const [schedule, groups, links, [baseline]] = await Promise.all([
    loadScheduleAndVillas(db, input), weightGroups(db, input), savedLinks(db, input),
    db.select({ id: scheduleSnapshots.id, dataDate: scheduleSnapshots.dataDate, createdAt: scheduleSnapshots.createdAt }).from(scheduleSnapshots).where(and(mine(scheduleSnapshots, input), eq(scheduleSnapshots.isBaseline, true))).limit(1),
  ]);
  const stages = scheduleStages(schedule);
  const readiness = stageMappingReadiness(groups, links, stages);
  if (!baseline) return { ready: false as const, reason: "NO_BASELINE" as const, readiness };
  if (!readiness.ready) return { ready: false as const, reason: "LINKS_INCOMPLETE" as const, readiness };

  // the baseline's planned dates, for the activities it holds; villa and stage from the activity's WBS and codes
  const dates = await db.select({ activityId: scheduleSnapshotActivities.activityId, start: scheduleSnapshotActivities.plannedStartAt, finish: scheduleSnapshotActivities.plannedFinishAt })
    .from(scheduleSnapshotActivities).where(and(mine(scheduleSnapshotActivities, input), eq(scheduleSnapshotActivities.snapshotId, baseline.id)));
  const byId = new Map(schedule.activities.map(activity => [activity.id, activity]));
  const villaOf = villaOfEachActivity(schedule.wbs, schedule.activities);
  const activities: CurveActivity[] = [];
  let withoutDates = 0;
  for (const row of dates) {
    const activity = byId.get(row.activityId); const villa = villaOf.get(row.activityId);
    if (!activity || villa === undefined) continue;
    const stage = stageOfActivity(activity);
    if (!stage) continue;
    if (!row.start || !row.finish) { withoutDates += 1; continue; }
    activities.push({ villa, stage, start: row.start, finish: row.finish < row.start ? row.start : row.finish });
  }
  const villas = schedule.villas.map(villa => ({ unitNumber: villa.unitNumber, modelCode: villa.modelCode, blockCode: villa.blockCode, unitWeight: Number(villa.unitWeight) || 1 }));
  const curves = plannedCurves({ villas, activities, groups: groups.map(group => ({ id: group.id, code: group.code, weightByModel: group.weightByModel })), links, at: now });

  // the actual percentage from the site's record (0..1 of a villa), only when the site's activities are set up: otherwise there is no actual to compare
  const sources = await pmcSourcePercentages(input);
  const hasActual = sources.readiness.siteActivities > 0;
  const unitNumberOf = new Map(schedule.villas.map(villa => [villa.id, villa.unitNumber]));
  const actualOf = new Map(sources.byUnit.map(row => [unitNumberOf.get(row.unitId), Math.round(row.site * 10_000) / 100]));
  const villaRows = curves.villas.map(villa => {
    const actual = hasActual ? actualOf.get(villa.unitNumber) ?? 0 : null;
    return { unitNumber: villa.unitNumber, modelCode: villa.modelCode, blockCode: villa.blockCode, unitWeight: villa.unitWeight, scheduled: villa.scheduled, plannedNow: villa.plannedNow, actual, gap: actual === null || !villa.scheduled ? null : Math.round((actual - villa.plannedNow) * 100) / 100, curve: villa.curve };
  });
  const counted = villaRows.filter(row => row.scheduled);
  const weight = counted.reduce((sum, row) => sum + row.unitWeight, 0);
  const projectActual = hasActual && weight ? Math.round(counted.reduce((sum, row) => sum + row.unitWeight * (row.actual ?? 0), 0) / weight * 100) / 100 : null;
  return {
    ready: true as const, readiness,
    baseline: { id: baseline.id, dataDate: baseline.dataDate, createdAt: baseline.createdAt },
    asOf: now, months: curves.months, project: curves.project, blocks: curves.blocks, models: curves.models,
    projectNow: curves.projectNow, projectActual,
    villas: villaRows,
    behind: villaRows.filter(row => row.gap !== null && row.gap < 0).sort((a, b) => a.gap! - b.gap!).map(row => ({ unitNumber: row.unitNumber, blockCode: row.blockCode, modelCode: row.modelCode, plannedNow: row.plannedNow, actual: row.actual!, gap: row.gap! })),
    gaps: curves.gaps, activitiesWithoutDates: withoutDates, villasWithoutActivities: villaRows.filter(row => !row.scheduled).map(row => row.unitNumber),
  };
}
