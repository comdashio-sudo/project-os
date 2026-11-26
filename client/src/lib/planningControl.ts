import { resolveLanguage, type Language } from "./language";
import { formatAmount, formatPercent } from "@/components/ds/format";
import { riyalLabel } from "./profitabilityView";

export type PlanningControlInput = {
  activities: Array<{ id: string; code: string; name: string; status: string; plannedStartAt?: Date | string | null; plannedFinishAt?: Date | string | null }>;
  boq: Array<{ id: string; code: string; description: string; quantity: string | number; unitRate: string | number | null; totalAmount: string | number | null; status: string; wbsItemId?: string | null }>;
  requisitions: Array<{ id: string; requisitionNumber: string; requestedQuantity: string | number; issuedQuantity: number; remainingQuantity: number; status: string; wbsItemId?: string | null; activityId?: string | null }>;
  budgets: Array<{ currentAmount: string | number }>;
  costs: Array<{ amount: string | number; status: string; wbsItemId?: string | null }>;
  commitments: Array<{ amount: string | number | null; status: string }>;
  warehouseBalances: Array<{ quantityOnHand: string | number }>;
  asOf?: Date;
  /** Q-17 (205-1): false when the reader may not see the project's money (the amounts arrive empty): no money gap is reported then. */
  moneyVisible?: boolean;
};

const number = (value: string | number | null | undefined) => {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
};

export function calculatePlanningControl(input: PlanningControlInput) {
  const asOf = input.asOf ?? new Date();
  const activeBoq = input.boq.filter(item => item.status === "active");
  const budget = input.budgets.reduce((sum, item) => sum + number(item.currentAmount), 0);
  const postedActual = input.costs.filter(item => item.status === "posted").reduce((sum, item) => sum + number(item.amount), 0);
  const openCommitments = input.commitments.filter(item => !["cancelled", "closed"].includes(item.status)).reduce((sum, item) => sum + number(item.amount), 0);
  const boqValue = activeBoq.reduce((sum, item) => sum + number(item.totalAmount || number(item.quantity) * number(item.unitRate)), 0);
  const requestedQuantity = input.requisitions.reduce((sum, item) => sum + number(item.requestedQuantity), 0);
  const issuedQuantity = input.requisitions.reduce((sum, item) => sum + number(item.issuedQuantity), 0);
  const remainingQuantity = input.requisitions.reduce((sum, item) => sum + number(item.remainingQuantity), 0);
  const onHandQuantity = input.warehouseBalances.reduce((sum, item) => sum + number(item.quantityOnHand), 0);
  const overdueActivities = input.activities.filter(item => item.plannedFinishAt && new Date(item.plannedFinishAt) < asOf && item.status !== "completed");
  const undatedActivities = input.activities.filter(item => !item.plannedStartAt || !item.plannedFinishAt);
  const unlinkedBoq = activeBoq.filter(item => !item.wbsItemId);
  const unlinkedCosts = input.costs.filter(item => item.status === "posted" && !item.wbsItemId);
  const unfulfilledRequisitions = input.requisitions.filter(item => number(item.remainingQuantity) > 0 && !["cancelled", "closed"].includes(item.status));
  const exposure = postedActual + openCommitments;
  const variance = budget - exposure;
  const costUtilization = budget > 0 ? exposure / budget : null;
  const progressCoverage = input.activities.length > 0 ? input.activities.filter(item => item.status !== "not_started").length / input.activities.length : null;
  const dataGaps = [
    ...(budget <= 0 && input.moneyVisible !== false ? ["missing_budget"] : []),
    ...(input.activities.length === 0 ? ["missing_schedule"] : []),
    ...(undatedActivities.length > 0 ? ["undated_activities"] : []),
    ...(unlinkedBoq.length > 0 ? ["unlinked_boq"] : []),
    ...(unlinkedCosts.length > 0 ? ["unlinked_actual_cost"] : []),
  ];
  const riskLevel = dataGaps.length > 0 || overdueActivities.length > 0 || (costUtilization !== null && costUtilization > 1) || unfulfilledRequisitions.length > 0 ? "attention" : "controlled";
  return {
    budget,
    postedActual,
    openCommitments,
    exposure,
    variance,
    costUtilization,
    boqValue,
    activeBoqLines: activeBoq.length,
    requestedQuantity,
    issuedQuantity,
    remainingQuantity,
    onHandQuantity,
    overdueActivities: overdueActivities.length,
    blockedActivities: input.activities.filter(item => item.status === "blocked").length,
    activityCount: input.activities.length,
    startedActivities: input.activities.filter(item => item.status !== "not_started").length,
    undatedActivities: undatedActivities.length,
    unlinkedBoqLines: unlinkedBoq.length,
    unlinkedCosts: unlinkedCosts.length,
    unfulfilledRequisitions: unfulfilledRequisitions.length,
    progressCoverage,
    dataGaps,
    riskLevel,
    moneyVisible: input.moneyVisible !== false,
  } as const;
}

