import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { understand } from "./understand";
import { translate } from "./translate";

// Q-65 (batch 2): a hierarchical budget in the SHAPE of the owner's cost sheet (synthetic): a title row, the headers in row 2 (WBS Level | WBS Number | Description | Activity No. | Budget Amount | %),
// a tree by code, amounts on the leaves, one parent whose amount is split between its children by percentage, a second branch outside it, and a parent whose written amount differs from
// its children. Through the real reader and the real translation: what is written is the leaves, the notes say what the file did not.
async function workbook(rows: Array<Array<string | number | null>>) {
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("Budget");
  sheet.addRow(["Project cost plan (synthetic)"]);
  sheet.addRow(["WBS Level", "WBS Number", "Description", "Activity No.", "Budget Amount", "%"]);
  rows.forEach(row => sheet.addRow(row));
  return new Uint8Array(await book.xlsx.writeBuffer());
}
const read = async (rows: Array<Array<string | number | null>>) => {
  const understood = await understand(await workbook(rows), { fileName: "budget.xlsx", kind: "budget", includeRows: true });
  return { understood, file: translate("budget", understood.rows!)! };
};

describe("hierarchical budget through the smart reader (Q-65)", () => {
  it("reads the owner's headers (title row above them), writes only the leaves, and the total is the sum of the leaves, not of every row", async () => {
    const { understood, file } = await read([
      [0, "GC.100", "Project", null, null, null],
      [1, "GC.100-000", "Works", null, null, null],
      [2, "GC.100-000.01", "Foundations", "A-01", 1_000, null],
      [2, "GC.100-000.02", "Structure", "A-02", 2_500.5, null],
      [1, "GC.100-001", "Finishes", null, null, null],
      [2, "GC.100-001.01", "Paint", "A-09", 400, null],
    ]);
    expect(understood.columns.map(column => column.fieldKey)).toEqual(expect.arrayContaining(["costCode", "originalAmount"]));
    expect(file.rows.map(row => [row[0], row[1]])).toEqual([["GC.100-000.01", 1000], ["GC.100-000.02", 2500.5], ["GC.100-001.01", 400]]);
    expect(file.rows.reduce((sum, row) => sum + Number(row[1]), 0)).toBe(3900.5);
    expect(file.notes).toContain("BUDGET_TREE_TOTAL:3900.5");
  });
  it("a parent's amount split by percentage gives each child its share, and a branch outside it stays apart; nothing is counted twice", async () => {
    const { file } = await read([
      [1, "IND", "Indirect work", null, 30_200_000, null],
      [2, "IND.01", "Site staff", null, null, 0.6], // written as 60% (a fraction in the cell)
      [2, "IND.02", "Equipment", null, null, 0.4],
      [1, "OVH", "Overheads", null, null, null],
      [2, "OVH.01", "Office", null, 400_000, null],
    ]);
    const amount = (code: string) => file.rows.find(row => row[0] === code)?.[1];
    expect(amount("IND.01")).toBe(18_120_000); expect(amount("IND.02")).toBe(12_080_000); expect(amount("OVH.01")).toBe(400_000);
    expect(file.rows.some(row => row[0] === "IND" || row[0] === "OVH")).toBe(false); // parents are not written
    expect(file.notes).toContain("BUDGET_ALLOCATED_BY_PERCENT");
    expect(file.notes).toContain("BUDGET_TREE_TOTAL:30600000");
  });
  it("NEGATIVE: a parent that wrote an amount different from its children is said with both numbers and neither is changed; a leaf with no amount is excluded, not zero", async () => {
    const { file } = await read([
      [1, "P", "Parent", null, 30_200_000, null],
      [2, "P.1", "One", null, 20_000_000, null],
      [2, "P.2", "Two", null, 27_000_000, null],
      [2, "P.3", "No amount", null, null, null],
    ]);
    expect(file.notes).toContain("BUDGET_PARENT_DIFFERS:P:30200000:47000000");
    expect(file.rows.map(row => row[0])).toEqual(["P.1", "P.2"]);
    expect(file.excluded).toEqual([expect.objectContaining({ reason: "MISSING:originalAmount" })]);
    expect(file.rows.find(row => row[0] === "P.1")![1]).toBe(20_000_000); // the leaf's own number, untouched
  });
  it("a flat budget (no nesting, no percentages) is read exactly as before", async () => {
    const { file } = await read([[0, "CIVIL", "Civil", null, 500_000, null], [0, "MEP", "MEP", null, 300_000, null]]);
    expect(file.rows).toEqual([["CIVIL", 500000, 500000, ""], ["MEP", 300000, 300000, ""]]); // the optional activity number is an empty fourth cell when the file has none
    expect(file.notes).toEqual(["BUDGET_CURRENT_DEFAULTED_TO_ORIGINAL"]);
  });
  it("review of #583 (B): a parent that wrote an amount over children with neither an amount nor a percentage is written as its branch's one line — the total says what is written, nothing vanishes", async () => {
    const { file } = await read([
      [1, "P", "Summary row", null, 1_000_000, null],
      [2, "P.1", "Detail (blank)", null, null, null],
      [2, "P.2", "Detail (blank)", null, null, null],
      [1, "Q", "Other", null, 500, null],
    ]);
    expect(file.rows.map(row => [row[0], row[1]])).toEqual([["P", 1_000_000], ["Q", 500]]); // the old code wrote only Q: 1,000,000 vanished while the total said it was there
    expect(file.notes).toContain("BUDGET_PARENT_WRITTEN_AS_LEAF:P:1000000");
    expect(file.notes).toContain("BUDGET_TREE_TOTAL:1000500");
    expect(file.notes.some(note => note.startsWith("BUDGET_WRITTEN_TOTAL"))).toBe(false); // the written total equals the tree's
  });
  it("review of #583 (B): a credit (a negative leaf) is written as 0 as the flat path does, and the difference between the tree's total and the written total is named", async () => {
    const { file } = await read([
      [1, "GC.9", "Group", null, null, null],
      [2, "GC.9.1", "Works", null, 1_000, null],
      [2, "GC.9.2", "Credit note", null, -200, null],
    ]);
    expect(file.rows.map(row => [row[0], row[1]])).toEqual([["GC.9.1", 1000], ["GC.9.2", 0]]);
    expect(file.notes).toContain("BUDGET_NEGATIVE_NOT_WRITTEN:GC.9.2:-200");
    expect(file.notes).toContain("BUDGET_TREE_TOTAL:800");
    expect(file.notes).toContain("BUDGET_WRITTEN_TOTAL:1000");
  });
  it("Q-65: the owner's «Activity No.» column is read into the fourth cell of each written leaf (a parent that is not written carries none)", async () => {
    const { understood, file } = await read([
      [1, "GC.200", "Group", null, null, null],
      [2, "GC.200.01", "Foundations", "A-1010", 1_000, null],
      [2, "GC.200.02", "Structure", null, 2_000, null],
    ]);
    expect(understood.columns.map(column => column.fieldKey)).toContain("activityNo");
    expect(file.rows).toEqual([["GC.200.01", 1000, 1000, "A-1010"], ["GC.200.02", 2000, 2000, ""]]);
  });
});
