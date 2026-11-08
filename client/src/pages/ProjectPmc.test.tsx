/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import ProjectPmc, { ProjectPmcWorkspace } from "./ProjectPmc";
import { exportElementToPdf } from "@/lib/pdfExport";
import { buildTableWorkbook } from "@/lib/excelExport";

vi.mock("@/lib/excelExport", async importOriginal => { const actual = await importOriginal<typeof import("@/lib/excelExport")>(); return { ...actual, buildTableWorkbook: vi.fn(actual.buildTableWorkbook) }; });

const state = vi.hoisted(() => ({
  arabic: false,
  inputs: [] as unknown[],
  fail: false,
  loading: false,
  empty: false,
  exportScreen: vi.fn(),
  put: vi.fn(),
  // the direct-upload import: the stand-in for `trpc.dataImports` the import screens share (client/src/test/importsTrpcMock.ts)
  imports: { list: [] as unknown[], detail: null as unknown, progress: undefined as unknown, createUpload: vi.fn(), registerUpload: vi.fn(), reanalyze: vi.fn(), confirm: vi.fn() },
}));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useParams: () => ({ tenantId: "t", projectId: "p" }) }));
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: (await import("../test/dsSelectStandIn")).NativeSelect }));
vi.mock("@/lib/pdfExport", () => ({ exportElementToPdf: vi.fn(async () => "x.pdf") }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.arabic, language: (state.arabic) ? "ar" : "en", isRtl: state.arabic }) }));

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
vi.mock("@/lib/uploadLimit", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/uploadLimit")>()), putToStorage: state.put }));
vi.mock("@/lib/trpc", async () => ({ trpc: { ...(await import("../test/importsTrpcMock")).importsTrpc(state.imports), directUploads: { create: { useMutation: () => ({ mutateAsync: vi.fn(), isPending: false, error: null }) } }, pmc: {
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
} } }));

afterEach(() => { cleanup(); Object.assign(state, { arabic: false, inputs: [], fail: false, loading: false, empty: false }); state.imports.progress = undefined; vi.clearAllMocks(); });
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
    fireEvent.click(screen.getByRole("button", { name: "Print" }));
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

describe("ProjectPmc import (direct upload, G-139)", () => {
  const IMPORT = "00000000-0000-4000-8000-0000000000f9";
  const fileOf = (name: string) => new File(["a,b\n1,2\n"], name, { type: "text/csv" });
  const view = (over: Record<string, unknown> = {}) => ({ id: IMPORT, status: "validated", progressPercent: 100, progressStage: null, failureReason: null, totalRows: 3, validRows: 3, invalidRows: 0, createdRows: 0, updatedRows: 0, skippedRows: 0, analysis: { headers: [], mapping: {}, errors: [], errorsListed: 0, errorsTotal: 0 }, ...over });
  const pmcReport = (over: Record<string, unknown> = {}) => ({ kind: "status", fileHash: "a".repeat(64), totalRows: 3, errorCount: 0, errors: [], counts: { create: 3, update: 0, unchanged: 0 }, details: {}, canConfirm: true, ...over });
  const external = (report: Record<string, unknown>) => ({ report: { pmc: report }, canConfirm: report.canConfirm });
  beforeEach(() => {
    state.put.mockReset().mockResolvedValue(undefined);
    state.imports.createUpload.mockReset().mockResolvedValue({ uploadUrl: "https://storage.example.test/u", uploadKey: "imports/t/p/pending/k/f", headers: {}, maxBytes: 1 });
    state.imports.registerUpload.mockReset().mockResolvedValue({ id: IMPORT, status: "analyzing" });
    state.imports.confirm.mockReset().mockResolvedValue({ id: IMPORT, status: "importing" });
  });
  const choose = async (name: string) => {
    open("Import");
    fireEvent.change(screen.getByLabelText("Choose an Excel or CSV file"), { target: { files: [fileOf(name)] } });
    await waitFor(() => expect((screen.getByText("Check the file").closest("button") as HTMLButtonElement).disabled).toBe(false));
  };

  it("uploads straight to storage, shows the job's report with every rejected row, and offers no Save while there are errors", async () => {
    state.imports.progress = view({ status: "uploaded", external: external(pmcReport({ errorCount: 2, errors: [{ rowNumber: 2, code: "PMC_UNIT_NOT_FOUND", field: "unitNumber", detail: "99" }, { rowNumber: 4, code: "PMC_STATUS_INVALID", field: "status" }], canConfirm: false })) });
    render(<ProjectPmc />);
    await choose("status.csv");
    fireEvent.change(screen.getByLabelText("File type"), { target: { value: "status" } });
    fireEvent.click(screen.getByText("Check the file"));
    await waitFor(() => expect(state.imports.registerUpload).toHaveBeenCalled());
    expect(state.imports.createUpload).toHaveBeenCalledWith(expect.objectContaining({ moduleCode: "pmc.status", sourceFormat: "csv", tenantId: "t", projectId: "p" }));
    expect(state.put).toHaveBeenCalledTimes(1); // the file went to storage, not inside a request
    expect(state.imports.registerUpload).toHaveBeenCalledWith(expect.objectContaining({ moduleCode: "pmc.status", uploadKey: "imports/t/p/pending/k/f" }));
    const report = await screen.findByTestId("import-report");
    expect(report.textContent).toContain("PMC_UNIT_NOT_FOUND");
    expect(report.textContent).toContain("Rejected rows: 2");
    expect(screen.queryByText("Save the approved file")).toBeNull();
  });

  it("shows the progress of a running analysis", async () => {
    state.imports.progress = view({ status: "analyzing", progressStage: "parsing", progressPercent: 40, analysis: null, external: null });
    render(<ProjectPmc />);
    await choose("big.csv");
    fireEvent.click(screen.getByText("Check the file"));
    expect((await screen.findByTestId("direct-import-progress")).textContent).toContain("(40%)");
  });

  it("offers the baseline as start and end dates too, and sends that module", async () => {
    render(<ProjectPmc />);
    await choose("dates.csv");
    expect(Array.from((screen.getByLabelText("File type") as HTMLSelectElement).options).map(option => option.textContent)).toContain("Baseline by start and end dates");
    fireEvent.change(screen.getByLabelText("File type"), { target: { value: "baselineDates" } });
    fireEvent.click(screen.getByText("Check the file"));
    await waitFor(() => expect(state.imports.createUpload).toHaveBeenCalledWith(expect.objectContaining({ moduleCode: "pmc.baselineDates" })));
  });

  it("saves only after the report is clean, confirming the import the person read", async () => {
    state.imports.progress = view({ external: external(pmcReport({ kind: "locations", totalRows: 500, counts: { create: 500, update: 0, unchanged: 0 } })) });
    render(<ProjectPmc />);
    await choose("units.csv");
    fireEvent.click(screen.getByText("Check the file"));
    expect((await screen.findByTestId("import-report")).textContent).toContain("Will create: 500");
    expect(state.imports.confirm).not.toHaveBeenCalled(); // the analysis alone writes nothing
    fireEvent.click(screen.getByText("Save the approved file"));
    await waitFor(() => expect(state.imports.confirm).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", importId: IMPORT }));
  });

  it("says plainly when the file matches what is already stored", async () => {
    state.imports.progress = view({ external: external(pmcReport({ kind: "locations", totalRows: 500, counts: { create: 0, update: 0, unchanged: 500 }, canConfirm: false })) });
    render(<ProjectPmc />);
    await choose("units.csv");
    fireEvent.click(screen.getByText("Check the file"));
    expect(await screen.findByText("The file matches what is stored: nothing to save.")).toBeTruthy();
    expect(screen.queryByText("Save the approved file")).toBeNull();
  });

  it("refuses a file over 50 MB or of another type before any request", async () => {
    render(<ProjectPmc />);
    open("Import");
    const big = new File(["x"], "big.csv", { type: "text/csv" }); Object.defineProperty(big, "size", { value: 51 * 1024 * 1024 });
    fireEvent.change(screen.getByLabelText("Choose an Excel or CSV file"), { target: { files: [big] } });
    fireEvent.click(screen.getByText("Check the file"));
    expect((await screen.findByRole("alert")).textContent).toContain("50 MB");
    expect(state.imports.createUpload).not.toHaveBeenCalled();
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

describe("ProjectPmc as a tab inside the controls page (G-051) and the PDF button (G-069)", () => {
  it("embedded: no page-level main landmark, no back link, the title is a section heading not a second h1", () => {
    const { container } = render(<ProjectPmcWorkspace embedded />);
    expect(container.querySelector("main")).toBeNull();
    expect(screen.queryByRole("link", { name: /Back to project controls/ })).toBeNull();
    expect(screen.queryByRole("heading", { level: 1 })).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "Project control (PMC)" })).toBeTruthy();
    expect(screen.getAllByRole("tab").length).toBeGreaterThan(5); // the whole workspace is there, not a stub
  });
  it("standalone page keeps its own main landmark and h1; the shell breadcrumb replaces the duplicate back link", () => {
    const { container } = render(<ProjectPmc />);
    expect(container.querySelectorAll("main")).toHaveLength(1);
    expect(screen.queryByRole("link", { name: /Back to project controls/ })).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });
  it("PDF builds a real file from the screen body and names the screen in the file name; print stays beside it", async () => {
    render(<ProjectPmcWorkspace embedded />);
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    await waitFor(() => expect(exportElementToPdf).toHaveBeenCalledTimes(1));
    const [element, fileBase] = vi.mocked(exportElementToPdf).mock.calls[0]!;
    expect(element).toBeInstanceOf(HTMLElement);
    expect(fileBase).toBe("project-os-pmc-latestUpdates");
    expect(screen.getByRole("button", { name: "Print" })).toBeTruthy();
  });
  it("a failed PDF says so and points to printing instead of failing silently", async () => {
    vi.mocked(exportElementToPdf).mockRejectedValueOnce(new Error("canvas"));
    render(<ProjectPmcWorkspace embedded />);
    fireEvent.click(screen.getByRole("button", { name: "PDF" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Print from the browser");
  });
  it("offers PDF only on the screens that have a body to export (not on import, site plan or programme)", () => {
    render(<ProjectPmcWorkspace embedded />);
    open("Import");
    expect(screen.queryByRole("button", { name: "PDF" })).toBeNull();
  });
});

describe("ProjectPmc Excel export, table by table", () => {
  let anchorClick: MockInstance;
  beforeEach(() => {
    Object.assign(URL, { createObjectURL: vi.fn(() => "blob:pmc"), revokeObjectURL: vi.fn() });
    anchorClick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    vi.mocked(buildTableWorkbook).mockClear();
  });
  afterEach(() => { anchorClick.mockRestore(); });

  /** Clicks the table's own Excel button; returns what the writer was given next to what the table shows. */
  const exportTable = async (table: HTMLTableElement) => {
    const button = within(table.closest("div.space-y-2") as HTMLElement).getByRole("button", { name: "Export to Excel" }) as HTMLButtonElement;
    const before = vi.mocked(buildTableWorkbook).mock.calls.length;
    fireEvent.click(button);
    await waitFor(() => expect(vi.mocked(buildTableWorkbook).mock.calls.length).toBe(before + 1));
    await waitFor(() => expect(button.disabled).toBe(false));
    const input = vi.mocked(buildTableWorkbook).mock.calls[before]![0];
    return {
      input,
      headers: input.columns.map(column => column.header),
      exportedRows: input.rows.length,
      tableHeaders: Array.from(table.querySelectorAll("thead th"), th => th.textContent),
      bodyRows: table.querySelectorAll("tbody tr").length,
    };
  };

  it("puts an Export to Excel button in the same block as each table, one per table", () => {
    render(<ProjectPmc />);
    const perTab: Array<[string, number]> = [["Latest updates", 2], ["Approvals", 4], ["Inspections", 3], ["Activities", 1], ["Zones", 1], ["Weekly", 2], ["Monthly", 2], ["Pending", 1], ["Stages", 1]];
    for (const [tab, count] of perTab) {
      open(tab);
      const tables = Array.from(document.querySelectorAll("table"));
      expect(tables).toHaveLength(count);
      for (const table of tables) expect(within(table.closest("div.space-y-2") as HTMLElement).getByRole("button", { name: "Export to Excel" })).toBeTruthy();
    }
  });

  it("exports the same headers and the same number of rows as each table shows", async () => {
    render(<ProjectPmc />);
    for (const tab of ["Latest updates", "Approvals", "Inspections", "Zones", "Weekly", "Pending", "Stages"]) {
      open(tab);
      for (const table of Array.from(document.querySelectorAll("table"))) {
        const result = await exportTable(table);
        expect(result.headers, `${tab}: headers`).toEqual(result.tableHeaders);
        expect(result.exportedRows, `${tab}: rows`).toBe(result.bodyRows);
      }
    }
  });

  it("the export uses raw figures: a percentage is a fraction, a date is a Date, an engineer not yet known is empty", async () => {
    render(<ProjectPmc />);
    open("Latest updates");
    const engineers = await exportTable(document.querySelectorAll("table")[0] as HTMLTableElement);
    const engineerRow = engineers.input.rows[0]!;
    const column = (headers: string[], header: string) => engineers.input.columns[headers.indexOf(header)]!;
    expect(column(engineers.headers, "Percent added").kind).toBe("percent");
    expect(column(engineers.headers, "Percent added").value(engineerRow)).toBeCloseTo(0.4, 6);
    expect(column(engineers.headers, "Updates").value(engineerRow)).toBe(3);

    open("Zones");
    const zones = await exportTable(document.querySelector("table") as HTMLTableElement);
    const unassigned = zones.input.rows[1]!;
    expect(zones.input.columns[zones.headers.indexOf("Completion")]!.value(zones.input.rows[0]!)).toBeCloseTo(1, 6);
    expect(zones.input.columns[zones.headers.indexOf("Engineer")]!.value(unassigned)).toBeNull();

    open("Pending");
    const pending = await exportTable(document.querySelector("table") as HTMLTableElement);
    const since = pending.input.columns[pending.headers.indexOf("Since")]!;
    expect(since.kind).toBe("date");
    expect(since.value(pending.input.rows[0]!)).toBeInstanceOf(Date);
  });

  it("the activities matrix exports one row per activity with its group name; the group subtotal stays on screen", async () => {
    render(<ProjectPmc />);
    open("Activities");
    const matrix = await exportTable(document.querySelector("table") as HTMLTableElement);
    expect(matrix.bodyRows).toBe(2); // one group subtotal and one activity
    expect(matrix.exportedRows).toBe(1);
    expect(matrix.headers).toEqual(matrix.tableHeaders);
    const row = matrix.input.rows[0]!;
    const at = (header: string) => matrix.input.columns[matrix.headers.indexOf(header)]!.value(row);
    expect(at("Group")).toBe("Civil");
    expect(at("Activity")).toBe("WALLS · Walls");
    expect(at("Verifier pending %")).toBeCloseTo(0.5, 6);
  });

  it("a table with no rows keeps its button disabled instead of exporting an empty file", () => {
    render(<ProjectPmc />);
    open("Monthly");
    const [, empty] = Array.from(document.querySelectorAll("table"));
    expect((within(empty!.closest("div.space-y-2") as HTMLElement).getByRole("button", { name: "Export to Excel" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("the import report's rejected rows have their own export, with the same headers and rows as the table", async () => {
    state.imports.progress = { id: "00000000-0000-4000-8000-0000000000f9", status: "uploaded", progressPercent: 100, progressStage: null, failureReason: null, totalRows: 3, validRows: 1, invalidRows: 2, createdRows: 0, updatedRows: 0, skippedRows: 0, analysis: { headers: [], mapping: {}, errors: [], errorsListed: 0, errorsTotal: 0 }, external: { canConfirm: false, report: { pmc: { kind: "status", fileHash: "a".repeat(64), totalRows: 3, errorCount: 2, errors: [{ rowNumber: 2, code: "PMC_UNIT_NOT_FOUND", field: "unitNumber", detail: "99" }, { rowNumber: 4, code: "PMC_STATUS_INVALID", field: "status" }], counts: { create: 0, update: 0, unchanged: 0 }, details: {}, canConfirm: false } } } };
    state.imports.createUpload.mockResolvedValue({ uploadUrl: "https://storage.example.test/u", uploadKey: "imports/t/p/pending/k/f", headers: {}, maxBytes: 1 }); state.imports.registerUpload.mockResolvedValue({ id: "00000000-0000-4000-8000-0000000000f9", status: "analyzing" }); state.put.mockResolvedValue(undefined);
    render(<ProjectPmc />);
    open("Import");
    fireEvent.change(screen.getByLabelText("Choose an Excel or CSV file"), { target: { files: [new File(["a\n1\n"], "s.csv", { type: "text/csv" })] } });
    await waitFor(() => expect((screen.getByText("Check the file").closest("button") as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByText("Check the file"));
    await screen.findByTestId("import-report");
    const result = await exportTable(document.querySelector("table") as HTMLTableElement);
    expect(result.headers).toEqual(["Row", "Reason"]);
    expect(result.headers).toEqual(result.tableHeaders);
    expect(result.exportedRows).toBe(2);
    expect(result.bodyRows).toBe(2);
  });
});
