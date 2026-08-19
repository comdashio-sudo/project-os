import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { FileSpreadsheet } from "lucide-react";
import React, { useState } from "react";

type DuplicateMode = "update_existing" | "upsert" | "skip_duplicates" | "fail_on_duplicate";

export function ProjectImports({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { isArabic } = useLanguage();
  const [moduleCode, setModuleCode] = useState<"wbs" | "budget">("wbs");
  const [file, setFile] = useState<File | null>(null);
  const [duplicateMode, setDuplicateMode] = useState<DuplicateMode>("fail_on_duplicate");
  const [mappingOverride, setMappingOverride] = useState<Record<string, string>>({});
  const [selectedImportId, setSelectedImportId] = useState<string | null>(null);
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
        field: { code: "الرمز", name: "الاسم", plannedValue: "القيمة المخططة", costCode: "رمز التكلفة", originalAmount: "القيمة الأصلية", currentAmount: "القيمة الحالية" },
        status: { uploaded: "مرفوع", validated: "جاهز للتأكيد", completed: "مكتمل", failed: "فشل", importing: "قيد التنفيذ", cancelled: "ملغى", confirmed: "مؤكد" },
        duplicate: { fail_on_duplicate: "إيقاف الاستيراد عند وجود تكرار", skip_duplicates: "تجاوز الصفوف الموجودة", update_existing: "تحديث الصفوف الموجودة فقط", upsert: "إنشاء الجديد وتحديث الموجود" },
        action: { created: "تم الإنشاء", updated: "تم التحديث", skipped: "تم التجاوز" },
      }
    : {
        title: "Data import",
        note: "Upload XLSX or CSV, select the duplicate policy, then review the result before confirming the operational write.",
        wbs: "WBS",
        budget: "Budget",
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
        field: { code: "Code", name: "Name", plannedValue: "Planned value", costCode: "Cost code", originalAmount: "Original amount", currentAmount: "Current amount" },
        status: { uploaded: "Uploaded", validated: "Ready to confirm", completed: "Completed", failed: "Failed", importing: "Importing", cancelled: "Cancelled", confirmed: "Confirmed" },
        duplicate: { fail_on_duplicate: "Stop when a duplicate exists", skip_duplicates: "Skip existing rows", update_existing: "Update existing rows only", upsert: "Create new and update existing rows" },
        action: { created: "Created", updated: "Updated", skipped: "Skipped" },
      };
  const submit = async () => {
    if (!file) return;
    const bytes = await file.arrayBuffer();
    const base64 = btoa(Array.from(new Uint8Array(bytes), byte => String.fromCharCode(byte)).join(""));
    analyze.mutate({ tenantId, projectId, moduleCode, fileName: file.name, sourceFormat: file.name.toLowerCase().endsWith(".csv") ? "csv" : "xlsx", base64, duplicateMode });
  };
  const requiredFields = moduleCode === "wbs" ? ["code", "name"] : ["costCode", "originalAmount", "currentAmount"];
  const analysisHeaders = analyze.data?.headers ?? [];
  const selected = detail.data;

  return (
    <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
      <div className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-[#0e6b70]" /><h2 className="font-semibold">{t.title}</h2></div>
      <p className="mt-2 text-xs text-slate-500">{t.note}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant={moduleCode === "wbs" ? "default" : "outline"} onClick={() => setModuleCode("wbs")}>{t.wbs}</Button>
        <Button type="button" variant={moduleCode === "budget" ? "default" : "outline"} onClick={() => setModuleCode("budget")}>{t.budget}</Button>
      </div>
      <label className="mt-4 block text-xs font-medium text-slate-700">
        {t.duplicateMode}
        <select className="mt-1 block w-full rounded border border-slate-300 bg-white p-2 text-sm" value={duplicateMode} onChange={event => setDuplicateMode(event.target.value as DuplicateMode)}>
          {(Object.keys(t.duplicate) as DuplicateMode[]).map(mode => <option key={mode} value={mode}>{t.duplicate[mode]}</option>)}
        </select>
      </label>
      <Input className="mt-4" aria-label={t.choose} type="file" accept=".xlsx,.csv" onChange={event => setFile(event.target.files?.[0] ?? null)} />
      <Button className="mt-3 w-full" disabled={!file || analyze.isPending} onClick={submit}>{t.analyze}</Button>
      {analyze.error && <p className="mt-3 text-xs text-red-700">{getLocalizedProjectError(analyze.error, isArabic)}</p>}
      {analyze.data && <div className="mt-3 rounded-lg bg-[#e6f4f3] p-3 text-xs">
        <p>{t.rows}: {analyze.data.totalRows}</p>
        <p>{t.errors}: {analyze.data.errors.length}</p>
        {Object.keys(analyze.data.mapping ?? {}).length > 0 && <div className="mt-2"><p className="font-medium">{t.mapping}</p><ul className="mt-1 list-disc ps-4">{Object.entries(analyze.data.mapping ?? {}).map(([field, header]) => <li key={field}>{t.field[field as keyof typeof t.field] ?? field}: {header}</li>)}</ul></div>}
        {analyze.data.errors.length > 0 && analysisHeaders.length > 0 && <div className="mt-3 space-y-2"><p className="font-medium">{t.chooseMapping}</p>{requiredFields.map(field => <label className="block" key={field}>{t.field[field as keyof typeof t.field] ?? field}<select className="mt-1 block w-full rounded border p-1" value={mappingOverride[field] ?? ""} onChange={event => setMappingOverride(current => ({ ...current, [field]: event.target.value }))}><option value="">{t.chooseMapping}</option>{analysisHeaders.map(header => <option key={header} value={header}>{header}</option>)}</select></label>)}<Button type="button" disabled={reanalyze.isPending || requiredFields.some(field => !mappingOverride[field])} onClick={() => reanalyze.mutate({ tenantId, projectId, importId: analyze.data!.id, mappingOverride })}>{t.reanalyze}</Button></div>}
        {analyze.data.status === "validated" && !analyze.data.errors.length && <Button className="mt-3" type="button" disabled={confirm.isPending} onClick={() => confirm.mutate({ tenantId, projectId, importId: analyze.data!.id })}>{t.confirm}</Button>}
      </div>}
      {confirm.error && <p className="mt-3 text-xs text-red-700">{getLocalizedProjectError(confirm.error, isArabic)}</p>}
      {confirm.data && <p className="mt-3 rounded-lg bg-[#e6f4f3] p-3 text-xs">{t.created}: {confirm.data.createdRows} · {t.updated}: {confirm.data.updatedRows} · {t.skipped}: {confirm.data.skippedRows}</p>}
      {imports.data?.length ? <div className="mt-5 border-t border-slate-100 pt-4"><h3 className="text-sm font-medium">{t.history}</h3><div className="mt-2 space-y-2">{imports.data.slice(0, 5).map(record => <div className="rounded-lg bg-slate-50 p-2 text-xs" key={record.id}><div className="flex items-center justify-between gap-3"><span className="min-w-0 truncate">{record.fileName}</span><span className="text-slate-500">{t.status[record.status] ?? record.status}</span></div><p className="mt-1 text-slate-500">{t.duplicate[record.duplicateMode as DuplicateMode] ?? record.duplicateMode}</p>{record.status === "completed" && <p className="mt-1 text-slate-600">{t.created}: {record.createdRows} · {t.updated}: {record.updatedRows} · {t.skipped}: {record.skippedRows}</p>}<div className="mt-2 flex flex-wrap gap-2">{record.status === "validated" && <Button type="button" size="sm" disabled={confirm.isPending} onClick={() => confirm.mutate({ tenantId, projectId, importId: record.id })}>{t.confirm}</Button>}<Button type="button" size="sm" variant="outline" onClick={() => setSelectedImportId(record.id)}>{t.viewDetails}</Button></div></div>)}</div></div> : null}
      {selectedImportId && <div className="mt-5 border-t border-slate-100 pt-4"><h3 className="text-sm font-medium">{t.details}</h3>{detail.error && <p className="mt-2 text-xs text-red-700">{getLocalizedProjectError(detail.error, isArabic)}</p>}{selected && <div className="mt-2 rounded-lg bg-slate-50 p-3 text-xs"><p className="font-medium">{selected.fileName}</p><p className="mt-1 text-slate-500">{t.duplicate[selected.duplicateMode as DuplicateMode] ?? selected.duplicateMode}</p>{selected.rowResults.length ? <div className="mt-3"><p className="font-medium">{t.results}</p><ul className="mt-1 space-y-1">{selected.rowResults.slice(0, 20).map(result => <li key={`${result.rowNumber}-${result.action}`} className="flex justify-between gap-3"><span>#{result.rowNumber} · {result.rowKey}</span><span>{t.action[result.action]}</span></li>)}</ul></div> : <p className="mt-3 text-slate-500">{t.noRowResults}</p>}{selected.errors.length ? <div className="mt-3"><p className="font-medium">{t.validationErrors}</p><ul className="mt-1 space-y-1">{selected.errors.slice(0, 20).map(error => <li key={`${error.rowNumber}-${error.code}`}>#{error.rowNumber} · {error.code}</li>)}</ul></div> : null}</div>}</div>}
    </section>
  );
}
