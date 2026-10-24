/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PmcProgramme } from "./PmcProgramme";

const h = vi.hoisted(() => ({
  arabic: false,
  mode: "ok" as "ok" | "loading" | "error" | "empty" | "nobaseline" | "nohistory",
  refetch: vi.fn(),
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.arabic, language: (h.arabic) ? "ar" : "en", isRtl: h.arabic }) }));
const months = [
  { month: "2026-09-01", planned: 30, actual: 10, plannedInMonth: 30, actualInMonth: 10, variance: -20 },
  { month: "2026-10-01", planned: 68, actual: 65, plannedInMonth: 38, actualInMonth: 55, variance: -3 },
  { month: "2026-11-01", planned: 80, actual: null, plannedInMonth: 12, actualInMonth: null, variance: null },
];
const cards = { currency: "SAR", contractValue: 1000000, paid: { amount: 100000, percent: 10 }, confirmed: { amount: 150000, percent: 15 }, target: { amount: 680000, percent: 68 } };
vi.mock("@/lib/trpc", () => ({ trpc: { pmc: { programme: { useQuery: () => {
  if (h.mode === "loading") return { isLoading: true, error: null, data: undefined, refetch: h.refetch };
  if (h.mode === "error") return { isLoading: false, error: new Error("x"), data: undefined, refetch: h.refetch };
  const base = { hasBaseline: true, months, plannedToDate: 68, actualToDate: 65, progressFromCells: 65, cellsWithoutHistory: 0, cards };
  const data = h.mode === "empty" ? { ...base, months: [] } : h.mode === "nobaseline" ? { ...base, hasBaseline: false, plannedToDate: null, months: months.map(m => ({ ...m, planned: null, plannedInMonth: null, variance: null })), cards: { ...cards, target: { amount: null, percent: null } } } : h.mode === "nohistory" ? { ...base, cellsWithoutHistory: 3, progressFromCells: 75 } : base;
  return { isLoading: false, error: null, data, refetch: h.refetch };
} } } } }));

afterEach(() => { cleanup(); Object.assign(h, { arabic: false, mode: "ok" }); vi.clearAllMocks(); });

describe("PmcProgramme", () => {
  it("shows the month table with planned, actual and variance, and the money cards", () => {
    render(<PmcProgramme tenantId="t" projectId="p" />);
    const rows = Array.from(document.querySelectorAll("tbody tr")).map(tr => Array.from(tr.querySelectorAll("td")).map(td => td.textContent));
    expect(rows[1]).toEqual(["2026-10", "68%", "65%", "-3%", "38%", "55%"]);
    expect(rows[2]).toEqual(["2026-11", "80%", "—", "—", "12%", "—"]); // a future month has a plan but no actual
    expect(screen.getByTestId("card-paid").textContent).toContain("100,000 SAR");
    expect(screen.getByTestId("card-paid").textContent).toContain("10%");
    expect(screen.getByTestId("card-confirmed").textContent).toContain("150,000 SAR");
    expect(screen.getByTestId("card-target").textContent).toContain("680,000 SAR");
    expect(screen.getByTestId("card-target").textContent).toContain("68%");
    expect(document.querySelector(".recharts-wrapper")).not.toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("says there is no baseline instead of showing a planned curve, and does not invent a target", () => {
    h.mode = "nobaseline";
    render(<PmcProgramme tenantId="t" projectId="p" />);
    expect(screen.getByRole("status").textContent).toContain("No baseline has been imported yet");
    expect(screen.getByTestId("card-target").textContent).toContain("Needs a baseline and a contract value");
    expect(screen.getByTestId("card-target").textContent).toContain("—");
  });

  it("warns when cells have a status without history, naming both numbers", () => {
    h.mode = "nohistory";
    render(<PmcProgramme tenantId="t" projectId="p" />);
    expect(screen.getByRole("alert").textContent).toBe("3 cells have a status but no history, so the actual curve (from history) reads 65% while project progress from the statuses is 75%.");
  });

  it("shows loading, an error with retry, no data, and Arabic labels", () => {
    h.mode = "loading";
    const { unmount } = render(<PmcProgramme tenantId="t" projectId="p" />);
    expect(screen.getByRole("status").textContent).toBe("Loading…");
    unmount();
    h.mode = "error";
    const second = render(<PmcProgramme tenantId="t" projectId="p" />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(h.refetch).toHaveBeenCalledTimes(1);
    second.unmount();
    h.mode = "empty";
    const third = render(<PmcProgramme tenantId="t" projectId="p" />);
    expect(screen.getByText("No data")).toBeTruthy();
    third.unmount();
    h.mode = "ok"; h.arabic = true;
    render(<PmcProgramme tenantId="t" projectId="p" />);
    expect(screen.getByText("المدفوع")).toBeTruthy();
    expect(screen.getByText("الفوترة المستهدفة")).toBeTruthy();
  });
});
