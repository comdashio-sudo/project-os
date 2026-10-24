// Pure DXF reader for the master plan drawing import (first slice; see docs/specs/MASTER_PLAN_DXF.md).
// Reads only what the matcher needs: layer names, closed shapes (LWPOLYLINE, POLYLINE, closed LINE loops),
// TEXT and MTEXT. Every other entity is counted in `ignoredEntities` and skipped.
// No DOM access, no network, no vision library. DWG is refused, never converted.

import type { BilingualMessage } from "@shared/projectErrors";

export type DxfPoint = { x: number; y: number };

export type DxfPolygon = { id: string; layer: string; points: DxfPoint[]; source: "lwpolyline" | "polyline" | "lines" };

export type DxfText = { layer: string; position: DxfPoint; text: string };

export type DxfWarning =
  | { code: "DXF_UNDECLARED_LAYER"; layer: string; count: number }
  | { code: "DXF_ARC_APPROXIMATED"; count: number }
  | { code: "DXF_LINES_NOT_CLOSED_IGNORED"; layer: string; count: number };

export type DxfDrawing = {
  layers: string[];
  polygons: DxfPolygon[];
  texts: DxfText[];
  warnings: DxfWarning[];
  ignoredEntities: Record<string, number>;
};

export type DxfErrorCode = "DWG_NOT_SUPPORTED" | "DXF_BINARY_NOT_SUPPORTED" | "DXF_EMPTY" | "DXF_INVALID";

export type DxfError = { code: DxfErrorCode; message: BilingualMessage };

export type DxfReadResult = { ok: true; drawing: DxfDrawing } | { ok: false; error: DxfError };

const MESSAGES: Record<DxfErrorCode, BilingualMessage> = {
  DWG_NOT_SUPPORTED: {
    ar: "ملف DWG غير مدعوم. احفظ الرسم بصيغة DXF من برنامج التصميم ثم ارفعه مرة أخرى.",
    en: "DWG files are not supported. Save the drawing as DXF from your design program and upload it again.",
  },
  DXF_BINARY_NOT_SUPPORTED: {
    ar: "ملف DXF الثنائي غير مدعوم. احفظ الرسم بصيغة DXF نصية (ASCII) ثم ارفعه مرة أخرى.",
    en: "Binary DXF is not supported. Save the drawing as ASCII DXF and upload it again.",
  },
  DXF_EMPTY: { ar: "الملف فارغ.", en: "The file is empty." },
  DXF_INVALID: {
    ar: "الملف ليس رسم DXF صالحًا، أو لا يحوي قسم ENTITIES.",
    en: "The file is not a valid DXF drawing, or it has no ENTITIES section.",
  },
};

const fail = (code: DxfErrorCode): DxfReadResult => ({ ok: false, error: { code, message: MESSAGES[code] } });

// AutoCAD writes DWG files starting with "AC" plus the version (AC1.50, AC2.10, AC1015 ... AC1032).
const DWG_HEADER = /^AC(?:1\.\d{2}|2\.\d{2}|10\d{2})/;
const BINARY_DXF_HEADER = "AutoCAD Binary DXF";

// $DWGCODEPAGE values that AutoCAD writes. Anything else is read as UTF-8.
const CODEPAGES: Record<string, string> = { ANSI_1252: "windows-1252", ANSI_1256: "windows-1256", UTF8: "utf-8" };

// Two LINE endpoints are the same point when they agree to 1e-6 drawing units.
const ENDPOINT_SCALE = 1e6;

type Pair = { code: number; value: string };
type DxfRecord = { type: string; pairs: Pair[] };
type LineSegment = { layer: string; a: DxfPoint; b: DxfPoint };

function headBytes(bytes: Uint8Array, length: number): string {
  let head = "";
  for (let i = 0; i < Math.min(bytes.length, length); i++) head += String.fromCharCode(bytes[i]);
  return head;
}

