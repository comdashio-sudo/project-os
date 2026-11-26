import { describe, expect, it } from "vitest";
import { bandOf, cellAt, schematicLayout, type BoardUnit } from "./progressBoardLayout";

// Q-63 (batch 1): the schematic map's layout and colouring, with no browser. Synthetic villas only.
const villas = (count: number, blocks: number): BoardUnit[] => Array.from({ length: count }, (_unused, i) => ({ unitNumber: i + 1, blockCode: `B${(i % blocks) + 1}`, modelCode: i % 2 ? "B" : "A", progressPercent: i % 101, thisMonthPercent: i % 20 }));

describe("schematicLayout", () => {
  it("places all 1,200 villas of 12 blocks, each once, none overlapping, inside the width", () => {
    const layout = schematicLayout(villas(1200, 12), 900);
    expect(layout.cells).toHaveLength(1200);
    expect(new Set(layout.cells.map(c => c.unitNumber)).size).toBe(1200);
    expect(layout.blocks.map(b => b.blockCode)).toEqual(["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9", "B10", "B11", "B12"]); // numeric order, not B1, B10, B11…
    expect(layout.cells.every(c => c.x >= 0 && c.x + c.size <= 900)).toBe(true);
    const seen = new Set(layout.cells.map(c => `${c.x},${c.y}`));
    expect(seen.size).toBe(1200); // no two villas on the same square
  });
  it("on a phone width the blocks wrap instead of running off the screen", () => {
    const layout = schematicLayout(villas(1200, 12), 358);
    expect(layout.cells.every(c => c.x + c.size <= 358)).toBe(true);
    expect(layout.height).toBeGreaterThan(schematicLayout(villas(1200, 12), 900).height);
  });
  it("finds the villa under a tap, and nothing on a gap or a label", () => {
    const layout = schematicLayout(villas(4, 1), 200);
    const first = layout.cells[0];
    expect(cellAt(layout, first.x + 1, first.y + 1)).toBe(first.unitNumber);
    expect(cellAt(layout, first.x + first.size + 1, first.y + 1)).toBeNull(); // the 2 px gap
    expect(cellAt(layout, 1, 1)).toBeNull(); // the block's label row
  });
  it("an empty project lays out nothing, without failing", () => {
    expect(schematicLayout([], 400)).toEqual({ cells: [], blocks: [], width: 400, height: 0 });
  });
});

describe("bandOf", () => {
  const unit = (progressPercent: number | null, thisMonthPercent: number | null, modelCode = "A"): BoardUnit => ({ unitNumber: 1, blockCode: "B1", modelCode, progressPercent, thisMonthPercent });
  it("bands progress and this month's increase", () => {
    expect([0, 10, 50, 80, 100].map(p => bandOf(unit(p, 0), "progress", []))).toEqual(["none", "low", "mid", "high", "done"]);
    expect([0, 3, 10, 20].map(m => bandOf(unit(50, m), "month", []))).toEqual(["none", "low", "mid", "high"]);
    expect(bandOf(unit(50, 0, "B"), "model", ["A", "B"])).toBe("model:1");
  });
  it("NEGATIVE: a villa whose progress is unknown is drawn as unknown, never as 0", () => {
    expect(bandOf(unit(null, null), "progress", [])).toBe("unknown");
    expect(bandOf(unit(null, null), "month", [])).toBe("unknown");
  });
});
