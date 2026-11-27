// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Q-70 (3): the activity summary screen. Synthetic data only.
const h = vi.hoisted(() => ({ canManage: false, setEngineer: vi.fn(), calls: [] as Array<Record<string, unknown>>, exported: {} as Record<string, unknown[]>, period: null as unknown }));
vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "t", projectId: "p" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
vi.mock("@/components/ExportExcelButton", () => ({ ExportExcelButton: (props: { fileName: string; rows: unknown[] }) => { h.exported[props.fileName] = props.rows; return <button type="button">Export</button>; } }));
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: ({ id, options, value, onValueChange, "aria-label": ariaLabel }: { id?: string; "aria-label"?: string; options: Array<{ value: string; label: string }>; value?: string; onValueChange: (value: string) => void }) => (
  <select id={id} aria-label={ariaLabel} value={value} onChange={event => onValueChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
) }));
const data = {
  activities: [{ code: "ACT01", name: "Excavation", villas: 5, complete: 4, underReview: 0, inProgress: 0, notStarted: 1, completionPercent: 80, earnedPercent: 80 }, { code: "ACT02", name: "Footings", villas: 4, complete: 0, underReview: 0, inProgress: 1, notStarted: 3, completionPercent: 0, earnedPercent: 0 }],
  blocks: [{ key: "BLK 33", villas: 2, progressPercent: 40, villasWithoutNumber: 0, completeCells: 2, totalCells: 4, held: { cells: 1, villas: 1, percent: 12.5 }, engineer: { userId: 7, name: "Engineer Seven (synthetic)" } }],
  phases: [{ key: "PH1", villas: 2, progressPercent: 40, villasWithoutNumber: 0, completeCells: 2, totalCells: 4, held: { cells: 0, villas: 0, percent: 0 }, engineer: null }],
  project: { villas: 5, progressPercent: 52, held: { cells: 3, villas: 2, percent: 7.5 }, villasWithoutNumber: 1 },
  reconciliation: { blocks: { villas: 5, villasMissing: 0, cells: 9, cellsMissing: 0, matches: true }, phases: { villas: 4, villasMissing: 1, cells: 7, cellsMissing: 2, matches: false } },
  filters: { blocks: ["BLK 33", "BLK 34"], phases: ["PH1", "PH2"] },
};
vi.mock("@/lib/permissions", () => ({ useCan: () => h.canManage }));
vi.mock("@/lib/trpc", () => ({ trpc: { useUtils: () => ({ pmc: { activitySummary: { invalidate: vi.fn() } } }), pmc: { scopeEngineerCandidates: { useQuery: () => ({ data: [{ userId: 7, name: "Engineer Seven (synthetic)" }], isError: false, error: null }) }, setScopeEngineer: { useMutation: () => ({ mutate: h.setEngineer }) }, activitySummary: { useQuery: (input: Record<string, unknown>) => { h.calls.push(input); return { data: { ...data, period: input.from ? h.period : null }, isError: false, error: null, refetch: vi.fn() }; } } } } }));

import ActivitySummary from "./ActivitySummary";

beforeEach(() => { h.canManage = false; h.setEngineer.mockReset(); h.calls = []; h.exported = {}; h.period = null; });
afterEach(() => cleanup());

