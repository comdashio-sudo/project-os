import React, { useMemo } from "react";
import { formatAmount, formatPercent } from "@/components/ds/format";
import { PageMain, PageHeader } from "@/components/pageFrame";
import { ArrowLeft, Calculator, CircleDollarSign, FileCheck2, ShieldCheck } from "lucide-react";
import { Link, useParams } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { ErrorState, LoadingState } from "@/components/ScreenStates";
import { ProjectFpac } from "./ProjectFpac";
import { pickLanguage } from "@/lib/language";

const amount = (value: number) => formatAmount(value, 2);
const ur = {
  legacyCaption: "آپریشنل مالی پل — یہ اعداد متوقع منافع نہیں ہیں؛ متوقع منافع اوپر کے پینل میں ہے۔",
  eyebrow: "پروجیکٹ FPAC",
  title: "پروجیکٹ منافع کنٹرول",
  subtitle: "ایک قابل سراغ مالی پل جو بجٹ، اصل لاگت، کھلی کمٹمنٹس اور انوائس شدہ آمدن کو الگ کرتا ہے۔",
  scope: "کمپنی اور پروجیکٹ کے دائرے میں",
  back: "پروجیکٹ کنٹرولز پر واپس",
  budget: "منظور شدہ بجٹ",
  actual: "اصل لاگت",
  committed: "کھلی کمٹمنٹس",
  invoiced: "انوائس شدہ قدر",
  forecast: "سادہ خطرے کا منظر",
  bridge: "لاگت اور قدر کا پل",
  boqValue: "BOQ کی کنٹرول شدہ قدر",
  billedRate: "BOQ سے بل شدہ",
  costRate: "BOQ سے استعمال شدہ لاگت",
  signal: "انتظامی اشارہ",
  signalNote: "یہ ایک شفاف آپریشنل اشارہ ہے، کوئی قانونی منافع کا بیان نہیں۔ جتنے زیادہ منظور شدہ بجٹ، لاگت، کمٹمنٹس اور انوائسز درج ہوں گے، یہ اتنا ہی مضبوط ہوتا جائے گا۔",
  proxy: "انوائس شدہ قدر منہا اصل لاگت (تقریبی اندازہ)",
  formula: "حساب: بجٹ = موجودہ بجٹ کی سطروں کا مجموعہ؛ اصل = پوسٹ شدہ لاگت کے اندراجات کا مجموعہ؛ کمٹمنٹس = درج شدہ سب کنٹریکٹ معاہدوں کا مجموعہ؛ متوقع خطرہ = اصل + کمٹمنٹس۔",
  sources: "ذرائع کی کوریج",
  boqSource: "BOQ کی سطریں",
  budgetSource: "بجٹ کی سطریں",
  costSource: "لاگت کے اندراجات",
  contractSource: "سب کنٹریکٹ معاہدے",
  error: "ایک یا زائد مالی ذرائع لوڈ نہیں ہو سکے۔ کوئی اندازہ شدہ قدر نہیں دکھائی جا رہی۔",
};
export default function ProjectProfitability() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { isArabic, isRtl, language } = useLanguage();
  const t = pickLanguage(language, { ar, en, ur });
  const input = { tenantId, projectId };
  const financials = trpc.projects.getControlsFinancials.useQuery(input, { enabled: Boolean(tenantId && projectId) });
  const boq = trpc.boq.list.useQuery(input, { enabled: Boolean(tenantId && projectId) });
  const contracts = trpc.subcontracts.list.useQuery(input, { enabled: Boolean(tenantId && projectId) });
  const invoices = trpc.projectInvoices.list.useQuery(input, { enabled: Boolean(tenantId && projectId) });
  const model = useMemo(() => {
    const budget = (financials.data?.budgets ?? []).reduce((sum, row) => sum + Number(row.currentAmount), 0);
    const boqValue = (boq.data ?? []).reduce((sum, row) => sum + Number(row.quantity) * Number(row.unitRate), 0);
    const actual = (financials.data?.costs ?? []).reduce((sum, row) => sum + Number(row.amount), 0);
    const committed = (contracts.data ?? []).reduce((sum, row) => sum + Number(row.contractValue), 0);
    const invoiced = (invoices.data ?? []).reduce((sum, row) => sum + Number(row.totalAmount ?? Number(row.amount) + Number(row.vatAmount)), 0);
    const remaining = budget - actual;
    const forecast = actual + committed;
    const billedRate = boqValue > 0 ? (invoiced / boqValue) * 100 : null;
    const costRate = boqValue > 0 ? (actual / boqValue) * 100 : null;
    return { budget, boqValue, actual, committed, invoiced, remaining, forecast, proxy: invoiced - actual, billedRate, costRate };
  }, [financials.data, boq.data, contracts.data, invoices.data]);
  const error = financials.error || boq.error || contracts.error || invoices.error;
  return <PageMain className="min-h-screen bg-muted px-4 py-6 text-slate-900 sm:px-8" dir={isRtl ? "rtl" : "ltr"}><div className="mx-auto max-w-7xl space-y-6"><PageHeader className="flex flex-wrap items-start justify-between gap-4"><div><Link href={`/projects/${tenantId}/${projectId}/controls`} className="inline-flex items-center gap-2 text-sm font-semibold text-primary"><ArrowLeft className="h-4 w-4" />{t.back}</Link><p className="mt-4 text-xs font-bold uppercase tracking-[.2em] text-primary">{t.eyebrow}</p><h1 className="mt-2 text-3xl font-semibold">{t.title}</h1><p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600">{t.subtitle}</p></div><div className="flex items-center gap-2 rounded-2xl bg-slate-950 px-4 py-3 text-sm text-white"><ShieldCheck className="h-5 w-5 text-secondary" />{t.scope}</div></PageHeader><ProjectFpac tenantId={tenantId} projectId={projectId} /><p className="text-sm font-semibold text-slate-600">{t.legacyCaption}</p>{error && <ErrorState isArabic={isArabic} error={error} title={t.error} onRetry={() => { void financials.refetch(); void boq.refetch(); void contracts.refetch(); void invoices.refetch(); }} retrying={financials.isFetching || boq.isFetching || contracts.isFetching || invoices.isFetching} />}{!error && (financials.isLoading || boq.isLoading || contracts.isLoading || invoices.isLoading) ? <LoadingState isArabic={isArabic} label={pickLanguage(language, { ar: "جارٍ تحميل أرقام الربحية…", en: "Loading profitability figures…", ur: "منافع کے اعداد و شمار لوڈ ہو رہے ہیں…" })} /> : null}<section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5"><Metric label={t.budget} value={model.budget} /><Metric label={t.boqValue} value={model.boqValue} /><Metric label={t.actual} value={model.actual} /><Metric label={t.committed} value={model.committed} /><Metric label={t.invoiced} value={model.invoiced} /></section><section className="grid gap-6 lg:grid-cols-[1.3fr_.7fr]"><div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><div className="flex items-center gap-3"><Calculator className="h-5 w-5 text-primary" /><h2 className="font-semibold">{t.bridge}</h2></div><div className="mt-5 space-y-4"><Bridge label={t.budget} value={model.budget} tone="bg-chart-1" /><Bridge label={t.actual} value={model.actual} tone="bg-chart-2" /><Bridge label={t.committed} value={model.committed} tone="bg-chart-3" /><Bridge label={t.forecast} value={model.forecast} tone="bg-chart-4" /></div><p className="mt-6 text-xs leading-5 text-slate-500">{t.formula}</p></div><div className="rounded-2xl bg-slate-950 p-6 text-white"><CircleDollarSign className="h-6 w-6 text-secondary" /><h2 className="mt-4 text-lg font-semibold">{t.signal}</h2><p className="mt-2 text-sm leading-6 text-slate-300">{t.signalNote}</p><p className="mt-6 text-3xl font-semibold">{amount(model.proxy)}</p><p className="mt-1 text-xs text-slate-400">{t.proxy}</p><div className="mt-6 grid grid-cols-2 gap-3 border-t border-white/10 pt-4"><Signal label={t.billedRate} value={model.billedRate == null ? "—" : formatPercent(model.billedRate, 1)} /><Signal label={t.costRate} value={model.costRate == null ? "—" : formatPercent(model.costRate, 1)} /></div></div></section><section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><div className="flex items-center gap-3"><FileCheck2 className="h-5 w-5 text-primary" /><h2 className="font-semibold">{t.sources}</h2></div><div className="mt-4 grid gap-3 md:grid-cols-3"><Source label={t.boqSource} value={String(boq.data?.length ?? 0)} /><Source label={t.budgetSource} value={String(financials.data?.budgets?.length ?? 0)} /><Source label={t.costSource} value={String(financials.data?.costs?.length ?? 0)} /><Source label={t.contractSource} value={String(contracts.data?.length ?? 0)} /></div></section></div></PageMain>;
}
function Metric({ label, value }: { label: string; value: number }) { return <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200"><p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p><p className="mt-2 text-2xl font-semibold">{amount(value)}</p></div>; }
function Bridge({ label, value, tone }: { label: string; value: number; tone: string }) { return <div><div className="flex justify-between gap-3 text-sm"><span>{label}</span><b>{amount(value)}</b></div><div className="mt-2 h-2 rounded-full bg-slate-100"><div className={`h-2 rounded-full ${tone}`} style={{ width: `${Math.min(100, Math.max(0, value / 1000))}%` }} /></div></div>; }
function Source({ label, value }: { label: string; value: string }) { return <div className="rounded-xl bg-slate-50 p-4"><p className="text-xs text-slate-500">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>; }
function Signal({ label, value }: { label: string; value: string }) { return <div><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-lg font-semibold text-white">{value}</p></div>; }
const en = { legacyCaption: "Operational financial bridge — these figures are not forecast profit; the forecast profit is the panel above.", eyebrow: "Project FPAC", title: "Project profitability control", subtitle: "A traceable financial bridge that separates budget, actual cost, open commitments and invoiced revenue.", scope: "Tenant + project scoped", back: "Back to project controls", budget: "Approved budget", actual: "Actual cost", committed: "Open commitments", invoiced: "Invoiced value", forecast: "Simple exposure view", bridge: "Cost and value bridge", boqValue: "BOQ controlled value", billedRate: "BOQ billed", costRate: "BOQ cost used", signal: "Management signal", signalNote: "This is a transparent operating signal, not a statutory profit statement. It becomes stronger as approved budgets, costs, commitments and invoices are recorded.", proxy: "Invoiced value minus actual cost (proxy)", formula: "Calculation: budget = sum of current budget lines; actual = sum of posted cost entries; commitments = sum of registered subcontract contracts; forecast exposure = actual + commitments.", sources: "Source coverage", boqSource: "BOQ lines", budgetSource: "Budget lines", costSource: "Cost entries", contractSource: "Subcontract contracts", error: "One or more financial sources could not be loaded. No inferred values are shown." };
const ar = { legacyCaption: "جسر مالي تشغيلي — هذه الأرقام ليست الربح المتوقع؛ الربح المتوقع هو اللوحة أعلاه.", eyebrow: "ربحية المشروع FPAC", title: "لوحة ضبط ربحية المشروع", subtitle: "جسر مالي قابل للتتبع يفصل الميزانية والتكلفة الفعلية والالتزامات المفتوحة والقيمة المفوترة.", scope: "محكوم بنطاق الشركة والمشروع", back: "العودة إلى ضوابط المشروع", budget: "الميزانية الحالية", actual: "التكلفة الفعلية", committed: "الالتزامات المفتوحة", invoiced: "القيمة المفوترة", forecast: "قراءة التعرض المبسطة", bridge: "جسر التكلفة والقيمة", boqValue: "القيمة المضبوطة في BOQ", billedRate: "المفوتر من BOQ", costRate: "المستخدم من BOQ", signal: "إشارة إدارية", signalNote: "هذه إشارة تشغيلية شفافة وليست قائمة ربح نظامية. تقوى كلما سُجلت الميزانيات والتكاليف والالتزامات والفواتير المعتمدة.", proxy: "القيمة المفوترة ناقص التكلفة الفعلية (مؤشر تقريبي)", formula: "المعادلة: الميزانية = مجموع بنود الميزانية الحالية؛ الفعلي = مجموع قيود التكلفة المرحلة؛ الالتزامات = مجموع عقود الباطن المسجلة؛ التعرض المتوقع = الفعلي + الالتزامات.", sources: "تغطية المصادر", boqSource: "بنود BOQ", budgetSource: "بنود الميزانية", costSource: "قيود التكلفة", contractSource: "عقود الباطن", error: "تعذر تحميل مصدر مالي واحد أو أكثر. لا تُعرض قيم مستنتجة." };
