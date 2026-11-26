// Q-21, a declared limit of (b) batch 3: the calculation trace of the strategy model (server/domain/strategyModel.ts) comes from the server in English, so it
// showed in English on the screen and in the board pack in every language. Each step has a fixed key (`figure`); its name and formula are said here in the
// reader's language. The assumption codes (tendersPerYear, winRate, …) stay as they are: they are the codes the assumptions register shows. A step this table
// does not know keeps the server's own words, so a new step is never hidden.
export type TraceLanguage = "ar" | "en" | "ur";
export type TraceStepLike = { figure: string; formula: string; uses: readonly string[] };

const TEXT: Record<string, Record<TraceLanguage, { figure: string; formula: string }>> = {
  revenue: {
    ar: { figure: "الإيراد", formula: "tendersPerYear ÷ 12 × winRate × averageTenderValue، يبدأ بعد awardLagMonths ويتوزّع على executionMonths بمنحنى S؛ ويُضاف إليه إيراد العقود القائمة بحصصه" },
    en: { figure: "Revenue", formula: "tendersPerYear ÷ 12 × winRate × averageTenderValue, starting awardLagMonths after award and spread over executionMonths along an S-curve; plus the backlog's revenue on its own shares" },
    ur: { figure: "آمدنی", formula: "tendersPerYear ÷ 12 × winRate × averageTenderValue، ایوارڈ کے awardLagMonths بعد شروع، executionMonths پر S منحنی کے ساتھ تقسیم؛ اور موجودہ معاہدوں کی آمدنی اپنے حصوں کے ساتھ" },
  },
  receipts: {
    ar: { figure: "المقبوضات", formula: "advancePercent من كل عقد عند الترسية؛ وكل مستخلص × (1 − advancePercent − retentionPercent) يُحصَّل بعد ceil(collectionDays ÷ 30) شهرًا؛ وتُفرج retentionPercent بعد retentionReleaseMonths من نهاية الأعمال" },
    en: { figure: "Receipts", formula: "advancePercent of each contract at award; each bill × (1 − advancePercent − retentionPercent) collected ceil(collectionDays ÷ 30) months later; retentionPercent released retentionReleaseMonths after the work ends" },
    ur: { figure: "وصولیاں", formula: "ایوارڈ پر ہر معاہدے کا advancePercent؛ ہر بل × (1 − advancePercent − retentionPercent) ceil(collectionDays ÷ 30) ماہ بعد وصول؛ کام ختم ہونے کے retentionReleaseMonths بعد retentionPercent جاری" },
  },
  vatCollected: {
    ar: { figure: "ضريبة القيمة المضافة المحصّلة", formula: "كل مستخلص × vatPercent، تُحصَّل وتُورَّد معًا (لا أثر لها في صافي النقد)" },
    en: { figure: "VAT collected", formula: "each bill × vatPercent, collected and remitted together (no effect on net cash)" },
    ur: { figure: "وصول شدہ VAT", formula: "ہر بل × vatPercent، ایک ساتھ وصول اور ادا (خالص نقد پر کوئی اثر نہیں)" },
  },
  outflows: {
    ar: { figure: "المدفوعات", formula: "الإيراد × (1 − grossMarginPercent) + overheadsMonthly" },
    en: { figure: "Outflows", formula: "revenue × (1 − grossMarginPercent) + overheadsMonthly" },
    ur: { figure: "ادائیگیاں", formula: "آمدنی × (1 − grossMarginPercent) + overheadsMonthly" },
  },
  fundingRequired: {
    ar: { figure: "التمويل المطلوب", formula: "أعمق رصيد سالب لصافي النقد التراكمي" },
    en: { figure: "Funding required", formula: "the deepest negative cumulative net cash" },
    ur: { figure: "مطلوبہ فنڈنگ", formula: "مجموعی خالص نقد کا سب سے گہرا منفی بیلنس" },
  },
};

/** A run of codes and arithmetic (tendersPerYear ÷ 12 × winRate, (1 − advancePercent), ceil(collectionDays ÷ 30)) inside right-to-left words. */
const MATH_RUN = /[A-Za-z0-9_(][A-Za-z0-9_()×÷+−\/ .]*[A-Za-z0-9_)]|[A-Za-z0-9_]/g;
/** In Arabic and Urdu each such run is isolated left-to-right (Unicode LRI … PDI), so its parentheses and operators keep their order on the screen, in
 *  PowerPoint and in Excel alike; English needs none. */
export const isolateMath = (text: string, language: TraceLanguage) => (language === "en" ? text : text.replace(MATH_RUN, run => `\u2066${run}\u2069`));

/** A trace step's name and formula in the reader's language; the server's own words for a step not in the table. The codes it uses stay codes. */
export function traceText(step: TraceStepLike, language: TraceLanguage): { figure: string; formula: string; uses: string } {
  const known = TEXT[step.figure]?.[language];
  return { figure: known?.figure ?? step.figure, formula: isolateMath(known?.formula ?? step.formula, language), uses: step.uses.join(", ") };
}

/** The steps this table says in words (the test checks it covers every step the model writes). */
export const TRACE_FIGURES = Object.keys(TEXT);
