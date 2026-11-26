// Q-4: the site engineer's progress update on the weights table (phone and computer). The activity is chosen from the weights table (its CSI section and weight
// shown), then the villas (a list, a range or a whole block), then the status and the date; one save. The server refuses the whole entry before writing anything
// when one villa is wrong and says which; after the save the villas' and the project's progress, computed from the weights, are shown at once, with the latest history.
import { ActivityNameToggle, hasEnglishNames, useActivityLabel, useActivityNameLanguage } from "@/lib/activityNames";
import React, { useCallback, useMemo, useState } from "react";
import { useParams } from "wouter";
import { Button, Card, CardBody, CardFooter, CardHeader, CardTitle, Field, Segmented, Select, SkeletonRows, TextInput, formatPercent, notify } from "@/components/ds";
import { FieldShell } from "@/components/FieldShell";
import { UndoLastSave } from "@/components/UndoLastSave";
import { OfflineQueuePanel } from "@/components/OfflineQueuePanel";
import { isNetworkError, type QueueItem, type SendResult } from "@/lib/offlineQueue";
import { issuesAsRejection, useOfflineQueue } from "@/lib/useOfflineQueue";
import { offlineReasons } from "@/lib/offlineReasons";
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
type Mode = "list" | "range" | "block" | "model";
type Issue = { code: string; villa?: string; detail?: string };

