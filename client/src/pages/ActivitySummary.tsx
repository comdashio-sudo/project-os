// Q-70 (3): «ملخص البنود» — the project's progress in one place: per activity (villas, complete, in progress, remaining, completion and earned share), per
// block and per phase (villas, weighted progress, completed cells). Read from pmc.activitySummary with the project's own PMC rules, so it agrees with the
// PMC page. A block or a phase narrows everything on the server. Each table exports to Excel exactly as shown. Q-69 layout: the activities first and wide,
// blocks and phases under them, each at the full width (four columns that must stay readable).
import React, { useState } from "react";
import { useParams } from "wouter";
import { Badge, DataTable, Field, Select, type Column } from "@/components/ds";
import { formatNumber, formatPercent } from "@/components/ds/format";
import { ExportExcelButton } from "@/components/ExportExcelButton";
import { PageMain, PageTitle } from "@/components/pageFrame";
import { SourceNotice } from "@/components/SectionResilience";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { trpc } from "@/lib/trpc";

const ALL = "__all";
const text = {
  ar: {
    title: "ملخص البنود", intro: "لكل بند: عدد الفلل التي يخصها، والمكتمل والجاري والمتبقي، ونسبة الاكتمال والنسبة المكتسبة بأوزان الفلل؛ ولكل بلوك ومرحلة: التقدم الموزون والخلايا المكتملة — بقواعد PMC نفسها.",
    block: "البلوك", phase: "المرحلة", all: "الكل", project: "تقدم المشروع", villas: "الفلل", noNumber: "فلل بلا رقم (أوزان نموذجها لا تبلغ 100)",
    activities: "البنود", activity: "البند", complete: "مكتمل", underReview: "قيد المراجعة", inProgress: "جارٍ", notStarted: "متبقٍ", completion: "الاكتمال %", earned: "المكتسب %",
    blocks: "البلوكات", phases: "المراحل", progress: "التقدم %", cells: "الخلايا المكتملة", none: "لا بيانات بعد.", unknown: "—",
  },
  en: {
    title: "Activity summary", intro: "Per activity: the villas it applies to, complete, in progress and remaining, the completion share and the share earned by villa weight; per block and phase: the weighted progress and completed cells — by the same PMC rules.",
    block: "Block", phase: "Phase", all: "All", project: "Project progress", villas: "Villas", noNumber: "villas without a number (their model's weights do not total 100)",
    activities: "Activities", activity: "Activity", complete: "Complete", underReview: "Under review", inProgress: "In progress", notStarted: "Remaining", completion: "Completion %", earned: "Earned %",
    blocks: "Blocks", phases: "Phases", progress: "Progress %", cells: "Completed cells", none: "No data yet.", unknown: "—",
  },
  ur: {
    title: "سرگرمیوں کا خلاصہ", intro: "ہر سرگرمی کے لیے: متعلقہ ولاز، مکمل، جاری اور باقی، تکمیل کا تناسب اور ولا وزن سے حاصل تناسب؛ ہر بلاک اور مرحلے کے لیے: وزنی پیش رفت اور مکمل خانے — انہی PMC قواعد سے۔",
    block: "بلاک", phase: "مرحلہ", all: "سب", project: "منصوبے کی پیش رفت", villas: "ولاز", noNumber: "بغیر عدد کے ولاز (ان کے ماڈل کے وزن 100 نہیں)",
    activities: "سرگرمیاں", activity: "سرگرمی", complete: "مکمل", underReview: "زیر جائزہ", inProgress: "جاری", notStarted: "باقی", completion: "تکمیل %", earned: "حاصل %",
    blocks: "بلاکس", phases: "مراحل", progress: "پیش رفت %", cells: "مکمل خانے", none: "ابھی کوئی ڈیٹا نہیں۔", unknown: "—",
  },
};

