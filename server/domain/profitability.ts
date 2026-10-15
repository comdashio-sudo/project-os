// Project profitability (FPAC) as pure functions. No database, no clock: every
// input is passed in, so each figure can be reproduced by hand from the numbers
// the screen shows next to it (WORK_ORDER_PROJECT_PL.md).
//
//   adjusted contract = original contract + approved change orders (approved only)
//   FPAC              = adjusted contract - EAC
//   EAC               = taken from the EVM engine (evm.ts), never recomputed here

export const ROUNDING_CENTS = 100;
export const round2 = (value: number) => Math.round((value + Number.EPSILON) * ROUNDING_CENTS) / ROUNDING_CENTS;

function finite(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new RangeError(`${name} must be a finite number.`);
  return value;
}

const percentOf = (part: number, whole: number): number | null => (whole === 0 ? null : round2((part / whole) * 100));

// ---------------------------------------------------------------- contract value

export type ChangeOrder = { id?: string; status: string; contractValueImpact: number };

export function adjustedContractValue(originalContractValue: number, changeOrders: readonly ChangeOrder[]) {
  finite(originalContractValue, "Original contract value");
  const approved = changeOrders.filter(order => order.status === "approved");
  const approvedChanges = round2(approved.reduce((total, order) => total + finite(order.contractValueImpact, "Change order impact"), 0));
  return {
    originalContractValue: round2(originalContractValue),
    approvedChanges,
    adjustedContractValue: round2(originalContractValue + approvedChanges),
    countedChangeOrders: approved.length,
    ignoredChangeOrders: changeOrders.length - approved.length,
  };
}

// ---------------------------------------------------------------- the headline figure

export function fpac(input: { adjustedContractValue: number; eac: number }) {
  finite(input.adjustedContractValue, "Adjusted contract value");
  finite(input.eac, "EAC");
  const value = round2(input.adjustedContractValue - input.eac);
  return { fpac: value, marginPercent: percentOf(value, input.adjustedContractValue), isLoss: value < 0 };
}

export function plannedProfit(input: { originalContractValue: number; bac: number }) {
  finite(input.originalContractValue, "Original contract value");
  finite(input.bac, "BAC");
  const value = round2(input.originalContractValue - input.bac);
  return { plannedProfit: value, plannedMarginPercent: percentOf(value, input.originalContractValue) };
}

export const profitVariance = (fpacValue: number, plannedProfitValue: number) => round2(fpacValue - plannedProfitValue);

// ---------------------------------------------------------------- movement

export type ProfitPosition = { adjustedContractValue: number; actualCost: number; forecastToComplete: number };

export type FpacCause = "contractValue" | "actualCost" | "forecastToComplete";

/**
 * Why FPAC moved, in exactly three additive causes. Because EAC = AC + ETC,
 *   FPAC = contract - AC - ETC, so
 *   delta = (change in contract) + (-(change in AC)) + (-(change in ETC)).
 * The causes are rounded to cents; any rounding residue (at most one cent) is
 * folded into the forecast cause so that the three always add up to the delta.
 */
export function fpacMovement(now: ProfitPosition, last: ProfitPosition) {
  const fpacNow = round2(now.adjustedContractValue - now.actualCost - now.forecastToComplete);
  const fpacLast = round2(last.adjustedContractValue - last.actualCost - last.forecastToComplete);
  const delta = round2(fpacNow - fpacLast);
  const contractValue = round2(now.adjustedContractValue - last.adjustedContractValue);
  const actualCost = round2(-(now.actualCost - last.actualCost));
  const forecastToComplete = round2(delta - contractValue - actualCost);
  const causes: Record<FpacCause, number> = { contractValue, actualCost, forecastToComplete };
  const dominantCause = delta === 0 && contractValue === 0 && actualCost === 0 ? null : (Object.keys(causes) as FpacCause[]).reduce((a, b) => (Math.abs(causes[b]) > Math.abs(causes[a]) ? b : a));
  return {
    fpacNow,
    fpacLast,
    delta,
    deltaPercent: fpacLast === 0 ? null : round2((delta / Math.abs(fpacLast)) * 100),
    direction: delta > 0 ? ("up" as const) : delta < 0 ? ("down" as const) : ("flat" as const),
    causes,
    dominantCause,
  };
}

export type WbsEac = { wbsItemId: string; code?: string; name?: string; eac: number };

export type WbsMovementRow = { wbsItemId: string; code?: string; name?: string; eacNow: number; eacLast: number; eacDelta: number; profitEffect: number; isNew: boolean; isRemoved: boolean };

/**
 * Per-WBS change in EAC since the last snapshot, largest absolute change first.
 * A higher EAC lowers profit, so profitEffect = -eacDelta. An item missing from
 * the last snapshot counts from zero (isNew); one missing now counts to zero (isRemoved).
 */
export function wbsMovement(now: readonly WbsEac[], last: readonly WbsEac[], limit = 5) {
  const lastById = new Map(last.map(item => [item.wbsItemId, item]));
  const nowById = new Map(now.map(item => [item.wbsItemId, item]));
  const ids = Array.from(new Set([...now.map(item => item.wbsItemId), ...last.map(item => item.wbsItemId)]));
  const rows: WbsMovementRow[] = ids.map(wbsItemId => {
    const current = nowById.get(wbsItemId);
    const previous = lastById.get(wbsItemId);
    const eacNow = round2(current?.eac ?? 0);
    const eacLast = round2(previous?.eac ?? 0);
    const eacDelta = round2(eacNow - eacLast);
    return { wbsItemId, code: current?.code ?? previous?.code, name: current?.name ?? previous?.name, eacNow, eacLast, eacDelta, profitEffect: round2(-eacDelta), isNew: !previous, isRemoved: !current };
  }).filter(row => row.eacDelta !== 0);
  rows.sort((a, b) => Math.abs(b.eacDelta) - Math.abs(a.eacDelta) || (a.code ?? a.wbsItemId).localeCompare(b.code ?? b.wbsItemId));
  return {
    rows,
    raisedProfit: rows.filter(row => row.profitEffect > 0).slice(0, limit),
    loweredProfit: rows.filter(row => row.profitEffect < 0).slice(0, limit),
    totalEacDelta: round2(rows.reduce((total, row) => total + row.eacDelta, 0)),
  };
}

