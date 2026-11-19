import React from "react";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { useCanPage } from "@/lib/permissions";
import { formatDate, formatNumber, formatPercent, formatWeekday } from "@/components/ds/format";

const text = {
  ar: { today: "اليوم", programmeDay: (n: number) => `اليوم ${formatNumber(n)} من البرنامج`, title: "الإنجاز الموزون", actual: "الفعلي", planned: "المخطط (P6)", deviation: "الانحراف", ahead: "متقدم", behind: "متأخر", onPlan: "على الخطة", noPlan: "لا جدول P6 مستورد، فلا خط مخطط.", noData: "لا قيم بعد: يظهر الإنجاز من اليوميات المعتمدة وأوزان الأنشطة.", curve: "منحنى الإنجاز: الفعلي مقابل المخطط", loading: "جارٍ تحميل الإنجاز…", failed: "تعذّر تحميل الإنجاز الآن." },
  en: { today: "Today", programmeDay: (n: number) => `Day ${formatNumber(n)} of the programme`, title: "Weighted progress", actual: "Actual", planned: "Planned (P6)", deviation: "Deviation", ahead: "Ahead", behind: "Behind", onPlan: "On plan", noPlan: "No P6 schedule imported, so no planned line.", noData: "No figures yet: progress comes from approved daily reports and activity weights.", curve: "Progress curve: actual against planned", loading: "Loading progress…", failed: "Progress could not be loaded right now." },
  ur: { today: "آج", programmeDay: (n: number) => `پروگرام کا دن ${formatNumber(n)}`, title: "وزنی پیش رفت", actual: "اصل", planned: "منصوبہ (P6)", deviation: "فرق", ahead: "آگے", behind: "پیچھے", onPlan: "منصوبے پر", noPlan: "P6 شیڈول درآمد نہیں ہوا، اس لیے منصوبے کی لکیر نہیں۔", noData: "ابھی اعداد نہیں: پیش رفت منظور شدہ روزانہ رپورٹوں اور سرگرمیوں کے وزن سے آتی ہے۔", curve: "پیش رفت کا منحنی: اصل بمقابلہ منصوبہ", loading: "پیش رفت لوڈ ہو رہی ہے…", failed: "پیش رفت ابھی لوڈ نہیں ہو سکی۔" },
};

/** The site's calendar day (Riyadh, UTC+3) as YYYY-MM-DD, the same day the daily report uses. */
export function siteDay(now = new Date()): string {
  return new Date(now.getTime() + 3 * 3600_000).toISOString().slice(0, 10);
}

/** Day N of the programme: today counted from the earliest planned start (day 1 is that day); null before it or without a start. */
export function programmeDay(starts: ReadonlyArray<Date | string | null | undefined>, today: string): number | null {
  const days = starts.filter(Boolean).map(value => new Date(value as Date | string).getTime()).filter(Number.isFinite);
  if (!days.length) return null;
  const first = new Date(Math.min(...days) + 3 * 3600_000).toISOString().slice(0, 10);
  const n = Math.round((Date.parse(today) - Date.parse(first)) / 86_400_000) + 1;
  return n >= 1 ? n : null;
}

type Point = { month: string; planned: number | null; actual: number | null };

/** The latest month with an actual, and the planned value of that month (null when there is no plan). */
export function latestProgress(points: readonly Point[]): { actual: number; planned: number | null } | null {
  for (let i = points.length - 1; i >= 0; i--) if (points[i]!.actual !== null) return { actual: points[i]!.actual!, planned: points[i]!.planned };
  return null;
}

function Curve({ points, label }: { points: readonly Point[]; label: string }) {
  if (points.length < 2) return null;
  const w = 240, h = 72, x = (i: number) => (i / (points.length - 1)) * w, y = (v: number) => h - (Math.max(0, Math.min(100, v)) / 100) * h;
  const line = (key: "planned" | "actual") => points.map((point, i) => point[key] === null ? null : `${x(i)},${y(point[key]!)}`).filter(Boolean).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="h-20 w-full max-w-xs" preserveAspectRatio="none" data-hero-curve>
      <polyline points={line("planned")} fill="none" stroke="currentColor" strokeOpacity={0.55} strokeWidth={2} strokeDasharray="5 4" vectorEffect="non-scaling-stroke" />
      <polyline points={line("actual")} fill="none" stroke="var(--sidebar-mark, var(--dashio-aqua))" strokeWidth={2.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/**
 * Q-19 (3): the head of the project board in the approved identity — the date and the day of the programme, then the dark hero card of weighted
 * progress against the P6 plan (the monthly report's S-curve, the same figures, read for whoever may open that report). Nothing is computed here.
 */
export function ProjectBoardHero({ tenantId, projectId, starts }: { tenantId: string; projectId: string; starts: ReadonlyArray<Date | string | null | undefined> }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  const today = siteDay();
  const day = programmeDay(starts, today);
  const canRead = useCanPage("monthlyReport", projectId);
  const report = trpc.reportPeriods.monthly.useQuery({ tenantId, projectId, month: today.slice(0, 7) }, { enabled: canRead });
  const curve = (report.data as { sCurve?: { plannedSource: string | null; points: Point[] } } | undefined)?.sCurve;
  const latest = curve ? latestProgress(curve.points) : null;
  const deviation = latest && latest.planned !== null ? latest.actual - latest.planned : null;
  const state = deviation === null ? null : Math.abs(deviation) < 0.5 ? t.onPlan : deviation > 0 ? t.ahead : t.behind;
  return (
    <div className="flex flex-col gap-3" data-board-hero>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground" data-board-date>
        <span>{t.today}: <bdi>{formatWeekday(today, language)} {formatDate(today, language)}</bdi></span>
        {day !== null ? <span aria-hidden="true">·</span> : null}
        {day !== null ? <span data-programme-day>{t.programmeDay(day)}</span> : null}
      </p>
      {canRead ? (
        <section className="flex flex-col gap-4 rounded-[var(--radius-card,var(--radius))] bg-hero p-5 text-hero-foreground md:flex-row md:items-center md:justify-between md:p-6" aria-label={t.title}>
          <div className="flex flex-col gap-1">
            <p className="text-sm opacity-80">{t.title}</p>
            {report.isLoading ? <p className="text-sm">{t.loading}</p> : report.error ? <p className="text-sm">{t.failed}</p> : latest ? (
              <>
                <p className="text-4xl font-bold" dir="ltr" data-hero-actual>{formatPercent(latest.actual, 1)}</p>
                <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm opacity-90">
                  <span>{t.planned}: <bdi dir="ltr" data-hero-planned>{latest.planned === null ? "—" : formatPercent(latest.planned, 1)}</bdi></span>
                  {deviation !== null ? <span>{t.deviation}: <bdi dir="ltr">{`${deviation > 0 ? "+" : ""}${formatNumber(Math.round(deviation * 10) / 10, 1)}`}</bdi> · {state}</span> : null}
                </p>
                {curve?.plannedSource ? null : <p className="text-xs opacity-80">{t.noPlan}</p>}
              </>
            ) : <p className="max-w-md text-sm opacity-90">{t.noData}</p>}
          </div>
          {curve && latest ? <Curve points={curve.points} label={t.curve} /> : null}
        </section>
      ) : null}
    </div>
  );
}
