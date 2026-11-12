// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Q-4: the site engineer's progress update on the weights table. Synthetic data only.
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
    progressHistory: { useQuery: () => ({ data: [{ at: "2026-11-11T09:00:00Z", from: null, to: "COMPLETE", by: "Site Engineer", unitNumber: 3, villaLabel: null, activityCode: "FOOT", activityName: "Footings" }], error: null, refetch: vi.fn() }) },
    updateProgress: { useMutation: (options: { onError?: (error: unknown) => void }) => { h.options = options; return { mutate: h.mutate, isPending: false, data: h.result }; } },
  },
} }));

import PmcProgressUpdate from "./PmcProgressUpdate";

beforeEach(() => { h.mutate.mockReset(); h.result = undefined; });
afterEach(() => cleanup());

describe("PmcProgressUpdate (Q-4)", () => {
  it("the activity comes from the weights table with its section and weight; one save sends the activity, the villas, the status and the date", () => {
    render(<PmcProgressUpdate />);
    expect(document.body.textContent).toContain("03 Concrete · Weight 40.00%");
    fireEvent.change(screen.getByRole("combobox", { name: "Activity" }), { target: { value: "FOOT" } });
    fireEvent.change(screen.getByLabelText(/^Villa numbers/), { target: { value: "1, 3" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    expect(h.mutate).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t", projectId: "p", activityCode: "FOOT", villas: ["1", "3"], status: "COMPLETE" }));
  });

  it("a refusal lists each wrong villa in the page's language", () => {
    render(<PmcProgressUpdate />);
    act(() => { h.options.onError?.({ data: { issues: [{ code: "SITE_VILLA_UNKNOWN", villa: "999" }, { code: "SITE_DATE_IN_FUTURE", detail: "2099-01-01" }] } }); });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("999");
  });

  it("after the save the villas' and the project's progress are shown, and the history says who, when, from and to", () => {
    h.result = { changed: 2, unchanged: 0, projectProgressPercent: 20, villas: [{ villa: "1", progressPercent: 40 }, { villa: "3", progressPercent: 40 }] };
    render(<PmcProgressUpdate />);
    const result = document.querySelector("[data-progress-result]")!;
    expect(result.textContent).toContain("Project progress: 20.00%");
    expect(result.textContent).toContain("Villa 3: 40.00%");
    expect(document.querySelector("[data-progress-history]")!.textContent).toMatch(/Villa 3 · Footings · — → Complete · 2026-11-11 · by Site Engineer/);
  });
});
