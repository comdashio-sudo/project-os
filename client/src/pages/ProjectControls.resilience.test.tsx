/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProjectControls from "./ProjectControls";

const state = vi.hoisted(() => ({ scheduleError: null as unknown, performancePartial: false, performanceEmpty: false, scheduleLoading: false, scheduleEmpty: false, financialsEmpty: false }));

vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "tenant-1", projectId: "project-1" }), Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <button type="button">Language</button> }));
vi.mock("@/components/EnterpriseNavigation", () => ({ EnterpriseNavigation: () => <nav>Navigation</nav> }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "safe error" }));
vi.mock("./ProjectContracts", () => ({ ProjectContracts: () => null }));
vi.mock("./ProjectDocuments", () => ({ ProjectDocuments: () => null }));
vi.mock("./ProjectRfis", () => ({ ProjectRfis: () => null }));
vi.mock("./ProjectNcrs", () => ({ ProjectNcrs: () => null }));
vi.mock("./ProjectHse", () => ({ ProjectHse: () => null }));
vi.mock("./ProjectFieldReports", () => ({ ProjectFieldReports: () => null }));
vi.mock("./ProjectQualityInspections", () => ({ ProjectQualityInspections: () => null }));
vi.mock("./ProjectPurchaseOrders", () => ({ ProjectPurchaseOrders: () => null }));
vi.mock("./ProjectChanges", () => ({ ProjectChanges: () => null }));
vi.mock("./ProjectNotifications", () => ({ ProjectNotifications: () => null }));
vi.mock("./ProjectResources", () => ({ ProjectResources: () => null }));
vi.mock("./ProjectClaims", () => ({ ProjectClaims: () => null }));
vi.mock("./ProjectAdvisor", () => ({ ProjectAdvisor: () => null }));
vi.mock("./ProjectImports", () => ({ ProjectImports: () => null }));
vi.mock("./ProjectDataExport", () => ({ ProjectDataExport: () => null }));
vi.mock("./ProjectMasterPlan", () => ({ ProjectMasterPlan: () => null }));

vi.mock("@/lib/trpc", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false, error: null, data: null });
  return { trpc: {
    projects: {
      getControls: { useQuery: () => ({ isLoading: false, error: null, refetch: vi.fn(), data: { project: { code: "P-01", name: "Delivery evidence" }, wbs: [{ id: "wbs-1", code: "W-01", name: "Still available", plannedValue: 100, progressPercent: 0 }], activities: [], budgets: [], costs: [], progress: [], latestEvm: null, latestHealth: null, cashFlow: null } }) },
      getControlsSchedule: { useQuery: () => ({ isLoading: state.scheduleLoading, error: state.scheduleError, refetch: vi.fn(), data: state.scheduleError || state.scheduleLoading ? undefined : { project: { code: "P-01", name: "Delivery evidence" }, wbs: state.scheduleEmpty ? [] : [{ id: "wbs-1", code: "W-01", name: "Still available", plannedValue: 100, progressPercent: 0 }], activities: [] } }) },
      getControlsFinancials: { useQuery: () => ({ isLoading: false, error: null, refetch: vi.fn(), data: { wbs: state.financialsEmpty ? [] : [{ id: "wbs-1", code: "W-01", name: "Still available", plannedValue: 100, progressPercent: 0 }], budgets: [], costs: [], progress: [] } }) },
      getControlsPerformance: { useQuery: () => ({ isLoading: false, error: state.performancePartial || state.performanceEmpty ? null : { message: "performance unavailable" }, data: state.performancePartial ? { latestEvm: { cpi: 1, spi: 1, eac: 100, vac: 0 }, latestHealth: null, cashFlow: null } : state.performanceEmpty ? { latestEvm: null, latestHealth: null, cashFlow: null } : undefined, refetch: vi.fn() }) },
    },
    wbs: { create: { useMutation: mutation } }, activities: { create: { useMutation: mutation } }, budgets: { create: { useMutation: mutation } }, costs: { createActual: { useMutation: mutation } }, progress: { create: { useMutation: mutation } }, controls: { saveEvmSnapshot: { useMutation: mutation }, captureOperationalEvmSnapshot: { useMutation: mutation }, captureProjectHealthSnapshot: { useMutation: mutation } },
  } };
});

describe("ProjectControls section resilience", () => {
  afterEach(() => { cleanup(); state.scheduleError = null; state.performancePartial = false; state.performanceEmpty = false; state.scheduleLoading = false; state.scheduleEmpty = false; state.financialsEmpty = false; });

  it("keeps project controls available when the independent performance source fails", () => {
    render(<ProjectControls />);
    expect(screen.getByText("Delivery evidence")).toBeTruthy();
    expect(screen.getAllByText("W-01 · Still available").length).toBeGreaterThan(0);
    expect(screen.getByText("This section could not be loaded. The rest of the dashboard remains available.")).toBeTruthy();
  });

  it("keeps financial WBS data available when the independent schedule source fails", () => {
    state.scheduleError = { message: "schedule unavailable" };
    render(<ProjectControls />);
    expect(screen.getAllByText("W-01 · Still available").length).toBeGreaterThan(0);
    expect(screen.getAllByText("This section could not be loaded. The rest of the dashboard remains available.").length).toBeGreaterThan(0);
  });

  it("names the missing health input when performance data is only partial", () => {
    state.performancePartial = true;
    render(<ProjectControls />);
    expect(screen.getByText("Available: part of the performance data. Missing: health snapshot.")).toBeTruthy();
    expect(screen.getAllByText("W-01 · Still available").length).toBeGreaterThan(0);
  });

  it("shows local loading and empty states for independent project sources", () => {
    state.scheduleLoading = true;
    state.financialsEmpty = true;
    state.performanceEmpty = true;
    render(<ProjectControls />);
    expect(within(screen.getAllByLabelText("Schedule and WBS")[0]).getByText("Loading this section…")).toBeTruthy();
    expect(within(screen.getAllByLabelText("Cost and progress records")[0]).getByText("No data is available for this section in the current access scope.")).toBeTruthy();
    expect(within(screen.getAllByLabelText("Project performance data")[0]).getByText("No data is available for this section in the current access scope.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Project delivery board" })).toBeTruthy();
  });
});
