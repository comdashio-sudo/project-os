import { EnterpriseNavigation } from "@/components/EnterpriseNavigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { UsersRound } from "lucide-react";
import { useParams } from "wouter";
import { ProjectEmployees } from "./ProjectEmployees";

export default function EmployeeRegistry() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { isArabic } = useLanguage();
  const title = isArabic ? "الموظفون والقوى العاملة" : "People & workforce";
  const subtitle = isArabic ? "بطاقات الموظفين وعقود العمل المحكومة، مع إخفاء الهوية والاحتفاظ المنضبط." : "Governed employee records and employment contracts, with protected identity and retention controls.";
  return <div className="min-h-screen bg-slate-50"><EnterpriseNavigation tenantId={tenantId} context="administration" /><main className="mx-auto max-w-6xl space-y-6 px-4 py-8"><header className="rounded-2xl bg-[#0e6b70] p-6 text-white shadow-sm"><div className="flex items-start gap-3"><UsersRound className="mt-1" /><div><h1 className="text-xl font-semibold">{title}</h1><p className="mt-2 max-w-3xl text-sm text-teal-50">{subtitle}</p></div></div></header><ProjectEmployees tenantId={tenantId} /></main></div>;
}
