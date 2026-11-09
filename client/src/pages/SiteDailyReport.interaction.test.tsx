/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SiteDailyReport from "./SiteDailyReport";

const h = vi.hoisted(() => ({
  language: "en" as "ar" | "en" | "ur", canWrite: true, canReview: true,
  save: vi.fn(), submit: vi.fn(), review: vi.fn(), attach: vi.fn(), upload: vi.fn(), seed: vi.fn(),
  roles: [] as Array<{ id: string; name: string; category: string; active: boolean }>, rolesError: null as unknown, machines: [] as Array<{ id: string; equipmentType: string; model: string | null; plateOrSize: string | null; active: boolean }>,
  reports: [] as Array<{ id: string; reportDate: string; status: string; weather: string | null }>,
  detail: { report: { reportDate: "2026-10-20", weather: "clear", temperatureC: 30, summary: "Walls", obstacles: null, status: "rejected", reviewNote: "Add the count" }, lines: [] as unknown[], photos: [] as unknown[] },
  dryRun: { applied: [{ unitId: "u12", activityDefinitionId: "a-walls", from: null, to: "IN_PROGRESS" }], skipped: [{ unitId: "u13", activityDefinitionId: "a-walls" }], gate: { mode: "warn", notAccepted: [{ unitId: "u12", activityDefinitionId: "a-walls" }] } },
}));
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: (await import("../test/dsSelectStandIn")).NativeSelect }));
vi.mock("wouter", () => ({ useLocation: () => ["/", vi.fn()], Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useParams: () => ({ tenantId: "t", projectId: "p" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.language === "ar", language: h.language, isRtl: h.language !== "en" }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => null }));
vi.mock("@/lib/permissions", () => ({ useCan: (permission: string) => (permission === "project.manage" ? h.canReview : h.canWrite), WriteGate: ({ permission, children, reason }: { permission: string; children: React.ReactNode; reason?: { en: string } }) => ((permission === "project.field.manage" ? h.canWrite : true) ? <>{children}</> : <p>{reason?.en}</p>) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "localized error" }));
vi.mock("@/lib/useDirectUpload", () => ({ useDirectUpload: () => ({ upload: h.upload, percent: null, busy: false }) }));
const options = {
  units: [{ id: "u12", number: 12, modelCode: "A", block: "B1", zone: "Z1" }, { id: "u13", number: 13, modelCode: "B", block: "B1", zone: "Z1" }],
  activities: [{ id: "a-walls", modelCode: "A", code: "WALLS", name: "Walls" }, { id: "a-paint", modelCode: "A", code: "PAINT", name: "Paint" }, { id: "b-walls", modelCode: "B", code: "WALLS", name: "Walls" }],
};
vi.mock("@/lib/trpc", () => {
  const mutation = (name: "save" | "submit" | "review" | "attachPhoto") => ({ useMutation: (config: { onSuccess?: (result: unknown, variables: unknown) => void }) => ({
    mutate: (input: unknown) => { const key = name === "attachPhoto" ? "attach" : name; h[key](input); const result = name === "save" ? { id: "r1", status: "draft" } : name === "review" ? ((input as { dryRun?: boolean }).dryRun ? h.dryRun : { applied: [], skipped: [] }) : { id: "r1", status: "submitted" }; config.onSuccess?.(result, input); },
    mutateAsync: async (input: unknown) => { h.attach(input); config.onSuccess?.({}, input); return {}; }, isPending: false, error: null,
  }) });
  return { trpc: {
    // #233: the project's reference lists the report picks from
    projects: {
      labourRoles: { list: { useQuery: () => ({ data: h.rolesError ? undefined : h.roles, isLoading: false, error: h.rolesError, refetch: vi.fn() }) }, seedDefaults: { useMutation: () => ({ mutate: h.seed, isPending: false, error: null }) } },
      equipment: { list: { useQuery: () => ({ data: h.machines, isLoading: false, error: null, refetch: vi.fn() }) } },
    },
    useUtils: () => ({ siteReports: { list: { invalidate: vi.fn() }, get: { fetch: async () => h.detail } } }),
    siteReports: {
      options: { useQuery: () => ({ data: options, isLoading: false, error: null, refetch: vi.fn() }) },
      list: { useQuery: () => ({ data: h.reports, isLoading: false, error: null, refetch: vi.fn() }) },
      get: { useQuery: (_input: unknown, config: { enabled: boolean }) => ({ data: config.enabled ? { ...h.detail, photos: h.detail.photos } : undefined, error: null, refetch: vi.fn() }) },
      save: mutation("save"), submit: mutation("submit"), review: mutation("review"), attachPhoto: mutation("attachPhoto"),
    },
  } };
});

beforeEach(() => { h.language = "en"; h.canWrite = true; h.canReview = true; h.reports = []; h.seed.mockReset(); h.rolesError = null;
  h.roles = [{ id: "r-mason", name: "Masons", category: "direct", active: true }, { id: "r-old", name: "Retired trade", category: "direct", active: false }];
  h.machines = [{ id: "e-mix", equipmentType: "Mixer", model: null, plateOrSize: null, active: true }, { id: "e-old", equipmentType: "Crane", model: "C-9", plateOrSize: "50 t", active: false }]; for (const key of ["save", "submit", "review", "attach", "upload"] as const) h[key].mockReset(); h.upload.mockResolvedValue("uploads/key-0123456789"); });
afterEach(cleanup);
const type = (label: string | RegExp, value: string, index = 0) => fireEvent.change(screen.getAllByLabelText(label)[index]!, { target: { value } });

describe("SiteDailyReport — the engineer's side", () => {
  it("builds a report from labour, equipment and a work line, refuses a work line that names no real unit or activity, and saves what the server takes", () => {
    render(<SiteDailyReport />);
    fireEvent.click(screen.getByText("Add labour"));
    type("Trade", "Masons"); type("Count", "8"); type("Hours", "9");
    fireEvent.click(screen.getByText("Add work"));
    const save = screen.getByText("Save draft").closest("button") as HTMLButtonElement;
    expect(save.disabled).toBe(true); // the work line names nothing yet
    type("Unit number", "99");
    expect(screen.getByRole("alert").textContent).toContain("No unit with that number");
    type("Unit number", "12");
    const activity = screen.getAllByLabelText("Activity")[0] as HTMLSelectElement;
    expect(Array.from(activity.options).map(option => option.value)).toEqual(["", "a-walls", "a-paint"]); // model A's activities only
    expect(save.disabled).toBe(true); // no activity yet
    fireEvent.change(activity, { target: { value: "a-walls" } });
    fireEvent.change(screen.getByLabelText("Status after the work"), { target: { value: "COMPLETE" } });
    type("Summary of the day", "Masonry in B1");
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(h.save).toHaveBeenCalledTimes(1);
    const sent = h.save.mock.calls[0]![0];
    expect(sent).toMatchObject({ tenantId: "t", projectId: "p", summary: "Masonry in B1" });
    expect(sent.lines).toEqual([
      expect.objectContaining({ lineType: "labour", label: "Masons", quantity: 8, hours: 9 }),
      expect.objectContaining({ lineType: "work", pmcUnitId: "u12", pmcActivityDefinitionId: "a-walls", reportedStatus: "COMPLETE" }),
    ]);
    expect(screen.getByText("Draft saved")).toBeTruthy();
  });

  it("can send only after the draft is saved, and a sent report is locked", () => {
    render(<SiteDailyReport />);
    fireEvent.click(screen.getByText("Add equipment")); type("Equipment", "Mixer");
    const submit = screen.getByText("Send for approval").closest("button") as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByText("Save draft"));
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    expect(h.submit).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", reportId: "r1" });
    expect(screen.getByText("This report is sent or approved and cannot be edited.")).toBeTruthy();
    expect(screen.queryByText("Save draft")).toBeNull();
  });

  it("a photo needs a saved draft; the camera input asks for the back camera; the file goes to storage and is attached", async () => {
    render(<SiteDailyReport />);
    expect(screen.getByText("Save the draft first, then add photos.")).toBeTruthy();
    fireEvent.click(screen.getByText("Add labour")); type("Trade", "Masons");
    fireEvent.click(screen.getByText("Save draft"));
    const input = screen.getByLabelText("Take a photo") as HTMLInputElement;
    expect(input.getAttribute("capture")).toBe("environment");
    expect(input.getAttribute("accept")).toBe("image/*");
    fireEvent.change(input, { target: { files: [new File([new Uint8Array([1, 2, 3])], "wall.jpg", { type: "image/jpeg" })] } });
    await waitFor(() => expect(h.attach).toHaveBeenCalledTimes(1));
    expect(h.upload).toHaveBeenCalledWith(expect.any(File), "image/jpeg");
    expect(h.attach.mock.calls[0]![0]).toMatchObject({ reportId: "r1", uploadKey: "uploads/key-0123456789", fileName: "wall.jpg" });
  });

  it("opens a report that was sent back: the reason is shown and it can be edited; a person without the power sees one sentence instead of the form", async () => {
    h.reports = [{ id: "r9", reportDate: "2026-10-20", status: "rejected", weather: "clear" }];
    render(<SiteDailyReport />);
    fireEvent.click(screen.getByText("Edit"));
    expect(await screen.findByText(/Add the count/)).toBeTruthy();
    cleanup(); h.canWrite = false;
    render(<SiteDailyReport />);
    expect(screen.getByText("Your role does not allow writing the daily report.")).toBeTruthy();
    expect(screen.queryByText("Save draft")).toBeNull();
  });
});

