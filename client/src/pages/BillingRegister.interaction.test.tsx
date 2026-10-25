// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import BillingRegister from "./BillingRegister";

const state = vi.hoisted(() => ({ issue: vi.fn(), payment: vi.fn() }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useParams: () => ({ tenantId: "tenant-1" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: (false) ? "ar" : "en", isRtl: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: (error: unknown) => String(error) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ licensing: { tenantLicense: { invalidate: vi.fn() } } }),
    licensing: { tenantLicense: { useQuery: () => ({ data: { license: { subscriptionId: "sub-1" } }, isLoading: false, error: null }) } },
    billing: {
      register: { useQuery: () => ({ data: { invoices: [{ id: "inv-1", invoiceNumber: "INV-00000001", status: "issued", issuedAt: new Date(), currency: "SAR", subtotalAmount: "100", vatAmount: "15", totalAmount: "115" }], payments: [] }, isLoading: false, error: null }) },
      issueInvoice: { useMutation: () => ({ mutate: state.issue, isPending: false, error: null }) },
      createPayment: { useMutation: () => ({ mutate: state.payment, isPending: false, error: null }) },
    },
  },
}));

afterEach(() => { cleanup(); state.issue.mockClear(); state.payment.mockClear(); });

describe("BillingRegister", () => {
  it("issues a structured invoice with the displayed VAT calculation", async () => {
    const user = userEvent.setup();
    render(<BillingRegister />);
    await user.type(screen.getByLabelText("Seller name"), "Seller Co");
    await user.type(screen.getByLabelText("Seller tax number"), "100");
    await user.type(screen.getByLabelText("Buyer name"), "Buyer Co");
    await user.type(screen.getByLabelText("Buyer tax number"), "200");
    await user.type(screen.getByLabelText("Subtotal before VAT"), "100");
    expect(screen.getByText("VAT 15%: 15.00 SAR")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Issue invoice" }));
    expect(state.issue).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", subscriptionId: "sub-1", subtotalAmount: 100, currency: "SAR" }));
  });

  it("names a missing buyer name beside its field and issues nothing", async () => {
    const user = userEvent.setup();
    render(<BillingRegister />);
    await user.type(screen.getByLabelText("Seller name"), "Seller Co");
    await user.type(screen.getByLabelText("Seller tax number"), "100");
    await user.type(screen.getByLabelText("Buyer tax number"), "200");
    await user.type(screen.getByLabelText("Subtotal before VAT"), "100");
    await user.click(screen.getByRole("button", { name: "Issue invoice" }));
    expect(screen.getByText("This field is required.")).toBeTruthy();
    expect(state.issue).not.toHaveBeenCalled();
  });

  it("records manual and mock payment requests against the displayed invoice", async () => {
    const user = userEvent.setup();
    render(<BillingRegister />);
    await user.click(screen.getByRole("button", { name: "Create manual payment request" }));
    await user.click(screen.getByRole("button", { name: "Record Mock test payment" }));
    expect(state.payment).toHaveBeenNthCalledWith(1, expect.objectContaining({ provider: "manual", invoiceId: "inv-1", operation: "create", amount: 115 }));
    expect(state.payment).toHaveBeenNthCalledWith(2, expect.objectContaining({ provider: "mock", invoiceId: "inv-1", operation: "create", amount: 115 }));
  });
});

void React;
