/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Q-21 (b), batch 2: the assumptions register worked from the screen. The buttons follow the state and the viewer's permissions; what is sent
// is what was typed (numbers as numbers); a refusal is the server's own message. Synthetic data only.
const T = "11111111-1111-4111-8111-111111111111";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
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
vi.mock("@/lib/trpc", () => ({ trpc: {
  useUtils: () => ({ strategy: { assumptions: { invalidate: vi.fn() } } }),
  strategy: {
    createAssumption: { useMutation: h.mutation("createAssumption") }, submitAssumption: { useMutation: h.mutation("submitAssumption") },
    decideAssumption: { useMutation: h.mutation("decideAssumption") }, requestChange: { useMutation: h.mutation("requestChange") }, decideChange: { useMutation: h.mutation("decideChange") },
  },
} }));

import { AssumptionActions, NewAssumption } from "./StrategyAssumptionActions";

const row = (status: string, pendingChange: unknown = null) => ({ id: A, code: "winRate", status, pendingChange });
const action = (container: HTMLElement, name: string) => container.querySelector(`[data-strategy-action="${name}"]`) as HTMLButtonElement | null;

describe("Q-21 (b), batch 2: working the assumptions register", () => {
  beforeEach(() => { cleanup(); h.can = new Set(["strategy.manage", "strategy.approve"]); h.mutations = {}; });

  it("POSITIVE: each state offers its own next step and sends exactly the assumption's ids; a new assumption is sent with its three values as numbers", () => {
    const draft = render(<AssumptionActions tenantId={T} item={row("draft")} language="en" />);
    expect(action(draft.container, "approve")).toBeNull();
    fireEvent.click(action(draft.container, "submit")!);
    expect(h.mutations.submitAssumption.mutate).toHaveBeenCalledWith({ tenantId: T, assumptionId: A });
    cleanup();

    const pending = render(<AssumptionActions tenantId={T} item={row("pending")} language="en" />);
    fireEvent.click(action(pending.container, "approve")!);
    expect(h.mutations.decideAssumption.mutate.mock.calls[0][0]).toEqual({ tenantId: T, assumptionId: A, decision: "approve" });
    fireEvent.click(action(pending.container, "return")!);
    fireEvent.change(screen.getByLabelText("Why it is returned"), { target: { value: "The source is missing" } });
    fireEvent.submit(screen.getByLabelText("Why it is returned").closest("form")!);
    expect(h.mutations.decideAssumption.mutate.mock.calls[1][0]).toEqual({ tenantId: T, assumptionId: A, decision: "return", reason: "The source is missing" });
    cleanup();

    const approved = render(<AssumptionActions tenantId={T} item={row("approved")} language="en" />);
    expect(action(approved.container, "approve-change")).toBeNull();
    fireEvent.click(action(approved.container, "request-change")!);
    const form = approved.container.querySelector("[data-strategy-change-form]") as HTMLFormElement;
    fireEvent.change(form.querySelector(`[id="sc-${A}-conservative"]`)!, { target: { value: "10" } });
    fireEvent.change(form.querySelector(`[id="sc-${A}-base"]`)!, { target: { value: "15.5" } });
    fireEvent.change(form.querySelector(`[id="sc-${A}-optimistic"]`)!, { target: { value: "20" } });
    fireEvent.change(screen.getByLabelText("Why it changes"), { target: { value: "Last two quarters" } });
    fireEvent.submit(form);
    expect(h.mutations.requestChange.mutate).toHaveBeenCalledWith({ tenantId: T, assumptionId: A, values: { conservative: 10, base: 15.5, optimistic: 20 }, reason: "Last two quarters" });
    cleanup();

    const waiting = render(<AssumptionActions tenantId={T} item={row("approved", { values: {} })} language="en" />);
    expect(action(waiting.container, "request-change")).toBeNull();
    fireEvent.click(action(waiting.container, "reject-change")!);
    expect(h.mutations.decideChange.mutate.mock.calls[0][0]).toEqual({ tenantId: T, assumptionId: A, decision: "reject" });
    cleanup();

    const add = render(<NewAssumption tenantId={T} language="en" />);
    fireEvent.click(add.container.querySelector("[data-strategy-add]")!);
    fireEvent.change(screen.getByLabelText("Code (Latin letters and digits)"), { target: { value: "avgValue" } });
    fireEvent.change(screen.getByLabelText("Name"), { target: { value: "Synthetic average tender value" } });
    fireEvent.change(screen.getByLabelText("Unit"), { target: { value: "sar" } });
    fireEvent.change(add.container.querySelector("#sa-conservative")!, { target: { value: "8000000" } });
    fireEvent.change(add.container.querySelector("#sa-base")!, { target: { value: "10000000" } });
    fireEvent.change(add.container.querySelector("#sa-optimistic")!, { target: { value: "12000000" } });
    fireEvent.submit(add.container.querySelector("[data-strategy-new]")!);
    expect(h.mutations.createAssumption.mutate).toHaveBeenCalledWith({ tenantId: T, code: "avgValue", name: "Synthetic average tender value", unit: "sar", sourceType: "internal", sourceNote: null, confidence: "medium", reviewFrequency: "quarterly", nextReviewAt: null, values: { conservative: 8_000_000, base: 10_000_000, optimistic: 12_000_000 } });
  });

  it("NEGATIVE: no permission, no button and no form; the approver-only steps are hidden from a manager; a retired assumption has none; a refusal shows the server's message", () => {
    h.can = new Set();
    for (const status of ["draft", "pending", "approved"]) {
      const { container } = render(<AssumptionActions tenantId={T} item={row(status, status === "approved" ? { values: {} } : null)} language="en" />);
      expect(container.querySelector("button")).toBeNull();
      cleanup();
    }
    expect(render(<NewAssumption tenantId={T} language="en" />).container.querySelector("[data-strategy-add]")).toBeNull();
    cleanup();

    h.can = new Set(["strategy.manage"]);
    const pending = render(<AssumptionActions tenantId={T} item={row("pending")} language="en" />);
    expect(action(pending.container, "approve")).toBeNull();
    expect(action(pending.container, "return")).toBeNull();
    cleanup();
    const waiting = render(<AssumptionActions tenantId={T} item={row("approved", { values: {} })} language="en" />);
    expect(action(waiting.container, "approve-change")).toBeNull();
    cleanup();

    h.can = new Set(["strategy.manage", "strategy.approve"]);
    expect(render(<AssumptionActions tenantId={T} item={row("retired")} language="en" />).container.querySelector("button")).toBeNull();
    cleanup();

    h.mutation("decideAssumption")().error = { message: "PROJECT_OS_STRATEGY_SELF_APPROVAL" };
    render(<AssumptionActions tenantId={T} item={row("pending")} language="en" />);
    expect(screen.getByRole("alert").textContent).toBe("server: PROJECT_OS_STRATEGY_SELF_APPROVAL");
  });
});
