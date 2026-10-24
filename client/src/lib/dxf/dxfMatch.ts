// Pure matcher: links DXF polygons (unit boundaries) to project units by unit code. See docs/specs/MASTER_PLAN_DXF.md.
//
// Rules (the code rule is the one the server applies to Excel and spatial imports: the cell is trimmed, then compared
// exactly. No case folding and no separator folding. In this system a unit's "number" (رقم الوحدة) is its code):
// 1. A text belongs to the smallest closed polygon that contains its position. No polygon: unmatched.
// 2. A polygon with more than one text is ambiguous. None of its texts is linked.
// 3. A polygon with one text links to the project unit whose code equals that text. No such unit: unmatched text.
// 4. A code shared by two project units, or by two polygons, is ambiguous. Nothing is linked for it.
// 5. A polygon with no text is unmatched. Nothing is guessed from geometry or from neighbours.

import type { DxfDrawing, DxfPoint, DxfPolygon, DxfText } from "./dxfReader";

export type ProjectUnit = { id: string; code: string };

export type DxfLink = { unitId: string; code: string; polygonId: string };

export type DxfUnmatched =
  | { kind: "text"; text: string; layer: string; position: DxfPoint; reason: "outside_polygons" | "no_project_unit" }
  | { kind: "polygon"; polygonId: string; layer: string; reason: "no_text" };

export type DxfAmbiguous =
  | { reason: "several_texts_in_polygon"; polygonId: string; texts: string[] }
  | { reason: "duplicate_unit_code"; polygonId: string; code: string; unitIds: string[] }
  | { reason: "several_polygons_for_unit"; unitId: string; code: string; polygonIds: string[] };

export type DxfMatchReport = {
  linked: DxfLink[];
  unmatched: DxfUnmatched[];
  ambiguous: DxfAmbiguous[];
  unitsRemaining: ProjectUnit[];
  counts: {
    polygons: number;
    texts: number;
    linked: number;
    unmatched: number;
    ambiguous: number;
    unitsTotal: number;
    unitsLinked: number;
    unitsRemaining: number;
  };
};

type Shape = { polygon: DxfPolygon; area: number; minX: number; minY: number; maxX: number; maxY: number };

function shapeOf(polygon: DxfPolygon): Shape {
  const xs = polygon.points.map(point => point.x);
  const ys = polygon.points.map(point => point.y);
  let twiceArea = 0;
  polygon.points.forEach((point, i) => {
    const next = polygon.points[(i + 1) % polygon.points.length];
    twiceArea += point.x * next.y - next.x * point.y;
  });
  return { polygon, area: Math.abs(twiceArea) / 2, minX: Math.min(...xs), minY: Math.min(...ys), maxX: Math.max(...xs), maxY: Math.max(...ys) };
}

// Ray casting. A point exactly on an edge may fall either way; drawings place texts away from edges.
function containsPoint(points: DxfPoint[], point: DxfPoint): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i];
    const b = points[j];
    const straddles = (a.y > point.y) !== (b.y > point.y);
    if (straddles && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function smallestContaining(shapes: Shape[], point: DxfPoint): Shape | undefined {
  let best: Shape | undefined;
  for (const shape of shapes) {
    if (point.x < shape.minX || point.x > shape.maxX || point.y < shape.minY || point.y > shape.maxY) continue;
    if (!containsPoint(shape.polygon.points, point)) continue;
    if (!best || shape.area < best.area) best = shape;
  }
  return best;
}

export function matchDrawingToUnits(drawing: DxfDrawing, units: ProjectUnit[]): DxfMatchReport {
  const shapes = drawing.polygons.map(shapeOf);

  const unitsByCode = new Map<string, ProjectUnit[]>();
  for (const unit of units) {
    const code = unit.code.trim();
    if (!code) continue;
    const list = unitsByCode.get(code);
    if (list) list.push(unit);
    else unitsByCode.set(code, [unit]);
  }

  const unmatched: DxfUnmatched[] = [];
  const ambiguous: DxfAmbiguous[] = [];
  const textsByPolygon = new Map<string, DxfText[]>();
  let textCount = 0;

  for (const drawingText of drawing.texts) {
    const text = drawingText.text.trim();
    if (!text) continue;
    textCount++;
    const owner = smallestContaining(shapes, drawingText.position);
    if (!owner) {
      unmatched.push({ kind: "text", text, layer: drawingText.layer, position: drawingText.position, reason: "outside_polygons" });
      continue;
    }
    const list = textsByPolygon.get(owner.polygon.id);
    const entry = { ...drawingText, text };
    if (list) list.push(entry);
    else textsByPolygon.set(owner.polygon.id, [entry]);
  }

  // Candidate links per unit. A unit is linked only when exactly one polygon claims it.
  const claims = new Map<string, { unit: ProjectUnit; polygonIds: string[] }>();
  for (const shape of shapes) {
    const { polygon } = shape;
    const owned = textsByPolygon.get(polygon.id) ?? [];
    if (owned.length === 0) {
      unmatched.push({ kind: "polygon", polygonId: polygon.id, layer: polygon.layer, reason: "no_text" });
      continue;
    }
    if (owned.length > 1) {
      ambiguous.push({ reason: "several_texts_in_polygon", polygonId: polygon.id, texts: owned.map(entry => entry.text) });
      continue;
    }
    const [only] = owned;
    const matches = unitsByCode.get(only.text) ?? [];
    if (matches.length === 0) {
      unmatched.push({ kind: "text", text: only.text, layer: only.layer, position: only.position, reason: "no_project_unit" });
      continue;
    }
    if (matches.length > 1) {
      ambiguous.push({ reason: "duplicate_unit_code", polygonId: polygon.id, code: only.text, unitIds: matches.map(unit => unit.id) });
      continue;
    }
    const unit = matches[0];
    const claim = claims.get(unit.id);
    if (claim) claim.polygonIds.push(polygon.id);
    else claims.set(unit.id, { unit, polygonIds: [polygon.id] });
  }

  const linked: DxfLink[] = [];
  Array.from(claims.values()).forEach(({ unit, polygonIds }) => {
    if (polygonIds.length === 1) linked.push({ unitId: unit.id, code: unit.code.trim(), polygonId: polygonIds[0] });
    else ambiguous.push({ reason: "several_polygons_for_unit", unitId: unit.id, code: unit.code.trim(), polygonIds });
  });

  const linkedUnitIds = new Set(linked.map(link => link.unitId));
  const unitsRemaining = units.filter(unit => !linkedUnitIds.has(unit.id));

  return {
    linked,
    unmatched,
    ambiguous,
    unitsRemaining,
    counts: {
      polygons: drawing.polygons.length,
      texts: textCount,
      linked: linked.length,
      unmatched: unmatched.length,
      ambiguous: ambiguous.length,
      unitsTotal: units.length,
      unitsLinked: linked.length,
      unitsRemaining: unitsRemaining.length,
    },
  };
}
