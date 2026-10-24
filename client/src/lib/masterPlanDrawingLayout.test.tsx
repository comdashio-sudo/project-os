import { describe, expect, it } from "vitest";
import type { ReviewItem } from "./dxf/dxfReview";
import type { DxfDrawing } from "./dxf/dxfReader";
import { latestVersionId, layoutToReview, linkChanges, polygonsToSave, type SavedLayout } from "./masterPlanDrawingLayout";

// Work order 16, item 6 (G-189): the saved drawing as the review editor reads it, and the changes that bring the server to the screen. Synthetic data only.
const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }];
const units = [{ id: "unit-1", code: "B1-U-0001" }, { id: "unit-2", code: "B1-U-0002" }];
const layout: SavedLayout = {
  drawingId: "drawing-1",
  latestVersion: null,
  versions: [],
  polygons: [{ id: "srv-1", ref: "P1", label: "B1", points: square }, { id: "srv-2", ref: "P2", label: "", points: square }],
  links: [{ polygonId: "srv-1", entityId: "unit-1" }],
};

describe("the newest version a drawing is kept under", () => {
  it("is the newest version of the newest plan, and null without a plan", () => {
    const data = { plans: [{ id: "plan-2" }, { id: "plan-1" }], versions: [{ id: "v-1", masterPlanId: "plan-1", versionNumber: 3 }, { id: "v-2", masterPlanId: "plan-2", versionNumber: 1 }, { id: "v-3", masterPlanId: "plan-2", versionNumber: 2 }] };
    expect(latestVersionId(data)).toBe("v-3");
    expect(latestVersionId({ plans: [], versions: [] })).toBeNull();
    expect(latestVersionId(undefined)).toBeNull();
  });
});

describe("a saved layout on the review screen", () => {
  it("shows the saved links as confirmed and every other shape as unlinked, keyed by the reader's reference", () => {
    const { drawing, items } = layoutToReview(layout, units);
    expect(drawing.polygons.map(polygon => polygon.id)).toEqual(["P1", "P2"]);
    expect(items).toEqual([
      { polygonId: "P1", layer: "B1", unitId: "unit-1", unitCode: "B1-U-0001", state: "confirmed", reason: null, candidateUnitIds: [] },
      { polygonId: "P2", layer: "", unitId: null, unitCode: null, state: "unlinked", reason: null, candidateUnitIds: [] },
    ]);
  });

  it("does not confirm a link to a unit that is no longer in the plan", () => {
    const { items } = layoutToReview(layout, [{ id: "unit-2", code: "B1-U-0002" }]);
    expect(items[0]).toMatchObject({ state: "unlinked", unitId: null });
  });
});

describe("what is saved from the screen", () => {
  const drawing: DxfDrawing = { layers: ["B1"], polygons: [{ id: "P1", layer: "B1", points: square, source: "lines" }, { id: "P9", layer: "x".repeat(130), points: square, source: "lines" }], texts: [], warnings: [], ignoredEntities: {} };

  it("sends every shape, with the server id of a shape saved before, and cuts a long label", () => {
    const polygons = polygonsToSave(drawing, new Map([["P1", "srv-1"]]));
    expect(polygons[0]).toEqual({ id: "srv-1", ref: "P1", label: "B1", points: square });
    expect(polygons[1]).not.toHaveProperty("id");
    expect(polygons[1].label).toHaveLength(120);
  });

  const confirmed = (polygonId: string, unitId: string): ReviewItem => ({ polygonId, layer: "", unitId, unitCode: null, state: "confirmed", reason: null, candidateUnitIds: [] });
  const proposed = (polygonId: string, unitId: string): ReviewItem => ({ ...confirmed(polygonId, unitId), state: "proposed" });
  const savedIds = new Map([["P1", "srv-1"], ["P2", "srv-2"]]);
  const refs = new Map([["srv-1", "P1"], ["srv-2", "P2"]]);

  it("links only what is confirmed, and leaves a proposal out", () => {
    expect(linkChanges([confirmed("P2", "unit-2"), proposed("P1", "unit-1")], refs, [], savedIds)).toEqual({ unlink: [], link: [{ polygonId: "srv-2", entityId: "unit-2" }] });
  });

  it("unlinks a link that was cleared or moved before it links the unit to its new shape", () => {
    const saved = [{ polygonId: "srv-1", entityId: "unit-1" }];
    expect(linkChanges([confirmed("P1", "unit-1")], refs, saved, savedIds)).toEqual({ unlink: [], link: [] });
    expect(linkChanges([], refs, saved, savedIds)).toEqual({ unlink: ["srv-1"], link: [] });
    expect(linkChanges([confirmed("P2", "unit-1")], refs, saved, savedIds)).toEqual({ unlink: ["srv-1"], link: [{ polygonId: "srv-2", entityId: "unit-1" }] });
  });
});
