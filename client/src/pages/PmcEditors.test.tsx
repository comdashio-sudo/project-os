// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Work order 21: the PMC table editors (bulk units, weights to 100%, the click-to-update status matrix).
const h = vi.hoisted(() => ({
  canUpdate: true,
  structure: {
    blocks: [{ id: "b1", code: "B1", name: "Block 1", zoneCode: "Z1" }],
    models: [{ modelCode: "A", totalWeight: 100, activities: [{ id: "d1", code: "WALLS", name: "Walls", weightPercent: 60 }, { id: "d2", code: "FINISH", name: "Finish", weightPercent: 40 }] }],
    unitCount: 2, highestUnitNumber: 2,
  },
  grid: { units: [{ id: "u1", unitNumber: 1, modelCode: "A" }], truncated: false, activities: [{ id: "d1", modelCode: "A", code: "WALLS", name: "Walls" }, { id: "d2", modelCode: "A", code: "FINISH", name: "Finish" }], cells: [{ unitId: "u1", activityDefinitionId: "d1", status: "IN_PROGRESS" }] },
  createUnits: vi.fn(), saveWeights: vi.fn(), setStatus: vi.fn(),
}));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: (await import("../test/dsSelectStandIn")).NativeSelect }));
vi.mock("@/lib/permissions", () => ({ WriteGate: ({ children }: { children: React.ReactNode }) => <>{children}</>, useCan: () => h.canUpdate }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    pmc: {
      structure: { useQuery: () => ({ data: h.structure, error: null, refetch: vi.fn() }) },
      statusGrid: { useQuery: (_input: unknown, options: { enabled: boolean }) => ({ data: options.enabled ? h.grid : undefined, error: null, refetch: vi.fn() }) },
      createUnits: { useMutation: () => ({ mutate: h.createUnits, isPending: false, error: null, data: undefined }) },
      saveActivityWeights: { useMutation: () => ({ mutate: h.saveWeights, isPending: false, error: null, isSuccess: false }) },
      setUnitActivityStatus: { useMutation: () => ({ mutate: h.setStatus, isPending: false, error: null }) },
    },
  },
}));

import { PmcEditors } from "./PmcEditors";

beforeEach(() => { h.canUpdate = true; h.createUnits.mockReset(); h.saveWeights.mockReset(); h.setStatus.mockReset(); });
afterEach(() => cleanup());

describe("PmcEditors", () => {
  it("creates a run of units in one block and one model, starting after the highest number", () => {
    render(<PmcEditors tenantId="t" projectId="p" />);
    const units = screen.getByRole("region", { name: "Create units in bulk" });
    expect((units.querySelector('input[type="number"]') as HTMLInputElement).value).toBe("3");
    fireEvent.change(screen.getAllByLabelText("Block")[0], { target: { value: "b1" } });
    fireEvent.change(screen.getAllByLabelText("Model")[0], { target: { value: "A" } });
    fireEvent.click(screen.getByRole("button", { name: /Create the units · 10 units/ }));
    expect(h.createUnits).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", blockId: "b1", modelCode: "A", from: 3, to: 12 });
  });

  it("the weights counter must read exactly 100% before they can be saved", () => {
    render(<PmcEditors tenantId="t" projectId="p" />);
    const save = screen.getByRole("button", { name: "Save the weights" }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("Weight %: WALLS"), { target: { value: "70" } });
    expect(document.querySelector("[data-weight-total]")!.textContent).toContain("110.00%");
    expect(save.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Weight %: FINISH"), { target: { value: "30" } });
    expect(save.disabled).toBe(false);
    fireEvent.click(save);
    expect(h.saveWeights).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", modelCode: "A", weights: [{ activityDefinitionId: "d1", weightPercent: 70 }, { activityDefinitionId: "d2", weightPercent: 30 }] });
  });

  it("a click on a matrix cell moves it to its next status through the one status write", async () => {
    render(<PmcEditors tenantId="t" projectId="p" />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Show" })); });
    fireEvent.click(screen.getByRole("button", { name: "Unit 1 · Walls: In progress, click to make it Under review" }));
    expect(h.setStatus).toHaveBeenCalledWith({ tenantId: "t", projectId: "p", unitId: "u1", activityDefinitionId: "d1", status: "UNDER_REVIEW" });
    fireEvent.click(screen.getByRole("button", { name: "Unit 1 · Finish: Not started, click to make it In progress" }));
    expect(h.setStatus).toHaveBeenLastCalledWith(expect.objectContaining({ activityDefinitionId: "d2", status: "IN_PROGRESS" }));
  });

  it("a role without the update permission sees the matrix but cannot click it", async () => {
    h.canUpdate = false;
    render(<PmcEditors tenantId="t" projectId="p" />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Show" })); });
    expect(screen.getByText("View only: you cannot update the status.")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Unit 1 · Walls/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});
