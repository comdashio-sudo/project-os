// Q-21 (b), the board pack: the strategy centre's forecast (strategy.forecast, computed on the server) laid out as slides, and the model as a workbook.
// Nothing is computed here: every figure is one the forecast returned, written with the screen's own formatting (scenarioRows), so the pack says what the
// screen says. The slides use the weekly deck's frame and writer (weeklyDeck.ts / weeklyDeckPptx.ts: 16:9, native charts) and its checker (deckProblems).
import { formatAmount, formatNumber } from "@/components/ds/format";
import { SLIDE, type Item, type Slide } from "@/lib/weeklyDeck";

export const SCENARIOS = ["conservative", "base", "optimistic"] as const;
type Scenario = (typeof SCENARIOS)[number];
export type ForecastMonth = { index: number; revenue: number; backlogRevenue: number; receipts: number; vatCollected: number; outflows: number; net: number; cumulative: number };
export type ForecastScenario = {
  months: ForecastMonth[]; totals: { revenue: number; backlogRevenue: number; receipts: number; outflows: number; net: number };
  lowestCumulative: number; lowestMonth: number; fundingRequired: number; breakEvenMonth: number | null; used: Record<string, number | undefined>; missing: string[];
  trace: Array<{ figure: string; formula: string; uses: string[] }>;
};
export type Forecast = {
  asOf: string; horizonMonths: number;
  backlog: { scheduled: { count: number; remainingValue: number }; unscheduled: { count: number; remainingValue: number } };
  scenarios: Record<Scenario, ForecastScenario>;
  sensitivity: { winRateDelta: number; revenueChange: Record<Scenario, number>; lowestCashChange: Record<Scenario, number> };
};
export type Language = "ar" | "en" | "ur";

export const PACK_TEXT = {
  ar: {
    title: "حزمة مجلس الإدارة — التخطيط الاستراتيجي", asOf: "بتاريخ", horizon: "الأفق", months: "شهرًا", figure: "البند",
    conservative: "المتحفظ", base: "الأساسي", optimistic: "المتفائل", revenue: "الإيراد (بلا ضريبة)", backlogRevenue: "منه من العقود القائمة", receipts: "المتحصلات", outflows: "المصروفات", net: "صافي النقد",
    lowest: "أدنى رصيد نقدي", lowestMonth: "شهر أدنى رصيد", funding: "التمويل المطلوب", breakEven: "شهر التعادل النقدي", never: "لا يتحقق في الأفق",
    summary: "مقارنة السيناريوهات", cash: "الرصيد النقدي التراكمي", revenueChart: "الإيراد الشهري", sensitivity: "الحساسية", sensitivityLine: "أثر +{d} نقطة في نسبة الفوز",
    backlog: "العقود القائمة", scheduled: "مجدولة", unscheduled: "بلا إنهاء مخطط (خارج النموذج)", contracts: "عقد", missing: "مدخلات معتمدة ناقصة", none: "لا شيء",
    assumptions: "الافتراضات المعتمدة", code: "الرمز", value: "القيمة", month: "الشهر", trace: "سلسلة الحساب", formula: "المعادلة", uses: "يستعمل",
    footer: "محسوب في الخادم من سجلات الشركة · الصفحة", sar: "ريال",
  },
  en: {
    title: "Board pack — strategic planning", asOf: "As of", horizon: "Horizon", months: "months", figure: "Figure",
    conservative: "Conservative", base: "Base", optimistic: "Optimistic", revenue: "Revenue (excl. VAT)", backlogRevenue: "of which existing contracts", receipts: "Receipts", outflows: "Outflows", net: "Net cash",
    lowest: "Lowest cash balance", lowestMonth: "Month of the lowest balance", funding: "Funding required", breakEven: "Cash break-even month", never: "Not within the horizon",
    summary: "Scenarios compared", cash: "Cumulative cash balance", revenueChart: "Monthly revenue", sensitivity: "Sensitivity", sensitivityLine: "Effect of +{d} points of win rate",
    backlog: "Existing contracts", scheduled: "scheduled", unscheduled: "with no planned finish (outside the model)", contracts: "contracts", missing: "Missing approved inputs", none: "None",
    assumptions: "Approved assumptions", code: "Code", value: "Value", month: "Month", trace: "Calculation trace", formula: "Formula", uses: "Uses",
    footer: "Computed on the server from the company's records · page", sar: "SAR",
  },
  ur: {
    title: "بورڈ پیک — اسٹریٹجک منصوبہ بندی", asOf: "بتاریخ", horizon: "مدت", months: "ماہ", figure: "مد",
    conservative: "محتاط", base: "بنیادی", optimistic: "پرامید", revenue: "آمدنی (ٹیکس کے بغیر)", backlogRevenue: "جس میں موجودہ معاہدے", receipts: "وصولیاں", outflows: "اخراجات", net: "خالص نقد",
    lowest: "کم ترین نقد بیلنس", lowestMonth: "کم ترین بیلنس کا مہینہ", funding: "درکار فنڈنگ", breakEven: "نقد بریک ایون کا مہینہ", never: "مدت کے اندر نہیں",
    summary: "منظرناموں کا موازنہ", cash: "مجموعی نقد بیلنس", revenueChart: "ماہانہ آمدنی", sensitivity: "حساسیت", sensitivityLine: "جیت کی شرح میں +{d} پوائنٹس کا اثر",
    backlog: "موجودہ معاہدے", scheduled: "شیڈول شدہ", unscheduled: "منصوبہ بند اختتام کے بغیر (ماڈل سے باہر)", contracts: "معاہدے", missing: "منظور شدہ ان پٹ کم ہیں", none: "کوئی نہیں",
    assumptions: "منظور شدہ مفروضے", code: "کوڈ", value: "قدر", month: "مہینہ", trace: "حساب کا سلسلہ", formula: "فارمولا", uses: "استعمال کرتا ہے",
    footer: "سرور پر کمپنی کے ریکارڈ سے حساب · صفحہ", sar: "ریال",
  },
} satisfies Record<Language, Record<string, string>>;
type Text = (typeof PACK_TEXT)["ar"];

