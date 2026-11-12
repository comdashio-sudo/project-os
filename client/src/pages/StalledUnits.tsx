// Q-14 (a): the project's stalled villas — started, not complete, and no progress or QC movement for more than the project's threshold of WORKING days
// (3 by default; over 14 is long-stalled). Sorted by days, filtered by block, model and last activity; each villa opens its card. The threshold is the
// project's own and only a PMC manager may change it (the server refuses anyone else).
import React, { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, Select, TextInput } from "@/components/ds";
import { PageHeader, PageMain } from "@/components/pageFrame";
import { SourceNotice } from "@/components/SectionResilience";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { WriteGate } from "@/lib/permissions";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";

const ALL = "__all";
const text = {
  ar: { title: "الوحدات المتوقفة", intro: "الفلل التي بدأ العمل فيها ولم تكتمل، ولم يتحرك فيها إنجاز ولا QC منذ أكثر من الحد بأيام العمل (لا تُحسب العطل).", stalled: "متوقفة", long: "متوقفة طويلًا", active: "نشطة", block: "البلوك", model: "النموذج", lastActivity: "آخر بند تحرّك", all: "الكل", villa: "فيلا", days: "أيام عمل", lastMoved: "آخر حركة", next: "البند التالي", threshold: "حد التوقف (أيام عمل)", save: "حفظ الحد", saved: "حُفظ الحد.", none: "لا وحدات متوقفة بهذا التصفية.", showActive: "أظهر النشطة أيضًا" },
  en: { title: "Stalled units", intro: "Villas where work has started, not complete, with no progress or QC movement for more than the threshold in working days (days off are not counted).", stalled: "Stalled", long: "Long stalled", active: "Active", block: "Block", model: "Model", lastActivity: "Last activity moved", all: "All", villa: "Villa", days: "working days", lastMoved: "Last movement", next: "Next activity", threshold: "Stall threshold (working days)", save: "Save the threshold", saved: "The threshold was saved.", none: "No stalled units with this filter.", showActive: "Show the active ones too" },
  ur: { title: "رکی ہوئی یونٹس", intro: "وہ ولاز جن پر کام شروع ہوا، مکمل نہیں، اور حد سے زیادہ کام کے دنوں سے کوئی پیش رفت یا کیو سی نہیں (چھٹیاں شمار نہیں)۔", stalled: "رکی ہوئی", long: "طویل عرصے سے رکی ہوئی", active: "فعال", block: "بلاک", model: "ماڈل", lastActivity: "آخری متحرک سرگرمی", all: "سب", villa: "ولا", days: "کام کے دن", lastMoved: "آخری حرکت", next: "اگلی سرگرمی", threshold: "رکاوٹ کی حد (کام کے دن)", save: "حد محفوظ کریں", saved: "حد محفوظ ہو گئی۔", none: "اس فلٹر کے ساتھ کوئی رکی ہوئی یونٹ نہیں۔", showActive: "فعال بھی دکھائیں" },
};

