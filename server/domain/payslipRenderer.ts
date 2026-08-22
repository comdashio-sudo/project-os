import type { PayrollBreakdown } from "./payroll";

export type PayslipInput = {
  payrollRunId: string;
  payrollEntryId: string;
  employee: { id: string; employeeNumber: string; fullName: string };
  periodStart: Date;
  periodEnd: Date;
  currency: string;
  breakdown: PayrollBreakdown;
};

export type StructuredPayslip = {
  format: "project-os.payslip";
  version: 1;
  payrollRunId: string;
  payrollEntryId: string;
  employee: PayslipInput["employee"];
  period: { start: Date; end: Date };
  currency: string;
  earnings: { grossPay: number };
  deductions: { gosi: number; other: number };
  totals: { netPay: number; laborActualCost: number; eosMonthlyAccrual: number };
};

/**
 * A deliberately format-neutral boundary. It returns safe structured data for the
 * authenticated UI or a future approved delivery renderer; it does not generate a file.
 */
export interface PayslipRenderer {
  render(input: PayslipInput & { otherDeductions: number }): StructuredPayslip;
}

export const structuredPayslipRenderer: PayslipRenderer = {
  render(input) {
    return {
      format: "project-os.payslip",
      version: 1,
      payrollRunId: input.payrollRunId,
      payrollEntryId: input.payrollEntryId,
      employee: input.employee,
      period: { start: input.periodStart, end: input.periodEnd },
      currency: input.currency,
      earnings: { grossPay: input.breakdown.grossPay },
      deductions: { gosi: input.breakdown.gosiDeduction, other: input.otherDeductions },
      totals: {
        netPay: input.breakdown.netPay,
        laborActualCost: input.breakdown.laborActualCost,
        eosMonthlyAccrual: input.breakdown.eosMonthlyAccrual,
      },
    };
  },
};
