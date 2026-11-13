/** @vitest-environment jsdom */
// Work order 22 screens: the site update from the phone shows the server's refusal villa by villa and sends the right shape; the comparison acts only on the kind each action is for.
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ update: vi.fn(), act: vi.fn(), saveNote: vi.fn(), updateError: null as unknown, canAct: true, noDifferences: false, noActivities: false, curve: null as unknown }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useParams: () => ({ tenantId: "t", projectId: "p" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false }) }));
vi.mock("@/lib/permissions", () => ({ WriteGate: ({ children }: { children: React.ReactNode }) => <>{children}</>, useCan: () => state.canAct }));
vi.mock("@/components/ds/Feedback", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds/Feedback")>()), Toaster: () => null, notify: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));

const h = vi.hoisted(() => {
  const ok = (data: unknown) => () => ({ isLoading: false, error: null, data });
  const shares = { units: 2, site: 0.5, consultant: 0.25, monthly: 0.4, siteMinusConsultant: 0.25, siteMinusMonthly: 0.1, consultantMinusMonthly: -0.15 };
  const row = (villa: string, kind: string) => ({ unitId: `00000000-0000-4000-8000-00000000000${villa.slice(-1)}`, activityCode: "A1", zone: "Z1", block: "B1", villa, modelCode: "R1", section: "Civil", wir: "101", siteActivity: "Walls", consultantActivity: "Walls — GF", siteStatus: "DONE", doneOn: "2026-10-01", consultantStatus: kind === "site_done_not_received" ? "NOT_RECEIVED" : "RECEIVED", firstReceivedOn: null, kind, ageDays: 5, note: null });
  return { ok, shares, row };
});
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ pmcSite: new Proxy({}, { get: () => ({ invalidate: () => Promise.resolve() }) }) }),
  pmcSite: {
    activities: { useQuery: () => ({ isLoading: false, error: null, data: state.noActivities ? [] : [{ id: "00000000-0000-4000-8000-0000000000aa", code: "S-1", csiName: "Civil", subName: null, name: "Block walls", weight: 0.1, modelCodesJson: null, sortOrder: 1, modelCodes: null, links: [{ activityCode: "A1", score: 0.9, confirmed: false }] }] }) },
    update: { useMutation: (options: { onError?: (error: unknown) => void }) => ({ isPending: false, mutate: (input: unknown) => { state.update(input); if (state.updateError) options.onError?.(state.updateError); } }) },
    percentages: { useQuery: h.ok({ project: h.shares, byZone: [{ key: "Z1", ...h.shares }], byBlock: [{ key: "B1", ...h.shares }], byUnit: [], readiness: { siteActivities: 1, confirmedLinks: 1, consultantColumns: 1, unlinkedColumns: 0 } }) },
    comparison: { useQuery: () => ({ isLoading: false, error: null, data: state.noDifferences ? { summary: [], notCompared: 0, totals: { siteDoneNotReceived: 0, receivedNotDone: 0 }, total: 0, rows: [], readiness: {} } : { summary: [{ section: "Civil", compared: 4, bothDone: 1, neither: 1, siteDoneNotReceived: 1, receivedNotDone: 1 }], notCompared: 0, totals: { siteDoneNotReceived: 1, receivedNotDone: 1 }, total: 2, rows: [h.row("268", "site_done_not_received"), h.row("270", "received_not_done")], readiness: {} } }) },
    curve: { useQuery: () => ({ isLoading: false, error: null, data: state.curve }) },
    act: { useMutation: () => ({ isPending: false, variables: undefined, mutate: state.act }) },
    saveNote: { useMutation: () => ({ isPending: false, mutate: state.saveNote }) },
  },
} }));

import PmcSiteUpdate, { issuesOf, siteTodayInBrowser } from "./PmcSiteUpdate";
import PmcSiteConsultant, { curvePath, itemsForAction } from "./PmcSiteConsultant";

afterEach(() => { cleanup(); vi.clearAllMocks(); state.updateError = null; state.canAct = true; state.noDifferences = false; state.noActivities = false; state.curve = null; });

