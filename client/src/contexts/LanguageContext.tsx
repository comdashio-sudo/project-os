import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { isLanguage, isRtlLanguage, LANGUAGE_STORAGE_KEY, type Language } from "@/lib/language";

export type { Language } from "@/lib/language";
type LanguageContextValue = {
  language: Language;
  /** True only for Arabic. The older screens choose between Arabic and English with it, so Urdu falls back to English there (listed as open in docs/TRANSLATION_REVIEW.md). */
  isArabic: boolean;
  /** True for Arabic and Urdu: the page and the screens lay out right to left. */
  isRtl: boolean;
  setLanguage: (language: Language) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(() => {
    const requested = new URLSearchParams(window.location.search).get("lang");
    if (isLanguage(requested)) return requested;
    // Arabic unless this browser has chosen another language: the product is Arabic-first, so a first visit (nothing stored) opens in Arabic.
    try {
      const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      return isLanguage(stored) ? stored : "ar";
    } catch { return "ar"; }
  });
  const isArabic = language === "ar";
  const isRtl = isRtlLanguage(language);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = isRtl ? "rtl" : "ltr";
    try { localStorage.setItem(LANGUAGE_STORAGE_KEY, language); } catch { /* storage blocked: the choice lasts for this visit only */ }
  }, [isRtl, language]);
  const value = useMemo(() => ({ language, isArabic, isRtl, setLanguage }), [isArabic, isRtl, language]);
  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be used inside LanguageProvider");
  return value;
}
