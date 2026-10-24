// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PayrollPanel } from "./PayrollPanel";

const state = vi.hoisted(() => ({
  isArabic: false,
  capabilities: { canManageStructure: true, canRunPayroll: false, canApprovePayroll: false, canReadSensitivePayroll: true },
  runs: [] as Array<{ id: string; periodStart: Date; periodEnd: Date; status: "draft" | "review" | "approved" | "paid"; entryCount: number }>,
  structureQuery: vi.fn(), detailsQuery: vi.fn(), save: vi.fn(), createRun: vi.fn(), transition: vi.fn(), allocate: vi.fn(), byHours: vi.fn(), adjust: vi.fn(), shares: [] as Array<{ id: string; projectCode: string; wbsCode: string | null; amount: number; source: "manual" | "auto_hours"; hoursBasis: number | null; sharePercent: number | null }>,
}));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.isArabic, language: (state.isArabic) ? "ar" : "en", isRtl: state.isArabic }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized payroll error" }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    employees: {
      list: { useQuery: () => ({ data: [{ id: "employee-1", employeeNumber: "EMP-01", fullName: "Amina Planner" }], error: null, isLoading: false }) },
      payroll: {
        capabilities: { useQuery: () => ({ data: state.capabilities, error: null, isLoading: false }) },
        runs: { useQuery: () => ({ data: state.runs, error: null, isLoading: false, refetch: vi.fn() }) },
        allocationProjects: { useQuery: () => ({ data: [{ id: "project-1", code: "PRJ-01", name: "Payroll project" }], error: null }) },
        allocationOptions: { useQuery: () => ({ data: { wbs: [{ id: "wbs-1", code: "WBS-01", name: "Payroll work package" }], activities: [{ id: "activity-1", code: "ACT-01", name: "Payroll activity", wbsItemId: "wbs-1" }] }, error: null }) },
        salaryStructure: {
          get: { useQuery: (...args: unknown[]) => { state.structureQuery(...args); return { data: { id: "structure-1", baseSalary: "10000.00", housingAllowance: "2000.00", gosiRate: "0.0975", eosMonthlyAccrual: "750.00", currency: "SAR" }, error: null, isLoading: false }; } },
          save: { useMutation: () => ({ mutate: state.save, isPending: false, error: null }) },
        },
        details: { useQuery: (...args: unknown[]) => { state.detailsQuery(...args); return { data: { run: { status: "approved" }, entries: [{ id: "entry-1", employeeNumber: "EMP-01", fullName: "Amina Planner", grossPay: 13000, netPay: 11432.5, laborActualCost: 13750, loadedCost: 14292.5, employerSocialInsurance: "1292.50", nationalityClass: "saudi", allocations: state.shares, currency: "SAR" }], payslips: [{ payrollEntryId: "entry-1", format: "project-os.payslip", version: 1 }] }, error: null, isLoading: false, refetch: vi.fn() }; } },
        createRun: { useMutation: () => ({ mutate: state.createRun, isPending: false, error: null }) },
        transition: { useMutation: () => ({ mutate: state.transition, isPending: false, error: null }) },
        allocateCost: { useMutation: () => ({ mutate: state.allocate, isPending: false, error: null }) },
        allocateByHours: { useMutation: () => ({ mutate: state.byHours, isPending: false, error: null }) },
        adjustAllocation: { useMutation: () => ({ mutate: state.adjust, isPending: false, error: null }) },
      },
    },
  },
}));

