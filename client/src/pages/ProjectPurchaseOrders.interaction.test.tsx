/** @vitest-environment jsdom */
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ProjectPurchaseOrders } from "./ProjectPurchaseOrders";
import { expectEmptySubmitRefused } from "@/test/checkedFormExpect";
import { TYPING_TEST } from "@/test/typing";
// D-85: typing without the per-key delay (userEvent's default setTimeout between keys); under CPU contention those delays alone pushed
// these form tests past the 5 s limit. The events and their order are the same.
const typist = () => userEvent.setup({ delay: null });

const state = vi.hoisted(() => ({ arabic: false, create: vi.fn(), transition: vi.fn(), contractsError: null as unknown, contractsRefetch: vi.fn(), listRefetch: vi.fn() }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.arabic, language: (state.arabic) ? "ar" : "en", isRtl: state.arabic }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized procurement error" }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    purchaseOrders: {
      list: { useQuery: () => ({ isFetching: false, data: [{ id: "00000000-0000-4000-8000-0000000000f0", purchaseOrderNumber: "PO-001", supplierName: "Concrete Supply Co", orderDate: new Date("2026-08-19T00:00:00.000Z"), amount: "12500.50", currency: "SAR", summary: "Existing purchase order for structural concrete materials.", status: "draft", contractId: null, commitmentId: null, receivedAt: null }, { id: "00000000-0000-4000-8000-0000000000f3", purchaseOrderNumber: "PO-003", supplierName: "Steel Supply Co", orderDate: new Date("2026-08-20T00:00:00.000Z"), amount: "8800.25", currency: "SAR", summary: "Issued purchase order pending controlled receipt.", status: "issued", contractId: "00000000-0000-4000-8000-0000000000c0", commitmentId: "00000000-0000-4000-8000-0000000000b0", receivedAt: null }], refetch: state.listRefetch, error: null, isLoading: false }) },
      create: { useMutation: () => ({ mutate: state.create, isPending: false, error: null }) },
      transitionStatus: { useMutation: () => ({ mutate: state.transition, isPending: false, error: null }) },
    },
    procurement: { register: { useQuery: () => ({ data: { suppliers: [{ id: "00000000-0000-4000-8000-0000000000d1", code: "SUP-1", legalName: "Registered Steel Co", active: true }, { id: "00000000-0000-4000-8000-0000000000d2", code: "SUP-2", legalName: "Retired Supplier", active: false }] } }) } },
    contracts: {
      getProjectRegister: { useQuery: () => state.contractsError ? ({ data: undefined, isLoading: false, isFetching: false, error: state.contractsError, refetch: state.contractsRefetch }) : ({ refetch: state.contractsRefetch, data: { contracts: [{ id: "00000000-0000-4000-8000-0000000000c0", code: "CON-001", title: "Concrete Contract" }], commitments: [{ id: "00000000-0000-4000-8000-0000000000b0", code: "COM-001", description: "Concrete commitment" }], wbsItems: [{ id: "00000000-0000-4000-8000-0000000000a1", code: "1.1", name: "Foundations" }] }, error: null, isLoading: false }) },
    },
  },
}));

