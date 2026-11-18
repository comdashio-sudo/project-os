/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import CommercialChain from "./CommercialChain";

// G-214: the certificate list offers the next step of each certificate (draft → submit/cancel, submitted → approve/cancel, approved → record payment, paid →
// nothing) to whoever manages commitments, and nothing to anyone else; the step goes to the server with the project boundary.
const cert = (id: string, status: string) => ({ id, certificateNumber: id.toUpperCase(), status, grossAmount: "1000", lines: [] });
const state = vi.hoisted(() => ({ arabic: false, can: true, transition: vi.fn(), createBoq: vi.fn(), certificates: [] as unknown[] }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useParams: () => ({ tenantId: "tenant-1", projectId: "project-1" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.arabic, language: (state.arabic) ? "ar" : "en", isRtl: state.arabic }) }));
vi.mock("@/lib/permissions", async importOriginal => ({ ...(await importOriginal<object>()), useCan: () => state.can, WriteGate: ({ children }: { children: React.ReactNode }) => (state.can ? <>{children}</> : null) }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ boq: { list: { invalidate: vi.fn() } }, subcontracts: { list: { invalidate: vi.fn() }, listCertificates: { invalidate: vi.fn() } }, projectInvoices: { list: { invalidate: vi.fn() } } }),
  boq: { list: { useQuery: () => ({ data: [{ id: "b1", code: "BOQ-01", description: "Concrete", unitOfMeasure: "m3", quantity: "10", unitRate: "100", totalAmount: "1000", currency: "SAR" }], isLoading: false, error: null }) }, create: { useMutation: () => ({ mutate: state.createBoq, isPending: false, error: null }) } },
  procurement: { register: { useQuery: () => ({ data: { suppliers: [{ id: "sup-1", code: "SUP-01", legalName: "Build Co", active: true }] } }) } },
  subcontracts: { list: { useQuery: () => ({ data: [{ id: "s1", code: "SUB-01", title: "Structure", subcontractorName: "Build Co", contractValue: "5000", status: "draft" }], isLoading: false, error: null }) }, listCertificates: { useQuery: () => ({ data: state.certificates, isLoading: false, error: null }) }, transitionCertificate: { useMutation: () => ({ mutate: state.transition, isPending: false, error: null }) }, create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) }, createCertificate: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) } },
  projectInvoices: { list: { useQuery: () => ({ data: [], isLoading: false, error: null }) }, create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) } },
} }));

afterEach(() => { cleanup(); state.transition.mockClear(); state.can = true; state.arabic = false; });
const actions = (id: string) => document.querySelector<HTMLElement>(`[data-certificate-actions="${id}"]`);

describe("CommercialChain certificate status (G-214)", () => {
  it("offers each certificate its next steps only", () => {
    state.certificates = [cert("c-draft", "draft"), cert("c-sub", "submitted"), cert("c-ok", "approved"), cert("c-paid", "paid")];
    render(<CommercialChain />);
    expect(within(actions("c-draft")!).getAllByRole("button").map(button => button.textContent)).toEqual(["Submit", "Cancel"]);
    expect(within(actions("c-sub")!).getAllByRole("button").map(button => button.textContent)).toEqual(["Approve", "Cancel"]);
    expect(within(actions("c-ok")!).getAllByRole("button").map(button => button.textContent)).toEqual(["Record payment"]);
    expect(actions("c-paid")).toBeNull();
  });

  it("sends the step with the project boundary", async () => {
    state.certificates = [cert("c-sub", "submitted")];
    render(<CommercialChain />);
    await userEvent.setup().click(within(actions("c-sub")!).getByRole("button", { name: "Approve" }));
    expect(state.transition).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1", certificateId: "c-sub", nextStatus: "approved" });
  });

  it("NEGATIVE: without project.commitment.manage no step is offered", () => {
    state.can = false;
    state.certificates = [cert("c-draft", "draft"), cert("c-ok", "approved")];
    render(<CommercialChain />);
    expect(actions("c-draft")).toBeNull();
    expect(actions("c-ok")).toBeNull();
  });

  it("names the steps in Arabic", () => {
    state.arabic = true;
    state.certificates = [cert("c-draft", "draft"), cert("c-ok", "approved")];
    render(<CommercialChain />);
    expect(within(actions("c-draft")!).getAllByRole("button").map(button => button.textContent)).toEqual(["إرسال", "إلغاء"]);
    expect(within(actions("c-ok")!).getAllByRole("button").map(button => button.textContent)).toEqual(["تسجيل الدفع"]);
  });
});
