import { describe, expect, it } from "vitest";
import { calculateEvm } from "./evm";
import {
  adjustedContractValue,
  dataFreshness,
  fpac,
  fpacMovement,
  loadedHourlyCost,
  openCommitment,
  orderProjectsByRisk,
  plannedProfit,
  portfolioFpac,
  profitCashWarning,
  profitVariance,
  wbsMovement,
} from "./profitability";

describe("adjusted contract value", () => {
  it("adds approved change orders only", () => {
    const result = adjustedContractValue(1_000_000, [
      { status: "approved", contractValueImpact: 50_000 },
      { status: "approved", contractValueImpact: -10_000 },
      { status: "submitted", contractValueImpact: 999_999 },
      { status: "draft", contractValueImpact: 1 },
      { status: "rejected", contractValueImpact: 1 },
      { status: "cancelled", contractValueImpact: 1 },
      { status: "under_review", contractValueImpact: 1 },
    ]);
    expect(result).toEqual({ originalContractValue: 1_000_000, approvedChanges: 40_000, adjustedContractValue: 1_040_000, countedChangeOrders: 2, ignoredChangeOrders: 5 });
  });

  it("equals the original when nothing is approved, and rejects non-finite input", () => {
    expect(adjustedContractValue(250_000.5, []).adjustedContractValue).toBe(250_000.5);
    expect(() => adjustedContractValue(Number.NaN, [])).toThrow(RangeError);
    expect(() => adjustedContractValue(1, [{ status: "approved", contractValueImpact: Number.POSITIVE_INFINITY }])).toThrow(RangeError);
  });
});

describe("FPAC, planned profit and variance", () => {
  it("computes FPAC and margin from the EVM engine's EAC (hand check)", () => {
    // BAC 800,000, EV 400,000, AC 500,000, AC + remaining budget: EAC = 500,000 + (800,000 - 400,000) = 900,000.
    const evm = calculateEvm({ pv: 450_000, ev: 400_000, ac: 500_000, bac: 800_000, eacMethod: "ac_plus_remaining" });
    expect(evm.eac).toBe(900_000);
    const adjusted = adjustedContractValue(1_000_000, [{ status: "approved", contractValueImpact: 100_000 }]);
    const result = fpac({ adjustedContractValue: adjusted.adjustedContractValue, eac: evm.eac });
    expect(result).toEqual({ fpac: 200_000, marginPercent: 18.18, isLoss: false });
  });

  it("reports a loss and a null margin for a zero contract", () => {
    expect(fpac({ adjustedContractValue: 900_000, eac: 950_000 })).toEqual({ fpac: -50_000, marginPercent: -5.56, isLoss: true });
    expect(fpac({ adjustedContractValue: 0, eac: 10 })).toEqual({ fpac: -10, marginPercent: null, isLoss: true });
  });

  it("derives the originally planned profit and the variance against it", () => {
    const planned = plannedProfit({ originalContractValue: 1_000_000, bac: 800_000 });
    expect(planned).toEqual({ plannedProfit: 200_000, plannedMarginPercent: 20 });
    expect(profitVariance(150_000, planned.plannedProfit)).toBe(-50_000);
    expect(plannedProfit({ originalContractValue: 0, bac: 5 }).plannedMarginPercent).toBeNull();
  });
});

describe("movement and its three causes", () => {
  const last = { adjustedContractValue: 1_000_000, actualCost: 300_000, forecastToComplete: 500_000 };

  it("splits the movement into contract, actual cost and forecast, and they add up exactly", () => {
    const now = { adjustedContractValue: 1_050_000, actualCost: 380_000, forecastToComplete: 520_000 };
    const result = fpacMovement(now, last);
    expect(result.fpacLast).toBe(200_000);
    expect(result.fpacNow).toBe(150_000);
    expect(result.delta).toBe(-50_000);
    expect(result.causes).toEqual({ contractValue: 50_000, actualCost: -80_000, forecastToComplete: -20_000 });
    expect(Object.values(result.causes).reduce((a, b) => a + b, 0)).toBe(result.delta);
    expect(result.dominantCause).toBe("actualCost");
    expect(result.direction).toBe("down");
    expect(result.deltaPercent).toBe(-25);
  });

  it("keeps the identity when cents would round apart", () => {
    const now = { adjustedContractValue: 1_000_000.005, actualCost: 300_000.004, forecastToComplete: 499_999.996 };
    const result = fpacMovement(now, last);
    expect(Math.round((result.causes.contractValue + result.causes.actualCost + result.causes.forecastToComplete) * 100)).toBe(Math.round(result.delta * 100));
  });

  it("is flat with no dominant cause when nothing changed, and has no percent against a zero start", () => {
    const flat = fpacMovement(last, last);
    expect(flat).toMatchObject({ delta: 0, direction: "flat", dominantCause: null, causes: { contractValue: 0, actualCost: 0, forecastToComplete: 0 } });
    const fromZero = fpacMovement({ adjustedContractValue: 100, actualCost: 0, forecastToComplete: 0 }, { adjustedContractValue: 100, actualCost: 50, forecastToComplete: 50 });
    expect(fromZero.deltaPercent).toBeNull();
    expect(fromZero.direction).toBe("up");
  });
});

