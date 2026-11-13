import React, { useState } from "react";
import { Link, useParams } from "wouter";
import { Button, Card, CardBody, CardHeader, CardTitle, Field, TableScroll, TextInput, formatDate, formatNumber } from "@/components/ds";
import { PageMain } from "@/components/pageFrame";
import { SectionFailed } from "@/components/ScreenStates";
import { WeeklyExports } from "@/components/WeeklyDeckSlides";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { trpc } from "@/lib/trpc";
import { monthlyReportNumber, type DeckFigures, type DeckMonthly } from "@/lib/weeklyDeck";

// D-53 (b): the monthly report — the month's figures, its S-curve (P6 plan against the daily reports) and milestones, read from reportPeriods.monthly (D-53 a),
// and its export to PowerPoint and PDF with the same slides as the weekly report (D-50). Nothing here is typed: every figure is the server's.
const text = {
  ar: { title: "التقرير الشهري", back: "ضوابط المشروع", month: "الشهر", previous: "الشهر السابق", next: "الشهر التالي", figures: "أرقام الشهر (من اليوميات المعتمدة)", reports: "تقارير يومية", workingDays: "أيام العمل", missing: "أيام بلا تقرير", direct: "عمالة مباشرة", indirect: "عمالة غير مباشرة", ncrOpen: "NCR مفتوحة", curve: "منحنى S", point: "الشهر", planned: "المخطط (P6) %", actual: "الفعلي %", deviation: "الانحراف", noPlan: "لا جدول P6 مستورد، فلا خط مخطط.", milestones: (n: number) => `المعالم: ${formatNumber(n)}`, exports: "تصدير التقرير الشهري", noProfile: "تعذّر تحميل بيانات المشروع؛ يُصدَّر التقرير بلا شعارات ولا بادئة ترقيم." },
  en: { title: "Monthly report", back: "Project controls", month: "Month", previous: "Previous month", next: "Next month", figures: "The month's figures (from approved daily reports)", reports: "Daily reports", workingDays: "Working days", missing: "Days without a report", direct: "Direct labour", indirect: "Indirect labour", ncrOpen: "Open NCRs", curve: "S-curve", point: "Month", planned: "Planned (P6) %", actual: "Actual %", deviation: "Deviation", noPlan: "No P6 schedule imported, so no planned line.", milestones: (n: number) => `Milestones: ${formatNumber(n)}`, exports: "Export the monthly report", noProfile: "The project profile could not be loaded; the report is exported without logos or number prefix." },
  ur: { title: "ماہانہ رپورٹ", back: "پروجیکٹ کنٹرولز", month: "مہینہ", previous: "پچھلا مہینہ", next: "اگلا مہینہ", figures: "مہینے کے اعداد (منظور شدہ روزانہ رپورٹوں سے)", reports: "روزانہ رپورٹیں", workingDays: "کام کے دن", missing: "رپورٹ کے بغیر دن", direct: "براہِ راست مزدوری", indirect: "بالواسطہ مزدوری", ncrOpen: "کھلی NCR", curve: "S-کرو", point: "مہینہ", planned: "منصوبہ (P6) %", actual: "اصل %", deviation: "فرق", noPlan: "P6 شیڈول درآمد نہیں ہوا، اس لیے منصوبے کی لکیر نہیں۔", milestones: (n: number) => `سنگِ میل: ${formatNumber(n)}`, exports: "ماہانہ رپورٹ برآمد کریں", noProfile: "پروجیکٹ کی معلومات لوڈ نہیں ہو سکیں؛ رپورٹ لوگو اور نمبر کے سابقے کے بغیر برآمد ہوگی۔" },
};

/** The month holding today (UTC), and the month n months away, as YYYY-MM. */
export const currentMonth = (today = new Date()) => today.toISOString().slice(0, 7);
export const shiftMonth = (month: string, by: number) => { const date = new Date(`${month}-01T00:00:00Z`); date.setUTCMonth(date.getUTCMonth() + by); return date.toISOString().slice(0, 7); };
const value = (figure: number | null | undefined, decimals = 1) => (figure === null || figure === undefined ? "—" : formatNumber(figure, decimals));

