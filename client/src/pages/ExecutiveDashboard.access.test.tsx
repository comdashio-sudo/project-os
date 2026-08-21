/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ExecutiveDashboard from "./ExecutiveDashboard";

const state = vi.hoisted(() => ({
  error: { message: "forbidden" } as unknown,
  data: undefined as unknown,
  projectsError: null as unknown,
  cashError: null as unknown,
  cashData: undefined as unknown,
}));

vi.mock("wouter", () => ({
  useParams: () => ({ tenantId: "tenant-1" }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <button type="button">Language</button> }));
vi.mock("@/components/EnterpriseNavigation", () => ({ EnterpriseNavigation: () => <nav>Navigation</nav> }));
vi.mock("@/components/DashboardSectionReporter", () => ({ DashboardSectionReporter: () => null }));
vi.mock("./PortfolioCashFlowChart", () => ({ default: () => <div>Cash chart</div> }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Access denied safely" }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ dashboards: { invalidate: vi.fn() } }),
    dashboards: {
      executiveMetrics: { useQuery: () => ({ isLoading: false, error: state.error, data: state.data ? { totals: (state.data as { totals: unknown }).totals } : undefined }) },
      executiveProjects: { useQuery: () => ({ isLoading: false, error: state.projectsError ?? state.error, data: state.projectsError || state.error ? undefined : state.data ? { projects: (state.data as { projects: unknown }).projects } : undefined }) },
      executiveDecisions: { useQuery: () => ({ isLoading: false, error: state.error, data: state.data ? { decisions: (state.data as { decisions: unknown }).decisions } : undefined }) },
      executiveCashFlow: { useQuery: () => ({ isLoading: false, error: state.cashError, data: state.cashData }) },
    },
    executive: { createDecision: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false }) } },
  },
}));

describe("ExecutiveDashboard access", () => {
  afterEach(() => { cleanup(); state.error = { message: "forbidden" }; state.data = undefined; state.projectsError = null; state.cashError = null; state.cashData = undefined; });

  it("shows a localized denial and omits executive controls when executive data is forbidden", () => {
    render(<ExecutiveDashboard />);
    expect(screen.getByText("Access denied safely")).toBeTruthy();
    expect(screen.queryByText("Leadership view")).toBeNull();
    expect(screen.queryByRole("button", { name: "Save decision draft" })).toBeNull();
  });

  it("renders the PROJECT OS product label only inside an authorized executive dashboard", () => {
    state.error = null;
    state.data = {
      totals: { budget: 100, actual: 60, forecast: 90 },
      projects: [{ id: "project-1", code: "EX-01", name: "Executive evidence", status: "active", health: { status: "green" }, forecastCost: 90, remainingBudget: 40, totalExposure: 0 }],
      decisions: [],
    };
    state.cashData = { cashFlow: { plannedBudget: 100, actualCost: 60, committedAmount: 0, remainingBudget: 40, totalExposure: 0 }, cashFlowByPortfolio: [], cashFlowByProject: [] };
    render(<ExecutiveDashboard />);

    expect(screen.getByText("PROJECT OS")).toBeTruthy();
    expect(screen.getAllByText("EX-01 · Executive evidence").length).toBeGreaterThan(0);
  });

  it("keeps executive indicators and decisions available when only the cash-flow source fails", () => {
    state.error = null;
    state.data = { totals: { budget: 100, actual: 60, forecast: 90 }, projects: [{ id: "project-1", code: "EX-01", name: "Executive evidence", status: "active", health: { status: "green" }, forecastCost: 90 }], decisions: [{ id: "decision-1", problem: "Approve recovery", status: "open" }] };
    state.cashError = { message: "cash source unavailable" };
    render(<ExecutiveDashboard />);
    expect(screen.getByText("Leadership view")).toBeTruthy();
    expect(screen.getByText("Approve recovery")).toBeTruthy();
    expect(screen.getByText("This section could not be loaded. The rest of the dashboard remains available.")).toBeTruthy();
  });

  it("keeps executive indicators and decisions available when only the projects source fails", () => {
    state.error = null;
    state.projectsError = { message: "projects source unavailable" };
    state.data = { totals: { budget: 100, actual: 60, forecast: 90 }, projects: [], decisions: [{ id: "decision-1", problem: "Approve recovery", status: "open" }] };
    state.cashData = { cashFlow: { plannedBudget: 100, actualCost: 60, committedAmount: 0, remainingBudget: 40, totalExposure: 0 }, cashFlowByPortfolio: [], cashFlowByProject: [] };
    render(<ExecutiveDashboard />);
    expect(screen.getByText("Leadership view")).toBeTruthy();
    expect(screen.getByText("Approve recovery")).toBeTruthy();
    expect(screen.getByText("Access denied safely")).toBeTruthy();
  });
});
