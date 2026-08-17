import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { Languages } from "lucide-react";

export function LanguageToggle({ dark = false }: { dark?: boolean }) {
  const { isArabic, toggleLanguage } = useLanguage();
  return <Button variant="outline" size="sm" onClick={toggleLanguage} className={dark ? "border-white/30 bg-transparent text-white hover:bg-white/10 hover:text-white" : "border-slate-300"}><Languages className="me-1.5 h-4 w-4" />{isArabic ? "English" : "العربية"}</Button>;
}
