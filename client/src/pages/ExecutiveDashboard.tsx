import { LanguageToggle } from "@/components/LanguageToggle";
import { OutsideShell, PageMain, PageHeader } from "@/components/pageFrame";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { GovernedProjectControlLink } from "@/components/GovernedProjectControlLink";
import { DashboardSectionReporter } from "@/components/DashboardSectionReporter";
import { SectionErrorBoundary, SectionMessage } from "@/components/SectionResilience";
import { lazy, Suspense } from "react";
import {
  ArrowLeft,
  BriefcaseBusiness,
  CircleAlert,
  Landmark,
  Scale,
} from "lucide-react";
import React, { FormEvent, useState } from "react";
import { Link, useParams } from "wouter";
import { PortfolioProfitability } from "./PortfolioProfitability";
import { enumLabel } from "@/lib/labels";
import { WriteGate } from "@/lib/permissions";
import { pickLanguage } from "@/lib/language";

const PortfolioCashFlowChart = lazy(() => import("./PortfolioCashFlowChart"));

export default function ExecutiveDashboard() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { isArabic, language } = useLanguage();
  const utils = trpc.useUtils();
  const metricsQuery = trpc.dashboards.executiveMetrics.useQuery({ tenantId });
  const projectsQuery = trpc.dashboards.executiveProjects.useQuery({ tenantId });
  const decisionsQuery = trpc.dashboards.executiveDecisions.useQuery({ tenantId });
  const cashFlowQuery = trpc.dashboards.executiveCashFlow.useQuery({ tenantId });
  const [form, setForm] = useState({
    projectId: "",
    problem: "",
    options: "",
    recommendation: "",
  });
  const mutation = trpc.executive.createDecision.useMutation({
    onSuccess: () => {
      setForm({ projectId: "", problem: "", options: "", recommendation: "" });
      utils.dashboards.invalidate();
    },
  });
  const t = pickLanguage(language, { ar: { notAssessed: "غير مقيَّم",
        back: "مساحة العمل",
        level: "المستوى 1 · القيادة التنفيذية",
        title: "نظرة القيادة",
        sub: "مؤشرات المحفظة والقرارات التي تتطلب انتباه الإدارة.",
        budget: "الميزانية الحالية",
        actual: "التكلفة الفعلية",
        forecast: "التوقع",
        projects: "المشاريع",
        decisions: "قرارات مفتوحة",
        attention: "محفظة الاهتمام",
        empty: "لا توجد بيانات محفظة متاحة ضمن نطاق الوصول الحالي.",
        loading: "جارٍ تحميل لوحة القيادة…",
        saving: "جارٍ حفظ مسودة القرار…",
        create: "تسجيل قرار",
        project: "المشروع",
        problem: "المشكلة أو القرار المطلوب",
        options: "الخيارات المتاحة",
        recommendation: "التوصية",
        select: "اختر مشروعًا",
        save: "حفظ مسودة القرار",
        success: "تم حفظ مسودة القرار.",
        noProjects:
          "أنشئ مشروعًا ضمن نطاقك أولًا حتى يمكن ربط القرار بسجل مشروع محدد.",
       projectOs: "PROJECT OS", projectProfitability: "ربحية المشاريع" }, en: { notAssessed: "Not assessed",
        back: "Workspace",
        level: "Level 1 · Executive Leadership",
        title: "Leadership view",
        sub: "Portfolio indicators and decisions requiring management attention.",
        budget: "Current budget",
        actual: "Actual cost",
        forecast: "Forecast",
        projects: "Projects",
        decisions: "Open decisions",
        attention: "Attention portfolio",
        empty: "No portfolio data is available in the current access scope.",
        loading: "Loading leadership dashboard…",
        saving: "Saving decision draft…",
        create: "Register decision",
        project: "Project",
        problem: "Problem or decision required",
        options: "Options",
        recommendation: "Recommendation",
        select: "Select a project",
        save: "Save decision draft",
        success: "Decision draft saved.",
        noProjects:
          "Create a project in your scope first so the decision can be linked to a specific project record.",
       projectOs: "PROJECT OS", projectProfitability: "Project profitability" }, ur: { notAssessed: "جانچا نہیں گیا",
        back: "ورک اسپیس",
        level: "سطح 1 · انتظامی قیادت",
        title: "قیادت کا منظر",
        sub: "پورٹ فولیو کے اشاریے اور وہ فیصلے جن پر انتظامیہ کی توجہ درکار ہے۔",
        budget: "موجودہ بجٹ",
        actual: "اصل لاگت",
        forecast: "پیش گوئی",
        projects: "پروجیکٹس",
        decisions: "کھلے فیصلے",
        attention: "توجہ طلب پورٹ فولیو",
        empty: "موجودہ رسائی کے دائرے میں پورٹ فولیو کا کوئی ڈیٹا دستیاب نہیں ہے۔",
        loading: "قیادت کا ڈیش بورڈ لوڈ ہو رہا ہے…",
        saving: "فیصلے کا مسودہ محفوظ کیا جا رہا ہے…",
        create: "فیصلہ درج کریں",
        project: "پروجیکٹ",
        problem: "مسئلہ یا درکار فیصلہ",
        options: "اختیارات",
        recommendation: "سفارش",
        select: "ایک پروجیکٹ منتخب کریں",
        save: "فیصلے کا مسودہ محفوظ کریں",
        success: "فیصلے کا مسودہ محفوظ ہو گیا۔",
        noProjects:
          "پہلے اپنے دائرے میں ایک پروجیکٹ بنائیں تاکہ فیصلہ کسی مخصوص پروجیکٹ کے ریکارڈ سے جوڑا جا سکے۔",
       projectOs: "PROJECT OS", projectProfitability: "پروجیکٹ منافع بخشی" } });
  if (metricsQuery.error && projectsQuery.error && decisionsQuery.error) {
    return <PageMain className="min-h-screen bg-[#f4f6f8] p-8 text-red-700">{getLocalizedProjectError(metricsQuery.error, isArabic)}</PageMain>;
  }
  const data = {
    totals: metricsQuery.data?.totals ?? { budget: 0, actual: 0, forecast: 0 },
    projects: projectsQuery.data?.projects ?? [],
    decisions: decisionsQuery.data?.decisions ?? [],
  };
  const money = (value: number) =>
    value.toLocaleString(pickLanguage(language, { ar: "ar", en: "en", ur: "ur-PK" }), { maximumFractionDigits: 0 });
  const submit = (event: FormEvent) => {
    event.preventDefault();
    mutation.mutate({ tenantId, ...form });
  };
  const cash = pickLanguage(language, { ar: {
        title: "ملخص التدفق النقدي التنفيذي",
        budget: "الميزانية المخططة",
        actual: "التكلفة الفعلية",
        committed: "الالتزامات",
        exposure: "إجمالي التعرض",
        remaining: "المتبقي",
        byProject: "التعرض حسب المشروع",
        byPortfolio: "التدفق حسب المحفظة",
        chart: "مقارنة التعرض والمتبقي حسب المحفظة",
        unassigned: "مشاريع غير مسندة لمحفظة",
        projects: "مشاريع",
      }, en: {
        title: "Executive cash-flow summary",
        budget: "Planned budget",
        actual: "Actual cost",
        committed: "Commitments",
        exposure: "Total exposure",
        remaining: "Remaining budget",
        byProject: "Exposure by project",
        byPortfolio: "Cash flow by portfolio",
        chart: "Exposure and remaining budget by portfolio",
        unassigned: "Projects without a portfolio",
        projects: "Projects",
      }, ur: {
        title: "انتظامی نقد بہاؤ کا خلاصہ",
        budget: "منصوبہ بند بجٹ",
        actual: "اصل لاگت",
        committed: "ذمہ داریاں",
        exposure: "کل مالی تعرض",
        remaining: "باقی بجٹ",
        byProject: "پروجیکٹ کے لحاظ سے تعرض",
        byPortfolio: "پورٹ فولیو کے لحاظ سے نقد بہاؤ",
        chart: "پورٹ فولیو کے لحاظ سے تعرض اور باقی بجٹ",
        unassigned: "بغیر پورٹ فولیو کے پروجیکٹس",
        projects: "پروجیکٹس",
      } });
  return (
    <PageMain className="min-h-screen bg-[#f4f6f8] text-slate-900">
      <PageHeader className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <OutsideShell><Link
            href="/"
            className="inline-flex items-center gap-2 text-sm font-semibold text-[#0e6b70]"
          >
            <ArrowLeft className="h-4 w-4" />
            {t.back}
          </Link></OutsideShell>
          <div className="flex gap-3">
            <span className="text-sm text-slate-500">{t.level}</span>
            <LanguageToggle />
          </div>
        </div>
      </PageHeader>
      <div className="mx-auto max-w-7xl px-5 py-8">
        
        <DashboardSectionReporter tenantId={tenantId} product="EXECUTIVE" sectionKey="executive_metrics" state={metricsQuery.error ? "error" : null} />
        <DashboardSectionReporter tenantId={tenantId} product="EXECUTIVE" sectionKey="executive_projects" state={projectsQuery.error ? "error" : null} />
        <DashboardSectionReporter tenantId={tenantId} product="EXECUTIVE" sectionKey="executive_decisions" state={decisionsQuery.error ? "error" : null} />
        <DashboardSectionReporter tenantId={tenantId} product="EXECUTIVE" sectionKey="executive_cash_flow" state={cashFlowQuery.error ? "error" : null} />
        <section className="rounded-3xl bg-[#123a4a] p-7 text-white">
          <p className="text-xs font-bold tracking-[.16em] text-[#74d0c1]">
            {t.projectOs}
          </p>
          <h1 className="mt-2 text-3xl font-semibold">{t.title}</h1>
          <p className="mt-2 text-slate-300">{t.sub}</p>
        </section>
        <SectionErrorBoundary title={t.title} isArabic={isArabic}>
        {metricsQuery.isLoading ? <div className="mt-6"><SectionMessage title={t.title} isArabic={isArabic} kind="loading" /></div> : metricsQuery.error || !metricsQuery.data ? <div className="mt-6"><SectionMessage title={t.title} isArabic={isArabic} kind="error" detail={metricsQuery.error ? getLocalizedProjectError(metricsQuery.error, isArabic) : undefined} onRetry={() => void metricsQuery.refetch()} /></div> : <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Metric
            icon={Landmark}
            label={t.budget}
            value={money(data.totals.budget)}
          />
          <Metric
            icon={Scale}
            label={t.actual}
            value={money(data.totals.actual)}
          />
          <Metric
            icon={BriefcaseBusiness}
            label={t.forecast}
            value={money(data.totals.forecast)}
          />
        </div>}
        </SectionErrorBoundary>
        {metricsQuery.data && <SectionErrorBoundary title={t.projectProfitability} isArabic={isArabic}><PortfolioProfitability tenantId={tenantId} /></SectionErrorBoundary>}
        <SectionErrorBoundary title={cash.title} isArabic={isArabic}>
        {cashFlowQuery.isLoading ? <div className="mt-6"><SectionMessage title={cash.title} isArabic={isArabic} kind="loading" /></div> : cashFlowQuery.error || !cashFlowQuery.data ? <div className="mt-6"><SectionMessage title={cash.title} isArabic={isArabic} kind="error" error={cashFlowQuery.error} onRetry={() => void cashFlowQuery.refetch()} /></div> : cashFlowQuery.data.cashFlow ? (
          <Card className="mt-6 border-amber-200 bg-amber-50">
            <CardHeader>
              <CardTitle>{cash.title}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5 text-sm">
                <p>
                  <span className="block text-xs text-slate-500">
                    {cash.budget}
                  </span>
                  <b>{money(cashFlowQuery.data.cashFlow.plannedBudget)}</b>
                </p>
                <p>
                  <span className="block text-xs text-slate-500">
                    {cash.actual}
                  </span>
                  <b>{money(cashFlowQuery.data.cashFlow.actualCost)}</b>
                </p>
                <p>
                  <span className="block text-xs text-slate-500">
                    {cash.committed}
                  </span>
                  <b>{money(cashFlowQuery.data.cashFlow.committedAmount)}</b>
                </p>
                <p>
                  <span className="block text-xs text-slate-500">
                    {cash.exposure}
                  </span>
                  <b>{money(cashFlowQuery.data.cashFlow.totalExposure)}</b>
                </p>
                <p>
                  <span className="block text-xs text-slate-500">
                    {cash.remaining}
                  </span>
                  <b>{money(cashFlowQuery.data.cashFlow.remainingBudget)}</b>
                </p>
              </div>
              {(cashFlowQuery.data.cashFlowByPortfolio ?? []).length ? <Suspense fallback={<p className="mt-5 text-sm text-slate-500">{cash.chart}</p>}><PortfolioCashFlowChart portfolios={cashFlowQuery.data.cashFlowByPortfolio ?? []} title={cash.chart} exposureLabel={cash.exposure} remainingLabel={cash.remaining} unassignedLabel={cash.unassigned} /></Suspense> : null}
              {cashFlowQuery.data.cashFlowByPortfolio?.length ? (
                <div className="mt-5">
                  <p className="text-sm font-semibold">{cash.byPortfolio}</p>
                  <div className="mt-2 space-y-2">
                    {cashFlowQuery.data.cashFlowByPortfolio.map(portfolio => (
                      <div
                        key={portfolio.portfolioId ?? "unassigned"}
                        className="flex items-center justify-between rounded-lg bg-white/70 px-3 py-2 text-xs"
                      >
                        <span>
                          {portfolio.code && portfolio.name
                            ? `${portfolio.code} · ${portfolio.name}`
                            : cash.unassigned}{" "}
                          · {portfolio.projectCount} {cash.projects}
                        </span>
                        <span>
                          {cash.exposure}: {money(portfolio.totalExposure)} ·{" "}
                          {cash.remaining}: {money(portfolio.remainingBudget)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
              {cashFlowQuery.data.cashFlowByProject?.length ? (
                <div className="mt-5">
                  <p className="text-sm font-semibold">{cash.byProject}</p>
                  <div className="mt-2 space-y-2">
                    {cashFlowQuery.data.cashFlowByProject.map(project => (
                      <div
                        key={project.id}
                        className="flex items-center justify-between rounded-lg bg-white/70 px-3 py-2 text-xs"
                      >
                        <span>
                          {project.code} · {project.name}
                        </span>
                        <span>
                          {cash.exposure}: {money(project.totalExposure)} ·{" "}
                          {cash.remaining}: {money(project.remainingBudget)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : <div className="mt-6"><SectionMessage title={cash.title} isArabic={isArabic} kind="empty" /></div>}
        </SectionErrorBoundary>
        <div className="mt-6 grid gap-6 lg:grid-cols-[1.2fr_.8fr]">
          <SectionErrorBoundary title={t.attention} isArabic={isArabic}>
          {projectsQuery.isLoading ? <SectionMessage title={t.attention} isArabic={isArabic} kind="loading" /> : projectsQuery.error || !projectsQuery.data ? <SectionMessage title={t.attention} isArabic={isArabic} kind="error" detail={projectsQuery.error ? getLocalizedProjectError(projectsQuery.error, isArabic) : undefined} onRetry={() => void projectsQuery.refetch()} /> : <Card>
            <CardHeader>
              <CardTitle>{t.attention}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.projects.length ? (
                data.projects.map(project => (
                  <div
                    key={project.id}
                    className="flex items-center justify-between rounded-xl bg-slate-50 p-4"
                  >
                    <div>
                      <p className="font-semibold">
                        {project.code} · {project.name}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {enumLabel(project.status, language)} ·{" "}
                        {project.health?.status ? enumLabel(project.health.status, language) : t.notAssessed}
                      </p>
                    </div>
                    <div className="text-end"><p className="text-sm font-semibold">{money(Number(project.forecastCost))}</p><div className="mt-2"><GovernedProjectControlLink tenantId={tenantId} projectId={project.id} compact /></div></div>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">{t.empty}</p>
              )}
            </CardContent>
          </Card>}
          </SectionErrorBoundary>
          <SectionErrorBoundary title={t.decisions} isArabic={isArabic}>
          {decisionsQuery.isLoading ? <SectionMessage title={t.decisions} isArabic={isArabic} kind="loading" /> : decisionsQuery.error || !decisionsQuery.data ? <SectionMessage title={t.decisions} isArabic={isArabic} kind="error" detail={decisionsQuery.error ? getLocalizedProjectError(decisionsQuery.error, isArabic) : undefined} onRetry={() => void decisionsQuery.refetch()} /> : <Card>
            <CardHeader>
              <CardTitle>{t.decisions}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {data.decisions.length ? (
                data.decisions.map(item => (
                  <div key={item.id} className="rounded-xl border p-4">
                    <p className="font-semibold">{item.problem}</p>
                    <p className="mt-1 text-xs text-slate-500">{enumLabel(item.status, language)}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-slate-500">{t.empty}</p>
              )}
            </CardContent>
          </Card>}
          </SectionErrorBoundary>
        </div>
        <details className="mt-6 rounded-[var(--radius-lg)] border border-border bg-card shadow-sm">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-6 py-4 text-sm font-semibold text-foreground marker:content-none"><span>{t.create}</span><span className="text-xs font-medium text-primary">+</span></summary>
        <Card className="border-0 shadow-none">
          <CardHeader>
            <CardTitle>{t.create}</CardTitle>
          </CardHeader>
          <CardContent>
            {!data.projects.length && (
              <p className="mb-4 text-sm text-amber-700">{t.noProjects}</p>
            )}
            <WriteGate permission={"tenant.manage"} reason={{ ar: "لا تملك صلاحية تسجيل القرارات التنفيذية، فالشاشة للعرض فقط.", en: "You do not have permission to record executive decisions; this view is read-only for you.", ur: "آپ کے پاس انتظامی فیصلے درج کرنے کی اجازت نہیں ہے؛ یہ منظر آپ کے لیے صرف پڑھنے کے لیے ہے۔" }}><form className="grid gap-4" onSubmit={submit}>
              <div className="grid gap-4 md:grid-cols-2">
                <Label>
                  {t.project}
                  <select
                    value={form.projectId}
                    onChange={e =>
                      setForm({ ...form, projectId: e.target.value })
                    }
                    required
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
                  >
                    <option value="">{t.select}</option>
                    {data.projects.map(project => (
                      <option key={project.id} value={project.id}>
                        {project.code} · {project.name}
                      </option>
                    ))}
                  </select>
                </Label>
                <Label>
                  {t.problem}
                  <Input
                    value={form.problem}
                    required
                    onChange={e =>
                      setForm({ ...form, problem: e.target.value })
                    }
                  />
                </Label>
              </div>
              <Label>
                {t.options}
                <textarea
                  value={form.options}
                  required
                  onChange={e => setForm({ ...form, options: e.target.value })}
                  className="mt-1 min-h-24 w-full rounded-lg border border-slate-200 p-3 text-sm"
                />
              </Label>
              <Label>
                {t.recommendation}
                <textarea
                  value={form.recommendation}
                  onChange={e =>
                    setForm({ ...form, recommendation: e.target.value })
                  }
                  className="mt-1 min-h-20 w-full rounded-lg border border-slate-200 p-3 text-sm"
                />
              </Label>
              <div>
                <Button disabled={!data.projects.length || mutation.isPending}>
                  {mutation.isPending ? t.saving : t.save}
                </Button>
                {mutation.error && (
                  <p className="mt-3 text-sm text-red-700">
                    {getLocalizedProjectError(mutation.error, isArabic)}
                  </p>
                )}
                {mutation.isSuccess && (
                  <p className="mt-3 text-sm text-emerald-700">{t.success}</p>
                )}
              </div>
            </form></WriteGate>
          </CardContent>
        </Card>
        </details>
      </div>
    </PageMain>
  );
}
function Metric({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Landmark;
  label: string;
  value: string;
}) {
  const { isArabic } = useLanguage();
  return (
    <SectionErrorBoundary title={label} isArabic={isArabic}>
      <Card>
        <CardContent className="p-5">
          <Icon className="h-5 w-5 text-[#0e6b70]" />
          <p className="mt-5 text-xs font-bold tracking-[.12em] text-slate-500">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold">{value}</p>
        </CardContent>
      </Card>
    </SectionErrorBoundary>
  );
}
