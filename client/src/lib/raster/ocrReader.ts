// Reads the label inside each shape. Each crop is cut a few pixels inside the outline and enlarged 3 times first: at the original size
// Tesseract reads small text poorly, while the enlarged crop reads every code in the synthetic test drawing.
import type { GrayImage, LabelRead, RasterShape } from "./rasterCore";

export type OcrResult = { text: string; confidence: number };
export type Recognizer = (image: GrayImage) => Promise<OcrResult>;

export const LABEL_SCALE = 3;
const INSET = 8;

export async function readLabels(
  image: GrayImage,
  shapes: RasterShape[],
  recognize: Recognizer,
  onProgress?: (done: number, total: number) => void,
): Promise<LabelRead[]> {
  const reads: LabelRead[] = [];
  for (let index = 0; index < shapes.length; index++) {
    const shape = shapes[index];
    const crop = cropScaled(image, shape);
    if (crop) {
      const result = await recognize(crop);
      reads.push({ polygonId: shape.id, text: result.text, confidence: result.confidence });
    } else {
      // too small to hold a label: it stays unread and the matcher reports it as having no text
      reads.push({ polygonId: shape.id, text: "", confidence: 0 });
    }
    onProgress?.(index + 1, shapes.length);
  }
  return reads;
}

// The part of the shape inside its outline, enlarged LABEL_SCALE times by bilinear sampling. Null when the shape is too small.
export function cropScaled(image: GrayImage, shape: RasterShape): GrayImage | null {
  const width = shape.width - 2 * INSET;
  const height = shape.height - 2 * INSET;
  if (width < 4 || height < 4) return null;
  const x0 = shape.x + INSET;
  const y0 = shape.y + INSET;
  const outWidth = width * LABEL_SCALE;
  const outHeight = height * LABEL_SCALE;
  const data = new Uint8Array(outWidth * outHeight);
  for (let oy = 0; oy < outHeight; oy++) {
    const sy = y0 + (oy + 0.5) / LABEL_SCALE - 0.5;
    const iy = Math.floor(sy);
    const fy = sy - iy;
    for (let ox = 0; ox < outWidth; ox++) {
      const sx = x0 + (ox + 0.5) / LABEL_SCALE - 0.5;
      const ix = Math.floor(sx);
      const fx = sx - ix;
      const top = interpolate(image, ix, iy, fx);
      const bottom = interpolate(image, ix, iy + 1, fx);
      data[oy * outWidth + ox] = Math.round(top + (bottom - top) * fy);
    }
  }
  return { width: outWidth, height: outHeight, data };
}

// Two neighbouring pixels blended by fx; the coordinates are clamped to the image so an edge pixel is repeated.
function interpolate(image: GrayImage, x: number, y: number, fx: number): number {
  const cx = Math.min(Math.max(x, 0), image.width - 1);
  const cy = Math.min(Math.max(y, 0), image.height - 1);
  const cx1 = Math.min(cx + 1, image.width - 1);
  const left = image.data[cy * image.width + cx];
  const right = image.data[cy * image.width + cx1];
  return left + (right - left) * fx;
}
