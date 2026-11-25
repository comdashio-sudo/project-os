import { ExportExcelButton } from "@/components/ExportExcelButton";
import type { ExportColumn } from "@/lib/excelExport";
import React from "react";
import { Link, useParams } from "wouter";
import { formatAmount, formatDate, formatNumber, formatPercent } from "@/components/ds/format";
import { PageMain } from "@/components/pageFrame";
import { SourceNotice } from "@/components/SectionResilience";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { enumLabel } from "@/lib/labels";
import { pickLanguage, type Language } from "@/lib/language";
import { useCanPage } from "@/lib/permissions";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { trpc } from "@/lib/trpc";

type Row = inferRouterOutputs<AppRouter>["operations"]["overview"]["projects"][number];

const TEXT = {
  ar: {
    title: "التشغيل", intro: "صف لكل مشروع تتابعه: التقدم مقابل المخطط، والمتأخر والمتوقف، والجودة والسلامة، والمواد والتكلفة، والمخاطر العالية، وما ينتظر قرارك. الأرقام من سجلات المشاريع نفسها، وكل رقم يفتح مصدره.",
    loading: "جارٍ تحميل المشاريع…", empty: "لا مشروع قائم تتابعه في هذه الشركة.", asOf: "حتى", none: "لا يوجد",
    progress: "الإنجاز", actual: "الفعلي", planned: "المخطط", deviation: "الانحراف", noUnits: "لا فلل في المشروع بعد", noReports: "لا إنجاز في يومية معتمدة بعد", noSchedule: "لا جدول P6 مستورد، فلا خط مخطط",
    overdue: "أنشطة متأخرة", stalled: "فلل متوقفة", ncr: "NCR مفتوحة", incidents: "حوادث سلامة مفتوحة", lostTime: "إصابات وقت ضائع (30 يومًا)", materials: "مواد تحت حد الطلب",
    cost: "انحراف التكلفة", cpi: "CPI", moneyHidden: "التكلفة ليست ضمن صلاحيتك", evmUnavailable: "لا قيمة مكتسبة بعد", risks: "مخاطر عالية", waiting: "ينتظر قرارك", decisions: "قرارات", escalations: "تصعيدات",
  },
  en: {
    title: "Operations", intro: "A row for each project you follow: progress against plan, delays and stalls, quality and safety, materials and cost, high risks, and what waits on your decision. The figures come from the projects' own records, and each opens its source.",
    loading: "Loading projects…", empty: "No running project you follow in this company.", asOf: "As of", none: "None",
    progress: "Progress", actual: "Actual", planned: "Planned", deviation: "Deviation", noUnits: "No villas in the project yet", noReports: "No completion in an approved daily report yet", noSchedule: "No P6 schedule imported, so no planned line",
    overdue: "Overdue activities", stalled: "Stalled villas", ncr: "Open NCRs", incidents: "Open safety incidents", lostTime: "Lost-time injuries (30 days)", materials: "Materials below reorder",
    cost: "Cost variance", cpi: "CPI", moneyHidden: "Cost is outside your permissions", evmUnavailable: "No earned value yet", risks: "High risks", waiting: "Waiting on you", decisions: "decisions", escalations: "escalations",
  },
  ur: {
    title: "آپریشنز", intro: "ہر اس منصوبے کی ایک قطار جس کی آپ نگرانی کرتے ہیں: منصوبے کے مقابلے میں پیش رفت، تاخیر اور رکاوٹ، معیار اور حفاظت، مواد اور لاگت، زیادہ خطرات، اور جو آپ کے فیصلے کا منتظر ہے۔ اعداد منصوبوں کے اپنے ریکارڈ سے ہیں، اور ہر عدد اپنا ماخذ کھولتا ہے۔",
    loading: "منصوبے لوڈ ہو رہے ہیں…", empty: "اس کمپنی میں آپ کی نگرانی میں کوئی جاری منصوبہ نہیں۔", asOf: "تک", none: "کوئی نہیں",
    progress: "پیش رفت", actual: "اصل", planned: "منصوبہ", deviation: "فرق", noUnits: "منصوبے میں ابھی ولاز نہیں", noReports: "ابھی کسی منظور شدہ روزانہ رپورٹ میں تکمیل نہیں", noSchedule: "P6 شیڈول درآمد نہیں ہوا، اس لیے منصوبے کی لکیر نہیں",
    overdue: "تاخیر شدہ سرگرمیاں", stalled: "رکی ہوئی ولاز", ncr: "کھلی NCR", incidents: "کھلے حفاظتی واقعات", lostTime: "ضائع وقت والی چوٹیں (30 دن)", materials: "دوبارہ آرڈر کی حد سے کم مواد",
    cost: "لاگت کا فرق", cpi: "CPI", moneyHidden: "لاگت آپ کے اختیارات میں نہیں", evmUnavailable: "ابھی حاصل شدہ قدر نہیں", risks: "زیادہ خطرات", waiting: "آپ کے فیصلے کا منتظر", decisions: "فیصلے", escalations: "اضافے",
  },
} satisfies Record<Language, Record<string, string>>;

