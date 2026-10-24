// @vitest-environment node
// Real Tesseract.js on a synthetic drawing: a 4 by 3 grid of unit squares rendered with ImageMagick. No real drawing or personal data.
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { matchDrawingToUnits, type ProjectUnit } from "@/lib/dxf/dxfMatch";
import { analyseRaster } from "./rasterAnalysis";
import { createOcrWorker } from "./ocrWorker";
import { rgbaToGray, type GrayImage } from "./rasterCore";

const require = createRequire(import.meta.url);
const CODES = Array.from({ length: 12 }, (_, index) => `B1-U-${String(index + 1).padStart(4, "0")}`);
const LANG_PATH = path.join(path.dirname(require.resolve("@tesseract.js-data/eng/package.json")), "4.0.0_best_int");

function fixtureGray(): GrayImage {
  const png = PNG.sync.read(readFileSync(path.join(import.meta.dirname, "fixtures", "synthetic-units-grid.png")));
  return rgbaToGray(Uint8ClampedArray.from(png.data), png.width, png.height);
}

// Node hands Tesseract the crop as a PGM image (greyscale, binary), which it reads directly.
const toPgm = (image: GrayImage) => Buffer.concat([Buffer.from(`P5\n${image.width} ${image.height}\n255\n`), Buffer.from(image.data)]);

describe("raster drawing pipeline", () => {
  it("finds every shape, reads every code, and links all twelve units on the synthetic grid", async () => {
    const ocr = await createOcrWorker({ langPath: LANG_PATH, cachePath: LANG_PATH }, toPgm);
    try {
      const analysis = await analyseRaster(fixtureGray(), ocr.recognize);
      expect(analysis.shapeCount).toBe(12);
      expect(analysis.labelCount).toBe(12);
      const units: ProjectUnit[] = CODES.map((code, index) => ({ id: `unit-${index + 1}`, code }));
      const report = matchDrawingToUnits(analysis.drawing, units);
      expect(report.counts.linked).toBe(12);
      expect(report.counts.unmatched).toBe(0);
      expect(report.counts.ambiguous).toBe(0);
      expect(new Set(report.linked.map(link => link.code))).toEqual(new Set(CODES));
    } finally {
      await ocr.terminate();
    }
  }, 180_000);

  it("reports no shapes and no labels for a blank page", async () => {
    const ocr = await createOcrWorker({ langPath: LANG_PATH, cachePath: LANG_PATH }, toPgm);
    try {
      const blank: GrayImage = { width: 200, height: 200, data: new Uint8Array(200 * 200).fill(255) };
      const analysis = await analyseRaster(blank, ocr.recognize);
      expect(analysis).toMatchObject({ shapeCount: 0, labelCount: 0 });
    } finally {
      await ocr.terminate();
    }
  }, 180_000);
});
