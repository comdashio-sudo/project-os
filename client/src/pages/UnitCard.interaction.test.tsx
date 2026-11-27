/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import UnitCard from "./UnitCard";

const h = vi.hoisted(() => ({ cardExtra: {} as Record<string, unknown>, exported: {} as Record<string, unknown[]>, unitExtra: {} as Record<string, unknown>, language: "en" as "ar" | "en" | "ur", unit: "12", search: "", navigate: vi.fn(), cardInput: vi.fn(), held: false, events: 3 }));
const options = {
  units: [{ id: "u12", number: 12, modelCode: "A", block: "B1", zone: "Z1" }, { id: "u21", number: 21, modelCode: "B", block: "B2", zone: "Z1" }],
  activities: [{ id: "a-walls", modelCode: "A", code: "WALLS", name: "Walls" }, { id: "a-paint", modelCode: "A", code: "PAINT", name: "Paint" }, { id: "b-walls", modelCode: "B", code: "WALLS", name: "Walls" }],
};
const event = (index: number, kind: string, title: string, detail: Record<string, string | number | null>) => ({ kind, at: new Date(Date.UTC(2026, 9, 24 - index)).toISOString(), ref: `r${index}`, title, detail });
const all = () => [
  event(0, "daily_report", "work", { reportStatus: "approved", label: "Walls of unit 12", quantity: null, hours: null, description: "Block work", reportedStatus: "IN_PROGRESS" }),
  event(1, "inspection", "IR-1", { responseCode: "A", consultant: "Alpha" }),
  event(2, "ncr", "NCR-1", { status: "open", summary: "Honeycombing" }),
  event(3, "material_issue", "CEM-1", { description: "Cement bag", quantity: 5, unit: "bag" }),
  event(4, "status_change", "— → IN_PROGRESS", { note: "Daily report 2026-10-20", activityDefinitionId: "a-walls" }),
  event(5, "submittal", "SD-1 r0", { submittalType: "shop_drawing", status: "replied", replyCode: "B", repliedAt: null }),
];
// Q-67 (5): the field bar's villa list reads pmc.progressPicker; these tests keep the typed number it falls back to
vi.mock("@/components/UnitJump", () => ({ UnitJump: ({ fallback }: { fallback: React.ReactNode }) => <>{fallback}</> }));
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: (await import("../test/dsSelectStandIn")).NativeSelect }));
vi.mock("wouter", () => ({ useLocation: () => ["/", h.navigate], useParams: () => ({ tenantId: "t", projectId: "p", unitNumber: h.unit }), useSearch: () => h.search, Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.language === "ar", language: h.language, isRtl: h.language !== "en" }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => null }));
vi.mock("@/components/ExportExcelButton", () => ({ ExportExcelButton: (props: { fileName: string; rows: unknown[] }) => { h.exported[props.fileName] = props.rows; return <button type="button">Export</button>; } }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "localized error" }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  siteReports: { options: { useQuery: () => ({ data: options, isLoading: false, error: null, refetch: vi.fn() }) } },
  pmc: { stalledUnits: { useQuery: () => ({ data: { threshold: 3, longDays: 14, counts: { stalled: 1, long: 0, active: 0 }, rows: [{ unitId: "u12", villa: "12", blockCode: "B1", modelCode: "A", lastMovedOn: "2026-11-01", workingDays: 7, state: "stalled", lastActivity: { code: "WALLS", name: "Walls" }, nextActivity: { code: "PAINT", name: "Paint" } }] }, isError: false, error: null }) }, villaStates: { useQuery: () => ({ data: { villa: "12", modelCode: "A", activities: [{ code: "WALLS", name: "Walls", siteStatus: "COMPLETE", qcReceived: true, qcOn: "2026-11-11" }] }, isError: false, error: null }) } },
  cells: { card: { useQuery: (input: { unitId: string; activityDefinitionId?: string }) => { h.cardInput(input); return { data: { unit: { id: "u12", number: 12, modelCode: "A", block: "B1", zone: "Z1", ...h.unitExtra }, activity: input.activityDefinitionId ? { id: "a-walls", code: "WALLS", name: "Walls" } : null, status: input.activityDefinitionId ? "COMPLETE" : null, qc: input.activityDefinitionId ? { policy: "block", accepted: !h.held, ncrMode: "block", heldByNcr: h.held } : null, openNcrs: 1, events: all().slice(0, h.events), ...h.cardExtra }, isLoading: false, error: null, refetch: vi.fn() }; } } },
} }));

