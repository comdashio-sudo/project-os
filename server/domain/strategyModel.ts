// Q-21 (c): the strategy centre's financial model — a pure function, no database. It reads APPROVED assumptions only (a draft never moves a number), the
// company's existing contracts (backlog), and returns, for each of the three scenarios, the monthly revenue and cash with a «calculation trace» per
// figure: which assumptions it used and by which formula. The screens and the board pack (parts d and e) only display what this returns.
//
// Revenue (excluding VAT): every month, tendersPerYear / 12 tenders are decided; tenders × averageTenderValue × winRate are won, start awardLagMonths later
// and are earned over executionMonths along an S-curve (smoothstep). Existing contracts add their remaining value on their own monthly shares.
// Cash: billing equals the work done each month. The client pays the advance (advancePercent of the contract) at award and recovers it from every bill in
// the same proportion; retentionPercent of every bill is held and released retentionReleaseMonths after the work ends; what is left is collected
// collectionDays later (whole months, rounded up). VAT is collected and remitted on the same bills, so it does not change the net cash; it is reported on
// its own line. Outflows are the direct cost (revenue × (1 − grossMarginPercent)) when the work is done, and overheadsMonthly every month.

export const SCENARIOS = ["conservative", "base", "optimistic"] as const;
export type Scenario = (typeof SCENARIOS)[number];
export type AssumptionStatus = "draft" | "pending" | "approved" | "retired";

/** The assumptions the model reads, by key. Any other key is ignored. */
export const MODEL_KEYS = [
  "tendersPerYear", "averageTenderValue", "winRate", "awardLagMonths", "executionMonths",
  "advancePercent", "retentionPercent", "retentionReleaseMonths", "collectionDays", "vatPercent",
  "grossMarginPercent", "overheadsMonthly",
] as const;
export type ModelKey = (typeof MODEL_KEYS)[number];

export type ModelAssumption = { key: string; status: AssumptionStatus; values: Record<Scenario, number> };
export type BacklogContract = { code: string; remainingValue: number; monthlyShares: number[] };
export type ModelInput = { horizonMonths: number; assumptions: ModelAssumption[]; backlog: BacklogContract[] };

export type TraceStep = { figure: string; formula: string; uses: ModelKey[] };
export type ScenarioResult = {
  scenario: Scenario;
  months: Array<{ index: number; revenue: number; backlogRevenue: number; receipts: number; vatCollected: number; outflows: number; net: number; cumulative: number }>;
  totals: { revenue: number; backlogRevenue: number; receipts: number; outflows: number; net: number };
  lowestCumulative: number; lowestMonth: number; fundingRequired: number; breakEvenMonth: number | null;
  used: Partial<Record<ModelKey, number>>; missing: ModelKey[]; trace: TraceStep[];
};
export type ModelResult = { scenarios: Record<Scenario, ScenarioResult>; sensitivity: { winRateDelta: number; revenueChange: Record<Scenario, number>; lowestCashChange: Record<Scenario, number> } };

/** The default VAT rate (Saudi Arabia, 15%) when no approved assumption names another. */
export const DEFAULT_VAT_PERCENT = 15;

/** S-curve shares over n months (smoothstep 3t² − 2t³): they sum to 1, start and end slowly, and are symmetric. */
export function sCurveShares(months: number): number[] {
  const n = Math.max(1, Math.floor(months));
  const at = (t: number) => 3 * t * t - 2 * t * t * t;
  return Array.from({ length: n }, (_, k) => at((k + 1) / n) - at(k / n));
}

const round2 = (value: number) => Math.round(value * 100) / 100;
const pct = (value: number) => value / 100;

/** The approved value of each model key for one scenario — drafts, pending and retired assumptions are never read. */
export function approvedValues(assumptions: ModelAssumption[], scenario: Scenario): { values: Partial<Record<ModelKey, number>>; missing: ModelKey[] } {
  const values: Partial<Record<ModelKey, number>> = {};
  for (const item of assumptions) if (item.status === "approved" && (MODEL_KEYS as readonly string[]).includes(item.key) && Number.isFinite(item.values[scenario])) values[item.key as ModelKey] = item.values[scenario];
  if (values.vatPercent === undefined) values.vatPercent = DEFAULT_VAT_PERCENT;
  const required: ModelKey[] = ["tendersPerYear", "averageTenderValue", "winRate", "executionMonths", "grossMarginPercent"];
  return { values, missing: required.filter(key => values[key] === undefined) };
}

