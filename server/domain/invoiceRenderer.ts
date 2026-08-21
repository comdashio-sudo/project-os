export type RenderableInvoice = {
  id: string;
  invoiceNumber: string;
  issuedAt: Date;
  currency: string;
  seller: { name: string; taxNumber: string };
  buyer: { name: string; taxNumber: string };
  subtotalAmount: string;
  vatAmount: string;
  totalAmount: string;
};

export interface InvoiceRenderer {
  readonly code: "structured_json";
  render(invoice: RenderableInvoice): RenderableInvoice;
}

export const StructuredInvoiceRenderer: InvoiceRenderer = {
  code: "structured_json",
  render: invoice => invoice,
};
