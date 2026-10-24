// Tesseract.js worker for the drawing labels. The worker script, wasm core and English data are served from this origin (see vite.config.ts):
// the CSP allows no CDN. Only the characters a unit code uses are allowed, and each line is read as a single line.
import { createWorker, PSM, type ImageLike } from "tesseract.js";
import type { OcrResult, Recognizer } from "./ocrReader";
import type { GrayImage } from "./rasterCore";

// Browsers need every path. Node (tests) finds its own core, so only the language folder is given there.
// cachePath is where Node keeps the language file; without it Node writes the file into the working directory.
export type OcrAssetPaths = { workerPath?: string; corePath?: string; langPath: string; cachePath?: string };
export type OcrWorker = { recognize: Recognizer; terminate: () => Promise<void> };

const LABEL_CHARACTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._/";

export async function createOcrWorker(paths: OcrAssetPaths, toImage: (image: GrayImage) => ImageLike = grayToCanvas): Promise<OcrWorker> {
  const worker = await createWorker("eng", 1, { ...paths, logger: () => undefined });
  await worker.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_LINE, tessedit_char_whitelist: LABEL_CHARACTERS });
  return {
    recognize: async (image): Promise<OcrResult> => {
      const result = await worker.recognize(toImage(image));
      return { text: result.data.text, confidence: result.data.confidence };
    },
    terminate: async () => {
      await worker.terminate();
    },
  };
}

// Browser input: the grey crop painted onto a canvas that Tesseract can read.
export function grayToCanvas(image: GrayImage): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas is not available");
  const pixels = context.createImageData(image.width, image.height);
  for (let i = 0, p = 0; i < image.data.length; i++, p += 4) {
    pixels.data[p] = image.data[i];
    pixels.data[p + 1] = image.data[i];
    pixels.data[p + 2] = image.data[i];
    pixels.data[p + 3] = 255;
  }
  context.putImageData(pixels, 0, 0);
  return canvas;
}
