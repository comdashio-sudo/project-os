// Q-70 (1): «سجل الإنجاز» — one row per entry a person made: when, who, the activity, the villas (as ranges), before → after, and the source (the progress
// update, an import, a daily report, an undo, a single cell, a QC receipt). The dates are read on the server (pmc.progressLog); person, block, activity and
// source are lists chosen on the screen, and the Excel export is exactly the rows the screen shows. Q-69 layout: the log first and wide, the filters beside it.
import React, { useMemo, useState } from "react";
import { useParams } from "wouter";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, Select, TextInput } from "@/components/ds";
import { formatDateTime } from "@/components/ds/format";
import { ExportExcelButton } from "@/components/ExportExcelButton";
import { PageMain, PageTitle } from "@/components/pageFrame";
import { SourceNotice } from "@/components/SectionResilience";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { trpc } from "@/lib/trpc";

const ALL = "__all";
const PAGE = 100;
const text = {
  ar: {
    title: "سجل الإنجاز", intro: "كل إدخال إنجاز في صف واحد: متى، ومن، والبند، والفلل، وما كان وما صار، ومن أين جاء. القائمة تُصدَّر إلى Excel كما تظهر.",
    filters: "التصفية", from: "من تاريخ", to: "إلى تاريخ", person: "المستخدم", block: "البلوك", activity: "البند", source: "المصدر", all: "الكل",
    when: "التاريخ والوقت", who: "المستخدم", villas: "الفلل", count: "عدد الفلل", change: "قبل ← بعد", entries: "إدخالًا", more: "أظهر المزيد",
    none: "لا إدخالات بهذه التصفية.", cut: "السجل أطول من الحد في هذه المدة: ضيّق التواريخ لترى الأقدم.", unknown: "—",
    sources: { manual: "تحديث الإنجاز", import: "استيراد", dailyReport: "تقرير يومي", undo: "تراجع", cell: "خلية واحدة", qc: "استلام QC" },
    statuses: { NOT_STARTED: "لم يبدأ", IN_PROGRESS: "جارٍ", COMPLETE: "مكتمل", RECEIVED: "مستلم", NOT_RECEIVED: "غير مستلم" },
  },
  en: {
    title: "Progress log", intro: "Every progress entry in one row: when, who, the activity, the villas, what it was and what it became, and where it came from. The list exports to Excel as shown.",
    filters: "Filters", from: "From", to: "To", person: "User", block: "Block", activity: "Activity", source: "Source", all: "All",
    when: "Date and time", who: "User", villas: "Villas", count: "Villas", change: "Before → after", entries: "entries", more: "Show more",
    none: "No entries with this filter.", cut: "The log is longer than the limit in these dates: narrow the dates to see older entries.", unknown: "—",
    sources: { manual: "Progress update", import: "Import", dailyReport: "Daily report", undo: "Undo", cell: "Single cell", qc: "QC receipt" },
    statuses: { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", COMPLETE: "Complete", RECEIVED: "Received", NOT_RECEIVED: "Not received" },
  },
  ur: {
    title: "پیش رفت لاگ", intro: "ہر پیش رفت اندراج ایک قطار میں: کب، کس نے، سرگرمی، ولاز، پہلے کیا تھا اور کیا ہوا، اور کہاں سے آیا۔ فہرست جیسی دکھتی ہے ویسی Excel میں برآمد ہوتی ہے۔",
    filters: "فلٹر", from: "تاریخ سے", to: "تاریخ تک", person: "صارف", block: "بلاک", activity: "سرگرمی", source: "ذریعہ", all: "سب",
    when: "تاریخ اور وقت", who: "صارف", villas: "ولاز", count: "ولاز کی تعداد", change: "پہلے ← بعد", entries: "اندراجات", more: "مزید دکھائیں",
    none: "اس فلٹر کے ساتھ کوئی اندراج نہیں۔", cut: "ان تاریخوں میں لاگ حد سے لمبا ہے: پرانے دیکھنے کے لیے تاریخیں محدود کریں۔", unknown: "—",
    sources: { manual: "پیش رفت اپ ڈیٹ", import: "درآمد", dailyReport: "روزانہ رپورٹ", undo: "واپسی", cell: "ایک خانہ", qc: "کیو سی وصولی" },
    statuses: { NOT_STARTED: "شروع نہیں", IN_PROGRESS: "جاری", COMPLETE: "مکمل", RECEIVED: "وصول", NOT_RECEIVED: "وصول نہیں" },
  },
};

/** «700–703, 705»: consecutive villa numbers as ranges (the same folding as server/domain/progressLog.ts villaRanges). */
export function villaRanges(villas: string[]): string {
  const parts: string[] = []; let start: string | null = null; let previous: string | null = null;
  const flush = () => { if (start !== null) parts.push(start === previous ? start : `${start}–${previous}`); };
  for (const villa of villas) {
    const consecutive = previous !== null && /^\d+$/.test(villa) && /^\d+$/.test(previous) && Number(villa) === Number(previous) + 1;
    if (!consecutive) { flush(); start = villa; }
    previous = villa;
  }
  flush();
  return parts.join(", ");
}

/** The site's day (Riyadh, UTC+3), as the server counts it. */
const siteToday = (now = new Date()) => new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 10);
const daysBefore = (day: string, days: number) => new Date(Date.parse(`${day}T12:00:00Z`) - days * 86_400_000).toISOString().slice(0, 10);