const copy = {
  ar: { modeModel: "نموذج كامل", model: "النموذج (مثل C أو A-End)", confirmMany: (n: number) => `سيُحدَّث ${n} فيلا دفعة واحدة. راجع النشاط والحالة والتاريخ ثم أكّد.`, confirmSave: (n: number) => `أكّد حفظ ${n} فيلا`, cancel: "إلغاء", keptOffline: "حُفظ على هذا الهاتف وسيُرسل عند عودة الاتصال.", notKept: "تعذّر الحفظ على الهاتف (مساحة ممتلئة أو محظورة). أعد الحفظ عند الاتصال.", title: "تحديث الإنجاز", back: "الإدخال الميداني", summary: "اختر النشاط من جدول الأوزان، ثم الفلل، ثم الحالة والتاريخ، واحفظ مرة واحدة.", statuses: { NOT_STARTED: "لم يبدأ", IN_PROGRESS: "جارٍ", COMPLETE: "مكتمل", UNDER_REVIEW: "قيد المراجعة" } as Record<string, string>, weight: "الوزن", result: "بعد الحفظ", villa: "فيلا", project: "نسبة المشروع", history: "آخر التحديثات", noHistory: "لا تحديثات بعد.", by: "بواسطة", tooMany: (max?: string) => `اختر ${max ?? ""} فيلا على الأكثر في المرة الواحدة.`, steps: ["البند", "الفلل", "الحالة"], ask: ["ما البند الذي تحدّثه؟", "أي الفلل؟", "ما الحالة؟"], stepsLabel: "خطوات التحديث" },
  en: { modeModel: "Whole model", model: "Model (e.g. C or A-End)", confirmMany: (n: number) => `${n} villas will be updated at once. Check the activity, the status and the date, then confirm.`, confirmSave: (n: number) => `Confirm saving ${n} villas`, cancel: "Cancel", keptOffline: "Kept on this phone; it will be sent when the connection returns.", notKept: "Could not keep it on this phone (storage full or blocked). Save again when online.", title: "Progress update", back: "Field entry", summary: "Choose the activity from the weights table, then the villas, then the status and the date, and save once.", statuses: { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", COMPLETE: "Complete", UNDER_REVIEW: "Under review" } as Record<string, string>, weight: "Weight", result: "After the save", villa: "Villa", project: "Project progress", history: "Latest updates", noHistory: "No updates yet.", by: "by", tooMany: (max?: string) => `Choose at most ${max ?? ""} villas at a time.`, steps: ["Item", "Villas", "Status"], ask: ["Which item are you updating?", "Which villas?", "What is the status?"], stepsLabel: "Update steps" },
  ur: { modeModel: "پورا ماڈل", model: "ماڈل (مثلاً C یا A-End)", confirmMany: (n: number) => `${n} ولاز ایک ساتھ اپ ڈیٹ ہوں گے۔ سرگرمی، حالت اور تاریخ دیکھ کر تصدیق کریں۔`, confirmSave: (n: number) => `${n} ولاز محفوظ کرنے کی تصدیق کریں`, cancel: "منسوخ", keptOffline: "اس فون پر محفوظ ہو گیا؛ کنکشن واپس آنے پر بھیجا جائے گا۔", notKept: "فون پر محفوظ نہ ہو سکا (اسٹوریج بھرا یا بند)۔ کنکشن پر دوبارہ محفوظ کریں۔", title: "پیش رفت کی تازہ کاری", back: "فیلڈ اندراج", summary: "وزن کی جدول سے سرگرمی منتخب کریں، پھر ولاز، پھر حالت اور تاریخ، اور ایک بار محفوظ کریں۔", statuses: { NOT_STARTED: "شروع نہیں ہوا", IN_PROGRESS: "جاری", COMPLETE: "مکمل", UNDER_REVIEW: "زیر جائزہ" } as Record<string, string>, weight: "وزن", result: "محفوظ کرنے کے بعد", villa: "ولا", project: "منصوبے کی پیش رفت", history: "تازہ ترین اپڈیٹس", noHistory: "ابھی کوئی اپڈیٹ نہیں۔", by: "از", tooMany: (max?: string) => `ایک وقت میں زیادہ سے زیادہ ${max ?? ""} ولاز منتخب کریں۔`, steps: ["آئٹم", "ولاز", "حالت"], ask: ["آپ کون سا آئٹم اپڈیٹ کر رہے ہیں؟", "کون سے ولاز؟", "حالت کیا ہے؟"], stepsLabel: "اپڈیٹ کے مراحل" },
};

export default function PmcProgressUpdate() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { language } = useLanguage();
  const t = pickLanguage(language, wo22Text);
  const c = pickLanguage(language, copy);
  const scope = { tenantId, projectId };
  const enabled = Boolean(tenantId && projectId);
  const activities = trpc.pmc.progressActivities.useQuery(scope, { enabled });
  const [nameLanguage, setNameLanguage] = useActivityNameLanguage();
  const withEnglish = hasEnglishNames(activities.data);
  const activityLabel = useActivityLabel(nameLanguage, withEnglish);
  const history = trpc.pmc.progressHistory.useQuery({ ...scope, limit: 10 }, { enabled });
  const [search, setSearch] = useState("");
  const [activityCode, setActivityCode] = useState("");
  const [mode, setMode] = useState<Mode>("list");
  const [villas, setVillas] = useState("");
  const [range, setRange] = useState("");
  const [model, setModel] = useState("");
  // Q-60: above 100 villas the server asks for the count first; the screen shows it and the save is sent again carrying it
  const [confirmCount, setConfirmCount] = useState<number | null>(null);
  const [block, setBlock] = useState("");
  const [status, setStatus] = useState<Status>("COMPLETE");
  const [date, setDate] = useState(siteTodayInBrowser());
  const [issues, setIssues] = useState<Issue[]>([]);

  const weightOf = (item: { minWeight: number; maxWeight: number }) => item.minWeight === item.maxWeight ? formatPercent(item.minWeight, 2) : `${formatPercent(item.minWeight, 2)}–${formatPercent(item.maxWeight, 2)}`;
  const options = useMemo(() => {
    const needle = search.trim().toLowerCase();
    // Q-49: the search finds an activity by either of its names; the list shows the language chosen in the names switch
    return (activities.data ?? []).filter(item => !needle || `${item.code} ${item.name} ${item.nameEn ?? ""} ${item.section} ${item.sectionEn ?? ""}`.toLowerCase().includes(needle))
      .map(item => ({ value: item.code, label: activityLabel(item), description: `${activityLabel({ name: item.section, nameEn: item.sectionEn }, false)} · ${c.weight} ${weightOf(item)}` }));
  }, [activities.data, search, c.weight, activityLabel]);

  const [lastSave, setLastSave] = useState<{ batchId: string; at: number; undone: boolean } | null>(null);
  // Q-24 (P-120): a save that cannot reach the server is kept on this phone (with the moment it was kept) and sent when the connection returns; the server
  // answers a resend of the same identifier with its first answer, and refuses — naming the villas — an entry kept before a newer save of the same villa
  const me = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const client = trpc.useUtils().client;
  const send = useCallback(async (item: QueueItem): Promise<SendResult> => {
    try { await client.pmc.updateProgress.mutate({ ...item.payload, clientRequestId: item.id } as never); }
    catch (error) { const rejected = issuesAsRejection(error); if (rejected) return rejected; throw error; }
  }, [client]);
  const queue = useOfflineQueue(me.data?.id ? `${me.data.id}:${tenantId}:${projectId}:pmcProgress` : null, send);
  const update = trpc.pmc.updateProgress.useMutation({
    onSuccess: result => { setIssues([]); setConfirmCount(null); setLastSave({ batchId: result.batchId, at: Date.now(), undone: false }); notify.success(t.update.saved(result.changed, result.unchanged)); setVillas(""); setRange(""); void history.refetch(); },
    onError: (error, variables) => {
      if (isNetworkError(error) && variables.clientRequestId) {
        const kept = queue.keep({ id: variables.clientRequestId, kind: "pmcProgress", payload: { ...variables, queuedAt: new Date().toISOString() }, summary: `${variables.activityCode} · ${c.statuses[variables.status] ?? variables.status} · ${variables.villas?.join(", ") ?? variables.range ?? variables.blockCode ?? variables.modelCode ?? ""}` });
        if (kept) { setIssues([]); notify.success(c.keptOffline); setVillas(""); setRange(""); } else notify.error(c.notKept);
        return;
      }
      const found = issuesOf(error); const ask = found.find(issue => issue.code === "SITE_CONFIRM_COUNT"); if (ask) { setIssues([]); setConfirmCount(Number(ask.detail)); return; } setIssues(found); if (!found.length) notify.error(getLocalizedProjectError(error, language));
    },
  });
  const undo = trpc.pmc.undoProgressBatch.useMutation({ onSuccess: () => { setLastSave(current => current ? { ...current, undone: true } : current); void history.refetch(); } });
  const submit = (confirmed?: number) => update.mutate({ ...scope, clientRequestId: crypto.randomUUID(), activityCode, status, date, ...(confirmed ? { confirmCount: confirmed } : {}), ...(mode === "list" ? { villas: villas.split(/[,،;\s]+/).filter(Boolean) } : mode === "range" ? { range: range.trim() } : mode === "model" ? { modelCode: model.trim() } : { blockCode: block.trim() }) });
  const villasGiven = mode === "list" ? villas.trim() !== "" : mode === "range" ? range.trim() !== "" : mode === "model" ? model.trim() !== "" : block.trim() !== "";
  const stepsDone = !activityCode ? 0 : !villasGiven ? 1 : 2;
  const ask = (index: number) => <h2 className="text-base font-bold">{c.ask[index]}</h2>;
  const reason = (issue: Issue) => issue.code === "SITE_TOO_MANY_VILLAS" ? c.tooMany(issue.detail) : (t.issues[issue.code] ?? (() => issue.code))(issue.villa, issue.detail);

  return (
    <FieldShell title={c.title} backHref={`/m/${tenantId}/${projectId}`} backLabel={c.back} tenantId={tenantId} projectId={projectId} current="progress" header={<>
      {/* Q-54: the dark band and three steps of the reference «تحديث الإنجاز 390»; the steps fill as the form is filled, nothing is hidden */}
      <div data-progress-steps className="mt-2">
        <p className="text-sm text-hero-foreground/75">{c.summary}</p>
        <ol aria-label={c.stepsLabel} className="mt-3 grid grid-cols-3 gap-2">{c.steps.map((label, index) => { const done = stepsDone > index; const current = stepsDone === index; return <li key={label} aria-current={current ? "step" : undefined} className="flex flex-col gap-1.5"><span className={`h-1 rounded-full ${done || current ? "bg-sidebar-mark" : "bg-hero-foreground/20"}`} /><span className={`text-xs ${current ? "font-bold text-hero-foreground" : "text-hero-foreground/75"}`}>{label}</span></li>; })}</ol>
      </div>
      </>}>
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 pb-24">
      <OfflineQueuePanel identityError={me.error} items={queue.items} online={queue.online} flushing={queue.flushing} onFlush={() => void queue.flush()} onDiscard={queue.discard} reason={item => offlineReasons(item.error, t.issues, language)} language={language} />
      <WriteGate permission="project.pmc.update" projectId={projectId} reason={{ ar: wo22Text.ar.noUpdatePermission, en: wo22Text.en.noUpdatePermission, ur: wo22Text.ur.noUpdatePermission }}>
        <Card>
          <CardBody className="flex flex-col gap-4">
            {ask(0)}
            <SourceNotice query={activities} isArabic={language === "ar"} title={t.update.activity} />
            {activities.isLoading ? <SkeletonRows rows={3} /> : (
              <>
                {withEnglish && <ActivityNameToggle value={nameLanguage} onChange={setNameLanguage} />}
                <Field label={t.update.activitySearch} optional>{props => <TextInput {...props} value={search} onChange={event => setSearch(event.target.value)} />}</Field>
                <Field label={t.update.activity} required hint={activities.data && activities.data.length === 0 ? t.noActivities : undefined}>{props => <Select id={props.id} aria-describedby={props["aria-describedby"]} options={options} value={activityCode} onValueChange={setActivityCode} placeholder={t.update.activity} disabled={!options.length} />}</Field>
              </>
            )}
            <div className="border-t border-border" />{ask(1)}
            <Segmented label={t.update.villasMode} value={mode} onValueChange={value => setMode(value as Mode)} options={[{ value: "list", label: t.update.modeList }, { value: "range", label: t.update.modeRange }, { value: "block", label: t.update.modeBlock }, { value: "model", label: c.modeModel }]} />
            {mode === "list" && <Field label={t.update.villas} hint={t.update.villasHint} required>{props => <TextInput {...props} inputMode="numeric" dir="ltr" value={villas} onChange={event => setVillas(event.target.value)} />}</Field>}
            {mode === "range" && <Field label={t.update.range} hint={t.update.rangeHint} required>{props => <TextInput {...props} inputMode="numeric" dir="ltr" value={range} onChange={event => setRange(event.target.value)} />}</Field>}
            {mode === "block" && <Field label={t.update.block} required>{props => <TextInput {...props} dir="ltr" value={block} onChange={event => setBlock(event.target.value)} />}</Field>}
            {mode === "model" && <Field label={c.model} required>{props => <TextInput {...props} dir="ltr" value={model} onChange={event => setModel(event.target.value)} />}</Field>}
            <div className="border-t border-border" />{ask(2)}
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
          <CardFooter className="sticky bottom-0 flex flex-col gap-2 bg-card pb-[max(1rem,env(safe-area-inset-bottom))]">
            {confirmCount !== null ? (
              <div role="alertdialog" aria-label={c.confirmSave(confirmCount)} data-confirm-count={confirmCount} className="flex w-full flex-col gap-2 rounded-md border border-warning bg-warning-soft p-3 text-sm text-warning-soft-foreground">
                <p>{c.confirmMany(confirmCount)}</p>
                <div className="flex gap-2"><Button size="lg" className="min-h-12 flex-1" loading={update.isPending} onClick={() => submit(confirmCount)}>{c.confirmSave(confirmCount)}</Button><Button size="lg" variant="secondary" className="min-h-12" onClick={() => setConfirmCount(null)}>{c.cancel}</Button></div>
              </div>
            ) : <Button size="lg" className="min-h-14 w-full rounded-[14px] bg-hero text-hero-foreground hover:bg-hero/90" loading={update.isPending} disabled={!activityCode} onClick={() => submit()}>{t.update.save}</Button>}
          </CardFooter>
        </Card>
      </WriteGate>
      {lastSave && <UndoLastSave savedAt={lastSave.at} undone={lastSave.undone} pending={undo.isPending} error={undo.error ? getLocalizedProjectError(undo.error, language) : null} onUndo={() => undo.mutate({ ...scope, batchId: lastSave.batchId })} />}
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
