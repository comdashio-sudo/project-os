// D-59: the site's old workbook (work order 22) brought in from the screen. The server already reads it as the smart-import kind «siteWorkbook» (server/siteLegacyImport.ts:
// the site's activities and their weights, contractors, each villa × activity's status with its dates, the history, the daily reports, the planned monthly curve), but no
// screen sent it, so the site-update screen and the S-curve had nothing to stand on and their «import» buttons led nowhere. Here: upload → the server counts in a rolled-back
// transaction what it would write and lists every refused row by reason → the person confirms with the hash of exactly what was shown. A second import is refused by the server.
import React, { useState } from "react";
import { Link } from "wouter";
import { FileUp } from "lucide-react";
import { Button, FileDropzone, formatNumber } from "@/components/ds";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { MAX_IMPORT_UPLOAD_BYTES, MAX_IMPORT_UPLOAD_MB, putToStorage, UploadFailure } from "@/lib/uploadLimit";

const REASONS = ["SITE_VILLA_UNKNOWN", "SITE_DATE_IN_FUTURE", "SITE_ACTIVITY_UNKNOWN", "SITE_CELL_NOT_IN_PROGRESS", "SITE_CONTRACTOR_UNKNOWN", "SITE_ROW_DUPLICATE", "SITE_STATUS_UNKNOWN", "SITE_FIELD_MISSING", "SITE_WEIGHT_INVALID", "SITE_NO_ACTIVITIES", "SITE_NO_UNITS_IN_PROJECT", "SITE_LEGACY_ALREADY_IMPORTED"] as const;
const text = {
  ar: {
    title: "استيراد سجل الموقع القديم (مرة واحدة)", help: "ملف Excel الذي كان الموقع يعمل عليه (الأوزان، المقاولون، الإنجاز وسجله، اليوميات، المخطط الشهري). يُقرأ أولًا ويُعرض ما سيُكتب، ولا يُكتب شيء قبل التأكيد.",
    analyze: "حلّل الملف", uploading: "جارٍ رفع الملف", analyzing: "جارٍ تحليل الملف…", noFile: "اختر ملفًا قبل التحليل.", typeError: "الصيغة المقبولة XLSX.", sizeError: `حجم الملف أكبر من ${MAX_IMPORT_UPLOAD_MB} ميغابايت.`, uploadFailed: "تعذّر رفع الملف إلى التخزين. أعد المحاولة.",
    notSite: "هذا الملف ليس سجل الموقع.", plan: "ما سيكتبه الاستيراد", activities: "أنشطة الموقع", cells: "خلايا فيلا × نشاط", contractors: "مقاولون", history: "أحداث السجل", reports: "تقارير يومية", months: "أشهر المخطط", rejected: "صفوف لن تُستورد", errors: "يمنع الاستيراد", confirm: "أكّد الاستيراد", importing: "جارٍ الاستيراد…",
    done: (cells: number) => `استُورد سجل الموقع: ${formatNumber(cells)} خلية.`, next: "افتح تحديث الموقع",
    reasons: { SITE_VILLA_UNKNOWN: "فيلا ليست في المشروع", SITE_DATE_IN_FUTURE: "تاريخ في المستقبل", SITE_ACTIVITY_UNKNOWN: "نشاط غير موجود", SITE_CELL_NOT_IN_PROGRESS: "خلية ليست في ورقة الإنجاز", SITE_CONTRACTOR_UNKNOWN: "مقاول غير موجود", SITE_ROW_DUPLICATE: "صف مكرر", SITE_STATUS_UNKNOWN: "حالة غير مفهومة", SITE_FIELD_MISSING: "حقل ناقص", SITE_WEIGHT_INVALID: "وزن غير صالح", SITE_NO_ACTIVITIES: "لا أنشطة في ورقة الأوزان", SITE_NO_UNITS_IN_PROJECT: "لا وحدات في المشروع بعد: استورد الوحدات أولًا", SITE_LEGACY_ALREADY_IMPORTED: "استُورد سجل الموقع من قبل" } as Record<string, string>,
  },
  en: {
    title: "Import the site's old workbook (once)", help: "The Excel file the site worked from (weights, contractors, progress and its log, daily reports, the monthly plan). It is read first and what would be written is shown; nothing is written before you confirm.",
    analyze: "Analyse the file", uploading: "Uploading the file", analyzing: "Analysing the file…", noFile: "Choose a file before analysing.", typeError: "The accepted format is XLSX.", sizeError: `The file is larger than ${MAX_IMPORT_UPLOAD_MB} MB.`, uploadFailed: "The file could not be uploaded to storage. Try again.",
    notSite: "This file is not the site workbook.", plan: "What the import would write", activities: "Site activities", cells: "Villa × activity cells", contractors: "Contractors", history: "History events", reports: "Daily reports", months: "Plan months", rejected: "Rows not imported", errors: "Blocks the import", confirm: "Confirm the import", importing: "Importing…",
    done: (cells: number) => `The site workbook was imported: ${formatNumber(cells)} cells.`, next: "Open the site update",
    reasons: { SITE_VILLA_UNKNOWN: "Villa not in the project", SITE_DATE_IN_FUTURE: "Date in the future", SITE_ACTIVITY_UNKNOWN: "Activity not found", SITE_CELL_NOT_IN_PROGRESS: "Cell not in the progress sheet", SITE_CONTRACTOR_UNKNOWN: "Contractor not found", SITE_ROW_DUPLICATE: "Duplicate row", SITE_STATUS_UNKNOWN: "Status not understood", SITE_FIELD_MISSING: "Missing field", SITE_WEIGHT_INVALID: "Invalid weight", SITE_NO_ACTIVITIES: "No activities in the weights sheet", SITE_NO_UNITS_IN_PROJECT: "No units in the project yet: import the units first", SITE_LEGACY_ALREADY_IMPORTED: "The site workbook was already imported" } as Record<string, string>,
  },
  ur: {
    title: "سائٹ کی پرانی ورک بک درآمد کریں (ایک بار)", help: "وہ Excel فائل جس پر سائٹ کام کرتی تھی (وزن، ٹھیکیدار، پیش رفت اور اس کا ریکارڈ، روزانہ رپورٹیں، ماہانہ منصوبہ)۔ پہلے پڑھی جاتی ہے اور جو لکھا جائے گا دکھایا جاتا ہے؛ تصدیق سے پہلے کچھ نہیں لکھا جاتا۔",
    analyze: "فائل کا تجزیہ کریں", uploading: "فائل اپ لوڈ ہو رہی ہے", analyzing: "فائل کا تجزیہ ہو رہا ہے…", noFile: "تجزیے سے پہلے فائل منتخب کریں۔", typeError: "قابلِ قبول فارمیٹ XLSX ہے۔", sizeError: `فائل ${MAX_IMPORT_UPLOAD_MB} MB سے بڑی ہے۔`, uploadFailed: "فائل اسٹوریج پر اپ لوڈ نہیں ہو سکی۔ دوبارہ کوشش کریں۔",
    notSite: "یہ فائل سائٹ کی ورک بک نہیں ہے۔", plan: "درآمد کیا لکھے گی", activities: "سائٹ کی سرگرمیاں", cells: "ولا × سرگرمی خانے", contractors: "ٹھیکیدار", history: "ریکارڈ کے واقعات", reports: "روزانہ رپورٹیں", months: "منصوبے کے مہینے", rejected: "قطاریں جو درآمد نہیں ہوں گی", errors: "درآمد روکتا ہے", confirm: "درآمد کی تصدیق کریں", importing: "درآمد ہو رہی ہے…",
    done: (cells: number) => `سائٹ کی ورک بک درآمد ہو گئی: ${formatNumber(cells)} خانے۔`, next: "سائٹ اپ ڈیٹ کھولیں",
    reasons: { SITE_VILLA_UNKNOWN: "ولا پروجیکٹ میں نہیں", SITE_DATE_IN_FUTURE: "مستقبل کی تاریخ", SITE_ACTIVITY_UNKNOWN: "سرگرمی نہیں ملی", SITE_CELL_NOT_IN_PROGRESS: "خانہ پیش رفت کی شیٹ میں نہیں", SITE_CONTRACTOR_UNKNOWN: "ٹھیکیدار نہیں ملا", SITE_ROW_DUPLICATE: "دہری قطار", SITE_STATUS_UNKNOWN: "حالت سمجھ میں نہیں آئی", SITE_FIELD_MISSING: "خانہ خالی", SITE_WEIGHT_INVALID: "غلط وزن", SITE_NO_ACTIVITIES: "وزن کی شیٹ میں کوئی سرگرمی نہیں", SITE_NO_UNITS_IN_PROJECT: "پروجیکٹ میں ابھی یونٹس نہیں: پہلے یونٹس درآمد کریں", SITE_LEGACY_ALREADY_IMPORTED: "سائٹ کی ورک بک پہلے درآمد ہو چکی" } as Record<string, string>,
  },
};
export const SITE_REASONS = REASONS;
/** The words for a refusal reason, per language (a test holds every reason the server gives to a word in each language). */
export const siteReasonWords = (language: "ar" | "en" | "ur") => text[language].reasons;

