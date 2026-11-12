import { describe, expect, it } from "vitest";
import { exampleInput } from "./domain/devPlanner";
import { plannerInputSchema, summarizePlan } from "./devPlannerService";

// Q-11 (b): the plan as the screen reads it, from the 120-villa example the engine is pinned to (part a: likely 752.7 days, peak 629).
describe("development planner summary", () => {
  it("gives the three scenarios in months, the activities in start order with the critical path, the labour histogram and the sales curve", () => {
    const s = summarizePlan(exampleInput());
    expect(s.scenarios.likely.totalMonths).toBeCloseTo(752.681 / 30.44, 1);
    expect(s.scenarios.min.totalMonths).toBeLessThan(s.scenarios.likely.totalMonths);
    expect(s.scenarios.likely.totalMonths).toBeLessThan(s.scenarios.max.totalMonths);
    expect(s.labour.peak).toBe(629);
    expect(s.units).toBe(120);
    expect(s.sales.curve.at(-1)).toBe(120);
    expect(s.activities.length).toBeGreaterThan(5);
    expect(s.activities.some(a => a.critical)).toBe(true);
    expect(s.activities.every((a, i) => i === 0 || a.startMonth >= s.activities[i - 1].startMonth)).toBe(true);
  });
  it("NEGATIVE: the input is bounded — an unbounded count, a zero area or an unknown field is refused before the engine runs", () => {
    const ok = exampleInput();
    expect(plannerInputSchema.safeParse(ok).success).toBe(true);
    expect(plannerInputSchema.safeParse({ ...ok, villaModels: [{ ...ok.villaModels[0], count: 1e9 }] }).success).toBe(false);
    expect(plannerInputSchema.safeParse({ ...ok, villaModels: [{ ...ok.villaModels[0], bua: 0 }] }).success).toBe(false);
    expect(plannerInputSchema.safeParse({ ...ok, extra: 1 }).success).toBe(false);
  });
});