const money = (value: number, t: Text) => `${formatAmount(value)} ${t.sar}`;
const month = (index: number, t: Text) => `${t.month} ${formatNumber(index + 1)}`;

/** The comparison the screen shows and the pack prints, row by row: [label, conservative, base, optimistic], each cell already written. */
export function scenarioRows(forecast: Forecast, language: Language): string[][] {
  const t = PACK_TEXT[language];
  const cells = (pick: (scenario: ForecastScenario) => string) => SCENARIOS.map(key => pick(forecast.scenarios[key]));
  return [
    [t.revenue, ...cells(s => money(s.totals.revenue, t))],
    [t.backlogRevenue, ...cells(s => money(s.totals.backlogRevenue, t))],
    [t.receipts, ...cells(s => money(s.totals.receipts, t))],
    [t.outflows, ...cells(s => money(s.totals.outflows, t))],
    [t.net, ...cells(s => money(s.totals.net, t))],
    [t.lowest, ...cells(s => money(s.lowestCumulative, t))],
    [t.lowestMonth, ...cells(s => month(s.lowestMonth, t))],
    [t.funding, ...cells(s => money(s.fundingRequired, t))],
    [t.breakEven, ...cells(s => (s.breakEvenMonth === null ? t.never : month(s.breakEvenMonth, t)))],
  ];
}

const M = 0.5; const W = SLIDE.w - 2 * M;
const title = (text: string): Item => ({ kind: "text", role: "title", box: { x: M, y: 0.3, w: W, h: 0.7 }, text, size: 24, bold: true });
const footer = (text: string): Item => ({ kind: "text", role: "footer", box: { x: M, y: SLIDE.h - 0.55, w: W, h: 0.35 }, text, size: 10 });

/**
 * The board pack's slides: the comparison of the three scenarios, the cumulative cash and the monthly revenue as native charts, the sensitivity and the
 * backlog, the approved assumptions the model used, and the calculation trace. Quarters on the charts would be a sum computed here — so the charts plot the
 * months the server returned, as they are.
 */
