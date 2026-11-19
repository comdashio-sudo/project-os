// @vitest-environment jsdom
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach } from "vitest";
afterEach(cleanup);

const curve = vi.fn();
vi.mock("@/lib/trpc", () => ({ trpc: { pmcSite: { curve: { useQuery: () => curve() } } } }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "ar", isArabic: true }) }));

import { ProjectHero, plannedToDate } from "./ProjectHero";

const points = [
  { month: "2026-09-01", plannedCumulative: 0.3, actualCumulative: 0.28 },
  { month: "2026-10-01", plannedCumulative: 0.45, actualCumulative: 0.4 },
  { month: "2026-11-01", plannedCumulative: 0.512, actualCumulative: 0.468 },
  { month: "2026-12-01", plannedCumulative: 0.6, actualCumulative: null },
];

describe("ProjectHero (Q-19 3)", () => {
  it("reads the plan at today from the last started month", () => {
    expect(plannedToDate(points, "2026-11-19")).toBe(0.512);
    expect(plannedToDate(points, "2026-08-01")).toBeNull();
  });
  it("shows the weighted actual, the plan and the points behind it", () => {
    curve.mockReturnValue({ data: { points, today: "2026-11-19", actualToDate: 0.468, deviationToDate: -0.044 } });
    render(<ProjectHero tenantId="t" projectId="p" />);
    expect(screen.getByTestId("project-hero-actual").textContent).toContain("46.8");
    expect(screen.getByTestId("project-hero-delta").textContent).toMatch(/−4\.4/);
    expect(screen.getByTestId("project-hero").textContent).toContain("51.2");
  });
  it("is left out with no villas or no curve — never a made-up number", () => {
    curve.mockReturnValue({ data: { points: [], today: "2026-11-19", actualToDate: 0, deviationToDate: null } });
    const { container } = render(<ProjectHero tenantId="t" projectId="p" />);
    expect(container.textContent).toBe("");
    curve.mockReturnValue({ data: undefined });
    expect(render(<ProjectHero tenantId="t" projectId="p" />).container.textContent).toBe("");
  });
});
