// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Q-63 (batch 1): the progress board on the PMC page. Synthetic villas only.
const h = vi.hoisted(() => ({ query: {} as Record<string, unknown>, navigated: [] as string[] }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false }) }));
vi.mock("wouter", () => ({ useLocation: () => ["/", (to: string) => h.navigated.push(to)] }));
vi.mock("@/lib/trpc", () => ({ trpc: { pmc: { progressBoard: { useQuery: () => h.query } } } }));

import { ProgressBoard } from "./ProgressBoard";
afterEach(() => cleanup());
const villa = (n: number, progress: number | null) => ({ unitNumber: n, zoneCode: "Z1", blockCode: n <= 2 ? "B1" : "B2", modelCode: "A", hasGeometry: false, progressPercent: progress, thisMonthPercent: progress === null ? null : 5 });
const data = (overrides: Record<string, unknown> = {}) => ({ hasBaseline: true, kpi: { actual: 42.5, plannedToday: 50, variance: -7.5, spi: 0.85, monthTarget: 55, perWeekNeeded: 4.17, thisMonth: 6 }, counts: { villas: 4, done: 1, inProgress: 2, notStarted: 1, unknown: 0 }, units: [villa(1, 100), villa(2, 40), villa(3, 30), villa(4, 0)], ...overrides });

describe("ProgressBoard", () => {
  it("the KPI bar: actual, planned to date, a negative variance in the warning colour, SPI, the month's target and the weekly pace", () => {
    h.query = { isLoading: false, data: data() };
    render(<ProgressBoard tenantId="t1" projectId="p1" />);
    const value = (label: string) => document.querySelector(`[data-kpi="${label}"]`)!.textContent!;
    expect(value("Actual progress")).toContain("42.5%");
    expect(value("Planned to date")).toContain("50");
    expect(value("Variance")).toContain("-7.5%");
    expect(document.querySelector('[data-kpi="Variance"] .text-destructive')).toBeTruthy();
    expect(value("Schedule performance (SPI)")).toContain("0.85");
    expect(value("Month-end target")).toContain("55");
    expect(document.querySelector("[data-board-counts]")!.textContent).toContain("4 villas · 1 done · 2 in progress · 1 not started");
    expect(screen.getByRole("img", { name: /Map of 4 villas/ })).toBeTruthy();
    expect(document.querySelector("[data-no-baseline]")).toBeNull();
  });

  it("NEGATIVE: without a baseline the planned figures are «—», never 0, and the page says why", () => {
    h.query = { isLoading: false, data: data({ hasBaseline: false, kpi: { actual: 42.5, plannedToday: null, variance: null, spi: null, monthTarget: null, perWeekNeeded: null, thisMonth: 6 } }) };
    render(<ProgressBoard tenantId="t1" projectId="p1" />);
    for (const label of ["Planned to date", "Variance", "Schedule performance (SPI)", "Month-end target", "Needed per week"]) {
      const text = document.querySelector(`[data-kpi="${label}"]`)!.textContent!;
      expect(text, label).toContain("—");
      expect(text, label).not.toMatch(/\b0(\.0)?%/);
    }
    expect(document.querySelector("[data-no-baseline]")!.textContent).toContain("planned programme is imported");
  });

  it("switches the colouring, and the legend follows it", () => {
    h.query = { isLoading: false, data: data() };
    render(<ProgressBoard tenantId="t1" projectId="p1" />);
    expect(document.querySelector("[data-board-legend]")!.textContent).toContain("67–99%");
    fireEvent.click(document.querySelector('[data-colour-mode="month"]')!);
    expect(document.querySelector('[data-colour-mode="month"]')!.getAttribute("aria-pressed")).toBe("true");
    expect(document.querySelector("[data-board-legend]")!.textContent).toContain("15%+");
    fireEvent.click(document.querySelector('[data-colour-mode="model"]')!);
    expect(document.querySelector("[data-board-legend]")!.textContent).toBe("A");
  });

  it("a project with no villas says what to do instead of showing an empty map; a failed read says so", () => {
    h.query = { isLoading: false, data: data({ units: [], counts: { villas: 0, done: 0, inProgress: 0, notStarted: 0, unknown: 0 } }) };
    render(<ProgressBoard tenantId="t1" projectId="p1" />);
    expect(document.querySelector("[data-board-empty]")!.textContent).toContain("Import the villa list");
    expect(document.querySelector("[data-board-map]")).toBeNull();
    cleanup();
    h.query = { isLoading: false, error: new Error("PROJECT_OS_PERMISSION_DENIED"), refetch: () => undefined };
    render(<ProgressBoard tenantId="t1" projectId="p1" />);
    expect(screen.getByText("The progress board could not be loaded")).toBeTruthy();
  });
});
