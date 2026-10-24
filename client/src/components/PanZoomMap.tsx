// Drag and touch gestures for the plan map, the zoom and reset buttons, and the view they show. The maths is in lib/mapView.ts.
// The hook gives the SVG its viewBox and pointer handlers; the component draws the buttons. A drag moves the drawing, one finger drags
// and two fingers pinch. A press that moves only a little is still a click on a shape.
import React, { useRef, useState } from "react";
import { clampCenter, clampZoom, gestureStep, initialView, resetView, viewBoxOf, ZOOM_STEP, type Bounds, type BoxSize, type MapView, type Point } from "@/lib/mapView";

// Movement below this many pixels is a click, not a drag.
export const DRAG_SLOP_PX = 5;

const FALLBACK_BOUNDS: Bounds = { x: 0, y: 0, width: 1, height: 1 };

export type PanZoom = {
  zoomIn: () => void;
  zoomOut: () => void;
  reset: () => void;
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
  };
};

export function usePanZoom(drawing: Bounds | null): PanZoom {
  const bounds = drawing ?? FALLBACK_BOUNDS;
  // The view starts again when the drawing changes; a re-render with the same drawing keeps the view the person set.
  const key = `${bounds.x},${bounds.y},${bounds.width},${bounds.height}`;
  const [shown, setShown] = useState<{ key: string; view: MapView }>(() => ({ key, view: initialView(bounds) }));
  if (shown.key !== key) setShown({ key, view: initialView(bounds) });
  const view = shown.view;

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

  const shownBox = viewBoxOf(bounds, view);
  return {
    zoomIn: () => update(current => clampCenter(bounds, { ...current, zoom: clampZoom(current.zoom * ZOOM_STEP) })),
    zoomOut: () => update(current => clampCenter(bounds, { ...current, zoom: clampZoom(current.zoom / ZOOM_STEP) })),
    reset: () => update(() => resetView(bounds)),
    svgProps: {
      ref: svgRef,
      viewBox: `${shownBox.x} ${shownBox.y} ${shownBox.width} ${shownBox.height}`,
      style: { touchAction: "none", userSelect: "none" },
      onPointerDown,
      onPointerMove,
      onPointerUp: onPointerEnd,
      onPointerCancel: onPointerEnd,
      onClickCapture,
    },
  };
}

export function PanZoomControls({ pan, labels }: { pan: PanZoom; labels: { zoomIn: string; zoomOut: string; reset: string } }) {
  const button = "min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm";
  return (
    <div className="mb-2 flex flex-wrap gap-2">
      <button type="button" className={button} onClick={pan.zoomIn} aria-label={labels.zoomIn}>+</button>
      <button type="button" className={button} onClick={pan.zoomOut} aria-label={labels.zoomOut}>−</button>
      <button type="button" className={button} onClick={pan.reset}>{labels.reset}</button>
    </div>
  );
}
