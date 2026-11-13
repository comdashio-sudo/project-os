// Pure geometry only: no DOM. The drawing bounds here are invented numbers, not a real drawing.
import { describe, expect, it } from "vitest";
import { MAX_ZOOM, MIN_ZOOM, clampCenter, clampZoom, fitRegion, gestureStep, initialView, panBy, resetView, restoreView, stepZoom, viewBoxOf, withZoomPercent, zoomAt, zoomPercent, type Bounds, type MapView } from "./mapView";

const BOUNDS: Bounds = { x: 0, y: 0, width: 400, height: 200 };
const BOX = { width: 800, height: 400 };
const close = (actual: number, expected: number) => expect(actual).toBeCloseTo(expected, 9);

describe("initialView and resetView", () => {
  it("shows the whole drawing, centred, at zoom 1", () => {
    const view = initialView({ x: 100, y: -50, width: 400, height: 200 });
    expect(view).toEqual({ zoom: 1, centerX: 300, centerY: 50 });
    expect(viewBoxOf({ x: 100, y: -50, width: 400, height: 200 }, view)).toEqual({ x: 100, y: -50, width: 400, height: 200 });
  });

  it("returns to the same view whatever the user did", () => {
    expect(resetView(BOUNDS)).toEqual(initialView(BOUNDS));
  });
});

describe("viewBoxOf", () => {
  it("halves the shown width and height at zoom 2 and keeps the centre", () => {
    const box = viewBoxOf(BOUNDS, { zoom: 2, centerX: 200, centerY: 100 });
    expect(box).toEqual({ x: 100, y: 50, width: 200, height: 100 });
  });
});

describe("clampZoom", () => {
  it("keeps the zoom between the limits and refuses non-numbers", () => {
    expect(clampZoom(0.01)).toBe(MIN_ZOOM);
    expect(clampZoom(100)).toBe(MAX_ZOOM);
    expect(clampZoom(2)).toBe(2);
    expect(clampZoom(Number.NaN)).toBe(1);
  });
});

describe("clampCenter", () => {
  it("does not let the view centre leave the drawing", () => {
    expect(clampCenter(BOUNDS, { zoom: 4, centerX: -500, centerY: 900 })).toEqual({ zoom: 4, centerX: 0, centerY: 200 });
  });
});

describe("panBy", () => {
  it("moves the drawing with the pointer: a drag to the right shows the left part", () => {
    // 800 px box shows 400 drawing units at zoom 1, so 80 px is 40 units.
    const view = panBy(BOUNDS, initialView(BOUNDS), { x: 80, y: 0 }, BOX);
    close(view.centerX, 200 - 40);
    close(view.centerY, 100);
  });

  it("moves less per pixel when zoomed in", () => {
    const zoomed: MapView = { zoom: 2, centerX: 200, centerY: 100 };
    // at zoom 2 the box shows 200 by 100 units: 80 px is 20 units across, 40 px is 10 units down
    const view = panBy(BOUNDS, zoomed, { x: 80, y: 40 }, BOX);
    close(view.centerX, 200 - 20);
    close(view.centerY, 100 - 10);
  });

  it("stops at the edge of the drawing", () => {
    const view = panBy(BOUNDS, { zoom: 2, centerX: 10, centerY: 10 }, { x: 800, y: 800 }, BOX);
    expect(view.centerX).toBe(0);
    expect(view.centerY).toBe(0);
  });

  it("ignores a box with no size", () => {
    const view: MapView = { zoom: 1, centerX: 200, centerY: 100 };
    expect(panBy(BOUNDS, view, { x: 50, y: 50 }, { width: 0, height: 0 })).toBe(view);
  });
});

describe("zoomAt", () => {
  it("keeps the drawing point under the anchor fixed", () => {
    const anchor = { x: 200, y: 100 }; // a quarter of the way across and down the box
    const before = viewBoxOf(BOUNDS, initialView(BOUNDS));
    const pointX = before.x + 0.25 * before.width;
    const pointY = before.y + 0.25 * before.height;
    const view = zoomAt(BOUNDS, initialView(BOUNDS), 2, anchor, BOX);
    const after = viewBoxOf(BOUNDS, view);
    close(after.x + 0.25 * after.width, pointX);
    close(after.y + 0.25 * after.height, pointY);
    expect(view.zoom).toBe(2);
  });

  it("zooms in around the centre with an anchor in the middle of the box", () => {
    const view = zoomAt(BOUNDS, initialView(BOUNDS), 1.5, { x: 400, y: 200 }, BOX);
    expect(view.zoom).toBe(1.5);
    close(view.centerX, 200);
    close(view.centerY, 100);
  });

  it("stops at the maximum and minimum zoom", () => {
    expect(zoomAt(BOUNDS, { zoom: MAX_ZOOM, centerX: 200, centerY: 100 }, 1.5, { x: 400, y: 200 }, BOX).zoom).toBe(MAX_ZOOM);
    expect(zoomAt(BOUNDS, { zoom: MIN_ZOOM, centerX: 200, centerY: 100 }, 1 / 1.5, { x: 400, y: 200 }, BOX).zoom).toBe(MIN_ZOOM);
  });

  it("ignores a zero, negative or infinite factor, and an empty box", () => {
    const view = initialView(BOUNDS);
    expect(zoomAt(BOUNDS, view, 0, { x: 1, y: 1 }, BOX)).toBe(view);
    expect(zoomAt(BOUNDS, view, -2, { x: 1, y: 1 }, BOX)).toBe(view);
    expect(zoomAt(BOUNDS, view, Number.POSITIVE_INFINITY, { x: 1, y: 1 }, BOX)).toBe(view);
    expect(zoomAt(BOUNDS, view, 2, { x: 1, y: 1 }, { width: 0, height: 10 })).toBe(view);
  });
});

