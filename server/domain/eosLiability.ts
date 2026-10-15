// End-of-service accrual as a cumulative liability (G-122).
//
// Each approved or paid payroll run carries a monthly accrual per employee (`eosMonthlyAccrual`, entered on the salary
// structure). The liability the company is carrying at the end of a month is the sum of every accrual booked up to that
// month. This is a bookkeeping total of what was accrued; it is not an actuarial or labour-law end-of-service
// calculation (no service-length formula), and the screen says so.
export type EosAccrualRow = { employeeId: string; periodEnd: Date; amount: number };
export type EosMonth = { month: string; accrued: number; cumulative: number; employees: number };
export type EosLiability = { months: EosMonth[]; employees: Array<{ employeeId: string; cumulative: number }>; total: number };

const cents = (value: number) => Math.round(value * 100);
const fromCents = (value: number) => value / 100;
const monthOf = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

export function cumulativeEosLiability(rows: EosAccrualRow[]): EosLiability {
  const byMonth = new Map<string, { accrued: number; employees: Set<string> }>();
  const byEmployee = new Map<string, number>();
  for (const row of rows) {
    if (!Number.isFinite(row.amount) || row.amount < 0) throw new Error("PROJECT_OS_PAYROLL_AMOUNT_INVALID");
    const month = monthOf(row.periodEnd);
    const bucket = byMonth.get(month) ?? { accrued: 0, employees: new Set<string>() };
    bucket.accrued += cents(row.amount);
    if (row.amount > 0) bucket.employees.add(row.employeeId);
    byMonth.set(month, bucket);
    byEmployee.set(row.employeeId, (byEmployee.get(row.employeeId) ?? 0) + cents(row.amount));
  }
  let running = 0;
  const months = Array.from(byMonth.keys()).sort().map(month => {
    const bucket = byMonth.get(month)!;
    running += bucket.accrued;
    return { month, accrued: fromCents(bucket.accrued), cumulative: fromCents(running), employees: bucket.employees.size };
  });
  const employees = Array.from(byEmployee, ([employeeId, value]) => ({ employeeId, cumulative: fromCents(value) })).sort((a, b) => b.cumulative - a.cumulative || a.employeeId.localeCompare(b.employeeId));
  return { months, employees, total: fromCents(running) };
}
