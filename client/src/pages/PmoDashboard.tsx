import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { EnterpriseNavigation } from "@/components/EnterpriseNavigation";
import { DashboardSectionReporter } from "@/components/DashboardSectionReporter";
import { SectionErrorBoundary, SectionMessage } from "@/components/SectionResilience";
import { PmoControlLinks } from "./PmoControlLinks";
import { ArrowLeft, CheckSquare, CircleAlert, Clock3, FolderTree, ShieldAlert, TriangleAlert } from "lucide-react";
import React, { FormEvent, useState } from "react";
import { Link, useParams } from "wouter";

type Priority = "low" | "medium" | "high" | "critical";
type EscalationStatus = "none" | "pending" | "escalated";

export default function PmoDashboard() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { isArabic } = useLanguage();
  const utils = trpc.useUtils();
  const setupQuery = trpc.dashboards.pmoPortfolioSetup.useQuery({ tenantId });
  const risksQuery = trpc.dashboards.pmoRisks.useQuery({ tenantId });
  const issuesQuery = trpc.dashboards.pmoIssues.useQuery({ tenantId });
  const actionsQuery = trpc.dashboards.pmoActions.useQuery({ tenantId });
  const planningQuery = trpc.dashboards.pmoPlanning.useQuery({ tenantId });
  const exceptionsQuery = trpc.dashboards.pmoTodayExceptions.useQuery({ tenantId });
  const [riskForm, setRiskForm] = useState({ projectId: "", code: "", title: "", probability: "3", severity: "3" });
  const [issueForm, setIssueForm] = useState<{ projectId: string; code: string; title: string; priority: Priority; dueAt: string }>({ projectId: "", code: "", title: "", priority: "medium", dueAt: "" });
  const [actionForm, setActionForm] = useState<{ projectId: string; title: string; priority: Priority; dueAt: string }>({ projectId: "", title: "", priority: "medium", dueAt: "" });
  const [portfolioForm, setPortfolioForm] = useState({ code: "", name: "" });
  const [programForm, setProgramForm] = useState({ portfolioId: "", code: "", name: "" });
  const [projectLinkForm, setProjectLinkForm] = useState({ projectId: "", programId: "", portfolioId: "" });
  const [planningFilter, setPlanningFilter] = useState<"attention" | "all" | "data_required">("attention");

  const t = isArabic
    ? {
        back: "مساحة العمل", level: "المستوى 2 · مكتب إدارة المشاريع", title: "لوحة حوكمة PMO", sub: "نطاق المحافظ والبرامج وسجلات المخاطر والقضايا والإجراءات ضمن المستأجر المصرح به.", portfolios: "المحافظ", programs: "البرامج", projects: "المشاريع", risks: "المخاطر المفتوحة", issues: "القضايا المفتوحة", actions: "الإجراءات المفتوحة", escalations: "التصعيدات", noData: "لا توجد سجلات ضمن نطاق الوصول الحالي.", loading: "جارٍ تحميل ضوابط PMO…", saving: "جارٍ حفظ السجل…", addRisk: "تسجيل مخاطرة", addIssue: "تسجيل قضية", addAction: "تسجيل إجراء", addPortfolio: "إنشاء محفظة", addProgram: "إنشاء برنامج", linkProject: "ربط مشروع ببرنامج", program: "البرنامج", portfolio: "المحفظة", optionalPortfolio: "المحفظة (اختياري)", project: "المشروع", code: "الرمز", titleLabel: "العنوان", actionTitle: "عنوان الإجراء", probability: "الاحتمال (1–5)", severity: "الأثر (1–5)", priority: "الأولوية", dueDate: "تاريخ الاستحقاق", escalation: "التصعيد", none: "غير مصعّد", pending: "قيد التصعيد", escalated: "مصعّد", requestEscalation: "طلب تصعيد", confirmEscalation: "تأكيد التصعيد", escalationSuccess: "تم تحديث حالة التصعيد وتسجيل الدليل التدقيقي.", save: "حفظ السجل", create: "إنشاء", link: "حفظ الربط", select: "اختر مشروعًا", selectProgram: "بدون برنامج", selectPortfolio: "بدون محفظة", unavailable: "لا يمكن التسجيل قبل وجود مشروع ضمن النطاق.", success: "تم الحفظ وتحديث السجل.", masterSuccess: "تم إنشاء السجل الرئيسي وتحديث لوحة PMO.", linkSuccess: "تم تحديث ارتباط المشروع وتسجيل الدليل التدقيقي.", low: "منخفضة", medium: "متوسطة", high: "مرتفعة", critical: "حرجة",
      }
    : {
        back: "Workspace", level: "Level 2 · PMO", title: "PMO governance board", sub: "Portfolio, program, risk, issue, and action registers within the authorized tenant.", portfolios: "Portfolios", programs: "Programs", projects: "Projects", risks: "Open risks", issues: "Open issues", actions: "Open actions", escalations: "Escalations", noData: "No records are available in the current access scope.", loading: "Loading PMO controls…", saving: "Saving register entry…", addRisk: "Register risk", addIssue: "Register issue", addAction: "Register action", addPortfolio: "Create portfolio", addProgram: "Create program", linkProject: "Link project to program", program: "Program", portfolio: "Portfolio", optionalPortfolio: "Portfolio (optional)", project: "Project", code: "Code", titleLabel: "Title", actionTitle: "Action title", probability: "Probability (1–5)", severity: "Severity (1–5)", priority: "Priority", dueDate: "Due date", escalation: "Escalation", none: "Not escalated", pending: "Pending escalation", escalated: "Escalated", requestEscalation: "Request escalation", confirmEscalation: "Confirm escalation", escalationSuccess: "The escalation status was updated with audit evidence.", save: "Save register", create: "Create", link: "Save link", select: "Select a project", selectProgram: "No program", selectPortfolio: "No portfolio", unavailable: "A project in your scope is required before registration.", success: "Saved and register refreshed.", masterSuccess: "The master record was created and the PMO board has been refreshed.", linkSuccess: "The project relationship was updated with audit evidence.", low: "Low", medium: "Medium", high: "High", critical: "Critical",
      };

  const planningCopy = isArabic
    ? { title: "متابعة التخطيط الموحدة", sub: "ابدأ بالمشاريع التي تحتاج تدخلاً؛ تستند الإشارات إلى آخر EVM وصحة مشروع وسجلات حوكمة متاحة.", attention: "تحتاج تدخلاً", all: "كل المشاريع", dataRequired: "تحتاج بيانات", critical: "حرجة", warning: "تحذير", delayed: "تأخر توقع النهاية", evm: "EVM", health: "الصحة", finish: "النهاية", signals: "الإشارات", empty: "لا توجد مشاريع مطابقة للمرشح الحالي.", partial: "المتاح: بيانات تخطيط المحفظة. الناقص: لقطة EVM أو صحة لمشروع واحد أو أكثر.", onTrack: "ضمن المسار", noForecast: "غير متاح", currentForecast: "التوقع الحالي", daysLate: "يوم تأخر", labels: { health_red: "صحة حمراء", health_amber: "صحة صفراء", schedule_critical: "تأخر زمني حرج", schedule_warning: "تنبيه زمني", cost_critical: "تجاوز تكلفة حرج", cost_warning: "تنبيه تكلفة", finish_delay: "تأخر نهاية متوقعة", high_risk: "مخاطرة عالية", critical_issue: "قضية حرجة", overdue_action: "إجراء متأخر", missing_evm: "لا توجد لقطة EVM", missing_health: "لا توجد لقطة صحة" } }
    : { title: "Planning control center", sub: "Start with projects that need intervention. Signals use the latest available EVM, project health, and governance records.", attention: "Needs attention", all: "All projects", dataRequired: "Data required", critical: "Critical", warning: "Warning", delayed: "Forecast finish delayed", evm: "EVM", health: "Health", finish: "Finish", signals: "Signals", empty: "No projects match the current filter.", partial: "Available: portfolio planning data. Missing: an EVM or health snapshot for one or more projects.", onTrack: "On track", noForecast: "Not available", currentForecast: "Current forecast", daysLate: "days late", labels: { health_red: "Red health", health_amber: "Amber health", schedule_critical: "Critical schedule delay", schedule_warning: "Schedule warning", cost_critical: "Critical cost overrun", cost_warning: "Cost warning", finish_delay: "Forecast finish delayed", high_risk: "High risk", critical_issue: "Critical issue", overdue_action: "Overdue action", missing_evm: "No EVM snapshot", missing_health: "No health snapshot" } };
  const exceptionCopy = isArabic
    ? { title: "استثناءات اليوم", sub: "الأحداث التي تتطلب متابعة الآن عبر المشاريع المصرح بها فقط.", empty: "لا توجد استثناءات مفتوحة تتطلب متابعة اليوم.", critical: "حرج", warning: "تنبيه", labels: { health_red: "صحة حمراء", health_amber: "صحة صفراء", forecast_finish_delayed: "تأخر النهاية المتوقعة", high_risk: "مخاطرة عالية", critical_issue: "قضية حرجة", overdue_action: "إجراء متأخر", material_reorder_required: "إعادة طلب مادة مطلوبة", open_change: "طلب تغيير مفتوح" } }
    : { title: "Today’s exceptions", sub: "Items requiring attention now, across authorized projects only.", empty: "No open exceptions require attention today.", critical: "Critical", warning: "Warning", labels: { health_red: "Red health", health_amber: "Amber health", forecast_finish_delayed: "Forecast finish delayed", high_risk: "High risk", critical_issue: "Critical issue", overdue_action: "Overdue action", material_reorder_required: "Material reorder required", open_change: "Open change request" } };

  const riskMutation = trpc.pmo.createRisk.useMutation({
    onSuccess: () => {
      setRiskForm({ projectId: "", code: "", title: "", probability: "3", severity: "3" });
      utils.dashboards.invalidate();
    },
  });
  const issueMutation = trpc.pmo.createIssue.useMutation({
    onSuccess: () => {
      setIssueForm({ projectId: "", code: "", title: "", priority: "medium", dueAt: "" });
      utils.dashboards.invalidate();
    },
  });
  const actionMutation = trpc.pmo.createAction.useMutation({
    onSuccess: () => {
      setActionForm({ projectId: "", title: "", priority: "medium", dueAt: "" });
      utils.dashboards.invalidate();
    },
  });
  const portfolioMutation = trpc.pmo.createPortfolio.useMutation({ onSuccess: () => { setPortfolioForm({ code: "", name: "" }); utils.dashboards.invalidate(); } });
  const programMutation = trpc.pmo.createProgram.useMutation({ onSuccess: () => { setProgramForm({ portfolioId: "", code: "", name: "" }); utils.dashboards.invalidate(); } });
  const projectLinkMutation = trpc.pmo.linkProject.useMutation({ onSuccess: () => { setProjectLinkForm({ projectId: "", programId: "", portfolioId: "" }); utils.dashboards.invalidate(); } });
  const issueEscalationMutation = trpc.pmo.transitionIssueEscalation.useMutation({ onSuccess: () => utils.dashboards.invalidate() });
  const actionEscalationMutation = trpc.pmo.transitionActionEscalation.useMutation({ onSuccess: () => utils.dashboards.invalidate() });

  if (setupQuery.error && risksQuery.error && issuesQuery.error && actionsQuery.error) return <main className="min-h-screen bg-[#f4f6f8] p-8 text-red-700">{getLocalizedProjectError(setupQuery.error, isArabic)}</main>;
  const data = {
    portfolios: setupQuery.data?.portfolios ?? [], programs: setupQuery.data?.programs ?? [], projects: setupQuery.data?.projects ?? [],
    risks: risksQuery.data?.risks ?? [], issues: issuesQuery.data?.issues ?? [], actions: actionsQuery.data?.actions ?? [],
    decisions: setupQuery.data?.decisions ?? [], rfis: setupQuery.data?.rfis ?? [], ncrs: setupQuery.data?.ncrs ?? [],
  };
  const planningOverview = planningQuery.data?.planningOverview ?? { projects: [], summary: { totalProjects: 0, criticalProjects: 0, warningProjects: 0, dataRequiredProjects: 0, delayedProjects: 0 } };
  const todayExceptions = exceptionsQuery.data?.todayExceptions ?? [];
  const planningProjects = planningOverview.projects.filter(project => planningFilter === "all" || (planningFilter === "data_required" ? project.attentionLevel === "data_required" : project.attentionLevel !== "on_track"));
  const openRisks = data.risks.filter(item => item.status !== "closed");
  const openIssues = data.issues.filter(item => !["resolved", "closed"].includes(item.status));
  const openActions = data.actions.filter(item => !["completed", "cancelled"].includes(item.status));
  const field = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";
  const priorityLabel = (priority: string) => t[priority as Priority] ?? priority;
  const escalationLabel = (status: EscalationStatus) => t[status];
  const signalLabel = (signal: string) => planningCopy.labels[signal as keyof typeof planningCopy.labels] ?? signal;
  const exceptionLabel = (label: string) => exceptionCopy.labels[label as keyof typeof exceptionCopy.labels] ?? label;
  const nextEscalation = (status: EscalationStatus) => status === "none" ? "pending" : status === "pending" ? "escalated" : null;
  const projectSelect = (value: string, change: (value: string) => void) => (
    <select value={value} onChange={event => change(event.target.value)} className={field} required>
      <option value="">{t.select}</option>
      {data.projects.map(project => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}
    </select>
  );
  const prioritySelect = (value: Priority, change: (value: Priority) => void) => (
    <select value={value} onChange={event => change(event.target.value as Priority)} className={field}>
      <option value="low">{t.low}</option>
      <option value="medium">{t.medium}</option>
      <option value="high">{t.high}</option>
      <option value="critical">{t.critical}</option>
    </select>
  );
  const submitRisk = (event: FormEvent) => {
    event.preventDefault();
    riskMutation.mutate({ tenantId, projectId: riskForm.projectId, code: riskForm.code, title: riskForm.title, probability: Number(riskForm.probability), severity: Number(riskForm.severity) });
  };
  const submitIssue = (event: FormEvent) => {
    event.preventDefault();
    issueMutation.mutate({ tenantId, projectId: issueForm.projectId, code: issueForm.code, title: issueForm.title, priority: issueForm.priority, ...(issueForm.dueAt ? { dueAt: new Date(issueForm.dueAt) } : {}) });
  };
  const submitAction = (event: FormEvent) => {
    event.preventDefault();
    actionMutation.mutate({ tenantId, projectId: actionForm.projectId, title: actionForm.title, priority: actionForm.priority, ...(actionForm.dueAt ? { dueAt: new Date(actionForm.dueAt) } : {}) });
  };
  const submitPortfolio = (event: FormEvent) => { event.preventDefault(); portfolioMutation.mutate({ tenantId, ...portfolioForm }); };
  const submitProgram = (event: FormEvent) => { event.preventDefault(); programMutation.mutate({ tenantId, code: programForm.code, name: programForm.name, ...(programForm.portfolioId ? { portfolioId: programForm.portfolioId } : {}) }); };
  const submitProjectLink = (event: FormEvent) => { event.preventDefault(); projectLinkMutation.mutate({ tenantId, projectId: projectLinkForm.projectId, ...(projectLinkForm.programId ? { programId: projectLinkForm.programId } : {}), ...(projectLinkForm.portfolioId ? { portfolioId: projectLinkForm.portfolioId } : {}) }); };

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#0e6b70]"><ArrowLeft className="h-4 w-4" />{t.back}</Link>
          <div className="flex gap-3"><span className="text-sm text-slate-500">{t.level}</span><LanguageToggle /></div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-8">
        <EnterpriseNavigation tenantId={tenantId} context="pmo" />
        <DashboardSectionReporter tenantId={tenantId} product="PMO" sectionKey="pmo_setup" state={setupQuery.error ? "error" : null} />
        <DashboardSectionReporter tenantId={tenantId} product="PMO" sectionKey="pmo_risks" state={risksQuery.error ? "error" : null} />
        <DashboardSectionReporter tenantId={tenantId} product="PMO" sectionKey="pmo_issues" state={issuesQuery.error ? "error" : null} />
        <DashboardSectionReporter tenantId={tenantId} product="PMO" sectionKey="pmo_actions" state={actionsQuery.error ? "error" : null} />
        <DashboardSectionReporter tenantId={tenantId} product="PMO" sectionKey="pmo_planning" state={planningQuery.error ? "error" : planningOverview.summary.dataRequiredProjects > 0 ? "partial" : null} />
        <DashboardSectionReporter tenantId={tenantId} product="PMO" sectionKey="pmo_today_exceptions" state={exceptionsQuery.error ? "error" : null} />
        <section className="rounded-3xl bg-[#123a4a] p-7 text-white">
          <p className="text-xs font-bold tracking-[.16em] text-[#74d0c1]">PROJECT OS</p>
          <h1 className="mt-2 text-3xl font-semibold">{t.title}</h1>
          <p className="mt-2 text-slate-300">{t.sub}</p>
        </section>
        <div className="mt-6 grid gap-3 md:grid-cols-2">
          {setupQuery.isLoading && <SectionMessage title={isArabic ? "إعداد المحفظة والبرنامج" : "Portfolio and program setup"} isArabic={isArabic} kind="loading" />}
          {setupQuery.error && <SectionMessage title={isArabic ? "إعداد المحفظة والبرنامج" : "Portfolio and program setup"} isArabic={isArabic} kind="error" detail={getLocalizedProjectError(setupQuery.error, isArabic)} />}
          {risksQuery.isLoading && <SectionMessage title={t.risks} isArabic={isArabic} kind="loading" />}
          {risksQuery.error && <SectionMessage title={t.risks} isArabic={isArabic} kind="error" detail={getLocalizedProjectError(risksQuery.error, isArabic)} />}
          {issuesQuery.isLoading && <SectionMessage title={t.issues} isArabic={isArabic} kind="loading" />}
          {issuesQuery.error && <SectionMessage title={t.issues} isArabic={isArabic} kind="error" detail={getLocalizedProjectError(issuesQuery.error, isArabic)} />}
          {actionsQuery.isLoading && <SectionMessage title={t.actions} isArabic={isArabic} kind="loading" />}
          {actionsQuery.error && <SectionMessage title={t.actions} isArabic={isArabic} kind="error" detail={getLocalizedProjectError(actionsQuery.error, isArabic)} />}
          {setupQuery.data && !data.portfolios.length && !data.programs.length && !data.projects.length && <SectionMessage title={isArabic ? "إعداد المحفظة والبرنامج" : "Portfolio and program setup"} isArabic={isArabic} kind="empty" />}
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <Metric label={t.portfolios} value={data.portfolios.length} />
          <Metric label={t.programs} value={data.programs.length} />
          <Metric label={t.projects} value={data.projects.length} />
          <Metric label={t.risks} value={openRisks.length} />
          <Metric label={t.issues} value={openIssues.length} />
          <Metric label={t.actions} value={openActions.length} />
        </div>

        <SectionErrorBoundary title={exceptionCopy.title} isArabic={isArabic}>
        {exceptionsQuery.isLoading ? <div className="mt-6"><SectionMessage title={exceptionCopy.title} isArabic={isArabic} kind="loading" /></div> : exceptionsQuery.error || !exceptionsQuery.data ? <div className="mt-6"><SectionMessage title={exceptionCopy.title} isArabic={isArabic} kind="error" /></div> : <section className="mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card shadow-sm" aria-label={exceptionCopy.title}>
          <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border p-5"><div><div className="flex items-center gap-2"><CircleAlert className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold text-foreground">{exceptionCopy.title}</h2></div><p className="mt-1 text-sm text-muted-foreground">{exceptionCopy.sub}</p></div><span className="rounded-full bg-primary/10 px-3 py-1 text-sm font-semibold text-primary">{todayExceptions.length}</span></div>
          {todayExceptions.length ? <div className="grid gap-3 p-5 md:grid-cols-2 xl:grid-cols-3">{todayExceptions.slice(0, 12).map(exception => <article key={exception.id} className={`rounded-[var(--radius-md)] border p-4 ${exception.severity === "critical" ? "border-red-200 bg-red-50/70" : "border-amber-200 bg-amber-50/70"}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{exception.projectCode}</p><h3 className="mt-1 font-semibold text-foreground">{exceptionLabel(exception.label)}</h3></div><span className={`rounded-full px-2 py-1 text-xs font-semibold ${exception.severity === "critical" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{exception.severity === "critical" ? exceptionCopy.critical : exceptionCopy.warning}</span></div><p className="mt-3 text-sm font-medium text-foreground">{exception.detail}</p><p className="mt-1 text-xs text-muted-foreground">{exception.projectName}{exception.dueAt ? ` · ${new Date(exception.dueAt).toLocaleDateString(isArabic ? "ar-SA" : "en-GB")}` : ""}</p></article>)}</div> : <p className="p-5 text-sm text-muted-foreground">{exceptionCopy.empty}</p>}
        </section>}
        </SectionErrorBoundary>

        <SectionErrorBoundary title={planningCopy.title} isArabic={isArabic}>
        {planningQuery.isLoading ? <div className="mt-6"><SectionMessage title={planningCopy.title} isArabic={isArabic} kind="loading" /></div> : planningQuery.error || !planningQuery.data ? <div className="mt-6"><SectionMessage title={planningCopy.title} isArabic={isArabic} kind="error" /></div> : <section className="mt-6 overflow-hidden rounded-[var(--radius-lg)] border border-border bg-card shadow-sm" aria-label={planningCopy.title}>
          <div className="flex flex-col gap-4 border-b border-border p-5 lg:flex-row lg:items-end lg:justify-between">
            <div><div className="flex items-center gap-2"><Clock3 className="h-5 w-5 text-primary" /><h2 className="text-lg font-semibold text-foreground">{planningCopy.title}</h2></div><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{planningCopy.sub}</p></div>
            <Label className="w-full text-sm font-medium lg:w-52">{t.projects}<select value={planningFilter} onChange={event => setPlanningFilter(event.target.value as typeof planningFilter)} className={field}><option value="attention">{planningCopy.attention}</option><option value="all">{planningCopy.all}</option><option value="data_required">{planningCopy.dataRequired}</option></select></Label>
          </div>
          <div className="grid gap-px border-b border-border bg-border sm:grid-cols-4"><PlanningMetric label={t.projects} value={planningOverview.summary.totalProjects} /><PlanningMetric label={planningCopy.critical} value={planningOverview.summary.criticalProjects} tone="critical" /><PlanningMetric label={planningCopy.warning} value={planningOverview.summary.warningProjects} tone="warning" /><PlanningMetric label={planningCopy.delayed} value={planningOverview.summary.delayedProjects} tone="critical" /></div>
          <div className="overflow-x-auto"><div className="min-w-[820px]"><div className="grid grid-cols-[1.4fr_.8fr_.8fr_.8fr_2fr] gap-3 bg-muted/50 px-5 py-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground"><span>{t.project}</span><span>{planningCopy.evm}</span><span>{planningCopy.health}</span><span>{planningCopy.finish}</span><span>{planningCopy.signals}</span></div>{planningProjects.length ? planningProjects.map(project => <div key={project.id} className="grid grid-cols-[1.4fr_.8fr_.8fr_.8fr_2fr] items-center gap-3 border-t border-border px-5 py-4 text-sm"><div><p className="font-semibold text-foreground">{project.code} · {project.name}</p><p className="mt-1 text-xs text-muted-foreground">{project.lifecycleStage} · {project.status}</p></div><div><p className="font-semibold text-foreground">{project.evm?.spi !== null && project.evm?.spi !== undefined ? `SPI ${project.evm.spi.toFixed(2)}` : "—"}</p><p className="text-xs text-muted-foreground">{project.evm?.cpi !== null && project.evm?.cpi !== undefined ? `CPI ${project.evm.cpi.toFixed(2)}` : planningCopy.dataRequired}</p></div><div><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${project.health?.status === "red" ? "bg-red-100 text-red-800" : project.health?.status === "amber" ? "bg-amber-100 text-amber-800" : project.health?.status === "green" ? "bg-emerald-100 text-emerald-800" : "bg-slate-100 text-slate-700"}`}>{project.health?.status ? project.health.status.toUpperCase() : "—"}</span></div><div><p className="font-semibold text-foreground">{project.finishVarianceDays !== null ? project.finishVarianceDays > 0 ? `+${project.finishVarianceDays} ${planningCopy.daysLate}` : planningCopy.onTrack : planningCopy.noForecast}</p><p className="text-xs text-muted-foreground">{project.forecastFinishAt ? new Date(project.forecastFinishAt).toLocaleDateString(isArabic ? "ar-SA" : "en-GB") : planningCopy.currentForecast}</p></div><div className="flex flex-wrap gap-1.5">{project.signals.length ? project.signals.map(signal => <span key={signal} className="inline-flex rounded-full bg-muted px-2 py-1 text-xs font-medium text-muted-foreground">{signalLabel(signal)}</span>) : <span className="inline-flex rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-800">{planningCopy.onTrack}</span>}</div></div>) : <div className="px-5 py-8 text-sm text-muted-foreground">{planningCopy.empty}</div>}</div></div>
          <p className="flex items-center gap-2 border-t border-border bg-muted/30 px-5 py-3 text-xs text-muted-foreground"><CircleAlert className="h-4 w-4 text-primary" />SPI &lt; 0.90 / CPI &lt; 0.90 = {planningCopy.critical}; SPI أو CPI بين 0.90 و0.94 = {planningCopy.warning}.</p>
        </section>}
        {planningQuery.data && planningOverview.summary.dataRequiredProjects > 0 && <div className="mt-3"><SectionMessage title={planningCopy.title} isArabic={isArabic} kind="partial" detail={planningCopy.partial} /></div>}
        </SectionErrorBoundary>

        <SectionErrorBoundary title={isArabic ? "إعداد المحافظ والبرامج" : "Portfolio and program setup"} isArabic={isArabic}>
        <details className="mt-6 rounded-[var(--radius-lg)] border border-border bg-card shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4 text-sm font-semibold text-foreground marker:content-none"><span>{isArabic ? "إعداد المحافظ والبرامج" : "Portfolio & program setup"}</span><span className="text-xs font-medium text-primary">+</span></summary>
        <div className="grid gap-6 border-t border-border p-5 xl:grid-cols-2">
          <Card><CardHeader><CardTitle>{t.addPortfolio}</CardTitle></CardHeader><CardContent><form className="grid gap-3 sm:grid-cols-2" onSubmit={submitPortfolio}><Label>{t.code}<Input required value={portfolioForm.code} onChange={event => setPortfolioForm({ ...portfolioForm, code: event.target.value })} /></Label><Label>{t.titleLabel}<Input required value={portfolioForm.name} onChange={event => setPortfolioForm({ ...portfolioForm, name: event.target.value })} /></Label><div className="sm:col-span-2"><Button disabled={portfolioMutation.isPending}>{portfolioMutation.isPending ? t.saving : t.create}</Button>{portfolioMutation.error && <p role="alert" className="mt-2 text-sm text-red-700">{getLocalizedProjectError(portfolioMutation.error, isArabic)}</p>}{portfolioMutation.isSuccess && <p role="status" className="mt-2 text-sm text-emerald-700">{t.masterSuccess}</p>}</div></form></CardContent></Card>
          <Card><CardHeader><CardTitle>{t.addProgram}</CardTitle></CardHeader><CardContent><form className="grid gap-3 sm:grid-cols-2" onSubmit={submitProgram}><Label>{t.optionalPortfolio}<select value={programForm.portfolioId} onChange={event => setProgramForm({ ...programForm, portfolioId: event.target.value })} className={field}><option value="">{t.selectPortfolio}</option>{data.portfolios.map(portfolio => <option key={portfolio.id} value={portfolio.id}>{portfolio.code} · {portfolio.name}</option>)}</select></Label><Label>{t.code}<Input required value={programForm.code} onChange={event => setProgramForm({ ...programForm, code: event.target.value })} /></Label><Label className="sm:col-span-2">{t.titleLabel}<Input required value={programForm.name} onChange={event => setProgramForm({ ...programForm, name: event.target.value })} /></Label><div className="sm:col-span-2"><Button disabled={programMutation.isPending}>{programMutation.isPending ? t.saving : t.create}</Button>{programMutation.error && <p role="alert" className="mt-2 text-sm text-red-700">{getLocalizedProjectError(programMutation.error, isArabic)}</p>}{programMutation.isSuccess && <p role="status" className="mt-2 text-sm text-emerald-700">{t.masterSuccess}</p>}</div></form></CardContent></Card>
        </div>

        <Card className="border-t-0 shadow-none"><CardHeader><CardTitle>{t.linkProject}</CardTitle></CardHeader><CardContent><form className="grid gap-3 sm:grid-cols-3" onSubmit={submitProjectLink}><Label>{t.project}<select required value={projectLinkForm.projectId} onChange={event => setProjectLinkForm({ ...projectLinkForm, projectId: event.target.value })} className={field}><option value="">{t.select}</option>{data.projects.map(project => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select></Label><Label>{t.program}<select value={projectLinkForm.programId} onChange={event => setProjectLinkForm({ ...projectLinkForm, programId: event.target.value })} className={field}><option value="">{t.selectProgram}</option>{data.programs.map(program => <option key={program.id} value={program.id}>{program.code} · {program.name}</option>)}</select></Label><Label>{t.optionalPortfolio}<select value={projectLinkForm.portfolioId} onChange={event => setProjectLinkForm({ ...projectLinkForm, portfolioId: event.target.value })} className={field}><option value="">{t.selectPortfolio}</option>{data.portfolios.map(portfolio => <option key={portfolio.id} value={portfolio.id}>{portfolio.code} · {portfolio.name}</option>)}</select></Label><div className="sm:col-span-3"><Button disabled={projectLinkMutation.isPending || !data.projects.length}>{projectLinkMutation.isPending ? t.saving : t.link}</Button>{projectLinkMutation.error && <p role="alert" className="mt-2 text-sm text-red-700">{getLocalizedProjectError(projectLinkMutation.error, isArabic)}</p>}{projectLinkMutation.isSuccess && <p role="status" className="mt-2 text-sm text-emerald-700">{t.linkSuccess}</p>}</div></form></CardContent></Card></details>
        </SectionErrorBoundary>

        <SectionErrorBoundary title={isArabic ? "روابط الضوابط المحكومة" : "Governed control links"} isArabic={isArabic}>
          <PmoControlLinks tenantId={tenantId} projects={data.projects} records={[...openRisks.map(item => ({ id: item.id, projectId: item.projectId, type: "risk" as const, label: `${item.code} · ${item.title}` })), ...openIssues.map(item => ({ id: item.id, projectId: item.projectId, type: "issue" as const, label: `${item.code} · ${item.title}` })), ...openActions.filter(item => item.projectId).map(item => ({ id: item.id, projectId: item.projectId, type: "action" as const, label: item.title })), ...data.decisions.filter(item => item.projectId && !["implemented", "rejected"].includes(item.status)).map(item => ({ id: item.id, projectId: item.projectId, type: "decision" as const, label: item.problem })), ...data.rfis.filter(item => item.status !== "closed").map(item => ({ id: item.id, projectId: item.projectId, type: "rfi" as const, label: `${item.rfiNumber} · ${item.subject}` })), ...data.ncrs.filter(item => item.status !== "closed").map(item => ({ id: item.id, projectId: item.projectId, type: "ncr" as const, label: `${item.ncrNumber} · ${item.title}` }))]} />
        </SectionErrorBoundary>

        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <Card>
            <CardHeader><CardTitle>{t.addRisk}</CardTitle></CardHeader>
            <CardContent>
              <form className="grid gap-3" onSubmit={submitRisk}>
                <Label>{t.project}{projectSelect(riskForm.projectId, projectId => setRiskForm({ ...riskForm, projectId }))}</Label>
                <Label>{t.code}<Input value={riskForm.code} required onChange={event => setRiskForm({ ...riskForm, code: event.target.value })} /></Label>
                <Label>{t.titleLabel}<Input value={riskForm.title} required onChange={event => setRiskForm({ ...riskForm, title: event.target.value })} /></Label>
                <div className="grid grid-cols-2 gap-3">
                  <Label>{t.probability}<Input type="number" min="1" max="5" value={riskForm.probability} onChange={event => setRiskForm({ ...riskForm, probability: event.target.value })} /></Label>
                  <Label>{t.severity}<Input type="number" min="1" max="5" value={riskForm.severity} onChange={event => setRiskForm({ ...riskForm, severity: event.target.value })} /></Label>
                </div>
                <Button disabled={!data.projects.length || riskMutation.isPending}>{riskMutation.isPending ? t.saving : t.save}</Button>
                {riskMutation.error && <p className="text-sm text-red-700">{getLocalizedProjectError(riskMutation.error, isArabic)}</p>}
                {riskMutation.isSuccess && <p className="text-sm text-emerald-700">{t.success}</p>}
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t.addIssue}</CardTitle></CardHeader>
            <CardContent>
              <form className="grid gap-3" onSubmit={submitIssue}>
                <Label>{t.project}{projectSelect(issueForm.projectId, projectId => setIssueForm({ ...issueForm, projectId }))}</Label>
                <Label>{t.code}<Input value={issueForm.code} required onChange={event => setIssueForm({ ...issueForm, code: event.target.value })} /></Label>
                <Label>{t.titleLabel}<Input value={issueForm.title} required onChange={event => setIssueForm({ ...issueForm, title: event.target.value })} /></Label>
                <Label>{t.priority}{prioritySelect(issueForm.priority, priority => setIssueForm({ ...issueForm, priority }))}</Label>
                <Label>{t.dueDate}<Input type="date" value={issueForm.dueAt} onChange={event => setIssueForm({ ...issueForm, dueAt: event.target.value })} /></Label>
                <Button disabled={!data.projects.length || issueMutation.isPending}>{issueMutation.isPending ? t.saving : t.save}</Button>
                {issueMutation.error && <p className="text-sm text-red-700">{getLocalizedProjectError(issueMutation.error, isArabic)}</p>}
                {issueMutation.isSuccess && <p className="text-sm text-emerald-700">{t.success}</p>}
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>{t.addAction}</CardTitle></CardHeader>
            <CardContent>
              <form className="grid gap-3" onSubmit={submitAction}>
                <Label>{t.project}{projectSelect(actionForm.projectId, projectId => setActionForm({ ...actionForm, projectId }))}</Label>
                <Label>{t.actionTitle}<Input value={actionForm.title} required onChange={event => setActionForm({ ...actionForm, title: event.target.value })} /></Label>
                <Label>{t.priority}{prioritySelect(actionForm.priority, priority => setActionForm({ ...actionForm, priority }))}</Label>
                <Label>{t.dueDate}<Input type="date" value={actionForm.dueAt} onChange={event => setActionForm({ ...actionForm, dueAt: event.target.value })} /></Label>
                <Button disabled={!data.projects.length || actionMutation.isPending}>{actionMutation.isPending ? t.saving : t.save}</Button>
                {actionMutation.error && <p className="text-sm text-red-700">{getLocalizedProjectError(actionMutation.error, isArabic)}</p>}
                {actionMutation.isSuccess && <p className="text-sm text-emerald-700">{t.success}</p>}
              </form>
            </CardContent>
          </Card>
        </div>

        {!data.projects.length && <p className="mt-4 text-sm text-amber-700">{t.unavailable}</p>}

        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <SectionErrorBoundary title={t.risks} isArabic={isArabic}>{risksQuery.isLoading ? <SectionMessage title={t.risks} isArabic={isArabic} kind="loading" /> : risksQuery.error || !risksQuery.data ? <SectionMessage title={t.risks} isArabic={isArabic} kind="error" detail={risksQuery.error ? getLocalizedProjectError(risksQuery.error, isArabic) : undefined} /> : <Register icon={ShieldAlert} title={t.risks} items={openRisks.map(item => `${item.code} · ${item.title}`)} empty={t.noData} isArabic={isArabic} />}</SectionErrorBoundary>
          <SectionErrorBoundary title={t.issues} isArabic={isArabic}>{issuesQuery.isLoading ? <SectionMessage title={t.issues} isArabic={isArabic} kind="loading" /> : issuesQuery.error || !issuesQuery.data ? <SectionMessage title={t.issues} isArabic={isArabic} kind="error" detail={issuesQuery.error ? getLocalizedProjectError(issuesQuery.error, isArabic) : undefined} /> : <Register icon={TriangleAlert} title={t.issues} items={openIssues.map(item => {
            const next = nextEscalation(item.escalationStatus);
            const eligible = item.priority === "critical";
            return <div key={item.id} className="space-y-2"><p>{item.code} · {item.title} · {priorityLabel(item.priority)}</p><p className="text-xs text-slate-600">{t.escalation}: {escalationLabel(item.escalationStatus)}</p>{eligible && next && <Button size="sm" variant="outline" disabled={issueEscalationMutation.isPending} onClick={() => issueEscalationMutation.mutate({ tenantId, projectId: item.projectId, issueId: item.id, nextStatus: next })}>{next === "pending" ? t.requestEscalation : t.confirmEscalation}</Button>}</div>;
          })} empty={t.noData} isArabic={isArabic} />}</SectionErrorBoundary>
          <SectionErrorBoundary title={t.actions} isArabic={isArabic}>{actionsQuery.isLoading ? <SectionMessage title={t.actions} isArabic={isArabic} kind="loading" /> : actionsQuery.error || !actionsQuery.data ? <SectionMessage title={t.actions} isArabic={isArabic} kind="error" detail={actionsQuery.error ? getLocalizedProjectError(actionsQuery.error, isArabic) : undefined} /> : <Register icon={CheckSquare} title={t.actions} items={openActions.map(item => {
            const next = nextEscalation(item.escalationStatus);
            const overdue = item.dueAt !== null && item.dueAt < new Date();
            const projectId = item.projectId;
            return <div key={item.id} className="space-y-2"><p>{item.title} · {priorityLabel(item.priority)}</p><p className="text-xs text-slate-600">{t.escalation}: {escalationLabel(item.escalationStatus)}</p>{projectId && overdue && next && <Button size="sm" variant="outline" disabled={actionEscalationMutation.isPending} onClick={() => actionEscalationMutation.mutate({ tenantId, projectId, actionId: item.id, nextStatus: next })}>{next === "pending" ? t.requestEscalation : t.confirmEscalation}</Button>}</div>;
          })} empty={t.noData} isArabic={isArabic} />}</SectionErrorBoundary>
        </div>
        {(issueEscalationMutation.error || actionEscalationMutation.error) && <p role="alert" className="mt-4 text-sm text-red-700">{getLocalizedProjectError(issueEscalationMutation.error ?? actionEscalationMutation.error, isArabic)}</p>}
        {(issueEscalationMutation.isSuccess || actionEscalationMutation.isSuccess) && <p role="status" className="mt-4 text-sm text-emerald-700">{t.escalationSuccess}</p>}
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  const { isArabic } = useLanguage();
  return <SectionErrorBoundary title={label} isArabic={isArabic}><Card><CardContent className="p-5"><FolderTree className="h-5 w-5 text-[#0e6b70]" /><p className="mt-5 text-xs font-bold tracking-[.12em] text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></CardContent></Card></SectionErrorBoundary>;
}

function PlanningMetric({ label, value, tone = "default" }: { label: string; value: number; tone?: "default" | "critical" | "warning" }) {
  const color = tone === "critical" ? "text-red-700" : tone === "warning" ? "text-amber-700" : "text-foreground";
  return <div className="bg-card px-5 py-4"><p className="text-xs font-medium text-muted-foreground">{label}</p><p className={`mt-1 text-2xl font-semibold ${color}`}>{value}</p></div>;
}

function Register({ icon: Icon, title, items, empty, isArabic }: { icon: typeof ShieldAlert; title: string; items: React.ReactNode[]; empty: string; isArabic: boolean }) {
  if (!items.length) return <SectionMessage title={title} isArabic={isArabic} kind="empty" detail={empty} />;
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Icon className="h-5 w-5 text-[#0e6b70]" />{title}</CardTitle></CardHeader><CardContent className="space-y-3">{items.map((item, index) => <div key={index} className="rounded-xl bg-slate-50 p-4 text-sm font-medium">{item}</div>)}</CardContent></Card>;
}
