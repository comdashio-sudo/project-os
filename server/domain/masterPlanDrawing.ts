// Master Plan drawing (G-189): which files the server keeps as a drawing, how many pages each has, and what a saved layout may contain.
// Everything here is pure except the PDF page count, which reads the file's bytes with pdf.js (the same library the browser uses, legacy build for Node).

export type DrawingKind = { kind: "pdf" | "png" | "jpeg" | "dxf"; mimeType: string };

export const MAX_DRAWING_POLYGONS = 5000;
export const MAX_POLYGON_POINTS = 1000;
export const MAX_POLYGON_LABEL = 120;
export const MAX_POLYGON_REF = 80;
const MAX_COORDINATE = 1_000_000_000;

export type DrawingPoint = { x: number; y: number };
export type DrawingPolygonInput = { id?: string; ref: string; label: string; points: DrawingPoint[] };

/**
 * What the bytes are, judged from their content and not from the name the browser sent: a PDF, a PNG, a JPEG, or a DXF text file (a binary
 * DXF is refused). Returns null for anything else.
 */
export function detectDrawingKind(bytes: Uint8Array): DrawingKind | null {
  const head = Buffer.from(bytes.subarray(0, 8));
  if (head.subarray(0, 5).toString("latin1") === "%PDF-") return { kind: "pdf", mimeType: "application/pdf" };
  if (head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { kind: "png", mimeType: "image/png" };
  if (head.subarray(0, 3).equals(Buffer.from([0xff, 0xd8, 0xff]))) return { kind: "jpeg", mimeType: "image/jpeg" };
  const sample = Buffer.from(bytes.subarray(0, 4096));
  // a DXF is text: it has section markers and no NUL bytes (a binary DXF starts with a NUL in its header and is refused)
  if (!sample.includes(0) && /\bSECTION\b/.test(sample.toString("latin1"))) return { kind: "dxf", mimeType: "application/dxf" };
  return null;
}

/** The pages of a PDF, counted by pdf.js. A file it cannot read counts as zero pages, which the caller refuses. */
export async function countPdfPages(bytes: Uint8Array): Promise<number> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const task = pdfjs.getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: false, disableFontFace: true, verbosity: 0 });
  try {
    const document = await task.promise;
    try {
      return document.numPages;
    } finally {
      await document.destroy();
    }
  } catch {
    return 0;
  } finally {
    await task.destroy();
  }
}

/** The first thing wrong with a layout to save, as a short reason, or null when it may be saved. */
export function layoutProblem(polygons: readonly DrawingPolygonInput[]): string | null {
  if (polygons.length > MAX_DRAWING_POLYGONS) return "too_many_polygons";
  const refs = new Set<string>();
  for (const polygon of polygons) {
    if (polygon.ref.length === 0 || polygon.ref.length > MAX_POLYGON_REF) return "bad_ref";
    if (polygon.label.length > MAX_POLYGON_LABEL) return "bad_label";
    if (refs.has(polygon.ref)) return "duplicate_ref";
    refs.add(polygon.ref);
    if (polygon.points.length < 3 || polygon.points.length > MAX_POLYGON_POINTS) return "bad_points";
    for (const point of polygon.points) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || Math.abs(point.x) > MAX_COORDINATE || Math.abs(point.y) > MAX_COORDINATE) return "bad_points";
    }
  }
  return null;
}