export default function StalledUnits() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { language, isArabic } = useLanguage();
  const t = pickLanguage(language, text);
  const scope = { tenantId, projectId };
  const query = trpc.pmc.stalledUnits.useQuery(scope, { enabled: Boolean(tenantId && projectId) });
  const [block, setBlock] = useState(ALL); const [model, setModel] = useState(ALL); const [activity, setActivity] = useState(ALL); const [showActive, setShowActive] = useState(false);
  const [threshold, setThreshold] = useState("");
  const save = trpc.pmc.setStallThreshold.useMutation({ onSuccess: () => void query.refetch() });
  const rows = query.data?.rows ?? [];
  const options = (values: string[]) => [{ value: ALL, label: t.all }, ...Array.from(new Set(values.filter(Boolean))).sort().map(value => ({ value, label: value }))];
  const shown = useMemo(() => rows.filter(row => (showActive || row.state !== "active") && (block === ALL || row.blockCode === block) && (model === ALL || row.modelCode === model) && (activity === ALL || row.lastActivity?.code === activity)), [rows, block, model, activity, showActive]);
  const stateLabel = (state: string) => (state === "long" ? t.long : state === "stalled" ? t.stalled : t.active);

  return (
    <PageMain className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 md:p-6">
      <PageHeader><h1 className="text-2xl font-semibold">{t.title}</h1><p className="mt-1 text-sm text-muted-foreground">{t.intro}</p></PageHeader>
      <SourceNotice query={query} isArabic={isArabic} title={t.title} />
      {query.data && (
        <div className="flex flex-wrap gap-2" data-stall-counts>
          <Badge tone="danger">{t.long}: <bdi dir="ltr">{query.data.counts.long}</bdi></Badge>
          <Badge tone="warning">{t.stalled}: <bdi dir="ltr">{query.data.counts.stalled}</bdi></Badge>
          <Badge tone="success">{t.active}: <bdi dir="ltr">{query.data.counts.active}</bdi></Badge>
        </div>
      )}
      <Card>
        <CardBody className="grid gap-3 sm:grid-cols-3">
          <Field label={t.block}>{props => <Select id={props.id} options={options(rows.map(row => row.blockCode))} value={block} onValueChange={setBlock} />}</Field>
          <Field label={t.model}>{props => <Select id={props.id} options={options(rows.map(row => row.modelCode))} value={model} onValueChange={setModel} />}</Field>
          <Field label={t.lastActivity}>{props => <Select id={props.id} options={options(rows.map(row => row.lastActivity?.code ?? ""))} value={activity} onValueChange={setActivity} />}</Field>
          <label className="flex min-h-11 items-center gap-2 text-sm sm:col-span-3"><input type="checkbox" className="h-5 w-5" checked={showActive} onChange={event => setShowActive(event.target.checked)} />{t.showActive}</label>
        </CardBody>
      </Card>
      <ul className="flex flex-col gap-2" data-stall-rows>
        {shown.map(row => (
          <li key={row.unitId}>
            <Link href={`/m/${tenantId}/${projectId}/unit/${encodeURIComponent(row.villa)}`} className="flex min-h-11 flex-wrap items-center justify-between gap-2 rounded-[var(--radius)] border border-border bg-card p-3 hover:bg-muted">
              <span className="font-medium">{t.villa} <bdi dir="ltr">{row.villa}</bdi> · {row.blockCode} · {row.modelCode}</span>
              <Badge tone={row.state === "long" ? "danger" : row.state === "stalled" ? "warning" : "success"}>{stateLabel(row.state)} · <bdi dir="ltr">{row.workingDays}</bdi> {t.days}</Badge>
              <span className="w-full text-xs text-muted-foreground">{t.lastMoved}: <bdi dir="ltr">{row.lastMovedOn}</bdi>{row.lastActivity ? <> · {t.lastActivity}: {row.lastActivity.name}</> : null}{row.nextActivity ? <> · {t.next}: {row.nextActivity.name}</> : null}</span>
            </Link>
          </li>
        ))}
        {query.data && shown.length === 0 && <li className="rounded-[var(--radius)] border border-dashed p-6 text-center text-sm text-muted-foreground">{t.none}</li>}
      </ul>
      <WriteGate permission="project.pmc.manage" projectId={projectId}>
        <Card>
          <CardHeader><CardTitle>{t.threshold}</CardTitle></CardHeader>
          <CardBody className="flex flex-wrap items-end gap-3">
            <Field label={t.threshold}>{props => <TextInput {...props} type="number" inputMode="numeric" dir="ltr" min={1} max={60} value={threshold || String(query.data?.threshold ?? "")} onChange={event => setThreshold(event.target.value)} />}</Field>
            <Button loading={save.isPending} onClick={() => save.mutate({ ...scope, thresholdDays: Number(threshold || query.data?.threshold) })}>{t.save}</Button>
            {save.error && <p role="alert" className="text-sm text-destructive">{getLocalizedProjectError(save.error, language)}</p>}
            {save.isSuccess && <p role="status" className="text-sm text-success">{t.saved}</p>}
          </CardBody>
        </Card>
      </WriteGate>
    </PageMain>
  );
}