describe("gestureStep", () => {
  const view = initialView(BOUNDS);

  it("pans with one pointer", () => {
    const next = gestureStep(BOUNDS, view, [{ x: 100, y: 100 }], [{ x: 180, y: 100 }], BOX);
    expect(next).toEqual(panBy(BOUNDS, view, { x: 80, y: 0 }, BOX));
  });

  it("zooms with two pointers that move apart", () => {
    const previous = [{ x: 300, y: 200 }, { x: 500, y: 200 }];
    const next = [{ x: 200, y: 200 }, { x: 600, y: 200 }]; // distance 200 becomes 400
    const result = gestureStep(BOUNDS, view, previous, next, BOX);
    expect(result.zoom).toBe(2);
  });

  it("zooms out when the pointers come together", () => {
    const previous = [{ x: 200, y: 200 }, { x: 600, y: 200 }];
    const next = [{ x: 300, y: 200 }, { x: 500, y: 200 }];
    expect(gestureStep(BOUNDS, view, previous, next, BOX).zoom).toBe(0.5);
  });

  it("pans with the midpoint of two pointers that move together", () => {
    const previous = [{ x: 300, y: 200 }, { x: 500, y: 200 }];
    const next = [{ x: 340, y: 200 }, { x: 540, y: 200 }];
    const result = gestureStep(BOUNDS, view, previous, next, BOX);
    expect(result.zoom).toBe(1);
    close(result.centerX, 200 - 20);
  });

  it("leaves the view alone when the number of pointers changed or is not one or two", () => {
    expect(gestureStep(BOUNDS, view, [{ x: 1, y: 1 }], [{ x: 1, y: 1 }, { x: 2, y: 2 }], BOX)).toBe(view);
    expect(gestureStep(BOUNDS, view, [], [], BOX)).toBe(view);
    const three = [{ x: 1, y: 1 }, { x: 2, y: 2 }, { x: 3, y: 3 }];
    expect(gestureStep(BOUNDS, view, three, three, BOX)).toBe(view);
  });

  it("does not divide by zero when two pointers start on the same spot", () => {
    const same = [{ x: 100, y: 100 }, { x: 100, y: 100 }];
    const result = gestureStep(BOUNDS, view, same, [{ x: 90, y: 100 }, { x: 110, y: 100 }], BOX);
    expect(result.zoom).toBe(1);
  });
});

describe("Q-20: 25% steps, percent, fit to a block, a kept view", () => {
  const B: Bounds = { x: 0, y: 0, width: 400, height: 200 };
  it("steps to the next multiple of 25% in each direction, from on or off a step, within 25%–800%", () => {
    const at = (zoom: number) => ({ zoom, centerX: 200, centerY: 100 });
    expect(zoomPercent(stepZoom(B, at(1), 1))).toBe(125);
    expect(zoomPercent(stepZoom(B, at(1.8), 1))).toBe(200);
    expect(zoomPercent(stepZoom(B, at(1.8), -1))).toBe(175);
    expect(zoomPercent(stepZoom(B, at(0.25), -1))).toBe(25);
    expect(zoomPercent(stepZoom(B, at(8), 1))).toBe(800);
    expect(withZoomPercent(B, { zoom: 3, centerX: 50, centerY: 40 }, 100)).toEqual({ zoom: 1, centerX: 50, centerY: 40 });
  });
  it("fits a region with a margin, centred on it", () => {
    const view = fitRegion(B, { x: 0, y: 0, width: 100, height: 50 });
    expect(view.centerX).toBe(50); expect(view.centerY).toBe(25);
    expect(view.zoom).toBeCloseTo(4 * 0.9, 6);
  });
  it("NEGATIVE: a stored view that is not a view (missing or non-numeric fields) is not used", () => {
    expect(restoreView(B, { zoom: 2, centerX: 100, centerY: 50 })).toEqual({ zoom: 2, centerX: 100, centerY: 50 });
    expect(restoreView(B, null)).toBeNull();
    expect(restoreView(B, { zoom: "2", centerX: 1, centerY: 1 })).toBeNull();
    expect(restoreView(B, { zoom: Number.NaN, centerX: 1, centerY: 1 })).toBeNull();
    expect(restoreView(B, { zoom: 50, centerX: 9999, centerY: -9 })).toEqual({ zoom: MAX_ZOOM, centerX: 400, centerY: 0 }); // clamped, not trusted as is
  });
});
