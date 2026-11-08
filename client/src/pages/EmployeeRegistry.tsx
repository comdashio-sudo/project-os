import { useLanguage } from "@/contexts/LanguageContext";
import { PageMain } from "@/components/pageFrame";
import { pickLanguage } from "@/lib/language";
import { UsersRound } from "lucide-react";
import { useParams } from "wouter";
import { ProjectEmployees } from "./ProjectEmployees";

export default function EmployeeRegistry() {
  const { tenantId } = useParams<{ tenantId: string }>();
  const { language } = useLanguage();
  const t = pickLanguage(language, {
    ar: { title: "الموظفون والقوى العاملة", subtitle: "بطاقات الموظفين وعقود العمل المحكومة، مع إخفاء الهوية والاحتفاظ المنضبط." },
    en: { title: "People & workforce", subtitle: "Governed employee records and employment contracts, with protected identity and retention controls." },
    ur: { title: "ملازمین اور افرادی قوت", subtitle: "محفوظ ملازمین کا ریکارڈ اور ملازمت کے معاہدے، جن میں شناخت کا تحفظ اور ریکارڈ رکھنے کے منظم کنٹرولز شامل ہیں۔" },
  });
  return <div className="min-h-screen bg-muted"><PageMain className="mx-auto max-w-6xl space-y-6 px-4 py-8"><section className="rounded-2xl bg-primary p-6 text-white shadow-sm"><div className="flex items-start gap-3"><UsersRound className="mt-1" /><div><h1 className="text-xl font-semibold">{t.title}</h1><p className="mt-2 max-w-3xl text-sm text-teal-50">{t.subtitle}</p></div></div></section><ProjectEmployees tenantId={tenantId} /></PageMain></div>;
}
