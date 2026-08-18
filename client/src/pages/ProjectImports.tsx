import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { FileSpreadsheet } from "lucide-react";
import { useState } from "react";

export function ProjectImports({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { isArabic } = useLanguage(); const [moduleCode, setModuleCode] = useState<"wbs" | "budget">("wbs"); const [file, setFile] = useState<File | null>(null);
  const imports = trpc.dataImports.list.useQuery({ tenantId, projectId }); const analyze = trpc.dataImports.analyze.useMutation({ onSuccess: () => imports.refetch() });
  const t = isArabic ? { title: "استيراد بيانات", note: "ارفع XLSX أو CSV؛ لا تُنفذ أي كتابة تشغيلية في هذه المرحلة.", wbs: "WBS", budget: "الميزانية", analyze: "تحليل الملف", rows: "الصفوف", errors: "أخطاء التحقق", choose: "اختر ملفًا" } : { title: "Data import", note: "Upload XLSX or CSV; this stage analyzes only and does not write operational records.", wbs: "WBS", budget: "Budget", analyze: "Analyze file", rows: "Rows", errors: "Validation errors", choose: "Choose a file" };
  const submit = async () => { if (!file) return; const bytes = await file.arrayBuffer(); const base64 = btoa(Array.from(new Uint8Array(bytes), byte => String.fromCharCode(byte)).join("")); analyze.mutate({ tenantId, projectId, moduleCode, fileName: file.name, sourceFormat: file.name.toLowerCase().endsWith(".csv") ? "csv" : "xlsx", base64 }); };
  return <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><div className="flex items-center gap-2"><FileSpreadsheet className="h-5 w-5 text-[#0e6b70]" /><h2 className="font-semibold">{t.title}</h2></div><p className="mt-2 text-xs text-slate-500">{t.note}</p><div className="mt-4 flex flex-wrap gap-2"><Button type="button" variant={moduleCode === "wbs" ? "default" : "outline"} onClick={() => setModuleCode("wbs")}>{t.wbs}</Button><Button type="button" variant={moduleCode === "budget" ? "default" : "outline"} onClick={() => setModuleCode("budget")}>{t.budget}</Button></div><Input className="mt-4" aria-label={t.choose} type="file" accept=".xlsx,.csv" onChange={event => setFile(event.target.files?.[0] ?? null)} /><Button className="mt-3 w-full" disabled={!file || analyze.isPending} onClick={submit}>{t.analyze}</Button>{analyze.error && <p className="mt-3 text-xs text-red-700">{getLocalizedProjectError(analyze.error, isArabic)}</p>}{analyze.data && <div className="mt-3 rounded-lg bg-[#e6f4f3] p-3 text-xs"><p>{t.rows}: {analyze.data.totalRows}</p><p>{t.errors}: {analyze.data.errors.length}</p></div>}</section>;
}
