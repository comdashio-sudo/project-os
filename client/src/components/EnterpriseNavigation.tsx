import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { trpc } from "@/lib/trpc";
import { ArrowLeft, ChevronRight, Compass } from "lucide-react";
import React from "react";
import { Link } from "wouter";

export function EnterpriseNavigation({ tenantId, projectId, context }: { tenantId: string; projectId?: string; context: "executive" | "pmo" | "project" | "administration" }) {
  const { isArabic } = useLanguage(); const navigation = trpc.navigation.get.useQuery(projectId ? { tenantId, projectId } : { tenantId });
  const t = isArabic ? { back: "رجوع", executive: "القيادة التنفيذية", pmo: "PMO", projects: "سجل المشاريع", controls: "ضوابط المشروع", administration: "إدارة المؤسسة" } : { back: "Back", executive: "Executive", pmo: "PMO", projects: "Project registry", controls: "Project controls", administration: "Tenant administration" };
  const labels: Record<string, string> = { "navigation.executiveDashboard": t.executive, "navigation.pmoDashboard": t.pmo, "navigation.projectRegistry": t.projects, "navigation.projectControls": t.controls, "navigation.tenantAdministration": t.administration };
  const contextLabel = { executive: t.executive, pmo: t.pmo, project: t.controls, administration: t.administration }[context];
  return <nav aria-label={isArabic ? "الملاحة المؤسسية" : "Enterprise navigation"} className="mb-5 flex flex-wrap items-center gap-2 rounded-2xl bg-white p-3 shadow-sm ring-1 ring-slate-200"><Button type="button" size="sm" variant="ghost" onClick={() => window.history.back()}><ArrowLeft className="me-1 h-4 w-4" />{t.back}</Button><div className="flex items-center gap-1 text-xs text-slate-500"><Compass className="h-4 w-4 text-[#0e6b70]" /><span>PROJECT OS</span><ChevronRight className="h-3 w-3" /><span className="font-medium text-slate-700">{contextLabel}</span></div><div className="ms-auto flex flex-wrap gap-1">{navigation.data?.map(item => <Link key={item.id} href={item.href} className="rounded-lg px-2 py-1.5 text-xs font-medium text-[#0e6b70] hover:bg-[#e6f4f3]">{labels[item.labelKey] ?? item.id}</Link>)}</div></nav>;
}
