/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PmoDashboard from "./PmoDashboard";
import { expectEmptySubmitRefused } from "@/test/checkedFormExpect";

const state = vi.hoisted(() => ({ exceptionsError: null as unknown, risksError: null as unknown, risksLoading: false, setupEmpty: false, planningPartial: false, materialShortage: false, controlLinksRenderFailure: false }));

vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "tenant-1" }), Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: (false) ? "ar" : "en", isRtl: false }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <button type="button">Language</button> }));
vi.mock("@/components/EnterpriseNavigation", () => ({ EnterpriseNavigation: () => <nav>Navigation</nav> }));
vi.mock("@/components/DashboardSectionReporter", () => ({ DashboardSectionReporter: () => null }));
vi.mock("./PmoControlLinks", () => ({ PmoControlLinks: () => { if (state.controlLinksRenderFailure) throw new Error("deliberate PMO control-links render failure"); return null; } }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "safe error" }));
vi.mock("@/lib/trpc", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, error: null });
  return { trpc: {
    useUtils: () => ({ dashboards: { invalidate: vi.fn() } }),
    dashboards: {
      pmoPortfolioSetup: { useQuery: () => ({ isLoading: false, error: null, data: { portfolios: [], programs: [], projects: state.setupEmpty ? [] : [{ id: "critical", code: "P-01", name: "Needs intervention" }, { id: "steady", code: "P-02", name: "On track project" }], decisions: [], rfis: [], ncrs: [] } }) },
      pmoRisks: { useQuery: () => ({ isLoading: state.risksLoading, error: state.risksError, data: state.risksError || state.risksLoading ? undefined : { risks: [] } }) },
      pmoIssues: { useQuery: () => ({ isLoading: false, error: null, data: { issues: [] } }) },
      pmoActions: { useQuery: () => ({ isLoading: false, error: null, data: { actions: [] } }) },
      pmoPlanning: { useQuery: () => ({ isLoading: false, error: null, data: { planningOverview: { summary: { totalProjects: 2, criticalProjects: 1, warningProjects: 0, dataRequiredProjects: state.planningPartial ? 1 : 0, delayedProjects: 1 }, projects: [
        { id: "critical", code: "P-01", name: "Needs intervention", lifecycleStage: "execution", status: "active", currency: "SAR", finishVarianceDays: 5, attentionLevel: "critical", health: { status: "red", overallScore: 42, periodAt: new Date("2026-08-19") }, evm: { cpi: 0.8, spi: 0.8, eac: 125, vac: -25, periodAt: new Date("2026-08-20") }, forecastFinishAt: new Date("2026-08-25"), signals: ["schedule_critical", "cost_critical", "finish_delay"] },
        { id: "steady", code: "P-02", name: "On track project", lifecycleStage: "execution", status: "active", currency: "SAR", finishVarianceDays: 0, attentionLevel: state.planningPartial ? "data_required" : "on_track", health: state.planningPartial ? null : { status: "green" }, evm: state.planningPartial ? null : { cpi: 1.02, spi: 1.01 }, forecastFinishAt: new Date("2026-08-20"), signals: state.planningPartial ? ["missing_evm", "missing_health"] : [] },
      ] } } }) },
      pmoTodayExceptions: { useQuery: () => ({ isLoading: false, error: state.exceptionsError, data: state.exceptionsError ? undefined : { todayExceptions: [{ id: "health:critical", category: "health", severity: "critical", projectId: "critical", projectCode: "P-01", projectName: "Needs intervention", label: "health_red", detail: "red", dueAt: null }, ...(state.materialShortage ? [{ id: "inventory:critical:mat-1", category: "inventory", severity: "warning", projectId: "critical", projectCode: "P-01", projectName: "Needs intervention", label: "material_reorder_required", detail: "MAT-01 · Concrete · 2/10", dueAt: null }] : [])] } }) },
    },
    navigation: { get: { useQuery: ({ tenantId, projectId }: { tenantId: string; projectId?: string }) => ({ data: projectId === "critical" ? [{ id: "project-controls", href: `/projects/${tenantId}/${projectId}/controls` }] : [] }) } },
    pmo: { createRisk: { useMutation: mutation }, createIssue: { useMutation: mutation }, createAction: { useMutation: mutation }, createPortfolio: { useMutation: mutation }, createProgram: { useMutation: mutation }, linkProject: { useMutation: mutation }, transitionIssueEscalation: { useMutation: mutation }, transitionActionEscalation: { useMutation: mutation } },
  } };
});

