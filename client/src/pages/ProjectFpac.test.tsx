/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectFpac } from "./ProjectFpac";

const state = vi.hoisted(() => ({ arabic: false, report: { data: undefined, isLoading: false, error: null } as Record<string, unknown>, history: { data: [] } as Record<string, unknown>, breakdown: { data: undefined, isLoading: false, error: null } as Record<string, unknown>, refetch: vi.fn() }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.arabic }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { profitability: { project: { useQuery: () => ({ ...state.report, refetch: state.refetch }) }, history: { useQuery: () => state.history }, costBreakdown: { useQuery: () => state.breakdown } } } }));
afterEach(() => { cleanup(); state.arabic = false; state.report = { data: undefined, isLoading: false, error: null }; state.history = { data: [] }; state.breakdown = { data: undefined, isLoading: false, error: null }; state.refetch.mockReset(); });

const ok = <T,>(data: T) => ({ status: "ok" as const, data });
const wbsRow = (id: string, code: string, planned: number, actual: number, forecast: number) => ({ wbsItemId: id, code, name: `Item ${code}`, planned, actual, forecast, variance: planned - forecast });
function report(overrides: Record<string, unknown> = {}) {
  const freshness = { level: "fresh", staleAfterDays: 7, perSource: [{ source: "progress", lastUpdatedAt: new Date(), ageDays: 0 }, { source: "materials", lastUpdatedAt: new Date(), ageDays: 2 }, { source: "labour", lastUpdatedAt: new Date(), ageDays: 3 }], percentWbsUpdated: 62, staleSources: [], neverUpdated: [], stalestSource: "labour", oldestAgeDays: 3 };
  return {
    project: { id: "p", code: "P", name: "Project", currency: "SAR" },
    generatedAt: "2026-10-15T00:00:00.000Z",
    headline: ok({ contract: { originalContractValue: 1200, approvedChanges: 100, adjustedContractValue: 1300, countedChangeOrders: 1, ignoredChangeOrders: 1 }, eac: 1000, fpac: 300, marginPercent: 23.1, isLoss: false, plannedProfit: 200, plannedMarginPercent: 16.7, profitVariance: 100, rows: [{ key: "fpac", value: 300, formula: "adjusted contract - EAC", source: "computed", asOf: "2026-10-15T00:00:00.000Z" }, { key: "margin", value: 23.1, formula: "x", source: "computed", asOf: null }] }),
    movement: ok({ since: "2026-09-30T00:00:00.000Z", fpacNow: 250, fpacLast: 300, delta: -50, deltaPercent: -16.67, direction: "down", causes: { contractValue: 50, actualCost: -100, forecastToComplete: 0 }, dominantCause: "actualCost", wbs: { rows: [], raisedProfit: [], loweredProfit: [{ wbsItemId: "w1", code: "1", name: "Foundations", eacNow: 700, eacLast: 600, eacDelta: 100, profitEffect: -100, isNew: false, isRemoved: false }], totalEacDelta: 100 } }),
    cash: ok({ openCommitment: 40, receipts: 100, outflows: 400, netCashFlow: -300, warning: true }),
    freshness,
    drill: ok({ items: [wbsRow("w1", "1", 600, 400, 700), wbsRow("w2", "2", 400, 100, 300)], unallocatedActual: 0, reconciliationDifference: 0 }),
    ...overrides,
  };
}
const show = (data: unknown) => { state.report = { data, isLoading: false, error: null }; render(<ProjectFpac tenantId="t" projectId="p" />); };

