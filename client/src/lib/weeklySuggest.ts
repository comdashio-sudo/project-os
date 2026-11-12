import { formatNumber, formatPercent } from "@/components/ds/format";
import type { Language } from "@/lib/language";

// D-49 (b): sentences proposed from the week's figures (the period engine's, never typed). They fill only a text that is still empty, so nothing a person wrote is
// overwritten; the person edits them like any other text. The figures they quote are read from the engine at the moment of the suggestion.
export type WeekFigures = {
  period: { start: string; end: string; workingDayCount: number };
  reports: Array<{ id: string }>;
  missingWorkingDays: string[];
  activities: Array<{ code: string; name: string; period: { planned: number | null; actual: number | null; completedUnits: number; percentOfPlan: number | null } }>;
  labour: { period: { direct: number; indirect: number } };
  safety: { incident: number; near_miss: number; violation: number };
  quality: { ncr: { open: number } };
};

const words = {
  ar: {
    summary: (reports: number, days: number, labour: number, completed: number) => `عُدّ ${formatNumber(reports)} تقريرًا يوميًا معتمدًا من ${formatNumber(days)} يوم عمل. أيام العمل للعمالة ${formatNumber(labour)} رجل×يوم، واكتملت ${formatNumber(completed)} وحدة لأول مرة في الأسبوع.`,
    behind: "متأخر عن المخطط", ahead: "متقدم على المخطط", onPlan: "على المخطط", noPlan: "لا مخطط مُدخل لأي نشاط هذا الأسبوع، فلا يُقارن الفعلي بشيء.",
    missing: (days: string) => `أيام عمل بلا تقرير يومي معتمد: ${days}.`, safety: (incidents: number, nearMisses: number, violations: number) => `السلامة: ${formatNumber(incidents)} حادث، و${formatNumber(nearMisses)} حادث وشيك، و${formatNumber(violations)} مخالفة.`, ncr: (open: number) => `${formatNumber(open)} تقرير عدم مطابقة مفتوح.`,
  },
  en: {
    summary: (reports: number, days: number, labour: number, completed: number) => `${formatNumber(reports)} approved daily reports were counted out of ${formatNumber(days)} working days. Labour came to ${formatNumber(labour)} man-days, and ${formatNumber(completed)} units were completed for the first time this week.`,
    behind: "behind plan", ahead: "ahead of plan", onPlan: "on plan", noPlan: "No plan was entered for any activity this week, so the actual is compared with nothing.",
    missing: (days: string) => `Working days without an approved daily report: ${days}.`, safety: (incidents: number, nearMisses: number, violations: number) => `Safety: ${formatNumber(incidents)} incidents, ${formatNumber(nearMisses)} near misses, ${formatNumber(violations)} violations.`, ncr: (open: number) => `${formatNumber(open)} non-conformance reports are open.`,
  },
  ur: {
    summary: (reports: number, days: number, labour: number, completed: number) => `${formatNumber(days)} کام کے دنوں میں سے ${formatNumber(reports)} منظور شدہ روزانہ رپورٹیں شمار ہوئیں۔ مزدوری ${formatNumber(labour)} آدمی-دن رہی، اور ${formatNumber(completed)} یونٹس اس ہفتے پہلی بار مکمل ہوئے۔`,
    behind: "منصوبے سے پیچھے", ahead: "منصوبے سے آگے", onPlan: "منصوبے کے مطابق", noPlan: "اس ہفتے کسی سرگرمی کا منصوبہ درج نہیں ہوا، اس لیے اصل کا کسی چیز سے موازنہ نہیں۔",
    missing: (days: string) => `منظور شدہ روزانہ رپورٹ کے بغیر کام کے دن: ${days}۔`, safety: (incidents: number, nearMisses: number, violations: number) => `حفاظت: ${formatNumber(incidents)} حادثات، ${formatNumber(nearMisses)} بال بال بچاؤ، ${formatNumber(violations)} خلاف ورزیاں۔`, ncr: (open: number) => `${formatNumber(open)} عدم مطابقت کی رپورٹیں کھلی ہیں۔`,
  },
};

/** Proposed texts for the summary, the analysis and the issues; only the keys returned are proposals. */
export function suggestWeeklyTexts(figures: WeekFigures, language: Language): { summary: string; analysis: string; issues: string } {
  const w = words[language];
  const completed = figures.activities.reduce((total, activity) => total + activity.period.completedUnits, 0);
  const summary = w.summary(figures.reports.length, figures.period.workingDayCount, figures.labour.period.direct + figures.labour.period.indirect, completed);
  // an activity is behind or ahead only where a plan was entered: a plan nobody gave is not read as zero (D-48)
  const compared = figures.activities.filter(activity => activity.period.percentOfPlan !== null);
  const line = (activity: WeekFigures["activities"][number], verdict: string) => `${activity.code} · ${activity.name}: ${formatPercent(activity.period.percentOfPlan!, 1)} (${verdict})`;
  const analysis = compared.length === 0 ? w.noPlan : [
    ...compared.filter(activity => activity.period.percentOfPlan! < 100).map(activity => line(activity, w.behind)),
    ...compared.filter(activity => activity.period.percentOfPlan === 100).map(activity => line(activity, w.onPlan)),
    ...compared.filter(activity => activity.period.percentOfPlan! > 100).map(activity => line(activity, w.ahead)),
  ].join("\n");
  const issues = [
    figures.missingWorkingDays.length ? w.missing(figures.missingWorkingDays.join(language === "en" ? ", " : "، ")) : null,
    figures.safety.incident + figures.safety.near_miss + figures.safety.violation > 0 ? w.safety(figures.safety.incident, figures.safety.near_miss, figures.safety.violation) : null,
    figures.quality.ncr.open > 0 ? w.ncr(figures.quality.ncr.open) : null,
  ].filter(Boolean).join("\n");
  return { summary, analysis, issues };
}
