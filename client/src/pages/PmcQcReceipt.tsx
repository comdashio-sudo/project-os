// Q-5: the QC engineer's receipts (phone and computer): the activity from the weights table, the villas (a list, a range or a whole block), «received» or «not
// received» and the date; one save. Kept apart from the site's progress. The server refuses the whole entry before writing anything when one villa is wrong and
// says which; a villa received while not complete on site is saved and named. Counters per activity, and the latest history.
import { ActivityNameToggle, hasEnglishNames, useActivityLabel, useActivityNameLanguage } from "@/lib/activityNames";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "wouter";
import { Button, Card, CardBody, CardFooter, CardHeader, CardTitle, Field, Segmented, SkeletonRows, TextInput, formatPercent, notify } from "@/components/ds";
import { SearchCombobox, type ComboOption } from "@/components/SearchCombobox";
import { SelectionSummaryNote, VillaPicker, emptyChoice } from "@/components/VillaPicker";
import { readRecentActivities, rememberActivity, summarizeSelection, villasOf, type VillaChoice } from "@/lib/villaPicker";
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

const ANSWERS = ["received", "notReceived"] as const;
type Answer = (typeof ANSWERS)[number];
type Issue = { code: string; villa?: string; detail?: string };

const copy = {
  ar: { keptOffline: "حُفظ على هذا الهاتف وسيُرسل عند عودة الاتصال.", notKept: "تعذّر الحفظ على الهاتف (مساحة ممتلئة أو محظورة). أعد الحفظ عند الاتصال.", title: "استلام QC", back: "الإدخال الميداني", summary: "اختر النشاط، ثم الفلل، ثم «مستلم» أو «غير مستلم» والتاريخ، واحفظ مرة واحدة. حالة QC منفصلة عن حالة الموقع.", answers: { received: "مستلم", notReceived: "غير مستلم" } as Record<string, string>, answer: "حالة QC", weight: "الوزن", counters: "العدّاد لكل نشاط", villa: "فيلا", history: "آخر التحديثات", noHistory: "لا تحديثات بعد.", by: "بواسطة", notComplete: "استُلمت وهي غير مكتملة في الموقع لهذا البند:", tooMany: (max?: string) => `اختر ${max ?? ""} فيلا على الأكثر في المرة الواحدة.` },
  en: { keptOffline: "Kept on this phone; it will be sent when the connection returns.", notKept: "Could not keep it on this phone (storage full or blocked). Save again when online.", title: "QC receipt", back: "Field entry", summary: "Choose the activity, then the villas, then «received» or «not received» and the date, and save once. The QC state is separate from the site's.", answers: { received: "Received", notReceived: "Not received" } as Record<string, string>, answer: "QC state", weight: "Weight", counters: "Counters per activity", villa: "Villa", history: "Latest updates", noHistory: "No updates yet.", by: "by", notComplete: "Received while not complete on site for this activity:", tooMany: (max?: string) => `Choose at most ${max ?? ""} villas at a time.` },
  ur: { keptOffline: "اس فون پر محفوظ ہو گیا؛ کنکشن واپس آنے پر بھیجا جائے گا۔", notKept: "فون پر محفوظ نہ ہو سکا (اسٹوریج بھرا یا بند)۔ کنکشن پر دوبارہ محفوظ کریں۔", title: "کیو سی وصولی", back: "فیلڈ اندراج", summary: "سرگرمی منتخب کریں، پھر ولاز، پھر «وصول شدہ» یا «وصول نہیں ہوا» اور تاریخ، اور ایک بار محفوظ کریں۔ کیو سی کی حالت سائٹ سے الگ ہے۔", answers: { received: "وصول شدہ", notReceived: "وصول نہیں ہوا" } as Record<string, string>, answer: "کیو سی کی حالت", weight: "وزن", counters: "ہر سرگرمی کا شمار", villa: "ولا", history: "تازہ ترین اپڈیٹس", noHistory: "ابھی کوئی اپڈیٹ نہیں۔", by: "از", notComplete: "سائٹ پر اس سرگرمی کے لیے مکمل نہ ہوتے ہوئے وصول کیا گیا:", tooMany: (max?: string) => `ایک وقت میں زیادہ سے زیادہ ${max ?? ""} ولاز منتخب کریں۔` },
};

