// The saved Master Plan drawing (G-189) as the review editor sees it, and the other way round. Pure functions: the server calls live in
// client/src/lib/useMasterPlanDrawingLayout.ts. A polygon's review id is its `ref`, the id the reader gave it; the server id (`id`) is only used
// to call the server.
import type { ProjectUnit } from "./dxf/dxfMatch";
import type { DxfDrawing, DxfPoint } from "./dxf/dxfReader";
import type { ReviewItem } from "./dxf/dxfReview";

export type SavedPolygon = { id: string; ref: string; label: string; points: DxfPoint[] };
export type SavedLink = { polygonId: string; entityId: string };
export type SavedVersion = { id: string; versionNumber: number; fileName: string; mimeType: string; sizeBytes: number; pageCount: number; checksumSha256: string; createdAt: string | Date };
export type SavedLayout = { drawingId: string | null; latestVersion: SavedVersion | null; versions: SavedVersion[]; polygons: SavedPolygon[]; links: SavedLink[] };

// The server takes at most this much text per polygon label; a longer layer name is cut, not refused.
const MAX_LABEL = 120;

/** The units of the newest version of the newest plan: the id of that version, which a drawing is kept under. */
export function latestVersionId(data: { plans: { id: string }[]; versions: { id: string; masterPlanId: string; versionNumber: number }[] } | undefined): string | null {
  const plan = data?.plans[0];
  if (!plan || !data) return null;
  return data.versions.filter(version => version.masterPlanId === plan.id).sort((a, b) => b.versionNumber - a.versionNumber)[0]?.id ?? null;
}

/** The saved layout as the review editor shows it: every polygon, the confirmed links as confirmed items, the rest unlinked. */
export function layoutToReview(layout: SavedLayout, units: ProjectUnit[]): { drawing: DxfDrawing; items: ReviewItem[] } {
  const refById = new Map(layout.polygons.map(polygon => [polygon.id, polygon.ref]));
  const unitById = new Map(units.map(unit => [unit.id, unit]));
  const linkByRef = new Map<string, string>();
  for (const link of layout.links) {
    const ref = refById.get(link.polygonId);
    if (ref !== undefined && unitById.has(link.entityId)) linkByRef.set(ref, link.entityId);
  }
  const drawing: DxfDrawing = {
    layers: Array.from(new Set(layout.polygons.map(polygon => polygon.label).filter(Boolean))),
    polygons: layout.polygons.map(polygon => ({ id: polygon.ref, layer: polygon.label, points: polygon.points, source: "lines" as const })),
    texts: [],
    warnings: [],
    ignoredEntities: {},
  };
  const items: ReviewItem[] = layout.polygons.map(polygon => {
    const unitId = linkByRef.get(polygon.ref) ?? null;
    const unit = unitId ? unitById.get(unitId) : undefined;
    return { polygonId: polygon.ref, layer: polygon.label, unitId: unit?.id ?? null, unitCode: unit?.code ?? null, state: unit ? "confirmed" : "unlinked", reason: null, candidateUnitIds: [] };
  });
  return { drawing, items };
}

/** The polygons to save: every shape of the drawing, with the server id of any shape that was saved before. */
export function polygonsToSave(drawing: DxfDrawing, idByRef: ReadonlyMap<string, string>) {
  return drawing.polygons.map(polygon => {
    const id = idByRef.get(polygon.id);
    return { ...(id === undefined ? {} : { id }), ref: polygon.id, label: polygon.layer.slice(0, MAX_LABEL), points: polygon.points };
  });
}

/**
 * The link changes that bring the server to the confirmed links on the screen. Unlinks come first so a unit can move from one shape to another.
 * Only confirmed items count: a proposal is never saved as a link.
 */
export function linkChanges(items: ReviewItem[], savedRefByPolygonId: ReadonlyMap<string, string>, savedLinks: SavedLink[], idByRef: ReadonlyMap<string, string>) {
  const wanted = new Map<string, string>();
  for (const item of items) if (item.state === "confirmed" && item.unitId) wanted.set(item.polygonId, item.unitId);
  const current = new Map<string, string>();
  for (const link of savedLinks) {
    const ref = savedRefByPolygonId.get(link.polygonId);
    if (ref !== undefined) current.set(ref, link.entityId);
  }
  const unlink: string[] = [];
  const link: { polygonId: string; entityId: string }[] = [];
  for (const [ref, entityId] of Array.from(current.entries())) {
    if (wanted.get(ref) !== entityId) {
      const id = idByRef.get(ref);
      if (id !== undefined) unlink.push(id);
    }
  }
  for (const [ref, entityId] of Array.from(wanted.entries())) {
    if (current.get(ref) === entityId) continue;
    const id = idByRef.get(ref);
    if (id !== undefined) link.push({ polygonId: id, entityId });
  }
  return { unlink, link };
}
