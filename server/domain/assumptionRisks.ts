// Q-21 (a), batch 5: the «assumption risks» board — read-only, computed from the register (docs/proposals/q21-strategy-mapping.md §2, item 5).
// For every assumption still in use (not retired) it says which of these hold, and how much a change in it would move the model:
//   lowConfidence   its confidence is «low»
//   reviewOverdue   its next review date has passed (by the site day, Riyadh)
//   weakSource      it rests on one unconfirmed source: a management estimate with no link to anything published
//   impact          for an APPROVED assumption the model reads: what +10% on its base value does to total revenue and to the lowest cash balance over
//                   the horizon (base scenario), so the board can rank by financial weight; null for one the model does not read
// «Farthest from the actual» needs the actual figures (win rate from the opportunities pipeline, margin from project costs) and comes with them.
import { MODEL_KEYS, runStrategyModel, type ModelAssumption, type ModelKey } from "./strategyModel";

export type RiskAssumption = ModelAssumption & {
  id: string; name: string; confidence: "high" | "medium" | "low"; nextReviewAt: string | null; sourceType: "internal" | "external" | "management"; sourceUrl: string | null;
};
export type RiskRow = {
  id: string; key: string; name: string; status: ModelAssumption["status"];
  flags: { lowConfidence: boolean; reviewOverdue: boolean; weakSource: boolean };
  impact: { revenue: number; lowestCash: number } | null;
};

export const IMPACT_STEP = 0.1;
const round2 = (value: number) => Math.round(value * 100) / 100;

export function assumptionRisks(assumptions: RiskAssumption[], today: string, horizonMonths = 36): { rows: RiskRow[]; counts: Record<keyof RiskRow["flags"], number> } {
  const live = assumptions.filter(item => item.status !== "retired");
  const model = (list: ModelAssumption[]) => runStrategyModel({ horizonMonths, assumptions: list, backlog: [] }).scenarios.base;
  const base = model(live);
  const rows = live.map((item): RiskRow => {
    let impact: RiskRow["impact"] = null;
    if (item.status === "approved" && (MODEL_KEYS as readonly string[]).includes(item.key) && base.missing.length === 0) {
      const bumped = item.values.base === 0 ? 1 : item.values.base * (1 + IMPACT_STEP);
      const moved = model(live.map(other => (other.id === item.id ? { ...other, values: { ...other.values, base: bumped } } : other)));
      impact = { revenue: round2(moved.totals.revenue - base.totals.revenue), lowestCash: round2(moved.lowestCumulative - base.lowestCumulative) };
    }
    return {
      id: item.id, key: item.key, name: item.name, status: item.status,
      flags: {
        lowConfidence: item.confidence === "low",
        reviewOverdue: item.nextReviewAt !== null && item.nextReviewAt < today,
        weakSource: item.sourceType === "management" && !item.sourceUrl,
      },
      impact,
    };
  });
  const weight = (row: RiskRow) => (row.impact ? Math.max(Math.abs(row.impact.revenue), Math.abs(row.impact.lowestCash)) : -1);
  rows.sort((a, b) => weight(b) - weight(a) || a.key.localeCompare(b.key));
  const counts = { lowConfidence: 0, reviewOverdue: 0, weakSource: 0 };
  for (const row of rows) for (const flag of Object.keys(counts) as Array<keyof typeof counts>) if (row.flags[flag]) counts[flag] += 1;
  return { rows, counts };
}

export type { ModelKey };
