/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProjectControls from "./ProjectControls";
import { InShellProvider } from "@/components/pageFrame";

const state = vi.hoisted(() => ({ scheduleError: null as unknown, performancePartial: false, performanceEmpty: false, scheduleLoading: false, scheduleEmpty: false, financialsEmpty: false, contractsRenderFailure: false }));

vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "tenant-1", projectId: "project-1" }), useLocation: () => ["/projects/tenant-1/project-1/controls", vi.fn()], Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: (false) ? "ar" : "en", isRtl: false }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => <button type="button">Language</button> }));
vi.mock("@/components/EnterpriseNavigation", () => ({ EnterpriseNavigation: () => <nav>Navigation</nav> }));
vi.mock("@/components/DashboardSectionReporter", () => ({ DashboardSectionReporter: () => null }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "safe error" }));
vi.mock("./ProjectContracts", () => ({ ProjectContracts: () => { if (state.contractsRenderFailure) throw new Error("deliberate project contracts render failure"); return null; } }));
vi.mock("./ProjectDocuments", () => ({ ProjectDocuments: () => <p>Documents panel alive</p> }));
vi.mock("./ProjectRfis", () => ({ ProjectRfis: () => null }));
vi.mock("./ProjectNcrs", () => ({ ProjectNcrs: () => null }));
vi.mock("./ProjectHse", () => ({ ProjectHse: () => null }));
vi.mock("./ProjectFieldReports", () => ({ ProjectFieldReports: () => null }));
vi.mock("./ProjectQualityInspections", () => ({ ProjectQualityInspections: () => null }));
vi.mock("./ProjectPurchaseOrders", () => ({ ProjectPurchaseOrders: () => null }));
vi.mock("./ProjectGoodsReceipts", () => ({ ProjectGoodsReceipts: () => null }));
vi.mock("./ProjectProcurement", () => ({ ProjectProcurement: () => null }));
vi.mock("./ProjectChanges", () => ({ ProjectChanges: () => null }));
vi.mock("./ProjectNotifications", () => ({ ProjectNotifications: () => null }));
vi.mock("./ProjectResources", () => ({ ProjectResources: () => null }));
vi.mock("./ProjectMaterials", () => ({ ProjectMaterials: () => null }));
vi.mock("./ProjectWarehouses", () => ({ ProjectWarehouses: () => null }));
vi.mock("./ProjectClaims", () => ({ ProjectClaims: () => null }));
vi.mock("./ProjectAdvisor", () => ({ ProjectAdvisor: () => null }));
vi.mock("./ProjectImports", () => ({ ProjectImports: () => null }));
vi.mock("./ProjectOperationalImports", () => ({ ProjectOperationalImports: () => null }));
vi.mock("./ProjectDataExport", () => ({ ProjectDataExport: () => null }));
vi.mock("./ProjectMasterPlan", () => ({ ProjectMasterPlan: () => null }));
vi.mock("@/components/MasterPlanDrawing", () => ({ MasterPlanDrawing: () => null }));

vi.mock("@/lib/trpc", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false, error: null, data: null });
  return { trpc: {
    projects: {
      getControls: { useQuery: () => ({ isLoading: false, error: null, refetch: vi.fn(), data: { project: { code: "P-01", name: "Delivery evidence" }, wbs: [{ id: "wbs-1", code: "W-01", name: "Still available", plannedValue: 100, progressPercent: 0 }], activities: [], budgets: [], costs: [], progress: [], latestEvm: null, latestHealth: null, cashFlow: null } }) },
      getControlsSchedule: { useQuery: () => ({ isLoading: state.scheduleLoading, error: state.scheduleError, refetch: vi.fn(), data: state.scheduleError || state.scheduleLoading ? undefined : { project: { code: "P-01", name: "Delivery evidence" }, wbs: state.scheduleEmpty ? [] : [{ id: "wbs-1", code: "W-01", name: "Still available", plannedValue: 100, progressPercent: 0 }], activities: [] } }) },
      getControlsFinancials: { useQuery: () => ({ isLoading: false, error: null, refetch: vi.fn(), data: { wbs: state.financialsEmpty ? [] : [{ id: "wbs-1", code: "W-01", name: "Still available", plannedValue: 100, progressPercent: 0 }], budgets: [], costs: [], progress: [] } }) },
      getControlsPerformance: { useQuery: () => ({ isLoading: false, error: state.performancePartial || state.performanceEmpty ? null : { message: "performance unavailable" }, data: state.performancePartial ? { latestEvm: { cpi: 1, spi: 1, eac: 100, vac: 0, periodAt: new Date("2026-09-30T00:00:00.000Z") }, latestHealth: null, cashFlow: null } : state.performanceEmpty ? { latestEvm: null, latestHealth: null, cashFlow: null } : undefined, refetch: vi.fn() }) },
    },
    directUploads: { create: { useMutation: mutation } }, // attachments upload straight to storage (G-139)
    wbs: { create: { useMutation: mutation } }, activities: { create: { useMutation: mutation } }, budgets: { create: { useMutation: mutation } }, costs: { createActual: { useMutation: mutation } }, progress: { create: { useMutation: mutation } }, controls: { saveEvmSnapshot: { useMutation: mutation }, captureOperationalEvmSnapshot: { useMutation: mutation }, captureProjectHealthSnapshot: { useMutation: mutation } },
  } };
});