describe("PayrollPanel", () => {
  beforeEach(() => {
    cleanup();
    state.isArabic = false;
    state.capabilities = { canManageStructure: true, canRunPayroll: false, canApprovePayroll: false, canReadSensitivePayroll: true };
    state.runs = []; state.shares = [];
    state.structureQuery.mockReset(); state.detailsQuery.mockReset(); state.transition.mockReset();
  });

  it("does not request or render salary and payslip details before an explicit protected-data action", () => {
    render(<PayrollPanel tenantId="tenant-1" />);
    expect(screen.getByText("No payroll run has been created in this workspace.")).toBeTruthy();
    expect(screen.queryByText(/Calculated net pay/)).toBeNull();
    expect(state.structureQuery).toHaveBeenLastCalledWith(expect.objectContaining({ employeeId: "00000000-0000-0000-0000-000000000000" }), expect.objectContaining({ enabled: false }));
    expect(state.detailsQuery).toHaveBeenLastCalledWith(expect.objectContaining({ payrollRunId: "00000000-0000-0000-0000-000000000000" }), expect.objectContaining({ enabled: false }));
    fireEvent.change(screen.getByLabelText("Employee"), { target: { value: "employee-1" } });
    fireEvent.click(screen.getByRole("button", { name: "View protected salary structure" }));
    expect(screen.getByRole("dialog", { name: "Protected salary structure" })).toBeTruthy();
    expect(screen.getByText("This sensitive read is recorded in the audit log.")).toBeTruthy();
    expect(state.structureQuery.mock.calls.some(([, options]) => (options as { enabled?: boolean }).enabled)).toBe(true);
  });

  it("shows finance only the review approval action and keeps payroll details behind an explicit audited view", () => {
    state.capabilities = { canManageStructure: false, canRunPayroll: false, canApprovePayroll: true, canReadSensitivePayroll: true };
    state.runs = [{ id: "run-1", periodStart: new Date("2026-09-01T00:00:00Z"), periodEnd: new Date("2026-09-30T00:00:00Z"), status: "review", entryCount: 1 }];
    render(<PayrollPanel tenantId="tenant-1" />);
    expect(screen.queryByText("Base salary")).toBeNull();
    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect(state.transition).toHaveBeenCalledWith({ tenantId: "tenant-1", payrollRunId: "run-1", status: "approved" });
    expect(state.detailsQuery.mock.calls.some(([, options]) => (options as { enabled?: boolean }).enabled)).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "View protected details & payslips" }));
    expect(screen.getByRole("dialog", { name: "Protected payroll details" })).toBeTruthy();
    expect(state.detailsQuery.mock.calls.some(([, options]) => (options as { enabled?: boolean }).enabled)).toBe(true);
  });

  it("keeps the Arabic finance details and payslip hidden until an explicit audited request", () => {
    state.isArabic = true;
    state.capabilities = { canManageStructure: false, canRunPayroll: false, canApprovePayroll: true, canReadSensitivePayroll: true };
    state.runs = [{ id: "run-1", periodStart: new Date("2026-09-01T00:00:00Z"), periodEnd: new Date("2026-09-30T00:00:00Z"), status: "review", entryCount: 1 }];
    render(<PayrollPanel tenantId="tenant-1" />);
    expect(screen.getByRole("button", { name: "اعتماد" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "تفاصيل الرواتب المحمية" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "عرض التفاصيل والقصائم المحمية" }));
    expect(screen.getByRole("dialog", { name: "تفاصيل الرواتب المحمية" })).toBeTruthy();
    expect(screen.getByText("هذه القراءة الحساسة مسجلة في سجل التدقيق.")).toBeTruthy();
    expect(state.detailsQuery.mock.calls.some(([, options]) => (options as { enabled?: boolean }).enabled)).toBe(true);
  });

  it("selects a project, WBS and activity before posting the approved payroll allocation", () => {
    state.capabilities = { canManageStructure: false, canRunPayroll: false, canApprovePayroll: true, canReadSensitivePayroll: true };
    state.runs = [{ id: "run-1", periodStart: new Date("2026-09-01T00:00:00Z"), periodEnd: new Date("2026-09-30T00:00:00Z"), status: "approved", entryCount: 1 }];
    render(<PayrollPanel tenantId="tenant-1" />);
    fireEvent.click(screen.getByRole("button", { name: "View protected details & payslips" }));
    expect(screen.getByText("Allocate labor cost")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Payroll entry"), { target: { value: "entry-1" } });
    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "project-1" } });
    fireEvent.change(screen.getByLabelText("WBS item"), { target: { value: "wbs-1" } });
    fireEvent.change(screen.getByLabelText("Activity"), { target: { value: "activity-1" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "13750" } });
    fireEvent.change(screen.getByLabelText("Incurred date"), { target: { value: "2026-09-30" } });
    fireEvent.click(screen.getByRole("button", { name: "Post cost" }));
    expect(state.allocate).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", payrollEntryId: "entry-1", projectId: "project-1", wbsItemId: "wbs-1", activityId: "activity-1", amount: 13750, incurredAt: new Date("2026-09-30T00:00:00Z") }));
  });

  it("lets the approver share an approved month by hours, and adjust a share only with a reason that is sent with the new amount", () => {
    state.capabilities = { canManageStructure: false, canRunPayroll: false, canApprovePayroll: true, canReadSensitivePayroll: true };
    state.runs = [{ id: "run-1", periodStart: new Date("2026-11-01"), periodEnd: new Date("2026-11-30"), status: "approved", entryCount: 1 }];
    render(<PayrollPanel tenantId="tenant-1" />);
    fireEvent.click(screen.getByRole("button", { name: "View protected details & payslips" }));
    expect(screen.getByText(/not a legal calculation/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Share by approved hours" }));
    expect(state.byHours).toHaveBeenCalledWith({ tenantId: "tenant-1", payrollEntryId: "entry-1" });
  });

  it("shows each automatic share with its hours, and will not save an adjustment without a reason", () => {
    state.capabilities = { canManageStructure: false, canRunPayroll: false, canApprovePayroll: true, canReadSensitivePayroll: true };
    state.runs = [{ id: "run-1", periodStart: new Date("2026-11-01"), periodEnd: new Date("2026-11-30"), status: "approved", entryCount: 1 }];
    state.shares = [{ id: "share-1", projectCode: "PRJ-01", wbsCode: "WBS-01", amount: 8575.5, source: "auto_hours", hoursBasis: 24, sharePercent: 60 }];
    render(<PayrollPanel tenantId="tenant-1" />);
    fireEvent.click(screen.getByRole("button", { name: "View protected details & payslips" }));
    expect(screen.queryByRole("button", { name: "Share by approved hours" })).toBeNull(); // already shared
    expect(screen.getByText(/automatic, by hours: 24 h · 60%/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Adjust share" }));
    fireEvent.change(screen.getByLabelText("New amount"), { target: { value: "8000" } });
    const save = screen.getByRole("button", { name: "Save adjustment" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true); // no reason yet
    fireEvent.change(screen.getByLabelText("Reason for the change (required)"), { target: { value: "Crew moved to the roof" } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(state.adjust).toHaveBeenCalledWith({ tenantId: "tenant-1", allocationId: "share-1", newAmount: 8000, reason: "Crew moved to the roof" });
  });
});
