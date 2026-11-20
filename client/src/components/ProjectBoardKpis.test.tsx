// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

// Q-54: the three cards beside the hero. Synthetic figures only.
const h = vi.hoisted(() => ({ can: true, monthly: undefined as unknown, stalled: undefined as unknown, list: [] as unknown[], report: undefined as unknown }));
vi.mock("wouter", () => ({ Link: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => <a href={href} {...rest}>{children}</a> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ language: "en", isArabic: false }) }));
vi.mock("@/lib/permissions", () => ({ useCanPage: () => h.can }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  reportPeriods: { monthly: { useQuery: (_input: unknown, options: { enabled: boolean }) => ({ data: options.enabled ? h.monthly : undefined }) } },
  pmc: { stalledUnits: { useQuery: (_input: unknown, options: { enabled: boolean }) => ({ data: options.enabled ? h.stalled : undefined }) } },
  siteReports: {
    list: { useQuery: (_input: unknown, options: { enabled: boolean }) => ({ data: options.enabled ? h.list : undefined }) },
    get: { useQuery: (_input: unknown, options: { enabled: boolean }) => ({ data: options.enabled ? h.report : undefined }) },
  },
} }));

import { ProjectBoardKpis, labourTotals, scheduleIndex } from "./ProjectBoardKpis";
import { siteDay } from "./ProjectBoardHero";

afterEach(() => { cleanup(); h.can = true; h.monthly = undefined; h.stalled = undefined; h.list = []; h.report = undefined; });
const value = (id: string) => screen.getByTestId(id).querySelector("[data-kpi-value]")?.textContent;

describe("ProjectBoardKpis (Q-54)", () => {
  it("computes the schedule index on the latest month with an actual, and has none without a plan", () => {
    expect(scheduleIndex([{ month: "2026-10", planned: 40, actual: 38 }, { month: "2026-11", planned: 51.2, actual: 46.8 }, { month: "2026-12", planned: 60, actual: null }])).toBe(0.91);
    expect(scheduleIndex([{ month: "2026-11", planned: null, actual: 46.8 }])).toBeNull();
    expect(scheduleIndex([{ month: "2026-11", planned: 0, actual: 0 }])).toBeNull();
    expect(labourTotals([{ shift: "day", headcount: 300 }, { shift: "night", headcount: 18 }, { shift: "day", headcount: 94 }])).toEqual({ total: 412, day: 394, night: 18 });
  });

  it("POSITIVE: shows each figure from its own read — the index, the stalled villas with the long ones, and today's labour", () => {
    h.monthly = { sCurve: { points: [{ month: "2026-11", planned: 51.2, actual: 46.8 }] } };
    h.stalled = { longDays: 14, counts: { stalled: 5, long: 2, active: 100 } };
    h.list = [{ id: "r-old", reportDate: "2000-01-01" }, { id: "r-today", reportDate: siteDay() }];
    h.report = { labour: [{ shift: "day", headcount: 400 }, { shift: "night", headcount: 12 }] };
    render(<ProjectBoardKpis tenantId="t" projectId="p" />);
    expect(value("kpi-spi")).toBe("0.91");
    expect(value("kpi-stalled")).toBe("7");
    expect(screen.getByTestId("kpi-stalled").textContent).toContain("2 of them over 14 days");
    expect(screen.getByTestId("kpi-stalled").getAttribute("href")).toBe("/projects/t/p/stalled");
    expect(value("kpi-labour")).toBe("412");
  });

  it("NEGATIVE: a figure without a source is «—» with the reason, never 0; without the page permission nothing is read", () => {
    h.list = [{ id: "r-old", reportDate: "2000-01-01" }];
    render(<ProjectBoardKpis tenantId="t" projectId="p" />);
    expect(value("kpi-spi")).toBe("—");
    expect(screen.getByTestId("kpi-spi").textContent).toContain("No P6 plan");
    expect(value("kpi-labour")).toBe("—");
    expect(screen.getByTestId("kpi-labour").textContent).toContain("No daily report today");
    cleanup();
    h.can = false; h.stalled = { longDays: 14, counts: { stalled: 9, long: 0, active: 0 } };
    render(<ProjectBoardKpis tenantId="t" projectId="p" />);
    expect(value("kpi-stalled")).toBe("—");
    expect(screen.getByTestId("kpi-stalled").getAttribute("href")).toBeNull();
    expect(screen.getAllByText("Not visible to you")).toHaveLength(3);
  });
});
