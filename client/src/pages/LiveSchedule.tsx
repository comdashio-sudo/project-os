// Q-23 (second batch): the live schedule screen. Everything on it comes from schedule.live (server/scheduleSnapshots.ts): today's activities against the
// baseline snapshot, critical by P6 total float, planned against actual at the data date, and the two-week look-ahead. A filter narrows the list, a simple
// Gantt draws the baseline (thin) under the forecast (thick) on one time axis with the data date marked, and «Export» saves the rows shown as CSV.
// Nothing is computed here that the server did not return; a number the server could not know (no baseline, no float) reads «not available», never 0.
import React, { useMemo, useState } from "react";
import { useParams } from "wouter";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, Select, TextInput } from "@/components/ds";
import { formatDate } from "@/components/ds/format";
import { PageMain, PageTitle } from "@/components/pageFrame";
import { SourceNotice } from "@/components/SectionResilience";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { trpc } from "@/lib/trpc";
import { PAGE_NAMES } from "@shared/pageNames";
import { ScheduleCompare } from "@/components/ScheduleCompare";
import { ScheduleStageMapping } from "@/components/ScheduleStageMapping";
import { VillaPlannedCurve } from "@/components/VillaPlannedCurve";

type Filter = "all" | "critical" | "late" | "lookAhead" | "open";
const text = {
  ar: { intro: "أنشطة المشروع اليوم مقابل خط الأساس (أول استيراد P6): الانحراف بالأيام، الأنشطة الحرجة بعائم P6، المخطط مقابل الفعلي عند تاريخ البيانات، وما يبدأ أو ينتهي في الأسبوعين القادمين.", dataDate: "تاريخ البيانات", fromFile: "من ملف P6", baseline: "خط الأساس", noBaseline: "لا خط أساس بعد: يُنشأ عند أول استيراد P6 مؤكَّد.", na: "غير متاح", activities: "الأنشطة", critical: "حرجة", plannedStart: "مخطط أن تبدأ", started: "بدأت", plannedFinish: "مخطط أن تنتهي", finished: "انتهت", late: "متأخرة النهاية", lookAhead: "الأسبوعان القادمان", filter: "عرض", search: "بحث برقم النشاط أو اسمه", all: "الكل", open: "غير المكتملة", export: "تصدير CSV", code: "النشاط", name: "الاسم", baseStart: "بداية الأساس", baseFinish: "نهاية الأساس", forecastStart: "البداية المتوقعة", forecastFinish: "النهاية المتوقعة", startVar: "انحراف البداية (يوم)", finishVar: "انحراف النهاية (يوم)", float: "العائم (ساعة)", gantt: "المخطط الزمني", legendBase: "خط الأساس", legendForecast: "المتوقع", legendCritical: "حرج", none: "لا أنشطة تطابق العرض.", shown: "معروض", snapshots: "اللقطات", source: { p6_import: "استيراد P6", p6_update: "تحديث أنشطة" } },
  en: { intro: "The project's activities today against the baseline (the first P6 import): variance in days, critical activities by P6 float, planned against actual at the data date, and what starts or finishes in the next two weeks.", dataDate: "Data date", fromFile: "from the P6 file", baseline: "Baseline", noBaseline: "No baseline yet: it is made by the first confirmed P6 import.", na: "Not available", activities: "Activities", critical: "Critical", plannedStart: "Planned to start", started: "Started", plannedFinish: "Planned to finish", finished: "Finished", late: "Finishing late", lookAhead: "Next two weeks", filter: "Show", search: "Search by activity ID or name", all: "All", open: "Not complete", export: "Export CSV", code: "Activity", name: "Name", baseStart: "Baseline start", baseFinish: "Baseline finish", forecastStart: "Forecast start", forecastFinish: "Forecast finish", startVar: "Start variance (days)", finishVar: "Finish variance (days)", float: "Float (hours)", gantt: "Timeline", legendBase: "Baseline", legendForecast: "Forecast", legendCritical: "Critical", none: "No activity matches.", shown: "Shown", snapshots: "Snapshots", source: { p6_import: "P6 import", p6_update: "Activity update" } },
  ur: { intro: "منصوبے کی آج کی سرگرمیاں بنیادی منصوبے (پہلی P6 درآمد) کے مقابلے میں: دنوں میں فرق، P6 فلوٹ سے اہم سرگرمیاں، ڈیٹا کی تاریخ پر منصوبہ بمقابلہ اصل، اور اگلے دو ہفتوں میں شروع یا ختم ہونے والی۔", dataDate: "ڈیٹا کی تاریخ", fromFile: "P6 فائل سے", baseline: "بنیادی منصوبہ", noBaseline: "ابھی کوئی بنیادی منصوبہ نہیں: یہ پہلی تصدیق شدہ P6 درآمد سے بنتا ہے۔", na: "دستیاب نہیں", activities: "سرگرمیاں", critical: "اہم", plannedStart: "شروع ہونا تھیں", started: "شروع ہوئیں", plannedFinish: "ختم ہونا تھیں", finished: "ختم ہوئیں", late: "تاخیر سے ختم", lookAhead: "اگلے دو ہفتے", filter: "دکھائیں", search: "سرگرمی نمبر یا نام سے تلاش", all: "سب", open: "نامکمل", export: "CSV برآمد", code: "سرگرمی", name: "نام", baseStart: "بنیادی آغاز", baseFinish: "بنیادی اختتام", forecastStart: "متوقع آغاز", forecastFinish: "متوقع اختتام", startVar: "آغاز کا فرق (دن)", finishVar: "اختتام کا فرق (دن)", float: "فلوٹ (گھنٹے)", gantt: "ٹائم لائن", legendBase: "بنیادی", legendForecast: "متوقع", legendCritical: "اہم", none: "کوئی سرگرمی مطابقت نہیں رکھتی۔", shown: "دکھائی گئیں", snapshots: "اسنیپ شاٹس", source: { p6_import: "P6 درآمد", p6_update: "سرگرمی تازہ کاری" } },
};

