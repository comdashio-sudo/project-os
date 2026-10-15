import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, Download, FileUp, Printer } from "lucide-react";
import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { PmcProgramme } from "./PmcProgramme";
import { PmcSitePlan } from "./PmcSitePlan";

const text = {
  ar: {
    title: "ضبط المشروع PMC", back: "العودة إلى ضوابط المشروع", loading: "جارٍ التحميل…", retry: "إعادة المحاولة", noData: "لا توجد بيانات", export: "تصدير Excel", pdf: "PDF (طباعة)",
    tabs: { latestUpdates: "آخر التحديثات", approvals: "الاعتمادات", sitePlan: "المخطط", programme: "البرنامج الزمني", inspections: "الفحوصات", activities: "الأنشطة", zones: "المناطق", weekly: "الأسبوعي", monthly: "الشهري", pending: "المعلّق", stages: "المراحل", import: "الاستيراد" },
    filters: { zone: "المنطقة", block: "البلوك", unitFrom: "من وحدة", unitTo: "إلى وحدة", group: "المجموعة", stage: "المرحلة", activity: "النشاط", period: "الفترة", all: "الكل", default: "الافتراضية", d7: "آخر 7 أيام", d30: "آخر 30 يومًا", d90: "آخر 90 يومًا", d365: "آخر 12 شهرًا", everything: "كل الفترة", contractor: "المقاول", consultant: "الاستشاري" },
    freshness: "حداثة البيانات", sources: { locations: "المواقع", catalog: "الكتالوج", status: "حالة الأنشطة", requests: "الطلبات", baseline: "خط الأساس" }, never: "لا تحديث بعد", today: "اليوم", daysAgo: (n: number) => `قبل ${n} يومًا`,
    engineer: "المهندس", updates: "التحديثات", activeDays: "أيام نشطة", unitRange: "نطاق الوحدات", added: "النسبة المضافة", byGroup: "حسب المجموعة", total: "الإجمالي",
    request: "الطلب", activity: "النشاط", date: "التاريخ", contractor: "المقاول", consultant: "الاستشاري", reply: "الرد", units: "الوحدات", pendingReply: "معلّق", perConsultant: "الردود لكل استشاري", perDay: "الردود حسب اليوم", perActivity: "الردود حسب النشاط",
    stage: "الموقف", count: "العدد", percent: "النسبة", heldBy: "عند من الطلب", stalled: "أكثر الأنشطة تعطلًا", open: "مفتوح", oldestDays: "أقدم (أيام)",
    stageNames: { CONFIGURATIONS: "التهيئة", MANAGER_APPROVAL: "اعتماد المدير", TECHNICAL_ASSISTANT: "المساعد الفني", WAITING_CONSULTANT: "انتظار الاستشاري", RESULT_RECEIVING: "استلام النتيجة", ANSWERED: "تم الرد", REJECTED: "مرفوض", NOT_STARTED: "لم يبدأ" } as Record<string, string>,
    group: "المجموعة", weight: "الوزن", share: "النسبة من الوزن", zone: "المنطقة", cells: "الخلايا", complete: "المكتمل", completion: "الإنجاز", unassigned: "غير مسند",
    period: "الفترة من", status: "الحالة", statuses: { NOT_STARTED: "لم يبدأ", IN_PROGRESS: "قيد التنفيذ", UNDER_REVIEW: "قيد المراجعة", COMPLETE: "مكتمل" } as Record<string, string>,
    unit: "الوحدة", verification: "حالة التحقق", since: "منذ", age: "العمر (أيام)", buckets: "أعمار الانتظار", late: "أنشطة متأخرة", planned: "المخطط", actual: "الفعلي", noLate: "لا أنشطة متأخرة",
    importKinds: { locations: "المواقع", catalog: "الكتالوج والأوزان", status: "حالة الوحدة-النشاط", requests: "الطلبات والردود", baseline: "خط الأساس" } as Record<string, string>,
    importKind: "نوع الملف", chooseFile: "اختر ملف Excel أو CSV", analyze: "فحص الملف", confirm: "حفظ الملف الموافَق عليه", report: "تقرير التحقق", rows: "الصفوف", create: "سيُنشأ", update: "سيُحدَّث", unchanged: "بلا تغيير", errorsFound: "صفوف مرفوضة", row: "الصف", reason: "السبب", saved: "تم الحفظ", nothingSaved: "لم يُحفظ شيء قبل موافقتك.", alreadyUpToDate: "الملف مطابق لما هو محفوظ: لا شيء ليُحفظ.",
  },
  en: {
    title: "Project control (PMC)", back: "Back to project controls", loading: "Loading…", retry: "Retry", noData: "No data", export: "Export Excel", pdf: "PDF (print)",
    tabs: { latestUpdates: "Latest updates", approvals: "Approvals", sitePlan: "Site plan", programme: "Programme", inspections: "Inspections", activities: "Activities", zones: "Zones", weekly: "Weekly", monthly: "Monthly", pending: "Pending", stages: "Stages", import: "Import" },
    filters: { zone: "Zone", block: "Block", unitFrom: "From unit", unitTo: "To unit", group: "Group", stage: "Stage", activity: "Activity", period: "Period", all: "All", default: "Default", d7: "Last 7 days", d30: "Last 30 days", d90: "Last 90 days", d365: "Last 12 months", everything: "All time", contractor: "Contractor", consultant: "Consultant" },
    freshness: "Data freshness", sources: { locations: "Locations", catalog: "Catalogue", status: "Activity status", requests: "Requests", baseline: "Baseline" }, never: "never updated", today: "today", daysAgo: (n: number) => `${n} days ago`,
    engineer: "Engineer", updates: "Updates", activeDays: "Active days", unitRange: "Unit range", added: "Percent added", byGroup: "By group", total: "Total",
    request: "Request", activity: "Activity", date: "Date", contractor: "Contractor", consultant: "Consultant", reply: "Reply", units: "Units", pendingReply: "pending", perConsultant: "Replies per consultant", perDay: "Replies per day", perActivity: "Replies per activity",
    stage: "Stage", count: "Count", percent: "Percent", heldBy: "Held by", stalled: "Most stalled activities", open: "Open", oldestDays: "Oldest (days)",
    stageNames: { CONFIGURATIONS: "Configurations", MANAGER_APPROVAL: "Manager approval", TECHNICAL_ASSISTANT: "Technical assistant", WAITING_CONSULTANT: "Waiting for consultant", RESULT_RECEIVING: "Result receiving", ANSWERED: "Answered", REJECTED: "Rejected", NOT_STARTED: "Not started" } as Record<string, string>,
    group: "Group", weight: "Weight", share: "Share of weight", zone: "Zone", cells: "Cells", complete: "Complete", completion: "Completion", unassigned: "Unassigned",
    period: "Period from", status: "Status", statuses: { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", UNDER_REVIEW: "Under review", COMPLETE: "Complete" } as Record<string, string>,
    unit: "Unit", verification: "Verification status", since: "Since", age: "Age (days)", buckets: "Waiting age", late: "Late activities", planned: "Planned", actual: "Actual", noLate: "No late activities",
    importKinds: { locations: "Locations", catalog: "Catalogue and weights", status: "Unit-activity status", requests: "Requests and replies", baseline: "Baseline" } as Record<string, string>,
    importKind: "File type", chooseFile: "Choose an Excel or CSV file", analyze: "Check the file", confirm: "Save the approved file", report: "Validation report", rows: "Rows", create: "Will create", update: "Will update", unchanged: "Unchanged", errorsFound: "Rejected rows", row: "Row", reason: "Reason", saved: "Saved", nothingSaved: "Nothing is saved until you approve.", alreadyUpToDate: "The file matches what is stored: nothing to save.",
  },
};
type T = typeof text.en;
const TABS = ["latestUpdates", "approvals", "sitePlan", "programme", "inspections", "activities", "zones", "weekly", "monthly", "pending", "stages", "import"] as const;
type Tab = (typeof TABS)[number];
type Filters = { zone?: string; block?: string; unitFrom?: number; unitTo?: number; group?: string; stage?: string; activity?: string; contractor?: string; consultant?: string; since?: Date };
const field = "min-h-[44px] rounded-lg border bg-white px-2 text-sm";

function Table({ headers, rows }: { headers: string[]; rows: Array<Array<React.ReactNode>> }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[32rem] text-sm">
        <thead><tr className="text-xs text-slate-500">{headers.map(h => <th key={h} className="py-1 pe-3 text-start font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i} className="border-t">{row.map((cell, j) => <td key={j} className="whitespace-nowrap py-1.5 pe-3">{cell}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

const heat = (percent: number) => ({ backgroundColor: `rgba(14, 107, 112, ${Math.min(1, percent / 100) * 0.6})` });
const ageText = (t: T, days: number | null) => (days === null ? t.never : days === 0 ? t.today : t.daysAgo(days));

type Options = { zones: string[]; blocks: string[]; groups: string[]; stages: string[]; activities: string[] };
type ScreenResult<D> = { data: D; freshness: Array<{ source: string; ageDays: number | null }>; options: Options };
type Query<D> = { isLoading: boolean; error: unknown; data?: ScreenResult<D>; refetch: () => unknown };

function Frame<D>({ query, t, isArabic, isEmpty, children, onOptions }: { query: Query<D>; t: T; isArabic: boolean; isEmpty: (data: D) => boolean; children: (data: D) => React.ReactNode; onOptions?: (options: Options) => void }) {
  const options = query.data?.options;
  useEffect(() => { if (options) onOptions?.(options); }, [options]); // eslint-disable-line react-hooks/exhaustive-deps
  if (query.isLoading) return <p role="status" className="text-sm text-slate-500">{t.loading}</p>;
  if (!query.data) return <div><p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(query.error, isArabic)}</p><Button className="mt-2 min-h-[44px]" variant="outline" onClick={() => query.refetch()}>{t.retry}</Button></div>;
  return (
    <div className="space-y-4">
      <p className="flex flex-wrap gap-2 text-xs text-slate-600" data-testid="freshness"><b>{t.freshness}:</b>{query.data.freshness.map(f => <span key={f.source} className="rounded-full bg-slate-100 px-2 py-0.5">{t.sources[f.source as keyof T["sources"]] ?? f.source}: {ageText(t, f.ageDays)}</span>)}</p>
      {isEmpty(query.data.data) ? <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">{t.noData}</p> : children(query.data.data)}
    </div>
  );
}

function ReplyTable({ title, rows, t }: { title: string; rows: Array<{ key: string; A: number; B: number; C: number; UR: number; pending: number; total: number }>; t: T }) {
  return <div><h3 className="mb-1 font-semibold">{title}</h3><Table headers={["", "A", "B", "C", "UR", t.pendingReply, t.total]} rows={rows.map(r => [r.key, r.A, r.B, r.C, r.UR, r.pending, r.total])} /></div>;
}

function ScreenBody({ tab, tenantId, projectId, filters, t, isArabic, onData }: { tab: Exclude<Tab, "import" | "sitePlan" | "programme">; tenantId: string; projectId: string; filters: Filters; t: T; isArabic: boolean; onData: (options: Options) => void }) {
  const input = { tenantId, projectId, filters };
  const common = { t, isArabic, onOptions: onData };
  if (tab === "latestUpdates") {
    const q = trpc.pmc.latestUpdates.useQuery(input);
    return <Frame {...common} query={q} isEmpty={d => d.engineers.length === 0}>{d => (<>
      <Table headers={[t.engineer, t.updates, t.activeDays, t.unitRange, t.added]} rows={d.engineers.map(e => [e.name, e.updates, e.activeDays, `${e.unitFrom} – ${e.unitTo}`, `${e.addedProjectPercent}%`])} />
      <p className="text-sm">{t.total}: <b>{d.totals.updates}</b> · {t.added}: <b>{d.totals.addedProjectPercent}%</b></p>
      <h3 className="font-semibold">{t.byGroup}</h3>
      <Table headers={[t.engineer, t.group, t.updates, t.added]} rows={d.engineers.flatMap(e => e.byGroup.map(g => [e.name, g.groupName, g.updates, `${g.addedProjectPercent}%`]))} />
    </>)}</Frame>;
  }
  if (tab === "approvals") {
    const q = trpc.pmc.approvals.useQuery(input);
    return <Frame {...common} query={q} isEmpty={d => d.requests.length === 0}>{d => (<>
      <Table headers={[t.request, t.activity, t.date, t.contractor, t.consultant, t.reply, t.units]} rows={d.requests.map(r => [r.code, r.activityCode, r.requestedAt.toISOString().slice(0, 10), r.contractor ?? "—", r.consultant ?? "—", r.response ?? t.pendingReply, r.units])} />
      <ReplyTable title={t.perConsultant} rows={d.byConsultant} t={t} />
      <ReplyTable title={t.perDay} rows={d.byDay} t={t} />
      <ReplyTable title={t.perActivity} rows={d.byActivity} t={t} />
    </>)}</Frame>;
  }
  if (tab === "inspections") {
    const q = trpc.pmc.inspectionFlow.useQuery(input);
    return <Frame {...common} query={q} isEmpty={d => d.total === 0}>{d => (<>
      <Table headers={[t.stage, t.count, t.percent]} rows={d.byStage.map(s => [t.stageNames[s.stage] ?? s.stage, s.count, `${s.percent}%`])} />
      <h3 className="font-semibold">{t.heldBy}</h3>
      <Table headers={[t.heldBy, t.count]} rows={d.heldBy.map(h => [h.holder, h.count])} />
      <h3 className="font-semibold">{t.stalled}</h3>
      <Table headers={[t.activity, t.open, t.oldestDays]} rows={d.stalledActivities.map(a => [`${a.activityCode} · ${a.activityName}`, a.open, a.oldestDays])} />
    </>)}</Frame>;
  }
  if (tab === "activities") {
    const q = trpc.pmc.activitiesMatrix.useQuery(input);
    return <Frame {...common} query={q} isEmpty={d => d.groups.length === 0}>{d => (
      <Table headers={[t.group, t.activity, ...d.columns.flatMap(c => [`${c.label} #`, `${c.label} ${t.weight}`, `${c.label} %`])]} rows={d.groups.flatMap(g => [[<b key={g.groupCode}>{g.groupName}</b>, "", ...g.cells.flatMap(c => [c.count, c.weightPoints, `${c.sharePercent}%`])], ...g.activities.map(a => ["", `${a.code} · ${a.name}`, ...a.cells.flatMap(c => [c.count, c.weightPoints, `${c.sharePercent}%`])])])} />
    )}</Frame>;
  }
  if (tab === "zones") {
    const q = trpc.pmc.zonesView.useQuery(input);
    return <Frame {...common} query={q} isEmpty={d => d.rows.length === 0}>{d => (
      <Table headers={[t.zone, t.stage, t.engineer, t.cells, t.complete, t.weight, t.completion]} rows={d.rows.map(r => [r.zoneCode, r.stageName, r.engineer ?? t.unassigned, r.cells, r.completeCells, r.weightComplete, <span key="c" className="block rounded px-2 py-0.5" style={heat(r.completionPercent)}>{r.completionPercent}%</span>])} />
    )}</Frame>;
  }
  if (tab === "weekly" || tab === "monthly") {
    const q = tab === "weekly" ? trpc.pmc.weeklyReport.useQuery(input) : trpc.pmc.monthlyReport.useQuery(input);
    return <Frame {...common} query={q} isEmpty={d => d.periods.length === 0}>{d => (<>
      <Table headers={[t.period, t.updates, t.added, t.byGroup, t.status]} rows={d.periods.map(p => [p.from, p.updates, `${p.addedProjectPercent}%`, p.byGroup.map(g => `${g.groupCode} ${g.addedProjectPercent}%`).join(" · "), p.byStatus.map(s => `${t.statuses[s.status]} ${s.updates}`).join(" · ")])} />
      <Table headers={[t.period, t.engineer, t.activity, t.updates]} rows={d.periods.flatMap(p => p.rows.map(r => [p.from, r.engineer, r.activityCode, r.updates]))} />
    </>)}</Frame>;
  }
  if (tab === "pending") {
    const q = trpc.pmc.pendingAtVerifier.useQuery(input);
    return <Frame {...common} query={q} isEmpty={d => d.total === 0}>{d => (<>
      <p className="flex flex-wrap gap-2 text-sm"><b>{t.buckets}:</b>{d.buckets.map(b => <span key={b.label} className="rounded-full bg-slate-100 px-2 py-0.5">{b.label}: {b.count}</span>)}</p>
      <Table headers={[t.unit, t.activity, t.verification, t.engineer, t.since, t.age]} rows={d.rows.map(r => [r.unitNumber, `${r.activityCode} · ${r.activityName}`, r.verificationStatus, r.engineer ?? t.unassigned, r.since.toISOString().slice(0, 10), r.ageDays])} />
    </>)}</Frame>;
  }
  const q = trpc.pmc.stagesView.useQuery(input);
  return <Frame {...common} query={q} isEmpty={d => d.stages.length === 0}>{d => (
    <div className="space-y-4">{d.stages.map(s => (
      <div key={s.stageCode}>
        <h3 className="font-semibold">{s.stageName} <span className="text-xs font-normal text-slate-500">({s.total})</span></h3>
        <Table headers={[t.status, t.count, t.weight, t.percent]} rows={s.byStatus.map(b => [t.statuses[b.status], b.count, b.weightPoints, <span key="p" className="block rounded px-2 py-0.5" style={heat(b.percent)}>{b.percent}%</span>])} />
        <p className="mt-1 text-sm">{t.late}: {s.lateActivities.length === 0 ? t.noLate : s.lateActivities.map(a => `${a.activityCode} (${t.actual} ${a.actualPercent}% / ${t.planned} ${a.plannedPercent}%)`).join(" · ")}</p>
      </div>))}</div>
  )}</Frame>;
}

function ImportPanel({ tenantId, projectId, t, isArabic }: { tenantId: string; projectId: string; t: T; isArabic: boolean }) {
  const [kind, setKind] = useState<"locations" | "catalog" | "status" | "requests" | "baseline">("locations");
  const [file, setFile] = useState<{ name: string; format: "xlsx" | "csv"; base64: string } | null>(null);
  const analyze = trpc.pmc.analyzeImport.useMutation();
  const confirm = trpc.pmc.confirmImport.useMutation();
  const report = analyze.data;
  const read = (selected: File | undefined) => {
    analyze.reset(); confirm.reset();
    if (!selected) { setFile(null); return; }
    const reader = new FileReader();
    reader.onload = () => setFile({ name: selected.name, format: selected.name.toLowerCase().endsWith(".csv") ? "csv" : "xlsx", base64: String(reader.result).split(",")[1] ?? "" });
    reader.readAsDataURL(selected);
  };
  const error = analyze.error ?? confirm.error;
  return (
    <div className="space-y-4">
      <p className="text-sm text-slate-600">{t.nothingSaved}</p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">{t.importKind}<select aria-label={t.importKind} className={`${field} mt-1 block`} value={kind} onChange={event => { setKind(event.target.value as typeof kind); analyze.reset(); confirm.reset(); }}>{Object.entries(t.importKinds).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="text-sm">{t.chooseFile}<input aria-label={t.chooseFile} type="file" accept=".xlsx,.csv" className={`${field} mt-1 block`} onChange={event => read(event.target.files?.[0])} /></label>
        <Button className="min-h-[44px]" disabled={!file || analyze.isPending} onClick={() => file && analyze.mutate({ tenantId, projectId, kind, format: file.format, base64: file.base64 })}><FileUp className="me-1 h-4 w-4" />{t.analyze}</Button>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(error, isArabic)}</p>}
      {report && (
        <div className="space-y-3" data-testid="import-report">
          <h3 className="font-semibold">{t.report}</h3>
          <p className="flex flex-wrap gap-2 text-sm"><span className="rounded-full bg-slate-100 px-2 py-0.5">{t.rows}: {report.totalRows}</span><span className="rounded-full bg-emerald-50 px-2 py-0.5">{t.create}: {report.counts.create}</span><span className="rounded-full bg-amber-50 px-2 py-0.5">{t.update}: {report.counts.update}</span><span className="rounded-full bg-slate-100 px-2 py-0.5">{t.unchanged}: {report.counts.unchanged}</span><span className={`rounded-full px-2 py-0.5 ${report.errorCount ? "bg-red-50 text-red-800" : "bg-slate-100"}`}>{t.errorsFound}: {report.errorCount}</span></p>
          {report.errors.length > 0 && <Table headers={[t.row, t.reason]} rows={report.errors.map(e => [e.rowNumber || "—", [e.code, e.field, e.detail].filter(Boolean).join(" · ")])} />}
          {report.errorCount === 0 && !report.canConfirm && <p className="text-sm text-slate-600">{t.alreadyUpToDate}</p>}
          {confirm.data ? <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{t.saved}: {t.create} {confirm.data.counts.create} · {t.update} {confirm.data.counts.update}</p> : <Button className="min-h-[44px]" disabled={!report.canConfirm || confirm.isPending || !file} onClick={() => file && confirm.mutate({ tenantId, projectId, kind, format: file.format, base64: file.base64, approvedHash: report.fileHash })}>{t.confirm}</Button>}
        </div>
      )}
    </div>
  );
}

const PERIODS = [["default", undefined], ["d7", 7], ["d30", 30], ["d90", 90], ["d365", 365], ["everything", 36500]] as const;

export default function ProjectPmc() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { isArabic } = useLanguage();
  const t = isArabic ? text.ar : text.en;
  const [tab, setTab] = useState<Tab>("latestUpdates");
  const [filters, setFilters] = useState<Filters>({});
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
    <label className="text-xs">{label}<select aria-label={label} className={`${field} mt-1 block`} value={(filters[key] as string | undefined) ?? ""} onChange={event => setFilters({ ...filters, [key]: event.target.value || undefined })}><option value="">{t.filters.all}</option>{values.map(v => <option key={v} value={v}>{v}</option>)}</select></label>
  );
  return (
    <main className="min-h-screen bg-[#f7f8fc] px-4 py-5 text-slate-900 print:bg-white" dir={isArabic ? "rtl" : "ltr"}>
      <div className="mx-auto max-w-7xl space-y-4">
        <header className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div><Link href={`/projects/${tenantId}/${projectId}/controls`} className="inline-flex min-h-[44px] items-center gap-2 text-sm font-semibold text-[#0e6b70]"><ArrowLeft className="h-4 w-4" />{t.back}</Link><h1 className="text-2xl font-semibold">{t.title}</h1></div>
          {tab !== "import" && tab !== "sitePlan" && tab !== "programme" && <div className="flex gap-2">
            <Button variant="outline" className="min-h-[44px]" disabled={exportScreen.isPending} onClick={() => exportScreen.mutate({ tenantId, projectId, screen: screenOfTab[tab], locale: isArabic ? "ar" : "en", filters: effective })}><Download className="me-1 h-4 w-4" />{t.export}</Button>
            <Button variant="outline" className="min-h-[44px]" onClick={() => window.print()}><Printer className="me-1 h-4 w-4" />{t.pdf}</Button>
          </div>}
        </header>
        <nav role="tablist" className="flex flex-wrap gap-2 print:hidden">{TABS.map(key => <button key={key} role="tab" type="button" aria-selected={tab === key} className={`min-h-[44px] rounded-xl border px-4 text-sm font-semibold ${tab === key ? "border-[#0e6b70] bg-[#0e6b70] text-white" : "bg-white"}`} onClick={() => setTab(key)}>{t.tabs[key]}</button>)}</nav>
        {tab !== "import" && tab !== "sitePlan" && tab !== "programme" && (
          <section aria-label="filters" className="flex flex-wrap items-end gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 print:hidden">
            {select("zone", t.filters.zone, options.zones)}{select("block", t.filters.block, options.blocks)}{select("group", t.filters.group, options.groups)}{select("stage", t.filters.stage, options.stages)}{select("activity", t.filters.activity, options.activities)}
            <label className="text-xs">{t.filters.unitFrom}<input aria-label={t.filters.unitFrom} type="number" min="0" className={`${field} mt-1 block w-24`} value={filters.unitFrom ?? ""} onChange={event => setFilters({ ...filters, unitFrom: event.target.value === "" ? undefined : Number(event.target.value) })} /></label>
            <label className="text-xs">{t.filters.unitTo}<input aria-label={t.filters.unitTo} type="number" min="0" className={`${field} mt-1 block w-24`} value={filters.unitTo ?? ""} onChange={event => setFilters({ ...filters, unitTo: event.target.value === "" ? undefined : Number(event.target.value) })} /></label>
            <label className="text-xs">{t.filters.period}<select aria-label={t.filters.period} className={`${field} mt-1 block`} value={period} onChange={event => setPeriod(event.target.value as typeof period)}>{PERIODS.map(([key]) => <option key={key} value={key}>{key === "default" ? t.filters.default : t.filters[key as "d7" | "d30" | "d90" | "d365" | "everything"]}</option>)}</select></label>
          </section>
        )}
        <section className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
          {tab === "import" ? <ImportPanel tenantId={tenantId} projectId={projectId} t={t} isArabic={isArabic} /> : tab === "sitePlan" ? <PmcSitePlan tenantId={tenantId} projectId={projectId} /> : tab === "programme" ? <PmcProgramme tenantId={tenantId} projectId={projectId} /> : <ScreenBody tab={tab} tenantId={tenantId} projectId={projectId} filters={effective} t={t} isArabic={isArabic} onData={setOptions} />}
        </section>
      </div>
    </main>
  );
}
