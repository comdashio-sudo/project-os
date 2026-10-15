import { describe, expect, it } from "vitest";
import { buildProfitabilityReport, wbsEacRows, type ProfitabilityReportInput, type WbsEacRow } from "./profitabilityReport";

const now = new Date("2026-10-15T12:00:00.000Z");
const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

describe("per-WBS EAC", () => {
  const wbs = [{ id: "w1", code: "1", name: "Excavation" }, { id: "w2", code: "2", name: "Concrete" }];
  const budgets = [{ wbsItemId: "w1", currentAmount: "100000" }, { wbsItemId: "w2", currentAmount: 200000 }, { wbsItemId: null, currentAmount: 999 }];
  const posted = (wbsItemId: string | null, amount: number, status = "posted", incurredAt = daysAgo(5)) => ({ wbsItemId, amount, status, entryType: "actual", incurredAt });

  it("computes EV = BAC x progress and EAC = AC + (BAC - EV) from each item's own records (hand check)", () => {
    const result = wbsEacRows({
      periodAt: now,
      method: "ac_plus_remaining",
      wbs,
      budgets,
      costs: [posted("w1", 40_000), posted("w1", 10_000), posted("w2", 120_000), posted(null, 3_000), posted("w2", 77_777, "draft"), posted("w2", 55_555, "void"), posted("w2", 1, "posted", daysAgo(-2))],
      progress: [
        { wbsItemId: "w1", progressPercent: "30", status: "submitted", measuredAt: daysAgo(10) },
        { wbsItemId: "w1", progressPercent: "50", status: "submitted", measuredAt: daysAgo(2) },
        { wbsItemId: "w1", progressPercent: "90", status: "draft", measuredAt: daysAgo(1) },
        { wbsItemId: "w2", progressPercent: 40, status: "submitted", measuredAt: daysAgo(1) },
      ],
    });
    // w1: BAC 100k, AC 50k, progress 50% -> EV 50k, EAC = 50k + 50k = 100k.
    // w2: BAC 200k, AC 120k, progress 40% -> EV 80k, EAC = 120k + 120k = 240k.
    expect(result.rows.map(r => [r.code, r.bac, r.ac, r.progressPercent, r.eac])).toEqual([["1", 100_000, 50_000, 50, 100_000], ["2", 200_000, 120_000, 40, 240_000]]);
    expect(result.unallocatedActual).toBe(3_000);
    expect(result.totalEac).toBe(343_000);
    expect(result.totalAc).toBe(173_000);
  });

  it("uses BAC / CPI when asked and defined, and falls back (and says so) when it is not", () => {
    const common = { periodAt: now, wbs, budgets, progress: [{ wbsItemId: "w1", progressPercent: 50, status: "submitted", measuredAt: daysAgo(1) }] };
    const costs = [{ wbsItemId: "w1", amount: 100_000, status: "posted", entryType: "actual", incurredAt: daysAgo(3) }];
    const cpi = wbsEacRows({ ...common, method: "bac_over_cpi", costs });
    // EV 50k, AC 100k, CPI 0.5, EAC = 100k / 0.5 = 200k.
    expect(cpi.rows.find(r => r.code === "1")).toMatchObject({ eac: 200_000, method: "bac_over_cpi" });
    const noCost = wbsEacRows({ ...common, method: "bac_over_cpi", costs: [] });
    expect(noCost.rows.find(r => r.code === "1")).toMatchObject({ eac: 50_000, method: "ac_plus_remaining" });
    const noProgress = wbsEacRows({ ...common, progress: [], method: "bac_over_cpi", costs });
    expect(noProgress.rows.find(r => r.code === "1")).toMatchObject({ eac: 200_000, method: "ac_plus_remaining" });
    expect(wbsEacRows({ ...common, method: "ac_plus_remaining_over_cpi_spi", costs }).rows[0].method).toBe("ac_plus_remaining");
  });

  it("clamps progress, ignores items with nothing on them, and rejects a non-numeric amount", () => {
    const over = wbsEacRows({ periodAt: now, method: "ac_plus_remaining", wbs, budgets: [{ wbsItemId: "w1", currentAmount: 100 }], costs: [], progress: [{ wbsItemId: "w1", progressPercent: 250, status: "submitted", measuredAt: daysAgo(1) }] });
    expect(over.rows).toEqual([expect.objectContaining({ progressPercent: 100, eac: 0 })]);
    expect(over.rows).toHaveLength(1);
    expect(() => wbsEacRows({ periodAt: now, method: "ac_plus_remaining", wbs, budgets: [{ wbsItemId: "w1", currentAmount: "abc" }], costs: [], progress: [] })).toThrow(RangeError);
  });
});

