// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safetyRates } from "@shared/safetyIndicators";

// Q-28 (P-118): the safety page shows the server's rates (never its own), the permits with their state, the incident register, and sends exactly what was
// entered; the forms show only to a writer. Synthetic data only.
const h = vi.hoisted(() => ({ canWrite: true, record: vi.fn(), update: vi.fn(), issue: vi.fn(), close: vi.fn(), data: undefined as unknown }));
vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "t", projectId: "p" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
vi.mock("@/lib/permissions", () => ({ WriteGate: ({ children }: { children: React.ReactNode }) => (h.canWrite ? <>{children}</> : null), useCan: () => h.canWrite }));
vi.mock("@/lib/trpc", () => ({ trpc: { safety: {
  register: { useQuery: () => ({ data: h.data, isLoading: false, error: null, refetch: vi.fn() }) },
  recordIncident: { useMutation: () => ({ mutate: h.record, isPending: false, error: null }) },
  updateIncident: { useMutation: () => ({ mutate: h.update, isPending: false, error: null }) },
  issuePermit: { useMutation: () => ({ mutate: h.issue, isPending: false, error: null }) },
  closePermit: { useMutation: () => ({ mutate: h.close, isPending: false, error: null }) },
} } }));

import ProjectSafety from "./ProjectSafety";

const incidents = [
  { id: "i1", incidentNumber: "I-01", occurredOn: "2026-11-03", kind: "lost_time" as const, title: "Fall from ladder (synthetic)", description: "d", location: "Block A", peopleInvolved: 1, lostDays: 3, rootCause: null, correctiveAction: null, status: "open", reportedBy: "HSE (synthetic)" },
  { id: "i2", incidentNumber: "I-02", occurredOn: "2026-11-04", kind: "near_miss" as const, title: "Dropped tool (synthetic)", description: "d", location: null, peopleInvolved: 0, lostDays: 0, rootCause: null, correctiveAction: "Toolbox talk", status: "closed", reportedBy: "HSE (synthetic)" },
];
const permits = [
  { id: "p1", permitNumber: "PTW-1", permitType: "hot_work", description: "Welding (synthetic)", location: null, responsibleParty: null, validFrom: "2026-11-01T06:00:00Z", validTo: "2026-11-01T14:00:00Z", state: "expired", closeNote: null },
  { id: "p2", permitNumber: "PTW-2", permitType: "work_at_height", description: "Scaffold (synthetic)", location: null, responsibleParty: null, validFrom: "2026-11-02T06:00:00Z", validTo: "2026-11-02T14:00:00Z", state: "closed", closeNote: "Done" },
];
beforeEach(() => {
  h.canWrite = true; h.record.mockReset(); h.update.mockReset(); h.issue.mockReset(); h.close.mockReset();
  h.data = { period: { from: null, to: "2026-11-20" }, incidents, permits, rates: { ...safetyRates({ incidents, manHours: 500 }), daysWithoutHours: 1, reports: 2 } };
});
afterEach(() => cleanup());