// ---------------------------------------------------------------- profit is not cash

/** Purchase-order value still open: what has neither been received nor invoiced. */
export function openCommitment(input: { orderValue: number; receivedValue: number; invoicedValue: number }) {
  const order = finite(input.orderValue, "Order value");
  const settled = Math.max(finite(input.receivedValue, "Received value"), finite(input.invoicedValue, "Invoiced value"));
  return round2(Math.max(0, order - settled));
}

/** The case the screen must say out loud: a positive profit with a negative cash flow. */
export function profitCashWarning(input: { fpac: number; netCashFlow: number }) {
  const active = input.fpac > 0 && input.netCashFlow < 0;
  return { active, fpac: round2(input.fpac), netCashFlow: round2(input.netCashFlow), gap: active ? round2(input.fpac - input.netCashFlow) : 0 };
}

// ---------------------------------------------------------------- loaded labour cost

export type LoadedLabourInput = {
  basicSalary: number;
  allowances: number;
  employerSocialInsurance: number;
  accruedEndOfService: number;
  /** Tenant-configured indirect cost for the same period (supervision, tools, insurance...). */
  tenantIndirects: number;
  workedHours: number;
};

/**
 * (basic + allowances + employer social insurance + accrued end of service
 *  + tenant indirects) / actual worked hours. The loading factor (total over
 * basic + allowances) is returned beside the hourly cost so the screen can show it.
 */
export function loadedHourlyCost(input: LoadedLabourInput) {
  const parts = [input.basicSalary, input.allowances, input.employerSocialInsurance, input.accruedEndOfService, input.tenantIndirects];
  parts.forEach((part, index) => { if (!Number.isFinite(part) || part < 0) throw new RangeError(`Loaded labour component ${index} must be a finite non-negative number.`); });
  if (!Number.isFinite(input.workedHours) || input.workedHours < 0) throw new RangeError("Worked hours must be a finite non-negative number.");
  const total = round2(parts.reduce((sum, part) => sum + part, 0));
  const direct = input.basicSalary + input.allowances;
  return {
    totalLoadedCost: total,
    hourlyCost: input.workedHours === 0 ? null : round2(total / input.workedHours),
    loadingFactor: direct === 0 ? null : Math.round((total / direct) * 10000) / 10000,
  };
}

// ---------------------------------------------------------------- confidence in the number

export type FreshnessSource = "progress" | "materials" | "labour";

export type FreshnessInput = {
  now: Date;
  /** Last update of each source, or null when it never happened. */
  sources: Record<FreshnessSource, Date | null>;
  /** Last progress measurement of each WBS item that is expected to be reported. */
  wbsProgressDates: ReadonlyArray<Date | null>;
  staleAfterDays?: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;
const daysBetween = (later: Date, earlier: Date) => Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / DAY_MS));

export type FreshnessLevel = "fresh" | "stale" | "unknown";

export function dataFreshness(input: FreshnessInput) {
  const staleAfterDays = input.staleAfterDays ?? 7;
  const perSource = (Object.keys(input.sources) as FreshnessSource[]).map(source => {
    const last = input.sources[source];
    return { source, lastUpdatedAt: last, ageDays: last ? daysBetween(input.now, last) : null };
  });
  const updatedRecently = input.wbsProgressDates.filter(date => date && daysBetween(input.now, date) <= staleAfterDays).length;
  const percentWbsUpdated = input.wbsProgressDates.length === 0 ? null : Math.round((updatedRecently / input.wbsProgressDates.length) * 100);
  const known = perSource.filter(item => item.ageDays !== null) as Array<{ source: FreshnessSource; lastUpdatedAt: Date; ageDays: number }>;
  const staleSources = perSource.filter(item => item.ageDays === null || item.ageDays > staleAfterDays).map(item => item.source);
  const oldest = known.length === perSource.length ? known.reduce((a, b) => (b.ageDays > a.ageDays ? b : a)) : null;
  const neverUpdated = perSource.filter(item => item.ageDays === null).map(item => item.source);
  const level: FreshnessLevel = known.length === 0 ? "unknown" : staleSources.length > 0 ? "stale" : "fresh";
  return {
    level,
    staleAfterDays,
    perSource,
    percentWbsUpdated,
    staleSources,
    neverUpdated,
    /** The source to open first: never updated beats oldest. */
    stalestSource: neverUpdated[0] ?? oldest?.source ?? null,
    oldestAgeDays: oldest?.ageDays ?? null,
  };
}

// ---------------------------------------------------------------- portfolio

export type ProjectProfitRow = { projectId: string; fpac: number; movement?: number | null };

/** Losing projects first, then by how little they earn: the order a manager needs. */
export function orderProjectsByRisk<T extends ProjectProfitRow>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => Number(b.fpac < 0) - Number(a.fpac < 0) || a.fpac - b.fpac || a.projectId.localeCompare(b.projectId));
}

export const portfolioFpac = (rows: readonly ProjectProfitRow[]) => round2(rows.reduce((total, row) => total + row.fpac, 0));
