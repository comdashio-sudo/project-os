import { describe, expect, it } from "vitest";
import { buildHitIndex, calibratedDimensions, entityAlerts, hitTest, normalizeRotation, wouldCreateCycle } from "./masterPlanTools";

const tree = (pairs: Array<[string, string | null]>) => new Map(pairs);

describe("parent tree (G-136)", () => {
  const parentOf = tree([["a", null], ["b", "a"], ["c", "b"], ["d", null]]);
  it("refuses a parent that is the entity itself or one of its own descendants", () => {
    expect(wouldCreateCycle(parentOf, "a", "a")).toBe(true);
    expect(wouldCreateCycle(parentOf, "a", "c")).toBe(true); // c descends from a
    expect(wouldCreateCycle(parentOf, "b", "c")).toBe(true);
  });
  it("accepts a root, a sibling branch and a re-parent that moves a subtree under another tree", () => {
    expect(wouldCreateCycle(parentOf, "c", null)).toBe(false);
    expect(wouldCreateCycle(parentOf, "c", "d")).toBe(false);
    expect(wouldCreateCycle(parentOf, "a", "d")).toBe(false);
    expect(wouldCreateCycle(parentOf, "d", "a")).toBe(false);
  });
  it("never extends data that already loops (a chain that does not end counts as a loop)", () => {
    const looped = tree([["x", "y"], ["y", "x"], ["z", null]]);
    expect(wouldCreateCycle(looped, "z", "x")).toBe(true);
  });
});

describe("calibration and rotation (G-135)", () => {
  it("turns map units into metres once the real size of the plan is known, and says nothing before", () => {
    expect(calibratedDimensions({ x: 10, y: 10, width: 25, height: 20 }, 400, 250)).toEqual({ widthMeters: 100, heightMeters: 50, areaSquareMeters: 5000 });
    expect(calibratedDimensions({ x: 0, y: 0, width: 25, height: 20 }, null, 250)).toBeNull();
    expect(calibratedDimensions({ x: 0, y: 0, width: 25, height: 20 }, 0, 0)).toBeNull();
  });
  it("keeps a rotation in (-180, 180] so equal turns read equal", () => {
    expect([270, -90, 360, 720, 181, -181, 180, 0.4].map(normalizeRotation)).toEqual([-90, -90, 0, 0, -179, 179, 180, 0]);
    expect(normalizeRotation(Number.NaN)).toBe(0);
  });
});

describe("canvas hit-testing (G-135)", () => {
  const entities = [
    { id: "big", geometry: { x: 0, y: 0, width: 50, height: 50 } },
    { id: "small", geometry: { x: 10, y: 10, width: 5, height: 5 } }, // drawn after "big": on top where they overlap
    { id: "far", geometry: { x: 90, y: 90, width: 10, height: 10 } },
  ];
  const index = buildHitIndex(entities);
  it("finds the topmost entity under the point and nothing on empty ground", () => {
    expect(hitTest(index, 12, 12)).toBe("small");
    expect(hitTest(index, 30, 30)).toBe("big");
    expect(hitTest(index, 95, 95)).toBe("far");
    expect(hitTest(index, 70, 70)).toBeNull();
    expect(hitTest(index, 100, 100)).toBe("far"); // the edge of the plan belongs to the last cell
  });
  it("agrees with a straight scan over thousands of entities", () => {
    const many = Array.from({ length: 4000 }, (_, i) => ({ id: `e${i}`, geometry: { x: (i * 7) % 95, y: (i * 13) % 95, width: 1 + (i % 4), height: 1 + (i % 3) } }));
    const big = buildHitIndex(many);
    for (const [x, y] of [[3, 4], [50, 50], [77.5, 12.25], [94, 94], [0, 0], [33.3, 66.6]]) {
      const scanned = [...many].reverse().find(({ geometry: g }) => x >= g.x && x <= g.x + g.width && y >= g.y && y <= g.y + g.height)?.id ?? null;
      expect(hitTest(big, x, y), `${x},${y}`).toBe(scanned);
    }
  });
});

describe("alerts on an entity (G-137)", () => {
  const now = new Date("2026-10-17T00:00:00Z");
  const base = { status: "in_progress", progressPercent: 40, plannedValue: 1000, actualValue: 900, wbsItemId: "w", activityId: "a" };
  it("says nothing about a healthy, linked entity", () => { expect(entityAlerts(base, { status: "in_progress", plannedFinishAt: "2026-11-01T00:00:00Z" }, now)).toEqual([]); });
  it("flags a blocked entity as critical", () => { expect(entityAlerts({ ...base, status: "blocked" }, null, now)).toEqual([{ code: "blocked", severity: "critical" }]); });
  it("flags an unfinished activity past its planned finish, warning at first and critical after two weeks", () => {
    expect(entityAlerts(base, { status: "in_progress", plannedFinishAt: "2026-10-10T00:00:00Z" }, now)).toEqual([{ code: "overdue", severity: "warning", days: 7 }]);
    expect(entityAlerts(base, { status: "in_progress", plannedFinishAt: "2026-09-01T00:00:00Z" }, now)[0]).toMatchObject({ code: "overdue", severity: "critical" });
    expect(entityAlerts({ ...base, status: "completed" }, { status: "completed", plannedFinishAt: "2026-09-01T00:00:00Z" }, now)).toEqual([]);
  });
  it("flags cost 10% or more over plan, critical from 25%", () => {
    expect(entityAlerts({ ...base, actualValue: 1100 }, null, now)).toEqual([{ code: "cost_over", severity: "warning", percent: 10 }]);
    expect(entityAlerts({ ...base, actualValue: 1300 }, null, now)[0]).toMatchObject({ severity: "critical", percent: 30 });
    expect(entityAlerts({ ...base, actualValue: 1099 }, null, now)).toEqual([]);
    expect(entityAlerts({ ...base, plannedValue: 0, actualValue: 5 }, null, now)).toEqual([]);
  });
  it("tells an entity with no WBS item and no activity that it is not linked", () => {
    expect(entityAlerts({ ...base, wbsItemId: null, activityId: null }, null, now)).toEqual([{ code: "unlinked", severity: "info" }]);
  });
});
