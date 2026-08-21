import { describe, expect, it } from "vitest";
import { StructuredInvoiceRenderer } from "./invoiceRenderer";
import { ManualProvider, MockProvider } from "./paymentProvider";

const request = { tenantId: "tenant-a", subscriptionId: "subscription-a", operation: "create" as const, amount: 100, currency: "SAR" };

describe("payment adapters", () => {
  it("keeps ManualProvider pending and does not call an external gateway", () => {
    const result = ManualProvider.createSubscription(request);
    expect(result).toMatchObject({ provider: "manual", status: "pending", metadata: { settlement: "manual_transfer_or_invoice" } });
    expect(ManualProvider.confirmWebhook({ providerReference: result.providerReference })).toEqual({ providerReference: result.providerReference, confirmed: true });
  });

  it("confines MockProvider to a confirmed test-only result", () => {
    expect(MockProvider.createSubscription(request)).toMatchObject({ provider: "mock", status: "confirmed", metadata: { mode: "test_only" } });
    expect(MockProvider.refund({ ...request, operation: "refund" })).toMatchObject({ provider: "mock", status: "refunded" });
  });

  it("renders a structured invoice without claiming a statutory output format", () => {
    const invoice = { id: "invoice-a", invoiceNumber: "INV-00000001", issuedAt: new Date("2026-08-21T00:00:00.000Z"), currency: "SAR", seller: { name: "Seller", taxNumber: "100" }, buyer: { name: "Buyer", taxNumber: "200" }, subtotalAmount: "100", vatAmount: "15", totalAmount: "115" };
    expect(StructuredInvoiceRenderer.render(invoice)).toEqual(invoice);
  });
});
