// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectGoodsReceipts } from "./ProjectGoodsReceipts";
import { expectEmptySubmitRefused } from "@/test/checkedFormExpect";

const state = vi.hoisted(() => ({ arabic: false, create: vi.fn(), refetch: vi.fn(), grns: [] as unknown[], build: vi.fn(async (..._args: unknown[]) => new ArrayBuffer(8)) }));
vi.mock("@/lib/excelExport", async importOriginal => ({ ...(await importOriginal<typeof import("@/lib/excelExport")>()), buildTableWorkbook: state.build, downloadWorkbook: vi.fn() }));
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: (await import("../test/dsSelectStandIn")).NativeSelect }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: state.arabic, language: (state.arabic) ? "ar" : "en", isRtl: state.arabic }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized GRN error" }));
vi.mock("@/lib/trpc", () => ({ trpc: { goodsReceipts: { list: { useQuery: () => ({ isLoading: false, data: state.grns, refetch: state.refetch, error: null }) }, create: { useMutation: () => ({ mutate: state.create, isPending: false, error: null }) } }, purchaseOrders: { list: { useQuery: () => ({ isLoading: false, error: null, data: [{ id: "11111111-1111-4111-8111-111111111111", purchaseOrderNumber: "PO-ISSUED", supplierName: "Supply Co", status: "issued" }] }) } }, materials: { list: { useQuery: () => ({ isLoading: false, error: null, data: [{ id: "22222222-2222-4222-8222-222222222222", code: "MAT-01", description: "Concrete", unitOfMeasure: "m3" }] }) } }, qualityInspections: { list: { useQuery: () => ({ isLoading: false, error: null, data: [{ id: "33333333-3333-4333-8333-333333333333", inspectionNumber: "QI-FAIL", status: "accepted", outcome: "fail" }] }) } }, ncrs: { list: { useQuery: () => ({ isLoading: false, error: null, data: [{ id: "44444444-4444-4444-8444-444444444444", ncrNumber: "NCR-01", status: "open" }] }) } }, warehouses: { list: { useQuery: () => ({ isLoading: false, error: null, refetch: state.refetch, data: { warehouses: [{ id: "55555555-5555-4555-8555-555555555555", code: "WH-01", name: "Main store", active: true }], balances: [], transactions: [] } }) } } } }));

describe("ProjectGoodsReceipts interaction", () => {
  beforeEach(() => { state.arabic = false; state.create.mockReset(); state.refetch.mockReset(); }); afterEach(cleanup);
  it("records a rejected quantity only with issued PO, quality inspection, and open NCR evidence", async () => {
    const user = userEvent.setup(); render(<ProjectGoodsReceipts tenantId="tenant-1" projectId="project-1" />);
    await user.type(screen.getByLabelText("GRN number"), "GRN-01"); await user.selectOptions(screen.getByLabelText("Issued purchase order"), "11111111-1111-4111-8111-111111111111"); await user.selectOptions(screen.getByLabelText("Warehouse"), "55555555-5555-4555-8555-555555555555"); await user.selectOptions(screen.getByLabelText("Material"), "22222222-2222-4222-8222-222222222222"); await user.type(screen.getByLabelText("Unit cost"), "100"); await user.type(screen.getByLabelText("Accepted quantity"), "8"); await user.clear(screen.getByLabelText("Rejected quantity")); await user.type(screen.getByLabelText("Rejected quantity"), "2"); await user.selectOptions(screen.getByLabelText("Quality inspection"), "33333333-3333-4333-8333-333333333333"); await user.selectOptions(screen.getByLabelText("NCR"), "44444444-4444-4444-8444-444444444444"); await user.click(screen.getByRole("button", { name: "Record goods receipt" }));
    expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", grnNumber: "GRN-01", purchaseOrderId: "11111111-1111-4111-8111-111111111111", materialId: "22222222-2222-4222-8222-222222222222", receivedQuantity: 8, rejectedQuantity: 2, unitCost: 100, unitOfMeasure: "m3", receiptMode: "warehouse_stock", warehouseId: "55555555-5555-4555-8555-555555555555", qualityInspectionId: "33333333-3333-4333-8333-333333333333", ncrId: "44444444-4444-4444-8444-444444444444", receivedAt: expect.any(Date) }));
  });
  it("sends a direct delivery to site without a warehouse, so its cost is charged at receipt and no shelf is raised", async () => {
    const user = userEvent.setup(); render(<ProjectGoodsReceipts tenantId="tenant-1" projectId="project-1" />);
    await user.click(screen.getByLabelText("Direct delivery to site (cost charged now)"));
    expect(screen.queryByLabelText("Warehouse")).toBeNull();
    await user.type(screen.getByLabelText("GRN number"), "GRN-02"); await user.selectOptions(screen.getByLabelText("Issued purchase order"), "11111111-1111-4111-8111-111111111111"); await user.selectOptions(screen.getByLabelText("Material"), "22222222-2222-4222-8222-222222222222"); await user.type(screen.getByLabelText("Unit cost"), "30"); await user.type(screen.getByLabelText("Accepted quantity"), "10");
    await user.click(screen.getByRole("button", { name: "Record goods receipt" }));
    expect(state.create).toHaveBeenCalledWith(expect.objectContaining({ grnNumber: "GRN-02", receiptMode: "direct_to_site", warehouseId: undefined, unitCost: 30 }));
  });
  it("with every field but the purchase order, records nothing and marks that list as required (D-75 negative)", async () => {
    const user = userEvent.setup(); render(<ProjectGoodsReceipts tenantId="tenant-1" projectId="project-1" />);
    await user.click(screen.getByLabelText("Direct delivery to site (cost charged now)"));
    await user.type(screen.getByLabelText("GRN number"), "GRN-03"); await user.selectOptions(screen.getByLabelText("Material"), "22222222-2222-4222-8222-222222222222"); await user.type(screen.getByLabelText("Unit cost"), "30"); await user.type(screen.getByLabelText("Accepted quantity"), "10");
    const before = state.create.mock.calls.length;
    await user.click(screen.getByRole("button", { name: "Record goods receipt" }));
    expect(state.create.mock.calls.length).toBe(before);
    expect(screen.getByLabelText("Issued purchase order").getAttribute("aria-invalid")).toBe("true");
  });
  it("renders Arabic GRN context and does not expose sensitive compensation data", () => { state.arabic = true; render(<ProjectGoodsReceipts tenantId="tenant-1" projectId="project-1" />); expect(screen.getByText("استلام المواد (GRN)")).toBeTruthy(); expect(screen.getByLabelText("أمر الشراء الصادر")).toBeTruthy(); expect(screen.queryByText(/راتب|salary/i)).toBeNull(); });
});

