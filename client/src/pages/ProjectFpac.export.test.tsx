/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildTableWorkbook } from "@/lib/excelExport";
import { ProjectFpac } from "./ProjectFpac";

vi.mock("@/lib/excelExport", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/excelExport")>();
  return { ...actual, buildTableWorkbook: vi.fn(actual.buildTableWorkbook) };
});
const state = vi.hoisted(() => ({ arabic: false, report: { data: undefined, isLoading: false, error: null } as Record<string, unknown>, history: { data: [] } as Record<string, unknown>, breakdown: { data: undefined, isLoading: false, error: null } as Record<string, unknown>, refetch: vi.fn() }));
vi.mock("./LabourLoadingCard", () => ({ default: () => null }));
vi.mock("./CashFlowMonthly", () => ({ default: () => null }));
vi.mock("./ProjectInvoicesPanel", () => ({ default: () => null }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.arabic }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { profitability: { project: { useQuery: () => ({ ...state.report, refetch: state.refetch }) }, history: { useQuery: () => state.history }, costBreakdown: { useQuery: () => state.breakdown } } } }));

let clickSpy: { mockRestore: () => void };
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:export");
  URL.revokeObjectURL = vi.fn();
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.mocked(buildTableWorkbook).mockClear();
});
afterEach(() => { cleanup(); clickSpy.mockRestore(); state.arabic = false; state.report = { data: undefined, isLoading: false, error: null }; state.history = { data: [] }; state.breakdown = { data: undefined, isLoading: false, error: null }; });

// Invented example project: the figures are placeholders, not a real project.
const ok = <T,>(data: T) => ({ status: "ok" as const, data });
const wbsRow = (id: string, code: string, planned: number, actual: number, forecast: number, committed: number) => ({ wbsItemId: id, code, name: `Item ${code}`, planned, actual, committed, forecast, variance: planned - forecast });
const headlineRows = [
  { key: "originalContract", value: 1200, formula: "project.contractValue", source: "project", asOf: "2026-10-01T00:00:00.000Z" },
  { key: "approvedChanges", value: 100, formula: "sum(approved change orders)", source: "changeOrders", asOf: null },
  { key: "adjustedContract", value: 1300, formula: "original + approved changes", source: "computed", asOf: "2026-10-15T00:00:00.000Z" },
  { key: "eac", value: 1000, formula: "EVM engine", source: "operationalRecords", asOf: "2026-10-15T00:00:00.000Z" },
  { key: "fpac", value: 300, formula: "adjusted contract - EAC", source: "computed", asOf: "2026-10-15T00:00:00.000Z" },
  { key: "margin", value: 23.1, formula: "FPAC / adjusted contract", source: "computed", asOf: null },
  { key: "plannedProfit", value: 200, formula: "original contract - BAC", source: "computed", asOf: "2026-10-15T00:00:00.000Z" },
  { key: "profitVariance", value: 100, formula: "FPAC - planned profit", source: "computed", asOf: "2026-10-15T00:00:00.000Z" },
];
function report(overrides: Record<string, unknown> = {}) {
  const freshness = { level: "fresh", staleAfterDays: 7, perSource: [{ source: "progress", lastUpdatedAt: new Date(), ageDays: 0 }, { source: "materials", lastUpdatedAt: new Date(), ageDays: 2 }, { source: "labour", lastUpdatedAt: new Date(), ageDays: 3 }], percentWbsUpdated: 62, staleSources: [], neverUpdated: [], stalestSource: "labour", oldestAgeDays: 3 };
  return {
    project: { id: "p", code: "P-01", name: "Example Project", currency: "SAR" },
    generatedAt: "2026-10-15T00:00:00.000Z",
    headline: ok({ contract: { originalContractValue: 1200, approvedChanges: 100, adjustedContractValue: 1300, countedChangeOrders: 1, ignoredChangeOrders: 1 }, eac: 1000, fpac: 300, marginPercent: 23.1, isLoss: false, plannedProfit: 200, plannedMarginPercent: 16.7, profitVariance: 100, rows: headlineRows }),
    movement: { status: "unavailable", reason: "NO_PREVIOUS_SNAPSHOT" },
    cash: { status: "unavailable", reason: "CASH_SOURCES_UNAVAILABLE" },
    freshness,
    drill: ok({ items: [wbsRow("w1", "1", 600, 400, 700, 150), wbsRow("w2", "2", 400, 100, 300, 50)], totals: { planned: 1000, actual: 500, committed: 200, forecast: 1000, variance: 0 }, unallocatedActual: 0, reconciliationDifference: 0 }),
    ...overrides,
  };
}
const show = (data: unknown) => { state.report = { data, isLoading: false, error: null }; return render(<ProjectFpac tenantId="t" projectId="p" />); };
const exportButtons = () => screen.queryAllByRole("button", { name: "Export to Excel" }) as HTMLButtonElement[];
const headerTexts = (table: HTMLTableElement) => Array.from(table.querySelectorAll("thead th")).map(th => th.textContent ?? "");
const bodyRows = (table: HTMLTableElement) => table.querySelectorAll("tbody tr:not([data-testid='drill-totals'])").length;

