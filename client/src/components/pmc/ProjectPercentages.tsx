// D-6: the three percentages (site, consultant, monthly report) and the differences between them, per project, for the company and portfolio levels. One read
// (pmcSite.percentagesByProject): only the projects this person may read PMC on, and only those with villas. Nothing to show: the section is left out.
import React from "react";
import { Link } from "wouter";
import { Badge, formatPercent } from "@/components/ds";
import { TableScroll } from "@/components/ds/TableScroll";
import { LevelSection } from "@/components/LevelDashboard";
import { SourceNotice } from "@/components/SectionResilience";
import { differenceTone } from "@/components/pmc/SourcePercentages";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { trpc } from "@/lib/trpc";
import { wo22Text } from "@/lib/wo22Text";

const signed = (points: number) => `${points > 0 ? "+" : ""}${formatPercent(points)}`;

export function ProjectPercentages({ tenantId, id }: { tenantId: string; id: string }) {
  const { language } = useLanguage(); const t = pickLanguage(language, wo22Text);
  const project = pickLanguage(language, { ar: "المشروع", en: "Project", ur: "پروجیکٹ" });
  const query = trpc.pmcSite.percentagesByProject.useQuery({ tenantId }, { enabled: Boolean(tenantId) });
  if (query.isSuccess && !query.data.length) return null;
  return (
    <LevelSection id={id} title={t.percentagesTitle}>
      <SourceNotice query={query} isArabic={language === "ar"} title={t.percentagesTitle} />
      {query.data?.length ? (
        <TableScroll label={t.percentagesTitle}>
          <table className="w-full min-w-[640px] text-sm" data-testid="project-percentages">
            <thead className="text-xs text-muted-foreground"><tr>
              <th scope="col" className="py-2 text-start">{project}</th>
              <th scope="col" className="py-2 text-start">{t.sources.site}</th><th scope="col" className="py-2 text-start">{t.sources.consultant}</th><th scope="col" className="py-2 text-start">{t.sources.monthly}</th>
              <th scope="col" className="py-2 text-start">{t.siteMinusConsultant}</th><th scope="col" className="py-2 text-start">{t.siteMinusMonthly}</th>
            </tr></thead>
            <tbody className="divide-y divide-border">{query.data.map(row => (
              <tr key={row.projectId}>
                <th scope="row" className="py-3 text-start font-medium"><Link href={`/levels/${tenantId}/projects/${row.projectId}`} className="inline-flex min-h-11 items-center hover:underline">{row.code} · {row.name}</Link></th>
                <td className="py-3">{formatPercent(row.site * 100)}</td><td className="py-3">{formatPercent(row.consultant * 100)}</td><td className="py-3">{formatPercent(row.monthly * 100)}</td>
                <td className="py-3"><Badge tone={differenceTone(row.siteMinusConsultant * 100)}>{signed(row.siteMinusConsultant * 100)}</Badge></td>
                <td className="py-3"><Badge tone={differenceTone(row.siteMinusMonthly * 100)}>{signed(row.siteMinusMonthly * 100)}</Badge></td>
              </tr>
            ))}</tbody>
          </table>
        </TableScroll>
      ) : null}
    </LevelSection>
  );
}
