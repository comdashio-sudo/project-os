import { describe, expect, it } from "vitest";
import { boundsOf, centreOf, groupLabels, toggleVillas, villasInRectangle, type VillaShape } from "./villaMap";

// Q-67 (6): choosing villas on the master plan — the pure part. Synthetic shapes only.
const square = (villa: string, x: number, y: number): VillaShape => ({ villa, points: [{ x, y }, { x: x + 10, y }, { x: x + 10, y: y + 10 }, { x, y: y + 10 }] });
const shapes = [square("700", 0, 0), square("701", 20, 0), square("702", 0, 20), square("703", 40, 40)];

describe("the villa map (Q-67 6)", () => {
  it("POSITIVE: a rectangle chooses the villas whose centre is inside it, whichever corner it was dragged from", () => {
    expect(villasInRectangle(shapes, { x: -1, y: -1 }, { x: 31, y: 12 })).toEqual(["700", "701"]);
    expect(villasInRectangle(shapes, { x: 31, y: 31 }, { x: -1, y: -1 })).toEqual(["700", "701", "702"]);
  });

  it("NEGATIVE: a rectangle that only grazes a villa (not its centre) does not choose it", () => {
    expect(villasInRectangle(shapes, { x: 8, y: 8 }, { x: 12, y: 12 })).toEqual([]);
  });

  it("a tap toggles one villa; a block (or a rectangle) is added whole, and taken away whole when all of it was chosen", () => {
    expect(toggleVillas(["700"], ["700"])).toEqual([]);
    expect(toggleVillas(["700"], ["700", "701"])).toEqual(["700", "701"]);
    expect(toggleVillas(["700", "701", "702"], ["700", "701"])).toEqual(["702"]);
    expect(toggleVillas(["700"], [])).toEqual(["700"]);
  });

  it("the blocks' labels sit at the centre of their villas; the bounds and centres", () => {
    const blockOf: Record<string, string> = { "700": "BLK 33", "701": "BLK 33", "702": "BLK 34" };
    expect(groupLabels(shapes, villa => blockOf[villa] ?? null)).toEqual([{ key: "BLK 33", at: { x: 15, y: 5 }, villas: ["700", "701"] }, { key: "BLK 34", at: { x: 5, y: 25 }, villas: ["702"] }]);
    expect(boundsOf(shapes.flatMap(shape => shape.points))).toEqual({ x: 0, y: 0, width: 50, height: 50 });
    expect(centreOf(shapes[3].points)).toEqual({ x: 45, y: 45 });
    expect(boundsOf([])).toBeNull();
  });
});
