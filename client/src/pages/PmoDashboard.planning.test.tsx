/** @vitest-environment jsdom */
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import PmoDashboard from "./PmoDashboard";

vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "tenant-1" }), Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <button type="button">Language</button> }));
vi.mock("@/components/EnterpriseNavigation", () => ({ EnterpriseNavigation: () => <nav>Navigation</nav> }));
vi.mock("./PmoControlLinks", () => ({ PmoControlLinks: () => null }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "safe error" }));
vi.mock("@/lib/trpc", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, error: null });
  return { trpc: {
    useUtils: () => ({ dashboards: { pmo: { invalidate: vi.fn() } } }),
    dashboards: { pmo: { useQuery: () => ({ isLoading: false, error: null, data: {
      portfolios: [], programs: [], projects: [{ id: "critical", code: "P-01", name: "Needs intervention" }, { id: "steady", code: "P-02", name: "On track project" }], risks: [], issues: [], actions: [], decisions: [], rfis: [], ncrs: [],
      planningOverview: { summary: { totalProjects: 2, criticalProjects: 1, warningProjects: 0, dataRequiredProjects: 0, delayedProjects: 1 }, projects: [
        { id: "critical", code: "P-01", name: "Needs intervention", lifecycleStage: "execution", status: "active", currency: "SAR", finishVarianceDays: 5, attentionLevel: "critical", health: { status: "red" }, evm: { cpi: 0.8, spi: 0.8 }, forecastFinishAt: new Date("2026-08-25"), signals: ["schedule_critical", "cost_critical", "finish_delay"] },
        { id: "steady", code: "P-02", name: "On track project", lifecycleStage: "execution", status: "active", currency: "SAR", finishVarianceDays: 0, attentionLevel: "on_track", health: { status: "green" }, evm: { cpi: 1.02, spi: 1.01 }, forecastFinishAt: new Date("2026-08-20"), signals: [] },
      ] },
      todayExceptions: [{ id: "health:critical", category: "health", severity: "critical", projectId: "critical", projectCode: "P-01", projectName: "Needs intervention", label: "health_red", detail: "red", dueAt: null }],
    } }) } },
    pmo: { createRisk: { useMutation: mutation }, createIssue: { useMutation: mutation }, createAction: { useMutation: mutation }, createPortfolio: { useMutation: mutation }, createProgram: { useMutation: mutation }, linkProject: { useMutation: mutation }, transitionIssueEscalation: { useMutation: mutation }, transitionActionEscalation: { useMutation: mutation } },
  } };
});

describe("PmoDashboard planning control center", () => {
  it("starts with actionable exceptions and reveals all projects through the filter", () => {
    render(<PmoDashboard />);
    expect(screen.getByRole("heading", { name: "Planning control center" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Today’s exceptions" })).toBeTruthy();
    expect(screen.getByText("Red health")).toBeTruthy();
    expect(screen.getByText("Critical schedule delay")).toBeTruthy();
    expect(screen.getAllByText("P-02 · On track project")).toHaveLength(4);
    fireEvent.change(screen.getByLabelText("Projects"), { target: { value: "all" } });
    expect(screen.getAllByText("P-02 · On track project")).toHaveLength(5);
  });
});
