// Q-70 (2): «تقرير الإنجاز» — one row per villa × activity of the villa's model: block, phase, model, weight, status, the day it started, the day it was
// completed, the QC receipt, and who moved it last. The filters (block, phase, activity, status, villa) run on the server (pmc.completionReport), the table
// shows a page of PAGE rows, and the Excel export fetches every page of the same filters in turn — a whole project is about 265 thousand rows. Q-69 layout.
import React, { useState } from "react";
import { useParams } from "wouter";
import { Badge, Button, DataTable, Field, Select, TextInput, type Column } from "@/components/ds";
import { formatDateTime, formatNumber } from "@/components/ds/format";
import { PageMain, PageTitle } from "@/components/pageFrame";
import { SourceNotice } from "@/components/SectionResilience";
import { useLanguage } from "@/contexts/LanguageContext";
import { buildTableWorkbook, downloadWorkbook, exportFileName, type ExportColumn } from "@/lib/excelExport";
import { pickLanguage } from "@/lib/language";
import { trpc } from "@/lib/trpc";

const ALL = "__all";
const PAGE = 200;
const EXPORT_PAGE = 5000;
const text = {
  ar: {
    title: "تقرير الإنجاز", intro: "صف لكل فيلا × بند من بنود نموذجها: الحالة الآن، ويوم البدء ويوم الاكتمال، واستلام QC، وآخر من حرّكه — محسوب من سجلات الموقع.",
    filters: "التصفية", block: "البلوك", phase: "المرحلة", activity: "البند", status: "الحالة", villa: "رقم الفيلا", all: "الكل", model: "النموذج", weight: "الوزن %",
    started: "بدأ", completed: "اكتمل", qc: "استلام QC", lastBy: "آخر من حرّكه", rows: "صفًا", previous: "السابق", next: "التالي", none: "لا صفوف بهذه التصفية.",
    exportAll: (n: string) => `تصدير ${n} صف إلى Excel`, exporting: (done: string, all: string) => `جارٍ التصدير… ${done} من ${all}`, exportFailed: "تعذّر إنشاء ملف Excel. حاول مرة أخرى.", unknown: "—",
    received: "مستلم", notReceived: "غير مستلم", statuses: { NOT_STARTED: "لم يبدأ", IN_PROGRESS: "جارٍ", UNDER_REVIEW: "قيد المراجعة", COMPLETE: "مكتمل" },
  },
  en: {
    title: "Completion report", intro: "One row per villa × activity of its model: the status now, the day it started and the day it was completed, the QC receipt, and who moved it last — computed from the site's records.",
    filters: "Filters", block: "Block", phase: "Phase", activity: "Activity", status: "Status", villa: "Villa number", all: "All", model: "Model", weight: "Weight %",
    started: "Started", completed: "Completed", qc: "QC receipt", lastBy: "Last moved by", rows: "rows", previous: "Previous", next: "Next", none: "No rows with this filter.",
    exportAll: (n: string) => `Export ${n} rows to Excel`, exporting: (done: string, all: string) => `Exporting… ${done} of ${all}`, exportFailed: "The Excel file could not be created. Try again.", unknown: "—",
    received: "Received", notReceived: "Not received", statuses: { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", UNDER_REVIEW: "Under review", COMPLETE: "Complete" },
  },
  ur: {
    title: "تکمیل رپورٹ", intro: "ہر ولا × اس کے ماڈل کی سرگرمی کے لیے ایک قطار: موجودہ حالت، شروع اور تکمیل کا دن، کیو سی وصولی، اور آخری بار کس نے بدلا — سائٹ کے ریکارڈ سے۔",
    filters: "فلٹر", block: "بلاک", phase: "مرحلہ", activity: "سرگرمی", status: "حالت", villa: "ولا نمبر", all: "سب", model: "ماڈل", weight: "وزن %",
    started: "شروع", completed: "مکمل", qc: "کیو سی وصولی", lastBy: "آخری بار بدلا", rows: "قطاریں", previous: "پچھلا", next: "اگلا", none: "اس فلٹر کے ساتھ کوئی قطار نہیں۔",
    exportAll: (n: string) => `${n} قطاریں Excel میں برآمد کریں`, exporting: (done: string, all: string) => `برآمد ہو رہا ہے… ${all} میں سے ${done}`, exportFailed: "Excel فائل نہیں بن سکی۔ دوبارہ کوشش کریں۔", unknown: "—",
    received: "وصول", notReceived: "وصول نہیں", statuses: { NOT_STARTED: "شروع نہیں", IN_PROGRESS: "جاری", UNDER_REVIEW: "زیر جائزہ", COMPLETE: "مکمل" },
  },
};

type Status = "NOT_STARTED" | "IN_PROGRESS" | "UNDER_REVIEW" | "COMPLETE";

export default function CompletionReport() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { language, isArabic } = useLanguage();
  const t = pickLanguage(language, text);
  const utils = trpc.useUtils();
  const [block, setBlock] = useState(ALL); const [phase, setPhase] = useState(ALL); const [activity, setActivity] = useState(ALL); const [status, setStatus] = useState(ALL); const [villa, setVilla] = useState("");
  const [offset, setOffset] = useState(0);
  const [exporting, setExporting] = useState<{ done: number; all: number } | null>(null); const [exportFailed, setExportFailed] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(() => { try { return window.matchMedia("(min-width: 1024px)").matches; } catch { return false; } });
  const filter = { tenantId, projectId, ...(block !== ALL ? { blockCode: block } : {}), ...(phase !== ALL ? { phase } : {}), ...(activity !== ALL ? { activityCode: activity } : {}), ...(status !== ALL ? { status: status as Status } : {}), ...(villa.trim() ? { villa: villa.trim() } : {}) };
  const query = trpc.pmc.completionReport.useQuery({ ...filter, offset, limit: PAGE }, { enabled: Boolean(tenantId && projectId) });
  // the lists come with the first page; kept while paging so the filters do not empty
  const options = trpc.pmc.completionReport.useQuery({ tenantId, projectId, offset: 0, limit: 1 }, { enabled: Boolean(tenantId && projectId), staleTime: 60_000 });
  const lists = options.data?.filters;
  const change = (setter: (value: string) => void) => (value: string) => { setter(value); setOffset(0); };
  const statusLabel = (value: string) => (t.statuses as Record<string, string>)[value] ?? value;
  const qcLabel = (row: { qcReceived: boolean | null; qcOn: string | null }) => (row.qcReceived === null ? t.unknown : `${row.qcReceived ? t.received : t.notReceived}${row.qcOn ? ` · ${row.qcOn}` : ""}`);
  type Row = NonNullable<typeof query.data>["rows"][number];
  const exportColumns: ExportColumn<Row>[] = [
    { header: t.villa, kind: "number", value: row => Number(row.villa) },
    { header: t.block, value: row => row.blockCode },
    { header: t.phase, value: row => row.phase ?? "" },
    { header: t.model, value: row => row.modelCode },
    { header: t.activity, value: row => `${row.activityCode} — ${row.activityName}` },
    { header: t.weight, kind: "number", value: row => row.weightPercent },
    { header: t.status, value: row => statusLabel(row.status) },
    { header: t.started, kind: "date", value: row => (row.startedOn ? new Date(`${row.startedOn}T12:00:00Z`) : null) },
    { header: t.completed, kind: "date", value: row => (row.completedOn ? new Date(`${row.completedOn}T12:00:00Z`) : null) },
    { header: t.qc, value: row => qcLabel(row) },
    { header: t.lastBy, value: row => row.lastBy ?? "" },
  ];
  // every page of the same filters, in turn, then one workbook: the file is the whole filtered report, not only the page on screen
  const exportAll = async () => {
    setExportFailed(false);
    const all: Row[] = []; let next: number | null = 0; const total = query.data?.total ?? 0;
    setExporting({ done: 0, all: total });
    try {
      while (next !== null) {
        const page = await utils.pmc.completionReport.fetch({ ...filter, offset: next, limit: EXPORT_PAGE });
        all.push(...page.rows); next = page.nextOffset; setExporting({ done: all.length, all: page.total });
      }
      const exportedAt = new Date();
      downloadWorkbook(exportFileName("completion-report", exportedAt), await buildTableWorkbook({ sheetName: t.title, columns: exportColumns, rows: all, meta: { title: t.title, exportedAt, locale: language } }));
    } catch { setExportFailed(true); } finally { setExporting(null); }
  };
  const columns: Column<Row>[] = [
    { key: "villa", header: t.villa, numeric: true, render: row => <span className="whitespace-nowrap">{<bdi dir="ltr">{row.villa}</bdi>}</span> },
    { key: "block", header: t.block, render: row => <span className="whitespace-nowrap">{row.blockCode}</span> },
    { key: "phase", header: t.phase, render: row => <span className="whitespace-nowrap">{row.phase ?? t.unknown}</span> },
    { key: "model", header: t.model, render: row => <span className="whitespace-nowrap">{row.modelCode}</span> },
    { key: "activity", header: t.activity, render: row => <span className="whitespace-nowrap">{<span>{row.activityCode} — {row.activityName}</span>}</span> },
    { key: "weight", header: t.weight, numeric: true, render: row => <span className="whitespace-nowrap">{formatNumber(row.weightPercent, 2)}</span> },
    { key: "status", header: t.status, render: row => <span className="whitespace-nowrap">{<Badge tone={row.status === "COMPLETE" ? "success" : row.status === "UNDER_REVIEW" ? "warning" : row.status === "IN_PROGRESS" ? "info" : "neutral"}>{statusLabel(row.status)}</Badge>}</span> },
    { key: "started", header: t.started, render: row => <span className="whitespace-nowrap">{<bdi dir="ltr">{row.startedOn ?? t.unknown}</bdi>}</span> },
    { key: "completed", header: t.completed, render: row => <span className="whitespace-nowrap">{<bdi dir="ltr">{row.completedOn ?? t.unknown}</bdi>}</span> },
    { key: "qc", header: t.qc, render: row => <span className="whitespace-nowrap">{qcLabel(row)}</span> },
    { key: "lastBy", header: t.lastBy, render: row => <span className="whitespace-nowrap">{<span title={row.lastAt ? formatDateTime(row.lastAt, language) : undefined}>{row.lastBy ?? t.unknown}</span>}</span> },
  ];
  const total = query.data?.total ?? 0;
  const activeFilters = [block, phase, activity, status].filter(value => value !== ALL).length + (villa.trim() ? 1 : 0);

  return (
    <PageMain className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 md:p-6">
      <PageTitle title={t.title} description={t.intro} />
      <SourceNotice query={query} isArabic={isArabic} title={t.title} />
      <SourceNotice query={options} isArabic={isArabic} title={t.filters} />
      <div className="flex flex-col gap-4">
        <section className="flex min-w-0 flex-col gap-3" aria-label={t.title} data-completion-report>
          <div className="flex flex-wrap items-center justify-between gap-2">
            {query.data ? <Badge tone="neutral"><bdi dir="ltr">{formatNumber(total)}</bdi> {t.rows}</Badge> : <span />}
            <span className="inline-flex flex-col items-start gap-1">
              <Button variant="secondary" className="min-h-11" disabled={!total || exporting !== null} onClick={() => void exportAll()} data-export-all>{t.exportAll(formatNumber(total))}</Button>
              {exporting ? <span role="status" className="text-xs text-muted-foreground">{t.exporting(formatNumber(exporting.done), formatNumber(exporting.all))}</span> : null}
              {exportFailed ? <span role="alert" className="text-xs text-danger-soft-foreground">{t.exportFailed}</span> : null}
            </span>
          </div>
          <DataTable caption={t.title} columns={columns} rows={query.data?.rows ?? []} rowKey={row => `${row.villa}/${row.activityCode}`} empty={query.data ? t.none : undefined} />
          {total > PAGE ? (
            <div className="flex items-center justify-between gap-2">
              <Button variant="secondary" disabled={offset === 0} onClick={() => setOffset(value => Math.max(0, value - PAGE))}>{t.previous}</Button>
              <span className="text-sm text-muted-foreground" data-page><bdi dir="ltr">{formatNumber(offset + 1)}–{formatNumber(Math.min(offset + PAGE, total))} / {formatNumber(total)}</bdi></span>
              <Button variant="secondary" disabled={query.data?.nextOffset == null} onClick={() => setOffset(value => value + PAGE)}>{t.next}</Button>
            </div>
          ) : null}
        </section>
        {/* a wide table: the filters stand in one row above it on a laptop (the table keeps the whole width), and fold into one line on a phone */}
        <aside className="order-first">
          <details open={filtersOpen} onToggle={event => setFiltersOpen((event.target as HTMLDetailsElement).open)} className="rounded-[var(--radius)] border border-border bg-card" data-report-filters>
            <summary className="flex min-h-11 cursor-pointer items-center justify-between gap-2 px-4 py-2 font-semibold">{t.filters}{activeFilters ? <Badge tone="primary"><bdi dir="ltr">{activeFilters}</bdi></Badge> : null}</summary>
            <div className="grid gap-3 border-t border-border p-4 sm:grid-cols-2 lg:grid-cols-5">
              <Field label={t.villa}>{props => <TextInput {...props} dir="ltr" inputMode="numeric" value={villa} onChange={event => { setVilla(event.target.value); setOffset(0); }} />}</Field>
              <Field label={t.block}>{props => <Select id={props.id} options={[{ value: ALL, label: t.all }, ...(lists?.blocks ?? []).map(code => ({ value: code, label: code }))]} value={block} onValueChange={change(setBlock)} />}</Field>
              <Field label={t.phase}>{props => <Select id={props.id} options={[{ value: ALL, label: t.all }, ...(lists?.phases ?? []).map(code => ({ value: code, label: code }))]} value={phase} onValueChange={change(setPhase)} />}</Field>
              <Field label={t.activity}>{props => <Select id={props.id} options={[{ value: ALL, label: t.all }, ...(lists?.activities ?? []).map(item => ({ value: item.code, label: `${item.code} — ${item.name}` }))]} value={activity} onValueChange={change(setActivity)} />}</Field>
              <Field label={t.status}>{props => <Select id={props.id} options={[{ value: ALL, label: t.all }, ...(["NOT_STARTED", "IN_PROGRESS", "UNDER_REVIEW", "COMPLETE"] as const).map(value => ({ value, label: statusLabel(value) }))]} value={status} onValueChange={change(setStatus)} />}</Field>
            </div>
          </details>
        </aside>
      </div>
    </PageMain>
  );
}