export default function MonthlyReport() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  const scope = { tenantId, projectId };
  const [month, setMonth] = useState(currentMonth());
  const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
  const report = trpc.reportPeriods.monthly.useQuery({ ...scope, month }, { enabled: Boolean(tenantId && projectId && valid) });
  const profile = trpc.projects.profile.get.useQuery(scope, { enabled: Boolean(tenantId && projectId) });
  const data = report.data;
  return (
    <PageMain className="mx-auto flex max-w-6xl flex-col gap-5 p-4 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><Link href={`/projects/${tenantId}/${projectId}/controls`} className="inline-flex min-h-11 items-center text-sm text-primary">{t.back}</Link><h1 className="text-xl font-semibold">{t.title}</h1></div>
        <div className="flex flex-wrap items-end gap-2">
          <Button variant="secondary" onClick={() => setMonth(shiftMonth(month, -1))}>{t.previous}</Button>
          <Field label={t.month}>{props => <TextInput {...props} type="month" value={month} onChange={event => setMonth(event.target.value)} />}</Field>
          <Button variant="secondary" onClick={() => setMonth(shiftMonth(month, 1))}>{t.next}</Button>
        </div>
      </div>
      {report.error ? <SectionFailed title={t.figures} error={report.error} isArabic={language === "ar"} onRetry={() => report.refetch()} /> : data ? (
        <Card aria-label={t.figures} data-month-figures>
          <CardHeader><CardTitle>{t.figures}</CardTitle><p className="text-sm text-muted-foreground"><bdi>{formatDate(data.period.start, language)}</bdi> – <bdi>{formatDate(data.period.end, language)}</bdi></p></CardHeader>
          <CardBody className="flex flex-col gap-4">
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-6">{([[t.reports, data.reports.length], [t.workingDays, data.period.workingDayCount], [t.missing, data.missingWorkingDays.length], [t.direct, data.labour.period.direct], [t.indirect, data.labour.period.indirect], [t.ncrOpen, data.quality.ncr.open]] as const).map(([label, figure]) => (
              <div key={label} className="rounded-[var(--radius)] bg-muted p-2"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-lg font-semibold">{formatNumber(figure)}</dd></div>))}</dl>
            <h2 className="text-sm font-semibold">{t.curve}</h2>
            {data.sCurve.plannedSource ? null : <p role="note" className="text-sm text-muted-foreground">{t.noPlan}</p>}
            <TableScroll label={t.curve}>
              <table className="w-full text-sm" data-s-curve><thead className="text-xs text-muted-foreground"><tr>{[t.point, t.planned, t.actual, t.deviation].map(head => <th key={head} scope="col" className="p-2 text-start">{head}</th>)}</tr></thead>
                <tbody className="divide-y">{data.sCurve.points.map(point => <tr key={point.month}><th scope="row" className="whitespace-nowrap p-2 text-start font-normal"><bdi dir="ltr">{point.month}</bdi></th><td className="p-2">{value(point.planned)}</td><td className="p-2">{value(point.actual)}</td><td className="p-2">{value(point.deviation)}</td></tr>)}</tbody></table>
            </TableScroll>
            <p className="text-sm">{t.milestones(data.milestones.length)}</p>
          </CardBody>
        </Card>
      ) : null}
      {profile.error ? <p role="note" className="text-sm text-muted-foreground">{t.noProfile}</p> : null}
      <WeeklyExports title={t.exports} fileBase={`monthly-report-${month}`} deck={data && (profile.data !== undefined || profile.error) ? {
        number: monthlyReportNumber(profile.data?.reportPrefix ?? null, month), figures: data as unknown as DeckFigures, labels: {}, texts: {}, photos: [],
        logos: [profile.data?.logos.client?.url ?? null, profile.data?.logos.consultant?.url ?? null, profile.data?.logos.contractor?.url ?? null],
        parties: [profile.data?.clientName ?? null, profile.data?.consultantName ?? null, profile.data?.contractorName ?? null],
        monthly: data as unknown as DeckMonthly,
      } : null} />
    </PageMain>
  );
}