function runScenario(input: ModelInput, scenario: Scenario, winRateOverride?: number): ScenarioResult {
  const { values, missing } = approvedValues(input.assumptions, scenario);
  const v = (key: ModelKey) => (key === "winRate" && winRateOverride !== undefined ? winRateOverride : values[key] ?? 0);
  const H = Math.max(1, Math.floor(input.horizonMonths));
  const revenue = new Array<number>(H).fill(0); const backlogRevenue = new Array<number>(H).fill(0);
  const receipts = new Array<number>(H + 240).fill(0); const vat = new Array<number>(H + 240).fill(0);
  const collectLag = Math.ceil(v("collectionDays") / 30);
  const lag = Math.max(0, Math.floor(v("awardLagMonths")));
  const shares = sCurveShares(v("executionMonths"));
  const contractPerMonth = missing.length ? 0 : (v("tendersPerYear") / 12) * pct(v("winRate")) * v("averageTenderValue");
  const advance = pct(v("advancePercent")); const retention = pct(v("retentionPercent")); const vatRate = pct(v("vatPercent"));
  const bill = (month: number, amount: number, endMonth: number) => {
    // the bill net of advance recovery and retention is collected collectLag months later; the retention after the work ends + release months
    const cashNet = amount * (1 - advance - retention);
    receipts[month + collectLag] += cashNet; vat[month + collectLag] += amount * vatRate;
    receipts[endMonth + Math.max(0, Math.floor(v("retentionReleaseMonths")))] += amount * retention;
  };
  // new work: one cohort of contracts decided each month of the horizon
  for (let decided = 0; decided < H && contractPerMonth > 0; decided += 1) {
    const start = decided + lag; const end = start + shares.length - 1;
    if (start >= H) break;
    receipts[start] += contractPerMonth * advance; // the advance, paid at award (start of work)
    shares.forEach((share, k) => { const month = start + k; if (month < H) { revenue[month] += contractPerMonth * share; bill(month, contractPerMonth * share, end); } });
  }
  // backlog: existing contracts on their own remaining shares (no new advance: it was received when they were awarded)
  for (const contract of input.backlog) {
    const total = contract.monthlyShares.reduce((sum, share) => sum + share, 0) || 1;
    contract.monthlyShares.forEach((share, month) => { if (month < H) { const amount = contract.remainingValue * (share / total); backlogRevenue[month] += amount; revenue[month] += amount; receipts[month + collectLag] += amount * (1 - retention); vat[month + collectLag] += amount * vatRate; receipts[contract.monthlyShares.length - 1 + Math.max(0, Math.floor(v("retentionReleaseMonths")))] += amount * retention; } });
  }
  let cumulative = 0; let lowest = 0; let lowestMonth = 0; let breakEven: number | null = null; let wentNegative = false;
  const months = revenue.map((rev, index) => {
    const outflows = rev * (1 - pct(v("grossMarginPercent"))) + v("overheadsMonthly");
    const net = receipts[index] - outflows; cumulative += net;
    if (cumulative < lowest) { lowest = cumulative; lowestMonth = index; }
    if (cumulative < 0) wentNegative = true; else if (wentNegative && breakEven === null) breakEven = index;
    return { index, revenue: round2(rev), backlogRevenue: round2(backlogRevenue[index]), receipts: round2(receipts[index]), vatCollected: round2(vat[index]), outflows: round2(outflows), net: round2(net), cumulative: round2(cumulative) };
  });
  const sum = (key: "revenue" | "backlogRevenue" | "receipts" | "outflows" | "net") => round2(months.reduce((total, month) => total + month[key], 0));
  const used: Partial<Record<ModelKey, number>> = {}; for (const key of MODEL_KEYS) if (values[key] !== undefined) used[key] = key === "winRate" && winRateOverride !== undefined ? winRateOverride : values[key];
  const trace: TraceStep[] = [
    { figure: "revenue", formula: "tendersPerYear / 12 × winRate × averageTenderValue, from awardLagMonths, over executionMonths along an S-curve; + backlog on its own shares", uses: ["tendersPerYear", "winRate", "averageTenderValue", "awardLagMonths", "executionMonths"] },
    { figure: "receipts", formula: "advancePercent of each contract at award; each bill × (1 − advancePercent − retentionPercent) collected ceil(collectionDays / 30) months later; retentionPercent released retentionReleaseMonths after the work ends", uses: ["advancePercent", "retentionPercent", "collectionDays", "retentionReleaseMonths"] },
    { figure: "vatCollected", formula: "each bill × vatPercent, collected and remitted together (no effect on net cash)", uses: ["vatPercent"] },
    { figure: "outflows", formula: "revenue × (1 − grossMarginPercent) + overheadsMonthly", uses: ["grossMarginPercent", "overheadsMonthly"] },
    { figure: "fundingRequired", formula: "the deepest negative cumulative net cash", uses: [] },
  ];
  return { scenario, months, totals: { revenue: sum("revenue"), backlogRevenue: sum("backlogRevenue"), receipts: sum("receipts"), outflows: sum("outflows"), net: sum("net") }, lowestCumulative: round2(lowest), lowestMonth, fundingRequired: round2(Math.max(0, -lowest)), breakEvenMonth: breakEven, used, missing, trace };
}

/** The model for the three scenarios, and the sensitivity of revenue and lowest cash to the win rate (± winRateDelta points). */
export function runStrategyModel(input: ModelInput, winRateDelta = 5): ModelResult {
  const scenarios = Object.fromEntries(SCENARIOS.map(scenario => [scenario, runScenario(input, scenario)])) as Record<Scenario, ScenarioResult>;
  const revenueChange = {} as Record<Scenario, number>; const lowestCashChange = {} as Record<Scenario, number>;
  for (const scenario of SCENARIOS) {
    const base = scenarios[scenario]; const win = base.used.winRate;
    if (win === undefined) { revenueChange[scenario] = 0; lowestCashChange[scenario] = 0; continue; }
    const up = runScenario(input, scenario, win + winRateDelta);
    revenueChange[scenario] = round2(up.totals.revenue - base.totals.revenue); lowestCashChange[scenario] = round2(up.lowestCumulative - base.lowestCumulative);
  }
  return { scenarios, sensitivity: { winRateDelta, revenueChange, lowestCashChange } };
}
