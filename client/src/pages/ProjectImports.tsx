import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { BadgeCheck, Download, FileCheck2, FileSpreadsheet, ListChecks, Upload } from "lucide-react";
import React, { useState } from "react";
import { SourceNotice } from "@/components/SectionResilience";
import { WriteGate } from "@/lib/permissions";
import { MAX_IMPORT_UPLOAD_BYTES, MAX_IMPORT_UPLOAD_MB, putToStorage, UploadFailure } from "@/lib/uploadLimit";
import { getProjectError } from "@shared/projectErrors";
import { importModulePermissions } from "@shared/importPermissions";
import { importTemplateHeaders } from "@shared/importTemplateHeaders";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

type DuplicateMode = "update_existing" | "upsert" | "skip_duplicates" | "fail_on_duplicate";

export function ProjectImports({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { isArabic } = useLanguage();
  const [moduleCode, setModuleCode] = useState<"wbs" | "budget" | "contracts" | "materials" | "schedule" | "openingBalances">("wbs");
  const [file, setFile] = useState<File | null>(null);
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>("fail_on_duplicate");
  const [mappingOverride, setMappingOverride] = useState<Record<string, string>>({});
  const [selectedImportId, setSelectedImportId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const imports = trpc.dataImports.list.useQuery({ tenantId, projectId });
  const detail = trpc.dataImports.detail.useQuery(
    { tenantId, projectId, importId: selectedImportId ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(selectedImportId) },
  );
  // The file goes browser → Storage by a signed URL (no request body carries it), then a background job analyses it; the screen polls the job.
  const [currentImportId, setCurrentImportId] = useState<string | null>(null);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const createUpload = trpc.dataImports.createUpload.useMutation();
  const registerUpload = trpc.dataImports.registerUpload.useMutation({
    onSuccess: result => { setCurrentImportId(result.id); setSelectedImportId(result.id); void imports.refetch(); },
  });
  const progress = trpc.dataImports.progress.useQuery(
    { tenantId, projectId, importId: currentImportId ?? "00000000-0000-0000-0000-000000000000" },
    { enabled: Boolean(currentImportId), refetchInterval: query => (query.state.data?.status === "analyzing" || query.state.data?.status === "importing" ? 1500 : false) },
  );
  const current = progress.data;
  const finishJob = () => { void imports.refetch(); void detail.refetch(); void progress.refetch(); };
  const reanalyze = trpc.dataImports.reanalyze.useMutation({ onSuccess: result => { setCurrentImportId(result.id); setSelectedImportId(result.id); finishJob(); } });
  const confirm = trpc.dataImports.confirm.useMutation({ onSuccess: result => { setCurrentImportId(result.id); setSelectedImportId(result.id); finishJob(); } });
  const busy = uploadPercent !== null || createUpload.isPending || registerUpload.isPending;
  const t = isArabic
    ? {
        title: "استيراد بيانات",
        note: "ارفع XLSX أو CSV، واختر سياسة التكرار، ثم راجع النتيجة قبل تأكيد الكتابة التشغيلية.",
        wbs: "WBS",
        budget: "الميزانية",
        contracts: "العقود",
        materials: "المواد",
        schedule: "الجدول الزمني",
        openingBalances: "الأرصدة الافتتاحية",
        openingRules: "الرصيد الافتتاحي هو أول حركة للمادة في المستودع: لا يُقبل لزوج له حركات سابقة، ولا يعدّل مخزونًا له تاريخ. الكمية أكبر من صفر والمستودع والمادة موجودان وفعّالان.",
        analyze: "تحليل الملف",
        reanalyze: "إعادة التحليل بالتعيين",
        chooseMapping: "اختر عمود الملف",
        confirm: "تأكيد الاستيراد",
        rows: "الصفوف",
        errors: "أخطاء التحقق",
        created: "السجلات المنشأة",
        updated: "السجلات المحدّثة",
        skipped: "السجلات المتجاوزة",
        history: "سجل الاستيراد",
        details: "نتائج الاستيراد",
        viewDetails: "عرض النتائج",
        results: "نتائج الصفوف",
        duplicateMode: "سياسة الصفوف المكررة",
        choose: "اختر ملفًا",
        mapping: "تعيين الأعمدة المكتشف",
        noRowResults: "لا توجد نتائج صفوف محفوظة لهذا السجل بعد.",
        validationErrors: "أخطاء التحقق المحفوظة",
        field: { code: "الرمز", name: "الاسم", plannedValue: "القيمة المخططة", costCode: "رمز التكلفة", originalAmount: "القيمة الأصلية", currentAmount: "القيمة الحالية", title: "اسم العقد", counterparty: "الطرف المتعاقد", contractValue: "قيمة العقد", currency: "العملة", recordType: "نوع السجل", wbsCode: "رمز WBS", wbsName: "اسم WBS", activityCode: "رمز النشاط", activityName: "اسم النشاط", plannedStartAt: "البداية المخططة", plannedFinishAt: "النهاية المخططة", status: "الحالة" },
        status: { uploaded: "مرفوع", analyzing: "قيد المعالجة", validated: "جاهز للتأكيد", completed: "مكتمل", failed: "فشل", importing: "قيد المعالجة", cancelled: "ملغى", confirmed: "مؤكد" },
        duplicate: { fail_on_duplicate: "إيقاف الاستيراد عند وجود تكرار", skip_duplicates: "تجاوز الصفوف الموجودة", update_existing: "تحديث الصفوف الموجودة فقط", upsert: "إنشاء الجديد وتحديث الموجود" },
        action: { created: "تم الإنشاء", updated: "تم التحديث", skipped: "تم التجاوز" },
        workflow: "استيراد منضبط في ثلاث خطوات",
        step1: "اختر نوع البيانات والقالب",
        step2: "ارفع الملف وحلّل التعيين",
        step3: "راجع النتيجة ثم أكّد الكتابة",
        instructions: "لا يكتب النظام أي سجل قبل نجاح التحقق ومراجعة التعيين. لا تُرفَع الأعمدة غير المطلوبة ولا ملفات مجمّعة من أقسام متعددة.",
        template: "تنزيل قالب Excel",
        templateNote: "القالب يحتوي الأعمدة المعتمدة فقط. يمكنك إضافة صفوف بيانات بعد الصف الأول دون تغيير العناوين.",
        requiredColumns: "الأعمدة المطلوبة",
        accepted: `الملفات المعتمدة: XLSX أو CSV للقوالب العادية، وXLSX أو XER للجدول الزمني، حتى ${MAX_IMPORT_UPLOAD_MB} ميغابايت.`,
        fileRules: "ملف واحد، ورقة واحدة، ونوع بيانات واحد. يرفض النظام أي عمود غير معتمد أو رمز مكرر داخل الملف.",
        noFile: "اختر ملفًا قبل التحليل.",
        typeError: "صيغة الملف لا تتوافق مع القالب المحدد.",
        scheduleRules: "ملف الجدول الزمني يقبل WBS والأنشطة المحددة فقط. يتطلب XER جدولي PROJWBS وTASK؛ لا يتجاهل مراجع WBS أو التواريخ غير الصحيحة.",
        sizeError: `حجم الملف أكبر من الحد المسموح به وهو ${MAX_IMPORT_UPLOAD_MB} ميغابايت.`,
        uploading: "جارٍ رفع الملف",
        analyzing: "جارٍ تحليل الملف", importing: "جارٍ كتابة السجلات", progressLabel: "تقدم المعالجة",
        stage: { queued: "في الانتظار", downloading: "قراءة الملف من التخزين", parsing: "قراءة الصفوف", validating: "التحقق من الصفوف", writing: "حفظ النتيجة" },
        failedTitle: "فشلت المعالجة", moreErrors: "تُعرض أول الأخطاء فقط؛ العدد الكامل أعلاه.",
        blocked: "التأكيد محجوب حتى يصبح التحليل خاليًا من أخطاء التحقق.",
        diffTitle: "معاينة الفروق قبل الحفظ", diffNew: "جديد", diffModified: "معدَّل", diffUnchanged: "بلا تغيير", diffConflict: "تعارض", diffMissing: "غائب عن الملف (لا يُحذف)", diffOld: "القديم", diffNewValue: "الجديد", diffMore: "تُعرض أول الصفوف فقط؛ العدد الكامل أعلاه.",
        diffConflictNote: "تعارض: تغيّر هذا الصف في المنصة بعد التصدير أو أُعيد ترميزه في الملف. لن يُكتب. صدِّر الملف من جديد.", diffNoChanges: "لا تغييرات: كل الصفوف مطابقة لما هو محفوظ.", diffApprove: "ما تراه أعلاه هو ما سيُكتب بالضبط عند التأكيد.",
        diffMissingNote: "صفوف موجودة في المنصة وغير موجودة في هذا الملف: لن تُحذف. الاستيراد لا يحذف أي سجل أبدًا؛ إن أردت حذف أحدها فاحذفه من داخل المنصة.",
      }
    : {
        title: "Data import",
        note: "Upload XLSX or CSV, select the duplicate policy, then review the result before confirming the operational write.",
        wbs: "WBS",
        budget: "Budget",
        contracts: "Contracts",
        materials: "Materials",
        schedule: "Schedule",
        openingBalances: "Opening balances",
        openingRules: "An opening balance is the first movement of a material in a warehouse: it is refused for a pair that already has movements and never edits stock that has a history. The quantity is above zero and the warehouse and material exist and are active.",
        analyze: "Analyze file",
        reanalyze: "Reanalyze mapping",
        chooseMapping: "Choose a file column",
        confirm: "Confirm import",
        rows: "Rows",
        errors: "Validation errors",
        created: "Records created",
        updated: "Records updated",
        skipped: "Records skipped",
        history: "Import history",
        details: "Import results",
        viewDetails: "View results",
        results: "Row results",
        duplicateMode: "Duplicate-row policy",
        choose: "Choose a file",
        mapping: "Detected column mapping",
        noRowResults: "No row results have been saved for this record yet.",
        validationErrors: "Saved validation errors",
        field: { code: "Code", name: "Name", plannedValue: "Planned value", costCode: "Cost code", originalAmount: "Original amount", currentAmount: "Current amount", title: "Contract title", counterparty: "Counterparty", contractValue: "Contract value", currency: "Currency", recordType: "Record type", wbsCode: "WBS code", wbsName: "WBS name", activityCode: "Activity code", activityName: "Activity name", plannedStartAt: "Planned start", plannedFinishAt: "Planned finish", status: "Status" },
        status: { uploaded: "Uploaded", analyzing: "Processing", validated: "Ready to confirm", completed: "Completed", failed: "Failed", importing: "Processing", cancelled: "Cancelled", confirmed: "Confirmed" },
        duplicate: { fail_on_duplicate: "Stop when a duplicate exists", skip_duplicates: "Skip existing rows", update_existing: "Update existing rows only", upsert: "Create new and update existing rows" },
        action: { created: "Created", updated: "Updated", skipped: "Skipped" },
        workflow: "Controlled import in three steps",
        step1: "Choose the data type and template",
        step2: "Upload the file and analyze mapping",
        step3: "Review the result, then confirm the write",
        instructions: "The system does not write a record until validation and mapping review succeed. Do not upload columns outside the selected data type or combined files from multiple areas.",
        template: "Download Excel template",
        templateNote: "The template contains only approved columns. Add data rows below the header without changing column names.",
        requiredColumns: "Required columns",
        accepted: `Accepted files: XLSX or CSV for standard templates, and XLSX or XER for schedule import, up to ${MAX_IMPORT_UPLOAD_MB} MB.`,
        fileRules: "One file, one sheet, and one data type. The system rejects unapproved columns and repeated keys inside the file.",
        noFile: "Choose a file before analysis.",
        typeError: "The file format does not match the selected template.",
        scheduleRules: "Schedule import accepts only named WBS and activity records. XER requires PROJWBS and TASK; unresolved WBS links and invalid dates are never ignored.",
        sizeError: `The file exceeds the ${MAX_IMPORT_UPLOAD_MB} MB limit.`,
        uploading: "Uploading the file",
        analyzing: "Analysing the file", importing: "Writing the records", progressLabel: "Processing progress",
        stage: { queued: "Waiting to start", downloading: "Reading the file from storage", parsing: "Reading the rows", validating: "Validating the rows", writing: "Saving the result" },
        failedTitle: "Processing failed", moreErrors: "Only the first errors are listed; the full count is above.",
        blocked: "Confirmation remains blocked until analysis has no validation errors.",
        diffTitle: "Differences preview before saving", diffNew: "New", diffModified: "Modified", diffUnchanged: "Unchanged", diffConflict: "Conflict", diffMissing: "Absent from the file (never deleted)", diffOld: "Old", diffNewValue: "New", diffMore: "Only the first rows are shown; the full count is above.",
        diffConflictNote: "Conflict: this row changed in the platform after the export, or was re-keyed in the file. It will not be written. Export again.", diffNoChanges: "No changes: every row matches what is stored.", diffApprove: "What you see above is exactly what will be written when you confirm.",
        diffMissingNote: "Rows that exist in the platform but are not in this file will NOT be deleted. An import never deletes a record; to remove one, delete it inside the platform.",
      };
  const submit = async () => {
    if (!file) { setLocalError(t.noFile); return; }
    const format = file.name.toLowerCase().endsWith(".xer") ? "xer" : file.name.toLowerCase().endsWith(".csv") ? "csv" : file.name.toLowerCase().endsWith(".xlsx") ? "xlsx" : null;
    if (!format || (moduleCode === "schedule" ? format !== "xlsx" && format !== "xer" : format === "xer")) { setLocalError(t.typeError); return; }
    if (file.size > MAX_IMPORT_UPLOAD_BYTES) { setLocalError(t.sizeError); return; }
    setLocalError(null); setUploadError(null); setCurrentImportId(null);
    try {
      const target = await createUpload.mutateAsync({ tenantId, projectId, moduleCode, fileName: file.name, sourceFormat: format });
      setUploadPercent(0);
      await putToStorage(target.uploadUrl, target.headers, file, setUploadPercent);
      setUploadPercent(null);
      await registerUpload.mutateAsync({ tenantId, projectId, moduleCode, fileName: file.name, sourceFormat: format, uploadKey: target.uploadKey, duplicateMode });
    } catch (error) {
      setUploadPercent(null);
      setUploadError(error instanceof UploadFailure ? (isArabic ? "تعذّر رفع الملف إلى التخزين. تحقق من الاتصال وأعد المحاولة." : "The file could not be uploaded to storage. Check your connection and try again.") : getLocalizedProjectError(error, isArabic));
    }
  };
  const requiredFields = moduleCode === "openingBalances" ? ["warehouseCode", "materialCode", "quantity", "unitCost"] : moduleCode === "wbs" ? ["code", "name"] : moduleCode === "budget" ? ["costCode", "originalAmount", "currentAmount"] : moduleCode === "contracts" ? ["code", "title", "counterparty", "contractValue", "currency"] : moduleCode === "materials" ? ["code", "description", "unitOfMeasure", "category"] : ["recordType", "wbsCode"];
  // The blank template is generated by the server from the importer's own field table, so it cannot drift from what the importer reads.
  const templateFile = trpc.dataImports.template.useMutation({ onSuccess: file => {
    const bytes = Uint8Array.from(window.atob(file.base64), value => value.charCodeAt(0));
    const url = URL.createObjectURL(new Blob([bytes], { type: file.contentType })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = file.fileName; anchor.click(); URL.revokeObjectURL(url);
  } });
  const downloadTemplate = () => templateFile.mutate({ moduleCode, locale: isArabic ? "ar" : "en" });
  // Export → edit → re-import: before anything is written, the rows the file would add, change (old → new) or conflict on.
  const previewable = current?.status === "validated" && !current.analysis?.errors.length;
  const diff = trpc.dataImports.diff.useQuery({ tenantId, projectId, importId: current?.id ?? "00000000-0000-0000-0000-000000000000" }, { enabled: Boolean(previewable), retry: false });
  const diffReady = diff.data?.supported ? diff.data : undefined;
  const selected = detail.data;
  const importErrorLabel = (code: string) => ({
    IMPORT_REFERENCE_NOT_FOUND: isArabic ? "المستودع أو المادة غير موجود في هذا المشروع أو غير فعّال." : "The warehouse or material does not exist in this project or is not active.",
    IMPORT_SINGLE_SHEET_REQUIRED: isArabic ? "يجب أن يحتوي الملف على ورقة عمل واحدة فقط." : "The file must contain exactly one worksheet.",
    IMPORT_UNSUPPORTED_COLUMN: isArabic ? "يوجد عمود غير معتمد لنوع البيانات المحدد." : "The file includes a column not approved for the selected data type.",
    IMPORT_DUPLICATE_FILE_KEY: isArabic ? "يوجد رمز مكرر داخل الملف. صحح التكرار قبل التحليل." : "A business key is repeated inside the file. Correct the duplicate before analysis.",
      IMPORT_MAPPING_INVALID: isArabic ? "لا يجوز ربط عمود ملف واحد بأكثر من حقل معتمد." : "A file column cannot be assigned to more than one approved field.",
      IMPORT_INVALID_CURRENCY: isArabic ? "العملة يجب أن تكون الريال السعودي SAR؛ في الإصدار الأول لا تُقبل عملة أخرى." : "The currency must be the Saudi riyal, SAR; no other currency is accepted in this first version.",
      SCHEDULE_RECORD_TYPE_INVALID: isArabic ? "نوع السجل يجب أن يكون WBS أو Activity." : "Record type must be WBS or Activity.",
      SCHEDULE_WBS_REFERENCE_UNRESOLVED: isArabic ? "يشير النشاط إلى رمز WBS غير موجود في الملف." : "The activity references a WBS code that is absent from the file.",
      SCHEDULE_DATE_INVALID: isArabic ? "تاريخ النشاط غير صالح أو أن النهاية تسبق البداية." : "An activity date is invalid or the finish precedes the start.",
      SCHEDULE_STATUS_INVALID: isArabic ? "حالة النشاط غير معتمدة في قالب الجدول الزمني." : "The activity status is not supported by the schedule template.",
      SCHEDULE_FORMAT_INVALID: isArabic ? "الجدول الزمني يقبل XLSX أو XER فقط." : "Schedule import accepts XLSX or XER only.",
      IMPORT_FORMAT_INVALID: isArabic ? "صيغة الملف لا تتوافق مع القالب المحدد." : "The file format does not match the selected template.",
      XER_REQUIRED_TABLE_MISSING: isArabic ? "ملف XER يجب أن يحتوي على جدولي PROJWBS وTASK." : "The XER file must include PROJWBS and TASK tables.",
      XER_UNSUPPORTED_TABLE: isArabic ? "يحتوي ملف XER على جدول غير مدعوم في قالب الجدول الزمني المحكوم." : "The XER file includes a table that the controlled schedule template does not support.",
  }[code] ?? code);

  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] bg-[var(--dashio-indigo)]/10 text-primary"><FileSpreadsheet className="h-5 w-5" /></span><div><h2 className="font-semibold">{t.title}</h2><p className="mt-1 text-xs text-muted-foreground">{t.note}</p></div></div><span className="rounded-full bg-[var(--dashio-aqua)]/10 px-3 py-1 text-xs font-semibold text-[var(--dashio-aqua-deep)]">{t.workflow}</span></div>
      <div className="mt-5 grid gap-3 md:grid-cols-3"><Step icon={ListChecks} number="1" title={t.step1} /><Step icon={Upload} number="2" title={t.step2} /><Step icon={BadgeCheck} number="3" title={t.step3} /></div>
      <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--dashio-aqua)]/20 bg-[var(--dashio-aqua)]/[.07] p-4 text-sm text-foreground"><p className="font-semibold">{t.instructions}</p><p className="mt-2 text-xs text-muted-foreground">{t.accepted}</p><p className="mt-1 text-xs font-medium text-foreground">{t.fileRules}</p></div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,.8fr)]"><div className="rounded-[var(--radius-md)] border border-border p-4"><p className="text-sm font-semibold">{t.step1}</p><div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant={moduleCode === "wbs" ? "default" : "outline"} onClick={() => { setModuleCode("wbs"); setMappingOverride({}); setLocalError(null); }}>{t.wbs}</Button><Button type="button" variant={moduleCode === "budget" ? "default" : "outline"} onClick={() => { setModuleCode("budget"); setMappingOverride({}); setLocalError(null); }}>{t.budget}</Button><Button type="button" variant={moduleCode === "contracts" ? "default" : "outline"} onClick={() => { setModuleCode("contracts"); setMappingOverride({}); setLocalError(null); }}>{t.contracts}</Button><Button type="button" variant={moduleCode === "materials" ? "default" : "outline"} onClick={() => { setModuleCode("materials"); setMappingOverride({}); setLocalError(null); }}>{t.materials}</Button><Button type="button" variant={moduleCode === "schedule" ? "default" : "outline"} onClick={() => { setModuleCode("schedule"); setMappingOverride({}); setLocalError(null); }}>{t.schedule}</Button><Button type="button" variant={moduleCode === "openingBalances" ? "default" : "outline"} onClick={() => { setModuleCode("openingBalances"); setMappingOverride({}); setLocalError(null); }}>{t.openingBalances}</Button></div><p className="mt-4 text-xs font-semibold text-muted-foreground">{t.requiredColumns}</p><div className="mt-2 flex flex-wrap gap-2">{importTemplateHeaders[moduleCode][isArabic ? "ar" : "en"].map(header => <span key={header} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">{header}</span>)}</div><Button type="button" variant="outline" className="mt-4" onClick={downloadTemplate}><Download className="me-2 h-4 w-4" />{t.template}</Button><p className="mt-2 text-xs leading-5 text-muted-foreground">{t.templateNote}</p>{moduleCode === "schedule" && <p className="mt-2 text-xs leading-5 text-amber-800">{t.scheduleRules}</p>}{moduleCode === "openingBalances" && <p className="mt-2 text-xs leading-5 text-amber-800">{t.openingRules}</p>}</div><WriteGate permission={importModulePermissions[moduleCode]} projectId={projectId}><div className="rounded-[var(--radius-md)] border border-border p-4"><p className="text-sm font-semibold">{t.step2}</p><label className="mt-3 block text-xs font-medium text-foreground">{t.duplicateMode}<select className="mt-1 block w-full rounded-[var(--radius-sm)] border border-input bg-card p-2 text-sm" value={duplicateMode} onChange={event => setDuplicateMode(event.target.value as DuplicateMode)}>{(Object.keys(t.duplicate) as DuplicateMode[]).map(mode => <option key={mode} value={mode}>{t.duplicate[mode]}</option>)}</select></label><Input className="mt-3" aria-label={t.choose} type="file" accept={moduleCode === "schedule" ? ".xlsx,.xer" : ".xlsx,.csv"} onChange={event => { setFile(event.target.files?.[0] ?? null); setLocalError(null); }} /><Button className="mt-3 w-full" disabled={busy} onClick={submit}>{t.analyze}</Button>{file ? <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><FileCheck2 className="h-3.5 w-3.5 text-[var(--dashio-aqua-deep)]" />{file.name}</p> : null}{uploadPercent !== null && <p role="status" className="mt-2 text-xs text-muted-foreground">{t.uploading} {uploadPercent}%</p>}</div></WriteGate></div>
      {localError && <p role="alert" className="mt-3 text-xs text-red-700">{localError}</p>}
      {uploadError && <p role="alert" className="mt-3 text-xs text-red-700">{uploadError}</p>}
      {createUpload.error && !uploadError && <p role="alert" className="mt-3 text-xs text-red-700">{getLocalizedProjectError(createUpload.error, isArabic)}</p>}
      {registerUpload.error && !uploadError && <p role="alert" className="mt-3 text-xs text-red-700">{getLocalizedProjectError(registerUpload.error, isArabic)}</p>}
      {current && <div className="mt-3 rounded-lg bg-[#e6f4f3] p-3 text-xs" data-testid="import-job">
        <p className="font-medium">{t.status[current.status as keyof typeof t.status] ?? current.status}</p>
        {(current.status === "analyzing" || current.status === "importing") && <div role="status" aria-live="polite" className="mt-2">
          <p>{current.status === "analyzing" ? t.analyzing : t.importing}{current.progressStage ? ` — ${t.stage[current.progressStage as keyof typeof t.stage] ?? current.progressStage}` : ""} ({current.progressPercent}%)</p>
          <progress className="mt-1 h-2 w-full" max={100} value={current.progressPercent} aria-label={t.progressLabel} />
        </div>}
        {current.status === "failed" && <div role="alert" className="mt-2 rounded-[var(--radius-sm)] border border-red-200 bg-red-50 p-3 text-red-800">
          <p className="font-semibold">{t.failedTitle}</p>
          <p className="mt-1">{current.failureReason ? (isArabic ? getProjectError(current.failureReason).messages.ar : getProjectError(current.failureReason).messages.en) : t.failedTitle}</p>
        </div>}
        {(current.status === "uploaded" || current.status === "validated") && current.analysis && <>
          <p>{t.rows}: {current.totalRows}</p>
          <p>{t.errors}: {current.analysis.errorsTotal}</p>
          {Object.keys(current.analysis.mapping ?? {}).length > 0 && <div className="mt-2"><p className="font-medium">{t.mapping}</p><ul className="mt-1 list-disc ps-4">{Object.entries(current.analysis.mapping ?? {}).map(([field, header]) => <li key={field}>{t.field[field as keyof typeof t.field] ?? field}: {String(header)}</li>)}</ul></div>}
          {current.analysis.errors.length > 0 && <div className="mt-3 rounded-[var(--radius-sm)] border border-red-200 bg-red-50 p-3 text-xs text-red-800"><p className="font-semibold">{t.errors}</p><ul className="mt-1 space-y-1">{current.analysis.errors.map((error, index) => <li key={`${error.code}-${error.field ?? ""}-${index}`}>{importErrorLabel(error.code)}{error.field ? ` (${error.field})` : ""}</li>)}</ul>{current.analysis.errorsTotal > current.analysis.errorsListed && <p className="mt-1">{t.moreErrors}</p>}</div>}
          {current.analysis.errors.length > 0 && current.analysis.headers.length > 0 && <WriteGate permission={importModulePermissions[moduleCode]} projectId={projectId}><div className="mt-3 space-y-2"><p className="font-medium">{t.chooseMapping}</p>{requiredFields.map(field => <label className="block" key={field}>{t.field[field as keyof typeof t.field] ?? field}<select className="mt-1 block w-full rounded border p-1" value={mappingOverride[field] ?? ""} onChange={event => setMappingOverride(existing => ({ ...existing, [field]: event.target.value }))}><option value="">{t.chooseMapping}</option>{current.analysis!.headers.map(header => <option key={header} value={header}>{header}</option>)}</select></label>)}<Button type="button" disabled={reanalyze.isPending || requiredFields.some(field => !mappingOverride[field])} onClick={() => reanalyze.mutate({ tenantId, projectId, importId: current.id, mappingOverride })}>{t.reanalyze}</Button></div></WriteGate>}
          {current.status === "validated" && !current.analysis.errors.length ? <WriteGate permission={importModulePermissions[moduleCode]} projectId={projectId}>{diffReady && <DiffPreview diff={diffReady} isArabic={isArabic} t={t} />}{diff.error && <p role="alert" className="mt-3 text-xs text-red-700">{getLocalizedProjectError(diff.error, isArabic)}</p>}<Button className="mt-3" type="button" disabled={confirm.isPending || diff.isLoading || Boolean(diffReady && diffReady.summary.conflict > 0)} onClick={() => confirm.mutate({ tenantId, projectId, importId: current.id, approvedDiffHash: diffReady?.diffHash })}>{t.confirm}</Button></WriteGate> : <p className="mt-3 text-xs font-medium text-amber-800">{t.blocked}</p>}
        </>}
        {current.status === "completed" && <p className="mt-2">{t.created}: {current.createdRows} · {t.updated}: {current.updatedRows} · {t.skipped}: {current.skippedRows}</p>}
      </div>}
      {progress.error && <p role="alert" className="mt-3 text-xs text-red-700">{getLocalizedProjectError(progress.error, isArabic)}</p>}
      {confirm.error && <p className="mt-3 text-xs text-red-700">{getLocalizedProjectError(confirm.error, isArabic)}</p>}
      <SourceNotice query={imports} isArabic={isArabic} title={isArabic ? "سجل الاستيرادات السابقة" : "Previous imports"} />
      {imports.data?.length ? <div className="mt-5 border-t border-slate-100 pt-4"><h3 className="text-sm font-medium">{t.history}</h3><div className="mt-2 space-y-2">{imports.data.slice(0, 5).map(record => <div className="rounded-lg bg-slate-50 p-2 text-xs" key={record.id}><div className="flex items-center justify-between gap-3"><span className="min-w-0 truncate">{record.fileName}</span><span className="text-slate-500">{t.status[record.status] ?? record.status}</span></div><p className="mt-1 text-slate-500">{t.duplicate[record.duplicateMode as DuplicateMode] ?? record.duplicateMode}</p>{record.status === "completed" && <p className="mt-1 text-slate-600">{t.created}: {record.createdRows} · {t.updated}: {record.updatedRows} · {t.skipped}: {record.skippedRows}</p>}<div className="mt-2 flex flex-wrap gap-2">{record.status === "validated" && <Button type="button" size="sm" disabled={confirm.isPending} onClick={() => confirm.mutate({ tenantId, projectId, importId: record.id })}>{t.confirm}</Button>}<Button type="button" size="sm" variant="outline" onClick={() => setSelectedImportId(record.id)}>{t.viewDetails}</Button></div></div>)}</div></div> : null}
      {selectedImportId && <div className="mt-5 border-t border-slate-100 pt-4"><h3 className="text-sm font-medium">{t.details}</h3>{detail.error && <p className="mt-2 text-xs text-red-700">{getLocalizedProjectError(detail.error, isArabic)}</p>}{selected && <div className="mt-2 rounded-lg bg-slate-50 p-3 text-xs"><p className="font-medium">{selected.fileName}</p><p className="mt-1 text-slate-500">{t.duplicate[selected.duplicateMode as DuplicateMode] ?? selected.duplicateMode}</p>{selected.rowResults.length ? <div className="mt-3"><p className="font-medium">{t.results}</p><ul className="mt-1 space-y-1">{selected.rowResults.slice(0, 20).map(result => <li key={`${result.rowNumber}-${result.action}`} className="flex justify-between gap-3"><span>#{result.rowNumber} · {result.rowKey}</span><span>{t.action[result.action]}</span></li>)}</ul></div> : <p className="mt-3 text-slate-500">{t.noRowResults}</p>}{selected.errors.length ? <div className="mt-3"><p className="font-medium">{t.validationErrors}</p><ul className="mt-1 space-y-1">{selected.errors.slice(0, 20).map(error => <li key={`${error.rowNumber}-${error.code}`}>#{error.rowNumber} · {error.code}</li>)}</ul></div> : null}</div>}</div>}
    </section>
  );
}

function Step({ icon: Icon, number, title }: { icon: typeof ListChecks; number: string; title: string }) {
  return <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-muted/40 p-3"><span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{number}</span><Icon className="h-4 w-4 text-primary" /><span className="text-xs font-semibold text-foreground">{title}</span></div>;
}

type DiffData = Extract<inferRouterOutputs<AppRouter>["dataImports"]["diff"], { supported: true }>;
function DiffPreview({ diff, isArabic, t }: { diff: DiffData; isArabic: boolean; t: Record<string, any> }) {
  const kindLabel = (kind: string) => (kind === "new" ? t.diffNew : kind === "modified" ? t.diffModified : t.diffConflict);
  const kindClass = (kind: string) => (kind === "new" ? "bg-emerald-100 text-emerald-800" : kind === "modified" ? "bg-amber-100 text-amber-800" : "bg-red-100 text-red-800");
  const noChanges = diff.summary.new === 0 && diff.summary.modified === 0 && diff.summary.conflict === 0;
  return (
    <div className="mt-3 rounded-[var(--radius-sm)] border border-border bg-background p-3" data-testid="import-diff">
      <p className="font-semibold">{t.diffTitle}</p>
      <p className="mt-1">{t.diffNew}: {diff.summary.new} · {t.diffModified}: {diff.summary.modified} · {t.diffUnchanged}: {diff.summary.unchanged} · {t.diffConflict}: {diff.summary.conflict} · {t.diffMissing}: {diff.summary.missing}</p>
      {noChanges && <p className="mt-1 text-muted-foreground">{t.diffNoChanges}</p>}
      {diff.summary.conflict > 0 && <p role="alert" className="mt-1 text-red-700">{t.diffConflictNote}</p>}
      {diff.entries.length > 0 && <div className="mt-2 overflow-x-auto"><table className="w-full text-start text-xs"><thead><tr className="text-muted-foreground"><th className="p-1 text-start">#</th><th className="p-1 text-start">{isArabic ? "المفتاح" : "Key"}</th><th className="p-1 text-start">{isArabic ? "الحالة" : "Status"}</th><th className="p-1 text-start">{isArabic ? "الحقل" : "Field"}</th><th className="p-1 text-start">{t.diffOld}</th><th className="p-1 text-start">{t.diffNewValue}</th></tr></thead><tbody>
        {diff.entries.flatMap(entry => (entry.changes.length ? entry.changes : [{ field: "", oldValue: "", newValue: "" }]).map((change, index) => (
          <tr key={`${entry.rowNumber}-${index}`} className="border-t border-border"><td className="p-1">{index === 0 ? entry.rowNumber : ""}</td><td className="p-1">{index === 0 ? entry.key : ""}</td><td className="p-1">{index === 0 ? <span className={`rounded-full px-2 py-0.5 ${kindClass(entry.kind)}`}>{kindLabel(entry.kind)}</span> : ""}</td><td className="p-1">{t.field[change.field] ?? change.field}</td><td className="p-1">{entry.kind === "modified" ? change.oldValue : ""}</td><td className="p-1">{entry.kind === "conflict" ? "" : change.newValue}</td></tr>
        )))}
      </tbody></table></div>}
      {diff.shownTotal > diff.entries.length + diff.offset && <p className="mt-1 text-muted-foreground">{t.diffMore}</p>}
      {diff.missing.length > 0 && <div className="mt-2 rounded-[var(--radius-sm)] border border-border bg-muted/40 p-2" data-testid="import-diff-missing"><p className="font-medium">{t.diffMissingNote}</p><p className="mt-1 text-muted-foreground">{t.diffMissing}: {diff.missing.map(row => row.key).join("، ")}{diff.missingTotal > diff.missing.length ? " …" : ""}</p></div>}
      <p className="mt-2 font-medium">{t.diffApprove}</p>
    </div>
  );
}
