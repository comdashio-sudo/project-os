import { useLanguage } from "@/contexts/LanguageContext";
import { formatMoney, formatPercent } from "@/lib/profitabilityView";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import React, { useEffect, useRef, useState } from "react";
import { CartesianGrid, Legend, Line, LineChart, Tooltip, XAxis, YAxis } from "recharts";
import { ChartLegend } from "@/components/ChartLegend";
import { ExportExcelButton } from "@/components/ExportExcelButton";
import type { ExportColumn } from "@/lib/excelExport";
import { pickLanguage } from "@/lib/language";

const text = {
  ar: {
    table: "جدول البرنامج الزمني", sheet: "البرنامج الزمني",
    loading: "جارٍ التحميل…", retry: "إعادة المحاولة", noBaseline: "لم يُستورد خط أساس زمني بعد، فلا يظهر المنحنى المخطط. استورد ملف خط الأساس من تبويب الاستيراد.",
    noHistory: (n: number, actual: string, cells: string) => `${n} خلية لها حالة بلا سجل تاريخ، فمنحنى الفعلي (من السجل) يقرأ ${actual} بينما تقدم المشروع من الحالات ${cells}.`,
    contract: "قيمة العقد", paid: "المدفوع", confirmed: "الفوترة المؤكدة", target: "الفوترة المستهدفة", targetHint: "التقدم المخطط حتى اليوم × قيمة العقد", needs: "يتطلب خط أساس وقيمة عقد",
    chart: "المخطط مقابل الفعلي (تراكمي)", planned: "المخطط", actual: "الفعلي", variance: "الفرق", plannedMonth: "مخطط الشهر", actualMonth: "فعلي الشهر", month: "الشهر", empty: "لا توجد بيانات",
    basis: "المبالغ قبل الضريبة. المدفوع = فواتير مدفوعة، المؤكدة = صادرة ومدفوعة (لا المسودة ولا الملغاة).",
  },
  en: {
    table: "Programme table", sheet: "Programme",
    loading: "Loading…", retry: "Retry", noBaseline: "No baseline has been imported yet, so the planned curve is not shown. Import the baseline file from the Import tab.",
    noHistory: (n: number, actual: string, cells: string) => `${n} cells have a status but no history, so the actual curve (from history) reads ${actual} while project progress from the statuses is ${cells}.`,
    contract: "Contract value", paid: "Paid", confirmed: "Confirmed invoicing", target: "Target invoicing", targetHint: "Planned progress to date × contract value", needs: "Needs a baseline and a contract value",
    chart: "Planned vs actual (cumulative)", planned: "Planned", actual: "Actual", variance: "Variance", plannedMonth: "Planned in month", actualMonth: "Actual in month", month: "Month", empty: "No data",
    basis: "Amounts are before VAT. Paid = paid invoices; confirmed = issued and paid (not drafts or void).",
  }, ur: {
    table: "Programme table", sheet: "Programme",
    loading: "Loading…", retry: "Retry", noBaseline: "No baseline has been imported yet, so the planned curve is not shown. Import the baseline file from the Import tab.",
    noHistory: (n: number, actual: string, cells: string) => `${n} cells have a status but no history, so the actual curve (from history) reads ${actual} while project progress from the statuses is ${cells}.`,
    contract: "Contract value", paid: "Paid", confirmed: "Confirmed invoicing", target: "Target invoicing", targetHint: "Planned progress to date × contract value", needs: "Needs a baseline and a contract value",
    chart: "Planned vs actual (cumulative)", planned: "Planned", actual: "Actual", variance: "Variance", plannedMonth: "Planned in month", actualMonth: "Actual in month", month: "Month", empty: "No data",
    basis: "Amounts are before VAT. Paid = paid invoices; confirmed = issued and paid (not drafts or void).",
  },
};

/** The server gives percentages on a 0-100 scale (30 is 30%); the export takes fractions (0.3 is 30%) with a percent format. */
const fraction = (value: number | null) => (value === null ? null : value / 100);

