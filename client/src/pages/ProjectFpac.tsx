import { Button } from "@/components/ui/button";
import { ExportExcelButton } from "@/components/ExportExcelButton";
import { useLanguage } from "@/contexts/LanguageContext";
import { type ExportColumn } from "@/lib/excelExport";
import { ageSentence, formatMoney, formatPercent, sourceAnchor, sourceRoute, sparklinePoints, trend, type Source } from "@/lib/profitabilityView";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { AlertTriangle, TrendingUp } from "lucide-react";
import React, { useState } from "react";
import { GuardedPanels } from "@/components/SectionResilience";
import CashFlowMonthly from "./CashFlowMonthly";
import LabourLoadingCard from "./LabourLoadingCard";
import ProjectInvoicesPanel from "./ProjectInvoicesPanel";
import { SourceNotice } from "@/components/SectionResilience";
import { pickLanguage } from "@/lib/language";

const text = {
  ar: {
    title: "ربحية المشروع", subtitle: "الجواب اليوم: هل يربح هذا المشروع؟", loading: "جارٍ احتساب الربحية…", retry: "إعادة المحاولة",
    fpac: "الربح المتوقع عند الإتمام (FPAC)", margin: "هامش الربح", loss: "المشروع متجه إلى خسارة", plannedProfit: "الربح المخطط أصلًا", variance: "انحراف الربح",
    figure: "الرقم", value: "القيمة", formula: "المعادلة", source: "المصدر", asOf: "التاريخ",
    movement: "الحركة منذ آخر لقطة", since: "منذ", delta: "التغير", causes: "أسباب الحركة (تجمع التغير كاملًا)", contractValue: "قيمة العقد (أوامر التغيير)", actualCost: "التكلفة الفعلية", forecastToComplete: "التكلفة المتبقية المتوقعة",
    raised: "بنود رفعت الربح", lowered: "بنود خفّضت الربح", trend: "منحنى FPAC عبر اللقطات",
    cash: "الربح ليس نقدًا", openCommitment: "الالتزام المفتوح", receipts: "المقبوضات", outflows: "المصروفات", netCash: "صافي التدفق النقدي", cashWarning: "الربح موجب لكن صافي التدفق النقدي سالب: المشروع يربح على الورق ويستهلك سيولة.",
    confidence: "ثقة الرقم", staleWarning: (age: number, source: string) => `هذا الرقم مبني على ${source} آخر تحديثه قبل ${age} يومًا`, neverWarning: (source: string) => `هذا الرقم لا يتضمن ${source}: لم يُسجَّل أي إدخال بعد`, dominant: "● السبب الأكبر", percentWbs: (n: number) => `${n}% من البنود محدّثة خلال 7 أيام`, openSource: "افتح المصدر الأقدم تحديثًا",
    progress: "التقدم", materials: "المواد", labour: "العمالة", unknownFreshness: "لا توجد بيانات كافية لتقدير حداثة الرقم.",
    drill: "أعلى 5 بنود WBS بانحراف", item: "البند", planned: "المخطط", actual: "الفعلي", committed: "الملتزَم (مفتوح)", whole: "المشروع كله", forecast: "المتوقع", gap: "الانحراف", unallocated: "تكلفة فعلية غير موزعة على بند", reconciliation: "فرق التسوية بين البنود والمشروع",
    breakdown: "من أين جاءت التكلفة الفعلية", category: "الفئة", materialsC: "مواد", labourC: "عمالة", subcontractC: "عقود باطن", otherC: "أخرى", sourceDoc: "المستند المصدر", noBreakdown: "لا قيود تكلفة فعلية لهذا البند.", open: "عرض المصادر",
    unavailable: "غير متاح", reasons: { NO_PREVIOUS_SNAPSHOT: "لا توجد لقطة سابقة للمقارنة بعد. تُحفظ لقطة شهرية تلقائيًا.", EVM_INPUTS_INCONSISTENT: "مدخلات التكلفة والتقدم غير متسقة، راجع الميزانية والتقدم.", EVM_UNAVAILABLE: "تعذر احتساب القيمة المكتسبة لهذا المشروع.", CASH_SOURCES_UNAVAILABLE: "تعذر قراءة أوامر الشراء أو المقبوضات.", WBS_UNAVAILABLE: "تعذر تفصيل البنود." } as Record<string, string>,
    empty: "لا بيانات كافية بعد: أضف ميزانية وتقدمًا وتكلفة فعلية لتظهر الربحية.",
    rows: { originalContract: ["قيمة العقد الأصلية", "حقل قيمة العقد في المشروع"], approvedChanges: ["+ أوامر التغيير المعتمدة", "مجموع أثر طلبات التغيير المعتمدة فقط"], adjustedContract: ["= قيمة العقد المعدّلة", "الأصلية + المعتمدة"], eac: ["التكلفة المتوقعة عند الإتمام (EAC)", "محرك القيمة المكتسبة"], fpac: ["= FPAC", "العقد المعدّل − EAC"], margin: ["هامش الربح %", "FPAC ÷ العقد المعدّل"], plannedProfit: ["الربح المخطط", "العقد الأصلي − الميزانية (BAC)"], profitVariance: ["انحراف الربح", "FPAC − الربح المخطط"] } as Record<string, [string, string]>,
    sources: { project: "المشروع", changeOrders: "طلبات التغيير", computed: "محسوب", operationalRecords: "سجلات التكلفة والتقدم" } as Record<string, string>,
  },
  en: {
    title: "Project profitability", subtitle: "The answer today: is this project making money?", loading: "Calculating profitability…", retry: "Retry",
    fpac: "Forecast profit at completion (FPAC)", margin: "Profit margin", loss: "This project is heading for a loss", plannedProfit: "Profit originally planned", variance: "Profit variance",
    figure: "Figure", value: "Value", formula: "Formula", source: "Source", asOf: "As of",
    movement: "Movement since the last snapshot", since: "since", delta: "Change", causes: "Why it moved (the three add up to the whole change)", contractValue: "Contract value (change orders)", actualCost: "Actual cost", forecastToComplete: "Forecast cost to complete",
    raised: "Items that raised profit", lowered: "Items that lowered profit", trend: "FPAC across snapshots",
    cash: "Profit is not cash", openCommitment: "Open commitment", receipts: "Receipts", outflows: "Outflows", netCash: "Net cash flow", cashWarning: "Profit is positive but net cash flow is negative: the project earns on paper and consumes liquidity.",
    confidence: "Confidence in the number", staleWarning: (age: number, source: string) => `This number rests on ${source} last updated ${age} days ago`, neverWarning: (source: string) => `This number has no ${source} behind it: nothing has been recorded yet`, dominant: "● largest cause", percentWbs: (n: number) => `${n}% of items updated within 7 days`, openSource: "Open the stalest source",
    progress: "progress", materials: "materials", labour: "labour", unknownFreshness: "There is not enough data to judge how fresh the number is.",
    drill: "Top 5 WBS items by variance", item: "Item", planned: "Planned", actual: "Actual", committed: "Committed (open)", whole: "Whole project", forecast: "Forecast", gap: "Variance", unallocated: "Actual cost not allocated to any item", reconciliation: "Reconciliation difference between items and project",
    breakdown: "Where the actual cost came from", category: "Category", materialsC: "Materials", labourC: "Labour", subcontractC: "Subcontract", otherC: "Other", sourceDoc: "Source document", noBreakdown: "No actual cost entries for this item.", open: "Show sources",
    unavailable: "Unavailable", reasons: { NO_PREVIOUS_SNAPSHOT: "There is no earlier snapshot to compare with yet. One is saved automatically every month.", EVM_INPUTS_INCONSISTENT: "Cost and progress inputs are inconsistent; review the budget and progress.", EVM_UNAVAILABLE: "Earned value could not be calculated for this project.", CASH_SOURCES_UNAVAILABLE: "Purchase orders or receipts could not be read.", WBS_UNAVAILABLE: "The item breakdown could not be produced." } as Record<string, string>,
    empty: "Not enough data yet: add a budget, progress and actual cost for profitability to appear.",
    rows: { originalContract: ["Original contract value", "project contract value field"], approvedChanges: ["+ Approved change orders", "sum of approved change requests only"], adjustedContract: ["= Adjusted contract value", "original + approved"], eac: ["Estimate at completion (EAC)", "earned-value engine"], fpac: ["= FPAC", "adjusted contract − EAC"], margin: ["Profit margin %", "FPAC ÷ adjusted contract"], plannedProfit: ["Planned profit", "original contract − budget (BAC)"], profitVariance: ["Profit variance", "FPAC − planned profit"] } as Record<string, [string, string]>,
    sources: { project: "Project", changeOrders: "Change requests", computed: "Computed", operationalRecords: "Cost and progress records" } as Record<string, string>,
  }, ur: {
    title: "Project profitability", subtitle: "The answer today: is this project making money?", loading: "Calculating profitability…", retry: "Retry",
    fpac: "Forecast profit at completion (FPAC)", margin: "Profit margin", loss: "This project is heading for a loss", plannedProfit: "Profit originally planned", variance: "Profit variance",
    figure: "Figure", value: "Value", formula: "Formula", source: "Source", asOf: "As of",
    movement: "Movement since the last snapshot", since: "since", delta: "Change", causes: "Why it moved (the three add up to the whole change)", contractValue: "Contract value (change orders)", actualCost: "Actual cost", forecastToComplete: "Forecast cost to complete",
    raised: "Items that raised profit", lowered: "Items that lowered profit", trend: "FPAC across snapshots",
    cash: "Profit is not cash", openCommitment: "Open commitment", receipts: "Receipts", outflows: "Outflows", netCash: "Net cash flow", cashWarning: "Profit is positive but net cash flow is negative: the project earns on paper and consumes liquidity.",
    confidence: "Confidence in the number", staleWarning: (age: number, source: string) => `This number rests on ${source} last updated ${age} days ago`, neverWarning: (source: string) => `This number has no ${source} behind it: nothing has been recorded yet`, dominant: "● largest cause", percentWbs: (n: number) => `${n}% of items updated within 7 days`, openSource: "Open the stalest source",
    progress: "progress", materials: "materials", labour: "labour", unknownFreshness: "There is not enough data to judge how fresh the number is.",
    drill: "Top 5 WBS items by variance", item: "Item", planned: "Planned", actual: "Actual", committed: "Committed (open)", whole: "Whole project", forecast: "Forecast", gap: "Variance", unallocated: "Actual cost not allocated to any item", reconciliation: "Reconciliation difference between items and project",
    breakdown: "Where the actual cost came from", category: "Category", materialsC: "Materials", labourC: "Labour", subcontractC: "Subcontract", otherC: "Other", sourceDoc: "Source document", noBreakdown: "No actual cost entries for this item.", open: "Show sources",
    unavailable: "Unavailable", reasons: { NO_PREVIOUS_SNAPSHOT: "There is no earlier snapshot to compare with yet. One is saved automatically every month.", EVM_INPUTS_INCONSISTENT: "Cost and progress inputs are inconsistent; review the budget and progress.", EVM_UNAVAILABLE: "Earned value could not be calculated for this project.", CASH_SOURCES_UNAVAILABLE: "Purchase orders or receipts could not be read.", WBS_UNAVAILABLE: "The item breakdown could not be produced." } as Record<string, string>,
    empty: "Not enough data yet: add a budget, progress and actual cost for profitability to appear.",
    rows: { originalContract: ["Original contract value", "project contract value field"], approvedChanges: ["+ Approved change orders", "sum of approved change requests only"], adjustedContract: ["= Adjusted contract value", "original + approved"], eac: ["Estimate at completion (EAC)", "earned-value engine"], fpac: ["= FPAC", "adjusted contract − EAC"], margin: ["Profit margin %", "FPAC ÷ adjusted contract"], plannedProfit: ["Planned profit", "original contract − budget (BAC)"], profitVariance: ["Profit variance", "FPAC − planned profit"] } as Record<string, [string, string]>,
    sources: { project: "Project", changeOrders: "Change requests", computed: "Computed", operationalRecords: "Cost and progress records" } as Record<string, string>,
  },
};

