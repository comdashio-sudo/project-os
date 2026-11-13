import { formatDate } from "@/components/ds/format";
import React from "react";
import { useParams } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { trpc } from "@/lib/trpc";
import { ErrorState, LoadingState } from "@/components/ScreenStates";
import { SourceNotice } from "@/components/SectionResilience";
import { LevelDashboard, LevelSection, formatIndex, formatMoney, formatPercent } from "@/components/LevelDashboard";
import { kpiValues, type ScopeLevels } from "@/lib/levels";
import { Figure } from "@/pages/LevelCompany";
import { enumLabel } from "@/lib/labels";
import { ProjectFpac } from "@/pages/ProjectFpac";
import { TableScroll } from "@/components/ds/TableScroll";
import { SourcePercentages } from "@/components/pmc/SourcePercentages";
import { WriteGate } from "@/lib/permissions";
import { wo22Text } from "@/lib/wo22Text";

// Level 3, one project: profitability, EVM, progress, the daily report, handovers and inspections. The figures come from `scopes.project`
// (scopeDashboards.ts); the profitability panel is the existing ProjectFpac; the daily reports and the inspections are the existing
// `fieldReports.list` and `qualityInspections.list` queries, read here and not re-derived.

const text = {
  ar: {
    title: "لوحة المشروع", loading: "جارٍ تحميل لوحة المشروع…",
    profit: "الربحية", evm: "القيمة المكتسبة (EVM)", progress: "التقدم", pv: "PV", ev: "EV", ac: "AC", cpi: "CPI", spi: "SPI", eac: "EAC", vac: "VAC",
    evmUnavailable: "لا يمكن حساب القيمة المكتسبة لهذا المشروع بعد.", progressUnavailable: "لا يوجد تقدم محسوب لهذا المشروع بعد.",
    daily: "التقرير اليومي", dailyFailed: "تعذّر تحميل التقارير اليومية.", noDaily: "لا تقرير يومي مسجل لهذا المشروع.",
    report: "رقم التقرير", date: "التاريخ", workforce: "عدد العمالة", status: "الحالة",
    handovers: "التسليمات", handoversFailed: "تعذّر تحميل التسليمات.", deliveriesTotal: "إجمالي التسليمات", deliveriesAwaiting: "بانتظار رد الاستشاري", deliveriesReplied: "تم الرد عليها",
    inspections: "الفحوصات", inspectionsFailed: "تعذّر تحميل الفحوصات.", noInspections: "لا فحص مسجل لهذا المشروع.",
    inspection: "رقم الفحص", inspectedAt: "تاريخ الفحص", outcome: "النتيجة", awaiting: "بانتظار النتيجة", openNcrs: "عدم مطابقة مفتوحة",
    notAvailable: "غير متاح",
  },
  en: {
    title: "Project dashboard", loading: "Loading the project dashboard…",
    profit: "Profitability", evm: "Earned value (EVM)", progress: "Progress", pv: "PV", ev: "EV", ac: "AC", cpi: "CPI", spi: "SPI", eac: "EAC", vac: "VAC",
    evmUnavailable: "Earned value cannot be computed for this project yet.", progressUnavailable: "No progress is computed for this project yet.",
    daily: "Daily report", dailyFailed: "Could not load the daily reports.", noDaily: "No daily report is registered for this project.",
    report: "Report number", date: "Date", workforce: "Workforce", status: "Status",
    handovers: "Handovers", handoversFailed: "Could not load the handovers.", deliveriesTotal: "Total handovers", deliveriesAwaiting: "Awaiting the consultant", deliveriesReplied: "Replied",
    inspections: "Inspections", inspectionsFailed: "Could not load the inspections.", noInspections: "No inspection is registered for this project.",
    inspection: "Inspection number", inspectedAt: "Inspection date", outcome: "Outcome", awaiting: "Awaiting a result", openNcrs: "Open non-conformances",
    notAvailable: "Not available",
  },
  ur: {
    title: "پروجیکٹ کا ڈیش بورڈ", loading: "پروجیکٹ کا ڈیش بورڈ لوڈ ہو رہا ہے…",
    profit: "منافع بخشی", evm: "کمائی گئی قدر (EVM)", progress: "پیش رفت", pv: "PV", ev: "EV", ac: "AC", cpi: "CPI", spi: "SPI", eac: "EAC", vac: "VAC",
    evmUnavailable: "اس پروجیکٹ کی کمائی گئی قدر ابھی حساب نہیں کی جا سکتی۔", progressUnavailable: "اس پروجیکٹ کی پیش رفت ابھی حساب نہیں کی گئی۔",
    daily: "روزانہ کی رپورٹ", dailyFailed: "روزانہ کی رپورٹیں لوڈ نہیں ہو سکیں۔", noDaily: "اس پروجیکٹ کے لیے کوئی روزانہ رپورٹ درج نہیں ہے۔",
    report: "رپورٹ نمبر", date: "تاریخ", workforce: "افرادی قوت", status: "حیثیت",
    handovers: "ہینڈ اوورز", handoversFailed: "ہینڈ اوورز لوڈ نہیں ہو سکے۔", deliveriesTotal: "کل ہینڈ اوورز", deliveriesAwaiting: "مشیر کے منتظر", deliveriesReplied: "جواب دیا گیا",
    inspections: "معائنے", inspectionsFailed: "معائنے لوڈ نہیں ہو سکے۔", noInspections: "اس پروجیکٹ کے لیے کوئی معائنہ درج نہیں ہے۔",
    inspection: "معائنے کا نمبر", inspectedAt: "معائنے کی تاریخ", outcome: "نتیجہ", awaiting: "نتیجے کے منتظر", openNcrs: "کھلی عدم مطابقتیں",
    notAvailable: "دستیاب نہیں",
  },
};

