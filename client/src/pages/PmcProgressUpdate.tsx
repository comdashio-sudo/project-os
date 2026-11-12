// Q-4: the site engineer's progress update on the weights table (phone and computer). The activity is chosen from the weights table (its CSI section and weight
// shown), then the villas (a list, a range or a whole block), then the status and the date; one save. The server refuses the whole entry before writing anything
// when one villa is wrong and says which; after the save the villas' and the project's progress, computed from the weights, are shown at once, with the latest history.
import React, { useMemo, useState } from "react";
import { useParams } from "wouter";
import { Button, Card, CardBody, CardFooter, CardHeader, CardTitle, Field, Segmented, Select, SkeletonRows, TextInput, formatPercent, notify } from "@/components/ds";
import { FieldShell } from "@/components/FieldShell";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { WriteGate } from "@/lib/permissions";
import { SourceNotice } from "@/components/SectionResilience";
import { trpc } from "@/lib/trpc";
import { wo22Text } from "@/lib/wo22Text";
import { issuesOf, siteTodayInBrowser } from "./PmcSiteUpdate";

const STATUSES = ["NOT_STARTED", "IN_PROGRESS", "COMPLETE"] as const;
type Status = (typeof STATUSES)[number];
type Mode = "list" | "range" | "block";
type Issue = { code: string; villa?: string; detail?: string };

