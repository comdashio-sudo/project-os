// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Q-11 (b): the planner screen. Fabricated numbers only.
const h = vi.hoisted(() => ({ run: vi.fn(), data: undefined as unknown, exportFn: vi.fn() }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "t1" }) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({}),
    devPlanner: {
      run: { useMutation: () => ({ mutate: h.run, isPending: false, error: null, data: h.data }) },
      export: { useMutation: () => ({ mutate: h.exportFn, isPending: false, error: null }) },
    },
  },
}));
import DevPlanner from "./DevPlanner";

beforeEach(() => { h.run.mockReset(); h.exportFn.mockReset(); h.data = undefined; });
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
  });
});
