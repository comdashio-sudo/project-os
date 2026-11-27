// Q-70 (3): «ملخص البنود» — the project's progress in one place: per activity (villas, complete, in progress, remaining, completion and earned share), per
// block and per phase (villas, weighted progress, completed cells). Read from pmc.activitySummary with the project's own PMC rules, so it agrees with the
// PMC page. A block or a phase narrows everything on the server. Each table exports to Excel exactly as shown. Q-69 layout: the activities first and wide,
// blocks and phases under them, each at the full width (four columns that must stay readable).
import React, { useState } from "react";
import { useParams } from "wouter";
import { Badge, DataTable, Field, Select, TextInput, type Column } from "@/components/ds";
import { formatNumber, formatPercent } from "@/components/ds/format";
import { ExportExcelButton } from "@/components/ExportExcelButton";
import { PageMain, PageTitle } from "@/components/pageFrame";
import { SourceNotice } from "@/components/SectionResilience";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { useCan } from "@/lib/permissions";
import { trpc } from "@/lib/trpc";
import { periodFor, siteToday, type PeriodKind } from "@/lib/periodRange";

const ALL = "__all";
const text = {
  ar: {
    title: "ملخص البنود", intro: "لكل بند: عدد الفلل التي يخصها، والمكتمل والجاري والمتبقي، ونسبة الاكتمال والنسبة المكتسبة بأوزان الفلل؛ ولكل بلوك ومرحلة: التقدم الموزون والخلايا المكتملة — بقواعد PMC نفسها.",
    block: "البلوك", phase: "المرحلة", all: "الكل", project: "تقدم المشروع", villas: "الفلل", noNumber: "فلل بلا رقم (أوزان نموذجها لا تبلغ 100)",
    activities: "البنود", activity: "البند", complete: "مكتمل", underReview: "قيد المراجعة", inProgress: "جارٍ", notStarted: "متبقٍ", completion: "الاكتمال %", earned: "المكتسب %",
    periodLabel: "الفترة", periodNone: "بلا فترة", thisWeek: "هذا الأسبوع (من الأحد)", lastWeek: "الأسبوع الماضي", thisMonth: "هذا الشهر", lastMonth: "الشهر الماضي", custom: "نطاق محدد", from: "من", to: "إلى", periodAchieved: "إنجاز الفترة", delta: "إنجاز الفترة %", periodNote: "الفرق بين التقدم عند نهاية الفترة وعند بدايتها، من سجل التغييرات.",
    reconciled: "المراحل والبلوكات تطابق إجمالي المشروع", notReconciled: "لا يطابق", missingVillas: "فلل خارج المجموعات",
    engineer: "المهندس المسؤول", noEngineer: "— لم يُسمَّ", saved: "حُفظ المهندس المسؤول.",
    candidatesFailed: "تعذّر تحميل قائمة المهندسين؛ يظهر الاسم فقط. أعد تحميل الصفحة.",
    blocks: "البلوكات", phases: "المراحل", progress: "التقدم %", cells: "الخلايا المكتملة", none: "لا بيانات بعد.", unknown: "—",
  },
  en: {
    title: "Activity summary", intro: "Per activity: the villas it applies to, complete, in progress and remaining, the completion share and the share earned by villa weight; per block and phase: the weighted progress and completed cells — by the same PMC rules.",
    block: "Block", phase: "Phase", all: "All", project: "Project progress", villas: "Villas", noNumber: "villas without a number (their model's weights do not total 100)",
    activities: "Activities", activity: "Activity", complete: "Complete", underReview: "Under review", inProgress: "In progress", notStarted: "Remaining", completion: "Completion %", earned: "Earned %",
    periodLabel: "Period", periodNone: "No period", thisWeek: "This week (from Sunday)", lastWeek: "Last week", thisMonth: "This month", lastMonth: "Last month", custom: "Custom range", from: "From", to: "To", periodAchieved: "Period achievement", delta: "Period achievement %", periodNote: "Progress at the end of the period minus progress at its start, from the change history.",
    reconciled: "Phases and blocks match the project total", notReconciled: "Does not match", missingVillas: "villas outside the groups",
    engineer: "Engineer in charge", noEngineer: "— not named", saved: "Engineer in charge saved.",
    candidatesFailed: "The list of engineers could not be loaded; only the name is shown. Reload the page.",
    blocks: "Blocks", phases: "Phases", progress: "Progress %", cells: "Completed cells", none: "No data yet.", unknown: "—",
  },
  ur: {
    title: "سرگرمیوں کا خلاصہ", intro: "ہر سرگرمی کے لیے: متعلقہ ولاز، مکمل، جاری اور باقی، تکمیل کا تناسب اور ولا وزن سے حاصل تناسب؛ ہر بلاک اور مرحلے کے لیے: وزنی پیش رفت اور مکمل خانے — انہی PMC قواعد سے۔",
    block: "بلاک", phase: "مرحلہ", all: "سب", project: "منصوبے کی پیش رفت", villas: "ولاز", noNumber: "بغیر عدد کے ولاز (ان کے ماڈل کے وزن 100 نہیں)",
    activities: "سرگرمیاں", activity: "سرگرمی", complete: "مکمل", underReview: "زیر جائزہ", inProgress: "جاری", notStarted: "باقی", completion: "تکمیل %", earned: "حاصل %",
    periodLabel: "مدت", periodNone: "کوئی مدت نہیں", thisWeek: "اس ہفتے (اتوار سے)", lastWeek: "پچھلا ہفتہ", thisMonth: "اس مہینے", lastMonth: "پچھلا مہینہ", custom: "مخصوص حد", from: "از", to: "تک", periodAchieved: "مدت کی پیش رفت", delta: "مدت کی پیش رفت %", periodNote: "مدت کے اختتام کی پیش رفت منہا اس کے آغاز کی، تبدیلیوں کی تاریخ سے۔",
    reconciled: "مراحل اور بلاکس منصوبے کے کل سے مطابقت رکھتے ہیں", notReconciled: "مطابقت نہیں", missingVillas: "گروپوں سے باہر ولاز",
    engineer: "ذمہ دار انجینئر", noEngineer: "— نامزد نہیں", saved: "ذمہ دار انجینئر محفوظ ہو گیا۔",
    candidatesFailed: "انجینئروں کی فہرست لوڈ نہیں ہو سکی؛ صرف نام دکھایا جا رہا ہے۔ صفحہ دوبارہ لوڈ کریں۔",
    blocks: "بلاکس", phases: "مراحل", progress: "پیش رفت %", cells: "مکمل خانے", none: "ابھی کوئی ڈیٹا نہیں۔", unknown: "—",
  },
};

