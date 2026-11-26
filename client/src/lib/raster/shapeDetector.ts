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

// Q-62: the owner's plan was the other common kind — each villa a small filled rectangle in a pale colour (its status or type), often turned with the street,
// its number in small dark text, white gaps between villas. The line detector above finds nothing there: the fill is not light enough to be «inside», and a
// villa among 1,200 is far below its minimum area. This detector takes the coloured regions themselves: a 4-connected run of colour and ink (the number
// inside belongs to its villa) that holds mostly colour, is small next to the page, does not touch the edge, and fills its turned rectangle well.
export const FILLED_MIN_PIXELS = 40;
export const FILLED_MAX_AREA_RATIO = 0.02;
const FILLED_MIN_COLOUR_SHARE = 0.5;
const FILLED_MIN_RECT_FILL = 0.6;

export function detectFilledShapes(image: GrayImage): RasterShape[] {
  const { width, height, tint } = image;
  if (!tint) return [];
  const maxArea = width * height * FILLED_MAX_AREA_RATIO;
  const visited = new Uint8Array(width * height);
  const stack = new Int32Array(width * height);
  const pixels = new Int32Array(width * height);
  const shapes: Omit<RasterShape, "id">[] = [];
  for (let start = 0; start < tint.length; start++) {
    if (visited[start] || tint[start] === 0) continue;
    let top = 0; let count = 0; let colour = 0; let touchesEdge = false;
    stack[top++] = start; visited[start] = 1;
    while (top > 0) {
      const index = stack[--top];
      pixels[count++] = index;
      if (tint[index] === 2) colour++;
      const x = index % width; const y = (index - x) / width;
      if (x === 0 || y === 0 || x === width - 1 || y === height - 1) touchesEdge = true;
      if (x > 0 && !visited[index - 1] && tint[index - 1]) { visited[index - 1] = 1; stack[top++] = index - 1; }
      if (x < width - 1 && !visited[index + 1] && tint[index + 1]) { visited[index + 1] = 1; stack[top++] = index + 1; }
      if (y > 0 && !visited[index - width] && tint[index - width]) { visited[index - width] = 1; stack[top++] = index - width; }
      if (y < height - 1 && !visited[index + width] && tint[index + width]) { visited[index + width] = 1; stack[top++] = index + width; }
    }
    if (touchesEdge || count < FILLED_MIN_PIXELS || count > maxArea || colour < count * FILLED_MIN_COLOUR_SHARE) continue;
    const shape = orientedRectangle(pixels, count, width);
    if (count < shape.area * FILLED_MIN_RECT_FILL) continue;
    shapes.push(shape.shape);
  }
  return sortReadingOrder(shapes);
}

/** The turned rectangle around a region: its axes from the region's second moments, its sides from the extent along each axis. */
function orientedRectangle(pixels: Int32Array, count: number, width: number) {
  let sx = 0, sy = 0;
  for (let i = 0; i < count; i++) { const x = pixels[i] % width; sx += x; sy += (pixels[i] - x) / width; }
  const cx = sx / count, cy = sy / count;
  let xx = 0, yy = 0, xy = 0;
  for (let i = 0; i < count; i++) { const x = pixels[i] % width - cx; const y = (pixels[i] - (pixels[i] % width)) / width - cy; xx += x * x; yy += y * y; xy += x * y; }
  const angle = 0.5 * Math.atan2(2 * xy, xx - yy);
  const ux = Math.cos(angle), uy = Math.sin(angle);
  let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
  for (let i = 0; i < count; i++) {
    const x = pixels[i] % width - cx; const y = (pixels[i] - (pixels[i] % width)) / width - cy;
    const u = x * ux + y * uy; const v = -x * uy + y * ux;
    if (u < minU) minU = u; if (u > maxU) maxU = u; if (v < minV) minV = v; if (v > maxV) maxV = v;
  }
  // a pixel is a unit square: the rectangle reaches half a pixel past the outermost centres
  minU -= 0.5; maxU += 0.5; minV -= 0.5; maxV += 0.5;
  const corner = (u: number, v: number) => ({ x: cx + u * ux - v * uy + 0.5, y: cy + u * uy + v * ux + 0.5 });
  const points = [corner(minU, minV), corner(maxU, minV), corner(maxU, maxV), corner(minU, maxV)];
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  const x = Math.floor(Math.min(...xs)), y = Math.floor(Math.min(...ys));
  return { area: (maxU - minU) * (maxV - minV), shape: { points, x, y, width: Math.ceil(Math.max(...xs)) - x, height: Math.ceil(Math.max(...ys)) - y } };
}

/** The shapes of a raster plan: the line detector's or the filled detector's, whichever finds more (a plan is one kind or the other). */
export function detectPlanShapes(image: GrayImage): RasterShape[] {
  const lines = detectShapes(image);
  const filled = detectFilledShapes(image);
  return filled.length > lines.length ? filled : lines;
}
