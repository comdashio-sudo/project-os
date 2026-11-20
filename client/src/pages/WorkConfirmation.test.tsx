/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import WorkConfirmation from "./WorkConfirmation";

// Q-43 batch 4: the site engineer's subcontractor work confirmation. Synthetic contracts, villas and BOQ items only.
const h = vi.hoisted(() => ({
  language: "en" as "ar" | "en" | "ur", can: true, create: vi.fn(), transition: vi.fn(), createError: null as unknown, transitionError: null as unknown,
}));
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: (await import("../test/dsSelectStandIn")).NativeSelect }));
vi.mock("wouter", () => ({ useLocation: () => ["/", () => undefined], Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useParams: () => ({ tenantId: "t", projectId: "p" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.language === "ar", language: h.language, isRtl: h.language !== "en" }) }));
vi.mock("@/lib/permissions", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/permissions")>()), useCan: () => h.can, usePermissionsLoading: () => false }));
const fixture = vi.hoisted(() => {
  const options = {
  subcontracts: [{ id: "s1", code: "SC-1", title: "Synthetic finishes", subcontractorName: "Synthetic Finishers", status: "active" }],
  activities: [{ id: "a1", modelCode: "A", code: "PLASTER", name: "لياسة", nameEn: "Plaster" }, { id: "b1", modelCode: "B", code: "PLASTER", name: "لياسة", nameEn: "Plaster" }],
  units: [{ id: "u1", unitNumber: 1, modelCode: "A", blockCode: "B1" }, { id: "u2", unitNumber: 2, modelCode: "A", blockCode: "B1" }, { id: "u3", unitNumber: 3, modelCode: "B", blockCode: "B2" }],
  boqItems: [{ id: "q1", code: "TILE", description: "Synthetic floor tiles", unitOfMeasure: "m2", quantity: 100 }],
};
  const mutation = (run: ReturnType<typeof vi.fn>, error: () => unknown) => () => ({
  mutateAsync: async (input: unknown) => { run(input); if (error()) throw error(); return { id: "wc-1" }; }, isPending: false, error: error(), reset: vi.fn(),
});
  return { options, mutation };
});
vi.mock("@/lib/trpc", () => ({ trpc: { workConfirmations: {
  options: { useQuery: (_input: unknown, config?: { enabled?: boolean }) => ({ data: config?.enabled === false ? undefined : fixture.options, isLoading: false, error: null, refetch: vi.fn() }) },
  create: { useMutation: fixture.mutation(h.create, () => h.createError) },
  transition: { useMutation: fixture.mutation(h.transition, () => h.transitionError) },
} } }));

beforeEach(() => { h.language = "en"; h.can = true; h.create.mockReset(); h.transition.mockReset(); h.createError = null; h.transitionError = null; });
afterEach(cleanup);
const pick = (label: string | RegExp, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const header = () => { pick("Contract / subcontractor", "s1"); pick("Confirmation number", "WC-7"); };
const refusal = { data: { projectError: { messages: { ar: "مكرر", en: "Already confirmed for this subcontract", ur: "پہلے سے تصدیق شدہ" } } } };

describe("WorkConfirmation (Q-43 batch 4)", () => {
  it("POSITIVE units: activity → the whole block (its model's villas only) → percent → review → send: created with the lines, then sent for approval", async () => {
    render(<WorkConfirmation />);
    expect(screen.getByText(/No prices on this screen/)).toBeTruthy();
    header();
    pick("Activity", "a1");
    expect(screen.queryByRole("button", { name: "Whole block B2" })).toBeNull(); // model B's block is not offered for model A's activity
    expect(screen.queryByRole("button", { name: "Villa 1" })).toBeNull(); // the block is closed until opened
    fireEvent.click(screen.getByRole("button", { name: "Whole block B1" }));
    expect(screen.getByText("2/2")).toBeTruthy();
    pick("Percent %", "50");
    fireEvent.click(screen.getByRole("button", { name: "Add the lines" }));
    expect(screen.getByText("Villa 1 · PLASTER — Plaster · 50%")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    expect(screen.getByText("Lines: 2")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("The confirmation was sent for approval"));
    expect(h.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "t", projectId: "p", subcontractId: "s1", confirmationNumber: "WC-7", lines: [
      { kind: "unit", pmcUnitId: "u1", pmcActivityDefinitionId: "a1", percent: 50 }, { kind: "unit", pmcUnitId: "u2", pmcActivityDefinitionId: "a1", percent: 50 },
    ] }));
    expect(h.transition).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", confirmationId: "wc-1", nextStatus: "submitted" });
  });

  it("POSITIVE quantities: BOQ item (with its quantity, no rate) → quantity → send; a removed line is not sent", async () => {
    render(<WorkConfirmation />);
    header();
    fireEvent.click(screen.getByRole("radio", { name: "Quantities" }));
    expect(screen.getByRole("option", { name: "TILE — Synthetic floor tiles (Item quantity: 100 m2)" })).toBeTruthy();
    pick("BOQ item", "q1"); pick("Quantity", "12.5");
    fireEvent.click(screen.getByRole("button", { name: "Add the lines" }));
    fireEvent.click(screen.getByRole("radio", { name: "Units" }));
    pick("Activity", "a1"); fireEvent.click(screen.getByRole("button", { name: /^B1/ })); fireEvent.click(screen.getByRole("button", { name: "Villa 2" }));
    fireEvent.click(screen.getByRole("button", { name: "Add the lines" }));
    fireEvent.click(screen.getByRole("button", { name: /Remove the line: Villa 2/ }));
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));
    await waitFor(() => expect(h.create).toHaveBeenCalled());
    expect(h.create.mock.calls[0][0].lines).toEqual([{ kind: "quantity", boqItemId: "q1", quantity: 12.5 }]);
  });

  it("NEGATIVE: no villa, a percent over 100 or a zero quantity adds nothing; without a number or a line there is no review", () => {
    render(<WorkConfirmation />);
    expect((screen.getByRole("button", { name: "Review" }) as HTMLButtonElement).disabled).toBe(true);
    pick("Activity", "a1");
    fireEvent.click(screen.getByRole("button", { name: "Add the lines" }));
    expect(screen.getByRole("alert").textContent).toBe("Pick at least one villa.");
    fireEvent.click(screen.getByRole("button", { name: /^B1/ })); fireEvent.click(screen.getByRole("button", { name: "Villa 1" })); pick("Percent %", "150");
    fireEvent.click(screen.getByRole("button", { name: "Add the lines" }));
    expect(screen.getByRole("alert").textContent).toBe("The percent is between 0.01 and 100.");
    fireEvent.click(screen.getByRole("radio", { name: "Quantities" })); pick("BOQ item", "q1"); pick("Quantity", "0");
    fireEvent.click(screen.getByRole("button", { name: "Add the lines" }));
    expect(screen.getByRole("alert").textContent).toBe("The quantity is above zero.");
    expect(screen.getByText("No lines added yet.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Review" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("NEGATIVE: the server's refusal of the confirmation is shown and nothing is sent; a refused send says the draft was kept", async () => {
    h.createError = refusal;
    const { unmount } = render(<WorkConfirmation />);
    header(); pick("Activity", "a1"); fireEvent.click(screen.getByRole("button", { name: /^B1/ })); fireEvent.click(screen.getByRole("button", { name: "Villa 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Add the lines" }));
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));
    await waitFor(() => expect(h.create).toHaveBeenCalled());
    expect(h.transition).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toBe("Already confirmed for this subcontract");
    unmount();
    h.createError = null; h.transitionError = refusal;
    render(<WorkConfirmation />);
    header(); pick("Activity", "a1"); fireEvent.click(screen.getByRole("button", { name: /^B1/ })); fireEvent.click(screen.getByRole("button", { name: "Villa 1" }));
    fireEvent.click(screen.getByRole("button", { name: "Add the lines" }));
    fireEvent.click(screen.getByRole("button", { name: "Review" }));
    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("The confirmation was saved as a draft and not sent:"));
    expect((screen.getByRole("button", { name: "Send for approval" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("NEGATIVE: without the record permission the screen says so and asks the server nothing it may not", () => {
    h.can = false;
    render(<WorkConfirmation />);
    expect(screen.queryByTestId("work-confirmation-form")).toBeNull();
    expect(screen.queryByText(/No prices on this screen/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Send for approval" })).toBeNull();
  });

  it("speaks Arabic and Urdu; Arabic shows the activity's Arabic name", () => {
    h.language = "ar";
    render(<WorkConfirmation />);
    expect(screen.getByRole("heading", { name: "إثبات أعمال مقاول" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "A · PLASTER — لياسة" })).toBeTruthy();
    cleanup();
    h.language = "ur";
    render(<WorkConfirmation />);
    expect(screen.getByRole("button", { name: "جائزہ" })).toBeTruthy();
  });
});
