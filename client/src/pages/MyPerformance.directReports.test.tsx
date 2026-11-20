/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MyPerformance from "./MyPerformance";

// Q-17 (205-5, G-147): a performance manager with direct reports gets a picker on «My indicators»; choosing a report asks the server for that
// employee's indicators (the server decides) and hides the objection form, which stays self-service. Anyone the server refuses sees no picker.
const state = vi.hoisted(() => ({ reports: {} as unknown, inputs: [] as unknown[], availability: {} as unknown, reportsOptions: undefined as unknown }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false }) }));
vi.mock("@/components/EnterpriseNavigation", () => ({ EnterpriseNavigation: () => <nav aria-label="navigation" /> }));
vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "tenant-1", projectId: "project-1" }) }));
// the shared list is a Radix popover; a plain stand-in keeps the test about the page, not the widget
vi.mock("@/components/ds/Select", () => ({ Select: ({ options, value, onValueChange, "aria-label": label }: { options: { value: string; label: string }[]; value: string; onValueChange: (value: string) => void; "aria-label": string }) => (
  <select aria-label={label} value={value} onChange={event => onValueChange(event.target.value)}>{options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select>
) }));
const metrics = { assignedCount: 1, completedCount: 0, overdueCount: 0, onTimeCompletionPercent: null, averageResponseHours: null, openCount: 1, excludedCount: 0, recordsConsidered: 1, generatedAt: new Date("2026-11-13T12:00:00Z"), formula: "f", sourceCounts: {}, sources: [] };
vi.mock("@/lib/trpc", () => ({ trpc: { performance: {
  get: { useQuery: (input: { employeeId?: string }) => { state.inputs.push(input); return { data: { employee: { employeeNumber: input.employeeId ? "EMP-2" : "EMP-1", fullName: input.employeeId ? "Synthetic Report" : "Me", isOwn: !input.employeeId }, metrics, exclusions: [], objections: [] }, isLoading: false, error: null, refetch: vi.fn() }; } },
  availability: { useQuery: () => state.availability },
  directReports: { useQuery: (_input: unknown, options: unknown) => { state.reportsOptions = options; return state.reports; } },
  objections: { create: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) } },
} } }));

beforeEach(() => { state.inputs = []; state.availability = { data: { linked: true, canRead: true, canManage: true }, error: null, isLoading: false, isFetching: false, refetch: vi.fn() }; });
afterEach(() => cleanup());

describe("MyPerformance: direct reports (Q-17, G-147)", () => {
  it("POSITIVE: with direct reports, choosing one asks for that employee and hides the self-service objection", () => {
    state.reports = { data: [{ id: "emp-2", employeeNumber: "EMP-2", fullName: "Synthetic Report", jobTitle: "Engineer" }], error: null };
    render(<MyPerformance />);
    expect(state.inputs.at(-1)).toEqual({ tenantId: "tenant-1", projectId: "project-1" });
    expect(screen.getByText("My objections")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Show indicators of"), { target: { value: "emp-2" } });
    expect(state.inputs.at(-1)).toEqual({ tenantId: "tenant-1", projectId: "project-1", employeeId: "emp-2" });
    expect(screen.getByText("Indicators of a direct report")).toBeTruthy();
    expect(screen.queryByText("My objections")).toBeNull();
  });

  it("NEGATIVE: when the server refuses the list (not a performance manager), there is no picker and only one's own indicators", () => {
    state.reports = { data: undefined, error: { message: "PROJECT_OS_PERMISSION_DENIED" } };
    render(<MyPerformance />);
    expect(screen.queryByLabelText("Show indicators of")).toBeNull();
    expect(state.inputs.every(input => !(input as { employeeId?: string }).employeeId)).toBe(true);
  });

  it("NEGATIVE: a person who is not a performance manager here does not ask for the list at all (no refused request, Q-52), and sees no picker", () => {
    state.availability = { data: { linked: true, canRead: true, canManage: false }, error: null, isLoading: false, isFetching: false, refetch: vi.fn() };
    state.reports = { data: undefined, error: null };
    render(<MyPerformance />);
    expect((state.reportsOptions as { enabled: boolean }).enabled).toBe(false);
    expect(screen.queryByLabelText("Show indicators of")).toBeNull();
  });

  it("a manager is asked for the list only once availability says so", () => {
    state.reports = { data: [], error: null };
    render(<MyPerformance />);
    expect((state.reportsOptions as { enabled: boolean }).enabled).toBe(true);
  });
});
