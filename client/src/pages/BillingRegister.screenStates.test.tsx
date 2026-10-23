/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import BillingRegister from "./BillingRegister";

// The billing register (/billing/:tenantId): loading says so in the lists (they used to show "no records" while loading), an empty list
// names the next action (issue the first invoice), a missing license sends the person to licensing, and a failed read retries.
const state = vi.hoisted(() => ({
  license: { isLoading: false, isFetching: false, error: null as unknown, data: { license: { subscriptionId: "sub-1" } } as unknown, refetch: vi.fn() },
  register: { isLoading: false, isFetching: false, error: null as unknown, data: { invoices: [] as unknown[], payments: [] as unknown[] } as unknown, refetch: vi.fn() },
}));
const mutation = vi.hoisted(() => () => ({ mutate: vi.fn(), isPending: false, error: null }));

vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "tenant-1" }), Link: ({ href, children }: { href: string; children: React.ReactNode }) => <a href={href}>{children}</a> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ licensing: { tenantLicense: { invalidate: vi.fn() } } }),
  licensing: { tenantLicense: { useQuery: () => state.license } },
  billing: { register: { useQuery: () => state.register }, issueInvoice: { useMutation: mutation }, createPayment: { useMutation: mutation } },
} }));

beforeEach(() => {
  state.license = { isLoading: false, isFetching: false, error: null, data: { license: { subscriptionId: "sub-1" } }, refetch: vi.fn() };
  state.register = { isLoading: false, isFetching: false, error: null, data: { invoices: [], payments: [] }, refetch: vi.fn() };
});

describe("BillingRegister screen states", () => {
  afterEach(cleanup);

  it("the lists say they are loading instead of 'no records yet'", () => {
    state.register = { ...state.register, isLoading: true, data: undefined };
    render(<BillingRegister />);
    expect(screen.getAllByText("Loading…").length).toBeGreaterThan(0);
    expect(screen.queryByText("No records yet.")).toBeNull();
  });

  it("an empty invoice list names the next action: the issue form", () => {
    render(<BillingRegister />);
    expect(screen.getAllByText("No records yet.").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: "Go to invoice issue" })[0].getAttribute("href")).toBe("#billing-issue");
    expect(document.getElementById("billing-issue")).toBeTruthy();
  });

  it("a company with no license is sent to the licensing screen", () => {
    state.license = { ...state.license, data: undefined };
    render(<BillingRegister />);
    expect(screen.getByText("No license is available for invoice issuance.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to licensing" }).getAttribute("href")).toBe("/licensing/tenant-1");
  });

  it("a failed register read shows the error with a retry that refetches the register and the license", () => {
    state.register = { ...state.register, error: { message: "network down" }, data: undefined };
    render(<BillingRegister />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.register.refetch).toHaveBeenCalledTimes(1);
    expect(state.license.refetch).toHaveBeenCalledTimes(1);
  });
});