describe("WBS movement", () => {
  const last = [
    { wbsItemId: "w1", code: "1.1", eac: 100_000 },
    { wbsItemId: "w2", code: "1.2", eac: 200_000 },
    { wbsItemId: "w3", code: "1.3", eac: 50_000 },
    { wbsItemId: "w4", code: "1.4", eac: 80_000 },
    { wbsItemId: "w5", code: "1.5", eac: 10_000 },
  ];
  const now = [
    { wbsItemId: "w1", code: "1.1", eac: 140_000 },
    { wbsItemId: "w2", code: "1.2", eac: 180_000 },
    { wbsItemId: "w3", code: "1.3", eac: 50_000 },
    { wbsItemId: "w4", code: "1.4", eac: 81_000 },
    { wbsItemId: "w6", code: "1.6", eac: 5_000 },
  ];

  it("orders by absolute EAC change and names what raised and what lowered profit", () => {
    const result = wbsMovement(now, last);
    expect(result.rows.map(row => [row.code, row.eacDelta])).toEqual([["1.1", 40_000], ["1.2", -20_000], ["1.5", -10_000], ["1.6", 5_000], ["1.4", 1_000]]);
    expect(result.loweredProfit.map(row => row.code)).toEqual(["1.1", "1.6", "1.4"]);
    expect(result.raisedProfit.map(row => row.code)).toEqual(["1.2", "1.5"]);
    expect(result.rows.find(row => row.code === "1.6")).toMatchObject({ isNew: true, isRemoved: false, eacLast: 0 });
    expect(result.rows.find(row => row.code === "1.5")).toMatchObject({ isRemoved: true, isNew: false, eacNow: 0 });
    expect(result.totalEacDelta).toBe(16_000);
  });

  it("limits each list and drops items that did not move", () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ wbsItemId: `a${i}`, eac: 1000 }));
    const raised = many.map((item, i) => ({ ...item, eac: 1000 + (i + 1) * 10 }));
    const result = wbsMovement(raised, many, 3);
    expect(result.loweredProfit).toHaveLength(3);
    expect(result.loweredProfit[0].wbsItemId).toBe("a9");
    expect(wbsMovement(last, last).rows).toEqual([]);
  });
});

describe("profit is not cash", () => {
  it("counts the larger of received and invoiced as no longer open", () => {
    expect(openCommitment({ orderValue: 100_000, receivedValue: 60_000, invoicedValue: 40_000 })).toBe(40_000);
    expect(openCommitment({ orderValue: 100_000, receivedValue: 20_000, invoicedValue: 70_000 })).toBe(30_000);
    expect(openCommitment({ orderValue: 100_000, receivedValue: 120_000, invoicedValue: 0 })).toBe(0);
  });

  it("warns only for positive profit with negative cash", () => {
    expect(profitCashWarning({ fpac: 200_000, netCashFlow: -50_000 })).toEqual({ active: true, fpac: 200_000, netCashFlow: -50_000, gap: 250_000 });
    expect(profitCashWarning({ fpac: 200_000, netCashFlow: 0 }).active).toBe(false);
    expect(profitCashWarning({ fpac: -1, netCashFlow: -50_000 }).active).toBe(false);
    expect(profitCashWarning({ fpac: 0, netCashFlow: -1 }).active).toBe(false);
  });
});

