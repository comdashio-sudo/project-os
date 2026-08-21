import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { BadgeCheck, Download, FileCheck2, FileSpreadsheet, ListChecks, Upload } from "lucide-react";
import React, { useState } from "react";

type DuplicateMode = "update_existing" | "upsert" | "skip_duplicates" | "fail_on_duplicate";

export function ProjectImports({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { isArabic } = useLanguage();
  const [moduleCode, setModuleCode] = useState<"wbs" | "budget" | "contracts" | "materials">("wbs");
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
  const analyze = trpc.dataImports.analyze.useMutation({
    onSuccess: result => {
      setSelectedImportId(result.id);
      void imports.refetch();
    },
  });
  const reanalyze = trpc.dataImports.reanalyze.useMutation({
    onSuccess: result => {
      setSelectedImportId(result.id);
      void imports.refetch();
    },
  });
  const confirm = trpc.dataImports.confirm.useMutation({
    onSuccess: result => {
      setSelectedImportId(result.id);
      void imports.refetch();
      void detail.refetch();
    },
  });
  const t = isArabic
    ? {
        title: "استيراد بيانات",
        note: "ارفع XLSX أو CSV، واختر سياسة التكرار، ثم راجع النتيجة قبل تأكيد الكتابة التشغيلية.",
        wbs: "WBS",
        budget: "الميزانية",
        contracts: "العقود",
        materials: "المواد",
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
        field: { code: "الرمز", name: "الاسم", plannedValue: "القيمة المخططة", costCode: "رمز التكلفة", originalAmount: "القيمة الأصلية", currentAmount: "القيمة الحالية", title: "اسم العقد", counterparty: "الطرف المتعاقد", contractValue: "قيمة العقد", currency: "العملة" },
        status: { uploaded: "مرفوع", validated: "جاهز للتأكيد", completed: "مكتمل", failed: "فشل", importing: "قيد التنفيذ", cancelled: "ملغى", confirmed: "مؤكد" },
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
        accepted: "الملفات المعتمدة: XLSX أو CSV فقط، حتى 10 MB.",
        fileRules: "ملف واحد، ورقة واحدة، ونوع بيانات واحد. يرفض النظام أي عمود غير معتمد أو رمز مكرر داخل الملف.",
        noFile: "اختر ملفًا قبل التحليل.",
        typeError: "يُقبل فقط ملف XLSX أو CSV.",
        sizeError: "حجم الملف أكبر من الحد المسموح به وهو 10 MB.",
        blocked: "التأكيد محجوب حتى يصبح التحليل خاليًا من أخطاء التحقق.",
      }
    : {
        title: "Data import",
        note: "Upload XLSX or CSV, select the duplicate policy, then review the result before confirming the operational write.",
        wbs: "WBS",
        budget: "Budget",
        contracts: "Contracts",
        materials: "Materials",
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
        field: { code: "Code", name: "Name", plannedValue: "Planned value", costCode: "Cost code", originalAmount: "Original amount", currentAmount: "Current amount", title: "Contract title", counterparty: "Counterparty", contractValue: "Contract value", currency: "Currency" },
        status: { uploaded: "Uploaded", validated: "Ready to confirm", completed: "Completed", failed: "Failed", importing: "Importing", cancelled: "Cancelled", confirmed: "Confirmed" },
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
        accepted: "Accepted files: XLSX or CSV only, up to 10 MB.",
        fileRules: "One file, one sheet, and one data type. The system rejects unapproved columns and repeated keys inside the file.",
        noFile: "Choose a file before analysis.",
        typeError: "Only XLSX or CSV files are accepted.",
        sizeError: "The file exceeds the 10 MB limit.",
        blocked: "Confirmation remains blocked until analysis has no validation errors.",
      };
  const submit = async () => {
    if (!file) { setLocalError(t.noFile); return; }
    const format = file.name.toLowerCase().endsWith(".csv") ? "csv" : file.name.toLowerCase().endsWith(".xlsx") ? "xlsx" : null;
    if (!format) { setLocalError(t.typeError); return; }
    if (file.size > 10 * 1024 * 1024) { setLocalError(t.sizeError); return; }
    setLocalError(null);
    const bytes = await file.arrayBuffer();
    const base64 = btoa(Array.from(new Uint8Array(bytes), byte => String.fromCharCode(byte)).join(""));
    analyze.mutate({ tenantId, projectId, moduleCode, fileName: file.name, sourceFormat: format, base64, duplicateMode });
  };
  const requiredFields = moduleCode === "wbs" ? ["code", "name"] : moduleCode === "budget" ? ["costCode", "originalAmount", "currentAmount"] : moduleCode === "contracts" ? ["code", "title", "counterparty", "contractValue", "currency"] : ["code", "description", "unitOfMeasure", "category"];
  const templateHeaders = moduleCode === "wbs"
    ? isArabic ? ["رمز WBS", "اسم WBS", "القيمة المخططة"] : ["WBS Code", "WBS Name", "Planned Value"]
    : moduleCode === "budget" ? isArabic ? ["رمز التكلفة", "القيمة الأصلية", "القيمة الحالية"] : ["Cost Code", "Original Amount", "Current Amount"]
      : moduleCode === "contracts" ? isArabic ? ["رمز العقد", "اسم العقد", "الطرف المتعاقد", "قيمة العقد", "العملة"] : ["Contract Code", "Contract Title", "Counterparty", "Contract Value", "Currency"] : isArabic ? ["رمز المادة", "وصف المادة", "وحدة القياس", "الفئة", "المواصفة المرجعية"] : ["Material Code", "Description", "Unit of Measure", "Category", "Reference Specification"];
  const templateExample = moduleCode === "wbs" ? ["1.1", isArabic ? "الأعمال التمهيدية" : "Preliminaries", "100000"] : moduleCode === "budget" ? ["CIVIL", "500000", "525000"] : moduleCode === "contracts" ? ["CON-001", isArabic ? "عقد الأعمال المدنية" : "Civil works contract", isArabic ? "المقاول الرئيسي" : "Main Contractor", "2500000", "SAR"] : ["MAT-CONC-40", isArabic ? "خرسانة إنشائية" : "Structural concrete", "m3", isArabic ? "خرسانة" : "Concrete", "ASTM C94"];
  const downloadTemplate = () => {
    const content = `\uFEFF${templateHeaders.join(",")}\n${templateExample.join(",")}\n`;
    const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${moduleCode}-template.csv`; anchor.click(); URL.revokeObjectURL(url);
  };
  const analysisHeaders = analyze.data?.headers ?? [];
  const selected = detail.data;
  const importErrorLabel = (code: string) => ({
    IMPORT_SINGLE_SHEET_REQUIRED: isArabic ? "يجب أن يحتوي الملف على ورقة عمل واحدة فقط." : "The file must contain exactly one worksheet.",
    IMPORT_UNSUPPORTED_COLUMN: isArabic ? "يوجد عمود غير معتمد لنوع البيانات المحدد." : "The file includes a column not approved for the selected data type.",
    IMPORT_DUPLICATE_FILE_KEY: isArabic ? "يوجد رمز مكرر داخل الملف. صحح التكرار قبل التحليل." : "A business key is repeated inside the file. Correct the duplicate before analysis.",
      IMPORT_MAPPING_INVALID: isArabic ? "لا يجوز ربط عمود ملف واحد بأكثر من حقل معتمد." : "A file column cannot be assigned to more than one approved field.",
      IMPORT_INVALID_CURRENCY: isArabic ? "العملة يجب أن تكون رمزًا من ثلاثة أحرف مثل SAR أو USD." : "Currency must be a three-letter code such as SAR or USD.",
  }[code] ?? code);

  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-card p-5 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] bg-[var(--dashio-indigo)]/10 text-primary"><FileSpreadsheet className="h-5 w-5" /></span><div><h2 className="font-semibold">{t.title}</h2><p className="mt-1 text-xs text-muted-foreground">{t.note}</p></div></div><span className="rounded-full bg-[var(--dashio-aqua)]/10 px-3 py-1 text-xs font-semibold text-[var(--dashio-aqua-deep)]">{t.workflow}</span></div>
      <div className="mt-5 grid gap-3 md:grid-cols-3"><Step icon={ListChecks} number="1" title={t.step1} /><Step icon={Upload} number="2" title={t.step2} /><Step icon={BadgeCheck} number="3" title={t.step3} /></div>
      <div className="mt-5 rounded-[var(--radius-md)] border border-[var(--dashio-aqua)]/20 bg-[var(--dashio-aqua)]/[.07] p-4 text-sm text-foreground"><p className="font-semibold">{t.instructions}</p><p className="mt-2 text-xs text-muted-foreground">{t.accepted}</p><p className="mt-1 text-xs font-medium text-foreground">{t.fileRules}</p></div>
      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(260px,.8fr)]"><div className="rounded-[var(--radius-md)] border border-border p-4"><p className="text-sm font-semibold">{t.step1}</p><div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant={moduleCode === "wbs" ? "default" : "outline"} onClick={() => { setModuleCode("wbs"); setMappingOverride({}); setLocalError(null); }}>{t.wbs}</Button><Button type="button" variant={moduleCode === "budget" ? "default" : "outline"} onClick={() => { setModuleCode("budget"); setMappingOverride({}); setLocalError(null); }}>{t.budget}</Button><Button type="button" variant={moduleCode === "contracts" ? "default" : "outline"} onClick={() => { setModuleCode("contracts"); setMappingOverride({}); setLocalError(null); }}>{t.contracts}</Button><Button type="button" variant={moduleCode === "materials" ? "default" : "outline"} onClick={() => { setModuleCode("materials"); setMappingOverride({}); setLocalError(null); }}>{t.materials}</Button></div><p className="mt-4 text-xs font-semibold text-muted-foreground">{t.requiredColumns}</p><div className="mt-2 flex flex-wrap gap-2">{templateHeaders.map(header => <span key={header} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">{header}</span>)}</div><Button type="button" variant="outline" className="mt-4" onClick={downloadTemplate}><Download className="me-2 h-4 w-4" />{t.template}</Button><p className="mt-2 text-xs leading-5 text-muted-foreground">{t.templateNote}</p></div><div className="rounded-[var(--radius-md)] border border-border p-4"><p className="text-sm font-semibold">{t.step2}</p><label className="mt-3 block text-xs font-medium text-foreground">{t.duplicateMode}<select className="mt-1 block w-full rounded-[var(--radius-sm)] border border-input bg-card p-2 text-sm" value={duplicateMode} onChange={event => setDuplicateMode(event.target.value as DuplicateMode)}>{(Object.keys(t.duplicate) as DuplicateMode[]).map(mode => <option key={mode} value={mode}>{t.duplicate[mode]}</option>)}</select></label><Input className="mt-3" aria-label={t.choose} type="file" accept=".xlsx,.csv" onChange={event => { setFile(event.target.files?.[0] ?? null); setLocalError(null); }} /><Button className="mt-3 w-full" disabled={analyze.isPending} onClick={submit}>{t.analyze}</Button>{file ? <p className="mt-2 flex items-center gap-1 text-xs text-muted-foreground"><FileCheck2 className="h-3.5 w-3.5 text-[var(--dashio-aqua-deep)]" />{file.name}</p> : null}</div></div>
      {localError && <p role="alert" className="mt-3 text-xs text-red-700">{localError}</p>}
      {analyze.error && <p className="mt-3 text-xs text-red-700">{getLocalizedProjectError(analyze.error, isArabic)}</p>}
      {analyze.data && <div className="mt-3 rounded-lg bg-[#e6f4f3] p-3 text-xs">
        <p>{t.rows}: {analyze.data.totalRows}</p>
        <p>{t.errors}: {analyze.data.errors.length}</p>
        {Object.keys(analyze.data.mapping ?? {}).length > 0 && <div className="mt-2"><p className="font-medium">{t.mapping}</p><ul className="mt-1 list-disc ps-4">{Object.entries(analyze.data.mapping ?? {}).map(([field, header]) => <li key={field}>{t.field[field as keyof typeof t.field] ?? field}: {header}</li>)}</ul></div>}
        {analyze.data.errors.length > 0 && <div className="mt-3 rounded-[var(--radius-sm)] border border-red-200 bg-red-50 p-3 text-xs text-red-800"><p className="font-semibold">{t.errors}</p><ul className="mt-1 space-y-1">{analyze.data.errors.map((error, index) => <li key={`${error.code}-${error.field ?? ""}-${index}`}>{importErrorLabel(error.code)}{error.field ? ` (${error.field})` : ""}</li>)}</ul></div>}
        {analyze.data.errors.length > 0 && analysisHeaders.length > 0 && <div className="mt-3 space-y-2"><p className="font-medium">{t.chooseMapping}</p>{requiredFields.map(field => <label className="block" key={field}>{t.field[field as keyof typeof t.field] ?? field}<select className="mt-1 block w-full rounded border p-1" value={mappingOverride[field] ?? ""} onChange={event => setMappingOverride(current => ({ ...current, [field]: event.target.value }))}><option value="">{t.chooseMapping}</option>{analysisHeaders.map(header => <option key={header} value={header}>{header}</option>)}</select></label>)}<Button type="button" disabled={reanalyze.isPending || requiredFields.some(field => !mappingOverride[field])} onClick={() => reanalyze.mutate({ tenantId, projectId, importId: analyze.data!.id, mappingOverride })}>{t.reanalyze}</Button></div>}
        {analyze.data.status === "validated" && !analyze.data.errors.length ? <Button className="mt-3" type="button" disabled={confirm.isPending} onClick={() => confirm.mutate({ tenantId, projectId, importId: analyze.data!.id })}>{t.confirm}</Button> : <p className="mt-3 text-xs font-medium text-amber-800">{t.blocked}</p>}
      </div>}
      {confirm.error && <p className="mt-3 text-xs text-red-700">{getLocalizedProjectError(confirm.error, isArabic)}</p>}
      {confirm.data && <p className="mt-3 rounded-lg bg-[#e6f4f3] p-3 text-xs">{t.created}: {confirm.data.createdRows} · {t.updated}: {confirm.data.updatedRows} · {t.skipped}: {confirm.data.skippedRows}</p>}
      {imports.data?.length ? <div className="mt-5 border-t border-slate-100 pt-4"><h3 className="text-sm font-medium">{t.history}</h3><div className="mt-2 space-y-2">{imports.data.slice(0, 5).map(record => <div className="rounded-lg bg-slate-50 p-2 text-xs" key={record.id}><div className="flex items-center justify-between gap-3"><span className="min-w-0 truncate">{record.fileName}</span><span className="text-slate-500">{t.status[record.status] ?? record.status}</span></div><p className="mt-1 text-slate-500">{t.duplicate[record.duplicateMode as DuplicateMode] ?? record.duplicateMode}</p>{record.status === "completed" && <p className="mt-1 text-slate-600">{t.created}: {record.createdRows} · {t.updated}: {record.updatedRows} · {t.skipped}: {record.skippedRows}</p>}<div className="mt-2 flex flex-wrap gap-2">{record.status === "validated" && <Button type="button" size="sm" disabled={confirm.isPending} onClick={() => confirm.mutate({ tenantId, projectId, importId: record.id })}>{t.confirm}</Button>}<Button type="button" size="sm" variant="outline" onClick={() => setSelectedImportId(record.id)}>{t.viewDetails}</Button></div></div>)}</div></div> : null}
      {selectedImportId && <div className="mt-5 border-t border-slate-100 pt-4"><h3 className="text-sm font-medium">{t.details}</h3>{detail.error && <p className="mt-2 text-xs text-red-700">{getLocalizedProjectError(detail.error, isArabic)}</p>}{selected && <div className="mt-2 rounded-lg bg-slate-50 p-3 text-xs"><p className="font-medium">{selected.fileName}</p><p className="mt-1 text-slate-500">{t.duplicate[selected.duplicateMode as DuplicateMode] ?? selected.duplicateMode}</p>{selected.rowResults.length ? <div className="mt-3"><p className="font-medium">{t.results}</p><ul className="mt-1 space-y-1">{selected.rowResults.slice(0, 20).map(result => <li key={`${result.rowNumber}-${result.action}`} className="flex justify-between gap-3"><span>#{result.rowNumber} · {result.rowKey}</span><span>{t.action[result.action]}</span></li>)}</ul></div> : <p className="mt-3 text-slate-500">{t.noRowResults}</p>}{selected.errors.length ? <div className="mt-3"><p className="font-medium">{t.validationErrors}</p><ul className="mt-1 space-y-1">{selected.errors.slice(0, 20).map(error => <li key={`${error.rowNumber}-${error.code}`}>#{error.rowNumber} · {error.code}</li>)}</ul></div> : null}</div>}</div>}
    </section>
  );
}

function Step({ icon: Icon, number, title }: { icon: typeof ListChecks; number: string; title: string }) {
  return <div className="flex items-center gap-3 rounded-[var(--radius-md)] border border-border bg-muted/40 p-3"><span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">{number}</span><Icon className="h-4 w-4 text-primary" /><span className="text-xs font-semibold text-foreground">{title}</span></div>;
}
