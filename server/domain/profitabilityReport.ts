// Composes the profitability screen from plain rows. Pure: the caller loads the
// rows (and checks access); nothing here reads a database or a clock.
//
// Every section reports for itself: "ok" with its numbers, or "unavailable"
// with a reason code. A section never shows zero for an input it does not have.
import {
  adjustedContractValue,
  dataFreshness,
  fpac,
  fpacMovement,
  openCommitment,
  plannedProfit,
  profitCashWarning,
  profitVariance,
  round2,
  wbsMovement,
  type ChangeOrder,
  type WbsEac,
} from "./profitability";

export type Section<T> = { status: "ok"; data: T } | { status: "unavailable"; reason: string };
const ok = <T>(data: T): Section<T> => ({ status: "ok", data });
const unavailable = (reason: string): Section<never> => ({ status: "unavailable", reason });

export type EacMethodUsed = "ac_plus_remaining" | "bac_over_cpi" | "ac_plus_remaining_over_cpi_spi";

type Num = string | number;
const n = (value: Num) => {
  const result = Number(value);
  if (!Number.isFinite(result)) throw new RangeError("A profitability input is not a finite number.");
  return result;
};

// ---------------------------------------------------------------- per-WBS EAC

export type WbsInputRow = { id: string; code: string; name: string };
export type BudgetRow = { wbsItemId: string | null; currentAmount: Num };
export type CostRow = { wbsItemId: string | null; amount: Num; status: string; entryType: string; incurredAt: Date; category?: string; sourceType?: string | null; sourceId?: string | null; id?: string };
export type ProgressRow = { wbsItemId: string | null; progressPercent: Num; status: string; measuredAt: Date };

export type WbsEacRow = WbsEac & { code: string; name: string; bac: number; ac: number; progressPercent: number; method: EacMethodUsed };

/**
 * EAC of each WBS item from its own budget, posted actual cost and latest
 * submitted progress. The EVM engine works on project totals and cannot say
 * where a movement came from, so this is a separate, deliberately simple view:
 *   EV = BAC x progress;  EAC = AC + (BAC - EV)  (or BAC / CPI when asked and defined).
 * Cost with no WBS item is returned as `unallocated` so nothing disappears.
 */
export function wbsEacRows(input: { periodAt: Date; method: EacMethodUsed; wbs: readonly WbsInputRow[]; budgets: readonly BudgetRow[]; costs: readonly CostRow[]; progress: readonly ProgressRow[] }) {
  const posted = input.costs.filter(cost => cost.status === "posted" && cost.entryType === "actual" && cost.incurredAt <= input.periodAt);
  const latest = new Map<string, ProgressRow>();
  for (const row of input.progress) {
    if (!row.wbsItemId || row.status !== "submitted" || row.measuredAt > input.periodAt) continue;
    const current = latest.get(row.wbsItemId);
    if (!current || row.measuredAt > current.measuredAt) latest.set(row.wbsItemId, row);
  }
  const sum = (rows: Array<{ amount: Num }>) => rows.reduce((total, row) => total + n(row.amount), 0);

  const rows: WbsEacRow[] = input.wbs.map(item => {
    const bac = input.budgets.filter(b => b.wbsItemId === item.id).reduce((total, b) => total + n(b.currentAmount), 0);
    const ac = sum(posted.filter(c => c.wbsItemId === item.id));
    const progressPercent = Math.min(100, Math.max(0, latest.has(item.id) ? n(latest.get(item.id)!.progressPercent) : 0));
    const ev = bac * (progressPercent / 100);
    let method: EacMethodUsed = "ac_plus_remaining";
    let eac = ac + Math.max(0, bac - ev);
    if (input.method === "bac_over_cpi" && ac > 0 && ev > 0) {
      method = "bac_over_cpi";
      eac = bac / (ev / ac);
    }
    return { wbsItemId: item.id, code: item.code, name: item.name, bac: round2(bac), ac: round2(ac), progressPercent, eac: round2(eac), method };
  }).filter(row => row.bac !== 0 || row.ac !== 0);

  const unallocatedActual = round2(sum(posted.filter(c => !c.wbsItemId || !input.wbs.some(w => w.id === c.wbsItemId))));
  return { rows, unallocatedActual, totalEac: round2(rows.reduce((t, r) => t + r.eac, 0) + unallocatedActual), totalAc: round2(rows.reduce((t, r) => t + r.ac, 0) + unallocatedActual) };
}

// ---------------------------------------------------------------- the report

export type SnapshotInput = { periodAt: Date; adjustedContractValue: number | null; ac: number; etc: number; fpac: number | null; wbs: readonly WbsEac[] };

export type ProfitabilityReportInput = {
  now: Date;
  project: { id: string; code: string; name: string; currency: string; contractValue: Num; updatedAt?: Date };
  changeOrders: readonly ChangeOrder[];
  changeOrdersAsOf: Date | null;
  /** The live EVM engine's result, or why it could not run. */
  evm: { eac: number; ac: number; etc: number; bac: number } | { error: string };
  wbs: { rows: readonly WbsEacRow[]; unallocatedActual: number } | null;
  lastSnapshot: SnapshotInput | null;
  /** The open (ordered, not yet received) part of purchase orders, per WBS item and without one. Null when the sources cannot be read. */
  wbsCommitted?: { byWbs: Record<string, number>; unallocated: number; total: number } | null;
  /** Purchase orders: value ordered, received and invoiced. Null when the sources cannot be read. */
  commitments: { orderValue: number; receivedValue: number; invoicedValue: number } | null;
  cash: { receipts: number; outflows: number } | null;
  freshness: { progress: Date | null; materials: Date | null; labour: Date | null; wbsProgressDates: ReadonlyArray<Date | null> };
};

