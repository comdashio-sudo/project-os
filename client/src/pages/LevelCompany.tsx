import React from "react";
import { Link, useParams } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { EmptyState, ErrorState, LoadingState } from "@/components/ScreenStates";
import { AwaitingServer, LevelDashboard, LevelSection, NotAvailable, formatIndex, formatMoney, formatPercent } from "@/components/LevelDashboard";
import { kpiValues, levelHref, type ProjectKpi, type ScopeLevels } from "@/lib/levels";

// Level 1, the company and the board (view only): every project on one page, read from `scopes.company`. It composes the server's figures;
// it computes no money of its own. A person without company scope is answered with the no-permission sentence, never a 403.

const text = {
  ar: {
    title: "لوحة الشركة ومجلس الإدارة", loading: "جارٍ تحميل لوحة الشركة…",
    totals: "الإجماليات", projects: "المشاريع", profit: "الربح المتوقع (الإجمالي)", late: "مشاريع متأخرة", deviating: "مشاريع بانحراف سلبي",
    multiCurrency: "عملات مختلفة: لا يُجمع الربح", notAvailable: "غير متاح",
    allProjects: "كل المشاريع", project: "المشروع", deviation: "الانحراف (VAC)", cpi: "CPI", spi: "SPI", progress: "التقدم", lateActivities: "أنشطة متأخرة", open: "افتح المشروع",
    commitments: "الالتزامات", commitmentsWhat: "لا يوجد على main بعد مسار قراءة يجمع الالتزامات (العقود وأوامر الشراء) عبر المشاريع.",
    emptyTitle: "لا مشاريع بعد", emptyBody: "أضف أول مشروع لتظهر هنا لوحة الشركة.", emptyAction: "إلى سجل المشاريع",
  },
  en: {
    title: "Company and board dashboard", loading: "Loading the company dashboard…",
    totals: "Totals", projects: "Projects", profit: "Expected profit (total)", late: "Late projects", deviating: "Projects with negative variance",
    multiCurrency: "Several currencies: profit is not summed", notAvailable: "Not available",
    allProjects: "All projects", project: "Project", deviation: "Deviation (VAC)", cpi: "CPI", spi: "SPI", progress: "Progress", lateActivities: "Late activities", open: "Open project",
    commitments: "Commitments", commitmentsWhat: "No read route on main yet gathers commitments (contracts and purchase orders) across projects.",
    emptyTitle: "No projects yet", emptyBody: "Add the first project and it appears on this dashboard.", emptyAction: "To the project register",
  },
  ur: {
    title: "Company and board dashboard", loading: "Loading the company dashboard…",
    totals: "Totals", projects: "Projects", profit: "Expected profit (total)", late: "Late projects", deviating: "Projects with negative variance",
    multiCurrency: "Several currencies: profit is not summed", notAvailable: "Not available",
    allProjects: "All projects", project: "Project", deviation: "Deviation (VAC)", cpi: "CPI", spi: "SPI", progress: "Progress", lateActivities: "Late activities", open: "Open project",
    commitments: "Commitments", commitmentsWhat: "No read route on main yet gathers commitments (contracts and purchase orders) across projects.",
    emptyTitle: "No projects yet", emptyBody: "Add the first project and it appears on this dashboard.", emptyAction: "To the project register",
  },
};

