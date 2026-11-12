import React from "react";
import { Link, useParams } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { trpc } from "@/lib/trpc";
import { EmptyState, ErrorState, LoadingState } from "@/components/ScreenStates";
import { LevelDashboard, LevelSection, NotAvailable, formatIndex, formatMoney, formatPercent } from "@/components/LevelDashboard";
import { kpiValues, levelHref, type ProjectKpi, type ScopeLevels } from "@/lib/levels";
import { Figure } from "@/pages/LevelCompany";
import { TableScroll } from "@/components/ds/TableScroll";

// Level 2, projects management (portfolio): the projects the caller's own PMO assignment covers, from `scopes.portfolio`. It compares
// the projects, and shows what waits for the consultant and what waits for quality. Each project opens its own level with one click.

const text = {
  ar: {
    title: "لوحة إدارة المشاريع (المحفظة)", loading: "جارٍ تحميل لوحة المحفظة…",
    totals: "الإجماليات", projects: "المشاريع", avgProgress: "متوسط التقدم", late: "مشاريع بها أنشطة متأخرة",
    waitingConsultant: "ينتظر الاستشاري", waitingQuality: "ينتظر الجودة",
    comparison: "مقارنة المشاريع", project: "المشروع", progress: "التقدم", cpi: "CPI", spi: "SPI", profit: "الربح المتوقع", lateActivities: "أنشطة متأخرة",
    stockBelow: "مواد دون حد الطلب", open: "افتح المشروع",
    consultantTitle: "ما ينتظر الاستشاري", consultantRequests: "طلبات فحص بلا رد", consultantSubmittals: "اعتمادات بانتظار الرد",
    qualityTitle: "ما ينتظر الجودة", qualityInspections: "فحوصات بانتظار النتيجة", qualityNcrs: "عدم مطابقة مفتوحة",
    nothingWaiting: "لا شيء ينتظر في هذا القسم.", emptyTitle: "لا مشاريع في محفظتك", emptyBody: "لا يغطي تعيينك لإدارة المشاريع أي مشروع بعد.",
  },
  en: {
    title: "Projects management (portfolio) dashboard", loading: "Loading the portfolio dashboard…",
    totals: "Totals", projects: "Projects", avgProgress: "Average progress", late: "Projects with late activities",
    waitingConsultant: "Waiting for the consultant", waitingQuality: "Waiting for quality",
    comparison: "Project comparison", project: "Project", progress: "Progress", cpi: "CPI", spi: "SPI", profit: "Expected profit", lateActivities: "Late activities",
    stockBelow: "Materials below reorder", open: "Open project",
    consultantTitle: "Waiting for the consultant", consultantRequests: "Inspection requests without a reply", consultantSubmittals: "Submittals awaiting a reply",
    qualityTitle: "Waiting for quality", qualityInspections: "Inspections awaiting a result", qualityNcrs: "Open non-conformances",
    nothingWaiting: "Nothing is waiting in this section.", emptyTitle: "No projects in your portfolio", emptyBody: "Your projects-management assignment does not cover any project yet.",
  },
  ur: {
    title: "پروجیکٹ مینجمنٹ (پورٹ فولیو) کا ڈیش بورڈ", loading: "پورٹ فولیو کا ڈیش بورڈ لوڈ ہو رہا ہے…",
    totals: "کل", projects: "پروجیکٹس", avgProgress: "اوسط پیش رفت", late: "تاخیر کی سرگرمیوں والے پروجیکٹس",
    waitingConsultant: "مشیر کے جواب کا منتظر", waitingQuality: "معیار کی جانچ کا منتظر",
    comparison: "پروجیکٹس کا موازنہ", project: "پروجیکٹ", progress: "پیش رفت", cpi: "CPI", spi: "SPI", profit: "متوقع منافع", lateActivities: "تاخیر کا شکار سرگرمیاں",
    stockBelow: "دوبارہ آرڈر کی سطح سے نیچے مواد", open: "پروجیکٹ کھولیں",
    consultantTitle: "مشیر کے جواب کا منتظر", consultantRequests: "بغیر جواب کی معائنہ درخواستیں", consultantSubmittals: "جواب کے منتظر جمع شدہ دستاویزات",
    qualityTitle: "معیار کی جانچ کا منتظر", qualityInspections: "نتیجے کے منتظر معائنے", qualityNcrs: "کھلی عدم مطابقتیں",
    nothingWaiting: "اس حصے میں کچھ بھی انتظار میں نہیں ہے۔", emptyTitle: "آپ کے پورٹ فولیو میں کوئی پروجیکٹ نہیں", emptyBody: "آپ کی پروجیکٹ مینجمنٹ تفویض ابھی کسی پروجیکٹ کا احاطہ نہیں کرتی۔",
  },
};

