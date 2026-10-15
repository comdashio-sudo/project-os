// Presentation helpers for the profitability screen. No arithmetic on money
// lives here: every figure arrives computed from the server.

export type Source = "progress" | "materials" | "labour";

// Inside right-to-left text a figure such as "-90,000 SAR" is reordered by the bidi
// algorithm ("SAR 90,000-"). Wrapping it in a left-to-right isolate keeps the sign,
// the number and the currency in reading order.
const LRI = "\u2066";
const PDI = "\u2069";
const isolate = (text: string, isArabic: boolean) => (isArabic ? `${LRI}${text}${PDI}` : text);

export function formatMoney(value: number, currency: string, isArabic: boolean) {
  const number = new Intl.NumberFormat(isArabic ? "ar-SA-u-nu-latn" : "en-US", { maximumFractionDigits: 0 }).format(Math.abs(value));
  return isolate(`${value < 0 ? "-" : ""}${number} ${currency}`, isArabic);
}

export const formatPercent = (value: number | null, isArabic: boolean) => (value === null ? "—" : isolate(`${new Intl.NumberFormat(isArabic ? "ar-SA-u-nu-latn" : "en-US", { signDisplay: "negative", maximumFractionDigits: 1 }).format(value)}%`, isArabic));

/** Colour and arrow for a profit change: profit going up is good, down is bad. */
export function trend(delta: number): { tone: "good" | "bad" | "flat"; arrow: "▲" | "▼" | "■" } {
  if (delta > 0) return { tone: "good", arrow: "▲" };
  if (delta < 0) return { tone: "bad", arrow: "▼" };
  return { tone: "flat", arrow: "■" };
}

/** Where in the project screen each data source is updated. */
export const sourceAnchor: Record<Source, string> = { progress: "#manager-schedule", materials: "#manager-site", labour: "#manager-site" };

export function ageSentence(ageDays: number | null, isArabic: boolean) {
  if (ageDays === null) return isArabic ? "لم يُسجَّل بعد" : "never recorded";
  if (ageDays === 0) return isArabic ? "اليوم" : "today";
  if (!isArabic) return `${ageDays} day${ageDays === 1 ? "" : "s"} ago`;
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
export function sourceRoute(sourceType: string | null | undefined, tenantId: string, projectId: string): { href: string; label: { ar: string; en: string } } | null {
  const controls = `/projects/${tenantId}/${projectId}/controls`;
  switch (sourceType) {
    case "goods_receipt_note": return { href: `${controls}#manager-commercial`, label: { ar: "إيصال استلام", en: "Goods receipt" } };
    case "purchase_order": return { href: `${controls}#manager-commercial`, label: { ar: "أمر شراء", en: "Purchase order" } };
    case "material_issue": return { href: `${controls}#manager-site`, label: { ar: "صرف مادة", en: "Material issue" } };
    case "time_entry": return { href: `${controls}#manager-site`, label: { ar: "إدخال وقت", en: "Time entry" } };
    case "payroll_allocation": return { href: `/payroll/${tenantId}`, label: { ar: "تخصيص رواتب", en: "Payroll allocation" } };
    default: return null;
  }
}