export default function LevelCompany() {
  const { tenantId = "" } = useParams<{ tenantId: string }>();
  const { isArabic } = useLanguage();
  const t = isArabic ? text.ar : text.en;
  const query = trpc.scopes.company.useQuery({ tenantId }, { enabled: Boolean(tenantId) });
  const dashboard = (body: React.ReactNode) => <LevelDashboard level="company" tenantId={tenantId} title={t.title}>{body}</LevelDashboard>;
  if (query.isLoading) return dashboard(<LoadingState isArabic={isArabic} label={t.loading} />);
  if (query.error || !query.data) return dashboard(<ErrorState isArabic={isArabic} error={query.error} onRetry={() => query.refetch()} retrying={query.isFetching} />);
  const data: ScopeLevels["company"] = query.data;
  const rows = data.projects;
  const lateCount = rows.filter(row => row.overdueActivities > 0).length;
  const deviatingCount = rows.filter(row => { const vac = kpiValues(row).vac; return vac !== null && vac < 0; }).length;
  if (rows.length === 0) {
    return dashboard(<EmptyState isArabic={isArabic} title={t.emptyTitle} body={t.emptyBody} action={{ label: t.emptyAction, href: `/projects/${tenantId}` }} />);
  }
  return dashboard(<>
    <LevelSection id="company-totals" title={t.totals}>
      <dl className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Figure label={t.projects} value={String(data.totals.projectCount)} />
        <Figure label={t.profit} value={profitLabel(data.totals, t)} />
        <Figure label={t.late} value={String(lateCount)} />
        <Figure label={t.deviating} value={String(deviatingCount)} />
      </dl>
    </LevelSection>
    <LevelSection id="company-projects" title={t.allProjects}>
      <ProjectTable rows={rows} currency={data.totals.currency} isArabic={isArabic} t={t} tenantId={tenantId} />
    </LevelSection>
    <LevelSection id="company-commitments" title={t.commitments}>
      <AwaitingServer isArabic={isArabic} what={t.commitmentsWhat} />
    </LevelSection>
  </>);
}

/** Three cases the server distinguishes: a sum (one currency), projects in several currencies (no sum), or no figure computed. */
function profitLabel(totals: ScopeLevels["company"]["totals"], t: typeof text.ar): string {
  if (totals.expectedProfit !== null && totals.currency !== null) return formatMoney(totals.expectedProfit, totals.currency);
  return totals.currency === null ? t.multiCurrency : t.notAvailable;
}

export function Figure({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200"><dt className="text-xs font-semibold text-slate-600">{label}</dt><dd className="mt-1 text-xl font-semibold">{value}</dd></div>;
}

function ProjectTable({ rows, currency, isArabic, t, tenantId }: { rows: ProjectKpi[]; currency: string | null; isArabic: boolean; t: typeof text.ar; tenantId: string }) {
  return <div className="overflow-x-auto">
    <table className="w-full text-sm">
      <thead className="text-start text-xs text-slate-600">
        <tr>
          <th scope="col" className="py-2 text-start">{t.project}</th>
          <th scope="col" className="py-2 text-start">{t.profit}</th>
          <th scope="col" className="py-2 text-start">{t.deviation}</th>
          <th scope="col" className="py-2 text-start">{t.cpi}</th>
          <th scope="col" className="py-2 text-start">{t.spi}</th>
          <th scope="col" className="py-2 text-start">{t.progress}</th>
          <th scope="col" className="py-2 text-start">{t.lateActivities}</th>
          <th scope="col" className="py-2 text-start"><span className="sr-only">{t.open}</span></th>
        </tr>
      </thead>
      <tbody className="divide-y divide-slate-100">
        {rows.map(row => {
          const value = kpiValues(row);
          return <tr key={row.projectId} data-project-row={row.projectId}>
            <th scope="row" className="py-3 text-start font-medium">{row.code} · {row.name}</th>
            <td className="py-3">{value.profit === null ? <NotAvailable isArabic={isArabic} /> : formatMoney(value.profit, row.currency)}</td>
            <td className={`py-3 ${value.vac !== null && value.vac < 0 ? "font-semibold text-red-700" : ""}`}>{value.vac === null ? <NotAvailable isArabic={isArabic} /> : formatMoney(value.vac, row.currency)}</td>
            <td className="py-3">{formatIndex(value.cpi)}</td>
            <td className="py-3">{formatIndex(value.spi)}</td>
            <td className="py-3">{formatPercent(value.progress)}</td>
            <td className="py-3">{row.overdueActivities}</td>
            <td className="py-3"><Link href={levelHref(tenantId, "project", row.projectId)} className="inline-flex min-h-[44px] items-center font-semibold text-[#0e6b70]">{t.open}</Link></td>
          </tr>;
        })}
      </tbody>
    </table>
    {currency === null && <p className="mt-2 text-xs text-slate-500">{t.multiCurrency}</p>}
  </div>;
}
