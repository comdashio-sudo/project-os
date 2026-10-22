import { describe, expect, it } from "vitest";
import { DESIGN_DISCIPLINES } from "@shared/designDisciplines";
import { checkReferralNumberUnique, DISCIPLINE_CODES, formatReferralNumber, nextReferralNumber, parseReferralNumber } from "./referralNumbering";

describe("referral number format", () => {
  it("gives every discipline its own letter, and the letters are distinct", () => {
    expect(Object.keys(DISCIPLINE_CODES).sort()).toEqual([...DESIGN_DISCIPLINES].sort());
    expect(new Set(Object.values(DISCIPLINE_CODES)).size).toBe(DESIGN_DISCIPLINES.length);
  });

  it("formats <project>-<discipline>-<sequence padded to four digits>", () => {
    expect(formatReferralNumber("DEMO", "structural", 1)).toEqual({ ok: true, value: "DEMO-S-0001" });
    expect(formatReferralNumber("DEMO-2", "fire_fighting", 42)).toEqual({ ok: true, value: "DEMO-2-F-0042" });
    expect(formatReferralNumber("DEMO", "other", 9999)).toEqual({ ok: true, value: "DEMO-X-9999" });
  });

  it("refuses a project code that cannot sit in a number, a sequence out of range, and a sequence that is not a whole number", () => {
    expect(formatReferralNumber("demo", "structural", 1)).toEqual({ ok: false, code: "REFERRAL_PROJECT_CODE_INVALID" });
    expect(formatReferralNumber("DEMO SITE", "structural", 1)).toEqual({ ok: false, code: "REFERRAL_PROJECT_CODE_INVALID" });
    expect(formatReferralNumber("DEMO-", "structural", 1)).toEqual({ ok: false, code: "REFERRAL_PROJECT_CODE_INVALID" });
    expect(formatReferralNumber("", "structural", 1)).toEqual({ ok: false, code: "REFERRAL_PROJECT_CODE_INVALID" });
    expect(formatReferralNumber("A".repeat(33), "structural", 1)).toEqual({ ok: false, code: "REFERRAL_PROJECT_CODE_INVALID" });
    expect(formatReferralNumber("DEMO", "structural", 0)).toEqual({ ok: false, code: "REFERRAL_SEQUENCE_INVALID" });
    expect(formatReferralNumber("DEMO", "structural", 10000)).toEqual({ ok: false, code: "REFERRAL_SEQUENCE_INVALID" });
    expect(formatReferralNumber("DEMO", "structural", 1.5)).toEqual({ ok: false, code: "REFERRAL_SEQUENCE_INVALID" });
    expect(formatReferralNumber("DEMO", "unknown" as never, 1)).toEqual({ ok: false, code: "REFERRAL_DISCIPLINE_UNKNOWN" });
  });
});

describe("referral number parse", () => {
  it("reads a number back to its project, discipline and sequence", () => {
    expect(parseReferralNumber("DEMO-S-0007")).toEqual({ ok: true, projectCode: "DEMO", discipline: "structural", sequence: 7 });
  });

  it("reads a project code that has hyphens in it, working from the right", () => {
    expect(parseReferralNumber("DEMO-2-M-0100")).toEqual({ ok: true, projectCode: "DEMO-2", discipline: "mechanical", sequence: 100 });
  });

  it("rejects malformed text with a named error", () => {
    for (const value of ["", "DEMO-S-001", "DEMO-S-00001", "DEMO-S-0000", "DEMO-S", "demo-s-0001", "DEMO-s-0001", " DEMO-S-0001", "DEMO-S-0001 ", "DEMO_S_0001", "DEMO-S-000A"]) {
      expect(parseReferralNumber(value)).toEqual({ ok: false, code: "REFERRAL_NUMBER_MALFORMED" });
    }
  });

  it("rejects a discipline letter that is not one of the discipline codes, and names it", () => {
    expect(parseReferralNumber("DEMO-B-0001")).toEqual({ ok: false, code: "REFERRAL_DISCIPLINE_UNKNOWN" });
  });

  it("round-trips every discipline", () => {
    for (const discipline of DESIGN_DISCIPLINES) {
      const formatted = formatReferralNumber("DEMO", discipline, 5);
      expect(formatted.ok && parseReferralNumber(formatted.value)).toEqual({ ok: true, projectCode: "DEMO", discipline, sequence: 5 });
    }
  });
});

