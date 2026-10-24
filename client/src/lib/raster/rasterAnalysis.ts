// Turns a raster drawing into a DXF-shaped drawing: shapes, then the label in each shape, then only the labels that pass the confidence and pattern gate.
// Shapes with no accepted label stay unlinked, so a person decides them in the review step.
import type { DxfDrawing } from "@/lib/dxf/dxfReader";
import { readLabels, type Recognizer } from "./ocrReader";
import { acceptLabel, buildRasterDrawing, type GrayImage } from "./rasterCore";
import { detectShapes } from "./shapeDetector";

export type RasterAnalysis = { drawing: DxfDrawing; shapeCount: number; labelCount: number };

export async function analyseRaster(image: GrayImage, recognize: Recognizer, onProgress?: (done: number, total: number) => void): Promise<RasterAnalysis> {
  const shapes = detectShapes(image);
  const reads = await readLabels(image, shapes, recognize, onProgress);
  const labels = reads.flatMap(read => {
    const text = acceptLabel(read.text, read.confidence);
    return text ? [{ polygonId: read.polygonId, text }] : [];
  });
  return { drawing: buildRasterDrawing(shapes, labels, image.height), shapeCount: shapes.length, labelCount: labels.length };
}