describe("SiteDailyReport — the project manager's side", () => {
  beforeEach(() => { h.reports = [{ id: "r5", reportDate: "2026-10-23", status: "submitted", weather: null }]; });

  it("shows what approving would move before it moves anything, then approves", () => {
    render(<SiteDailyReport />);
    const panel = screen.getByRole("region", { name: "Approve reports" });
    fireEvent.click(within(panel).getByText("What will move?"));
    expect(h.review).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", reportId: "r5", decision: "approve", dryRun: true });
    const preview = panel.querySelector("[data-preview]") as HTMLElement;
    expect(preview.textContent).toContain("12 · WALLS: — → IN_PROGRESS");
    expect(preview.textContent).toContain("These will not move");
    expect(preview.textContent).toContain("Quality warning");
    fireEvent.click(within(panel).getByText("Approve"));
    expect(h.review).toHaveBeenLastCalledWith({ tenantId: "t", projectId: "p", reportId: "r5", decision: "approve" });
    expect(within(panel).getByText("Report approved and progress moved")).toBeTruthy();
  });

  it("sending back needs a reason", () => {
    render(<SiteDailyReport />);
    const panel = screen.getByRole("region", { name: "Approve reports" });
    const send = within(panel).getByText("Send back").closest("button") as HTMLButtonElement;
    expect(send.disabled).toBe(true);
    fireEvent.change(within(panel).getByLabelText("Reason (required)"), { target: { value: "Add the labour count" } });
    expect(send.disabled).toBe(false);
    fireEvent.click(send);
    expect(h.review).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", reportId: "r5", decision: "reject", note: "Add the labour count" });
  });

  it("is not offered to someone who cannot approve", () => {
    h.canReview = false;
    render(<SiteDailyReport />);
    expect(screen.queryByRole("region", { name: "Approve reports" })).toBeNull();
  });
});