describe("site update from the phone", () => {
  it("reads the refusal details and the site's day", () => {
    expect(issuesOf({ data: { issues: [{ code: "SITE_VILLA_UNKNOWN", villa: "999" }, { nope: 1 }] } })).toEqual([{ code: "SITE_VILLA_UNKNOWN", villa: "999" }]);
    expect(issuesOf(new Error("x"))).toEqual([]);
    expect(siteTodayInBrowser(new Date("2026-10-27T22:30:00Z"))).toBe("2026-10-28");
  });

  it("D-59: with no site activities yet the screen says so and offers the next step — the import of the site workbook — not a dead empty list", () => {
    state.noActivities = true;
    const { unmount } = render(<PmcSiteUpdate />);
    const next = document.querySelector("[data-empty-next]")!;
    expect(next.textContent).toContain("No site activities yet");
    expect(within(next as HTMLElement).getByRole("link", { name: "Import the site workbook" }).getAttribute("href")).toBe("/projects/t/p/pmc?tab=import");
    unmount();
    state.noActivities = false;
    render(<PmcSiteUpdate />);
    expect(document.querySelector("[data-empty-next]")).toBeNull();
  });

  it("keeps Save disabled until an activity is chosen, whatever villas are typed", () => {
    render(<PmcSiteUpdate />);
    // the activity is chosen through the list's own value (Radix needs pointer events jsdom lacks); the rest is typed
    fireEvent.click(screen.getByRole("radio", { name: "Range" }));
    fireEvent.change(screen.getByLabelText(/^Range/), { target: { value: "268-272" } });
    const save = screen.getByRole("button", { name: "Save" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
  });


  it("draws the five statuses as a grid of 44px choices, not one squeezed strip", () => {
    render(<PmcSiteUpdate />);
    const group = screen.getByRole("radiogroup", { name: "Status" });
    expect(group.className).toContain("grid");
    expect(within(group).getAllByRole("radio")).toHaveLength(5);
    for (const radio of within(group).getAllByRole("radio")) expect(radio.className).toContain("min-h-11");
  });

  it("opens on a typed list of villas and the status Done", () => {
    render(<PmcSiteUpdate />);
    expect(screen.getByLabelText(/^Villa numbers/)).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Done" }).getAttribute("aria-checked")).toBe("true");
  });
});

describe("site ↔ consultant comparison", () => {
  it("picks for each action only the kind it is for", () => {
    const rows = [{ unitId: "u1", activityCode: "A", kind: "site_done_not_received" as const }, { unitId: "u2", activityCode: "A", kind: "received_not_done" as const }];
    const selected = new Set(["u1|A", "u2|A"]);
    expect(itemsForAction(rows, selected, "create_inspection")).toEqual([{ unitId: "u1", activityCode: "A" }]);
    expect(itemsForAction(rows, selected, "update_site")).toEqual([{ unitId: "u2", activityCode: "A" }]);
  });

  it("draws the curve with gaps where there is no value", () => {
    expect(curvePath([0, 0.5, null, 1], 300, 100)).toBe("M0,100 L100,50 M300,0");
  });

  it("shows the three percentages, the summary and both kinds; a bulk inspection request goes only to the finished-on-site difference", () => {
    render(<PmcSiteConsultant />);
    expect(screen.getByTestId("percent-site").textContent).toContain("50.00%");
    expect(screen.getByTestId("percent-consultant").textContent).toContain("25.00%");
    expect(screen.getByTestId("percent-monthly").textContent).toContain("40.00%");
    const list = screen.getByRole("table", { name: "Differences" });
    expect(within(list).getAllByRole("row")).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Select shown" }));
    expect(screen.getByText("2 selected")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Create inspection request" }));
    expect(state.act).toHaveBeenCalledWith(expect.objectContaining({ action: "create_inspection", items: [{ unitId: "00000000-0000-4000-8000-000000000008", activityCode: "A1" }] }));
    fireEvent.click(screen.getByRole("button", { name: "Update site status" }));
    expect(state.act).toHaveBeenLastCalledWith(expect.objectContaining({ action: "update_site", items: [{ unitId: "00000000-0000-4000-8000-000000000000", activityCode: "A1" }] }));
  });

  it("saves a site note when the field is left", () => {
    render(<PmcSiteConsultant />);
    const note = screen.getByLabelText("Site note 268");
    fireEvent.change(note, { target: { value: "waiting for the subcontractor" } });
    fireEvent.blur(note);
    expect(state.saveNote).toHaveBeenCalledWith(expect.objectContaining({ unitId: "00000000-0000-4000-8000-000000000008", activityCode: "A1", note: "waiting for the subcontractor" }));
  });

  it("selects a row through the 44px ds checkbox, and the bulk buttons are full-size", () => {
    render(<PmcSiteConsultant />);
    const box = screen.getByRole("checkbox", { name: "268 Walls" });
    expect(box.closest("label")?.className).toContain("min-h-11");
    fireEvent.click(box);
    expect(screen.getByText("1 selected")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Create inspection request" }).className).toContain("min-h-11");
  });

  it("without the update permission there is no selection and no action", () => {
    state.canAct = false;
    render(<PmcSiteConsultant />);
    expect(screen.queryByRole("button", { name: "Create inspection request" })).toBeNull();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});

describe("site ↔ consultant screen at a phone's width (design review of #215)", () => {
  it("draws the four tabs and the zone/block switch as grids of 44px choices", () => {
    render(<PmcSiteConsultant />);
    const tabs = screen.getByRole("radiogroup", { name: "Site ↔ consultant ↔ monthly report" });
    expect(tabs.className).toContain("grid-cols-2");
    expect(tabs.className).toContain("sm:grid-cols-4");
    expect(within(tabs).getAllByRole("radio")).toHaveLength(4);
    for (const radio of within(tabs).getAllByRole("radio")) expect(radio.className).toContain("min-h-11");
    const levels = screen.getByRole("radiogroup", { name: "By zone" });
    expect(within(levels).getAllByRole("radio")).toHaveLength(2);
    for (const radio of within(levels).getAllByRole("radio")) expect(radio.className).toContain("min-h-11");
  });

  it("with no differences and no filter, says why and offers the site update as the next step", () => {
    state.noDifferences = true;
    render(<PmcSiteConsultant />);
    expect(screen.getByText(/agree on everything compared/)).toBeTruthy();
    const list = screen.getByRole("table", { name: "Differences" });
    expect(within(list).getByRole("link", { name: "Update site progress" }).getAttribute("href")).toBe("/m/t/p/site-update");
  });

  it("the S-curve without a plan links to the import, and with a plan writes its axis labels as page text", () => {
    state.curve = { points: [], deviationToDate: null };
    render(<PmcSiteConsultant />);
    fireEvent.click(screen.getByRole("radio", { name: "S-curve" }));
    expect(screen.getByRole("link", { name: "Import the site workbook" }).getAttribute("href")).toBe("/projects/t/p/pmc?tab=import");
    cleanup();
    state.curve = { points: [{ month: "2026-01-31", plannedCumulative: 0.1, actualCumulative: 0.05, deviation: -0.05 }, { month: "2026-06-30", plannedCumulative: 1, actualCumulative: null, deviation: null }], deviationToDate: -0.05 };
    render(<PmcSiteConsultant />);
    fireEvent.click(screen.getByRole("radio", { name: "S-curve" }));
    for (const id of ["axis-y-0", "axis-y-50", "axis-y-100", "axis-x-first", "axis-x-last"]) expect(screen.getByTestId(id).tagName).toBe("SPAN");
    expect(screen.getByTestId("axis-y-100").textContent).toBe("100%");
    expect(screen.getByTestId("axis-x-last").textContent).toBe("2026-06");
  });

  it("renders no <main> of its own when the page sits in the product frame", async () => {
    const { InShellProvider } = await import("@/components/pageFrame");
    const { container } = render(<InShellProvider><PmcSiteConsultant /></InShellProvider>);
    expect(container.querySelector("main")).toBeNull();
  });
});
