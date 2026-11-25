/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Q-21 (b), batch 1: the strategy centre shows what the server returned, as it returned it — nothing computed or defaulted on the screen. Synthetic data only.
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const G = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ok = (data: unknown) => ({ data, isLoading: false, error: null, refetch: vi.fn() });
const h = vi.hoisted(() => ({ assumptions: undefined as unknown, pipeline: undefined as unknown, goals: undefined as unknown, initiatives: undefined as unknown, variances: undefined as unknown }));
vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "t" }), Link: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "You do not have this permission" }));
vi.mock("@/lib/trpc", () => ({ trpc: { strategy: {
  assumptions: { useQuery: () => h.assumptions }, pipeline: { useQuery: () => h.pipeline }, goals: { useQuery: () => h.goals },
  initiatives: { useQuery: () => h.initiatives }, variances: { useQuery: () => h.variances },
} } }));

// the register's actions are tested on their own (StrategyAssumptionActions.test.tsx)
vi.mock("./StrategyAssumptionActions", () => ({ NewAssumption: () => null, AssumptionActions: () => null }));
vi.mock("./StrategyScenarios", () => ({ default: () => null }));
vi.mock("./StrategyGoalActions", () => ({ NewGoal: () => null, NewInitiative: () => null, RecordVariance: () => null, DecideVariance: () => null }));

import Strategy from "./Strategy";

const assumption = { id: A, code: "winRate", name: "Synthetic win rate", unit: "percent", status: "approved", confidence: "medium", nextReviewAt: "2027-02-01", values: { conservative: 15, base: 20, optimistic: 25 }, pendingChange: { values: { conservative: 10, base: 15, optimistic: 20 }, reason: "x", requestedByUserId: 1 } };
const pipeline = { counts: { open: 1, submitted: 0, won: 1, lost: 2, withdrawn: 1 }, inPlay: { count: 1, value: 2_000_000, weighted: 800_000 }, winRate: { window: { from: "2025-11-20", to: "2026-11-20" }, decided: 3, won: 1, byCount: 33.33, byValue: 33.33 }, lostTo: [{ competitorId: "c", count: 2, value: 3_000_000, competitorName: "Synthetic Rival" }] };

describe("Q-21 (b): the strategy centre", () => {
  beforeEach(() => {
    cleanup();
    h.assumptions = ok([assumption]); h.pipeline = ok(pipeline);
    h.goals = ok([{ id: G, code: "G-WIN", name: "Synthetic: win more", unit: "percent", targetValue: 35, periodStart: "2026-07-01", periodEnd: "2026-12-31", status: "active", assumptionId: A }]);
    h.initiatives = ok([{ id: "i1", code: "I-BID", name: "Synthetic bid board", goalId: G, ownerUserId: null, dueAt: "2027-03-31", status: "in_progress", note: null }]);
    h.variances = ok([{ id: "v1", assumptionId: A, periodStart: "2026-07-01", periodEnd: "2026-09-30", assumedValue: 25, actualValue: 33.3333, difference: 8.3333, percentOfAssumed: 33.33, sampleSize: 3, actualSource: "pipeline", recurring: true, decision: "initiative", initiativeId: "i1", decisionReason: "x", decidedByUserId: 1, decidedAt: null, recordedByUserId: 1 }]);
  });

  it("POSITIVE: the approved values per scenario, the pending change, the server's win rate and weighted value, the goal with its initiative, and the variance as the server computed it", () => {
    const { container } = render(<Strategy />);
    const card = container.querySelector('[data-strategy-assumption="winRate"]')!;
    expect(card.textContent).toContain("20.00%");
    expect(card.textContent).toContain("15.00%");
    expect(card.querySelector("[data-strategy-pending]")).toBeTruthy();
    expect(container.querySelector("[data-strategy-win-rate]")!.textContent).toContain("33.33%");
    expect(container.querySelector("[data-strategy-win-rate]")!.textContent).toContain("1/3");
    expect(screen.getByText(/Synthetic Rival/)).toBeTruthy();
    const goal = container.querySelector('[data-strategy-goal="G-WIN"]')!;
    expect(goal.textContent).toContain("35.00%");
    expect(goal.querySelector('[data-strategy-initiative="I-BID"]')).toBeTruthy();
    const variance = container.querySelector('[data-strategy-variance="v1"]')!;
    expect(variance.textContent).toContain("+8.33 (+33.33%)");
    expect(variance.textContent).toContain("decided opportunities");
  });

  it("NEGATIVE: no win rate when nothing was decided (words, not 0%); empty registers say so; a refused section shows the server's refusal and no figure", () => {
    h.pipeline = ok({ ...pipeline, winRate: { ...pipeline.winRate, decided: 0, won: 0, byCount: null, byValue: null }, lostTo: [] });
    h.goals = ok([]); h.initiatives = ok([]); h.variances = ok([]);
    h.assumptions = { data: undefined, isLoading: false, error: { message: "PROJECT_OS_PERMISSION_DENIED", data: { code: "FORBIDDEN" } }, refetch: vi.fn() };
    const { container } = render(<Strategy />);
    expect(container.querySelector("[data-strategy-win-rate]")!.textContent).toContain("No opportunity decided in the last 12 months");
    expect(container.querySelector("[data-strategy-win-rate]")!.textContent).not.toContain("0.00%");
    expect(container.querySelector('[data-strategy-empty="goals"]')).toBeTruthy();
    expect(container.querySelector('[data-strategy-empty="variances"]')).toBeTruthy();
    expect(container.querySelector("[data-strategy-assumption]")).toBeNull();
  });
});
