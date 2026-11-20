/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { blockedBy, PullConfirmationsToCertificate } from "./PullConfirmationsToCertificate";

// Q-43 batch 5b: approved quantity confirmations pulled into a certificate. Synthetic numbers and items only.
const h = vi.hoisted(() => ({ language: "en" as "ar" | "en" | "ur", can: true, mutate: vi.fn(), error: null as unknown, data: [] as unknown[] }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: h.language === "ar", language: h.language, isRtl: h.language !== "en" }) }));
vi.mock("@/lib/permissions", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/permissions")>()), useCan: () => h.can }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ workConfirmations: { list: { invalidate: vi.fn() } }, subcontracts: { listCertificates: { invalidate: vi.fn() } } }),
  workConfirmations: { list: { useQuery: () => ({ data: h.data, isLoading: false, error: null }) } },
  subcontracts: { createCertificate: { useMutation: () => ({ mutate: h.mutate, isPending: false, error: h.error }) } },
} }));
const quantity = (over: Record<string, unknown> = {}) => ({ kind: "quantity", quantity: 30, boqCode: "TILE-1", unitOfMeasure: "m2", historical: false, ...over });
const row = (over: Record<string, unknown> = {}) => ({ id: "wc-1", number: "WC-1", periodStart: "2026-11-01", periodEnd: "2026-11-15", status: "approved", certificateId: null, lines: [quantity()], ...over });
beforeEach(() => {
  h.language = "en"; h.can = true; h.mutate.mockReset(); h.error = null;
  h.data = [row(), row({ id: "wc-2", number: "WC-2", periodStart: "2026-11-10", periodEnd: "2026-11-20", lines: [quantity({ quantity: 20 })] }),
    row({ id: "wc-3", number: "WC-3", certificateId: "cert-0" }), row({ id: "wc-4", number: "WC-4", status: "submitted" }),
    row({ id: "wc-5", number: "WC-5", lines: [{ kind: "unit", quantity: null, boqCode: null, unitOfMeasure: null, historical: false }] }), row({ id: "wc-6", number: "WC-6", lines: [quantity({ historical: true })] })];
});
afterEach(cleanup);

describe("PullConfirmationsToCertificate (Q-43 batch 5b)", () => {
  it("POSITIVE: only approved, unpulled confirmations are listed; two picked become one certificate over their whole period, with no line typed and no price sent", () => {
    render(<PullConfirmationsToCertificate tenantId="t" projectId="p" subcontractId="sc" />);
    expect(screen.queryByLabelText("WC-3")).toBeNull(); // already pulled
    expect(screen.queryByLabelText("WC-4")).toBeNull(); // not approved
    fireEvent.click(screen.getByLabelText("WC-1"));
    fireEvent.click(screen.getByLabelText("WC-2"));
    fireEvent.change(screen.getByLabelText("Certificate number"), { target: { value: " C-9 " } });
    fireEvent.click(screen.getByRole("button", { name: "Create a certificate from 2 confirmations" }));
    expect(h.mutate).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", subcontractId: "sc", certificateNumber: "C-9", periodStart: new Date("2026-11-01T00:00:00.000Z"), periodEnd: new Date("2026-11-20T00:00:00.000Z"), lines: [], confirmationIds: ["wc-1", "wc-2"] });
    expect(JSON.stringify(h.mutate.mock.calls[0][0])).not.toMatch(/rate|amount|price/i);
  });

  it("NEGATIVE: a unit line or a historical line cannot be picked and says why; no number is not sent; the server's refusal is shown", () => {
    h.error = { data: { projectError: { messages: { ar: "سُحب من قبل", en: "Already in a certificate", ur: "پہلے سے شامل" } } } };
    render(<PullConfirmationsToCertificate tenantId="t" projectId="p" subcontractId="sc" />);
    expect((screen.getByLabelText("WC-5") as HTMLInputElement).disabled).toBe(true);
    expect((screen.getByLabelText("WC-6") as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText("Has unit lines with no BOQ rate: add them by hand against their item")).toBeTruthy();
    expect(screen.getByText("Has historical work: not pulled")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("WC-1"));
    fireEvent.click(screen.getByRole("button", { name: "Create a certificate from 1 confirmation" }));
    expect(h.mutate).not.toHaveBeenCalled();
    expect(screen.getAllByRole("alert").map(node => node.textContent)).toEqual(["Enter the certificate number.", "Already in a certificate"]);
    expect(blockedBy(row({ lines: [quantity(), quantity({ historical: true })] }) as never)).toBe("historical");
  });

  it("NEGATIVE: nothing for someone without the commitments permission; no contract chosen asks for one (Arabic)", () => {
    h.can = false;
    const { container } = render(<PullConfirmationsToCertificate tenantId="t" projectId="p" subcontractId="sc" />);
    expect(container.innerHTML).toBe("");
    cleanup();
    h.can = true; h.language = "ar";
    render(<PullConfirmationsToCertificate tenantId="t" projectId="p" subcontractId="" />);
    expect(screen.getByText("اختر عقدًا أعلاه لترى إثباتاته المعتمدة.")).toBeTruthy();
  });
});
