/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ExecutiveDashboard from "./ExecutiveDashboard";

const state = vi.hoisted(() => ({
  error: { message: "forbidden" } as unknown,
  data: undefined as unknown,
}));

vi.mock("wouter", () => ({
  useParams: () => ({ tenantId: "tenant-1" }),
  Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>,
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <button type="button">Language</button> }));
vi.mock("@/components/EnterpriseNavigation", () => ({ EnterpriseNavigation: () => <nav>Navigation</nav> }));
vi.mock("./PortfolioCashFlowChart", () => ({ default: () => <div>Cash chart</div> }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Access denied safely" }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ dashboards: { executive: { invalidate: vi.fn() } } }),
    dashboards: { executive: { useQuery: () => ({ isLoading: false, error: state.error, data: state.data }) } },
    executive: { createDecision: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false }) } },
  },
}));

describe("ExecutiveDashboard access", () => {
  afterEach(() => { cleanup(); state.error = { message: "forbidden" }; state.data = undefined; });

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
      cashFlow: { plannedBudget: 100, actualCost: 60, committedAmount: 0, remainingBudget: 40, totalExposure: 0 },
      cashFlowByPortfolio: [],
      cashFlowByProject: [],
    };
    render(<ExecutiveDashboard />);

    expect(screen.getByText("PROJECT OS")).toBeTruthy();
    expect(screen.getAllByText("EX-01 · Executive evidence").length).toBeGreaterThan(0);
  });
});