describe("ProjectControls section resilience", () => {
  afterEach(() => { cleanup(); state.scheduleError = null; state.performancePartial = false; state.performanceEmpty = false; state.scheduleLoading = false; state.scheduleEmpty = false; state.financialsEmpty = false; state.contractsRenderFailure = false; });

  it("inside the product frame draws no top bar or main of its own: the frame keeps the one banner and the one main (review of #156, item 2)", () => {
    const { container } = render(<InShellProvider><ProjectControls /></InShellProvider>);
    expect(screen.queryAllByRole("banner")).toHaveLength(0);
    expect(screen.queryAllByRole("main")).toHaveLength(0);
    expect(container.querySelectorAll("header, main")).toHaveLength(0);
    // the page's actions stay, as a toolbar in the content
    expect(container.querySelector("[data-page-toolbar]")?.textContent).toContain("Profitability");
    expect(screen.getByText("Delivery evidence")).toBeTruthy();
  });

  it("opened on its own (outside the frame) keeps its own main landmark", () => {
    render(<ProjectControls />);
    expect(screen.getAllByRole("main")).toHaveLength(1);
  });

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

  it("keeps an empty PROJECT source distinct from a source error", () => {
    state.financialsEmpty = true;
    state.performanceEmpty = true;
    state.scheduleError = { message: "schedule unavailable" };
    render(<ProjectControls />);
    expect(screen.getAllByText("No data is available for this section in the current access scope.").length).toBeGreaterThan(0);
    expect(screen.getByText("safe error")).toBeTruthy();
  });

  it("gives a scoped project manager a command center and opens the selected governed tool lane", () => {
    state.performancePartial = true;
    render(<ProjectControls />);
    expect(within(screen.getByLabelText("PROJECT MANAGER COMMAND CENTER")).getByText("Operate the project from one control point")).toBeTruthy();
    expect(screen.getByText("Operating scope: P-01")).toBeTruthy();
    const commercial = document.getElementById("manager-commercial") as HTMLDetailsElement;
    expect(commercial.open).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: /Contracts & procurement/i }));
    expect(commercial.open).toBe(true);
  });

  it("contains a deliberate operational render failure while the schedule section remains available", () => {
    state.performancePartial = true;
    state.contractsRenderFailure = true;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<ProjectControls />);
    expect(screen.getByText("This section could not be loaded. The rest of the dashboard remains available.")).toBeTruthy();
    expect(screen.getAllByText("W-01 · Still available").length).toBeGreaterThan(0);
    consoleError.mockRestore();
  });

  it("contains a failing panel to itself: it is named, offers a retry, and the panel next to it keeps working (G-100)", () => {
    state.performancePartial = true;
    state.contractsRenderFailure = true;
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    render(<ProjectControls />);
    const failed = screen.getByRole("region", { name: "Contracts", hidden: true });
    expect(failed.textContent).toContain("This section could not be loaded");
    expect(within(failed).getByRole("button", { name: "Try again", hidden: true })).toBeTruthy();
    expect(screen.getByText("Documents panel alive")).toBeTruthy(); // same group, next panel
    state.contractsRenderFailure = false;
    fireEvent.click(within(failed).getByRole("button", { name: "Try again", hidden: true }));
    expect(screen.queryByRole("region", { name: "Contracts", hidden: true })).toBeNull(); // retried and rendered
    consoleError.mockRestore();
  });

  it("shows the formula and the date beside each manager indicator (G-106)", () => {
    state.performancePartial = true;
    render(<ProjectControls />);
    const lines = screen.getAllByTestId("indicator-basis").map(node => node.textContent ?? "");
    expect(lines).toHaveLength(5);
    expect(lines[0]).toContain("no snapshot saved yet"); // health: no snapshot in this fixture
    expect(lines[1]).toContain("CPI = EV ÷ AC"); expect(lines[1]).toContain("as of Sep 30, 2026"); // EVM: its snapshot date
    expect(lines[2]).toContain("Remaining = planned budget"); expect(lines[2]).toContain("as of now");
    expect(lines[3]).toContain("blocked"); expect(lines[4]).toContain("WBS");
    expect(lines.every(line => line.startsWith("Formula: ") && line.includes("Source: "))).toBe(true);
    // work order 21: the face shows the number and its status; each formula is folded behind "How is it calculated?"
    for (const node of screen.getAllByTestId("indicator-basis")) expect(node.closest("details")?.querySelector("summary")?.textContent).toBe("How is it calculated?");
  });
});