export default function PmcQcReceipt() {
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
  const history = trpc.pmc.qcHistory.useQuery({ ...scope, limit: 10 }, { enabled });
  const counters = trpc.pmc.qcCounters.useQuery(scope, { enabled });
  const [activityCode, setActivityCode] = useState("");
  // Q-67 (5): the same choice of villas as the progress update — from the project's own phases, blocks, models and villas
  const [choice, setChoice] = useState<VillaChoice>(emptyChoice("block"));
  const picker = trpc.pmc.progressPicker.useQuery({ ...scope, ...(activityCode ? { activityCode } : {}) }, { enabled, placeholderData: previous => previous });
  useEffect(() => { if (picker.data?.phases.length && choice.mode === "block" && !choice.blocks.length) setChoice(emptyChoice("phase")); }, [picker.data?.phases.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [recent, setRecent] = useState<string[]>(() => readRecentActivities(projectId));
  const [answer, setAnswer] = useState<Answer>("received");
  const [date, setDate] = useState(siteTodayInBrowser());
  const [issues, setIssues] = useState<Issue[]>([]);

  const weightOf = (item: { minWeight: number; maxWeight: number }) => item.minWeight === item.maxWeight ? formatPercent(item.minWeight, 2) : `${formatPercent(item.minWeight, 2)}–${formatPercent(item.maxWeight, 2)}`;
  // Q-67 (5): the same searchable list of items as the progress update (by code, either name or part of a word; grouped by section; last used first)
  const options = useMemo<ComboOption[]>(() => (activities.data ?? [])
    .map(item => ({ value: item.code, code: item.code, label: activityLabel(item), group: `${item.sectionCode} — ${activityLabel({ name: item.section, nameEn: item.sectionEn }, false)}`, description: `${c.weight} ${weightOf(item)}`, keywords: `${item.name} ${item.nameEn ?? ""} ${item.section} ${item.sectionEn ?? ""}` })),
  [activities.data, c.weight, activityLabel]);
  const activityModels = useMemo(() => (activities.data ?? []).find(item => item.code === activityCode)?.models ?? null, [activities.data, activityCode]);
  // a receipt moves no site status back: the summary names the chosen villas and those the item does not apply to
  const summary = useMemo(() => summarizeSelection(villasOf(picker.data?.villas ?? [], choice), activityCode ? activityModels : null, "COMPLETE"), [picker.data?.villas, choice, activityCode, activityModels]);
  const chooseActivity = (code: string) => { setActivityCode(code); setRecent(rememberActivity(projectId, code)); };
  const describeVillas = (villas: string[]) => villas.length > 6 ? `${villas.slice(0, 6).join(", ")} … (${villas.length})` : villas.join(", ");

  const [lastSave, setLastSave] = useState<{ batchId: string; at: number; undone: boolean } | null>(null);
  // Q-24 (P-120): kept on this phone when the server cannot be reached, sent when the connection returns; a receipt kept before a newer one is refused, villa named
  const me = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const client = trpc.useUtils().client;
  const send = useCallback(async (item: QueueItem): Promise<SendResult> => {
    try { await client.pmc.updateQcReceipts.mutate({ ...item.payload, clientRequestId: item.id } as never); }
    catch (error) { const rejected = issuesAsRejection(error); if (rejected) return rejected; throw error; }
  }, [client]);
  const queue = useOfflineQueue(me.data?.id ? `${me.data.id}:${tenantId}:${projectId}:qcReceipt` : null, send);
  const update = trpc.pmc.updateQcReceipts.useMutation({
    onSuccess: result => { setIssues([]); setLastSave({ batchId: result.batchId, at: Date.now(), undone: false }); notify.success(t.update.saved(result.changed, result.unchanged)); setChoice(emptyChoice(choice.mode)); void history.refetch(); void counters.refetch(); },
    onError: (error, variables) => {
      if (isNetworkError(error) && variables.clientRequestId) {
        const kept = queue.keep({ id: variables.clientRequestId, kind: "qcReceipt", payload: { ...variables, queuedAt: new Date().toISOString() }, summary: `${variables.activityCode} · ${variables.received ? "✓" : "✗"} · ${describeVillas(variables.villas ?? [])}` });
        if (kept) { setIssues([]); notify.success(c.keptOffline); setChoice(emptyChoice(choice.mode)); } else notify.error(c.notKept);
        return;
      }
      const found = issuesOf(error); setIssues(found); if (!found.length) notify.error(getLocalizedProjectError(error, language));
    },
  });
  const undo = trpc.pmc.undoQcReceiptBatch.useMutation({ onSuccess: () => { setLastSave(current => current ? { ...current, undone: true } : current); void history.refetch(); } });
  const submit = () => update.mutate({ ...scope, clientRequestId: crypto.randomUUID(), activityCode, received: answer === "received", date, villas: summary.applicable });
  const reason = (issue: Issue) => issue.code === "SITE_TOO_MANY_VILLAS" ? c.tooMany(issue.detail) : (t.issues[issue.code] ?? (() => issue.code))(issue.villa, issue.detail);

  return (
    <FieldShell title={c.title} backHref={`/m/${tenantId}/${projectId}`} backLabel={c.back} tenantId={tenantId} projectId={projectId} current="qc">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-4 pb-24">
      <p className="text-sm text-muted-foreground">{c.summary}</p>
      <OfflineQueuePanel identityError={me.error} items={queue.items} online={queue.online} flushing={queue.flushing} onFlush={() => void queue.flush()} onDiscard={queue.discard} reason={item => offlineReasons(item.error, t.issues, language)} language={language} />
      <WriteGate permission="project.qc.receive" projectId={projectId} reason={{ ar: wo22Text.ar.noUpdatePermission, en: wo22Text.en.noUpdatePermission, ur: wo22Text.ur.noUpdatePermission }}>
        <Card>
          <CardBody className="flex flex-col gap-4">
            <SourceNotice query={activities} isArabic={language === "ar"} title={t.update.activity} />
            {activities.isLoading ? <SkeletonRows rows={3} /> : (
              <>
                {withEnglish && <ActivityNameToggle value={nameLanguage} onChange={setNameLanguage} />}
                <Field label={t.update.activity} required hint={activities.data && activities.data.length === 0 ? t.noActivities : undefined}>{props => <SearchCombobox id={props.id} data-combobox="activity" aria-describedby={props["aria-describedby"]} options={options} value={activityCode} onChange={chooseActivity} recent={recent} placeholder={t.update.activity} disabled={!options.length} />}</Field>
              </>
            )}
            <SourceNotice query={picker} isArabic={language === "ar"} title={t.update.villas} />
            {picker.isLoading ? <SkeletonRows rows={2} /> : picker.data ? <VillaPicker data={picker.data} choice={choice} onChoice={setChoice} /> : null}
            <Segmented label={c.answer} value={answer} onValueChange={value => setAnswer(value as Answer)} options={ANSWERS.map(value => ({ value, label: c.answers[value] }))} />
            <Field label={t.update.date} required>{props => <TextInput {...props} type="date" dir="ltr" max={siteTodayInBrowser()} value={date} onChange={event => setDate(event.target.value)} />}</Field>
            <SelectionSummaryNote summary={summary} />
            {issues.length > 0 && (
              <div role="alert" className="rounded-md border border-destructive p-3 text-sm">
                <p className="font-semibold text-destructive">{t.update.issuesTitle}</p>
                <ul className="mt-2 list-disc ps-5">{issues.map((issue, index) => <li key={`${issue.code}-${issue.villa ?? ""}-${index}`}>{reason(issue)}</li>)}</ul>
              </div>
            )}
          </CardBody>
          {/* the save stays at the bottom of the screen on a phone, as in the owner's own tool */}
          <CardFooter className="sticky bottom-0 bg-card"><Button size="lg" className="w-full" loading={update.isPending} disabled={!activityCode || !summary.applicable.length} onClick={submit}>{t.update.save}</Button></CardFooter>
        </Card>
      </WriteGate>
      {lastSave && <UndoLastSave savedAt={lastSave.at} undone={lastSave.undone} pending={undo.isPending} error={undo.error ? getLocalizedProjectError(undo.error, language) : null} onUndo={() => undo.mutate({ ...scope, batchId: lastSave.batchId })} />}
      {update.data && update.data.warnings.length > 0 && (
        <p role="status" className="rounded-md border border-warning p-3 text-sm" data-qc-warning>{c.notComplete} <bdi dir="ltr">{update.data.warnings.flatMap(warning => warning.villas).join(", ")}</bdi></p>
      )}
      <Card>
        <CardHeader><CardTitle>{c.counters}</CardTitle></CardHeader>
        <CardBody>
          <SourceNotice query={counters} isArabic={language === "ar"} title={c.counters} />
          <ul className="flex flex-col gap-2 text-sm" data-qc-counters>{(counters.data ?? []).map(row => (
            <li key={row.code} className="flex flex-wrap justify-between gap-2"><span>{activityLabel(row)}</span><span><span className="text-success">{c.answers.received}: <bdi dir="ltr">{row.received}</bdi></span> · <span className="text-muted-foreground">{c.answers.notReceived}: <bdi dir="ltr">{row.notReceived}</bdi></span></span></li>
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
