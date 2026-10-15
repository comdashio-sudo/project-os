import { describe, expect, it } from "vitest";
import { cumulativeEosLiability } from "./eosLiability";

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe("cumulative end-of-service liability (hand-computed)", () => {
  // October: A 700.00 + B 416.67 = 1,116.67.  November: A 700.00 + B 416.67 + C 250.10 = 1,366.77.  December: A 700.00 only = 700.00.
  const rows = [
    { employeeId: "A", periodEnd: d("2026-10-31"), amount: 700 }, { employeeId: "B", periodEnd: d("2026-10-31"), amount: 416.67 },
    { employeeId: "A", periodEnd: d("2026-11-30"), amount: 700 }, { employeeId: "B", periodEnd: d("2026-11-30"), amount: 416.67 }, { employeeId: "C", periodEnd: d("2026-11-30"), amount: 250.1 },
    { employeeId: "A", periodEnd: d("2026-12-31"), amount: 700 },
  ];
  it("adds each month's accrual to everything accrued before it", () => {
    const result = cumulativeEosLiability(rows);
    expect(result.months).toEqual([
      { month: "2026-10", accrued: 1116.67, cumulative: 1116.67, employees: 2 },
      { month: "2026-11", accrued: 1366.77, cumulative: 2483.44, employees: 3 },
      { month: "2026-12", accrued: 700, cumulative: 3183.44, employees: 1 },
    ]);
    expect(result.total).toBe(3183.44);
  });
  it("keeps a running total per employee, largest first, and it adds up to the company total", () => {
    const result = cumulativeEosLiability(rows);
    expect(result.employees).toEqual([{ employeeId: "A", cumulative: 2100 }, { employeeId: "B", cumulative: 833.34 }, { employeeId: "C", cumulative: 250.1 }]);
    expect(result.employees.reduce((sum, row) => Math.round((sum + row.cumulative) * 100) / 100, 0)).toBe(result.total);
  });
  it("does not drift on amounts that are not exact in binary (0.1 + 0.2 style)", () => {
    const result = cumulativeEosLiability(Array.from({ length: 10 }, () => ({ employeeId: "A", periodEnd: d("2026-10-31"), amount: 0.1 })));
    expect(result.total).toBe(1);
    expect(result.months[0]).toEqual({ month: "2026-10", accrued: 1, cumulative: 1, employees: 1 });
  });
  it("orders months whatever order the rows arrive in, is empty for no rows, and does not count a zero accrual as an employee", () => {
    expect(cumulativeEosLiability([...rows].reverse()).months.map(m => m.month)).toEqual(["2026-10", "2026-11", "2026-12"]);
    expect(cumulativeEosLiability([])).toEqual({ months: [], employees: [], total: 0 });
    expect(cumulativeEosLiability([{ employeeId: "Z", periodEnd: d("2026-10-31"), amount: 0 }]).months[0].employees).toBe(0);
  });
  it("refuses a negative or non-finite accrual instead of netting it silently", () => {
    expect(() => cumulativeEosLiability([{ employeeId: "A", periodEnd: d("2026-10-31"), amount: -1 }])).toThrow("PROJECT_OS_PAYROLL_AMOUNT_INVALID");
    expect(() => cumulativeEosLiability([{ employeeId: "A", periodEnd: d("2026-10-31"), amount: Number.NaN }])).toThrow("PROJECT_OS_PAYROLL_AMOUNT_INVALID");
  });
});
