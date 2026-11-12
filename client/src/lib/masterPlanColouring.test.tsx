// Synthetic codes and villas only.
import { describe, expect, it } from "vitest";
import { colourUnits, passesFilter, unitNumberOf, type SiteUnit } from "./masterPlanColouring";

const villas: SiteUnit[] = [
  { unitNumber: 1, modelCode: "A", blockCode: "B1", status: "COMPLETE" },
  { unitNumber: 2, modelCode: "A", blockCode: "B1", status: "IN_PROGRESS" },
  { unitNumber: 3, modelCode: "B", blockCode: "B2", status: null },
  { unitNumber: 4, modelCode: "B", blockCode: "B2", status: "NOT_STARTED" },
];

describe("colouring the plan by a PMC activity (Q-8 b)", () => {
  it("reads the villa number from the last digits of a code", () => {
    expect(unitNumberOf("V-04")).toBe(4);
    expect(unitNumberOf("V0004")).toBe(4);
    expect(unitNumberOf("B1-U-0012")).toBe(12);
    expect(unitNumberOf("Plot")).toBeNull();
    expect(unitNumberOf("V-00")).toBeNull();
  });

  it("colours each linked unit by its villa's status, and counts them — the colouring matches the records", () => {
    const colouring = colourUnits(["V-01", "V-02", "V-03", "V-04", "V-09", "Gate"], villas);
    expect(["V-01", "V-02", "V-03", "V-04", "V-09", "Gate"].map(colouring.keyOf)).toEqual(["COMPLETE", "IN_PROGRESS", "NOT_IN_MODEL", "NOT_STARTED", "NOT_MATCHED", "NOT_MATCHED"]);
    expect(colouring.counts).toEqual({ NOT_STARTED: 1, IN_PROGRESS: 1, UNDER_REVIEW: 0, COMPLETE: 1, RECEIVED: 0, NOT_RECEIVED: 0, NOT_IN_MODEL: 1, NOT_MATCHED: 2 });
  });

  it("filters by block and model; an unmatched unit passes only an empty filter", () => {
    expect(passesFilter(villas[0]!, "B1", "")).toBe(true);
    expect(passesFilter(villas[0]!, "B2", "")).toBe(false);
    expect(passesFilter(villas[2]!, "B2", "B")).toBe(true);
    expect(passesFilter(villas[2]!, "", "A")).toBe(false);
    expect(passesFilter(null, "", "")).toBe(true);
    expect(passesFilter(null, "B1", "")).toBe(false);
  });

  it("QC states colour the same way, apart from the site's", () => {
    const qc: SiteUnit[] = [{ unitNumber: 1, modelCode: "A", blockCode: "B1", status: "RECEIVED" }, { unitNumber: 2, modelCode: "A", blockCode: "B1", status: "NOT_RECEIVED" }];
    const colouring = colourUnits(["V-01", "V-02"], qc);
    expect(["V-01", "V-02"].map(colouring.keyOf)).toEqual(["RECEIVED", "NOT_RECEIVED"]);
    expect([colouring.counts.RECEIVED, colouring.counts.NOT_RECEIVED]).toEqual([1, 1]);
  });
});
