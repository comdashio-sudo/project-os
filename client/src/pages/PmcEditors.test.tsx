// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Work order 21: the PMC table editors (bulk units, weights to 100%, the click-to-update status matrix).
const h = vi.hoisted(() => ({
  canUpdate: true, canManage: true,
  structure: {
    blocks: [{ id: "b1", code: "B1", name: "Block 1", zoneCode: "Z1" }],
    models: [{ modelCode: "A", totalWeight: 100, activities: [{ id: "d1", code: "WALLS", name: "Walls", weightPercent: 60 }, { id: "d2", code: "FINISH", name: "Finish", weightPercent: 40 }] }],
    unitCount: 2, highestUnitNumber: 2,
  },
  grid: { units: [{ id: "u1", unitNumber: 1, modelCode: "A" }], truncated: false, activities: [{ id: "d1", modelCode: "A", code: "WALLS", name: "Walls" }, { id: "d2", modelCode: "A", code: "FINISH", name: "Finish" }, { id: "d3", modelCode: "A", code: "ROOF", name: "Roof" }], cells: [{ unitId: "u1", activityDefinitionId: "d1", status: "IN_PROGRESS" }, { unitId: "u1", activityDefinitionId: "d3", status: "COMPLETE" }] },
  createUnits: vi.fn(), saveWeights: vi.fn(), setStatus: vi.fn(), createError: null as unknown, invalidated: [] as string[],
}));

vi.mock("@/contexts/LanguageContext", () => ({ useLanguage: () => ({ isArabic: false, language: "en", isRtl: false, setLanguage: vi.fn() }) }));
vi.mock("@/components/ds", async importOriginal => ({ ...(await importOriginal<typeof import("@/components/ds")>()), Select: (await import("../test/dsSelectStandIn")).NativeSelect }));
vi.mock("@/lib/permissions", () => ({ WriteGate: ({ children, permission }: { children: React.ReactNode; permission: string }) => (permission === "project.pmc.manage" && !h.canManage ? null : <>{children}</>), useCan: () => h.canUpdate }));
vi.mock("@/lib/trpc", () => ({
  trpc: {
    useUtils: () => ({ pmc: Object.fromEntries(["structure", "statusGrid", "progress"].map(name => [name, { invalidate: () => { h.invalidated.push(name); } }])) }),
    pmc: {
      structure: { useQuery: () => ({ data: h.structure, error: null, refetch: vi.fn() }) },
      statusGrid: { useQuery: (_input: unknown, options: { enabled: boolean }) => ({ data: options.enabled ? h.grid : undefined, error: null, refetch: vi.fn() }) },
      createUnits: { useMutation: () => ({ mutate: h.createUnits, isPending: false, error: h.createError, data: undefined }) },
      saveActivityWeights: { useMutation: (config: { onSuccess: () => void }) => ({ mutate: (input: unknown) => { h.saveWeights(input); config.onSuccess(); }, isPending: false, error: null, isSuccess: false }) },
      setUnitActivityStatus: { useMutation: () => ({ mutate: h.setStatus, isPending: false, error: null }) },
    },
  },
}));

import { PmcEditors } from "./PmcEditors";

beforeEach(() => { h.canUpdate = true; h.canManage = true; h.createError = null; h.invalidated = []; h.createUnits.mockReset(); h.saveWeights.mockReset(); h.setStatus.mockReset(); });
afterEach(() => cleanup());

