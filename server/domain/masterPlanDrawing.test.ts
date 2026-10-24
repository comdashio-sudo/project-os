import { describe, expect, it } from "vitest";
import { countPdfPages, detectDrawingKind, layoutProblem, MAX_DRAWING_POLYGONS } from "./masterPlanDrawing";

// Work order 16, item 5 (G-189): what the server keeps as a drawing and what a saved layout may hold. Synthetic bytes only.
function pdf(pages: number): Buffer {
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", `<< /Type /Pages /Kids [${Array.from({ length: pages }, (_unused, i) => `${i + 3} 0 R`).join(" ")}] /Count ${pages} >>`];
  for (let i = 0; i < pages; i += 1) objects.push("<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>");
  let body = "%PDF-1.4\n";
  const offsets = objects.map((object, index) => { const at = Buffer.byteLength(body, "latin1"); body += `${index + 1} 0 obj\n${object}\nendobj\n`; return at; });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(at => `${String(at).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}
const bytes = (text: string) => new Uint8Array(Buffer.from(text, "latin1"));
const square = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];

describe("drawing files: what the bytes are", () => {
  it("recognises a PDF, a PNG, a JPEG and a text DXF by content", () => {
    expect(detectDrawingKind(new Uint8Array(pdf(1)))).toEqual({ kind: "pdf", mimeType: "application/pdf" });
    expect(detectDrawingKind(new Uint8Array(Buffer.from("89504e470d0a1a0a0000000d", "hex")))).toEqual({ kind: "png", mimeType: "image/png" });
    expect(detectDrawingKind(new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16]))).toEqual({ kind: "jpeg", mimeType: "image/jpeg" });
    expect(detectDrawingKind(bytes("0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n"))).toEqual({ kind: "dxf", mimeType: "application/dxf" });
  });

  it("refuses anything else: plain text, an empty file, a binary DXF, a PNG cut short", () => {
    expect(detectDrawingKind(bytes("just some words"))).toBeNull();
    expect(detectDrawingKind(new Uint8Array(0))).toBeNull();
    expect(detectDrawingKind(bytes("AutoCAD Binary DXF\r\n\x1a\0SECTION"))).toBeNull();
    expect(detectDrawingKind(new Uint8Array([0x89, 0x50, 0x4e]))).toBeNull();
  });

  it("counts the pages of a PDF as the reader does; a broken PDF has none", async () => {
    expect(await countPdfPages(new Uint8Array(pdf(1)))).toBe(1);
    expect(await countPdfPages(new Uint8Array(pdf(3)))).toBe(3);
    expect(await countPdfPages(bytes("%PDF-1.4\nnot really a document"))).toBe(0);
  }, 60_000);
});

describe("a saved layout: what may be stored", () => {
  it("accepts a layout of distinct references, labels and points", () => {
    expect(layoutProblem([{ ref: "P1", label: "B1-U-0001", points: square }, { ref: "P2", label: "", points: square }])).toBeNull();
    expect(layoutProblem([])).toBeNull();
  });

  it("refuses a repeated reference, too few points, a point that is not a number, an oversized label or reference, and too many shapes", () => {
    expect(layoutProblem([{ ref: "P1", label: "", points: square }, { ref: "P1", label: "", points: square }])).toBe("duplicate_ref");
    expect(layoutProblem([{ ref: "P1", label: "", points: square.slice(0, 2) }])).toBe("bad_points");
    expect(layoutProblem([{ ref: "P1", label: "", points: [{ x: 0, y: 0 }, { x: Number.NaN, y: 0 }, { x: 1, y: 1 }] }])).toBe("bad_points");
    expect(layoutProblem([{ ref: "P1", label: "", points: [{ x: 0, y: 0 }, { x: 5e9, y: 0 }, { x: 1, y: 1 }] }])).toBe("bad_points");
    expect(layoutProblem([{ ref: "P1", label: "x".repeat(121), points: square }])).toBe("bad_label");
    expect(layoutProblem([{ ref: "", label: "", points: square }])).toBe("bad_ref");
    expect(layoutProblem([{ ref: "r".repeat(81), label: "", points: square }])).toBe("bad_ref");
    const many = Array.from({ length: MAX_DRAWING_POLYGONS + 1 }, (_unused, i) => ({ ref: `P${i}`, label: "", points: square }));
    expect(layoutProblem(many)).toBe("too_many_polygons");
  });
});
