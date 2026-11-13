import { Button } from "@/components/ui/button";
import { Select } from "@/components/ds";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { Link2 } from "lucide-react";
import React, { useState } from "react";
import { WriteGate } from "@/lib/permissions";
import { pickLanguage } from "@/lib/language";
import { CheckedForm } from "@/components/CheckedForm";

type RecordType = "risk" | "issue" | "action" | "decision" | "rfi" | "ncr";
type LinkableRecord = { id: string; projectId: string | null; type: RecordType; label: string };

export function PmoControlLinks({ tenantId, projects, records }: { tenantId: string; projects: { id: string; code: string; name: string }[]; records: LinkableRecord[] }) {
  const { isArabic, language } = useLanguage();
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [sourceKey, setSourceKey] = useState("");
  const [targetKey, setTargetKey] = useState("");
  const safeProjectId = projectId || "00000000-0000-0000-0000-000000000000";
  const links = trpc.controlLinks.list.useQuery({ tenantId, projectId: safeProjectId }, { enabled: Boolean(projectId) });
  const t = pickLanguage(language, { ar: { title: "روابط سجلات الحوكمة", project: "المشروع", source: "سجل المصدر", target: "السجل المرتبط", select: "اختر سجلًا", save: "حفظ الرابط", empty: "اختر مشروعًا لعرض روابط سجلاته.", none: "لا توجد روابط مسجلة لهذا المشروع.", risk: "مخاطرة", issue: "قضية", action: "إجراء", decision: "قرار", rfi: "طلب معلومات", ncr: "حالة عدم مطابقة", success: "تم حفظ الرابط وتسجيل الدليل التدقيقي." }, en: { title: "Governance record links", project: "Project", source: "Source record", target: "Linked record", select: "Select a record", save: "Save link", empty: "Select a project to view its record links.", none: "No record links are registered for this project.", risk: "Risk", issue: "Issue", action: "Action", decision: "Decision", rfi: "RFI", ncr: "NCR", success: "The link was saved with audit evidence." }, ur: { title: "Governance record links", project: "Project", source: "Source record", target: "Linked record", select: "Select a record", save: "Save link", empty: "Select a project to view its record links.", none: "No record links are registered for this project.", risk: "Risk", issue: "Issue", action: "Action", decision: "Decision", rfi: "RFI", ncr: "NCR", success: "The link was saved with audit evidence." } });
  const available = records.filter(record => record.projectId === projectId);
  const sources = available.filter(record => ["risk", "issue", "action", "decision"].includes(record.type));
  const recordFromKey = (key: string) => available.find(record => `${record.type}:${record.id}` === key);
  const mutation = trpc.controlLinks.create.useMutation({ onSuccess: () => { setSourceKey(""); setTargetKey(""); void links.refetch(); } });
  const error = links.error ?? mutation.error;
  const label = (record: LinkableRecord) => `${t[record.type]} · ${record.label}`;
  if (!projects.length) return <p className="mt-6 text-sm text-amber-700">{t.empty}</p>;
  return <section className="mt-6 rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><div className="flex items-center gap-3"><Link2 className="h-5 w-5 text-[#0e6b70]" /><h2 className="font-semibold">{t.title}</h2></div><WriteGate permission={"pmo.write"} projectId={projectId} reason={{ ar: "لا تملك صلاحية ربط سجلات الضبط، فالشاشة للعرض فقط.", en: "You do not have permission to link control records; this view is read-only for you.", ur: "آپ کو کنٹرول ریکارڈ جوڑنے کی اجازت نہیں ہے؛ یہ اسکرین آپ کے لیے صرف دیکھنے کے لیے ہے۔" }}><CheckedForm className="mt-4 grid gap-3 lg:grid-cols-4" onSubmit={event => { event.preventDefault(); const source = recordFromKey(sourceKey); const target = recordFromKey(targetKey); if (source && target && ["risk", "issue", "action", "decision"].includes(source.type)) mutation.mutate({ tenantId, projectId, sourceType: source.type as "risk" | "issue" | "action" | "decision", sourceId: source.id, targetType: target.type, targetId: target.id }); }}><label className="text-xs font-medium text-slate-700">{t.project}<Select aria-label={t.project} className="mt-1" placeholder={t.select} value={projectId || undefined} onValueChange={value => { setProjectId(value); setSourceKey(""); setTargetKey(""); }} options={projects.map(project => ({ value: project.id, label: `${project.code} · ${project.name}` }))} /></label><label className="text-xs font-medium text-slate-700">{t.source}<Select id="pmo-link-source" aria-label={t.source} className="mt-1" required placeholder={t.select} value={sourceKey || undefined} onValueChange={setSourceKey} options={sources.map(record => ({ value: `${record.type}:${record.id}`, label: label(record) }))} /></label><label className="text-xs font-medium text-slate-700">{t.target}<Select id="pmo-link-target" aria-label={t.target} className="mt-1" required placeholder={t.select} value={targetKey || undefined} onValueChange={setTargetKey} options={available.map(record => ({ value: `${record.type}:${record.id}`, label: label(record) }))} /></label><div className="flex items-end"><Button className="w-full" disabled={mutation.isPending || !projectId || !sourceKey || !targetKey}>{t.save}</Button></div></CheckedForm></WriteGate>{error && <p role="alert" className="mt-3 text-sm text-red-700">{getLocalizedProjectError(error, isArabic)}</p>}{mutation.isSuccess && <p role="status" className="mt-3 text-sm text-emerald-700">{t.success}</p>}{projectId && !links.isLoading && (links.data?.length ? <div className="mt-5 space-y-2">{links.data.map(link => { const source = available.find(record => record.type === link.sourceType && record.id === link.sourceId); const target = available.find(record => record.type === link.targetType && record.id === link.targetId); return <p key={link.id} className="rounded-xl bg-slate-50 p-3 text-sm">{source ? label(source) : t[link.sourceType]} <span className="text-slate-400">→</span> {target ? label(target) : t[link.targetType]}</p>; })}</div> : <p className="mt-4 text-sm text-slate-500">{t.none}</p>)}</section>;
}
