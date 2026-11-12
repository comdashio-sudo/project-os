import { describe, expect, it } from "vitest";
import { exampleInput, guessBoqCategory, planDevelopment, type PlannerInput } from "./devPlanner";

// Reference figures: the owner's stand-alone planning tool, run on its own example (Q-11 acceptance: ±1%).
// They were produced by executing the tool's calculation code unchanged on the same inputs.
const REFERENCE = {
  villa: { min: 644.5025, likely: 752.681, max: 1057.4206, buildLikely: 543.406, peak: 629, launch: 8.145, sell: 14,
    crit: ["exc", "fdn", "frame", "block", "mep1", "plaster", "ceil", "paint", "mep2", "test", "snag", "occ", "hand"] },
  townhouse: { min: 555.1141, likely: 654.3139, max: 908.2596, buildLikely: 448.8439, peak: 481, launch: 8.05, sell: 12,
    crit: ["exc", "fdn", "frame", "block", "mep1", "plaster", "tiles", "paint", "mep2", "test", "snag", "occ", "hand"] },
  apartments: { min: 720.2238, likely: 879.6318, max: 1216.9375, buildLikely: 670.3568, peak: 411, launch: 8.145, sell: 14,
    crit: ["exc", "shore", "raft", "frame", "block", "mep1", "plaster", "tiles", "paint", "mep2", "test", "snag", "occ", "hand"] },
} as const;
const within1pct = (actual: number, expected: number) => expect(Math.abs(actual - expected) / expected).toBeLessThanOrEqual(0.01);

describe("development planner matches the reference tool (±1%)", () => {
  for (const type of ["villa", "townhouse", "apartments"] as const) {
    it(`${type}: three scenarios, construction, peak labour, sales and the critical path`, () => {
      const r = planDevelopment({ ...exampleInput(), type });
      const ref = REFERENCE[type];
      within1pct(r.scenarios.min.totalDays, ref.min);
      within1pct(r.scenarios.likely.totalDays, ref.likely);
      within1pct(r.scenarios.max.totalDays, ref.max);
      within1pct(r.scenarios.likely.buildCalendarDays, ref.buildLikely);
      within1pct(r.labour.peak, ref.peak);
      within1pct(r.sales.launchMonth, ref.launch);
      expect(r.sales.sellingMonths).toBe(ref.sell);
      expect(r.scenarios.likely.sc.acts.filter(a => a.crit).map(a => a.id)).toEqual(ref.crit);
    });
  }

  it("120 villas: the sales curve ends at the unit count and the scenarios are ordered", () => {
    const r = planDevelopment(exampleInput());
    expect(r.units.saleUnits).toBe(120);
    expect(r.sales.curve.at(-1)).toBe(120);
    expect(r.scenarios.min.totalDays).toBeLessThan(r.scenarios.likely.totalDays);
    expect(r.scenarios.likely.totalDays).toBeLessThan(r.scenarios.max.totalDays);
  });

  it("a labour cap is respected (450 workers → 442 at peak), and a target duration is met", () => {
    const capped = planDevelopment({ ...exampleInput(), labourMode: "cap", cap: 450 });
    within1pct(capped.crewMultiplier, 0.75);
    expect(capped.labour.peak).toBe(442);
    expect(capped.labourTargetFeasible).toBe(true);
    const target = planDevelopment({ ...exampleInput(), labourMode: "target", targetMonths: 18 });
    within1pct(target.crewMultiplier, 0.966667);
    expect(target.scenarios.likely.buildCalendarDays / 30.44).toBeLessThanOrEqual(18);
  });

  it("an impossible cap or target is reported, not silently met", () => {
    expect(planDevelopment({ ...exampleInput(), labourMode: "cap", cap: 20 }).labourTargetFeasible).toBe(false);
    expect(planDevelopment({ ...exampleInput(), labourMode: "target", targetMonths: 3 }).labourTargetFeasible).toBe(false);
  });

  it("a BOQ total replaces the estimate (concrete split between foundations and frame)", () => {
    const base = planDevelopment(exampleInput());
    const boq: PlannerInput = { ...exampleInput(), boqTotals: { concrete: 30000 } };
    const withBoq = planDevelopment(boq);
    const frame = withBoq.scenarios.likely.sc.by.frame, fdn = withBoq.scenarios.likely.sc.by.fdn;
    expect(frame.fromBoq && fdn.fromBoq).toBe(true);
    expect(frame.q * frame.N + fdn.q * fdn.N).toBeCloseTo(30000, 6);
    expect(withBoq.scenarios.likely.totalDays).toBeGreaterThan(base.scenarios.likely.totalDays);
  });

  it("ready-unit sales launch at 60% of construction, after the off-plan launch", () => {
    const off = planDevelopment(exampleInput());
    const ready = planDevelopment({ ...exampleInput(), salesMode: "ready" });
    expect(ready.sales.launchMonth).toBeGreaterThan(off.sales.launchMonth);
    expect(ready.scenarios.likely.pre.t.wafi).toBeUndefined();
  });

  it("BOQ descriptions are classified, rebar is excluded from durations", () => {
    expect(guessBoqCategory("خرسانة مسلحة للأسقف")).toBe("concrete");
    expect(guessBoqCategory("حديد تسليح")).toBe("skip");
    expect(guessBoqCategory("Ceramic floor tiles")).toBe("tiles");
    expect(guessBoqCategory("بند غير معروف")).toBeNull();
  });
});
