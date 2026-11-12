import { describe, expect, it } from "vitest";
import { parsePmcImportFile, planCatalog, weightActivityCode, weightsToCatalogRows } from "./pmcImport";

// Q-3: the owner's weights table (CSI | sub-item | activity | weight) translated into catalogue rows. Synthetic data only.
const row = (rowNumber: number, cells: Record<string, unknown>) => ({ rowNumber, cells });
const emptyContext = { groups: new Map(), stages: new Map(), definitions: new Map(), activityCodesByModel: new Map(), wbsItems: new Map() };

describe("weightsToCatalogRows (Q-3)", () => {
  it("fractions totalling 1 are read as percentages; zero and empty weights are skipped and counted", () => {
    const out = weightsToCatalogRows([row(2, { csi: "03", activityName: "Footings", weight: 0.6 }), row(3, { csi: "03", activityName: "Slabs", weight: "0.4" }), row(4, { csi: "09", activityName: "Cleaning", weight: 0 }), row(5, { csi: "09", activityName: "Snag", weight: "" })], ["A"]);
    expect(out.scaledFromFractions).toBe(true);
    expect(out.ignoredZeroWeight).toBe(2);
    expect(out.rows.map(item => item.cells.weightPercent)).toEqual([60, 40]);
  });

  it("whole percentages stay as written, and a table with no model applies to every model the villas use", () => {
    const out = weightsToCatalogRows([row(2, { csi: "03", sub: "Frame", activityName: "Columns", weight: "60%" }), row(3, { csi: "03", activityName: "Slabs", weight: 40 })], ["A", "B"]);
    expect(out.scaledFromFractions).toBe(false);
    expect(out.rows.map(item => `${item.cells.modelCode}:${item.cells.stageCode}:${item.cells.weightPercent}`)).toEqual(["A:03 / Frame:60", "B:03 / Frame:60", "A:03 / 03:40", "B:03 / 03:40"]);
  });

  it("an activity without a code gets the same code every time; a table with no model and a project with no villas is refused", () => {
    expect(weightActivityCode(" Paint ")).toBe(weightActivityCode("paint"));
    expect(weightActivityCode("Paint")).not.toBe(weightActivityCode("Plaster"));
    expect(weightsToCatalogRows([row(2, { csi: "09", activityName: "Paint", weight: 100 })], []).errors.map(error => error.code)).toEqual(["PMC_WEIGHTS_NEED_VILLAS"]);
  });

  it("a negative weight, a missing section and a missing activity are refused on their own rows", () => {
    const out = weightsToCatalogRows([row(2, { csi: "03", activityName: "X", weight: -5 }), row(3, { csi: "", activityName: "Y", weight: 10 }), row(4, { csi: "03", activityName: "", weight: 10 })], ["A"]);
    expect(out.errors.map(error => `${error.rowNumber}:${error.code}`)).toEqual(["2:IMPORT_INVALID_NUMBER", "3:PMC_CLASSIFICATION_BLANK", "4:IMPORT_REQUIRED_VALUE_MISSING"]);
  });

  it("a total that is not 100% is refused with the model and the difference", () => {
    const out = weightsToCatalogRows([row(2, { csi: "03", activityName: "A1", weight: 60 }), row(3, { csi: "03", activityName: "A2", weight: 38.5 })], ["A"]);
    expect(planCatalog(out.rows, emptyContext).errors.map(error => error.detail)).toEqual(["A totals 98.5 (missing 1.5)"]);
  });

  it("a CSV from a spreadsheet tool with its own extra columns is read, and the known Arabic and English headers are found", async () => {
    const csv = "Row ID,بند CSI,البند الفرعي,Activity Code,النشاط,NEW Percentage,Notes\n1,03,Frame,WIR-1,Columns,100,ok\n";
    const parsed = await parsePmcImportFile({ kind: "weights", format: "csv", bytes: new TextEncoder().encode(csv) });
    expect(parsed.errors).toEqual([]);
    expect(parsed.rows[0].cells).toMatchObject({ csi: "03", sub: "Frame", activityCode: "WIR-1", activityName: "Columns" });
    expect(Number(parsed.rows[0].cells.weight)).toBe(100);
  });
});
