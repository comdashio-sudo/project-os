// Finds the closed shapes of a raster drawing. The lines are dark; the page and the inside of each closed unit are light. A light region that
// does not reach the edge of the image is enclosed by lines, so it is one shape. Text inside a unit is dark and does not split its region,
// and its glyph holes are small enough to be dropped by the minimum area.
//
// This is plain TypeScript, not OpenCV.js: OpenCV's wasm runtime evaluates generated code with `new Function`, which the page's CSP refuses
// (it allows wasm compilation, not eval). The rectangle of each region is its bounding box, so a non-rectangular unit is matched by its box.
import type { GrayImage, RasterShape } from "./rasterCore";

// A shape must cover at least this share of the drawing. Glyph holes are far smaller; a unit on a plan is usually much larger.
export const MIN_SHAPE_AREA_RATIO = 0.002;

// Regions whose pixels fill less than this share of their box are rings or fragments, not units.
const MIN_FILL_RATIO = 0.5;

// Otsu's method: the grey level that best separates the dark lines from the light page.
export function otsuThreshold(data: Uint8Array): number {
  const histogram = new Array<number>(256).fill(0);
  for (let i = 0; i < data.length; i++) histogram[data[i]]++;
  const total = data.length;
  let sumAll = 0;
  for (let level = 0; level < 256; level++) sumAll += level * histogram[level];
  let weightDark = 0;
  let sumDark = 0;
  let bestVariance = -1;
  let threshold = 128;
  for (let level = 0; level < 256; level++) {
    weightDark += histogram[level];
    if (weightDark === 0) continue;
    const weightLight = total - weightDark;
    if (weightLight === 0) break;
    sumDark += level * histogram[level];
    const meanDark = sumDark / weightDark;
    const meanLight = (sumAll - sumDark) / weightLight;
    const variance = weightDark * weightLight * (meanDark - meanLight) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      threshold = level;
    }
  }
  return threshold;
}

type Region = { minX: number; minY: number; maxX: number; maxY: number; area: number; touchesEdge: boolean };

export function detectShapes(image: GrayImage, minAreaRatio = MIN_SHAPE_AREA_RATIO): RasterShape[] {
  const { width, height, data } = image;
  const threshold = otsuThreshold(data);
  const minArea = width * height * minAreaRatio;
  const visited = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  const regions: Region[] = [];

  for (let start = 0; start < data.length; start++) {
    if (visited[start] || data[start] <= threshold) continue;
    const region: Region = { minX: width, minY: height, maxX: -1, maxY: -1, area: 0, touchesEdge: false };
    let top = 0;
    stack[top++] = start;
    visited[start] = 1;
    while (top > 0) {
      const index = stack[--top];
      const x = index % width;
      const y = (index - x) / width;
      region.area++;
      if (x < region.minX) region.minX = x;
      if (x > region.maxX) region.maxX = x;
      if (y < region.minY) region.minY = y;
      if (y > region.maxY) region.maxY = y;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) region.touchesEdge = true;
      // 4-connected light neighbours join the region
      if (x > 0 && !visited[index - 1] && data[index - 1] > threshold) { visited[index - 1] = 1; stack[top++] = index - 1; }
      if (x < width - 1 && !visited[index + 1] && data[index + 1] > threshold) { visited[index + 1] = 1; stack[top++] = index + 1; }
      if (y > 0 && !visited[index - width] && data[index - width] > threshold) { visited[index - width] = 1; stack[top++] = index - width; }
      if (y < height - 1 && !visited[index + width] && data[index + width] > threshold) { visited[index + width] = 1; stack[top++] = index + width; }
    }
    regions.push(region);
  }

  const shapes = regions.flatMap(region => {
    if (region.touchesEdge || region.area < minArea) return [];
    const boxWidth = region.maxX - region.minX + 1;
    const boxHeight = region.maxY - region.minY + 1;
    if (region.area / (boxWidth * boxHeight) < MIN_FILL_RATIO) return [];
    const { minX: x, minY: y } = region;
    const points = [
      { x, y },
      { x: x + boxWidth, y },
      { x: x + boxWidth, y: y + boxHeight },
      { x, y: y + boxHeight },
    ];
    return [{ points, x, y, width: boxWidth, height: boxHeight }];
  });
  return sortReadingOrder(shapes);
}

// Ids follow reading order (top to bottom, then left to right) so the review list reads the way the drawing does.
function sortReadingOrder(shapes: Omit<RasterShape, "id">[]): RasterShape[] {
  const ordered = [...shapes].sort((a, b) => (Math.abs(a.y - b.y) > a.height / 2 ? a.y - b.y : a.x - b.x));
  return ordered.map((shape, index) => ({ ...shape, id: `shape-${index + 1}` }));
}
