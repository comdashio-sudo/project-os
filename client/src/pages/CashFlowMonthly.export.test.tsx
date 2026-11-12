/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import CashFlowMonthly from "./CashFlowMonthly";
import { buildTableWorkbook } from "@/lib/excelExport";
import { EXPORT_TEST, EXPORT_WAIT } from "@/test/exportWait";

vi.mock("@/lib/excelExport", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/excelExport")>();
  return { ...actual, buildTableWorkbook: vi.fn(actual.buildTableWorkbook) };
});

const h = vi.hoisted(() => ({ arabic: false, empty: false }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.arabic, language: (h.arabic) ? "ar" : "en", isRtl: h.arabic }) }));
const months = [
  { month: "2026-09", receipts: 0, outflows: 250, net: -250, cumulative: -250 },
  { month: "2026-10", receipts: 1725, outflows: 400, net: 1325, cumulative: 1075 },
];
vi.mock("@/lib/trpc", () => ({ trpc: { profitability: { cashFlow: { useQuery: () => ({
  isLoading: false,
  error: null,
  refetch: vi.fn(),
  data: { months: h.empty ? [] : months, totals: { receipts: 1725, outflows: 650, net: 1075 }, lowestCumulative: null },
}) } } } }));

// D-85: these tests failed only under CPU contention (four runs at once on four cores reproduce it every time; one run alone never does),
// not because of the date: building the .xlsx (ExcelJS loads on first use) can take longer than waitFor's default 1 s there. So the waits
// for the download use EXPORT_WAIT (client/src/test/exportWait.ts), and the clock is pinned to midday UTC (the same calendar day in UTC and in Riyadh, +3) so the file name is exact.
const PINNED = new Date("2026-11-09T12:00:00Z");
vi.setConfig({ hookTimeout: 30000 }); // the hooks around these tests (render, cleanup) slow down with the rest under contention

let downloads: string[] = [];
let clickSpy: MockInstance<HTMLAnchorElement["click"]>;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] }); // only the clock
  vi.setSystemTime(PINNED);
  downloads = [];
  URL.createObjectURL = vi.fn(() => "blob:export-test");
  URL.revokeObjectURL = vi.fn();
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  });
});
afterEach(() => {
  vi.useRealTimers();
  cleanup();
  clickSpy.mockRestore();
  vi.clearAllMocks();
  h.arabic = false;
  h.empty = false;
});

const show = () => render(<CashFlowMonthly tenantId="t" projectId="p" currency="SAR" />);
const exportButton = () => screen.getByRole("button", { name: /Export to Excel|تصدير إلى Excel/ }) as HTMLButtonElement;
const headerTexts = () => Array.from(document.querySelectorAll("thead th")).map(th => th.textContent);
const bodyRowCount = () => document.querySelectorAll("tbody tr").length;
const exportedCall = () => vi.mocked(buildTableWorkbook).mock.calls[0][0];

describe("CashFlowMonthly Excel export", EXPORT_TEST, () => {
  it("puts the export button in the same card as the table", () => {
    show();
    const card = screen.getByTestId("cashflow-monthly");
    expect(card.contains(exportButton())).toBe(true);
    expect(card.querySelector("table")).not.toBeNull();
    expect(exportButton().disabled).toBe(false);
  });

  it.each<[string, boolean]>([["English", false], ["Arabic", true]])("exports the same headers and rows as the table on screen (%s)", async (_label, arabic) => {
    h.arabic = arabic;
    show();
    fireEvent.click(exportButton());
    await waitFor(() => expect(downloads).toHaveLength(1), EXPORT_WAIT);
    expect(exportedCall().columns.map(column => column.header)).toEqual(headerTexts());
    expect(exportedCall().rows).toHaveLength(bodyRowCount());
    expect(bodyRowCount()).toBe(2);
    expect(downloads[0]).toBe("cash-flow-monthly-2026-11-09.xlsx");
  });

  it("exports the amounts as numbers, not as the formatted text on screen", async () => {
    show();
    fireEvent.click(exportButton());
    await waitFor(() => expect(downloads).toHaveLength(1), EXPORT_WAIT);
    const { columns, rows } = exportedCall();
    expect(rows.map(row => columns.map(column => column.value(row)))).toEqual([
      ["2026-09", 0, 250, -250, -250],
      ["2026-10", 1725, 400, 1325, 1075],
    ]);
    expect(columns.slice(1).every(column => column.kind === "money")).toBe(true);
  });

  it("shows the button disabled, with the reason, and does not export when no months are recorded", () => {
    h.empty = true;
    show();
    expect(exportButton().disabled).toBe(true);
    expect(screen.getByText("No rows to export")).toBeTruthy();
    fireEvent.click(exportButton());
    expect(buildTableWorkbook).not.toHaveBeenCalled();
  });
});