function decodeText(bytes: Uint8Array): string {
  // The header is ASCII-compatible, so a windows-1252 pass finds $DWGCODEPAGE without knowing the encoding yet.
  const probe = new TextDecoder("windows-1252").decode(bytes);
  const codepage = /\$DWGCODEPAGE\s*\r?\n\s*3\s*\r?\n\s*(\S+)/.exec(probe)?.[1];
  const label = (codepage && CODEPAGES[codepage.toUpperCase()]) || "utf-8";
  return new TextDecoder(label).decode(bytes);
}

// Group code / value pairs. Returns undefined when the text is not a well-formed DXF stream.
function toPairs(text: string): Pair[] | undefined {
  const lines = text.split(/\r\n|\r|\n/);
  if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
  if (lines.length === 0 || lines.length % 2 !== 0) return undefined;
  const pairs: Pair[] = [];
  for (let i = 0; i < lines.length; i += 2) {
    const code = lines[i].trim();
    if (!/^-?\d+$/.test(code)) return undefined;
    pairs.push({ code: Number(code), value: lines[i + 1] });
  }
  return pairs;
}

function sectionPairs(pairs: Pair[]): Map<string, Pair[]> {
  const sections = new Map<string, Pair[]>();
  for (let i = 0; i < pairs.length; i++) {
    if (pairs[i].code !== 0 || pairs[i].value.trim() !== "SECTION" || pairs[i + 1]?.code !== 2) continue;
    const name = pairs[i + 1].value.trim();
    const body: Pair[] = [];
    let end = i + 2;
    while (end < pairs.length && !(pairs[end].code === 0 && pairs[end].value.trim() === "ENDSEC")) body.push(pairs[end++]);
    if (!sections.has(name)) sections.set(name, body);
    i = end;
  }
  return sections;
}

function toRecords(pairs: Pair[]): DxfRecord[] {
  const records: DxfRecord[] = [];
  for (const pair of pairs) {
    if (pair.code === 0) records.push({ type: pair.value.trim(), pairs: [] });
    else records[records.length - 1]?.pairs.push(pair);
  }
  return records;
}

const valueOf = (record: DxfRecord, code: number): string | undefined => record.pairs.find(pair => pair.code === code)?.value;

function numberFrom(value: string | undefined): number | undefined {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) return undefined;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : undefined;
}

const numberOf = (record: DxfRecord, code: number): number | undefined => numberFrom(valueOf(record, code));

function pointOf(record: DxfRecord, xCode: number, yCode: number): DxfPoint | undefined {
  const x = numberOf(record, xCode);
  const y = numberOf(record, yCode);
  return x !== undefined && y !== undefined ? { x, y } : undefined;
}

const layerOf = (record: DxfRecord): string => valueOf(record, 8)?.trim() || "0";

// Vertices arrive as code 10 (x), code 20 (y) and optional code 42 (bulge), one group per vertex.
function verticesOf(pairs: Pair[]): { points: DxfPoint[]; bulgedSegments: number } {
  const raw: { x: number; y: number; bulge: number }[] = [];
  for (const pair of pairs) {
    if (pair.code === 10) raw.push({ x: numberFrom(pair.value) ?? NaN, y: NaN, bulge: 0 });
    else if (pair.code === 20 && raw.length > 0) raw[raw.length - 1].y = numberFrom(pair.value) ?? NaN;
    else if (pair.code === 42 && raw.length > 0) raw[raw.length - 1].bulge = numberFrom(pair.value) ?? 0;
  }
  return {
    points: raw.filter(vertex => Number.isFinite(vertex.x) && Number.isFinite(vertex.y)).map(vertex => ({ x: vertex.x, y: vertex.y })),
    bulgedSegments: raw.filter(vertex => vertex.bulge !== 0).length,
  };
}

// A shape is a unit boundary only when it is closed: flagged closed, or its last point repeats the first.
function closedShape(points: DxfPoint[], flaggedClosed: boolean): DxfPoint[] | undefined {
  const shape = points.slice();
  const coincident = shape.length >= 2 && shape[0].x === shape[shape.length - 1].x && shape[0].y === shape[shape.length - 1].y;
  if (!flaggedClosed && !coincident) return undefined;
  if (coincident) shape.pop();
  return shape.length >= 3 ? shape : undefined;
}