export default function ActivitySummary() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { language, isArabic } = useLanguage();
  const t = pickLanguage(language, text);
  const [block, setBlock] = useState(ALL); const [phase, setPhase] = useState(ALL);
  const [kind, setKind] = useState<PeriodKind>("none"); const [customFrom, setCustomFrom] = useState(""); const [customTo, setCustomTo] = useState("");
  const today = siteToday();
  const range = kind === "none" ? null : kind === "custom" ? (customFrom ? { from: customFrom, ...(customTo ? { to: customTo } : {}) } : null) : periodFor(kind, today);
  const query = trpc.pmc.activitySummary.useQuery({ tenantId, projectId, ...(block !== ALL ? { blockCode: block } : {}), ...(phase !== ALL ? { phase } : {}), ...(range ?? {}) }, { enabled: Boolean(tenantId && projectId) });
  const data = query.data;
  // Q-72 (4): whoever manages PMC names the engineer in charge of a block or a phase right in its row; everyone who reads the summary sees the name
  const canManage = useCan("project.pmc.manage", projectId);
  const candidates = trpc.pmc.scopeEngineerCandidates.useQuery({ tenantId, projectId }, { enabled: Boolean(tenantId && projectId) && canManage });
  const utils = trpc.useUtils();
  const setEngineer = trpc.pmc.setScopeEngineer.useMutation({ onSuccess: () => { void utils.pmc.activitySummary.invalidate(); } });
  const NONE = "__none";
  type ActivityRow = NonNullable<typeof data>["activities"][number];
  type GroupRow = NonNullable<typeof data>["blocks"][number];
  const period = data?.period ?? null;
  // Q-72 (1): what the screen had on when the file was made, in words, printed in the file's header
  const filtersText = [block !== ALL ? `${t.block}: ${block}` : null, phase !== ALL ? `${t.phase}: ${phase}` : null, period ? `${t.periodLabel}: ${period.from} → ${period.to}` : null].filter(Boolean).join(" · ") || undefined;
  const signed = (value: number | null) => (value === null ? t.unknown : <bdi dir="ltr">{value > 0 ? "+" : ""}{formatPercent(value, 2)}</bdi>);
  const activityDelta = (code: string) => period?.activities.find(row => row.code === code)?.deltaEarnedPercent ?? null;
  const groupDelta = (rows: Array<{ key: string; deltaPercent: number | null }>, key: string) => rows.find(row => row.key === key)?.deltaPercent ?? null;
  const percent = (value: number | null) => (value === null ? t.unknown : formatPercent(value, 2));
  const activityColumns: Column<ActivityRow>[] = [
    { key: "activity", header: t.activity, render: row => <span className="whitespace-nowrap">{row.code} — {row.name}</span> },
    { key: "villas", header: t.villas, numeric: true, render: row => formatNumber(row.villas) },
    { key: "complete", header: t.complete, numeric: true, render: row => formatNumber(row.complete) },
    { key: "underReview", header: t.underReview, numeric: true, render: row => formatNumber(row.underReview) },
    { key: "inProgress", header: t.inProgress, numeric: true, render: row => formatNumber(row.inProgress) },
    { key: "notStarted", header: t.notStarted, numeric: true, render: row => formatNumber(row.notStarted) },
    { key: "completion", header: t.completion, numeric: true, render: row => percent(row.completionPercent) },
    { key: "earned", header: t.earned, numeric: true, render: row => percent(row.earnedPercent) },
    ...(period ? [{ key: "delta", header: t.delta, numeric: true, render: (row: ActivityRow) => signed(activityDelta(row.code)) }] : []),
  ];
  const groupColumns = (label: string): Column<GroupRow>[] => [
    { key: "key", header: label, render: row => <span className="whitespace-nowrap">{row.key}</span> },
    { key: "engineer", header: t.engineer, render: row => (canManage && candidates.data && !candidates.isError
      ? <Select aria-label={`${t.engineer} ${row.key}`} options={[{ value: NONE, label: t.noEngineer }, ...candidates.data.map(person => ({ value: String(person.userId), label: person.name || String(person.userId) }))]} value={row.engineer ? String(row.engineer.userId) : NONE}
          onValueChange={value => setEngineer.mutate({ tenantId, projectId, scopeType: label === t.block ? "block" : "phase", scopeKey: row.key, engineerUserId: value === NONE ? null : Number(value) })} />
      : <span className="whitespace-nowrap">{row.engineer?.name || t.noEngineer}</span>) },
    { key: "villas", header: t.villas, numeric: true, render: row => formatNumber(row.villas) },
    { key: "progress", header: t.progress, numeric: true, render: row => percent(row.progressPercent) },
    { key: "cells", header: t.cells, numeric: true, render: row => <span className="whitespace-nowrap">{formatNumber(row.completeCells)} / {formatNumber(row.totalCells)}</span> },
    ...(period ? [{ key: "delta", header: t.delta, numeric: true, render: (row: GroupRow) => signed(groupDelta(label === t.block ? period.blocks : period.phases, row.key)) }] : []),
  ];
  const activityExport = [
    { header: t.activity, value: (row: ActivityRow) => `${row.code} — ${row.name}` },
    { header: t.villas, kind: "number" as const, value: (row: ActivityRow) => row.villas },
    { header: t.complete, kind: "number" as const, value: (row: ActivityRow) => row.complete },
    { header: t.underReview, kind: "number" as const, value: (row: ActivityRow) => row.underReview },
    { header: t.inProgress, kind: "number" as const, value: (row: ActivityRow) => row.inProgress },
    { header: t.notStarted, kind: "number" as const, value: (row: ActivityRow) => row.notStarted },
    { header: t.completion, kind: "number" as const, value: (row: ActivityRow) => row.completionPercent },
    { header: t.earned, kind: "number" as const, value: (row: ActivityRow) => row.earnedPercent },
    ...(period ? [{ header: t.delta, kind: "number" as const, value: (row: ActivityRow) => activityDelta(row.code) }] : []),
  ];
  const groupExport = (label: string) => [
    { header: label, value: (row: GroupRow) => row.key },
    { header: t.engineer, value: (row: GroupRow) => row.engineer?.name ?? "" },
    { header: t.villas, kind: "number" as const, value: (row: GroupRow) => row.villas },
    { header: t.progress, kind: "number" as const, value: (row: GroupRow) => row.progressPercent },
    { header: t.cells, kind: "number" as const, value: (row: GroupRow) => row.completeCells },
    ...(period ? [{ header: t.delta, kind: "number" as const, value: (row: GroupRow) => groupDelta(label === t.block ? period.blocks : period.phases, row.key) }] : []),
  ];

  return (
    <PageMain className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 md:p-6">
      <PageTitle title={t.title} description={t.intro} />
      <SourceNotice query={query} isArabic={isArabic} title={t.title} />
      {canManage && candidates.isError ? <p role="alert" className="text-sm text-danger-soft-foreground">{t.candidatesFailed}</p> : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        {data ? (
          <div className="flex flex-wrap items-center gap-2" data-summary-project>
            <Badge tone="primary">{t.project}: <bdi dir="ltr">{percent(data.project.progressPercent)}</bdi></Badge>
            {period ? <Badge tone="success" >{t.periodAchieved}: {signed(period.project.deltaPercent)} <bdi dir="ltr">({period.from} → {period.to})</bdi></Badge> : null}
            {data.reconciliation.blocks.matches && data.reconciliation.phases.matches ? <Badge tone="success"><span data-reconciled="yes">{t.reconciled} ✓</span></Badge>
              : <Badge tone="warning"><span data-reconciled="no">{t.notReconciled}: {(["blocks", "phases"] as const).filter(kind => !data.reconciliation[kind].matches).map(kind => `${t[kind]} (${formatNumber(data.reconciliation[kind].villasMissing)} ${t.missingVillas})`).join(" · ")}</span></Badge>}
            <Badge tone="neutral">{t.villas}: <bdi dir="ltr">{formatNumber(data.project.villas)}</bdi></Badge>
            {data.project.villasWithoutNumber ? <Badge tone="warning"><bdi dir="ltr">{formatNumber(data.project.villasWithoutNumber)}</bdi> {t.noNumber}</Badge> : null}
          </div>
        ) : <span />}
        <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2 lg:grid-cols-4">
          <Field label={t.periodLabel} hint={t.periodNote}>{props => <Select id={props.id} options={(["none", "thisWeek", "lastWeek", "thisMonth", "lastMonth", "custom"] as const).map(value => ({ value, label: value === "none" ? t.periodNone : t[value] }))} value={kind} onValueChange={value => setKind(value as PeriodKind)} />}</Field>
          {kind === "custom" ? <><Field label={t.from}>{props => <TextInput id={props.id} type="date" value={customFrom} max={customTo || undefined} onChange={event => setCustomFrom(event.target.value)} />}</Field>
          <Field label={t.to}>{props => <TextInput id={props.id} type="date" value={customTo} min={customFrom || undefined} onChange={event => setCustomTo(event.target.value)} />}</Field></> : null}
          <Field label={t.block}>{props => <Select id={props.id} options={[{ value: ALL, label: t.all }, ...(data?.filters.blocks ?? []).map(code => ({ value: code, label: code }))]} value={block} onValueChange={setBlock} />}</Field>
          <Field label={t.phase}>{props => <Select id={props.id} options={[{ value: ALL, label: t.all }, ...(data?.filters.phases ?? []).map(code => ({ value: code, label: code }))]} value={phase} onValueChange={setPhase} />}</Field>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <section className="flex min-w-0 flex-col gap-2" data-summary-activities>
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{t.activities}</h2><ExportExcelButton filters={filtersText} fileName="activity-summary" sheetName={t.activities} title={t.title} rows={data?.activities ?? []} columns={activityExport} /></div>
          <DataTable caption={t.activities} columns={activityColumns} rows={data?.activities ?? []} rowKey={row => row.code} empty={data ? t.none : undefined} />
        </section>
        <div className="flex min-w-0 flex-col gap-4">
          {(["blocks", "phases"] as const).map(kind => (
            <section key={kind} className="flex min-w-0 flex-col gap-2" data-summary-group={kind}>
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{t[kind]}</h2><ExportExcelButton filters={filtersText} fileName={`progress-by-${kind}`} sheetName={t[kind]} title={t.title} rows={data?.[kind] ?? []} columns={groupExport(kind === "blocks" ? t.block : t.phase)} /></div>
              <DataTable caption={t[kind]} columns={groupColumns(kind === "blocks" ? t.block : t.phase)} rows={data?.[kind] ?? []} rowKey={row => row.key} empty={data ? t.none : undefined} />
            </section>
          ))}
        </div>
      </div>
    </PageMain>
  );
}
