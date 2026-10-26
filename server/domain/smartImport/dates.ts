import { toLatinDigits } from "./numbers";

// Dates as they arrive: Excel serial numbers, JS dates, 2026-09-15, 15/09/2026, 15-9-26, 15.09.2026, "15 سبتمبر 2026", "15 Sep 2026", and HIJRI dates ("15/03/1448هـ", "15 ربيع الأول 1448").
// Order (day/month vs month/day) is decided for a COLUMN from all its values, not cell by cell. The Hijri conversion is the arithmetic (tabular) calendar: it can be a day away from the
// Umm al-Qura calendar the Kingdom publishes, so a converted date is always marked `approximate` and the preview says so.
export type ParsedDate = { iso: string; calendar: "gregorian" | "hijri"; approximate: boolean };
export type DateOrder = "dmy" | "mdy";

const GREGORIAN_MONTHS: Record<string, number> = {
  يناير: 1, فبراير: 2, مارس: 3, ابريل: 4, أبريل: 4, مايو: 5, ماي: 5, يونيو: 6, يونيه: 6, يوليو: 7, يوليه: 7, اغسطس: 8, أغسطس: 8, سبتمبر: 9, اكتوبر: 10, أكتوبر: 10, نوفمبر: 11, ديسمبر: 12,
  "كانون الثاني": 1, شباط: 2, اذار: 3, آذار: 3, نيسان: 4, ايار: 5, أيار: 5, حزيران: 6, تموز: 7, اب: 8, آب: 8, ايلول: 9, أيلول: 9, "تشرين الاول": 10, "تشرين الأول": 10, "تشرين الثاني": 11, "كانون الاول": 12, "كانون الأول": 12,
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
};
const HIJRI_MONTHS: Record<string, number> = {
  محرم: 1, صفر: 2, "ربيع الاول": 3, "ربيع الأول": 3, "ربيع الثاني": 4, "ربيع الاخر": 4, "ربيع الآخر": 4, "جمادى الاولى": 5, "جمادى الأولى": 5, "جمادى الاخرة": 6, "جمادى الآخرة": 6, "جمادى الثانية": 6,
  رجب: 7, شعبان: 8, رمضان: 9, شوال: 10, "ذو القعدة": 11, "ذي القعدة": 11, "ذو الحجة": 12, "ذي الحجة": 12,
};
const normalizeWord = (word: string) => word.replace(/[ً-ٰٟـ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const lookup = (table: Record<string, number>, word: string) => { const key = normalizeWord(word); return table[key] ?? table[key.replace(/[أإآ]/g, "ا")]; };

const pad = (value: number) => String(value).padStart(2, "0");
const validGregorian = (y: number, m: number, d: number) => { if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return false; const date = new Date(Date.UTC(y, m - 1, d)); return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d; };
const isoOf = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;

// ---- tabular Islamic calendar -> Gregorian (civil epoch) -------------------------------------------------------------------------------------------------------------------------
const islamicToJd = (y: number, m: number, d: number) => d + Math.ceil(29.5 * (m - 1)) + (y - 1) * 354 + Math.floor((3 + 11 * y) / 30) + 1948439.5 - 1;
function jdToGregorian(jd: number): { y: number; m: number; d: number } {
  const z = Math.floor(jd + 0.5); const a = Math.floor((z - 1867216.25) / 36524.25); const aa = z + 1 + a - Math.floor(a / 4); const b = aa + 1524; const c = Math.floor((b - 122.1) / 365.25); const dd = Math.floor(365.25 * c); const e = Math.floor((b - dd) / 30.6001);
  const day = b - dd - Math.floor(30.6001 * e); const month = e < 14 ? e - 1 : e - 13; const year = month > 2 ? c - 4716 : c - 4715;
  return { y: year, m: month, d: day };
}
export function hijriToGregorian(y: number, m: number, d: number): { iso: string } | null {
  if (y < 1300 || y > 1500 || m < 1 || m > 12 || d < 1 || d > 30) return null;
  const g = jdToGregorian(islamicToJd(y, m, d));
  return validGregorian(g.y, g.m, g.d) ? { iso: isoOf(g.y, g.m, g.d) } : null;
}

const excelSerialToIso = (serial: number): string | null => {
  if (!Number.isFinite(serial) || serial < 20000 || serial > 80000) return null; // 1954 .. 2119: a plain number like 12.5 or 4500 is not a date
  const date = new Date(Date.UTC(1899, 11, 30) + Math.floor(serial) * 86_400_000);
  return isoOf(date.getUTCFullYear(), date.getUTCMonth() + 1, date.getUTCDate());
};

const twoDigitYear = (y: number) => (y < 100 ? (y >= 70 ? 1900 + y : 2000 + y) : y);

type Triple = { a: number; b: number; c: number; kind: "ymd" | "xyz" };
function splitNumeric(text: string): Triple | null {
  const t = text.replace(/\s*(هـ|ه|هجري|h|ah)\.?\s*$/i, "").replace(/\s*(م|ميلادي|gregorian|ad)\.?\s*$/i, "");
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/.exec(t);
  if (m) return { a: Number(m[1]), b: Number(m[2]), c: Number(m[3]), kind: "ymd" };
  m = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[ T].*)?$/.exec(t);
  if (m) return { a: Number(m[1]), b: Number(m[2]), c: Number(m[3]), kind: "xyz" };
  return null;
}
const isHijriMarked = (text: string) => /(هـ|هجري|\bah\b|\bh\b)\s*\.?$/i.test(text.trim());

/** Which order a column of numeric dates uses: decided by a value that cannot be the other way round; day-first (the region's habit) when nothing decides. */
export function inferDateOrder(values: unknown[]): DateOrder {
  let dmy = 0; let mdy = 0;
  for (const value of values) {
    if (typeof value !== "string") continue;
    const parts = splitNumeric(toLatinDigits(value.trim()));
    if (!parts || parts.kind !== "xyz") continue;
    if (parts.a > 12 && parts.b <= 12) dmy += 1;
    if (parts.b > 12 && parts.a <= 12) mdy += 1;
  }
  return mdy > dmy ? "mdy" : "dmy";
}

export function parseDate(input: unknown, order: DateOrder = "dmy"): ParsedDate | null {
  if (input instanceof Date) return Number.isFinite(input.getTime()) ? { iso: isoOf(input.getUTCFullYear(), input.getUTCMonth() + 1, input.getUTCDate()), calendar: "gregorian", approximate: false } : null;
  if (typeof input === "number") { const iso = excelSerialToIso(input); return iso ? { iso, calendar: "gregorian", approximate: false } : null; }
  if (typeof input !== "string") return null;
  const text = toLatinDigits(input).replace(/ |‏|‎/g, " ").trim();
  if (!text) return null;
  const hijriMarked = isHijriMarked(text);
  const numeric = splitNumeric(text);
  if (numeric) {
    const year4 = numeric.kind === "ymd" ? numeric.a : numeric.c;
    const [dayFirst, monthFirst] = numeric.kind === "ymd" ? [numeric.c, numeric.b] : order === "dmy" ? [numeric.a, numeric.b] : [numeric.b, numeric.a];
    const year = numeric.kind === "ymd" ? year4 : twoDigitYear(year4);
    if (hijriMarked || (year >= 1300 && year <= 1500)) { const converted = hijriToGregorian(year, monthFirst, dayFirst); return converted ? { iso: converted.iso, calendar: "hijri", approximate: true } : null; }
    return validGregorian(year, monthFirst, dayFirst) ? { iso: isoOf(year, monthFirst, dayFirst), calendar: "gregorian", approximate: false } : null;
  }
  // "15 سبتمبر 2026" · "15 Sep 2026" · "Sep 15, 2026" · "15 ربيع الأول 1448 هـ"
  const words = /^(\d{1,2})\s+([^\d]+?)\s+(\d{4})\s*(?:هـ|هجري|ه|م|ميلادي)?\.?$/.exec(text) ?? null;
  if (words) {
    const day = Number(words[1]); const year = Number(words[3]); const name = words[2].replace(/[,،]/g, "").trim();
    const hMonth = lookup(HIJRI_MONTHS, name);
    if (hMonth && year >= 1300 && year <= 1500) { const converted = hijriToGregorian(year, hMonth, day); return converted ? { iso: converted.iso, calendar: "hijri", approximate: true } : null; }
    const gMonth = lookup(GREGORIAN_MONTHS, name);
    if (gMonth && validGregorian(year, gMonth, day)) return { iso: isoOf(year, gMonth, day), calendar: "gregorian", approximate: false };
    return null;
  }
  const usStyle = /^([A-Za-z]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/.exec(text);
  if (usStyle) { const month = lookup(GREGORIAN_MONTHS, usStyle[1]); const day = Number(usStyle[2]); const year = Number(usStyle[3]); if (month && validGregorian(year, month, day)) return { iso: isoOf(year, month, day), calendar: "gregorian", approximate: false }; }
  return null;
}
