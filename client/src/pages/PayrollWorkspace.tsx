import { GuardedPanels } from "@/components/SectionResilience";
import { useLanguage } from "@/contexts/LanguageContext";
import { Landmark } from "lucide-react";
import { useParams } from "wouter";
import { EosLiabilityCard } from "./EosLiabilityCard";
import { PayrollPanel } from "./PayrollPanel";
import { pickLanguage } from "@/lib/language";

export default function PayrollWorkspace() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { isArabic, language } = useLanguage();
  const title = pickLanguage(language, { ar: "مركز الرواتب وتكلفة العمالة", en: "Payroll & labor cost workspace", ur: "پے رول اور لیبر لاگت کا ورک اسپیس" });
  const subtitle = pickLanguage(language, { ar: "تشغيل الدورات واعتمادها وترحيل تكاليف العمالة وفق الصلاحية والنطاق.", en: "Run, approve and allocate labor cost according to your governed role and scope.", ur: "اپنے مقررہ کردار اور دائرۂ کار کے مطابق پے رول چلائیں، منظور کریں اور لیبر لاگت مختص کریں۔" });
  return <div className="min-h-screen bg-muted"><main className="mx-auto max-w-6xl space-y-6 px-4 py-8"><header className="rounded-2xl bg-primary p-6 text-white shadow-sm"><div className="flex items-start gap-3"><Landmark className="mt-1" /><div><h1 className="text-xl font-semibold">{title}</h1><p className="mt-2 max-w-3xl text-sm text-teal-50">{subtitle}</p></div></div></header><GuardedPanels isArabic={isArabic} titles={{ PayrollPanel: { ar: "الرواتب وتكلفة العمالة", en: "Payroll and labour cost", ur: "پے رول اور لیبر لاگت" }, EosLiabilityCard: { ar: "التزام نهاية الخدمة", en: "End-of-service liability", ur: "اختتامِ ملازمت کی واجب الادا رقم" } }}><PayrollPanel tenantId={tenantId} /><EosLiabilityCard tenantId={tenantId} /></GuardedPanels></main></div>;
}
