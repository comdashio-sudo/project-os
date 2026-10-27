import React from "react";
import { AlertTriangle, CheckCircle2, ClipboardCheck, PackageSearch, Scale, TimerReset } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { calculatePlanningControl, formatPlanningAmount, formatPlanningPercent, planningControlLabel, type PlanningControlResult } from "@/lib/planningControl";
import { pickLanguage } from "@/lib/language";

type Props = {
  result: PlanningControlResult;
  currency: string;
  isLoading?: boolean;
};

export function PlanningControlCenter({ result, currency, isLoading = false }: Props) {
  const { isArabic, language } = useLanguage();
  const t = pickLanguage(language, { ar: {
    eyebrow: "مركز التخطيط وضبط التكلفة والكميات", title: "قرار واحد مبني على مصادر مترابطة", note: "يربط البرنامج والميزانية والتكلفة الفعلية والالتزامات والـBOQ وطلبات المواد والمستودع. لا يحوّل نقص البيانات إلى أرقام صفرية مضللة.", controlled: "تحت السيطرة", attention: "يحتاج انتباهًا", budget: "الميزانية الحالية", exposure: "التعرض المالي", variance: "المتبقي بعد التعرض", boq: "قيمة BOQ النشطة", quantities: "حركة الكميات", issued: "مصروف", remaining: "متبقٍ للطلبات", onHand: "الرصيد بالمستودع", schedule: "البرنامج", overdue: "أنشطة متأخرة", blocked: "أنشطة متعثرة", coverage: "تغطية التنفيذ", gaps: "فجوات البيانات التي تمنع قرارًا كاملًا", noGaps: "المصادر الأساسية مكتملة لهذا العرض", loading: "جارٍ حساب مركز التحكم…", sourceNote: "المؤشرات قراءة مشتقة فقط؛ لا تنشئ قيدًا ماليًا أو كمية جديدة.", lines: "بند" 
  }, en: {
    eyebrow: "PLANNING · COST · QUANTITY CONTROL", title: "One decision view from connected sources", note: "Connects schedule, budget, actual cost, commitments, BOQ, material requests and warehouse balances. Missing data is never turned into misleading zeroes.", controlled: "Controlled", attention: "Needs attention", budget: "Current budget", exposure: "Financial exposure", variance: "Remaining after exposure", boq: "Active BOQ value", quantities: "Quantity movement", issued: "Issued", remaining: "Request balance", onHand: "Warehouse on hand", schedule: "Schedule", overdue: "Overdue activities", blocked: "Blocked activities", coverage: "Execution coverage", gaps: "Data gaps that prevent a complete decision", noGaps: "Core sources are complete for this view", loading: "Calculating control center…", sourceNote: "These are derived read-only indicators; no financial or quantity record is created.", lines: "line"
  }, ur: {
    eyebrow: "منصوبہ بندی · لاگت · مقدار کا کنٹرول", title: "جڑے ہوئے ذرائع سے ایک فیصلہ کن منظر", note: "شیڈول، بجٹ، اصل لاگت، وعدے، BOQ، مواد کی درخواستوں اور گودام کے بقایا کو ایک جگہ جوڑتا ہے۔ غائب ڈیٹا کو گمراہ کن صفر میں تبدیل نہیں کیا جاتا۔", controlled: "کنٹرول میں", attention: "توجہ درکار ہے", budget: "موجودہ بجٹ", exposure: "مالی تعرض", variance: "تعرض کے بعد باقی", boq: "فعال BOQ کی قدر", quantities: "مقدار کی نقل و حرکت", issued: "جاری شدہ", remaining: "درخواست کا بقایا", onHand: "گودام میں موجود", schedule: "شیڈول", overdue: "تاخیر کا شکار سرگرمیاں", blocked: "رکی ہوئی سرگرمیاں", coverage: "عمل درآمد کی کوریج", gaps: "ڈیٹا کی کمیاں جو مکمل فیصلہ روکتی ہیں", noGaps: "اس منظر کے لیے بنیادی ذرائع مکمل ہیں", loading: "کنٹرول سینٹر کا حساب ہو رہا ہے…", sourceNote: "یہ اخذ شدہ صرف پڑھنے کے اشاریے ہیں؛ کوئی مالی یا مقداری ریکارڈ نہیں بنتا۔", lines: "سطر"
  } });
  const tone = result.riskLevel === "attention" ? "border-warning/30 bg-warning-soft" : "border-success/30 bg-success-soft";
  return <section aria-label={t.eyebrow} className={`rounded-2xl border p-5 shadow-sm ${tone}`}>
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div><p className="text-xs font-bold tracking-[.14em] text-primary">{t.eyebrow}</p><h2 className="mt-2 text-xl font-semibold text-foreground">{t.title}</h2><p className="mt-2 max-w-4xl text-sm leading-6 text-muted-foreground">{t.note}</p></div>
      <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${result.riskLevel === "attention" ? "bg-amber-200 text-warning-soft-foreground" : "bg-emerald-200 text-success-soft-foreground"}`}>{result.riskLevel === "attention" ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{result.riskLevel === "attention" ? t.attention : t.controlled}</div>
    </div>
    {isLoading ? <p className="mt-5 rounded-xl bg-white/70 p-4 text-sm text-muted-foreground">{t.loading}</p> : <>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Scale} label={t.budget} value={formatPlanningAmount(result.budget, currency, language)} />
        <Metric icon={ClipboardCheck} label={t.exposure} value={formatPlanningAmount(result.exposure, currency, language)} detail={`${t.variance}: ${formatPlanningAmount(result.variance, currency, language)}`} />
        <Metric icon={PackageSearch} label={t.boq} value={formatPlanningAmount(result.boqValue, currency, language)} detail={`${result.activeBoqLines} ${t.lines}`} />
        <Metric icon={TimerReset} label={t.coverage} value={formatPlanningPercent(result.progressCoverage)} detail={`${t.overdue}: ${result.overdueActivities} · ${t.blocked}: ${result.blockedActivities}`} />
      </div>
      <div className="mt-3 grid gap-3 md:grid-cols-3">
        <Metric label={t.quantities} value={`${result.issuedQuantity.toFixed(3)} / ${result.requestedQuantity.toFixed(3)}`} detail={`${t.issued} · ${t.remaining}: ${result.remainingQuantity.toFixed(3)}`} />
        <Metric label={t.onHand} value={result.onHandQuantity.toFixed(3)} detail={`${result.unfulfilledRequisitions} ${pickLanguage(language, { ar: "طلبات غير مكتملة", en: "unfulfilled requisitions", ur: "نامکمل درخواستیں" })}`} />
        <Metric label={t.schedule} value={`${result.overdueActivities} / ${result.blockedActivities}`} detail={`${t.overdue} / ${t.blocked}`} />
      </div>
      <div className="mt-4 rounded-xl bg-white/80 p-4">
        <p className="text-sm font-semibold text-foreground">{t.gaps}</p>
        {result.dataGaps.length ? <ul className="mt-2 grid gap-2 text-sm text-warning-soft-foreground sm:grid-cols-2">{result.dataGaps.map(gap => <li key={gap} className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 shrink-0" />{planningControlLabel(gap, language)}</li>)}</ul> : <p className="mt-2 flex items-center gap-2 text-sm text-success-soft-foreground"><CheckCircle2 className="h-4 w-4" />{t.noGaps}</p>}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">{t.sourceNote}</p>
    </>}
  </section>;
}

function Metric({ icon: Icon, label, value, detail }: { icon?: typeof Scale; label: string; value: string; detail?: string }) {
  return <div className="rounded-xl border border-border bg-card p-4"><div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{Icon ? <Icon className="h-4 w-4 text-primary" /> : null}{label}</div><p className="mt-2 text-lg font-semibold text-foreground">{value}</p>{detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}</div>;
}
