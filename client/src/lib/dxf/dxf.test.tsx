// Synthetic fixtures only. Every drawing and unit code below is built in this file; no real drawing or personal data.
import { describe, expect, it } from "vitest";
import { matchDrawingToUnits, type ProjectUnit } from "./dxfMatch";
import { readDxf, type DxfDrawing } from "./dxfReader";

type Group = [number, string | number];

const group = (code: number, value: string | number): string => `${code}\r\n${value}\r\n`;

const entity = (type: string, groups: Group[]): string => group(0, type) + groups.map(([code, value]) => group(code, value)).join("");

// A minimal, complete DXF document: HEADER, TABLES (layer table) and ENTITIES.
function dxf(options: { entities: string; layers?: string[] }): string {
  const layers = options.layers ?? ["UNITS", "UNIT_NO"];
  const layerRecords = layers
    .map(name => group(0, "LAYER") + group(2, name) + group(70, 0) + group(62, 7) + group(6, "CONTINUOUS"))
    .join("");
  return (
    group(0, "SECTION") + group(2, "HEADER") + group(9, "$ACADVER") + group(1, "AC1027") + group(0, "ENDSEC") +
    group(0, "SECTION") + group(2, "TABLES") + group(0, "TABLE") + group(2, "LAYER") + group(70, layers.length) + layerRecords + group(0, "ENDTAB") + group(0, "ENDSEC") +
    group(0, "SECTION") + group(2, "ENTITIES") + options.entities + group(0, "ENDSEC") + group(0, "EOF")
  );
}

const square = (layer: string, x: number, y: number, size = 10): string =>
  entity("LWPOLYLINE", [
    [8, layer], [90, 4], [70, 1],
    [10, x], [20, y], [10, x + size], [20, y], [10, x + size], [20, y + size], [10, x], [20, y + size],
  ]);

const text = (layer: string, x: number, y: number, value: string): string => entity("TEXT", [[8, layer], [10, x], [20, y], [40, 2.5], [1, value]]);

const mtext = (layer: string, x: number, y: number, value: string): string => entity("MTEXT", [[8, layer], [10, x], [20, y], [40, 2.5], [1, value]]);

const lineSegment = (layer: string, x1: number, y1: number, x2: number, y2: number): string =>
  entity("LINE", [[8, layer], [10, x1], [20, y1], [11, x2], [21, y2]]);

// Four LINE entities whose endpoints meet exactly.
const squareLines = (layer: string, x: number, y: number, size = 10): string =>
  lineSegment(layer, x, y, x + size, y) +
  lineSegment(layer, x + size, y, x + size, y + size) +
  lineSegment(layer, x + size, y + size, x, y + size) +
  lineSegment(layer, x, y + size, x, y);

// Old-style POLYLINE: a header, VERTEX records, then SEQEND.
const oldPolyline = (layer: string, points: [number, number][]): string =>
  entity("POLYLINE", [[8, layer], [66, 1], [70, 1]]) +
  points.map(([x, y]) => entity("VERTEX", [[8, layer], [10, x], [20, y]])).join("") +
  entity("SEQEND", [[8, layer]]);

function readOk(content: string): DxfDrawing {
  const result = readDxf(new TextEncoder().encode(content));
  if (!result.ok) throw new Error(`expected a drawing, got ${result.error.code}`);
  return result.drawing;
}

function matchOf(entities: string, units: ProjectUnit[], layers?: string[]) {
  return matchDrawingToUnits(readOk(dxf({ entities, layers })), units);
}

// Synthetic building: 500 unit squares on a 25 x 20 grid, each with its code as text at its centre.
const GRID_COLUMNS = 25;
const GRID_UNITS = 500;
const gridCell = (n: number) => ({ x: (n % GRID_COLUMNS) * 12, y: Math.floor(n / GRID_COLUMNS) * 12 });
const gridCode = (n: number) => `B1-U-${String(n + 1).padStart(4, "0")}`;

