// Q-67 (6): choosing villas on the master plan — the pure part. The shapes come from pmc.progressMapShapes (the saved drawing's shapes linked to a villa);
// a villa is inside a dragged rectangle when its shape's centre is; a block is chosen by the villas of its shapes. No drawing, no geometry guessed.
export type Point = { x: number; y: number };
export type VillaShape = { villa: string; points: Point[] };
export type Box = { x: number; y: number; width: number; height: number };

export function boundsOf(points: Point[]): Box | null {
  if (!points.length) return null;
  let minX = Infinity; let minY = Infinity; let maxX = -Infinity; let maxY = -Infinity;
  for (const point of points) { minX = Math.min(minX, point.x); minY = Math.min(minY, point.y); maxX = Math.max(maxX, point.x); maxY = Math.max(maxY, point.y); }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/** The centre of a shape (the mean of its corners: enough to place a label or test a rectangle; villa shapes are small and convex). */
export function centreOf(points: Point[]): Point {
  const sum = points.reduce((total, point) => ({ x: total.x + point.x, y: total.y + point.y }), { x: 0, y: 0 });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

/** The villas whose shape's centre lies inside the rectangle spanned by two corners (in the drawing's own units), in the shapes' order. */
export function villasInRectangle(shapes: VillaShape[], a: Point, b: Point): string[] {
  const minX = Math.min(a.x, b.x); const maxX = Math.max(a.x, b.x); const minY = Math.min(a.y, b.y); const maxY = Math.max(a.y, b.y);
  return shapes.filter(shape => { const centre = centreOf(shape.points); return centre.x >= minX && centre.x <= maxX && centre.y >= minY && centre.y <= maxY; }).map(shape => shape.villa);
}

/** Each group's label point (the centre of its villas' shapes), for the block names drawn on the map. */
export function groupLabels(shapes: VillaShape[], groupOf: (villa: string) => string | null): Array<{ key: string; at: Point; villas: string[] }> {
  const groups = new Map<string, { points: Point[]; villas: string[] }>();
  for (const shape of shapes) {
    const key = groupOf(shape.villa); if (!key) continue;
    const group = groups.get(key) ?? { points: [], villas: [] };
    group.points.push(centreOf(shape.points)); group.villas.push(shape.villa); groups.set(key, group);
  }
  return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, "en", { numeric: true })).map(([key, group]) => ({ key, at: centreOf(group.points), villas: group.villas }));
}

/** Toggles villas in a chosen list: a click on a chosen villa takes it away; a group (a block, a rectangle) is added whole, or taken away when all of it was already chosen. */
export function toggleVillas(chosen: string[], villas: string[]): string[] {
  const set = new Set(chosen);
  const allIn = villas.length > 0 && villas.every(villa => set.has(villa));
  for (const villa of villas) { if (allIn) set.delete(villa); else set.add(villa); }
  return Array.from(set);
}