export default function LevelPortfolio() {
  const { tenantId = "" } = useParams<{ tenantId: string }>();
  const { isArabic, language } = useLanguage();
  const t = pickLanguage(language, text);
  const query = trpc.scopes.portfolio.useQuery({ tenantId }, { enabled: Boolean(tenantId) });
  const rows: ProjectKpi[] = query.data?.projects ?? [];
  // The level below is a project, and the person chooses which one: a link per project of the comparison, each to that row's project (G-196).
  // Without a project there is nothing to choose, so no link is shown.
  const belowLinks = rows.map(row => ({ id: row.projectId, label: `${row.code} · ${row.name}`, href: levelHref(tenantId, "project", row.projectId) }));
  const dashboard = (body: React.ReactNode) => <LevelDashboard level="portfolio" tenantId={tenantId} title={t.title} belowHref={null} belowLinks={belowLinks}>{body}</LevelDashboard>;
  if (query.isLoading) return dashboard(<LoadingState isArabic={isArabic} label={t.loading} />);
  if (query.error || !query.data) return dashboard(<ErrorState isArabic={isArabic} error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} />);
  const data: ScopeLevels["portfolio"] = query.data;
  if (rows.length === 0) return dashboard(<EmptyState isArabic={isArabic} title={t.emptyTitle} body={t.emptyBody} />);
  const waitingConsultant = data.totals.pendingConsultant.inspectionRequests + data.totals.pendingConsultant.submittals;
  const waitingQuality = data.totals.pendingQuality.inspectionsAwaitingResult + data.totals.pendingQuality.openNcrs;
  const lateCount = rows.filter(row => row.overdueActivities > 0).length;
  const consultantRows = rows.filter(row => row.pendingConsultant.inspectionRequests + row.pendingConsultant.submittals > 0);
  const qualityRows = rows.filter(row => row.pendingQuality.inspectionsAwaitingResult + row.pendingQuality.openNcrs > 0);
  return dashboard(<>
    <LevelSection id="portfolio-totals" title={t.totals}>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-5">
        <Figure label={t.projects} value={String(data.totals.projectCount)} />
        <Figure label={t.avgProgress} value={formatPercent(data.totals.avgProgress)} />
        <Figure label={t.late} value={String(lateCount)} />
        <Figure label={t.waitingConsultant} value={String(waitingConsultant)} />
        <Figure label={t.waitingQuality} value={String(waitingQuality)} />
      </dl>
    </LevelSection>
    <LevelSection id="portfolio-comparison" title={t.comparison}>
      <TableScroll label={t.comparison}>
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="py-2 text-start">{t.project}</th>
              <th scope="col" className="py-2 text-start">{t.progress}</th>
              <th scope="col" className="py-2 text-start">{t.cpi}</th>
              <th scope="col" className="py-2 text-start">{t.spi}</th>
              <th scope="col" className="py-2 text-start">{t.profit}</th>
              <th scope="col" className="py-2 text-start">{t.lateActivities}</th>
              <th scope="col" className="py-2 text-start">{t.stockBelow}</th>
              <th scope="col" className="py-2 text-start"><span className="sr-only">{t.open}</span></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map(row => {
              const value = kpiValues(row);
              return <tr key={row.projectId} data-project-row={row.projectId}>
                <th scope="row" className="py-3 text-start font-medium">{row.code} · {row.name}</th>
                <td className="py-3">{formatPercent(value.progress)}</td>
                <td className="py-3">{formatIndex(value.cpi)}</td>
                <td className="py-3">{formatIndex(value.spi)}</td>
                <td className="py-3">{value.profit === null ? <NotAvailable isArabic={isArabic} /> : <bdi>{formatMoney(value.profit, row.currency)}</bdi>}</td>
                <td className="py-3">{row.overdueActivities}</td>
                <td className="py-3">{row.stock.materialsBelowReorder}</td>
                <td className="py-3"><Link href={levelHref(tenantId, "project", row.projectId)} className="inline-flex min-h-[44px] items-center font-semibold text-primary">{t.open}</Link></td>
              </tr>;
            })}
          </tbody>
        </table>
      </TableScroll>
    </LevelSection>
    <LevelSection id="portfolio-consultant" title={t.consultantTitle}>
      {consultantRows.length === 0 ? <p className="text-sm text-muted-foreground">{t.nothingWaiting}</p> : <ul className="space-y-2 text-sm">
        {consultantRows.map(row => <li key={row.projectId} className="flex flex-wrap justify-between gap-2 rounded-lg bg-muted p-3">
          <span className="font-medium">{row.code} · {row.name}</span>
          <span>{t.consultantRequests}: {row.pendingConsultant.inspectionRequests} · {t.consultantSubmittals}: {row.pendingConsultant.submittals}</span>
        </li>)}
      </ul>}
    </LevelSection>
    <LevelSection id="portfolio-quality" title={t.qualityTitle}>
      {qualityRows.length === 0 ? <p className="text-sm text-muted-foreground">{t.nothingWaiting}</p> : <ul className="space-y-2 text-sm">
        {qualityRows.map(row => <li key={row.projectId} className="flex flex-wrap justify-between gap-2 rounded-lg bg-muted p-3">
          <span className="font-medium">{row.code} · {row.name}</span>
          <span>{t.qualityInspections}: {row.pendingQuality.inspectionsAwaitingResult} · {t.qualityNcrs}: {row.pendingQuality.openNcrs}</span>
        </li>)}
      </ul>}
    </LevelSection>
  </>);
}
