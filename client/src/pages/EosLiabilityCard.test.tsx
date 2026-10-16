// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EosLiabilityCard } from "./EosLiabilityCard";

const state = vi.hoisted(() => ({ arabic: false, canRead: true, query: {} as Record<string, unknown>, enabled: vi.fn() }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.arabic }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized payroll error" }));
vi.mock("@/lib/trpc", () => ({ trpc: { employees: { payroll: {
  capabilities: { useQuery: () => ({ data: { canReadSensitivePayroll: state.canRead } }) },
  eosLiability: { useQuery: (_input: unknown, options: { enabled: boolean }) => { state.enabled(options.enabled); return state.query; } },
} } } }));
afterEach(() => { cleanup(); state.arabic = false; state.canRead = true; state.query = {}; vi.clearAllMocks(); });

const data = { months: [{ month: "2026-11", accrued: 500.75, cumulative: 500.75, employees: 2 }, { month: "2026-12", accrued: 300.5, cumulative: 801.25, employees: 1 }], total: 801.25, currencies: ["SAR"], employees: [{ employeeId: "c", employeeNumber: "E-C", fullName: "Employee C", cumulative: 601 }, { employeeId: "d", employeeNumber: "E-D", fullName: "Employee D", cumulative: 200.25 }] };

describe("EosLiabilityCard", () => {
  it("shows nothing, and does not even ask the server, to a role that may not read pay", () => {
    state.canRead = false;
    const { container } = render(<EosLiabilityCard tenantId="t" />);
    expect(container.textContent).toBe("");
    expect(state.enabled).toHaveBeenCalledWith(false);
  });
  it("lists each month with its cumulative balance, the total, the per-employee balances, and says it is not a legal calculation", () => {
    state.query = { data, isLoading: false, error: null };
    render(<EosLiabilityCard tenantId="t" />);
    expect(screen.getByText("2026-12").closest("tr")?.textContent).toContain("801.25");
    expect(screen.getByText("Total").closest("tr")?.textContent).toContain("801.25");
    expect(screen.getByText("E-C · Employee C").closest("li")?.textContent).toContain("601.00");
    expect(screen.getByText(/A cost estimate, not a legal calculation/)).toBeTruthy(); // the sentence the owner asked for
  });
  it("renders empty, loading and error states, a mixed-currency warning, and Arabic", () => {
    state.query = { data: { ...data, months: [] }, isLoading: false, error: null };
    render(<EosLiabilityCard tenantId="t" />);
    expect(screen.getByText("No approved runs with accruals yet.")).toBeTruthy();
    cleanup();
    state.query = { data: undefined, isLoading: true, error: null };
    render(<EosLiabilityCard tenantId="t" />);
    expect(screen.getByRole("status").textContent).toBe("Loading…");
    cleanup();
    state.query = { data: undefined, isLoading: false, error: new Error("x") };
    render(<EosLiabilityCard tenantId="t" />);
    expect(screen.getByRole("alert").textContent).toBe("Localized payroll error");
    cleanup();
    state.query = { data: { ...data, currencies: ["SAR", "USD"] }, isLoading: false, error: null };
    render(<EosLiabilityCard tenantId="t" />);
    expect(screen.getByText(/different currencies/)).toBeTruthy();
    cleanup();
    state.arabic = true; state.query = { data, isLoading: false, error: null };
    render(<EosLiabilityCard tenantId="t" />);
    expect(screen.getByText("التزام نهاية الخدمة التراكمي")).toBeTruthy();
  });
});
