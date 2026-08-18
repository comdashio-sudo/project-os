/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectResources } from "./ProjectResources";

const state = vi.hoisted(() => ({ error: null as unknown, mutate: vi.fn(), allocationMutate: vi.fn() }));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized resource error" }));
vi.mock("@/lib/trpc", () => ({ trpc: { resources: { list: { useQuery: () => ({ isLoading: false, error: null, data: [{ id: "resource-1", resourceCode: "LAB-01", name: "Civil crew", resourceType: "labor", plannedUnits: "10.00", allocatedUnits: "5.00", unitCost: "100.00", currency: "USD" }], refetch: vi.fn() }) }, create: { useMutation: () => ({ mutate: state.mutate, isPending: false, error: state.error }) }, updateAllocation: { useMutation: () => ({ mutate: state.allocationMutate, isPending: false, error: null }) } } } }));

describe("ProjectResources interaction", () => {
  beforeEach(() => { cleanup(); state.error = null; state.mutate.mockReset(); state.allocationMutate.mockReset(); });

  it("submits a bounded resource record and shows its defined allocation denominator", async () => {
    const user = userEvent.setup();
    render(<ProjectResources tenantId="tenant-1" projectId="project-1" />);
    await user.type(screen.getByLabelText("Resource code"), "EQ-01");
    await user.type(screen.getByLabelText("Resource name"), "Excavator");
    await user.type(screen.getByLabelText("Planned units"), "12");
    await user.type(screen.getByLabelText("Allocated units"), "6");
    await user.type(screen.getByLabelText("Unit cost"), "250");
    await user.click(screen.getByRole("button", { name: "Add resource" }));

    expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", resourceCode: "EQ-01", plannedUnits: 12, allocatedUnits: 6, unitCost: 250 }));
    expect(screen.getByText(/Allocation: 50%/)).toBeTruthy();
  });

  it("keeps submitted fields and renders only the localized error after a failed resource write", async () => {
    const user = userEvent.setup();
    state.mutate.mockImplementation(() => { state.error = {}; });
    const view = render(<ProjectResources tenantId="tenant-1" projectId="project-1" />);
    const code = screen.getByLabelText("Resource code");
    await user.type(code, "LAB-FAIL");
    await user.type(screen.getByLabelText("Resource name"), "Civil crew");
    await user.type(screen.getByLabelText("Planned units"), "10");
    await user.type(screen.getByLabelText("Allocated units"), "5");
    await user.type(screen.getByLabelText("Unit cost"), "100");
    await user.click(screen.getByRole("button", { name: "Add resource" }));
    view.rerender(<ProjectResources tenantId="tenant-1" projectId="project-1" />);

    expect((code as HTMLInputElement).value).toBe("LAB-FAIL");
    expect(screen.getByText("Localized resource error")).toBeTruthy();
  });

  it("submits an updated allocation from the resource card", async () => {
    const user = userEvent.setup();
    render(<ProjectResources tenantId="tenant-1" projectId="project-1" />);
    const allocation = screen.getByLabelText("Allocated units LAB-01");
    await user.clear(allocation);
    await user.type(allocation, "8");
    await user.click(screen.getByRole("button", { name: "Update allocation" }));

    expect(state.allocationMutate).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1", resourceId: "resource-1", allocatedUnits: 8 });
  });
});
