import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Language = "en" | "ar";
type LanguageContextValue = { language: Language; isArabic: boolean; toggleLanguage: () => void };

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => (localStorage.getItem("project-os-language") === "ar" ? "ar" : "en"));
  const isArabic = language === "ar";
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = isArabic ? "rtl" : "ltr";
    localStorage.setItem("project-os-language", language);
  }, [isArabic, language]);
  const value = useMemo(() => ({ language, isArabic, toggleLanguage: () => setLanguage(current => current === "en" ? "ar" : "en") }), [isArabic, language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be used inside LanguageProvider");
  return value;
}
