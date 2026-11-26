/** @vitest-environment jsdom */
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import SiteDailyReport from "./SiteDailyReport";

const h = vi.hoisted(() => ({
  language: "en" as "ar" | "en" | "ur", submittalsError: null as unknown, canWrite: true, canReview: true,
  dailyApproval: true as boolean | null, submitResult: { id: "r1", status: "submitted", final: false } as Record<string, unknown>,
  save: vi.fn(), submit: vi.fn(), review: vi.fn(), attach: vi.fn(), upload: vi.fn(), seed: vi.fn(),
  roles: [] as Array<{ id: string; name: string; category: string; active: boolean }>, rolesError: null as unknown, machines: [] as Array<{ id: string; equipmentType: string; model: string | null; plateOrSize: string | null; active: boolean }>,
  reports: [] as Array<{ id: string; reportDate: string; status: string; weather: string | null }>,
  detail: { report: { reportDate: "2026-10-20", weather: "clear", temperatureC: 30, summary: "Walls", obstacles: null, status: "rejected", reviewNote: "Add the count" }, lines: [] as unknown[], photos: [] as unknown[], materials: [] as unknown[], hse: [] as unknown[], obstacleItems: [] as unknown[], tomorrow: [] as unknown[],
    // D-45 (c): what the server reads for the day, and the chain as it stands
    inspections: { wir: { submitted: 3, approved: 1, rejected: 1, pending: 1, items: [{ id: "w1", code: "WIR-001", state: "approved" }, { id: "w2", code: "WIR-002", state: "rejected" }, { id: "w3", code: "WIR-003", state: "pending" }] }, rfi: { submitted: 0, approved: 0, rejected: 0, pending: 0, items: [] as Array<{ id: string; number: string; state: string }> } },
    approval: { prepare: { holder: 5 as number | null, by: 5 as number | null, at: "2026-10-20T08:00:00Z" as string | null }, review: { holder: 7 as number | null, by: null as number | null, at: null as string | null, note: null as string | null }, approve: { holder: null as number | null, by: null as number | null, at: null as string | null } } },
  me: { id: 7 }, check: vi.fn(), copy: vi.fn(), copyError: null as null | { message: string; data: { projectError: { code: string } } }, companiesError: null as unknown,
  companies: [{ id: "c-main", name: "Main Contractor Co.", active: true }, { id: "c-old", name: "Gone Sub Co.", active: false }],
  dryRun: { applied: [{ unitId: "u12", activityDefinitionId: "a-walls", from: null, to: "IN_PROGRESS" }], skipped: [{ unitId: "u13", activityDefinitionId: "a-walls" }], notAccepted: [{ unitId: "u12", activityDefinitionId: "a-walls" }] },
  // Q-56 (4a): who may approve the project's reports (siteReports.approvers), and a refusal the next approval meets (4b)
  approvers: { named: false, reviewFirst: false, people: [{ userId: 7, name: "Reviewer Seven" }, { userId: 9, name: "Manager Nine" }] } as { named: boolean; reviewFirst: boolean; people: Array<{ userId: number; name: string | null }> },
  reviewError: null as null | { message: string; data: { projectError: { code: string } } },
}));
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: (await import("../test/dsSelectStandIn")).NativeSelect }));
vi.mock("wouter", () => ({ useLocation: () => ["/", vi.fn()], Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useParams: () => ({ tenantId: "t", projectId: "p" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.language === "ar", language: h.language, isRtl: h.language !== "en" }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => null }));
vi.mock("@/lib/permissions", () => ({ useCanPage: () => true, usePermissionsLoading: () => false, useCan: (permission: string) => (permission === "project.manage" ? h.canReview : h.canWrite), WriteGate: ({ permission, children, reason }: { permission: string; children: React.ReactNode; reason?: { en: string } }) => ((permission === "project.field.manage" ? h.canWrite : true) ? <>{children}</> : <p>{reason?.en}</p>) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "localized error" }));
vi.mock("@/lib/useDirectUpload", () => ({ useDirectUpload: () => ({ upload: h.upload, percent: null, busy: false }) }));
const options = {
  units: [{ id: "u12", number: 12, modelCode: "A", block: "B1", zone: "Z1" }, { id: "u13", number: 13, modelCode: "B", block: "B1", zone: "Z1" }],
  activities: [{ id: "a-walls", modelCode: "A", code: "WALLS", name: "Walls" }, { id: "a-paint", modelCode: "A", code: "PAINT", name: "Paint" }, { id: "b-walls", modelCode: "B", code: "WALLS", name: "Walls" }],
};
vi.mock("@/lib/trpc", () => {
  const mutation = (name: "save" | "submit" | "review" | "attachPhoto") => ({ useMutation: (config: { onSuccess?: (result: unknown, variables: unknown) => void; onError?: (error: unknown, variables: unknown) => void }) => ({
    mutate: (input: unknown) => { const key = name === "attachPhoto" ? "attach" : name; h[key](input); if (name === "review" && h.reviewError && !(input as { dryRun?: boolean }).dryRun && !(input as { leaveNotAccepted?: boolean }).leaveNotAccepted) { config.onError?.(h.reviewError, input); return; } const result = name === "save" ? { id: "r1", status: "draft" } : name === "review" ? ((input as { dryRun?: boolean }).dryRun ? h.dryRun : { applied: [], skipped: [] }) : h.submitResult; config.onSuccess?.(result, input); },
    mutateAsync: async (input: unknown) => { h.attach(input); config.onSuccess?.({}, input); return {}; }, isPending: false, error: null,
  }) });
  return { trpc: {
    // #233: the project's reference lists the report picks from
    projects: {
      labourRoles: { list: { useQuery: () => ({ data: h.rolesError ? undefined : h.roles, isLoading: false, error: h.rolesError, refetch: vi.fn() }) }, seedDefaults: { useMutation: () => ({ mutate: h.seed, isPending: false, error: null }) } },
      equipment: { list: { useQuery: () => ({ data: h.machines, isLoading: false, error: null, refetch: vi.fn() }) } },
      companies: { list: { useQuery: () => ({ data: h.companiesError ? undefined : h.companies, isLoading: false, error: h.companiesError, isError: Boolean(h.companiesError), status: h.companiesError ? "error" : "success", refetch: vi.fn() }) } },
      approvers: { get: { useQuery: () => ({ data: { prepare: { membershipId: "m5", userId: 5, name: "Site Writer" }, review: { membershipId: "m7", userId: 7, name: "Reviewer Seven" }, approve: null }, isLoading: false, error: null }) } },
    },
    auth: { me: { useQuery: () => ({ data: h.me }) } },
    policy: { effective: { useQuery: () => ({ data: h.dailyApproval === null ? undefined : { dailyReportApproval: h.dailyApproval }, isLoading: false, error: null }) } },
    useUtils: () => ({ siteReports: { list: { invalidate: vi.fn() }, get: { fetch: async () => h.detail } } }),
    submittals: { list: { useQuery: (input: { submittalType?: string }) => (h.submittalsError ? { data: undefined, isLoading: false, error: h.submittalsError, isError: true, status: "error", refetch: vi.fn() } : { data: input.submittalType === "material_approval" ? [{ id: "00000000-0000-4000-8000-0000000000aa", submittalNumber: "MA-007", title: "Blocks" }] : [], isLoading: false, error: null, refetch: vi.fn() }) } },
    siteReports: {
      options: { useQuery: () => ({ data: options, isLoading: false, error: null, refetch: vi.fn() }) },
      approvers: { useQuery: () => ({ data: h.approvers, isLoading: false, error: null }) },
      list: { useQuery: () => ({ data: h.reports, isLoading: false, error: null, refetch: vi.fn() }) },
      get: { useQuery: (_input: unknown, config: { enabled: boolean }) => ({ data: config.enabled ? { ...h.detail, photos: h.detail.photos } : undefined, error: null, refetch: vi.fn() }) },
      save: mutation("save"), submit: mutation("submit"), review: mutation("review"), attachPhoto: mutation("attachPhoto"),
      export: { useMutation: () => ({ mutateAsync: vi.fn(async () => ({ url: "https://files.example.test/x.xlsx", fileName: "x.xlsx" })), isPending: false, error: null }) },
      copyFromYesterday: { useMutation: (config: { onSuccess?: (result: unknown, variables: unknown) => void; onError?: (error: unknown, variables: unknown) => void }) => ({ mutate: (input: unknown) => { h.copy(input); if (h.copyError && !(input as { sourceReportId?: string }).sourceReportId) { config.onError?.(h.copyError, input); return; } config.onSuccess?.({ id: "r-copy" }, input); }, isPending: false, error: null }) },
      check: { useMutation: (config: { onSuccess?: (result: unknown, variables: unknown) => void }) => ({ mutate: (input: unknown) => { h.check(input); config.onSuccess?.({}, input); }, isPending: false, error: null }) },
    },
  } };
});

beforeEach(() => { h.dailyApproval = true; h.submitResult = { id: "r1", status: "submitted", final: false }; h.copyError = null; h.reviewError = null; h.approvers = { named: false, reviewFirst: false, people: [{ userId: 7, name: "Reviewer Seven" }, { userId: 9, name: "Manager Nine" }] }; h.check.mockReset(); h.copy.mockReset(); h.companiesError = null; h.me = { id: 7 }; h.language = "en"; h.submittalsError = null; h.detail.report.status = "rejected"; h.detail.materials = []; h.detail.hse = []; h.detail.obstacleItems = []; h.detail.tomorrow = []; h.canWrite = true; h.canReview = true; h.reports = []; h.seed.mockReset(); h.rolesError = null;
  h.roles = [{ id: "r-mason", name: "Masons", category: "direct", active: true }, { id: "r-old", name: "Retired trade", category: "direct", active: false }];
  h.machines = [{ id: "e-mix", equipmentType: "Mixer", model: null, plateOrSize: null, active: true }, { id: "e-old", equipmentType: "Crane", model: "C-9", plateOrSize: "50 t", active: false }]; for (const key of ["save", "submit", "review", "attach", "upload"] as const) h[key].mockReset(); h.upload.mockResolvedValue("uploads/key-0123456789"); });
afterEach(cleanup);
const type = (label: string | RegExp, value: string, index = 0) => fireEvent.change(screen.getAllByLabelText(label)[index]!, { target: { value } });

describe("SiteDailyReport — several reports of one day (Q-58 1)", () => {
  it("a save after opening a report names it; a new report is unnamed; the label goes with the save", async () => {
    h.reports = [{ id: "r9", reportDate: "2026-10-20", status: "draft", weather: "clear" }];
    h.detail.report.status = "draft";
    render(<SiteDailyReport />);
    fireEvent.change(screen.getByLabelText(/Shift \/ area \/ contractor/), { target: { value: "Zone B night" } });
    fireEvent.click(screen.getByText("Save draft"));
    expect(h.save.mock.calls[0]![0]).toMatchObject({ label: "Zone B night" });
    expect(h.save.mock.calls[0]![0]).not.toHaveProperty("reportId");
    fireEvent.click(screen.getAllByText("Open")[0]!);
    await waitFor(() => expect(screen.getByText("New report")).toBeTruthy());
    fireEvent.click(screen.getByText("Save draft"));
    expect(h.save.mock.calls.at(-1)![0]).toMatchObject({ reportId: "r9", reportDate: "2026-10-20" });
  });

  it("«copy from yesterday» meets two reports there: it asks which, and copies the one chosen", () => {
    // the server's shape: a translated sentence in `message`, the product code in data.projectError.code (never read from `message`)
    h.copyError = { message: "Your previous day holds more than one report: say which to copy.", data: { projectError: { code: "PROJECT_OS_SITE_REPORT_COPY_WHICH" } } };
    h.reports = [
      { id: "y1", reportDate: "2026-10-19", status: "approved", weather: null, preparedByUserId: 7, reportNumber: "DR-0003", label: "Zone A" },
      { id: "y2", reportDate: "2026-10-19", status: "approved", weather: null, preparedByUserId: 7, reportNumber: "DR-0004", label: "Zone B" },
      { id: "o1", reportDate: "2026-10-19", status: "approved", weather: null, preparedByUserId: 99, reportNumber: "DR-0005", label: "Someone else" },
    ] as never;
    render(<SiteDailyReport />);
    fireEvent.click(screen.getByText("Copy from yesterday"));
    const which = document.querySelector("[data-copy-which]") as HTMLElement;
    expect(within(which).getAllByRole("button").map(button => button.textContent)).toEqual(["DR-0003 · Zone A", "DR-0004 · Zone B"]); // mine only
    fireEvent.click(within(which).getByText("DR-0004 · Zone B"));
    expect(h.copy).toHaveBeenLastCalledWith(expect.objectContaining({ sourceReportId: "y2" }));
  });
});

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

  it("Q-71 (2): with the company's approval rule off, the button says «Send the report» and a sent report says it is final — with the cells QC held back counted", () => {
    h.dailyApproval = false; h.submitResult = { id: "r1", status: "approved", final: true, applied: [{}], skipped: [{ reason: "QC_NOT_ACCEPTED" }, { reason: "NOT_FORWARD" }], warnings: [] };
    render(<SiteDailyReport />);
    fireEvent.click(screen.getByText("Add equipment")); type("Equipment", "Mixer");
    expect(screen.queryByText("Send for approval")).toBeNull();
    fireEvent.click(screen.getByText("Save draft"));
    fireEvent.click(screen.getByText("Send the report").closest("button")!);
    expect(h.submit).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", reportId: "r1" });
    expect(screen.getByText("The report was sent and is final: it counts in the week and month. Progress cells updated: 1. Cells not updated because their inspection is not accepted: 1")).toBeTruthy();
    expect(screen.queryByText("The report was sent for approval")).toBeNull();
  });

  it("Q-71 (2) NEGATIVE: while the rule is unknown the wording is neutral (never «for approval» by guess); a report that waits says so", () => {
    h.dailyApproval = null;
    render(<SiteDailyReport />);
    fireEvent.click(screen.getByText("Add equipment")); type("Equipment", "Mixer");
    fireEvent.click(screen.getByText("Save draft"));
    fireEvent.click(screen.getByText("Send the report").closest("button")!);
    // the server decides: here it answered that the report waits (the rule was on after all)
    expect(screen.getByText("The report was sent for approval")).toBeTruthy();
    expect(screen.queryByText(/is final/)).toBeNull();
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
    fireEvent.click(screen.getAllByText("Open")[0]!);
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
    expect(preview.textContent).toContain("12 · WALLS — Walls: — → IN_PROGRESS");
    expect(preview.textContent).toContain("These will not move");
    expect(preview.textContent).toContain("No QC receipt for these villas and activities"); // Q-56 (4b): read from the server's «notAccepted»
    fireEvent.click(within(panel).getByText("Approve"));
    expect(h.review).toHaveBeenLastCalledWith({ tenantId: "t", projectId: "p", reportId: "r5", decision: "approve" });
    expect(within(panel).getByText("Report approved and progress moved")).toBeTruthy();
  });

  it("Q-56 (4a): on one's own report there is no approve button (the server refuses it) — it says who approves; with nobody else, it says to invite a project manager", () => {
    h.reports = [{ id: "r5", reportDate: "2026-10-23", status: "submitted", weather: null, preparedByUserId: 7 } as never];
    const { unmount } = render(<SiteDailyReport />);
    let item = screen.getByRole("region", { name: "Approve reports" }).querySelector("[data-review=r5]") as HTMLElement;
    expect(within(item).queryByText("Approve")).toBeNull();
    expect(within(item).queryByText("What will move?")).toBeNull();
    expect(item.textContent).toContain("You prepared this report, so someone else approves it.");
    expect(item.querySelector("[data-approvers]")!.textContent).toContain("Manager Nine"); // the others, never the preparer
    expect(item.querySelector("[data-approvers]")!.textContent).not.toContain("Reviewer Seven");
    unmount();
    h.approvers = { named: false, reviewFirst: false, people: [{ userId: 7, name: "Reviewer Seven" }] };
    render(<SiteDailyReport />);
    item = screen.getByRole("region", { name: "Approve reports" }).querySelector("[data-review=r5]") as HTMLElement;
    const none = item.querySelector("[data-approvers=none]") as HTMLElement;
    expect(none.textContent).toContain("Invite a project manager");
    expect(within(none).getByText("Project team → invite").closest("a")!.getAttribute("href")).toBe("/projects/t/p/team");
  });

  it("Q-56 (4b): approving meets QC — the villas and activities that hold it are named, and the report can be approved without moving them", () => {
    h.reviewError = { message: "Quality control has not accepted some villas.", data: { projectError: { code: "PROJECT_OS_QC_NOT_ACCEPTED" } } };
    render(<SiteDailyReport />);
    const panel = screen.getByRole("region", { name: "Approve reports" });
    fireEvent.click(within(panel).getByText("Approve"));
    // the refusal runs the preview at once: the list of what holds it, by villa number and activity name
    expect(h.review).toHaveBeenLastCalledWith({ tenantId: "t", projectId: "p", reportId: "r5", decision: "approve", dryRun: true });
    const held = panel.querySelector("[data-qc-held]") as HTMLElement;
    expect(held.textContent).toContain("12 · WALLS — Walls");
    fireEvent.click(within(held).getByText("Approve the report without moving these villas"));
    expect(h.review).toHaveBeenLastCalledWith({ tenantId: "t", projectId: "p", reportId: "r5", decision: "approve", leaveNotAccepted: true });
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
  it("draws the eleven sections in order; inspections (4) and the chain (10) are no longer locked, and inspections take no typing", () => {
    render(<SiteDailyReport />);
    const sections = Array.from(document.querySelectorAll<HTMLElement>("[data-report-section]"));
    // Q-58 (2): the paper report's order — 1 header, 2 work done, 3 labour, 4 equipment, 5 materials, 6 inspections, 7 safety, 8 obstacles, 9 tomorrow, 10 photos, ✓ review
    expect(sections.map(node => node.dataset.reportSection)).toEqual(["header", "work", "labour", "equipment", "materials", "inspections", "hse", "obstacles", "tomorrow", "photos", "review"]);
    expect(sections.map(node => node.dataset.sectionNumber)).toEqual(["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "✓"]);
    for (const number of ["inspections", "review"]) expect(document.querySelector(`[data-report-section="${number}"] [data-locked-section]`)).toBeNull();
    expect(document.querySelectorAll('[data-report-section="inspections"] input, [data-report-section="inspections"] select, [data-report-section="inspections"] textarea')).toHaveLength(0);
    expect(part("inspections").getByText("Save the report to see its day's inspections.")).toBeTruthy();
  });

  it("offers only the project's active labour roles and equipment, and the save sends the same input as before", () => {
    render(<SiteDailyReport />);
    fireEvent.click(screen.getByText("Add labour"));
    const trade = screen.getByLabelText("Trade") as HTMLSelectElement;
    expect(Array.from(trade.options).map(option => option.value)).toEqual(["", "Masons"]);
    fireEvent.change(trade, { target: { value: "Masons" } }); type("Count", "6");
    expect(document.querySelector('[data-report-section="labour"] summary')?.textContent).toContain("Total: 6 workers");
    fireEvent.click(screen.getByText("Save draft"));
    // Q-24: plus the request identifier the phone keeps it under if the connection drops (the server answers a resend of it with the first answer)
    expect((h.save.mock.calls[0]![0] as { clientRequestId?: string }).clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
    expect(Object.keys(h.save.mock.calls[0]![0]).filter(key => key !== "clientRequestId").sort()).toEqual(["equipment", "hse", "labour", "lines", "materials", "newReportId", "obstacleItems", "obstacles", "projectId", "reportDate", "summary", "temperatureC", "tenantId", "tomorrow", "weather", "wind", "workHours"]);
    expect(h.save.mock.calls[0]![0].lines).toEqual([expect.objectContaining({ lineType: "labour", label: "Masons", quantity: 6 })]);
    // Q-58 (1): a new report carries the id the screen chose for it (a second save of it changes it, never makes another)
    expect(h.save.mock.calls[0]![0].newReportId).toMatch(/^[0-9a-f-]{36}$/);
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
    const machine = document.querySelector<HTMLSelectElement>('[data-report-section="equipment"] [data-line="equipment"] select')!;
    expect(Array.from(machine.options).map(option => option.value)).toEqual(["", "Mixer"]);
    expect(Array.from(machine.options).some(option => option.value.includes("Crane"))).toBe(false);
  });

  it("a cleared work-day field shows a dash for the weekday and the screen stays up", () => {
    render(<SiteDailyReport />);
    fireEvent.change(screen.getByLabelText("Work day"), { target: { value: "" } });
    expect(document.querySelector('[data-report-section="header"]')?.textContent).toContain("Day: —");
    expect(screen.getByText("Save draft")).toBeTruthy();
  });

  it("the approval section, all locked for now, starts closed", () => {
    render(<SiteDailyReport />);
    expect((document.querySelector('[data-report-section="review"]') as HTMLDetailsElement).open).toBe(false);
  });
});

// D-46 (2): sections 5 to 8 on the contract of D-45 (b) (#240)
const SUBMITTAL = "00000000-0000-4000-8000-0000000000aa";
// Q-58 (2): a section is found by its key (the paper order numbers it differently)
const part = (key: string) => within(document.querySelector<HTMLElement>(`[data-report-section="${key}"]`)!);
const fill = (key: string, label: string, value: string) => fireEvent.change(part(key).getByLabelText(label), { target: { value } });
describe("SiteDailyReport — materials, HSE, obstacles and tomorrow (D-46, part 2)", () => {
  it("fills the four sections and sends them on the server's contract; the save waits for every required field", () => {
    render(<SiteDailyReport />);
    const save = screen.getByText("Save draft").closest("button") as HTMLButtonElement;
    fireEvent.click(part("materials").getByText("Add material"));
    expect(save.disabled).toBe(true); // material, quantity and unit are required
    fill("materials", "Material", "Concrete blocks"); fill("materials", "Quantity", "0"); fill("materials", "Unit", "pcs");
    expect(save.disabled).toBe(true); // a received quantity is above zero
    fill("materials", "Quantity", "1200"); fill("materials", "Supplier", "Supplier A");
    expect(Array.from((part("materials").getByLabelText("Consultant approval") as HTMLSelectElement).options).map(option => option.textContent)).toEqual(["No approval", "MA-007 — Blocks"]);
    fill("materials", "Consultant approval", SUBMITTAL);
    expect(save.disabled).toBe(false);
    fireEvent.click(part("hse").getByText("Add safety event"));
    fill("hse", "Kind", "near_miss"); fill("hse", "People", "2.5");
    expect(save.disabled).toBe(true); // no description, and a head count is whole
    fill("hse", "Description", "Unsecured ladder"); fill("hse", "People", "2"); fill("hse", "Action taken", "Ladder tied off");
    expect(document.querySelector('[data-report-section="hse"] summary')?.textContent).toContain("Near miss: 1");
    fireEvent.click(part("obstacles").getByText("Add obstacle"));
    fill("obstacles", "Obstacle", "Water supply cut"); fill("obstacles", "Due date", "2026-11-10"); fill("obstacles", "Responsible", "Utilities");
    fireEvent.click(part("tomorrow").getByText("Add item for tomorrow"));
    fill("tomorrow", "Activity", "Plaster block B1"); fill("tomorrow", "Quantity", "40"); fill("tomorrow", "Unit", "m2");
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    const sent = h.save.mock.calls[0]![0];
    expect(sent.materials).toEqual([{ material: "Concrete blocks", quantity: 1200, unit: "pcs", supplier: "Supplier A", consultantSubmittalId: SUBMITTAL }]);
    expect(sent.hse).toEqual([{ kind: "near_miss", description: "Unsecured ladder", peopleCount: 2, actionTaken: "Ladder tied off" }]);
    expect(sent.obstacleItems).toEqual([{ issue: "Water supply cut", impact: undefined, responsible: "Utilities", action: undefined, dueDate: "2026-11-10" }]);
    expect(sent.tomorrow).toEqual([{ area: undefined, activity: "Plaster block B1", quantity: 40, unit: "m2", resources: undefined }]);
  });

  it("a list of approvals that failed to load says so in section 5; a material can still be recorded with no approval", () => {
    h.submittalsError = { message: "boom" };
    render(<SiteDailyReport />);
    expect(part("materials").getByRole("alert", { name: "Consultant approval" }).textContent).toContain("Could not load: Consultant approval");
    fireEvent.click(part("materials").getByText("Add material"));
    expect(Array.from(document.querySelector<HTMLSelectElement>('[data-report-section="materials"] [data-section-row] select')!.options).map(option => option.textContent)).toEqual(["No approval"]);
  });

  it("a removed row is not sent, and an empty section is sent as an empty list (the server replaces each list whole)", () => {
    render(<SiteDailyReport />);
    fireEvent.click(part("tomorrow").getByText("Add item for tomorrow"));
    fireEvent.click(part("tomorrow").getByText("Remove"));
    fireEvent.click(screen.getByText("Save draft"));
    expect(h.save.mock.calls[0]![0]).toMatchObject({ materials: [], hse: [], obstacleItems: [], tomorrow: [] });
  });

  it("opens a saved report with its four lists, and a sent report shows them without a field or a button", async () => {
    h.reports = [{ id: "r9", reportDate: "2026-10-20", status: "submitted", weather: "clear" }];
    h.detail.report.status = "submitted";
    h.detail.materials = [{ id: "m1", material: "Cement", quantity: 50, unit: "bag", supplier: null, consultantSubmittalId: null }];
    h.detail.hse = [{ id: "s1", kind: "meeting", description: "Toolbox talk", peopleCount: 30, actionTaken: null }];
    h.detail.tomorrow = [{ id: "t1", area: "B2", activity: "Formwork", quantity: null, unit: null, resources: "6 carpenters" }];
    render(<SiteDailyReport />);
    fireEvent.click(screen.getAllByText("Open")[0]!);
    await waitFor(() => expect((part("materials").getByLabelText("Material") as HTMLInputElement).value).toBe("Cement"));
    expect((part("hse").getByLabelText("Description") as HTMLTextAreaElement).value).toBe("Toolbox talk");
    expect((part("tomorrow").getByLabelText("Resources") as HTMLInputElement).value).toBe("6 carpenters");
    expect(document.querySelector('[data-report-section="hse"] summary')?.textContent).toContain("Toolbox meeting: 1");
    for (const number of ["materials", "hse", "obstacles", "tomorrow"]) {
      expect(Array.from(document.querySelectorAll<HTMLInputElement>(`[data-report-section="${number}"] input, [data-report-section="${number}"] select, [data-report-section="${number}"] textarea`)).every(field => field.disabled)).toBe(true);
      // only the phone's «previous / next» (moving between sections changes nothing)
      expect(part(number).queryAllByRole("button").filter(button => !button.closest("[data-step-buttons]"))).toHaveLength(0);
    }
    expect(part("obstacles").getByText("Nothing yet.")).toBeTruthy();
  });

  it.each([["ar", "أضف حدث سلامة", "حادث وشيك"], ["ur", "حفاظتی واقعہ شامل کریں", "بال بال بچاؤ"]] as const)("%s: the sections speak the screen's language", (language, add, nearMiss) => {
    h.language = language;
    render(<SiteDailyReport />);
    fireEvent.click(part("hse").getByText(add));
    expect(Array.from(part("hse").getByRole("combobox").querySelectorAll("option")).map(option => option.textContent)).toContain(nearMiss);
  });
});

// Q-9 / D-45 (c) on the screen: the day's inspections (4), the place of a photo (9), the chain and its review step (10)
describe("SiteDailyReport — inspections, photo place and the approval chain (Q-9, D-45 c)", () => {
  const openSaved = async (status: string) => {
    h.detail.report.status = status;
    h.reports = [{ id: "r9", reportDate: "2026-10-20", status, weather: "clear" }];
    render(<SiteDailyReport />);
    fireEvent.click(screen.getAllByText("Open")[0]!);
    await waitFor(() => expect(document.querySelector("[data-chain-step]")).toBeTruthy());
  };

  it("section 4 shows the server's WIR and RFI counts and items, read-only", async () => {
    await openSaved("draft");
    const wir = document.querySelector<HTMLElement>('[data-inspections="Inspection requests (WIR)"]')!;
    expect(Array.from(wir.querySelectorAll("[data-count]")).map(node => node.textContent)).toEqual(["3", "1", "1", "1"]);
    expect(within(wir).getByText("WIR-002")).toBeTruthy();
    expect(within(document.querySelector<HTMLElement>('[data-inspections="Requests for information (RFI)"]')!).getByText("Nothing on this day.")).toBeTruthy();
    expect(document.querySelector('[data-report-section="inspections"] summary')?.textContent).toContain("WIR 3 · RFI 0");
  });

  it("a photo carries its zone and a unit of this project; an unknown unit number blocks the camera", async () => {
    await openSaved("draft");
    fireEvent.change(part("photos").getByLabelText("Unit number (optional)"), { target: { value: "99" } });
    expect(part("photos").getByRole("alert").textContent).toBe("No unit with that number");
    expect((part("photos").getByLabelText("Take a photo") as HTMLInputElement).disabled).toBe(true);
    fireEvent.change(part("photos").getByLabelText("Unit number (optional)"), { target: { value: "12" } });
    fireEvent.change(part("photos").getByLabelText("Zone (optional)"), { target: { value: "North gate" } });
    fireEvent.change(part("photos").getByLabelText("Take a photo"), { target: { files: [new File([new Uint8Array([1])], "slab.jpg", { type: "image/jpeg" })] } });
    await waitFor(() => expect(h.attach).toHaveBeenCalledTimes(1));
    expect(h.attach.mock.calls[0]![0]).toMatchObject({ reportId: "r9", zone: "North gate", pmcUnitId: "u12" });
  });

  it("the chain names each step's holder and what was done; the reviewer who holds the step passes it, and a return needs a note", async () => {
    await openSaved("submitted");
    const steps = Array.from(document.querySelectorAll<HTMLElement>("[data-chain-step]"));
    expect(steps.map(step => step.dataset.chainStep)).toEqual(["prepare", "review", "approve"]);
    expect(steps[0]!.textContent).toContain("Site Writer");
    expect(steps[0]!.querySelector("[data-step-state]")?.getAttribute("data-step-state")).toBe("done");
    expect(steps[0]!.textContent).toContain("Done: Site Writer · ");
    expect(steps[0]!.textContent).not.toMatch(/· —/);
    expect(steps[1]!.textContent).toContain("You");
    expect(steps[2]!.textContent).toContain("Not assigned");
    const back = part("review").getByText("Send back to its writer").closest("button") as HTMLButtonElement;
    expect(back.disabled).toBe(true);
    fireEvent.click(part("review").getByText("Passes review"));
    expect(h.check).toHaveBeenCalledWith(expect.objectContaining({ reportId: "r9", decision: "pass" }));
    fireEvent.change(part("review").getByLabelText("Review note (required to send back)"), { target: { value: "Count again" } });
    fireEvent.click(back);
    expect(h.check).toHaveBeenLastCalledWith(expect.objectContaining({ decision: "return", note: "Count again" }));
  });

  it("no review buttons for someone who does not hold the step, nor for a draft, nor once it was reviewed", async () => {
    h.me = { id: 99 };
    await openSaved("submitted");
    expect(document.querySelector("[data-review-step]")).toBeNull();
    cleanup(); h.me = { id: 7 };
    await openSaved("draft");
    expect(document.querySelector("[data-review-step]")).toBeNull();
    cleanup(); h.detail.approval.review.at = "2026-10-20T10:00:00Z"; h.detail.approval.review.by = 7;
    await openSaved("submitted");
    expect(document.querySelector("[data-review-step]")).toBeNull();
    expect(document.querySelectorAll('[data-chain-step="review"] [data-step-state="done"]')).toHaveLength(1);
    h.detail.approval.review.at = null; h.detail.approval.review.by = null;
  });

  it("a step done at a Date (as the server sends it) shows its day, not a dash", async () => {
    (h.detail.approval.prepare as { at: unknown }).at = new Date("2026-10-20T08:00:00Z");
    await openSaved("submitted");
    expect(document.querySelector('[data-chain-step="prepare"]')!.textContent).not.toMatch(/· —/);
    h.detail.approval.prepare.at = "2026-10-20T08:00:00Z";
  });
});

// Q-9 (b): wind and hours (0), the labour matrix (1), the equipment of the day (2), «copy from yesterday», on the D-45 (a) contract
const addTrade = (company: string, roleId: string) => fireEvent.change(part("labour").getByLabelText(`Add a trade: ${company}`), { target: { value: roleId } });
describe("SiteDailyReport — header extras, labour matrix, equipment of the day, copy from yesterday (Q-9 b)", () => {
  it("sends wind, hours, the matrix cells above zero and the day's machines; only active companies and trades are offered", () => {
    render(<SiteDailyReport />);
    fireEvent.change(part("header").getByLabelText("Wind"), { target: { value: "moderate" } });
    fireEvent.change(part("header").getByLabelText("Working hours"), { target: { value: "10" } });
    expect(document.querySelector('[data-company="c-old"]')).toBeNull();
    // a trade appears once it is added; a retired trade is not offered
    expect(part("labour").queryByLabelText("Main Contractor Co. · Masons · Day")).toBeNull();
    expect(Array.from((part("labour").getByLabelText("Add a trade: Main Contractor Co.") as HTMLSelectElement).options).map(option => option.value)).not.toContain("r-old");
    addTrade("Main Contractor Co.", "r-mason");
    fireEvent.change(part("labour").getByLabelText("Main Contractor Co. · Masons · Day"), { target: { value: "12" } });
    fireEvent.change(part("labour").getByLabelText("Main Contractor Co. · Masons · Night"), { target: { value: "0" } });
    expect(document.querySelector("[data-labour-total]")?.textContent).toBe("Total: 12 workers");
    fireEvent.change(part("equipment").getByLabelText("Mixer · Count"), { target: { value: "2" } });
    fireEvent.change(part("equipment").getByLabelText("Mixer · Hours"), { target: { value: "8" } });
    fireEvent.click(screen.getByText("Save draft"));
    expect(h.save.mock.calls[0]![0]).toMatchObject({ wind: "moderate", workHours: 10, labour: [{ companyId: "c-main", labourRoleId: "r-mason", shift: "day", headcount: 12 }], equipment: [{ equipmentId: "e-mix", count: 2, hours: 8 }] });
  });

  it("refuses a broken count or hours before the server: the save stays shut", () => {
    render(<SiteDailyReport />);
    const save = screen.getByText("Save draft").closest("button") as HTMLButtonElement;
    addTrade("Main Contractor Co.", "r-mason");
    fireEvent.change(part("labour").getByLabelText("Main Contractor Co. · Masons · Day"), { target: { value: "2.5" } });
    expect(part("labour").getByRole("alert").textContent).toBe("A count is a whole number from zero.");
    expect(save.disabled).toBe(true);
    fireEvent.change(part("labour").getByLabelText("Main Contractor Co. · Masons · Day"), { target: { value: "3" } });
    fireEvent.change(part("equipment").getByLabelText("Mixer · Count"), { target: { value: "0" } });
    expect(save.disabled).toBe(true);
    fireEvent.change(part("equipment").getByLabelText("Mixer · Count"), { target: { value: "1" } });
    fireEvent.change(part("header").getByLabelText("Working hours"), { target: { value: "30" } });
    expect(save.disabled).toBe(true);
    fireEvent.change(part("header").getByLabelText("Working hours"), { target: { value: "9" } });
    expect(save.disabled).toBe(false);
    // removing the trade takes its cells away: nothing of it is sent
    fireEvent.click(part("labour").getByLabelText("Remove: Main Contractor Co. · Masons"));
    expect(part("labour").queryByLabelText("Main Contractor Co. · Masons · Day")).toBeNull();
    fireEvent.click(save);
    expect(h.save.mock.calls[0]![0].labour).toEqual([]);
  });

  it("a company list that failed to load says so and the save leaves the stored matrix alone (no labour key)", () => {
    h.companiesError = { message: "boom" };
    render(<SiteDailyReport />);
    expect(screen.getByRole("alert", { name: "Labour matrix (company × trade × shift)" })).toBeTruthy();
    fireEvent.click(screen.getByText("Save draft"));
    expect("labour" in h.save.mock.calls[0]![0]).toBe(false);
  });

  it("an opened report fills wind, hours, the matrix and the machines from the server", async () => {
    Object.assign(h.detail.report, { wind: "strong", workHours: 9 });
    Object.assign(h.detail, { labour: [{ companyId: "c-main", labourRoleId: "r-mason", shift: "night", headcount: 4 }], equipment: [{ equipmentId: "e-mix", count: 3, hours: 7 }] });
    h.reports = [{ id: "r9", reportDate: "2026-10-20", status: "rejected", weather: "clear" }];
    render(<SiteDailyReport />);
    fireEvent.click(screen.getAllByText("Open")[0]!);
    await waitFor(() => expect((part("labour").getByLabelText("Main Contractor Co. · Masons · Night") as HTMLInputElement).value).toBe("4"));
    expect((part("header").getByLabelText("Working hours") as HTMLInputElement).value).toBe("9");
    expect((part("equipment").getByLabelText("Mixer · Count") as HTMLInputElement).value).toBe("3");
    Object.assign(h.detail, { labour: [], equipment: [] });
  });

  it("«copy from yesterday» asks the server for this day's report and opens it; it is offered only before a report exists", async () => {
    render(<SiteDailyReport />);
    fireEvent.click(screen.getByText("Copy from yesterday"));
    expect(h.copy).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t", projectId: "p", reportDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) }));
    await waitFor(() => expect(screen.queryByText("Copy from yesterday")).toBeNull());
  });
});

describe("SiteDailyReport — exports (Q-9 c)", () => {
  it("the export bar and the document appear only for a saved report", async () => {
    render(<SiteDailyReport />);
    expect(document.querySelector("[data-report-exports]")).toBeNull();
    cleanup();
    h.reports = [{ id: "r9", reportDate: "2026-10-20", status: "approved", weather: "clear" }];
    render(<SiteDailyReport />);
    fireEvent.click(screen.getAllByText("Open")[0]!);
    await waitFor(() => expect(document.querySelector("[data-report-exports]")).toBeTruthy());
    expect(document.querySelector("[data-report-document]")).toBeTruthy();
    expect(screen.getByText("Download PDF")).toBeTruthy();
  });
});

describe("SiteDailyReport — the entry page in the paper report's order (Q-58 2)", () => {
  it("opens with «new report» and the reports with what each waits for: the approver by name, the reason it was sent back", () => {
    h.reports = [
      { id: "r1", reportDate: "2026-11-20", reportNumber: "DR-0003", label: "Night shift", status: "submitted", weather: null, preparedByUserId: 7 },
      { id: "r2", reportDate: "2026-11-19", status: "rejected", reviewNote: "Add the subcontractor's labour", weather: null, preparedByUserId: 7 },
      { id: "r3", reportDate: "2026-11-18", status: "approved", weather: null, preparedByUserId: 7 },
      { id: "r4", reportDate: "2026-11-17", status: "draft", weather: null, preparedByUserId: 7 },
    ] as never;
    render(<SiteDailyReport />);
    const header = document.querySelector("[data-reports-header]")!;
    // the list and «new report» come before the form's first section
    expect(header.compareDocumentPosition(document.querySelector('[data-report-section="header"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(header as HTMLElement).getByText("New report")).toBeTruthy();
    expect(Array.from(header.querySelectorAll("[data-report-state]")).map(node => node.textContent)).toEqual([
      "Waiting for approval by Manager Nine", // the preparer (7) is not their own approver
      "Sent back: Add the subcontractor's labour", "Approved", "Draft",
    ]);
    expect(header.textContent).toContain("Night shift");
  });

  it("the strip names every section with its state: the header fills as it is typed; the safety, materials and inspections sections are another engineer's while empty", () => {
    render(<SiteDailyReport />);
    const chips = Array.from(document.querySelectorAll<HTMLElement>("[data-section-strip] [data-section-chip]"));
    expect(chips.map(chip => chip.dataset.sectionChip)).toEqual(["header", "work", "labour", "equipment", "materials", "inspections", "hse", "obstacles", "tomorrow", "photos", "review"]);
    const state = (key: string) => document.querySelector<HTMLElement>(`[data-section-chip="${key}"]`)!.dataset.sectionState;
    expect([state("header"), state("work"), state("materials"), state("inspections"), state("hse")]).toEqual(["empty", "empty", "other", "other", "other"]);
    type("Summary of the day", "Masonry in B1");
    expect(state("header")).toBe("filled");
    // the header says it holds the one required field
    expect(document.querySelector('[data-report-section="header"] [data-required]')?.textContent).toBe("Required");
  });

  it("a phone walks the report one section at a time: «next» moves on, the strip jumps; a desk draws every section", () => {
    render(<SiteDailyReport />);
    const current = () => document.querySelector<HTMLElement>("[data-report-section][data-current]")?.dataset.reportSection;
    const hiddenOnPhone = () => Array.from(document.querySelectorAll<HTMLElement>("[data-report-section]")).filter(node => node.className.includes("max-lg:hidden")).map(node => node.dataset.reportSection);
    expect(current()).toBe("header");
    expect(hiddenOnPhone()).toHaveLength(10); // every section but the one in hand (a desk ignores max-lg:hidden)
    fireEvent.click(within(document.querySelector<HTMLElement>('[data-report-section="header"]')!).getByText("Next"));
    expect(current()).toBe("work");
    fireEvent.click(document.querySelector<HTMLElement>('[data-section-chip="photos"]')!);
    expect(current()).toBe("photos");
    expect(hiddenOnPhone()).not.toContain("photos");
    fireEvent.click(within(document.querySelector<HTMLElement>('[data-report-section="photos"]')!).getByText("Previous"));
    expect(current()).toBe("tomorrow");
  });

  it("the draft saves itself a few seconds after a change — never a blank form, never a report just opened (a sent-back report keeps its reason)", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      h.reports = [{ id: "r9", reportDate: "2026-10-20", status: "rejected", weather: "clear" }];
      render(<SiteDailyReport />);
      await act(async () => { vi.advanceTimersByTime(6000); });
      expect(h.save).not.toHaveBeenCalled(); // nothing written yet: no draft is made
      fireEvent.change(screen.getByLabelText("Work day"), { target: { value: "2026-10-19" } });
      await act(async () => { await Promise.resolve(); });
      await act(async () => { vi.advanceTimersByTime(6000); });
      expect(h.save).not.toHaveBeenCalled(); // a day picked, nothing else: still no draft
      type("Summary of the day", "Masonry in B1");
      await act(async () => { vi.advanceTimersByTime(4100); });
      expect(h.save).toHaveBeenCalledTimes(1);
      expect(h.save.mock.calls[0]![0]).toMatchObject({ summary: "Masonry in B1", newReportId: expect.any(String) });
      expect(document.querySelector("[data-autosaved]")).not.toBeNull();
      await act(async () => { vi.advanceTimersByTime(6000); });
      expect(h.save).toHaveBeenCalledTimes(1); // saved once; nothing changed since
      h.save.mockClear();
      fireEvent.click(screen.getAllByText("Open")[0]!);
      await waitFor(() => expect((screen.getByLabelText("Summary of the day") as HTMLTextAreaElement).value).toBe("Walls"));
      await act(async () => { await Promise.resolve(); }); // the opened report's effects run (a pending autosave would be scheduled here)
      await act(async () => { vi.advanceTimersByTime(6000); });
      await act(async () => { vi.advanceTimersByTime(6000); });
      expect(h.save).not.toHaveBeenCalled(); // opening the sent-back report saved nothing (a save would clear its reason)
      type("Summary of the day", "Walls, with the subcontractor's labour");
      await act(async () => { vi.advanceTimersByTime(4100); });
      expect(h.save.mock.calls.at(-1)![0]).toMatchObject({ reportId: "r9", summary: "Walls, with the subcontractor's labour" });
    } finally { vi.useRealTimers(); }
  });
});
