// Q-40: choosing villas on the master plan — the same choice on the drawing and in the side list — and telling villa types apart by a hatch
// pattern drawn OVER the shape, so the fill keeps showing progress (masterPlanColouring.ts) and the type never hides it.
import { unitNumberOf } from "@/lib/masterPlanColouring";

export type ListedVilla = { polygonId: string; unitCode: string; modelCode: string | null };

/** Eastern Arabic (U+0660-0669) and Persian/Urdu (U+06F0-06F9) digits typed in a search read as Western, so an Arabic keyboard finds villa 12 too. */
export function westernDigits(value: string): string {
  return value.replace(/[\u0660-\u0669]/g, digit => String(digit.charCodeAt(0) - 0x0660)).replace(/[\u06f0-\u06f9]/g, digit => String(digit.charCodeAt(0) - 0x06f0));
}

/**
 * The villas a search names. A query of digits only finds the villa with that number (the last number in its code, as the site map reads it)
 * and codes that contain the digits; any other query matches the code or the type, ignoring case. An empty query keeps the whole list.
 */
export function searchVillas(villas: readonly ListedVilla[], query: string): ListedVilla[] {
  const q = westernDigits(query).trim().toLowerCase();
  if (!q) return [...villas];
  if (/^\d+$/.test(q)) {
    const n = Number(q);
    const exact = villas.filter(villa => unitNumberOf(villa.unitCode) === n);
    const partial = villas.filter(villa => unitNumberOf(villa.unitCode) !== n && villa.unitCode.includes(q));
    return [...exact, ...partial];
  }
  return villas.filter(villa => villa.unitCode.toLowerCase().includes(q) || (villa.modelCode ?? "").toLowerCase().includes(q));
}

/** A tap with several allowed adds or removes the villa; a plain tap makes it the only one chosen. */
export function pickVilla(current: ReadonlySet<string>, polygonId: string, several: boolean): Set<string> {
  if (!several) return new Set([polygonId]);
  const next = new Set(current);
  if (next.has(polygonId)) next.delete(polygonId); else next.add(polygonId);
  return next;
}

/** The box around the chosen shapes (drawing coordinates, already flipped), to bring them all into view; null when none has points. */
export function boundsOf(points: ReadonlyArray<{ x: number; y: number }>): { x: number; y: number; width: number; height: number } | null {
  if (!points.length) return null;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) { if (p.x < minX) minX = p.x; if (p.y < minY) minY = p.y; if (p.x > maxX) maxX = p.x; if (p.y > maxY) maxY = p.y; }
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

/**
 * Eight hatches that read apart without colour. The most common plans have two or three types, so the first ones differ the most (lines, dots,
 * a cross); the mirrored diagonal comes later. A ninth type reuses the first.
 */
export type HatchKind = "lines" | "cross" | "grid" | "dots";
export const MODEL_HATCHES: ReadonlyArray<{ kind: HatchKind; angle: number; spacing: number }> = [
  { kind: "lines", angle: 45, spacing: 1 },
  { kind: "dots", angle: 0, spacing: 1 },
  { kind: "cross", angle: 45, spacing: 1.2 },
  { kind: "lines", angle: 0, spacing: 1 },
  { kind: "lines", angle: 135, spacing: 1 },
  { kind: "grid", angle: 0, spacing: 1.2 },
  { kind: "lines", angle: 90, spacing: 1 },
  { kind: "lines", angle: 45, spacing: 2 },
];

/** Each villa type's hatch, by its place in the sorted list of types — the same type always gets the same hatch on one plan. */
export function hatchIndexOf(modelCodes: readonly string[]): Map<string, number> {
  return new Map([...modelCodes].sort().map((code, index) => [code, index % MODEL_HATCHES.length]));
}
