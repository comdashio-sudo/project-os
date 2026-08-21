/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectProcurement } from "./ProjectProcurement";

const state = vi.hoisted(() => ({ error: null as unknown, supplier: vi.fn(), requisition: vi.fn(), transition: vi.fn(), refetch: vi.fn() }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized procurement error" }));
vi.mock("@/lib/trpc", () => ({ trpc: { procurement: { register: { useQuery: () => ({ isLoading: false, refetch: state.refetch, data: { suppliers: [{ id: "11111111-1111-4111-8111-111111111111", code: "SUP-01", legalName: "Supply Company", active: true }], requisitions: [{ id: "33333333-3333-4333-8333-333333333333", requisitionNumber: "PR-01", description: "Existing procurement request", requestedQuantity: "5.000", unitOfMeasure: "m3", status: "draft" }] } }) }, createSupplier: { useMutation: () => ({ mutate: state.supplier, isPending: false, error: state.error }) }, createRequisition: { useMutation: () => ({ mutate: state.requisition, isPending: false, error: null }) }, transitionRequisition: { useMutation: () => ({ mutate: state.transition, isPending: false, error: null }) } }, materials: { list: { useQuery: () => ({ isLoading: false, data: [{ id: "22222222-2222-4222-8222-222222222222", code: "MAT-01", description: "Concrete" }] }) } } } }));

describe("ProjectProcurement interaction", () => {
  beforeEach(() => { cleanup(); state.error = null; state.supplier.mockReset(); state.requisition.mockReset(); state.transition.mockReset(); state.refetch.mockReset(); });
  it("submits a supplier, governed requisition, and draft transition", async () => {
    const user = userEvent.setup(); render(<ProjectProcurement tenantId="tenant-1" projectId="project-1" />);
    await user.type(screen.getByLabelText("Supplier code"), "SUP-02"); await user.type(screen.getByLabelText("Legal name"), "Steel Supply"); await user.click(screen.getByRole("button", { name: "Add supplier" }));
    expect(state.supplier).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", code: "SUP-02" }));
    await user.type(screen.getByLabelText("Requisition number"), "PR-02"); await user.type(screen.getByLabelText("Description"), "Procure structural concrete"); await user.type(screen.getByLabelText("Quantity"), "12"); await user.type(screen.getByLabelText("Unit of measure"), "m3"); await user.selectOptions(screen.getByLabelText("Supplier"), "11111111-1111-4111-8111-111111111111"); await user.selectOptions(screen.getByLabelText("Material"), "22222222-2222-4222-8222-222222222222"); await user.click(screen.getByRole("button", { name: "Create requisition" }));
    expect(state.requisition).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", requisitionNumber: "PR-02", requestedQuantity: 12 }));
    await user.click(screen.getByRole("button", { name: "Submit" })); expect(state.transition).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1", requisitionId: "33333333-3333-4333-8333-333333333333", nextStatus: "submitted" });
  });
  it("renders a localized procurement error", () => { state.error = {}; render(<ProjectProcurement tenantId="tenant-1" projectId="project-1" />); expect(screen.getByRole("alert").textContent).toBe("Localized procurement error"); });
});
