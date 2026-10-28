// Work order 22: the three percentages (site, consultant, monthly report) and the differences between them, for the project and by zone or block.
// One read (pmcSite.percentages); shown in the PMC page, the site ↔ consultant screen and the levels.
import { Badge, Card, CardBody, CardHeader, CardTitle, DataTable, Segmented, SkeletonRows, formatPercent, type BadgeTone } from "@/components/ds";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { trpc } from "@/lib/trpc";
import { wo22Text } from "@/lib/wo22Text";
import React, { useState } from "react";

type Shares = { units: number; site: number; consultant: number; monthly: number; siteMinusConsultant: number; siteMinusMonthly: number; consultantMinusMonthly: number };

/** A difference in points: positive means the first source is ahead. Two points or more is worth a look. */
export function differenceTone(points: number): BadgeTone { const size = Math.abs(points); return size < 0.5 ? "neutral" : size < 2 ? "info" : "warning"; }
const signed = (points: number) => `${points > 0 ? "+" : ""}${formatPercent(points)}`;

export function SourcePercentages({ tenantId, projectId, levels = true }: { tenantId: string; projectId: string; levels?: boolean }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, wo22Text);
  const query = trpc.pmcSite.percentages.useQuery({ tenantId, projectId }, { enabled: Boolean(tenantId && projectId) });
  const [level, setLevel] = useState<"zone" | "block">("zone");
  if (query.isLoading) return <SkeletonRows rows={2} />;
  if (!query.data) return null;
  const { project, byZone, byBlock, readiness } = query.data;
  const kpis: Array<{ key: string; label: string; value: number }> = [
    { key: "site", label: t.sources.site, value: project.site * 100 },
    { key: "consultant", label: t.sources.consultant, value: project.consultant * 100 },
    { key: "monthly", label: t.sources.monthly, value: project.monthly * 100 },
  ];
  const diffs = [
    { key: "sc", label: t.siteMinusConsultant, value: project.siteMinusConsultant * 100 },
    { key: "sm", label: t.siteMinusMonthly, value: project.siteMinusMonthly * 100 },
    { key: "cm", label: t.consultantMinusMonthly, value: project.consultantMinusMonthly * 100 },
  ];
  const rows = (level === "zone" ? byZone : byBlock).map((row: Shares & { key: string }) => ({ ...row }));
  return (
    <div className="flex flex-col gap-4" data-testid="source-percentages">
      {readiness.siteActivities > 0 && readiness.confirmedLinks === 0 && <p className="text-sm text-muted-foreground">{t.readinessLinks}</p>}
      {readiness.unlinkedColumns > 0 && <p className="text-sm text-muted-foreground">{t.readinessColumns(readiness.unlinkedColumns)}</p>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {kpis.map(kpi => (
          <Card key={kpi.key} as="div"><CardBody className="flex flex-col gap-1"><span className="text-sm text-muted-foreground">{kpi.label}</span><span className="text-2xl font-semibold tabular-nums" data-testid={`percent-${kpi.key}`}>{formatPercent(kpi.value)}</span></CardBody></Card>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">{diffs.map(diff => <Badge key={diff.key} tone={differenceTone(diff.value)}>{diff.label}: <span className="tabular-nums" dir="ltr">{signed(diff.value)}</span></Badge>)}</div>
      {levels && (
        <Card>
          <CardHeader className="flex-row items-center justify-between gap-2"><CardTitle>{level === "zone" ? t.byZone : t.byBlock}</CardTitle><Segmented label={t.byZone} value={level} onValueChange={value => setLevel(value as "zone" | "block")} options={[{ value: "zone", label: t.byZone }, { value: "block", label: t.byBlock }]} /></CardHeader>
          <DataTable caption={level === "zone" ? t.byZone : t.byBlock} rowKey={row => String(row.key)} rows={rows} columns={[
            { key: "key", header: level === "zone" ? t.columns.zone : t.columns.block },
            { key: "units", header: t.units, numeric: true },
            { key: "site", header: t.sources.site, numeric: true, render: row => formatPercent(row.site * 100) },
            { key: "consultant", header: t.sources.consultant, numeric: true, render: row => formatPercent(row.consultant * 100) },
            { key: "monthly", header: t.sources.monthly, numeric: true, render: row => formatPercent(row.monthly * 100) },
            { key: "siteMinusConsultant", header: t.siteMinusConsultant, numeric: true, render: row => <Badge tone={differenceTone(row.siteMinusConsultant * 100)}><span dir="ltr">{signed(row.siteMinusConsultant * 100)}</span></Badge> },
          ]} />
        </Card>
      )}
    </div>
  );
}
