import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LanguageToggle } from "@/components/LanguageToggle";
import { useLanguage } from "@/contexts/LanguageContext";
import { AlertCircle, Home } from "lucide-react";
import { useLocation } from "wouter";

export default function NotFound() {
  const [, setLocation] = useLocation();
  const { isArabic } = useLanguage();
  const t = isArabic ? { title: "الصفحة غير موجودة", body: "عذرًا، الصفحة التي تبحث عنها غير موجودة.\nربما تم نقلها أو حذفها.", home: "العودة للرئيسية" } : { title: "Page Not Found", body: "Sorry, the page you are looking for doesn't exist.\nIt may have been moved or deleted.", home: "Go Home" };
  return <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 to-slate-100"><header className="flex justify-end p-5"><LanguageToggle /></header><div className="flex items-center justify-center px-4 pb-16"><Card className="w-full max-w-lg border-0 bg-white/80 shadow-lg backdrop-blur-sm"><CardContent className="pb-8 pt-8 text-center"><div className="mb-6 flex justify-center"><div className="relative"><div className="absolute inset-0 animate-pulse rounded-full bg-red-100"/><AlertCircle className="relative h-16 w-16 text-red-500"/></div></div><h1 className="mb-2 text-4xl font-bold text-slate-900">404</h1><h2 className="mb-4 text-xl font-semibold text-slate-700">{t.title}</h2><p className="mb-8 whitespace-pre-line leading-relaxed text-slate-600">{t.body}</p><Button onClick={() => setLocation("/")} className="bg-[#123a4a] px-6 py-2.5 text-white shadow-md hover:bg-[#0d2e3b]"><Home className="me-2 h-4 w-4"/>{t.home}</Button></CardContent></Card></div></div>;
}