type Text = (typeof TEXT)["ar"];

/** One figure: a label and its value, a link to the page that holds the source when the viewer may open that page, plain text otherwise. */
function Figure({ label, href, canOpen, tone, children, name }: { label: string; href: string; canOpen: boolean; tone?: "alert" | "muted"; children: React.ReactNode; name: string }) {
  const value = <span className={`text-base font-semibold ${tone === "alert" ? "text-danger-soft-foreground" : tone === "muted" ? "text-muted-foreground" : "text-foreground"}`}>{children}</span>;
  const body = <><span className="text-xs text-muted-foreground">{label}</span>{value}</>;
  const shape = "flex min-h-11 flex-col justify-center gap-0.5 rounded-[var(--radius-md)] border border-border px-3 py-2";
  return canOpen
    ? <Link href={href} data-ops-figure={name} className={`${shape} hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary`}>{body}</Link>
    : <div data-ops-figure={name} className={shape}>{body}</div>;
}

const count = (value: number) => <bdi dir="ltr">{formatNumber(value)}</bdi>;

function ProjectRow({ row, tenantId, t, language }: { row: Row; tenantId: string; t: Text; language: Language }) {
  const base = `/projects/${tenantId}/${row.projectId}`;
  const canControls = useCanPage("controls", row.projectId);
  const canSchedule = useCanPage("schedule", row.projectId);
  const canStalled = useCanPage("stalled", row.projectId);
  const canQuality = useCanPage("quality", row.projectId);
  const canSafety = useCanPage("safety", row.projectId);
  const canRisks = useCanPage("risks", row.projectId);
  const { progress, cost } = row;
  const progressText = progress.actual === null
    ? <span className="text-sm font-normal">{progress.reason === "NO_UNITS" ? t.noUnits : progress.reason === "NO_REPORTS" ? t.noReports : "—"}{progress.planned !== null ? <> · {t.planned} <bdi dir="ltr">{formatPercent(progress.planned)}</bdi></> : null}</span>
    : <span className="grid gap-0.5"><span>{t.actual} <bdi dir="ltr">{formatPercent(progress.actual)}</bdi>{progress.planned !== null ? <> · {t.planned} <bdi dir="ltr">{formatPercent(progress.planned)}</bdi></> : null}</span>
      {progress.deviation !== null ? <span className="text-xs">{t.deviation} <bdi dir="ltr">{progress.deviation > 0 ? "+" : ""}{formatNumber(progress.deviation, 2)}</bdi></span> : <span className="text-xs font-normal text-muted-foreground">{t.noSchedule}</span>}</span>;
  return (
    <Card data-ops-project={row.projectId}>
      <CardHeader className="pb-3">
        <CardTitle className="flex flex-wrap items-center gap-2 text-base"><bdi>{row.code}</bdi><span>· {row.name}</span><span className="rounded-full bg-muted px-2 py-0.5 text-xs font-normal text-muted-foreground">{enumLabel(row.status, language)}</span></CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        <Figure name="progress" label={t.progress} href={`${base}/controls`} canOpen={canControls} tone={progress.deviation !== null && progress.deviation < 0 ? "alert" : progress.actual === null ? "muted" : undefined}>{progressText}</Figure>
        <Figure name="overdue" label={t.overdue} href={`${base}/schedule`} canOpen={canSchedule} tone={row.overdueActivities ? "alert" : undefined}>{count(row.overdueActivities)}</Figure>
        <Figure name="stalled" label={t.stalled} href={`${base}/stalled`} canOpen={canStalled} tone={row.stalledUnits === null ? "muted" : row.stalledUnits ? "alert" : undefined}>{row.stalledUnits === null ? t.noUnits : count(row.stalledUnits)}</Figure>
        <Figure name="ncr" label={t.ncr} href={`${base}/quality`} canOpen={canQuality} tone={row.openNcrs ? "alert" : undefined}>{count(row.openNcrs)}</Figure>
        <Figure name="safety" label={`${t.incidents} · ${t.lostTime}`} href={`${base}/safety`} canOpen={canSafety} tone={row.safety.lostTimeLast30Days ? "alert" : undefined}>{count(row.safety.openIncidents)} · {count(row.safety.lostTimeLast30Days)}</Figure>
        <Figure name="materials" label={t.materials} href={`/levels/${tenantId}/projects/${row.projectId}`} canOpen={canControls} tone={row.materialsBelowReorder ? "alert" : undefined}>{count(row.materialsBelowReorder)}</Figure>
        <Figure name="cost" label={`${t.cost} · ${t.cpi}`} href={`${base}/controls`} canOpen={canControls} tone={"value" in cost ? "muted" : cost.costVariance < 0 ? "alert" : undefined}>
          {"value" in cost ? <span className="text-sm font-normal">{cost.reason === "MONEY_HIDDEN" ? t.moneyHidden : t.evmUnavailable}</span>
            : <span><bdi dir="ltr">{formatAmount(cost.costVariance)} {row.currency}</bdi> · <bdi dir="ltr">{cost.cpi === null ? "—" : formatNumber(cost.cpi, 2)}</bdi></span>}
        </Figure>
        <Figure name="risks" label={t.risks} href={`${base}/risks`} canOpen={canRisks} tone={row.highRisks ? "alert" : undefined}>{count(row.highRisks)}</Figure>
        <Figure name="waiting" label={t.waiting} href={`/my-work/${tenantId}`} canOpen tone={row.waiting.decisions + row.waiting.escalations ? "alert" : undefined}>
          {row.waiting.decisions + row.waiting.escalations === 0 ? t.none : <span>{count(row.waiting.decisions)} {t.decisions} · {count(row.waiting.escalations)} {t.escalations}</span>}
        </Figure>
      </CardContent>
    </Card>
  );
}

