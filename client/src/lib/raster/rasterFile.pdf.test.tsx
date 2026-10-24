// @vitest-environment node
// A synthetic three-page PDF written here, byte by byte: rectangles only, no text, no drawing from a project. Each page has a different
// size and a different number of rectangles, so the test can tell which page was read.
// pdf.js renders into a canvas; Node has none, so @napi-rs/canvas (the package pdf.js itself uses in Node) stands in for it.
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { Canvas, DOMMatrix } from "@napi-rs/canvas";
import { detectShapes } from "./shapeDetector";
import { readPdfPage } from "./rasterFile";

type SyntheticPage = { width: number; height: number; rectangles: [x: number, y: number, w: number, h: number][] };

// Page sizes in points (1 pt = 1/72 inch) and rectangles in points from the bottom-left corner, as PDF counts them.
const PAGES: SyntheticPage[] = [
  { width: 300, height: 200, rectangles: [[20, 20, 80, 60], [160, 100, 100, 70]] },
  { width: 400, height: 300, rectangles: [[20, 20, 90, 70], [150, 30, 90, 90], [280, 180, 90, 90]] },
  { width: 200, height: 400, rectangles: [[30, 250, 140, 100]] },
];

// Each object is written at a known byte offset so the cross-reference table is exact.
function syntheticPdf(pages: SyntheticPage[]): Uint8Array {
  const pageObject = (index: number) => 3 + 2 * index;
  const contentObject = (index: number) => 4 + 2 * index;
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Kids [${pages.map((_, index) => `${pageObject(index)} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  ];
  pages.forEach((page, index) => {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width} ${page.height}] /Contents ${contentObject(index)} 0 R /Resources << >> >>`);
    const content = page.rectangles.map(([x, y, w, h]) => `0 0 0 RG 2 w ${x} ${y} ${w} ${h} re S`).join("\n");
    objects.push(`<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`);
  });
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body, "latin1"));
}

// pdf.js in Node runs its "fake worker" from the worker module it is handed, so that module is loaded here instead of from /ocr.
const require = createRequire(import.meta.url);
const LEGACY_BUILD = require.resolve("pdfjs-dist/legacy/build/pdf.mjs");
const LEGACY_WORKER = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");

beforeAll(async () => {
  (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = await import(/* @vite-ignore */ LEGACY_WORKER);
  // rasterFile draws into a canvas made with document.createElement; here that is a headless canvas.
  vi.stubGlobal("document", { createElement: () => new Canvas(1, 1) });
  // pdf.js uses DOMMatrix for transforms; Node has none, so the one from the same package stands in.
  vi.stubGlobal("DOMMatrix", DOMMatrix);
}, 60_000);

const loadLegacyPdfJs = (): Promise<typeof import("pdfjs-dist")> => import(/* @vite-ignore */ LEGACY_BUILD);

describe("readPdfPage on a synthetic multi-page PDF", () => {
  const original = syntheticPdf(PAGES);
  // pdf.js moves the buffer it is given into its worker, so every read gets its own copy, as a fresh file read does in the browser.
  const bytes = { copy: () => original.slice() };

  it("reports the page count with any page read", async () => {
    const { pageCount } = await readPdfPage(bytes.copy(), 1, loadLegacyPdfJs);
    expect(pageCount).toBe(3);
  });

  it("reads page 1 when asked for page 1", async () => {
    const { image } = await readPdfPage(bytes.copy(), 1, loadLegacyPdfJs);
    // 300 by 200 points at the scale of 4 that the reader uses for small pages
    expect({ width: image.width, height: image.height }).toEqual({ width: 1200, height: 800 });
    expect(detectShapes(image)).toHaveLength(2);
  });

  it("reads page 2 when asked for page 2, not the first page", async () => {
    const { image, pageCount } = await readPdfPage(bytes.copy(), 2, loadLegacyPdfJs);
    expect(pageCount).toBe(3);
    expect({ width: image.width, height: image.height }).toEqual({ width: 1600, height: 1200 });
    expect(detectShapes(image)).toHaveLength(3);
  });

  it("reads the last page, which has a different orientation", async () => {
    const { image } = await readPdfPage(bytes.copy(), 3, loadLegacyPdfJs);
    expect({ width: image.width, height: image.height }).toEqual({ width: 800, height: 1600 });
    expect(detectShapes(image)).toHaveLength(1);
  }, 60_000);

  it("refuses a page number outside the document", async () => {
    await expect(readPdfPage(bytes.copy(), 0, loadLegacyPdfJs)).rejects.toThrow(RangeError);
    await expect(readPdfPage(bytes.copy(), 4, loadLegacyPdfJs)).rejects.toThrow(RangeError);
    await expect(readPdfPage(bytes.copy(), 1.5, loadLegacyPdfJs)).rejects.toThrow(RangeError);
  });
});
