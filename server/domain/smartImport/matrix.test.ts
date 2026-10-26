import { beforeAll, describe, expect, it } from "vitest";
import { buildMatrixWorkbook, MATRIX_ACTIVITIES, MATRIX_SHEET, MATRIX_UNITS, type MatrixTruth } from "./matrixFixture";
import { detectMatrix, reconcile, toPmcRows, validateMatrix, weightPercents, type MatrixModel } from "./matrix";
import { readGrid } from "./sheetReader";

// The matrix is read by its structure. The workbook is synthetic (matrixFixture.ts), built with the structure of a real monthly report; nothing in it is real.
async function model(options = {}) {
  const { bytes, truth } = await buildMatrixWorkbook(options);
  const grid = await readGrid(bytes, "xlsx");
  if (!grid.ok) throw new Error(grid.code);
  const main = grid.sheets.find(sheet => sheet.name === MATRIX_SHEET)!;
  return { bytes, truth, grid, detected: detectMatrix(main) };
}

describe("unit-completion matrix: recognised by structure", () => {
  let built: Awaited<ReturnType<typeof model>>; let m: MatrixModel; let truth: MatrixTruth;
  beforeAll(async () => { built = await model(); if (!built.detected.ok) throw new Error(built.detected.reason); m = built.detected.model; truth = built.truth; }, 60_000);

  it("has the described shape: 6 sheets, 579 rows × 160 columns, 100+ merged ranges", () => {
    expect(built.grid.ok && built.grid.sheets.length).toBe(6);
    const main = (built.grid as { sheets: Array<{ name: string; rows: unknown[][]; mergeRanges: number }> }).sheets.find(s => s.name === MATRIX_SHEET)!;
    expect(main.rows.length).toBe(579);
    expect(main.rows[0].length).toBe(160);
    expect(main.mergeRanges).toBeGreaterThanOrEqual(111);
  });
  it("builds 491 units and 136 activities with three-level header and weights totalling 100%", () => {
    expect(m.units.length).toBe(MATRIX_UNITS);
    expect(m.activities.length).toBe(MATRIX_ACTIVITIES);
    expect(m.weightsRow).toBe(3); expect(m.headerRows).toEqual([4, 5, 6]);
    expect(m.activities.reduce((s, a) => s + a.weight, 0)).toBeCloseTo(1, 9);
    expect(new Set(m.activities.map(a => a.groupCode)).size).toBe(4);
    expect(m.divisions.length).toBe(8);
    expect(new Set(m.activities.map(a => a.code)).size).toBe(MATRIX_ACTIVITIES); // codes are unique
    expect(m.divisions[0].weightText).not.toBeNull(); // «Division 02=…%» read from row 2
    expect(validateMatrix(m)).toEqual([]);
  });
  it("reads zone → block → unit, the models, the Oracle code and the report date; vertical merges filled", () => {
    expect(new Set(m.units.map(u => u.zone))).toEqual(new Set(truth.zones));
    expect(new Set(m.units.map(u => `${u.zone}/${u.block}`)).size).toBe(12);
    expect(new Set(m.units.map(u => u.modelCode))).toEqual(new Set(truth.models));
    expect(m.units.map(u => u.oracleCode)).toEqual(truth.oracleCodes);
    expect(m.reportDate).toBe(truth.reportDate);
    expect(m.units.every(u => u.reportedBlockPercent !== null && u.reportedZonePercent !== null)).toBe(true); // merged down the block's rows
    expect(m.units.reduce((s, u) => s + u.complete.filter(Boolean).length, 0)).toBe(truth.completeCells);
  });
  it("leaves out what is not a unit: the totals row, the pivot table and the computed columns; and does not use the sheet whose weights are #REF!", () => {
    expect(m.ignored.totalsRow).toBe(498);
    expect(m.ignored.pivotRow).toBe(504);
    expect(m.ignored.computedColumnCount).toBeGreaterThanOrEqual(8);
    expect(m.units[m.units.length - 1].row).toBe(497);
  });
  it("reconciles with the platform's calculation: 100% of the units' percentages, all divisions, blocks and zones", () => {
    const report = reconcile(m);
    console.log(`MATRIX MATCH REPORT: units ${report.units.matched}/${report.units.compared} · divisions ${report.divisions.matched}/${report.divisions.compared} · blocks ${report.blocks.matched}/${report.blocks.compared} · zones ${report.zones.matched}/${report.zones.compared}`);
    expect(report.units).toMatchObject({ compared: 491, matched: 491 });
    expect(report.unitMatchShare).toBe(1);
    expect(report.divisions.matched).toBe(report.divisions.compared); expect(report.divisions.compared).toBe(491 * 8);
    expect(report.blocks).toMatchObject({ compared: 12, matched: 12 });
    expect(report.zones).toMatchObject({ compared: 3, matched: 3 });
  });
  it("turns into the rows the existing PMC importers read: 491 locations, 6 models × 136 activities, one row per complete cell", () => {
    const rows = toPmcRows(m, m.reportDate);
    expect(rows.locations.length).toBe(491);
    expect(rows.models.length).toBe(6);
    expect(rows.catalog.length).toBe(6 * 136);
    expect(rows.status.length).toBe(truth.completeCells);
    const { percents, adjustment } = weightPercents(m);
    expect(percents.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 6);
    expect(Math.abs(adjustment)).toBeLessThan(0.01);
  });
});

describe("unit-completion matrix: what it refuses and what it shows", () => {
  it("refuses weights that do not total 100%", async () => {
    const built = await model({ brokenWeights: true });
    if (!built.detected.ok) throw new Error(built.detected.reason);
    expect(validateMatrix(built.detected.model).map(issue => issue.code)).toContain("MATRIX_WEIGHTS_NOT_100");
  }, 60_000);
  it("shows WHERE the sheet disagrees with itself: three cells flipped after the percentages were computed", async () => {
    const built = await model({ flip: [[0, 5], [10, 20], [10, 60]] });
    if (!built.detected.ok) throw new Error(built.detected.reason);
    const report = reconcile(built.detected.model);
    expect(report.units.mismatches.map(item => item.serial)).toEqual([1, 11]);
    expect(report.units.matched).toBe(489);
    expect(report.units.mismatches[0]).toMatchObject({ serial: 1, villaCode: "V-0001" });
    expect(Math.abs(report.units.mismatches[0].difference)).toBeGreaterThan(0);
    expect(report.divisions.mismatches.length).toBeGreaterThan(0);
  }, 60_000);
  it("does not take an ordinary table for a matrix", async () => {
    const { buildSamples } = await import("./fixtures");
    for (const sample of (await buildSamples()).filter(s => s.format === "xlsx")) {
      const grid = await readGrid(sample.bytes, "xlsx");
      if (!grid.ok) continue;
      for (const sheet of grid.sheets) expect(detectMatrix(sheet).ok, `${sample.id}/${sheet.name}`).toBe(false);
    }
  }, 60_000);
});
