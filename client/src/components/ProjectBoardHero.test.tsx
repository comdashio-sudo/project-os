// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ canRead: true, query: {} as unknown, input: undefined as unknown, options: undefined as unknown }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "en", isArabic: false, isRtl: false }) }));
vi.mock("@/lib/permissions", () => ({ useCanPage: () => state.canRead }));
vi.mock("@/lib/trpc", () => ({ trpc: { reportPeriods: { monthly: { useQuery: (input: unknown, options: unknown) => { state.input = input; state.options = options; return state.query; } } } } }));

import { ProjectBoardHero, latestProgress, programmeDay, siteDay } from "./ProjectBoardHero";

const points = [
  { month: "2026-09", planned: 20, actual: 18 },
  { month: "2026-10", planned: 35, actual: 31.4 },
  { month: "2026-11", planned: 48, actual: null },
];

beforeEach(() => { state.canRead = true; state.query = { isLoading: false, error: null, data: { sCurve: { plannedSource: "p6", points } } }; });
afterEach(cleanup);

describe("Q-19 (3): the project board's hero", () => {
  it("counts the day of the programme from the earliest planned start (day 1 is that day), and none before it or without a start", () => {
    expect(programmeDay([new Date("2026-11-10T00:00:00Z"), "2026-11-01T00:00:00Z", null], "2026-11-19")).toBe(19);
    expect(programmeDay([], "2026-11-19")).toBeNull();
    expect(programmeDay(["2026-12-01T00:00:00Z"], "2026-11-19")).toBeNull();
    expect(siteDay(new Date("2026-11-19T22:30:00Z"))).toBe("2026-11-20"); // the site's day (UTC+3), as the daily report counts it
  });

  it("takes the latest month that has an actual, with that month's plan", () => {
    expect(latestProgress(points)).toEqual({ actual: 31.4, planned: 35 });
    expect(latestProgress([{ month: "2026-11", planned: 5, actual: null }])).toBeNull();
  });

  it("shows weighted actual against plan with the deviation, reading the monthly report of this month", () => {
    render(<ProjectBoardHero tenantId="t" projectId="p" starts={[]} />);
    expect(screen.getByRole("region", { name: "Weighted progress" })).toBeTruthy();
    expect(document.querySelector("[data-hero-actual]")?.textContent).toMatch(/31\.4/);
    expect(document.querySelector("[data-hero-planned]")?.textContent).toMatch(/35/);
    expect(screen.getByText(/Behind/)).toBeTruthy();
    expect(screen.getByRole("img", { name: "Progress curve: actual against planned" })).toBeTruthy();
    expect((state.input as { month: string }).month).toBe(siteDay().slice(0, 7));
  });

  it("without the monthly report's permission draws no card and asks nothing; the date still shows", () => {
    state.canRead = false;
    render(<ProjectBoardHero tenantId="t" projectId="p" starts={[]} />);
    expect(screen.queryByRole("region", { name: "Weighted progress" })).toBeNull();
    expect((state.options as { enabled: boolean }).enabled).toBe(false);
    expect(document.querySelector("[data-board-date]")?.textContent).toMatch(/Today/);
  });

  it("with no figures says where progress comes from, and with no P6 plan says there is no planned line — nothing is invented", () => {
    state.query = { isLoading: false, error: null, data: { sCurve: { plannedSource: null, points: [{ month: "2026-11", planned: null, actual: null }] } } };
    render(<ProjectBoardHero tenantId="t" projectId="p" starts={[]} />);
    expect(screen.getByText(/No figures yet/)).toBeTruthy();
    expect(screen.queryByRole("img", { name: /Progress curve/ })).toBeNull();
    cleanup();
    state.query = { isLoading: false, error: null, data: { sCurve: { plannedSource: null, points: [{ month: "2026-11", planned: null, actual: 12 }] } } };
    render(<ProjectBoardHero tenantId="t" projectId="p" starts={[]} />);
    expect(document.querySelector("[data-hero-planned]")?.textContent).toBe("—");
    expect(screen.getByText("No P6 schedule imported, so no planned line.")).toBeTruthy();
  });
});
