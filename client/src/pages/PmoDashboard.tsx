import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, CheckSquare, FolderTree, ShieldAlert, TriangleAlert } from "lucide-react";
import React, { FormEvent, useState } from "react";
import { Link, useParams } from "wouter";

type Priority = "low" | "medium" | "high" | "critical";

export default function PmoDashboard() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { isArabic } = useLanguage();
  const utils = trpc.useUtils();
  const query = trpc.dashboards.pmo.useQuery({ tenantId });
  const [riskForm, setRiskForm] = useState({ projectId: "", code: "", title: "", probability: "3", severity: "3" });
  const [issueForm, setIssueForm] = useState<{ projectId: string; code: string; title: string; priority: Priority }>({ projectId: "", code: "", title: "", priority: "medium" });
  const [actionForm, setActionForm] = useState<{ projectId: string; title: string; priority: Priority }>({ projectId: "", title: "", priority: "medium" });
  const [portfolioForm, setPortfolioForm] = useState({ code: "", name: "" });
  const [programForm, setProgramForm] = useState({ portfolioId: "", code: "", name: "" });

  const t = isArabic
    ? {
        back: "مساحة العمل", level: "المستوى 2 · مكتب إدارة المشاريع", title: "لوحة حوكمة PMO", sub: "نطاق المحافظ والبرامج وسجلات المخاطر والقضايا والإجراءات ضمن المستأجر المصرح به.", portfolios: "المحافظ", programs: "البرامج", projects: "المشاريع", risks: "المخاطر المفتوحة", issues: "القضايا المفتوحة", actions: "الإجراءات المفتوحة", noData: "لا توجد سجلات ضمن نطاق الوصول الحالي.", loading: "جارٍ تحميل ضوابط PMO…", saving: "جارٍ حفظ السجل…", addRisk: "تسجيل مخاطرة", addIssue: "تسجيل قضية", addAction: "تسجيل إجراء", addPortfolio: "إنشاء محفظة", addProgram: "إنشاء برنامج", portfolio: "المحفظة", optionalPortfolio: "المحفظة (اختياري)", project: "المشروع", code: "الرمز", titleLabel: "العنوان", actionTitle: "عنوان الإجراء", probability: "الاحتمال (1–5)", severity: "الأثر (1–5)", priority: "الأولوية", save: "حفظ السجل", create: "إنشاء", select: "اختر مشروعًا", selectPortfolio: "بدون محفظة", unavailable: "لا يمكن التسجيل قبل وجود مشروع ضمن النطاق.", success: "تم الحفظ وتحديث السجل.", masterSuccess: "تم إنشاء السجل الرئيسي وتحديث لوحة PMO.", low: "منخفضة", medium: "متوسطة", high: "مرتفعة", critical: "حرجة",
      }
    : {
        back: "Workspace", level: "Level 2 · PMO", title: "PMO governance board", sub: "Portfolio, program, risk, issue, and action registers within the authorized tenant.", portfolios: "Portfolios", programs: "Programs", projects: "Projects", risks: "Open risks", issues: "Open issues", actions: "Open actions", noData: "No records are available in the current access scope.", loading: "Loading PMO controls…", saving: "Saving register entry…", addRisk: "Register risk", addIssue: "Register issue", addAction: "Register action", addPortfolio: "Create portfolio", addProgram: "Create program", portfolio: "Portfolio", optionalPortfolio: "Portfolio (optional)", project: "Project", code: "Code", titleLabel: "Title", actionTitle: "Action title", probability: "Probability (1–5)", severity: "Severity (1–5)", priority: "Priority", save: "Save register", create: "Create", select: "Select a project", selectPortfolio: "No portfolio", unavailable: "A project in your scope is required before registration.", success: "Saved and register refreshed.", masterSuccess: "The master record was created and the PMO board has been refreshed.", low: "Low", medium: "Medium", high: "High", critical: "Critical",
      };

  const riskMutation = trpc.pmo.createRisk.useMutation({
    onSuccess: () => {
      setRiskForm({ projectId: "", code: "", title: "", probability: "3", severity: "3" });
      utils.dashboards.pmo.invalidate({ tenantId });
    },
  });
  const issueMutation = trpc.pmo.createIssue.useMutation({
    onSuccess: () => {
      setIssueForm({ projectId: "", code: "", title: "", priority: "medium" });
      utils.dashboards.pmo.invalidate({ tenantId });
    },
  });
  const actionMutation = trpc.pmo.createAction.useMutation({
    onSuccess: () => {
      setActionForm({ projectId: "", title: "", priority: "medium" });
      utils.dashboards.pmo.invalidate({ tenantId });
    },
  });
  const portfolioMutation = trpc.pmo.createPortfolio.useMutation({ onSuccess: () => { setPortfolioForm({ code: "", name: "" }); utils.dashboards.pmo.invalidate({ tenantId }); } });
  const programMutation = trpc.pmo.createProgram.useMutation({ onSuccess: () => { setProgramForm({ portfolioId: "", code: "", name: "" }); utils.dashboards.pmo.invalidate({ tenantId }); } });

  if (query.isLoading) return <main className="min-h-screen bg-[#f4f6f8] p-8 text-slate-500">{t.loading}</main>;
  if (query.error || !query.data) return <main className="min-h-screen bg-[#f4f6f8] p-8 text-red-700">{getLocalizedProjectError(query.error, isArabic)}</main>;

  const data = query.data;
  const openRisks = data.risks.filter(item => item.status !== "closed");
  const openIssues = data.issues.filter(item => !["resolved", "closed"].includes(item.status));
  const openActions = data.actions.filter(item => !["completed", "cancelled"].includes(item.status));
  const field = "mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm";
  const priorityLabel = (priority: string) => t[priority as Priority] ?? priority;
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
    issueMutation.mutate({ tenantId, projectId: issueForm.projectId, code: issueForm.code, title: issueForm.title, priority: issueForm.priority });
  };
  const submitAction = (event: FormEvent) => {
    event.preventDefault();
    actionMutation.mutate({ tenantId, projectId: actionForm.projectId, title: actionForm.title, priority: actionForm.priority });
  };
  const submitPortfolio = (event: FormEvent) => { event.preventDefault(); portfolioMutation.mutate({ tenantId, ...portfolioForm }); };
  const submitProgram = (event: FormEvent) => { event.preventDefault(); programMutation.mutate({ tenantId, code: programForm.code, name: programForm.name, ...(programForm.portfolioId ? { portfolioId: programForm.portfolioId } : {}) }); };

  return (
    <main className="min-h-screen bg-[#f4f6f8] text-slate-900">
      <header className="border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-4">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-[#0e6b70]"><ArrowLeft className="h-4 w-4" />{t.back}</Link>
          <div className="flex gap-3"><span className="text-sm text-slate-500">{t.level}</span><LanguageToggle /></div>
        </div>
      </header>
      <div className="mx-auto max-w-7xl px-5 py-8">
        <section className="rounded-3xl bg-[#123a4a] p-7 text-white">
          <p className="text-xs font-bold tracking-[.16em] text-[#74d0c1]">PROJECT OS</p>
          <h1 className="mt-2 text-3xl font-semibold">{t.title}</h1>
          <p className="mt-2 text-slate-300">{t.sub}</p>
        </section>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
          <Metric label={t.portfolios} value={data.portfolios.length} />
          <Metric label={t.programs} value={data.programs.length} />
          <Metric label={t.projects} value={data.projects.length} />
          <Metric label={t.risks} value={openRisks.length} />
          <Metric label={t.issues} value={openIssues.length} />
          <Metric label={t.actions} value={openActions.length} />
        </div>

        <div className="mt-6 grid gap-6 xl:grid-cols-2">
          <Card><CardHeader><CardTitle>{t.addPortfolio}</CardTitle></CardHeader><CardContent><form className="grid gap-3 sm:grid-cols-2" onSubmit={submitPortfolio}><Label>{t.code}<Input required value={portfolioForm.code} onChange={event => setPortfolioForm({ ...portfolioForm, code: event.target.value })} /></Label><Label>{t.titleLabel}<Input required value={portfolioForm.name} onChange={event => setPortfolioForm({ ...portfolioForm, name: event.target.value })} /></Label><div className="sm:col-span-2"><Button disabled={portfolioMutation.isPending}>{portfolioMutation.isPending ? t.saving : t.create}</Button>{portfolioMutation.error && <p role="alert" className="mt-2 text-sm text-red-700">{getLocalizedProjectError(portfolioMutation.error, isArabic)}</p>}{portfolioMutation.isSuccess && <p role="status" className="mt-2 text-sm text-emerald-700">{t.masterSuccess}</p>}</div></form></CardContent></Card>
          <Card><CardHeader><CardTitle>{t.addProgram}</CardTitle></CardHeader><CardContent><form className="grid gap-3 sm:grid-cols-2" onSubmit={submitProgram}><Label>{t.optionalPortfolio}<select value={programForm.portfolioId} onChange={event => setProgramForm({ ...programForm, portfolioId: event.target.value })} className={field}><option value="">{t.selectPortfolio}</option>{data.portfolios.map(portfolio => <option key={portfolio.id} value={portfolio.id}>{portfolio.code} · {portfolio.name}</option>)}</select></Label><Label>{t.code}<Input required value={programForm.code} onChange={event => setProgramForm({ ...programForm, code: event.target.value })} /></Label><Label className="sm:col-span-2">{t.titleLabel}<Input required value={programForm.name} onChange={event => setProgramForm({ ...programForm, name: event.target.value })} /></Label><div className="sm:col-span-2"><Button disabled={programMutation.isPending}>{programMutation.isPending ? t.saving : t.create}</Button>{programMutation.error && <p role="alert" className="mt-2 text-sm text-red-700">{getLocalizedProjectError(programMutation.error, isArabic)}</p>}{programMutation.isSuccess && <p role="status" className="mt-2 text-sm text-emerald-700">{t.masterSuccess}</p>}</div></form></CardContent></Card>
        </div>

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
                <Button disabled={!data.projects.length || actionMutation.isPending}>{actionMutation.isPending ? t.saving : t.save}</Button>
                {actionMutation.error && <p className="text-sm text-red-700">{getLocalizedProjectError(actionMutation.error, isArabic)}</p>}
                {actionMutation.isSuccess && <p className="text-sm text-emerald-700">{t.success}</p>}
              </form>
            </CardContent>
          </Card>
        </div>

        {!data.projects.length && <p className="mt-4 text-sm text-amber-700">{t.unavailable}</p>}

        <div className="mt-6 grid gap-6 xl:grid-cols-3">
          <Register icon={ShieldAlert} title={t.risks} items={openRisks.map(item => `${item.code} · ${item.title}`)} empty={t.noData} />
          <Register icon={TriangleAlert} title={t.issues} items={openIssues.map(item => `${item.code} · ${item.title} · ${priorityLabel(item.priority)}`)} empty={t.noData} />
          <Register icon={CheckSquare} title={t.actions} items={openActions.map(item => `${item.title} · ${priorityLabel(item.priority)}`)} empty={t.noData} />
        </div>
      </div>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return <Card><CardContent className="p-5"><FolderTree className="h-5 w-5 text-[#0e6b70]" /><p className="mt-5 text-xs font-bold tracking-[.12em] text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold">{value}</p></CardContent></Card>;
}

function Register({ icon: Icon, title, items, empty }: { icon: typeof ShieldAlert; title: string; items: string[]; empty: string }) {
  return <Card><CardHeader><CardTitle className="flex items-center gap-2"><Icon className="h-5 w-5 text-[#0e6b70]" />{title}</CardTitle></CardHeader><CardContent className="space-y-3">{items.length ? items.map(item => <p key={item} className="rounded-xl bg-slate-50 p-4 text-sm font-medium">{item}</p>) : <p className="text-sm text-slate-500">{empty}</p>}</CardContent></Card>;
}
