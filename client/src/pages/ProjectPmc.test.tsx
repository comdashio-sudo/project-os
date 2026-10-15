/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProjectPmc from "./ProjectPmc";

const state = vi.hoisted(() => ({
  arabic: false,
  inputs: [] as unknown[],
  fail: false,
  loading: false,
  empty: false,
  analyze: vi.fn(),
  confirm: vi.fn(),
  exportScreen: vi.fn(),
  report: null as null | Record<string, unknown>,
}));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useParams: () => ({ tenantId: "t", projectId: "p" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.arabic }) }));

const h = vi.hoisted(() => {
  const options = { zones: ["Z1", "Z2"], blocks: ["B1"], groups: ["CIV"], stages: ["INT"], activities: ["WALLS"] };
  const freshness = [{ source: "status", lastAt: new Date(), ageDays: 3 }, { source: "baseline", lastAt: null, ageDays: null }];
  const screenQuery = (data: unknown, emptyData: unknown) => (input: unknown) => {
    state.inputs.push(input);
    if (state.loading) return { isLoading: true, error: null, data: undefined, refetch: () => undefined };
    if (state.fail) return { isLoading: false, error: new Error("x"), data: undefined, refetch: () => undefined };
    return { isLoading: false, error: null, refetch: () => undefined, data: { data: state.empty ? emptyData : data, freshness, options } };
  };
  const reply = { key: "X", A: 1, B: 1, C: 0, UR: 0, pending: 1, total: 3 };
  return { screenQuery, reply };
});
vi.mock("@/lib/trpc", () => ({ trpc: { pmc: {
  latestUpdates: { useQuery: h.screenQuery({ engineers: [{ userId: 1, name: "Eng One", updates: 3, activeDays: 2, perDay: [], unitFrom: 1, unitTo: 4, addedProjectPercent: 40, byGroup: [{ groupCode: "CIV", groupName: "Civil", addedProjectPercent: 30, updates: 2 }] }], totals: { updates: 3, addedProjectPercent: 40 } }, { engineers: [], totals: { updates: 0, addedProjectPercent: 0 } }) },
  approvals: { useQuery: h.screenQuery({ requests: [{ code: "IR-1", activityCode: "WALLS", activityName: "Walls", requestedAt: new Date("2026-10-10"), contractor: "C1", consultant: "X", response: "A", units: 2 }], byConsultant: [h.reply], byDay: [h.reply], byActivity: [h.reply], contractors: [], consultants: [] }, { requests: [], byConsultant: [], byDay: [], byActivity: [], contractors: [], consultants: [] }) },
  inspectionFlow: { useQuery: h.screenQuery({ total: 4, byStage: [{ stage: "WAITING_CONSULTANT", count: 1, percent: 25 }], heldBy: [{ holder: "Consultant X", count: 1 }], stalledActivities: [{ activityCode: "PAINT", activityName: "Paint", open: 2, oldestDays: 14 }] }, { total: 0, byStage: [], heldBy: [], stalledActivities: [] }) },
  activitiesMatrix: { useQuery: h.screenQuery({ columns: [{ id: "V1", code: "PENDING", label: "Verifier pending" }, { id: null, code: "—", label: "—" }], groups: [{ groupCode: "CIV", groupName: "Civil", cells: [{ statusId: "V1", count: 2, weightPoints: 120, sharePercent: 50 }, { statusId: null, count: 2, weightPoints: 120, sharePercent: 50 }], activities: [{ code: "WALLS", name: "Walls", total: 4, cells: [{ statusId: "V1", count: 2, weightPoints: 120, sharePercent: 50 }, { statusId: null, count: 2, weightPoints: 120, sharePercent: 50 }] }] }] }, { columns: [], groups: [] }) },
  zonesView: { useQuery: h.screenQuery({ rows: [{ zoneCode: "Z1", stageCode: "INT", stageName: "Internal", engineer: "Eng One", cells: 2, completeCells: 2, weightComplete: 120, completionPercent: 100 }, { zoneCode: "Z1", stageCode: "EXT", stageName: "External", engineer: null, cells: 1, completeCells: 0, weightComplete: 0, completionPercent: 0 }] }, { rows: [] }) },
  weeklyReport: { useQuery: h.screenQuery({ period: "week", periods: [{ from: "2026-10-12", updates: 4, addedProjectPercent: 45, byGroup: [{ groupCode: "CIV", addedProjectPercent: 45 }], byStatus: [{ status: "COMPLETE", updates: 3 }], rows: [{ engineer: "Eng One", activityCode: "WALLS", updates: 2, units: 2 }] }] }, { period: "week", periods: [] }) },
  monthlyReport: { useQuery: h.screenQuery({ period: "month", periods: [{ from: "2026-10-01", updates: 5, addedProjectPercent: 55, byGroup: [], byStatus: [], rows: [] }] }, { period: "month", periods: [] }) },
  pendingAtVerifier: { useQuery: h.screenQuery({ total: 2, buckets: [{ label: "0-7", count: 2 }], rows: [{ unitNumber: 2, activityCode: "WALLS", activityName: "Walls", verificationStatus: "Verifier pending", engineer: "Eng One", since: new Date("2026-10-13"), ageDays: 2 }] }, { total: 0, buckets: [], rows: [] }) },
  stagesView: { useQuery: h.screenQuery({ stages: [{ stageCode: "INT", stageName: "Internal", total: 4, byStatus: [{ status: "NOT_STARTED", count: 1, weightPoints: 60, percent: 25, weightSharePercent: 25 }, { status: "COMPLETE", count: 3, weightPoints: 180, percent: 75, weightSharePercent: 75 }], lateActivities: [{ activityCode: "WALLS", actualPercent: 75, plannedPercent: 80 }] }] }, { stages: [] }) },
  programme: { useQuery: () => ({ isLoading: true, error: null, data: undefined, refetch: () => undefined }) },
  siteMap: { useQuery: () => ({ isLoading: true, error: null, data: undefined, refetch: () => undefined }) },
  unitCard: { useQuery: () => ({ isLoading: false, error: null, data: undefined, refetch: () => undefined }) },
  setUnitActivityStatus: { useMutation: () => ({ mutate: () => undefined, error: null, isPending: false }) },
  uploadSitePlan: { useMutation: () => ({ mutate: () => undefined, error: null }) },
  saveUnitGeometries: { useMutation: () => ({ mutate: () => undefined, error: null, data: undefined }) },
  exportScreen: { useMutation: () => ({ mutate: state.exportScreen, isPending: false, error: null }) },
  analyzeImport: { useMutation: () => ({ mutate: (input: unknown) => state.analyze(input), data: state.report ?? undefined, error: null, isPending: false, reset: vi.fn() }) },
  confirmImport: { useMutation: () => ({ mutate: (input: unknown) => state.confirm(input), data: undefined, error: null, isPending: false, reset: vi.fn() }) },
} } }));

