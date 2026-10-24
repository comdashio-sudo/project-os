/** @vitest-environment node */
import { describe, expect, it } from "vitest";
import { AA_LARGE_TEXT_AND_CONTROL, AA_TEXT, contrastRatio, parseHex, relativeLuminance } from "./contrast";

// Known pairs from the WCAG 2.x definition and the values it is usually quoted with. These check the helper itself; the static
// checks that use it on the app's colours are in accessibility.static.test.tsx.
describe("the WCAG contrast helper", () => {
  it("gives 21:1 for black on white and 1:1 for a colour on itself", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#0c1023", "#0c1023")).toBeCloseTo(1, 5);
  });

  it("is the same in either order", () => {
    expect(contrastRatio("#5f6d8a", "#f5f7fc")).toBeCloseTo(contrastRatio("#f5f7fc", "#5f6d8a"), 10);
  });

  it("passes #767676 on white for normal text (4.54:1) and fails #777777 (4.48:1), the usual edge", () => {
    expect(contrastRatio("#767676", "#ffffff")).toBeCloseTo(4.54, 2);
    expect(contrastRatio("#767676", "#ffffff")).toBeGreaterThanOrEqual(AA_TEXT);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 2);
    expect(contrastRatio("#777777", "#ffffff")).toBeLessThan(AA_TEXT);
  });

  it("passes #949494 on white for large text and controls (3.03:1) and fails #959595 (2.99:1)", () => {
    expect(contrastRatio("#949494", "#ffffff")).toBeCloseTo(3.03, 2);
    expect(contrastRatio("#949494", "#ffffff")).toBeGreaterThanOrEqual(AA_LARGE_TEXT_AND_CONTROL);
    expect(contrastRatio("#959595", "#ffffff")).toBeLessThan(AA_LARGE_TEXT_AND_CONTROL);
  });

  it("reads the short #rgb form the same as #rrggbb", () => {
    expect(parseHex("#fff")).toEqual([255, 255, 255]);
    expect(parseHex("#FFFFFF")).toEqual([255, 255, 255]);
    expect(contrastRatio("#fff", "#000")).toBeCloseTo(21, 5);
  });

  it("has zero luminance for black and one for white", () => {
    expect(relativeLuminance([0, 0, 0])).toBe(0);
    expect(relativeLuminance([255, 255, 255])).toBeCloseTo(1, 10);
  });

  it("refuses a value that is not a hex colour, rather than guessing one", () => {
    expect(() => parseHex("rgb(0, 0, 0)")).toThrow(/not a #rgb or #rrggbb colour/);
    expect(() => contrastRatio("#12345", "#ffffff")).toThrow();
  });
});
