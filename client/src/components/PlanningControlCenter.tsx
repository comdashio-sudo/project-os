import React from "react";
import { formatAmount, formatNumber } from "@/components/ds/format";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatPlanningAmount, formatPlanningPercent, planningHeadline, type PlanningControlResult } from "@/lib/planningControl";
import { pickLanguage } from "@/lib/language";

type Props = {
  result: PlanningControlResult;
  currency: string;
  isLoading?: boolean;
  /** Opens the file upload. With it, a missing schedule or budget becomes one button («Upload the budget»); without it (no right to import) the step is only said. */
  onUpload?: () => void;
};

/** A quantity is written as it is: 12 not 12.000, 12.5 not 12.500. */
const quantity = (value: number) => formatAmount(value, 2);

/**
 * Q-64: the planning page's top block, rebuilt so it reads at a glance. One sentence says where the project stands; then the sections in the order a planner asks —
 * schedule, cost, materials — and a section appears only when there is something to say. What is missing is one understandable step (with its button), never a card of zeroes.
 */
export function PlanningControlCenter({ result, currency, isLoading = false, onUpload }: Props) {
  const { language } = useLanguage();
  const t = pickLanguage(language, {
    ar: {
      title: "التخطيط والتحكم", controlled: "الوضع جيد", attention: "يحتاج انتباهًا", loading: "جارٍ حساب الصورة…",
      schedule: "الجدول الزمني", activities: "الأنشطة", started: "بدأت", late: "متأخرة عن موعدها", blocked: "متعثرة", activitiesDetail: "في الجدول",
      cost: "التكلفة", budget: "الميزانية", spent: "المنفَق والملتزَم به", left: "المتبقي", over: "تجاوز الميزانية", boq: "جدول الكميات", boqLines: "بند",
      materials: "المواد والمستودع", issued: "المصروف من المطلوب", of: "من", onHand: "الرصيد في المستودع", openRequests: "طلبات مواد لم تكتمل",
      noScheduleTitle: "لا جدول زمني بعد", noScheduleAction: "ارفع الجدول", noBudgetTitle: "لا ميزانية بعد", noBudgetAction: "ارفع الميزانية",
      moneyHidden: "المبالغ مخفية عنك: تحتاج صلاحية قراءة التدفق النقدي.", next: "الخطوات التالية",
      undated: (n: number) => `${n} نشاطًا بلا تواريخ: أضف تواريخها ليظهر الجدول كاملًا.`,
      unlinkedBoq: (n: number) => `${n} بندًا من جدول الكميات غير مربوط ببند في هيكل العمل.`,
      unlinkedCost: (n: number) => `${n} تكلفة فعلية غير مربوطة ببند في هيكل العمل.`,
    },
    en: {
      title: "Planning and control", controlled: "On track", attention: "Needs attention", loading: "Working out the picture…",
      schedule: "Schedule", activities: "Activities", started: "Started", late: "Past their planned finish", blocked: "Blocked", activitiesDetail: "in the schedule",
      cost: "Cost", budget: "Budget", spent: "Spent and committed", left: "Left", over: "Over budget", boq: "Bill of quantities", boqLines: "lines",
      materials: "Materials and stores", issued: "Issued of requested", of: "of", onHand: "On hand in stores", openRequests: "Material requests not yet filled",
      noScheduleTitle: "No schedule yet", noScheduleAction: "Upload the schedule", noBudgetTitle: "No budget yet", noBudgetAction: "Upload the budget",
      moneyHidden: "The amounts are hidden from you: you need the cash-flow read permission.", next: "Next steps",
      undated: (n: number) => `${n} activities have no dates: add them so the schedule is complete.`,
      unlinkedBoq: (n: number) => `${n} bill-of-quantities lines are not linked to a work-structure item.`,
      unlinkedCost: (n: number) => `${n} actual costs are not linked to a work-structure item.`,
    },
    ur: {
      title: "منصوبہ بندی اور کنٹرول", controlled: "ٹھیک چل رہا ہے", attention: "توجہ درکار ہے", loading: "تصویر تیار ہو رہی ہے…",
      schedule: "شیڈول", activities: "سرگرمیاں", started: "شروع ہوئیں", late: "طے شدہ تاریخ سے پیچھے", blocked: "رکی ہوئی", activitiesDetail: "شیڈول میں",
      cost: "لاگت", budget: "بجٹ", spent: "خرچ اور وعدہ شدہ", left: "باقی", over: "بجٹ سے زیادہ", boq: "مقداروں کی فہرست", boqLines: "سطریں",
      materials: "مواد اور گودام", issued: "مانگے گئے میں سے جاری", of: "میں سے", onHand: "گودام میں موجود", openRequests: "مواد کی نامکمل درخواستیں",
      noScheduleTitle: "ابھی کوئی شیڈول نہیں", noScheduleAction: "شیڈول اپ لوڈ کریں", noBudgetTitle: "ابھی کوئی بجٹ نہیں", noBudgetAction: "بجٹ اپ لوڈ کریں",
      moneyHidden: "رقمیں آپ سے پوشیدہ ہیں: نقد بہاؤ دیکھنے کی اجازت درکار ہے۔", next: "اگلے مراحل",
      undated: (n: number) => `${n} سرگرمیوں کی تاریخیں نہیں ہیں: انہیں شامل کریں تاکہ شیڈول مکمل ہو۔`,
      unlinkedBoq: (n: number) => `${n} سطریں کام کے ڈھانچے کی کسی شق سے نہیں جڑیں۔`,
      unlinkedCost: (n: number) => `${n} اصل لاگتیں کام کے ڈھانچے کی کسی شق سے نہیں جڑیں۔`,
    },
  });
  const amount = (value: number) => formatPlanningAmount(value, currency, language);
  const hasSchedule = result.activityCount > 0;
  const hasBudget = result.moneyVisible && result.budget > 0;
  const hasMaterials = result.requestedQuantity > 0 || result.onHandQuantity > 0;
  const steps = [
    ...(result.undatedActivities > 0 ? [t.undated(result.undatedActivities)] : []),
    ...(result.unlinkedBoqLines > 0 ? [t.unlinkedBoq(result.unlinkedBoqLines)] : []),
    ...(result.unlinkedCosts > 0 ? [t.unlinkedCost(result.unlinkedCosts)] : []),
  ];

  return <section aria-label={t.title} data-risk={result.riskLevel} className="rounded-[var(--radius-card)] border border-border bg-card p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1 basis-64"><h2 className="sr-only">{t.title}</h2><p data-planning-headline="" className="max-w-3xl text-lg font-semibold leading-8 text-foreground">{planningHeadline(result, currency, language)}</p></div>
      {hasSchedule ? <div className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-semibold ${result.riskLevel === "attention" ? "bg-warning/20 text-warning-soft-foreground" : "bg-success/20 text-success-soft-foreground"}`}>{result.riskLevel === "attention" ? <AlertTriangle aria-hidden="true" className="h-4 w-4" /> : <CheckCircle2 aria-hidden="true" className="h-4 w-4" />}{result.riskLevel === "attention" ? t.attention : t.controlled}</div> : null}
    </div>
    {isLoading ? <p role="status" className="mt-5 text-sm text-muted-foreground">{t.loading}</p> : <div className="mt-5 grid gap-5">
      {hasSchedule ? <Group title={t.schedule}>
        <Metric label={t.activities} value={formatNumber(result.activityCount)} detail={t.activitiesDetail} />
        <Metric label={t.started} value={`${formatNumber(result.startedActivities)} (${formatPlanningPercent(result.progressCoverage)})`} />
        <Metric label={t.late} value={formatNumber(result.overdueActivities)} tone={result.overdueActivities > 0 ? "warning" : undefined} />
        {result.blockedActivities > 0 ? <Metric label={t.blocked} value={formatNumber(result.blockedActivities)} tone="warning" /> : null}
      </Group> : <Step title={t.noScheduleTitle} action={onUpload ? { label: t.noScheduleAction, run: onUpload } : undefined} />}

      {!result.moneyVisible ? <Group title={t.cost}><p className="text-sm text-muted-foreground sm:col-span-2 xl:col-span-4">{t.moneyHidden}</p></Group> : hasBudget ? <Group title={t.cost}>
        <Metric label={t.budget} value={amount(result.budget)} />
        <Metric label={t.spent} value={amount(result.exposure)} detail={result.costUtilization !== null ? formatPlanningPercent(result.costUtilization) : undefined} />
        <Metric label={t.left} value={amount(result.variance)} tone={result.variance < 0 ? "danger" : undefined} detail={result.variance < 0 ? t.over : undefined} />
        {result.activeBoqLines > 0 ? <Metric label={t.boq} value={amount(result.boqValue)} detail={`${formatNumber(result.activeBoqLines)} ${t.boqLines}`} /> : null}
      </Group> : <Step title={t.noBudgetTitle} action={onUpload ? { label: t.noBudgetAction, run: onUpload } : undefined} />}

      {hasMaterials ? <Group title={t.materials}>
        {result.requestedQuantity > 0 ? <Metric label={t.issued} value={`${quantity(result.issuedQuantity)} ${t.of} ${quantity(result.requestedQuantity)}`} /> : null}
        {result.onHandQuantity > 0 ? <Metric label={t.onHand} value={quantity(result.onHandQuantity)} /> : null}
        {result.unfulfilledRequisitions > 0 ? <Metric label={t.openRequests} value={formatNumber(result.unfulfilledRequisitions)} tone="warning" /> : null}
      </Group> : null}

      {steps.length ? <div data-planning-steps=""><h3 className="text-sm font-semibold text-foreground">{t.next}</h3><ul className="mt-2 grid gap-2 text-sm text-warning-soft-foreground sm:grid-cols-2">{steps.map(step => <li key={step} className="flex items-start gap-2"><AlertTriangle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />{step}</li>)}</ul></div> : null}
    </div>}
  </section>;
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return <div><h3 className="text-sm font-semibold text-foreground">{title}</h3><div className="mt-2 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{children}</div></div>;
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail?: string; tone?: "warning" | "danger" }) {
  return <div className="rounded-xl border border-border bg-white p-4"><div className="text-xs font-semibold text-muted-foreground">{label}</div><p className={`mt-2 text-lg font-semibold ${tone === "danger" ? "text-danger-soft-foreground" : tone === "warning" ? "text-warning-soft-foreground" : "text-foreground"}`}>{value}</p>{detail ? <p className="mt-1 text-xs text-muted-foreground">{detail}</p> : null}</div>;
}

/** What is missing, as one step: the sentence and, when the reader may import, its button. */
function Step({ title, action }: { title: string; action?: { label: string; run: () => void } }) {
  return <div data-planning-step="" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-border p-4"><p className="text-sm font-semibold text-foreground">{title}</p>{action ? <Button type="button" variant="outline" size="sm" onClick={action.run}>{action.label}</Button> : null}</div>;
}
