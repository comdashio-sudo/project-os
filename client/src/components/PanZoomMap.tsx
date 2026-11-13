// Drag and touch gestures for the plan map, the zoom and reset buttons, and the view they show. The maths is in lib/mapView.ts.
// The hook gives the SVG its viewBox and pointer handlers; the component draws the buttons. A drag moves the drawing, one finger drags
// and two fingers pinch. A press that moves only a little is still a click on a shape.
import React, { useEffect, useRef, useState } from "react";
import { fitRegion, gestureStep, initialView, MAX_ZOOM, MIN_ZOOM, resetView, restoreView, stepZoom, viewBoxOf, withZoomPercent, zoomAt, zoomPercent, ZOOM_STEP, ZOOM_STEP_PERCENT, type Bounds, type BoxSize, type MapView, type Point } from "@/lib/mapView";

// Movement below this many pixels is a click, not a drag.
export const DRAG_SLOP_PX = 5;

const FALLBACK_BOUNDS: Bounds = { x: 0, y: 0, width: 1, height: 1 };

export type PanZoom = {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
  /** Q-20: the zoom in whole percent (100 = the whole drawing fitted), and setting it from the slider or the 100% button (the centre stays). */
  percent: number;
  setPercent: (percent: number) => void;
  /** Q-20: bring a part of the drawing into view (a block chosen in the filter). */
  focus: (region: Bounds) => void;
  // Spread onto the SVG element: its viewBox, its ref (for the box size) and the pointer handlers.
  svgProps: {
    ref: React.RefObject<SVGSVGElement | null>;
    viewBox: string;
    // Set inline, not by a class: the browser must not pan or zoom the page under a finger on the map, and a missing CSS class would break that silently.
    style: React.CSSProperties;
    onPointerDown: (event: React.PointerEvent<SVGSVGElement>) => void;
    onPointerMove: (event: React.PointerEvent<SVGSVGElement>) => void;
    onPointerUp: (event: React.PointerEvent<SVGSVGElement>) => void;
    onPointerCancel: (event: React.PointerEvent<SVGSVGElement>) => void;
    onClickCapture: (event: React.MouseEvent<SVGSVGElement>) => void;
    onDoubleClick: (event: React.MouseEvent<SVGSVGElement>) => void;
  };
};

// Q-20: the last view is kept on this device for one person and one project (`storageKey`), and only for the same drawing; a missing or blocked storage
// just starts at the whole drawing.
function readStored(storageKey: string | undefined, key: string, bounds: Bounds): MapView | null {
  if (!storageKey) return null;
  try { const stored = JSON.parse(localStorage.getItem(storageKey) ?? "null"); return stored?.key === key ? restoreView(bounds, stored.view) : null; } catch { return null; }
}

