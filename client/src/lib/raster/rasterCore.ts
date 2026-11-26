// Raster drawings (PNG, JPEG, one page of a PDF) become the same shape a DXF read produces, so the unit matcher and the review
// editor work on them unchanged. This file is pure: no canvas, no wasm. The browser-only steps live in rasterFile.ts and ocrReader.ts.
import type { DxfDrawing, DxfPoint, DxfPolygon } from "@/lib/dxf/dxfReader";

/** `tint` (Q-62): per pixel 0 = page (near white), 1 = dark ink, 2 = colour. A coloured plan — villas as filled rectangles in pale colours — turns almost
 *  white in grey, so the colour is kept beside the grey for the filled-shape detector. Absent for an image made in grey (a test, a PDF page in grey). */
export type GrayImage = { width: number; height: number; data: Uint8Array; tint?: Uint8Array };

/** A pixel counts as colour when its channels spread this far apart, as dark when its luma is below DARK_LUMA; anything else is page. */
export const COLOUR_SPREAD = 40;
export const DARK_LUMA = 110;

// A shape found on the drawing, in image pixels (y grows downward).
export type RasterShape = { id: string; points: DxfPoint[]; x: number; y: number; width: number; height: number };

export type LabelRead = { polygonId: string; text: string; confidence: number };

// The codes a drawing carries: letters, digits, and the separators used in unit codes (for example B1-U-0001 or 12/A).
export const UNIT_LABEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{2,}$/;

// Below this Tesseract confidence (0 to 100) the label is treated as not read. A wrong code is worse than no code: the shape then needs a person.
export const MIN_LABEL_CONFIDENCE = 70;

// ITU-R BT.601 luma, the same weights the browser uses when it draws colour to grey.
export function rgbaToGray(rgba: Uint8ClampedArray, width: number, height: number): GrayImage {
  const data = new Uint8Array(width * height);
  const tint = new Uint8Array(width * height);
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    const r = rgba[p], g = rgba[p + 1], b = rgba[p + 2];
    data[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
    tint[i] = data[i] < DARK_LUMA ? 1 : Math.max(r, g, b) - Math.min(r, g, b) >= COLOUR_SPREAD ? 2 : 0;
  }
  return { width, height, data, tint };
}

// Returns the trimmed code when the read is confident enough and has the shape of a unit code; null otherwise.
export function acceptLabel(text: string, confidence: number): string | null {
  if (confidence < MIN_LABEL_CONFIDENCE) return null;
  const trimmed = text.trim();
  return UNIT_LABEL_PATTERN.test(trimmed) ? trimmed : null;
}

const LAYER = "RASTER";

// Shapes become closed polygons and each accepted label becomes a text at the middle of its shape. The matcher then does the rest.
// Image rows grow downward; a DXF drawing's y grows upward, and the plan map draws it that way. So y is flipped here, once, for the whole drawing.
export function buildRasterDrawing(shapes: RasterShape[], labels: { polygonId: string; text: string }[], imageHeight: number): DxfDrawing {
  const up = (y: number) => imageHeight - y;
  const polygons: DxfPolygon[] = shapes.map(shape => ({
    id: shape.id,
    layer: LAYER,
    points: shape.points.map(point => ({ x: point.x, y: up(point.y) })),
    source: "lwpolyline",
  }));
  const byId = new Map(shapes.map(shape => [shape.id, shape]));
  const texts = labels.flatMap(label => {
    const shape = byId.get(label.polygonId);
    if (!shape) return [];
    return [{ layer: LAYER, position: { x: shape.x + shape.width / 2, y: up(shape.y + shape.height / 2) }, text: label.text }];
  });
  return { layers: [LAYER], polygons, texts, warnings: [], ignoredEntities: {} };
}
