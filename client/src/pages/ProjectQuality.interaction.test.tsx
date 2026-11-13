/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProjectQuality from "./ProjectQuality";

const day = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();
const h = vi.hoisted(() => ({ language: "en" as "ar" | "en" | "ur", canWrite: true, isManager: true, createInspection: vi.fn(), advance: vi.fn(), respond: vi.fn(), createNcr: vi.fn(), transition: vi.fn(), saveRules: vi.fn(), respondResult: {} as unknown, ncrMode: "block" as "off" | "warn" | "block" }));
const steps = (current: number) => ["CONFIGURATIONS", "MANAGER_APPROVAL", "TECHNICAL_ASSISTANT", "WAITING_CONSULTANT", "RESULT_RECEIVING"].map((stepCode, index) => ({ id: `st${current}-${index}`, stepCode, status: index < current ? "complete" : index === current ? "in_progress" : "pending" }));
const requests = () => [
  { id: "i1", requestCode: "IR-1", activityDefinitionId: "a-walls", unitIds: ["u12"], requestedAt: day(6), responseCode: null, consultantLabel: "Alpha", contractorLabel: "Main contractor", steps: steps(1) },
  { id: "i2", requestCode: "IR-2", activityDefinitionId: "a-walls", unitIds: ["u13"], requestedAt: day(4), responseCode: null, consultantLabel: null, contractorLabel: null, steps: steps(4) },
  { id: "i3", requestCode: "IR-3", activityDefinitionId: "a-paint", unitIds: ["u12"], requestedAt: day(9), responseCode: "A", consultantLabel: "Alpha", contractorLabel: null, steps: steps(5) },
  { id: "i4", requestCode: "IR-4", activityDefinitionId: "a-walls", unitIds: ["u14"], requestedAt: day(8), responseCode: "B", consultantLabel: null, contractorLabel: null, steps: steps(5) },
  { id: "i5", requestCode: "IR-5", activityDefinitionId: "a-paint", unitIds: ["u13"], requestedAt: day(7), responseCode: "C", consultantLabel: null, contractorLabel: null, steps: steps(5) },
];
const ncrRows = () => [
  { id: "n1", ncrNumber: "NCR-1", title: "Honeycombing", description: "Honeycombing in the wall", status: "open", dueAt: null, createdAt: day(3), pmcUnitId: "u14", pmcActivityDefinitionId: "a-walls" },
  { id: "n2", ncrNumber: "NCR-2", title: "Crack", description: "Crack in a slab", status: "verification", dueAt: null, createdAt: day(5), pmcUnitId: null, pmcActivityDefinitionId: null },
  { id: "n3", ncrNumber: "NCR-3", title: "Old", description: "An old closed one", status: "closed", dueAt: null, createdAt: day(30), pmcUnitId: "u12", pmcActivityDefinitionId: "a-paint" },
];
const options = {
  units: [{ id: "u12", number: 12, modelCode: "A", block: "B1", zone: "Z1" }, { id: "u13", number: 13, modelCode: "A", block: "B1", zone: "Z1" }, { id: "u14", number: 14, modelCode: "A", block: "B1", zone: "Z1" }, { id: "u21", number: 21, modelCode: "B", block: "B2", zone: "Z1" }],
  activities: [{ id: "a-walls", modelCode: "A", code: "WALLS", name: "Walls" }, { id: "a-paint", modelCode: "A", code: "PAINT", name: "Paint" }, { id: "b-walls", modelCode: "B", code: "WALLS", name: "Walls" }],
};
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: (await import("../test/dsSelectStandIn")).NativeSelect }));
vi.mock("wouter", () => ({ useLocation: () => ["/", vi.fn()], Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useParams: () => ({ tenantId: "t", projectId: "p" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.language === "ar", language: h.language, isRtl: h.language !== "en" }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => null }));
vi.mock("@/lib/permissions", () => ({ useCan: () => h.isManager, WriteGate: ({ children, reason }: { children: React.ReactNode; reason?: { en: string } }) => (h.canWrite ? <>{children}</> : reason ? <p>{reason.en}</p> : null) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "localized error" }));
vi.mock("@/lib/trpc", () => {
  const mutation = (name: "createInspection" | "advance" | "respond" | "createNcr" | "transition" | "saveRules") => ({ useMutation: (config: { onSuccess?: (result: unknown) => void }) => ({ mutate: (input: unknown) => { h[name](input); config.onSuccess?.(name === "respond" ? h.respondResult : {}); }, isPending: false, error: null }) });
  return { trpc: {
    useUtils: () => ({ pmc: { inspections: { invalidate: vi.fn() } }, ncrs: { list: { invalidate: vi.fn() } }, policy: { get: { invalidate: vi.fn() } } }),
    siteReports: { options: { useQuery: () => ({ data: options, isLoading: false, error: null, refetch: vi.fn() }) } },
    pmc: { inspections: { useQuery: () => ({ data: requests(), isLoading: false, error: null, refetch: vi.fn() }) }, createInspection: mutation("createInspection"), advanceInspection: mutation("advance"), respondInspection: mutation("respond") },
    ncrs: { list: { useQuery: () => ({ data: ncrRows(), isLoading: false, error: null, refetch: vi.fn() }) }, create: mutation("createNcr"), transitionStatus: mutation("transition") },
    policy: { effective: { useQuery: () => ({ data: { qcCompletionMode: "block", qcAcceptedCodes: ["A", "B"], materialApprovalMode: "warn", ncrAcceptanceMode: h.ncrMode }, isLoading: false, error: null }) }, set: mutation("saveRules") },
  } };
});

beforeEach(() => { h.language = "en"; h.canWrite = true; h.isManager = true; h.ncrMode = "block"; h.respondResult = {}; for (const key of ["createInspection", "advance", "respond", "createNcr", "transition", "saveRules"] as const) h[key].mockReset(); });
afterEach(cleanup);
const request = (code: string) => document.querySelector(`[data-request="${code}"]`) as HTMLElement;
const ncr = (number: string) => document.querySelector(`[data-ncr="${number}"]`) as HTMLElement;

describe("ProjectQuality — inspection requests", () => {
  it("shows each request with its units, activity, step, age and answer; an accepted answer held back by an open NCR says so", () => {
    render(<ProjectQuality />);
    expect(request("IR-1").textContent).toContain("Units: 12 · WALLS"); expect(request("IR-1").textContent).toContain("Age of the request: 6 d"); expect(request("IR-1").textContent).toContain("Step: Manager approval (2/5)");
    expect(request("IR-3").textContent).toContain("Answer: A · Accepted");
    expect(request("IR-5").textContent).toContain("Answer: C · Not accepted");
    // IR-4 is a B on unit 14, where NCR-1 is open on the same activity: it counts for nothing while the rule is block
    expect(request("IR-4").textContent).toContain("Not accepted"); expect(request("IR-4").textContent).toContain("an open NCR keeps it from counting");
    cleanup(); h.ncrMode = "warn";
    render(<ProjectQuality />);
    expect(request("IR-4").textContent).toContain("Answer: B · Accepted");
  });

  it("filters: awaiting an answer, answered, accepted, not accepted", () => {
    render(<ProjectQuality />);
    const codes = () => Array.from(document.querySelectorAll("[data-request]"), li => li.getAttribute("data-request"));
    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "awaiting" } }); expect(codes()).toEqual(["IR-1", "IR-2"]);
    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "accepted" } }); expect(codes()).toEqual(["IR-3"]);
    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "notAccepted" } }); expect(codes()).toEqual(["IR-4", "IR-5"]);
    fireEvent.change(screen.getByLabelText("Show"), { target: { value: "answered" } }); expect(codes()).toEqual(["IR-3", "IR-4", "IR-5"]);
  });

  it("moves a request along its steps, and only at the result step offers the consultant's answers; a warning about an open NCR is shown", () => {
    render(<ProjectQuality />);
    fireEvent.click(within(request("IR-1")).getByText("Complete this step"));
    expect(h.advance).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", inspectionRequestId: "i1", stepCode: "MANAGER_APPROVAL", outcome: "complete" });
    fireEvent.click(within(request("IR-1")).getByText("Reject the step"));
    expect(h.advance).toHaveBeenLastCalledWith(expect.objectContaining({ outcome: "rejected" }));
    expect(within(request("IR-1")).queryByText("Record the consultant's answer")).toBeNull();
    expect(within(request("IR-2")).queryByText("Complete this step")).toBeNull();
    h.respondResult = { responseCode: "A", warning: "NCR_OPEN", openNcrs: ["NCR-1"] };
    fireEvent.click(within(request("IR-2")).getByText("A — Approved"));
    expect(h.respond).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", inspectionRequestId: "i2", responseCode: "A" });
    expect(screen.getByText("The answer was recorded, but an NCR is open on this cell: NCR-1")).toBeTruthy();
    expect(Array.from(request("IR-2").querySelectorAll("button"), button => button.textContent)).toEqual(["A — Approved", "B — Approved as noted", "C — Revise and resubmit", "UR — Under review"]);
  });

  it("a new request needs known units of one model and an activity of that model", () => {
    render(<ProjectQuality />);
    const create = screen.getByText("Create the request").closest("button") as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("Request code"), { target: { value: "IR-9" } });
    expect(create.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Unit numbers (comma separated)"), { target: { value: "12, 99" } });
    expect(screen.getByText("A unit is not in this project")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Unit numbers (comma separated)"), { target: { value: "12, 21" } });
    expect(screen.getByText("The units are of different models")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Unit numbers (comma separated)"), { target: { value: "12, 13" } });
    const activity = screen.getAllByLabelText("Activity")[0] as HTMLSelectElement;
    expect(Array.from(activity.options).map(option => option.value)).toEqual(["", "a-walls", "a-paint"]);
    expect(create.disabled).toBe(true);
    fireEvent.change(activity, { target: { value: "a-paint" } });
    fireEvent.change(screen.getAllByLabelText("Consultant")[0], { target: { value: "Alpha" } });
    expect(create.disabled).toBe(false);
    fireEvent.click(create);
    expect(h.createInspection).toHaveBeenCalledWith(expect.objectContaining({ requestCode: "IR-9", activityDefinitionId: "a-paint", unitIds: ["u12", "u13"], consultantLabel: "Alpha" }));
  });

  it("a person who may not change quality records sees the list without buttons", () => {
    h.canWrite = false;
    render(<ProjectQuality />);
    expect(screen.getByText("Your role does not allow changing quality records.")).toBeTruthy();
    expect(screen.queryByText("Complete this step")).toBeNull(); expect(screen.queryByText("A — Approved")).toBeNull();
    expect(request("IR-1")).toBeTruthy();
  });
});

