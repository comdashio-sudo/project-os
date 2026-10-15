/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import ProjectInvoicesPanel from "./ProjectInvoicesPanel";

const h = vi.hoisted(() => ({ arabic: false, empty: false, move: vi.fn(), refetch: vi.fn(), error: null as unknown }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.arabic }) }));
const invoices = [
  { id: "i1", invoiceNumber: "INV-1", invoiceDate: new Date("2026-10-05T00:00:00Z"), clientName: "Client", totalAmount: "1150.00", status: "draft", paidAt: null },
  { id: "i2", invoiceNumber: "INV-2", invoiceDate: new Date("2026-10-06T00:00:00Z"), clientName: "Client", totalAmount: "575.00", status: "issued", paidAt: null },
  { id: "i3", invoiceNumber: "INV-3", invoiceDate: new Date("2026-10-07T00:00:00Z"), clientName: "Client", totalAmount: "100.00", status: "paid", paidAt: new Date("2026-10-12T00:00:00Z") },
];
vi.mock("@/lib/trpc", () => ({ trpc: { projectInvoices: {
  list: { useQuery: () => ({ isLoading: false, error: null, refetch: h.refetch, data: h.empty ? [] : invoices }) },
  transitionStatus: { useMutation: (options: { onSuccess?: () => void }) => ({ mutate: (input: unknown) => { h.move(input); options.onSuccess?.(); }, isPending: false, error: h.error }) },
} } }));
afterEach(() => { cleanup(); Object.assign(h, { arabic: false, empty: false, error: null }); vi.clearAllMocks(); });
const show = () => render(<ProjectInvoicesPanel tenantId="t" projectId="p" currency="SAR" />);
const row = (number: string) => screen.getByText(number).closest("tr")!;

describe("ProjectInvoicesPanel", () => {
  it("offers only the moves each status allows: a draft is issued or voided, an issued invoice is paid or voided, a paid one is final", () => {
    show();
    expect(Array.from(row("INV-1").querySelectorAll("button")).map(b => b.textContent)).toEqual(["Issue", "Void"]);
    expect(Array.from(row("INV-2").querySelectorAll("button")).map(b => b.textContent)).toEqual(["Record payment", "Void"]);
    expect(row("INV-3").querySelectorAll("button").length).toBe(0);
    expect(row("INV-3").textContent).toContain("Paid · Paid on 2026-10-12");
  });

  it("issues a draft, and records a payment with the date it was made", () => {
    show();
    fireEvent.click(row("INV-1").querySelectorAll("button")[0]);
    expect(h.move).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", invoiceId: "i1", nextStatus: "issued" });
    fireEvent.click(screen.getByRole("button", { name: "Record payment" }));
    fireEvent.change(screen.getByLabelText("Payment date"), { target: { value: "2026-10-10" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));
    expect(h.move).toHaveBeenLastCalledWith({ tenantId: "t", projectId: "p", invoiceId: "i2", nextStatus: "paid", paidAt: new Date("2026-10-10T00:00:00.000Z") });
  });

  it("shows a refusal from the server, says when there are no invoices, and has Arabic status names", () => {
    h.error = new Error("refused");
    const first = show();
    expect(screen.getByRole("alert").textContent).toContain("could not complete");
    first.unmount();
    h.error = null; h.empty = true;
    const second = show();
    expect(screen.getByText("No invoices yet.")).toBeTruthy();
    second.unmount();
    h.empty = false; h.arabic = true;
    show();
    expect(row("INV-1").textContent).toContain("مسودة");
    expect(row("INV-3").textContent).toContain("مسدَّدة");
  });
});
