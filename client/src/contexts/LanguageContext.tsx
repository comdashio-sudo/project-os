import React, { createContext, useContext, useEffect, useMemo, useState } from "react";

export type Language = "en" | "ar";
type LanguageContextValue = { language: Language; isArabic: boolean; toggleLanguage: () => void };

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    const requested = new URLSearchParams(window.location.search).get("lang");
    if (requested === "ar" || requested === "en") return requested;
    // Arabic unless this person has chosen English: the product is Arabic-first, so a first visit (nothing stored) opens in Arabic.
    try { return localStorage.getItem("project-os-language") === "en" ? "en" : "ar"; } catch { return "ar"; }
  });
  const isArabic = language === "ar";
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = isArabic ? "rtl" : "ltr";
    try { localStorage.setItem("project-os-language", language); } catch { /* storage blocked: the choice lasts for this visit only */ }
  }, [isArabic, language]);
  const value = useMemo(() => ({ language, isArabic, toggleLanguage: () => setLanguage(current => current === "en" ? "ar" : "en") }), [isArabic, language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be used inside LanguageProvider");
  return value;
}
