/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Q-21 (b), batch 2b: goals, initiatives and variances from the screen. What is sent is what was typed (numbers as numbers, «none» as null);
// a pipeline actual sends no value (the server computes it); a decision to adjust carries the new values; a refusal is the server's message.
const T = "11111111-1111-4111-8111-111111111111";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const G = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const I = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const V = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
type Mutation = { mutate: ReturnType<typeof vi.fn>; reset: ReturnType<typeof vi.fn>; error: unknown; isPending: boolean };
const h = vi.hoisted(() => {
  const state = { can: new Set<string>(), mutations: {} as Record<string, Mutation>, mutation: (name: string) => () => (state.mutations[name] ??= { mutate: vi.fn(), reset: vi.fn(), error: null, isPending: false }) };
  return state;
});
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false }) }));
vi.mock("@/lib/permissions", () => ({ useCan: (permission: string) => h.can.has(permission) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: (error: { message: string }) => `server: ${error.message}` }));
vi.mock("@/components/ds/Select", () => ({ Select: ({ id, value, options, onValueChange }: { id: string; value: string; options: { value: string; label: string }[]; onValueChange: (value: string) => void }) =>
  <select id={id} value={value} onChange={event => onValueChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select> }));
vi.mock("@/components/ds/Segmented", () => ({ Segmented: ({ label, value, options, onValueChange }: { label: string; value: string; options: { value: string; label: string }[]; onValueChange: (value: string) => void }) =>
  <div role="radiogroup" aria-label={label}>{options.map(option => <button key={option.value} type="button" role="radio" aria-checked={option.value === value} onClick={() => onValueChange(option.value)}>{option.label}</button>)}</div> }));
vi.mock("@/components/ds/Checkbox", () => ({ Checkbox: ({ checked, onCheckedChange, children }: { checked: boolean; onCheckedChange: (value: boolean) => void; children: React.ReactNode }) =>
  <label><input type="checkbox" checked={checked} onChange={event => onCheckedChange(event.target.checked)} />{children}</label> }));
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ strategy: { goals: { invalidate: vi.fn() }, initiatives: { invalidate: vi.fn() }, variances: { invalidate: vi.fn() }, assumptions: { invalidate: vi.fn() } } }),
  strategy: { createGoal: { useMutation: h.mutation("createGoal") }, createInitiative: { useMutation: h.mutation("createInitiative") }, recordVariance: { useMutation: h.mutation("recordVariance") }, decideVariance: { useMutation: h.mutation("decideVariance") } },
} }));

import { DecideVariance, NewGoal, NewInitiative, RecordVariance } from "./StrategyGoalActions";

const assumptions = [{ id: A, code: "winRate", name: "Synthetic win rate" }];
const open = (container: HTMLElement, name: string) => fireEvent.click(container.querySelector(`[data-strategy-open="${name}"]`)!);
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

