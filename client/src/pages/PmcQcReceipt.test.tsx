// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Q-5: the QC engineer's receipts. Synthetic data only.
const h = vi.hoisted(() => ({ mutate: vi.fn(), result: undefined as unknown, error: null as unknown, options: {} as { onError?: (error: unknown) => void; onSuccess?: (result: unknown) => void }, undo: vi.fn() }));
vi.mock("@/components/UnitJump", () => ({ UnitJump: ({ fallback }: { fallback: React.ReactNode }) => <>{fallback}</> }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useParams: () => ({ tenantId: "t", projectId: "p" }), useLocation: () => ["/", vi.fn()] }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
vi.mock("@/components/LanguageToggle", () => ({ LanguageToggle: () => null }));
vi.mock("@/lib/permissions", () => ({ useCanPage: () => true, WriteGate: ({ children }: { children: React.ReactNode }) => <>{children}</>, useCan: () => true }));
vi.mock("@/components/ds/Feedback", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds/Feedback")>()), Toaster: () => null, notify: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
// the design system's list opens a Radix popover; a native select with the same props reads in jsdom
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: ({ id, options, value, onValueChange }: { id?: string; options: Array<{ value: string; label: string; description?: string }>; value?: string; onValueChange: (value: string) => void }) => (
  <select id={id} aria-label="Activity" value={value ?? ""} onChange={event => onValueChange(event.target.value)}><option value="" />{options.map(option => <option key={option.value} value={option.value}>{`${option.label} — ${option.description ?? ""}`}</option>)}</select>
) }));
// Q-67: the searchable list opens a Radix popover; a native select (multiple when the list is) with the same options reads in jsdom
vi.mock("@/components/SearchCombobox", () => ({ SearchCombobox: ({ id, options: all, value, values, onChange, onChangeMany, multiple, recent = [], "data-combobox": name }: { id?: string; options: Array<{ value: string; label: string; group?: string; description?: string }>; value?: string; values?: string[]; onChange?: (value: string) => void; onChangeMany?: (values: string[]) => void; multiple?: boolean; recent?: string[]; "data-combobox"?: string }) => { const options = [...recent.map(item => all.find(option => option.value === item)).filter(Boolean).map(option => ({ ...option!, group: "Last used", value: option!.value })), ...all.filter(option => !recent.includes(option.value))]; return (
  <select id={id} aria-label={name === "activity" ? "Activity" : name} multiple={multiple} value={multiple ? values ?? [] : value ?? ""} onChange={event => (multiple ? onChangeMany?.(Array.from(event.target.selectedOptions).map(option => option.value)) : onChange?.(event.target.value))}>
    {multiple ? null : <option value="" />}{options.map(option => <option key={option.value} value={option.value}>{[option.label, option.group, option.description].filter(Boolean).join(" | ")}</option>)}
  </select>
); } }));
const PICKER = {
  villas: [
    { villa: "1", number: 1, block: "BLK 1", phase: "PH1", model: "C", status: "NOT_STARTED" }, { villa: "2", number: 2, block: "BLK 1", phase: "PH1", model: "C", status: "COMPLETE" },
    { villa: "3", number: 3, block: "BLK 1", phase: "PH2", model: "C", status: "IN_PROGRESS" }, { villa: "4", number: 4, block: "BLK 2", phase: "PH2", model: "D", status: "NOT_STARTED" },
    { villa: "5", number: 5, block: "BLK 2", phase: "PH2", model: "D", status: "NOT_STARTED" },
  ],
  blocks: [{ code: "BLK 1", villas: 3 }, { code: "BLK 2", villas: 2 }], phases: [{ code: "PH1", villas: 2 }, { code: "PH2", villas: 3 }], models: [{ code: "C", villas: 3 }, { code: "D", villas: 2 }],
};
vi.mock("@/lib/trpc", () => ({ trpc: {
  auth: { me: { useQuery: () => ({ data: { id: 7 }, isLoading: false, error: null }) } },
  useUtils: () => ({ client: { pmc: { updateQcReceipts: { mutate: vi.fn() } } } }),
  pmc: {
    progressActivities: { useQuery: () => ({ data: [{ code: "FOOT", name: "Footings", sectionCode: "Q03", section: "03 Concrete", minWeight: 40, maxWeight: 40, models: ["C"] }], isLoading: false, error: null }) },
    progressPicker: { useQuery: () => ({ data: PICKER, isLoading: false, error: null, refetch: vi.fn() }) },
    qcHistory: { useQuery: () => ({ data: [{ at: "2026-11-11T09:00:00Z", on: "2026-11-11", from: null, to: true, by: "QC Engineer", unitNumber: 3, villaLabel: null, activityCode: "FOOT", activityName: "Footings" }], error: null, refetch: vi.fn() }) },
    qcCounters: { useQuery: () => ({ data: [{ code: "FOOT", name: "Footings", received: 1, total: 4, notReceived: 3 }], error: null, refetch: vi.fn() }) },
    undoQcReceiptBatch: { useMutation: () => ({ mutate: h.undo, isPending: false, error: null }) },
    updateQcReceipts: { useMutation: (options: { onError?: (error: unknown) => void; onSuccess?: (result: unknown) => void }) => { h.options = options; return { mutate: h.mutate, isPending: false, data: h.result }; } },
  },
} }));

