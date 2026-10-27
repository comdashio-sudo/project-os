import { createContext, useContext } from "react";
import type { Language } from "@/lib/language";

// The page's language in its own module, so a component can read it when it is rendered inside LanguageProvider and fall back to its
// `isArabic` prop when it is not (a test, a stand-alone example). It is not part of LanguageContext.tsx because tests replace that module.
export const OptionalLanguageContext = createContext<Language | null>(null);

export function useOptionalLanguage(): Language | null {
  return useContext(OptionalLanguageContext);
}
