// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Q-4: the site engineer's progress update on the weights table. Synthetic data only.
const h = vi.hoisted(() => ({ send: vi.fn(), mutate: vi.fn(), result: undefined as unknown, error: null as unknown, options: {} as { onError?: (error: unknown) => void; onSuccess?: (result: unknown) => void }, undo: vi.fn() }));
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
  // Q-24: the screen keeps a save offline under the signed-in person; the sender is the tRPC client
  auth: { me: { useQuery: () => ({ data: { id: 7 }, isLoading: false, error: null }) } },
  useUtils: () => ({ client: { pmc: { updateProgress: { mutate: h.send } } } }),
  pmc: {
    progressActivities: { useQuery: () => ({ data: (globalThis as { __q49Activities?: unknown[] }).__q49Activities ?? [{ code: "FOOT", name: "Footings", sectionCode: "Q03", section: "03 Concrete", minWeight: 40, maxWeight: 40, models: ["C"] }, { code: "PAINT", name: "Painting", sectionCode: "Q09", section: "09 Finishes", minWeight: 5, maxWeight: 5, models: ["C", "D"] }], isLoading: false, error: null }) },
    progressPicker: { useQuery: () => ({ data: PICKER, isLoading: false, error: null, refetch: vi.fn() }) },
    progressHistory: { useQuery: () => ({ data: [{ at: "2026-11-11T09:00:00Z", from: null, to: "COMPLETE", by: "Site Engineer", unitNumber: 3, villaLabel: null, activityCode: "FOOT", activityName: "Footings" }], error: null, refetch: vi.fn() }) },
    undoProgressBatch: { useMutation: () => ({ mutate: h.undo, isPending: false, error: null }) },
    updateProgress: { useMutation: (options: { onError?: (error: unknown) => void; onSuccess?: (result: unknown) => void }) => { h.options = options; return { mutate: h.mutate, isPending: false, data: h.result }; } },
  },
} }));

import PmcProgressUpdate from "./PmcProgressUpdate";

beforeEach(() => { (globalThis as { __q49Activities?: unknown[] }).__q49Activities = undefined; h.mutate.mockReset(); h.send.mockReset(); h.result = undefined; try { localStorage.clear(); } catch { /* none */ } });
afterEach(() => cleanup());

const activity = (code: string) => fireEvent.change(screen.getByRole("combobox", { name: "Activity" }), { target: { value: code } });
const mode = (name: string) => fireEvent.click(screen.getByRole("radio", { name }));
/** chooses these values in a multiple list (the native stand-in) */
const many = (name: string, values: string[]) => { const list = screen.getByRole("listbox", { name }) as HTMLSelectElement; for (const option of Array.from(list.options)) option.selected = values.includes(option.value); fireEvent.change(list); };
const tick = (...villas: string[]) => { mode("Chosen villas"); for (const villa of villas) fireEvent.click(screen.getByRole("checkbox", { name: `Villa ${villa}` })); };
const save = () => fireEvent.click(screen.getByRole("button", { name: /Save/ }));

