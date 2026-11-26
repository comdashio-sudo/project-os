// Q-61 (3): which stages of the P6 schedule each weight group's planned progress follows, once per project. The schedule's stages are its «Q Item» codes
// (or, without that code type, the part of the activity code after the villa: «V606.Q02» → «Q02»); they do NOT mean what the weights file's Q codes mean
// (schedule Q06 = roof installation, weights Q06 = concrete structure), so the platform suggests by NAME only, never by code, and a person saves the result.
// A group follows the span of one or more stages' activities in each villa, or is earned whole at the start or the end of one stage (a group with no villa
// activity of its own, such as factory production). Every group that carries weight must be linked before the planned curve (Q-61 (4)) is computed.
// Pure: the caller loads the rows.
import { nameScore } from "./pmcActivityMatch";

export type StageAnchor = "span" | "start" | "end";
export const STAGE_ANCHORS: readonly StageAnchor[] = ["span", "start", "end"];
export type ScheduleStage = { code: string; name: string; activities: number; villas: number };
export type WeightGroup = { id: string; code: string; name: string; nameEn: string | null; weight: number };
export type StageLink = { groupId: string; stageCodes: string[]; anchor: StageAnchor; suggestedScore: number | null };
export type StageSuggestion = { groupId: string; stageCode: string; score: number };
export const STAGE_SUGGEST_THRESHOLD = 0.5;

const QITEM_TYPES = new Set(["q item", "q-item", "qitem", "item", "stage", "المرحلة", "البند"]);
/** The activity's stage: its «Q Item» code value when it has one, else the segment after the villa in its code («V606.Q02» / «V606-Q02-010» → «Q02»). */
export function stageOfActivity(activity: { code: string; codes: Record<string, string> }): string | null {
  for (const [type, value] of Object.entries(activity.codes)) if (QITEM_TYPES.has(type.trim().toLowerCase()) && value.trim()) return value.trim().toUpperCase();
  const match = /^(?:v|villa)[\s\-_]*\d{1,6}[.\-_]([A-Za-z]{1,4}\d{1,4})/i.exec(activity.code.trim());
  return match ? match[1].toUpperCase() : null;
}

/** Each weight group not linked yet, given the schedule stage whose name fits its name (Arabic or English) best, when the fit reaches the threshold. */
export function suggestStageLinks(groups: WeightGroup[], stages: ScheduleStage[], threshold = STAGE_SUGGEST_THRESHOLD): StageSuggestion[] {
  const out: StageSuggestion[] = [];
  for (const group of groups) {
    let best: StageSuggestion | null = null;
    for (const stage of stages) {
      if (!stage.name.trim()) continue;
      const score = Math.max(nameScore(group.name, stage.name), group.nameEn ? nameScore(group.nameEn, stage.name) : 0);
      if (!best || score > best.score) best = { groupId: group.id, stageCode: stage.code, score };
    }
    if (best && best.score >= threshold) out.push({ ...best, score: Math.round(Math.min(1, best.score) * 1e4) / 1e4 });
  }
  return out;
}

export type StageLinkIssue = { groupId: string; problem: "ANCHOR_NEEDS_ONE_STAGE" | "STAGE_NOT_IN_SCHEDULE" | "DUPLICATE_GROUP" | "BAD_ANCHOR"; stageCodes?: string[] };
/** What is wrong with links about to be saved: a start/end anchor names exactly one stage; every stage is in the current schedule; a group appears once. An empty stage list removes the link. */
export function validateStageLinks(links: StageLink[], stages: ScheduleStage[]): StageLinkIssue[] {
  const known = new Set(stages.map(stage => stage.code));
  const seen = new Set<string>(); const issues: StageLinkIssue[] = [];
  for (const link of links) {
    if (seen.has(link.groupId)) { issues.push({ groupId: link.groupId, problem: "DUPLICATE_GROUP" }); continue; }
    seen.add(link.groupId);
    if (!STAGE_ANCHORS.includes(link.anchor)) { issues.push({ groupId: link.groupId, problem: "BAD_ANCHOR" }); continue; }
    if (!link.stageCodes.length) continue;
    if (link.anchor !== "span" && link.stageCodes.length !== 1) issues.push({ groupId: link.groupId, problem: "ANCHOR_NEEDS_ONE_STAGE" });
    const missing = link.stageCodes.filter(code => !known.has(code));
    if (missing.length) issues.push({ groupId: link.groupId, problem: "STAGE_NOT_IN_SCHEDULE", stageCodes: missing });
  }
  return issues;
}

/** Can the planned curve be computed? Every group with weight > 0 linked, and every linked stage still in the schedule (a later import may have dropped one). */
export function stageMappingReadiness(groups: WeightGroup[], links: StageLink[], stages: ScheduleStage[]) {
  const byGroup = new Map(links.map(link => [link.groupId, link]));
  const known = new Set(stages.map(stage => stage.code));
  const unlinked = groups.filter(group => group.weight > 0 && !byGroup.get(group.id)?.stageCodes.length).map(group => group.code);
  const stale = groups.flatMap(group => {
    const missing = (byGroup.get(group.id)?.stageCodes ?? []).filter(code => !known.has(code));
    return missing.length ? [{ groupCode: group.code, stageCodes: missing }] : [];
  });
  const linkedStages = new Set(links.flatMap(link => link.stageCodes));
  return { ready: stages.length > 0 && unlinked.length === 0 && stale.length === 0, unlinked, stale, stagesWithoutGroup: stages.filter(stage => !linkedStages.has(stage.code)).map(stage => stage.code) };
}
