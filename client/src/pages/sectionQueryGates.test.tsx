/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectFpac } from "./ProjectFpac";
import { PayrollPanel } from "./PayrollPanel";
import QuickIssue from "./QuickIssue";

// G-212: a section's read is asked for only by someone the server lets read it. Each query records whether it was enabled; a person known not to hold
// the permission sees the translated «no permission» note and makes no refused call. The server still refuses on its own (tested with each procedure).
const state = vi.hoisted(() => ({ allowed: true, loading: false, capabilities: {} as Record<string, boolean>, enabled: new Map<string, boolean>() }));
vi.mock("@/lib/permissions", () => ({
  useCan: () => state.allowed,
  usePermissionsLoading: () => state.loading,
  WriteGate: ({ children }: { children: React.ReactNode }) => (state.allowed ? <>{children}</> : null),
}));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false }), useOptionalLanguage: () => "en" }));
vi.mock("wouter", async importOriginal => ({ ...(await importOriginal<typeof import("wouter")>()), useParams: () => ({ tenantId: "t-1", projectId: "p-1" }) }));
vi.mock("./LabourLoadingCard", () => ({ default: () => null }));
vi.mock("./CashFlowMonthly", () => ({ default: () => null }));
vi.mock("./ProjectInvoicesPanel", () => ({ default: () => null }));

function procedures(path: string[]): unknown {
  return new Proxy(() => undefined, { get(_target, key: string) {
    const name = path.join(".");
    if (key === "useQuery") return (_input: unknown, options?: { enabled?: boolean }) => {
      state.enabled.set(name, options?.enabled !== false);
      if (name.endsWith("payroll.capabilities")) return { isLoading: false, isFetching: false, error: null, data: state.capabilities, refetch: vi.fn() };
      return { isLoading: false, isFetching: false, error: null, data: undefined, refetch: vi.fn() };
    };
    if (key === "useMutation") return () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false });
    if (key === "useUtils") return () => new Proxy({}, { get: () => procedures([]) });
    if (key === "useContext") return () => new Proxy({}, { get: () => procedures([]) });
    return procedures([...path, key]);
  } });
}
vi.mock("@/lib/trpc", () => ({ trpc: procedures([]), api: procedures([]) }));

afterEach(() => { cleanup(); state.allowed = true; state.loading = false; state.capabilities = {}; state.enabled.clear(); });

describe("G-212: profitability (ProjectFpac) asks only with project.cashflow.read", () => {
  it("with the permission: both reads are asked for", () => {
    render(<ProjectFpac tenantId="t-1" projectId="p-1" />);
    expect(state.enabled.get("profitability.project")).toBe(true);
    expect(state.enabled.get("profitability.history")).toBe(true);
  });
  it("NEGATIVE: without it: no read is asked for, and the section says why", () => {
    state.allowed = false; render(<ProjectFpac tenantId="t-1" projectId="p-1" />);
    expect(state.enabled.get("profitability.project")).toBe(false);
    expect(state.enabled.get("profitability.history")).toBe(false);
    expect(document.querySelector("[data-fpac-denied] [data-screen-state=no-permission]")).toBeTruthy();
  });
  it("while the permissions load: nothing is asked for and no «no permission» flashes", () => {
    state.allowed = false; state.loading = true; render(<ProjectFpac tenantId="t-1" projectId="p-1" />);
    expect(state.enabled.get("profitability.project")).toBe(false);
    expect(document.querySelector("[data-screen-state=no-permission]")).toBeNull();
  });
});

describe("G-212: payroll runs are asked for only with a payroll permission", () => {
  it("with one payroll permission: the runs are read", () => {
    state.capabilities = { canRunPayroll: true }; render(<PayrollPanel tenantId="t-1" />);
    expect(state.enabled.get("employees.payroll.runs") ?? state.enabled.get("payroll.runs")).toBe(true);
  });
  it("NEGATIVE: with none: the runs are never asked for", () => {
    state.capabilities = { canManageStructure: false, canRunPayroll: false, canApprovePayroll: false, canReadSensitivePayroll: false }; render(<PayrollPanel tenantId="t-1" />);
    expect(state.enabled.get("employees.payroll.runs") ?? state.enabled.get("payroll.runs")).toBe(false);
  });
});

describe("G-212: the quick issue asks for its cells only with project.inventory.manage", () => {
  it("with the permission: the cells are read", () => {
    render(<QuickIssue />);
    expect(state.enabled.get("warehouses.cellOptions")).toBe(true);
    expect(screen.queryByRole("note")).toBeNull();
  });
  it("NEGATIVE: known not to hold it: no read, and the screen says why", () => {
    state.allowed = false; render(<QuickIssue />);
    expect(state.enabled.get("warehouses.cellOptions")).toBe(false);
    expect(document.querySelector("[data-screen-state=no-permission]")).toBeTruthy();
  });
  it("online while the permissions load: it waits, so no refused call is made", () => {
    state.allowed = false; state.loading = true; render(<QuickIssue />);
    expect(state.enabled.get("warehouses.cellOptions")).toBe(false);
    expect(document.querySelector("[data-screen-state=no-permission]")).toBeNull();
  });
  it("offline the permissions cannot arrive: the read still goes, so the field screen keeps working", () => {
    const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    try { state.allowed = false; state.loading = true; render(<QuickIssue />); expect(state.enabled.get("warehouses.cellOptions")).toBe(true); }
    finally { online.mockRestore(); }
  });
});
