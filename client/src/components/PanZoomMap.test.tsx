/** @vitest-environment jsdom */
// The buttons and the reset, on an invented drawing. Drags and pinches need a real pointer, so they are checked in a browser instead.
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
    expect(width).toBeCloseTo(400 / 1.25, 6); // Q-20: one press is 25 percentage points (100% → 125%)
    expect(height).toBeCloseTo(200 / 1.25, 6);
    expect(x + width / 2).toBeCloseTo(200, 6);
    expect(y + height / 2).toBeCloseTo(100, 6);
    fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(shown()[2]).toBeCloseTo(400, 6);
  });

  it("stops zooming in at the maximum", () => {
    render(<Harness />);
    for (let press = 0; press < 40; press++) fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
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

// Q-20: the toolbar (percent, slider, 100%), Ctrl + wheel, double click, and the view kept for one person and project.
function Kept({ storageKey, drawing = DRAWING }: { storageKey?: string; drawing?: typeof DRAWING }) {
  const pan = usePanZoom(drawing, { storageKey });
  return (
    <>
      <PanZoomControls pan={pan} labels={{ ...labels, hundred: "100%", slider: "Zoom level" }} />
      <svg role="img" aria-label="map" {...pan.svgProps} />
    </>
  );
}
const percent = () => document.querySelector("[data-zoom-percent]")!.textContent;

describe("Q-20: the zoom toolbar", () => {
  beforeEach(() => localStorage.clear());

  it("shows the percent in Western digits, moves in 25% steps, and stops at 25% and 800% with the button disabled", () => {
    render(<Kept />);
    expect(percent()).toBe("100%");
    fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(percent()).toBe("125%");
    for (let press = 0; press < 10; press++) fireEvent.click(screen.getByRole("button", { name: "Zoom out" }));
    expect(percent()).toBe("25%");
    expect((screen.getByRole("button", { name: "Zoom out" }) as HTMLButtonElement).disabled).toBe(true);
    for (let press = 0; press < 40; press++) fireEvent.click(screen.getByRole("button", { name: "Zoom in" }));
    expect(percent()).toBe("800%");
    expect((screen.getByRole("button", { name: "Zoom in" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("the slider sets the zoom; 100% returns to the fitted size keeping the centre; fit returns to the whole drawing", () => {
    render(<Kept />);
    fireEvent.change(screen.getByRole("slider", { name: "Zoom level" }), { target: { value: "300" } });
    expect(percent()).toBe("300%");
    expect(shown()[2]).toBeCloseTo(400 / 3, 6);
    fireEvent.click(screen.getByRole("button", { name: "100%" }));
    expect(percent()).toBe("100%");
    fireEvent.click(screen.getByRole("button", { name: "Reset view" }));
    expect(shown()).toEqual([0, 0, 400, 200]);
  });

  it("Ctrl + wheel zooms around the pointer; a plain wheel leaves the map alone (the page scrolls)", () => {
    render(<Kept />);
    const map = screen.getByRole("img", { name: "map" });
    map.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.wheel(map, { deltaY: -100, clientX: 100, clientY: 50 });
    expect(percent()).toBe("100%");
    fireEvent.wheel(map, { deltaY: -100, clientX: 100, clientY: 50, ctrlKey: true });
    const [x, y, width] = shown();
    expect(width).toBeLessThan(400);
    // the drawing point under the pointer (100, 50) stays under it: a quarter of the way across and down
    expect(x + width * 0.25).toBeCloseTo(100, 6);
    expect(y + shown()[3] * 0.25).toBeCloseTo(50, 6);
  });

  it("a double click zooms in around that point", () => {
    render(<Kept />);
    const map = screen.getByRole("img", { name: "map" });
    map.getBoundingClientRect = () => ({ left: 0, top: 0, width: 400, height: 200, right: 400, bottom: 200, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.doubleClick(map, { clientX: 300, clientY: 150 });
    expect(percent()).toBe("150%");
    const [x, , width] = shown();
    expect(x + width * 0.75).toBeCloseTo(300, 6);
  });

  it("keeps the last view for this person and project, and starts again for another drawing (NEGATIVE)", () => {
    const first = render(<Kept storageKey="dashio-plan-view:7:project-1" />);
    fireEvent.change(screen.getByRole("slider", { name: "Zoom level" }), { target: { value: "200" } });
    first.unmount();
    render(<Kept storageKey="dashio-plan-view:7:project-1" />);
    expect(percent()).toBe("200%");
    cleanup();
    render(<Kept storageKey="dashio-plan-view:7:project-1" drawing={{ x: 0, y: 0, width: 999, height: 500 }} />);
    expect(percent()).toBe("100%");
    cleanup();
    localStorage.setItem("dashio-plan-view:7:project-2", "{not json");
    render(<Kept storageKey="dashio-plan-view:7:project-2" />);
    expect(percent()).toBe("100%");
  });
});
