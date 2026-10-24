import React, { useState } from "react";
import { BrandIcon, BrandMark } from "@/components/BrandMark";
import { LanguageToggle } from "@/components/LanguageToggle";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, Calculator, ChevronLeft, ChevronRight, ShieldCheck, TrendingDown, TrendingUp } from "lucide-react";
import { Link } from "wouter";
import { pickLanguage } from "@/lib/language";

type Values = {
  pv: string;
  ev: string;
  ac: string;
  bac: string;
  manualEac: string;
  eacMethod: "bac_over_cpi" | "ac_plus_remaining" | "ac_plus_remaining_over_cpi_spi" | "manual";
};

const initialValues: Values = { pv: "", ev: "", ac: "", bac: "", manualEac: "", eacMethod: "bac_over_cpi" };
const metrics = ["PV", "EV", "AC", "CV", "SV", "CPI", "SPI", "EAC", "ETC", "VAC", "TCPI"] as const;

export default function EvmCalculator() {
  const { isArabic, language } = useLanguage();
  const [values, setValues] = useState<Values>(initialValues);
  const [submitted, setSubmitted] = useState(false);
  const t = pickLanguage(language, { ar: {
        level: "محرّك الضبط المركزي",
        workspace: "مساحة العمل",
        engine: "محرك القيمة المكتسبة",
        engineSub: "حساب مركزي ومختبر لضبط الوقت والتكلفة.",
        inputTitle: "مدخلات الحساب",
        labels: ["PV — القيمة المخططة", "EV — القيمة المكتسبة", "AC — التكلفة الفعلية", "BAC — الميزانية عند الإتمام"],
        method: "طريقة EAC",
        manual: "EAC يدوي معتمد",
        calc: "حساب مؤشرات EVM",
        outcome: "نتيجة الضبط",
        title: "أداء التكلفة والجدول",
        empty: "أدخل قيم ضبط المشروع الفعلية للحصول على عرض EVM جاهز للقرار.",
        loading: "جارٍ حساب مؤشرات EVM المركزية…",
        guidance: "إرشاد الإدارة",
        action: "الإجراء الموصى به:",
        secure: "الحساب مركزي ومحكوم",
        controlLabel: "ضوابط EVM",
      }, en: {
        level: "CENTRAL CONTROL ENGINE",
        workspace: "Workspace",
        engine: "Earned Value Engine",
        engineSub: "A centralized, tested calculation for cost and schedule control.",
        inputTitle: "Calculation inputs",
        labels: ["PV — Planned Value", "EV — Earned Value", "AC — Actual Cost", "BAC — Budget at Completion"],
        method: "EAC method",
        manual: "Approved manual EAC",
        calc: "Calculate EVM metrics",
        outcome: "CONTROL OUTCOME",
        title: "Cost and schedule performance",
        empty: "Enter actual project-control values to calculate a decision-ready EVM view.",
        loading: "Calculating central EVM metrics…",
        guidance: "Management guidance",
        action: "Recommended action:",
        secure: "Centralized and governed calculation",
        controlLabel: "EVM controls",
      }, ur: {
        level: "CENTRAL CONTROL ENGINE",
        workspace: "Workspace",
        engine: "Earned Value Engine",
        engineSub: "A centralized, tested calculation for cost and schedule control.",
        inputTitle: "Calculation inputs",
        labels: ["PV — Planned Value", "EV — Earned Value", "AC — Actual Cost", "BAC — Budget at Completion"],
        method: "EAC method",
        manual: "Approved manual EAC",
        calc: "Calculate EVM metrics",
        outcome: "CONTROL OUTCOME",
        title: "Cost and schedule performance",
        empty: "Enter actual project-control values to calculate a decision-ready EVM view.",
        loading: "Calculating central EVM metrics…",
        guidance: "Management guidance",
        action: "Recommended action:",
        secure: "Centralized and governed calculation",
        controlLabel: "EVM controls",
      } });

  const input = {
    pv: Number(values.pv),
    ev: Number(values.ev),
    ac: Number(values.ac),
    bac: Number(values.bac),
    eacMethod: values.eacMethod,
    ...(values.eacMethod === "manual" ? { manualEac: Number(values.manualEac) } : {}),
  };
  const query = trpc.controls.calculateEvm.useQuery(input, {
    enabled: submitted && Object.values(input).every(value => typeof value !== "number" || Number.isFinite(value)),
  });
  const update = (key: keyof Values, value: string) => setValues(current => ({ ...current, [key]: value }));
  const metric = (key: typeof metrics[number]) => {
    const value = query.data?.[key.toLowerCase() as keyof typeof query.data];
    return typeof value === "number" ? value.toLocaleString(isArabic ? "ar" : "en", { maximumFractionDigits: 2 }) : "—";
  };
  const varianceAlert = (query.data?.cpi !== null && query.data?.cpi !== undefined && query.data.cpi < 0.9)
    || (query.data?.spi !== null && query.data?.spi !== undefined && query.data.spi < 0.9);
  const BackChevron = isArabic ? ChevronLeft : ChevronRight;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="sticky top-0 z-20 border-b border-border/80 bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-5 py-4">
          <Link href="/" aria-label={isArabic ? "العودة إلى مساحة عمل Dashio" : "Return to Dashio workspace"}>
            <BrandMark className="h-8 w-auto max-w-36" />
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden text-xs font-semibold tracking-[.12em] text-muted-foreground sm:block">{t.level}</span>
            <LanguageToggle />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-5 py-7 lg:py-10">
        <Link href="/" className="inline-flex items-center gap-1 text-sm font-semibold text-[#0e6b70] hover:underline">
          <BackChevron className="h-4 w-4" />
          {t.workspace}
          <span className="text-muted-foreground">/</span>
          EVM
        </Link>

        <section className="relative mt-6 overflow-hidden rounded-[24px] bg-[var(--dashio-bg-dark)] px-6 py-7 text-white shadow-xl shadow-[var(--dashio-indigo)]/10 sm:px-8">
          <div aria-hidden="true" className="absolute inset-0 opacity-50 [background-image:linear-gradient(rgba(46,211,198,.06)_1px,transparent_1px),linear-gradient(90deg,rgba(46,211,198,.06)_1px,transparent_1px)] [background-size:38px_38px]" />
          <div aria-hidden="true" className="absolute -end-20 -top-16 h-56 w-56 rounded-full bg-[var(--dashio-indigo)]/30 blur-[100px]" />
          <div className="relative flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="inline-flex items-center gap-2 text-xs font-semibold tracking-[.14em] text-[var(--dashio-aqua)]"><Calculator className="h-3.5 w-3.5" />{t.controlLabel}</p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{t.engine}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-300">{t.engineSub}</p>
            </div>
            <p className="inline-flex w-fit items-center gap-2 rounded-full border border-[var(--dashio-aqua)]/20 bg-[var(--dashio-aqua)]/10 px-3 py-1.5 text-xs font-semibold text-[var(--dashio-aqua)]"><ShieldCheck className="h-3.5 w-3.5" />{t.secure}</p>
          </div>
        </section>

        <div className="mt-7 grid gap-7 lg:grid-cols-[minmax(330px,430px)_1fr]">
          <section className="rounded-[var(--radius-lg)] border border-border bg-card p-5 shadow-sm sm:p-6">
            <div className="mb-7 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-[var(--radius-sm)] bg-[var(--dashio-aqua)]/12 text-[var(--dashio-aqua-deep)]"><BrandIcon className="h-5 w-5" alt="" /></span>
              <div><h2 className="text-xl font-semibold">{t.inputTitle}</h2><p className="text-sm text-muted-foreground">{t.engineSub}</p></div>
            </div>
            <div className="space-y-4">
              {(["pv", "ev", "ac", "bac"] as const).map((key, index) => <div key={key}><Label htmlFor={key}>{t.labels[index]}</Label><Input id={key} className="mt-1.5" type="number" min="0" step="0.01" value={values[key]} onChange={event => update(key, event.target.value)} /></div>)}
              <div><Label>{t.method}</Label><Select value={values.eacMethod} onValueChange={value => update("eacMethod", value)}><SelectTrigger className="mt-1.5" aria-label={t.method}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bac_over_cpi">BAC / CPI</SelectItem><SelectItem value="ac_plus_remaining">AC + (BAC − EV)</SelectItem><SelectItem value="ac_plus_remaining_over_cpi_spi">AC + (BAC − EV) / (CPI × SPI)</SelectItem><SelectItem value="manual">{t.manual}</SelectItem></SelectContent></Select></div>
              {values.eacMethod === "manual" ? <div><Label htmlFor="manualEac">{t.manual}</Label><Input id="manualEac" className="mt-1.5" type="number" min="0" step="0.01" value={values.manualEac} onChange={event => update("manualEac", event.target.value)} /></div> : null}
              <Button className="mt-2 w-full bg-[var(--dashio-indigo)] text-white hover:bg-[var(--dashio-indigo-deep)]" onClick={() => setSubmitted(true)}>{t.calc}</Button>
            </div>
          </section>

          <section className="space-y-6">
            <div><p className="text-sm font-semibold tracking-[.16em] text-[#0e6b70]">{t.outcome}</p><h2 className="mt-2 text-3xl font-semibold tracking-tight">{t.title}</h2></div>
            {query.isError ? <div role="alert" className="rounded-[var(--radius-lg)] border border-amber-200 bg-amber-50 p-5 text-sm text-amber-950"><AlertTriangle className="mb-2 h-5 w-5" />{getLocalizedProjectError(query.error, isArabic)}</div> : null}
            {!submitted ? <div className="rounded-[var(--radius-lg)] border border-dashed border-border bg-card px-8 py-16 text-center text-muted-foreground">{t.empty}</div> : null}
            {submitted && query.isLoading ? <div className="rounded-[var(--radius-lg)] bg-card px-8 py-16 text-center text-muted-foreground">{t.loading}</div> : null}
            {query.data ? <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">{metrics.map(key => <article key={key} className="rounded-[var(--radius-lg)] border border-border bg-card p-5 shadow-sm"><p className="text-xs font-bold tracking-[0.16em] text-muted-foreground">{key}</p><p className="mt-3 text-2xl font-semibold tabular-nums">{metric(key)}</p></article>)}</div>
              <div className={`rounded-[var(--radius-lg)] p-6 ${varianceAlert ? "bg-[#fff5ee] text-[#7b341e]" : "bg-[#eaf6f0] text-[#14532d]"}`}><div className="flex items-start gap-3">{varianceAlert ? <TrendingDown className="mt-0.5 h-5 w-5" /> : <TrendingUp className="mt-0.5 h-5 w-5" />}<div><h3 className="font-semibold">{t.guidance}</h3><p className="mt-2 text-sm leading-6">{query.data.meaning}</p><p className="mt-3 text-sm font-medium">{t.action} {query.data.recommendedAction}</p></div></div></div>
            </> : null}
          </section>
        </div>
      </div>
    </main>
  );
}
