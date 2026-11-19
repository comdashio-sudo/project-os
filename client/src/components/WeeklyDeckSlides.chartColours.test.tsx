// @vitest-environment jsdom
import React from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { SvgChart, resetChartPalette } from "./WeeklyDeckSlides";

afterEach(() => { cleanup(); resetChartPalette(); });

const marks = (container: HTMLElement) => Array.from(container.querySelectorAll("rect[fill], path[fill], polyline[stroke]")).map(node => node.getAttribute("fill") === "none" ? node.getAttribute("stroke") : node.getAttribute("fill") ?? node.getAttribute("stroke"));

describe("Q-29 (P-100): the weekly and monthly charts are coloured in the PDF too", () => {
  it("every bar and line carries a resolved six-digit colour, never var(--chart-N) (a canvas snapshot draws that black)", () => {
    const { container } = render(<>
      <SvgChart title="S" w={400} h={200} chart={{ type: "line", labels: ["1", "2"], series: [{ name: "planned", values: [1, 2] }, { name: "actual", values: [1, 1.5] }] }} />
      <SvgChart title="L" w={400} h={200} chart={{ type: "bar", stacked: true, labels: ["a", "b"], series: [{ name: "direct", values: [3, 4] }, { name: "indirect", values: [1, 2] }] }} />
    </>);
    const colours = marks(container).filter(Boolean);
    expect(colours.length).toBeGreaterThan(3);
    for (const value of colours) expect(value).toMatch(/^#[0-9A-F]{6}$/i);
    expect(container.innerHTML).not.toContain("var(--chart");
  });
  it("series get different colours", () => {
    const { container } = render(<SvgChart title="L" w={400} h={200} chart={{ type: "bar", labels: ["a"], series: [{ name: "x", values: [1] }, { name: "y", values: [2] }] }} />);
    const fills = Array.from(container.querySelectorAll("rect[fill]")).map(node => node.getAttribute("fill"));
    expect(new Set(fills).size).toBeGreaterThan(1);
  });
});