describe("ProjectQuality — NCRs and the company's rules", () => {
  const open = (name: RegExp) => fireEvent.click(screen.getByRole("tab", { name }));

  it("lists NCRs with their cell and age, moves them one step at a time and closes from verification", () => {
    render(<ProjectQuality />);
    open(/Non-conformances/);
    expect(ncr("NCR-1").textContent).toContain("Units: 14 · WALLS"); expect(ncr("NCR-1").textContent).toContain("3 d");
    fireEvent.click(within(ncr("NCR-1")).getByText("Move to Under investigation"));
    expect(h.transition).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", ncrId: "n1", nextStatus: "under_investigation" });
    fireEvent.click(within(ncr("NCR-2")).getByText("Close"));
    expect(h.transition).toHaveBeenLastCalledWith({ tenantId: "t", projectId: "p", ncrId: "n2", nextStatus: "closed" });
    expect(within(ncr("NCR-3")).queryByText("Close")).toBeNull(); expect(within(ncr("NCR-3")).queryByText("Cancel")).toBeNull();
  });

  it("creates an NCR on a unit and an activity of its model", () => {
    render(<ProjectQuality />);
    open(/Non-conformances/);
    const create = screen.getAllByText("Create NCR").map(node => node.closest("button")).find(Boolean) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("NCR number"), { target: { value: "NCR-9" } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Misaligned" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Frame is misaligned" } });
    fireEvent.change(screen.getByLabelText("Unit number (optional)"), { target: { value: "99" } });
    expect(create.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Unit number (optional)"), { target: { value: "21" } });
    const activity = screen.getByLabelText("Activity (optional)") as HTMLSelectElement;
    expect(Array.from(activity.options).map(option => option.value)).toEqual(["__none", "b-walls"]);
    fireEvent.change(activity, { target: { value: "b-walls" } });
    expect(create.disabled).toBe(false);
    fireEvent.click(create);
    expect(h.createNcr).toHaveBeenCalledWith(expect.objectContaining({ ncrNumber: "NCR-9", pmcUnitId: "u21", pmcActivityDefinitionId: "b-walls" }));
  });

  it("an NCR with the list back on \"no activity\" sends no activity: the sentinel never reaches the server (D-75 negative)", () => {
    render(<ProjectQuality />);
    open(/Non-conformances/);
    const create = screen.getAllByText("Create NCR").map(node => node.closest("button")).find(Boolean) as HTMLButtonElement;
    fireEvent.change(screen.getByLabelText("NCR number"), { target: { value: "NCR-9" } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Misaligned" } });
    fireEvent.change(screen.getByLabelText("Description"), { target: { value: "Frame is misaligned" } });
    fireEvent.change(screen.getByLabelText("Unit number (optional)"), { target: { value: "99" } });
    expect(create.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Unit number (optional)"), { target: { value: "21" } });
    const activity = screen.getByLabelText("Activity (optional)") as HTMLSelectElement;
    expect(Array.from(activity.options).map(option => option.value)).toEqual(["__none", "b-walls"]);
    fireEvent.change(activity, { target: { value: "b-walls" } });
    fireEvent.change(screen.getByLabelText("Activity (optional)"), { target: { value: "__none" } });
    expect(create.disabled).toBe(false);
    fireEvent.click(create);
    expect(h.createNcr.mock.calls.at(-1)?.[0]).toMatchObject({ ncrNumber: "NCR-9", pmcUnitId: "u21", pmcActivityDefinitionId: undefined });
  });

  it("the rules are shown to everyone and changed only by the company manager", () => {
    render(<ProjectQuality />);
    open(/Company rules/);
    expect((screen.getByLabelText("An open NCR keeps an inspection from being accepted") as HTMLSelectElement).value).toBe("block");
    fireEvent.change(screen.getByLabelText("An open NCR keeps an inspection from being accepted"), { target: { value: "warn" } });
    fireEvent.click(screen.getByLabelText("C — Revise and resubmit"));
    fireEvent.click(screen.getByText("Save the rules"));
    expect(h.saveRules).toHaveBeenCalledWith({ tenantId: "t", qcCompletionMode: "block", qcAcceptedCodes: ["A", "B", "C"], materialApprovalMode: "warn", ncrAcceptanceMode: "warn" });
    cleanup(); h.isManager = false;
    render(<ProjectQuality />);
    open(/Company rules/);
    expect(screen.getByText("Only the company manager changes the rules.")).toBeTruthy();
    expect((screen.getByLabelText("An open NCR keeps an inspection from being accepted") as HTMLSelectElement).disabled).toBe(true);
    expect(screen.queryByText("Save the rules")).toBeNull();
  });

  it.each([["ar", "الجودة", "rtl"], ["en", "Quality", "ltr"], ["ur", "معیار", "rtl"]] as const)("%s: the title and the direction", (language, title, dir) => {
    h.language = language;
    const { container } = render(<ProjectQuality />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(title);
    expect(container.querySelector("main")!.getAttribute("dir")).toBe(dir);
  });
});