function baseInput(overrides: Partial<ProfitabilityReportInput> = {}): ProfitabilityReportInput {
  const rows: WbsEacRow[] = [
    { wbsItemId: "w1", code: "1", name: "Excavation", bac: 100_000, ac: 50_000, progressPercent: 50, eac: 100_000, method: "ac_plus_remaining" },
    { wbsItemId: "w2", code: "2", name: "Concrete", bac: 200_000, ac: 120_000, progressPercent: 40, eac: 260_000, method: "ac_plus_remaining" },
  ];
  return {
    now,
    project: { id: "p1", code: "DEMO-01", name: "Demo Tower", currency: "SAR", contractValue: "1000000", updatedAt: daysAgo(30) },
    changeOrders: [{ status: "approved", contractValueImpact: 100_000 }, { status: "submitted", contractValueImpact: 500_000 }],
    changeOrdersAsOf: daysAgo(12),
    evm: { eac: 900_000, ac: 500_000, etc: 400_000, bac: 800_000 },
    wbs: { rows, unallocatedActual: 3_000 },
    lastSnapshot: { periodAt: daysAgo(30), adjustedContractValue: 1_050_000, ac: 400_000, etc: 450_000, fpac: 200_000, wbs: [{ wbsItemId: "w1", eac: 90_000 }, { wbsItemId: "w2", eac: 300_000 }] },
    commitments: { orderValue: 100_000, receivedValue: 60_000, invoicedValue: 40_000 },
    cash: { receipts: 100_000, outflows: 150_000 },
    freshness: { progress: daysAgo(18), materials: daysAgo(0), labour: daysAgo(3), wbsProgressDates: [daysAgo(18), daysAgo(2)] },
    ...overrides,
  };
}

