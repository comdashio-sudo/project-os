import { describe, expect, it } from "vitest";
import { buildBudgetTree, type BudgetTreeRow } from "./budgetTree";

// Q-65 (batch 1): synthetic rows with the SHAPE of the owner's cost sheet (nothing real in them): a tree by code, amounts on the leaves, one parent with an amount split by percentage,
// a second branch outside it, and a parent whose written amount differs from its children's sum.
const row = (rowNumber: number, code: string, description: string, amount: number | null, percent?: number): BudgetTreeRow => ({ rowNumber, code, description, amount, ...(percent === undefined ? {} : { percent }) });

describe("budget tree arithmetic (Q-65)", () => {
  it("builds the tree from the codes and adds the leaves up to every parent; the total is the sum of the roots", () => {
    const tree = buildBudgetTree([
      row(3, "GC.100", "Project", null),
      row(4, "GC.100-000", "Works", null),
      row(5, "GC.100-000.01", "Foundations", 1_000),
      row(6, "GC.100-000.02", "Structure", 2_500.5),
      row(7, "GC.100-001", "Finishes", null),
      row(8, "GC.100-001.01", "Paint", 400),
    ]);
    const node = (code: string) => tree.nodes.find(item => item.code === code)!;
    expect(tree.roots).toEqual(["GC.100"]);
    expect(node("GC.100-000").parentCode).toBe("GC.100");
    expect(node("GC.100-000.01").parentCode).toBe("GC.100-000");
    expect(node("GC.100-000").total).toBe(3_500.5);
    expect(node("GC.100-001").total).toBe(400);
    expect(node("GC.100").total).toBe(3_900.5);
    expect(tree).toMatchObject({ total: 3_900.5, leaves: 3, parentDifferences: [], withoutAmount: [] });
  });
  it("the order of the rows does not change the tree", () => {
    const rows = [row(3, "A", "a", null), row(4, "A.1", "a1", 10), row(5, "A.2", "a2", 20)];
    expect(buildBudgetTree([...rows].reverse()).total).toBe(30);
    expect(buildBudgetTree(rows).total).toBe(30);
  });
  it("a parent's written amount is split between its children by percentage; a branch outside it is separate; nothing is added twice", () => {
    const tree = buildBudgetTree([
      row(3, "IND", "Indirect work", 30_200_000),
      row(4, "IND.01", "Site staff", null, 60),
      row(5, "IND.02", "Equipment", null, 40),
      row(6, "OVH", "Overheads", 1_000_000),
      row(7, "OVH.01", "Office", 400_000),
      row(8, "OVH.02", "Insurance", 600_000),
    ]);
    const node = (code: string) => tree.nodes.find(item => item.code === code)!;
    expect(node("IND.01")).toMatchObject({ own: 18_120_000, source: "allocated" });
    expect(node("IND.02")).toMatchObject({ own: 12_080_000, source: "allocated" });
    expect(node("IND").total).toBe(30_200_000); // the written amount and the allocation agree: no difference
    expect(tree.parentDifferences).toEqual([]);
    expect(tree.percentSplits).toEqual([]);
    expect(tree.total).toBe(31_200_000);
  });
  it("shows a parent whose written amount differs from its children's sum, names both and keeps both (never changes either)", () => {
    const tree = buildBudgetTree([row(3, "P", "Parent", 30_200_000), row(4, "P.1", "One", 20_000_000), row(5, "P.2", "Two", 27_000_000)]);
    expect(tree.parentDifferences).toEqual([{ code: "P", description: "Parent", rowNumber: 3, written: 30_200_000, childrenSum: 47_000_000, difference: -16_800_000 }]);
    expect(tree.nodes.find(item => item.code === "P")).toMatchObject({ written: 30_200_000, total: 47_000_000 });
    expect(tree.total).toBe(47_000_000);
  });
  it("percentages that do not add to 100 are reported; a leaf with neither an amount nor a percentage is unknown (null), not zero", () => {
    const tree = buildBudgetTree([row(3, "X", "x", 1_000), row(4, "X.1", "a", null, 50), row(5, "X.2", "b", null, 30), row(6, "Y", "y", null), row(7, "Y.1", "no amount", null)]);
    expect(tree.percentSplits).toEqual([{ code: "X", rowNumber: 3, percentSum: 80 }]);
    expect(tree.withoutAmount).toEqual(["Y.1"]);
    expect(tree.nodes.find(item => item.code === "Y.1")!.total).toBeNull();
    expect(tree.total).toBe(800); // 50% + 30% of 1,000: the unallocated 20% is not invented
  });
  it("a duplicated code is reported and ignored; a parent with an amount and nothing below keeps its own amount", () => {
    const tree = buildBudgetTree([row(3, "Z", "z", 500), row(4, "Z", "again", 999), row(5, "W", "w", 70)]);
    expect(tree.duplicates).toEqual([{ code: "Z", rowNumber: 4 }]);
    expect(tree.total).toBe(570);
  });
});
