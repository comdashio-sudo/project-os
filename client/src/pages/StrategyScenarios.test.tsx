/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { scenarioRows, type Forecast } from "@/lib/strategyBoardPack";

// Q-21 (b), batch 3: the scenarios table on the screen is the board pack's rows (scenarioRows), the backlog and missing inputs are said, and a refused
// forecast shows the server's refusal and no figure. Synthetic data only.
const h = vi.hoisted(() => ({ forecast: undefined as unknown, assumptions: undefined as unknown }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "You do not have this permission" }));
vi.mock("@/lib/trpc", () => ({ trpc: { strategy: { forecast: { useQuery: () => h.forecast }, assumptions: { useQuery: () => h.assumptions } } } }));

import StrategyScenarios from "./StrategyScenarios";

const ok = (data: unknown) => ({ data, isLoading: false, error: null, refetch: vi.fn() });
const scenario = (scale: number) => ({
  months: [{ index: 0, revenue: 1_000_000 * scale, backlogRevenue: 0, receipts: 0, vatCollected: 0, outflows: 0, net: 0, cumulative: 0 }],
  totals: { revenue: 1_000_000 * scale, backlogRevenue: 250_000, receipts: 900_000 * scale, outflows: 700_000, net: 200_000 * scale }, lowestCumulative: -50_000, lowestMonth: 0, fundingRequired: 50_000,
  breakEvenMonth: scale === 1 ? null : 0, used: {}, missing: scale === 2 ? ["overheadsMonthly"] : [], trace: [{ figure: "revenue", formula: "Synthetic formula", uses: [] }],
});
const forecast: Forecast = { asOf: "2026-11-21", horizonMonths: 12, backlog: { scheduled: { count: 2, remainingValue: 1_500_000 }, unscheduled: { count: 1, remainingValue: 4_000_000 } },
  scenarios: { conservative: scenario(1), base: scenario(2), optimistic: scenario(3) }, sensitivity: { winRateDelta: 5, revenueChange: { conservative: 0, base: 0, optimistic: 0 }, lowestCashChange: { conservative: 0, base: 0, optimistic: 0 } } };

describe("Q-21 (b): the scenarios section", () => {
  beforeEach(() => { cleanup(); h.forecast = ok(forecast); h.assumptions = ok([]); });

  it("POSITIVE: each row on the screen is the board pack's row; the backlog, the unscheduled contracts and the missing input are said; both downloads are offered", () => {
    const { container } = render(<StrategyScenarios tenantId="t" language="en" />);
    const rows = Array.from(container.querySelectorAll("[data-strategy-scenarios] tbody tr")).map(row => Array.from(row.querySelectorAll("td")).map(cell => cell.textContent));
    expect(rows).toEqual(scenarioRows(forecast, "en"));
    // the phone's stacked list carries the same three values per figure (the sideways-scrolling table hid two scenarios at 390px)
    const stacked = Array.from(container.querySelectorAll("[data-strategy-scenarios-stacked] > div")).map(block => [block.querySelector("dt")!.textContent, ...Array.from(block.querySelectorAll("dd bdi")).map(cell => cell.textContent)]);
    expect(stacked).toEqual(scenarioRows(forecast, "en"));
    expect(container.querySelector("[data-strategy-backlog]")!.textContent).toContain("1,500,000");
    expect(container.querySelector("[data-strategy-backlog]")!.textContent).toContain("4,000,000");
    expect(container.querySelector("[data-strategy-missing]")!.textContent).toContain("overheadsMonthly");
    expect(container.querySelector('[data-strategy-download="pptx"]')).toBeTruthy();
    expect(container.querySelector('[data-strategy-download="xlsx"]')).toBeTruthy();
  });

  it("NEGATIVE: a refused forecast shows the refusal, no table, no download", () => {
    h.forecast = { data: undefined, isLoading: false, error: { message: "PROJECT_OS_PERMISSION_DENIED", data: { code: "FORBIDDEN" } }, refetch: vi.fn() };
    const { container } = render(<StrategyScenarios tenantId="t" language="en" />);
    expect(container.querySelector("[data-strategy-scenarios]")).toBeNull();
    expect(container.querySelector("[data-strategy-download]")).toBeNull();
    expect(container.textContent).toContain("You do not have this permission");
  });

  it("Q-21 limit — NEGATIVE then POSITIVE: in Arabic the calculation trace is said in Arabic, not the server's English words", () => {
    const { container } = render(<StrategyScenarios tenantId="t" language="ar" />);
    const step = container.querySelector('[data-trace-step="revenue"]')!;
    expect(step.textContent).toContain("الإيراد");
    expect(step.textContent).not.toContain("Synthetic formula");
    expect(step.textContent).not.toMatch(/^revenue:/);
  });
});
