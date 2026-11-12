// Browser-only: decodes a PNG, JPEG or one page of a PDF into grey pixels. The file stays in the browser.
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
// Reads one page (1-based) and reports how many pages the PDF has, so the caller can offer the others.
// The Node test passes pdf.js's legacy build, the one pdf.js recommends for Node; the browser uses the default build.
type PdfJs = typeof import("pdfjs-dist");
export async function readPdfPage(bytes: Uint8Array, pageNumber: number, loadPdfJs: () => Promise<PdfJs> = () => import("pdfjs-dist")): Promise<{ image: GrayImage; pageCount: number; preview: string | null }> {
  const pdfjs = await loadPdfJs();
  pdfjs.GlobalWorkerOptions.workerSrc = "/ocr/pdf.worker.min.mjs";
  const loading = pdfjs.getDocument({ data: bytes });
  const pdf = await loading.promise;
  try {
    const pageCount = pdf.numPages;
    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > pageCount) {
      throw new RangeError(`PDF page ${pageNumber} is outside 1 to ${pageCount}`);
    }
    const page = await pdf.getPage(pageNumber);
    const base = page.getViewport({ scale: 1 });
    const scale = Math.min(MAX_RASTER_SIDE / Math.max(base.width, base.height), 4);
    const viewport = page.getViewport({ scale });
    const width = Math.round(viewport.width);
    const height = Math.round(viewport.height);
    // awaited, so the document is not destroyed while the page is still rendering
    let preview: string | null = null;
    const image = await drawToGray(width, height, async context => {
      await page.render({ canvasContext: context, viewport, canvas: context.canvas }).promise;
      preview = canvasPreview(context.canvas);
    });
    return { image, pageCount, preview };
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

// The coloured page shown under the shapes (Q-7). A canvas that cannot export (no canvas support in a test) gives no picture rather than an error.
function canvasPreview(canvas: HTMLCanvasElement): string | null {
  try {
    const url = canvas.toDataURL("image/jpeg", 0.85);
    return url.startsWith("data:image/") ? url : null;
  } catch {
    return null;
  }
}