describe("loaded labour cost", () => {
  it("divides the full loaded cost by actual hours and shows the loading factor", () => {
    const result = loadedHourlyCost({ basicSalary: 8000, allowances: 2000, employerSocialInsurance: 1000, accruedEndOfService: 667, tenantIndirects: 333, workedHours: 200 });
    expect(result).toEqual({ totalLoadedCost: 12_000, hourlyCost: 60, loadingFactor: 1.2 });
  });

  it("has no hourly cost without hours and no factor without direct pay, and refuses negative parts", () => {
    expect(loadedHourlyCost({ basicSalary: 100, allowances: 0, employerSocialInsurance: 0, accruedEndOfService: 0, tenantIndirects: 0, workedHours: 0 }).hourlyCost).toBeNull();
    expect(loadedHourlyCost({ basicSalary: 0, allowances: 0, employerSocialInsurance: 10, accruedEndOfService: 0, tenantIndirects: 0, workedHours: 5 }).loadingFactor).toBeNull();
    expect(() => loadedHourlyCost({ basicSalary: -1, allowances: 0, employerSocialInsurance: 0, accruedEndOfService: 0, tenantIndirects: 0, workedHours: 1 })).toThrow(RangeError);
    expect(() => loadedHourlyCost({ basicSalary: 1, allowances: 0, employerSocialInsurance: 0, accruedEndOfService: 0, tenantIndirects: 0, workedHours: Number.NaN })).toThrow(RangeError);
  });
});

describe("data freshness", () => {
  const now = new Date("2026-10-15T12:00:00.000Z");
  const daysAgo = (days: number) => new Date(now.getTime() - days * 86_400_000);

  it("is fresh when every source and most WBS items were updated within seven days", () => {
    const result = dataFreshness({ now, sources: { progress: daysAgo(1), materials: daysAgo(0), labour: daysAgo(3) }, wbsProgressDates: [daysAgo(1), daysAgo(2), daysAgo(7)] });
    expect(result).toMatchObject({ level: "fresh", percentWbsUpdated: 100, staleSources: [], stalestSource: "labour", oldestAgeDays: 3 });
  });

  it("flags the stale sources, the share of WBS items updated, and names the one to open first", () => {
    const result = dataFreshness({ now, sources: { progress: daysAgo(18), materials: daysAgo(0), labour: daysAgo(3) }, wbsProgressDates: [daysAgo(18), daysAgo(20), daysAgo(2), null, daysAgo(1)] });
    expect(result.level).toBe("stale");
    expect(result.staleSources).toEqual(["progress"]);
    expect(result.percentWbsUpdated).toBe(40);
    expect(result.stalestSource).toBe("progress");
    expect(result.oldestAgeDays).toBe(18);
    expect(result.perSource.find(item => item.source === "progress")?.ageDays).toBe(18);
  });

  it("treats a source that never updated as the first one to open, and unknown when none ever did", () => {
    const partial = dataFreshness({ now, sources: { progress: daysAgo(1), materials: null, labour: daysAgo(30) }, wbsProgressDates: [] });
    expect(partial).toMatchObject({ level: "stale", stalestSource: "materials", neverUpdated: ["materials"], percentWbsUpdated: null, oldestAgeDays: null });
    const none = dataFreshness({ now, sources: { progress: null, materials: null, labour: null }, wbsProgressDates: [null] });
    expect(none).toMatchObject({ level: "unknown", percentWbsUpdated: 0 });
  });

  it("honours a different staleness window and never reports a negative age", () => {
    const future = new Date(now.getTime() + 86_400_000);
    const result = dataFreshness({ now, staleAfterDays: 2, sources: { progress: future, materials: daysAgo(3), labour: daysAgo(1) }, wbsProgressDates: [] });
    expect(result.perSource.find(item => item.source === "progress")?.ageDays).toBe(0);
    expect(result.staleSources).toEqual(["materials"]);
  });
});

describe("portfolio", () => {
  it("puts losing projects first, worst first, then the thinnest profit", () => {
    const ordered = orderProjectsByRisk([
      { projectId: "b", fpac: 500 },
      { projectId: "a", fpac: -100 },
      { projectId: "d", fpac: 10 },
      { projectId: "c", fpac: -900 },
    ]);
    expect(ordered.map(row => row.projectId)).toEqual(["c", "a", "d", "b"]);
    expect(portfolioFpac(ordered)).toBe(-490);
  });
});