const time = (value: Date | string | null | undefined) => (value ? new Date(value).getTime() : null);
const csvCell = (value: unknown) => { const raw = value === null || value === undefined ? "" : value instanceof Date ? value.toISOString().slice(0, 10) : String(value); return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw; };

export default function LiveSchedule() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { language, isArabic } = useLanguage();
  const t = pickLanguage(language, text);
  const title = pickLanguage(language, PAGE_NAMES.liveSchedule);
  const query = trpc.schedule.live.useQuery({ tenantId, projectId }, { enabled: Boolean(tenantId && projectId) });
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const data = query.data;
  const lookAhead = useMemo(() => new Set(data?.lookAhead ?? []), [data]);
  const shown = useMemo(() => (data?.rows ?? []).filter(row => {
    if (filter === "critical" && row.critical !== true) return false;
    if (filter === "late" && !((row.finishVarianceDays ?? 0) > 0)) return false;
    if (filter === "lookAhead" && !lookAhead.has(row.id)) return false;
    if (filter === "open" && (row.actualFinish || row.status === "completed")) return false;
    const needle = search.trim().toLowerCase();
    return !needle || row.code.toLowerCase().includes(needle) || row.name.toLowerCase().includes(needle);
  }), [data, filter, search, lookAhead]);

  // one time axis for the Gantt: the earliest and latest date among the rows shown (baseline and forecast) and the data date
  const axis = useMemo(() => {
    const points = shown.flatMap(row => [row.baselineStart, row.baselineFinish, row.forecastStart, row.forecastFinish]).map(time).filter((value): value is number => value !== null);
    const dataDate = time(data?.dataDate);
    if (dataDate !== null) points.push(dataDate);
    if (!points.length) return null;
    const from = Math.min(...points); const to = Math.max(...points);
    return { from, span: Math.max(to - from, 86_400_000), dataDate };
  }, [shown, data]);
  const place = (start: Date | string | null, finish: Date | string | null) => {
    const a = time(start); const b = time(finish);
    if (!axis || a === null || b === null) return null;
    return { left: `${((Math.min(a, b) - axis.from) / axis.span) * 100}%`, width: `${Math.max(((Math.abs(b - a)) / axis.span) * 100, 0.6)}%` };
  };

  const count = (value: number | null | undefined) => (value === null || value === undefined ? t.na : <bdi dir="ltr">{value}</bdi>);
  const date = (value: Date | string | null) => (value ? formatDate(new Date(value), language) : "—");
  const signed = (value: number | null) => (value === null ? "—" : <bdi dir="ltr">{value > 0 ? `+${value}` : value}</bdi>);

  const exportCsv = () => {
    const header = [t.code, t.name, t.baseStart, t.baseFinish, t.forecastStart, t.forecastFinish, t.startVar, t.finishVar, t.float, t.critical];
    const lines = [header, ...shown.map(row => [row.code, row.name, row.baselineStart, row.baselineFinish, row.forecastStart, row.forecastFinish, row.startVarianceDays, row.finishVarianceDays, row.totalFloatHours, row.critical === null ? "" : row.critical ? "1" : "0"])].map(cells => cells.map(csvCell).join(","));
    const url = URL.createObjectURL(new Blob([`﻿${lines.join("\n")}`], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `live-schedule-${projectId}.csv`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <PageMain className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 md:p-6">
      <PageTitle title={title} description={t.intro} />
      <SourceNotice query={query} isArabic={isArabic} title={title} />
      {data && <>
        <div className="flex flex-wrap items-center gap-2 text-sm" data-live-dates>
          <span>{t.dataDate}: <strong>{date(data.dataDate)}</strong>{data.latest ? <span className="text-muted-foreground"> · {t.source[data.latest.source as keyof typeof t.source] ?? data.latest.source}</span> : null}</span>
          <span className="text-muted-foreground">·</span>
          {data.baseline ? <span>{t.baseline}: <strong>{date(data.baseline.dataDate)}</strong> · {t.snapshots}: <bdi dir="ltr">{data.snapshots.length}</bdi></span> : <span className="text-muted-foreground" data-no-baseline>{t.noBaseline}</span>}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8" data-live-summary>
          {([[t.activities, data.summary.activities], [t.critical, data.summary.critical], [t.plannedStart, data.summary.plannedToStart], [t.started, data.summary.started], [t.plannedFinish, data.summary.plannedToFinish], [t.finished, data.summary.finished], [t.late, data.summary.lateFinishing], [t.lookAhead, data.summary.lookAhead]] as Array<[string, number | null]>).map(([label, value]) => (
            <Card key={label}><CardBody className="p-3"><div className="text-xs text-muted-foreground">{label}</div><div className="text-xl font-semibold">{count(value)}</div></CardBody></Card>
          ))}
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <Field label={t.filter}>{props => <Select id={props.id} value={filter} onValueChange={value => setFilter(value as Filter)} options={[{ value: "all", label: t.all }, { value: "critical", label: t.critical }, { value: "late", label: t.late }, { value: "lookAhead", label: t.lookAhead }, { value: "open", label: t.open }]} />}</Field>
          <Field label={t.search}>{props => <TextInput id={props.id} value={search} onChange={event => setSearch(event.target.value)} />}</Field>
          <Badge tone="neutral">{t.shown}: <bdi dir="ltr">{shown.length}</bdi></Badge>
          <Button variant="secondary" className="min-h-11" onClick={exportCsv} disabled={!shown.length}>{t.export}</Button>
        </div>
        <Card>
          <CardHeader><CardTitle>{t.gantt}</CardTitle>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground" aria-hidden="true"><span className="inline-flex items-center gap-1"><span className="inline-block h-1.5 w-5 rounded bg-muted-foreground/40" />{t.legendBase}</span><span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-5 rounded bg-primary" />{t.legendForecast}</span><span className="inline-flex items-center gap-1"><span className="inline-block h-3 w-5 rounded bg-destructive" />{t.legendCritical}</span></div>
          </CardHeader>
          <CardBody className="overflow-x-auto p-0">
            {shown.length === 0 ? <p className="p-4 text-sm text-muted-foreground">{t.none}</p> : (
              <table className="w-full min-w-[900px] text-sm" data-live-rows>
                <thead><tr className="border-b text-start text-xs text-muted-foreground"><th className="p-2 text-start">{t.code}</th><th className="p-2 text-start">{t.name}</th><th className="p-2 text-start">{t.forecastStart}</th><th className="p-2 text-start">{t.forecastFinish}</th><th className="p-2 text-start">{t.startVar}</th><th className="p-2 text-start">{t.finishVar}</th><th className="p-2 text-start">{t.float}</th><th className="w-[30%] p-2 text-start">{t.gantt}</th></tr></thead>
                <tbody>{shown.map(row => {
                  const base = place(row.baselineStart, row.baselineFinish); const forecast = place(row.forecastStart, row.forecastFinish);
                  return <tr key={row.id} className="border-b align-middle" data-activity={row.code} data-critical={row.critical === true ? "true" : undefined}>
                    <td className="p-2 font-medium"><bdi dir="ltr">{row.code}</bdi>{row.critical ? <Badge tone="danger" className="ms-2">{t.critical}</Badge> : null}</td>
                    <td className="p-2">{row.name}</td>
                    <td className="p-2">{date(row.forecastStart)}</td>
                    <td className="p-2">{date(row.forecastFinish)}</td>
                    <td className="p-2">{signed(row.startVarianceDays)}</td>
                    <td className={`p-2 ${(row.finishVarianceDays ?? 0) > 0 ? "font-semibold text-destructive" : ""}`}>{signed(row.finishVarianceDays)}</td>
                    <td className="p-2">{row.totalFloatHours === null ? t.na : <bdi dir="ltr">{row.totalFloatHours}</bdi>}</td>
                    <td className="p-2"><div dir="ltr" className="relative h-6 rounded bg-muted/40">
                      {base ? <span className="absolute top-4 h-1.5 rounded bg-muted-foreground/40" style={base} /> : null}
                      {forecast ? <span className={`absolute top-1 h-3 rounded ${row.critical ? "bg-destructive" : "bg-primary"}`} style={forecast} /> : null}
                      {axis?.dataDate !== null && axis ? <span className="absolute inset-y-0 w-px bg-foreground" style={{ left: `${((axis.dataDate! - axis.from) / axis.span) * 100}%` }} /> : null}
                    </div></td>
                  </tr>;
                })}</tbody>
              </table>
            )}
          </CardBody>
        </Card>
        {/* Q-23: two updates compared (schedule.compare) */}
        <ScheduleCompare key={data.snapshots.map(snapshot => snapshot.id).join(",")} tenantId={tenantId} projectId={projectId} snapshots={data.snapshots} sourceLabel={source => t.source[source as keyof typeof t.source] ?? source} />
        {/* Q-61 (3): schedule stages linked to the weight groups (schedule.stageMapping), with Q-61 (2)'s differences */}
        <ScheduleStageMapping tenantId={tenantId} projectId={projectId} />
        {/* Q-61 (4): the planned S-curve per villa / block / model / project and the villas behind plan (schedule.plannedCurve) */}
        <VillaPlannedCurve tenantId={tenantId} projectId={projectId} />
      </>}
    </PageMain>
  );
}
