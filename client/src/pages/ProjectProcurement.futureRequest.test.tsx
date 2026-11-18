/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProjectProcurement } from "./ProjectProcurement";

// Q-42 (adviser 18-11): the request form offers a warehouse and a subcontract and no date before the site's today; each request shows how soon it is due;
// the requester submits or cancels their own request (procurement keeps its own buttons); the warehouse keeper sees what is approved and due within 7 days,
// beside what is on the shelf. No stock is taken by any of it.
const W = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"; const S = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"; const M = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const row = (id: string, status: string, dueState: string | null, createdByUserId = 7, extra: Record<string, unknown> = {}) => ({ id, requisitionNumber: id.toUpperCase(), description: "Synthetic cement", requestedQuantity: "500", unitOfMeasure: "bag", requiredAt: new Date("2026-11-22T00:00:00Z"), status, issuedQuantity: 0, remainingQuantity: 500, wbs: null, activity: null, purchaseOrder: null, createdByUserId, dueState, warehouse: null, subcontract: null, warehouseId: null, materialId: M, material: { id: M, code: "CEM", description: "Cement" }, ...extra });
const state = vi.hoisted(() => ({ perms: [] as string[], requisitions: [] as unknown[], requisition: vi.fn(), transition: vi.fn() }));
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: (await import("../test/dsSelectStandIn")).NativeSelect }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false }) }));
vi.mock("@/_core/hooks/useAuth", () => ({ useAuth: () => ({ user: { id: 7 } }) }));
vi.mock("@/lib/permissions", () => {
  const holds = (permission: string | readonly string[]) => (Array.isArray(permission) ? permission : [permission]).some(code => state.perms.includes(code as string));
  return { useCan: holds, WriteGate: ({ permission, children }: { permission: string | readonly string[]; children: React.ReactNode }) => (holds(permission) ? <>{children}</> : null) };
});
vi.mock("@/lib/trpc", () => ({ trpc: {
  warehouses: { list: { useQuery: () => ({ data: { warehouses: [{ id: W, code: "WH-1", name: "Main store", active: true }], balances: [{ warehouseId: W, materialId: M, quantityOnHand: "100.000" }] } }) } },
  subcontracts: { list: { useQuery: () => ({ data: [{ id: S, code: "SUB-1", subcontractorName: "Synthetic Builders" }] }) } },
  procurement: { register: { useQuery: () => ({ isLoading: false, refetch: vi.fn(), data: { suppliers: [], wbsItems: [], activities: [], purchaseOrders: [], requisitions: state.requisitions } }) }, createSupplier: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) }, createRequisition: { useMutation: () => ({ mutate: state.requisition, isPending: false, error: null }) }, transitionRequisition: { useMutation: () => ({ mutate: state.transition, isPending: false, error: null }) }, linkPurchaseOrder: { useMutation: () => ({ mutate: vi.fn(), isPending: false, error: null }) } },
  materials: { list: { useQuery: () => ({ isLoading: false, data: [{ id: M, code: "CEM", description: "Cement", unitOfMeasure: "bag" }] }) } },
} }));
afterEach(() => { cleanup(); state.requisition.mockReset(); state.transition.mockReset(); state.perms = []; state.requisitions = []; });
const siteToday = () => new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);