describe("PmcProgressUpdate (Q-4)", () => {
  it("the activity comes from the weights table with its section and weight; one save sends the activity, the villas, the status and the date", () => {
    render(<PmcProgressUpdate />);
    expect(screen.getByRole("combobox", { name: "Activity" }).textContent).toContain("Footings | Q03 — 03 Concrete | Weight 40.00%");
    activity("FOOT");
    tick("1", "3");
    save();
    expect(h.mutate).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t", projectId: "p", activityCode: "FOOT", villas: ["1", "3"], status: "COMPLETE" }));
  });

  it("Q-54: the three steps of the reference follow the form (item, then villas, then status) without hiding any field", () => {
    render(<PmcProgressUpdate />);
    const current = () => screen.getByRole("list", { name: "Update steps" }).querySelector('[aria-current="step"]')?.textContent;
    expect(current()).toBe("Item");
    expect(document.querySelector("[data-villa-picker]")).not.toBeNull();
    activity("FOOT");
    expect(current()).toBe("Villas");
    tick("1");
    expect(current()).toBe("Status");
    fireEvent.click(screen.getByRole("checkbox", { name: "Villa 1" }));
    expect(current()).toBe("Villas");
  });

  it("Q-67 (2): the phase, the blocks and the model are chosen from the project's own lists with their villa counts — no typed code — and the save carries their villas", () => {
    render(<PmcProgressUpdate />);
    activity("PAINT");
    // a project with phases opens on «Phase»
    expect(document.querySelector("[data-villa-picker]")!.getAttribute("data-villa-picker")).toBe("phase");
    expect(screen.getByRole("listbox", { name: "phase" }).textContent).toContain("PH2 | 3 villas");
    many("phase", ["PH2"]);
    save();
    expect(h.mutate).toHaveBeenLastCalledWith(expect.objectContaining({ activityCode: "PAINT", villas: ["3", "4", "5"] }));
    mode("Block");
    expect(screen.getByRole("listbox", { name: "block" }).textContent).toContain("BLK 1 | 3 villas");
    many("block", ["BLK 1", "BLK 2"]);
    save();
    expect(h.mutate).toHaveBeenLastCalledWith(expect.objectContaining({ villas: ["1", "2", "3", "4", "5"] }));
    mode("Model");
    many("model", ["D"]);
    save();
    expect(h.mutate).toHaveBeenLastCalledWith(expect.objectContaining({ villas: ["4", "5"] }));
    // NEGATIVE: no text field to type a block, a phase or a model into
    expect(screen.queryByRole("textbox", { name: /Block|Phase|Model/ })).toBeNull();
  });

  it("Q-67 (2): a range is chosen between two existing villas; the list has a search, filters and «choose all in the filter»", () => {
    render(<PmcProgressUpdate />);
    activity("PAINT");
    mode("Range");
    fireEvent.change(screen.getByRole("combobox", { name: "from" }), { target: { value: "4" } });
    fireEvent.change(screen.getByRole("combobox", { name: "to" }), { target: { value: "2" } });
    save();
    expect(h.mutate).toHaveBeenLastCalledWith(expect.objectContaining({ villas: ["2", "3", "4"] }));
    mode("Chosen villas");
    fireEvent.change(screen.getByLabelText(/^Search by villa number/), { target: { value: "5" } });
    expect(screen.queryByRole("checkbox", { name: "Villa 1" })).toBeNull();
    fireEvent.change(screen.getByLabelText(/^Search by villa number/), { target: { value: "" } });
    fireEvent.change(screen.getAllByRole("combobox").find(element => element.closest("[data-villa-list]") && Array.from((element as HTMLSelectElement).options).some(option => option.value === "BLK 1"))!, { target: { value: "BLK 2" } });
    fireEvent.click(screen.getByRole("button", { name: "Choose all in the filter (2)" }));
    save();
    expect(h.mutate).toHaveBeenLastCalledWith(expect.objectContaining({ villas: ["4", "5"] }));
  });

  it("Q-67 (3): before the save — the villas chosen, those left out because their model has no such item (not sent), and those that would move back", () => {
    render(<PmcProgressUpdate />);
    activity("FOOT");
    mode("Block");
    many("block", ["BLK 1", "BLK 2"]);
    fireEvent.click(screen.getByRole("radio", { name: "In progress" }));
    const note = document.querySelector("[data-selection-summary]")!;
    expect(note.textContent).toContain("5 villas chosen · 3 will be updated");
    expect(note.querySelector("[data-summary-excluded]")!.textContent).toBe("2 left out because their model has no such item (D)");
    expect(note.querySelector("[data-summary-moving-back]")!.textContent).toContain("2 (Complete)");
    save();
    expect(h.mutate).toHaveBeenLastCalledWith(expect.objectContaining({ villas: ["1", "2", "3"], status: "IN_PROGRESS" }));
    // NEGATIVE: only villas the item does not apply to → nothing to save
    mode("Model");
    many("model", ["D"]);
    expect(document.querySelector("[data-selection-summary]")!.textContent).toContain("2 villas chosen · 0 will be updated");
    expect((screen.getByRole("button", { name: /Save/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Q-67 (1): the activity last used comes first in the list, kept for this project", () => {
    render(<PmcProgressUpdate />);
    activity("PAINT");
    cleanup();
    render(<PmcProgressUpdate />);
    expect(screen.getByRole("combobox", { name: "Activity" }).textContent).toMatch(/^Painting \| Last used/);
  });

  it("Q-60: above 100 villas the server's count is shown and the save is sent again carrying it", () => {
    render(<PmcProgressUpdate />);
    activity("PAINT");
    mode("Model");
    many("model", ["C"]);
    save();
    expect(h.mutate.mock.calls[0][0]).not.toHaveProperty("confirmCount");
    act(() => { h.options.onError?.({ data: { issues: [{ code: "SITE_CONFIRM_COUNT", detail: "1250" }] } }); });
    expect(screen.getByRole("alertdialog").textContent).toContain("1250 villas will be updated at once");
    fireEvent.click(screen.getByRole("button", { name: "Confirm saving 1250 villas" }));
    expect(h.mutate).toHaveBeenLastCalledWith(expect.objectContaining({ villas: ["1", "2", "3"], confirmCount: 1250 }));
  });

  it("review of #572 (C, note 1): a save kept offline names its villas in the queue, so a refusal says which save it was", async () => {
    render(<PmcProgressUpdate />);
    activity("FOOT");
    many("phase", ["PH1"]);
    save();
    act(() => { (h.options.onError as unknown as (error: unknown, variables: unknown) => void)(new TypeError("Failed to fetch"), h.mutate.mock.calls.at(-1)![0]); });
    h.send.mockRejectedValueOnce(Object.assign(new Error("PROJECT_OS_SITE_UPDATE_CONFIRM_COUNT"), { data: { code: "BAD_REQUEST", issues: [{ code: "SITE_CONFIRM_COUNT", detail: "300" }] } }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send now" })); });
    const refused = document.querySelector("[data-offline-refused]")!;
    expect(refused.textContent).toMatch(/FOOT · [^·]+ · 1, 2/);
    fireEvent.click(screen.getByRole("button", { name: "Discard from the phone" }));
  });

  it("Q-60 NEGATIVE: cancelling the count sends nothing more and gives the ordinary save back", () => {
    render(<PmcProgressUpdate />);
    activity("FOOT");
    tick("1");
    save();
    act(() => { h.options.onError?.({ data: { issues: [{ code: "SITE_CONFIRM_COUNT", detail: "300" }] } }); });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(h.mutate).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /Save/ })).toBeTruthy();
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
    activity("FOOT");
    tick("2");
    save();
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
    tick("2");
    save();
    act(() => { (h.options.onError as unknown as (error: unknown, variables: unknown) => void)(new TypeError("Failed to fetch"), h.mutate.mock.calls[1][0]); });
    h.send.mockRejectedValueOnce(Object.assign(new Error("PROJECT_OS_SITE_UPDATE_INVALID"), { data: { code: "BAD_REQUEST", issues: [{ code: "SITE_CHANGED_SINCE", villa: "2" }] } }));
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Send now" })); });
    const refused = document.querySelector("[data-offline-refused]")!;
    expect(refused.textContent).toContain("Villa 2 was updated after you kept this entry offline");
    fireEvent.click(screen.getByRole("button", { name: "Discard from the phone" }));
    expect(document.querySelector("[data-offline-refused]")).toBeNull();
  });

  // Q-49: the activity names in Arabic or English — display only
  it("Q-49 NEGATIVE: a project with no English name shows no names switch and the names as stored, unmarked", () => {
    render(<PmcProgressUpdate />);
    expect(document.querySelector("[data-activity-name-toggle]")).toBeNull();
    expect(document.body.textContent).not.toContain("in Arabic");
  });

  it("Q-49 POSITIVE: with English names the switch shows; English (the interface) by default, a missing English name falls back marked; Arabic on a click, kept for this person; the save still sends the code", () => {
    (globalThis as { __q49Activities?: unknown[] }).__q49Activities = [
      { code: "FOOT", name: "صب القواعد", nameEn: "Footings", sectionCode: "Q03", section: "خرسانة", sectionEn: "Concrete", minWeight: 60, maxWeight: 60, models: ["C"] },
      { code: "SLAB", name: "صب السقف", nameEn: null, sectionCode: "Q03", section: "خرسانة", sectionEn: "Concrete", minWeight: 40, maxWeight: 40, models: ["C"] },
    ];
    render(<PmcProgressUpdate />);
    expect(document.querySelector("[data-activity-name-toggle]")).not.toBeNull();
    const options = () => Array.from(screen.getByRole("combobox", { name: "Activity" }).querySelectorAll("option")).map(option => option.textContent).filter(Boolean);
    expect(options()).toEqual(["Footings | Q03 — Concrete | Weight 60.00%", "صب السقف · in Arabic | Q03 — Concrete | Weight 40.00%"]);
    fireEvent.click(screen.getByRole("radio", { name: "العربية" }));
    expect(options()).toEqual(["صب القواعد | Q03 — خرسانة | Weight 60.00%", "صب السقف | Q03 — خرسانة | Weight 40.00%"]);
    expect(localStorage.getItem("project-os-activity-names:7")).toBe("ar");
    activity("FOOT");
    tick("1");
    save();
    expect(h.mutate).toHaveBeenCalledWith(expect.objectContaining({ activityCode: "FOOT", villas: ["1"] }));
  });
});