export type PlanningControlResult = ReturnType<typeof calculatePlanningControl>;

export function formatPlanningPercent(value: number | null) {
  return value === null ? "—" : formatPercent(value * 100, 1);
}

/** V1 shows the riyal (see formatMoney): the stored code is ignored, and the label follows the language. */
export function formatPlanningAmount(value: number, currency: string, language: Language | boolean = false) {
  void currency;
  return formatAmount(value, 2) + ` ${riyalLabel(language)}`;
}

export function planningControlLabel(code: string, language: Language | boolean) {
  const labels: Record<string, Record<Language, string>> = {
    missing_budget: { ar: "لا توجد ميزانية", en: "Budget is missing", ur: "بجٹ موجود نہیں ہے" },
    missing_schedule: { ar: "لا يوجد برنامج", en: "Schedule is missing", ur: "شیڈول موجود نہیں ہے" },
    undated_activities: { ar: "أنشطة بلا تواريخ", en: "Activities need dates", ur: "سرگرمیوں کو تاریخوں کی ضرورت ہے" },
    unlinked_boq: { ar: "بنود BOQ غير مربوطة بـWBS", en: "BOQ lines are not linked to WBS", ur: "BOQ کی سطریں WBS سے نہیں جڑیں" },
    unlinked_actual_cost: { ar: "تكاليف فعلية بلا WBS", en: "Actual costs are not linked to WBS", ur: "اصل لاگتیں WBS سے نہیں جڑیں" },
  };
  return labels[code]?.[resolveLanguage(language)] ?? code;
}

/**
 * Q-64: the planning page's one sentence, from the data and in a planner's words: how many activities there are, how many have started, how many are late
 * and blocked, and — only when there is a budget the reader may see — what has been spent against it. With no activities it says what is missing, never a zero.
 */
export function planningHeadline(result: PlanningControlResult, currency: string, language: Language | boolean) {
  const lang = resolveLanguage(language);
  const amount = (value: number) => formatPlanningAmount(value, currency, language);
  if (result.activityCount === 0) {
    return { ar: "لا جدول زمني بعد: ارفع جدولك لترى التقدّم والأنشطة المتأخرة هنا.", en: "There is no schedule yet: upload yours to see progress and late activities here.", ur: "ابھی کوئی شیڈول نہیں: پیش رفت اور تاخیر والی سرگرمیاں دیکھنے کے لیے اپنا شیڈول اپ لوڈ کریں۔" }[lang];
  }
  const started = formatPlanningPercent(result.progressCoverage);
  const spent = result.moneyVisible && result.budget > 0 && result.costUtilization !== null ? { ar: ` أُنفق ${amount(result.exposure)} من ميزانية ${amount(result.budget)} (${formatPercent(result.costUtilization * 100, 0)}).`, en: ` ${amount(result.exposure)} spent of a ${amount(result.budget)} budget (${formatPercent(result.costUtilization * 100, 0)}).`, ur: ` ${amount(result.budget)} کے بجٹ میں سے ${amount(result.exposure)} خرچ ہوئے (${formatPercent(result.costUtilization * 100, 0)})۔` }[lang] : "";
  const n = formatAmount(result.activityCount, 0); const s = formatAmount(result.startedActivities, 0); const late = formatAmount(result.overdueActivities, 0); const blocked = formatAmount(result.blockedActivities, 0);
  const text = {
    ar: `${n} نشاطًا، بدأ منها ${s} (${started})، ${result.overdueActivities > 0 ? `${late} متأخرة عن موعدها` : "لا متأخر منها"}${result.blockedActivities > 0 ? `، و${blocked} متعثرة` : ""}.`,
    en: `${n} activities, ${s} started (${started}), ${result.overdueActivities > 0 ? `${late} past their planned finish` : "none behind"}${result.blockedActivities > 0 ? `, ${blocked} blocked` : ""}.`,
    ur: `${n} سرگرمیاں، ${s} شروع ہو چکی ہیں (${started})، ${result.overdueActivities > 0 ? `${late} طے شدہ تاریخ سے پیچھے` : "کوئی پیچھے نہیں"}${result.blockedActivities > 0 ? `، ${blocked} رکی ہوئی` : ""}۔`,
  }[lang];
  return text + spent;
}