describe("ProjectFpac export", () => {
  it("puts one export button next to each of the two tables, in the same card", () => {
    show(report());
    const [headline, drill] = Array.from(document.querySelectorAll("table"));
    const buttons = exportButtons();
    expect(buttons.length).toBe(2);
    const card = headline.closest("section")!;
    expect(buttons.every(button => card.contains(button))).toBe(true);
    // the drill-down button sits on the same line as its heading
    const heading = screen.getByRole("heading", { name: "Top 5 WBS items by variance" });
    expect(heading.parentElement!.contains(buttons[1])).toBe(true);
    expect(drill.closest("section")!.contains(buttons[1])).toBe(true);
  });

  it("exports the headline table: its headers, one row per figure, the margin as a fraction", async () => {
    show(report());
    const [headline] = Array.from(document.querySelectorAll("table")) as HTMLTableElement[];
    fireEvent.click(exportButtons()[0]);
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));
    const input = vi.mocked(buildTableWorkbook).mock.calls[0][0];
    expect(input.columns.map(column => column.header)).toEqual(headerTexts(headline));
    expect(input.rows.length).toBe(bodyRows(headline));
    expect(input.rows.length).toBe(8);
    const margin = input.rows[5];
    expect(input.columns[0].value(margin)).toBe("Profit margin %");
    const marginCell = input.columns[1].value(margin) as { value: number; kind: string };
    expect(marginCell).toMatchObject({ kind: "percent" });
    expect(marginCell.value).toBeCloseTo(0.231);
    expect(input.columns[1].value(input.rows[4])).toMatchObject({ value: 300, kind: "money" });
    expect(input.columns[4].value(input.rows[0])).toEqual(new Date("2026-10-01T00:00:00.000Z"));
    expect(input.columns[4].value(input.rows[1])).toBeNull();
  });

  it("exports the WBS drill-down without its totals row or its open-action column", async () => {
    show(report());
    const [, drill] = Array.from(document.querySelectorAll("table")) as HTMLTableElement[];
    fireEvent.click(exportButtons()[1]);
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));
    const input = vi.mocked(buildTableWorkbook).mock.calls[0][0];
    const headers = headerTexts(drill);
    expect(headers.slice(0, -1)).toEqual(["Item", "Planned", "Actual", "Committed (open)", "Forecast", "Variance"]);
    expect(input.columns.map(column => column.header)).toEqual(headers.slice(0, -1));
    expect(input.rows.length).toBe(bodyRows(drill));
    expect(input.rows.length).toBe(2);
    expect(input.rows.map(row => input.columns.map(column => column.value(row)))).toEqual([
      ["1 · Item 1", 600, 400, 150, 700, -100],
      ["2 · Item 2", 400, 100, 50, 300, 100],
    ]);
  });

  it("does not offer a headline export when the headline is unavailable, but keeps the drill-down one", () => {
    show(report({ headline: { status: "unavailable", reason: "EVM_INPUTS_INCONSISTENT" } }));
    expect(document.querySelectorAll("table").length).toBe(1);
    expect(exportButtons().length).toBe(1);
  });

  it("keeps the drill-down button visible but disabled when no items exist", () => {
    show(report({ drill: ok({ items: [], totals: { planned: 0, actual: 0, committed: 0, forecast: 0, variance: 0 }, unallocatedActual: 0, reconciliationDifference: null }) }));
    const button = exportButtons()[0];
    expect(exportButtons().length).toBe(2);
    expect(button.disabled).toBe(false);
    const drillButton = exportButtons()[1];
    expect(drillButton.disabled).toBe(true);
    expect(screen.getAllByText("No rows to export").length).toBeGreaterThan(0);
  });

  it("uses the Arabic headers when the screen is in Arabic", async () => {
    state.arabic = true;
    show(report());
    const [headline] = Array.from(document.querySelectorAll("table")) as HTMLTableElement[];
    fireEvent.click(screen.getAllByRole("button", { name: "تصدير إلى Excel" })[0]);
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));
    const input = vi.mocked(buildTableWorkbook).mock.calls[0][0];
    expect(input.columns.map(column => column.header)).toEqual(headerTexts(headline));
    expect(input.columns[0].header).toBe("الرقم");
  });
});