describe("ProjectPurchaseOrders", TYPING_TEST, () => {
  it("submits a purchase order and exposes the governed next transition", async () => {
    cleanup(); state.create.mockClear(); state.transition.mockClear(); state.arabic = false;
    const user = typist();
    render(<ProjectPurchaseOrders tenantId="tenant-1" projectId="project-1" />);
    await user.type(screen.getByLabelText("Purchase-order number"), "PO-002");
    await user.type(screen.getByLabelText("Supplier"), "Steel Supply Co");
    await user.selectOptions(screen.getByLabelText("Contract"), "00000000-0000-4000-8000-0000000000c0");
    await user.selectOptions(screen.getByLabelText("Commitment"), "00000000-0000-4000-8000-0000000000b0");
    await user.selectOptions(screen.getByLabelText("WBS item"), "00000000-0000-4000-8000-0000000000a1");
    await user.type(screen.getByLabelText("Amount"), "8800.25");
    await user.clear(screen.getByLabelText("Currency"));
    await user.type(screen.getByLabelText("Currency"), "sar");
    await user.type(screen.getByLabelText("Order summary"), "Authorized purchase of structural steel components.");
    await user.click(screen.getByRole("button", { name: "Save purchase order" }));
    expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", contractId: "00000000-0000-4000-8000-0000000000c0", commitmentId: "00000000-0000-4000-8000-0000000000b0", wbsItemId: "00000000-0000-4000-8000-0000000000a1", purchaseOrderNumber: "PO-002", supplierName: "Steel Supply Co", amount: 8800.25, currency: "SAR" }));
    await user.click(screen.getByRole("button", { name: "Update status: Submitted" }));
    expect(state.transition).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1", purchaseOrderId: "00000000-0000-4000-8000-0000000000f0", nextStatus: "submitted" });
    await user.click(screen.getByRole("button", { name: "Update status: Received" }));
    expect(state.transition).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1", purchaseOrderId: "00000000-0000-4000-8000-0000000000f3", nextStatus: "received" });
  });

  it("places the order with a supplier from the register: the name is not typed and only active suppliers are offered (G-103)", async () => {
    cleanup(); state.create.mockClear(); state.arabic = false;
    const user = typist();
    render(<ProjectPurchaseOrders tenantId="tenant-1" projectId="project-1" />);
    const options = Array.from((screen.getByLabelText("Supplier from the register") as HTMLSelectElement).options).map(option => option.text);
    expect(options).toEqual(["Unregistered supplier (type the name)", "SUP-1 · Registered Steel Co"]); // the inactive supplier is not offered
    await user.type(screen.getByLabelText("Purchase-order number"), "PO-003");
    await user.selectOptions(screen.getByLabelText("Supplier from the register"), "00000000-0000-4000-8000-0000000000d1");
    expect(screen.queryByLabelText("Supplier")).toBeNull(); // no free-text name once a register entry is chosen
    await user.type(screen.getByLabelText("Amount"), "100");
    await user.type(screen.getByLabelText("Order summary"), "Authorized purchase of fixings.");
    await user.click(screen.getByRole("button", { name: "Save purchase order" }));
    expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ purchaseOrderNumber: "PO-003", supplierId: "00000000-0000-4000-8000-0000000000d1", supplierName: undefined }));
  });

  it("localizes the purchase-order register and transition control in Arabic", () => {
    cleanup(); state.arabic = true;
    render(<ProjectPurchaseOrders tenantId="tenant-1" projectId="project-1" />);
    expect(screen.getByText("سجل أوامر الشراء")).toBeTruthy();
    expect(screen.getByLabelText("رقم أمر الشراء")).toBeTruthy();
    expect(screen.getByRole("button", { name: "تحديث الحالة: مرسل" })).toBeTruthy();
    expect(screen.getByLabelText("العقد")).toBeTruthy();
    expect(screen.getByRole("button", { name: "تحديث الحالة: مستلم" })).toBeTruthy();
    state.arabic = false;
  });
});

describe("ProjectPurchaseOrders form checks itself in the page's language (D-63)", TYPING_TEST, () => {
  it("an empty purchase order saves nothing and says so in Arabic under its first field", () => {
    cleanup(); state.create.mockClear(); state.arabic = true;
    render(<ProjectPurchaseOrders tenantId="tenant-1" projectId="project-1" />);
    expectEmptySubmitRefused(document.querySelector("form")!, "ar", state.create);
    state.arabic = false;
  });
});

describe("ProjectPurchaseOrders when the contracts register fails (review of #232)", () => {
  it("shows the section's error card, and «Try again» asks the contracts register again as well as the list", () => {
    cleanup(); state.arabic = false; state.contractsError = { message: "boom" }; state.contractsRefetch.mockReset(); state.listRefetch.mockReset();
    render(<ProjectPurchaseOrders tenantId="tenant-1" projectId="project-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(state.contractsRefetch).toHaveBeenCalledTimes(1);
    expect(state.listRefetch).toHaveBeenCalledTimes(1);
    state.contractsError = null;
  });
});
