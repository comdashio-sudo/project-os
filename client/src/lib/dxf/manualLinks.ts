// Q-8: linking a unit to the drawing by hand, for an image or a flattened PDF where no shape carries the unit's number (and for a DXF shape the reader missed).
// One tap makes a small square around the point; several taps make a polygon. The new shape joins the drawing like any read shape (its id "M1", "M2", … on
// the layer MANUAL), already confirmed to the chosen unit: the person chose it, so it is not a proposal. Saving stores it with the other shapes and links.
import type { DxfDrawing, DxfPoint } from "./dxfReader";
import type { ProjectUnit } from "./dxfMatch";
import type { ReviewItem } from "./dxfReview";

export const MANUAL_LAYER = "MANUAL";

/** A square of the given side centred on the point: the shape of a one-tap link. */
export function squareAround(point: DxfPoint, side: number): DxfPoint[] {
  const half = side / 2;
  return [{ x: point.x - half, y: point.y - half }, { x: point.x + half, y: point.y - half }, { x: point.x + half, y: point.y + half }, { x: point.x - half, y: point.y + half }];
}

/** The side of a one-tap square: a little of the drawing's larger side, so it reads as a marker at any drawing size. */
export function markerSide(drawing: DxfDrawing): number {
  const points = drawing.polygons.flatMap(polygon => polygon.points);
  if (points.length === 0) return 10;
  const span = Math.max(Math.max(...points.map(p => p.x)) - Math.min(...points.map(p => p.x)), Math.max(...points.map(p => p.y)) - Math.min(...points.map(p => p.y)));
  return span > 0 ? span / 60 : 10;
}

export type ManualResult = { ok: true; drawing: DxfDrawing; items: ReviewItem[]; polygonId: string } | { ok: false; code: "TOO_FEW_POINTS" | "UNIT_ALREADY_LINKED" };

/** Adds a hand-drawn shape linked to the unit. Refused when the unit already sits on a confirmed shape, or with fewer than three points. */
export function addManualShape(drawing: DxfDrawing, items: ReviewItem[], points: DxfPoint[], unit: ProjectUnit): ManualResult {
  if (points.length < 3) return { ok: false, code: "TOO_FEW_POINTS" };
  if (items.some(item => item.state === "confirmed" && item.unitId === unit.id)) return { ok: false, code: "UNIT_ALREADY_LINKED" };
  const used = new Set(drawing.polygons.map(polygon => polygon.id));
  let n = 1;
  while (used.has(`M${n}`)) n += 1;
  const polygonId = `M${n}`;
  return {
    ok: true,
    polygonId,
    drawing: { ...drawing, layers: drawing.layers.includes(MANUAL_LAYER) ? drawing.layers : [...drawing.layers, MANUAL_LAYER], polygons: [...drawing.polygons, { id: polygonId, layer: MANUAL_LAYER, points, source: "lwpolyline" }] },
    items: [...items, { polygonId, layer: MANUAL_LAYER, unitId: unit.id, unitCode: unit.code, state: "confirmed", reason: null, candidateUnitIds: [] }],
  };
}

/** Removes a hand-drawn shape (a read shape is never removed here). */
export function removeManualShape(drawing: DxfDrawing, items: ReviewItem[], polygonId: string): { drawing: DxfDrawing; items: ReviewItem[] } {
  if (!drawing.polygons.some(polygon => polygon.id === polygonId && polygon.layer === MANUAL_LAYER)) return { drawing, items };
  return { drawing: { ...drawing, polygons: drawing.polygons.filter(polygon => polygon.id !== polygonId) }, items: items.filter(item => item.polygonId !== polygonId) };
}

/** The units with no confirmed shape yet, in code order: the «not linked» list. */
export function unlinkedUnits<T extends ProjectUnit>(units: T[], items: ReviewItem[]): T[] {
  const linked = new Set(items.filter(item => item.state === "confirmed" && item.unitId).map(item => item.unitId));
  return units.filter(unit => !linked.has(unit.id)).sort((a, b) => a.code.localeCompare(b.code, "en", { numeric: true }));
}

/** The shape under a point (ray casting); the smallest one when shapes nest. Null when the point is on no shape. */
export function shapeAt(drawing: DxfDrawing, point: DxfPoint): string | null {
  const inside = (points: DxfPoint[]) => {
    let hit = false;
    for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
      const a = points[i]!; const b = points[j]!;
      if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
    }
    return hit;
  };
  const area = (points: DxfPoint[]) => Math.abs(points.reduce((sum, p, i) => { const q = points[(i + 1) % points.length]!; return sum + p.x * q.y - q.x * p.y; }, 0)) / 2;
  const hits = drawing.polygons.filter(polygon => inside(polygon.points)).sort((a, b) => area(a.points) - area(b.points));
  return hits[0]?.id ?? null;
}
