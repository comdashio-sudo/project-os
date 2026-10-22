/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildTableWorkbook } from "@/lib/excelExport";
import { PortfolioProfitability } from "./PortfolioProfitability";

vi.mock("@/lib/excelExport", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/excelExport")>();
  return { ...actual, buildTableWorkbook: vi.fn(actual.buildTableWorkbook) };
});
const state = vi.hoisted(() => ({ arabic: false, query: {} as Record<string, unknown> }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.arabic }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { profitability: { portfolio: { useQuery: () => state.query } } } }));

let clickSpy: { mockRestore: () => void };
beforeEach(() => {
  URL.createObjectURL = vi.fn(() => "blob:export");
  URL.revokeObjectURL = vi.fn();
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
  vi.mocked(buildTableWorkbook).mockClear();
});
afterEach(() => { cleanup(); clickSpy.mockRestore(); state.arabic = false; state.query = {}; });

const data = {
  total: { currency: "SAR", fpac: 130 },
  projects: [
    { projectId: "p2", code: "B", name: "Loss", currency: "SAR", fpac: -70, movement: -20 },
    { projectId: "p1", code: "A", name: "Gain", currency: "SAR", fpac: 200, movement: null },
  ],
  unavailable: [{ projectId: "p3", code: "C", name: "No data", reason: "EVM_UNAVAILABLE" }],
};

describe("PortfolioProfitability export", () => {
  it("renders the export button in the same card as the table", () => {
    state.query = { isLoading: false, error: null, data };
    render(<PortfolioProfitability tenantId="t" />);
    const button = screen.getByRole("button", { name: "Export to Excel" }) as HTMLButtonElement;
    const card = screen.getByRole("table").closest("section")!;
    expect(card.contains(button)).toBe(true);
    expect(button.disabled).toBe(false);
  });

  it("exports the table's headers (without the link column) and one row per table row", async () => {
    state.query = { isLoading: false, error: null, data };
    render(<PortfolioProfitability tenantId="t" />);
    const table = screen.getByRole("table");
    const headerRow = Array.from(table.querySelectorAll("thead th")).map(th => th.textContent ?? "");
    expect(headerRow).toEqual(["Project", "Forecast profit (FPAC)", "Movement", "Open"]);
    fireEvent.click(screen.getByRole("button", { name: "Export to Excel" }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));
    const input = vi.mocked(buildTableWorkbook).mock.calls[0][0];
    // The last column is the "Open" link: an action, not data, so it is not exported.
    expect(input.columns.map(column => column.header)).toEqual(headerRow.slice(0, -1));
    expect(input.rows.length).toBe(table.querySelectorAll("tbody tr").length);
    expect(input.columns.map(column => column.kind)).toEqual(["text", "money", "money"]);
  });

  it("passes raw values: names as text, FPAC and movement as money with the project's currency, a missing movement as empty", async () => {
    state.query = { isLoading: false, error: null, data };
    render(<PortfolioProfitability tenantId="t" />);
    fireEvent.click(screen.getByRole("button", { name: "Export to Excel" }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));
    const input = vi.mocked(buildTableWorkbook).mock.calls[0][0];
    expect(input.rows.map(row => input.columns.map(column => column.value(row)))).toEqual([
      ["B · Loss", { value: -70, kind: "money", currency: "SAR" }, { value: -20, kind: "money", currency: "SAR" }],
      ["A · Gain", { value: 200, kind: "money", currency: "SAR" }, { value: null, kind: "money", currency: "SAR" }],
    ]);
  });

  it("keeps the button visible but disabled when there are no rows", () => {
    state.query = { isLoading: false, error: null, data: { total: null, projects: [], unavailable: [] } };
    render(<PortfolioProfitability tenantId="t" />);
    const button = screen.getByRole("button", { name: "Export to Excel" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(screen.getByText("No rows to export")).toBeTruthy();
  });

  it("uses the Arabic headers when the screen is in Arabic", async () => {
    state.arabic = true;
    state.query = { isLoading: false, error: null, data };
    render(<PortfolioProfitability tenantId="t" />);
    fireEvent.click(screen.getByRole("button", { name: "تصدير إلى Excel" }));
    await waitFor(() => expect(URL.createObjectURL).toHaveBeenCalledTimes(1));
    expect(vi.mocked(buildTableWorkbook).mock.calls[0][0].columns.map(column => column.header)).toEqual(["المشروع", "الربح المتوقع (FPAC)", "الحركة"]);
  });
});