afterEach(() => { cleanup(); Object.assign(state, { arabic: false, inputs: [], fail: false, loading: false, empty: false, report: null }); vi.clearAllMocks(); });
const open = (tab: string) => fireEvent.click(screen.getByRole("tab", { name: tab }));

describe("ProjectPmc screens", () => {
  it("shows every screen with its numbers and the freshness of each source", () => {
    render(<ProjectPmc />);
    expect(screen.getAllByText("Eng One").length).toBeGreaterThan(0);
    expect(screen.getAllByText("40%", { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByTestId("freshness").textContent).toContain("Activity status: 3 days ago");
    expect(screen.getByTestId("freshness").textContent).toContain("Baseline: never updated");
    open("Approvals"); expect(screen.getByText("IR-1")).toBeTruthy(); expect(screen.getByText("Replies per consultant")).toBeTruthy();
    open("Inspections"); expect(screen.getByText("Waiting for consultant")).toBeTruthy(); expect(screen.getByText("PAINT · Paint")).toBeTruthy();
    open("Activities"); expect(screen.getByText("WALLS · Walls")).toBeTruthy();
    open("Zones"); expect(screen.getAllByText("100%").length).toBeGreaterThan(0); expect(screen.getByText("Unassigned")).toBeTruthy();
    open("Weekly"); expect(screen.getAllByText("2026-10-12").length).toBeGreaterThan(0);
    open("Monthly"); expect(screen.getAllByText("2026-10-01").length).toBeGreaterThan(0);
    open("Pending"); expect(screen.getByText("Verifier pending", { selector: "td" })).toBeTruthy();
    open("Stages"); expect(screen.getByText(/WALLS \(Actual 75% \/ Planned 80%\)/)).toBeTruthy();
  });

  it("sends the chosen filters with the query", () => {
    render(<ProjectPmc />);
    fireEvent.change(screen.getByLabelText("Zone"), { target: { value: "Z2" } });
    fireEvent.change(screen.getByLabelText("From unit"), { target: { value: "5" } });
    fireEvent.change(screen.getByLabelText("Period"), { target: { value: "d30" } });
    const last = state.inputs[state.inputs.length - 1] as { filters: { zone?: string; unitFrom?: number; since?: Date } };
    expect(last.filters.zone).toBe("Z2");
    expect(last.filters.unitFrom).toBe(5);
    expect(last.filters.since).toBeInstanceOf(Date);
  });

  it("says 'No data' for an empty screen instead of breaking, and shows loading and error with retry", () => {
    state.empty = true;
    const { unmount } = render(<ProjectPmc />);
    expect(screen.getByText("No data")).toBeTruthy();
    unmount();
    state.empty = false; state.loading = true;
    const loading = render(<ProjectPmc />);
    expect(screen.getByText("Loading…")).toBeTruthy();
    loading.unmount();
    state.loading = false; state.fail = true;
    render(<ProjectPmc />);
    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByText("Retry")).toBeTruthy();
  });

  it("exports the current screen to Excel and offers a printable view", () => {
    const print = vi.spyOn(window, "print").mockImplementation(() => undefined);
    render(<ProjectPmc />);
    fireEvent.click(screen.getByText("Export Excel"));
    expect(state.exportScreen).toHaveBeenCalledWith(expect.objectContaining({ screen: "latestUpdates", locale: "en" }));
    fireEvent.click(screen.getByText("PDF (print)"));
    expect(print).toHaveBeenCalled();
  });

  it("renders in Arabic, right to left", () => {
    state.arabic = true;
    render(<ProjectPmc />);
    expect(document.querySelector("main")?.getAttribute("dir")).toBe("rtl");
    expect(screen.getByText("ضبط المشروع PMC")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "آخر التحديثات" })).toBeTruthy();
    expect(screen.getByTestId("freshness").textContent).toContain("قبل 3 يومًا");
  });
});

