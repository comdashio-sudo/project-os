// Q-5: the QC engineer's receipts (phone and computer): the activity from the weights table, the villas (a list, a range or a whole block), «received» or «not
// received» and the date; one save. Kept apart from the site's progress. The server refuses the whole entry before writing anything when one villa is wrong and
// says which; a villa received while not complete on site is saved and named. Counters per activity, and the latest history.
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

const ANSWERS = ["received", "notReceived"] as const;
type Answer = (typeof ANSWERS)[number];
type Mode = "list" | "range" | "block";
type Issue = { code: string; villa?: string; detail?: string };

const copy = {
  ar: { title: "استلام QC", back: "الإدخال الميداني", summary: "اختر النشاط، ثم الفلل، ثم «مستلم» أو «غير مستلم» والتاريخ، واحفظ مرة واحدة. حالة QC منفصلة عن حالة الموقع.", answers: { received: "مستلم", notReceived: "غير مستلم" } as Record<string, string>, answer: "حالة QC", weight: "الوزن", counters: "العدّاد لكل نشاط", villa: "فيلا", history: "آخر التحديثات", noHistory: "لا تحديثات بعد.", by: "بواسطة", notComplete: "استُلمت وهي غير مكتملة في الموقع لهذا البند:", tooMany: (max?: string) => `اختر ${max ?? ""} فيلا على الأكثر في المرة الواحدة.` },
  en: { title: "QC receipt", back: "Field entry", summary: "Choose the activity, then the villas, then «received» or «not received» and the date, and save once. The QC state is separate from the site's.", answers: { received: "Received", notReceived: "Not received" } as Record<string, string>, answer: "QC state", weight: "Weight", counters: "Counters per activity", villa: "Villa", history: "Latest updates", noHistory: "No updates yet.", by: "by", notComplete: "Received while not complete on site for this activity:", tooMany: (max?: string) => `Choose at most ${max ?? ""} villas at a time.` },
  ur: { title: "کیو سی وصولی", back: "فیلڈ اندراج", summary: "سرگرمی منتخب کریں، پھر ولاز، پھر «وصول شدہ» یا «وصول نہیں ہوا» اور تاریخ، اور ایک بار محفوظ کریں۔ کیو سی کی حالت سائٹ سے الگ ہے۔", answers: { received: "وصول شدہ", notReceived: "وصول نہیں ہوا" } as Record<string, string>, answer: "کیو سی کی حالت", weight: "وزن", counters: "ہر سرگرمی کا شمار", villa: "ولا", history: "تازہ ترین اپڈیٹس", noHistory: "ابھی کوئی اپڈیٹ نہیں۔", by: "از", notComplete: "سائٹ پر اس سرگرمی کے لیے مکمل نہ ہوتے ہوئے وصول کیا گیا:", tooMany: (max?: string) => `ایک وقت میں زیادہ سے زیادہ ${max ?? ""} ولاز منتخب کریں۔` },
};

