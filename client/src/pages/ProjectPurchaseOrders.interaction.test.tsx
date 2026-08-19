/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectPurchaseOrders } from "./ProjectPurchaseOrders";

const state = vi.hoisted(() => ({ arabic: false, create: vi.fn(), transition: vi.fn() }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.arabic }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized procurement error" }));
vi.mock("@/lib/trpc", () => ({ trpc: { purchaseOrders: {
  list: { useQuery: () => ({ data: [{ id: "00000000-0000-4000-8000-0000000000p0", purchaseOrderNumber: "PO-001", supplierName: "Concrete Supply Co", orderDate: new Date("2026-08-19T00:00:00.000Z"), amount: "12500.50", currency: "USD", summary: "Existing purchase order for structural concrete materials.", status: "draft" }], refetch: vi.fn(), error: null, isLoading: false }) },
  create: { useMutation: () => ({ mutate: state.create, isPending: false, error: null }) },
  transitionStatus: { useMutation: () => ({ mutate: state.transition, isPending: false, error: null }) },
} } }));

describe("ProjectPurchaseOrders", () => {
  it("submits a purchase order and exposes the governed next transition", async () => {
    cleanup(); state.create.mockClear(); state.transition.mockClear(); state.arabic = false;
    const user = userEvent.setup();
    render(<ProjectPurchaseOrders tenantId="tenant-1" projectId="project-1" />);
    await user.type(screen.getByLabelText("Purchase-order number"), "PO-002");
    await user.type(screen.getByLabelText("Supplier"), "Steel Supply Co");
    await user.type(screen.getByLabelText("Amount"), "8800.25");
    await user.clear(screen.getByLabelText("Currency"));
    await user.type(screen.getByLabelText("Currency"), "sar");
    await user.type(screen.getByLabelText("Order summary"), "Authorized purchase of structural steel components.");
    await user.click(screen.getByRole("button", { name: "Save purchase order" }));
    expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", purchaseOrderNumber: "PO-002", supplierName: "Steel Supply Co", amount: 8800.25, currency: "SAR" }));
    await user.click(screen.getByRole("button", { name: "Update status: Submitted" }));
    expect(state.transition).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1", purchaseOrderId: "00000000-0000-4000-8000-0000000000p0", nextStatus: "submitted" });
  });

  it("localizes the purchase-order register and transition control in Arabic", () => {
    cleanup(); state.arabic = true;
    render(<ProjectPurchaseOrders tenantId="tenant-1" projectId="project-1" />);
    expect(screen.getByText("سجل أوامر الشراء")).toBeTruthy();
    expect(screen.getByLabelText("رقم أمر الشراء")).toBeTruthy();
    expect(screen.getByRole("button", { name: "تحديث الحالة: مرسل" })).toBeTruthy();
    state.arabic = false;
  });
});