export default function ProgressLog() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { language, isArabic } = useLanguage();
  const t = pickLanguage(language, text);
  const today = siteToday();
  const [from, setFrom] = useState(() => daysBefore(siteToday(), 30)); const [to, setTo] = useState(today);
  const [person, setPerson] = useState(ALL); const [block, setBlock] = useState(ALL); const [activity, setActivity] = useState(ALL); const [source, setSource] = useState(ALL);
  const [shownCount, setShownCount] = useState(PAGE);
  const query = trpc.pmc.progressLog.useQuery({ tenantId, projectId, from: from || undefined, to: to || undefined }, { enabled: Boolean(tenantId && projectId) });
  const entries = query.data?.entries ?? [];
  type Entry = (typeof entries)[number];
  const statusLabel = (status: string | null) => (status ? (t.statuses as Record<string, string>)[status] ?? status : t.unknown);
  const sourceLabel = (value: string) => (t.sources as Record<string, string>)[value] ?? value;
  const shown = useMemo(() => entries.filter(entry => (person === ALL || String(entry.byUserId) === person) && (block === ALL || entry.blocks.includes(block)) && (activity === ALL || entry.activityCode === activity) && (source === ALL || entry.source === source)), [entries, person, block, activity, source]);
  const activityOptions = useMemo(() => {
    const names = new Map<string, string>(); for (const entry of entries) names.set(entry.activityCode, entry.activityName);
    return [{ value: ALL, label: t.all }, ...Array.from(names, ([code, name]) => ({ value: code, label: `${code} — ${name}` })).sort((a, b) => a.value.localeCompare(b.value))];
  }, [entries, t.all]);
  const people = [{ value: ALL, label: t.all }, ...(query.data?.filters.people ?? []).map(entry => ({ value: String(entry.id), label: entry.name ?? String(entry.id) }))];
  const blocks = [{ value: ALL, label: t.all }, ...(query.data?.filters.blocks ?? []).map(code => ({ value: code, label: code }))];
  const sources = [{ value: ALL, label: t.all }, ...Object.keys(t.sources).map(value => ({ value, label: sourceLabel(value) }))];
  const when = (iso: string) => formatDateTime(iso, language);
  const exportColumns = [
    { header: t.when, kind: "date" as const, value: (row: Entry) => new Date(row.at) },
    { header: t.who, value: (row: Entry) => row.byName ?? t.unknown },
    { header: t.activity, value: (row: Entry) => `${row.activityCode} — ${row.activityName}` },
    { header: t.villas, value: (row: Entry) => villaRanges(row.villas) },
    { header: t.count, kind: "number" as const, value: (row: Entry) => row.villaCount },
    { header: t.block, value: (row: Entry) => row.blocks.join(", ") },
    { header: t.change, value: (row: Entry) => `${statusLabel(row.from)} ← ${statusLabel(row.to)}` },
    { header: t.source, value: (row: Entry) => sourceLabel(row.source) },
  ];

  return (
    <PageMain className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 md:p-6">
      <PageTitle title={t.title} description={t.intro} />
      <SourceNotice query={query} isArabic={isArabic} title={t.title} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <section className="flex min-w-0 flex-col gap-3" aria-label={t.title} data-progress-log>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {query.data ? <Badge tone="neutral"><bdi dir="ltr">{shown.length}</bdi> {t.entries}</Badge> : <span />}
            <ExportExcelButton fileName="progress-log" sheetName={t.title} title={t.title} rows={shown} columns={exportColumns} />
          </div>
          {query.data?.truncated ? <p role="note" className="rounded-xl bg-warning/10 px-4 py-3 text-sm ring-1 ring-warning/30">{t.cut}</p> : null}
          <ul className="flex flex-col gap-2">
            {shown.slice(0, shownCount).map(entry => (
              <li key={entry.key} className="rounded-[var(--radius)] border border-border bg-card p-3" data-log-entry={entry.source}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{entry.activityCode} — {entry.activityName}</span>
                  <Badge tone={entry.source === "undo" ? "warning" : entry.source === "qc" ? "info" : "neutral"}>{sourceLabel(entry.source)}</Badge>
                </div>
                <p className="mt-1 text-sm">{statusLabel(entry.from)} ← <strong>{statusLabel(entry.to)}</strong> · <bdi dir="ltr">{entry.villaCount}</bdi> {t.count}: <bdi dir="ltr">{villaRanges(entry.villas)}</bdi></p>
                <p className="mt-1 text-xs text-muted-foreground"><bdi>{when(entry.at)}</bdi> · {entry.byName ?? t.unknown}{entry.blocks.length ? <> · {entry.blocks.join(", ")}</> : null}</p>
              </li>
            ))}
            {query.data && shown.length === 0 && <li className="rounded-[var(--radius)] border border-dashed p-6 text-center text-sm text-muted-foreground">{t.none}</li>}
          </ul>
          {shown.length > shownCount ? <div><Button variant="secondary" onClick={() => setShownCount(count => count + PAGE)}>{t.more}</Button></div> : null}
        </section>
        <aside className="order-first lg:order-last">
          <Card>
            <CardHeader><CardTitle>{t.filters}</CardTitle></CardHeader>
            <CardBody className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <Field label={t.from}>{props => <TextInput {...props} type="date" dir="ltr" max={to || today} value={from} onChange={event => setFrom(event.target.value)} />}</Field>
              <Field label={t.to}>{props => <TextInput {...props} type="date" dir="ltr" min={from || undefined} max={today} value={to} onChange={event => setTo(event.target.value)} />}</Field>
              <Field label={t.person}>{props => <Select id={props.id} options={people} value={person} onValueChange={setPerson} />}</Field>
              <Field label={t.block}>{props => <Select id={props.id} options={blocks} value={block} onValueChange={setBlock} />}</Field>
              <Field label={t.activity}>{props => <Select id={props.id} options={activityOptions} value={activity} onValueChange={setActivity} />}</Field>
              <Field label={t.source}>{props => <Select id={props.id} options={sources} value={source} onValueChange={setSource} />}</Field>
            </CardBody>
          </Card>
        </aside>
      </div>
    </PageMain>
  );
}
