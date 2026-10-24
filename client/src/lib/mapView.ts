// Pan and zoom for the plan map, as pure functions. The map is an SVG whose viewBox shows part of the drawing's bounds:
// zoom 1 shows all of it, zoom 2 shows half the width and height, and the centre says where the view is.
// The component (PanZoomMap.tsx) only collects pointer positions in pixels and calls these functions.

export type Bounds = { x: number; y: number; width: number; height: number };
export type MapView = { zoom: number; centerX: number; centerY: number };
export type Point = { x: number; y: number };
export type BoxSize = { width: number; height: number };
export type ViewBox = { x: number; y: number; width: number; height: number };

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 8;
// One press of the zoom buttons. The buttons and the pinch both use the same steps as the map did before panning existed.
export const ZOOM_STEP = 1.5;

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
