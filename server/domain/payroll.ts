export type PayrollBreakdownInput = {
  baseSalary: number;
  housingAllowance: number;
  transportAllowance: number;
  hardshipAllowance: number;
  gosiRate: number;
  otherDeductions: number;
  eosMonthlyAccrual: number;
};

export type PayrollEntryBreakdownInput = Omit<PayrollBreakdownInput, "gosiRate"> & {
  gosiDeduction: number;
};

export type PayrollBreakdown = {
  grossPay: number;
  gosiDeduction: number;
  netPay: number;
  laborActualCost: number;
  eosMonthlyAccrual: number;
};

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function calculatePayrollBreakdown(input: PayrollBreakdownInput): PayrollBreakdown {
  const grossPay = money(input.baseSalary + input.housingAllowance + input.transportAllowance + input.hardshipAllowance);
  const gosiDeduction = money(grossPay * input.gosiRate);
  const netPay = money(grossPay - gosiDeduction - input.otherDeductions);
  const laborActualCost = money(grossPay + input.eosMonthlyAccrual);
  return { grossPay, gosiDeduction, netPay, laborActualCost, eosMonthlyAccrual: money(input.eosMonthlyAccrual) };
}

/**
 * Rebuilds payroll totals from the immutable amounts captured in a payroll entry.
 * The GOSI deduction is deliberately used as stored; a rounded deduction must never
 * be reverse-engineered into a rate during a sensitive read.
 */
export function calculatePayrollEntryBreakdown(input: PayrollEntryBreakdownInput): PayrollBreakdown {
  const grossPay = money(input.baseSalary + input.housingAllowance + input.transportAllowance + input.hardshipAllowance);
  const gosiDeduction = money(input.gosiDeduction);
  const netPay = money(grossPay - gosiDeduction - input.otherDeductions);
  const eosMonthlyAccrual = money(input.eosMonthlyAccrual);
  return { grossPay, gosiDeduction, netPay, laborActualCost: money(grossPay + eosMonthlyAccrual), eosMonthlyAccrual };
}
