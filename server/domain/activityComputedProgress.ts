// Q-71 (1) batch 2 (the owner, 26-11: «progress entry looks tied to the schedule's items, and that is wrong»): in a project with a PMC catalogue, a P6
// schedule activity's progress is computed from the villas' cells, never typed. For one activity: its villa (from the WBS, Q-61 (2)) and its stage (its
// Q code, Q-61 (3)); the weight groups linked to that stage; the PMC activities of those groups for the villa's model; and their statuses weighted by
// the activity weights and the project's status factors — the same rule as a villa's progress, restricted to the groups the stage carries. What cannot
// be computed says why by name, never a 0. Pure: the caller reads the rows.
import type { PmcUnitActivityStatus } from "./pmc";

export type ActivityRef = { id: string; villa: number | null; stage: string | null };
export type StageGroupLink = { groupId: string; stageCodes: string[] };
export type GroupDefinition = { id: string; groupId: string; modelCode: string; weightPercent: number };
export type VillaUnit = { id: string; unitNumber: number; modelCode: string };
export type ComputedReason = "NO_VILLA" | "NO_STAGE" | "STAGE_NOT_LINKED" | "VILLA_NOT_IN_PROJECT" | "NO_WEIGHT";
export type ActivityComputed = { activityId: string; percent: number | null; reason: ComputedReason | null; villa: number | null; stage: string | null; groupIds: string[]; cells: number };

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function computeActivityProgress(input: {
  activities: ActivityRef[]; links: StageGroupLink[]; definitions: GroupDefinition[]; units: VillaUnit[];
  statusOf: ReadonlyMap<string, PmcUnitActivityStatus>; factors: Record<PmcUnitActivityStatus, number>;
}): ActivityComputed[] {
  const groupsOfStage = new Map<string, string[]>();
  for (const link of input.links) for (const code of link.stageCodes) groupsOfStage.set(code, [...(groupsOfStage.get(code) ?? []), link.groupId]);
  const unitOf = new Map(input.units.map(unit => [unit.unitNumber, unit]));
  return input.activities.map(activity => {
    const base = { activityId: activity.id, villa: activity.villa, stage: activity.stage, groupIds: [] as string[], cells: 0 };
    if (activity.villa === null) return { ...base, percent: null, reason: "NO_VILLA" as const };
    if (!activity.stage) return { ...base, percent: null, reason: "NO_STAGE" as const };
    const groupIds = groupsOfStage.get(activity.stage) ?? [];
    if (!groupIds.length) return { ...base, percent: null, reason: "STAGE_NOT_LINKED" as const };
    const unit = unitOf.get(activity.villa);
    if (!unit) return { ...base, groupIds, percent: null, reason: "VILLA_NOT_IN_PROJECT" as const };
    const wanted = new Set(groupIds);
    const definitions = input.definitions.filter(definition => wanted.has(definition.groupId) && definition.modelCode === unit.modelCode);
    const weight = definitions.reduce((sum, definition) => sum + definition.weightPercent, 0);
    if (!definitions.length || weight <= 0) return { ...base, groupIds, percent: null, reason: "NO_WEIGHT" as const };
    const earned = definitions.reduce((sum, definition) => sum + definition.weightPercent * (input.factors[input.statusOf.get(`${unit.id}:${definition.id}`) ?? "NOT_STARTED"] ?? 0), 0);
    return { ...base, groupIds, cells: definitions.length, percent: round((earned / weight) * 100), reason: null };
  });
}
