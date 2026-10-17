// Master Plan tools (work order 5, item 9; GAP_LIST G-135, G-136, G-137): the rules that need no database or browser, read by the server (cycle
// check) and by the screen (calibration, alerts, canvas hit-testing), so both sides use the same words and the same arithmetic.

export type PlanGeometry = { x: number; y: number; width: number; height: number };

// ---------------------------------------------------------------- G-136: the parent tree
/**
 * Would making `newParentId` the parent of `entityId` close a loop? Walks up from the new parent: reaching the entity (or the entity itself being
 * the new parent) is a loop. `parentOf` maps an entity to its parent (null = a root). A broken chain stops the walk; a chain that already loops
 * (bad data from an import) stops after `limit` steps and counts as a loop so it is never extended.
 */
export function wouldCreateCycle(parentOf: ReadonlyMap<string, string | null>, entityId: string, newParentId: string | null, limit = 10_000): boolean {
  if (newParentId === null) return false;
  let cursor: string | null = newParentId;
  for (let step = 0; cursor !== null && step < limit; step++) {
    if (cursor === entityId) return true;
    cursor = parentOf.get(cursor) ?? null;
  }
  return cursor !== null; // still walking after `limit` steps: a loop that is not through this entity, but a loop
}

// ---------------------------------------------------------------- G-135: calibration
/** The plan occupies 100 x 100 map units; the real size of the plan area (metres) turns an entity's units into metres. */
export function calibratedDimensions(geometry: PlanGeometry, mapWidthMeters: number | null | undefined, mapHeightMeters: number | null | undefined) {
  if (!mapWidthMeters || !mapHeightMeters || mapWidthMeters <= 0 || mapHeightMeters <= 0) return null;
  const width = (geometry.width / 100) * mapWidthMeters;
  const height = (geometry.height / 100) * mapHeightMeters;
  return { widthMeters: round(width), heightMeters: round(height), areaSquareMeters: round(width * height) };
}
const round = (value: number) => Math.round(value * 100) / 100;

/** The rotation of the plan underlay, kept in (-180, 180] so 270 and -90 are the same turn. */
export function normalizeRotation(degrees: number): number {
  if (!Number.isFinite(degrees)) return 0;
  let turn = ((Math.round(degrees) % 360) + 360) % 360;
  if (turn > 180) turn -= 360;
  return turn;
}

// ---------------------------------------------------------------- G-135: the canvas surface for large plans
/** Above this many visible entities the map is drawn on a canvas: a thousand-odd buttons is where the HTML surface stops being smooth. */
export const CANVAS_ENTITY_THRESHOLD = 1500;

export type HitEntity = { id: string; geometry: PlanGeometry };
/** A uniform grid over the 100 x 100 plan, so a click is tested against the few entities in its cell instead of all of them. */
export function buildHitIndex(entities: readonly HitEntity[], cells = 20) {
  const grid = new Map<number, HitEntity[]>();
  const clamp = (value: number) => Math.min(cells - 1, Math.max(0, Math.floor((value / 100) * cells)));
  for (const entity of entities) {
    const { x, y, width, height } = entity.geometry;
    for (let cx = clamp(x); cx <= clamp(x + width); cx++) for (let cy = clamp(y); cy <= clamp(y + height); cy++) {
      const key = cy * cells + cx;
      const bucket = grid.get(key); if (bucket) bucket.push(entity); else grid.set(key, [entity]);
    }
  }
  return { cells, grid, clamp };
}
/** The topmost entity (the last drawn) under the point (x, y), both in plan units; null on empty ground. */
export function hitTest(index: ReturnType<typeof buildHitIndex>, x: number, y: number): string | null {
  const bucket = index.grid.get(index.clamp(y) * index.cells + index.clamp(x));
  if (!bucket) return null;
  for (let i = bucket.length - 1; i >= 0; i--) {
    const { geometry } = bucket[i];
    if (x >= geometry.x && x <= geometry.x + geometry.width && y >= geometry.y && y <= geometry.y + geometry.height) return bucket[i].id;
  }
  return null;
}

// ---------------------------------------------------------------- G-137: alerts on an entity
export type AlertEntity = { status: string; progressPercent: number; plannedValue: number; actualValue: number; wbsItemId: string | null; activityId: string | null };
export type AlertActivity = { status: string; plannedFinishAt: Date | string | null } | null;
export type EntityAlert = { code: "blocked" | "overdue" | "cost_over" | "unlinked"; severity: "critical" | "warning" | "info"; days?: number; percent?: number };
/**
 * What deserves attention on one entity, from the data that is actually linked to it: its own status and values and its activity's dates.
 * (Quality and HSE alerts need a record-to-entity link the platform does not hold, so they are not invented here.)
 */
export function entityAlerts(entity: AlertEntity, activity: AlertActivity, now: Date = new Date()): EntityAlert[] {
  const alerts: EntityAlert[] = [];
  if (entity.status === "blocked") alerts.push({ code: "blocked", severity: "critical" });
  if (activity?.plannedFinishAt && entity.status !== "completed" && activity.status !== "completed") {
    const days = Math.floor((now.getTime() - new Date(activity.plannedFinishAt).getTime()) / 86_400_000);
    if (days > 0) alerts.push({ code: "overdue", severity: days > 14 ? "critical" : "warning", days });
  }
  if (entity.plannedValue > 0 && entity.actualValue > entity.plannedValue) {
    const percent = Math.round(((entity.actualValue - entity.plannedValue) / entity.plannedValue) * 1000) / 10;
    if (percent >= 10) alerts.push({ code: "cost_over", severity: percent >= 25 ? "critical" : "warning", percent });
  }
  if (!entity.wbsItemId && !entity.activityId) alerts.push({ code: "unlinked", severity: "info" });
  return alerts;
}