import PmcQcReceipt from "./PmcQcReceipt";

beforeEach(() => { h.mutate.mockReset(); h.result = undefined; try { localStorage.clear(); } catch { /* none */ } });
afterEach(() => cleanup());

describe("PmcQcReceipt (Q-5)", () => {
  it("one save sends the activity, the villas, «received» and the date", () => {
    render(<PmcQcReceipt />);
    fireEvent.change(screen.getByRole("combobox", { name: "Activity" }), { target: { value: "FOOT" } });
    fireEvent.click(screen.getByRole("radio", { name: "Chosen villas" }));
    for (const villa of ["1", "3"]) fireEvent.click(screen.getByRole("checkbox", { name: `Villa ${villa}` }));
    fireEvent.click(screen.getByRole("radio", { name: "Not received" }));
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    expect(h.mutate).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t", projectId: "p", activityCode: "FOOT", villas: ["1", "3"], received: false }));
  });

  it("Q-67 (5): the same pickers as the progress update — the item from the searchable list, the blocks from the project's list with their counts; the villas the item does not apply to are named and not sent", () => {
    render(<PmcQcReceipt />);
    expect(screen.getByRole("combobox", { name: "Activity" }).textContent).toContain("Footings | Q03 — 03 Concrete | Weight 40.00%");
    fireEvent.change(screen.getByRole("combobox", { name: "Activity" }), { target: { value: "FOOT" } });
    fireEvent.click(screen.getByRole("radio", { name: "Block" }));
    const list = screen.getByRole("listbox", { name: "block" }) as HTMLSelectElement;
    expect(list.textContent).toContain("BLK 2 | 2 villas");
    for (const option of Array.from(list.options)) option.selected = true;
    fireEvent.change(list);
    expect(document.querySelector("[data-summary-excluded]")!.textContent).toBe("2 left out because their model has no such item (D)");
    // a receipt moves no site status back
    expect(document.querySelector("[data-summary-moving-back]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Save/ }));
    expect(h.mutate).toHaveBeenLastCalledWith(expect.objectContaining({ villas: ["1", "2", "3"], received: true }));
    // NEGATIVE: no text field for villa numbers, a range or a block
    expect(screen.queryByLabelText(/^Villa numbers/)).toBeNull();
    expect(screen.queryByRole("textbox", { name: /Block|Range/ })).toBeNull();
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
  it("Q-44: after a save, «Undo this save» is offered and sends that save's batch", () => {
    render(<PmcQcReceipt />);
    expect(screen.queryByRole("button", { name: "Undo this save" })).toBeNull();
    act(() => { h.options.onSuccess?.({ batchId: "44444444-4444-4444-8444-444444444444", changed: 2, unchanged: 0, villas: [], warnings: [], projectProgressPercent: 0 }); });
    fireEvent.click(screen.getByRole("button", { name: "Undo this save" }));
    expect(h.undo).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", batchId: "44444444-4444-4444-8444-444444444444" });
  });
});