function gridFixture(): { content: string; units: ProjectUnit[] } {
  let entities = "";
  const units: ProjectUnit[] = [];
  for (let n = 0; n < GRID_UNITS; n++) {
    const { x, y } = gridCell(n);
    const code = gridCode(n);
    entities += square("UNITS", x, y) + text("UNIT_NO", x + 5, y + 5, code);
    units.push({ id: `unit-${n + 1}`, code });
  }
  return { content: dxf({ entities }), units };
}

describe("readDxf: refusals", () => {
  it("refuses a DWG file with a bilingual message that asks for DXF", () => {
    const bytes = Uint8Array.from([...Array.from(new TextEncoder().encode("AC1032")), 0, 0, 0, 0]);
    const result = readDxf(bytes);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe("DWG_NOT_SUPPORTED");
    expect(result.error.message.ar).toContain("DXF");
    expect(result.error.message.en).toContain("DXF");
  });

  it("refuses a binary DXF file", () => {
    const bytes = Uint8Array.from([...Array.from(new TextEncoder().encode("AutoCAD Binary DXF\r\n")), 0x1a, 0]);
    const result = readDxf(bytes);
    expect(result.ok ? "ok" : result.error.code).toBe("DXF_BINARY_NOT_SUPPORTED");
  });

  it("refuses an empty file", () => {
    const result = readDxf(new Uint8Array(0));
    expect(result.ok ? "ok" : result.error.code).toBe("DXF_EMPTY");
  });

  it("refuses text that is not a DXF stream", () => {
    const result = readDxf(new TextEncoder().encode("hello\nworld\n"));
    expect(result.ok ? "ok" : result.error.code).toBe("DXF_INVALID");
  });

  it("refuses a DXF with no ENTITIES section", () => {
    const content = group(0, "SECTION") + group(2, "HEADER") + group(0, "ENDSEC") + group(0, "EOF");
    const result = readDxf(new TextEncoder().encode(content));
    expect(result.ok ? "ok" : result.error.code).toBe("DXF_INVALID");
  });
});

describe("readDxf: entities", () => {
  it("reads closed shapes, LINE loops, TEXT and MTEXT, and counts what it skips", () => {
    const drawing = readOk(
      dxf({
        entities:
          square("UNITS", 0, 0) +
          oldPolyline("UNITS", [[20, 0], [30, 0], [30, 10], [20, 10]]) +
          squareLines("UNITS", 40, 0) +
          text("UNIT_NO", 5, 5, "A-1") +
          mtext("UNIT_NO", 45, 5, "{\\fArial|b0;A-2\\P}") +
          entity("CIRCLE", [[8, "UNITS"], [10, 0], [20, 0], [40, 1]]),
      }),
    );
    expect(drawing.polygons.map(polygon => polygon.source)).toEqual(["lwpolyline", "polyline", "lines"]);
    expect(drawing.texts.map(item => item.text)).toEqual(["A-1", "A-2"]);
    expect(drawing.ignoredEntities).toEqual({ CIRCLE: 1 });
    expect(drawing.layers).toEqual(["UNITS", "UNIT_NO"]);
    expect(drawing.warnings).toEqual([]);
  });

  it("does not read an open polyline as a unit", () => {
    const open = entity("LWPOLYLINE", [[8, "UNITS"], [90, 3], [70, 0], [10, 0], [20, 0], [10, 10], [20, 0], [10, 10], [20, 10]]);
    expect(readOk(dxf({ entities: open })).polygons).toHaveLength(0);
  });

  it("reads a bulged segment as chords and reports the approximation", () => {
    const bulged = entity("LWPOLYLINE", [[8, "UNITS"], [90, 3], [70, 1], [10, 0], [20, 0], [42, 0.5], [10, 10], [20, 0], [10, 5], [20, 8]]);
    const drawing = readOk(dxf({ entities: bulged }));
    expect(drawing.polygons).toHaveLength(1);
    expect(drawing.warnings).toEqual([{ code: "DXF_ARC_APPROXIMATED", count: 1 }]);
  });

  it("does not close a LINE loop that has a missing side, and reports it", () => {
    const threeSides = lineSegment("UNITS", 0, 0, 10, 0) + lineSegment("UNITS", 10, 0, 10, 10) + lineSegment("UNITS", 10, 10, 0, 10);
    const drawing = readOk(dxf({ entities: threeSides }));
    expect(drawing.polygons).toHaveLength(0);
    expect(drawing.warnings).toEqual([{ code: "DXF_LINES_NOT_CLOSED_IGNORED", layer: "UNITS", count: 3 }]);
  });

  it("decodes \\U+ escapes in TEXT", () => {
    const drawing = readOk(dxf({ entities: text("UNIT_NO", 5, 5, "\\U+0661\\U+0662") }));
    expect(drawing.texts[0].text).toBe("١٢");
  });

  it("decodes a windows-1256 file declared in $DWGCODEPAGE", () => {
    // Bytes 0xC7 0xC8 are the Arabic letters alef and beh in windows-1256.
    const content = dxf({ entities: text("UNIT_NO", 5, 5, "A-1") + text("UNIT_NO", 15, 5, String.fromCharCode(0xc7, 0xc8)) }).replace(
      "9\r\n$ACADVER\r\n1\r\nAC1027\r\n",
      "9\r\n$DWGCODEPAGE\r\n3\r\nANSI_1256\r\n",
    );
    const bytes = Uint8Array.from(content, char => char.charCodeAt(0));
    const result = readDxf(bytes);
    if (!result.ok) throw new Error(result.error.code);
    expect(result.drawing.texts.map(item => item.text)).toEqual(["A-1", "اب"]);
  });
});

