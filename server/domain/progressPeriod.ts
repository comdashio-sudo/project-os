// Q-72 (2): «إنجاز الفترة» = the progress at the END of the period minus the progress at its START, never a typed number. The status of a cell at a moment is the last status
// its history says up to then (no row yet = not started). Pure: the caller reads the rows. The two summaries come from summarizeProgress with the same rules.
import type { PmcUnitActivityStatus } from "./pmc";
import type { ActivitySummary, GroupSummary } from "./progressSummary";

export type HistoryRow = { cellId: string; status: PmcUnitActivityStatus; at: Date };

/** The status of each cell at `at` (inclusive): the last history row of the cell not after it. Cells with no row by then are absent (= not started). */
export function statusesAsOf(history: readonly HistoryRow[], at: Date): Map<string, PmcUnitActivityStatus> {
  const last = new Map<string, HistoryRow>();
  for (const row of history) {
    if (row.at.getTime() > at.getTime()) continue;
    const seen = last.get(row.cellId);
    if (!seen || row.at.getTime() >= seen.at.getTime()) last.set(row.cellId, row);
  }
  return new Map(Array.from(last.entries()).map(([cell, row]) => [cell, row.status]));
}

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
/** end − start, or null when either side has no number (never a guess). */
export const delta = (start: number | null, end: number | null) => (start === null || end === null ? null : round(end - start));

export type Period = { project: { startPercent: number | null; endPercent: number | null; deltaPercent: number | null }; blocks: Array<{ key: string; startPercent: number | null; endPercent: number | null; deltaPercent: number | null }>; phases: Array<{ key: string; startPercent: number | null; endPercent: number | null; deltaPercent: number | null }>;
  activities: Array<{ code: string; startEarnedPercent: number; endEarnedPercent: number; deltaEarnedPercent: number }> };

/** The period's change from the summary at its start and the summary at its end (the same villas in both). */
export function periodChange(start: { project: { progressPercent: number | null }; blocks: GroupSummary[]; phases: GroupSummary[]; activities: ActivitySummary[] }, end: typeof start): Period {
  const groups = (a: GroupSummary[], b: GroupSummary[]) => b.map(row => { const before = a.find(item => item.key === row.key)?.progressPercent ?? null; return { key: row.key, startPercent: before, endPercent: row.progressPercent, deltaPercent: delta(before, row.progressPercent) }; });
  return {
    project: { startPercent: start.project.progressPercent, endPercent: end.project.progressPercent, deltaPercent: delta(start.project.progressPercent, end.project.progressPercent) },
    blocks: groups(start.blocks, end.blocks), phases: groups(start.phases, end.phases),
    activities: end.activities.map(row => { const before = start.activities.find(item => item.code === row.code)?.earnedPercent ?? 0; return { code: row.code, startEarnedPercent: before, endEarnedPercent: row.earnedPercent, deltaEarnedPercent: round(row.earnedPercent - before) }; }),
  };
}
