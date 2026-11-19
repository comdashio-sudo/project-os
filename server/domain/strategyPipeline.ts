// Q-21 (a), batch 4: what the opportunities pipeline says, computed — never typed in.
//   weighted      Σ value × probability of the opportunities still in play (open, submitted)
//   winRate       won ÷ (won + lost) over the decided ones in the window, by count and by value; withdrawn ones are not a contest and do not count
//   lostTo        per competitor, how many of the lost ones it won and for how much (the «results of the tenders we competed in»)
// The window is the last `months` months by decision date, ending on `today` (the site day); null when nothing was decided in it.
export type PipelineOpportunity = {
  status: "open" | "submitted" | "won" | "lost" | "withdrawn"; estimatedValue: number; probabilityPercent: number; decidedAt: string | null;
  winnerCompetitorId: string | null; winningValue: number | null;
};
export type PipelineSummary = {
  counts: Record<PipelineOpportunity["status"], number>;
  inPlay: { count: number; value: number; weighted: number };
  winRate: { window: { from: string; to: string }; decided: number; won: number; byCount: number | null; byValue: number | null };
  lostTo: Array<{ competitorId: string; count: number; value: number }>;
};

const round2 = (value: number) => Math.round(value * 100) / 100;
/** The first day of the window: `months` months before `today`, same day of the month (YYYY-MM-DD). */
export function windowStart(today: string, months: number) {
  const date = new Date(`${today}T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - months);
  return date.toISOString().slice(0, 10);
}

export function summarizePipeline(items: PipelineOpportunity[], today: string, months = 12): PipelineSummary {
  const counts = { open: 0, submitted: 0, won: 0, lost: 0, withdrawn: 0 };
  for (const item of items) counts[item.status] += 1;
  const inPlay = items.filter(item => item.status === "open" || item.status === "submitted");
  const from = windowStart(today, months);
  const decided = items.filter(item => (item.status === "won" || item.status === "lost") && item.decidedAt !== null && item.decidedAt > from && item.decidedAt <= today);
  const won = decided.filter(item => item.status === "won");
  const value = (list: PipelineOpportunity[]) => list.reduce((total, item) => total + item.estimatedValue, 0);
  const lost = new Map<string, { count: number; value: number }>();
  for (const item of items) {
    if (item.status !== "lost" || !item.winnerCompetitorId) continue;
    const entry = lost.get(item.winnerCompetitorId) ?? { count: 0, value: 0 };
    entry.count += 1; entry.value += item.winningValue ?? item.estimatedValue;
    lost.set(item.winnerCompetitorId, entry);
  }
  return {
    counts,
    inPlay: { count: inPlay.length, value: round2(value(inPlay)), weighted: round2(inPlay.reduce((total, item) => total + item.estimatedValue * item.probabilityPercent / 100, 0)) },
    winRate: {
      window: { from, to: today }, decided: decided.length, won: won.length,
      byCount: decided.length ? round2((won.length / decided.length) * 100) : null,
      byValue: value(decided) > 0 ? round2((value(won) / value(decided)) * 100) : null,
    },
    lostTo: Array.from(lost, ([competitorId, entry]) => ({ competitorId, count: entry.count, value: round2(entry.value) })).sort((a, b) => b.count - a.count || b.value - a.value),
  };
}
