import React, { useState } from "react";
import { FileUp } from "lucide-react";
import { Button, FileDropzone, formatNumber } from "@/components/ds";
import { DirectImportRunner } from "@/components/DirectImportRunner";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage, type Language } from "@/lib/language";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { MAX_IMPORT_UPLOAD_BYTES, MAX_IMPORT_UPLOAD_MB, putToStorage, UploadFailure } from "@/lib/uploadLimit";
import { equipmentImportHeaders } from "@shared/importTemplateHeaders";
import { projectErrorMessages } from "@shared/projectErrors";

// D-84 (b): the two Excel files of the reference lists (#236). The equipment list goes through the direct-upload importer (module «equipment»: analyse, read
// the report, confirm). The units Tracker goes through the smart import as a unit matrix: the server reads it, counts in a rolled-back transaction what it
// would change, and lists every problem by its row before anything is written; confirming sends back the hash of exactly what was shown.
const text = {
  ar: {
    equipmentTitle: "استيراد قائمة المعدات من Excel", columns: "الأعمدة المتوقعة:", chooseFile: "ملف Excel", analyze: "حلّل الملف", confirm: "أكّد الاستيراد",
    trackerTitle: "استيراد Tracker الوحدات", trackerHelp: "رأسه: م | المرحلة | البلوك | رقم الفيلا | النموذج، ثم عمود لكل نشاط بحالة Completed أو On going. لا يُكتب شيء قبل التأكيد.",
    uploading: "جارٍ رفع الملف", analyzing: "جارٍ تحليل الملف…", noFile: "اختر ملفًا قبل التحليل.", typeError: "الصيغة المقبولة XLSX.", sizeError: `حجم الملف أكبر من ${MAX_IMPORT_UPLOAD_MB} ميغابايت.`, uploadFailed: "تعذّر رفع الملف إلى التخزين. أعد المحاولة.",
    plan: "ما سيكتبه الاستيراد", newUnits: "وحدات جديدة", completing: "خلايا تكتمل", inProgress: "وحدات تُلمس", unchanged: "خلايا بلا تغيير", regressed: "مكتملة لا تُرجَع", errors: "أخطاء تمنع الاستيراد", row: "الصف",
    importing: "جارٍ الاستيراد…", done: (units: number) => `اكتمل الاستيراد: ${units} وحدة في الملف.`, notTracker: "هذا الملف ليس Tracker وحدات ولا مصفوفة إنجاز.",
  },
  en: {
    equipmentTitle: "Import the equipment list from Excel", columns: "Expected columns:", chooseFile: "Excel file", analyze: "Analyse the file", confirm: "Confirm the import",
    trackerTitle: "Import the units Tracker", trackerHelp: "Its header: No. | Phase | Block | Villa number | Model, then one column per activity holding Completed or On going. Nothing is written before you confirm.",
    uploading: "Uploading the file", analyzing: "Analysing the file…", noFile: "Choose a file before analysing.", typeError: "The accepted format is XLSX.", sizeError: `The file is larger than ${MAX_IMPORT_UPLOAD_MB} MB.`, uploadFailed: "The file could not be uploaded to storage. Try again.",
    plan: "What the import would write", newUnits: "New units", completing: "Cells completed", inProgress: "Units touched", unchanged: "Cells unchanged", regressed: "Completed cells kept", errors: "Problems that stop the import", row: "Row",
    importing: "Importing…", done: (units: number) => `Import complete: ${units} units in the file.`, notTracker: "This file is neither a units Tracker nor a progress matrix.",
  },
  ur: {
    equipmentTitle: "Excel سے سازوسامان کی فہرست درآمد کریں", columns: "متوقع کالم:", chooseFile: "Excel فائل", analyze: "فائل کا تجزیہ کریں", confirm: "درآمد کی تصدیق کریں",
    trackerTitle: "یونٹس کا Tracker درآمد کریں", trackerHelp: "سرخی: نمبر | مرحلہ | بلاک | ولا نمبر | ماڈل، پھر ہر سرگرمی کا ایک کالم جس میں Completed یا On going ہو۔ تصدیق سے پہلے کچھ نہیں لکھا جاتا۔",
    uploading: "فائل اپ لوڈ ہو رہی ہے", analyzing: "فائل کا تجزیہ ہو رہا ہے…", noFile: "تجزیہ سے پہلے ایک فائل منتخب کریں۔", typeError: "قابلِ قبول فارمیٹ XLSX ہے۔", sizeError: `فائل ${MAX_IMPORT_UPLOAD_MB} MB سے بڑی ہے۔`, uploadFailed: "فائل اسٹوریج پر اپ لوڈ نہیں ہو سکی۔ دوبارہ کوشش کریں۔",
    plan: "درآمد کیا لکھے گی", newUnits: "نئے یونٹس", completing: "مکمل ہونے والے خانے", inProgress: "متاثرہ یونٹس", unchanged: "بغیر تبدیلی کے خانے", regressed: "مکمل خانے جو واپس نہیں ہوں گے", errors: "درآمد روکنے والی غلطیاں", row: "قطار",
    importing: "درآمد ہو رہی ہے…", done: (units: number) => `درآمد مکمل: فائل میں ${units} یونٹس۔`, notTracker: "یہ فائل نہ یونٹس کا Tracker ہے نہ پیش رفت میٹرکس۔",
  },
};

/** A refusal or row problem in the page's language when the product knows its code; otherwise the code itself, so nothing is hidden. */
export function rowProblem(code: string, language: Language): string {
  return code in projectErrorMessages ? projectErrorMessages[code as keyof typeof projectErrorMessages][language] : code;
}

