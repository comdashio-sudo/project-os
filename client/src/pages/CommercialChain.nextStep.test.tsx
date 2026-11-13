/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import CommercialChain from "./CommercialChain";

// D-28 (G-170): an empty list in the commercial chain names the next step and takes a person who may use the form there; nobody else sees the button.
const state = vi.hoisted(() => ({ can: true, boq: [] as unknown[], contracts: [] as unknown[] }));
vi.mock("wouter", () => ({ Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a>, useParams: () => ({ tenantId: "tenant-1", projectId: "project-1" }) }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false }) }));
vi.mock("@/lib/permissions", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/permissions")>()), useCan: () => state.can, WriteGate: ({ children }: { children: React.ReactNode }) => (state.can ? <>{children}</> : null) }));
vi.mock("@/lib/trpc", () => {
  const mutation = { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) };
  const list = (rows: () => unknown[]) => ({ useQuery: () => ({ data: rows(), isLoading: false, error: null }) });
  return { trpc: {
    useUtils: () => ({ boq: { list: { invalidate: vi.fn() } }, subcontracts: { list: { invalidate: vi.fn() }, listCertificates: { invalidate: vi.fn() } }, projectInvoices: { list: { invalidate: vi.fn() } } }),
    boq: { list: list(() => state.boq), create: mutation },
    procurement: { register: { useQuery: () => ({ data: { suppliers: [] } }) } },
    subcontracts: { list: list(() => state.contracts), listCertificates: list(() => []), create: mutation, createCertificate: mutation },
    projectInvoices: { list: list(() => []), create: mutation },
  } };
});
afterEach(() => { cleanup(); state.can = true; state.boq = []; state.contracts = []; });

describe("commercial chain empty lists (D-28, G-170)", () => {
  it("each empty list has its next step; the button puts the cursor in that form", async () => {
    render(<CommercialChain />);
    for (const name of ["Add the first BOQ line", "Create the first subcontract", "Add the first invoice"]) expect(screen.getByRole("button", { name })).toBeTruthy();
    await userEvent.setup().click(screen.getByRole("button", { name: "Add the first invoice" }));
    expect(document.getElementById("invoice-form")!.contains(document.activeElement)).toBe(true);
    await userEvent.setup().click(screen.getByRole("button", { name: "Add the first BOQ line" }));
    expect(document.getElementById("boq-form")!.contains(document.activeElement)).toBe(true);
  });

  it("with no subcontract yet, the certificate list sends the person to the contract form first; with one, to the certificate form", async () => {
    render(<CommercialChain />);
    await userEvent.setup().click(screen.getByRole("button", { name: "Create a subcontract first" }));
    expect(document.getElementById("contract-form")!.contains(document.activeElement)).toBe(true);
    cleanup();
    state.contracts = [{ id: "s1", code: "SUB-01", title: "Structure", subcontractorName: "Co", contractValue: "5000", status: "draft" }];
    render(<CommercialChain />);
    expect(screen.queryByRole("button", { name: "Create a subcontract first" })).toBeNull();
    expect(screen.getByRole("button", { name: "Issue the first certificate" })).toBeTruthy();
  });

  it("NEGATIVE: someone who may not add sees the empty line without a button that leads to a form they do not have", () => {
    state.can = false;
    render(<CommercialChain />);
    expect(document.querySelectorAll("[data-empty-list]").length).toBeGreaterThan(0);
    expect(document.querySelectorAll("[data-empty-list] button").length).toBe(0);
  });
});
