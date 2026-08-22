import { describe, expect, it } from "vitest";
import { calculatePayrollBreakdown, calculatePayrollEntryBreakdown } from "./payroll";
import { structuredPayslipRenderer } from "./payslipRenderer";

describe("calculatePayrollBreakdown", () => {
  it("calculates gross, configurable GOSI, net pay, and labor actual cost without storing net", () => {
    expect(calculatePayrollBreakdown({ baseSalary: 10_000, housingAllowance: 2_000, transportAllowance: 800, hardshipAllowance: 200, gosiRate: 0.0975, otherDeductions: 300, eosMonthlyAccrual: 750 })).toEqual({ grossPay: 13_000, gosiDeduction: 1267.5, netPay: 11_432.5, laborActualCost: 13_750, eosMonthlyAccrual: 750 });
  });

  it("calculates a saved entry from its captured deduction rather than reverse-engineering a rounded GOSI rate", () => {
    expect(calculatePayrollEntryBreakdown({ baseSalary: 10_000, housingAllowance: 2_000, transportAllowance: 800, hardshipAllowance: 200, gosiDeduction: 1267.49, otherDeductions: 300, eosMonthlyAccrual: 750 })).toEqual({ grossPay: 13_000, gosiDeduction: 1267.49, netPay: 11_432.51, laborActualCost: 13_750, eosMonthlyAccrual: 750 });
  });

  it("renders a format-neutral structured payslip without creating a PDF or persisting net pay", () => {
    const breakdown = calculatePayrollEntryBreakdown({ baseSalary: 10_000, housingAllowance: 2_000, transportAllowance: 800, hardshipAllowance: 200, gosiDeduction: 1267.49, otherDeductions: 300, eosMonthlyAccrual: 750 });
    expect(structuredPayslipRenderer.render({ payrollRunId: "run-1", payrollEntryId: "entry-1", employee: { id: "employee-1", employeeNumber: "EMP-01", fullName: "Amina Planner" }, periodStart: new Date("2026-08-01T00:00:00.000Z"), periodEnd: new Date("2026-08-31T00:00:00.000Z"), currency: "SAR", otherDeductions: 300, breakdown })).toEqual(expect.objectContaining({ format: "project-os.payslip", version: 1, deductions: { gosi: 1267.49, other: 300 }, totals: { netPay: 11_432.51, laborActualCost: 13_750, eosMonthlyAccrual: 750 } }));
  });
});
