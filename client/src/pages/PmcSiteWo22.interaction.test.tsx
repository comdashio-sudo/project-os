/** @vitest-environment jsdom */
// Work order 22 screens: the site update from the phone shows the server's refusal villa by villa and sends the right shape; the comparison acts only on the kind each action is for.
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ update: vi.fn(), act: vi.fn(), saveNote: vi.fn(), updateError: null as unknown, canAct: true }));
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
    activities: { useQuery: h.ok([{ id: "00000000-0000-4000-8000-0000000000aa", code: "S-1", csiName: "Civil", subName: null, name: "Block walls", weight: 0.1, modelCodesJson: null, sortOrder: 1, modelCodes: null, links: [{ activityCode: "A1", score: 0.9, confirmed: false }] }]) },
    update: { useMutation: (options: { onError?: (error: unknown) => void }) => ({ isPending: false, mutate: (input: unknown) => { state.update(input); if (state.updateError) options.onError?.(state.updateError); } }) },
    percentages: { useQuery: h.ok({ project: h.shares, byZone: [{ key: "Z1", ...h.shares }], byBlock: [{ key: "B1", ...h.shares }], byUnit: [], readiness: { siteActivities: 1, confirmedLinks: 1, consultantColumns: 1, unlinkedColumns: 0 } }) },
    comparison: { useQuery: h.ok({ summary: [{ section: "Civil", compared: 4, bothDone: 1, neither: 1, siteDoneNotReceived: 1, receivedNotDone: 1 }], notCompared: 0, totals: { siteDoneNotReceived: 1, receivedNotDone: 1 }, total: 2, rows: [h.row("268", "site_done_not_received"), h.row("270", "received_not_done")], readiness: {} }) },
    act: { useMutation: () => ({ isPending: false, variables: undefined, mutate: state.act }) },
    saveNote: { useMutation: () => ({ isPending: false, mutate: state.saveNote }) },
  },
} }));

import PmcSiteUpdate, { issuesOf, siteTodayInBrowser } from "./PmcSiteUpdate";
import PmcSiteConsultant, { curvePath, itemsForAction } from "./PmcSiteConsultant";

afterEach(() => { cleanup(); vi.clearAllMocks(); state.updateError = null; state.canAct = true; });

describe("site update from the phone", () => {
  it("reads the refusal details and the site's day", () => {
    expect(issuesOf({ data: { issues: [{ code: "SITE_VILLA_UNKNOWN", villa: "999" }, { nope: 1 }] } })).toEqual([{ code: "SITE_VILLA_UNKNOWN", villa: "999" }]);
    expect(issuesOf(new Error("x"))).toEqual([]);
    expect(siteTodayInBrowser(new Date("2026-10-27T22:30:00Z"))).toBe("2026-10-28");
  });

  it("keeps Save disabled until an activity is chosen, whatever villas are typed", () => {
    render(<PmcSiteUpdate />);
    // the activity is chosen through the list's own value (Radix needs pointer events jsdom lacks); the rest is typed
    fireEvent.click(screen.getByRole("radio", { name: "Range" }));
    fireEvent.change(screen.getByLabelText(/^Range/), { target: { value: "268-272" } });
    const save = screen.getByRole("button", { name: "Save" });
    expect((save as HTMLButtonElement).disabled).toBe(true);
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

  it("without the update permission there is no selection and no action", () => {
    state.canAct = false;
    render(<PmcSiteConsultant />);
    expect(screen.queryByRole("button", { name: "Create inspection request" })).toBeNull();
    expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
  });
});
