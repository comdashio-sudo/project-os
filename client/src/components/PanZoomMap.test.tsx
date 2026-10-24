/** @vitest-environment jsdom */
// The buttons and the reset, on an invented drawing. Drags and pinches need a real pointer, so they are checked in a browser instead.
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PanZoomControls, usePanZoom } from "./PanZoomMap";

const DRAWING = { x: 0, y: 0, width: 400, height: 200 };
const labels = { zoomIn: "Zoom in", zoomOut: "Zoom out", reset: "Reset view" };

function Harness() {
  const pan = usePanZoom(DRAWING);
  return (
    <>
      <PanZoomControls pan={pan} labels={labels} />
      <svg role="img" aria-label="map" {...pan.svgProps} />
    </>
  );
}

// The viewBox as numbers: x, y, width, height.
const shown = () => (screen.getByRole("img", { name: "map" }).getAttribute("viewBox") ?? "").split(" ").map(Number);

afterEach(cleanup);

describe("usePanZoom with the zoom and reset buttons", () => {
  it("shows the whole drawing at first", () => {
    render(<Harness />);
    expect(shown()).toEqual([0, 0, 400, 200]);
  });

  it("zooms in around the middle and back out", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    const [x, y, width, height] = shown();
    expect(width).toBeCloseTo(400 / 1.5, 6);
    expect(height).toBeCloseTo(200 / 1.5, 6);
    expect(x + width / 2).toBeCloseTo(200, 6);
    expect(y + height / 2).toBeCloseTo(100, 6);
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(shown()[2]).toBeCloseTo(400, 6);
  });

  it("stops zooming in at the maximum", () => {
    render(<Harness />);
    for (let press = 0; press < 20; press++) fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(shown()[2]).toBeCloseTo(400 / 8, 6);
  });

  it("returns to the whole drawing with the reset button", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    fireEvent.click(screen.getByRole("button", { name: "Reset view" }));
    expect(shown()).toEqual([0, 0, 400, 200]);
  });
});