export default function PmcQcReceipt() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { language } = useLanguage();
  const t = pickLanguage(language, wo22Text);
  const c = pickLanguage(language, copy);
  const scope = { tenantId, projectId };
  const enabled = Boolean(tenantId && projectId);
  const activities = trpc.pmc.progressActivities.useQuery(scope, { enabled });
  const history = trpc.pmc.qcHistory.useQuery({ ...scope, limit: 10 }, { enabled });
  const counters = trpc.pmc.qcCounters.useQuery(scope, { enabled });
  const [search, setSearch] = useState("");
  const [activityCode, setActivityCode] = useState("");
  const [mode, setMode] = useState<Mode>("list");
  const [villas, setVillas] = useState("");
  const [range, setRange] = useState("");
  const [block, setBlock] = useState("");
  const [answer, setAnswer] = useState<Answer>("received");
  const [date, setDate] = useState(siteTodayInBrowser());
  const [issues, setIssues] = useState<Issue[]>([]);

  const weightOf = (item: { minWeight: number; maxWeight: number }) => item.minWeight === item.maxWeight ? formatPercent(item.minWeight, 2) : `${formatPercent(item.minWeight, 2)}–${formatPercent(item.maxWeight, 2)}`;
  const options = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (activities.data ?? []).filter(item => !needle || `${item.code} ${item.name} ${item.section}`.toLowerCase().includes(needle))
      .map(item => ({ value: item.code, label: item.name, description: `${item.section} · ${c.weight} ${weightOf(item)}` }));
  }, [activities.data, search, c.weight]);

  const update = trpc.pmc.updateQcReceipts.useMutation({
    onSuccess: result => { setIssues([]); notify.success(t.update.saved(result.changed, result.unchanged)); setVillas(""); setRange(""); void history.refetch(); void counters.refetch(); },
    onError: error => { const found = issuesOf(error); setIssues(found); if (!found.length) notify.error(getLocalizedProjectError(error, language)); },
  });
  const submit = () => update.mutate({ ...scope, activityCode, received: answer === "received", date, ...(mode === "list" ? { villas: villas.split(/[,،;\s]+/).filter(Boolean) } : mode === "range" ? { range: range.trim() } : { blockCode: block.trim() }) });
  const reason = (issue: Issue) => issue.code === "SITE_TOO_MANY_VILLAS" ? c.tooMany(issue.detail) : (t.issues[issue.code] ?? (() => issue.code))(issue.villa, issue.detail);

  return (
    <FieldShell title={c.title} backHref={`/m/${tenantId}/${projectId}`} backLabel={c.back} tenantId={tenantId} projectId={projectId} current="qc">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 pb-24">
      <p className="text-sm text-muted-foreground">{c.summary}</p>
      <WriteGate permission="project.qc.receive" projectId={projectId} reason={{ ar: wo22Text.ar.noUpdatePermission, en: wo22Text.en.noUpdatePermission, ur: wo22Text.ur.noUpdatePermission }}>
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
            <Segmented label={c.answer} value={answer} onValueChange={value => setAnswer(value as Answer)} options={ANSWERS.map(value => ({ value, label: c.answers[value] }))} />
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
      {update.data && update.data.warnings.length > 0 && (
        <p role="status" className="rounded-md border border-warning p-3 text-sm" data-qc-warning>{c.notComplete} <bdi dir="ltr">{update.data.warnings.flatMap(warning => warning.villas).join(", ")}</bdi></p>
      )}
      <Card>
        <CardHeader><CardTitle>{c.counters}</CardTitle></CardHeader>
        <CardBody>
          <SourceNotice query={counters} isArabic={language === "ar"} title={c.counters} />
          <ul className="flex flex-col gap-2 text-sm" data-qc-counters>{(counters.data ?? []).map(row => (
            <li key={row.code} className="flex flex-wrap justify-between gap-2"><span>{row.name}</span><span><span className="text-success">{c.answers.received}: <bdi dir="ltr">{row.received}</bdi></span> · <span className="text-muted-foreground">{c.answers.notReceived}: <bdi dir="ltr">{row.notReceived}</bdi></span></span></li>
          ))}</ul>
        </CardBody>
      </Card>
      <Card>
        <CardHeader><CardTitle>{c.history}</CardTitle></CardHeader>
        <CardBody>
          <SourceNotice query={history} isArabic={language === "ar"} title={c.history} />
          {history.data && history.data.length === 0 ? <p className="text-sm text-muted-foreground">{c.noHistory}</p> : (
            <ul className="flex flex-col gap-2 text-sm" data-qc-history>{(history.data ?? []).map((row, index) => (
              <li key={index}><span className="font-medium">{c.villa} <bdi dir="ltr">{row.villaLabel ?? row.unitNumber}</bdi></span> · {row.activityName} · {row.from === null ? "—" : c.answers[row.from ? "received" : "notReceived"]} {language === "en" ? "→" : "←"} {c.answers[row.to ? "received" : "notReceived"]} · <bdi dir="ltr">{row.on}</bdi>{row.by ? <> · {c.by} {row.by}</> : null}</li>
            ))}</ul>
          )}
        </CardBody>
      </Card>
      </div>
    </FieldShell>
  );
}
