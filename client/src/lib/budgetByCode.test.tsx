import { describe, expect, it } from "vitest";
import { ancestorsOf, budgetByCode } from "./budgetByCode";

// Q-65: the budget as a tree by cost code, from the leaves the lines hold. Synthetic codes only.
describe("budgetByCode", () => {
  it("cuts a code's ancestors at the separators, shortest first", () => {
    expect(ancestorsOf("GC.100-000.03.01")).toEqual(["GC", "GC.100", "GC.100-000", "GC.100-000.03"]);
    expect(ancestorsOf("A")).toEqual([]);
  });
  it("each parent carries the sum of the leaves below it, depth follows the nesting, and the project total is the leaves once", () => {
    const { rows, total } = budgetByCode([
      { costCode: "GC.100-000.01", originalAmount: 1_000, currentAmount: 1_100 },
      { costCode: "GC.100-000.02", originalAmount: 2_500.5, currentAmount: 2_500.5 },
      { costCode: "GC.100-001.01", originalAmount: 400, currentAmount: 400 },
    ]);
    const byCode = Object.fromEntries(rows.map(row => [row.code, row]));
    expect(byCode["GC.100-000"]).toMatchObject({ original: 3_500.5, current: 3_600.5, leaves: 2, leaf: false });
    expect(byCode["GC.100-001"]).toMatchObject({ original: 400, leaves: 1, leaf: false });
    expect(byCode["GC.100"]).toMatchObject({ original: 3_900.5, current: 4_000.5, leaves: 3, leaf: false });
    expect(byCode["GC.100-000.01"]).toMatchObject({ original: 1_000, leaf: true, depth: byCode["GC.100-000"].depth + 1 });
    expect(total).toEqual({ original: 3_900.5, current: 4_000.5 });
    expect(rows.map(row => row.code)).toEqual(["GC", "GC.100", "GC.100-000", "GC.100-000.01", "GC.100-000.02", "GC.100-001", "GC.100-001.01"]);
  });
  it("a parent written as its own line stays a leaf with its own amount (never added to the leaves under it), and an empty budget is an empty tree", () => {
    const { rows } = budgetByCode([{ costCode: "P", originalAmount: 1_000_000, currentAmount: 1_000_000 }, { costCode: "P.1", originalAmount: 10, currentAmount: 10 }]);
    expect(rows.find(row => row.code === "P")).toMatchObject({ leaf: true, original: 1_000_000 });
    expect(budgetByCode([])).toEqual({ rows: [], total: { original: 0, current: 0 } });
  });
  it("Q-65: a leaf carries the activity number it was imported with, a parent carries none", () => {
    const { rows } = budgetByCode([{ costCode: "GC.1.01", originalAmount: 5, currentAmount: 5, activityNo: " A-1010 " }, { costCode: "GC.1.02", originalAmount: 7, currentAmount: 7, activityNo: null }]);
    const byCode = Object.fromEntries(rows.map(row => [row.code, row]));
    expect(byCode["GC.1.01"].activityNo).toBe("A-1010");
    expect(byCode["GC.1.02"].activityNo).toBe("");
    expect(byCode["GC.1"].activityNo).toBe("");
  });
});