describe("Q-21 (b), batch 2b: goals, initiatives and variances from the screen", () => {
  beforeEach(() => { cleanup(); h.can = new Set(["strategy.manage"]); h.mutations = {}; });

  it("POSITIVE: a goal, an initiative, a manual and a pipeline variance, and both decisions are sent exactly as entered", () => {
    const goal = render(<NewGoal tenantId={T} language="en" assumptions={assumptions} />);
    open(goal.container, "goal");
    type("Code", "G-WIN"); type("Name", "Synthetic: win more"); type("Target value", "35"); type("Period start", "2026-07-01"); type("Period end", "2026-12-31");
    fireEvent.change(goal.container.querySelector("#sg-assumption")!, { target: { value: A } });
    fireEvent.submit(goal.container.querySelector('[data-strategy-form="goal"]')!);
    expect(h.mutations.createGoal.mutate).toHaveBeenCalledWith({ tenantId: T, code: "G-WIN", name: "Synthetic: win more", unit: "percent", targetValue: 35, periodStart: "2026-07-01", periodEnd: "2026-12-31", assumptionId: A });
    cleanup();

    const initiative = render(<NewInitiative tenantId={T} language="en" goals={[{ id: G, code: "G-WIN", name: "x" }]} />);
    open(initiative.container, "initiative");
    type("Code", "I-BID"); type("Name", "Synthetic bid board");
    fireEvent.submit(initiative.container.querySelector('[data-strategy-form="initiative"]')!);
    expect(h.mutations.createInitiative.mutate).toHaveBeenCalledWith({ tenantId: T, code: "I-BID", name: "Synthetic bid board", goalId: null, dueAt: null, note: null });
    cleanup();

    const pipeline = render(<RecordVariance tenantId={T} language="en" assumptions={assumptions} />);
    open(pipeline.container, "variance");
    type("Period start", "2026-07-01"); type("Period end", "2026-09-30");
    expect(screen.queryByLabelText("Actual value")).toBeNull();
    fireEvent.submit(pipeline.container.querySelector('[data-strategy-form="variance"]')!);
    expect(h.mutations.recordVariance.mutate.mock.calls[0][0]).toEqual({ tenantId: T, assumptionId: A, periodStart: "2026-07-01", periodEnd: "2026-09-30", recurring: false, actual: { source: "pipeline" } });
    cleanup();

    const manual = render(<RecordVariance tenantId={T} language="en" assumptions={assumptions} />);
    open(manual.container, "variance");
    fireEvent.click(screen.getByRole("radio", { name: "entered by hand" }));
    type("Period start", "2026-01-01"); type("Period end", "2026-06-30"); type("Actual value", "20.5"); type("Items it rests on", "4");
    fireEvent.click(screen.getByLabelText("Recurs"));
    fireEvent.submit(manual.container.querySelector('[data-strategy-form="variance"]')!);
    expect(h.mutations.recordVariance.mutate.mock.calls[1][0]).toEqual({ tenantId: T, assumptionId: A, periodStart: "2026-01-01", periodEnd: "2026-06-30", recurring: true, actual: { source: "manual", value: 20.5, sampleSize: 4 } });
    cleanup();

    const initiativeDecision = render(<DecideVariance tenantId={T} language="en" varianceId={V} initiatives={[{ id: I, code: "I-BID", name: "x" }]} />);
    open(initiativeDecision.container, `decide-${V}`);
    fireEvent.change(initiativeDecision.container.querySelector(`[id="sd-${V}-initiative"]`)!, { target: { value: I } });
    type("Reason", "Bid reviews before submission");
    fireEvent.submit(initiativeDecision.container.querySelector('[data-strategy-form="decide"]')!);
    expect(h.mutations.decideVariance.mutate.mock.calls[0][0]).toEqual({ tenantId: T, varianceId: V, decision: "initiative", reason: "Bid reviews before submission", initiativeId: I });
    cleanup();

    const adjust = render(<DecideVariance tenantId={T} language="en" varianceId={V} initiatives={[]} />);
    open(adjust.container, `decide-${V}`);
    fireEvent.click(screen.getByRole("radio", { name: "Adjust the assumption" }));
    type("Conservative", "20"); type("Base", "25"); type("Optimistic", "30"); type("Reason", "Two quarters above the assumption");
    fireEvent.submit(adjust.container.querySelector('[data-strategy-form="decide"]')!);
    expect(h.mutations.decideVariance.mutate.mock.calls[1][0]).toEqual({ tenantId: T, varianceId: V, decision: "adjust_assumption", reason: "Two quarters above the assumption", values: { conservative: 20, base: 25, optimistic: 30 } });
  });

  it("NEGATIVE: without strategy.manage no button and no form; no variance without an approved assumption; a refusal shows the server's message", () => {
    h.can = new Set(["strategy.read"]);
    for (const element of [<NewGoal key="g" tenantId={T} language="en" assumptions={assumptions} />, <NewInitiative key="i" tenantId={T} language="en" goals={[]} />, <RecordVariance key="v" tenantId={T} language="en" assumptions={assumptions} />, <DecideVariance key="d" tenantId={T} language="en" varianceId={V} initiatives={[]} />]) {
      expect(render(element).container.querySelector("button, form")).toBeNull();
      cleanup();
    }
    h.can = new Set(["strategy.manage"]);
    expect(render(<RecordVariance tenantId={T} language="en" assumptions={[]} />).container.querySelector("button")).toBeNull();
    cleanup();

    h.mutation("createGoal")().error = { message: "PROJECT_OS_STRATEGY_GOAL_CODE_EXISTS" };
    const goal = render(<NewGoal tenantId={T} language="en" assumptions={assumptions} />);
    open(goal.container, "goal");
    expect(screen.getByRole("alert").textContent).toBe("server: PROJECT_OS_STRATEGY_GOAL_CODE_EXISTS");
  });
});
