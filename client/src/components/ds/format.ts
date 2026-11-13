// The ONE place numbers, sizes and dates are written for the screen. Western digits 0-9 and a dot as the decimal mark in every language (work order 19, rule 4; docs/TASLEEM_LESSONS.md
// section 6): the "latn" numbering system is named explicitly, so a browser that would print Arabic-Indic digits for an Arabic locale cannot. Nothing else formats a number for display.
import type { Language } from "@/lib/language";

const LOCALE: Record<Language, string> = { ar: "ar-u-nu-latn", en: "en-US-u-nu-latn", ur: "ur-u-nu-latn" };

/** 1234567.891 -> "1,234,567.89". The grouping mark is a comma and the decimal mark a dot, in all three languages. */
export function formatNumber(value: number, decimals = 0): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals, useGrouping: true }).format(value);
}

/** 71740953.269 -> "71,740,953.27", 1200 -> "1,200": an amount, grouped, with at most `maxDecimals` decimals and no padding zeros. */
export function formatAmount(value: number, maxDecimals = 2): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: maxDecimals, useGrouping: true }).format(value);
}

/** 62 -> "62.00%". A percentage always carries its sign, with a fixed number of decimals for its kind (progress 2, a row's share 4, a count's share 1). */
export function formatPercent(value: number, decimals = 2): string {
  return `${formatNumber(value, decimals)}%`;
}

/** 1536 -> "1.5 KB". Binary units spelled in Latin letters, the same in every language. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${formatNumber(bytes)} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024; let unit = 0;
  while (value >= 1024 && unit < units.length - 1) { value /= 1024; unit += 1; }
  const decimals = value >= 100 || Number.isInteger(Math.round(value * 10) / 10) ? 0 : 1;
  return `${formatNumber(value, decimals)} ${units[unit]}`;
}

/** 2026-10-25 -> "25 Oct 2026" in the month names of the language, digits Western. */
export function formatDate(value: Date | string, language: Language): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(LOCALE[language], { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(date);
}

/** 2026-10-24 -> "24/10/2026": the short numeric date of the field screens, Western digits and the Gregorian calendar in every language. */
export function formatShortDate(value: Date, language: Language): string {
  const locale = language === "ar" ? "ar-SA-u-nu-latn-ca-gregory" : language === "ur" ? "ur-PK-u-nu-latn" : "en-GB";
  return new Intl.DateTimeFormat(locale, { year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC" }).format(value);
}

/** "2026-11-09" -> "Monday" / "الاثنين" / "پیر": the weekday of a calendar day (read as UTC, so the day never shifts with the device's zone). */
export function formatWeekday(isoDay: string, language: Language): string {
  // a cleared or half-typed date field gives "" or a day that does not exist: a dash, never a thrown RangeError that takes the screen down
  const day = /^\d{4}-\d{2}-\d{2}$/.test(isoDay) ? new Date(`${isoDay}T00:00:00Z`) : null;
  if (!day || Number.isNaN(day.getTime())) return "—";
  return new Intl.DateTimeFormat(LOCALE[language], { weekday: "long", timeZone: "UTC" }).format(day);
}

/** 2026-10-25T09:05 -> "25 Oct 2026, 09:05" in the month names of the language, digits Western, in the device's own zone (a moment someone did something). */
export function formatDateTime(value: Date | string, language: Language): string {
  const date = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat(LOCALE[language], { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(date);
}