describe("next referral sequence", () => {
  it("starts at 0001 for a project and discipline with no numbers yet", () => {
    expect(nextReferralNumber([], "DEMO", "structural")).toEqual({ ok: true, sequence: 1, value: "DEMO-S-0001" });
  });

  it("takes the highest issued plus one, so a gap is not filled and nothing is reused", () => {
    const existing = ["DEMO-S-0001", "DEMO-S-0002", "DEMO-S-0005"];
    expect(nextReferralNumber(existing, "DEMO", "structural")).toEqual({ ok: true, sequence: 6, value: "DEMO-S-0006" });
    expect(nextReferralNumber(["DEMO-S-0009", "DEMO-S-0001"], "DEMO", "structural")).toMatchObject({ value: "DEMO-S-0010" });
  });

  it("ignores numbers of another discipline and of another project, which share the same register", () => {
    const existing = ["DEMO-A-0007", "DEMO-S-0002", "OTHER-S-0900", "DEMO-2-S-0800"];
    expect(nextReferralNumber(existing, "DEMO", "structural")).toMatchObject({ value: "DEMO-S-0003" });
    expect(nextReferralNumber(existing, "DEMO", "architectural")).toMatchObject({ value: "DEMO-A-0008" });
    expect(nextReferralNumber(existing, "DEMO-2", "structural")).toMatchObject({ value: "DEMO-2-S-0801" });
  });

  it("ignores stored text that does not parse, and reads stored text in upper case as the uniqueness check does", () => {
    expect(nextReferralNumber(["TR-001", "garbage", "DEMO-S-"], "DEMO", "structural")).toMatchObject({ value: "DEMO-S-0001" });
    expect(nextReferralNumber(["demo-s-0004"], "DEMO", "structural")).toMatchObject({ value: "DEMO-S-0005" });
  });

  it("refuses when the sequence is used up at 9999, and refuses an invalid project code", () => {
    expect(nextReferralNumber(["DEMO-S-9999"], "DEMO", "structural")).toEqual({ ok: false, code: "REFERRAL_SEQUENCE_EXHAUSTED" });
    expect(nextReferralNumber(["DEMO-S-9998"], "DEMO", "structural")).toMatchObject({ value: "DEMO-S-9999" });
    expect(nextReferralNumber([], "demo", "structural")).toEqual({ ok: false, code: "REFERRAL_PROJECT_CODE_INVALID" });
  });
});

describe("referral number uniqueness", () => {
  it("accepts a number nobody has issued", () => {
    expect(checkReferralNumberUnique("DEMO-S-0004", ["DEMO-S-0003"])).toEqual({ ok: true });
  });

  it("refuses a number already issued, and ignores case and surrounding spaces, as the database collation does", () => {
    expect(checkReferralNumberUnique("DEMO-S-0003", ["DEMO-S-0003"])).toEqual({ ok: false, code: "REFERRAL_NUMBER_TAKEN" });
    expect(checkReferralNumberUnique("demo-s-0003", ["DEMO-S-0003"])).toEqual({ ok: false, code: "REFERRAL_NUMBER_TAKEN" });
    expect(checkReferralNumberUnique(" DEMO-S-0003 ", ["demo-s-0003"])).toEqual({ ok: false, code: "REFERRAL_NUMBER_TAKEN" });
  });

  it("accepts anything when nothing is issued yet", () => {
    expect(checkReferralNumberUnique("DEMO-S-0001", [])).toEqual({ ok: true });
  });
});