export default function ActivitySummary() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { language, isArabic } = useLanguage();
  const t = pickLanguage(language, text);
  const [block, setBlock] = useState(ALL); const [phase, setPhase] = useState(ALL);
  const query = trpc.pmc.activitySummary.useQuery({ tenantId, projectId, ...(block !== ALL ? { blockCode: block } : {}), ...(phase !== ALL ? { phase } : {}) }, { enabled: Boolean(tenantId && projectId) });
  const data = query.data;
  type ActivityRow = NonNullable<typeof data>["activities"][number];
  type GroupRow = NonNullable<typeof data>["blocks"][number];
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
  ];
  const groupColumns = (label: string): Column<GroupRow>[] => [
    { key: "key", header: label, render: row => <span className="whitespace-nowrap">{row.key}</span> },
    { key: "villas", header: t.villas, numeric: true, render: row => formatNumber(row.villas) },
    { key: "progress", header: t.progress, numeric: true, render: row => percent(row.progressPercent) },
    { key: "cells", header: t.cells, numeric: true, render: row => <span className="whitespace-nowrap">{formatNumber(row.completeCells)} / {formatNumber(row.totalCells)}</span> },
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
  ];
  const groupExport = (label: string) => [
    { header: label, value: (row: GroupRow) => row.key },
    { header: t.villas, kind: "number" as const, value: (row: GroupRow) => row.villas },
    { header: t.progress, kind: "number" as const, value: (row: GroupRow) => row.progressPercent },
    { header: t.cells, kind: "number" as const, value: (row: GroupRow) => row.completeCells },
  ];

  return (
    <PageMain className="mx-auto flex w-full max-w-7xl flex-col gap-4 p-4 md:p-6">
      <PageTitle title={t.title} description={t.intro} />
      <SourceNotice query={query} isArabic={isArabic} title={t.title} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        {data ? (
          <div className="flex flex-wrap items-center gap-2" data-summary-project>
            <Badge tone="primary">{t.project}: <bdi dir="ltr">{percent(data.project.progressPercent)}</bdi></Badge>
            <Badge tone="neutral">{t.villas}: <bdi dir="ltr">{formatNumber(data.project.villas)}</bdi></Badge>
            {data.project.villasWithoutNumber ? <Badge tone="warning"><bdi dir="ltr">{formatNumber(data.project.villasWithoutNumber)}</bdi> {t.noNumber}</Badge> : null}
          </div>
        ) : <span />}
        <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2">
          <Field label={t.block}>{props => <Select id={props.id} options={[{ value: ALL, label: t.all }, ...(data?.filters.blocks ?? []).map(code => ({ value: code, label: code }))]} value={block} onValueChange={setBlock} />}</Field>
          <Field label={t.phase}>{props => <Select id={props.id} options={[{ value: ALL, label: t.all }, ...(data?.filters.phases ?? []).map(code => ({ value: code, label: code }))]} value={phase} onValueChange={setPhase} />}</Field>
        </div>
      </div>
      <div className="flex flex-col gap-4">
        <section className="flex min-w-0 flex-col gap-2" data-summary-activities>
          <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{t.activities}</h2><ExportExcelButton fileName="activity-summary" sheetName={t.activities} title={t.title} rows={data?.activities ?? []} columns={activityExport} /></div>
          <DataTable caption={t.activities} columns={activityColumns} rows={data?.activities ?? []} rowKey={row => row.code} empty={data ? t.none : undefined} />
        </section>
        <div className="flex min-w-0 flex-col gap-4">
          {(["blocks", "phases"] as const).map(kind => (
            <section key={kind} className="flex min-w-0 flex-col gap-2" data-summary-group={kind}>
              <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-lg font-semibold">{t[kind]}</h2><ExportExcelButton fileName={`progress-by-${kind}`} sheetName={t[kind]} title={t.title} rows={data?.[kind] ?? []} columns={groupExport(kind === "blocks" ? t.block : t.phase)} /></div>
              <DataTable caption={t[kind]} columns={groupColumns(kind === "blocks" ? t.block : t.phase)} rows={data?.[kind] ?? []} rowKey={row => row.key} empty={data ? t.none : undefined} />
            </section>
          ))}
        </div>
      </div>
    </PageMain>
  );
}