describe("profitability report", () => {
  it("builds the headline with every number carrying its formula, source and date", () => {
    const { headline } = buildProfitabilityReport(baseInput());
    expect(headline.status).toBe("ok");
    if (headline.status !== "ok") return;
    expect(headline.data.contract).toMatchObject({ originalContractValue: 1_000_000, approvedChanges: 100_000, adjustedContractValue: 1_100_000, countedChangeOrders: 1, ignoredChangeOrders: 1 });
    expect(headline.data).toMatchObject({ eac: 900_000, fpac: 200_000, marginPercent: 18.18, isLoss: false, plannedProfit: 200_000, plannedMarginPercent: 20, profitVariance: 0 });
    expect(headline.data.rows.map(r => r.key)).toEqual(["originalContract", "approvedChanges", "adjustedContract", "eac", "fpac", "margin", "plannedProfit", "profitVariance"]);
    for (const row of headline.data.rows) { expect(row.formula, row.key).toBeTruthy(); expect(row.source, row.key).toBeTruthy(); }
    expect(headline.data.rows.find(r => r.key === "approvedChanges")?.asOf).toBe(daysAgo(12).toISOString());
  });

  it("explains the movement since the last snapshot in three additive causes and by WBS", () => {
    const { movement } = buildProfitabilityReport(baseInput());
    expect(movement.status).toBe("ok");
    if (movement.status !== "ok") return;
    // last FPAC = 1,050,000 - 400,000 - 450,000 = 200,000; now = 1,100,000 - 500,000 - 400,000 = 200,000 -> flat overall,
    // but contract +50,000, actual cost -100,000, forecast +50,000.
    expect(movement.data).toMatchObject({ fpacLast: 200_000, fpacNow: 200_000, delta: 0, causes: { contractValue: 50_000, actualCost: -100_000, forecastToComplete: 50_000 } });
    expect(movement.data.wbs?.rows.map(r => [r.code, r.eacDelta])).toEqual([["2", -40_000], ["1", 10_000]]);
    expect(movement.data.wbs?.raisedProfit.map(r => r.code)).toEqual(["2"]);
    expect(movement.data.wbs?.loweredProfit.map(r => r.code)).toEqual(["1"]);
  });

  it("warns when profit is positive and cash is negative, and counts open commitment net of the larger of received and invoiced", () => {
    const { cash } = buildProfitabilityReport(baseInput());
    expect(cash.status).toBe("ok");
    if (cash.status !== "ok") return;
    expect(cash.data).toMatchObject({ openCommitment: 40_000, receipts: 100_000, outflows: 150_000, netCashFlow: -50_000 });
    expect(cash.data.warning).toEqual({ active: true, fpac: 200_000, netCashFlow: -50_000, gap: 250_000 });
  });

  it("reports staleness with the source to open first", () => {
    const { freshness } = buildProfitabilityReport(baseInput());
    expect(freshness).toMatchObject({ level: "stale", staleSources: ["progress"], stalestSource: "progress", percentWbsUpdated: 50, oldestAgeDays: 18 });
  });

  it("drills to the five items with the worst gap to plan and reconciles to the engine", () => {
    const { drill } = buildProfitabilityReport(baseInput());
    expect(drill.status).toBe("ok");
    if (drill.status !== "ok") return;
    expect(drill.data.items.map(i => [i.code, i.planned, i.actual, i.forecast, i.variance])).toEqual([["2", 200_000, 120_000, 260_000, -60_000], ["1", 100_000, 50_000, 100_000, 0]]);
    // engine EAC 900,000 - (100,000 + 260,000 + 3,000 unallocated) = 537,000 is the part the per-WBS view does not explain
    expect(drill.data.reconciliationDifference).toBe(537_000);
  });

  it("limits the drill-down to five items", () => {
    const rows: WbsEacRow[] = Array.from({ length: 8 }, (_, i) => ({ wbsItemId: `w${i}`, code: String(i), name: `Item ${i}`, bac: 1000, ac: 500, progressPercent: 10, eac: 1000 + i * 100, method: "ac_plus_remaining" as const }));
    const { drill } = buildProfitabilityReport(baseInput({ wbs: { rows, unallocatedActual: 0 } }));
    if (drill.status !== "ok") throw new Error("expected drill");
    expect(drill.data.items).toHaveLength(5);
    expect(drill.data.items[0].code).toBe("7");
  });

  it("marks each section unavailable with a reason instead of showing zero", () => {
    const report = buildProfitabilityReport(baseInput({ evm: { error: "EVM_INPUTS_INCONSISTENT" }, lastSnapshot: null, commitments: null, wbs: null }));
    expect(report.headline).toEqual({ status: "unavailable", reason: "EVM_INPUTS_INCONSISTENT" });
    expect(report.movement).toEqual({ status: "unavailable", reason: "EVM_INPUTS_INCONSISTENT" });
    expect(report.cash).toEqual({ status: "unavailable", reason: "CASH_SOURCES_UNAVAILABLE" });
    expect(report.drill).toEqual({ status: "unavailable", reason: "WBS_UNAVAILABLE" });
    expect(report.freshness.level).toBe("stale");
  });

  it("has no movement without a previous profitability snapshot (the old ones carry no contract value)", () => {
    expect(buildProfitabilityReport(baseInput({ lastSnapshot: null })).movement).toEqual({ status: "unavailable", reason: "NO_PREVIOUS_SNAPSHOT" });
    const legacy = baseInput().lastSnapshot!;
    expect(buildProfitabilityReport(baseInput({ lastSnapshot: { ...legacy, adjustedContractValue: null, fpac: null } })).movement.status).toBe("unavailable");
  });

  it("reports a loss clearly and no cash warning when the profit is not positive", () => {
    const report = buildProfitabilityReport(baseInput({ evm: { eac: 1_300_000, ac: 900_000, etc: 400_000, bac: 800_000 } }));
    if (report.headline.status !== "ok" || report.cash.status !== "ok") throw new Error("expected sections");
    expect(report.headline.data).toMatchObject({ fpac: -200_000, isLoss: true, marginPercent: -18.18 });
    expect(report.cash.data.warning?.active).toBe(false);
  });

  it("is not affected by an unapproved change order, however large", () => {
    const report = buildProfitabilityReport(baseInput({ changeOrders: [{ status: "submitted", contractValueImpact: 9_000_000 }, { status: "rejected", contractValueImpact: 9_000_000 }] }));
    if (report.headline.status !== "ok") throw new Error("expected headline");
    expect(report.headline.data.contract.adjustedContractValue).toBe(1_000_000);
  });
});