describe("ProjectGoodsReceipts export (Q-57)", () => {
  afterEach(() => { cleanup(); state.grns = []; state.arabic = false; });
  beforeEach(() => { state.arabic = false; });
  it("exports the receipts with quantities as numbers and the inspection and NCR only on a rejected receipt", async () => {
    state.grns = [
      { id: "g1", grnNumber: "GRN-01", purchaseOrderNumber: "PO-1", receivedAt: "2026-11-20T08:00:00.000Z", materialCode: "MAT-01", materialDescription: "Concrete", receivedQuantity: "8.000", rejectedQuantity: "2.000", unitOfMeasure: "m3", inspectionNumber: "QI-1", ncrNumber: "NCR-1" },
      { id: "g2", grnNumber: "GRN-02", purchaseOrderNumber: "PO-1", receivedAt: "2026-11-21T08:00:00.000Z", materialCode: "MAT-01", materialDescription: "Concrete", receivedQuantity: "5.000", rejectedQuantity: "0.000", unitOfMeasure: "m3", inspectionNumber: "QI-STALE", ncrNumber: "NCR-STALE" },
    ];
    state.build.mockClear();
    render(<ProjectGoodsReceipts tenantId="tenant-1" projectId="project-1" />);
    fireEvent.click(screen.getByRole("button", { name: "Export to Excel" }));
    await vi.waitFor(() => expect(state.build).toHaveBeenCalledTimes(1), { timeout: 5000 });
    const call = state.build.mock.calls[0][0] as { rows: unknown[]; columns: Array<{ header: string; value: (row: unknown) => unknown }> };
    const cell = (header: string, index: number) => call.columns.find(column => column.header === header)!.value(call.rows[index]);
    expect([cell("Accepted", 0), cell("Rejected", 0), cell("Accepted", 1)]).toEqual([8, 2, 5]);
    expect(cell("GRN number", 0)).toBe("GRN-01");
    expect([cell("Quality inspection", 0), cell("NCR", 0)]).toEqual(["QI-1", "NCR-1"]);
    expect([cell("Quality inspection", 1), cell("NCR", 1)]).toEqual(["", ""]); // a receipt with nothing rejected carries no inspection or NCR, as the screen shows
  });
  it("no receipts, no export button", () => { render(<ProjectGoodsReceipts tenantId="tenant-1" projectId="project-1" />); expect(screen.queryByRole("button", { name: "Export to Excel" })).toBeNull(); });
});

describe("ProjectGoodsReceipts form checks itself in the page's language (D-64)", () => {
  it("an empty receipt records nothing and says so in Arabic under its first field", () => {
    cleanup(); state.arabic = true; state.create.mockReset();
    render(<ProjectGoodsReceipts tenantId="tenant-1" projectId="project-1" />);
    expectEmptySubmitRefused(document.querySelector("form")!, "ar", state.create);
    state.arabic = false;
  });
});