export function buildStrategyBoardPack(input: { forecast: Forecast; assumptions: Array<{ code: string; name: string; values: Record<Scenario, number> }>; language: Language; company: string }): Slide[] {
  const { forecast, language } = input; const t = PACK_TEXT[language];
  const head = [t.figure, t.conservative, t.base, t.optimistic];
  const labels = forecast.scenarios.base.months.map(item => formatNumber(item.index + 1));
  const series = (pick: (item: ForecastMonth) => number) => SCENARIOS.map(key => ({ name: t[key], values: forecast.scenarios[key].months.map(pick) }));
  const missing = Array.from(new Set(SCENARIOS.flatMap(key => forecast.scenarios[key].missing)));
  const slides: Slide[] = [
    { items: [title(t.title), { kind: "text", role: "body", box: { x: M, y: 1.4, w: W, h: 1.2 }, text: `${input.company}\n${t.asOf} ${forecast.asOf} · ${t.horizon} ${formatNumber(forecast.horizonMonths)} ${t.months}`, size: 20 }] },
    { items: [title(t.summary), { kind: "table", box: { x: M, y: 1.2, w: W, h: 5.2 }, rows: [head, ...scenarioRows(forecast, language)], size: 12 }] },
    { items: [title(t.cash), { kind: "chart", box: { x: M, y: 1.2, w: W, h: 5.4 }, title: t.cash, chart: { type: "line", labels, series: series(item => item.cumulative) } }] },
    { items: [title(t.revenueChart), { kind: "chart", box: { x: M, y: 1.2, w: W, h: 5.4 }, title: t.revenueChart, chart: { type: "bar", labels, series: series(item => item.revenue) } }] },
    { items: [title(`${t.sensitivity} · ${t.backlog}`), { kind: "table", box: { x: M, y: 1.2, w: W, h: 2.0 }, size: 12, rows: [head,
      [`${t.sensitivityLine.replace("{d}", formatNumber(forecast.sensitivity.winRateDelta))} — ${t.revenue}`, ...SCENARIOS.map(key => money(forecast.sensitivity.revenueChange[key], t))],
      [`${t.sensitivityLine.replace("{d}", formatNumber(forecast.sensitivity.winRateDelta))} — ${t.lowest}`, ...SCENARIOS.map(key => money(forecast.sensitivity.lowestCashChange[key], t))]] },
      { kind: "text", role: "body", box: { x: M, y: 3.5, w: W, h: 2.4 }, size: 14, text: `${t.backlog}: ${formatNumber(forecast.backlog.scheduled.count)} ${t.contracts} ${t.scheduled} · ${money(forecast.backlog.scheduled.remainingValue, t)}\n${t.backlog}: ${formatNumber(forecast.backlog.unscheduled.count)} ${t.contracts} ${t.unscheduled} · ${money(forecast.backlog.unscheduled.remainingValue, t)}\n${t.missing}: ${missing.length ? missing.join(", ") : t.none}` }] },
    { items: [title(t.assumptions), { kind: "table", box: { x: M, y: 1.2, w: W, h: 5.4 }, size: 11, rows: [[t.code, t.conservative, t.base, t.optimistic], ...input.assumptions.slice(0, 14).map(item => [`${item.code} · ${item.name}`, ...SCENARIOS.map(key => formatAmount(item.values[key]))])] }] },
    { items: [title(t.trace), { kind: "table", box: { x: M, y: 1.2, w: W, h: 5.4 }, size: 10, rows: [[t.figure, t.formula, t.uses], ...forecast.scenarios.base.trace.slice(0, 10).map(step => [step.figure, step.formula, step.uses.join(", ")])] }] },
  ];
  return slides.map((slide, index) => ({ items: [...slide.items, footer(`${t.footer} ${formatNumber(index + 1)}/${formatNumber(slides.length)}`)] }));
}

/** The model as a workbook (ExcelJS, loaded on first use): the comparison, then one sheet of months per scenario, the assumptions and the trace. Numbers stay numbers. */
export async function strategyWorkbook(input: { forecast: Forecast; assumptions: Array<{ code: string; name: string; values: Record<Scenario, number> }>; language: Language }): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import("exceljs");
  const { forecast, language } = input; const t = PACK_TEXT[language];
  const book = new ExcelJS.Workbook();
  const rtl = language !== "en";
  const sheet = (name: string) => book.addWorksheet(name, { views: [{ rightToLeft: rtl }] });
  const summary = sheet(t.summary);
  summary.addRow([t.figure, t.conservative, t.base, t.optimistic]);
  const numbersOf = (pick: (s: ForecastScenario) => number | null) => SCENARIOS.map(key => pick(forecast.scenarios[key]));
  for (const [label, pick] of [[t.revenue, (s: ForecastScenario) => s.totals.revenue], [t.backlogRevenue, (s: ForecastScenario) => s.totals.backlogRevenue], [t.receipts, (s: ForecastScenario) => s.totals.receipts],
    [t.outflows, (s: ForecastScenario) => s.totals.outflows], [t.net, (s: ForecastScenario) => s.totals.net], [t.lowest, (s: ForecastScenario) => s.lowestCumulative], [t.lowestMonth, (s: ForecastScenario) => s.lowestMonth + 1],
    [t.funding, (s: ForecastScenario) => s.fundingRequired], [t.breakEven, (s: ForecastScenario) => (s.breakEvenMonth === null ? null : s.breakEvenMonth + 1)]] as const) summary.addRow([label, ...numbersOf(pick).map(value => value ?? t.never)]); // no break-even is said in words, never a blank cell
  for (const key of SCENARIOS) {
    const months = sheet(t[key]);
    months.addRow([t.month, t.revenue, t.backlogRevenue, t.receipts, t.outflows, t.net, t.cash]);
    for (const item of forecast.scenarios[key].months) months.addRow([item.index + 1, item.revenue, item.backlogRevenue, item.receipts, item.outflows, item.net, item.cumulative]);
  }
  const assumptions = sheet(t.assumptions);
  assumptions.addRow([t.code, t.conservative, t.base, t.optimistic]);
  for (const item of input.assumptions) assumptions.addRow([`${item.code} · ${item.name}`, ...SCENARIOS.map(key => item.values[key])]);
  const trace = sheet(t.trace);
  trace.addRow([t.figure, t.formula, t.uses]);
  for (const step of forecast.scenarios.base.trace) trace.addRow([step.figure, step.formula, step.uses.join(", ")]);
  return (await book.xlsx.writeBuffer()) as ArrayBuffer;
}
