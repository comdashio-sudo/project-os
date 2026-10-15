/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PortfolioProfitability } from "./PortfolioProfitability";

const state = vi.hoisted(() => ({ arabic: false, query: {} as Record<string, unknown> }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.arabic }) }));
vi.mock("@/lib/trpc", () => ({ trpc: { profitability: { portfolio: { useQuery: () => state.query } } } }));
afterEach(() => { cleanup(); state.arabic = false; state.query = {}; });

describe("PortfolioProfitability", () => {
  it("lists losing projects first with a coloured movement and links to each project", () => {
    state.query = { isLoading: false, error: null, data: { total: { currency: "SAR", fpac: 130 }, projects: [{ projectId: "p2", code: "B", name: "Loss", currency: "SAR", fpac: -70, movement: -20 }, { projectId: "p1", code: "A", name: "Gain", currency: "SAR", fpac: 200, movement: null }], unavailable: [{ projectId: "p3", code: "C", name: "No data", reason: "EVM_UNAVAILABLE" }] } };
    render(<PortfolioProfitability tenantId="t" />);
    const rows = screen.getAllByTestId("portfolio-row");
    expect(rows.map(row => row.textContent)).toEqual([expect.stringContaining("B · Loss"), expect.stringContaining("A · Gain")]);
    expect(rows[0].textContent).toContain("-70 SAR");
    expect(rows[0].textContent).toContain("▼ -20 SAR");
    expect(rows[1].textContent).toContain("No earlier snapshot");
    expect(within(rows[0]).getByText("Open").getAttribute("href")).toBe("/projects/t/p2/profitability");
    expect(screen.getByTestId("portfolio-total").textContent).toBe("130 SAR");
    expect(screen.getByText(/could not be calculated: C/)).toBeTruthy();
  });

  it("withholds the total when currencies differ, and shows loading, error and empty states", () => {
    state.query = { isLoading: false, error: null, data: { total: null, projects: [{ projectId: "p1", code: "A", name: "n", currency: "SAR", fpac: 1, movement: 0 }], unavailable: [] } };
    const { unmount } = render(<PortfolioProfitability tenantId="t" />);
    expect(screen.queryByTestId("portfolio-total")).toBeNull();
    expect(screen.getByText(/different currencies/)).toBeTruthy();
    unmount();
    state.query = { isLoading: true, error: null, data: undefined };
    const loading = render(<PortfolioProfitability tenantId="t" />);
    expect(screen.getByText("Calculating profitability…")).toBeTruthy();
    loading.unmount();
    state.query = { isLoading: false, error: new Error("x"), data: undefined };
    const failed = render(<PortfolioProfitability tenantId="t" />);
    expect(screen.getByRole("alert")).toBeTruthy();
    failed.unmount();
    state.query = { isLoading: false, error: null, data: { total: { currency: null, fpac: 0 }, projects: [], unavailable: [] } };
    render(<PortfolioProfitability tenantId="t" />);
    expect(screen.getByText("No active projects in your scope.")).toBeTruthy();
  });

  it("renders in Arabic", () => {
    state.arabic = true;
    state.query = { isLoading: true, error: null, data: undefined };
    render(<PortfolioProfitability tenantId="t" />);
    expect(screen.getByText("جارٍ احتساب الربحية…")).toBeTruthy();
    expect(screen.getByText("ربحية المشاريع")).toBeTruthy();
  });
});