describe("ProjectProcurement: future material request (Q-42)", () => {
  it("the form offers no date before the site's today, says no stock moves, and sends the warehouse and subcontract", async () => {
    state.perms = ["project.material.request"];
    const user = userEvent.setup({ delay: null });
    render(<ProjectProcurement tenantId="t-1" projectId="p-1" />);
    const date = screen.getByLabelText("Required by") as HTMLInputElement;
    expect([date.min, date.value]).toEqual([siteToday(), siteToday()]);
    expect(document.querySelector("[data-future-note]")?.textContent).toMatch(/takes nothing from stock/);
    await user.type(screen.getByLabelText("Request number"), "MR-1"); await user.type(screen.getByLabelText("Description"), "Cement for the slab"); await user.type(screen.getByLabelText("Quantity"), "500");
    await user.selectOptions(screen.getByLabelText("Material"), M); await user.selectOptions(screen.getByLabelText("Warehouse to issue from"), W); await user.selectOptions(screen.getByLabelText("For subcontract"), S);
    await user.click(screen.getByRole("button", { name: "Create request" }));
    expect(state.requisition).toHaveBeenCalledWith(expect.objectContaining({ requisitionNumber: "MR-1", warehouseId: W, subcontractId: S, requestedQuantity: 500 }));
  });

  it("shows each request's due state, its warehouse and its subcontract", () => {
    state.perms = ["project.material.request"];
    state.requisitions = [row("r-late", "approved", "overdue"), row("r-soon", "draft", "due_soon", 7, { warehouse: { code: "WH-1" }, subcontract: { code: "SUB-1", subcontractorName: "Synthetic Builders" } }), row("r-later", "draft", "later"), row("r-done", "closed", null)];
    render(<ProjectProcurement tenantId="t-1" projectId="p-1" />);
    expect(Array.from(document.querySelectorAll("[data-due-state]")).map(node => [node.getAttribute("data-due-state"), node.textContent])).toEqual([["overdue", "Overdue"], ["due_soon", "Due within 7 days"], ["later", "Later"]]);
    expect(screen.getByText(/Warehouse to issue from: WH-1 · For subcontract: SUB-1 · Synthetic Builders/)).toBeTruthy();
  });

  it("the requester submits or cancels THEIR OWN request; a request of someone else offers nothing", async () => {
    state.perms = ["project.material.request"];
    state.requisitions = [row("r-mine", "draft", "due_soon", 7), row("r-sent", "submitted", "due_soon", 7), row("r-theirs", "draft", "due_soon", 99)];
    render(<ProjectProcurement tenantId="t-1" projectId="p-1" />);
    const own = (id: string) => document.querySelector<HTMLElement>(`[data-own-request-actions="${id}"]`);
    expect(within(own("r-mine")!).getAllByRole("button").map(button => button.textContent)).toEqual(["Submit", "Cancel"]);
    expect(within(own("r-sent")!).getAllByRole("button").map(button => button.textContent)).toEqual(["Cancel"]);
    expect(own("r-theirs")).toBeNull();
    await userEvent.setup().click(within(own("r-mine")!).getByRole("button", { name: "Submit" }));
    expect(state.transition).toHaveBeenCalledWith({ tenantId: "t-1", projectId: "p-1", requisitionId: "r-mine", nextStatus: "submitted" });
  });

  it("procurement keeps its own buttons and gets no duplicate requester buttons", () => {
    state.perms = ["project.procurement.manage"];
    state.requisitions = [row("r-mine", "draft", "due_soon", 7)];
    render(<ProjectProcurement tenantId="t-1" projectId="p-1" />);
    expect(document.querySelector('[data-own-request-actions="r-mine"]')).toBeNull();
    expect(screen.getAllByRole("button", { name: "Submit" })).toHaveLength(1);
  });

  it("the warehouse keeper sees approved requests due within 7 days beside the shelf; others do not see the section", () => {
    state.requisitions = [row("r-soon", "approved", "due_soon", 99, { warehouseId: W }), row("r-draft", "draft", "due_soon"), row("r-later", "approved", "later")];
    state.perms = ["project.inventory.manage"];
    render(<ProjectProcurement tenantId="t-1" projectId="p-1" />);
    const rows = Array.from(document.querySelectorAll("[data-due-soon-row]")).map(node => node.getAttribute("data-due-soon-row"));
    expect(rows).toEqual(["r-soon"]);
    expect(document.querySelector('[data-due-soon-row="r-soon"]')?.textContent).toMatch(/Remaining: 500 bag · On the shelf now: 100/);
    cleanup(); state.perms = ["project.material.request"];
    render(<ProjectProcurement tenantId="t-1" projectId="p-1" />);
    expect(document.querySelector("[data-due-soon-section]")).toBeNull();
  });
});
