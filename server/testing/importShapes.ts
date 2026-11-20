import ExcelJS from "exceljs";
import { ownerEditedWeights, ownerOriginalWeights } from "./ownerWeightsFixtures";

// Q-50 batch 6: the library of weights files in the shapes companies keep them. Each is synthetic (made-up names, codes and numbers) and must import as it is,
// with no manual mapping and no correction. A new shape met at a customer is added here as a synthetic copy, with what it must read to.
export type ImportShape = {
  name: string;
  build: () => Promise<Uint8Array>;
  // what reading it must give: the activities kept (one model), the distinct groups, and what the report counts
  expect: { activities: number; groups: number; skippedTotals?: number; outlineHeadings?: number; englishNames?: number };
};

async function book(sheets: Array<{ name: string; rows: unknown[][]; merges?: string[] }>): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  for (const sheet of sheets) {
    const ws = workbook.addWorksheet(sheet.name);
    for (const row of sheet.rows) ws.addRow(row);
    for (const range of sheet.merges ?? []) ws.mergeCells(range);
  }
  return new Uint8Array(await workbook.xlsx.writeBuffer());
}

export const IMPORT_SHAPES: ImportShape[] = [
  // Q-48 (a): two merged title rows, thirteen columns, a division merged and left blank, #REF! in columns not read, fractions, a zero weight, a totals line
  { name: "owner original", build: () => ownerOriginalWeights(), expect: { activities: 5, groups: 2, skippedTotals: 1, englishNames: 5 } },
  // Q-48 (b): the header in row 1 with «القسم» twice, #REF! in the division's weight and value, weights in percent
  { name: "owner edited", build: () => ownerEditedWeights(), expect: { activities: 5, groups: 2 } },
  // Q-50 batch 5b: a BOQ-style table numbered as a hierarchy, with no section column
  {
    name: "numbered hierarchy (BOQ style)",
    build: () => book([{ name: "BOQ", rows: [
      ["Item No", "Description", "Unit", "Weight %"],
      ["1", "Substructure", "", null],
      ["1.1", "Excavation", "", null],
      ["1.1.1", "Bulk excavation", "m3", 10],
      ["1.1.2", "Backfilling", "m3", 5],
      ["1.2", "Footings", "m3", 15],
      ["2", "Superstructure", "", null],
      ["2.1", "Columns", "m3", 30],
      ["2.2", "Slabs", "m3", 40],
    ] }]),
    expect: { activities: 5, groups: 2, outlineHeadings: 3 },
  },
  // Q-49: two languages — an Arabic name and an English one side by side, and a group cell in both languages
  {
    name: "two languages",
    build: () => book([{ name: "Weights", rows: [
      ["القسم", "النشاط", "Activity Title", "الوزن"],
      ["أعمال الهيكل Structure", "صب القواعد", "Footings", 40],
      ["أعمال الهيكل Structure", "صب السقف", "Slab", 30],
      ["أعمال التشطيبات Finishes", "دهان", "Paint", 30],
    ] }]),
    expect: { activities: 3, groups: 2, englishNames: 3 },
  },
  // a logo and title rows above the table, a cover sheet before it and a notes sheet after it
  {
    name: "cover, title rows and other sheets",
    build: () => book([
      { name: "Cover", rows: [["Synthetic Contracting Co."], ["Villa weights — issue 2"], ["Prepared for the example project"]] },
      { name: "Weights", rows: [
        ["Synthetic Contracting Co."], ["Villa weights"], [],
        ["Section", "Sub Item", "Activity", "Weight"],
        ["03 Concrete", "Frame", "Columns", 50],
        ["", "Frame", "Beams", 20],
        ["09 Finishes", "", "Paint", 30],
      ], merges: ["A1:D1", "A2:D2"] },
      { name: "Notes", rows: [["Note"], ["Weights reviewed by the example engineer."]] },
    ]),
    expect: { activities: 3, groups: 2 },
  },
  // a subtotal line under every section and a grand total at the end, weights as fractions of 1
  {
    name: "subtotals and a grand total",
    build: () => book([{ name: "Weights", rows: [
      ["CSI", "Activity", "Weight"],
      ["03", "Footings", 0.2],
      ["03", "Slabs", 0.3],
      ["", "Subtotal", 0.5],
      ["09", "Plaster", 0.25],
      ["09", "Paint", 0.25],
      ["", "Subtotal", 0.5],
      ["", "Grand Total", 1],
    ] }]),
    expect: { activities: 4, groups: 2, skippedTotals: 3 },
  },
];
