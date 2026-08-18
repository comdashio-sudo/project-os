import { LanguageToggle } from "@/components/LanguageToggle";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { localizedHealthException, parseStoredHealthExceptions, parseStoredHealthSources } from "@/lib/healthPresentation";
import { trpc } from "@/lib/trpc";
import { ProjectContracts } from "./ProjectContracts";
import { ProjectDocuments } from "./ProjectDocuments";
import { ProjectRfis } from "./ProjectRfis";
import { ProjectNcrs } from "./ProjectNcrs";
import { ProjectHse } from "./ProjectHse";
import { ProjectChanges } from "./ProjectChanges";
import { ProjectNotifications } from "./ProjectNotifications";
import { ProjectResources } from "./ProjectResources";
import { ProjectClaims } from "./ProjectClaims";
import { ProjectAdvisor } from "./ProjectAdvisor";
import { ProjectImports } from "./ProjectImports";
import { ProjectDataExport } from "./ProjectDataExport";
import { Activity, ArrowLeft, Banknote, CalendarDays, Calculator, CheckCircle2, ClipboardList, HeartPulse, Plus, TrendingUp } from "lucide-react";
import React, { useState } from "react";
import { Link, useParams } from "wouter";

const today = new Date().toISOString().slice(0, 10);

export default function ProjectControls() {
  const { tenantId, projectId } = useParams<{ tenantId: string; projectId: string }>();
  const { isArabic } = useLanguage();
  const controls = trpc.projects.getControls.useQuery({ tenantId, projectId });
  const refresh = () => controls.refetch();
  const createWbs = trpc.wbs.create.useMutation({ onSuccess: refresh });
  const createActivity = trpc.activities.create.useMutation({ onSuccess: refresh });
  const createBudget = trpc.budgets.create.useMutation({ onSuccess: refresh });
  const createCost = trpc.costs.createActual.useMutation({ onSuccess: refresh });
  const createProgress = trpc.progress.create.useMutation({ onSuccess: refresh });
  const saveEvm = trpc.controls.saveEvmSnapshot.useMutation({ onSuccess: refresh });
  const captureOperationalEvm = trpc.controls.captureOperationalEvmSnapshot.useMutation({ onSuccess: refresh });
  const captureProjectHealth = trpc.controls.captureProjectHealthSnapshot.useMutation({ onSuccess: refresh });

  const [wbs, setWbs] = useState({ code: "", name: "", plannedValue: "" });
  const [activity, setActivity] = useState({ wbsItemId: "project", code: "", name: "", plannedValue: "", plannedStartAt: today, plannedFinishAt: today });
  const [budget, setBudget] = useState({ wbsItemId: "project", costCode: "", originalAmount: "", currentAmount: "" });
  const [cost, setCost] = useState({ wbsItemId: "project", amount: "", incurredAt: today });
  const [progress, setProgress] = useState({ wbsItemId: "", percentComplete: "", reportedAt: today });
  const [evm, setEvm] = useState({ periodAt: today, pv: "", ev: "", ac: "", bac: "", eacMethod: "bac_over_cpi" as const });
  const [operationalPeriod, setOperationalPeriod] = useState(today);
  const [healthPeriod, setHealthPeriod] = useState(today);

  const t = isArabic
    ? {
        registry: "سجل المشاريع", level: "المستوى 3 · تسليم المشروع", loading: "جارٍ تحميل ضوابط المشروع…", project: "المشروع", title: "لوحة تسليم المشروع", subtitle: "سجل البيانات التشغيلية أولاً، ثم احفظ لقطة EVM موثقة وقابلة للتدقيق.", wbs: "هيكل تجزئة العمل", activities: "الأنشطة والجدولة", budget: "الميزانية", cost: "التكلفة الفعلية", progress: "التقدم", snapshot: "لقطة EVM", health: "صحة المشروع", healthNote: "تستخدم اللقطة أحدث EVM والمخاطر عالية التعرض والإجراءات وطلبات المعلومات وحالات عدم المطابقة المتأخرة. لا توجد بعد مصادر للموافقات، ولذلك تدخل بقيم صفرية معلنة.", captureHealth: "حساب وحفظ لقطة الصحة", healthPending: "جارٍ حساب الصحة…", healthExceptions: "استثناءات الصحة وخطط التعافي", score: "الدرجة", confidence: "الثقة", highRisks: "مخاطر عالية", overdueActions: "إجراءات متأخرة", overdueRfis: "طلبات معلومات متأخرة", overdueNcrs: "حالات عدم مطابقة متأخرة", noHealth: "لا توجد لقطة صحة محفوظة حتى الآن.", code: "الرمز", name: "الاسم", planned: "القيمة المخططة", start: "البداية المخططة", finish: "النهاية المخططة", addWbs: "إضافة بند WBS", addActivity: "جدولة نشاط", activityLink: "ربط WBS (اختياري)", noActivities: "لا توجد أنشطة مجدولة حتى الآن.", notStarted: "لم يبدأ", inProgress: "قيد التنفيذ", completed: "مكتمل", blocked: "متعثر", costCode: "رمز التكلفة", original: "الميزانية الأصلية", current: "الميزانية الحالية", link: "ربط WBS", projectLevel: "على مستوى المشروع", addBudget: "تسجيل بند الميزانية", amount: "القيمة", date: "التاريخ", addCost: "تسجيل تكلفة فعلية", percent: "نسبة الإنجاز", addProgress: "تسجيل التقدم", pv: "PV القيمة المخططة", ev: "EV القيمة المكتسبة", ac: "AC التكلفة الفعلية", bac: "BAC الميزانية عند الإتمام", save: "حفظ لقطة EVM", latest: "أحدث لقطة", noSnapshot: "لا توجد لقطة EVM محفوظة حتى الآن.", emptyWbs: "أضف بند WBS أولًا لربط الميزانيات والتكاليف والتقدم.", entries: "القيود المسجلة", noEntries: "لا توجد قيود تشغيلية حتى الآن.", submitting: "جارٍ الحفظ…", actual: "فعلي", recorded: "مسجل", captureNote: "تدخل قيم لقطة EVM يدويًا في هذه الدفعة. لا تدّعي الواجهة أنها محسوبة من سجلات التشغيل قبل اكتمال محرك التجميع.", cpi: "CPI", spi: "SPI", eac: "EAC", vac: "VAC",
      }
    : {
        registry: "Project registry", level: "Level 3 · Project Delivery", loading: "Loading project controls…", project: "Project", title: "Project delivery board", subtitle: "Record operational data first, then save a traceable EVM snapshot.", wbs: "Work breakdown structure", activities: "Activities & schedule", budget: "Budget", cost: "Actual cost", progress: "Progress", snapshot: "EVM snapshot", health: "Project health", healthNote: "This snapshot uses the latest EVM, high-exposure risks, overdue actions, overdue RFIs, and overdue NCRs. Approval sources do not exist yet, so they enter as explicit zero values.", captureHealth: "Calculate and save health snapshot", healthPending: "Calculating health…", healthExceptions: "Health exceptions & recovery plans", score: "Score", confidence: "Confidence", highRisks: "High-exposure risks", overdueActions: "Overdue actions", overdueRfis: "Overdue RFIs", overdueNcrs: "Overdue NCRs", noHealth: "No project-health snapshot has been saved yet.", code: "Code", name: "Name", planned: "Planned value", start: "Planned start", finish: "Planned finish", addWbs: "Add WBS item", addActivity: "Schedule activity", activityLink: "Link WBS (optional)", noActivities: "No activities have been scheduled yet.", notStarted: "Not started", inProgress: "In progress", completed: "Completed", blocked: "Blocked", costCode: "Cost code", original: "Original budget", current: "Current budget", link: "Link WBS", projectLevel: "Project level", addBudget: "Record budget line", amount: "Amount", date: "Date", addCost: "Record actual cost", percent: "Percent complete", addProgress: "Record progress", pv: "PV planned value", ev: "EV earned value", ac: "AC actual cost", bac: "BAC at completion", save: "Save EVM snapshot", latest: "Latest snapshot", noSnapshot: "No EVM snapshot has been saved yet.", emptyWbs: "Add a WBS item first to link budgets, costs, and progress.", entries: "Recorded entries", noEntries: "No operational entries yet.", submitting: "Saving…", actual: "Actual", recorded: "Recorded", captureNote: "EVM snapshot values are entered manually in this batch. The interface does not claim they are calculated from operational records until the aggregation engine is complete.", cpi: "CPI", spi: "SPI", eac: "EAC", vac: "VAC",
      };

  const operational = isArabic
    ? { title: "التقاط EVM محسوب", note: "تحسب PV من الأنشطة المجدولة حتى التاريخ المحدد، وEV من أحدث تقدم مُرسل لكل بند WBS، وAC من قيود التكلفة الفعلية المُرحّلة، وBAC من بنود الميزانية الحالية.", capture: "حساب وحفظ لقطة تشغيلية", sources: "مصادر اللقطة", activities: "أنشطة مجدولة", budgets: "بنود الميزانية", actualCosts: "قيود تكلفة فعلية", progress: "تقدم WBS", period: "تاريخ القطع" }
    : { title: "Calculated EVM capture", note: "PV is derived from scheduled activities through the selected date, EV from the latest submitted progress for each WBS item, AC from posted actual-cost entries, and BAC from current budget lines.", capture: "Calculate and save operational snapshot", sources: "Snapshot sources", activities: "Scheduled activities", budgets: "Budget lines", actualCosts: "Posted actual-cost entries", progress: "WBS progress", period: "Cut-off date" };

  if (controls.isLoading) return <main className="min-h-screen bg-[#f4f6f8] p-8 text-slate-500">{t.loading}</main>;
  if (controls.error || !controls.data) return <main className="min-h-screen bg-[#f4f6f8] p-8 text-red-700">{getLocalizedProjectError(controls.error, isArabic)}</main>;

  const data = controls.data;
  const latestHealthExceptions = data.latestHealth ? parseStoredHealthExceptions(data.latestHealth.exceptions) : [];
  const latestHealthSources = data.latestHealth ? parseStoredHealthSources(data.latestHealth.drivers) : { overdueRfiCount: 0, overdueNcrCount: 0, overdueHseCount: 0 };
  const disabled = createWbs.isPending || createActivity.isPending || createBudget.isPending || createCost.isPending || createProgress.isPending || saveEvm.isPending || captureOperationalEvm.isPending || captureProjectHealth.isPending;
  const apiError = createWbs.error ?? createActivity.error ?? createBudget.error ?? createCost.error ?? createProgress.error ?? saveEvm.error ?? captureOperationalEvm.error ?? captureProjectHealth.error;
  const statusLabel = (status: string) => {
    const labels: Record<string, string> = { not_started: t.notStarted, in_progress: t.inProgress, completed: t.completed, blocked: t.blocked };
    return labels[status] ?? status;
  };
  const healthStatusLabel = (status: string) => ({ green: isArabic ? "أخضر" : "Green", amber: isArabic ? "كهرماني" : "Amber", red: isArabic ? "أحمر" : "Red" }[status] ?? status);
  const healthConfidenceLabel = (confidence: string) => ({ low: isArabic ? "منخفضة" : "Low", medium: isArabic ? "متوسطة" : "Medium", high: isArabic ? "مرتفعة" : "High" }[confidence] ?? confidence);
  const dateLabel = (value: Date | string | null) => value ? new Intl.DateTimeFormat(isArabic ? "ar" : "en", { dateStyle: "medium" }).format(new Date(value)) : "—";

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <Link href={`/projects/${tenantId}`} className="inline-flex items-center gap-2 text-sm font-semibold text-[#0e6b70]"><ArrowLeft className="h-4 w-4" />{t.registry}</Link>
          <div className="flex items-center gap-3"><span className="text-sm text-slate-500">{t.level}</span><LanguageToggle /></div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-8">
        <section className="rounded-3xl bg-[#123a4a] p-7 text-white">
          <p className="text-xs font-bold tracking-[.16em] text-[#74d0c1]">{t.project} · {data.project.code}</p>
          <h1 className="mt-2 text-3xl font-semibold">{data.project.name}</h1>
          <p className="mt-3 max-w-3xl text-slate-300">{t.subtitle}</p>
        </section>

        {apiError && <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-700">{getLocalizedProjectError(apiError, isArabic)}</p>}

        <div className="mt-8 grid gap-6 xl:grid-cols-[1.15fr_.85fr]">
          <section className="space-y-6">
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <SectionHeading icon={ClipboardList} title={t.wbs} detail={`${data.wbs.length} ${t.recorded}`} />
              <form className="mt-5 grid gap-3 md:grid-cols-[.7fr_1.2fr_.8fr_auto]" onSubmit={event => { event.preventDefault(); createWbs.mutate({ tenantId, projectId, code: wbs.code, name: wbs.name, plannedValue: Number(wbs.plannedValue || 0) }); setWbs({ code: "", name: "", plannedValue: "" }); }}>
                <Input aria-label={t.code} placeholder={t.code} value={wbs.code} onChange={event => setWbs({ ...wbs, code: event.target.value })} required />
                <Input aria-label={t.name} placeholder={t.name} value={wbs.name} onChange={event => setWbs({ ...wbs, name: event.target.value })} required />
                <Input aria-label={t.planned} placeholder={t.planned} type="number" min="0" value={wbs.plannedValue} onChange={event => setWbs({ ...wbs, plannedValue: event.target.value })} />
                <Button disabled={disabled}><Plus className="me-1 h-4 w-4" />{createWbs.isPending ? t.submitting : t.addWbs}</Button>
              </form>
              {data.wbs.length ? <div className="mt-5 divide-y rounded-xl border">{data.wbs.map(item => <div key={item.id} className="flex items-center justify-between gap-4 p-4"><div><p className="font-semibold">{item.code} · {item.name}</p><p className="mt-1 text-xs text-slate-500">{t.planned}: {item.plannedValue}</p></div><Badge variant="secondary">{item.progressPercent}%</Badge></div>)}</div> : <p className="mt-5 text-sm text-slate-500">{t.emptyWbs}</p>}
            </section>

            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <SectionHeading icon={CalendarDays} title={t.activities} detail={`${data.activities.length} ${t.recorded}`} />
              <form className="mt-5 grid gap-3 md:grid-cols-2" onSubmit={event => { event.preventDefault(); createActivity.mutate({ tenantId, projectId, ...(activity.wbsItemId === "project" ? {} : { wbsItemId: activity.wbsItemId }), code: activity.code, name: activity.name, plannedValue: Number(activity.plannedValue || 0), plannedStartAt: new Date(`${activity.plannedStartAt}T00:00:00.000Z`), plannedFinishAt: new Date(`${activity.plannedFinishAt}T00:00:00.000Z`) }); setActivity({ wbsItemId: "project", code: "", name: "", plannedValue: "", plannedStartAt: today, plannedFinishAt: today }); }}>
                <Label className="md:col-span-2">{t.activityLink}<Select value={activity.wbsItemId} onValueChange={wbsItemId => setActivity({ ...activity, wbsItemId })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="project">{t.projectLevel}</SelectItem>{data.wbs.map(item => <SelectItem key={item.id} value={item.id}>{item.code} · {item.name}</SelectItem>)}</SelectContent></Select></Label>
                <Input aria-label={t.code} placeholder={t.code} value={activity.code} onChange={event => setActivity({ ...activity, code: event.target.value })} required />
                <Input aria-label={t.name} placeholder={t.name} value={activity.name} onChange={event => setActivity({ ...activity, name: event.target.value })} required />
                <Input aria-label={t.planned} placeholder={t.planned} type="number" min="0" value={activity.plannedValue} onChange={event => setActivity({ ...activity, plannedValue: event.target.value })} />
                <Label>{t.start}<Input className="mt-1" aria-label={t.start} type="date" value={activity.plannedStartAt} onChange={event => setActivity({ ...activity, plannedStartAt: event.target.value })} required /></Label>
                <Label>{t.finish}<Input className="mt-1" aria-label={t.finish} type="date" min={activity.plannedStartAt} value={activity.plannedFinishAt} onChange={event => setActivity({ ...activity, plannedFinishAt: event.target.value })} required /></Label>
                <Button className="md:col-span-2" disabled={disabled}><Plus className="me-1 h-4 w-4" />{createActivity.isPending ? t.submitting : t.addActivity}</Button>
              </form>
              {data.activities.length ? <div className="mt-5 divide-y rounded-xl border">{data.activities.map(item => <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><p className="font-semibold">{item.code} · {item.name}</p><p className="mt-1 text-xs text-slate-500">{dateLabel(item.plannedStartAt)} — {dateLabel(item.plannedFinishAt)}</p></div><Badge variant="secondary">{statusLabel(item.status)}</Badge></div>)}</div> : <p className="mt-5 text-sm text-slate-500">{t.noActivities}</p>}
            </section>

            <div className="grid gap-6 lg:grid-cols-2">
              <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><SectionHeading icon={Banknote} title={t.budget} /><form className="mt-5 space-y-3" onSubmit={event => { event.preventDefault(); createBudget.mutate({ tenantId, projectId, ...(budget.wbsItemId === "project" ? {} : { wbsItemId: budget.wbsItemId }), costCode: budget.costCode, originalAmount: Number(budget.originalAmount), currentAmount: Number(budget.currentAmount) }); setBudget({ wbsItemId: "project", costCode: "", originalAmount: "", currentAmount: "" }); }}><WbsSelect value={budget.wbsItemId} onChange={wbsItemId => setBudget({ ...budget, wbsItemId })} label={t.link} projectLabel={t.projectLevel} items={data.wbs} /><Input placeholder={t.costCode} value={budget.costCode} onChange={event => setBudget({ ...budget, costCode: event.target.value })} required /><Input placeholder={t.original} type="number" min="0" value={budget.originalAmount} onChange={event => setBudget({ ...budget, originalAmount: event.target.value })} required /><Input placeholder={t.current} type="number" min="0" value={budget.currentAmount} onChange={event => setBudget({ ...budget, currentAmount: event.target.value })} required /><Button className="w-full" disabled={disabled}>{createBudget.isPending ? t.submitting : t.addBudget}</Button></form></section>
              <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><SectionHeading icon={Activity} title={t.cost} /><form className="mt-5 space-y-3" onSubmit={event => { event.preventDefault(); createCost.mutate({ tenantId, projectId, ...(cost.wbsItemId === "project" ? {} : { wbsItemId: cost.wbsItemId }), amount: Number(cost.amount), incurredAt: new Date(`${cost.incurredAt}T00:00:00.000Z`) }); setCost({ wbsItemId: "project", amount: "", incurredAt: today }); }}><WbsSelect value={cost.wbsItemId} onChange={wbsItemId => setCost({ ...cost, wbsItemId })} label={t.link} projectLabel={t.projectLevel} items={data.wbs} /><Input placeholder={t.amount} type="number" min="0.01" step="0.01" value={cost.amount} onChange={event => setCost({ ...cost, amount: event.target.value })} required /><Input aria-label={t.date} type="date" value={cost.incurredAt} onChange={event => setCost({ ...cost, incurredAt: event.target.value })} required /><Button className="w-full" disabled={disabled}>{createCost.isPending ? t.submitting : t.addCost}</Button></form></section>
            </div>
          </section>

          <aside className="space-y-6">
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><SectionHeading icon={TrendingUp} title={t.progress} /><form className="mt-5 space-y-3" onSubmit={event => { event.preventDefault(); createProgress.mutate({ tenantId, projectId, wbsItemId: progress.wbsItemId, percentComplete: Number(progress.percentComplete), reportedAt: new Date(`${progress.reportedAt}T00:00:00.000Z`) }); setProgress({ wbsItemId: "", percentComplete: "", reportedAt: today }); }}><Select value={progress.wbsItemId} onValueChange={wbsItemId => setProgress({ ...progress, wbsItemId })} disabled={!data.wbs.length}><SelectTrigger><SelectValue placeholder={t.link} /></SelectTrigger><SelectContent>{data.wbs.map(item => <SelectItem key={item.id} value={item.id}>{item.code} · {item.name}</SelectItem>)}</SelectContent></Select><Input placeholder={t.percent} type="number" min="0" max="100" value={progress.percentComplete} onChange={event => setProgress({ ...progress, percentComplete: event.target.value })} required /><Input aria-label={t.date} type="date" value={progress.reportedAt} onChange={event => setProgress({ ...progress, reportedAt: event.target.value })} required /><Button className="w-full" disabled={disabled || !progress.wbsItemId}>{createProgress.isPending ? t.submitting : t.addProgress}</Button></form></section>
            <ProjectContracts tenantId={tenantId} projectId={projectId} />
            <ProjectDocuments tenantId={tenantId} projectId={projectId} />
            <ProjectRfis tenantId={tenantId} projectId={projectId} />
            <ProjectNcrs tenantId={tenantId} projectId={projectId} />
            <ProjectHse tenantId={tenantId} projectId={projectId} />
            <ProjectResources tenantId={tenantId} projectId={projectId} />
            <ProjectClaims tenantId={tenantId} projectId={projectId} />
            <ProjectAdvisor tenantId={tenantId} projectId={projectId} />
            <ProjectImports tenantId={tenantId} projectId={projectId} />
            <ProjectDataExport tenantId={tenantId} projectId={projectId} />
            <ProjectChanges tenantId={tenantId} projectId={projectId} />
            <ProjectNotifications tenantId={tenantId} />
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><SectionHeading icon={HeartPulse} title={t.health} /><p className="mt-4 text-xs leading-5 text-slate-500">{t.healthNote}</p><div className="mt-4 flex flex-wrap items-end gap-3"><Label className="flex-1">{operational.period}<Input className="mt-1" aria-label={t.health} type="date" value={healthPeriod} onChange={event => setHealthPeriod(event.target.value)} required /></Label><Button disabled={disabled} onClick={() => captureProjectHealth.mutate({ tenantId, projectId, periodAt: new Date(`${healthPeriod}T00:00:00.000Z`) })}>{captureProjectHealth.isPending ? t.healthPending : t.captureHealth}</Button></div>{captureProjectHealth.data ? <div className="mt-4 rounded-xl bg-[#e6f4f3] p-3 text-xs text-slate-700"><p>{t.score}: {captureProjectHealth.data.score} · {healthStatusLabel(captureProjectHealth.data.status)} · {t.confidence}: {healthConfidenceLabel(captureProjectHealth.data.confidence)}</p><p className="mt-1">{t.highRisks}: {captureProjectHealth.data.sources.highRiskCount} · {t.overdueActions}: {captureProjectHealth.data.sources.overdueActionCount} · {t.overdueRfis}: {captureProjectHealth.data.sources.overdueRfiCount} · {t.overdueNcrs}: {captureProjectHealth.data.sources.overdueNcrCount}</p></div> : data.latestHealth ? <div className="mt-4 rounded-xl bg-[#e6f4f3] p-3 text-xs text-slate-700"><p>{t.latest}: {t.score} {data.latestHealth.overallScore} · {healthStatusLabel(data.latestHealth.status)} · {t.confidence}: {healthConfidenceLabel(data.latestHealth.confidence)}</p><p className="mt-1">{t.overdueRfis}: {latestHealthSources.overdueRfiCount} · {t.overdueNcrs}: {latestHealthSources.overdueNcrCount}</p></div> : <p className="mt-4 text-sm text-slate-500">{t.noHealth}</p>}{latestHealthExceptions.length ? <div className="mt-4 space-y-2"><p className="text-xs font-semibold text-slate-600">{t.healthExceptions}</p>{latestHealthExceptions.map((item, index) => { const exception = localizedHealthException(item, isArabic); return <div key={`${item.code}-${index}`} className={exception.severity === "critical" ? "rounded-lg bg-red-50 p-3 text-xs text-red-800" : "rounded-lg bg-amber-50 p-3 text-xs text-amber-800"}><p className="font-semibold">{exception.message}</p><p className="mt-1">{exception.recommendation}</p></div>; })}</div> : null}</section>
            {data.latestHealth && <p className="rounded-xl bg-[#e6f4f3] p-3 text-xs text-slate-700">{isArabic ? "ملاحظات HSE متأخرة" : "Overdue HSE observations"}: {latestHealthSources.overdueHseCount}</p>}
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
              <SectionHeading icon={Calculator} title={t.snapshot} />
              <div className="mt-5 rounded-xl bg-[#e6f4f3] p-4">
                <h3 className="text-sm font-semibold text-[#0e6b70]">{operational.title}</h3>
                <p className="mt-2 text-xs leading-5 text-slate-600">{operational.note}</p>
                <div className="mt-3 flex flex-wrap items-end gap-3"><Label className="flex-1">{operational.period}<Input className="mt-1" type="date" value={operationalPeriod} onChange={event => setOperationalPeriod(event.target.value)} required /></Label><Button disabled={disabled} onClick={() => captureOperationalEvm.mutate({ tenantId, projectId, periodAt: new Date(`${operationalPeriod}T00:00:00.000Z`), eacMethod: "ac_plus_remaining" })}>{captureOperationalEvm.isPending ? t.submitting : operational.capture}</Button></div>
                {captureOperationalEvm.data && <div className="mt-3 text-xs text-slate-600"><p className="font-semibold">{operational.sources}</p><p>{operational.activities}: {captureOperationalEvm.data.sources.scheduledActivities} · {operational.budgets}: {captureOperationalEvm.data.sources.budgetLines}</p><p>{operational.actualCosts}: {captureOperationalEvm.data.sources.postedActualCostEntries} · {operational.progress}: {captureOperationalEvm.data.sources.wbsItemsWithProgress}</p></div>}
              </div>
              <p className="mt-5 text-xs leading-5 text-slate-500">{t.captureNote}</p>
              <form className="mt-5 grid grid-cols-2 gap-3" onSubmit={event => { event.preventDefault(); saveEvm.mutate({ tenantId, projectId, periodAt: new Date(`${evm.periodAt}T00:00:00.000Z`), pv: Number(evm.pv), ev: Number(evm.ev), ac: Number(evm.ac), bac: Number(evm.bac), eacMethod: evm.eacMethod }); }}><Input className="col-span-2" aria-label={t.date} type="date" value={evm.periodAt} onChange={event => setEvm({ ...evm, periodAt: event.target.value })} required /><Input placeholder={t.pv} type="number" min="0" value={evm.pv} onChange={event => setEvm({ ...evm, pv: event.target.value })} required /><Input placeholder={t.ev} type="number" min="0" value={evm.ev} onChange={event => setEvm({ ...evm, ev: event.target.value })} required /><Input placeholder={t.ac} type="number" min="0" value={evm.ac} onChange={event => setEvm({ ...evm, ac: event.target.value })} required /><Input placeholder={t.bac} type="number" min="0" value={evm.bac} onChange={event => setEvm({ ...evm, bac: event.target.value })} required /><Button className="col-span-2" disabled={disabled}>{saveEvm.isPending ? t.submitting : t.save}</Button></form>{data.latestEvm ? <div className="mt-5 rounded-xl bg-[#e6f4f3] p-4 text-sm"><div className="flex items-center gap-2 font-semibold text-[#0e6b70]"><CheckCircle2 className="h-4 w-4" />{t.latest}</div><div className="mt-3 grid grid-cols-4 gap-2 text-xs"><span>{t.cpi}: {data.latestEvm.cpi ?? "—"}</span><span>{t.spi}: {data.latestEvm.spi ?? "—"}</span><span>{t.eac}: {data.latestEvm.eac}</span><span>{t.vac}: {data.latestEvm.vac}</span></div></div> : <p className="mt-4 text-sm text-slate-500">{t.noSnapshot}</p>}{data.cashFlow && <div className="mt-4 rounded-xl bg-amber-50 p-4 text-sm text-amber-950"><p className="font-semibold">{isArabic ? "ملخص التدفق النقدي التشغيلي" : "Operational cash-flow summary"}</p><div className="mt-2 grid grid-cols-2 gap-2 text-xs"><span>{isArabic ? "الميزانية المخططة" : "Planned budget"}: {data.cashFlow.plannedBudget}</span><span>{isArabic ? "التكلفة الفعلية" : "Actual cost"}: {data.cashFlow.actualCost}</span><span>{isArabic ? "الالتزامات" : "Commitments"}: {data.cashFlow.committedAmount}</span><span>{isArabic ? "المتبقي" : "Remaining budget"}: {data.cashFlow.remainingBudget}</span></div></div>}</section>
            <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><h2 className="font-semibold">{t.entries}</h2>{data.costs.length || data.progress.length || data.budgets.length ? <div className="mt-4 space-y-2 text-sm">{data.costs.slice(0, 3).map(entry => <p key={entry.id} className="rounded-lg bg-slate-50 p-3">{t.actual}: {entry.amount} · {entry.status}</p>)}{data.progress.slice(0, 3).map(entry => <p key={entry.id} className="rounded-lg bg-slate-50 p-3">{t.progress}: {entry.progressPercent}% · {entry.status}</p>)}{data.budgets.slice(0, 3).map(entry => <p key={entry.id} className="rounded-lg bg-slate-50 p-3">{entry.costCode}: {entry.currentAmount}</p>)}</div> : <p className="mt-4 text-sm text-slate-500">{t.noEntries}</p>}</section>
          </aside>
        </div>
      </div>
    </main>
  );
}

function SectionHeading({ icon: Icon, title, detail }: { icon: typeof Activity; title: string; detail?: string }) {
  return <div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e6f4f3] text-[#0e6b70]"><Icon className="h-5 w-5" /></span><div><h2 className="font-semibold">{title}</h2>{detail && <p className="text-sm text-slate-500">{detail}</p>}</div></div>;
}

function WbsSelect({ value, onChange, label, projectLabel, items }: { value: string; onChange: (value: string) => void; label: string; projectLabel: string; items: Array<{ id: string; code: string; name: string }> }) {
  return <><Label>{label}</Label><Select value={value} onValueChange={onChange}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="project">{projectLabel}</SelectItem>{items.map(item => <SelectItem key={item.id} value={item.id}>{item.code} · {item.name}</SelectItem>)}</SelectContent></Select></>;
}
