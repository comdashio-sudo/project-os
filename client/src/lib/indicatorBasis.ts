// G-106: a status indicator shows its number, the formula behind it, and the date it stands at, in the same place.
// The formulas are the ones the server uses (server/domain/projectHealth.ts, evm.ts, cashFlow.ts); the wording here is
// a plain-language reading of them, kept in one file so the screen and the tests quote the same sentence.
export type IndicatorKey = "health" | "evm" | "remaining" | "activities" | "wbs";
type Basis = { formula: { ar: string; en: string; ur: string }; source: { ar: string; en: string; ur: string } };

export const indicatorBasis: Record<IndicatorKey, Basis> = {
  health: {
    formula: { ar: "100 ناقص خصومات: CPI<0.9 (25) أو <1 (10)، SPI<0.9 (25) أو <1 (10)، EAC>BAC (20)، مخاطر عالية (5 لكل واحد حتى 20)، إجراءات متأخرة (3 لكل واحد حتى 15)، اعتماد/RFI/NCR/HSE متأخر (10/8/8/8). أخضر ≥85، كهرماني ≥65، وإلا أحمر.", en: "100 minus deductions: CPI<0.9 (25) or <1 (10), SPI<0.9 (25) or <1 (10), EAC>BAC (20), high risks (5 each up to 20), overdue actions (3 each up to 15), overdue approval/RFI/NCR/HSE (10/8/8/8). Green ≥85, amber ≥65, else red.", ur: "100 minus deductions: CPI<0.9 (25) or <1 (10), SPI<0.9 (25) or <1 (10), EAC>BAC (20), high risks (5 each up to 20), overdue actions (3 each up to 15), overdue approval/RFI/NCR/HSE (10/8/8/8). Green ≥85, amber ≥65, else red." },
    source: { ar: "آخر لقطة صحة محفوظة", en: "latest saved health snapshot", ur: "latest saved health snapshot" },
  },
  evm: {
    formula: { ar: "CPI = EV ÷ AC، SPI = EV ÷ PV، EAC بالطريقة المسجَّلة في اللقطة (الافتراضي BAC ÷ CPI).", en: "CPI = EV ÷ AC, SPI = EV ÷ PV, EAC by the method saved with the snapshot (default BAC ÷ CPI).", ur: "CPI = EV ÷ AC, SPI = EV ÷ PV, EAC by the method saved with the snapshot (default BAC ÷ CPI)." },
    source: { ar: "آخر لقطة EVM محفوظة", en: "latest saved EVM snapshot", ur: "latest saved EVM snapshot" },
  },
  remaining: {
    formula: { ar: "المتبقي = الميزانية المخططة − (التكلفة الفعلية المرحّلة + الالتزامات المفتوحة).", en: "Remaining = planned budget − (posted actual cost + open commitments).", ur: "Remaining = planned budget − (posted actual cost + open commitments)." },
    source: { ar: "تُحسب عند العرض من سجلات الميزانية والتكلفة والالتزامات", en: "calculated when shown, from the budget, cost and commitment records", ur: "calculated when shown, from the budget, cost and commitment records" },
  },
  activities: {
    formula: { ar: "عدد الأنشطة المسجلة؛ المتعثرة = الأنشطة بحالة «متعثر».", en: "Count of recorded activities; blocked = activities whose status is blocked.", ur: "Count of recorded activities; blocked = activities whose status is blocked." },
    source: { ar: "تُحسب عند العرض من سجل الأنشطة", en: "calculated when shown, from the activity register", ur: "calculated when shown, from the activity register" },
  },
  wbs: {
    formula: { ar: "عدد بنود WBS؛ التقدم = عدد إدخالات التقدم المسجلة.", en: "Count of WBS items; progress = number of recorded progress entries.", ur: "Count of WBS items; progress = number of recorded progress entries." },
    source: { ar: "تُحسب عند العرض من سجل WBS والتقدم", en: "calculated when shown, from the WBS and progress registers", ur: "calculated when shown, from the WBS and progress registers" },
  },
};

export function indicatorBasisLine(key: IndicatorKey, isArabic: boolean, asOf: Date | string | null | undefined): string {
  const basis = indicatorBasis[key];
  const lang = isArabic ? "ar" : "en";
  const date = asOf ? new Date(asOf).toLocaleDateString(isArabic ? "ar-SA" : "en-GB", { timeZone: "UTC" }) : null;
  // Snapshot-based indicators with no snapshot yet say so; the others are computed when shown.
  const snapshotBased = key === "health" || key === "evm";
  const when = date ? `${isArabic ? "بتاريخ" : "as of"} ${date}` : snapshotBased ? (isArabic ? "لا لقطة محفوظة بعد" : "no snapshot saved yet") : isArabic ? "بتاريخ العرض" : "as of now";
  return `${isArabic ? "المعادلة" : "Formula"}: ${basis.formula[lang]} · ${isArabic ? "المصدر" : "Source"}: ${basis.source[lang]} · ${when}`;
}
