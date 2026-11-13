// Pan and zoom for the plan map, as pure functions. The map is an SVG whose viewBox shows part of the drawing's bounds:
// zoom 1 shows all of it, zoom 2 shows half the width and height, and the centre says where the view is.
// The component (PanZoomMap.tsx) only collects pointer positions in pixels and calls these functions.

export type Bounds = { x: number; y: number; width: number; height: number };
export type MapView = { zoom: number; centerX: number; centerY: number };
export type Point = { x: number; y: number };
export type BoxSize = { width: number; height: number };
export type ViewBox = { x: number; y: number; width: number; height: number };

// Q-20: 25% to 800% of the drawing fitted to the map box (zoom 1 = 100% = the whole drawing in view).
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 8;
// The factor of one double tap (and of the older button steps, kept for callers that still use it).
export const ZOOM_STEP = 1.5;
// Q-20: the buttons and the slider move in steps of 25 percentage points.
export const ZOOM_STEP_PERCENT = 25;

export function initialView(bounds: Bounds): MapView {
  return { zoom: 1, centerX: bounds.x + bounds.width / 2, centerY: bounds.y + bounds.height / 2 };
}

export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return 1;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

// The part of the drawing the view shows, in drawing units.
export function viewBoxOf(bounds: Bounds, view: MapView): ViewBox {
  const width = bounds.width / view.zoom;
  const height = bounds.height / view.zoom;
  return { x: view.centerX - width / 2, y: view.centerY - height / 2, width, height };
}

// The centre stays on the drawing, so a drag cannot lose the plan off the edge of the map.
export function clampCenter(bounds: Bounds, view: MapView): MapView {
  const centerX = Math.min(bounds.x + bounds.width, Math.max(bounds.x, view.centerX));
  const centerY = Math.min(bounds.y + bounds.height, Math.max(bounds.y, view.centerY));
  return { zoom: view.zoom, centerX, centerY };
}

// Pointer positions are in pixels from the top-left of the map box; `anchor` is a point of that box (pixels).
// The drawing point under the anchor stays under it after the zoom, which is what a pinch or a wheel is expected to do.
export function zoomAt(bounds: Bounds, view: MapView, factor: number, anchor: Point, box: BoxSize): MapView {
  if (!(factor > 0) || !Number.isFinite(factor) || box.width <= 0 || box.height <= 0) return view;
  const zoom = clampZoom(view.zoom * factor);
  const before = viewBoxOf(bounds, view);
  const fractionX = anchor.x / box.width;
  const fractionY = anchor.y / box.height;
  const pointX = before.x + fractionX * before.width;
  const pointY = before.y + fractionY * before.height;
  const width = bounds.width / zoom;
  const height = bounds.height / zoom;
  return clampCenter(bounds, {
    zoom,
    centerX: pointX - fractionX * width + width / 2,
    centerY: pointY - fractionY * height + height / 2,
  });
}

// A drag moves the drawing with the pointer: a pointer that moves 10 pixels right moves the drawing 10 pixels right on screen.
export function panBy(bounds: Bounds, view: MapView, deltaPx: Point, box: BoxSize): MapView {
  if (box.width <= 0 || box.height <= 0) return view;
  const shown = viewBoxOf(bounds, view);
  return clampCenter(bounds, {
    zoom: view.zoom,
    centerX: view.centerX - (deltaPx.x * shown.width) / box.width,
    centerY: view.centerY - (deltaPx.y * shown.height) / box.height,
  });
}

// One step of a gesture. `previous` and `next` hold the same pointers in the same order, one or two of them, in box pixels.
// One pointer pans. Two pointers zoom by the change in their distance and pan with the change in their midpoint.
// Any other count leaves the view as it is: the caller starts a new baseline when a finger goes down or up.
export function gestureStep(bounds: Bounds, view: MapView, previous: Point[], next: Point[], box: BoxSize): MapView {
  if (previous.length !== next.length) return view;
  if (previous.length === 1) {
    return panBy(bounds, view, { x: next[0].x - previous[0].x, y: next[0].y - previous[0].y }, box);
  }
  if (previous.length === 2) {
    const distanceBefore = distance(previous[0], previous[1]);
    const distanceAfter = distance(next[0], next[1]);
    const zoomed = distanceBefore > 0 && distanceAfter > 0 ? zoomAt(bounds, view, distanceAfter / distanceBefore, midpoint(previous[0], previous[1]), box) : view;
    const midBefore = midpoint(previous[0], previous[1]);
    const midAfter = midpoint(next[0], next[1]);
    return panBy(bounds, zoomed, { x: midAfter.x - midBefore.x, y: midAfter.y - midBefore.y }, box);
  }
  return view;
}

export function resetView(bounds: Bounds): MapView {
  return initialView(bounds);
}

function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: Point, b: Point): Point {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

// Q-20: the zoom as the whole percent the toolbar shows (100 = the drawing fitted to the box).
export function zoomPercent(view: MapView): number {
  return Math.round(view.zoom * 100);
}

// Q-20: set the zoom to a percent, keeping the centre where it is (the "100%" button and the slider), within 25%–800%.
export function withZoomPercent(bounds: Bounds, view: MapView, percent: number): MapView {
  if (!Number.isFinite(percent)) return view;
  return clampCenter(bounds, { ...view, zoom: clampZoom(percent / 100) });
}

// Q-20: one press of + or −: to the next multiple of 25% in that direction (175% → 200%, and 180% → 200% too), keeping the centre.
export function stepZoom(bounds: Bounds, view: MapView, direction: 1 | -1): MapView {
  const percent = view.zoom * 100;
  const onStep = Math.abs(percent / ZOOM_STEP_PERCENT - Math.round(percent / ZOOM_STEP_PERCENT)) < 1e-6;
  const next = direction > 0
    ? (onStep ? Math.round(percent / ZOOM_STEP_PERCENT) + 1 : Math.ceil(percent / ZOOM_STEP_PERCENT)) * ZOOM_STEP_PERCENT
    : (onStep ? Math.round(percent / ZOOM_STEP_PERCENT) - 1 : Math.floor(percent / ZOOM_STEP_PERCENT)) * ZOOM_STEP_PERCENT;
  return withZoomPercent(bounds, view, next);
}

// Q-20: the view that shows `region` (a part of the drawing, e.g. one block's villas) with a margin, within the zoom limits.
export function fitRegion(bounds: Bounds, region: Bounds, margin = 0.1): MapView {
  if (!(region.width > 0) || !(region.height > 0)) return clampCenter(bounds, { zoom: clampZoom(MAX_ZOOM / 2), centerX: region.x + (region.width || 0) / 2, centerY: region.y + (region.height || 0) / 2 });
  const zoom = clampZoom(Math.min(bounds.width / region.width, bounds.height / region.height) * (1 - margin));
  return clampCenter(bounds, { zoom, centerX: region.x + region.width / 2, centerY: region.y + region.height / 2 });
}

// Q-20: a stored view is used only if it is a real view of these bounds (a different drawing, or a damaged entry, falls back to the whole drawing).
export function restoreView(bounds: Bounds, stored: unknown): MapView | null {
  if (!stored || typeof stored !== "object") return null;
  const { zoom, centerX, centerY } = stored as Record<string, unknown>;
  if (typeof zoom !== "number" || typeof centerX !== "number" || typeof centerY !== "number" || ![zoom, centerX, centerY].every(Number.isFinite)) return null;
  return clampCenter(bounds, { zoom: clampZoom(zoom), centerX, centerY });
}
