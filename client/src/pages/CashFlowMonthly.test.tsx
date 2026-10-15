/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import CashFlowMonthly from "./CashFlowMonthly";

const h = vi.hoisted(() => ({ arabic: false, mode: "ok" as "ok" | "empty" | "loading" | "error" | "positive", refetch: vi.fn() }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.arabic }) }));
const months = [
  { month: "2026-09", receipts: 0, outflows: 250, net: -250, cumulative: -250 },
  { month: "2026-10", receipts: 1725, outflows: 400, net: 1325, cumulative: 1075 },
];
vi.mock("@/lib/trpc", () => ({ trpc: { profitability: { cashFlow: { useQuery: () => {
  if (h.mode === "loading") return { isLoading: true, error: null, data: undefined, refetch: h.refetch };
  if (h.mode === "error") return { isLoading: false, error: new Error("x"), data: undefined, refetch: h.refetch };
  if (h.mode === "empty") return { isLoading: false, error: null, refetch: h.refetch, data: { months: [], totals: { receipts: 0, outflows: 0, net: 0 }, lowestCumulative: null } };
  const rows = h.mode === "positive" ? months.slice(1) : months;
  return { isLoading: false, error: null, refetch: h.refetch, data: { months: rows, totals: { receipts: 1725, outflows: 650, net: 1075 }, lowestCumulative: h.mode === "positive" ? { month: "2026-10", cumulative: 1075 } : { month: "2026-09", cumulative: -250 } } };
} } } } }));
afterEach(() => { cleanup(); Object.assign(h, { arabic: false, mode: "ok" }); vi.clearAllMocks(); });
const show = () => render(<CashFlowMonthly tenantId="t" projectId="p" currency="SAR" />);

describe("CashFlowMonthly", () => {
  it("shows each month's receipts, outflows, net and running position, and warns when the position went below zero", () => {
    show();
    const rows = Array.from(document.querySelectorAll("tbody tr")).map(tr => Array.from(tr.querySelectorAll("td")).map(td => td.textContent));
    expect(rows).toEqual([["2026-09", "0 SAR", "250 SAR", "-250 SAR", "-250 SAR"], ["2026-10", "1,725 SAR", "400 SAR", "1,325 SAR", "1,075 SAR"]]);
    expect(screen.getByRole("status").textContent).toBe("Lowest cumulative position: -250 SAR in 2026-09.");
    expect(screen.getByText(/the nearest the platform has to payments/)).toBeTruthy(); // the basis is stated, not hidden
  });

  it("does not raise a warning when the position never went below zero", () => {
    h.mode = "positive";
    show();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("says nothing was recorded, shows loading and an error with retry, and has Arabic headings", () => {
    h.mode = "empty";
    const first = show();
    expect(screen.getByText(/No money movement recorded yet/)).toBeTruthy();
    first.unmount();
    h.mode = "loading";
    const second = show();
    expect(screen.getByRole("status").textContent).toBe("Loading…");
    second.unmount();
    h.mode = "error";
    const third = show();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(h.refetch).toHaveBeenCalledTimes(1);
    third.unmount();
    h.mode = "ok"; h.arabic = true;
    show();
    expect(screen.getByText("صافي التدفق النقدي شهريًا")).toBeTruthy();
  });
});