/** Q-57: the rows the page shows, one line per project, with the page's own labels. An unknown figure is an empty cell (never a 0), and the cost is empty for a reader
 *  the server gave no money (the same answer the card shows as «hidden»). */
export function operationsColumns(t: Text, language: Language): ExportColumn<Row>[] {
  const nullable = (value: number | null) => (value === null ? null : value);
  return [
    { header: pickLanguage(language, { ar: "رمز المشروع", en: "Project code", ur: "پروجیکٹ کوڈ" }), value: row => row.code },
    { header: pickLanguage(language, { ar: "المشروع", en: "Project", ur: "پروجیکٹ" }), value: row => row.name },
    { header: pickLanguage(language, { ar: "الحالة", en: "Status", ur: "حالت" }), value: row => enumLabel(row.status, language) },
    { header: `${t.progress} · ${t.actual}`, kind: "percent", value: row => (row.progress.actual === null ? null : row.progress.actual / 100) },
    { header: `${t.progress} · ${t.planned}`, kind: "percent", value: row => (row.progress.planned === null ? null : row.progress.planned / 100) },
    { header: t.deviation, kind: "number", value: row => nullable(row.progress.deviation) },
    { header: t.overdue, kind: "number", value: row => row.overdueActivities },
    { header: t.stalled, kind: "number", value: row => nullable(row.stalledUnits) },
    { header: t.ncr, kind: "number", value: row => row.openNcrs },
    { header: t.incidents, kind: "number", value: row => row.safety.openIncidents },
    { header: t.lostTime, kind: "number", value: row => row.safety.lostTimeLast30Days },
    { header: t.materials, kind: "number", value: row => row.materialsBelowReorder },
    { header: t.cost, kind: "money", value: row => ("value" in row.cost ? null : row.cost.costVariance) },
    { header: t.cpi, kind: "number", value: row => ("value" in row.cost ? null : row.cost.cpi) },
    { header: t.risks, kind: "number", value: row => row.highRisks },
    { header: t.decisions, kind: "number", value: row => row.waiting.decisions },
    { header: t.escalations, kind: "number", value: row => row.waiting.escalations },
  ];
}

/**
 * Q-53 (adviser 20-11): «التشغيل» — the operations manager's page, and anyone's who reads projects: a row per project from operations.overview
 * (server/operationsOverview.ts), every figure computed there from the projects' own records. Nothing is computed or defaulted here: a null stays
 * a reason in words, never a 0. Each figure opens the page that holds its source when the viewer may open it (the same gate the page itself uses).
 */
export default function Operations() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { isArabic, language } = useLanguage();
  const t = pickLanguage(language, TEXT);
  const overview = trpc.operations.overview.useQuery({ tenantId });
  // the router frames every /:tenantId page in the product shell (App.tsx withAuth + isFramedPath); a second shell here drew the frame twice
  return <PageMain className="mx-auto grid w-full max-w-6xl gap-5 p-4 md:p-8">
      <header className="grid gap-1">
        <h1 className="text-2xl font-bold">{t.title}</h1>
        <p className="text-sm text-muted-foreground">{t.intro}</p>
        {overview.data ? <p className="text-xs text-muted-foreground" data-ops-today>{t.asOf} <bdi>{formatDate(overview.data.today, language)}</bdi></p> : null}
      </header>
      <SourceNotice query={overview} isArabic={isArabic} title={t.title} />
      {overview.isLoading ? <p className="text-sm text-muted-foreground">{t.loading}</p> : null}
      {overview.data && overview.data.projects.length > 0 ? <div><ExportExcelButton fileName="operations-overview" sheetName={t.title} title={t.title} rows={overview.data.projects} columns={operationsColumns(t, language)} /></div> : null}
      {overview.data && overview.data.projects.length === 0 ? <p className="text-sm text-muted-foreground" data-ops-empty>{t.empty}</p> : null}
      {overview.data?.projects.map(row => <ProjectRow key={row.projectId} row={row} tenantId={tenantId} t={t} language={language} />)}
    </PageMain>;
}
