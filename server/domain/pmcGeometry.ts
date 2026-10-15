// Unit polygons and the site-plan image. Pure: no database, no storage.
// Coordinates are normalised to the plan image (0..1, origin at the top left),
// so a plan can be replaced by a sharper picture of the same drawing without
// redrawing any unit.

export type Ring = Array<[number, number]>;
export type UnitGeometry = { type: "Polygon"; coordinates: Ring[] } | { type: "MultiPolygon"; coordinates: Ring[][] };
export type GeometryError = { index: number; unitNumber: number | null; code: string; detail?: string };
export const MAX_VERTICES = 500;
export const MAX_FEATURES = 5_000;

const isPoint = (value: unknown): value is [number, number] => Array.isArray(value) && value.length >= 2 && typeof value[0] === "number" && typeof value[1] === "number" && Number.isFinite(value[0]) && Number.isFinite(value[1]);

/** Twice the signed area of a ring (shoelace). Zero means the points are on a line. */
export function ringArea(ring: Ring) {
  let sum = 0;
  for (let i = 0; i < ring.length; i += 1) { const [x1, y1] = ring[i]; const [x2, y2] = ring[(i + 1) % ring.length]; sum += x1 * y2 - x2 * y1; }
  return Math.abs(sum) / 2;
}

function normalizeRing(raw: unknown): { ring?: Ring; error?: string } {
  if (!Array.isArray(raw) || !raw.every(isPoint)) return { error: "PMC_GEOMETRY_COORDINATES_INVALID" };
  let ring = (raw as Array<number[]>).map(point => [point[0], point[1]] as [number, number]);
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (ring.length > 1 && first[0] === last[0] && first[1] === last[1]) ring = ring.slice(0, -1); // a closed ring repeats its first point
  if (ring.length < 3) return { error: "PMC_GEOMETRY_TOO_FEW_POINTS" };
  if (ring.length > MAX_VERTICES) return { error: "PMC_GEOMETRY_TOO_MANY_POINTS" };
  if (ring.some(([x, y]) => x < 0 || x > 1 || y < 0 || y > 1)) return { error: "PMC_GEOMETRY_OUTSIDE_PLAN" };
  if (ringArea(ring) < 1e-9) return { error: "PMC_GEOMETRY_NO_AREA" };
  return { ring };
}

export function parseGeometry(raw: unknown): { geometry?: UnitGeometry; error?: string } {
  const geometry = raw as { type?: unknown; coordinates?: unknown } | null;
  if (!geometry || typeof geometry !== "object") return { error: "PMC_GEOMETRY_TYPE_UNSUPPORTED" };
  if (geometry.type === "Polygon" && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0) {
    const rings: Ring[] = [];
    for (const rawRing of geometry.coordinates) { const { ring, error } = normalizeRing(rawRing); if (error) return { error }; rings.push(ring!); }
    return { geometry: { type: "Polygon", coordinates: rings } };
  }
  if (geometry.type === "MultiPolygon" && Array.isArray(geometry.coordinates) && geometry.coordinates.length > 0) {
    const polygons: Ring[][] = [];
    for (const polygon of geometry.coordinates) {
      if (!Array.isArray(polygon) || polygon.length === 0) return { error: "PMC_GEOMETRY_COORDINATES_INVALID" };
      const rings: Ring[] = [];
      for (const rawRing of polygon) { const { ring, error } = normalizeRing(rawRing); if (error) return { error }; rings.push(ring!); }
      polygons.push(rings);
    }
    return { geometry: { type: "MultiPolygon", coordinates: polygons } };
  }
  return { error: "PMC_GEOMETRY_TYPE_UNSUPPORTED" };
}

/** Reads a GeoJSON FeatureCollection whose features carry `properties.unitNumber`. Nothing is accepted unless every feature is. */
export function parseGeoJsonUnits(text: string): { units: Array<{ unitNumber: number; geometry: UnitGeometry }>; errors: GeometryError[] } {
  let document: unknown;
  try { document = JSON.parse(text); } catch { return { units: [], errors: [{ index: -1, unitNumber: null, code: "PMC_GEOJSON_INVALID" }] }; }
  const collection = document as { type?: unknown; features?: unknown };
  if (collection?.type !== "FeatureCollection" || !Array.isArray(collection.features)) return { units: [], errors: [{ index: -1, unitNumber: null, code: "PMC_GEOJSON_NOT_A_FEATURE_COLLECTION" }] };
  if (collection.features.length === 0) return { units: [], errors: [{ index: -1, unitNumber: null, code: "PMC_GEOJSON_EMPTY" }] };
  if (collection.features.length > MAX_FEATURES) return { units: [], errors: [{ index: -1, unitNumber: null, code: "PMC_GEOJSON_TOO_MANY_FEATURES" }] };
  const units: Array<{ unitNumber: number; geometry: UnitGeometry }> = [];
  const errors: GeometryError[] = [];
  const seen = new Set<number>();
  collection.features.forEach((feature: { properties?: { unitNumber?: unknown }; geometry?: unknown }, index: number) => {
    const raw = feature?.properties?.unitNumber;
    const unitNumber = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+$/.test(raw.trim()) ? Number(raw) : NaN;
    if (!Number.isInteger(unitNumber) || unitNumber < 0) { errors.push({ index, unitNumber: null, code: "PMC_GEOJSON_UNIT_NUMBER_MISSING" }); return; }
    if (seen.has(unitNumber)) { errors.push({ index, unitNumber, code: "PMC_GEOJSON_DUPLICATE_UNIT" }); return; }
    seen.add(unitNumber);
    const parsed = parseGeometry(feature.geometry);
    if (parsed.error) errors.push({ index, unitNumber, code: parsed.error });
    else units.push({ unitNumber, geometry: parsed.geometry! });
  });
  return { units, errors };
}

/** Width and height of a PNG or JPEG from its header, or null when the bytes are neither. */
export function imageSize(bytes: Uint8Array): { mimeType: "image/png" | "image/jpeg"; width: number; height: number } | null {
  const view = Buffer.from(bytes);
  if (view.length > 24 && view.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) && view.subarray(12, 16).toString("ascii") === "IHDR") return { mimeType: "image/png", width: view.readUInt32BE(16), height: view.readUInt32BE(20) };
  if (view.length > 4 && view[0] === 0xff && view[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < view.length) {
      if (view[offset] !== 0xff) { offset += 1; continue; }
      const marker = view[offset + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return { mimeType: "image/jpeg", height: view.readUInt16BE(offset + 5), width: view.readUInt16BE(offset + 7) };
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { offset += 2; continue; }
      offset += 2 + view.readUInt16BE(offset + 2);
    }
  }
  return null;
}