describe("matchDrawingToUnits", () => {
  it("matches a synthetic 500-unit DXF 100% automatically", () => {
    const { content, units } = gridFixture();
    const report = matchDrawingToUnits(readOk(content), units);
    expect(report.counts).toEqual({
      polygons: 500,
      texts: 500,
      linked: 500,
      unmatched: 0,
      ambiguous: 0,
      unitsTotal: 500,
      unitsLinked: 500,
      unitsRemaining: 0,
    });
    expect(report.linked.length / units.length).toBe(1);
    expect(report.unitsRemaining).toEqual([]);
  });

  it("leaves a polygon with no text unmatched and not linked", () => {
    const report = matchOf(square("UNITS", 0, 0), [{ id: "u1", code: "A-1" }]);
    expect(report.counts).toMatchObject({ linked: 0, unmatched: 1, ambiguous: 0, unitsRemaining: 1 });
    expect(report.unmatched).toEqual([{ kind: "polygon", polygonId: "P1", layer: "UNITS", reason: "no_text" }]);
  });

  it("marks two texts in one polygon as ambiguous and links neither", () => {
    const report = matchOf(square("UNITS", 0, 0) + text("UNIT_NO", 2, 2, "A-1") + text("UNIT_NO", 6, 6, "A-2"), [
      { id: "u1", code: "A-1" },
      { id: "u2", code: "A-2" },
    ]);
    expect(report.counts).toMatchObject({ linked: 0, ambiguous: 1, unitsRemaining: 2 });
    expect(report.ambiguous).toEqual([{ reason: "several_texts_in_polygon", polygonId: "P1", texts: ["A-1", "A-2"] }]);
  });

  it("marks a text outside all polygons as unmatched", () => {
    const report = matchOf(square("UNITS", 0, 0) + text("UNIT_NO", 500, 500, "A-1"), [{ id: "u1", code: "A-1" }]);
    // The square has no text of its own, so it is also reported as a polygon with no text.
    expect(report.counts).toMatchObject({ linked: 0, unmatched: 2, unitsRemaining: 1 });
    expect(report.unmatched).toContainEqual({ kind: "text", text: "A-1", layer: "UNIT_NO", position: { x: 500, y: 500 }, reason: "outside_polygons" });
    expect(report.unmatched).toContainEqual({ kind: "polygon", polygonId: "P1", layer: "UNITS", reason: "no_text" });
  });

  it("still links a polygon on an undeclared layer and reports that layer", () => {
    const entities = square("LEGACY", 0, 0) + text("UNITS", 5, 5, "A-1");
    const drawing = readOk(dxf({ entities, layers: ["UNITS"] }));
    expect(drawing.warnings).toEqual([{ code: "DXF_UNDECLARED_LAYER", layer: "LEGACY", count: 1 }]);
    const report = matchDrawingToUnits(drawing, [{ id: "u1", code: "A-1" }]);
    expect(report.counts).toMatchObject({ linked: 1, ambiguous: 0, unmatched: 0, unitsRemaining: 0 });
  });

  it("marks a text that matches no project unit as unmatched", () => {
    const report = matchOf(square("UNITS", 0, 0) + text("UNIT_NO", 5, 5, "Z-9"), [{ id: "u1", code: "A-1" }]);
    expect(report.counts).toMatchObject({ linked: 0, unmatched: 1, unitsRemaining: 1 });
    expect(report.unmatched[0]).toMatchObject({ kind: "text", text: "Z-9", reason: "no_project_unit" });
  });

  it("gives a text to the smallest polygon around it, so a unit inside a floor outline links", () => {
    const entities = square("UNITS", 0, 0, 100) + text("UNIT_NO", 5, 5, "NOTE") + square("UNITS", 40, 40) + text("UNIT_NO", 45, 45, "A-1");
    const report = matchOf(entities, [{ id: "u1", code: "A-1" }]);
    expect(report.linked).toEqual([{ unitId: "u1", code: "A-1", polygonId: "P2" }]);
    expect(report.counts).toMatchObject({ linked: 1, unmatched: 1, ambiguous: 0 });
    expect(report.unmatched[0]).toMatchObject({ kind: "text", text: "NOTE", reason: "no_project_unit" });
  });

  it("compares codes after trimming only: case and separators must match exactly", () => {
    const entities = square("UNITS", 0, 0) + text("UNIT_NO", 5, 5, " A-1 ") + square("UNITS", 20, 0) + text("UNIT_NO", 25, 5, "b-2");
    const report = matchOf(entities, [
      { id: "u1", code: "A-1" },
      { id: "u2", code: "B-2" },
    ]);
    expect(report.linked).toEqual([{ unitId: "u1", code: "A-1", polygonId: "P1" }]);
    expect(report.unmatched).toEqual([{ kind: "text", text: "b-2", layer: "UNIT_NO", position: { x: 25, y: 5 }, reason: "no_project_unit" }]);
    expect(report.unitsRemaining).toEqual([{ id: "u2", code: "B-2" }]);
  });

  it("makes a unit ambiguous when two polygons claim it", () => {
    const entities = square("UNITS", 0, 0) + text("UNIT_NO", 5, 5, "A-1") + square("UNITS", 20, 0) + text("UNIT_NO", 25, 5, "A-1");
    const report = matchOf(entities, [{ id: "u1", code: "A-1" }]);
    expect(report.linked).toEqual([]);
    expect(report.ambiguous).toEqual([{ reason: "several_polygons_for_unit", unitId: "u1", code: "A-1", polygonIds: ["P1", "P2"] }]);
    expect(report.counts).toMatchObject({ linked: 0, unitsRemaining: 1 });
  });

  it("makes a polygon ambiguous when two project units share its code", () => {
    const report = matchOf(square("UNITS", 0, 0) + text("UNIT_NO", 5, 5, "A-1"), [
      { id: "u1", code: "A-1" },
      { id: "u2", code: "A-1" },
    ]);
    expect(report.linked).toEqual([]);
    expect(report.ambiguous).toEqual([{ reason: "duplicate_unit_code", polygonId: "P1", code: "A-1", unitIds: ["u1", "u2"] }]);
    expect(report.counts).toMatchObject({ linked: 0, unitsRemaining: 2 });
  });
});