const keyOf = (layer: string, point: DxfPoint): string => `${layer}\u0000${Math.round(point.x * ENDPOINT_SCALE)},${Math.round(point.y * ENDPOINT_SCALE)}`;

// Chains LINE segments on one layer into closed loops. A chain that does not return to its start is not a unit.
function loopsFromLines(lines: LineSegment[]): { loops: { layer: string; points: DxfPoint[] }[]; notClosed: Map<string, number> } {
  const index = new Map<string, number[]>();
  lines.forEach((line, i) => {
    for (const point of [line.a, line.b]) {
      const key = keyOf(line.layer, point);
      const list = index.get(key);
      if (list) list.push(i);
      else index.set(key, [i]);
    }
  });

  const used = new Array<boolean>(lines.length).fill(false);
  const loops: { layer: string; points: DxfPoint[] }[] = [];
  const notClosed = new Map<string, number>();

  for (let i = 0; i < lines.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const { layer } = lines[i];
    const start = lines[i].a;
    const points: DxfPoint[] = [start];
    let chainLength = 1;
    let current = lines[i].b;
    let closed = false;
    for (;;) {
      points.push(current);
      if (keyOf(layer, current) === keyOf(layer, start)) {
        closed = true;
        break;
      }
      const next = (index.get(keyOf(layer, current)) ?? []).find(j => !used[j]);
      if (next === undefined) break;
      used[next] = true;
      chainLength++;
      current = keyOf(layer, lines[next].a) === keyOf(layer, current) ? lines[next].b : lines[next].a;
    }
    // points = [start, ..., start]; the repeated start is dropped. Fewer than three corners is not a shape.
    if (closed && points.length - 1 >= 3) loops.push({ layer, points: points.slice(0, -1) });
    else notClosed.set(layer, (notClosed.get(layer) ?? 0) + chainLength);
  }
  return { loops, notClosed };
}

const decodeUnicodeEscapes = (text: string): string => text.replace(/\\U\+([0-9A-Fa-f]{4})/g, (_, hex: string) => String.fromCharCode(parseInt(hex, 16)));

// Minimal MTEXT plain-text extraction: paragraph breaks, escapes, font and height codes, and grouping braces.
// Stacked fractions are dropped, not rendered.
function plainMtext(raw: string): string {
  return decodeUnicodeEscapes(raw)
    .replace(/\\([\\{}])|\\P|\\~|\\[ACfHpQTW][^;]*;|\\S[^;]*;|\\[LlOoKk]|[{}]/g, (match: string, literal?: string) => {
      if (literal) return literal;
      if (match === "\\P") return "\n";
      if (match === "\\~") return " ";
      return "";
    });
}

