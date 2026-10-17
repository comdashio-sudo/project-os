import { describe, expect, it } from "vitest";
import { pdfFileName, planPdfPages } from "./pdfExport";

describe("planPdfPages", () => {
  it("returns no pages for an empty or invalid canvas", () => {
    expect(planPdfPages(0, 100, 297, 210)).toEqual([]);
    expect(planPdfPages(100, 0, 297, 210)).toEqual([]);
    expect(planPdfPages(Number.NaN, 100, 297, 210)).toEqual([]);
  });
  it("keeps a screen that fits on one page as one page", () => {
    const pages = planPdfPages(2000, 600, 297, 210);
    expect(pages).toHaveLength(1);
    expect(pages[0]).toMatchObject({ sourceY: 0, sourceHeight: 600 });
  });
  it("cuts a long screen into contiguous slices that cover every pixel exactly once and never exceed the page", () => {
    const width = 2000, height = 9000;
    const pages = planPdfPages(width, height, 297, 210, 8);
    expect(pages.length).toBeGreaterThan(2);
    let expectedY = 0;
    for (const page of pages) {
      expect(page.sourceY).toBe(expectedY);
      expect(page.drawHeightMm).toBeLessThanOrEqual(210 - 16 + 1e-6);
      expectedY += page.sourceHeight;
    }
    expect(expectedY).toBe(height);
  });
});

describe("pdfFileName", () => {
  it("is ASCII only, ends in .pdf with the date, and never carries path or Arabic characters", () => {
    expect(pdfFileName("project-os-pmc-latestUpdates", new Date("2026-10-17T10:00:00Z"))).toBe("project-os-pmc-latestUpdates-2026-10-17.pdf");
    const name = pdfFileName("ضبط/المشروع:PMC — x\\y", new Date("2026-10-17T10:00:00Z"));
    expect(name).toBe("PMC-x-y-2026-10-17.pdf");
    expect(/^[\x20-\x7e]+$/.test(name)).toBe(true);
  });
  it("falls back to a name when nothing usable is left and bounds long names", () => {
    expect(pdfFileName("   ", new Date("2026-10-17T10:00:00Z"))).toBe("export-2026-10-17.pdf");
    expect(pdfFileName("ضبط المشروع", new Date("2026-10-17T10:00:00Z"))).toBe("export-2026-10-17.pdf");
    expect(pdfFileName("x".repeat(500), new Date("2026-10-17T10:00:00Z")).length).toBeLessThanOrEqual(60 + 15);
  });
});