beforeEach(() => { h.cardExtra = {}; h.exported = {}; h.language = "en"; h.unit = "12"; h.search = ""; h.held = false; h.events = 6; h.navigate.mockReset(); h.cardInput.mockReset(); });
afterEach(cleanup);

describe("UnitCard", () => {
  it("Q-70 (4) POSITIVE: the whole villa shows its model's items with status, completion day and QC, the villa's progress, and both tables export as shown; a status change names its activity and who", () => {
    h.cardExtra = { items: [{ code: "WALLS", name: "Walls", weightPercent: 40, status: "COMPLETE", completedOn: "2026-11-20T09:00:00.000Z", qcReceived: true }, { code: "PAINT", name: "Paint", weightPercent: 60, status: "NOT_STARTED", completedOn: null, qcReceived: null }], progressPercent: 40 };
    render(<UnitCard />);
    expect(document.querySelector("[data-villa-progress]")!.textContent).toBe("40.00%");
    const rows = document.querySelectorAll("[data-villa-items] tbody tr");
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain("Received");
    expect(h.exported["villa-12-items"]).toHaveLength(2);
    expect(h.exported["villa-12-timeline"]).toHaveLength(6);
  });

  it("Q-70 (4): a change's note names its source in words — a progress update, never the save's internal identifier", () => {
    h.cardExtra = { events: [event(0, "status_change", "— → COMPLETE", { note: "batch 44444444-4444-4444-8444-444444444444", activityDefinitionId: "a-walls", activity: "WALLS — Walls", by: "Site engineer (synthetic)" })] };
    render(<UnitCard />);
    const item = document.querySelector('[data-kind="status_change"]')!;
    expect(item.textContent).toContain("WALLS — Walls · by Site engineer (synthetic) · Progress update");
    expect(item.textContent).not.toContain("44444444");
  });

  it("Q-70 (4) NEGATIVE: a model whose weights do not total 100 shows no progress number, and says why; one activity shows no items table", () => {
    h.cardExtra = { items: [{ code: "WALLS", name: "Walls", weightPercent: 40, status: "COMPLETE", completedOn: null, qcReceived: null }], progressPercent: null };
    render(<UnitCard />);
    expect(document.querySelector("[data-villa-progress]")!.textContent).toBe("—");
    expect(screen.getByText(/do not total 100/)).toBeTruthy();
    cleanup(); h.cardExtra = { items: null, progressPercent: null }; h.search = "activity=WALLS";
    render(<UnitCard />);
    expect(document.querySelector("[data-villa-items]")).toBeNull();
  });


  it("Q-60: the villa's phase and package from the register, and a mock-up villa marked as such", () => {
    h.unitExtra = { phase: "PH2", package: "Diamond", isMockup: true };
    try {
      render(<UnitCard />);
      expect(document.querySelector("[data-unit-phase]")?.textContent).toMatch(/PH2.*Diamond/);
      expect(document.querySelector("[data-mockup]")).toBeTruthy();
    } finally { h.unitExtra = {}; }
  });

  it("Q-60 NEGATIVE: a villa without them shows «—», and no mock-up mark", () => {
    h.unitExtra = { phase: null, package: null, isMockup: null };
    try {
      render(<UnitCard />);
      expect(document.querySelector("[data-unit-phase]")?.textContent).toContain("— / —");
      expect(document.querySelector("[data-mockup]")).toBeNull();
    } finally { h.unitExtra = {}; }
  });

  it("shows the unit's one timeline, newest first, every kind in words, and no money", () => {
    const { container } = render(<UnitCard />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Unit card 12");
    const items = Array.from(container.querySelectorAll("[data-kind]"));
    expect(items.map(item => item.getAttribute("data-kind"))).toEqual(["daily_report", "inspection", "ncr", "material_issue", "status_change", "submittal"]);
    expect(items[0].textContent).toContain("Daily report · work"); expect(items[0].textContent).toContain("Walls of unit 12"); expect(items[0].textContent).toContain("In progress");
    expect(items[1].textContent).toContain("Answer: A"); expect(items[1].textContent).toContain("Consultant: Alpha");
    expect(items[3].textContent).toContain("Quantity: 5 bag");
    expect(items[5].textContent).toContain("Reply: B");
    expect(container.textContent).not.toMatch(/cost|price|amount/i);
    expect(h.cardInput).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", unitId: "u12", activityDefinitionId: undefined });
  });

  it("a kind filter narrows the timeline; with no events it says so", () => {
    const { container } = render(<UnitCard />);
    fireEvent.change(screen.getByLabelText("Kind"), { target: { value: "ncr" } });
    expect(container.querySelectorAll("[data-kind]")).toHaveLength(1);
    cleanup(); h.events = 0;
    render(<UnitCard />);
    expect(screen.getByText("No events yet for this unit.")).toBeTruthy();
  });

  it("choosing an activity asks the card for that cell (only the unit's model is offered) and shows its status and quality", () => {
    const first = render(<UnitCard />);
    const select = screen.getByLabelText("Activity") as HTMLSelectElement;
    expect(Array.from(select.options).map(option => option.value)).toEqual(["__all", "WALLS", "PAINT"]);
    fireEvent.change(select, { target: { value: "WALLS" } });
    expect(h.navigate).toHaveBeenCalledWith("/m/t/p/unit/12?activity=WALLS");
    first.unmount(); h.search = "activity=WALLS";
    render(<UnitCard />);
    expect(h.cardInput).toHaveBeenLastCalledWith({ tenantId: "t", projectId: "p", unitId: "u12", activityDefinitionId: "a-walls" });
    const cell = document.querySelector("[data-cell-status]") as HTMLElement;
    expect(document.querySelector("[data-stall-badge]")!.textContent).toBe("Stalled: 7 working days without movement · Next activity: Paint");
    expect(cell.textContent).toContain("Status: Complete"); expect(cell.textContent).toContain("Quality: Inspection accepted"); expect(cell.textContent).toContain("QC receipt: Received · 2026-11-11"); expect(cell.textContent).toContain("Completion rule: Block"); expect(cell.textContent).toContain("NCR rule: Block");
  });

  it("says plainly when an accepted inspection is held back by an open NCR", () => {
    h.search = "activity=WALLS"; h.held = true;
    render(<UnitCard />);
    expect((document.querySelector("[data-cell-status]") as HTMLElement).textContent).toContain("No accepted inspection");
    expect(screen.getByRole("note").textContent).toContain("an open NCR keeps it from counting");
  });

  it("a number that is not a unit of this project is said so and asks nothing of the server", () => {
    h.unit = "999";
    render(<UnitCard />);
    expect(screen.getByRole("alert").textContent).toContain("No unit with that number");
    expect(h.cardInput).toHaveBeenCalledWith(expect.objectContaining({ unitId: "" })); // the query is disabled; the empty id is never sent
  });

  it.each([["ar", "بطاقة الوحدة 12", "rtl"], ["en", "Unit card 12", "ltr"], ["ur", "یونٹ کارڈ 12", "rtl"]] as const)("%s: the title and the direction", (language, title, dir) => {
    h.language = language;
    const { container } = render(<UnitCard />);
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(title);
    expect(container.querySelector("main")!.getAttribute("dir")).toBe(dir);
  });
});
