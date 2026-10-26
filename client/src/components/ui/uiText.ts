import { useOptionalLanguage } from "@/contexts/optionalLanguage";
import { pickLanguage, type Language } from "@/lib/language";

/**
 * The visible text of a shadcn primitive (a screen-reader label, a "Close" button). It follows the page's language when the primitive
 * is rendered inside the app, and English when it is rendered on its own (a test, a stand-alone example).
 */
export function useUiText() {
  const language: Language = useOptionalLanguage() ?? "en";
  return <T,>(texts: { ar: T; en: T; ur: T }): T => pickLanguage(language, texts);
}
