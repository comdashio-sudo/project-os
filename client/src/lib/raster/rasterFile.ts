// Browser-only: decodes a PNG, JPEG or the first page of a PDF into grey pixels. The file stays in the browser.
// Images longer than MAX_RASTER_SIDE pixels are scaled down so detection stays within memory.
import { rgbaToGray, type GrayImage } from "./rasterCore";

export const MAX_RASTER_SIDE = 3000;

export function rasterKind(fileName: string): "image" | "pdf" | null {
  const name = fileName.toLowerCase();
  if (/\.(png|jpe?g)$/.test(name)) return "image";
  if (name.endsWith(".pdf")) return "pdf";
  return null;
}

export async function readRasterImage(file: File): Promise<GrayImage> {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_RASTER_SIDE / Math.max(bitmap.width, bitmap.height));
  try {
    return await drawToGray(Math.round(bitmap.width * scale), Math.round(bitmap.height * scale), context => {
      context.drawImage(bitmap, 0, 0, Math.round(bitmap.width * scale), Math.round(bitmap.height * scale));
    });
  } finally {
    bitmap.close();
  }
}

// pdf.js is loaded only when a PDF is chosen. Its worker is served from /ocr (copied at build by vite.config.ts).
export async function readPdfFirstPage(bytes: Uint8Array): Promise<GrayImage> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = "/ocr/pdf.worker.min.mjs";
  const loading = pdfjs.getDocument({ data: bytes });
  const pdf = await loading.promise;
  try {
    const page = await pdf.getPage(1);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(MAX_RASTER_SIDE / Math.max(base.width, base.height), 4);
    const viewport = page.getViewport({ scale });
    const width = Math.round(viewport.width);
    const height = Math.round(viewport.height);
    // awaited, so the document is not destroyed while the page is still rendering
    return await drawToGray(width, height, async context => {
      await page.render({ canvasContext: context, viewport, canvas: context.canvas }).promise;
    });
  } finally {
    await loading.destroy();
  }
}

async function drawToGray(width: number, height: number, draw: (context: CanvasRenderingContext2D) => void | Promise<void>): Promise<GrayImage> {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("2D canvas is not available");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  await draw(context);
  const pixels = context.getImageData(0, 0, width, height);
  return rgbaToGray(pixels.data, width, height);
}