describe("SiteDailyReport — three languages", () => {
  it.each([["ar", "التقرير اليومي", "rtl"], ["en", "Daily report", "ltr"], ["ur", "روزانہ رپورٹ", "rtl"]] as const)("%s: the title and the direction", (language, title, dir) => {
    h.language = language;
    const { container } = render(<SiteDailyReport />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(title);
    expect(container.querySelector("main")!.getAttribute("dir")).toBe(dir);
  });
});

describe("SiteDailyReport — the frame of sections 0 to 10 (D-46, part 1)", () => {
  it("draws the eleven sections in order, the ones waiting for the server closed and without a field", () => {
    render(<SiteDailyReport />);
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-report-section]"));
    expect(sections.map(node => node.dataset.reportSection)).toEqual(["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10"]);
    for (const number of ["4", "5", "6", "8"]) {
      const locked = document.querySelector<HTMLElement>(`[data-report-section="${number}"]`)!;
      expect(locked.querySelector("[data-locked-section]")?.textContent).toBe("Turns on after the server update. This section sends nothing yet.");
      expect(locked.querySelectorAll("input, select, textarea")).toHaveLength(0);
    }
  });

  it("offers only the project's active labour roles and equipment, and the save sends the same input as before", () => {
    render(<SiteDailyReport />);
    fireEvent.click(screen.getByText("Add labour"));
    const trade = screen.getByLabelText("Trade") as HTMLSelectElement;
    expect(Array.from(trade.options).map(option => option.value)).toEqual(["", "Masons"]);
    fireEvent.change(trade, { target: { value: "Masons" } }); type("Count", "6");
    expect(document.querySelector('[data-report-section="1"] summary')?.textContent).toContain("Total: 6 workers");
    fireEvent.click(screen.getByText("Save draft"));
    expect(Object.keys(h.save.mock.calls[0]![0]).sort()).toEqual(["lines", "obstacles", "projectId", "reportDate", "summary", "temperatureC", "tenantId", "weather"]);
    expect(h.save.mock.calls[0]![0].lines).toEqual([expect.objectContaining({ lineType: "labour", label: "Masons", quantity: 6 })]);
  });

  it("an empty role list offers the default list to the project manager only", () => {
    h.roles = [];
    render(<SiteDailyReport />);
    fireEvent.click(screen.getByText("Copy the default list"));
    expect(h.seed).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", language: "en" });
    expect(screen.queryByText("Add labour")).toBeNull();
    cleanup(); h.canReview = false;
    render(<SiteDailyReport />);
    expect(screen.queryByText("Copy the default list")).toBeNull();
    expect(screen.getByText("The project manager adds them.")).toBeTruthy();
  });
});

