/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import CommercialChain from "./CommercialChain";

const state = vi.hoisted(() => ({ arabic: false, createBoq: vi.fn() }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useParams: () => ({ tenantId: "tenant-1", projectId: "project-1" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.arabic }) }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ boq: { list: { invalidate: vi.fn() } }, subcontracts: { list: { invalidate: vi.fn() }, listCertificates: { invalidate: vi.fn() } }, projectInvoices: { list: { invalidate: vi.fn() } } }),
  boq: { list: { useQuery: () => ({ data: [{ id: "b1", code: "BOQ-01", description: "Concrete", unitOfMeasure: "m3", quantity: "10", unitRate: "100", totalAmount: "1000", currency: "SAR" }], isLoading: false, error: null }) }, create: { useMutation: () => ({ mutate: state.createBoq, isPending: false, error: null }) } },
  subcontracts: { list: { useQuery: () => ({ data: [{ id: "s1", code: "SUB-01", title: "Structure", subcontractorName: "Build Co", contractValue: "5000", status: "draft" }], isLoading: false, error: null }) }, listCertificates: { useQuery: () => ({ data: [], isLoading: false, error: null }) }, create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) }, createCertificate: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) } },
  projectInvoices: { list: { useQuery: () => ({ data: [], isLoading: false, error: null }) }, create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) } },
} }));

afterEach(() => { cleanup(); state.createBoq.mockClear(); });
describe("CommercialChain", () => {
  it("submits a BOQ line with the project boundary", async () => {
    state.arabic = false;
    const user = userEvent.setup();
    render(<CommercialChain />);
    await user.type(screen.getAllByLabelText("Code")[0], "BOQ-02");
    await user.type(screen.getByLabelText("Description"), "Steel");
    await user.type(screen.getByLabelText("Unit"), "ton");
    await user.type(screen.getByLabelText("Quantity"), "4");
    await user.clear(screen.getAllByLabelText("Currency")[0]);
    await user.type(screen.getAllByLabelText("Currency")[0], "SAR");
    await user.type(screen.getByLabelText("Unit rate"), "250");
    await user.click(screen.getByRole("button", { name: "Add BOQ line" }));
    expect(state.createBoq).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", code: "BOQ-02", quantity: 4, unitRate: 250, currency: "SAR" }));
  });
  it("localizes the chain headings in Arabic", () => {
    state.arabic = true;
    render(<CommercialChain />);
    expect(screen.getByText("سلسلة الضبط التجاري")).toBeTruthy();
    expect(screen.getByText("بنود الحصر BOQ")).toBeTruthy();
    expect(screen.getByText("عقود المقاولين")).toBeTruthy();
    state.arabic = false;
  });
});
