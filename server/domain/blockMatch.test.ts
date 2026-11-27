import { describe, expect, it } from "vitest";
import { matchBlock, toLatinDigits } from "./blockMatch";

// Q-67 (a): the owner typed «33» for the block his project calls «BLK 33» and was told it does not exist.
const block = (code: string, name: string | null = null) => ({ id: `id-${code}`, code, name });
const blocks = [block("BLK 01"), block("BLK 33"), block("BLK 34", "Block thirty four"), block("BLK 05")];
const found = (query: string, list = blocks) => { const result = matchBlock(list, query); return result.ok ? result.block.code : result; };

describe("block matching (Q-67 a)", () => {
  it("the owner's case and its spellings all find BLK 33: the bare number, leading zeros, the dash, the prefix, Arabic digits and Arabic words", () => {
    for (const query of ["33", "033", "BLK 33", "blk33", "B-33", "blk-33", "BLK_33", "بلوك 33", "٣٣", "بلوك ٣٣", " 33 "]) expect(found(query), query).toBe("BLK 33");
  });
  it("a literal match wins, and by name too; the step that found it is reported", () => {
    const literal = matchBlock(blocks, "BLK 34"); expect(literal).toMatchObject({ ok: true, via: "literal" });
    expect(found("Block thirty four")).toBe("BLK 34");
    expect(matchBlock(blocks, "blk 33")).toMatchObject({ ok: true, via: "folded" });
    expect(matchBlock(blocks, "33")).toMatchObject({ ok: true, via: "number" });
  });
  it("two blocks for one number are refused with both options, never guessed (a different prefix: BLK 33 and TWR 33)", () => {
    const both = [block("BLK 33"), block("TWR 33"), block("BLK 01")];
    expect(matchBlock(both, "33")).toEqual({ ok: false, reason: "ambiguous", options: ["BLK 33", "TWR 33"] });
    expect(found("BLK 33", both)).toBe("BLK 33"); // the full code is never ambiguous
  });
  it("a block that is not there is refused; the closest one is named when there is exactly one", () => {
    expect(matchBlock(blocks, "99")).toEqual({ ok: false, reason: "unknown", suggestion: null });
    expect(matchBlock(blocks, "")).toEqual({ ok: false, reason: "unknown", suggestion: null });
    expect(matchBlock(blocks, "BLK 330")).toEqual({ ok: false, reason: "unknown", suggestion: "BLK 33" }); // typed more than there is
  });
  it("a code with two numbers is not matched by one of them, and Arabic digits fold to Latin", () => {
    expect(matchBlock([block("B2-33")], "33")).toMatchObject({ ok: false, reason: "unknown" });
    expect(toLatinDigits("٠١٢٣٤٥٦٧٨٩ ۰۱۲۳۴۵۶۷۸۹ abc")).toBe("0123456789 0123456789 abc");
  });
});

import { expandVillaRange } from "../pmcSiteService";
import { villaKey } from "../wo22Shared";
describe("villa numbers and ranges in Arabic digits (Q-67 a)", () => {
  it("«٢٦٨» is villa 268 and «٢٦٨-٢٧٢» is the range 268-272, like the Latin forms", () => {
    expect(villaKey("٢٦٨")).toBe("268");
    expect(villaKey("V-٠٢٦٨")).toBe("268");
    expect(expandVillaRange("٢٦٨-٢٧٠", ["267", "268", "269", "270", "271"])).toEqual(["268", "269", "270"]);
    expect(expandVillaRange("268-270", ["267", "268", "269", "270", "271"])).toEqual(["268", "269", "270"]);
    expect(expandVillaRange("٢٦٨", ["268"])).toEqual(["268"]);
    expect(expandVillaRange("abc", ["268"])).toBeNull();
  });
});
