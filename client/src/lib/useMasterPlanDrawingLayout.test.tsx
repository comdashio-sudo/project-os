/** @vitest-environment jsdom */
// Synthetic layout only. Q-8: a shape that leaves the drawing loses its saved link BEFORE the shapes are replaced (the server refuses to delete a linked shape).
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMasterPlanDrawingLayout } from "./useMasterPlanDrawingLayout";

const calls: string[] = [];
const current = {
  polygons: [{ id: "srv-old", ref: "M1", label: "MANUAL", points: [] }, { id: "srv-1", ref: "P1", label: "UNITS", points: [] }],
  links: [{ polygonId: "srv-old", entityId: "unit-1" }, { polygonId: "srv-1", entityId: "unit-2" }],
};
vi.mock("@/lib/useDirectUpload", () => ({ useDirectUpload: () => ({ upload: vi.fn(), busy: false }) }));
vi.mock("@/lib/trpc", () => {
  const mutation = (name: string, result: unknown = {}) => ({ useMutation: () => ({ mutateAsync: vi.fn(async (input: { polygonId?: string }) => { calls.push(input.polygonId ? `${name}:${input.polygonId}` : name); return result; }), isPending: false }) });
  return { trpc: {
    useUtils: () => ({ masterPlans: { drawingLayout: { fetch: vi.fn(async () => current), invalidate: vi.fn() } } }),
    masterPlans: {
      drawingLayout: { useQuery: () => ({ data: undefined, isLoading: false, error: null, refetch: vi.fn() }) },
      uploadDrawingVersion: mutation("upload"),
      saveDrawingLayout: mutation("saveLayout", { polygons: [{ id: "srv-1", ref: "P1" }] }),
      linkDrawingUnit: mutation("link"),
      unlinkDrawingUnit: mutation("unlink"),
      saveDrawingCalibration: mutation("calibrate"),
    },
  } };
});

describe("saving a drawing whose linked shape left it (Q-8)", () => {
  it("unlinks the leaving shape first, then replaces the shapes, and leaves the kept link alone", async () => {
    const { result } = renderHook(() => useMasterPlanDrawingLayout({ tenantId: "00000000-0000-4000-8000-000000000001", projectId: "00000000-0000-4000-8000-000000000002", masterPlanVersionId: "00000000-0000-4000-8000-000000000003", units: [{ id: "unit-1", code: "V-01" }, { id: "unit-2", code: "V-02" }] }));
    const drawing = { layers: ["UNITS"], polygons: [{ id: "P1", layer: "UNITS", points: [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }], source: "lwpolyline" as const }], texts: [], warnings: [], ignoredEntities: {} };
    const items = [{ polygonId: "P1", layer: "UNITS", unitId: "unit-2", unitCode: "V-02", state: "confirmed" as const, reason: null, candidateUnitIds: [] }];
    const outcome = await result.current.save({ file: null, drawing, items });
    expect(outcome).toEqual({ ok: true });
    expect(calls).toEqual(["unlink:srv-old", "saveLayout"]);
  });
});
