import React, { useEffect, useState } from "react";
import { FileUp } from "lucide-react";
import { Button, FileDropzone, formatNumber } from "@/components/ds";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { useCan } from "@/lib/permissions";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { MAX_IMPORT_UPLOAD_BYTES, MAX_IMPORT_UPLOAD_MB, putToStorage, UploadFailure } from "@/lib/uploadLimit";
import { importModulePermissions } from "@shared/importPermissions";

// Q-61 (P6): the full Primavera import, on the screen. The file goes to Storage on a signed URL (never inside a request), the server counts in a rolled-back transaction
// what it would create, update and leave (WBS, activities, relationships, resources, codes), and confirming sends back the hash of exactly what was shown. A large file
// is written by a background job (#566): the card polls its progress until it is completed or says why it failed. It sits beside the general uploader, which keeps reading
// an .xer as a flat list of activities.
const ENTITIES = ["wbs", "activities", "relationships", "calendars", "resources", "assignments", "codeTypes", "codeValues", "codeAssignments"] as const;
type Entity = (typeof ENTITIES)[number];
type Counts = Record<string, { create: number; update: number; unchanged: number; absent: number }>;

const text = {
  ar: {
    title: "استيراد جدول Primavera (XER) كاملًا", help: "الهيكل والأنشطة والعلاقات والموارد والرموز والتقاويم، لا الأنشطة وحدها. يُحسب ما سيتغيّر ويُعرض قبل أي كتابة، وإعادة رفع نسخة أحدث تحدّث ولا تحذف.",
    choose: "ملف XER", analyze: "حلّل الملف", confirm: "أكّد الاستيراد", another: "ملف آخر", uploading: "جارٍ رفع الملف…", analyzing: "جارٍ تحليل الملف…", importing: "جارٍ الكتابة في الخلفية…",
    preview: "ما سيحدث", create: "جديد", update: "يُحدَّث", unchanged: "كما هو", problems: "مشاكل تمنع التأكيد", warnings: "ملاحظات", done: "اكتمل الاستيراد", failed: "فشل الاستيراد",
    progressFailed: "تعذّرت قراءة تقدّم الاستيراد. ما زال يعمل في الخلفية: افتح الصفحة بعد قليل وراجع سجل الاستيراد.", uploadFailed: "تعذّر رفع الملف إلى التخزين. تحقق من الاتصال وأعد المحاولة.", tooBig: `الملف أكبر من ${MAX_IMPORT_UPLOAD_MB} م.ب.`, activities: "نشاط",
    entity: { wbs: "هيكل العمل (WBS)", activities: "الأنشطة", relationships: "العلاقات", calendars: "التقاويم", resources: "الموارد", assignments: "إسناد الموارد", codeTypes: "أنواع الرموز", codeValues: "قيم الرموز", codeAssignments: "إسناد الرموز" } as Record<Entity, string>,
    stage: { queued: "بانتظار البدء", downloading: "قراءة الملف من التخزين", writing: "الكتابة" } as Record<string, string>,
  },
  en: {
    title: "Import a Primavera schedule (XER) in full", help: "The structure, activities, relationships, resources, codes and calendars — not the activities alone. What will change is counted and shown before anything is written; uploading a newer version updates and never deletes.",
    choose: "XER file", analyze: "Analyze the file", confirm: "Confirm the import", another: "Another file", uploading: "Uploading the file…", analyzing: "Analyzing the file…", importing: "Writing in the background…",
    preview: "What will happen", create: "New", update: "Updated", unchanged: "Unchanged", problems: "Problems that block the confirmation", warnings: "Notes", done: "The import is complete", failed: "The import failed",
    progressFailed: "The import's progress could not be read. It is still running in the background: open the page again in a moment and check the import log.", uploadFailed: "The file could not be uploaded to storage. Check your connection and try again.", tooBig: `The file is larger than ${MAX_IMPORT_UPLOAD_MB} MB.`, activities: "activities",
    entity: { wbs: "Work structure (WBS)", activities: "Activities", relationships: "Relationships", calendars: "Calendars", resources: "Resources", assignments: "Resource assignments", codeTypes: "Code types", codeValues: "Code values", codeAssignments: "Code assignments" } as Record<Entity, string>,
    stage: { queued: "Waiting to start", downloading: "Reading the file from storage", writing: "Writing" } as Record<string, string>,
  },
  ur: {
    title: "Primavera شیڈول (XER) مکمل درآمد کریں", help: "ڈھانچہ، سرگرمیاں، روابط، وسائل، کوڈ اور کیلنڈر — صرف سرگرمیاں نہیں۔ لکھنے سے پہلے دکھایا جاتا ہے کہ کیا بدلے گا؛ نیا ورژن دوبارہ اپ لوڈ کرنے سے اپ ڈیٹ ہوتا ہے، حذف نہیں۔",
    choose: "XER فائل", analyze: "فائل کا تجزیہ کریں", confirm: "درآمد کی تصدیق کریں", another: "دوسری فائل", uploading: "فائل اپ لوڈ ہو رہی ہے…", analyzing: "فائل کا تجزیہ ہو رہا ہے…", importing: "پس منظر میں لکھا جا رہا ہے…",
    preview: "کیا ہوگا", create: "نئے", update: "اپ ڈیٹ", unchanged: "جوں کے توں", problems: "وہ مسائل جو تصدیق روکتے ہیں", warnings: "نوٹس", done: "درآمد مکمل ہو گئی", failed: "درآمد ناکام ہو گئی",
    progressFailed: "درآمد کی پیش رفت نہیں پڑھی جا سکی۔ یہ پس منظر میں چل رہی ہے: تھوڑی دیر بعد صفحہ کھولیں اور درآمد کا لاگ دیکھیں۔", uploadFailed: "فائل اسٹوریج پر اپ لوڈ نہیں ہو سکی۔ کنکشن جانچیں اور دوبارہ کوشش کریں۔", tooBig: `فائل ${MAX_IMPORT_UPLOAD_MB} MB سے بڑی ہے۔`, activities: "سرگرمیاں",
    entity: { wbs: "کام کا ڈھانچہ (WBS)", activities: "سرگرمیاں", relationships: "روابط", calendars: "کیلنڈر", resources: "وسائل", assignments: "وسائل کی تفویض", codeTypes: "کوڈ کی اقسام", codeValues: "کوڈ کی قدریں", codeAssignments: "کوڈ کی تفویض" } as Record<Entity, string>,
    stage: { queued: "شروع ہونے کا انتظار", downloading: "اسٹوریج سے فائل پڑھی جا رہی ہے", writing: "لکھا جا رہا ہے" } as Record<string, string>,
  },
};

