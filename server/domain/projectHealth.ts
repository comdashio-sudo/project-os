export type HealthStatus = "green" | "amber" | "red";
export type HealthException = { code: string; severity: "warning" | "critical"; message: string; recommendedAction: string };

export type ProjectHealthInput = {
  cpi: number | null;
  spi: number | null;
  eac: number | null;
  bac: number | null;
  highRiskCount: number;
  overdueActionCount: number;
  overdueApprovalCount: number;
  overdueRfiCount: number;
  overdueNcrCount: number;
  overdueHseCount?: number;
};

export type ProjectHealthResult = {
  score: number;
  status: HealthStatus;
  confidence: "low" | "medium" | "high";
  exceptions: HealthException[];
  recommendedActions: string[];
};

function assertCount(value: number, name: string) {
  if (!Number.isInteger(value) || value < 0) throw new RangeError(`${name} must be a non-negative integer.`);
}

export function calculateProjectHealth(input: ProjectHealthInput): ProjectHealthResult {
  ["highRiskCount", "overdueActionCount", "overdueApprovalCount", "overdueRfiCount", "overdueNcrCount"].forEach(key => assertCount(input[key as keyof ProjectHealthInput] as number, key));
  const overdueHseCount = input.overdueHseCount ?? 0;
  assertCount(overdueHseCount, "overdueHseCount");
  let score = 100;
  const exceptions: HealthException[] = [];
  const add = (condition: boolean, points: number, exception: HealthException) => { if (condition) { score -= points; exceptions.push(exception); } };

  add(input.cpi !== null && input.cpi < 0.9, 25, { code: "CPI_CRITICAL", severity: "critical", message: "CPI is below the critical cost-control threshold.", recommendedAction: "Validate cost-to-complete and open a cost-recovery action." });
  add(input.cpi !== null && input.cpi >= 0.9 && input.cpi < 1, 10, { code: "CPI_WARNING", severity: "warning", message: "CPI is below the approved cost baseline.", recommendedAction: "Monitor cost variance and validate forecast assumptions." });
  add(input.spi !== null && input.spi < 0.9, 25, { code: "SPI_CRITICAL", severity: "critical", message: "SPI is below the critical schedule-control threshold.", recommendedAction: "Review critical activities and publish a recovery plan." });
  add(input.spi !== null && input.spi >= 0.9 && input.spi < 1, 10, { code: "SPI_WARNING", severity: "warning", message: "SPI is below the approved schedule baseline.", recommendedAction: "Review lookahead constraints and recovery options." });
  add(input.eac !== null && input.bac !== null && input.eac > input.bac, 20, { code: "EAC_OVER_BAC", severity: "critical", message: "Forecast cost exceeds the approved budget at completion.", recommendedAction: "Escalate forecast variance and approve a recovery or funding decision." });
  add(input.highRiskCount > 0, Math.min(20, input.highRiskCount * 5), { code: "HIGH_RISK", severity: input.highRiskCount >= 3 ? "critical" : "warning", message: `${input.highRiskCount} high-exposure risk(s) require active mitigation.`, recommendedAction: "Review mitigation owners, triggers and residual exposure." });
  add(input.overdueActionCount > 0, Math.min(15, input.overdueActionCount * 3), { code: "OVERDUE_ACTION", severity: "warning", message: `${input.overdueActionCount} action(s) are overdue.`, recommendedAction: "Escalate owners and set a revised due date with evidence." });
  add(input.overdueApprovalCount > 0, 10, { code: "OVERDUE_APPROVAL", severity: "warning", message: "At least one approval has exceeded its SLA.", recommendedAction: "Escalate the workflow task to its designated approver." });
  add(input.overdueRfiCount > 0, 8, { code: "OVERDUE_RFI", severity: "warning", message: "At least one RFI is overdue.", recommendedAction: "Review the responsible reviewer and schedule impact." });
  add(input.overdueNcrCount > 0, 8, { code: "OVERDUE_NCR", severity: "warning", message: "At least one NCR is overdue.", recommendedAction: "Verify corrective action ownership and closure evidence." });
  add(overdueHseCount > 0, 8, { code: "OVERDUE_HSE", severity: "warning", message: "At least one HSE observation is overdue.", recommendedAction: "Verify remediation ownership and closure evidence." });

  const cappedScore = Math.max(0, score);
  const status: HealthStatus = cappedScore >= 85 ? "green" : cappedScore >= 65 ? "amber" : "red";
  const knownMetrics = [input.cpi, input.spi, input.eac, input.bac].filter(value => value !== null).length;
  const confidence = knownMetrics >= 4 ? "high" : knownMetrics >= 2 ? "medium" : "low";
  return { score: cappedScore, status, confidence, exceptions, recommendedActions: Array.from(new Set(exceptions.map(exception => exception.recommendedAction))) };
}
