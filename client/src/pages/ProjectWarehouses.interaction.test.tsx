/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectWarehouses } from "./ProjectWarehouses";
import { expectEmptySubmitRefused } from "@/test/checkedFormExpect";
import { TYPING_TEST } from "@/test/typing";

const state = vi.hoisted(() => ({ error: null as unknown, create: vi.fn(), record: vi.fn(), issueToWork: vi.fn(), transferInventory: vi.fn(), refetch: vi.fn() }));
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: (await import("../test/dsSelectStandIn")).NativeSelect }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: (false) ? "ar" : "en", isRtl: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized inventory error" }));
vi.mock("./ProjectStocktakes", () => ({ ProjectStocktakes: () => null }));
vi.mock("@/lib/trpc", () => ({ trpc: { warehouses: { list: { useQuery: () => ({ isLoading: false, refetch: state.refetch, data: { warehouses: [{ id: "11111111-1111-4111-8111-111111111111", code: "WH-01", name: "Main store", active: true }, { id: "55555555-5555-4555-8555-555555555555", code: "WH-02", name: "Site store", active: true }], balances: [{ id: "11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222", warehouseId: "11111111-1111-4111-8111-111111111111", materialId: "22222222-2222-4222-8222-222222222222", quantityOnHand: "8.000", material: { code: "MAT-01", description: "Concrete", unitOfMeasure: "m3" } }], transactions: [] } }) }, create: { useMutation: () => ({ mutate: state.create, isPending: false, error: state.error }) }, recordInventory: { useMutation: () => ({ mutate: state.record, isPending: false, error: null }) }, issueToWork: { useMutation: () => ({ mutate: state.issueToWork, isPending: false, error: null }) }, transferInventory: { useMutation: () => ({ mutate: state.transferInventory, isPending: false, error: null }) } }, materials: { list: { useQuery: () => ({ isLoading: false, data: [{ id: "22222222-2222-4222-8222-222222222222", code: "MAT-01", description: "Concrete" }] }) } }, projects: { getControlsSchedule: { useQuery: () => ({ isLoading: false, data: { wbs: [{ id: "33333333-3333-4333-8333-333333333333", code: "WBS-01", name: "Structure" }], activities: [{ id: "44444444-4444-4444-8444-444444444444", wbsItemId: "33333333-3333-4333-8333-333333333333", code: "ACT-01", name: "Pour concrete" }] } }) } } } }));

describe("ProjectWarehouses interaction", TYPING_TEST, () => {
  beforeEach(() => { cleanup(); state.error = null; state.create.mockReset(); state.record.mockReset(); state.issueToWork.mockReset(); state.transferInventory.mockReset(); state.refetch.mockReset(); });
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
  it("an issue with the activity put back on \"—\" posts no activity, and one with no WBS item is refused (D-75 negative)", async () => {
    const user = userEvent.setup(); render(<ProjectWarehouses tenantId="tenant-1" projectId="project-1" />);
    await user.selectOptions(screen.getByLabelText("Warehouse", { selector: "#work-issue-warehouse" }), "11111111-1111-4111-8111-111111111111"); await user.selectOptions(screen.getByLabelText("Material", { selector: "#work-issue-material" }), "22222222-2222-4222-8222-222222222222");
    await user.type(screen.getByLabelText("Quantity", { selector: "#work-issue-quantity" }), "2"); await user.type(screen.getByLabelText("Unit cost"), "25");
    const before = state.issueToWork.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Post issue and cost" }));
    expect(state.issueToWork.mock.calls.length).toBe(before);
    expect(screen.getByLabelText("WBS item").getAttribute("aria-invalid")).toBe("true");
    await user.selectOptions(screen.getByLabelText("WBS item"), "33333333-3333-4333-8333-333333333333");
    await user.selectOptions(screen.getByLabelText("Activity"), "44444444-4444-4444-8444-444444444444"); await user.selectOptions(screen.getByLabelText("Activity"), "__none");
    await user.click(screen.getByRole("button", { name: "Post issue and cost" }));
    expect(state.issueToWork.mock.calls.at(-1)?.[0]).toMatchObject({ wbsItemId: "33333333-3333-4333-8333-333333333333", activityId: undefined });
  });
  it("transfers material between distinct active warehouses", async () => { const user = userEvent.setup(); render(<ProjectWarehouses tenantId="tenant-1" projectId="project-1" />); await user.selectOptions(screen.getByLabelText("Source warehouse"), "11111111-1111-4111-8111-111111111111"); await user.selectOptions(screen.getByLabelText("Destination warehouse"), "55555555-5555-4555-8555-555555555555"); await user.selectOptions(screen.getByLabelText("Material", { selector: "#transfer-material" }), "22222222-2222-4222-8222-222222222222"); await user.type(screen.getByLabelText("Quantity", { selector: "#transfer-quantity" }), "3"); await user.type(screen.getByLabelText("Note", { selector: "#transfer-note" }), "Rebalance site stock"); await user.click(screen.getByRole("button", { name: "Record transfer" })); expect(state.transferInventory).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", sourceWarehouseId: "11111111-1111-4111-8111-111111111111", destinationWarehouseId: "55555555-5555-4555-8555-555555555555", materialId: "22222222-2222-4222-8222-222222222222", quantity: 3, note: "Rebalance site stock" })); });
  it("does not send a transfer without a reason", async () => { const user = userEvent.setup(); render(<ProjectWarehouses tenantId="tenant-1" projectId="project-1" />); await user.selectOptions(screen.getByLabelText("Source warehouse"), "11111111-1111-4111-8111-111111111111"); await user.selectOptions(screen.getByLabelText("Destination warehouse"), "55555555-5555-4555-8555-555555555555"); await user.selectOptions(screen.getByLabelText("Material", { selector: "#transfer-material" }), "22222222-2222-4222-8222-222222222222"); await user.type(screen.getByLabelText("Quantity", { selector: "#transfer-quantity" }), "3"); await user.click(screen.getByRole("button", { name: "Record transfer" })); expect(state.transferInventory).not.toHaveBeenCalled(); void (expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", sourceWarehouseId: "11111111-1111-4111-8111-111111111111", destinationWarehouseId: "55555555-5555-4555-8555-555555555555", materialId: "22222222-2222-4222-8222-222222222222", quantity: 3 })); });
});

describe("ProjectWarehouses forms check themselves in the page's language (D-64)", () => {
  it("an empty warehouse creates nothing and says so in English under its first field", () => {
    cleanup(); state.error = null; state.create.mockReset();
    render(<ProjectWarehouses tenantId="tenant-1" projectId="project-1" />);
    expectEmptySubmitRefused(document.querySelector("form")!, "en", state.create);
  });
});
