// Synthetic shapes and units only.
import { describe, expect, it } from "vitest";
import type { DxfDrawing } from "./dxfReader";
import type { ReviewItem } from "./dxfReview";
import { MANUAL_LAYER, addManualShape, markerSide, removeManualShape, shapeAt, squareAround, unlinkedUnits } from "./manualLinks";

const read: DxfDrawing = { layers: ["UNITS"], polygons: [{ id: "P1", layer: "UNITS", points: [{ x: 0, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 300 }], source: "lwpolyline" }], texts: [], warnings: [], ignoredEntities: {} };
const items: ReviewItem[] = [{ polygonId: "P1", layer: "UNITS", unitId: "u1", unitCode: "V-01", state: "confirmed", reason: null, candidateUnitIds: [] }];
const units = [{ id: "u10", code: "V-10" }, { id: "u2", code: "V-02" }, { id: "u1", code: "V-01" }];

describe("linking a unit by hand (Q-8)", () => {
  it("a tap makes a square centred on the point, sized from the drawing", () => {
    expect(markerSide(read)).toBe(10);
    expect(squareAround({ x: 50, y: 50 }, 10)).toEqual([{ x: 45, y: 45 }, { x: 55, y: 45 }, { x: 55, y: 55 }, { x: 45, y: 55 }]);
  });

  it("adds a confirmed shape M1, then M2, on the MANUAL layer", () => {
    const first = addManualShape(read, items, squareAround({ x: 50, y: 50 }, 10), units[1]!);
    if (!first.ok) throw new Error("expected ok");
    expect(first.polygonId).toBe("M1");
    expect(first.items.at(-1)).toMatchObject({ polygonId: "M1", layer: MANUAL_LAYER, unitId: "u2", unitCode: "V-02", state: "confirmed" });
    expect(first.drawing.layers).toContain(MANUAL_LAYER);
    const second = addManualShape(first.drawing, first.items, [{ x: 0, y: 0 }, { x: 5, y: 0 }, { x: 5, y: 5 }], units[0]!);
    expect(second.ok && second.polygonId).toBe("M2");
  });

  it("refuses a unit already on a confirmed shape, and a polygon of fewer than three points", () => {
    expect(addManualShape(read, items, squareAround({ x: 1, y: 1 }, 2), units[2]!)).toEqual({ ok: false, code: "UNIT_ALREADY_LINKED" });
    expect(addManualShape(read, items, [{ x: 0, y: 0 }, { x: 1, y: 1 }], units[1]!)).toEqual({ ok: false, code: "TOO_FEW_POINTS" });
  });

  it("removes a hand-drawn shape, never a read one", () => {
    const added = addManualShape(read, items, squareAround({ x: 50, y: 50 }, 10), units[1]!);
    if (!added.ok) throw new Error("expected ok");
    const removed = removeManualShape(added.drawing, added.items, "M1");
    expect(removed.drawing.polygons.map(p => p.id)).toEqual(["P1"]);
    expect(removed.items.map(i => i.polygonId)).toEqual(["P1"]);
    expect(removeManualShape(read, items, "P1")).toEqual({ drawing: read, items });
  });

  it("the «not linked» list is every unit with no confirmed shape, in natural code order", () => {
    expect(unlinkedUnits(units, items).map(u => u.code)).toEqual(["V-02", "V-10"]);
    expect(unlinkedUnits(units, [...items, { ...items[0]!, polygonId: "P2", unitId: "u2", state: "proposed" }]).map(u => u.code)).toEqual(["V-02", "V-10"]);
  });

  it("finds the shape under a point, the smallest when shapes nest, and none outside", () => {
    const nested: DxfDrawing = { ...read, polygons: [{ id: "BIG", layer: "A", points: [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }], source: "lwpolyline" }, { id: "SMALL", layer: "A", points: [{ x: 10, y: 10 }, { x: 30, y: 10 }, { x: 30, y: 30 }, { x: 10, y: 30 }], source: "lwpolyline" }] };
    expect(shapeAt(nested, { x: 20, y: 20 })).toBe("SMALL");
    expect(shapeAt(nested, { x: 60, y: 60 })).toBe("BIG");
    expect(shapeAt(nested, { x: 150, y: 20 })).toBeNull();
  });
});
