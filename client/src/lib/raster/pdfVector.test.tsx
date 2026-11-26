// @vitest-environment node
import { createRequire } from "node:module";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { DOMMatrix } from "@napi-rs/canvas";
import { matchDrawingToUnits } from "@/lib/dxf/dxfMatch";
import { readPdfVector } from "./pdfVector";

// Q-62 batch 3: a vector PDF the way CAD exports a master plan — each villa a closed turned outline with its number as text, a site outline around them all.
// Written here by hand (synthetic), with an exact cross-reference table. Numbers 700… ; the turn of the street is 0.3 rad.
function vectorPlan(villas: number, options: { boundary?: boolean; noText?: boolean; onlyLines?: boolean } = {}): Uint8Array {
  const columns = Math.ceil(Math.sqrt(villas)); const pitch = 30; const angle = 0.3;
  const width = columns * pitch + 60; const height = Math.ceil(villas / columns) * pitch + 60;
  const parts: string[] = ["0 0 0 RG 0.5 w"];
  if (options.boundary !== false) parts.push(`10 10 ${width - 20} ${height - 20} re S`);
  for (let index = 0; index < villas; index += 1) {
    const cx = 40 + (index % columns) * pitch; const cy = 40 + Math.floor(index / columns) * pitch;
    const corners = [[-10, -6], [10, -6], [10, 6], [-10, 6]].map(([u, v]) => [cx + u * Math.cos(angle) - v * Math.sin(angle), cy + u * Math.sin(angle) + v * Math.cos(angle)]);
    // an open polyline only (no close, end ≠ start) when asked: it is no shape
    parts.push(`${corners[0][0].toFixed(2)} ${corners[0][1].toFixed(2)} m ${corners.slice(1).map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)} l`).join(" ")} ${options.onlyLines ? "S" : "h S"}`);
    if (!options.noText) parts.push(`BT /F1 4 Tf ${(cx - 4).toFixed(2)} ${(cy - 1.5).toFixed(2)} Td (${700 + index}) Tj ET`);
  }
  const content = parts.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>`,
    `<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n"; const offsets: number[] = [];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(body, "latin1")); body += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(body, "latin1"));
}

const require = createRequire(import.meta.url);
const LEGACY_BUILD = require.resolve("pdfjs-dist/legacy/build/pdf.mjs");
const LEGACY_WORKER = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
beforeAll(async () => {
  (globalThis as { pdfjsWorker?: unknown }).pdfjsWorker = await import(/* @vite-ignore */ LEGACY_WORKER);
  vi.stubGlobal("DOMMatrix", DOMMatrix);
}, 60_000);
const loadLegacyPdfJs = (): Promise<typeof import("pdfjs-dist")> => import(/* @vite-ignore */ LEGACY_BUILD);
const units = (count: number) => Array.from({ length: count }, (_unused, index) => ({ id: `villa-${700 + index}`, code: String(700 + index) }));

describe("a vector PDF master plan read from its own drawing (Q-62 batch 3)", () => {
  it("POSITIVE: 200 turned villas inside a site outline — 200 shapes, the outline set aside, and every number linked to its own villa (200/200)", async () => {
    const read = await readPdfVector(vectorPlan(200), 1, loadLegacyPdfJs);
    expect(read).not.toBeNull();
    expect(read!.polygonCount).toBe(200);
    expect(read!.outlinesSetAside).toBe(1);
    expect(read!.textCount).toBe(200);
    const report = matchDrawingToUnits(read!.drawing, units(200));
    expect(report.linked).toHaveLength(200);
    expect(report.unmatched.filter(item => item.kind === "polygon")).toEqual([]);
    expect(new Set(report.linked.map(link => link.polygonId)).size).toBe(200);
  });

  it("1,300 villas are read and linked in under five seconds", async () => {
    const started = Date.now();
    const read = await readPdfVector(vectorPlan(1300), 1, loadLegacyPdfJs);
    const report = matchDrawingToUnits(read!.drawing, units(1300));
    expect(report.linked).toHaveLength(1300);
    expect(Date.now() - started).toBeLessThan(5000);
  }, 30_000);

  it("NEGATIVE: a page of open lines has no shapes (the image reading takes over); shapes without numbers link nothing and are listed", async () => {
    expect(await readPdfVector(vectorPlan(20, { onlyLines: true, boundary: false }), 1, loadLegacyPdfJs)).toBeNull();
    const read = await readPdfVector(vectorPlan(20, { noText: true }), 1, loadLegacyPdfJs);
    const report = matchDrawingToUnits(read!.drawing, units(20));
    expect(report.linked).toEqual([]);
    expect(report.unmatched.filter(item => item.kind === "polygon")).toHaveLength(20);
  });
});
