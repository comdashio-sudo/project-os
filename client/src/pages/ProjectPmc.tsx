import { DirectImportRunner, type DirectImportView } from "@/components/DirectImportRunner";
import { PageMain, PageHeader } from "@/components/pageFrame";
import { SectionErrorBoundary } from "@/components/SectionResilience";
import { Button } from "@/components/ui/button";
import { ALL, LabelledSelect } from "@/components/LabelledSelect";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { ErrorState } from "@/components/ScreenStates";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Download, FileUp, Printer } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { exportElementToPdf } from "@/lib/pdfExport";
import { Link, useParams } from "wouter";
import { PmcProgramme } from "./PmcProgramme";
import { PmcSitePlan } from "./PmcSitePlan";
import { WriteGate } from "@/lib/permissions";
import { ExportExcelButton } from "@/components/ExportExcelButton";
import type { ExportColumn } from "@/lib/excelExport";
import { pickLanguage } from "@/lib/language";
import { wo22Text } from "@/lib/wo22Text";
import { SourcePercentages } from "@/components/pmc/SourcePercentages";
import { TableScroll } from "@/components/ds/TableScroll";

export const PMC_TEXT = {
  ar: {
    title: "ضبط المشروع PMC", back: "العودة إلى ضوابط المشروع", loading: "جارٍ التحميل…", retry: "إعادة المحاولة", noData: "لا توجد بيانات", export: "تصدير Excel", pdf: "PDF", print: "طباعة", pdfFailed: "تعذّر بناء ملف PDF. اطبع من المتصفح بدلًا منه.",
    tabs: { latestUpdates: "آخر التحديثات", approvals: "الاعتمادات", sitePlan: "المخطط", programme: "البرنامج الزمني", inspections: "الفحوصات", activities: "الأنشطة", zones: "المناطق", weekly: "الأسبوعي", monthly: "الشهري", pending: "المعلّق", stages: "المراحل", import: "الاستيراد" },
    filters: { zone: "المنطقة", block: "البلوك", unitFrom: "من وحدة", unitTo: "إلى وحدة", group: "المجموعة", stage: "المرحلة", activity: "النشاط", period: "الفترة", all: "الكل", default: "الافتراضية", d7: "آخر 7 أيام", d30: "آخر 30 يومًا", d90: "آخر 90 يومًا", d365: "آخر 12 شهرًا", everything: "كل الفترة", contractor: "المقاول", consultant: "الاستشاري" },
    freshness: "حداثة البيانات", sources: { locations: "المواقع", catalog: "الكتالوج", status: "حالة الأنشطة", requests: "الطلبات", baseline: "خط الأساس" }, otherSource: "مصدر آخر", never: "لا تحديث بعد", today: "اليوم", daysAgo: (n: number) => (n === 1 ? "قبل يوم واحد" : n === 2 ? "قبل يومين" : n <= 10 ? `قبل ${n} أيام` : `قبل ${n} يومًا`),
    engineer: "المهندس", updates: "التحديثات", activeDays: "أيام نشطة", unitRange: "نطاق الوحدات", added: "النسبة المضافة", byGroup: "حسب المجموعة", total: "الإجمالي",
    request: "الطلب", activity: "النشاط", date: "التاريخ", contractor: "المقاول", consultant: "الاستشاري", reply: "الرد", units: "الوحدات", pendingReply: "معلّق", perConsultant: "الردود لكل استشاري", perDay: "الردود حسب اليوم", perActivity: "الردود حسب النشاط",
    stage: "الموقف", count: "العدد", percent: "النسبة", heldBy: "عند من الطلب", stalled: "أكثر الأنشطة تعطلًا", open: "مفتوح", oldestDays: "أقدم (أيام)",
    stageNames: { CONFIGURATIONS: "التهيئة", MANAGER_APPROVAL: "اعتماد المدير", TECHNICAL_ASSISTANT: "المساعد الفني", WAITING_CONSULTANT: "انتظار الاستشاري", RESULT_RECEIVING: "استلام النتيجة", ANSWERED: "تم الرد", REJECTED: "مرفوض", NOT_STARTED: "لم يبدأ" } as Record<string, string>,
    group: "المجموعة", weight: "الوزن", share: "النسبة من الوزن", zone: "المنطقة", cells: "الخلايا", complete: "المكتمل", completion: "الإنجاز", unassigned: "غير مسند",
    period: "الفترة من", status: "الحالة", statuses: { NOT_STARTED: "لم يبدأ", IN_PROGRESS: "قيد التنفيذ", UNDER_REVIEW: "قيد المراجعة", COMPLETE: "مكتمل" } as Record<string, string>,
    unit: "الوحدة", verification: "حالة التحقق", since: "منذ", age: "العمر (أيام)", buckets: "أعمار الانتظار", late: "أنشطة متأخرة", planned: "المخطط", actual: "الفعلي", noLate: "لا أنشطة متأخرة",
    importKinds: { locations: "المواقع", catalog: "الكتالوج والأوزان", status: "حالة الوحدة-النشاط", requests: "الطلبات والردود", baseline: "خط الأساس", baselineDates: "خط الأساس بتواريخ البداية والنهاية" } as Record<string, string>,
    importKind: "نوع الملف", chooseFile: "اختر ملف Excel أو CSV", analyze: "فحص الملف", confirm: "حفظ الملف الموافَق عليه", report: "تقرير التحقق", rows: "الصفوف", create: "سيُنشأ", update: "سيُحدَّث", unchanged: "بلا تغيير", errorsFound: "صفوف مرفوضة", row: "الصف", reason: "السبب", saved: "تم الحفظ", nothingSaved: "لم يُحفظ شيء قبل موافقتك.", alreadyUpToDate: "الملف مطابق لما هو محفوظ: لا شيء ليُحفظ.",
  },
  en: {
    title: "Project control (PMC)", back: "Back to project controls", loading: "Loading…", retry: "Retry", noData: "No data", export: "Export Excel", pdf: "PDF", print: "Print", pdfFailed: "Could not build the PDF. Print from the browser instead.",
    tabs: { latestUpdates: "Latest updates", approvals: "Approvals", sitePlan: "Site plan", programme: "Programme", inspections: "Inspections", activities: "Activities", zones: "Zones", weekly: "Weekly", monthly: "Monthly", pending: "Pending", stages: "Stages", import: "Import" },
    filters: { zone: "Zone", block: "Block", unitFrom: "From unit", unitTo: "To unit", group: "Group", stage: "Stage", activity: "Activity", period: "Period", all: "All", default: "Default", d7: "Last 7 days", d30: "Last 30 days", d90: "Last 90 days", d365: "Last 12 months", everything: "All time", contractor: "Contractor", consultant: "Consultant" },
    freshness: "Data freshness", sources: { locations: "Locations", catalog: "Catalogue", status: "Activity status", requests: "Requests", baseline: "Baseline" }, otherSource: "Other source", never: "never updated", today: "today", daysAgo: (n: number) => (n === 1 ? "1 day ago" : `${n} days ago`),
    engineer: "Engineer", updates: "Updates", activeDays: "Active days", unitRange: "Unit range", added: "Percent added", byGroup: "By group", total: "Total",
    request: "Request", activity: "Activity", date: "Date", contractor: "Contractor", consultant: "Consultant", reply: "Reply", units: "Units", pendingReply: "pending", perConsultant: "Replies per consultant", perDay: "Replies per day", perActivity: "Replies per activity",
    stage: "Stage", count: "Count", percent: "Percent", heldBy: "Held by", stalled: "Most stalled activities", open: "Open", oldestDays: "Oldest (days)",
    stageNames: { CONFIGURATIONS: "Configurations", MANAGER_APPROVAL: "Manager approval", TECHNICAL_ASSISTANT: "Technical assistant", WAITING_CONSULTANT: "Waiting for consultant", RESULT_RECEIVING: "Result receiving", ANSWERED: "Answered", REJECTED: "Rejected", NOT_STARTED: "Not started" } as Record<string, string>,
    group: "Group", weight: "Weight", share: "Share of weight", zone: "Zone", cells: "Cells", complete: "Complete", completion: "Completion", unassigned: "Unassigned",
    period: "Period from", status: "Status", statuses: { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", UNDER_REVIEW: "Under review", COMPLETE: "Complete" } as Record<string, string>,
    unit: "Unit", verification: "Verification status", since: "Since", age: "Age (days)", buckets: "Waiting age", late: "Late activities", planned: "Planned", actual: "Actual", noLate: "No late activities",
    importKinds: { locations: "Locations", catalog: "Catalogue and weights", status: "Unit-activity status", requests: "Requests and replies", baseline: "Baseline", baselineDates: "Baseline by start and end dates" } as Record<string, string>,
    importKind: "File type", chooseFile: "Choose an Excel or CSV file", analyze: "Check the file", confirm: "Save the approved file", report: "Validation report", rows: "Rows", create: "Will create", update: "Will update", unchanged: "Unchanged", errorsFound: "Rejected rows", row: "Row", reason: "Reason", saved: "Saved", nothingSaved: "Nothing is saved until you approve.", alreadyUpToDate: "The file matches what is stored: nothing to save.",
  }, ur: {
    title: "Project control (PMC)", back: "Back to project controls", loading: "Loading…", retry: "Retry", noData: "No data", export: "Export Excel", pdf: "PDF", print: "Print", pdfFailed: "Could not build the PDF. Print from the browser instead.",
    tabs: { latestUpdates: "Latest updates", approvals: "Approvals", sitePlan: "Site plan", programme: "Programme", inspections: "Inspections", activities: "Activities", zones: "Zones", weekly: "Weekly", monthly: "Monthly", pending: "Pending", stages: "Stages", import: "Import" },
    filters: { zone: "Zone", block: "Block", unitFrom: "From unit", unitTo: "To unit", group: "Group", stage: "Stage", activity: "Activity", period: "Period", all: "All", default: "Default", d7: "Last 7 days", d30: "Last 30 days", d90: "Last 90 days", d365: "Last 12 months", everything: "All time", contractor: "Contractor", consultant: "Consultant" },
    freshness: "ڈیٹا کی تازگی", sources: { locations: "مقامات", catalog: "کیٹلاگ", status: "سرگرمیوں کی حالت", requests: "درخواستیں", baseline: "بنیادی منصوبہ" }, otherSource: "دیگر ماخذ", never: "ابھی تک اپ ڈیٹ نہیں ہوا", today: "آج", daysAgo: (n: number) => `${n} دن پہلے`,
    engineer: "Engineer", updates: "Updates", activeDays: "Active days", unitRange: "Unit range", added: "Percent added", byGroup: "By group", total: "Total",
    request: "Request", activity: "Activity", date: "Date", contractor: "Contractor", consultant: "Consultant", reply: "Reply", units: "Units", pendingReply: "pending", perConsultant: "Replies per consultant", perDay: "Replies per day", perActivity: "Replies per activity",
    stage: "Stage", count: "Count", percent: "Percent", heldBy: "Held by", stalled: "Most stalled activities", open: "Open", oldestDays: "Oldest (days)",
    stageNames: { CONFIGURATIONS: "Configurations", MANAGER_APPROVAL: "Manager approval", TECHNICAL_ASSISTANT: "Technical assistant", WAITING_CONSULTANT: "Waiting for consultant", RESULT_RECEIVING: "Result receiving", ANSWERED: "Answered", REJECTED: "Rejected", NOT_STARTED: "Not started" } as Record<string, string>,
    group: "Group", weight: "Weight", share: "Share of weight", zone: "Zone", cells: "Cells", complete: "Complete", completion: "Completion", unassigned: "Unassigned",
    period: "Period from", status: "Status", statuses: { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", UNDER_REVIEW: "Under review", COMPLETE: "Complete" } as Record<string, string>,
    unit: "Unit", verification: "Verification status", since: "Since", age: "Age (days)", buckets: "Waiting age", late: "Late activities", planned: "Planned", actual: "Actual", noLate: "No late activities",
    importKinds: { locations: "Locations", catalog: "Catalogue and weights", status: "Unit-activity status", requests: "Requests and replies", baseline: "Baseline", baselineDates: "Baseline by start and end dates" } as Record<string, string>,
    importKind: "File type", chooseFile: "Choose an Excel or CSV file", analyze: "Check the file", confirm: "Save the approved file", report: "Validation report", rows: "Rows", create: "Will create", update: "Will update", unchanged: "Unchanged", errorsFound: "Rejected rows", row: "Row", reason: "Reason", saved: "Saved", nothingSaved: "Nothing is saved until you approve.", alreadyUpToDate: "The file matches what is stored: nothing to save.",
  },
};
const text = PMC_TEXT;
type T = typeof text.en;
const TABS = ["latestUpdates", "approvals", "sitePlan", "programme", "inspections", "activities", "zones", "weekly", "monthly", "pending", "stages", "import"] as const;
type Tab = (typeof TABS)[number];
type Filters = { zone?: string; block?: string; unitFrom?: number; unitTo?: number; group?: string; stage?: string; activity?: string; contractor?: string; consultant?: string; since?: Date };
const field = "min-h-[44px] rounded-lg border border-input bg-card px-2 text-sm";

function Table({ label, headers, rows }: { label: string; headers: string[]; rows: Array<Array<React.ReactNode>> }) {
  return (
    <TableScroll label={label}>
      <table className="w-full min-w-[32rem] text-sm">
        <thead><tr className="text-xs text-muted-foreground">{headers.map(h => <th key={h} className="py-1 pe-3 text-start font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i} className="border-t">{row.map((cell, j) => <td key={j} className="whitespace-nowrap py-1.5 pe-3">{cell}</td>)}</tr>)}</tbody>
      </table>
    </TableScroll>
  );
}

const heat = (percent: number) => ({ backgroundColor: `color-mix(in srgb, var(--primary) ${Math.round(Math.min(1, percent / 100) * 60)}%, transparent)` });
export const ageText = (t: T, days: number | null) => (days === null ? t.never : days === 0 ? t.today : t.daysAgo(days));

/** The column helpers, bound to one row type. Passed to a `columns` callback so the row type is known before the lambdas are typed. */
type Cols<Row> = {
  number: (header: string, get: (row: Row) => number | null | undefined) => Col<Row>;
  text: (header: string, get: (row: Row) => string | null | undefined, shown?: (row: Row) => React.ReactNode) => Col<Row>;
  percent: (header: string, get: (row: Row) => number | null | undefined, heated?: boolean) => Col<Row>;
  date: (header: string, get: (row: Row) => Date) => Col<Row>;
};
function helpersFor<Row>(): Cols<Row> {
  return { number: numberCol, text: textCol, percent: percentCol, date: dateCol };
}

/** A screen table with its own Excel button beside the heading. `exportRows` (default: all rows) is what the file gets; subtotal rows stay on screen only. */
function DataTable<Row>({ heading, exportAs, columns, rows, exportRows }: { heading?: React.ReactNode; exportAs: ExportAs; columns: (h: Cols<Row>) => Col<Row>[]; rows: readonly Row[]; exportRows?: readonly Row[] }) {
  const list = columns(helpersFor<Row>());
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {heading ? <h3 className="font-semibold">{heading}</h3> : <span />}
        <ExportExcelButton fileName={exportAs.file} sheetName={exportAs.sheet} title={exportAs.title} columns={list} rows={exportRows ?? rows} />
      </div>
      <Table label={typeof heading === "string" ? heading : exportAs.sheet} headers={list.map(column => column.header)} rows={rows.map(row => list.map(column => column.cell(row)))} />
    </div>
  );
}

/** A table column: `value` is the raw figure the Excel file gets, `cell` is what the screen shows. One list drives both. */
type Col<Row> = ExportColumn<Row> & { cell: (row: Row) => React.ReactNode };
type ExportAs = { file: string; sheet: string; title: string };
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
function numberCol<Row>(header: string, get: (row: Row) => number | null | undefined): Col<Row> {
  return { header, kind: "number", value: row => get(row) ?? null, cell: row => get(row) ?? "" };
}
function textCol<Row>(header: string, get: (row: Row) => string | null | undefined, shown?: (row: Row) => React.ReactNode): Col<Row> {
  return { header, kind: "text", value: row => get(row) ?? null, cell: row => (shown ? shown(row) : (get(row) ?? "")) };
}
/** The screen holds percentages in points (25 means 25%); Excel gets the fraction 0.25 with a percent format. */
function percentCol<Row>(header: string, get: (row: Row) => number | null | undefined, heated = false): Col<Row> {
  return {
    header, kind: "percent",
    value: row => { const v = get(row); return v === null || v === undefined ? null : v / 100; },
    cell: row => {
      const v = get(row);
      if (v === null || v === undefined) return "—";
      return heated ? <span className="block rounded px-2 py-0.5" style={heat(v)}>{v}%</span> : `${v}%`;
    },
  };
}
function dateCol<Row>(header: string, get: (row: Row) => Date): Col<Row> {
  return { header, kind: "date", value: get, cell: row => isoDay(get(row)) };
}

type Options = { zones: string[]; blocks: string[]; groups: string[]; stages: string[]; activities: string[] };
type ScreenResult<D> = { data: D; freshness: Array<{ source: string; ageDays: number | null }>; options: Options };
type Query<D> = { isLoading: boolean; error: unknown; data?: ScreenResult<D>; refetch: () => unknown };

function Frame<D>({ query, t, isArabic, isEmpty, children, onOptions }: { query: Query<D>; t: T; isArabic: boolean; isEmpty: (data: D) => boolean; children: (data: D) => React.ReactNode; onOptions?: (options: Options) => void }) {
  const { language } = useLanguage();
  const options = query.data?.options;
  useEffect(() => { if (options) onOptions?.(options); }, [options]); // eslint-disable-line react-hooks/exhaustive-deps
  if (query.isLoading) return <p role="status" className="text-sm text-muted-foreground">{t.loading}</p>;
  if (!query.data) return <ErrorState isArabic={isArabic} error={query.error} title={pickLanguage(language, { ar: "تعذّر تحميل ضبط المشروع PMC", en: "The PMC workspace could not be loaded", ur: "PMC ورک اسپیس لوڈ نہیں ہو سکا" })} onRetry={() => query.refetch()} retryLabel={t.retry} />;
  return (
    <div className="space-y-4">
      <p className="flex flex-wrap gap-2 text-xs text-muted-foreground" data-testid="freshness"><b>{t.freshness}:</b>{query.data.freshness.map(f => <span key={f.source} className="rounded-full bg-muted px-2 py-0.5">{t.sources[f.source as keyof T["sources"]] ?? t.otherSource}: {ageText(t, f.ageDays)}</span>)}</p>
      {isEmpty(query.data.data) ? <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">{t.noData}</p> : children(query.data.data)}
    </div>
  );
}

type ReplyRow = { key: string; A: number; B: number; C: number; UR: number; pending: number; total: number };
function ReplyTable({ title, exportAs, rows, t }: { title: string; exportAs: ExportAs; rows: ReplyRow[]; t: T }) {
  return <DataTable heading={title} exportAs={exportAs} rows={rows} columns={h => [
    textCol<ReplyRow>("", r => r.key), numberCol<ReplyRow>("A", r => r.A), numberCol<ReplyRow>("B", r => r.B), numberCol<ReplyRow>("C", r => r.C),
    numberCol<ReplyRow>("UR", r => r.UR), numberCol<ReplyRow>(t.pendingReply, r => r.pending), numberCol<ReplyRow>(t.total, r => r.total),
  ]} />;
}

type MatrixCell = { count: number; weightPoints: number; sharePercent: number };
/** One row of the activities matrix: a group subtotal (`label` null) or an activity under its group. */
type MatrixRow = { groupName: string; label: string | null; cells: MatrixCell[] };

function ScreenBody({ tab, tenantId, projectId, filters, t, isArabic, onData }: { tab: Exclude<Tab, "import" | "sitePlan" | "programme">; tenantId: string; projectId: string; filters: Filters; t: T; isArabic: boolean; onData: (options: Options) => void }) {
  const input = { tenantId, projectId, filters };
  const common = { t, isArabic, onOptions: onData };
  /** Export names: the file gets the screen's tab and the table's name, e.g. pmc-approvals-requests-<date>.xlsx. */
  const exp = (file: string, sheet: string): ExportAs => ({ file: `pmc-${tab}-${file}`, sheet, title: `${t.title} · ${sheet}` });
  if (tab === "latestUpdates") {
    const q = trpc.pmc.latestUpdates.useQuery(input);
    return <Frame {...common} query={q} isEmpty={d => d.engineers.length === 0}>{d => (<>
      <DataTable exportAs={exp("engineers", t.engineer)} rows={d.engineers} columns={h => [
        h.text(t.engineer, e => e.name), h.number(t.updates, e => e.updates), h.number(t.activeDays, e => e.activeDays),
        h.text(t.unitRange, e => `${e.unitFrom} – ${e.unitTo}`, e => <bdi dir="ltr">{`${e.unitFrom} – ${e.unitTo}`}</bdi>), h.percent(t.added, e => e.addedProjectPercent),
      ]} />
      <p className="text-sm">{t.total}: <b>{d.totals.updates}</b> · {t.added}: <b>{d.totals.addedProjectPercent}%</b></p>
      <DataTable heading={t.byGroup} exportAs={exp("by-group", t.byGroup)} rows={d.engineers.flatMap(e => e.byGroup.map(g => ({ engineer: e.name, group: g })))} columns={h => [
        h.text(t.engineer, r => r.engineer), h.text(t.group, r => r.group.groupName), h.number(t.updates, r => r.group.updates), h.percent(t.added, r => r.group.addedProjectPercent),
      ]} />
    </>)}</Frame>;
  }
  if (tab === "approvals") {
    const q = trpc.pmc.approvals.useQuery(input);
    return <Frame {...common} query={q} isEmpty={d => d.requests.length === 0}>{d => (<>
      <DataTable exportAs={exp("requests", t.request)} rows={d.requests} columns={h => [
        h.text(t.request, r => r.code), h.text(t.activity, r => r.activityCode), h.date(t.date, r => r.requestedAt),
        h.text(t.contractor, r => r.contractor, r => r.contractor ?? "—"), h.text(t.consultant, r => r.consultant, r => r.consultant ?? "—"),
        h.text(t.reply, r => r.response, r => r.response ?? t.pendingReply), h.number(t.units, r => r.units),
      ]} />
      <ReplyTable title={t.perConsultant} exportAs={exp("per-consultant", t.perConsultant)} rows={d.byConsultant} t={t} />
      <ReplyTable title={t.perDay} exportAs={exp("per-day", t.perDay)} rows={d.byDay} t={t} />
      <ReplyTable title={t.perActivity} exportAs={exp("per-activity", t.perActivity)} rows={d.byActivity} t={t} />
    </>)}</Frame>;
  }
  if (tab === "inspections") {
    const q = trpc.pmc.inspectionFlow.useQuery(input);
    return <Frame {...common} query={q} isEmpty={d => d.total === 0}>{d => (<>
      <DataTable exportAs={exp("by-stage", t.stage)} rows={d.byStage} columns={h => [
        h.text(t.stage, s => t.stageNames[s.stage] ?? s.stage), h.number(t.count, s => s.count), h.percent(t.percent, s => s.percent),
      ]} />
      <DataTable heading={t.heldBy} exportAs={exp("held-by", t.heldBy)} rows={d.heldBy} columns={h => [h.text(t.heldBy, h => h.holder), h.number(t.count, h => h.count)]} />
      <DataTable heading={t.stalled} exportAs={exp("stalled", t.stalled)} rows={d.stalledActivities} columns={h => [
        h.text(t.activity, a => `${a.activityCode} · ${a.activityName}`), h.number(t.open, a => a.open), h.number(t.oldestDays, a => a.oldestDays),
      ]} />
    </>)}</Frame>;
  }
  if (tab === "activities") {
    const q = trpc.pmc.activitiesMatrix.useQuery(input);
    return <Frame {...common} query={q} isEmpty={d => d.groups.length === 0}>{d => {
      // Group rows are subtotals: they stay on screen, the file gets one row per activity with its group name filled in.
      const matrixRows: MatrixRow[] = d.groups.flatMap(g => [
        { groupName: g.groupName, label: null, cells: g.cells },
        ...g.activities.map(a => ({ groupName: g.groupName, label: `${a.code} · ${a.name}`, cells: a.cells })),
      ]);
      const matrixColumns: Col<MatrixRow>[] = [
        textCol<MatrixRow>(t.group, r => r.groupName, r => (r.label === null ? <b>{r.groupName}</b> : "")),
        textCol<MatrixRow>(t.activity, r => r.label, r => r.label ?? ""),
        ...d.columns.flatMap((c, i) => [
          numberCol<MatrixRow>(`${c.label} #`, r => r.cells[i]?.count),
          numberCol<MatrixRow>(`${c.label} ${t.weight}`, r => r.cells[i]?.weightPoints),
          percentCol<MatrixRow>(`${c.label} %`, r => r.cells[i]?.sharePercent),
        ]),
      ];
      return <DataTable exportAs={exp("activities", t.activity)} rows={matrixRows} exportRows={matrixRows.filter(r => r.label !== null)} columns={() => matrixColumns} />;
    }}</Frame>;
  }
  if (tab === "zones") {
    const q = trpc.pmc.zonesView.useQuery(input);
    return <Frame {...common} query={q} isEmpty={d => d.rows.length === 0}>{d => (
      <DataTable exportAs={exp("zones", t.zone)} rows={d.rows} columns={h => [
        h.text(t.zone, r => r.zoneCode), h.text(t.stage, r => r.stageName), h.text(t.engineer, r => r.engineer, r => r.engineer ?? t.unassigned),
        h.number(t.cells, r => r.cells), h.number(t.complete, r => r.completeCells), h.number(t.weight, r => r.weightComplete),
        h.percent(t.completion, r => r.completionPercent, true),
      ]} />
    )}</Frame>;
  }
  if (tab === "weekly" || tab === "monthly") {
    const q = tab === "weekly" ? trpc.pmc.weeklyReport.useQuery(input) : trpc.pmc.monthlyReport.useQuery(input);
    return <Frame {...common} query={q} isEmpty={d => d.periods.length === 0}>{d => (<>
      <DataTable exportAs={exp("periods", t.period)} rows={d.periods} columns={h => [
        h.text(t.period, p => p.from), h.number(t.updates, p => p.updates), h.percent(t.added, p => p.addedProjectPercent),
        h.text(t.byGroup, p => p.byGroup.map(g => `${g.groupCode} ${g.addedProjectPercent}%`).join(" · ")),
        h.text(t.status, p => p.byStatus.map(s => `${t.statuses[s.status]} ${s.updates}`).join(" · ")),
      ]} />
      <DataTable exportAs={exp("by-engineer", t.engineer)} rows={d.periods.flatMap(p => p.rows.map(r => ({ from: p.from, engineer: r.engineer, activityCode: r.activityCode, updates: r.updates })))} columns={h => [
        h.text(t.period, r => r.from), h.text(t.engineer, r => r.engineer), h.text(t.activity, r => r.activityCode), h.number(t.updates, r => r.updates),
      ]} />
    </>)}</Frame>;
  }
  if (tab === "pending") {
    const q = trpc.pmc.pendingAtVerifier.useQuery(input);
    return <Frame {...common} query={q} isEmpty={d => d.total === 0}>{d => (<>
      <p className="flex flex-wrap gap-2 text-sm"><b>{t.buckets}:</b>{d.buckets.map(b => <span key={b.label} className="rounded-full bg-muted px-2 py-0.5">{b.label}: {b.count}</span>)}</p>
      <DataTable exportAs={exp("rows", t.unit)} rows={d.rows} columns={h => [
        h.number(t.unit, r => r.unitNumber), h.text(t.activity, r => `${r.activityCode} · ${r.activityName}`), h.text(t.verification, r => r.verificationStatus),
        h.text(t.engineer, r => r.engineer, r => r.engineer ?? t.unassigned), h.date(t.since, r => r.since), h.number(t.age, r => r.ageDays),
      ]} />
    </>)}</Frame>;
  }
  const q = trpc.pmc.stagesView.useQuery(input);
  return <Frame {...common} query={q} isEmpty={d => d.stages.length === 0}>{d => (
    <div className="space-y-4">{d.stages.map(s => (
      <div key={s.stageCode}>
        <DataTable heading={<>{s.stageName} <span className="text-xs font-normal text-muted-foreground">({s.total})</span></>} exportAs={exp(`stage-${s.stageCode}`, s.stageName)} rows={s.byStatus} columns={h => [
          h.text(t.status, b => t.statuses[b.status]), h.number(t.count, b => b.count), h.number(t.weight, b => b.weightPoints), h.percent(t.percent, b => b.percent, true),
        ]} />
        <p className="mt-1 text-sm">{t.late}: {s.lateActivities.length === 0 ? t.noLate : s.lateActivities.map(a => `${a.activityCode} (${t.actual} ${a.actualPercent}% / ${t.planned} ${a.plannedPercent}%)`).join(" · ")}</p>
      </div>))}</div>
  )}</Frame>;
}

function ImportPanel({ tenantId, projectId, t, isArabic }: { tenantId: string; projectId: string; t: T; isArabic: boolean }) {
  const [kind, setKind] = useState<"locations" | "catalog" | "status" | "requests" | "baseline" | "baselineDates">("locations");
  // The file goes browser → Storage on a signed URL (up to 50 MB), is analysed by a background job with a progress bar, and is written only after the person has read the report and confirmed.
  type Report = { totalRows: number; errorCount: number; errors: Array<{ rowNumber: number; code: string; field?: string; detail?: string }>; counts: { create: number; update: number; unchanged: number } };
  const renderReport = (view: DirectImportView) => {
    const report = (view.external?.report as { pmc?: Report } | undefined)?.pmc;
    if (!report) return null;
    return (
      <div className="space-y-3" data-testid="import-report">
        <h3 className="font-semibold">{t.report}</h3>
        <p className="flex flex-wrap gap-2 text-sm"><span className="rounded-full bg-muted px-2 py-0.5">{t.rows}: {report.totalRows}</span><span className="rounded-full bg-success-soft px-2 py-0.5">{t.create}: {report.counts.create}</span><span className="rounded-full bg-warning-soft px-2 py-0.5">{t.update}: {report.counts.update}</span><span className="rounded-full bg-muted px-2 py-0.5">{t.unchanged}: {report.counts.unchanged}</span><span className={`rounded-full px-2 py-0.5 ${report.errorCount ? "bg-danger-soft text-danger-soft-foreground" : "bg-muted"}`}>{t.errorsFound}: {report.errorCount}</span></p>
        {report.errors.length > 0 && <DataTable exportAs={{ file: "pmc-import-rejected-rows", sheet: t.errorsFound, title: `${t.title} · ${t.errorsFound}` }} rows={report.errors} columns={h => [
          { header: t.row, kind: "number", value: e => e.rowNumber || null, cell: e => e.rowNumber || "—" },
          h.text(t.reason, e => [e.code, e.field, e.detail].filter(Boolean).join(" · ")),
        ]} />}
        {report.errorCount === 0 && view.external && !view.external.canConfirm && <p className="text-sm text-muted-foreground">{t.alreadyUpToDate}</p>}
      </div>
    );
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t.nothingSaved}</p>
      <WriteGate permission={"project.pmc.manage"} projectId={projectId}><div className="space-y-3">
        <LabelledSelect label={t.importKind} className="text-sm" value={kind} onValueChange={value => setKind(value as typeof kind)} options={Object.entries(t.importKinds).map(([value, label]) => ({ value, label }))} />
        <DirectImportRunner tenantId={tenantId} projectId={projectId} moduleCode={`pmc.${kind}`} isArabic={isArabic} fileLabel={t.chooseFile} analyzeLabel={t.analyze} confirmLabel={t.confirm} showErrors={false} renderReport={renderReport} />
      </div></WriteGate>
    </div>
  );
}

const PERIODS = [["default", undefined], ["d7", 7], ["d30", 30], ["d90", 90], ["d365", 365], ["everything", 36500]] as const;

/** The whole PMC workspace. `embedded` (inside the project controls page, G-051) renders a plain block instead of a full-page <PageMain>, so the page keeps its single main landmark. */
export function ProjectPmcWorkspace({ embedded = false }: { embedded?: boolean }) {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { isArabic, isRtl, language } = useLanguage();
  const t = pickLanguage(language, text);
  // «?tab=import» opens the import directly (the S-curve's empty state links here)
  const [tab, setTab] = useState<Tab>(() => { const asked = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("tab"); return (TABS as readonly string[]).includes(asked ?? "") ? asked as Tab : "latestUpdates"; });
  const [filters, setFilters] = useState<Filters>({});
  const bodyRef = useRef<HTMLElement>(null);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const [period, setPeriod] = useState<(typeof PERIODS)[number][0]>("default");
  const [options, setOptions] = useState<Options>({ zones: [], blocks: [], groups: [], stages: [], activities: [] });
  const days = PERIODS.find(([key]) => key === period)![1];
  const since = useMemo(() => (days === undefined ? undefined : new Date(new Date().setUTCHours(0, 0, 0, 0) - days * 86_400_000)), [days]);
  const effective = useMemo(() => ({ ...filters, since }), [filters, since]);
  const exportScreen = trpc.pmc.exportScreen.useMutation({
    onSuccess: file => { const bytes = Uint8Array.from(atob(file.base64), c => c.charCodeAt(0)); const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })); const link = document.createElement("a"); link.href = url; link.download = file.fileName; link.click(); URL.revokeObjectURL(url); },
  });
  const screenOfTab: Record<Exclude<Tab, "import" | "sitePlan" | "programme">, "latestUpdates" | "approvals" | "inspections" | "activities" | "zones" | "weekly" | "monthly" | "pending" | "stages"> = { latestUpdates: "latestUpdates", approvals: "approvals", inspections: "inspections", activities: "activities", zones: "zones", weekly: "weekly", monthly: "monthly", pending: "pending", stages: "stages" };
  const select = (key: keyof Filters, label: string, values: string[]) => (
    <LabelledSelect label={label} value={(filters[key] as string | undefined) ?? ALL} onValueChange={value => setFilters({ ...filters, [key]: value === ALL ? undefined : value })} options={[{ value: ALL, label: t.filters.all }, ...values.map(v => ({ value: v, label: v }))]} />
  );
  return (
    <Shell embedded={embedded} isArabic={isArabic} isRtl={isRtl}>
      <div className="mx-auto max-w-7xl space-y-4">
        <PageHeader className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div>{embedded ? <h2 className="text-xl font-semibold">{t.title}</h2> : <h1 className="text-2xl font-semibold">{t.title}</h1>}</div>
          {tab !== "import" && tab !== "sitePlan" && tab !== "programme" && <div className="flex gap-2">
            <Button variant="outline" className="min-h-[44px]" disabled={exportScreen.isPending} onClick={() => exportScreen.mutate({ tenantId, projectId, screen: screenOfTab[tab], locale: language, filters: effective })}><Download className="me-1 h-4 w-4" />{t.export}</Button>
            <Button variant="outline" className="min-h-[44px]" disabled={pdfBusy} onClick={async () => { if (!bodyRef.current) return; setPdfBusy(true); setPdfError(false); try { await exportElementToPdf(bodyRef.current, `project-os-pmc-${tab}`); } catch (error) { console.error("PDF export failed:", error instanceof Error ? error.message : String(error)); setPdfError(true); } finally { setPdfBusy(false); } }}><Download className="me-1 h-4 w-4" />{t.pdf}</Button>
            <Button variant="outline" className="min-h-[44px]" onClick={() => window.print()}><Printer className="me-1 h-4 w-4" />{t.print}</Button>
          </div>}
        </PageHeader>
        {/* Work order 22: the three percentages and the two site screens */}
        <section className="space-y-3 print:hidden"><div className="flex flex-wrap gap-2"><Link href={`/projects/${tenantId}/${projectId}/site-consultant`}><Button variant="outline" className="min-h-[44px]">{pickLanguage(language, wo22Text).goToComparison}</Button></Link><Link href={`/m/${tenantId}/${projectId}/site-update`}><Button variant="outline" className="min-h-[44px]">{pickLanguage(language, wo22Text).goToUpdate}</Button></Link></div><SourcePercentages tenantId={tenantId} projectId={projectId} levels={false} /></section>
        <nav role="tablist" className="flex flex-wrap gap-2 print:hidden">{TABS.map(key => <button key={key} role="tab" type="button" aria-selected={tab === key} className={`min-h-[44px] rounded-[var(--radius)] border px-4 text-sm font-medium ${tab === key ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-foreground hover:bg-muted"}`} onClick={() => setTab(key)}>{t.tabs[key]}</button>)}</nav>
        {tab !== "import" && tab !== "sitePlan" && tab !== "programme" && (
          <section aria-label={pickLanguage(language, { ar: "عوامل التصفية", en: "Filters", ur: "فلٹرز" })} className="flex flex-wrap items-end gap-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border print:hidden">
            {select("zone", t.filters.zone, options.zones)}{select("block", t.filters.block, options.blocks)}{select("group", t.filters.group, options.groups)}{select("stage", t.filters.stage, options.stages)}{select("activity", t.filters.activity, options.activities)}
            <label className="text-xs">{t.filters.unitFrom}<input aria-label={t.filters.unitFrom} type="number" min="0" className={`${field} mt-1 block w-24`} value={filters.unitFrom ?? ""} onChange={event => setFilters({ ...filters, unitFrom: event.target.value === "" ? undefined : Number(event.target.value) })} /></label>
            <label className="text-xs">{t.filters.unitTo}<input aria-label={t.filters.unitTo} type="number" min="0" className={`${field} mt-1 block w-24`} value={filters.unitTo ?? ""} onChange={event => setFilters({ ...filters, unitTo: event.target.value === "" ? undefined : Number(event.target.value) })} /></label>
            <LabelledSelect label={t.filters.period} value={period} onValueChange={value => setPeriod(value as typeof period)} options={PERIODS.map(([key]) => ({ value: key, label: key === "default" ? t.filters.default : t.filters[key as "d7" | "d30" | "d90" | "d365" | "everything"] }))} />
          </section>
        )}
        {pdfError && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger-soft-foreground print:hidden">{t.pdfFailed}</p>}
        <section ref={bodyRef} className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border">
          {/* A screen that fails to render shows its own message and the tabs stay usable; moving to another tab starts it clean. */}
          <SectionErrorBoundary key={tab} title={pickLanguage(language, { ar: "هذه الشاشة", en: "This screen", ur: "یہ اسکرین" })} isArabic={isArabic}>
            {tab === "import" ? <ImportPanel tenantId={tenantId} projectId={projectId} t={t} isArabic={isArabic} /> : tab === "sitePlan" ? <PmcSitePlan tenantId={tenantId} projectId={projectId} /> : tab === "programme" ? <PmcProgramme tenantId={tenantId} projectId={projectId} /> : <ScreenBody tab={tab} tenantId={tenantId} projectId={projectId} filters={effective} t={t} isArabic={isArabic} onData={setOptions} />}
          </SectionErrorBoundary>
        </section>
      </div>
    </Shell>
  );
}

function Shell({ embedded, isArabic, isRtl = isArabic, children }: { embedded: boolean; isArabic: boolean; isRtl?: boolean; children: React.ReactNode }) {
  return embedded
    ? <div className="px-0 py-2 text-foreground" dir={isRtl ? "rtl" : "ltr"}>{children}</div>
    : <PageMain className="py-2 text-foreground print:bg-card" dir={isRtl ? "rtl" : "ltr"}>{children}</PageMain>;
}

export default function ProjectPmc() {
  return <ProjectPmcWorkspace />;
}
