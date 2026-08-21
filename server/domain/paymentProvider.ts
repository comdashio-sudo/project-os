export type PaymentOperation = "create" | "renew" | "cancel" | "refund";
export type PaymentProviderCode = "manual" | "mock";
export type PaymentProviderRequest = {
  tenantId: string;
  subscriptionId: string;
  operation: PaymentOperation;
  amount: number;
  currency: string;
  invoiceId?: string;
};
export type PaymentProviderResult = {
  provider: PaymentProviderCode;
  providerReference: string;
  status: "pending" | "confirmed" | "cancelled" | "refunded";
  metadata: Record<string, string>;
};

export interface PaymentProvider {
  readonly code: PaymentProviderCode;
  createSubscription(input: PaymentProviderRequest): PaymentProviderResult;
  renewSubscription(input: PaymentProviderRequest): PaymentProviderResult;
  cancelSubscription(input: PaymentProviderRequest): PaymentProviderResult;
  refund(input: PaymentProviderRequest): PaymentProviderResult;
  confirmWebhook(input: { providerReference: string }): { providerReference: string; confirmed: true };
}

function reference(prefix: string, input: PaymentProviderRequest) {
  return `${prefix}-${input.operation}-${crypto.randomUUID()}`;
}

export const ManualProvider: PaymentProvider = {
  code: "manual",
  createSubscription: input => ({ provider: "manual", providerReference: reference("MAN", input), status: "pending", metadata: { settlement: "manual_transfer_or_invoice" } }),
  renewSubscription: input => ({ provider: "manual", providerReference: reference("MAN", input), status: "pending", metadata: { settlement: "manual_transfer_or_invoice" } }),
  cancelSubscription: input => ({ provider: "manual", providerReference: reference("MAN", input), status: "cancelled", metadata: { settlement: "manual" } }),
  refund: input => ({ provider: "manual", providerReference: reference("MAN", input), status: "refunded", metadata: { settlement: "manual" } }),
  confirmWebhook: input => ({ providerReference: input.providerReference, confirmed: true }),
};

export const MockProvider: PaymentProvider = {
  code: "mock",
  createSubscription: input => ({ provider: "mock", providerReference: reference("MOCK", input), status: "confirmed", metadata: { mode: "test_only" } }),
  renewSubscription: input => ({ provider: "mock", providerReference: reference("MOCK", input), status: "confirmed", metadata: { mode: "test_only" } }),
  cancelSubscription: input => ({ provider: "mock", providerReference: reference("MOCK", input), status: "cancelled", metadata: { mode: "test_only" } }),
  refund: input => ({ provider: "mock", providerReference: reference("MOCK", input), status: "refunded", metadata: { mode: "test_only" } }),
  confirmWebhook: input => ({ providerReference: input.providerReference, confirmed: true }),
};

export function paymentProviderFor(code: PaymentProviderCode): PaymentProvider {
  return code === "manual" ? ManualProvider : MockProvider;
}
