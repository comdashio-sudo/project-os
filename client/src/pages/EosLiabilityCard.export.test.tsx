/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { EosLiabilityCard } from "./EosLiabilityCard";
import { buildTableWorkbook } from "@/lib/excelExport";
import { EXPORT_TEST, EXPORT_WAIT } from "@/test/exportWait";

vi.mock("@/lib/excelExport", async importOriginal => {
  const actual = await importOriginal<typeof import("@/lib/excelExport")>();
  return { ...actual, buildTableWorkbook: vi.fn(actual.buildTableWorkbook) };
});

const h = vi.hoisted(() => ({
  arabic: false,
  empty: false,
  data: {
    months: [{ month: "2026-11", accrued: 500.75, cumulative: 500.75, employees: 2 }, { month: "2026-12", accrued: 300.5, cumulative: 801.25, employees: 1 }],
    total: 801.25,
    currencies: ["SAR"],
    employees: [{ employeeId: "c", employeeNumber: "E-C", fullName: "Employee C", cumulative: 601 }, { employeeId: "d", employeeNumber: "E-D", fullName: "Employee D", cumulative: 200.25 }],
  },
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.arabic, language: (h.arabic) ? "ar" : "en", isRtl: h.arabic }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { employees: { payroll: {
  capabilities: { useQuery: () => ({ data: { canReadSensitivePayroll: true } }) },
  eosLiability: { useQuery: () => ({ isLoading: false, error: null, data: h.empty ? { ...h.data, months: [] } : h.data }) },
} } } }));

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

const show = () => render(<EosLiabilityCard tenantId="t" />);
const exportButton = () => screen.getByRole("button", { name: /Export to Excel|تصدير إلى Excel/ }) as HTMLButtonElement;
const card = () => screen.getByRole("heading", { level: 2 }).closest("section");
const headerTexts = () => Array.from(document.querySelectorAll("thead th")).map(th => th.textContent);
const bodyRowCount = () => document.querySelectorAll("tbody tr").length;
const exportedCall = () => vi.mocked(buildTableWorkbook).mock.calls[0][0];

describe("EosLiabilityCard Excel export", EXPORT_TEST, () => {
  it("puts the export button in the same card as the month table", () => {
    show();
    expect(card()?.contains(exportButton())).toBe(true);
    expect(card()?.querySelector("table")).not.toBeNull();
    expect(exportButton().disabled).toBe(false);
  });

  it.each<[string, boolean]>([["English", false], ["Arabic", true]])("exports the same headers and rows as the month table on screen (%s)", async (_label, arabic) => {
    h.arabic = arabic;
    show();
    fireEvent.click(exportButton());
    await waitFor(() => expect(downloads).toHaveLength(1), EXPORT_WAIT);
    expect(exportedCall().columns.map(column => column.header)).toEqual(headerTexts());
    expect(exportedCall().rows).toHaveLength(bodyRowCount());
    expect(bodyRowCount()).toBe(2);
    expect(downloads[0]).toMatch(/^eos-liability-\d{4}-\d{2}-\d{2}\.xlsx$/);
  });

  it("exports the raw amounts and the employee count, and leaves the total row out of the data rows", async () => {
    show();
    fireEvent.click(exportButton());
    await waitFor(() => expect(downloads).toHaveLength(1), EXPORT_WAIT);
    const { columns, rows } = exportedCall();
    expect(rows.map(row => columns.map(column => column.value(row)))).toEqual([
      ["2026-11", 500.75, 500.75, 2],
      ["2026-12", 300.5, 801.25, 1],
    ]);
    expect(columns.map(column => column.kind)).toEqual([undefined, "money", "money", "number"]);
  });

  it("shows the button disabled, with the reason, and does not export when there are no approved accruals", () => {
    h.empty = true;
    show();
    expect(exportButton().disabled).toBe(true);
    expect(screen.getByText("No rows to export")).toBeTruthy();
    fireEvent.click(exportButton());
    expect(buildTableWorkbook).not.toHaveBeenCalled();
  });
});