describe("PmcEditors", () => {
  it("creates a run of units in one block and one model, starting after the highest number", () => {
    render(<PmcEditors tenantId="t" projectId="p" />);
    const units = screen.getByRole("region", { name: "Create units in bulk" });
    expect((units.querySelector('input[type="number"]') as HTMLInputElement).value).toBe("3");
    fireEvent.change(screen.getAllByLabelText(/^Block/)[0], { target: { value: "b1" } });
    fireEvent.change(screen.getAllByLabelText(/^Model/)[0], { target: { value: "A" } });
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
    expect(h.invalidated.sort()).toEqual(["progress", "statusGrid", "structure"]); // #244: the three readings are stale after a write
  });

  it("Q-3: off 100% the difference is shown, and «distribute proportionally» scales every weight to total exactly 100%", () => {
    render(<PmcEditors tenantId="t" projectId="p" />);
    expect(screen.queryByRole("button", { name: "Distribute proportionally to 100%" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Weight %: WALLS"), { target: { value: "30" } });
    fireEvent.change(screen.getByLabelText("Weight %: FINISH"), { target: { value: "20" } });
    expect(document.querySelector("[data-weight-difference]")!.textContent).toContain("50.00%");
    fireEvent.click(screen.getByRole("button", { name: "Distribute proportionally to 100%" }));
    expect((screen.getByLabelText("Weight %: WALLS") as HTMLInputElement).value).toBe("60");
    expect((screen.getByLabelText("Weight %: FINISH") as HTMLInputElement).value).toBe("40");
    expect((screen.getByRole("button", { name: "Save the weights" }) as HTMLButtonElement).disabled).toBe(false);
    expect(document.querySelector("[data-weight-difference]")).toBeNull();
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

// review of #252: the error exactly as the server sends it — the translated sentence in `message`, the code and the three languages in data.projectError
const refusal = (code: string) => Object.assign(new Error(`English sentence for ${code}`), { data: { code: "BAD_REQUEST", projectError: { code, messages: { ar: `sentence for ${code}`, en: `sentence for ${code}`, ur: `sentence for ${code}` } } } });
describe("PmcEditors — refusals beside their field (D-74)", () => {
  const described = (label: RegExp) => { const field = screen.getAllByLabelText(label)[0]!; return document.getElementById((field.getAttribute("aria-describedby") ?? "").split(" ").pop() ?? "")?.textContent ?? null; };
  it.each([
    ["PROJECT_OS_PMC_UNITS_EXIST", /^From number/],
    ["PROJECT_OS_PMC_UNIT_RANGE_INVALID", /^To number/],
    ["PROJECT_OS_PMC_BLOCK_NOT_FOUND", /^Block/],
  ] as const)("%s is said under its field, with the focus on it", (code, label) => {
    h.createError = refusal(code);
    render(<PmcEditors tenantId="t" projectId="p" />);
    expect(described(label)).toBe(`sentence for ${code}`);
    expect(document.activeElement).toBe(screen.getAllByLabelText(label)[0]);
    expect(screen.getAllByText(`sentence for ${code}`)).toHaveLength(1); // under the field only, not repeated under the form
  });

  it("a refusal tied to no field is said once under the form", () => {
    h.createError = refusal("PROJECT_OS_PERMISSION_DENIED");
    render(<PmcEditors tenantId="t" projectId="p" />);
    expect(screen.getAllByText("sentence for PROJECT_OS_PERMISSION_DENIED")).toHaveLength(1);
  });
});

describe("PmcEditors — wide tables (review of #252)", () => {
  it("the weights and the status matrix each sit in the scrolling frame that says when it scrolls", async () => {
    render(<PmcEditors tenantId="t" projectId="p" />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Show" })); });
    for (const name of ["Activity weights", "Status matrix"]) expect(screen.getAllByRole("region", { name }).some(region => Boolean(region.closest("[data-table-scroll]")))).toBe(true);
  });
});

describe("PmcEditors — review of #252", () => {
  it("a complete cell is the last step: one click cannot send it back to not started", async () => {
    render(<PmcEditors tenantId="t" projectId="p" />);
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Show" })); });
    const done = screen.getByRole("button", { name: "Unit 1 · Roof: Complete" }) as HTMLButtonElement;
    expect(done.disabled).toBe(true);
    fireEvent.click(done);
    expect(h.setStatus).not.toHaveBeenCalled();
  });

  it("without project.pmc.manage the units and weights editors are not drawn; the matrix still is", () => {
    h.canManage = false;
    render(<PmcEditors tenantId="t" projectId="p" />);
    expect(screen.queryByRole("region", { name: "Create units in bulk" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Save the weights" })).toBeNull();
    expect(screen.getByRole("button", { name: "Show" })).toBeTruthy();
  });
});
