// Synthetic pixel grids only, built in this file.
import { describe, expect, it } from "vitest";
import { detectShapes, otsuThreshold } from "./shapeDetector";
import type { GrayImage } from "./rasterCore";

const SIZE = 120;

// A white page with dark outlines: each rectangle is [x0, y0, x1, y1], drawn 2 pixels thick.
function page(rectangles: [number, number, number, number][], gaps: { x: number; y: number }[] = []): GrayImage {
  const data = new Uint8Array(SIZE * SIZE).fill(255);
  const dark = (x: number, y: number) => {
    if (gaps.some(gap => gap.x === x && gap.y === y)) return;
    data[y * SIZE + x] = 0;
  };
  for (const [x0, y0, x1, y1] of rectangles) {
    for (let x = x0; x <= x1; x++) for (let t = 0; t < 2; t++) { dark(x, y0 + t); dark(x, y1 - t); }
    for (let y = y0; y <= y1; y++) for (let t = 0; t < 2; t++) { dark(x0 + t, y); dark(x1 - t, y); }
  }
  return { width: SIZE, height: SIZE, data };
}

describe("otsuThreshold", () => {
  it("falls between the dark lines and the light page", () => {
    const data = new Uint8Array([0, 0, 0, 255, 255, 255, 255]);
    const threshold = otsuThreshold(data);
    expect(threshold).toBeGreaterThanOrEqual(0);
    expect(threshold).toBeLessThan(255);
  });
});

describe("detectShapes", () => {
  it("finds each enclosed outline as a shape with its inner box", () => {
    const shapes = detectShapes(page([[10, 10, 40, 40], [60, 60, 100, 90]]));
    expect(shapes).toHaveLength(2);
    // the outline is 2 pixels thick, so the inside starts 2 pixels in and stops 2 pixels short of the far edge
    expect(shapes[0]).toMatchObject({ id: "shape-1", x: 12, y: 12, width: 27, height: 27 });
    expect(shapes[1]).toMatchObject({ id: "shape-2", x: 62, y: 62, width: 37, height: 27 });
  });

  it("refuses an outline with a gap, because its inside is open to the page edge", () => {
    // a gap through both rows of the top line opens the outline to the page
    const gap = [24, 25, 26, 27].flatMap(x => [{ x, y: 10 }, { x, y: 11 }]);
    expect(detectShapes(page([[10, 10, 40, 40]], gap))).toHaveLength(0);
  });

  it("drops glyph-sized holes below the minimum area", () => {
    // a 4 by 4 hole is far below the minimum for a 120 by 120 page
    expect(detectShapes(page([[50, 50, 55, 55]]))).toHaveLength(0);
  });

  it("finds nothing on a blank page", () => {
    expect(detectShapes({ width: SIZE, height: SIZE, data: new Uint8Array(SIZE * SIZE).fill(255) })).toHaveLength(0);
  });
});
