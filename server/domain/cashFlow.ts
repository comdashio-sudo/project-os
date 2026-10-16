export type CashFlowInput = {
  budgetAmounts: readonly number[];
  costEntries: readonly { amount: number; status: "draft" | "posted" | "void" }[];
  /**
   * `settledAmount` is the part of the commitment that already became actual cost (goods received against it).
   * Counting the whole commitment next to that cost would count the received goods twice.
   */
  commitments: readonly { amount: number; status: string; settledAmount?: number }[];
  /**
   * Money held on warehouse shelves: received, paid for or owed, and not yet charged to any WBS item.
   * It is exposure beside actual cost and open commitment: leaving it out would make the budget look freer the day goods arrive
   * and tighter again the day they are issued. Issuing it to work moves it from here into actual cost, so exposure does not change.
   */
  inventoryValue?: number;
};

export function calculateOperationalCashFlow(input: CashFlowInput) {
  const plannedBudget = input.budgetAmounts.reduce((sum, amount) => sum + amount, 0);
  const actualCost = input.costEntries.filter(entry => entry.status !== "void").reduce((sum, entry) => sum + entry.amount, 0);
  const committedAmount = input.commitments.filter(entry => entry.status !== "cancelled").reduce((sum, entry) => sum + Math.max(0, entry.amount - (entry.settledAmount ?? 0)), 0);
  const inventoryValue = Math.max(0, input.inventoryValue ?? 0);
  const totalExposure = actualCost + committedAmount + inventoryValue;
  return { plannedBudget, actualCost, committedAmount, inventoryValue, totalExposure, remainingBudget: plannedBudget - totalExposure };
}

// ---------------------------------------------------------------- net cash flow by month (G-013)

export type CashMovement = { amount: number; at: Date };

const monthKey = (date: Date) => date.toISOString().slice(0, 7);
const nextMonth = (key: string) => { const [year, month] = key.split("-").map(Number); return new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 7); };
const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Money in (paid invoices, by the day they were paid) against money out (posted actual cost, by the day it was incurred),
 * month by month and cumulatively, with every month between the first and the last present so a quiet month shows as zero.
 * Cost is the platform's only record of money going out: it is an accrual proxy for payments, and the caller says so.
 */
export function monthlyNetCashFlow(input: { receipts: readonly CashMovement[]; outflows: readonly CashMovement[] }) {
  for (const movement of [...input.receipts, ...input.outflows]) if (!Number.isFinite(movement.amount)) throw new RangeError("A cash movement is not a finite number.");
  const receiptsByMonth = new Map<string, number>();
  const outflowsByMonth = new Map<string, number>();
  for (const movement of input.receipts) receiptsByMonth.set(monthKey(movement.at), (receiptsByMonth.get(monthKey(movement.at)) ?? 0) + movement.amount);
  for (const movement of input.outflows) outflowsByMonth.set(monthKey(movement.at), (outflowsByMonth.get(monthKey(movement.at)) ?? 0) + movement.amount);
  const keys = [...Array.from(receiptsByMonth.keys()), ...Array.from(outflowsByMonth.keys())].sort();
  if (!keys.length) return { months: [] as Array<{ month: string; receipts: number; outflows: number; net: number; cumulative: number }>, totals: { receipts: 0, outflows: 0, net: 0 }, lowestCumulative: null as null | { month: string; cumulative: number } };
  let cumulative = 0;
  const months: Array<{ month: string; receipts: number; outflows: number; net: number; cumulative: number }> = [];
  for (let key = keys[0]; key <= keys[keys.length - 1]; key = nextMonth(key)) {
    const receipts = receiptsByMonth.get(key) ?? 0;
    const outflows = outflowsByMonth.get(key) ?? 0;
    cumulative += receipts - outflows;
    months.push({ month: key, receipts: round2(receipts), outflows: round2(outflows), net: round2(receipts - outflows), cumulative: round2(cumulative) });
  }
  const receipts = months.reduce((total, row) => total + row.receipts, 0);
  const outflows = months.reduce((total, row) => total + row.outflows, 0);
  const lowest = months.reduce((low, row) => (row.cumulative < low.cumulative ? row : low), months[0]);
  return { months, totals: { receipts: round2(receipts), outflows: round2(outflows), net: round2(receipts - outflows) }, lowestCumulative: { month: lowest.month, cumulative: lowest.cumulative } };
}