describe("ActivitySummary (Q-70 3)", () => {
  it("POSITIVE: the project's number, an activity row per code with complete / in progress / remaining, and each table exports exactly its rows", () => {
    render(<ActivitySummary />);
    expect(document.querySelector("[data-summary-project]")!.textContent).toContain("Project progress: 52.00%");
    expect(document.querySelector("[data-summary-project]")!.textContent).toContain("1 villas without a number");
    expect(document.querySelectorAll("[data-summary-activities] tbody tr")).toHaveLength(2);
    expect(h.exported["activity-summary"]).toEqual(data.activities);
    expect(h.exported["progress-by-blocks"]).toEqual(data.blocks);
    expect(h.exported["progress-by-phases"]).toEqual(data.phases);
  });

  it("NEGATIVE: choosing a block asks the server for that block only — the screen never narrows a whole-project answer itself", () => {
    render(<ActivitySummary />);
    expect(h.calls[0]).toEqual({ tenantId: "t", projectId: "p" });
    fireEvent.change(document.getElementById(screen.getByText("Block", { selector: "label" }).getAttribute("for")!)!, { target: { value: "BLK 34" } });
    expect(h.calls.at(-1)).toEqual({ tenantId: "t", projectId: "p", blockCode: "BLK 34" });
  });

  it("Q-72 (2): choosing last week asks for last week's Sunday-to-Saturday range; the answer's achievement shows on the project and in a column per row, and exports with it", () => {
    h.period = { from: "2026-11-15", to: "2026-11-21", project: { startPercent: 40, endPercent: 46.5, deltaPercent: 6.5 }, blocks: [{ key: "BLK 33", startPercent: 30, endPercent: 40, deltaPercent: 10 }], phases: [{ key: "PH1", startPercent: 30, endPercent: 40, deltaPercent: null }],
      activities: [{ code: "ACT01", startEarnedPercent: 70, endEarnedPercent: 80, deltaEarnedPercent: 10 }, { code: "ACT02", startEarnedPercent: 0, endEarnedPercent: 0, deltaEarnedPercent: 0 }] };
    render(<ActivitySummary />);
    expect(document.querySelector("[data-summary-project]")!.textContent).not.toContain("Period achievement");
    expect(screen.queryByText("Period achievement %")).toBeNull(); // no period: no column
    fireEvent.change(document.getElementById(screen.getByText("Period", { selector: "label" }).getAttribute("for")!)!, { target: { value: "lastWeek" } });
    const call = h.calls.at(-1)!;
    expect(call.from).toMatch(/^\d{4}-\d{2}-\d{2}$/); expect(call.to).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(new Date(`${call.from}T00:00:00Z`).getUTCDay()).toBe(0); // a Sunday
    expect(new Date(`${call.to}T00:00:00Z`).getUTCDay()).toBe(6); // a Saturday
    expect(document.querySelector("[data-summary-project]")!.textContent).toContain("Period achievement: +6.50%");
    expect(document.querySelector("[data-summary-activities] tbody")!.textContent).toContain("+10.00%");
    expect(document.querySelector("[data-summary-group='phases'] tbody")!.textContent).toContain("—"); // an unknown difference is a dash, never 0
    expect((h.exported["activity-summary"] as Array<{ code: string }>).length).toBe(2);
  });

  it("Q-72 (3): the screen says «does not match» and names the villas outside the phases when the groups do not add up to the project; blocks that match are not blamed", () => {
    render(<ActivitySummary />);
    const note = document.querySelector("[data-reconciled='no']")!.textContent!;
    expect(note).toContain("Does not match");
    expect(note).toContain("Phases (1 villas outside the groups)");
    expect(note).not.toContain("Blocks (");
  });

  it("Q-72 (4): a reader sees the engineer in charge beside the block (and «not named» beside the phase); whoever manages PMC picks one in the row, and none clears it", () => {
    render(<ActivitySummary />);
    expect(document.querySelector("[data-summary-group='blocks'] tbody")!.textContent).toContain("Engineer Seven (synthetic)");
    expect(document.querySelector("[data-summary-group='phases'] tbody")!.textContent).toContain("— not named");
    expect(screen.queryByLabelText("Engineer in charge PH1")).toBeNull(); // a reader has no control
    cleanup(); h.canManage = true;
    render(<ActivitySummary />);
    fireEvent.change(screen.getByLabelText("Engineer in charge PH1"), { target: { value: "7" } });
    expect(h.setEngineer).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", scopeType: "phase", scopeKey: "PH1", engineerUserId: 7 });
    fireEvent.change(screen.getByLabelText("Engineer in charge BLK 33"), { target: { value: "__none" } });
    expect(h.setEngineer).toHaveBeenLastCalledWith({ tenantId: "t", projectId: "p", scopeType: "block", scopeKey: "BLK 33", engineerUserId: null });
  });

  it("Q-72 (6): the project says how many cells are under an open NCR and what share of its weight is held (the progress number unchanged); a block with none shows a dash", () => {
    render(<ActivitySummary />);
    expect(document.querySelector("[data-ncr-held]")!.textContent).toBe("Under an open NCR: 3 cells in 2 villas — their weight (7.50%) is held until it closes");
    expect(document.querySelector("[data-summary-project]")!.textContent).toContain("Project progress: 52.00%");
    expect(document.querySelector("[data-summary-group='blocks'] tbody")!.textContent).toContain("12.50%");
    expect(document.querySelector("[data-summary-group='phases'] tbody")!.textContent).toContain("—");
  });
});
