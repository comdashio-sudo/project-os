// Q-21 (c), backlog: what the company's existing contracts still have to earn, as the strategy model reads it (docs/proposals/q21-strategy-mapping.md,
// row «العقود القائمة»). For each project:
//   remaining   = the adjusted contract value (the original + approved change orders, domain/profitability.ts) − what was invoiced (issued or paid
//                 invoices), never below zero;
//   its shares  = a straight line over the months from this month to the project's planned finish, both included. A project whose planned finish has
//                 passed is still owed what is left: it falls in this month. A project with no planned finish cannot be placed in time: it is left out
//                 of the model and counted as «unscheduled» with its value, so the screen says so instead of guessing.
// The monthly planned shares of a PMC plan (pmc_plan_months) are not used yet: the straight line is the declared rule until they are.
import { adjustedContractValue, type ChangeOrder } from "./profitability";
import type { BacklogContract } from "./strategyModel";

export type BacklogProject = { code: string; contractValue: number; changeOrders: readonly ChangeOrder[]; invoiced: number; plannedFinishAt: string | null };
export type Backlog = { contracts: BacklogContract[]; scheduled: { count: number; remainingValue: number }; unscheduled: { count: number; remainingValue: number } };

const round2 = (value: number) => Math.round(value * 100) / 100;
/** Whole months from `fromMonth` (YYYY-MM) to the month of `toDate` (YYYY-MM-DD…), both included; at least 1. */
export function monthsInclusive(fromMonth: string, toDate: string): number {
  const [fy, fm] = fromMonth.split("-").map(Number); const [ty, tm] = toDate.slice(0, 7).split("-").map(Number);
  return Math.max(1, (ty - fy) * 12 + (tm - fm) + 1);
}

export function strategyBacklog(projects: readonly BacklogProject[], thisMonth: string): Backlog {
  const contracts: BacklogContract[] = []; let scheduledValue = 0; let unscheduledCount = 0; let unscheduledValue = 0;
  for (const project of projects) {
    const remainingValue = round2(Math.max(0, adjustedContractValue(project.contractValue, project.changeOrders).adjustedContractValue - project.invoiced));
    if (remainingValue === 0) continue;
    if (!project.plannedFinishAt) { unscheduledCount += 1; unscheduledValue += remainingValue; continue; }
    const months = monthsInclusive(thisMonth, project.plannedFinishAt);
    contracts.push({ code: project.code, remainingValue, monthlyShares: new Array<number>(months).fill(1) });
    scheduledValue += remainingValue;
  }
  return { contracts, scheduled: { count: contracts.length, remainingValue: round2(scheduledValue) }, unscheduled: { count: unscheduledCount, remainingValue: round2(unscheduledValue) } };
}
