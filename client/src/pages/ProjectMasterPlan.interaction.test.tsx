/** @vitest-environment jsdom */
import React from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectMasterPlan } from "./ProjectMasterPlan";

const state = vi.hoisted(() => ({ data: { plans: [{ id: "plan-1", code: "MP-1", title: "Delivery map", status: "active", createdAt: new Date() }], versions: [{ id: "version-1", masterPlanId: "plan-1", versionNumber: 1, versionKind: "original", description: null, changeSummary: null, sourceFileName: null, createdAt: new Date() }], entities: [{ id: "entity-1", masterPlanVersionId: "version-1", parentEntityId: null, code: "ZONE-A", name: "Zone A", entityType: "zone", geometry: JSON.stringify({ x: 5, y: 10, width: 25, height: 20 }), status: "in_progress", progressPercent: "45", plannedValue: "100", actualValue: "40", forecastValue: "110", wbsItemId: null, activityId: null }] }, refetch: vi.fn(), mutate: vi.fn() }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized error" }));
vi.mock("@/lib/trpc", () => ({ trpc: { useUtils: () => ({}), masterPlans: { list: { useQuery: () => ({ isLoading: false, error: null, data: state.data, refetch: state.refetch }) }, create: { useMutation: () => ({ mutate: state.mutate, isPending: false, error: null }) }, createVersion: { useMutation: () => ({ mutate: state.mutate, isPending: false, error: null }) }, createSpatialEntity: { useMutation: () => ({ mutate: state.mutate, isPending: false, error: null }) } } } }));

describe("ProjectMasterPlan", () => {
  it("selects a filtered spatial entity and reveals its authorized KPI details", async () => {
    const user = userEvent.setup(); render(<ProjectMasterPlan tenantId="tenant-1" projectId="project-1" />);
    await user.click(screen.getByRole("button", { name: "ZONE-A Zone A" }));
    expect(screen.getByText("Selected entity: ZONE-A · Zone A")).toBeTruthy(); expect(screen.getByText("Planned / actual / forecast: 100 / 40 / 110")).toBeTruthy();
  });
});
