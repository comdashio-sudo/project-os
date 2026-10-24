// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import MyPerformance from "./MyPerformance";

const state = vi.hoisted(() => ({ isArabic: false, createObjection: vi.fn() }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.isArabic, language: (state.isArabic) ? "ar" : "en", isRtl: state.isArabic }) }));
vi.mock("@/components/EnterpriseNavigation", () => ({ EnterpriseNavigation: () => <nav aria-label="navigation" /> }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized error" }));
vi.mock("wouter", () => ({ useParams: () => ({ tenantId: "tenant-1", projectId: "project-1" }) }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    performance: {
      get: { useQuery: () => ({ data: { employee: { employeeNumber: "EMP-1" }, metrics: { assignedCount: 4, completedCount: 2, overdueCount: 1, onTimeCompletionPercent: 100, averageResponseHours: 12, openCount: 2, excludedCount: 1, recordsConsidered: 4, generatedAt: new Date("2026-09-10T12:00:00Z"), formula: "assigned = non-excluded source records", sourceCounts: { activity: 2, action: 1, rfi: 1, ncr: 0, quality_inspection: 0, field_report: 0, material_request: 0 }, sources: [{ sourceType: "activity", sourceId: "a1", label: "A-01", status: "in_progress", createdAt: new Date(), dueAt: null, completedAt: null }] }, exclusions: [], objections: [] }, isLoading: false, error: null, refetch: vi.fn() }) },
      objections: { create: { useMutation: () => ({ mutate: state.createObjection, isPending: false, error: null }) } },
    },
  },
}));

describe("MyPerformance", () => {
  beforeEach(() => { cleanup(); state.isArabic = false; state.createObjection.mockReset(); });

  it("shows derived data, transparent formula, and a self-service objection without salary data", () => {
    render(<MyPerformance />);
    expect(screen.getByText("My indicators")).toBeTruthy();
    expect(screen.getByText("assigned = non-excluded source records")).toBeTruthy();
    expect(screen.getByText(/no automatic disciplinary or contractual effect/i)).toBeTruthy();
    expect(screen.queryByText(/salary/i)).toBeNull();
    fireEvent.change(screen.getByLabelText("My objections"), { target: { value: "A documented operational circumstance affected this record." } });
    fireEvent.click(screen.getByRole("button", { name: "Submit objection" }));
    expect(state.createObjection).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1", statement: "A documented operational circumstance affected this record." });
  });

  it("localizes the page in Arabic", () => {
    state.isArabic = true;
    render(<MyPerformance />);
    expect(screen.getByText("مؤشراتي")).toBeTruthy();
    expect(screen.getByText("اعتراضاتي")).toBeTruthy();
  });
});
