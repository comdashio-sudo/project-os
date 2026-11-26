// Q-62 batch 3 (the owner's MASTER_PLAN.pdf is vector at heart): a PDF exported from CAD carries each villa as a closed path and its number as text. The
// platform rendered every PDF to an image and searched it for shapes, then told the owner to «upload a vector PDF» — the file he had just uploaded. Here the
// page's own drawing is read with pdf.js: page.getOperatorList() gives the paths (constructPath, with the transforms of save / restore / transform and of form
// XObjects), page.getTextContent() the texts with their positions. Each closed subpath of three points or more is a polygon in PDF user space (y up, the same
// way a DXF counts), so the unit matcher links a number to the smallest polygon around it — a site or block outline around the villas is never chosen.
// The vector reading is tried first for any PDF; the image reading is the fallback when a page carries no closed shapes.
import type { DxfDrawing, DxfPoint, DxfPolygon, DxfText } from "@/lib/dxf/dxfReader";

type PdfJs = typeof import("pdfjs-dist");
type Matrix = [number, number, number, number, number, number];
const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];
const multiply = (m: Matrix, n: Matrix): Matrix => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const apply = (m: Matrix, x: number, y: number): DxfPoint => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
const LAYER = "PDF";

// pdf.js 5: a path is a flat list of drawing operators and their coordinates (DrawOPS)
const DRAW = { moveTo: 0, lineTo: 1, curveTo: 2, quadraticCurveTo: 3, closePath: 4 } as const;

/** The closed subpaths of one path, in user space. A curve's end point stands for the curve: a villa outline is straight lines. */
function closedSubpaths(data: ArrayLike<number>, m: Matrix): DxfPoint[][] {
  const out: DxfPoint[][] = [];
  let current: DxfPoint[] = [];
  const finish = (closed: boolean) => {
    if (current.length >= 3) {
      const first = current[0]; const last = current[current.length - 1];
      const joined = Math.hypot(first.x - last.x, first.y - last.y) < 1e-6;
      if (closed || joined) out.push(joined ? current.slice(0, -1) : current);
    }
    current = [];
  };
  for (let i = 0; i < data.length;) {
    switch (data[i++]) {
      case DRAW.moveTo: finish(false); current.push(apply(m, data[i++], data[i++])); break;
      case DRAW.lineTo: current.push(apply(m, data[i++], data[i++])); break;
      case DRAW.curveTo: i += 4; current.push(apply(m, data[i++], data[i++])); break;
      case DRAW.quadraticCurveTo: i += 2; current.push(apply(m, data[i++], data[i++])); break;
      case DRAW.closePath: finish(true); break;
      default: return out; // an operator this reader does not know: stop at what it understood
    }
  }
  finish(false);
  return out.filter(points => points.length >= 3);
}

const centre = (points: DxfPoint[]) => ({ x: points.reduce((s, p) => s + p.x, 0) / points.length, y: points.reduce((s, p) => s + p.y, 0) / points.length });
function inside(point: DxfPoint, polygon: DxfPoint[]): boolean {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]; const b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) hit = !hit;
  }
  return hit;
}

export type VectorRead = { drawing: DxfDrawing; pageCount: number; polygonCount: number; textCount: number; outlinesSetAside: number };

/** One page of a PDF read as a drawing; null when the page has no closed shapes (a scanned plan) — then the image reading is used. */
export async function readPdfVector(bytes: Uint8Array, pageNumber: number, loadPdfJs: () => Promise<PdfJs> = () => import("pdfjs-dist")): Promise<VectorRead | null> {
  const pdfjs = await loadPdfJs();
  pdfjs.GlobalWorkerOptions.workerSrc = "/ocr/pdf.worker.min.mjs";
  const loading = pdfjs.getDocument({ data: bytes });
  const pdf = await loading.promise;
  try {
    const pageCount = pdf.numPages;
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) throw new RangeError(`PDF page ${pageNumber} is outside 1 to ${pageCount}`);
    const page = await pdf.getPage(pageNumber);
    const [operators, textContent] = await Promise.all([page.getOperatorList(), page.getTextContent()]);
    const OPS = pdfjs.OPS;
    const rings: DxfPoint[][] = [];
    let ctm: Matrix = IDENTITY;
    const stack: Matrix[] = [];
    for (let index = 0; index < operators.fnArray.length; index += 1) {
      const fn = operators.fnArray[index]; const args = operators.argsArray[index] as unknown[];
      if (fn === OPS.save) stack.push(ctm);
      else if (fn === OPS.restore) ctm = stack.pop() ?? IDENTITY;
      else if (fn === OPS.transform) ctm = multiply(ctm, args as unknown as Matrix);
      else if (fn === OPS.paintFormXObjectBegin) { stack.push(ctm); const matrix = args?.[0] as Matrix | null; if (Array.isArray(matrix) && matrix.length === 6) ctm = multiply(ctm, matrix); }
      else if (fn === OPS.paintFormXObjectEnd) ctm = stack.pop() ?? IDENTITY;
      else if (fn === OPS.constructPath) {
        const data = (args?.[1] as unknown[] | undefined)?.[0];
        if (data && typeof (data as ArrayLike<number>).length === "number") rings.push(...closedSubpaths(data as ArrayLike<number>, ctm));
      }
    }
    // A shape drawn twice (a fill then its stroke) is one shape
    const seen = new Set<string>();
    const unique = rings.filter(points => { const key = points.map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(";"); if (seen.has(key)) return false; seen.add(key); return true; });
    if (!unique.length) return null;
    // An outline around many shapes (the site, a block) is set aside: it is no villa, and a person would only have to unlink it
    const centres = unique.map(centre);
    const kept = unique.filter(points => centres.filter(point => inside(point, points)).length <= 3);
    const polygons: DxfPolygon[] = kept.map((points, index) => ({ id: `pdf-${index + 1}`, layer: LAYER, points, source: "lwpolyline" as const }));
    const texts: DxfText[] = textContent.items.flatMap(item => {
      const text = "str" in item ? item.str.trim() : "";
      if (!text || !("transform" in item)) return [];
      const [a, b, , , e, f] = item.transform as number[];
      // the middle of the text run: its start, half its width along its own direction, and a third of its height up
      const length = Math.hypot(a, b) || 1; const width = ("width" in item ? Number(item.width) : 0) || 0; const height = ("height" in item ? Number(item.height) : 0) || 0;
      return [{ layer: LAYER, position: { x: e + (a / length) * width / 2 - (b / length) * height / 3, y: f + (b / length) * width / 2 + (a / length) * height / 3 }, text }];
    });
    return { drawing: { layers: [LAYER], polygons, texts, warnings: [], ignoredEntities: {} }, pageCount, polygonCount: polygons.length, textCount: texts.length, outlinesSetAside: unique.length - kept.length };
  } finally {
    await loading.destroy();
  }
}
