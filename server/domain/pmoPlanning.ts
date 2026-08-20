export type PlanningSignal = "health_red" | "health_amber" | "schedule_critical" | "schedule_warning" | "cost_critical" | "cost_warning" | "finish_delay" | "high_risk" | "critical_issue" | "overdue_action" | "missing_evm" | "missing_health";

export type PmoPlanningInput = {
  id: string;
  code: string;
  name: string;
  lifecycleStage: string;
  status: string;
  currency: string;
  plannedFinishAt: Date | null;
  forecastFinishAt: Date | null;
  health: { status: "green" | "amber" | "red"; overallScore: number; periodAt: Date } | null;
  evm: { cpi: number | null; spi: number | null; eac: number; vac: number; periodAt: Date } | null;
  openRiskCount: number;
  criticalIssueCount: number;
  overdueActionCount: number;
};

const dayMilliseconds = 86_400_000;

function attentionRank(level: "critical" | "warning" | "on_track" | "data_required") {
  return { critical: 0, warning: 1, data_required: 2, on_track: 3 }[level];
}

export function buildPmoPlanningOverview(projects: PmoPlanningInput[]) {
  const rows = projects.map(project => {
    const finishVarianceDays = project.plannedFinishAt && project.forecastFinishAt
      ? Math.round((project.forecastFinishAt.getTime() - project.plannedFinishAt.getTime()) / dayMilliseconds)
      : null;
    const signals: PlanningSignal[] = [];
    if (!project.evm) signals.push("missing_evm");
    if (!project.health) signals.push("missing_health");
    if (project.health?.status === "red") signals.push("health_red");
    if (project.health?.status === "amber") signals.push("health_amber");
    if (project.evm?.spi !== null && project.evm?.spi !== undefined) { const signal = project.evm.spi < 0.9 ? "schedule_critical" : project.evm.spi < 0.95 ? "schedule_warning" : null; if (signal) signals.push(signal); }
    if (project.evm?.cpi !== null && project.evm?.cpi !== undefined) { const signal = project.evm.cpi < 0.9 ? "cost_critical" : project.evm.cpi < 0.95 ? "cost_warning" : null; if (signal) signals.push(signal); }
    if (finishVarianceDays !== null && finishVarianceDays > 0) signals.push("finish_delay");
    if (project.openRiskCount > 0) signals.push("high_risk");
    if (project.criticalIssueCount > 0) signals.push("critical_issue");
    if (project.overdueActionCount > 0) signals.push("overdue_action");
    const attentionLevel = signals.some(signal => ["health_red", "schedule_critical", "cost_critical", "finish_delay", "critical_issue", "overdue_action"].includes(signal)) ? "critical" as const : signals.some(signal => ["health_amber", "schedule_warning", "cost_warning", "high_risk"].includes(signal)) ? "warning" as const : signals.some(signal => ["missing_evm", "missing_health"].includes(signal)) ? "data_required" as const : "on_track" as const;
    return { ...project, finishVarianceDays, signals, attentionLevel };
  }).sort((left, right) => attentionRank(left.attentionLevel) - attentionRank(right.attentionLevel) || left.code.localeCompare(right.code));
  return {
    projects: rows,
    summary: {
      totalProjects: rows.length,
      criticalProjects: rows.filter(row => row.attentionLevel === "critical").length,
      warningProjects: rows.filter(row => row.attentionLevel === "warning").length,
      dataRequiredProjects: rows.filter(row => row.attentionLevel === "data_required").length,
      delayedProjects: rows.filter(row => (row.finishVarianceDays ?? 0) > 0).length,
    },
  };
}
