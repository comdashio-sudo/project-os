import { describe, expect, it } from "vitest";
import { buildPmoPlanningOverview } from "./pmoPlanning";

describe("buildPmoPlanningOverview", () => {
  it("prioritizes schedule, cost, health, and overdue-action exceptions without inventing absent EVM data", () => {
    const result = buildPmoPlanningOverview([
      { id: "steady", code: "P-02", name: "Steady", lifecycleStage: "execution", status: "active", currency: "SAR", plannedFinishAt: new Date("2026-08-20"), forecastFinishAt: new Date("2026-08-20"), health: { status: "green", overallScore: 95, periodAt: new Date("2026-08-20") }, evm: { cpi: 1.02, spi: 1.01, eac: 100, vac: 0, periodAt: new Date("2026-08-20") }, openRiskCount: 0, criticalIssueCount: 0, overdueActionCount: 0 },
      { id: "late", code: "P-01", name: "Late", lifecycleStage: "execution", status: "active", currency: "SAR", plannedFinishAt: new Date("2026-08-20"), forecastFinishAt: new Date("2026-08-25"), health: { status: "red", overallScore: 44, periodAt: new Date("2026-08-20") }, evm: { cpi: 0.82, spi: 0.88, eac: 130, vac: -30, periodAt: new Date("2026-08-20") }, openRiskCount: 1, criticalIssueCount: 1, overdueActionCount: 1 },
      { id: "missing", code: "P-03", name: "Missing", lifecycleStage: "planning", status: "active", currency: "SAR", plannedFinishAt: null, forecastFinishAt: null, health: null, evm: null, openRiskCount: 0, criticalIssueCount: 0, overdueActionCount: 0 },
    ]);
    expect(result.projects.map(project => project.id)).toEqual(["late", "missing", "steady"]);
    expect(result.projects[0]).toMatchObject({ attentionLevel: "critical", finishVarianceDays: 5, signals: expect.arrayContaining(["health_red", "schedule_critical", "cost_critical", "finish_delay", "overdue_action"]) });
    expect(result.projects[1]).toMatchObject({ attentionLevel: "data_required", signals: ["missing_evm", "missing_health"] });
    expect(result.summary).toEqual({ totalProjects: 3, criticalProjects: 1, warningProjects: 0, dataRequiredProjects: 1, delayedProjects: 1 });
  });
});