export function PmcProgramme({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { isArabic, language } = useLanguage();
  const t = pickLanguage(language, text);
  const query = trpc.pmc.programme.useQuery({ tenantId, projectId });
  // The chart takes the width it is given (a phone is narrower than any fixed size); without ResizeObserver (tests) it keeps a default.
  const box = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(520);
  const ready = Boolean(query.data);
  useEffect(() => {
    const element = box.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(entries => setWidth(Math.max(280, Math.floor(entries[0].contentRect.width))));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ready]);
  if (query.isLoading) return <p role="status" className="text-sm text-slate-500">{t.loading}</p>;
  if (!query.data) return <div><p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(query.error, isArabic)}</p><button type="button" className="mt-2 min-h-[44px] rounded-lg border px-4" onClick={() => query.refetch()}>{t.retry}</button></div>;
  const { months, hasBaseline, cards, cellsWithoutHistory, actualToDate, progressFromCells } = query.data;
  // The export matches the table row for row; with no months the button is shown disabled, not hidden.
  const columns: ExportColumn<(typeof months)[number]>[] = [
    { header: t.month, value: row => row.month.slice(0, 7) },
    { header: t.planned, value: row => fraction(row.planned), kind: "percent" },
    { header: t.actual, value: row => fraction(row.actual), kind: "percent" },
    { header: t.variance, value: row => fraction(row.variance), kind: "percent" },
    { header: t.plannedMonth, value: row => fraction(row.plannedInMonth), kind: "percent" },
    { header: t.actualMonth, value: row => fraction(row.actualInMonth), kind: "percent" },
  ];
  const exportButton = <ExportExcelButton fileName="pmc-programme" sheetName={t.sheet} title={t.table} rows={months} columns={columns} />;
  if (!months.length) return <div className="space-y-4"><div className="flex justify-end">{exportButton}</div><p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">{t.empty}</p></div>;
  const money = (amount: number | null) => (amount === null ? "—" : formatMoney(amount, cards.currency, isArabic));
  const chartData = months.map(m => ({ month: m.month.slice(0, 7), planned: m.planned, actual: m.actual }));
  const card = (key: string, label: string, amount: number | null, percent: number | null, hint?: string) => (
    <div key={key} className="rounded-xl border p-3" data-testid={`card-${key}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-semibold">{money(amount)}</p>
      <p className="text-sm text-slate-600">{percent === null ? (hint ?? "—") : formatPercent(percent, isArabic)}</p>
    </div>
  );

  return (
    <div className="space-y-4" data-testid="programme">
      {!hasBaseline && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t.noBaseline}</p>}
      {cellsWithoutHistory > 0 && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t.noHistory(cellsWithoutHistory, formatPercent(actualToDate, isArabic), formatPercent(progressFromCells, isArabic))}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {card("contract", t.contract, cards.contractValue, null)}
        {card("paid", t.paid, cards.paid.amount, cards.paid.percent)}
        {card("confirmed", t.confirmed, cards.confirmed.amount, cards.confirmed.percent)}
        {card("target", t.target, cards.target.amount, cards.target.amount === null ? null : cards.target.percent, t.needs)}
      </div>
      <p className="text-xs text-slate-500">{t.basis} {t.target}: {t.targetHint}.</p>
      <div ref={box}>
        <p className="mb-2 text-sm font-semibold">{t.chart}</p>
        <div style={{ direction: "ltr" }}>
        <LineChart width={width} height={280} data={chartData} margin={{ top: 8, right: 16, left: 4, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" interval="preserveStartEnd" />
          <YAxis domain={[0, 100]} unit="%" width={56} />
          <Tooltip />
          <Legend content={<ChartLegend />} />
          {hasBaseline && <Line type="linear" dataKey="planned" name={t.planned} stroke="#64748b" strokeDasharray="6 4" dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />}
          <Line type="linear" dataKey="actual" name={t.actual} stroke="#0e6b70" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} isAnimationActive={false} />
        </LineChart>
        </div>
      </div>
      <div className="flex justify-end">{exportButton}</div>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={pickLanguage(language, { ar: "جدول البرنامج الزمني", en: "Programme table", ur: "پروگرام کا جدول" })}>
        <table className="w-full min-w-[34rem] text-sm">
          <thead><tr className="border-b text-start"><th className="p-2 text-start">{t.month}</th><th className="p-2 text-start">{t.planned}</th><th className="p-2 text-start">{t.actual}</th><th className="p-2 text-start">{t.variance}</th><th className="p-2 text-start">{t.plannedMonth}</th><th className="p-2 text-start">{t.actualMonth}</th></tr></thead>
          <tbody>{months.map(m => (
            <tr key={m.month} className="border-b">
              <td className="p-2">{m.month.slice(0, 7)}</td>
              <td className="p-2">{formatPercent(m.planned, isArabic)}</td>
              <td className="p-2">{formatPercent(m.actual, isArabic)}</td>
              <td className={`p-2 ${m.variance !== null && m.variance < 0 ? "text-red-700" : ""}`}>{formatPercent(m.variance, isArabic)}</td>
              <td className="p-2">{formatPercent(m.plannedInMonth, isArabic)}</td>
              <td className="p-2">{formatPercent(m.actualInMonth, isArabic)}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}