export function SiteWorkbookImport({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  const scope = { tenantId, projectId };
  const [file, setFile] = useState<File | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [uploading, setUploading] = useState<number | null>(null);
  const [upload, setUpload] = useState<{ uploadKey: string; fileName: string } | null>(null);
  const createUpload = trpc.smartImport.createUpload.useMutation();
  const analyze = trpc.smartImport.analyze.useMutation();
  const utils = trpc.useUtils();
  const confirm = trpc.smartImport.confirm.useMutation({ onSuccess: () => { void utils.pmcSite.invalidate(); } });
  const plan = analyze.data?.siteLegacyPlan;
  const busy = uploading !== null || createUpload.isPending || analyze.isPending || confirm.isPending;
  const reason = (code: string) => t.reasons[code] ?? code;

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
      const result = await analyze.mutateAsync({ ...scope, ...sent, kind: "siteWorkbook" });
      if (!result.siteLegacyPlan) setProblem(t.notSite);
    } catch (error) {
      setUploading(null);
      setProblem(error instanceof UploadFailure ? t.uploadFailed : getLocalizedProjectError(error, language));
    }
  };

  const counts = plan ? ([[t.activities, plan.activities], [t.cells, plan.cells], [t.contractors, plan.contractors], [t.history, plan.historyEvents + plan.logEvents], [t.reports, plan.dailyReports], [t.months, plan.planMonths]] as const) : [];
  return (
    <section className="space-y-3 rounded-[var(--radius)] border p-3" aria-label={t.title} data-import="site-workbook">
      <h3 className="text-sm font-semibold">{t.title}</h3>
      <p className="text-xs text-muted-foreground">{t.help}</p>
      <FileDropzone accept={[".xlsx"]} maxBytes={MAX_IMPORT_UPLOAD_BYTES} disabled={busy} onFiles={files => { setFile(files[0] ?? null); setProblem(null); setUpload(null); analyze.reset(); confirm.reset(); }}
        items={file ? [{ id: "site", name: file.name, size: file.size, status: uploading !== null ? "uploading" : upload ? "done" : "queued", progress: uploading ?? undefined }] : []} />
      <Button className="min-h-11" disabled={!file || busy} onClick={() => void start()}><FileUp className="me-1 h-4 w-4" aria-hidden="true" />{t.analyze}</Button>
      {problem ? <p role="alert" className="text-sm text-danger-soft-foreground">{problem}</p> : null}
      {uploading !== null ? <p role="status" className="text-sm">{t.uploading}</p> : analyze.isPending ? <p role="status" className="text-sm">{t.analyzing}</p> : null}
      {plan ? (
        <div className="space-y-3" data-plan>
          <h4 className="text-sm font-semibold">{t.plan}</h4>
          <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">{counts.map(([label, value]) => <div key={label} className="rounded-[var(--radius)] bg-muted p-2"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="text-lg font-semibold">{formatNumber(value)}</dd></div>)}</dl>
          {plan.errors.length > 0 ? (
            <div role="alert" className="space-y-1 rounded-[var(--radius)] bg-danger-soft p-3 text-sm text-danger-soft-foreground" data-errors>
              <p className="font-semibold">{t.errors}</p>
              <ul className="space-y-1">{plan.errors.map((error, index) => <li key={index}>{reason(error.code)}{error.detail ? <> <bdi dir="ltr">({error.detail})</bdi></> : null}</li>)}</ul>
            </div>
          ) : null}
          {Object.keys(plan.rejectedByReason).length > 0 ? (
            <div className="space-y-1 text-sm" data-rejected>
              <p className="font-semibold">{t.rejected}</p>
              <ul className="space-y-1">{Object.entries(plan.rejectedByReason).map(([code, count]) => <li key={code}>{reason(code)}: {formatNumber(count)}</li>)}</ul>
            </div>
          ) : null}
          {confirm.isSuccess ? (
            <div className="flex flex-wrap items-center gap-3"><p role="status" className="text-sm font-medium">{t.done(plan.cells)}</p><Link href={`/m/${tenantId}/${projectId}/site-update`} className="inline-flex min-h-11 items-center rounded-[var(--radius)] border px-3 text-sm font-medium text-primary">{t.next}</Link></div>
          ) : plan.canConfirm && plan.fileHash && upload ? (
            <Button className="min-h-11" loading={confirm.isPending} onClick={() => confirm.mutate({ ...scope, ...upload, kind: "siteWorkbook", forced: {}, approvedHash: plan.fileHash })}>{confirm.isPending ? t.importing : t.confirm}</Button>
          ) : null}
          {confirm.error ? <p role="alert" className="text-sm text-danger-soft-foreground">{getLocalizedProjectError(confirm.error, language)}</p> : null}
        </div>
      ) : null}
    </section>
  );
}