export function EquipmentImport({ tenantId, projectId, onImported }: { tenantId: string; projectId: string; onImported: () => void }) {
  const { isArabic, language } = useLanguage();
  const t = pickLanguage(language, text);
  return (
    <section className="space-y-2 rounded-[var(--radius)] border p-3" aria-label={t.equipmentTitle} data-import="equipment">
      <h3 className="text-sm font-semibold">{t.equipmentTitle}</h3>
      <p className="text-xs text-muted-foreground">{t.columns} {(language === "ar" ? equipmentImportHeaders.ar : equipmentImportHeaders.en).join(" | ")}</p>
      <DirectImportRunner tenantId={tenantId} projectId={projectId} moduleCode="equipment" isArabic={isArabic} fileLabel={t.chooseFile} analyzeLabel={t.analyze} confirmLabel={t.confirm} errorLabel={code => rowProblem(code, language)} onCompleted={onImported} />
    </section>
  );
}

const ZERO = "0".repeat(64);
export function TrackerImport({ tenantId, projectId, onImported }: { tenantId: string; projectId: string; onImported: () => void }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  const scope = { tenantId, projectId };
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  const [upload, setUpload] = useState<{ uploadKey: string; fileName: string } | null>(null);
  const createUpload = trpc.smartImport.createUpload.useMutation();
  const analyze = trpc.smartImport.analyze.useMutation();
  const confirm = trpc.smartImport.confirm.useMutation({ onSuccess: onImported });
  const plan = analyze.data?.matrixPlan;

  const busy = uploading !== null || createUpload.isPending || analyze.isPending || confirm.isPending;
  const start = async () => {
    if (!file) { setProblem(t.noFile); return; }
    if (!file.name.toLowerCase().endsWith(".xlsx")) { setProblem(t.typeError); return; }
    if (file.size > MAX_IMPORT_UPLOAD_BYTES) { setProblem(t.sizeError); return; }
    setProblem(null); setUpload(null); analyze.reset(); confirm.reset();
    try {
      const target = await createUpload.mutateAsync({ ...scope, fileName: file.name });
      setUploading(0);
      await putToStorage(target.uploadUrl, target.headers, file, setUploading);
      setUploading(null);
      const sent = { uploadKey: target.uploadKey, fileName: file.name };
      setUpload(sent);
      const result = await analyze.mutateAsync({ ...scope, ...sent, kind: "unitMatrix" });
      if (!result.matrixPlan) setProblem(t.notTracker);
    } catch (error) {
      setUploading(null);
      setProblem(error instanceof UploadFailure ? t.uploadFailed : getLocalizedProjectError(error, language));
    }
  };

  const counts = plan ? [[t.newUnits, plan.changes.newUnits], [t.completing, plan.changes.completing], [t.inProgress, plan.changes.unitsTouched], [t.unchanged, plan.changes.unchangedCells], [t.regressed, plan.changes.regressed]] as const : [];
  return (
    <section className="space-y-3 rounded-[var(--radius)] border p-3" aria-label={t.trackerTitle} data-import="tracker">
      <h3 className="text-sm font-semibold">{t.trackerTitle}</h3>
      <p className="text-xs text-muted-foreground">{t.trackerHelp}</p>
      <div className="space-y-3">
        <div><FileDropzone accept={[".xlsx"]} maxBytes={MAX_IMPORT_UPLOAD_BYTES} disabled={busy} onFiles={files => { setFile(files[0] ?? null); setProblem(null); setUpload(null); analyze.reset(); confirm.reset(); }}
          items={file ? [{ id: "tracker", name: file.name, size: file.size, status: uploading !== null ? "uploading" : upload ? "done" : "queued", progress: uploading ?? undefined }] : []} /></div>
        <Button className="min-h-11" disabled={!file || busy} onClick={() => void start()}><FileUp className="me-1 h-4 w-4" aria-hidden="true" />{t.analyze}</Button>
      </div>
      {problem ? <p role="alert" className="text-sm text-danger-soft-foreground">{problem}</p> : null}
      {uploading !== null ? <p role="status" className="text-sm">{t.uploading}</p> : analyze.isPending ? <p role="status" className="text-sm">{t.analyzing}</p> : null}
      {plan ? (
        <div className="space-y-3" data-plan>
          <h4 className="text-sm font-semibold">{t.plan}</h4>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-5">{counts.map(([label, value]) => <div key={label} className="rounded-[var(--radius)] bg-muted p-2"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-lg font-semibold">{formatNumber(value)}</dd></div>)}</dl>
          {plan.errors.length > 0 ? (
            <div role="alert" className="space-y-1 rounded-[var(--radius)] bg-danger-soft p-3 text-sm text-danger-soft-foreground">
              <p className="font-semibold">{t.errors} ({formatNumber(plan.errors.length)})</p>
              <ul className="space-y-1">{plan.errors.slice(0, 50).map((error, index) => <li key={index}>{t.row} {formatNumber(error.rowNumber)}: {rowProblem(error.code, language)}{error.detail ? <> <bdi dir="ltr">({error.detail})</bdi></> : null}</li>)}</ul>
            </div>
          ) : null}
          {confirm.isSuccess ? <p role="status" className="text-sm font-medium">{t.done(plan.summary.units)}</p> : plan.canConfirm && upload ? (
            <Button className="min-h-11" loading={confirm.isPending} onClick={() => confirm.mutate({ ...scope, ...upload, kind: "unitMatrix", forced: {}, approvedHash: plan.fileHash ?? ZERO })}>{confirm.isPending ? t.importing : t.confirm}</Button>
          ) : null}
          {confirm.error ? <p role="alert" className="text-sm text-danger-soft-foreground">{getLocalizedProjectError(confirm.error, language)}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
