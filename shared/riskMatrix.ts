// Q-27 (P-115/P-116): the project risk register's 5×5 matrix and its review list, computed in one place for the server and the page so a cell can
// never disagree with the list beside it. Pure: no clock of its own (the caller passes the site day), no database.

export const RISK_SCALE = [1, 2, 3, 4, 5] as const;
export type RiskStatus = "open" | "mitigating" | "accepted" | "closed";
export type RiskLevel = "low" | "medium" | "high" | "critical";
export type MatrixRisk = { id: string; probability: number; severity: number; status: RiskStatus; nextReviewAt: string | null };

/** Probability × impact, 1–25. */
export const riskScore = (risk: Pick<MatrixRisk, "probability" | "severity">) => risk.probability * risk.severity;

/** The band of a score: 1–4 low, 5–9 medium, 10–14 high, 15–25 critical (the usual 5×5 heat map; 4×4 = 16 is critical, 3×4 = 12 high). */
export function riskLevel(score: number): RiskLevel {
  if (score >= 15) return "critical";
  if (score >= 10) return "high";
  if (score >= 5) return "medium";
  return "low";
}

/** A risk counts on the matrix while it is live: a closed risk has left the register's picture (it stays in the list and its history). */
export const isLiveRisk = (risk: Pick<MatrixRisk, "status">) => risk.status !== "closed";

/** Its review date has passed (strictly before the site day) and it is still live. A risk with no review date is not overdue; it is "unscheduled". */
export const isReviewOverdue = (risk: Pick<MatrixRisk, "status" | "nextReviewAt">, siteDay: string) => isLiveRisk(risk) && risk.nextReviewAt !== null && risk.nextReviewAt < siteDay;

/**
 * cells[p - 1][s - 1] = the ids of the live risks with probability p and impact s. Values outside 1–5 (never written: the server and the database check)
 * are left out rather than clamped, so a bad row cannot inflate a corner.
 */
export function riskMatrix(risks: readonly MatrixRisk[]) {
  const cells: string[][][] = RISK_SCALE.map(() => RISK_SCALE.map(() => []));
  for (const risk of risks) {
    if (!isLiveRisk(risk) || !RISK_SCALE.includes(risk.probability as 1) || !RISK_SCALE.includes(risk.severity as 1)) continue;
    cells[risk.probability - 1]![risk.severity - 1]!.push(risk.id);
  }
  const byLevel: Record<RiskLevel, number> = { low: 0, medium: 0, high: 0, critical: 0 };
  for (const p of RISK_SCALE) for (const s of RISK_SCALE) byLevel[riskLevel(p * s)] += cells[p - 1]![s - 1]!.length;
  return { cells, live: byLevel.low + byLevel.medium + byLevel.high + byLevel.critical, byLevel };
}

/** The review list: overdue first (the oldest date first), then the live risks with no review date. */
export function reviewQueue<T extends MatrixRisk>(risks: readonly T[], siteDay: string) {
  const overdue = risks.filter(risk => isReviewOverdue(risk, siteDay)).sort((a, b) => (a.nextReviewAt! < b.nextReviewAt! ? -1 : a.nextReviewAt! > b.nextReviewAt! ? 1 : riskScore(b) - riskScore(a)));
  const unscheduled = risks.filter(risk => isLiveRisk(risk) && risk.nextReviewAt === null).sort((a, b) => riskScore(b) - riskScore(a));
  return { overdue, unscheduled };
}
