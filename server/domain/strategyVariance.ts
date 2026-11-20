// Q-21 (a), batch 6 (unit 5): the arithmetic of a variance — the actual where the platform has it, and the difference. Never typed in where computed.
//   winRateInPeriod   won ÷ (won + lost) × 100 over opportunities decided inside [start, end] (withdrawn ones are not a contest), with how many it rests on;
//                     null when none was decided in the period — «no actual», said, never a zero
//   difference        actual − assumed (4 decimals, as stored), and the same as a percent of the assumed value (2 decimals; null when the assumed value is 0)
import type { PipelineOpportunity } from "./strategyPipeline";

const round4 = (value: number) => Math.round(value * 10_000) / 10_000;

export function winRateInPeriod(items: Pick<PipelineOpportunity, "status" | "decidedAt">[], start: string, end: string): { actual: number; sampleSize: number } | null {
  const decided = items.filter(item => (item.status === "won" || item.status === "lost") && item.decidedAt !== null && item.decidedAt >= start && item.decidedAt <= end);
  if (!decided.length) return null;
  const won = decided.filter(item => item.status === "won").length;
  return { actual: round4((won / decided.length) * 100), sampleSize: decided.length };
}

export function difference(assumed: number, actual: number): { difference: number; percentOfAssumed: number | null } {
  return { difference: round4(actual - assumed), percentOfAssumed: assumed === 0 ? null : Math.round(((actual - assumed) / Math.abs(assumed)) * 10_000) / 100 };
}
