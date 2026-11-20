// Q-54: the three cards beside the hero on the project board (reference «لوحة المشروع 1440»): the schedule index, the stalled villas and today's
// labour. Each figure comes from a read the page may already make, behind the page permission that read needs; a figure with no source says so
// («—» with the reason), never 0. Read-only.
import React from "react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { useCanPage } from "@/lib/permissions";
import { formatNumber } from "@/components/ds/format";
import { latestProgress, siteDay } from "@/components/ProjectBoardHero";

const text = {
  ar: { spi: "مؤشر أداء الجدول", spiNote: "الإنجاز ÷ المخطط · أقل من 1 = متأخر", noPlan: "لا خطة P6 أو لا إنجاز بعد", stalled: "وحدات متوقفة", longStalled: (n: string, days: string) => `منها ${n} أكثر من ${days} يومًا`, labour: "العمالة اليوم", labourNote: (shifts: string) => `من تقرير اليوم · ${shifts}`, day: "نهاري", night: "ليلي", noReport: "لا تقرير يومي اليوم بعد", hidden: "لا صلاحية لعرضه", failed: "تعذّر تحميل المصدر" },
  en: { spi: "Schedule index", spiNote: "Actual ÷ planned · under 1 = behind", noPlan: "No P6 plan or no progress yet", stalled: "Stalled units", longStalled: (n: string, days: string) => `${n} of them over ${days} days`, labour: "Labour today", labourNote: (shifts: string) => `From today's report · ${shifts}`, day: "day", night: "night", noReport: "No daily report today yet", hidden: "Not visible to you", failed: "The source could not be loaded" },
  ur: { spi: "شیڈول انڈیکس", spiNote: "اصل ÷ منصوبہ · 1 سے کم = پیچھے", noPlan: "P6 منصوبہ یا پیش رفت ابھی نہیں", stalled: "رکے ہوئے یونٹس", longStalled: (n: string, days: string) => `ان میں ${n} ${days} دن سے زیادہ`, labour: "آج کی افرادی قوت", labourNote: (shifts: string) => `آج کی رپورٹ سے · ${shifts}`, day: "دن", night: "رات", noReport: "آج کی یومیہ رپورٹ ابھی نہیں", hidden: "آپ کے لیے نظر نہیں آتا", failed: "ماخذ لوڈ نہ ہو سکا" },
};

/** Actual ÷ planned on the latest month with an actual; null when either is missing or the plan is zero. Rounded to two places. */
export function scheduleIndex(points: ReadonlyArray<{ month: string; planned: number | null; actual: number | null }>): number | null {
  const latest = latestProgress(points);
  if (!latest || latest.planned === null || latest.planned <= 0) return null;
  return Math.round((latest.actual / latest.planned) * 100) / 100;
}

/** Day and night headcounts of a report's labour matrix. */
export function labourTotals(rows: ReadonlyArray<{ shift: string; headcount: number }>): { total: number; day: number; night: number } {
  const day = rows.filter(row => row.shift === "day").reduce((sum, row) => sum + Number(row.headcount), 0);
  const night = rows.filter(row => row.shift === "night").reduce((sum, row) => sum + Number(row.headcount), 0);
  return { total: day + night, day, night };
}

function Kpi({ label, value, tone, note, href, testId }: { label: string; value: string; tone?: "late" | "stopped"; note: string; href?: string; testId: string }) {
  const body = <>
    <p className="text-sm text-muted-foreground">{label}</p>
    <p data-kpi-value className={`mt-3 text-4xl font-bold tabular-nums ${tone === "late" ? "text-status-late" : tone === "stopped" ? "text-state-stopped" : "text-foreground"}`} dir="ltr">{value}</p>
    <p className="mt-3 text-xs text-muted-foreground">{note}</p>
  </>;
  const cls = "flex min-h-40 flex-col justify-between rounded-[18px] border border-border bg-card p-5";
  return href ? <Link href={href} data-testid={testId} className={`${cls} hover:border-primary`}>{body}</Link> : <div data-testid={testId} className={cls}>{body}</div>;
}

export function ProjectBoardKpis({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  const today = siteDay();
  const scope = { tenantId, projectId };
  const canMonthly = useCanPage("monthlyReport", projectId);
  const canStalled = useCanPage("stalled", projectId);
  const canDaily = useCanPage("dailyReport", projectId);
  const monthly = trpc.reportPeriods.monthly.useQuery({ ...scope, month: today.slice(0, 7) }, { enabled: canMonthly });
  const stalled = trpc.pmc.stalledUnits.useQuery(scope, { enabled: canStalled });
  const reports = trpc.siteReports.list.useQuery(scope, { enabled: canDaily });
  const todayReport = (reports.data ?? []).find(report => String(report.reportDate).slice(0, 10) === today);
  const report = trpc.siteReports.get.useQuery({ ...scope, reportId: todayReport?.id ?? "" }, { enabled: canDaily && Boolean(todayReport) });

  const points = (monthly.data as { sCurve?: { points: Array<{ month: string; planned: number | null; actual: number | null }> } } | undefined)?.sCurve?.points ?? [];
  const spi = canMonthly ? scheduleIndex(points) : null;
  const counts = stalled.data?.counts;
  const stalledTotal = counts ? counts.stalled + counts.long : null;
  const labour = report.data ? labourTotals((report.data as { labour?: Array<{ shift: string; headcount: number }> }).labour ?? []) : null;

  // a source that failed is said so, never shown as empty (client/src/pages/queryFailure.test.tsx)
  const spiFailed = Boolean(monthly.error); const stalledFailed = Boolean(stalled.error); const labourFailed = Boolean(reports.error || report.error);
  return <div data-board-kpis className="grid gap-4 sm:grid-cols-3">
    <Kpi testId="kpi-spi" label={t.spi} value={spi === null ? "—" : formatNumber(spi, 2)} tone={spi !== null && spi < 1 ? "late" : undefined} note={!canMonthly ? t.hidden : spiFailed ? t.failed : spi === null ? t.noPlan : t.spiNote} />
    <Kpi testId="kpi-stalled" label={t.stalled} value={stalledTotal === null ? "—" : formatNumber(stalledTotal)} tone={stalledTotal ? "stopped" : undefined} note={!canStalled ? t.hidden : stalledFailed ? t.failed : counts ? t.longStalled(formatNumber(counts.long), formatNumber(stalled.data!.longDays)) : "—"} href={canStalled ? `/projects/${tenantId}/${projectId}/stalled` : undefined} />
    <Kpi testId="kpi-labour" label={t.labour} value={labour === null ? "—" : formatNumber(labour.total)} note={!canDaily ? t.hidden : labourFailed ? t.failed : labour === null ? t.noReport : t.labourNote(`${t.day} ${formatNumber(labour.day)} · ${t.night} ${formatNumber(labour.night)}`)} />
  </div>;
}