describe("ProjectSafety (Q-28, P-118)", () => {
  it("the indicators are the server's: LTIFR 2,000 and TRIR 400 on 500 man-hours, the reports they come from, the uncounted report, and the incidents by kind", () => {
    render(<ProjectSafety />);
    expect(document.querySelector("[data-ltifr]")!.textContent).toBe("2,000");
    expect(document.querySelector("[data-trir]")!.textContent).toBe("400");
    expect(document.querySelector("[data-man-hours]")!.textContent).toBe("500");
    expect(screen.getByText("From 2 approved daily reports")).toBeTruthy();
    expect(document.querySelector("[data-days-without-hours]")!.textContent).toContain("1 reports");
    expect(document.querySelector('[data-kind="lost_time"]')!.textContent).toContain("1");
    expect(document.querySelector('[data-kind="fatality"]')!.textContent).toContain("0");
  });

  it("NEGATIVE: with no man-hours the rates read «—», never 0", () => {
    h.data = { period: { from: null, to: "2026-11-20" }, incidents, permits, rates: { ...safetyRates({ incidents, manHours: 0 }), daysWithoutHours: 0, reports: 0 } };
    render(<ProjectSafety />);
    expect(document.querySelector("[data-ltifr]")!.textContent).toBe("—");
    expect(document.querySelector("[data-trir]")!.textContent).toBe("—");
  });

  it("recording an incident sends exactly what was entered; lost days are asked only for a lost-time injury or a fatality", () => {
    render(<ProjectSafety />);
    fireEvent.click(screen.getByRole("radio", { name: "Incidents" }));
    fireEvent.click(screen.getByRole("button", { name: "Record an incident" }));
    const form = document.querySelector("[data-incident-form]") as HTMLElement;
    expect(within(form).queryByLabelText("Lost workdays")).toBeNull(); // near miss by default
    fireEvent.change(within(form).getByLabelText(/^Number/), { target: { value: "I-03" } });
    fireEvent.change(within(form).getByLabelText(/^Date/), { target: { value: "2026-11-05" } });
    fireEvent.change(within(form).getByLabelText(/^Title/), { target: { value: "Slip on wet floor (synthetic)" } });
    fireEvent.change(within(form).getByLabelText(/^Description/), { target: { value: "Synthetic description" } });
    fireEvent.click(within(form).getByRole("button", { name: "Save" }));
    expect(h.record).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", incidentNumber: "I-03", occurredOn: "2026-11-05", kind: "near_miss", title: "Slip on wet floor (synthetic)", description: "Synthetic description", location: undefined, peopleInvolved: 0, lostDays: 0 });
  });

  it("an open incident is investigated or closed with its corrective action; a closed one has no buttons", () => {
    render(<ProjectSafety />);
    fireEvent.click(screen.getByRole("radio", { name: "Incidents" }));
    const open = document.querySelector('[data-incident="I-01"]') as HTMLElement;
    fireEvent.click(within(open).getByRole("button", { name: "Start investigation" }));
    expect(h.update).toHaveBeenCalledWith(expect.objectContaining({ incidentId: "i1", status: "investigating" }));
    fireEvent.click(within(open).getByRole("button", { name: "Close the incident" }));
    const submit = within(open.querySelector("[data-incident-close]") as HTMLElement).getByRole("button", { name: "Close the incident" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true); // no corrective action yet
    fireEvent.change(within(open).getByLabelText(/^Corrective action/), { target: { value: "Ladder inspection added" } });
    fireEvent.click(submit);
    expect(h.update).toHaveBeenLastCalledWith(expect.objectContaining({ incidentId: "i1", status: "closed", correctiveAction: "Ladder inspection added" }));
    expect(within(document.querySelector('[data-incident="I-02"]') as HTMLElement).queryByRole("button")).toBeNull();
  });

  it("permits show their state; an expired one can still be closed with a note; a closed one cannot", () => {
    render(<ProjectSafety />);
    fireEvent.click(screen.getByRole("radio", { name: "Permits to work" }));
    const expired = document.querySelector('[data-permit="PTW-1"]') as HTMLElement;
    expect(expired.querySelector("[data-state]")!.getAttribute("data-state")).toBe("expired");
    fireEvent.click(within(expired).getByRole("button", { name: "Close the permit" }));
    fireEvent.change(within(expired).getByLabelText(/^Note/), { target: { value: "Work finished" } });
    fireEvent.click(within(expired.querySelector("[data-permit-close]") as HTMLElement).getByRole("button", { name: "Close the permit" }));
    expect(h.close).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", permitId: "p1", outcome: "closed", note: "Work finished" });
    expect(within(document.querySelector('[data-permit="PTW-2"]') as HTMLElement).queryByRole("button")).toBeNull();
  });

  it("NEGATIVE: without project.hse.manage there is no record, investigate, close or issue button", () => {
    h.canWrite = false;
    render(<ProjectSafety />);
    fireEvent.click(screen.getByRole("radio", { name: "Incidents" }));
    expect(screen.queryByRole("button", { name: "Record an incident" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Start investigation" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: "Permits to work" }));
    expect(screen.queryByRole("button", { name: "Issue a permit" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Close the permit" })).toBeNull();
  });
});
