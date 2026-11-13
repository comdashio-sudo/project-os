import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { Download, Loader2 } from "lucide-react";
import React, { useState } from "react";
import { pickLanguage } from "@/lib/language";

function downloadExport(file: { base64: string; fileName: string; contentType: string }) {
  const decoded = window.atob(file.base64); const bytes = Uint8Array.from(decoded, value => value.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: file.contentType })); const link = document.createElement("a"); link.href = url; link.download = file.fileName; link.click(); URL.revokeObjectURL(url);
}

export function ProjectDataExport({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { isArabic, language } = useLanguage(); const [moduleCode, setModuleCode] = useState<"wbs" | "budget" | "activities" | "contracts" | "materials">("wbs"); const [format, setFormat] = useState<"xlsx" | "csv">("xlsx");
  const exporter = trpc.dataImports.export.useMutation({ onSuccess: downloadExport });
  const t = pickLanguage(language, { ar: { title: "تصدير البيانات", note: "يُصدّر فقط سجلات المشروع المصرح بها مع أعمدة القالب المعتمدة.", wbs: "WBS", budget: "الميزانية", activities: "الأنشطة", contracts: "العقود", materials: "المواد", xlsx: "XLSX", csv: "CSV", action: "إنشاء وتنزيل الملف", rows: "الصفوف المصدرة" }, en: { title: "Data export", note: "Exports only authorized project records using approved template columns.", wbs: "WBS", budget: "Budget", activities: "Activities", contracts: "Contracts", materials: "Materials", xlsx: "XLSX", csv: "CSV", action: "Generate and download", rows: "Exported rows" }, ur: { title: "Data export", note: "Exports only authorized project records using approved template columns.", wbs: "WBS", budget: "Budget", activities: "Activities", contracts: "Contracts", materials: "Materials", xlsx: "XLSX", csv: "CSV", action: "Generate and download", rows: "Exported rows" } });
  const label = { wbs: t.wbs, budget: t.budget, activities: t.activities, contracts: t.contracts, materials: t.materials }[moduleCode];
  return <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><div className="flex items-center gap-2"><Download className="h-5 w-5 text-primary" /><h2 className="font-semibold">{t.title}</h2></div><p className="mt-2 text-xs leading-5 text-slate-500">{t.note}</p><div className="mt-4 flex flex-wrap gap-2">{(["wbs", "budget", "activities", "contracts", "materials"] as const).map(value => <Button key={value} type="button" variant={moduleCode === value ? "default" : "outline"} onClick={() => setModuleCode(value)}>{({ wbs: t.wbs, budget: t.budget, activities: t.activities, contracts: t.contracts, materials: t.materials })[value]}</Button>)}</div><div className="mt-3 flex gap-2"><Button type="button" size="sm" variant={format === "xlsx" ? "default" : "outline"} onClick={() => setFormat("xlsx")}>{t.xlsx}</Button><Button type="button" size="sm" variant={format === "csv" ? "default" : "outline"} onClick={() => setFormat("csv")}>{t.csv}</Button></div><Button className="mt-4 w-full" disabled={exporter.isPending} aria-busy={exporter.isPending || undefined} onClick={() => exporter.mutate({ tenantId, projectId, moduleCode, format, locale: language })}>{exporter.isPending && <Loader2 aria-hidden="true" className="me-2 h-4 w-4 animate-spin" />}{`${t.action}: ${label}`}</Button>{exporter.isPending && <p role="status" className="mt-2 text-xs text-slate-500">{pickLanguage(language, { ar: `جارٍ إنشاء ملف ${label}…`, en: `Creating the ${label} file…`, ur: `${label} فائل بن رہی ہے…` })}</p>}{exporter.error && <p className="mt-3 text-xs text-red-700">{getLocalizedProjectError(exporter.error, isArabic)}</p>}{exporter.data && <p className="mt-3 rounded-lg bg-accent p-3 text-xs">{t.rows}: {exporter.data.rowCount}</p>}</section>;
}
