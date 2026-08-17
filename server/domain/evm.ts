export type EacMethod = "bac_over_cpi" | "ac_plus_remaining" | "ac_plus_remaining_over_cpi_spi" | "manual";

export type EvmInput = {
  pv: number;
  ev: number;
  ac: number;
  bac: number;
  eacMethod: EacMethod;
  manualEac?: number;
};

export type EvmResult = {
  pv: number;
  ev: number;
  ac: number;
  bac: number;
  cv: number;
  sv: number;
  cpi: number | null;
  spi: number | null;
  eac: number;
  etc: number;
  vac: number;
  tcpi: number | null;
  eacMethod: EacMethod;
  meaning: string;
  recommendedAction: string;
};

function finiteNonNegative(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) throw new RangeError(`${name} must be a finite non-negative number.`);
}

function rounded(value: number): number {
  return Math.round((value + Number.EPSILON) * 10000) / 10000;
}

function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : rounded(numerator / denominator);
}

export function calculateEvm(input: EvmInput): EvmResult {
  finiteNonNegative(input.pv, "PV");
  finiteNonNegative(input.ev, "EV");
  finiteNonNegative(input.ac, "AC");
  finiteNonNegative(input.bac, "BAC");
  if (input.manualEac !== undefined) finiteNonNegative(input.manualEac, "Manual EAC");
  if (input.ev > input.bac) throw new RangeError("EV cannot exceed BAC.");

  const cv = rounded(input.ev - input.ac);
  const sv = rounded(input.ev - input.pv);
  const cpi = ratio(input.ev, input.ac);
  const spi = ratio(input.ev, input.pv);
  const remainingBudget = input.bac - input.ev;

  let eac: number;
  switch (input.eacMethod) {
    case "bac_over_cpi":
      if (!cpi || cpi <= 0) throw new RangeError("CPI must be greater than zero for BAC/CPI EAC.");
      eac = input.bac / cpi;
      break;
    case "ac_plus_remaining":
      eac = input.ac + remainingBudget;
      break;
    case "ac_plus_remaining_over_cpi_spi":
      if (!cpi || !spi || cpi <= 0 || spi <= 0) throw new RangeError("CPI and SPI must be greater than zero for CPI×SPI EAC.");
      eac = input.ac + remainingBudget / (cpi * spi);
      break;
    case "manual":
      if (input.manualEac === undefined) throw new RangeError("Manual EAC is required for the manual method.");
      eac = input.manualEac;
      break;
  }

  const normalizedEac = rounded(eac);
  const etc = rounded(normalizedEac - input.ac);
  const vac = rounded(input.bac - normalizedEac);
  const tcpi = ratio(input.bac - input.ev, input.bac - input.ac);
  const isCostCritical = cpi !== null && cpi < 0.9;
  const isScheduleCritical = spi !== null && spi < 0.9;
  const meaning = isCostCritical || isScheduleCritical
    ? "Performance requires management attention because cost or schedule efficiency is materially below plan."
    : "Performance is within the normal control range based on available cost and schedule efficiency data.";
  const recommendedAction = isCostCritical
    ? "Validate remaining-cost assumptions and establish a cost recovery action."
    : isScheduleCritical
      ? "Review critical activities and publish a schedule recovery action."
      : "Continue monitoring against the approved baseline.";

  return { ...input, cv, sv, cpi, spi, eac: normalizedEac, etc, vac, tcpi, meaning, recommendedAction };
}

