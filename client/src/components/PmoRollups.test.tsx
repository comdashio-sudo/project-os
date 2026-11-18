/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PmoRollups } from "./PmoRollups";

// Q-45 (b): the PMO roll-ups show the server's numbers, and «Not available» — never 0 — where no float exists. Synthetic data only.
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false }) }));
afterEach(() => cleanup());
const totals = { projects: 2, overdueActivities: 3, criticalActivities: 2, openHighRisks: 1, criticalIssues: 0, overdueActions: 4 };
const data = {
  activitySignals: [{ projectId: "p1", overdueActivities: 2, criticalActivities: 2 }, { projectId: "p2", overdueActivities: 1, criticalActivities: null }],
  programTotals: [{ programId: "g1", ...totals }],
  portfolioTotals: [{ portfolioId: "f1", ...totals, criticalActivities: null }],
  programs: [{ id: "g1", code: "PG-1", name: "Villas" }],
  portfolios: [{ id: "f1", code: "PF-1", name: "Housing" }],
  projects: [{ id: "p1", code: "P-1", name: "From P6" }, { id: "p2", code: "P-2", name: "By hand" }],
};

describe("Q-45 (b): PMO roll-ups", () => {
  it("per project and per program/portfolio, with «Not available» instead of 0 where no float exists", () => {
    render(<PmoRollups data={data} />);
    const byHand = screen.getByText("P-2 · By hand").closest("tr")!;
    expect(within(byHand).getByText("Not available")).toBeTruthy();
    const program = screen.getByText("PG-1 · Villas").closest("tr")!;
    expect(Array.from(program.querySelectorAll("td")).map(cell => cell.textContent)).toEqual(["PG-1 · Villas", "2", "3", "2", "1", "0", "4"]);
    expect(within(screen.getByText("PF-1 · Housing").closest("tr")!).getByText("Not available")).toBeTruthy();
    expect(screen.getByText(/none of its activities carries a float/)).toBeTruthy();
  });

  it("no project in scope says so", () => {
    render(<PmoRollups data={{ ...data, activitySignals: [], programTotals: [], portfolioTotals: [] }} />);
    expect(screen.getByText("No project in your scope.")).toBeTruthy();
  });
});
