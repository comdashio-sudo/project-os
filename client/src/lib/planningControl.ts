import { resolveLanguage, type Language } from "./language";
import { riyalLabel } from "./profitabilityView";

export type PlanningControlInput = {
  activities: Array<{ id: string; code: string; name: string; status: string; plannedStartAt?: Date | string | null; plannedFinishAt?: Date | string | null }>;
  boq: Array<{ id: string; code: string; description: string; quantity: string | number; unitRate: string | number; totalAmount: string | number; status: string; wbsItemId?: string | null }>;
  requisitions: Array<{ id: string; requisitionNumber: string; requestedQuantity: string | number; issuedQuantity: number; remainingQuantity: number; status: string; wbsItemId?: string | null; activityId?: string | null }>;
  budgets: Array<{ currentAmount: string | number }>;
  costs: Array<{ amount: string | number; status: string; wbsItemId?: string | null }>;
  commitments: Array<{ amount: string | number; status: string }>;
  warehouseBalances: Array<{ quantityOnHand: string | number }>;
  asOf?: Date;
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
    ...(budget <= 0 ? ["missing_budget"] : []),
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
    undatedActivities: undatedActivities.length,
    unlinkedBoqLines: unlinkedBoq.length,
    unlinkedCosts: unlinkedCosts.length,
    unfulfilledRequisitions: unfulfilledRequisitions.length,
    progressCoverage,
    dataGaps,
    riskLevel,
  } as const;
}

export type PlanningControlResult = ReturnType<typeof calculatePlanningControl>;

export function formatPlanningPercent(value: number | null) {
  return value === null ? "—" : `${(value * 100).toFixed(1)}%`;
}

/** V1 shows the riyal (see formatMoney): the stored code is ignored, and the label follows the language. */
export function formatPlanningAmount(value: number, currency: string, language: Language | boolean = false) {
  void currency;
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value) + ` ${riyalLabel(language)}`;
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
