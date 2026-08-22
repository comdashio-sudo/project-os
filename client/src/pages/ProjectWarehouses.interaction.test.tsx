/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectWarehouses } from "./ProjectWarehouses";

const state = vi.hoisted(() => ({ error: null as unknown, create: vi.fn(), record: vi.fn(), issueToWork: vi.fn(), refetch: vi.fn() }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized inventory error" }));
vi.mock("@/lib/trpc", () => ({ trpc: { warehouses: { list: { useQuery: () => ({ isLoading: false, refetch: state.refetch, data: { warehouses: [{ id: "11111111-1111-4111-8111-111111111111", code: "WH-01", name: "Main store", active: true }], balances: [{ id: "11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222", warehouseId: "11111111-1111-4111-8111-111111111111", materialId: "22222222-2222-4222-8222-222222222222", quantityOnHand: "8.000", material: { code: "MAT-01", description: "Concrete", unitOfMeasure: "m3" } }], transactions: [] } }) }, create: { useMutation: () => ({ mutate: state.create, isPending: false, error: state.error }) }, recordInventory: { useMutation: () => ({ mutate: state.record, isPending: false, error: null }) }, issueToWork: { useMutation: () => ({ mutate: state.issueToWork, isPending: false, error: null }) } }, materials: { list: { useQuery: () => ({ isLoading: false, data: [{ id: "22222222-2222-4222-8222-222222222222", code: "MAT-01", description: "Concrete" }] }) } }, projects: { getControlsSchedule: { useQuery: () => ({ isLoading: false, data: { wbs: [{ id: "33333333-3333-4333-8333-333333333333", code: "WBS-01", name: "Structure" }], activities: [{ id: "44444444-4444-4444-8444-444444444444", wbsItemId: "33333333-3333-4333-8333-333333333333", code: "ACT-01", name: "Pour concrete" }] } }) } } } }));

describe("ProjectWarehouses interaction", () => {
  beforeEach(() => { cleanup(); state.error = null; state.create.mockReset(); state.record.mockReset(); state.issueToWork.mockReset(); state.refetch.mockReset(); });
  it("submits a project warehouse and a signed governed receipt", async () => {
    const user = userEvent.setup(); render(<ProjectWarehouses tenantId="tenant-1" projectId="project-1" />);
    await user.type(screen.getByLabelText("Code"), "WH-02"); await user.type(screen.getByLabelText("Name"), "Secondary store"); await user.click(screen.getByRole("button", { name: "Add warehouse" }));
    expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", code: "WH-02" }));
    await user.selectOptions(screen.getByLabelText("Warehouse", { selector: "#inventory-warehouse" }), "11111111-1111-4111-8111-111111111111"); await user.selectOptions(screen.getByLabelText("Material", { selector: "#inventory-material" }), "22222222-2222-4222-8222-222222222222"); await user.type(screen.getByLabelText("Quantity", { selector: "#inventory-quantity" }), "12.5"); await user.click(screen.getByRole("button", { name: "Record movement" }));
    expect(state.record).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", transactionType: "receipt", quantityDelta: 12.5 }));
    expect(screen.getByText(/On hand: 8\.000 m3/)).toBeTruthy();
  });
  it("renders a localized warehouse error", () => { state.error = {}; render(<ProjectWarehouses tenantId="tenant-1" projectId="project-1" />); expect(screen.getByRole("alert").textContent).toBe("Localized inventory error"); });
  it("issues governed material to a compatible WBS activity with an actual-cost input", async () => { const user = userEvent.setup(); render(<ProjectWarehouses tenantId="tenant-1" projectId="project-1" />); await user.selectOptions(screen.getByLabelText("Warehouse", { selector: "#work-issue-warehouse" }), "11111111-1111-4111-8111-111111111111"); await user.selectOptions(screen.getByLabelText("Material", { selector: "#work-issue-material" }), "22222222-2222-4222-8222-222222222222"); await user.selectOptions(screen.getByLabelText("WBS item"), "33333333-3333-4333-8333-333333333333"); await user.selectOptions(screen.getByLabelText("Activity"), "44444444-4444-4444-8444-444444444444"); await user.type(screen.getByLabelText("Quantity", { selector: "#work-issue-quantity" }), "2"); await user.type(screen.getByLabelText("Unit cost"), "25"); await user.click(screen.getByRole("button", { name: "Post issue and cost" })); expect(state.issueToWork).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", issuedQuantity: 2, unitCost: 25, wbsItemId: "33333333-3333-4333-8333-333333333333", activityId: "44444444-4444-4444-8444-444444444444" })); });
});
