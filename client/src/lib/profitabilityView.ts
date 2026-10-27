import { isRtlLanguage, pickLanguage, resolveLanguage, type Language } from "./language";

// Presentation helpers for the profitability screen. No arithmetic on money
// lives here: every figure arrives computed from the server.

export type Source = "progress" | "materials" | "labour";

// Inside right-to-left text a figure such as "-90,000 SAR" is reordered by the bidi
// algorithm ("SAR 90,000-"). Wrapping it in a left-to-right isolate keeps the sign,
// the number and the currency in reading order.
const LRI = "\u2066";
const PDI = "\u2069";
const isolate = (text: string, language: Language | boolean) => (isRtlLanguage(resolveLanguage(language)) ? `${LRI}${text}${PDI}` : text);

/** The riyal's label: "ريال" in Arabic, "SAR" in English and Urdu. V1 shows the riyal everywhere (owner decision, 22 Oct 2026). */
export const riyalLabel = (language: Language | boolean) => pickLanguage(resolveLanguage(language), { ar: "ريال", en: "SAR", ur: "ریال" });

/**
 * A money figure in the riyal. V1 has one currency, so `currency` is ignored: a stored code (even a legacy "USD") is still shown
 * as the riyal. The argument stays so the call sites keep their shape; the server refuses any other code on input.
 */
export function formatMoney(value: number, currency: string, language: Language | boolean, fractionDigits = 0) {
  void currency;
  const lang = resolveLanguage(language);
  const number = new Intl.NumberFormat(numberLocale(lang), { minimumFractionDigits: fractionDigits, maximumFractionDigits: fractionDigits }).format(Math.abs(value));
  return isolate(`${value < 0 ? "-" : ""}${number} ${riyalLabel(lang)}`, lang);
}

/** The digits and grouping: Arabic and Urdu keep Latin digits (the screen reads the same numbers in every language). */
const numberLocale = (lang: Language) => pickLanguage(lang, { ar: "ar-SA-u-nu-latn", en: "en-US", ur: "ur-PK-u-nu-latn" });

export const formatPercent = (value: number | null, language: Language | boolean) => {
  const lang = resolveLanguage(language);
  return value === null ? "—" : isolate(`${new Intl.NumberFormat(numberLocale(lang), { signDisplay: "negative", maximumFractionDigits: 1 }).format(value)}%`, lang);
};

/** Colour and arrow for a profit change: profit going up is good, down is bad. */
export function trend(delta: number): { tone: "good" | "bad" | "flat"; arrow: "▲" | "▼" | "■" } {
  if (delta > 0) return { tone: "good", arrow: "▲" };
  if (delta < 0) return { tone: "bad", arrow: "▼" };
  return { tone: "flat", arrow: "■" };
}

/** Where in the project screen each data source is updated. */
export const sourceAnchor: Record<Source, string> = { progress: "#manager-schedule", materials: "#manager-site", labour: "#manager-site" };

export function ageSentence(ageDays: number | null, language: Language | boolean) {
  const lang = resolveLanguage(language);
  if (ageDays === null) return pickLanguage(lang, { ar: "لم يُسجَّل بعد", en: "never recorded", ur: "ابھی تک درج نہیں ہوا" });
  if (ageDays === 0) return pickLanguage(lang, { ar: "اليوم", en: "today", ur: "آج" });
  if (lang === "en") return `${ageDays} day${ageDays === 1 ? "" : "s"} ago`;
  if (lang === "ur") return ageDays === 1 ? "ایک دن پہلے" : ageDays === 2 ? "دو دن پہلے" : `${ageDays} دن پہلے`;
  if (ageDays === 1) return "قبل يوم";
  if (ageDays === 2) return "قبل يومين";
  return ageDays <= 10 ? `قبل ${ageDays} أيام` : `قبل ${ageDays} يومًا`;
}

/** A polyline for the FPAC trend, scaled into a width x height box. */
export function sparklinePoints(values: readonly number[], width: number, height: number) {
  if (values.length < 2) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return values.map((value, index) => `${Math.round((index / (values.length - 1)) * width)},${Math.round(height - ((value - min) / span) * height)}`).join(" ");
}

/**
 * Where a cost entry's source document lives, so the drill-down can lead there (G-023). The record screens are
 * sections of the project controls page, which opens the section named in the link; payroll has its own page.
 */
export function sourceRoute(sourceType: string | null | undefined, tenantId: string, projectId: string): { href: string; label: { ar: string; en: string; ur: string } } | null {
  const controls = `/projects/${tenantId}/${projectId}/controls`;
  switch (sourceType) {
    case "goods_receipt_note": return { href: `${controls}#manager-commercial`, label: { ar: "إيصال استلام", en: "Goods receipt", ur: "سامان کی وصولی" } };
    case "purchase_order": return { href: `${controls}#manager-commercial`, label: { ar: "أمر الشراء", en: "Purchase order", ur: "خریداری کا آرڈر" } };
    case "material_issue": return { href: `${controls}#manager-site`, label: { ar: "صرف مادة", en: "Material issue", ur: "مادّے کا اجرا" } };
    case "time_entry": return { href: `${controls}#manager-site`, label: { ar: "إدخال وقت", en: "Time entry", ur: "کام کے گھنٹوں کا اندراج" } };
    case "payroll_allocation": return { href: `/payroll/${tenantId}`, label: { ar: "تخصيص رواتب", en: "Payroll allocation", ur: "تنخواہ کا مختص" } };
    default: return null;
  }
}
