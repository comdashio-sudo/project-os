/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectWarehouses } from "./ProjectWarehouses";

const state = vi.hoisted(() => ({ error: null as unknown, create: vi.fn(), record: vi.fn(), refetch: vi.fn() }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized inventory error" }));
vi.mock("@/lib/trpc", () => ({ trpc: { warehouses: { list: { useQuery: () => ({ isLoading: false, refetch: state.refetch, data: { warehouses: [{ id: "11111111-1111-4111-8111-111111111111", code: "WH-01", name: "Main store", active: true }], balances: [{ id: "11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222", warehouseId: "11111111-1111-4111-8111-111111111111", materialId: "22222222-2222-4222-8222-222222222222", quantityOnHand: "8.000", material: { code: "MAT-01", description: "Concrete", unitOfMeasure: "m3" } }], transactions: [] } }) }, create: { useMutation: () => ({ mutate: state.create, isPending: false, error: state.error }) }, recordInventory: { useMutation: () => ({ mutate: state.record, isPending: false, error: null }) } }, materials: { list: { useQuery: () => ({ isLoading: false, data: [{ id: "22222222-2222-4222-8222-222222222222", code: "MAT-01", description: "Concrete" }] }) } } } }));

describe("ProjectWarehouses interaction", () => {
  beforeEach(() => { cleanup(); state.error = null; state.create.mockReset(); state.record.mockReset(); state.refetch.mockReset(); });
  it("submits a project warehouse and a signed governed receipt", async () => {
    const user = userEvent.setup(); render(<ProjectWarehouses tenantId="tenant-1" projectId="project-1" />);
    await user.type(screen.getByLabelText("Code"), "WH-02"); await user.type(screen.getByLabelText("Name"), "Secondary store"); await user.click(screen.getByRole("button", { name: "Add warehouse" }));
    expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", code: "WH-02" }));
    await user.selectOptions(screen.getByLabelText("Warehouse"), "11111111-1111-4111-8111-111111111111"); await user.selectOptions(screen.getByLabelText("Material"), "22222222-2222-4222-8222-222222222222"); await user.type(screen.getByLabelText("Quantity"), "12.5"); await user.click(screen.getByRole("button", { name: "Record movement" }));
    expect(state.record).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", transactionType: "receipt", quantityDelta: 12.5 }));
    expect(screen.getByText(/On hand: 8\.000 m3/)).toBeTruthy();
  });
  it("renders a localized warehouse error", () => { state.error = {}; render(<ProjectWarehouses tenantId="tenant-1" projectId="project-1" />); expect(screen.getByRole("alert").textContent).toBe("Localized inventory error"); });
});
