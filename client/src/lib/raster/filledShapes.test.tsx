import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { rgbaToGray } from "./rasterCore";
import { detectFilledShapes, detectPlanShapes, detectShapes } from "./shapeDetector";

// Q-62 (3): the owner's plan image — the common kind: each villa a small filled rectangle in a pale colour, turned with the street, its number in small dark
// text, white gaps, roads in dark lines, a green park. It gave «0 shapes». Synthetic: drawn here pixel by pixel, no real plan.
const PALETTE = [[255, 236, 150], [170, 220, 255], [190, 240, 190], [255, 200, 200], [230, 200, 255]] as const;
function colouredPlan({ columns = 20, rows = 20, angle = 0.35, gap = true } = {}) {
  const width = columns * 40 + 40, height = rows * 40 + 40;
  const rgba = new Uint8ClampedArray(width * height * 4).fill(255);
  const paint = (x: number, y: number, [r, g, b]: readonly number[]) => { if (x < 0 || y < 0 || x >= width || y >= height) return; const p = (y * width + x) * 4; rgba[p] = r; rgba[p + 1] = g; rgba[p + 2] = b; };
  for (let x = 0; x < width; x++) for (const y of [10, 11, height - 12]) paint(x, y, [40, 40, 40]); // roads, edge to edge
  const centres: Array<{ x: number; y: number }> = [];
  for (let row = 0; row < rows; row++) for (let column = 0; column < columns; column++) {
    const cx = 40 + column * 40, cy = 40 + row * 40; centres.push({ x: cx, y: cy });
    const colour = PALETTE[(row * columns + column) % PALETTE.length];
    const halfU = gap ? 13 : 21, halfV = gap ? 8 : 21; // with no gap the villas overlap their neighbours
    for (let y = cy - 20; y <= cy + 20; y++) for (let x = cx - 20; x <= cx + 20; x++) {
      const dx = x - cx, dy = y - cy; const u = dx * Math.cos(angle) + dy * Math.sin(angle); const v = -dx * Math.sin(angle) + dy * Math.cos(angle);
      if (Math.abs(u) <= halfU && Math.abs(v) <= halfV) paint(x, y, Math.abs(u) <= 5 && Math.abs(v) <= 2 ? [20, 20, 20] : colour); // the number: a dark mark in the middle
    }
  }
  return { image: rgbaToGray(rgba, width, height), centres, width, height, rgba };
}

describe("a coloured plan: villas as small filled rectangles (Q-62 (3))", () => {
  it("POSITIVE: every villa of a 400-villa plan is found, turned with the street, its middle where the villa is", () => {
    const { image, centres } = colouredPlan();
    const shapes = detectFilledShapes(image);
    expect(shapes).toHaveLength(400);
    const middle = (shape: (typeof shapes)[number]) => ({ x: shape.points.reduce((s, p) => s + p.x, 0) / 4, y: shape.points.reduce((s, p) => s + p.y, 0) / 4 });
    for (const centre of centres) expect(shapes.some(shape => Math.hypot(middle(shape).x - (centre.x + 0.5), middle(shape).y - (centre.y + 0.5)) < 1.5)).toBe(true);
    const [a, b] = shapes[0].points; // the long side follows the street's angle (0.35 rad), not the page
    expect(Math.abs(Math.atan2(b.y - a.y, b.x - a.x) % Math.PI)).toBeCloseTo(0.35, 1);
    expect(detectPlanShapes(image)).toHaveLength(400);
  });

  it("the old line detector finds none of them — the failure the owner saw", () => {
    expect(detectShapes(colouredPlan().image).length).toBeLessThan(10);
  });

  it("NEGATIVE: ink without colour (text, lines), a park larger than a villa can be, and an image with no colour data give no filled shapes", () => {
    const { image, width, height, rgba } = colouredPlan({ columns: 4, rows: 4 });
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) { const p = (y * width + x) * 4; if (rgba[p] !== 255 || rgba[p + 1] !== 255 || rgba[p + 2] !== 255) { const l = rgba[p] < 60 ? 20 : 255; rgba[p] = rgba[p + 1] = rgba[p + 2] = l; } }
    expect(detectFilledShapes(rgbaToGray(rgba, width, height))).toEqual([]); // the colours removed: only the dark marks and roads are left
    const park = new Uint8ClampedArray(200 * 200 * 4).fill(255);
    for (let y = 20; y < 180; y++) for (let x = 20; x < 180; x++) { const p = (y * 200 + x) * 4; park[p] = 150; park[p + 1] = 220; park[p + 2] = 150; }
    expect(detectFilledShapes(rgbaToGray(park, 200, 200))).toEqual([]);
    expect(detectFilledShapes({ width: image.width, height: image.height, data: image.data })).toEqual([]);
  });

  it("villas that touch are one region: they are not split into a guessed count", () => {
    expect(detectFilledShapes(colouredPlan({ columns: 3, rows: 3, gap: false }).image).length).toBeLessThan(9);
  });

  it("a line drawing still goes to the line detector: the filled detector adds nothing there", () => {
    const png = PNG.sync.read(readFileSync(new URL("./fixtures/synthetic-units-grid.png", import.meta.url)));
    const image = rgbaToGray(Uint8ClampedArray.from(png.data), png.width, png.height);
    expect(detectFilledShapes(image)).toEqual([]);
    expect(detectPlanShapes(image)).toEqual(detectShapes(image));
  });
});
