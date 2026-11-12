// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Q-5: the QC engineer's receipts. Synthetic data only.
const h = vi.hoisted(() => ({ mutate: vi.fn(), result: undefined as unknown, error: null as unknown, options: {} as { onError?: (error: unknown) => void } }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useParams: () => ({ tenantId: "t", projectId: "p" }), useLocation: () => ["/", vi.fn()] }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => null }));
vi.mock("@/lib/permissions", () => ({ WriteGate: ({ children }: { children: React.ReactNode }) => <>{children}</>, useCan: () => true }));
vi.mock("@/components/ds/Feedback", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds/Feedback")>()), Toaster: () => null, notify: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
// the design system's list opens a Radix popover; a native select with the same props reads in jsdom
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: ({ id, options, value, onValueChange }: { id?: string; options: Array<{ value: string; label: string; description?: string }>; value?: string; onValueChange: (value: string) => void }) => (
  <select id={id} aria-label="Activity" value={value ?? ""} onChange={event => onValueChange(event.target.value)}><option value="" />{options.map(option => <option key={option.value} value={option.value}>{`${option.label} — ${option.description ?? ""}`}</option>)}</select>
) }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  pmc: {
    progressActivities: { useQuery: () => ({ data: [{ code: "FOOT", name: "Footings", section: "03 Concrete", minWeight: 40, maxWeight: 40 }], isLoading: false, error: null }) },
    qcHistory: { useQuery: () => ({ data: [{ at: "2026-11-11T09:00:00Z", on: "2026-11-11", from: null, to: true, by: "QC Engineer", unitNumber: 3, villaLabel: null, activityCode: "FOOT", activityName: "Footings" }], error: null, refetch: vi.fn() }) },
    qcCounters: { useQuery: () => ({ data: [{ code: "FOOT", name: "Footings", received: 1, total: 4, notReceived: 3 }], error: null, refetch: vi.fn() }) },
    updateQcReceipts: { useMutation: (options: { onError?: (error: unknown) => void }) => { h.options = options; return { mutate: h.mutate, isPending: false, data: h.result }; } },
  },
} }));

import PmcQcReceipt from "./PmcQcReceipt";

beforeEach(() => { h.mutate.mockReset(); h.result = undefined; });
afterEach(() => cleanup());

describe("PmcQcReceipt (Q-5)", () => {
  it("one save sends the activity, the villas, «received» and the date", () => {
    render(<PmcQcReceipt />);
    fireEvent.change(screen.getByRole("combobox", { name: "Activity" }), { target: { value: "FOOT" } });
    fireEvent.change(screen.getByLabelText(/^Villa numbers/), { target: { value: "1, 3" } });
    fireEvent.click(screen.getByRole("radio", { name: "Not received" }));
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    expect(h.mutate).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t", projectId: "p", activityCode: "FOOT", villas: ["1", "3"], received: false }));
  });

  it("a refusal lists each wrong villa", () => {
    render(<PmcQcReceipt />);
    act(() => { h.options.onError?.({ data: { issues: [{ code: "SITE_VILLA_UNKNOWN", villa: "999" }] } }); });
    expect(screen.getByRole("alert").textContent).toContain("999");
  });

  it("the counters per activity, the warning for a villa not complete on site, and the history (who, when, from → to)", () => {
    h.result = { changed: 2, unchanged: 0, villas: ["1", "3"], warnings: [{ code: "QC_NOT_COMPLETE_ON_SITE", villas: ["3"] }] };
    render(<PmcQcReceipt />);
    expect(document.querySelector("[data-qc-counters]")!.textContent).toContain("Received: 1");
    expect(document.querySelector("[data-qc-counters]")!.textContent).toContain("Not received: 3");
    expect(document.querySelector("[data-qc-warning]")!.textContent).toContain("3");
    expect(document.querySelector("[data-qc-history]")!.textContent).toMatch(/Villa 3 · Footings · — → Received · 2026-11-11 · by QC Engineer/);
  });
});
