import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { FilePlus2, Files, Upload } from "lucide-react";
import React, { useState } from "react";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const emptyDocument = { documentNumber: "", title: "", category: "other" as const };

function readAsBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("PROJECT_OS_DOCUMENT_CONTENT_INVALID"));
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.readAsDataURL(file);
  });
}

export function ProjectDocuments({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { isArabic } = useLanguage();
  const register = trpc.documents.getProjectRegister.useQuery({ tenantId, projectId });
  const [document, setDocument] = useState(emptyDocument);
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [versionFiles, setVersionFiles] = useState<Record<string, File | null>>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const refresh = () => register.refetch();
  const create = trpc.documents.createWithVersion.useMutation({ onSuccess: () => { setDocument(emptyDocument); setDocumentFile(null); setLocalError(null); refresh(); } });
  const addVersion = trpc.documents.addVersion.useMutation({ onSuccess: () => { setVersionFiles({}); setLocalError(null); refresh(); } });
  const t = isArabic
    ? { title: "سجل المستندات", number: "رقم المستند", documentTitle: "عنوان المستند", category: "التصنيف", file: "الملف", create: "رفع مستند وإصدار 1", creating: "جارٍ الرفع…", addVersion: "رفع إصدار جديد", adding: "جارٍ رفع الإصدار…", empty: "لا توجد مستندات مسجلة لهذا المشروع.", loading: "جارٍ تحميل سجل المستندات…", sizeLimit: "الحد الأقصى للملف هو 10 ميغابايت.", noFile: "اختر ملفًا صالحًا للرفع.", versions: "الإصدارات", drawing: "رسم", specification: "مواصفة", method_statement: "منهجية تنفيذ", report: "تقرير", correspondence: "مراسلات", commercial: "تجاري", other: "أخرى", draft: "مسودة", for_review: "للمراجعة", approved: "معتمد", superseded: "مستبدل", archived: "مؤرشف" }
    : { title: "Document register", number: "Document number", documentTitle: "Document title", category: "Category", file: "File", create: "Upload document & version 1", creating: "Uploading…", addVersion: "Upload new version", adding: "Uploading version…", empty: "No documents have been registered for this project.", loading: "Loading document register…", sizeLimit: "The maximum file size is 10 MB.", noFile: "Select a valid file to upload.", versions: "Versions", drawing: "Drawing", specification: "Specification", method_statement: "Method statement", report: "Report", correspondence: "Correspondence", commercial: "Commercial", other: "Other", draft: "Draft", for_review: "For review", approved: "Approved", superseded: "Superseded", archived: "Archived" };
  const error = register.error ?? create.error ?? addVersion.error;
  const label = (value: string) => t[value as keyof typeof t] ?? value;
  const validateFile = (file: File | null) => {
    if (!file) { setLocalError(t.noFile); return false; }
    if (file.size > MAX_FILE_BYTES) { setLocalError(t.sizeLimit); return false; }
    return true;
  };
  if (register.isLoading) return <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><p className="text-sm text-slate-500">{t.loading}</p></section>;
  if (register.error || !register.data) return <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><p className="text-sm text-red-700">{getLocalizedProjectError(register.error, isArabic)}</p></section>;
  const versionsByDocument = new Map(register.data.documents.map(item => [item.id, register.data.versions.filter(version => version.documentId === item.id)]));
  return <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><div className="flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-[#e6f4f3] text-[#0e6b70]"><Files className="h-5 w-5" /></span><h2 className="font-semibold">{t.title}</h2></div>{error ? <p role="alert" className="mt-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">{getLocalizedProjectError(error, isArabic)}</p> : null}{localError ? <p role="alert" className="mt-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">{localError}</p> : null}<form className="mt-5 grid gap-3" onSubmit={async event => { event.preventDefault(); if (!validateFile(documentFile) || !documentFile) return; try { setLocalError(null); create.mutate({ tenantId, projectId, ...document, originalName: documentFile.name, mimeType: documentFile.type || "application/octet-stream", contentBase64: await readAsBase64(documentFile) }); } catch { setLocalError(t.noFile); } }}><div className="grid gap-3 md:grid-cols-2"><Input aria-label={t.number} placeholder={t.number} value={document.documentNumber} onChange={event => setDocument({ ...document, documentNumber: event.target.value })} required /><Input aria-label={t.documentTitle} placeholder={t.documentTitle} value={document.title} onChange={event => setDocument({ ...document, title: event.target.value })} required /></div><Label>{t.category}<Select value={document.category} onValueChange={category => setDocument({ ...document, category: category as typeof document.category })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent>{["drawing", "specification", "method_statement", "report", "correspondence", "commercial", "other"].map(category => <SelectItem key={category} value={category}>{label(category)}</SelectItem>)}</SelectContent></Select></Label><Label>{t.file}<Input className="mt-1" aria-label={t.file} type="file" onChange={event => setDocumentFile(event.target.files?.[0] ?? null)} required /></Label><Button disabled={create.isPending}><FilePlus2 className="me-1 h-4 w-4" />{create.isPending ? t.creating : t.create}</Button></form>{register.data.documents.length ? <div className="mt-6 divide-y rounded-xl border">{register.data.documents.map(item => <div key={item.id} className="p-4"><div className="flex flex-wrap items-center justify-between gap-2"><p className="font-semibold">{item.documentNumber} · {item.title}</p><span className="text-xs text-slate-500">{label(item.category)} · {label(item.status)}</span></div><p className="mt-2 text-xs font-semibold text-slate-500">{t.versions}</p>{(versionsByDocument.get(item.id) ?? []).map(version => <p key={version.id} className="mt-1 text-xs text-slate-600">v{version.versionNumber} · {version.originalName} · {version.sizeBytes} B</p>)}<div className="mt-3 flex flex-wrap gap-2"><Input aria-label={`${t.file} ${item.documentNumber}`} type="file" className="max-w-xs" onChange={event => setVersionFiles({ ...versionFiles, [item.id]: event.target.files?.[0] ?? null })} /><Button size="sm" variant="outline" disabled={addVersion.isPending} onClick={async () => { const file = versionFiles[item.id] ?? null; if (!validateFile(file) || !file) return; try { setLocalError(null); addVersion.mutate({ tenantId, projectId, documentId: item.id, originalName: file.name, mimeType: file.type || "application/octet-stream", contentBase64: await readAsBase64(file) }); } catch { setLocalError(t.noFile); } }}><Upload className="me-1 h-4 w-4" />{addVersion.isPending ? t.adding : t.addVersion}</Button></div></div>)}</div> : <p className="mt-5 text-sm text-slate-500">{t.empty}</p>}</section>;
}
