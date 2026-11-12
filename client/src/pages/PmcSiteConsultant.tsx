// Work order 22: «المقارنة: الموقع ↔ الاستشاري» — replaces the weekly Excel comparison. The summary by section, the differences of both kinds with their age and the site's note,
// an action on one difference or on a selection («أنشئ طلب فحص» / «حدّث حالة الموقع»), the one-time matching (site ↔ report activities, consultant columns whose WIR differs),
// the planned-against-actual S-curve, and the two Excel exports (the comparison with the old file's columns, and the monthly report in the shape sent to the consultant).
import React, { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { Badge, Button, Card, CardBody, CardFooter, CardHeader, CardTitle, Checkbox, DataTable, EmptyState, Field, PageIntro, Segmented, Select, SkeletonRows, TextInput, formatNumber, formatPercent, notify } from "@/components/ds";
import { SourcePercentages } from "@/components/pmc/SourcePercentages";
import { PageMain } from "@/components/pageFrame";
import { SourceNotice } from "@/components/SectionResilience";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { WriteGate, useCan } from "@/lib/permissions";
import { trpc } from "@/lib/trpc";
import { wo22Text, type Wo22Text } from "@/lib/wo22Text";
import { siteTodayInBrowser } from "./PmcSiteUpdate";

type Scope = { tenantId: string; projectId: string };
type Kind = "site_done_not_received" | "received_not_done";
const PAGE = 200;
/** Said where a manage-only button would have been, instead of hiding it in silence. */
const MANAGE_REASON = { ar: wo22Text.ar.noManagePermission, en: wo22Text.en.noManagePermission, ur: wo22Text.ur.noManagePermission };
/** The ds Select cannot hold an empty value, so «all» has its own. */
const ALL = "__all";
const fromSelect = (value: string) => (value === ALL ? "" : value);
const toSelect = (value: string) => value || ALL;
const keyOf = (row: { unitId: string; activityCode: string }) => `${row.unitId}|${row.activityCode}`;

/** Which selected differences an action may act on: an inspection request for what the site finished, a site update for what the consultant already has. */
export function itemsForAction<T extends { unitId: string; activityCode: string; kind: Kind | null }>(rows: T[], selected: Set<string>, action: "create_inspection" | "update_site") {
  const wanted: Kind = action === "create_inspection" ? "site_done_not_received" : "received_not_done";
  return rows.filter(row => selected.has(keyOf(row)) && row.kind === wanted).map(row => ({ unitId: row.unitId, activityCode: row.activityCode }));
}

function downloadBase64(file: { fileName: string; base64: string }) {
  const bytes = Uint8Array.from(window.atob(file.base64), value => value.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const link = document.createElement("a"); link.href = url; link.download = file.fileName; link.click(); URL.revokeObjectURL(url);
}

export default function PmcSiteConsultant() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { language } = useLanguage();
  const t = pickLanguage(language, wo22Text);
  // «?tab=matching» opens the Matching tab directly (the readiness hints elsewhere link here)
  const [tab, setTab] = useState(() => { const asked = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("tab"); return asked && ["compare", "matching", "curve", "exports"].includes(asked) ? asked : "compare"; });
  const scope = { tenantId, projectId };
  return (
    // inside the product frame the frame owns the one <main> (and the one toast host, in App): the page is a plain block there
    <PageMain className="mx-auto flex w-full max-w-7xl flex-col gap-5 p-4 sm:p-6">
      <PageIntro title={t.title} summary={t.summary} actions={<Link href={`/m/${tenantId}/${projectId}/site-update`}><Button variant="secondary">{t.goToUpdate}</Button></Link>} />
      <SourcePercentages {...scope} onOpenMatching={() => setTab("matching")} />
      <Segmented label={t.title} layout="grid" columns={4} value={tab} onValueChange={setTab} options={[{ value: "compare", label: t.tabs.compare }, { value: "matching", label: t.tabs.matching }, { value: "curve", label: t.tabs.curve }, { value: "exports", label: t.tabs.exports }]} />
      {tab === "compare" && <Comparison scope={scope} t={t} />}
      {tab === "matching" && <Matching scope={scope} t={t} />}
      {tab === "curve" && <Curve scope={scope} t={t} />}
      {tab === "exports" && <Exports scope={scope} t={t} />}
    </PageMain>
  );
}

function Comparison({ scope, t }: { scope: Scope; t: Wo22Text }) {
  const { language } = useLanguage();
  const [kind, setKind] = useState<"" | Kind>("");
  const [zone, setZone] = useState(""); const [block, setBlock] = useState(""); const [section, setSection] = useState(""); const [villa, setVilla] = useState("");
  const [limit, setLimit] = useState(PAGE);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [notes, setNotes] = useState<Record<string, string>>({});
  const filter = { ...scope, ...(kind ? { kind } : {}), ...(zone ? { zone } : {}), ...(block ? { block } : {}), ...(section ? { section } : {}), ...(villa.trim() ? { villa: villa.trim() } : {}), limit };
  const query = trpc.pmcSite.comparison.useQuery(filter, { enabled: Boolean(scope.tenantId && scope.projectId) });
  const percentages = trpc.pmcSite.percentages.useQuery(scope, { enabled: Boolean(scope.tenantId && scope.projectId) });
  const utils = trpc.useUtils();
  const mayAct = useCan("project.pmc.update", scope.projectId);
  const refresh = () => Promise.all([utils.pmcSite.comparison.invalidate(), utils.pmcSite.percentages.invalidate(scope)]);
  const act = trpc.pmcSite.act.useMutation({
    onSuccess: result => { setSelected(new Set()); notify.success(result.action === "create_inspection" ? t.requestsCreated(result.requests.length) : t.actionDone(result.items)); void refresh(); },
    onError: error => notify.error(getLocalizedProjectError(error, language)),
  });
  const saveNote = trpc.pmcSite.saveNote.useMutation({ onSuccess: () => { notify.success(t.noteSaved); void utils.pmcSite.comparison.invalidate(); }, onError: error => notify.error(getLocalizedProjectError(error, language)) });

  const rows = query.data?.rows ?? [];
  const withAll = (label: string, values: string[]) => [{ value: ALL, label: `${label}: ${t.all}` }, ...values.filter(Boolean).map(value => ({ value, label: value }))];
  const zones = useMemo(() => withAll(t.filterZone, (percentages.data?.byZone ?? []).map(row => row.key)), [percentages.data, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const blocks = useMemo(() => withAll(t.filterBlock, (percentages.data?.byBlock ?? []).map(row => row.key)), [percentages.data, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const sections = useMemo(() => withAll(t.filterSection, (query.data?.summary ?? []).map(row => row.section)), [query.data, t]); // eslint-disable-line react-hooks/exhaustive-deps
  const toggle = (key: string) => setSelected(current => { const next = new Set(current); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  const run = (action: "create_inspection" | "update_site") => { const items = itemsForAction(rows, selected, action); if (items.length) act.mutate({ ...scope, action, items, ...(action === "update_site" ? { date: siteTodayInBrowser() } : {}) }); else notify.info(t.actionOnlyKind); };
  const selectedRows = rows.filter(row => selected.has(keyOf(row)));
  const filtered = Boolean(kind || zone || block || section || villa.trim());
  const clearFilters = () => { setKind(""); setZone(""); setBlock(""); setSection(""); setVilla(""); setLimit(PAGE); };
  const canInspect = selectedRows.some(row => row.kind === "site_done_not_received");
  const canUpdate = selectedRows.some(row => row.kind === "received_not_done");

  return (
    <div className="flex flex-col gap-5">
      <SourceNotice query={query} isArabic={language === "ar"} title={t.listTitle} />
      <SourceNotice query={percentages} isArabic={language === "ar"} title={t.byZone} />
      <Card>
        <CardHeader><CardTitle>{t.summaryTitle}</CardTitle></CardHeader>
        {query.isLoading ? <CardBody><SkeletonRows rows={4} /></CardBody> : (
          <DataTable caption={t.summaryTitle} rowKey={row => String(row.section)} rows={(query.data?.summary ?? []).map(row => ({ ...row }))} columns={[
            { key: "section", header: t.section },
            { key: "compared", header: t.compared, numeric: true, render: row => formatNumber(row.compared) },
            { key: "bothDone", header: t.bothDone, numeric: true, render: row => formatNumber(row.bothDone) },
            { key: "siteDoneNotReceived", header: t.kinds.site_done_not_received, numeric: true, render: row => <Badge tone={row.siteDoneNotReceived ? "warning" : "neutral"}>{formatNumber(row.siteDoneNotReceived)}</Badge> },
            { key: "receivedNotDone", header: t.kinds.received_not_done, numeric: true, render: row => <Badge tone={row.receivedNotDone ? "danger" : "neutral"}>{formatNumber(row.receivedNotDone)}</Badge> },
            { key: "neither", header: t.neither, numeric: true, render: row => formatNumber(row.neither) },
          ]} />
        )}
      </Card>

      <Card>
        <CardHeader><CardTitle>{t.listTitle}</CardTitle></CardHeader>
        <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Select aria-label={t.filterKind} value={toSelect(kind)} onValueChange={value => { setKind(fromSelect(value) as "" | Kind); setLimit(PAGE); }} options={[{ value: ALL, label: `${t.filterKind}: ${t.all}` }, { value: "site_done_not_received", label: `${t.kinds.site_done_not_received} (${formatNumber(query.data?.totals.siteDoneNotReceived ?? 0)})` }, { value: "received_not_done", label: `${t.kinds.received_not_done} (${formatNumber(query.data?.totals.receivedNotDone ?? 0)})` }]} />
          <Select aria-label={t.filterZone} value={toSelect(zone)} onValueChange={value => { setZone(fromSelect(value)); setLimit(PAGE); }} options={zones} />
          <Select aria-label={t.filterBlock} value={toSelect(block)} onValueChange={value => { setBlock(fromSelect(value)); setLimit(PAGE); }} options={blocks} />
          <Select aria-label={t.filterSection} value={toSelect(section)} onValueChange={value => { setSection(fromSelect(value)); setLimit(PAGE); }} options={sections} />
          <TextInput aria-label={t.filterVilla} placeholder={t.filterVilla} inputMode="numeric" dir="ltr" value={villa} onChange={event => { setVilla(event.target.value); setLimit(PAGE); }} />
        </CardBody>
        {mayAct && (
          <CardBody className="flex flex-wrap items-center gap-2 border-t border-border">
            <span className="text-sm text-muted-foreground" aria-live="polite">{t.selected(selected.size)}</span>
            <Button variant="ghost" onClick={() => setSelected(new Set(rows.map(keyOf)))}>{t.selectAll}</Button>
            <Button variant="ghost" disabled={!selected.size} onClick={() => setSelected(new Set())}>{t.clearSelection}</Button>
            <Button disabled={!canInspect} loading={act.isPending && act.variables?.action === "create_inspection"} onClick={() => run("create_inspection")}>{t.createInspection}</Button>
            <Button variant="secondary" disabled={!canUpdate} loading={act.isPending && act.variables?.action === "update_site"} onClick={() => run("update_site")}>{t.updateSite}</Button>
          </CardBody>
        )}
        {query.isLoading ? <CardBody><SkeletonRows rows={6} /></CardBody> : (
          <DataTable caption={t.listTitle} rowKey={row => keyOf(row)} rows={rows.map(row => ({ ...row }))} empty={<EmptyState title={t.noDifferences} line={filtered ? t.noDifferencesLine : t.noDifferencesAll} action={filtered ? <Button variant="secondary" onClick={clearFilters}>{t.clearFilters}</Button> : <Link href={`/m/${scope.tenantId}/${scope.projectId}/site-update`}><Button variant="secondary">{t.goToUpdate}</Button></Link>} />} columns={[
            ...(mayAct ? [{ key: "pick", header: "", width: "3rem", render: (row: (typeof rows)[number]) => <Checkbox aria-label={`${row.villa} ${row.siteActivity}`} checked={selected.has(keyOf(row))} onCheckedChange={() => toggle(keyOf(row))} /> }] : []),
            { key: "zone", header: t.columns.zone },
            { key: "block", header: t.columns.block },
            { key: "villa", header: t.columns.villa, render: row => <span dir="ltr">{row.villa}</span> },
            { key: "modelCode", header: t.columns.model },
            { key: "wir", header: t.columns.wir, render: row => <span dir="ltr">{row.wir ?? ""}</span> },
            { key: "siteActivity", header: t.columns.siteActivity },
            { key: "consultantActivity", header: t.columns.consultantActivity },
            { key: "siteStatus", header: t.columns.siteStatus, render: row => (row.siteStatus ?? "").split(" · ").map(status => t.statuses[status] ?? status).join(" · ") },
            { key: "doneOn", header: t.columns.doneOn, render: row => <span dir="ltr">{row.doneOn ?? ""}</span> },
            { key: "consultantStatus", header: t.columns.consultant, render: row => row.consultantStatus === "NOT_RECEIVED" ? t.notReceived : t.received },
            { key: "kind", header: t.columns.result, render: row => row.kind ? <Badge tone={row.kind === "received_not_done" ? "danger" : "warning"}>{t.kinds[row.kind]}</Badge> : null },
            { key: "ageDays", header: t.columns.age, numeric: true, render: row => row.ageDays === null ? "" : t.days(row.ageDays) },
            { key: "note", header: t.columns.note, width: "14rem", render: row => {
              const key = keyOf(row); const value = notes[key] ?? row.note ?? "";
              return mayAct
                ? <TextInput aria-label={`${t.columns.note} ${row.villa}`} placeholder={t.notePlaceholder} value={value} onChange={event => setNotes(current => ({ ...current, [key]: event.target.value }))} onBlur={() => { if (value !== (row.note ?? "")) saveNote.mutate({ ...scope, unitId: row.unitId, activityCode: row.activityCode, note: value }); }} />
                : value;
            } },
          ]} />
        )}
        {query.data && (
          <CardFooter className="justify-between">
            <span className="text-sm text-muted-foreground">{t.shown(rows.length, query.data.total)}</span>
            {rows.length < query.data.total && <Button variant="secondary" onClick={() => setLimit(value => Math.min(value + PAGE, 2000))}>{t.showMore}</Button>}
          </CardFooter>
        )}
      </Card>
    </div>
  );
}

function Matching({ scope, t }: { scope: Scope; t: Wo22Text }) {
  const { language } = useLanguage();
  const site = trpc.pmcSite.activities.useQuery(scope);
  const catalog = trpc.pmcSite.catalog.useQuery(scope);
  const columns = trpc.pmcSite.consultantColumns.useQuery(scope);
  const utils = trpc.useUtils();
  const [choices, setChoices] = useState<Record<string, string>>({});
  const catalogOptions = useMemo(() => (catalog.data ?? []).map(item => ({ value: item.code, label: item.name, description: [item.section, item.wirCode ? `WIR ${item.wirCode}` : ""].filter(Boolean).join(" · ") })), [catalog.data]);
  const nameOf = useMemo(() => new Map((catalog.data ?? []).map(item => [item.code, item.name])), [catalog.data]);
  const confirm = trpc.pmcSite.confirmLinks.useMutation({ onSuccess: result => { notify.success(t.confirmDone(result.confirmed)); void Promise.all([utils.pmcSite.activities.invalidate(scope), utils.pmcSite.percentages.invalidate(scope), utils.pmcSite.comparison.invalidate()]); }, onError: error => notify.error(getLocalizedProjectError(error, language)) });
  const link = trpc.pmcSite.linkConsultantColumns.useMutation({ onSuccess: result => { setChoices({}); notify.success(t.linksSaved(result.linked)); void Promise.all([utils.pmcSite.consultantColumns.invalidate(scope), utils.pmcSite.percentages.invalidate(scope), utils.pmcSite.comparison.invalidate()]); }, onError: error => notify.error(getLocalizedProjectError(error, language)) });
  const suggested = (site.data ?? []).filter(item => item.links.length && item.links.every(linkItem => !linkItem.confirmed));
  const unlinked = (columns.data ?? []).filter(column => !column.activityCode);
  return (
    <div className="flex flex-col gap-5">
      <SourceNotice query={site} isArabic={language === "ar"} title={t.matchingSite} />
      <SourceNotice query={catalog} isArabic={language === "ar"} title={t.catalogActivities} />
      <SourceNotice query={columns} isArabic={language === "ar"} title={t.matchingWir} />
      <Card>
        <CardHeader><CardTitle>{t.matchingSite}</CardTitle><p className="text-sm text-muted-foreground">{t.matchingSiteLine}</p></CardHeader>
        {site.isLoading ? <CardBody><SkeletonRows rows={5} /></CardBody> : (
          <DataTable caption={t.matchingSite} rowKey={row => String(row.id)} rows={(site.data ?? []).map(row => ({ ...row }))} columns={[
            { key: "name", header: t.siteActivity, render: row => <div><div className="font-medium">{row.name}</div><div className="text-xs text-muted-foreground">{[row.csiName, row.subName].filter(Boolean).join(" · ")}</div></div> },
            { key: "weight", header: t.weight, numeric: true, render: row => formatPercent(row.weight * 100, 2) },
            { key: "links", header: t.catalogActivities, render: row => row.links.length ? row.links.map(item => nameOf.get(item.activityCode) ?? item.activityCode).join(" + ") : <span className="text-muted-foreground">{t.none}</span> },
            { key: "score", header: t.score, numeric: true, render: row => row.links[0]?.score === null || row.links[0]?.score === undefined ? "" : formatPercent(row.links[0].score * 100, 1) },
            { key: "state", header: "", render: row => row.links.length ? <Badge tone={row.links.every(item => item.confirmed) ? "success" : "info"}>{row.links.every(item => item.confirmed) ? t.confirmed : t.suggested}</Badge> : null },
          ]} />
        )}
        <WriteGate permission="project.pmc.manage" projectId={scope.projectId} reason={MANAGE_REASON}>
          <CardFooter><Button disabled={!suggested.length} loading={confirm.isPending} onClick={() => confirm.mutate({ ...scope, links: suggested.map(item => ({ siteActivityId: item.id, activityCodes: item.links.map(linkItem => linkItem.activityCode) })) })}>{t.confirmAll} ({formatNumber(suggested.length)})</Button></CardFooter>
        </WriteGate>
      </Card>

      <Card>
        <CardHeader><CardTitle>{t.matchingWir}</CardTitle><p className="text-sm text-muted-foreground">{t.matchingWirLine}</p></CardHeader>
        {columns.isLoading ? <CardBody><SkeletonRows rows={4} /></CardBody> : unlinked.length === 0 ? <CardBody><EmptyState title={t.allLinked} /></CardBody> : (
          <CardBody className="flex flex-col gap-3">
            {unlinked.map(column => (
              <Field key={column.id} label={`${column.activityName}${column.locationName ? ` — ${column.locationName}` : ""}${column.wirCode ? ` (WIR ${column.wirCode})` : ""}`} hint={column.sectionName ?? undefined}>
                {props => <Select id={props.id} aria-describedby={props["aria-describedby"]} options={catalogOptions} value={choices[column.id] ?? ""} onValueChange={value => setChoices(current => ({ ...current, [column.id]: value }))} placeholder={t.chooseActivity} />}
              </Field>
            ))}
          </CardBody>
        )}
        {unlinked.length > 0 && (
          <WriteGate permission="project.pmc.manage" projectId={scope.projectId} reason={MANAGE_REASON}>
            <CardFooter><Button disabled={!Object.values(choices).some(Boolean)} loading={link.isPending} onClick={() => link.mutate({ ...scope, links: Object.entries(choices).filter(([, code]) => code).map(([columnId, activityCode]) => ({ columnId, activityCode })) })}>{t.saveLinks}</Button></CardFooter>
          </WriteGate>
        )}
      </Card>
    </div>
  );
}

/** The S-curve's points as SVG coordinates: x by month index, y by the cumulative share (0 → bottom, 1 → top). */
export function curvePath(values: Array<number | null>, width: number, height: number): string {
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  let path = ""; let open = false;
  values.forEach((value, index) => { if (value === null) { open = false; return; } const x = index * step; const y = height - Math.max(0, Math.min(1, value)) * height; path += `${open ? "L" : "M"}${Math.round(x * 10) / 10},${Math.round(y * 10) / 10} `; open = true; });
  return path.trim();
}

function Curve({ scope, t }: { scope: Scope; t: Wo22Text }) {
  const { language } = useLanguage();
  const query = trpc.pmcSite.curve.useQuery(scope);
  if (query.isLoading) return <SkeletonRows rows={6} />;
  if (query.error) return <SourceNotice query={query} isArabic={language === "ar"} title={t.curveTitle} />;
  const points = query.data?.points ?? [];
  if (!points.length || points.every(point => point.plannedCumulative === null)) return <EmptyState title={t.noPlan} action={<Link href={`/projects/${scope.tenantId}/${scope.projectId}/pmc?tab=import`}><Button variant="secondary">{t.importSiteFile}</Button></Link>} />;
  const width = 720; const height = 260;
  const deviation = query.data?.deviationToDate ?? null;
  return (
    <Card>
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>{t.curveTitle}</CardTitle>
        {deviation !== null && <Badge tone={deviation < -0.02 ? "danger" : deviation < 0 ? "warning" : "success"}>{t.deviation}: <span dir="ltr">{`${deviation > 0 ? "+" : ""}${formatPercent(deviation * 100)}`}</span></Badge>}
      </CardHeader>
      <CardBody className="flex flex-col gap-4">
        {/* The axis labels are HTML beside the drawing, not SVG text: the drawing stretches to the card's width (390px or 1280px) while the labels keep the page's 12px. */}
        <figure className="m-0 flex flex-col gap-1" dir="ltr" data-testid="s-curve">
          <div className="flex gap-2">
            <div className="relative w-10 shrink-0 text-end text-xs tabular-nums text-muted-foreground" aria-hidden="true">
              {[1, 0.5, 0].map(share => <span key={share} className="absolute end-0 -translate-y-1/2 leading-none" style={{ top: `${(1 - share) * 100}%` }} data-testid={`axis-y-${share * 100}`}>{formatPercent(share * 100, 0)}</span>)}
            </div>
            <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={t.curveTitle} className="h-56 min-w-0 flex-1 overflow-visible sm:h-64">
              {[0, 0.5, 1].map(share => <line key={share} x1={0} y1={height - share * height} x2={width} y2={height - share * height} className="stroke-border" strokeWidth={share === 0 ? 1 : 0.5} vectorEffect="non-scaling-stroke" />)}
              <line x1={0} y1={0} x2={0} y2={height} className="stroke-border" strokeWidth={1} vectorEffect="non-scaling-stroke" />
              <path d={curvePath(points.map(point => point.plannedCumulative), width, height)} fill="none" className="stroke-foreground" strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
              <path d={curvePath(points.map(point => point.actualCumulative), width, height)} fill="none" className="stroke-primary" strokeWidth={3} vectorEffect="non-scaling-stroke" />
            </svg>
          </div>
          <div className="flex justify-between gap-2 ps-12 text-xs tabular-nums text-muted-foreground" aria-hidden="true">
            <span data-testid="axis-x-first">{points[0].month.slice(0, 7)}</span>
            {points.length > 1 && <span data-testid="axis-x-last">{points[points.length - 1].month.slice(0, 7)}</span>}
          </div>
        </figure>
        <div className="flex flex-wrap gap-4 text-sm"><span className="inline-flex items-center gap-2"><span className="inline-block h-0.5 w-6 border-t-2 border-dashed border-foreground" />{t.planned}</span><span className="inline-flex items-center gap-2"><span className="inline-block h-1 w-6 bg-primary" />{t.actual}</span></div>
        <DataTable caption={t.curveTitle} rowKey={row => String(row.month)} rows={points.map(point => ({ ...point }))} columns={[
          { key: "month", header: t.month, render: row => <span dir="ltr">{row.month.slice(0, 7)}</span> },
          { key: "plannedCumulative", header: t.planned, numeric: true, render: row => row.plannedCumulative === null ? "" : formatPercent(row.plannedCumulative * 100) },
          { key: "actualCumulative", header: t.actual, numeric: true, render: row => row.actualCumulative === null ? "" : formatPercent(row.actualCumulative * 100) },
          { key: "deviation", header: t.deviation, numeric: true, render: row => row.deviation === null ? "" : <span dir="ltr">{`${row.deviation > 0 ? "+" : ""}${formatPercent(row.deviation * 100)}`}</span> },
        ]} />
      </CardBody>
    </Card>
  );
}

function Exports({ scope, t }: { scope: Scope; t: Wo22Text }) {
  const { language } = useLanguage();
  const [source, setSource] = useState<"site" | "monthly">("site");
  const [reportDate, setReportDate] = useState(siteTodayInBrowser());
  const comparison = trpc.pmcSite.exportComparison.useMutation({ onSuccess: downloadBase64, onError: error => notify.error(getLocalizedProjectError(error, language)) });
  const monthly = trpc.pmcSite.exportMonthlyReport.useMutation({ onSuccess: downloadBase64, onError: error => notify.error(getLocalizedProjectError(error, language)) });
  const financial = trpc.pmcSite.canSeeFinancials.useQuery(scope);
  const earned = trpc.pmcSite.earnedValue.useQuery(scope, { enabled: financial.data === true });
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
      <SourceNotice query={financial} isArabic={language === "ar"} title={t.earnedValue} className="lg:col-span-2" />
      <SourceNotice query={earned} isArabic={language === "ar"} title={t.earnedValue} className="lg:col-span-2" />
      <Card>
        <CardHeader><CardTitle>{t.exportComparison}</CardTitle><p className="text-sm text-muted-foreground">{t.exportComparisonLine}</p></CardHeader>
        <CardFooter><Button loading={comparison.isPending} onClick={() => comparison.mutate({ ...scope, language })}>{t.download}</Button></CardFooter>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t.exportMonthly}</CardTitle><p className="text-sm text-muted-foreground">{t.exportMonthlyLine}</p></CardHeader>
        <CardBody className="flex flex-col gap-3">
          <Segmented label={t.exportMonthly} layout="grid" columns={2} value={source} onValueChange={value => setSource(value as "site" | "monthly")} options={[{ value: "site", label: t.fromSite }, { value: "monthly", label: t.fromMonthly }]} />
          <Field label={t.reportDate}>{props => <TextInput {...props} type="date" dir="ltr" value={reportDate} onChange={event => setReportDate(event.target.value)} />}</Field>
        </CardBody>
        <CardFooter><Button loading={monthly.isPending} onClick={() => monthly.mutate({ ...scope, source, ...(reportDate ? { reportDate } : {}) })}>{t.download}</Button></CardFooter>
      </Card>
      {financial.data === true && earned.data && (
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>{t.earnedValue}</CardTitle><p className="text-sm text-muted-foreground">{t.earnedLine}</p></CardHeader>
          <CardBody className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div><div className="text-sm text-muted-foreground">{t.contractValue}</div><div className="text-xl font-semibold tabular-nums" dir="ltr">{formatNumber(earned.data.total.contractValue, 2)} {t.currency}</div></div>
            <div><div className="text-sm text-muted-foreground">{t.earnedValue}</div><div className="text-xl font-semibold tabular-nums" dir="ltr">{formatNumber(earned.data.total.earnedValue, 2)} {t.currency}</div></div>
          </CardBody>
        </Card>
      )}
    </div>
  );
}