describe("PmoDashboard planning control center", () => {
  afterEach(() => { cleanup(); state.exceptionsError = null; state.risksError = null; state.risksLoading = false; state.setupEmpty = false; state.planningPartial = false; state.materialShortage = false; state.controlLinksRenderFailure = false; });

  it("starts with actionable exceptions and reveals all projects through the filter", () => {
    render(<PmoDashboard />);
    expect(screen.getByText("PROJECT OS")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Planning control center" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Today’s exceptions" })).toBeTruthy();
    expect(screen.getByText("Red health")).toBeTruthy();
    expect(screen.getByText("Critical schedule delay")).toBeTruthy();
    expect(screen.getAllByText("P-02 · On track project")).toHaveLength(4);
    fireEvent.change(screen.getByLabelText("Projects"), { target: { value: "all" } });
    expect(screen.getAllByText("P-02 · On track project")).toHaveLength(5);
  });

  it("renders a material shortage in the existing today exceptions center", () => {
    state.materialShortage = true;
    render(<PmoDashboard />);
    expect(within(screen.getByLabelText("Today’s exceptions")).getByText("Material reorder required")).toBeTruthy();
    expect(within(screen.getByLabelText("Today’s exceptions")).getByText("MAT-01 · Concrete · 2/10")).toBeTruthy();
  });

  it("shows the numeric EVM trace, formula, and source period in the existing planning center", () => {
    render(<PmoDashboard />);
    const trace = screen.getByLabelText("Indicator source & formula");
    expect(within(trace).getByText(/SPI = EV\/PV · CPI = EV\/AC/)).toBeTruthy();
    expect(within(trace).getByText(/EAC 125\.00; VAC -25\.00/)).toBeTruthy();
    expect(within(trace).getByText(/P-01/)).toBeTruthy();
  });

  it("keeps the planning center and PMO register available when today exceptions fail", () => {
    state.exceptionsError = { message: "exceptions unavailable" };
    render(<PmoDashboard />);
    expect(screen.getAllByRole("heading", { name: "Planning control center" }).length).toBeGreaterThan(0);
    expect(screen.getAllByText("P-01 · Needs intervention").length).toBeGreaterThan(0);
    expect(screen.getByText("This section could not be loaded. The rest of the dashboard remains available.")).toBeTruthy();
  });

  it("keeps planning and today exceptions available when the independent risks source fails", () => {
    state.risksError = { message: "risks unavailable" };
    render(<PmoDashboard />);
    expect(screen.getByRole("heading", { name: "Planning control center" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Today’s exceptions" })).toBeTruthy();
    expect(screen.getAllByText("safe error").length).toBeGreaterThan(0);
  });

  it("shows loading and empty states in their PMO source sections without hiding planning", () => {
    state.risksLoading = true;
    render(<PmoDashboard />);
    expect(within(screen.getAllByLabelText("Open risks")[0]).getByText("Loading this section…")).toBeTruthy();
    expect(within(screen.getByLabelText("Open issues")).getByText("No records are available in the current access scope.")).toBeTruthy();
    expect(within(screen.getByLabelText("Open actions")).getByText("No records are available in the current access scope.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Planning control center" })).toBeTruthy();
  });

  it("identifies missing planning inputs as partial without replacing the planning table", () => {
    state.planningPartial = true;
    render(<PmoDashboard />);
    expect(within(screen.getByLabelText("Planning control center")).getByText("Available: portfolio planning data. Missing: an EVM or health snapshot for one or more projects.")).toBeTruthy();
    expect(screen.getByText("No EVM snapshot")).toBeTruthy();
  });

  it("shows an empty portfolio setup state at the setup source", () => {
    state.setupEmpty = true;
    render(<PmoDashboard />);
    expect(within(screen.getByLabelText("Portfolio and program setup")).getByText("The portfolio starts with the first project: create it, then link it to a portfolio and a program here.")).toBeTruthy();
    // D-28 (G-170): the next step, for someone who may create a project (no permission provider here, so allowed)
    expect(within(screen.getByLabelText("Portfolio and program setup")).getByRole("link", { name: "Create the first project" }).getAttribute("href")).toMatch(/^\/projects\/.+\/new$/);
    expect(screen.getByRole("heading", { name: "Today’s exceptions" })).toBeTruthy();
  });

  it("keeps an empty PMO source distinct from an errored source", () => {
    state.setupEmpty = true;
    state.risksError = { message: "risks unavailable" };
    render(<PmoDashboard />);
    expect(screen.getByText("The portfolio starts with the first project: create it, then link it to a portfolio and a program here.")).toBeTruthy();
    expect(screen.getAllByText("safe error").length).toBeGreaterThan(0);
  });

  it("contains a deliberate control-links render failure while planning remains available", () => {
    state.controlLinksRenderFailure = true;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<PmoDashboard />);
    expect(screen.getByText("This section could not be loaded. The rest of the dashboard remains available.")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Planning control center" })).toBeTruthy();
    consoleError.mockRestore();
  });
});

describe("PmoDashboard checks its forms in the page's language (D-65)", () => {
  it("its forms stop an empty submit and say so in English under the first field", () => {
    render(<PmoDashboard />);
    const forms = Array.from(document.querySelectorAll<HTMLFormElement>("form")).filter(node => node.querySelector("[required]"));
    expect(forms.length).toBeGreaterThan(0);
    expectEmptySubmitRefused(forms[0], "en", vi.fn());
  });
});
