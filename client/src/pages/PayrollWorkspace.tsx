import { EnterpriseNavigation } from "@/components/EnterpriseNavigation";
import { useLanguage } from "@/contexts/LanguageContext";
import { Landmark } from "lucide-react";
import { useParams } from "wouter";
import { PayrollPanel } from "./PayrollPanel";

export default function PayrollWorkspace() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { isArabic } = useLanguage();
  const title = isArabic ? "مركز الرواتب وتكلفة العمالة" : "Payroll & labor cost workspace";
  const subtitle = isArabic ? "تشغيل الدورات واعتمادها وترحيل تكاليف العمالة وفق الصلاحية والنطاق." : "Run, approve and allocate labor cost according to your governed role and scope.";
  return <div className="min-h-screen bg-slate-50"><EnterpriseNavigation tenantId={tenantId} context="administration" /><main className="mx-auto max-w-6xl space-y-6 px-4 py-8"><header className="rounded-2xl bg-[#0e6b70] p-6 text-white shadow-sm"><div className="flex items-start gap-3"><Landmark className="mt-1" /><div><h1 className="text-xl font-semibold">{title}</h1><p className="mt-2 max-w-3xl text-sm text-teal-50">{subtitle}</p></div></div></header><PayrollPanel tenantId={tenantId} /></main></div>;
}
