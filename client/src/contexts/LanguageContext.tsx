import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { isLanguage, isRtlLanguage, LANGUAGE_STORAGE_KEY, type Language } from "@/lib/language";
import { OptionalLanguageContext } from "./optionalLanguage";

export type { Language } from "@/lib/language";
type LanguageContextValue = {
  language: Language;
  /** True only for Arabic. The older screens choose between Arabic and English with it, so Urdu falls back to English there (listed as open in docs/TRANSLATION_REVIEW.md). */
  isArabic: boolean;
  /** True for Arabic and Urdu: the page and the screens lay out right to left. */
  isRtl: boolean;
  /** Changes the language on this device at once and keeps it in this browser. The copy on the person's account is saved by the switch (LanguageToggle). */
  setLanguage: (language: Language) => void;
};

const LanguageContext = createContext<LanguageContextValue | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => {
    const requested = new URLSearchParams(window.location.search).get("lang");
    if (isLanguage(requested)) return requested;
    // Arabic unless this browser has chosen another language: the product is Arabic-first, so a first visit (nothing stored) opens in Arabic.
    try {
      const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
      return isLanguage(stored) ? stored : "ar";
    } catch { return "ar"; }
  });
  // The device's copy is written when a choice is made (here, or the account's choice arriving on sign-in), never on opening: so what is stored is always a
  // choice, and LanguageAccountSync can tell a device that chose a language from one that never did.
  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    try { localStorage.setItem(LANGUAGE_STORAGE_KEY, next); } catch { /* storage blocked: the choice lasts for this visit only */ }
  }, []);
  const isArabic = language === "ar";
  const isRtl = isRtlLanguage(language);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = isRtl ? "rtl" : "ltr";
  }, [isRtl, language]);
  const value = useMemo(() => ({ language, isArabic, isRtl, setLanguage }), [isArabic, isRtl, language, setLanguage]);
  return <LanguageContext.Provider value={value}><OptionalLanguageContext.Provider value={language}>{children}</OptionalLanguageContext.Provider></LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error("useLanguage must be used inside LanguageProvider");
  return value;
}
