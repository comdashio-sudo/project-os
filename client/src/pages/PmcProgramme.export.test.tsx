/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { PmcProgramme } from "./PmcProgramme";
import { buildTableWorkbook } from "@/lib/excelExport";

vi.mock("@/lib/excelExport", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/excelExport")>();
  return { ...actual, buildTableWorkbook: vi.fn(actual.buildTableWorkbook) };
});

const h = vi.hoisted(() => ({
  arabic: false,
  empty: false,
  months: [
    { month: "2026-09-01", planned: 30, actual: 10, plannedInMonth: 30, actualInMonth: 10, variance: -20 },
    { month: "2026-10-01", planned: 68, actual: 65, plannedInMonth: 38, actualInMonth: 55, variance: -3 },
    { month: "2026-11-01", planned: 80, actual: null, plannedInMonth: 12, actualInMonth: null, variance: null },
  ] as Array<{ month: string; planned: number | null; actual: number | null; plannedInMonth: number | null; actualInMonth: number | null; variance: number | null }>,
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.arabic }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { pmc: { programme: { useQuery: () => {
  const cards = { currency: "SAR", contractValue: 1000000, paid: { amount: 100000, percent: 10 }, confirmed: { amount: 150000, percent: 15 }, target: { amount: 680000, percent: 68 } };
  return {
    isLoading: false,
    error: null,
    refetch: vi.fn(),
    data: { hasBaseline: true, months: h.empty ? [] : h.months, plannedToDate: 68, actualToDate: 65, progressFromCells: 65, cellsWithoutHistory: 0, cards },
  };
} } } } }));

let downloads: string[] = [];
let clickSpy: MockInstance<HTMLAnchorElement["click"]>;
beforeEach(() => {
  downloads = [];
  URL.createObjectURL = vi.fn(() => "blob:export-test");
  URL.revokeObjectURL = vi.fn();
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    downloads.push(this.download);
  });
});
afterEach(() => {
  cleanup();
  clickSpy.mockRestore();
  vi.clearAllMocks();
  h.arabic = false;
  h.empty = false;
});

const show = () => render(<PmcProgramme tenantId="t" projectId="p" />);
const exportButton = () => screen.getByRole("button", { name: /Export to Excel|تصدير إلى Excel/ }) as HTMLButtonElement;
const headerTexts = () => Array.from(document.querySelectorAll("thead th")).map(th => th.textContent);
const bodyRowCount = () => document.querySelectorAll("tbody tr").length;
const exportedCall = () => vi.mocked(buildTableWorkbook).mock.calls[0][0];

describe("PmcProgramme Excel export", () => {
  it("puts the export button in the same block as the programme table", () => {
    show();
    const block = screen.getByTestId("programme");
    expect(block.contains(exportButton())).toBe(true);
    expect(block.querySelector("table")).not.toBeNull();
    expect(exportButton().disabled).toBe(false);
  });

  it.each<[string, boolean]>([["English", false], ["Arabic", true]])("exports the same headers and rows as the programme table on screen (%s)", async (_label, arabic) => {
    h.arabic = arabic;
    show();
    fireEvent.click(exportButton());
    await waitFor(() => expect(downloads).toHaveLength(1));
    expect(exportedCall().columns.map(column => column.header)).toEqual(headerTexts());
    expect(exportedCall().rows).toHaveLength(bodyRowCount());
    expect(bodyRowCount()).toBe(3);
    expect(downloads[0]).toMatch(/^pmc-programme-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it("exports the percentages as fractions with a percent format, and a month without an actual as an empty cell", async () => {
    show();
    fireEvent.click(exportButton());
    await waitFor(() => expect(downloads).toHaveLength(1));
    const { columns, rows } = exportedCall();
    expect(rows.map(row => columns.map(column => column.value(row)))).toEqual([
      ["2026-09", 0.3, 0.1, -0.2, 0.3, 0.1],
      ["2026-10", 0.68, 0.65, -0.03, 0.38, 0.55],
      ["2026-11", 0.8, null, null, 0.12, null],
    ]);
    expect(columns.slice(1).every(column => column.kind === "percent")).toBe(true);
  });

  it("shows the button disabled, with the reason, and does not export when there are no months", () => {
    h.empty = true;
    show();
    expect(exportButton().disabled).toBe(true);
    expect(screen.getByText("No rows to export")).toBeTruthy();
    fireEvent.click(exportButton());
    expect(buildTableWorkbook).not.toHaveBeenCalled();
  });
});