describe("SiteDailyReport — a role list that failed to load (D-46, part 1)", () => {
  it("says it could not load, and does not pass for an empty list with a seed button", () => {
    h.rolesError = { message: "boom" };
    render(<SiteDailyReport />);
    expect(screen.getByRole("alert", { name: "Labour" }).textContent).toContain("Could not load: Labour");
    expect(screen.queryByText("Copy the default list")).toBeNull();
    expect(screen.queryByText("The project has no labour roles yet.")).toBeNull();
  });
});

describe("SiteDailyReport — review of #237", () => {
  it("offers only active equipment: a retired crane is not a choice", () => {
    render(<SiteDailyReport />);
    fireEvent.click(screen.getByText("Add equipment"));
    const machine = document.querySelector<HTMLSelectElement>('[data-report-section="2"] [data-line="equipment"] select')!;
    expect(Array.from(machine.options).map(option => option.value)).toEqual(["", "Mixer"]);
    expect(Array.from(machine.options).some(option => option.value.includes("Crane"))).toBe(false);
  });

  it("a cleared work-day field shows a dash for the weekday and the screen stays up", () => {
    render(<SiteDailyReport />);
    fireEvent.change(screen.getByLabelText("Work day"), { target: { value: "" } });
    expect(document.querySelector('[data-report-section="0"]')?.textContent).toContain("Day: —");
    expect(screen.getByText("Save draft")).toBeTruthy();
  });

  it("the approval section, all locked for now, starts closed", () => {
    render(<SiteDailyReport />);
    expect((document.querySelector('[data-report-section="10"]') as HTMLDetailsElement).open).toBe(false);
  });
});
