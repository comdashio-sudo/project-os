// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PayrollPanel } from "./PayrollPanel";
import { expectEmptySubmitRefused } from "@/test/checkedFormExpect";

const state = vi.hoisted(() => ({
  denied: new Set<string>(), employeesQuery: vi.fn(),
  isArabic: false,
  capabilities: { canManageStructure: true, canRunPayroll: false, canApprovePayroll: false, canReadSensitivePayroll: true },
  runs: [] as Array<{ id: string; periodStart: Date; periodEnd: Date; status: "draft" | "review" | "approved" | "paid"; entryCount: number }>,
  structureQuery: vi.fn(), detailsQuery: vi.fn(), save: vi.fn(), createRun: vi.fn(), transition: vi.fn(), allocate: vi.fn(), byHours: vi.fn(), adjust: vi.fn(), shares: [] as Array<{ id: string; projectCode: string; wbsCode: string | null; amount: number; source: "manual" | "auto_hours"; hoursBasis: number | null; sharePercent: number | null }>,
}));

vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: (await import("../test/dsSelectStandIn")).NativeSelect }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.isArabic, language: (state.isArabic) ? "ar" : "en", isRtl: state.isArabic }) }));
vi.mock("@/lib/permissions", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/permissions")>()), useCan: (code: string) => !state.denied.has(code) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized payroll error" }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    employees: {
      payroll: {
        capabilities: { useQuery: () => ({ data: state.capabilities, error: null, isLoading: false }) },
        runs: { useQuery: () => ({ data: state.runs, error: null, isLoading: false, refetch: vi.fn() }) },
        allocationProjects: { useQuery: () => ({ data: [{ id: "project-1", code: "PRJ-01", name: "Payroll project" }], error: null }) },
        allocationOptions: { useQuery: () => ({ data: { wbs: [{ id: "wbs-1", code: "WBS-01", name: "Payroll work package" }], activities: [{ id: "activity-1", code: "ACT-01", name: "Payroll activity", wbsItemId: "wbs-1" }] }, error: null }) },
        salaryStructure: {
          employees: { useQuery: (...args: unknown[]) => { state.employeesQuery(...args); return { data: [{ id: "employee-1", employeeNumber: "EMP-01", fullName: "Amina Planner" }], error: null, isLoading: false }; } },
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
    state.denied.clear(); state.employeesQuery.mockReset();
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

  it("a payroll allocation with the WBS and activity lists put back on \"—\" posts neither: the sentinel never reaches the server (D-75 negative)", () => {
    state.capabilities = { canManageStructure: false, canRunPayroll: false, canApprovePayroll: true, canReadSensitivePayroll: true };
    state.runs = [{ id: "run-1", periodStart: new Date("2026-09-01T00:00:00Z"), periodEnd: new Date("2026-09-30T00:00:00Z"), status: "approved", entryCount: 1 }];
    render(<PayrollPanel tenantId="tenant-1" />);
    fireEvent.click(screen.getByRole("button", { name: "View protected details & payslips" }));
    fireEvent.change(screen.getByLabelText("Payroll entry"), { target: { value: "entry-1" } });
    fireEvent.change(screen.getByLabelText("Project"), { target: { value: "project-1" } });
    fireEvent.change(screen.getByLabelText("WBS item"), { target: { value: "wbs-1" } });
    fireEvent.change(screen.getByLabelText("WBS item"), { target: { value: "__none" } });
    fireEvent.change(screen.getByLabelText("Activity"), { target: { value: "activity-1" } });
    fireEvent.change(screen.getByLabelText("Activity"), { target: { value: "__none" } });
    fireEvent.change(screen.getByLabelText("Amount"), { target: { value: "13750" } });
    fireEvent.change(screen.getByLabelText("Incurred date"), { target: { value: "2026-09-30" } });
    fireEvent.click(screen.getByRole("button", { name: "Post cost" }));
    expect(state.allocate.mock.calls.at(-1)?.[0]).toMatchObject({ projectId: "project-1", wbsItemId: undefined, activityId: undefined });
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

describe("PayrollPanel salary-structure form checks itself in the page's language (D-63)", () => {
  it("an empty structure saves nothing and says so in Arabic under the first empty field", () => {
    cleanup();
    state.isArabic = true;
    state.capabilities = { canManageStructure: true, canRunPayroll: false, canApprovePayroll: false, canReadSensitivePayroll: true };
    render(<PayrollPanel tenantId="tenant-1" />);
    const form = document.querySelector<HTMLInputElement>('input[inputmode="decimal"][required]')!.form!;
    expectEmptySubmitRefused(form, "ar", state.save);
    state.isArabic = false;
  });

});

describe("Q-38 (P1-06): fields named, sensitive reads asked for only by whom the server allows", () => {
  beforeEach(() => { cleanup(); state.denied.clear(); state.employeesQuery.mockReset(); state.structureQuery.mockReset(); state.isArabic = false; });

  it("Q-38: the structure's amounts are named above their boxes, and the GOSI rate says it is a fraction, not a percentage", () => {
    render(<PayrollPanel tenantId="tenant-1" />);
    const gosi = screen.getByLabelText("GOSI rate");
    expect(gosi.closest("label")!.textContent).toContain("A fraction between 0 and 1, not a percentage: 0.0975 means 9.75%.");
    expect(screen.getByLabelText("Base salary").closest("label")!.querySelector("span")!.textContent).toBe("Base salary");
  });

  it("Q-38 batch 2: whoever sets structures chooses the employee by number and name without the employee register permission (project.hr.manage)", () => {
    state.denied.add("project.hr.manage");
    render(<PayrollPanel tenantId="tenant-1" />);
    expect(screen.queryByRole("note")).toBeNull(); // no «ask for the HR permission» sentence any more
    expect(state.employeesQuery).toHaveBeenCalledWith({ tenantId: "tenant-1" }, { enabled: true });
    expect(document.body.textContent).toContain("EMP-01 · Amina Planner");
  });

  it("Q-38 batch 2 NEGATIVE: without project.payroll.structure the list is never asked for", () => {
    state.capabilities = { ...state.capabilities, canManageStructure: false };
    render(<PayrollPanel tenantId="tenant-1" />);
    expect(state.employeesQuery.mock.calls.every(([, options]) => !(options as { enabled?: boolean }).enabled)).toBe(true);
    state.capabilities = { ...state.capabilities, canManageStructure: true };
  });

  it("Q-38 NEGATIVE: without the sensitive payroll read, «view the protected structure» is not offered and the structure is never asked for", () => {
    state.capabilities = { ...state.capabilities, canReadSensitivePayroll: false };
    render(<PayrollPanel tenantId="tenant-1" />);
    expect(screen.queryByRole("button", { name: /protected salary structure/i })).toBeNull();
    expect(state.structureQuery.mock.calls.every(([, options]) => !(options as { enabled?: boolean }).enabled)).toBe(true);
    state.capabilities = { ...state.capabilities, canReadSensitivePayroll: true };
  });
});
