/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Q-45 (c): «مهامي» shows only what the server returned and sends exactly the step chosen. Synthetic data only.
const D = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P = "pppppppp-pppp-4ppp-8ppp-pppppppppppp";
const h = vi.hoisted(() => ({ complete: vi.fn(), transition: vi.fn(), data: undefined as unknown, deadlines: { projects: [], counts: { activities: 0, actions: 0, rfis: 0, submittals: 0, total: 0 } } as unknown }));
vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "t" }), Link: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/ProductShell", () => ({ ProductShell: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized error" }));
vi.mock("@/lib/trpc", () => ({ trpc: { executive: {
  myWork: { useQuery: () => ({ data: h.data, isLoading: false, error: null, refetch: vi.fn() }) },
  myDeadlines: { useQuery: () => ({ data: h.deadlines, isLoading: false, error: null, refetch: vi.fn() }) },
  completeMyAction: { useMutation: () => ({ mutate: h.complete, isPending: false, error: null }) },
  transitionDecision: { useMutation: () => ({ mutate: h.transition, isPending: false, error: null }) },
} } }));

import MyWork from "./MyWork";

describe("Q-45 (c): «مهامي»", () => {
  beforeEach(() => { cleanup(); h.complete.mockReset(); h.transition.mockReset(); });

  it("lists my open actions (overdue flagged) and «Mark done» sends that action", () => {
    h.data = { actions: [{ id: A, projectId: P, title: "Fix the shoring", priority: "high", dueAt: new Date("2026-11-10T00:00:00Z"), status: "open", escalationStatus: "none", projectCode: "P-1", projectName: "One", overdue: true }], decisions: [] };
    render(<MyWork />);
    expect(screen.getByText("Fix the shoring")).toBeTruthy();
    expect(screen.getByText("Overdue")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mark done" }));
    expect(h.complete).toHaveBeenCalledWith({ tenantId: "t", actionId: A });
  });

  it("a decision I own offers only approve / reject, and sends the text with the step", () => {
    h.data = { actions: [], decisions: [{ id: D, projectId: P, projectCode: "P-1", projectName: "One", problem: "Façade supplier is late", status: "submitted", hasOwner: true, steps: ["approved", "rejected"] }] };
    render(<MyWork />);
    expect(screen.queryByRole("button", { name: "Submit for decision" })).toBeNull();
    fireEvent.change(screen.getByLabelText(/reason to reject/), { target: { value: "Cost too high" } });
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(h.transition).toHaveBeenCalledWith({ tenantId: "t", projectId: P, decisionId: D, nextStatus: "rejected", decision: "Cost too high" });
  });

  it("a draft I recorded offers only «Submit for decision», with no text box; nothing waiting says so", () => {
    h.data = { actions: [], decisions: [{ id: D, projectId: P, projectCode: "P-1", projectName: "One", problem: "Façade supplier is late", status: "draft", hasOwner: true, steps: ["submitted"] }] };
    render(<MyWork />);
    expect(screen.queryByRole("textbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Submit for decision" }));
    expect(h.transition).toHaveBeenCalledWith({ tenantId: "t", projectId: P, decisionId: D, nextStatus: "submitted", decision: undefined });
    cleanup(); h.data = { actions: [], decisions: [] }; render(<MyWork />);
    expect(screen.getByText(/No open action is assigned to you/)).toBeTruthy();
    expect(screen.getByText(/No decision waits on a step from you/)).toBeTruthy();
  });

  it("Q-26: «Past its due date» lists, per project, only the groups the server returned, with the days late; nothing overdue says so", () => {
    h.data = { actions: [], decisions: [] };
    h.deadlines = { counts: { activities: 1, actions: 0, rfis: 1, submittals: 0, total: 2 }, projects: [{ projectId: P, code: "P-1", name: "One (synthetic)", activities: [{ id: "a1", code: "A100", name: "Pour slab", plannedFinishAt: new Date("2026-11-15T00:00:00Z"), daysLate: 4 }], actions: [], rfis: [{ id: "r1", number: "RFI-7", title: "Rebar detail", dueAt: new Date("2026-11-17T00:00:00Z"), daysLate: 2 }], submittals: [] }] };
    render(<MyWork />);
    const project = document.querySelector(`[data-deadline-project="${P}"]`)!;
    expect(project.textContent).toContain("P-1 · One (synthetic)");
    expect(project.querySelector('[data-deadline-group="activities"]')!.textContent).toContain("A100 Pour slab — 4 day(s) late");
    expect(project.querySelector('[data-deadline-group="rfis"]')!.textContent).toContain("RFI-7 Rebar detail — 2 day(s) late");
    expect(project.querySelector('[data-deadline-group="actions"]')).toBeNull();
    cleanup();
    h.deadlines = { projects: [], counts: { activities: 0, actions: 0, rfis: 0, submittals: 0, total: 0 } };
    render(<MyWork />);
    expect(screen.getByText("Nothing is past its due date in your projects.")).toBeTruthy();
  });
});