const copy = {
  ar: { title: "تحديث الإنجاز", back: "الإدخال الميداني", summary: "اختر النشاط من جدول الأوزان، ثم الفلل، ثم الحالة والتاريخ، واحفظ مرة واحدة.", statuses: { NOT_STARTED: "لم يبدأ", IN_PROGRESS: "جارٍ", COMPLETE: "مكتمل", UNDER_REVIEW: "قيد المراجعة" } as Record<string, string>, weight: "الوزن", result: "بعد الحفظ", villa: "فيلا", project: "نسبة المشروع", history: "آخر التحديثات", noHistory: "لا تحديثات بعد.", by: "بواسطة", tooMany: (max?: string) => `اختر ${max ?? ""} فيلا على الأكثر في المرة الواحدة.` },
  en: { title: "Progress update", back: "Field entry", summary: "Choose the activity from the weights table, then the villas, then the status and the date, and save once.", statuses: { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", COMPLETE: "Complete", UNDER_REVIEW: "Under review" } as Record<string, string>, weight: "Weight", result: "After the save", villa: "Villa", project: "Project progress", history: "Latest updates", noHistory: "No updates yet.", by: "by", tooMany: (max?: string) => `Choose at most ${max ?? ""} villas at a time.` },
  ur: { title: "پیش رفت کی تازہ کاری", back: "فیلڈ اندراج", summary: "وزن کی جدول سے سرگرمی منتخب کریں، پھر ولاز، پھر حالت اور تاریخ، اور ایک بار محفوظ کریں۔", statuses: { NOT_STARTED: "شروع نہیں ہوا", IN_PROGRESS: "جاری", COMPLETE: "مکمل", UNDER_REVIEW: "زیر جائزہ" } as Record<string, string>, weight: "وزن", result: "محفوظ کرنے کے بعد", villa: "ولا", project: "منصوبے کی پیش رفت", history: "تازہ ترین اپڈیٹس", noHistory: "ابھی کوئی اپڈیٹ نہیں۔", by: "از", tooMany: (max?: string) => `ایک وقت میں زیادہ سے زیادہ ${max ?? ""} ولاز منتخب کریں۔` },
};

export default function PmcProgressUpdate() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { language } = useLanguage();
  const t = pickLanguage(language, wo22Text);
  const c = pickLanguage(language, copy);
  const scope = { tenantId, projectId };
  const enabled = Boolean(tenantId && projectId);
  const activities = trpc.pmc.progressActivities.useQuery(scope, { enabled });
  const history = trpc.pmc.progressHistory.useQuery({ ...scope, limit: 10 }, { enabled });
  const [search, setSearch] = useState("");
  const [activityCode, setActivityCode] = useState("");
  const [mode, setMode] = useState<Mode>("list");
  const [villas, setVillas] = useState("");
  const [range, setRange] = useState("");
  const [block, setBlock] = useState("");
  const [status, setStatus] = useState<Status>("COMPLETE");
  const [date, setDate] = useState(siteTodayInBrowser());
  const [issues, setIssues] = useState<Issue[]>([]);

  const weightOf = (item: { minWeight: number; maxWeight: number }) => item.minWeight === item.maxWeight ? formatPercent(item.minWeight, 2) : `${formatPercent(item.minWeight, 2)}–${formatPercent(item.maxWeight, 2)}`;
  const options = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (activities.data ?? []).filter(item => !needle || `${item.code} ${item.name} ${item.section}`.toLowerCase().includes(needle))
      .map(item => ({ value: item.code, label: item.name, description: `${item.section} · ${c.weight} ${weightOf(item)}` }));
  }, [activities.data, search, c.weight]);

  const update = trpc.pmc.updateProgress.useMutation({
    onSuccess: result => { setIssues([]); notify.success(t.update.saved(result.changed, result.unchanged)); setVillas(""); setRange(""); void history.refetch(); },
    onError: error => { const found = issuesOf(error); setIssues(found); if (!found.length) notify.error(getLocalizedProjectError(error, language)); },
  });
  const submit = () => update.mutate({ ...scope, activityCode, status, date, ...(mode === "list" ? { villas: villas.split(/[,،;\s]+/).filter(Boolean) } : mode === "range" ? { range: range.trim() } : { blockCode: block.trim() }) });
  const reason = (issue: Issue) => issue.code === "SITE_TOO_MANY_VILLAS" ? c.tooMany(issue.detail) : (t.issues[issue.code] ?? (() => issue.code))(issue.villa, issue.detail);

  return (
    <FieldShell title={c.title} backHref={`/m/${tenantId}/${projectId}`} backLabel={c.back} tenantId={tenantId} projectId={projectId} current="progress">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 pb-24">
      <p className="text-sm text-muted-foreground">{c.summary}</p>
      <WriteGate permission="project.pmc.update" projectId={projectId} reason={{ ar: wo22Text.ar.noUpdatePermission, en: wo22Text.en.noUpdatePermission, ur: wo22Text.ur.noUpdatePermission }}>
        <Card>
          <CardBody className="flex flex-col gap-4">
            <SourceNotice query={activities} isArabic={language === "ar"} title={t.update.activity} />
            {activities.isLoading ? <SkeletonRows rows={3} /> : (
              <>
                <Field label={t.update.activitySearch} optional>{props => <TextInput {...props} value={search} onChange={event => setSearch(event.target.value)} />}</Field>
                <Field label={t.update.activity} required hint={activities.data && activities.data.length === 0 ? t.noActivities : undefined}>{props => <Select id={props.id} aria-describedby={props["aria-describedby"]} options={options} value={activityCode} onValueChange={setActivityCode} placeholder={t.update.activity} disabled={!options.length} />}</Field>
              </>
            )}
            <Segmented label={t.update.villasMode} value={mode} onValueChange={value => setMode(value as Mode)} options={[{ value: "list", label: t.update.modeList }, { value: "range", label: t.update.modeRange }, { value: "block", label: t.update.modeBlock }]} />
            {mode === "list" && <Field label={t.update.villas} hint={t.update.villasHint} required>{props => <TextInput {...props} inputMode="numeric" dir="ltr" value={villas} onChange={event => setVillas(event.target.value)} />}</Field>}
            {mode === "range" && <Field label={t.update.range} hint={t.update.rangeHint} required>{props => <TextInput {...props} inputMode="numeric" dir="ltr" value={range} onChange={event => setRange(event.target.value)} />}</Field>}
            {mode === "block" && <Field label={t.update.block} required>{props => <TextInput {...props} dir="ltr" value={block} onChange={event => setBlock(event.target.value)} />}</Field>}
            <Segmented label={t.update.status} value={status} onValueChange={value => setStatus(value as Status)} options={STATUSES.map(value => ({ value, label: c.statuses[value] }))} />
            <Field label={t.update.date} required>{props => <TextInput {...props} type="date" dir="ltr" max={siteTodayInBrowser()} value={date} onChange={event => setDate(event.target.value)} />}</Field>
            {issues.length > 0 && (
              <div role="alert" className="rounded-md border border-destructive p-3 text-sm">
                <p className="font-semibold text-destructive">{t.update.issuesTitle}</p>
                <ul className="mt-2 list-disc ps-5">{issues.map((issue, index) => <li key={`${issue.code}-${issue.villa ?? ""}-${index}`}>{reason(issue)}</li>)}</ul>
              </div>
            )}
          </CardBody>
          {/* the save stays at the bottom of the screen on a phone, as in the owner's own tool */}
          <CardFooter className="sticky bottom-0 bg-card"><Button size="lg" className="w-full" loading={update.isPending} disabled={!activityCode} onClick={submit}>{t.update.save}</Button></CardFooter>
        </Card>
      </WriteGate>
      {update.data && (
        <Card data-progress-result>
          <CardHeader><CardTitle>{c.result}</CardTitle></CardHeader>
          <CardBody className="flex flex-col gap-2 text-sm">
            <p className="font-semibold">{c.project}: <bdi dir="ltr">{update.data.projectProgressPercent === null ? "—" : formatPercent(update.data.projectProgressPercent, 2)}</bdi></p>
            <ul className="flex flex-wrap gap-2">{update.data.villas.map(item => <li key={item.villa} className="rounded-md border border-border px-2 py-1">{c.villa} <bdi dir="ltr">{item.villa}</bdi>: <bdi dir="ltr">{item.progressPercent === null ? "—" : formatPercent(item.progressPercent, 2)}</bdi></li>)}</ul>
          </CardBody>
        </Card>
      )}
      <Card>
        <CardHeader><CardTitle>{c.history}</CardTitle></CardHeader>
        <CardBody>
          <SourceNotice query={history} isArabic={language === "ar"} title={c.history} />
          {history.data && history.data.length === 0 ? <p className="text-sm text-muted-foreground">{c.noHistory}</p> : (
            <ul className="flex flex-col gap-2 text-sm" data-progress-history>{(history.data ?? []).map((row, index) => (
              <li key={index}><span className="font-medium">{c.villa} <bdi dir="ltr">{row.villaLabel ?? row.unitNumber}</bdi></span> · {row.activityName} · {row.from ? c.statuses[row.from] ?? row.from : "—"} {language === "en" ? "→" : "←"} {c.statuses[row.to] ?? row.to} · <bdi dir="ltr">{new Date(row.at).toISOString().slice(0, 10)}</bdi>{row.by ? <> · {c.by} {row.by}</> : null}</li>
            ))}</ul>
          )}
        </CardBody>
      </Card>
      </div>
    </FieldShell>
  );
}