export type FormulaRow = { key: string; value: number | null; formula: string; source: string; asOf: string | null };

export function buildProfitabilityReport(input: ProfitabilityReportInput) {
  const asOf = input.now.toISOString();
  const contract = adjustedContractValue(n(input.project.contractValue), input.changeOrders);

  // Headline: needs the EVM engine.
  const headline: Section<{
    contract: ReturnType<typeof adjustedContractValue>;
    eac: number;
    fpac: number;
    marginPercent: number | null;
    isLoss: boolean;
    plannedProfit: number;
    plannedMarginPercent: number | null;
    profitVariance: number;
    rows: FormulaRow[];
  }> = "error" in input.evm
    ? unavailable(input.evm.error)
    : (() => {
        const result = fpac({ adjustedContractValue: contract.adjustedContractValue, eac: input.evm.eac });
        const planned = plannedProfit({ originalContractValue: contract.originalContractValue, bac: input.evm.bac });
        const variance = profitVariance(result.fpac, planned.plannedProfit);
        const rows: FormulaRow[] = [
          { key: "originalContract", value: contract.originalContractValue, formula: "project.contractValue", source: "project", asOf: input.project.updatedAt?.toISOString() ?? asOf },
          { key: "approvedChanges", value: contract.approvedChanges, formula: "sum(approved change orders)", source: "changeOrders", asOf: input.changeOrdersAsOf?.toISOString() ?? null },
          { key: "adjustedContract", value: contract.adjustedContractValue, formula: "original + approved changes", source: "computed", asOf },
          { key: "eac", value: round2(input.evm.eac), formula: "EVM engine", source: "operationalRecords", asOf },
          { key: "fpac", value: result.fpac, formula: "adjusted contract - EAC", source: "computed", asOf },
          { key: "margin", value: result.marginPercent, formula: "FPAC / adjusted contract", source: "computed", asOf },
          { key: "plannedProfit", value: planned.plannedProfit, formula: "original contract - BAC", source: "computed", asOf },
          { key: "profitVariance", value: variance, formula: "FPAC - planned profit", source: "computed", asOf },
        ];
        return ok({ contract, eac: round2(input.evm.eac), fpac: result.fpac, marginPercent: result.marginPercent, isLoss: result.isLoss, plannedProfit: planned.plannedProfit, plannedMarginPercent: planned.plannedMarginPercent, profitVariance: variance, rows });
      })();

  // Movement since the last snapshot that carries a profitability position.
  const movement = (() => {
    if ("error" in input.evm) return unavailable(input.evm.error);
    const last = input.lastSnapshot;
    if (!last || last.adjustedContractValue === null) return unavailable("NO_PREVIOUS_SNAPSHOT");
    const position = fpacMovement(
      { adjustedContractValue: contract.adjustedContractValue, actualCost: input.evm.ac, forecastToComplete: input.evm.etc },
      { adjustedContractValue: last.adjustedContractValue, actualCost: last.ac, forecastToComplete: last.etc },
    );
    const byWbs = input.wbs && last.wbs.length > 0 ? wbsMovement(input.wbs.rows, last.wbs) : null;
    return ok({ since: last.periodAt.toISOString(), ...position, wbs: byWbs });
  })();

  // Profit is not cash.
  const cash = (() => {
    if (!input.commitments || !input.cash) return unavailable("CASH_SOURCES_UNAVAILABLE");
    const netCashFlow = round2(input.cash.receipts - input.cash.outflows);
    const open = openCommitment(input.commitments);
    const warning = headline.status === "ok" ? profitCashWarning({ fpac: headline.data.fpac, netCashFlow }) : null;
    return ok({ openCommitment: open, receipts: round2(input.cash.receipts), outflows: round2(input.cash.outflows), netCashFlow, warning });
  })();

  const freshness = dataFreshness({ now: input.now, sources: { progress: input.freshness.progress, materials: input.freshness.materials, labour: input.freshness.labour }, wbsProgressDates: input.freshness.wbsProgressDates });

  // Where the number can be explained: the five WBS items that matter most, with their gap to plan.
  const drill = (() => {
    if (!input.wbs) return unavailable("WBS_UNAVAILABLE");
    const items = input.wbs.rows
      .map(row => ({ wbsItemId: row.wbsItemId, code: row.code, name: row.name, planned: row.bac, actual: row.ac, committed: round2(input.wbsCommitted?.byWbs[row.wbsItemId] ?? 0), forecast: row.eac, variance: round2(row.bac - row.eac) }))
      .sort((a, b) => a.variance - b.variance || a.code.localeCompare(b.code))
      .slice(0, 5);
    // The top of the drill: the whole project with the same five figures, so every level reads the same way.
    const planned = round2(input.wbs.rows.reduce((t, r) => t + r.bac, 0));
    const actual = round2(input.wbs.rows.reduce((t, r) => t + r.ac, 0) + input.wbs.unallocatedActual);
    const forecast = round2(input.wbs.rows.reduce((t, r) => t + r.eac, 0) + input.wbs.unallocatedActual);
    const totals = { planned, actual, committed: round2(input.wbsCommitted?.total ?? 0), forecast, variance: round2(planned - forecast) };
    const reconciliation = "error" in input.evm ? null : round2(input.evm.eac - (input.wbs.rows.reduce((t, r) => t + r.eac, 0) + input.wbs.unallocatedActual));
    return ok({ items, totals, unallocatedActual: input.wbs.unallocatedActual, reconciliationDifference: reconciliation });
  })();

  return { project: { id: input.project.id, code: input.project.code, name: input.project.name, currency: input.project.currency }, generatedAt: asOf, headline, movement, cash, freshness, drill };
}

export type ProfitabilityReport = ReturnType<typeof buildProfitabilityReport>;
