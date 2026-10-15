export type PmcUnitActivityStatus = "NOT_STARTED" | "IN_PROGRESS" | "UNDER_REVIEW" | "COMPLETE";

export type PmcActivityWeight = {
  activityCode: string;
  weightPercent: number;
};

export type PmcUnitProgressInput = {
  activities: Array<{ weightPercent: number; status: PmcUnitActivityStatus }>;
  statusFactors?: Partial<Record<PmcUnitActivityStatus, number>>;
};

export type PmcWeightedUnit = {
  progressPercent: number;
  unitWeight?: number;
};

export const DEFAULT_STATUS_FACTORS: Record<PmcUnitActivityStatus, number> = {
  NOT_STARTED: 0,
  IN_PROGRESS: 0,
  UNDER_REVIEW: 0,
  COMPLETE: 1,
};

function finiteNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be finite and non-negative.`);
}

function rounded(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function assertPercent(value: number, name: string): void {
  finiteNonNegative(value, name);
  if (value > 100) throw new RangeError(`${name} cannot exceed 100%.`);
}

/** Rule 4: every model's activity weights must total exactly 100% within storage precision. */
export function validateActivityWeights(weights: PmcActivityWeight[]): number {
  if (weights.length === 0) throw new RangeError("At least one activity weight is required.");
  const seen = new Set<string>();
  const total = weights.reduce((sum, item) => {
    if (!item.activityCode.trim()) throw new RangeError("Activity code cannot be blank.");
    if (seen.has(item.activityCode)) throw new RangeError(`Duplicate activity: ${item.activityCode}.`);
    seen.add(item.activityCode);
    finiteNonNegative(item.weightPercent, `Weight for ${item.activityCode}`);
    return sum + item.weightPercent;
  }, 0);
  if (Math.abs(total - 100) > 0.0001) throw new RangeError(`Activity weights must total 100%; received ${rounded(total)}%.`);
  return 100;
}

/** Rule 1: weighted unit progress, with tenant-configurable status factors. */
export function calculateUnitProgress(input: PmcUnitProgressInput): number {
  validateActivityWeights(input.activities.map((activity, index) => ({ activityCode: `activity-${index + 1}`, weightPercent: activity.weightPercent })));
  const factors = { ...DEFAULT_STATUS_FACTORS, ...input.statusFactors };
  for (const [status, factor] of Object.entries(factors)) assertPercent(factor * 100, `Factor for ${status}`);
  const progress = input.activities.reduce((sum, activity) => sum + activity.weightPercent * (factors[activity.status] ?? 0), 0);
  return rounded(progress);
}

/** Rule 2: project progress is weighted by unit weight, or equally when omitted. */
export function calculateProjectProgress(units: PmcWeightedUnit[]): number {
  if (units.length === 0) throw new RangeError("At least one unit is required.");
  const totalWeight = units.reduce((sum, unit) => {
    assertPercent(unit.progressPercent, "Unit progress");
    const weight = unit.unitWeight ?? 1;
    finiteNonNegative(weight, "Unit weight");
    return sum + weight;
  }, 0);
  if (totalWeight <= 0) throw new RangeError("Total unit weight must be greater than zero.");
  return rounded(units.reduce((sum, unit) => sum + unit.progressPercent * (unit.unitWeight ?? 1), 0) / totalWeight);
}

/** Rule 3: activity completion can never exceed 100%, including duplicate or bad source rows. */
export function calculateActivityCompletion(completedUnits: number, includedUnits: number): number {
  finiteNonNegative(completedUnits, "Completed units");
  finiteNonNegative(includedUnits, "Included units");
  if (completedUnits > includedUnits) throw new RangeError("Completed units cannot exceed included units.");
  return includedUnits === 0 ? 0 : rounded((completedUnits / includedUnits) * 100);
}

/** Rule 7: earned value is the WBS budget multiplied by normalized PMC progress. */
export function calculateEarnedValue(progressPercent: number, wbsBudget: number): number {
  assertPercent(progressPercent, "Progress");
  finiteNonNegative(wbsBudget, "WBS budget");
  return rounded((progressPercent / 100) * wbsBudget);
}

/** Rule 6: report ranges are always ordered from the first to the last unit number. */
export function normalizeUnitRange(unitNumbers: number[]): { from: number; to: number } {
  if (unitNumbers.length === 0) throw new RangeError("At least one unit number is required.");
  for (const number of unitNumbers) {
    if (!Number.isInteger(number) || number < 0) throw new RangeError("Unit numbers must be non-negative integers.");
  }
  return { from: Math.min(...unitNumbers), to: Math.max(...unitNumbers) };
}

/** Rule 5: every activity row must have a non-blank group, stage, and activity. */
export function assertActivityClassification(input: { groupCode?: string; stageCode?: string; activityCode?: string }): void {
  if (!input.groupCode?.trim() || !input.stageCode?.trim() || !input.activityCode?.trim()) {
    throw new RangeError("Every activity must have a group, stage, and activity classification.");
  }
}


/** The tenant's stored factors laid over the defaults. */
export function effectiveStatusFactors(rows: ReadonlyArray<{ status: PmcUnitActivityStatus; factor: string | number }>): Record<PmcUnitActivityStatus, number> {
  const factors = { ...DEFAULT_STATUS_FACTORS };
  for (const row of rows) factors[row.status] = Number(row.factor);
  return factors;
}
