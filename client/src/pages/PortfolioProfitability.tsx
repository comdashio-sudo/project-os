import { ExportExcelButton } from "@/components/ExportExcelButton";
import { useLanguage } from "@/contexts/LanguageContext";
import { type ExportColumn } from "@/lib/excelExport";
import { formatMoney, trend } from "@/lib/profitabilityView";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { TrendingUp } from "lucide-react";
import React from "react";
import { Link } from "wouter";
import { pickLanguage } from "@/lib/language";

const text = {
  ar: { title: "ربحية المشاريع", note: "المشاريع الخاسرة أو المتجهة للخسارة أولًا. الحركة منذ آخر لقطة شهرية.", project: "المشروع", fpac: "الربح المتوقع (FPAC)", movement: "الحركة", total: "إجمالي الربح المتوقع", loading: "جارٍ احتساب الربحية…", empty: "لا مشاريع نشطة ضمن نطاقك.", mixed: "مشاريع بعملات مختلفة: لا يُعرض إجمالي واحد.", unavailable: "مشاريع تعذر احتسابها", none: "لا لقطة سابقة", open: "فتح" },
  en: { title: "Project profitability", note: "Losing or loss-bound projects first. Movement is since the last monthly snapshot.", project: "Project", fpac: "Forecast profit (FPAC)", movement: "Movement", total: "Total forecast profit", loading: "Calculating profitability…", empty: "No active projects in your scope.", mixed: "Projects use different currencies: no single total is shown.", unavailable: "Projects that could not be calculated", none: "No earlier snapshot", open: "Open" }, ur: { title: "Project profitability", note: "Losing or loss-bound projects first. Movement is since the last monthly snapshot.", project: "Project", fpac: "Forecast profit (FPAC)", movement: "Movement", total: "Total forecast profit", loading: "Calculating profitability…", empty: "No active projects in your scope.", mixed: "Projects use different currencies: no single total is shown.", unavailable: "Projects that could not be calculated", none: "No earlier snapshot", open: "Open" },
};

export function PortfolioProfitability({ tenantId }: { tenantId: string }) {
  const { isArabic, language } = useLanguage();
  const t = pickLanguage(language, text);
  const query = trpc.profitability.portfolio.useQuery({ tenantId });
  const projects = query.data?.projects ?? [];
  // The "Open" link column is navigation, not data, so it is not exported.
  const exportColumns: ExportColumn<(typeof projects)[number]>[] = [
    { header: t.project, value: project => `${project.code} · ${project.name}`, kind: "text" },
    // Money is exported in the company's base currency (the riyal, V1): the export header names it.
    { header: t.fpac, value: project => project.fpac, kind: "money" },
    { header: t.movement, value: project => project.movement, kind: "money" },
  ];
  return (
    <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200" aria-label={t.title}>
      <div className="flex items-center gap-3"><TrendingUp className="text-[#0e6b70]" /><div><h2 className="font-semibold">{t.title}</h2><p className="text-xs text-slate-500">{t.note}</p></div></div>
      {query.isLoading && <p role="status" className="mt-3 text-sm text-slate-500">{t.loading}</p>}
      {query.error && <p role="alert" className="mt-3 text-sm text-red-700">{getLocalizedProjectError(query.error, isArabic)}</p>}
      {query.data && (
        <div className="mt-3">
          <div className="flex justify-end">
            <ExportExcelButton fileName="portfolio-profitability" sheetName={t.title} title={t.title} rows={projects} columns={exportColumns} />
          </div>
          {query.data.projects.length === 0 && query.data.unavailable.length === 0 ? <p className="text-sm text-slate-500">{t.empty}</p> : (
            <table className="w-full text-sm">
              <thead><tr className="text-xs text-slate-500"><th className="py-1 text-start">{t.project}</th><th className="text-start">{t.fpac}</th><th className="text-start">{t.movement}</th><th><span className="sr-only">{pickLanguage(language, { ar: "فتح", en: "Open", ur: "کھولیں" })}</span></th></tr></thead>
              <tbody>
                {query.data.projects.map(project => {
                  const tr = project.movement === null ? null : trend(project.movement);
                  return (
                    <tr key={project.projectId} className="border-t" data-testid="portfolio-row">
                      <td className="py-1.5">{project.code} · {project.name}</td>
                      <td className={project.fpac < 0 ? "font-bold text-red-700" : "font-semibold text-emerald-700"}>{formatMoney(project.fpac, project.currency, isArabic)}</td>
                      <td className={tr ? { good: "text-emerald-700", bad: "text-red-700", flat: "text-slate-600" }[tr.tone] : "text-xs text-slate-400"}>{tr && project.movement !== null ? `${tr.arrow} ${formatMoney(project.movement, project.currency, isArabic)}` : t.none}</td>
                      <td><Link className="text-[#0e6b70] underline" href={`/projects/${tenantId}/${project.projectId}/profitability`}>{t.open}</Link></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          {query.data.total ? <p className="mt-3 text-sm">{t.total}: <b data-testid="portfolio-total">{query.data.total.currency ? formatMoney(query.data.total.fpac, query.data.total.currency, isArabic) : "—"}</b></p> : <p className="mt-3 text-sm text-amber-800">{t.mixed}</p>}
          {query.data.unavailable.length > 0 && <p className="mt-2 text-xs text-slate-600">{t.unavailable}: {query.data.unavailable.map(item => item.code).join("، ")}</p>}
        </div>
      )}
    </section>
  );
}
