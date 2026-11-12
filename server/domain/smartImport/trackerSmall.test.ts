import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { understand } from "./understand";

// D-44 (b) fix: a tracker with fewer than five villas fell to the table reader (detectTracker's floor was five), and a structural kind chosen for it (unitMatrix) has no column
// definition in KINDS, so mapColumns read `fields` of undefined: a 500. Now one villa is a tracker, and a structural kind not found in the file is said plainly. Synthetic data.
const ACTIVITIES = ["Excavation", "Foundations", "Columns", "Slab"];
async function tracker(villas: number, status = (i: number, a: number) => ((i + a) % 2 ? "Completed" : "On going")) {
  const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("Tracker");
  sheet.addRow(["Villa tracker (synthetic)"]); sheet.addRow(["م", "المرحلة", "البلوك", "رقم الفيلا", "النموذج", ...ACTIVITIES]);
  for (let i = 1; i <= villas; i++) sheet.addRow([i, "PH1", "B01", `V-${1000 + i}`, "MDL-A", ...ACTIVITIES.map((_a, a) => status(i, a))]);
  return new Uint8Array(await book.xlsx.writeBuffer());
}

describe("a small tracker (fewer than five villas)", () => {
  it("1 to 4 villas are read as the tracker, with or without the kind chosen", async () => {
    for (const villas of [1, 2, 3, 4]) for (const kind of [undefined, "unitMatrix"] as const) {
      const result = await understand(await tracker(villas), { fileName: "small.xlsx", kind });
      expect(result.kind, `${villas} ${kind}`).toBe("unitMatrix");
      expect(result.matrix).toMatchObject({ shape: "tracker", units: villas, activities: ACTIVITIES.length, issues: [] });
    }
  });

  it("refused, not thrown: 2 rows that are not a tracker, under every kind read by structure; under no kind they are a table as before", async () => {
    const bytes = await tracker(2, () => "Half done");
    for (const kind of ["unitMatrix", "consultantExport", "siteWorkbook", "scheduleUpdate", "xer"] as const) {
      const result = await understand(bytes, { fileName: "small.xlsx", kind });
      expect(result, kind).toMatchObject({ kind: null, table: null, columns: [], warnings: ["KIND_NOT_DETECTED"] });
    }
    expect((await understand(bytes, { fileName: "small.xlsx" })).table?.rows).toBe(2);
  });
});
