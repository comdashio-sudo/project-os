// Synthetic inputs only. Pixel values and labels are built here; no real drawing or personal data.
import { describe, expect, it } from "vitest";
import { MIN_LABEL_CONFIDENCE, acceptLabel, buildRasterDrawing, rgbaToGray, type RasterShape } from "./rasterCore";

const square = (id: string, x: number, y: number): RasterShape => ({
  id,
  points: [{ x, y }, { x: x + 10, y }, { x: x + 10, y: y + 10 }, { x, y: y + 10 }],
  x,
  y,
  width: 10,
  height: 10,
});

describe("rgbaToGray", () => {
  it("weights colour the way the browser does and keeps white and black exact", () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255]);
    expect(Array.from(rgbaToGray(rgba, 3, 1).data)).toEqual([76, 255, 0]);
  });
});

describe("acceptLabel", () => {
  it("refuses a read below the confidence threshold, even when the text looks like a code", () => {
    expect(acceptLabel("B1-U-0001", MIN_LABEL_CONFIDENCE - 1)).toBeNull();
  });

  it("accepts a confident unit code and trims surrounding space", () => {
    expect(acceptLabel("  B1-U-0001 ", 91)).toBe("B1-U-0001");
  });

  it("refuses text that is not shaped like a unit code", () => {
    expect(acceptLabel("", 99)).toBeNull();
    expect(acceptLabel("A B", 99)).toBeNull();
    expect(acceptLabel("?", 99)).toBeNull();
  });
});

describe("buildRasterDrawing", () => {
  it("flips rows to the DXF upward convention, puts each label in the middle of its shape, and drops labels for unknown shapes", () => {
    // a 100 pixel tall image: the square spans rows 40 to 50, which is 60 to 50 in an upward drawing
    const shapes = [square("shape-1", 20, 40)];
    const drawing = buildRasterDrawing(shapes, [{ polygonId: "shape-1", text: "B1-U-0001" }, { polygonId: "ghost", text: "B1-U-0002" }], 100);
    expect(drawing.layers).toEqual(["RASTER"]);
    expect(drawing.polygons).toEqual([{ id: "shape-1", layer: "RASTER", points: [{ x: 20, y: 60 }, { x: 30, y: 60 }, { x: 30, y: 50 }, { x: 20, y: 50 }], source: "lwpolyline" }]);
    expect(drawing.texts).toEqual([{ layer: "RASTER", position: { x: 25, y: 55 }, text: "B1-U-0001" }]);
  });
});