describe("ProjectFpac (real profitability)", () => {
  it("shows a loading state, then an error with a retry that calls the query again", () => {
    state.report = { data: undefined, isLoading: true, error: null };
    const { unmount } = render(<ProjectFpac tenantId="t" projectId="p" />);
    expect(screen.getByText("Calculating profitability…")).toBeTruthy();
    unmount();
    state.report = { data: undefined, isLoading: false, error: new Error("boom") };
    render(<ProjectFpac tenantId="t" projectId="p" />);
    expect(screen.getByRole("alert").textContent).toContain("could not complete");
    fireEvent.click(screen.getByText("Retry"));
    expect(state.refetch).toHaveBeenCalledTimes(1);
  });

  it("shows FPAC with every figure's formula and source, the three causes, the cash warning and the freshness strip", () => {
    show(report());
    expect(screen.getByTestId("fpac-value").textContent).toBe("300 SAR");
    expect(screen.getByText("= FPAC")).toBeTruthy();
    expect(screen.getByText("adjusted contract − EAC")).toBeTruthy();
    const movement = screen.getByTestId("movement");
    expect(movement.textContent).toContain("▼");
    expect(movement.textContent).toContain("-50 SAR");
    expect(within(movement).getByText("Contract value (change orders)").parentElement?.textContent).toContain("50 SAR");
    expect(within(movement).getByText("Actual cost").parentElement?.textContent).toContain("-100 SAR");
    expect(movement.textContent).toContain("Foundations");
    expect(screen.getByTestId("cash").textContent).toContain("Profit is positive but net cash flow is negative");
    const fresh = screen.getByTestId("freshness").textContent ?? "";
    expect(fresh).toContain("progress: today");
    expect(fresh).toContain("labour: 3 days ago");
    expect(fresh).toContain("62% of items updated within 7 days");
    expect(screen.queryByText("Open the stalest source")).toBeNull();
  });

  it("warns on a stale source and links to where it is updated", () => {
    const base = report();
    show({ ...base, freshness: { ...base.freshness, level: "stale", stalestSource: "progress", perSource: base.freshness.perSource.map(s => (s.source === "progress" ? { ...s, ageDays: 18 } : s)) } });
    expect(screen.getAllByRole("alert").some(node => node.textContent?.includes("progress last updated 18 days ago"))).toBe(true);
    expect(screen.getByText("Open the stalest source").getAttribute("href")).toBe("#manager-schedule");
  });

  it("says plainly when a source has never been recorded", () => {
    const base = report();
    show({ ...base, freshness: { ...base.freshness, level: "stale", stalestSource: "materials", neverUpdated: ["materials"], perSource: base.freshness.perSource.map(s => (s.source === "materials" ? { ...s, ageDays: null, lastUpdatedAt: null } : s)) } });
    expect(screen.getAllByRole("alert").some(node => node.textContent?.includes("no materials behind it: nothing has been recorded yet"))).toBe(true);
  });

  it("marks a loss and keeps the other sections when one is unavailable", () => {
    const base = report();
    show({ ...base, headline: ok({ ...(base.headline.data), fpac: -120, isLoss: true, marginPercent: -9.2 }), movement: { status: "unavailable", reason: "NO_PREVIOUS_SNAPSHOT" }, cash: { status: "unavailable", reason: "CASH_SOURCES_UNAVAILABLE" } });
    expect(screen.getByTestId("fpac-value").textContent).toBe("-120 SAR");
    expect(screen.getByText("This project is heading for a loss")).toBeTruthy();
    expect(screen.getByText(/no earlier snapshot to compare with yet/)).toBeTruthy();
    expect(screen.getByText(/Purchase orders or receipts could not be read/)).toBeTruthy();
    expect(screen.getByText("Top 5 WBS items by variance")).toBeTruthy();
  });

  it("explains an unavailable headline instead of showing a number, and an empty drill-down", () => {
    show(report({ headline: { status: "unavailable", reason: "EVM_INPUTS_INCONSISTENT" }, drill: ok({ items: [], unallocatedActual: 0, reconciliationDifference: null }) }));
    expect(screen.queryByTestId("fpac-value")).toBeNull();
    expect(screen.getByText(/Cost and progress inputs are inconsistent/)).toBeTruthy();
    expect(screen.getByText(/Not enough data yet/)).toBeTruthy();
  });

  it("opens an item to show where its cost came from", () => {
    state.breakdown = { data: { truncated: false, byCategory: [{ category: "materials", amount: 300 }], lines: [{ id: "c1", wbsItemId: "w1", amount: 300, category: "materials", sourceType: "goods_receipt_note", sourceId: "abcdef12-0000", incurredAt: new Date("2026-09-01T00:00:00.000Z") }] }, isLoading: false, error: null };
    show(report());
    fireEvent.click(screen.getAllByText("Show sources")[0]);
    expect(screen.getByText("Where the actual cost came from")).toBeTruthy();
    expect(screen.getByText(/Materials:/).textContent).toContain("300 SAR");
    expect(screen.getByText(/goods_receipt_note abcdef12/)).toBeTruthy();
  });

  it("renders in Arabic", () => {
    state.arabic = true;
    show(report());
    expect(screen.getByText("ربحية المشروع")).toBeTruthy();
    expect(screen.getByText("الربح المتوقع عند الإنجاز (FPAC)")).toBeTruthy();
    expect(screen.getByTestId("freshness").textContent).toContain("التقدم: اليوم");
    expect(screen.getByTestId("freshness").textContent).toContain("العمالة: قبل 3 أيام");
  });
});
