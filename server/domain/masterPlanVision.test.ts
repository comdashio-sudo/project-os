import { describe, expect, it } from "vitest";
import { checkVisionImage, parseVisionModelOutput, VISION_CODE_MAX_LENGTH, VISION_IMAGE_MAX_BYTES } from "./masterPlanVision";

// Synthetic data only: fixed shape ids and short codes. No drawing, no names.
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const C = "33333333-3333-4333-8333-333333333333";
const FOREIGN = "44444444-4444-4444-8444-444444444444";
const allowed = new Set([A, B, C]);

const PNG_HEADER = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const JPEG_HEADER = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);
const dataUrl = (mime: string, bytes: Buffer) => `data:${mime};base64,${bytes.toString("base64")}`;
const pngOf = (size: number) => dataUrl("image/png", Buffer.concat([PNG_HEADER, Buffer.alloc(size - PNG_HEADER.length)]));

describe("drawing image check", () => {
  it("accepts a PNG and a JPEG whose bytes match their type, and reports the decoded size", () => {
    expect(checkVisionImage(dataUrl("image/png", PNG_HEADER))).toEqual({ ok: true, mimeType: "image/png", bytes: 8 });
    expect(checkVisionImage(dataUrl("image/jpeg", JPEG_HEADER))).toEqual({ ok: true, mimeType: "image/jpeg", bytes: 4 });
  });

  it("accepts exactly the limit and refuses one byte more", () => {
    expect(checkVisionImage(pngOf(VISION_IMAGE_MAX_BYTES))).toMatchObject({ ok: true, bytes: VISION_IMAGE_MAX_BYTES });
    expect(checkVisionImage(pngOf(VISION_IMAGE_MAX_BYTES + 1))).toEqual({ ok: false, reason: "too_large" });
  });

  it("refuses a string far beyond the limit without a further check", () => {
    expect(checkVisionImage(`data:image/png;base64,${"A".repeat(5_000_000)}`)).toEqual({ ok: false, reason: "too_large" });
  });

  it("refuses other types, other encodings and bad base64", () => {
    for (const value of [
      dataUrl("image/gif", PNG_HEADER),
      dataUrl("image/webp", PNG_HEADER),
      "data:application/pdf;base64,JVBERi0=",
      "https://files.example.test/drawing.png",
      "data:image/png,raw-bytes",
      "data:image/png;base64,iVBORw0KGgo",
      "data:image/png;base64,iVBOR w0KGgo=",
      "",
    ]) {
      expect(checkVisionImage(value), value).toEqual({ ok: false, reason: "invalid" });
    }
  });

  it("refuses a file whose bytes are not the type it claims", () => {
    expect(checkVisionImage(dataUrl("image/png", JPEG_HEADER))).toEqual({ ok: false, reason: "invalid" });
    expect(checkVisionImage(dataUrl("image/jpeg", PNG_HEADER))).toEqual({ ok: false, reason: "invalid" });
    expect(checkVisionImage(dataUrl("image/png", Buffer.from("plain text, not an image")))).toEqual({ ok: false, reason: "invalid" });
  });
});

describe("model output", () => {
  it("keeps a well-formed item for a shape of the request", () => {
    expect(parseVisionModelOutput(JSON.stringify({ shapes: [{ shapeId: A, code: "B1-Z2", confidence: 0.92 }] }), allowed)).toEqual([{ shapeId: A, code: "B1-Z2", confidence: 0.92 }]);
  });

  it("refuses the whole answer when it is not JSON or not the expected shape", () => {
    for (const text of [
      "not json",
      "",
      "[]",
      "null",
      JSON.stringify({ shapes: "many" }),
      JSON.stringify({ items: [] }),
      JSON.stringify({ shapes: [{ shapeId: A, code: "B1", confidence: 0.5 }], extra: { nested: true } }).slice(0, -1),
    ]) {
      expect(parseVisionModelOutput(text, allowed), text).toBeNull();
    }
  });

  it("drops a shape id that was not in the request, and keeps the others", () => {
    const text = JSON.stringify({ shapes: [{ shapeId: FOREIGN, code: "X1", confidence: 0.9 }, { shapeId: B, code: "B-2", confidence: 0.5 }] });
    expect(parseVisionModelOutput(text, allowed)).toEqual([{ shapeId: B, code: "B-2", confidence: 0.5 }]);
  });

  it("drops a code over the length cap, and accepts one exactly at the cap", () => {
    const atCap = "K".repeat(VISION_CODE_MAX_LENGTH);
    const text = JSON.stringify({ shapes: [{ shapeId: A, code: "K".repeat(VISION_CODE_MAX_LENGTH + 1), confidence: 0.5 }, { shapeId: B, code: atCap, confidence: 0.5 }] });
    expect(parseVisionModelOutput(text, allowed)).toEqual([{ shapeId: B, code: atCap, confidence: 0.5 }]);
  });

  it("drops a code with characters outside the whitelist (markup, spaces, instructions)", () => {
    const bad = ["<script>x</script>", "B 1", "B;DROP", "B\"1", "ignore previous", "-B1", "نص", "B1'"];
    for (const code of bad) {
      expect(parseVisionModelOutput(JSON.stringify({ shapes: [{ shapeId: A, code, confidence: 0.5 }] }), allowed), code).toEqual([]);
    }
    expect(parseVisionModelOutput(JSON.stringify({ shapes: [{ shapeId: A, code: " B1.2/x_y-z ", confidence: 0.5 }] }), allowed)).toEqual([{ shapeId: A, code: "B1.2/x_y-z", confidence: 0.5 }]);
  });

  it("drops a confidence outside 0 to 1, or not a number", () => {
    const items = [-0.1, 1.01, "0.9", null, Number.NaN].map(confidence => ({ shapeId: A, code: "B1", confidence }));
    expect(parseVisionModelOutput(JSON.stringify({ shapes: items }), allowed)).toEqual([]);
    expect(parseVisionModelOutput(JSON.stringify({ shapes: [{ shapeId: A, code: "B1", confidence: 1 }] }), allowed)).toEqual([{ shapeId: A, code: "B1", confidence: 1 }]);
  });

  it("drops an item with a missing field, and keeps only the three fields it returns", () => {
    const text = JSON.stringify({ shapes: [{ shapeId: A, code: "B1" }, { shapeId: B, code: "B2", confidence: 0.3, note: "extra" }] });
    expect(parseVisionModelOutput(text, allowed)).toEqual([{ shapeId: B, code: "B2", confidence: 0.3 }]);
  });

  it("keeps the first item for a shape and drops the repeats", () => {
    const text = JSON.stringify({ shapes: [{ shapeId: A, code: "A-1", confidence: 0.4 }, { shapeId: A, code: "A-2", confidence: 0.9 }] });
    expect(parseVisionModelOutput(text, allowed)).toEqual([{ shapeId: A, code: "A-1", confidence: 0.4 }]);
  });

  it("returns nothing when no item is usable, without refusing the answer", () => {
    expect(parseVisionModelOutput(JSON.stringify({ shapes: [] }), allowed)).toEqual([]);
    expect(parseVisionModelOutput(JSON.stringify({ shapes: [{ shapeId: FOREIGN, code: "F", confidence: 0.1 }] }), allowed)).toEqual([]);
  });
});
