import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { matchDrawingToUnits } from "../client/src/lib/dxf/dxfMatch";
import { readDxf } from "../client/src/lib/dxf/dxfReader";
import { ACTIVITIES, MONEY, UNIT_COUNT, WBS_ITEMS, buildTimeline, demoDxf, stateAt, unitPolygon, wbsValue } from "../scripts/demo/demoData";

// The demonstration company's invented content, checked without a database: the numbers add up, the drawing is one the platform's own DXF reader links to all 500 villas,
// and the same input always gives the same company.
describe("the demonstration company's content", () => {
  it("activity weights add up to 100 and every activity belongs to a package of the work breakdown", () => {
    expect(ACTIVITIES.reduce((sum, item) => sum + item.weight, 0)).toBe(100);
    for (const activity of ACTIVITIES) expect(WBS_ITEMS.some(item => item.code === activity.wbs)).toBe(true);
    for (const activity of ACTIVITIES) for (const before of activity.after) expect(ACTIVITIES.some(item => item.code === before)).toBe(true);
  });
  it("the packages add up to the budget, and the budget is below the contract (a planned margin)", () => {
    expect(Math.round(WBS_ITEMS.reduce((sum, item) => sum + wbsValue(item.code), 0))).toBe(MONEY.bac);
    expect(MONEY.contractValue).toBeGreaterThan(MONEY.bac);
  });
  it("every villa has a polygon inside the plan, and no two overlap", () => {
    const boxes = Array.from({ length: UNIT_COUNT }, (_, index) => { const ring = unitPolygon(index); return { x0: ring[0][0], y0: ring[0][1], x1: ring[2][0], y1: ring[2][1] }; });
    for (const box of boxes) { expect(box.x0).toBeGreaterThanOrEqual(0); expect(box.y0).toBeGreaterThanOrEqual(0); expect(box.x1).toBeLessThanOrEqual(1); expect(box.y1).toBeLessThanOrEqual(1); }
    const overlaps = boxes.filter((a, i) => boxes.slice(i + 1).some(b => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1));
    expect(overlaps).toEqual([]);
  });
  it("the DXF is one the platform's own reader reads, and every villa number links to exactly one polygon", () => {
    const result = readDxf(new TextEncoder().encode(demoDxf()));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.drawing.polygons.filter(item => item.layer === "VILLAS")).toHaveLength(UNIT_COUNT);
    const report = matchDrawingToUnits(result.drawing, Array.from({ length: UNIT_COUNT }, (_, index) => ({ id: `u${index + 1}`, code: String(index + 1) })));
    expect(report.counts.linked).toBe(UNIT_COUNT);
    expect(report.counts.unitsRemaining).toBe(0);
    expect(report.ambiguous).toEqual([]);
    expect(report.unmatched).toEqual([]);
  });
  it("the file kept in docs/demo is the one the code produces (run `node --import tsx scripts/demo/write-demo-dxf.mjs` after changing the layout)", () => {
    expect(readFileSync("docs/demo/master-plan-demo.dxf", "utf8")).toBe(demoDxf());
  });
  it("the timeline is deterministic, ordered inside a villa, and ends with work in every state", () => {
    const a = buildTimeline(4.4); const b = buildTimeline(4.4);
    expect(a).toEqual(b);
    const first = a.filter(cell => cell.unit === 0);
    for (const activity of ACTIVITIES) for (const before of activity.after) expect(first.find(c => c.activity === activity.code)!.start).toBeGreaterThanOrEqual(first.find(c => c.activity === before)!.finish);
    const states = new Set(a.map(cell => stateAt(cell, 92)));
    expect(Array.from(states).sort()).toEqual(["COMPLETE", "IN_PROGRESS", "NOT_STARTED", "UNDER_REVIEW"]);
  });
});
