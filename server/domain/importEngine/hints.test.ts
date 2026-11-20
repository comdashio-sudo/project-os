import { describe, expect, it } from "vitest";
import { closeness, columnHints, SUGGEST_AT } from "./hints";

// Q-50 batch 3b: where each column came from, and a suggestion for a field not found — never applied. Synthetic headers only.
const fields = [
  { key: "unitNumber", aliases: ["unit number", "unit no", "رقم الوحدة"] },
  { key: "blockCode", aliases: ["block code", "block"] },
  { key: "modelCode", aliases: ["model", "model code"] },
];

describe("closeness", () => {
  it("the same words are 1, one inside the other 0.8, otherwise the share of words in common", () => {
    expect(closeness(" Unit_No ", "unit no")).toBe(1);
    expect(closeness("Unit No.", "unit no")).toBe(1);
    expect(closeness("Villa unit number", "unit number")).toBe(0.8);
    expect(closeness("block ref", "block code")).toBe(0.5);
    expect(closeness("Notes", "model")).toBe(0);
  });

  it("NEGATIVE (review of #458): letters inside a word are not a match — «ID» is not «width», «A» is not «area» — and a one-letter header is close to nothing", () => {
    expect(closeness("ID", "width")).toBe(0);
    expect(closeness("A", "area")).toBe(0);
    expect(closeness("B", "b")).toBe(0);
    expect(closeness("Unit", "unit number")).toBe(0.8); // a whole word of the longer still counts
    expect(columnHints([{ key: "width", aliases: ["width"] }, { key: "code", aliases: ["item code"] }], ["ID", "Description"], { width: null, code: null }, new Set()).width.suggestion).toBeNull();
  });
});

describe("columnHints (Q-50 batch 3b)", () => {
  it("POSITIVE: a field found by its name is sure, one the person picked says so, and a missing one gets the closest free header", () => {
    const hints = columnHints(fields, ["Unit Number", "Block ref", "Kind"], { unitNumber: "Unit Number", blockCode: null, modelCode: "Kind" }, new Set(["modelCode"]));
    expect(hints.unitNumber).toEqual({ source: "name", suggestion: null });
    expect(hints.modelCode).toEqual({ source: "chosen", suggestion: null });
    expect(hints.blockCode).toEqual({ source: null, suggestion: { header: "Block ref", confidence: 0.8 } }); // "block" is inside it
  });

  it("NEGATIVE: nothing close enough is not suggested; a header another field already reads is never suggested again", () => {
    const far = columnHints(fields, ["Notes", "Colour"], { unitNumber: null, blockCode: null, modelCode: null }, new Set());
    expect(far.unitNumber.suggestion).toBeNull();
    expect(far.blockCode.suggestion).toBeNull();
    const taken = columnHints(fields, ["Block code"], { unitNumber: null, blockCode: null, modelCode: "Block code" }, new Set(["modelCode"]));
    expect(taken.blockCode.suggestion).toBeNull();
    expect(SUGGEST_AT).toBe(0.5);
  });

  it("NEGATIVE (found on the real database test): a header as close to another field's names is not offered — «UOM code» is the unit of measure, not the item code", () => {
    const boq = [{ key: "code", aliases: ["code", "item code"] }, { key: "unitOfMeasure", aliases: ["unit", "uom"] }];
    const hints = columnHints(boq, ["Ref", "UOM code"], { code: null, unitOfMeasure: null }, new Set());
    expect(hints.code.suggestion).toBeNull();
    expect(hints.unitOfMeasure.suggestion).toBeNull(); // a tie: 0.8 for both, so neither claims it
    expect(columnHints(boq, ["Item code no"], { code: null, unitOfMeasure: null }, new Set()).code.suggestion).toEqual({ header: "Item code no", confidence: 0.8 });
  });
});
