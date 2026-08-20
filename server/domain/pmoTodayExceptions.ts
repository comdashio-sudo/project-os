export type TodayExceptionCategory = "health" | "schedule" | "risk" | "issue" | "action" | "change";
export type TodayExceptionSeverity = "critical" | "warning";
export type TodayException = { id: string; category: TodayExceptionCategory; severity: TodayExceptionSeverity; projectId: string; projectCode: string; projectName: string; label: string; detail: string; dueAt?: Date | null };

type Project = { id: string; code: string; name: string; plannedFinishAt: Date | null; forecastFinishAt: Date | null; health?: { status: "green" | "amber" | "red" } | null };
type Risk = { id: string; projectId: string; code: string; title: string; probability: number; severity: number; status: string };
type Issue = { id: string; projectId: string; code: string; title: string; priority: string; status: string };
type Action = { id: string; projectId: string | null; title: string; priority: string; status: string; dueAt: Date | null };
type Change = { id: string; projectId: string; changeNumber: string; title: string; impactScheduleDays: number; impactCost: number; currency: string; status: string };

const severityRank: Record<TodayExceptionSeverity, number> = { critical: 0, warning: 1 };
const categoryRank: Record<TodayExceptionCategory, number> = { health: 0, schedule: 1, action: 2, issue: 3, risk: 4, change: 5 };

export function buildPmoTodayExceptions(input: { projects: Project[]; risks: Risk[]; issues: Issue[]; actions: Action[]; changes: Change[]; today: Date }): TodayException[] {
  const projects = new Map(input.projects.map(project => [project.id, project]));
  const exceptions: TodayException[] = [];
  const append = (projectId: string, item: Omit<TodayException, "projectId" | "projectCode" | "projectName">) => {
    const project = projects.get(projectId); if (!project) return;
    exceptions.push({ ...item, projectId, projectCode: project.code, projectName: project.name });
  };
  for (const project of input.projects) {
    if (project.health?.status === "red" || project.health?.status === "amber") append(project.id, { id: `health:${project.id}`, category: "health", severity: project.health.status === "red" ? "critical" : "warning", label: project.health.status === "red" ? "health_red" : "health_amber", detail: project.health.status });
    if (project.plannedFinishAt && project.forecastFinishAt && project.forecastFinishAt > project.plannedFinishAt) {
      const delayedDays = Math.ceil((project.forecastFinishAt.getTime() - project.plannedFinishAt.getTime()) / 86_400_000);
      append(project.id, { id: `schedule:${project.id}`, category: "schedule", severity: delayedDays >= 14 ? "critical" : "warning", label: "forecast_finish_delayed", detail: String(delayedDays) });
    }
  }
  for (const risk of input.risks) if (risk.status !== "closed" && risk.probability * risk.severity >= 15) append(risk.projectId, { id: `risk:${risk.id}`, category: "risk", severity: risk.probability * risk.severity >= 20 ? "critical" : "warning", label: "high_risk", detail: `${risk.code} · ${risk.title}` });
  for (const issue of input.issues) if (!['resolved', 'closed'].includes(issue.status) && issue.priority === "critical") append(issue.projectId, { id: `issue:${issue.id}`, category: "issue", severity: "critical", label: "critical_issue", detail: `${issue.code} · ${issue.title}` });
  for (const action of input.actions) if (action.projectId && !['completed', 'cancelled'].includes(action.status) && action.dueAt && action.dueAt < input.today) append(action.projectId, { id: `action:${action.id}`, category: "action", severity: action.priority === "critical" ? "critical" : "warning", label: "overdue_action", detail: action.title, dueAt: action.dueAt });
  for (const change of input.changes) if (['submitted', 'under_review'].includes(change.status) && (change.impactScheduleDays > 0 || change.impactCost > 0)) append(change.projectId, { id: `change:${change.id}`, category: "change", severity: change.impactScheduleDays >= 14 ? "critical" : "warning", label: "open_change", detail: `${change.changeNumber} · ${change.title} · ${change.impactScheduleDays}d / ${change.impactCost} ${change.currency}` });
  return exceptions.sort((left, right) => severityRank[left.severity] - severityRank[right.severity] || categoryRank[left.category] - categoryRank[right.category] || left.projectCode.localeCompare(right.projectCode));
}
