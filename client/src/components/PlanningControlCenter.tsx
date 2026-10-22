import React from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, PackageSearch, Scale, TimerReset } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { calculatePlanningControl, formatPlanningAmount, formatPlanningPercent, planningControlLabel, type PlanningControlResult } from "@/lib/planningControl";

type Props = {
  result: PlanningControlResult;
  currency: string;
  isLoading?: boolean;
};

export function PlanningControlCenter({ result, currency, isLoading = false }: Props) {
  const { isArabic } = useLanguage();
  const t = isArabic ? {
    eyebrow: "مركز التخطيط وضبط التكلفة والكميات", title: "قرار واحد مبني على مصادر مترابطة", note: "يربط البرنامج والميزانية والتكلفة الفعلية والالتزامات والـBOQ وطلبات المواد والمستودع. لا يحوّل نقص البيانات إلى أرقام صفرية مضللة.", controlled: "تحت السيطرة", attention: "يحتاج انتباهًا", budget: "الميزانية الحالية", exposure: "التعرض المالي", variance: "المتبقي بعد التعرض", boq: "قيمة BOQ النشطة", quantities: "حركة الكميات", issued: "مصروف", remaining: "متبقٍ للطلبات", onHand: "الرصيد بالمستودع", schedule: "البرنامج", overdue: "أنشطة متأخرة", blocked: "أنشطة متعثرة", coverage: "تغطية التنفيذ", gaps: "فجوات البيانات التي تمنع قرارًا كاملًا", noGaps: "المصادر الأساسية مكتملة لهذا العرض", loading: "جارٍ حساب مركز التحكم…", sourceNote: "المؤشرات قراءة مشتقة فقط؛ لا تنشئ قيدًا ماليًا أو كمية جديدة.", lines: "بند" 
  } : {
    eyebrow: "PLANNING · COST · QUANTITY CONTROL", title: "One decision view from connected sources", note: "Connects schedule, budget, actual cost, commitments, BOQ, material requests and warehouse balances. Missing data is never turned into misleading zeroes.", controlled: "Controlled", attention: "Needs attention", budget: "Current budget", exposure: "Financial exposure", variance: "Remaining after exposure", boq: "Active BOQ value", quantities: "Quantity movement", issued: "Issued", remaining: "Request balance", onHand: "Warehouse on hand", schedule: "Schedule", overdue: "Overdue activities", blocked: "Blocked activities", coverage: "Execution coverage", gaps: "Data gaps that prevent a complete decision", noGaps: "Core sources are complete for this view", loading: "Calculating control center…", sourceNote: "These are derived read-only indicators; no financial or quantity record is created.", lines: "line"
  };
  const tone = result.riskLevel === "attention" ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50";
  return <section aria-label={t.eyebrow} className={`rounded-2xl border p-5 shadow-sm ${tone}`}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-bold tracking-[.14em] text-[#0e6b70]">{t.eyebrow}</p><h2 className="mt-2 text-xl font-semibold text-slate-900">{t.title}</h2><p className="mt-2 max-w-4xl text-sm leading-6 text-slate-600">{t.note}</p></div>
      <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${result.riskLevel === "attention" ? "bg-amber-200 text-amber-950" : "bg-emerald-200 text-emerald-950"}`}>{result.riskLevel === "attention" ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{result.riskLevel === "attention" ? t.attention : t.controlled}</div>
    </div>
    {isLoading ? <p className="mt-5 rounded-xl bg-white/70 p-4 text-sm text-slate-600">{t.loading}</p> : <>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Scale} label={t.budget} value={formatPlanningAmount(result.budget, currency, isArabic)} />
        <Metric icon={ClipboardCheck} label={t.exposure} value={formatPlanningAmount(result.exposure, currency, isArabic)} detail={`${t.variance}: ${formatPlanningAmount(result.variance, currency, isArabic)}`} />
        <Metric icon={PackageSearch} label={t.boq} value={formatPlanningAmount(result.boqValue, currency, isArabic)} detail={`${result.activeBoqLines} ${t.lines}`} />
        <Metric icon={TimerReset} label={t.coverage} value={formatPlanningPercent(result.progressCoverage)} detail={`${t.overdue}: ${result.overdueActivities} · ${t.blocked}: ${result.blockedActivities}`} />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Metric label={t.quantities} value={`${result.issuedQuantity.toFixed(3)} / ${result.requestedQuantity.toFixed(3)}`} detail={`${t.issued} · ${t.remaining}: ${result.remainingQuantity.toFixed(3)}`} />
        <Metric label={t.onHand} value={result.onHandQuantity.toFixed(3)} detail={`${result.unfulfilledRequisitions} ${isArabic ? "طلبات غير مكتملة" : "unfulfilled requisitions"}`} />
        <Metric label={t.schedule} value={`${result.overdueActivities} / ${result.blockedActivities}`} detail={`${t.overdue} / ${t.blocked}`} />
      </div>
      <div className="mt-4 rounded-xl bg-white/80 p-4">
        <p className="text-sm font-semibold text-slate-900">{t.gaps}</p>
        {result.dataGaps.length ? <ul className="mt-2 grid gap-2 text-sm text-amber-900 sm:grid-cols-2">{result.dataGaps.map(gap => <li key={gap} className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{planningControlLabel(gap, isArabic)}</li>)}</ul> : <p className="mt-2 flex items-center gap-2 text-sm text-emerald-800"><CheckCircle2 className="h-4 w-4" />{t.noGaps}</p>}
      </div>
      <p className="mt-3 text-xs text-slate-500">{t.sourceNote}</p>
    </>}
  </section>;
}

function Metric({ icon: Icon, label, value, detail }: { icon?: typeof Scale; label: string; value: string; detail?: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{Icon ? <Icon className="h-4 w-4 text-[#0e6b70]" /> : null}{label}</div><p className="mt-2 text-lg font-semibold text-slate-900">{value}</p>{detail ? <p className="mt-1 text-xs text-slate-500">{detail}</p> : null}</div>;
}
