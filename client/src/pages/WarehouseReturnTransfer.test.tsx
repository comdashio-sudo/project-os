/** @vitest-environment jsdom */
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WarehouseReturnTransfer } from "./WarehouseReturnTransfer";
import { TYPING_TEST } from "@/test/typing";

// Q-41 (adviser 18-11): «إرجاع» on an issue line and «تحويل إلى مشروع آخر», on the server procedures that already exist. The server decides; these check
// what the screen sends, that it shows only to whoever manages stock (negative: nothing drawn, no read made), and that no money is on it.
const ISSUE = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const WH = "11111111-1111-4111-8111-111111111111";
const MAT = "22222222-2222-4222-8222-222222222222";
const P2 = "33333333-3333-4333-8333-333333333333";
const WH2 = "44444444-4444-4444-8444-444444444444";
const state = vi.hoisted(() => ({ allowed: true, giveBack: vi.fn(), transfer: vi.fn(), reads: [] as string[], targets: [] as unknown[] }));
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: (await import("../test/dsSelectStandIn")).NativeSelect }));
vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false }) }));
vi.mock("@/lib/projectErrors", () => ({ getLocalizedProjectError: () => "Localized error" }));
vi.mock("@/lib/permissions", () => ({ useCan: () => state.allowed }));
vi.mock("@/lib/trpc", () => ({ trpc: { warehouses: {
  returnableIssues: { useQuery: (_: unknown, options: { enabled: boolean }) => { if (options.enabled) state.reads.push("returnableIssues"); return { data: options.enabled ? [{ id: ISSUE, issuedAt: new Date("2026-11-10T08:00:00Z"), issuedQuantity: 10, returnable: 6, material: { id: MAT, code: "CEM-1", description: "Cement", unit: "bag" } }] : undefined, refetch: vi.fn() }; } },
  transferTargets: { useQuery: (_: unknown, options: { enabled: boolean }) => { if (options.enabled) state.reads.push("transferTargets"); return { data: options.enabled ? state.targets : undefined }; } },
  returnToWarehouse: { useMutation: () => ({ mutate: state.giveBack, isPending: false, error: null }) },
  transferBetweenProjects: { useMutation: () => ({ mutate: state.transfer, isPending: false, error: null }) },
} } }));

const view = () => render(<WarehouseReturnTransfer tenantId="tenant-1" projectId="project-1" warehouses={[{ id: WH, code: "WH-A", name: "Store A", active: true }]} materials={[{ id: MAT, code: "CEM-1", description: "Cement" }]} onMoved={vi.fn()} />);

describe("Q-41: return and transfer to another project on the warehouse page", TYPING_TEST, () => {
  beforeEach(() => { cleanup(); state.allowed = true; state.giveBack.mockReset(); state.transfer.mockReset(); state.reads = []; state.targets = [{ id: P2, code: "P-2", name: "Villas two", warehouses: [{ id: WH2, code: "WH-2", name: "Store two" }] }]; });

  it("returns a quantity of an issue line, with its reason", async () => {
    const user = userEvent.setup(); view();
    await user.selectOptions(screen.getByLabelText("Issue line"), ISSUE);
    await user.type(screen.getByLabelText("Quantity", { selector: "#return-quantity" }), "4");
    await user.type(screen.getByLabelText("Reason", { selector: "#return-reason" }), "Over-issued");
    await user.click(screen.getByRole("button", { name: "Return" }));
    expect(state.giveBack).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", projectId: "project-1", materialIssueId: ISSUE, quantity: 4, reason: "Over-issued" }));
  });

  it("transfers to a warehouse of another project the person also manages", async () => {
    const user = userEvent.setup(); view();
    await user.selectOptions(screen.getByLabelText("From warehouse"), WH);
    await user.selectOptions(screen.getByLabelText("Material", { selector: "#transfer-material" }), MAT);
    await user.selectOptions(screen.getByLabelText("To project"), P2);
    await user.selectOptions(screen.getByLabelText("To warehouse"), WH2);
    await user.type(screen.getByLabelText("Quantity", { selector: "#transfer-quantity" }), "5");
    await user.type(screen.getByLabelText("Reason", { selector: "#transfer-reason" }), "Project two needs cement");
    await user.click(screen.getByRole("button", { name: "Transfer" }));
    expect(state.transfer).toHaveBeenCalledWith(expect.objectContaining({ tenantId: "tenant-1", sourceProjectId: "project-1", sourceWarehouseId: WH, destinationProjectId: P2, destinationWarehouseId: WH2, materialId: MAT, quantity: 5, reason: "Project two needs cement" }));
  });

  it("NEGATIVE: without a reason nothing is sent; with no other project it says so instead of a form", async () => {
    const user = userEvent.setup(); view();
    await user.selectOptions(screen.getByLabelText("Issue line"), ISSUE);
    await user.type(screen.getByLabelText("Quantity", { selector: "#return-quantity" }), "1");
    await user.click(screen.getByRole("button", { name: "Return" }));
    expect(state.giveBack).not.toHaveBeenCalled();
    cleanup(); state.targets = []; view();
    expect(screen.getByText(/You manage stock on no other project/)).toBeTruthy();
    expect(screen.queryByLabelText("To project")).toBeNull();
  });

  it("NEGATIVE: whoever does not manage stock sees nothing and makes no read; and no money is on the screen", () => {
    view();
    expect(document.body.textContent).not.toMatch(/cost|SAR|price|amount/i);
    cleanup(); state.allowed = false; state.reads = []; const { container } = view();
    expect(container.textContent).toBe("");
    expect(state.reads).toEqual([]);
  });
});