describe("ProjectPmc import", () => {
  const fileOf = (name: string) => new File(["a,b\n1,2\n"], name, { type: "text/csv" });
  const choose = async (name: string) => {
    open("Import");
    fireEvent.change(screen.getByLabelText("Choose an Excel or CSV file"), { target: { files: [fileOf(name)] } });
    await waitFor(() => expect((screen.getByText("Check the file").closest("button") as HTMLButtonElement).disabled).toBe(false));
  };

  it("reads a file, shows the validation report with every rejected row and keeps Save disabled", async () => {
    state.report = { kind: "status", fileHash: "a".repeat(64), totalRows: 3, errorCount: 2, errors: [{ rowNumber: 2, code: "PMC_UNIT_NOT_FOUND", field: "unitNumber", detail: "99" }, { rowNumber: 4, code: "PMC_STATUS_INVALID", field: "status" }], counts: { create: 0, update: 0, unchanged: 0 }, details: {}, canConfirm: false };
    render(<ProjectPmc />);
    await choose("status.csv");
    fireEvent.change(screen.getByLabelText("File type"), { target: { value: "status" } });
    fireEvent.click(screen.getByText("Check the file"));
    expect(state.analyze).toHaveBeenCalledWith(expect.objectContaining({ kind: "status", format: "csv", tenantId: "t", projectId: "p" }));
    const report = screen.getByTestId("import-report");
    expect(report.textContent).toContain("PMC_UNIT_NOT_FOUND");
    expect(report.textContent).toContain("Rejected rows: 2");
    expect((screen.getByText("Save the approved file").closest("button") as HTMLButtonElement).disabled).toBe(true);
  });

  it("saves only after the report is clean, sending the hash that was approved", async () => {
    const fileHash = "b".repeat(64);
    state.report = { kind: "locations", fileHash, totalRows: 500, errorCount: 0, errors: [], counts: { create: 500, update: 0, unchanged: 0 }, details: {}, canConfirm: true };
    render(<ProjectPmc />);
    await choose("units.csv");
    fireEvent.click(screen.getByText("Check the file"));
    expect(screen.getByTestId("import-report").textContent).toContain("Will create: 500");
    fireEvent.click(screen.getByText("Save the approved file"));
    expect(state.confirm).toHaveBeenCalledWith(expect.objectContaining({ kind: "locations", approvedHash: fileHash }));
  });

  it("says plainly when the file matches what is already stored", async () => {
    state.report = { kind: "locations", fileHash: "c".repeat(64), totalRows: 500, errorCount: 0, errors: [], counts: { create: 0, update: 0, unchanged: 500 }, details: {}, canConfirm: false };
    render(<ProjectPmc />);
    await choose("units.csv");
    fireEvent.click(screen.getByText("Check the file"));
    expect(screen.getByText("The file matches what is stored: nothing to save.")).toBeTruthy();
  });

  it("has the site plan and programme tabs, and they replace the filters and the export (they are not filtered screens)", () => {
    render(<ProjectPmc />);
    open("Site plan");
    expect(screen.getByRole("status").textContent).toBe("Loading…");
    expect(screen.queryByLabelText("Zone")).toBeNull();
    open("Programme");
    expect(screen.getByRole("status").textContent).toBe("Loading…");
    expect(screen.queryByLabelText("Zone")).toBeNull();
  });
});
