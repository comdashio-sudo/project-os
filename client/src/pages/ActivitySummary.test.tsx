// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Q-70 (3): the activity summary screen. Synthetic data only.
const h = vi.hoisted(() => ({ calls: [] as Array<Record<string, unknown>>, exported: {} as Record<string, unknown[]> }));
vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "t", projectId: "p" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
vi.mock("@/components/ExportExcelButton", () => ({ ExportExcelButton: (props: { fileName: string; rows: unknown[] }) => { h.exported[props.fileName] = props.rows; return <button type="button">Export</button>; } }));
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: ({ id, options, value, onValueChange }: { id?: string; options: Array<{ value: string; label: string }>; value?: string; onValueChange: (value: string) => void }) => (
  <select id={id} value={value} onChange={event => onValueChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
) }));
const data = {
  activities: [{ code: "ACT01", name: "Excavation", villas: 5, complete: 4, underReview: 0, inProgress: 0, notStarted: 1, completionPercent: 80, earnedPercent: 80 }, { code: "ACT02", name: "Footings", villas: 4, complete: 0, underReview: 0, inProgress: 1, notStarted: 3, completionPercent: 0, earnedPercent: 0 }],
  blocks: [{ key: "BLK 33", villas: 2, progressPercent: 40, villasWithoutNumber: 0, completeCells: 2, totalCells: 4 }],
  phases: [{ key: "PH1", villas: 2, progressPercent: 40, villasWithoutNumber: 0, completeCells: 2, totalCells: 4 }],
  project: { villas: 5, progressPercent: 52, villasWithoutNumber: 1 },
  filters: { blocks: ["BLK 33", "BLK 34"], phases: ["PH1", "PH2"] },
};
vi.mock("@/lib/trpc", () => ({ trpc: { pmc: { activitySummary: { useQuery: (input: Record<string, unknown>) => { h.calls.push(input); return { data, isError: false, error: null, refetch: vi.fn() }; } } } } }));

import ActivitySummary from "./ActivitySummary";

beforeEach(() => { h.calls = []; h.exported = {}; });
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
});
