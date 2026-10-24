/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PermissionProvider } from "@/lib/permissions";
import { ProjectWorkforce } from "./ProjectWorkforce";

// Excluding a performance source and moving an objection are performance.manage operations on the server
// (assertPerformanceManager in server/db.ts), scoped to the project.
const state = vi.hoisted(() => ({ permission: { data: undefined as unknown, error: null as unknown, isLoading: false } }));
const TENANT = "11111111-1111-4111-8111-111111111111";
const PROJECT = "22222222-2222-4222-8222-222222222222";
const EMPLOYEE = "33333333-3333-4333-8333-333333333333";
const ASSIGNMENT = { id: "44444444-4444-4444-8444-444444444444", employeeId: EMPLOYEE, employeeNumber: "E-001", fullName: "Example Employee", resourceCode: "LAB-1", plannedHours: 8 };
const PERFORMANCE = {
  metrics: { assignedCount: 1, completedCount: 0, overdueCount: 0, onTimeCompletionPercent: null, openCount: 1, sources: [{ sourceType: "activity", sourceId: "55555555-5555-4555-8555-555555555555", label: "Example activity" }] },
  objections: [{ id: "66666666-6666-4666-8666-666666666666", status: "submitted", statement: "Example objection statement for the review.", createdAt: "2026-10-01T08:00:00.000Z", resolutionNote: null }],
};

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: (false) ? "ar" : "en", isRtl: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Workforce error" }));
vi.mock("@/lib/trpc", () => {
  const mutation = () => ({ mutate: vi.fn(), isPending: false, error: null, isSuccess: false, data: undefined });
  const query = (data: unknown) => ({ data, error: null, isLoading: false, isFetching: false, refetch: vi.fn() });
  return { trpc: {
    accessSummary: { mine: { useQuery: () => state.permission } },
    assignments: {
      options: { useQuery: () => query({ employees: [{ id: EMPLOYEE, label: "E-001 · Example Employee" }], resources: [{ id: "r1", label: "LAB-1" }], wbs: [{ id: "w1", label: "1.1" }], activities: [{ id: "a1", label: "A-100" }] }) },
      list: { useQuery: () => query([ASSIGNMENT]) },
      create: { useMutation: mutation },
      timeEntries: { list: { useQuery: () => query([]) }, create: { useMutation: mutation }, transition: { useMutation: mutation } },
    },
    employees: { attendance: { list: { useQuery: () => query([]) }, create: { useMutation: mutation }, transition: { useMutation: mutation } } },
    performance: {
      get: { useQuery: () => query(PERFORMANCE) },
      exclude: { useMutation: mutation },
      objections: { create: { useMutation: mutation }, transition: { useMutation: mutation } },
    },
  } };
});

// Radix Select needs a few browser APIs that jsdom leaves out.
beforeEach(() => {
  Element.prototype.hasPointerCapture = () => false;
  Element.prototype.setPointerCapture = () => undefined;
  Element.prototype.releasePointerCapture = () => undefined;
  Element.prototype.scrollIntoView = () => undefined;
  state.permission = { data: undefined, error: null, isLoading: false };
});

const summary = (over: Record<string, unknown> = {}) => ({ member: true, products: ["PROJECT"], permissions: ["project.performance.manage", "project.manage"], scopes: [{ scopeType: "company", scopeId: null }], ...over });
const page = () => <PermissionProvider tenantId={TENANT}><ProjectWorkforce tenantId={TENANT} projectId={PROJECT} /></PermissionProvider>;

// Opens the assigned-employee choice and picks the first person, which is what reveals the performance block.
function chooseEmployee() {
  const trigger = screen.getByRole("combobox", { name: "Choose an assigned employee" });
  fireEvent.pointerDown(trigger, { button: 0, ctrlKey: false, pointerType: "mouse" });
  fireEvent.click(screen.getByRole("option", { name: "E-001 · Example Employee" }));
}

describe("ProjectWorkforce performance controls follow project.performance.manage", () => {
  afterEach(cleanup);

  it("a performance manager can exclude a source and start an objection review", () => {
    state.permission = { data: summary(), error: null, isLoading: false };
    render(page());
    chooseEmployee();
    expect(screen.getByRole("button", { name: "Exclude with documented reason" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start review" })).toBeTruthy();
  });

  it("a person with the assignment permission but not performance.manage reads the indicators and no controls", () => {
    state.permission = { data: summary({ permissions: ["project.manage"] }), error: null, isLoading: false };
    render(page());
    chooseEmployee();
    expect(screen.getByText("Example objection statement for the review.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Exclude with documented reason" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Start review" })).toBeNull();
  });

  it("while the permission answer is loading neither control is drawn", () => {
    state.permission = { data: undefined, error: null, isLoading: true };
    render(page());
    chooseEmployee();
    expect(screen.queryByRole("button", { name: "Exclude with documented reason" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Start review" })).toBeNull();
  });

  it("when the permission lookup fails both controls stay, and the server refuses what it must", () => {
    state.permission = { data: undefined, error: new Error("network"), isLoading: false };
    render(page());
    chooseEmployee();
    expect(screen.getByRole("button", { name: "Exclude with documented reason" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Start review" })).toBeTruthy();
  });
});
