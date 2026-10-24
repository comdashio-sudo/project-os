/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import ProjectProfitability from "./ProjectProfitability";

// The profitability page (/projects/:t/:p/profitability): figures say they are loading instead of showing zeros, a refused financial source
// gives the server's sentence (G-163), and a failed source offers a retry on all four reads.
const FORBIDDEN_EN = "You do not have the required permission to complete this operation.";
const forbidden = { message: "PROJECT_OS_PERMISSION_DENIED", data: { code: "FORBIDDEN", projectError: { code: "PROJECT_OS_PERMISSION_DENIED", messages: { ar: "لا تملك الصلاحية المطلوبة لإتمام هذه العملية.", en: FORBIDDEN_EN } } } };

const state = vi.hoisted(() => ({ reads: {} as Record<string, { isLoading: boolean; isFetching: boolean; error: unknown; data: unknown; refetch: () => void }> }));
const read = (name: string) => state.reads[name] ?? { isLoading: false, isFetching: false, error: null, data: [], refetch: vi.fn() };

vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "tenant-1", projectId: "project-1" }), Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: (false) ? "ar" : "en", isRtl: false }) }));
vi.mock("./ProjectFpac", () => ({ ProjectFpac: () => null }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  projects: { getControlsFinancials: { useQuery: () => read("financials") } },
  boq: { list: { useQuery: () => read("boq") } },
  subcontracts: { list: { useQuery: () => read("contracts") } },
  projectInvoices: { list: { useQuery: () => read("invoices") } },
} }));

beforeEach(() => { state.reads = {}; });

describe("ProjectProfitability screen states", () => {
  afterEach(cleanup);

  it("while the figures load, the page says so", () => {
    state.reads = { financials: { isLoading: true, isFetching: true, error: null, data: undefined, refetch: vi.fn() } };
    render(<ProjectProfitability />);
    expect(screen.getByRole("status").textContent).toContain("Loading profitability figures…");
  });

  it("a refused financial source shows the server's sentence and no retry", () => {
    state.reads = { financials: { isLoading: false, isFetching: false, error: forbidden, data: undefined, refetch: vi.fn() } };
    render(<ProjectProfitability />);
    expect(screen.getByText(FORBIDDEN_EN)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("a failed source offers a retry that refetches all four sources", () => {
    const refetches = ["financials", "boq", "contracts", "invoices"].map(() => vi.fn());
    ["financials", "boq", "contracts", "invoices"].forEach((name, index) => {
      state.reads[name] = { isLoading: false, isFetching: false, error: index === 0 ? { message: "network down" } : null, data: [], refetch: refetches[index] };
    });
    render(<ProjectProfitability />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    refetches.forEach(refetch => expect(refetch).toHaveBeenCalledTimes(1));
  });
});
