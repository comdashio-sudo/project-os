import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";
import { parsePmcImportFile, planCatalog, weightsToCatalogRows } from "./pmcImport";

// Q-60 batch 1 (the owner's weights file, 26-11): the «by model» sheet — two title rows, headers in row 4 (م | الرمز | البند | نوع الاستلام | نموذج A-End |
// نموذج C | نموذج D), a total line per villa, phase lines with their sums, group lines (Q01…, no serial) whose weight is the sum of their items, the items
// (serial, IP-00x), fractions of 1 per model, «–» where an item is not in a model. A cover sheet beside it. Synthetic copy of the shape only.
async function weightsFile(options: { extraModel?: boolean } = {}) {
  const book = new ExcelJS.Workbook();
  book.addWorksheet("Cover").addRow(["Weights (synthetic)"]);
  const sheet = book.addWorksheet("حسب النموذج");
  const models = ["A-End", "C", "D", ...(options.extraModel ? ["Z"] : [])];
  sheet.addRow(["جدول الأوزان (مختلق)"]); sheet.addRow(["حسب النموذج"]); sheet.addRow([]);
  sheet.addRow(["م", "الرمز", "البند", "نوع الاستلام", ...models.map(model => `نموذج ${model}`)]);
  const zero = options.extraModel ? [1] : [];
  sheet.addRow(["", "", "المجموع للفيلا", "", 1, 1, 0.9999999999999999, ...zero]);
  sheet.addRow(["", "", "المرحلة 1 – الأعمال التحتية", "", 0.5, 0.6, 0.4, ...zero.map(() => 0.5)]);
  sheet.addRow(["", "Q01", "الحفر والردم", "", 0.2, 0.25, 0.4, ...zero.map(() => 0.2)]);
  sheet.addRow([1, "IP-001", "الحفر", "فحص", 0.1, 0.15, 0.4, ...zero.map(() => 0.1)]);
  sheet.addRow([2, "IP-002", "الردم", "فحص", 0.1, 0.1, "–", ...zero.map(() => 0.1)]);
  sheet.addRow(["", "Q02", "الأساسات", "", 0.3, 0.35, "–", ...zero.map(() => 0.3)]);
  sheet.addRow([3, "IP-003", "القواعد", "استلام", 0.3, 0.35, "–", ...zero.map(() => 0.3)]);
  sheet.addRow(["", "", "المرحلة 2 – الهيكل", "", 0.5, 0.4, 0.6, ...zero.map(() => 0.5)]);
  sheet.addRow(["", "Q03", "الهيكل الخرساني", "", 0.5, 0.4, 0.6, ...zero.map(() => 0.5)]);
  sheet.addRow([4, "IP-004", "الأعمدة", "استلام", 0.25, 0.2, 0.3, ...zero.map(() => 0.25)]);
  sheet.addRow([5, "IP-005", "السقف", "استلام", 0.25, 0.2, 0.2999999999999999, ...zero.map(() => 0.25)]);
  return new Uint8Array(await book.xlsx.writeBuffer());
}
const empty = { groups: new Map(), stages: new Map(), definitions: new Map(), activityCodesByModel: new Map(), wbsItems: new Map() };

describe("the owner's weights by model, one column per model (Q-60 batch 1)", () => {
  it("POSITIVE: each model totals exactly 100; group and phase lines are not activities; «–» means the item is not in that model; the file's own totals match", async () => {
    const parsed = await parsePmcImportFile({ kind: "weights", format: "xlsx", bytes: await weightsFile() });
    expect(parsed.errors).toEqual([]);
    expect(parsed.notes?.wide).toEqual({ sheetName: "حسب النموذج", models: ["A-End", "C", "D"], groups: 3, phases: 2 });
    const out = weightsToCatalogRows(parsed.rows, ["A-End", "C", "D", "B"], parsed.notes?.fileTotals);
    expect(out.errors).toEqual([]);
    expect(out.scaledFromFractions).toBe(true);
    const byModel = (model: string) => out.rows.filter(row => row.cells.modelCode === model);
    for (const model of ["A-End", "C", "D"]) expect(Math.round(byModel(model).reduce((sum, row) => sum + Number(row.cells.weightPercent), 0) * 1e6) / 1e6).toBe(100);
    expect(byModel("A-End").map(row => row.cells.activityCode)).toEqual(["IP-001", "IP-002", "IP-003", "IP-004", "IP-005"]);
    expect(byModel("D").map(row => row.cells.activityCode)).toEqual(["IP-001", "IP-004", "IP-005"]); // IP-002 and IP-003 are «–» in D
    expect(out.rows.some(row => /^Q0\d$/.test(String(row.cells.activityCode)))).toBe(false);
    expect(byModel("C").find(row => row.cells.activityCode === "IP-003")?.cells).toMatchObject({ groupName: "Q02 الأساسات", stageName: "المرحلة 1 – الأعمال التحتية", weightPercent: 35 });
    expect(out.totalChecks.map(check => [check.model, check.status])).toEqual([["A-End", "matches"], ["C", "matches"], ["D", "matches"]]);
    // every row names the owner's row: IP-003 is on row 11 of the sheet
    expect(parsed.rows.find(row => row.cells.activityCode === "IP-003")?.rowNumber).toBe(11);
    expect(planCatalog(out.rows, empty).errors).toEqual([]);
  });

  it("NEGATIVE: a model in the weights that the project's villas do not have is refused by its name", async () => {
    const parsed = await parsePmcImportFile({ kind: "weights", format: "xlsx", bytes: await weightsFile({ extraModel: true }) });
    expect(parsed.errors).toEqual([]);
    const out = weightsToCatalogRows(parsed.rows, ["A-End", "C", "D"], parsed.notes?.fileTotals);
    expect(out.errors).toEqual([expect.objectContaining({ code: "PMC_WEIGHTS_MODEL_UNKNOWN", field: "modelCode", detail: "Z" })]);
  });

  it("a long weights table (one weight column) is read as before — the wide path does not take it", async () => {
    const book = new ExcelJS.Workbook(); const sheet = book.addWorksheet("weights");
    sheet.addRow(["CSI section", "Activity name", "Weight"]); sheet.addRow(["03 Concrete", "Footings", 60]); sheet.addRow(["09 Finishes", "Paint", 40]);
    const parsed = await parsePmcImportFile({ kind: "weights", format: "xlsx", bytes: new Uint8Array(await book.xlsx.writeBuffer()) });
    expect(parsed.errors).toEqual([]);
    expect(parsed.notes?.wide).toBeUndefined();
    expect(weightsToCatalogRows(parsed.rows, ["A"]).rows.map(row => row.cells.weightPercent)).toEqual([60, 40]);
  });
});
