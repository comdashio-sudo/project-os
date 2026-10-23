import { Button } from "@/components/ui/button";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { MAX_IMPORT_UPLOAD_BYTES, MAX_IMPORT_UPLOAD_MB, putToStorage, UploadFailure } from "@/lib/uploadLimit";
import { getProjectError } from "@shared/projectErrors";
import type { inferRouterOutputs } from "@trpc/server";
import { FileUp } from "lucide-react";
import React, { useEffect, useRef, useState } from "react";
import type { AppRouter } from "../../../server/routers";

export type DirectImportView = inferRouterOutputs<AppRouter>["dataImports"]["progress"];
export type DirectImportModule = "pmc.locations" | "pmc.catalog" | "pmc.status" | "pmc.requests" | "pmc.baseline" | "pmc.baselineDates" | "masterPlanMapping" | "masterPlanSpatial";

type Props = {
  tenantId: string; projectId: string; moduleCode: DirectImportModule;
  /** The master-plan version a master-plan file belongs to. */
  context?: { masterPlanVersionId: string };
  isArabic: boolean;
  /** The label of the file chooser. */
  fileLabel: string; analyzeLabel: string; confirmLabel: string;
  /** Writes as soon as the analysis finds nothing wrong (the master-plan forms always applied in one click); otherwise the person reads the report and confirms. */
  autoConfirm?: boolean;
  /** False when `renderReport` already lists the errors (the PMC report does, with more detail). */
  showErrors?: boolean;
  /** What the importer would do, shown between the verdict and the confirm button. */
  renderReport?: (view: DirectImportView) => React.ReactNode;
  onCompleted?: (view: DirectImportView) => void;
};

const text = {
  ar: {
    noFile: "اختر ملفًا قبل التحليل.", typeError: "الصيغة المقبولة XLSX أو CSV.", sizeError: `حجم الملف أكبر من الحد المسموح به وهو ${MAX_IMPORT_UPLOAD_MB} ميغابايت.`,
    uploadFailed: "تعذّر رفع الملف إلى التخزين. تحقق من الاتصال وأعد المحاولة.",
    uploading: "جارٍ رفع الملف", analyzing: "جارٍ تحليل الملف", importing: "جارٍ كتابة السجلات", progressLabel: "تقدم المعالجة",
    stage: { queued: "في الانتظار", downloading: "قراءة الملف من التخزين", parsing: "قراءة الصفوف", validating: "التحقق من الصفوف", writing: "حفظ النتيجة" } as Record<string, string>,
    failedTitle: "فشلت المعالجة", errors: "أخطاء التحقق", row: "الصف", moreErrors: "تُعرض أول الأخطاء فقط؛ العدد الكامل أعلاه.",
    rows: "الصفوف", created: "السجلات المنشأة", updated: "السجلات المحدّثة", skipped: "السجلات المتجاوزة", nothingToConfirm: "الملف سليم لكنه لا يغيّر شيئًا: المشروع يحمل هذه البيانات بالفعل.", done: "اكتمل الحفظ",
  },
  en: {
    noFile: "Choose a file before analysing.", typeError: "Accepted formats are XLSX or CSV.", sizeError: `The file is larger than the ${MAX_IMPORT_UPLOAD_MB} MB limit.`,
    uploadFailed: "The file could not be uploaded to storage. Check your connection and try again.",
    uploading: "Uploading the file", analyzing: "Analysing the file", importing: "Writing the records", progressLabel: "Processing progress",
    stage: { queued: "Waiting to start", downloading: "Reading the file from storage", parsing: "Reading the rows", validating: "Validating the rows", writing: "Saving the result" } as Record<string, string>,
    failedTitle: "Processing failed", errors: "Validation errors", row: "Row", moreErrors: "Only the first errors are listed; the full count is above.",
    rows: "Rows", created: "Records created", updated: "Records updated", skipped: "Records skipped", nothingToConfirm: "The file is valid but changes nothing: the project already holds this data.", done: "Saved",
  },
};

/**
 * The file travels browser → Storage by a signed URL (no request body carries it, so the host's 4.5 MB ceiling does not apply, up to 50 MB), then a background job
 * analyses it and, after confirmation, writes it; this component shows that progress. It is the PMC and master-plan screens' counterpart of the general importer's screen.
 */
