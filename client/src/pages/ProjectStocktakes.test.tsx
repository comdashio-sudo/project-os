/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectStocktakes } from "./ProjectStocktakes";

const WH = "11111111-1111-4111-8111-111111111111";
const ST = "66666666-6666-4666-8666-666666666666";
const L1 = "77777777-7777-4777-8777-777777777777";
const L2 = "88888888-8888-4888-8888-888888888888";
const state = vi.hoisted(() => ({
  allowed: true, status: "counting" as "counting" | "approved", error: null as unknown,
  open: vi.fn(), count: vi.fn(), approve: vi.fn(), listRefetch: vi.fn(), getRefetch: vi.fn(), getEnabled: [] as boolean[],
}));
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: (await import("../test/dsSelectStandIn")).NativeSelect }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Approved by the same person who opened it" }));
vi.mock("@/lib/permissions", () => ({ useCan: () => state.allowed, usePermissionsLoading: () => false, WriteGate: ({ children, reason }: { children: React.ReactNode; reason: { en: string } }) => state.allowed ? <>{children}</> : <p role="note">{reason.en}</p> }));
vi.mock("@/lib/trpc", () => ({ trpc: { stocktakes: {
  list: { useQuery: () => ({ isLoading: false, refetch: state.listRefetch, data: [{ id: ST, stocktakeNumber: "ST-001", warehouseId: WH, status: state.status, createdAt: new Date("2026-11-01T08:00:00Z"), approvedAt: null }] }) },
  get: { useQuery: (_input: unknown, options: { enabled: boolean }) => { state.getEnabled.push(options.enabled); return options.enabled ? { isLoading: false, refetch: state.getRefetch, data: { id: ST, stocktakeNumber: "ST-001", warehouseId: WH, status: state.status, lines: [
    { id: L1, materialId: "m1", code: "MAT-01", description: "Cement bag", unitOfMeasure: "bag", systemQuantity: 10, countedQuantity: null, variance: null },
    { id: L2, materialId: "m2", code: "MAT-02", description: "Rebar", unitOfMeasure: "t", systemQuantity: 4, countedQuantity: 4, variance: 0 },
  ] } } : { isLoading: false, data: undefined, refetch: vi.fn() }; } },
  open: { useMutation: () => ({ mutate: state.open, isPending: false, error: null }) },
  count: { useMutation: () => ({ mutate: state.count, isPending: false, error: null }) },
  approve: { useMutation: () => ({ mutate: state.approve, isPending: false, error: state.error }) },
} } }));

const warehouses = [{ id: WH, code: "WH-01", name: "Main store", active: true }];

describe("ProjectStocktakes (D-32)", () => {
  beforeEach(() => { cleanup(); state.allowed = true; state.status = "counting"; state.error = null; state.open.mockReset(); state.count.mockReset(); state.approve.mockReset(); state.getEnabled = []; });

  it("opens a count of a chosen warehouse with its number", async () => {
    const user = userEvent.setup(); render(<ProjectStocktakes tenantId="tenant-1" projectId="project-1" warehouses={warehouses} />);
    await user.selectOptions(screen.getByLabelText("Warehouse"), WH); await user.type(screen.getByLabelText("Stocktake number"), "ST-002");
    await user.click(screen.getByRole("button", { name: "Open stocktake" }));
    expect(state.open).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1", warehouseId: WH, stocktakeNumber: "ST-002", note: undefined });
  });

  it("NEGATIVE: an empty open form sends nothing", async () => {
    const user = userEvent.setup(); render(<ProjectStocktakes tenantId="tenant-1" projectId="project-1" warehouses={warehouses} />);
    await user.click(screen.getByRole("button", { name: "Open stocktake" }));
    expect(state.open).not.toHaveBeenCalled();
  });

  it("reads a stocktake only once one is chosen, then sends only the counts that changed", async () => {
    const user = userEvent.setup(); render(<ProjectStocktakes tenantId="tenant-1" projectId="project-1" warehouses={warehouses} />);
    expect(state.getEnabled.every(enabled => !enabled)).toBe(true);
    expect(screen.queryByLabelText(/Counted/)).toBeNull();
    await user.click(screen.getByRole("button", { name: /Show/ }));
    expect(screen.getByText("10.000").getAttribute("dir")).toBe("ltr");
    expect((screen.getByRole("button", { name: "Save counts" }) as HTMLButtonElement).disabled).toBe(true);
    await user.type(screen.getByLabelText(/Counted MAT-01/), "9.5");
    await user.click(screen.getByRole("button", { name: "Save counts" }));
    expect(state.count).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1", stocktakeId: ST, counts: [{ lineId: L1, countedQuantity: 9.5 }] });
  });

  it("approves with a reason; NEGATIVE: no reason sends nothing, and the server's refusal is shown", async () => {
    const user = userEvent.setup(); const { rerender } = render(<ProjectStocktakes tenantId="tenant-1" projectId="project-1" warehouses={warehouses} />);
    await user.click(screen.getByRole("button", { name: /Show/ }));
    await user.click(screen.getByRole("button", { name: "Approve and post differences" }));
    expect(state.approve).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Approval reason"), "Monthly count");
    await user.click(screen.getByRole("button", { name: "Approve and post differences" }));
    expect(state.approve).toHaveBeenCalledWith({ tenantId: "tenant-1", projectId: "project-1", stocktakeId: ST, reason: "Monthly count" });
    state.error = { message: "PROJECT_OS_STOCKTAKE_SAME_APPROVER" };
    rerender(<ProjectStocktakes tenantId="tenant-1" projectId="project-1" warehouses={warehouses} />);
    expect(screen.getByRole("alert").textContent).toBe("Approved by the same person who opened it");
  });

  it("an approved stocktake shows its counts and offers no input", async () => {
    state.status = "approved"; const user = userEvent.setup(); render(<ProjectStocktakes tenantId="tenant-1" projectId="project-1" warehouses={warehouses} />);
    await user.click(screen.getByRole("button", { name: /Show/ }));
    expect(screen.queryByRole("button", { name: "Save counts" })).toBeNull();
    expect(screen.getByText(/cannot be changed/)).toBeTruthy();
  });

  it("NEGATIVE: without project.inventory.manage: no stocktake is read (G-212) and the section says why in one line", () => {
    state.allowed = false; state.getEnabled = []; render(<ProjectStocktakes tenantId="tenant-1" projectId="project-1" warehouses={warehouses} />);
    expect(screen.queryByRole("button", { name: "Open stocktake" })).toBeNull();
    expect(screen.queryByRole("button", { name: /Show/ })).toBeNull();
    expect(screen.getByRole("note").textContent).toMatch(/manage inventory/);
  });
});
