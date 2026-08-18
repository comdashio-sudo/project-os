import { calculateEvm, type EacMethod, type EvmResult } from "./evm";

type ActivityInput = { plannedValue: string | number; plannedStartAt: Date | null; plannedFinishAt: Date | null };
type BudgetInput = { currentAmount: string | number };
type CostInput = { amount: string | number; status: string; entryType: string; incurredAt: Date };
type ProgressInput = { wbsItemId: string | null; progressPercent: string | number; status: string; measuredAt: Date };
type WbsInput = { id: string; plannedValue: string | number };

export type OperationalEvmInput = {
  periodAt: Date;
  activities: ActivityInput[];
  budgets: BudgetInput[];
  costs: CostInput[];
  progress: ProgressInput[];
  wbs: WbsInput[];
  eacMethod: Exclude<EacMethod, "manual">;
};

export type OperationalEvmSources = {
  scheduledActivities: number;
  scheduledActivityValue: number;
  budgetLines: number;
  postedActualCostEntries: number;
  latestSubmittedProgressEntries: number;
  wbsItemsWithProgress: number;
};

function numeric(value: string | number): number {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new RangeError("Operational EVM source contains a non-finite amount.");
  return result;
}

function plannedValueAt(activity: ActivityInput, periodAt: Date): number {
  if (!activity.plannedStartAt || !activity.plannedFinishAt) return 0;
  const value = numeric(activity.plannedValue);
  if (periodAt < activity.plannedStartAt) return 0;
  if (periodAt >= activity.plannedFinishAt || activity.plannedStartAt.getTime() === activity.plannedFinishAt.getTime()) return value;
  const complete = (periodAt.getTime() - activity.plannedStartAt.getTime()) / (activity.plannedFinishAt.getTime() - activity.plannedStartAt.getTime());
  return value * Math.max(0, Math.min(1, complete));
}

export function calculateOperationalEvm(input: OperationalEvmInput): EvmResult & { sources: OperationalEvmSources } {
  const scheduledActivities = input.activities.filter(activity => activity.plannedStartAt && activity.plannedFinishAt);
  const budgets = input.budgets.map(item => numeric(item.currentAmount));
  const postedCosts = input.costs.filter(item => item.status === "posted" && item.entryType === "actual" && item.incurredAt <= input.periodAt);
  const latestProgressByWbs = new Map<string, ProgressInput>();

  input.progress
    .filter(item => item.wbsItemId && item.status === "submitted" && item.measuredAt <= input.periodAt)
    .forEach(item => {
      const current = latestProgressByWbs.get(item.wbsItemId!);
      if (!current || item.measuredAt > current.measuredAt) latestProgressByWbs.set(item.wbsItemId!, item);
    });

  const wbsById = new Map(input.wbs.map(item => [item.id, numeric(item.plannedValue)]));
  const pv = scheduledActivities.reduce((total, activity) => total + plannedValueAt(activity, input.periodAt), 0);
  const ev = Array.from(latestProgressByWbs.entries()).reduce((total, [wbsItemId, progress]) => total + (wbsById.get(wbsItemId) ?? 0) * (numeric(progress.progressPercent) / 100), 0);
  const ac = postedCosts.reduce((total, entry) => total + numeric(entry.amount), 0);
  const bac = budgets.reduce((total, amount) => total + amount, 0);
  const sources: OperationalEvmSources = {
    scheduledActivities: scheduledActivities.length,
    scheduledActivityValue: scheduledActivities.reduce((total, activity) => total + numeric(activity.plannedValue), 0),
    budgetLines: input.budgets.length,
    postedActualCostEntries: postedCosts.length,
    latestSubmittedProgressEntries: latestProgressByWbs.size,
    wbsItemsWithProgress: Array.from(latestProgressByWbs.keys()).filter(id => wbsById.has(id)).length,
  };

  return { ...calculateEvm({ pv, ev, ac, bac, eacMethod: input.eacMethod }), sources };
}
