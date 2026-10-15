import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { imageSize, parseGeoJsonUnits, parseGeometry, ringArea } from "./pmcGeometry";

const square = (x: number, y: number, size = 0.1) => [[x, y], [x + size, y], [x + size, y + size], [x, y + size], [x, y]];
const collection = (...features: unknown[]) => JSON.stringify({ type: "FeatureCollection", features });
const feature = (unitNumber: unknown, coordinates: unknown, type = "Polygon") => ({ type: "Feature", properties: { unitNumber }, geometry: { type, coordinates } });

function png(width: number, height: number) {
  const crcTable = Array.from({ length: 256 }, (_unused, n) => { let c = n; for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (buffer: Buffer) => { let c = 0xffffffff; for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const body = Buffer.concat([Buffer.from(type, "ascii"), data]); const out = Buffer.alloc(8 + data.length + 4); out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc(body), 8 + data.length); return out; };
  const header = Buffer.alloc(13); header.writeUInt32BE(width, 0); header.writeUInt32BE(height, 4); header[8] = 8; header[9] = 0;
  const rows = Buffer.alloc((width + 1) * height, 200);
  for (let y = 0; y < height; y += 1) rows[y * (width + 1)] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(rows)), chunk("IEND", Buffer.alloc(0))]);
}

describe("PMC geometry", () => {
  it("accepts a polygon (closed or not), drops the repeated closing point and keeps normalised coordinates", () => {
    const closed = parseGeometry({ type: "Polygon", coordinates: [square(0.1, 0.1)] });
    expect(closed.error).toBeUndefined();
    expect(closed.geometry).toEqual({ type: "Polygon", coordinates: [[[0.1, 0.1], [0.2, 0.1], [0.2, 0.2], [0.1, 0.2]]] });
    expect(parseGeometry({ type: "Polygon", coordinates: [square(0.1, 0.1).slice(0, -1)] }).geometry).toEqual(closed.geometry);
    expect(parseGeometry({ type: "MultiPolygon", coordinates: [[square(0.1, 0.1)], [square(0.5, 0.5)]] }).geometry?.type).toBe("MultiPolygon");
  });

  it("refuses each kind of bad geometry with its own reason", () => {
    const code = (geometry: unknown) => parseGeometry(geometry).error;
    expect(code({ type: "Point", coordinates: [0.5, 0.5] })).toBe("PMC_GEOMETRY_TYPE_UNSUPPORTED");
    expect(code({ type: "Polygon", coordinates: [[[0.1, 0.1], [0.2, 0.2]]] })).toBe("PMC_GEOMETRY_TOO_FEW_POINTS");
    expect(code({ type: "Polygon", coordinates: [[[0.1, 0.1], [0.5, 0.5], [0.9, 0.9]]] })).toBe("PMC_GEOMETRY_NO_AREA");
    expect(code({ type: "Polygon", coordinates: [square(0.95, 0.95)] })).toBe("PMC_GEOMETRY_OUTSIDE_PLAN");
    expect(code({ type: "Polygon", coordinates: [[[0.1, "x"], [0.2, 0.2], [0.3, 0.1]]] })).toBe("PMC_GEOMETRY_COORDINATES_INVALID");
    expect(code({ type: "Polygon", coordinates: [Array.from({ length: 501 }, (_unused, i) => [0.1 + (i % 2) * 0.1, 0.1 + i * 0.001])] })).toBe("PMC_GEOMETRY_TOO_MANY_POINTS");
  });

  it("computes ring area by the shoelace formula", () => {
    expect(ringArea([[0, 0], [0.5, 0], [0.5, 0.5], [0, 0.5]])).toBeCloseTo(0.25, 10);
  });

  it("reads a feature collection by unit number, and takes nothing unless every feature is good", () => {
    const good = parseGeoJsonUnits(collection(feature(1, [square(0.1, 0.1)]), feature("2", [square(0.3, 0.1)])));
    expect(good.errors).toEqual([]);
    expect(good.units.map(unit => unit.unitNumber)).toEqual([1, 2]);
    const bad = parseGeoJsonUnits(collection(feature(1, [square(0.1, 0.1)]), feature(1, [square(0.3, 0.1)]), feature(undefined, [square(0.5, 0.1)]), feature(4, [square(0.95, 0.95)]), feature(5, [[0, 0], [1, 1]], "LineString")));
    expect(bad.errors.map(error => [error.index, error.code])).toEqual([[1, "PMC_GEOJSON_DUPLICATE_UNIT"], [2, "PMC_GEOJSON_UNIT_NUMBER_MISSING"], [3, "PMC_GEOMETRY_OUTSIDE_PLAN"], [4, "PMC_GEOMETRY_TYPE_UNSUPPORTED"]]);
    expect(parseGeoJsonUnits("{not json").errors[0].code).toBe("PMC_GEOJSON_INVALID");
    expect(parseGeoJsonUnits(JSON.stringify({ type: "Feature" })).errors[0].code).toBe("PMC_GEOJSON_NOT_A_FEATURE_COLLECTION");
    expect(parseGeoJsonUnits(collection()).errors[0].code).toBe("PMC_GEOJSON_EMPTY");
  });

  it("reads the size of a PNG and a JPEG from the header, and refuses anything else", () => {
    expect(imageSize(png(640, 480))).toEqual({ mimeType: "image/png", width: 640, height: 480 });
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0xe0, 0x02, 0x80, 0x03, 0x01, 0x22, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01]);
    expect(imageSize(jpeg)).toEqual({ mimeType: "image/jpeg", width: 640, height: 480 });
    expect(imageSize(Buffer.from("GIF89a..........................."))).toBeNull();
    expect(imageSize(Buffer.from("<svg onload=alert(1)></svg>"))).toBeNull();
  });
});