export function usePanZoom(drawing: Bounds | null, options: { storageKey?: string } = {}): PanZoom {
  const bounds = drawing ?? FALLBACK_BOUNDS;
  // The view starts again when the drawing changes; a re-render with the same drawing keeps the view the person set.
  const key = `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`;
  const startView = () => (drawing ? readStored(options.storageKey, key, bounds) : null) ?? initialView(bounds);
  const [shown, setShown] = useState<{ key: string; view: MapView }>(() => ({ key, view: startView() }));
  if (shown.key !== key) setShown({ key, view: startView() });
  const view = shown.view;
  useEffect(() => {
    if (!options.storageKey || !drawing) return;
    try { localStorage.setItem(options.storageKey, JSON.stringify({ key, view })); } catch { /* storage off: the view is not kept */ }
  }, [options.storageKey, drawing, key, view]);

  const svgRef = useRef<SVGSVGElement | null>(null);
  const pointers = useRef(new Map<number, Point>());
  const downAt = useRef(new Map<number, Point>());
  const moved = useRef(false);

  const update = (step: (current: MapView) => MapView) => setShown(previous => ({ key, view: step(previous.key === key ? previous.view : initialView(bounds)) }));

  const pointInBox = (event: React.PointerEvent<SVGSVGElement>): Point => {
    const rect = svgRef.current?.getBoundingClientRect();
    return { x: event.clientX - (rect?.left ?? 0), y: event.clientY - (rect?.top ?? 0) };
  };
  const sizeOfBox = (): BoxSize => {
    const rect = svgRef.current?.getBoundingClientRect();
    return { width: rect?.width ?? 0, height: rect?.height ?? 0 };
  };

  function onPointerDown(event: React.PointerEvent<SVGSVGElement>) {
    // Only the main mouse button drags; touch and pen always count.
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (pointers.current.size === 0) moved.current = false;
    const position = pointInBox(event);
    pointers.current.set(event.pointerId, position);
    downAt.current.set(event.pointerId, position);
  }

  function onPointerMove(event: React.PointerEvent<SVGSVGElement>) {
    const current = pointers.current;
    if (!current.has(event.pointerId)) return;
    const ids = Array.from(current.keys());
    const previous = ids.map(id => current.get(id)!);
    const position = pointInBox(event);
    current.set(event.pointerId, position);
    const next = ids.map(id => current.get(id)!);
    const start = downAt.current.get(event.pointerId);
    // A second finger is never a click, so a pinch starts at once. One finger starts a drag after the slop, from where it went down.
    let justStarted = false;
    if (!moved.current && (ids.length >= 2 || (start && Math.hypot(position.x - start.x, position.y - start.y) > DRAG_SLOP_PX))) {
      moved.current = true;
      justStarted = true;
      // Capture only once it is a drag: capturing on press would move the click to the map and the shape would not get it.
      svgRef.current?.setPointerCapture?.(event.pointerId);
    }
    if (!moved.current) return;
    const from = justStarted && ids.length === 1 && start ? [start] : previous;
    const size = sizeOfBox();
    update(current => gestureStep(bounds, current, from, next, size));
  }

  function onPointerEnd(event: React.PointerEvent<SVGSVGElement>) {
    pointers.current.delete(event.pointerId);
    downAt.current.delete(event.pointerId);
    if (svgRef.current?.hasPointerCapture?.(event.pointerId)) svgRef.current.releasePointerCapture(event.pointerId);
  }

  // After a drag, the release would also click the shape under the finger. That click is dropped; keyboard clicks (detail 0) are not.
  function onClickCapture(event: React.MouseEvent<SVGSVGElement>) {
    if (moved.current && event.detail !== 0) {
      moved.current = false;
      event.stopPropagation();
      event.preventDefault();
    }
  }

  // Q-20: Ctrl (or ⌘) + wheel zooms around the pointer; a plain wheel still scrolls the page. The listener is not passive, so the page does not also zoom.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheel = (event: WheelEvent) => {
      if (!event.ctrlKey && !event.metaKey) return;
      event.preventDefault();
      const rect = svg.getBoundingClientRect();
      const factor = Math.exp(-Math.max(-100, Math.min(100, event.deltaY)) / 300);
      update(current => zoomAt(bounds, current, factor, { x: event.clientX - rect.left, y: event.clientY - rect.top }, { width: rect.width, height: rect.height }));
    };
    svg.addEventListener("wheel", onWheel, { passive: false });
    return () => svg.removeEventListener("wheel", onWheel);
  });

  // Q-20: a double click (or double tap) zooms in around that point.
  function onDoubleClick(event: React.MouseEvent<SVGSVGElement>) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    update(current => zoomAt(bounds, current, ZOOM_STEP, { x: event.clientX - rect.left, y: event.clientY - rect.top }, { width: rect.width, height: rect.height }));
  }

  const shownBox = viewBoxOf(bounds, view);
  return {
    zoomIn: () => update(current => stepZoom(bounds, current, 1)),
    zoomOut: () => update(current => stepZoom(bounds, current, -1)),
    reset: () => update(() => resetView(bounds)),
    percent: zoomPercent(view),
    setPercent: percent => update(current => withZoomPercent(bounds, current, percent)),
    focus: region => update(() => fitRegion(bounds, region)),
    svgProps: {
      ref: svgRef,
      viewBox: `${shownBox.x} ${shownBox.y} ${shownBox.width} ${shownBox.height}`,
      style: { touchAction: "none", userSelect: "none" },
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onClickCapture,
      onDoubleClick,
    },
  };
}

/**
 * Q-20: the zoom toolbar, always above the map: − and + (25% steps), a slider (25%–800%), the current percent, "fit to screen" (the whole drawing,
 * centred) and "100%" (back to the fitted size, the centre where it is). Every control is at least 44 px; the percent is in Western digits.
 */
export function PanZoomControls({ pan, labels }: { pan: PanZoom; labels: { zoomIn: string; zoomOut: string; reset: string; hundred?: string; slider?: string } }) {
  const button = "inline-flex min-h-11 min-w-11 items-center justify-center rounded-[var(--radius)] border border-border bg-card px-3 text-sm font-medium hover:bg-muted";
  return (
    <div role="toolbar" aria-label={labels.slider ?? labels.zoomIn} className="sticky top-14 z-10 mb-2 flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-border bg-card/95 p-2 backdrop-blur">
      <button type="button" className={button} onClick={pan.zoomOut} aria-label={labels.zoomOut} disabled={pan.percent <= MIN_ZOOM * 100}>−</button>
      <input type="range" min={MIN_ZOOM * 100} max={MAX_ZOOM * 100} step={ZOOM_STEP_PERCENT} value={Math.min(MAX_ZOOM * 100, Math.max(MIN_ZOOM * 100, Math.round(pan.percent / ZOOM_STEP_PERCENT) * ZOOM_STEP_PERCENT))} onChange={event => pan.setPercent(Number(event.target.value))} aria-label={labels.slider ?? labels.zoomIn} aria-valuetext={`${pan.percent}%`} className="h-11 min-w-28 flex-1 accent-[var(--primary)]" />
      <button type="button" className={button} onClick={pan.zoomIn} aria-label={labels.zoomIn} disabled={pan.percent >= MAX_ZOOM * 100}>+</button>
      <output aria-live="polite" data-zoom-percent className="min-w-14 text-center text-sm font-semibold tabular-nums"><bdi dir="ltr">{pan.percent}%</bdi></output>
      <button type="button" className={button} onClick={pan.reset}>{labels.reset}</button>
      <button type="button" className={button} onClick={() => pan.setPercent(100)}>{labels.hundred ?? "100%"}</button>
    </div>
  );
}
