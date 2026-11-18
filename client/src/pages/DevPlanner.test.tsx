// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Q-11 (b): the planner screen. Fabricated numbers only.
const h = vi.hoisted(() => ({ run: vi.fn(), data: undefined as unknown, exportFn: vi.fn(), apply: vi.fn(), listCalls: 0, plannerProjects: vi.fn(), projects: [{ id: "p1", code: "VIL-1", name: "Villas" }] as unknown[], summary: undefined as unknown }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "t1" }) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({}),
    devPlanner: {
      run: { useMutation: () => ({ mutate: h.run, isPending: false, error: null, data: h.data }) },
      export: { useMutation: () => ({ mutate: h.exportFn, isPending: false, error: null }) },
      applyToProject: { useMutation: () => ({ mutate: h.apply, isPending: false, error: null, isSuccess: false }) },
      projects: { useQuery: (input: unknown, options: { enabled?: boolean }) => { h.plannerProjects(input, options); return options?.enabled ? { isSuccess: true, error: null, data: h.projects } : { isSuccess: false, error: null, data: undefined }; } },
    },
    // the company register (project.read): the page must never ask for it (Q-34)
    projects: { list: { useQuery: () => { h.listCalls += 1; return { isSuccess: true, data: [] }; } } },
    accessSummary: { mine: { useQuery: () => ({ data: h.summary, error: null }) } },
    _unused: {
    },
  },
}));
import DevPlanner from "./DevPlanner";
import { PermissionProvider } from "@/lib/permissions";

const RESULT = { crewMultiplier: 1, labourTargetFeasible: true, units: 120, scenarios: { min: { totalMonths: 21.2, buildStartMonths: 8, buildMonths: 13 }, likely: { totalMonths: 24.7, buildStartMonths: 8, buildMonths: 17.9 }, max: { totalMonths: 34.7, buildStartMonths: 9, buildMonths: 25 } }, activities: [{ id: "frame", name: "Frame", trade: "Concrete", crews: 10, workers: 140, startMonth: 9.1, finishMonth: 14.2, critical: true }], labour: { months: [40, 629, 300], peak: 629 }, sales: { launchMonth: 8.1, sellingMonths: 14, endMonth: 22.1, curve: [13, 26] } };
const summaryWith = (permissions: string[]) => ({ member: true, products: ["PROJECT"], permissions, scopes: [{ scopeType: "project", scopeId: "p1" }] });

beforeEach(() => { h.run.mockReset(); h.exportFn.mockReset(); h.plannerProjects.mockReset(); h.data = undefined; h.listCalls = 0; h.projects = [{ id: "p1", code: "VIL-1", name: "Villas" }]; h.summary = undefined; });
afterEach(() => cleanup());

describe("DevPlanner", () => {
  it("sends the inputs to the server (villas, 6 days, medium risk) and exports with the screen's language", () => {
    render(<DevPlanner />);
    fireEvent.click(screen.getByRole("button", { name: "Calculate" }));
    expect(h.run).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t1", plan: expect.objectContaining({ type: "villa", workingDaysPerWeek: 6, risk: 0.78, villaModels: expect.arrayContaining([expect.objectContaining({ count: 40 })]) }) }));
    fireEvent.click(screen.getByRole("button", { name: "Export to Excel" }));
    expect(h.exportFn).toHaveBeenCalledWith(expect.objectContaining({ locale: "en" }));
  });
  it("shows the three scenarios, the critical path and the labour peak", () => {
    h.data = { crewMultiplier: 1, labourTargetFeasible: true, units: 120, scenarios: { min: { totalMonths: 21.2, buildStartMonths: 8, buildMonths: 13 }, likely: { totalMonths: 24.7, buildStartMonths: 8, buildMonths: 17.9 }, max: { totalMonths: 34.7, buildStartMonths: 9, buildMonths: 25 } }, activities: [{ id: "frame", name: "Frame", trade: "Concrete", crews: 10, workers: 140, startMonth: 9.1, finishMonth: 14.2, critical: true }], labour: { months: [40, 629, 300], peak: 629 }, sales: { launchMonth: 8.1, sellingMonths: 14, endMonth: 22.1, curve: [13, 26] } };
    render(<DevPlanner />);
    const result = screen.getByTestId("planner-result").textContent ?? "";
    expect(result).toContain("24.7 months");
    expect(result).toContain("Frame");
    expect(result).toContain("Peak: 629");
    expect(result).toContain("Apply to a project");
  });

  it("Q-34: opening the page asks for no project list — not the company register (project.read, refused to a planning engineer), nor the planner's own until there is a plan", () => {
    render(<DevPlanner />);
    expect(h.listCalls).toBe(0);
    expect(h.plannerProjects).toHaveBeenCalledWith({ tenantId: "t1" }, expect.objectContaining({ enabled: false }));
    expect(screen.queryByRole("alert")).toBeNull();
  });
  it("Q-34: a planning engineer scoped to one project (planning permissions, no project.read) gets the planner, not an error", () => {
    h.summary = summaryWith(["project.schedule.manage", "project.pmc.manage"]);
    render(<PermissionProvider tenantId="t1"><DevPlanner /></PermissionProvider>);
    expect(screen.getByRole("button", { name: "Calculate" })).toBeTruthy();
    expect(h.listCalls).toBe(0);
  });
  it("Q-34 NEGATIVE: without a planning permission (a site engineer) the page says «no permission» instead of a form the server refuses", () => {
    h.summary = summaryWith(["project.read", "project.progress.manage"]);
    const { container } = render(<PermissionProvider tenantId="t1"><DevPlanner /></PermissionProvider>);
    expect(screen.queryByRole("button", { name: "Calculate" })).toBeNull();
    expect(container.querySelector("[data-page-gate=denied]")).not.toBeNull();
  });
  it("Q-34: every field says what it does, the model columns are explained, and «how the duration is calculated» opens the method", () => {
    render(<DevPlanner />);
    expect(screen.getByLabelText("Working days/week").getAttribute("aria-describedby")).toBeTruthy();
    expect(document.body.textContent).toContain("Working days become calendar days: × 7 ÷ working days × 1.03.");
    expect(document.body.textContent).toContain("Productivity of the max scenario against the norm: low 85%, medium 78%, high 70%.");
    const columns = screen.getByTestId("planner-column-help").textContent ?? "";
    for (const label of ["Count", "Built-up m²", "Floors", "Plot m²"]) expect(columns).toContain(`${label}:`);
    const method = screen.getByTestId("planner-method");
    expect(method.textContent).toContain("How the duration is calculated");
    expect(method.textContent).toContain("Line of balance");
    expect(method.textContent).toContain("within 1%");
  });
  it("Q-34: once there is a plan, «apply» lists the projects the person manages; with none it says so instead of an empty choice", () => {
    h.data = RESULT;
    render(<DevPlanner />);
    expect(h.plannerProjects).toHaveBeenLastCalledWith({ tenantId: "t1" }, expect.objectContaining({ enabled: true }));
    expect(screen.queryByTestId("planner-no-projects")).toBeNull();
    cleanup(); h.projects = [];
    render(<DevPlanner />);
    expect(screen.getByTestId("planner-no-projects").textContent).toContain("You manage no project here");
    expect(screen.queryByRole("button", { name: "Apply" })).toBeNull();
  });
});
