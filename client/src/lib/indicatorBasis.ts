import { formatDate } from "@/components/ds/format";
import { pickLanguage, resolveLanguage, type Language } from "./language";
// G-106: a status indicator shows its number, the formula behind it, and the date it stands at, in the same place.
// The formulas are the ones the server uses (server/domain/projectHealth.ts, evm.ts, cashFlow.ts); the wording here is
// a plain-language reading of them, kept in one file so the screen and the tests quote the same sentence.
export type IndicatorKey = "health" | "evm" | "remaining" | "activities" | "wbs";
type Basis = { formula: { ar: string; en: string; ur: string }; source: { ar: string; en: string; ur: string } };

export const indicatorBasis: Record<IndicatorKey, Basis> = {
  health: {
    formula: { ar: "100 ناقص خصومات: CPI<0.9 (25) أو <1 (10)، SPI<0.9 (25) أو <1 (10)، EAC>BAC (20)، مخاطر عالية (5 لكل واحد حتى 20)، إجراءات متأخرة (3 لكل واحد حتى 15)، اعتماد/RFI/NCR/HSE متأخر (10/8/8/8). أخضر ≥85، كهرماني ≥65، وإلا أحمر.", en: "100 minus deductions: CPI<0.9 (25) or <1 (10), SPI<0.9 (25) or <1 (10), EAC>BAC (20), high risks (5 each up to 20), overdue actions (3 each up to 15), overdue approval/RFI/NCR/HSE (10/8/8/8). Green ≥85, amber ≥65, else red.", ur: "100 منہا کٹوتیاں: CPI<0.9 (25) یا <1 (10)، SPI<0.9 (25) یا <1 (10)، EAC>BAC (20)، زیادہ خطرات (ہر ایک 5، زیادہ سے زیادہ 20)، تاخیر کے اقدامات (ہر ایک 3، زیادہ سے زیادہ 15)، تاخیر کی منظوری/RFI/NCR/HSE (10/8/8/8)۔ سبز ≥85، پیلا ≥65، ورنہ سرخ۔" },
    source: { ar: "آخر لقطة صحة محفوظة", en: "latest saved health snapshot", ur: "محفوظ شدہ تازہ ترین صحت کا اسنیپ شاٹ" },
  },
  evm: {
    formula: { ar: "CPI = EV ÷ AC، SPI = EV ÷ PV، EAC بالطريقة المسجَّلة في اللقطة (الافتراضي BAC ÷ CPI).", en: "CPI = EV ÷ AC, SPI = EV ÷ PV, EAC by the method saved with the snapshot (default BAC ÷ CPI).", ur: "CPI = EV ÷ AC، SPI = EV ÷ PV، EAC اس طریقے سے جو اسنیپ شاٹ کے ساتھ محفوظ ہوا (ڈیفالٹ BAC ÷ CPI)۔" },
    source: { ar: "آخر لقطة EVM محفوظة", en: "latest saved EVM snapshot", ur: "محفوظ شدہ تازہ ترین EVM اسنیپ شاٹ" },
  },
  remaining: {
    formula: { ar: "المتبقي = الميزانية المخططة − (التكلفة الفعلية المرحّلة + الالتزامات المفتوحة).", en: "Remaining = planned budget − (posted actual cost + open commitments).", ur: "باقی = منصوبہ بند بجٹ − (درج شدہ اصل لاگت + کھلے وعدے)۔" },
    source: { ar: "تُحسب عند العرض من سجلات الميزانية والتكلفة والالتزامات", en: "calculated when shown, from the budget, cost and commitment records", ur: "دکھاتے وقت بجٹ، لاگت اور وعدوں کے ریکارڈ سے حساب کیا جاتا ہے" },
  },
  activities: {
    formula: { ar: "عدد الأنشطة المسجلة؛ المتعثرة = الأنشطة بحالة «متعثر».", en: "Count of recorded activities; blocked = activities whose status is blocked.", ur: "درج شدہ سرگرمیوں کی تعداد؛ رکی ہوئی = وہ سرگرمیاں جن کی حیثیت رکی ہوئی ہے۔" },
    source: { ar: "تُحسب عند العرض من سجل الأنشطة", en: "calculated when shown, from the activity register", ur: "دکھاتے وقت سرگرمیوں کے رجسٹر سے حساب کیا جاتا ہے" },
  },
  wbs: {
    formula: { ar: "عدد بنود WBS؛ التقدم = عدد إدخالات التقدم المسجلة.", en: "Count of WBS items; progress = number of recorded progress entries.", ur: "WBS آئٹمز کی تعداد؛ پیش رفت = درج شدہ پیش رفت کے اندراجات کی تعداد۔" },
    source: { ar: "تُحسب عند العرض من سجل WBS والتقدم", en: "calculated when shown, from the WBS and progress registers", ur: "دکھاتے وقت WBS اور پیش رفت کے رجسٹروں سے حساب کیا جاتا ہے" },
  },
};

export function indicatorBasisLine(key: IndicatorKey, language: Language | boolean, asOf: Date | string | null | undefined): string {
  const basis = indicatorBasis[key];
  const lang = resolveLanguage(language);
  // Western digits and the Gregorian calendar in every language (work order 21): the one date format of the design system.
  const date = asOf ? formatDate(asOf, lang) : null;
  // Snapshot-based indicators with no snapshot yet say so; the others are computed when shown.
  const snapshotBased = key === "health" || key === "evm";
  const when = date
    ? `${pickLanguage(lang, { ar: "بتاريخ", en: "as of", ur: "بتاریخ" })} ${date}`
    : snapshotBased
      ? pickLanguage(lang, { ar: "لا لقطة محفوظة بعد", en: "no snapshot saved yet", ur: "ابھی کوئی اسنیپ شاٹ محفوظ نہیں" })
      : pickLanguage(lang, { ar: "بتاريخ العرض", en: "as of now", ur: "دکھاتے وقت کے مطابق" });
  const formula = pickLanguage(lang, { ar: "المعادلة", en: "Formula", ur: "فارمولا" });
  const source = pickLanguage(lang, { ar: "المصدر", en: "Source", ur: "ماخذ" });
  return `${formula}: ${basis.formula[lang]} · ${source}: ${basis.source[lang]} · ${when}`;
}