const toneClass = { good: "text-success-soft-foreground", bad: "text-danger-soft-foreground", flat: "text-muted-foreground" };
type T = typeof text.en;

function Unavailable({ reason, t }: { reason: string; t: T }) {
  return <p role="status" className="rounded-xl bg-muted p-3 text-sm text-muted-foreground"><b>{t.unavailable}:</b> {t.reasons[reason] ?? reason}</p>;
}

export function ProjectFpac({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { isArabic, language } = useLanguage();
  const t = pickLanguage(language, text);
  const report = trpc.profitability.project.useQuery({ tenantId, projectId });
  const history = trpc.profitability.history.useQuery({ tenantId, projectId });
  const [openItem, setOpenItem] = useState<string | null>(null);
  const breakdown = trpc.profitability.costBreakdown.useQuery({ tenantId, projectId, wbsItemId: openItem ?? undefined }, { enabled: openItem !== null });

  if (report.isLoading) return <section aria-busy="true" className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border"><p role="status" className="text-sm text-muted-foreground">{t.loading}</p></section>;
  if (!report.data) {
    return (
      <section className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border">
        <p role="alert" className="text-sm text-danger-soft-foreground">{getLocalizedProjectError(report.error, isArabic)}</p>
        <Button className="mt-3" variant="outline" size="sm" onClick={() => report.refetch()}>{t.retry}</Button>
      </section>
    );
  }
  const data = report.data;
  const currency = data.project.currency;
  const money = (value: number) => formatMoney(value, currency, isArabic);
  const headline = data.headline;
  const stalest = data.freshness.stalestSource as Source | null;
  const stale = data.freshness.level === "stale" && stalest;
  const staleAge = data.freshness.perSource.find(item => item.source === stalest)?.ageDays ?? null;
  const points = (history.data ?? []).map(item => item.fpac);
  const projectTag = `${data.project.code} · ${data.project.name}`;
  // Headline table. The Value column mixes money and the margin: each cell names its own kind (the margin is a fraction shown as a percent).
  const headlineRows = headline.status === "ok" ? headline.data.rows : [];
  const headlineColumns: ExportColumn<(typeof headlineRows)[number]>[] = [
    { header: t.figure, value: row => (t.rows[row.key] ?? [row.key, row.formula])[0], kind: "text" },
    { header: t.value, value: row => (row.key === "margin" ? { value: row.value === null ? null : row.value / 100, kind: "percent" } : { value: row.value, kind: "money" }) },
    { header: t.formula, value: row => (t.rows[row.key] ?? [row.key, row.formula])[1], kind: "text" },
    { header: t.source, value: row => t.sources[row.source] ?? row.source, kind: "text" },
    { header: t.asOf, value: row => (row.asOf ? new Date(row.asOf) : null), kind: "date" },
  ];
  // WBS drill-down. The whole-project totals row stays on screen only.
  const drillItems = data.drill.status === "ok" ? data.drill.data.items : [];
  const drillColumns: ExportColumn<(typeof drillItems)[number]>[] = [
    { header: t.item, value: item => `${item.code} · ${item.name}`, kind: "text" },
    { header: t.planned, value: item => item.planned, kind: "money" },
    { header: t.actual, value: item => item.actual, kind: "money" },
    { header: t.committed, value: item => item.committed, kind: "money" },
    { header: t.forecast, value: item => item.forecast, kind: "money" },
    { header: t.gap, value: item => item.variance, kind: "money" },
  ];

  return (
    <section className="rounded-2xl bg-card p-6 shadow-sm ring-1 ring-border" aria-label={t.title}>
      <div className="flex items-center gap-3"><TrendingUp className="text-primary" /><div><h2 className="font-semibold">{t.title}</h2><p className="text-xs text-muted-foreground">{t.subtitle}</p></div></div>

      {stale && (
        <p role="alert" className="mt-4 flex flex-wrap items-center gap-2 rounded-xl bg-warning-soft p-3 text-sm text-warning-soft-foreground">
          <AlertTriangle className="h-4 w-4" />
          {staleAge === null ? t.neverWarning(t[stalest as Source]) : t.staleWarning(staleAge, t[stalest as Source])}
          <a className="font-semibold underline" href={sourceAnchor[stalest]}>{t.openSource}</a>
        </p>
      )}

      {headline.status === "ok" ? (
        <div className="mt-5">
          <p className="text-xs text-muted-foreground">{t.fpac}</p>
          <p data-testid="fpac-value" className={`text-4xl font-bold ${headline.data.isLoss ? "text-danger-soft-foreground" : "text-success-soft-foreground"}`}>{money(headline.data.fpac)}</p>
          <p className="mt-1 text-sm">{t.margin}: <b>{formatPercent(headline.data.marginPercent, isArabic)}</b> · {t.plannedProfit}: <b>{money(headline.data.plannedProfit)}</b> · {t.variance}: <b className={toneClass[trend(headline.data.profitVariance).tone]}>{money(headline.data.profitVariance)}</b></p>
          {headline.data.isLoss && <p role="alert" className="mt-2 rounded-xl bg-danger-soft p-3 text-sm font-semibold text-danger-soft-foreground">{t.loss}</p>}
          <div className="mt-4 flex justify-end"><ExportExcelButton fileName={`${data.project.code}-profitability`} sheetName={t.title} title={t.title} project={projectTag} rows={headlineRows} columns={headlineColumns} /></div>
          <div className="mt-2 overflow-x-auto" tabIndex={0} role="region" aria-label={pickLanguage(language, { ar: "جدول التكلفة والقيمة", en: "Cost and value table", ur: "لاگت اور قدر کا جدول" })}>
            <table className="w-full min-w-[34rem] text-start text-sm">
              <thead><tr className="text-xs text-muted-foreground"><th className="py-1 text-start">{t.figure}</th><th className="text-start">{t.value}</th><th className="text-start">{t.formula}</th><th className="text-start">{t.source}</th><th className="text-start">{t.asOf}</th></tr></thead>
              <tbody>
                {headline.data.rows.map(row => {
                  const labels = t.rows[row.key] ?? [row.key, row.formula];
                  return (
                    <tr key={row.key} className="border-t">
                      <td className="py-1.5 font-medium">{labels[0]}</td>
                      <td className="whitespace-nowrap pe-3">{row.key === "margin" ? formatPercent(row.value, isArabic) : row.value === null ? "—" : money(row.value)}</td>
                      <td className="text-xs text-muted-foreground">{labels[1]}</td>
                      <td className="text-xs text-muted-foreground">{t.sources[row.source] ?? row.source}</td>
                      <td className="text-xs text-muted-foreground">{row.asOf ? row.asOf.slice(0, 10) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : <div className="mt-5"><Unavailable reason={headline.reason} t={t} /></div>}

      <h3 className="mt-6 font-semibold">{t.movement}</h3>
      {data.movement.status === "ok" ? (
        <div className="mt-2" data-testid="movement">
          {(() => {
            const m = data.movement.data;
            const tr = trend(m.delta);
            return (
              <>
                <p className={`text-lg font-bold ${toneClass[tr.tone]}`}>{tr.arrow} {money(m.delta)}{m.deltaPercent !== null && <span className="text-sm"> ({formatPercent(m.deltaPercent, isArabic)})</span>} <span className="text-xs font-normal text-muted-foreground">{t.since} {m.since.slice(0, 10)}</span></p>
                <p className="mt-2 text-xs text-muted-foreground">{t.causes} · {t.dominant}</p>
                <ul className="mt-1 grid gap-1 text-sm md:grid-cols-3">
                  {(["contractValue", "actualCost", "forecastToComplete"] as const).map(cause => <li key={cause} className="rounded-xl bg-muted p-3"><span className="text-xs text-muted-foreground">{t[cause]}</span><br /><b className={toneClass[trend(m.causes[cause]).tone]}>{money(m.causes[cause])}</b>{m.dominantCause === cause && <span className="ms-1 text-xs">●</span>}</li>)}
                </ul>
                {m.wbs && (m.wbs.raisedProfit.length > 0 || m.wbs.loweredProfit.length > 0) && (
                  <div className="mt-3 grid gap-3 md:grid-cols-2">
                    {([["raised", m.wbs.raisedProfit], ["lowered", m.wbs.loweredProfit]] as const).map(([key, rows]) => (
                      <div key={key}><p className="text-xs text-muted-foreground">{t[key]}</p>{rows.length === 0 ? <p className="text-sm text-muted-foreground">—</p> : <ul className="text-sm">{rows.map(r => <li key={r.wbsItemId}>{r.code} · {r.name} <b className={toneClass[trend(r.profitEffect).tone]}>{money(r.profitEffect)}</b></li>)}</ul>}</div>
                    ))}
                  </div>
                )}
              </>
            );
          })()}
        </div>
      ) : <div className="mt-2"><Unavailable reason={data.movement.reason} t={t} /></div>}
      <SourceNotice query={history} isArabic={isArabic} title={pickLanguage(language, { ar: "سجل الربحية السابق (الرسم)", en: "Profit history (the chart)", ur: "منافع کی پچھلی تاریخ (چارٹ)" })} fallback={pickLanguage(language, { ar: "بقية الشاشة سليمة.", en: "The rest of the screen is unaffected.", ur: "اسکرین کا باقی حصہ متاثر نہیں ہوا۔" })} />
      {points.length >= 2 && <div className="mt-3"><p className="text-xs text-muted-foreground">{t.trend}</p><svg role="img" aria-label={t.trend} viewBox="0 0 200 40" className="h-12 w-full max-w-md"><polyline fill="none" stroke="#0e6b70" strokeWidth="2" points={sparklinePoints(points, 200, 40)} /></svg></div>}

      <h3 className="mt-6 font-semibold">{t.cash}</h3>
      {data.cash.status === "ok" ? (
        <div className="mt-2" data-testid="cash">
          <ul className="grid gap-2 text-sm md:grid-cols-4">
            <li className="rounded-xl bg-muted p-3"><span className="text-xs text-muted-foreground">{t.openCommitment}</span><br /><b>{money(data.cash.data.openCommitment)}</b></li>
            <li className="rounded-xl bg-muted p-3"><span className="text-xs text-muted-foreground">{t.receipts}</span><br /><b>{money(data.cash.data.receipts)}</b></li>
            <li className="rounded-xl bg-muted p-3"><span className="text-xs text-muted-foreground">{t.outflows}</span><br /><b>{money(data.cash.data.outflows)}</b></li>
            <li className="rounded-xl bg-muted p-3"><span className="text-xs text-muted-foreground">{t.netCash}</span><br /><b className={toneClass[trend(data.cash.data.netCashFlow).tone]}>{money(data.cash.data.netCashFlow)}</b></li>
          </ul>
          {data.cash.data.warning && <p role="alert" className="mt-2 rounded-xl bg-warning-soft p-3 text-sm text-warning-soft-foreground">{t.cashWarning}</p>}
        </div>
      ) : <div className="mt-2"><Unavailable reason={data.cash.reason} t={t} /></div>}

      <h3 className="mt-6 font-semibold">{t.confidence}</h3>
      <ul className="mt-2 flex flex-wrap gap-2 text-sm" data-testid="freshness">
        {data.freshness.perSource.map(item => <li key={item.source} className="rounded-xl bg-muted px-3 py-2">{t[item.source as Source]}: <b>{ageSentence(item.ageDays, isArabic)}</b></li>)}
        {data.freshness.percentWbsUpdated !== null && <li className="rounded-xl bg-muted px-3 py-2">{t.percentWbs(data.freshness.percentWbsUpdated)}</li>}
      </ul>

      <div className="mt-6 flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{t.drill}</h3>{data.drill.status === "ok" && <ExportExcelButton fileName={`${data.project.code}-wbs-variance`} sheetName={t.drill} title={t.drill} project={projectTag} rows={drillItems} columns={drillColumns} />}</div>
      {data.drill.status === "ok" ? (
        data.drill.data.items.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">{t.empty}</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm">
              <thead><tr className="text-xs text-muted-foreground"><th className="py-1 text-start">{t.item}</th><th className="text-start">{t.planned}</th><th className="text-start">{t.actual}</th><th className="text-start">{t.committed}</th><th className="text-start">{t.forecast}</th><th className="text-start">{t.gap}</th><th><span className="sr-only">{pickLanguage(language, { ar: "التفاصيل", en: "Details", ur: "تفصیلات" })}</span></th></tr></thead>
              <tbody>
                <tr className="border-t bg-muted font-semibold" data-testid="drill-totals">
                  <td className="py-1.5 pe-3">{t.whole}</td><td className="whitespace-nowrap pe-3">{money(data.drill.data.totals.planned)}</td><td className="whitespace-nowrap pe-3">{money(data.drill.data.totals.actual)}</td><td className="whitespace-nowrap pe-3">{money(data.drill.data.totals.committed)}</td><td className="whitespace-nowrap pe-3">{money(data.drill.data.totals.forecast)}</td>
                  <td className={`whitespace-nowrap pe-3 ${toneClass[trend(data.drill.data.totals.variance).tone]}`}>{money(data.drill.data.totals.variance)}</td><td />
                </tr>
                {data.drill.data.items.map(item => (
                  <React.Fragment key={item.wbsItemId}>
                    <tr className="border-t">
                      <td className="py-1.5 pe-3">{item.code} · {item.name}</td><td className="whitespace-nowrap pe-3">{money(item.planned)}</td><td className="whitespace-nowrap pe-3">{money(item.actual)}</td><td className="whitespace-nowrap pe-3">{money(item.committed)}</td><td className="whitespace-nowrap pe-3">{money(item.forecast)}</td>
                      <td className={`whitespace-nowrap pe-3 ${toneClass[trend(item.variance).tone]}`}>{money(item.variance)}</td>
                      <td><Button size="sm" variant="outline" aria-expanded={openItem === item.wbsItemId} onClick={() => setOpenItem(openItem === item.wbsItemId ? null : item.wbsItemId)}>{t.open}</Button></td>
                    </tr>
                    {openItem === item.wbsItemId && (
                      <tr><td colSpan={7} className="bg-muted p-3">
                        <p className="text-xs text-muted-foreground">{t.breakdown}</p>
                        {breakdown.isLoading && <p role="status" className="text-sm">{t.loading}</p>}
                        {breakdown.error && <p role="alert" className="text-sm text-danger-soft-foreground">{getLocalizedProjectError(breakdown.error, isArabic)}</p>}
                        {breakdown.data && (breakdown.data.lines.length === 0 ? <p className="text-sm text-muted-foreground">{t.noBreakdown}</p> : (
                          <>
                            <ul className="mt-1 flex flex-wrap gap-2 text-sm">{breakdown.data.byCategory.map(c => <li key={c.category} className="rounded-xl bg-card px-3 py-1">{({ materials: t.materialsC, labour: t.labourC, subcontract: t.subcontractC, other: t.otherC } as Record<string, string>)[c.category] ?? c.category}: <b>{money(c.amount)}</b></li>)}</ul>
                            <ul className="mt-2 text-xs text-muted-foreground">{breakdown.data.lines.slice(0, 20).map(line => <li key={line.id}>{line.incurredAt.toISOString().slice(0, 10)} · {money(line.amount)} · {t.sourceDoc}: {(() => { const route = sourceRoute(line.sourceType, tenantId, projectId); const label = route ? (pickLanguage(language, route.label)) : (line.sourceType ?? "—"); const id = line.sourceId ? ` ${line.sourceId.slice(0, 8)}` : ""; return route ? <a className="font-semibold text-primary underline" href={route.href}>{label}{id}</a> : <>{label}{id}</>; })()}</li>)}</ul>
                          </>
                        ))}
                      </td></tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
            {data.drill.data.unallocatedActual !== 0 && <p className="mt-2 text-xs text-muted-foreground">{t.unallocated}: <b>{money(data.drill.data.unallocatedActual)}</b></p>}
            {data.drill.data.reconciliationDifference !== null && data.drill.data.reconciliationDifference !== 0 && <p className="mt-1 text-xs text-warning-soft-foreground">{t.reconciliation}: <b>{money(data.drill.data.reconciliationDifference)}</b></p>}
          </div>
        )
      ) : <div className="mt-2"><Unavailable reason={data.drill.reason} t={t} /></div>}
      <GuardedPanels isArabic={isArabic} titles={{ CashFlowMonthly: { ar: "التدفق النقدي الشهري", en: "Monthly cash flow", ur: "ماہانہ کیش فلو" }, ProjectInvoicesPanel: { ar: "فواتير المشروع", en: "Project invoices", ur: "پروجیکٹ کی انوائسز" }, LabourLoadingCard: { ar: "تكلفة العمالة المحمّلة", en: "Loaded labour cost", ur: "شامل شدہ لیبر لاگت" } }}>
        <CashFlowMonthly tenantId={tenantId} projectId={projectId} currency={currency} />
        <ProjectInvoicesPanel tenantId={tenantId} projectId={projectId} currency={currency} />
        <LabourLoadingCard tenantId={tenantId} projectId={projectId} currency={currency} />
      </GuardedPanels>
    </section>
  );
}