function readEntities(entityPairs: Pair[], tablePairs: Pair[]): DxfDrawing {
  const declaredLayers = toRecords(tablePairs)
    .filter(record => record.type === "LAYER")
    .map(record => valueOf(record, 2)?.trim() ?? "")
    .filter(name => name !== "");
  const declaredSet = new Set(declaredLayers.map(name => name.toUpperCase()));

  const records = toRecords(entityPairs);
  const polygons: DxfPolygon[] = [];
  const texts: DxfText[] = [];
  const lines: LineSegment[] = [];
  const ignoredEntities: Record<string, number> = {};
  const usedLayers: string[] = [];
  let bulgedSegments = 0;

  const addPolygon = (points: DxfPoint[] | undefined, layer: string, source: DxfPolygon["source"]) => {
    if (!points) return;
    polygons.push({ id: `P${polygons.length + 1}`, layer, points, source });
    usedLayers.push(layer);
  };

  for (let index = 0; index < records.length; index++) {
    const record = records[index];
    switch (record.type) {
      case "LWPOLYLINE": {
        const { points, bulgedSegments: bulged } = verticesOf(record.pairs);
        bulgedSegments += bulged;
        addPolygon(closedShape(points, ((numberOf(record, 70) ?? 0) & 1) === 1), layerOf(record), "lwpolyline");
        break;
      }
      case "POLYLINE": {
        // Old-style polyline: VERTEX records follow, closed by SEQEND.
        let end = index + 1;
        const vertexPairs: Pair[] = [];
        while (end < records.length && records[end].type !== "SEQEND") {
          if (records[end].type === "VERTEX") for (const pair of records[end].pairs) vertexPairs.push(pair);
          end++;
        }
        index = end;
        const flags = numberOf(record, 70) ?? 0;
        if ((flags & (8 | 64)) !== 0) {
          // 3D polyline or polyface mesh: not a plan outline.
          ignoredEntities.POLYLINE_3D_OR_MESH = (ignoredEntities.POLYLINE_3D_OR_MESH ?? 0) + 1;
          break;
        }
        const { points, bulgedSegments: bulged } = verticesOf(vertexPairs);
        bulgedSegments += bulged;
        addPolygon(closedShape(points, (flags & 1) === 1), layerOf(record), "polyline");
        break;
      }
      case "LINE": {
        const a = pointOf(record, 10, 20);
        const b = pointOf(record, 11, 21);
        if (a && b && (a.x !== b.x || a.y !== b.y)) lines.push({ layer: layerOf(record), a, b });
        break;
      }
      case "TEXT": {
        // A justified TEXT (group 72 or 73 not zero) is placed at its second alignment point.
        const insertion = pointOf(record, 10, 20);
        const alignment = pointOf(record, 11, 21);
        const justified = (numberOf(record, 72) ?? 0) !== 0 || (numberOf(record, 73) ?? 0) !== 0;
        const position = justified && alignment ? alignment : insertion;
        const text = decodeUnicodeEscapes(valueOf(record, 1) ?? "").trim();
        if (position && text) {
          texts.push({ layer: layerOf(record), position, text });
          usedLayers.push(layerOf(record));
        }
        break;
      }
      case "MTEXT": {
        // Text longer than 250 characters is split: group 3 chunks come first, group 1 holds the last chunk.
        const raw = record.pairs.filter(pair => pair.code === 3).map(pair => pair.value).join("") + (valueOf(record, 1) ?? "");
        const position = pointOf(record, 10, 20);
        const text = plainMtext(raw).trim();
        if (position && text) {
          texts.push({ layer: layerOf(record), position, text });
          usedLayers.push(layerOf(record));
        }
        break;
      }
      case "SEQEND":
      case "VERTEX":
        break;
      default:
        ignoredEntities[record.type] = (ignoredEntities[record.type] ?? 0) + 1;
    }
  }

  const { loops, notClosed } = loopsFromLines(lines);
  for (const loop of loops) addPolygon(loop.points, loop.layer, "lines");

  const warnings: DxfWarning[] = [];
  if (bulgedSegments > 0) warnings.push({ code: "DXF_ARC_APPROXIMATED", count: bulgedSegments });
  if (declaredSet.size > 0) {
    const undeclared = new Map<string, number>();
    for (const layer of usedLayers) {
      if (!declaredSet.has(layer.toUpperCase())) undeclared.set(layer, (undeclared.get(layer) ?? 0) + 1);
    }
    undeclared.forEach((count, layer) => warnings.push({ code: "DXF_UNDECLARED_LAYER", layer, count }));
  }
  notClosed.forEach((count, layer) => warnings.push({ code: "DXF_LINES_NOT_CLOSED_IGNORED", layer, count }));

  return { layers: declaredLayers, polygons, texts, warnings, ignoredEntities };
}

// Reads a DXF file from its bytes. Refuses DWG and binary DXF with a bilingual message.
export function readDxf(bytes: Uint8Array): DxfReadResult {
  if (bytes.length === 0) return fail("DXF_EMPTY");
  if (DWG_HEADER.test(headBytes(bytes, 6))) return fail("DWG_NOT_SUPPORTED");
  if (headBytes(bytes, BINARY_DXF_HEADER.length) === BINARY_DXF_HEADER) return fail("DXF_BINARY_NOT_SUPPORTED");

  const pairs = toPairs(decodeText(bytes));
  if (!pairs) return fail("DXF_INVALID");
  const sections = sectionPairs(pairs);
  const entityPairs = sections.get("ENTITIES");
  if (!entityPairs) return fail("DXF_INVALID");
  return { ok: true, drawing: readEntities(entityPairs, sections.get("TABLES") ?? []) };
}
