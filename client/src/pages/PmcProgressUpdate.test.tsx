// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Q-4: the site engineer's progress update on the weights table. Synthetic data only.
const h = vi.hoisted(() => ({ send: vi.fn(), mutate: vi.fn(), result: undefined as unknown, error: null as unknown, options: {} as { onError?: (error: unknown) => void; onSuccess?: (result: unknown) => void }, undo: vi.fn() }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useParams: () => ({ tenantId: "t", projectId: "p" }), useLocation: () => ["/", vi.fn()] }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => null }));
vi.mock("@/lib/permissions", () => ({ useCanPage: () => true, WriteGate: ({ children }: { children: React.ReactNode }) => <>{children}</>, useCan: () => true }));
vi.mock("@/components/ds/Feedback", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds/Feedback")>()), Toaster: () => null, notify: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
// the design system's list opens a Radix popover; a native select with the same props reads in jsdom
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: ({ id, options, value, onValueChange }: { id?: string; options: Array<{ value: string; label: string; description?: string }>; value?: string; onValueChange: (value: string) => void }) => (
  <select id={id} aria-label="Activity" value={value ?? ""} onChange={event => onValueChange(event.target.value)}><option value="" />{options.map(option => <option key={option.value} value={option.value}>{`${option.label} — ${option.description ?? ""}`}</option>)}</select>
) }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  // Q-24: the screen keeps a save offline under the signed-in person; the sender is the tRPC client
  auth: { me: { useQuery: () => ({ data: { id: 7 }, isLoading: false, error: null }) } },
  useUtils: () => ({ client: { pmc: { updateProgress: { mutate: h.send } } } }),
  pmc: {
    progressActivities: { useQuery: () => ({ data: [{ code: "FOOT", name: "Footings", section: "03 Concrete", minWeight: 40, maxWeight: 40 }], isLoading: false, error: null }) },
    progressHistory: { useQuery: () => ({ data: [{ at: "2026-11-11T09:00:00Z", from: null, to: "COMPLETE", by: "Site Engineer", unitNumber: 3, villaLabel: null, activityCode: "FOOT", activityName: "Footings" }], error: null, refetch: vi.fn() }) },
    undoProgressBatch: { useMutation: () => ({ mutate: h.undo, isPending: false, error: null }) },
    updateProgress: { useMutation: (options: { onError?: (error: unknown) => void; onSuccess?: (result: unknown) => void }) => { h.options = options; return { mutate: h.mutate, isPending: false, data: h.result }; } },
  },
} }));

import PmcProgressUpdate from "./PmcProgressUpdate";

beforeEach(() => { h.mutate.mockReset(); h.send.mockReset(); h.result = undefined; try { localStorage.clear(); } catch { /* none */ } });
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
  it("Q-44: after a save, «Undo this save» is offered and sends that save's batch", () => {
    render(<PmcProgressUpdate />);
    expect(screen.queryByRole("button", { name: "Undo this save" })).toBeNull();
    act(() => { h.options.onSuccess?.({ batchId: "44444444-4444-4444-8444-444444444444", changed: 2, unchanged: 0, villas: [], warnings: [], projectProgressPercent: 0 }); });
    fireEvent.click(screen.getByRole("button", { name: "Undo this save" }));
    expect(h.undo).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", batchId: "44444444-4444-4444-8444-444444444444" });
  });

  // Q-24 (P-120): offline, the save is kept on the phone (with when it was kept and its own identifier) and sent when asked / back online; a refusal the
  // server names villa by villa is shown with the villa, and can be discarded
  it("Q-24: a save that cannot reach the server is kept on the phone, then sent with its identifier and the moment it was kept; a conflict is shown, not swallowed", async () => {
    render(<PmcProgressUpdate />);
    fireEvent.change(screen.getByRole("combobox", { name: "Activity" }), { target: { value: "FOOT" } });
    fireEvent.change(screen.getByLabelText(/^Villa numbers/), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    const variables = h.mutate.mock.calls[0][0] as { clientRequestId: string };
    expect(variables.clientRequestId).toMatch(/^[0-9a-f-]{36}$/);
    act(() => { (h.options.onError as unknown as (error: unknown, variables: unknown) => void)(new TypeError("Failed to fetch"), variables); });
    expect(screen.getByText("1 waiting to be sent")).toBeTruthy();
    // sent: the same identifier, and when it was kept
    h.send.mockResolvedValueOnce({ changed: 1 });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send now" })); });
    expect(h.send).toHaveBeenCalledWith(expect.objectContaining({ clientRequestId: variables.clientRequestId, activityCode: "FOOT", villas: ["2"], queuedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) }));
    expect(screen.queryByText("1 waiting to be sent")).toBeNull();
    // a second one kept, and the server refuses it — villa 2 was saved after it was kept
    fireEvent.change(screen.getByLabelText(/^Villa numbers/), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    act(() => { (h.options.onError as unknown as (error: unknown, variables: unknown) => void)(new TypeError("Failed to fetch"), h.mutate.mock.calls[1][0]); });
    h.send.mockRejectedValueOnce(Object.assign(new Error("PROJECT_OS_SITE_UPDATE_INVALID"), { data: { code: "BAD_REQUEST", issues: [{ code: "SITE_CHANGED_SINCE", villa: "2" }] } }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send now" })); });
    const refused = document.querySelector("[data-offline-refused]")!;
    expect(refused.textContent).toContain("Villa 2 was updated after you kept this entry offline");
    fireEvent.click(screen.getByRole("button", { name: "Discard from the phone" }));
    expect(document.querySelector("[data-offline-refused]")).toBeNull();
  });
});