export function DirectImportRunner({ tenantId, projectId, moduleCode, context, isArabic, fileLabel, analyzeLabel, confirmLabel, autoConfirm = false, showErrors = true, renderReport, onCompleted }: Props) {
  const t = isArabic ? text.ar : text.en;
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const createUpload = trpc.dataImports.createUpload.useMutation();
  const registerUpload = trpc.dataImports.registerUpload.useMutation({ onSuccess: result => setImportId(result.id) });
  const progress = trpc.dataImports.progress.useQuery(
    { tenantId, projectId, importId: importId ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(importId), refetchInterval: query => (query.state.data?.status === "analyzing" || query.state.data?.status === "importing" ? 1500 : false) },
  );
  const confirm = trpc.dataImports.confirm.useMutation({ onSuccess: () => { void progress.refetch(); } });
  const view = progress.data;
  const busy = uploadPercent !== null || createUpload.isPending || registerUpload.isPending;

  // a different module (the PMC kind, the master-plan version) is a different import: start clean
  const identity = `${moduleCode}|${context?.masterPlanVersionId ?? ""}`;
  const lastIdentity = useRef(identity);
  useEffect(() => { if (lastIdentity.current !== identity) { lastIdentity.current = identity; setImportId(null); setLocalError(null); setUploadError(null); confirm.reset(); } }, [identity, confirm]);

  const autoConfirmed = useRef<string | null>(null);
  const completed = useRef<string | null>(null);
  useEffect(() => {
    if (!view) return;
    if (autoConfirm && view.status === "validated" && view.external?.canConfirm && autoConfirmed.current !== view.id && !confirm.isPending) { autoConfirmed.current = view.id; confirm.mutate({ tenantId, projectId, importId: view.id }); }
    if (view.status === "completed" && completed.current !== view.id) { completed.current = view.id; onCompleted?.(view); }
  }, [view, autoConfirm, confirm, tenantId, projectId, onCompleted]);

  const start = async () => {
    if (!file) { setLocalError(t.noFile); return; }
    const lower = file.name.toLowerCase();
    const format = lower.endsWith(".csv") ? "csv" : lower.endsWith(".xlsx") ? "xlsx" : null;
    if (!format) { setLocalError(t.typeError); return; }
    if (file.size > MAX_IMPORT_UPLOAD_BYTES) { setLocalError(t.sizeError); return; }
    setLocalError(null); setUploadError(null); setImportId(null); confirm.reset();
    try {
      const target = await createUpload.mutateAsync({ tenantId, projectId, moduleCode, fileName: file.name, sourceFormat: format, context });
      setUploadPercent(0);
      await putToStorage(target.uploadUrl, target.headers, file, setUploadPercent);
      setUploadPercent(null);
      await registerUpload.mutateAsync({ tenantId, projectId, moduleCode, fileName: file.name, sourceFormat: format, uploadKey: target.uploadKey, context });
    } catch (error) {
      setUploadPercent(null);
      setUploadError(error instanceof UploadFailure ? t.uploadFailed : getLocalizedProjectError(error, isArabic));
    }
  };

  const inFlight = view?.status === "analyzing" || view?.status === "importing";
  const errors = view?.analysis?.errors ?? [];
  return (
    <div className="space-y-3" data-testid="direct-import">
      <div className="flex flex-wrap items-end gap-3">
        <label className="text-sm">{fileLabel}<input aria-label={fileLabel} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="mt-1 block min-h-[44px] rounded-xl border border-slate-200 p-2 text-sm" onChange={event => { setFile(event.target.files?.[0] ?? null); setLocalError(null); }} /></label>
        <Button type="button" className="min-h-[44px]" disabled={!file || busy || inFlight} onClick={() => void start()}><FileUp className="me-1 h-4 w-4" />{analyzeLabel}</Button>
      </div>
      {localError && <p role="alert" className="text-sm text-red-700">{localError}</p>}
      {uploadError && <p role="alert" className="text-sm text-red-700">{uploadError}</p>}
      {uploadPercent !== null && <div role="status" aria-live="polite"><p className="text-sm">{t.uploading} ({uploadPercent}%)</p><progress className="mt-1 h-2 w-full" max={100} value={uploadPercent} aria-label={t.progressLabel} /></div>}
      {view && inFlight && <div role="status" aria-live="polite" data-testid="direct-import-progress">
        <p className="text-sm">{view.status === "analyzing" ? t.analyzing : t.importing}{view.progressStage ? ` — ${t.stage[view.progressStage] ?? view.progressStage}` : ""} ({view.progressPercent}%)</p>
        <progress className="mt-1 h-2 w-full" max={100} value={view.progressPercent} aria-label={t.progressLabel} />
      </div>}
      {view?.status === "failed" && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
        <p className="font-semibold">{t.failedTitle}</p>
        <p className="mt-1">{view.failureReason ? (isArabic ? getProjectError(view.failureReason).messages.ar : getProjectError(view.failureReason).messages.en) : t.failedTitle}</p>
      </div>}
      {view && (view.status === "uploaded" || view.status === "validated") && <div className="space-y-3">
        <p className="text-sm">{t.rows}: {view.totalRows}</p>
        {showErrors && errors.length > 0 && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"><p className="font-semibold">{t.errors}: {view.analysis?.errorsTotal}</p><ul className="mt-1 space-y-1">{errors.map((error, index) => <li key={`${error.code}-${error.rowNumber}-${index}`}>{error.rowNumber ? `${t.row} ${error.rowNumber} · ` : ""}{error.code}{error.field ? ` (${error.field})` : ""}</li>)}</ul>{(view.analysis?.errorsTotal ?? 0) > (view.analysis?.errorsListed ?? 0) && <p className="mt-1">{t.moreErrors}</p>}</div>}
        {renderReport?.(view)}
        {view.status === "validated" && view.external && !view.external.canConfirm && <p className="text-sm text-slate-600">{t.nothingToConfirm}</p>}
        {view.status === "validated" && view.external?.canConfirm && !autoConfirm && <Button type="button" className="min-h-[44px]" disabled={confirm.isPending} onClick={() => confirm.mutate({ tenantId, projectId, importId: view.id })}>{confirmLabel}</Button>}
      </div>}
      {view?.status === "completed" && <p role="status" className="rounded-xl bg-emerald-50 p-3 text-sm font-semibold text-emerald-800">{t.done}: {t.created} {view.createdRows} · {t.updated} {view.updatedRows} · {t.skipped} {view.skippedRows}</p>}
      {confirm.error && <p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(confirm.error, isArabic)}</p>}
      {progress.error && <p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(progress.error, isArabic)}</p>}
    </div>
  );
}