type Plan = { fileHash: string; counts: Counts; issues: Array<{ code: string; detail?: string }>; warnings: string[]; canConfirm: boolean; summary: { activities: number } };
type Step = "choose" | "uploading" | "analyzing" | "preview" | "importing" | "done" | "failed";

export function P6ImportCard({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  const canImport = useCan([...importModulePermissions.schedule], projectId);
  const [file, setFile] = useState<File | null>(null);
  const [step, setStep] = useState<Step>("choose");
  const [percent, setPercent] = useState(0);
  const [problem, setProblem] = useState<string | null>(null);
  const [upload, setUpload] = useState<{ uploadKey: string } | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [finished, setFinished] = useState<{ created: number; updated: number } | null>(null);
  const createUpload = trpc.smartImport.createUpload.useMutation();
  const analyze = trpc.smartImport.analyze.useMutation();
  const confirm = trpc.smartImport.confirm.useMutation();
  const progress = trpc.dataImports.progress.useQuery({ tenantId, projectId, importId: importId ?? "00000000-0000-4000-8000-000000000000" }, { enabled: step === "importing" && importId !== null, refetchInterval: 2000, retry: false });
  // the background job's own verdict moves the card to its end
  const view = progress.data;
  const ended = step === "importing" && view && (view.status === "completed" || view.status === "failed") ? view.status : null;
  useEffect(() => {
    if (!ended || !view) return;
    if (ended === "completed") setFinished({ created: view.createdRows, updated: view.updatedRows });
    setStep(ended === "completed" ? "done" : "failed");
  }, [ended, view]);
  if (!canImport) return null;

  const reset = () => { setFile(null); setStep("choose"); setPercent(0); setProblem(null); setUpload(null); setPlan(null); setImportId(null); setFinished(null); };
  const run = async () => {
    if (!file) return;
    if (file.size > MAX_IMPORT_UPLOAD_BYTES) { setProblem(t.tooBig); return; }
    setProblem(null);
    try {
      setStep("uploading");
      const target = await createUpload.mutateAsync({ tenantId, projectId, fileName: file.name });
      await putToStorage(target.uploadUrl, target.headers, file, setPercent);
      setStep("analyzing");
      const analysis = await analyze.mutateAsync({ tenantId, projectId, uploadKey: target.uploadKey, fileName: file.name });
      if (!analysis.p6Plan) { setProblem(getLocalizedProjectError({ message: "PROJECT_OS_SMART_IMPORT_FORMAT_UNSUPPORTED", data: { code: "BAD_REQUEST" } }, language)); setStep("choose"); return; }
      setUpload({ uploadKey: target.uploadKey }); setPlan(analysis.p6Plan as unknown as Plan); setStep("preview");
    } catch (error) {
      setProblem(error instanceof UploadFailure ? t.uploadFailed : getLocalizedProjectError(error, language)); setStep("choose");
    }
  };
  const approve = async () => {
    if (!file || !upload || !plan) return;
    setProblem(null);
    try {
      const done = await confirm.mutateAsync({ tenantId, projectId, uploadKey: upload.uploadKey, fileName: file.name, kind: "xer", forced: {}, approvedHash: plan.fileHash });
      setImportId(done.importId);
      if (done.status === "importing") setStep("importing");
      else { const activities = (done as { p6Counts?: Counts }).p6Counts?.activities; setFinished({ created: activities?.create ?? 0, updated: activities?.update ?? 0 }); setStep("done"); }
    } catch (error) { setProblem(getLocalizedProjectError(error, language)); }
  };
  const busy = step === "uploading" || step === "analyzing" || step === "importing";

  return <section aria-label={t.title} data-p6-import className="rounded-[var(--radius-card)] border border-border bg-card p-5">
    <h2 className="flex items-center gap-2 text-base font-semibold"><FileUp aria-hidden="true" className="h-5 w-5" />{t.title}</h2>
    <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{t.help}</p>
    {step === "choose" || step === "uploading" || step === "analyzing" ? <div className="mt-4 flex flex-col gap-3">
      <FileDropzone accept={[".xer"]} maxBytes={MAX_IMPORT_UPLOAD_BYTES} disabled={busy} onFiles={files => { setFile(files[0] ?? null); setProblem(null); }} items={file ? [{ id: "xer", name: file.name, size: file.size, status: step === "uploading" ? "uploading" : "queued", progress: step === "uploading" ? percent : undefined }] : []} />
      <div><Button className="min-h-11" disabled={!file || busy} loading={busy} onClick={() => void run()}>{t.analyze}</Button></div>
      {step === "uploading" ? <p role="status" className="text-sm text-muted-foreground">{t.uploading} <bdi dir="ltr">{percent}%</bdi></p> : null}
      {step === "analyzing" ? <p role="status" className="text-sm text-muted-foreground">{t.analyzing}</p> : null}
    </div> : null}
    {step === "preview" && plan ? <div className="mt-4 flex flex-col gap-3" data-p6-preview>
      <h3 className="text-sm font-semibold">{t.preview} — <bdi dir="ltr">{formatNumber(plan.summary.activities)}</bdi> {t.activities}</h3>
      <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t.preview}><table className="w-full min-w-[28rem] text-sm">
        <thead><tr className="border-b text-xs text-muted-foreground"><th className="p-2 text-start" /><th className="p-2 text-start">{t.create}</th><th className="p-2 text-start">{t.update}</th><th className="p-2 text-start">{t.unchanged}</th></tr></thead>
        <tbody>{ENTITIES.filter(entity => plan.counts[entity]).map(entity => <tr key={entity} className="border-b" data-entity={entity}><td className="p-2 font-medium">{t.entity[entity]}</td>
          <td className="p-2"><bdi dir="ltr">{formatNumber(plan.counts[entity].create)}</bdi></td><td className="p-2"><bdi dir="ltr">{formatNumber(plan.counts[entity].update)}</bdi></td><td className="p-2"><bdi dir="ltr">{formatNumber(plan.counts[entity].unchanged)}</bdi></td></tr>)}</tbody>
      </table></div>
      {plan.issues.length ? <div role="alert" data-p6-issues><p className="text-sm font-semibold text-danger-soft-foreground">{t.problems}</p><ul className="mt-1 list-disc ps-5 text-sm">{plan.issues.map((issue, index) => <li key={`${issue.code}${index}`}><bdi dir="ltr">{issue.code}{issue.detail ? ` — ${issue.detail}` : ""}</bdi></li>)}</ul></div> : null}
      {plan.warnings.length ? <div><p className="text-sm font-semibold">{t.warnings}</p><ul className="mt-1 list-disc ps-5 text-sm text-muted-foreground">{plan.warnings.map((warning, index) => <li key={`${warning}${index}`}><bdi dir="ltr">{warning}</bdi></li>)}</ul></div> : null}
      <div className="flex flex-wrap gap-3"><Button className="min-h-11" disabled={!plan.canConfirm || plan.issues.length > 0} loading={confirm.isPending} onClick={() => void approve()}>{t.confirm}</Button><Button className="min-h-11" variant="secondary" onClick={reset}>{t.another}</Button></div>
    </div> : null}
    {step === "importing" && progress.isError ? <p role="alert" data-p6-progress-error className="mt-4 text-sm text-danger-soft-foreground">{t.progressFailed}</p> : null}
    {step === "importing" ? <div role="status" className="mt-4 text-sm" data-p6-progress><p>{t.importing}</p><p className="mt-1 text-muted-foreground">{view?.progressStage ? (t.stage[view.progressStage] ?? view.progressStage) : t.stage.queued} <bdi dir="ltr">{view ? `${view.progressPercent}%` : ""}</bdi></p></div> : null}
    {step === "done" ? <div role="status" className="mt-4 text-sm" data-p6-done><p className="font-semibold">{t.done}</p>{finished ? <p className="mt-1 text-muted-foreground">{t.entity.activities}: <bdi dir="ltr">{formatNumber(finished.created)}</bdi> {t.create} · <bdi dir="ltr">{formatNumber(finished.updated)}</bdi> {t.update}</p> : null}<div className="mt-3"><Button className="min-h-11" variant="secondary" onClick={reset}>{t.another}</Button></div></div> : null}
    {step === "failed" ? <div role="alert" className="mt-4 text-sm" data-p6-failed><p className="font-semibold text-danger-soft-foreground">{t.failed}</p><p className="mt-1">{view?.failureReason ? getLocalizedProjectError({ message: view.failureReason, data: { code: "BAD_REQUEST" } }, language) : null}</p><div className="mt-3"><Button className="min-h-11" variant="secondary" onClick={reset}>{t.another}</Button></div></div> : null}
    {problem ? <p role="alert" className="mt-3 text-sm text-danger-soft-foreground">{problem}</p> : null}
  </section>;
}