export default function LevelProject() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { isArabic, language } = useLanguage();
  const t = pickLanguage(language, text);
  const enabled = Boolean(tenantId && projectId);
  const query = trpc.scopes.project.useQuery({ tenantId, projectId }, { enabled });
  const reports = trpc.fieldReports.list.useQuery({ tenantId, projectId }, { enabled });
  const inspections = trpc.qualityInspections.list.useQuery({ tenantId, projectId }, { enabled });
  const deliveries = trpc.levelReads.projectDeliveries.useQuery({ tenantId, projectId }, { enabled });
  const title = query.data ? `${query.data.project.code} · ${query.data.project.name}` : t.title;
  const dashboard = (body: React.ReactNode) => <LevelDashboard level="project" tenantId={tenantId} projectId={projectId} title={title}>{body}</LevelDashboard>;
  if (query.isLoading) return dashboard(<LoadingState isArabic={isArabic} label={t.loading} />);
  if (query.error || !query.data) return dashboard(<ErrorState isArabic={isArabic} error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} />);
  const data: ScopeLevels["project"] = query.data;
  const values = kpiValues(data.project);
  const evm = data.project.evm;
  const dailyReports = (reports.data ?? [])
    .filter(report => report.reportType === "daily")
    .sort((a, b) => new Date(b.reportedAt).getTime() - new Date(a.reportedAt).getTime())
    .slice(0, 5);
  const latestInspections = (inspections.data ?? []).slice().sort((a, b) => new Date(b.inspectedAt).getTime() - new Date(a.inspectedAt).getTime()).slice(0, 5);
  const day = (value: Date | string) => formatDate(value, language);
  const currency = data.project.currency;
  return dashboard(<>
    <LevelSection id="project-progress" title={t.progress}>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Figure label={t.progress} value={values.progress === null ? t.notAvailable : formatPercent(values.progress)} />
        <Figure label={t.cpi} value={formatIndex(values.cpi)} />
        <Figure label={t.spi} value={formatIndex(values.spi)} />
        <Figure label={t.profit} value={values.profit === null ? t.notAvailable : formatMoney(values.profit, currency)} />
      </dl>
      {values.progress === null && <p className="mt-4 text-sm text-muted-foreground">{t.progressUnavailable}</p>}
    </LevelSection>
    <LevelSection id="project-evm" title={t.evm}>
      {"vac" in evm
        ? <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
            <Figure label={t.pv} value={formatMoney(evm.pv, currency)} />
            <Figure label={t.ev} value={formatMoney(evm.ev, currency)} />
            <Figure label={t.ac} value={formatMoney(evm.ac, currency)} />
            <Figure label={t.eac} value={formatMoney(evm.eac, currency)} />
            <Figure label={t.vac} value={formatMoney(evm.vac, currency)} />
          </dl>
        : <p className="text-sm text-muted-foreground">{t.evmUnavailable}</p>}
    </LevelSection>
    <WriteGate permission="project.pmc.read" projectId={projectId}><LevelSection id="project-percentages" title={pickLanguage(language, wo22Text).percentagesTitle}><SourcePercentages tenantId={tenantId} projectId={projectId} /></LevelSection></WriteGate>
    <ProjectFpac tenantId={tenantId} projectId={projectId} />
    <LevelSection id="project-daily" title={t.daily}>
      <SourceNotice query={reports} isArabic={isArabic} title={t.daily} fallback={t.dailyFailed} />
      {reports.isLoading ? <LoadingState isArabic={isArabic} label={t.loading} />
        : reports.data && dailyReports.length === 0 ? <p className="text-sm text-muted-foreground">{t.noDaily}</p>
        : dailyReports.length > 0 ? <TableScroll label={t.daily}><table className="w-full min-w-[560px] text-sm">
            <thead className="text-xs text-muted-foreground"><tr><th scope="col" className="py-2 text-start">{t.report}</th><th scope="col" className="py-2 text-start">{t.date}</th><th scope="col" className="py-2 text-start">{t.workforce}</th><th scope="col" className="py-2 text-start">{t.status}</th></tr></thead>
            <tbody className="divide-y divide-border">{dailyReports.map(report => <tr key={report.id}><th scope="row" className="py-3 text-start font-medium">{report.reportNumber}</th><td className="py-3">{day(report.reportedAt)}</td><td className="py-3">{report.workforceCount}</td><td className="py-3">{enumLabel(report.status, language)}</td></tr>)}</tbody>
          </table></TableScroll> : null}
    </LevelSection>
    <LevelSection id="project-handovers" title={t.handovers}>
      <SourceNotice query={deliveries} isArabic={isArabic} title={t.handovers} fallback={t.handoversFailed} />
      {deliveries.isLoading ? <LoadingState isArabic={isArabic} label={t.loading} />
        : deliveries.data ? <dl className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <Figure label={t.deliveriesTotal} value={String(deliveries.data.submittals.total)} />
            <Figure label={t.deliveriesAwaiting} value={String(deliveries.data.submittals.awaitingReply)} />
            <Figure label={t.deliveriesReplied} value={String(deliveries.data.submittals.replied)} />
          </dl>
        : null}
    </LevelSection>
    <LevelSection id="project-inspections" title={t.inspections}>
      <dl className="mb-4 grid grid-cols-2 gap-3">
        <Figure label={t.awaiting} value={String(data.project.pendingQuality.inspectionsAwaitingResult)} />
        <Figure label={t.openNcrs} value={String(data.project.pendingQuality.openNcrs)} />
      </dl>
      <SourceNotice query={inspections} isArabic={isArabic} title={t.inspections} fallback={t.inspectionsFailed} />
      {inspections.isLoading ? <LoadingState isArabic={isArabic} label={t.loading} />
        : inspections.data && latestInspections.length === 0 ? <p className="text-sm text-muted-foreground">{t.noInspections}</p>
        : latestInspections.length > 0 ? <TableScroll label={t.inspections}><table className="w-full min-w-[560px] text-sm">
            <thead className="text-xs text-muted-foreground"><tr><th scope="col" className="py-2 text-start">{t.inspection}</th><th scope="col" className="py-2 text-start">{t.inspectedAt}</th><th scope="col" className="py-2 text-start">{t.outcome}</th><th scope="col" className="py-2 text-start">{t.status}</th></tr></thead>
            <tbody className="divide-y divide-border">{latestInspections.map(item => <tr key={item.id}><th scope="row" className="py-3 text-start font-medium">{item.inspectionNumber}</th><td className="py-3">{day(item.inspectedAt)}</td><td className="py-3">{enumLabel(item.outcome, language)}</td><td className="py-3">{enumLabel(item.status, language)}</td></tr>)}</tbody>
          </table></TableScroll> : null}
    </LevelSection>
  </>);
}
