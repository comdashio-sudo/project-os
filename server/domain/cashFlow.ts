export type CashFlowInput = {
  budgetAmounts: readonly number[];
  costEntries: readonly { amount: number; status: "draft" | "posted" | "void" }[];
  commitments: readonly { amount: number; status: string }[];
};

export function calculateOperationalCashFlow(input: CashFlowInput) {
  const plannedBudget = input.budgetAmounts.reduce((sum, amount) => sum + amount, 0);
  const actualCost = input.costEntries.filter(entry => entry.status !== "void").reduce((sum, entry) => sum + entry.amount, 0);
  const committedAmount = input.commitments.filter(entry => entry.status !== "cancelled").reduce((sum, entry) => sum + entry.amount, 0);
  const totalExposure = actualCost + committedAmount;
  return { plannedBudget, actualCost, committedAmount, totalExposure, remainingBudget: plannedBudget - totalExposure };
}
