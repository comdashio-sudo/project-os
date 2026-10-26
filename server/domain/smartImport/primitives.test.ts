import { describe, expect, it } from "vitest";
import { hijriToGregorian, inferDateOrder, parseDate } from "./dates";
import { parseNumber, toLatinDigits } from "./numbers";
import { normalizeUnit } from "./units";

describe("numbers as people write them", () => {
  it.each([
    ["١٢٣٤", 1234], ["١٬٢٣٤٫٥٦", 1234.56], ["1,234.56", 1234.56], ["1.234,56", 1234.56], ["1 250 000", 1250000], ["12,5", 12.5], ["1,234", 1234], ["1,234,567", 1234567],
    ["(1,500)", -1500], ["1500-", -1500], ["-45", -45], ["۱۲۳", 123], ["12 ر.س", 12], ["45,000 SAR", 45000], ["0,125", 0.125], ["1.234.567", 1234567], ["٠٫٥", 0.5],
  ])("reads %s as %d", (text, expected) => { expect(parseNumber(text)?.value).toBeCloseTo(expected as number, 6); });
  it("a percent sign is reported, not dropped", () => { expect(parseNumber("45%")).toEqual({ value: 45, percent: true }); expect(parseNumber("٤٥٪")).toEqual({ value: 45, percent: true }); });
  it("NEGATIVE: words, codes and empty cells are not numbers", () => { for (const text of ["", "abc", "A-12", "1.2.x", "المجموع", "—"]) expect(parseNumber(text)).toBeNull(); });
  it("Eastern digits become Western ones", () => { expect(toLatinDigits("٠١٢٣٤٥٦٧٨٩ ۰۱۲")).toBe("0123456789 012"); });
});

describe("units as written on site", () => {
  it.each([["م3", "m3"], ["م³", "m3"], ["m3", "m3"], ["CUM", "m3"], ["متر مكعب", "m3"], ["م2", "m2"], ["sqm", "m2"], ["م.ط", "m"], ["طن", "ton"], ["Nos.", "no"], ["مقطوعية", "ls"], ["kg", "kg"], ["كجم", "kg"]])("%s is %s", (text, code) => { expect(normalizeUnit(text).code).toBe(code); });
  it("NEGATIVE: what cannot be read stays as written and is never guessed", () => { expect(normalizeUnit("زوج غريب")).toEqual({ code: null, raw: "زوج غريب" }); expect(normalizeUnit("")).toEqual({ code: null, raw: "" }); });
});

describe("dates in their many forms", () => {
  it("Gregorian numeric, day first by default", () => {
    expect(parseDate("15/09/2026")?.iso).toBe("2026-09-15"); expect(parseDate("15-9-26")?.iso).toBe("2026-09-15"); expect(parseDate("15.09.2026")?.iso).toBe("2026-09-15"); expect(parseDate("2026-09-15")?.iso).toBe("2026-09-15"); expect(parseDate("٢٠٢٦/٠٩/١٥")?.iso).toBe("2026-09-15");
  });
  it("the column decides the order: a 25 in the first slot makes the column day-first, in the second slot month-first", () => {
    expect(inferDateOrder(["25/03/2026", "01/04/2026"])).toBe("dmy"); expect(inferDateOrder(["03/25/2026", "04/01/2026"])).toBe("mdy"); expect(inferDateOrder(["01/02/2026"])).toBe("dmy");
    expect(parseDate("03/25/2026", "mdy")?.iso).toBe("2026-03-25");
  });
  it("month names in Arabic (both naming systems) and English", () => {
    expect(parseDate("15 سبتمبر 2026")?.iso).toBe("2026-09-15"); expect(parseDate("15 أيلول 2026")?.iso).toBe("2026-09-15"); expect(parseDate("15 Sep 2026")?.iso).toBe("2026-09-15"); expect(parseDate("Sep 15, 2026")?.iso).toBe("2026-09-15"); expect(parseDate("٢ كانون الثاني ٢٠٢٦")?.iso).toBe("2026-01-02");
  });
  it("Excel serials and Date objects; a plain number is not a date", () => {
    expect(parseDate(46280)?.iso).toBe("2026-09-15"); expect(parseDate(new Date(Date.UTC(2026, 8, 15)))?.iso).toBe("2026-09-15"); expect(parseDate(12.5)).toBeNull(); expect(parseDate(4500)).toBeNull();
  });
  it("Hijri dates convert, within a day of the Umm al-Qura calendar, and are marked approximate", () => {
    const rajab = parseDate("15/07/1447هـ"); expect(rajab?.calendar).toBe("hijri"); expect(rajab?.approximate).toBe(true);
    const within = (iso: string, expected: string) => Math.abs(Date.parse(iso) - Date.parse(expected)) <= 86_400_000;
    expect(within(hijriToGregorian(1447, 1, 1)!.iso, "2025-06-26")).toBe(true); // 1 Muharram 1447
    expect(within(hijriToGregorian(1447, 9, 1)!.iso, "2026-02-18")).toBe(true); // 1 Ramadan 1447
    expect(within(parseDate("١ رمضان ١٤٤٧ هـ")!.iso, "2026-02-18")).toBe(true);
    expect(parseDate("1447-09-01")?.calendar).toBe("hijri"); // a year in the 1400s is Hijri even without a mark
  });
  it("NEGATIVE: impossible dates and prose are refused", () => { for (const text of ["31/02/2026", "32/01/2026", "غدا", "", "15 شيء 2026"]) expect(parseDate(text)).toBeNull(); expect(hijriToGregorian(1447, 13, 1)).toBeNull(); });
});
