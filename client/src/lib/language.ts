// The three interface languages. Arabic is the default. Arabic and Urdu are written right to left, English left to right.
// Text is chosen with `pickLanguage(language, { ar, en, ur })`: the type checker requires the same keys in all three objects, and
// client/src/lib/translationKeys.test.tsx reads every such dictionary and fails when a key is missing in any language.

export const LANGUAGES = ["ar", "en", "ur"] as const;
export type Language = (typeof LANGUAGES)[number];

/** The key under which the choice is kept in this browser. The choice is per device: the server stores no per-person language. */
export const LANGUAGE_STORAGE_KEY = "project-os-language";

/** The name of each language, written in that language, for the language switch. */
export const LANGUAGE_NAMES: Record<Language, string> = { ar: "العربية", en: "English", ur: "اردو" };

export const isLanguage = (value: unknown): value is Language => typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);

/** Arabic and Urdu are right to left; English is left to right. */
export const isRtlLanguage = (language: Language) => language !== "en";

export function pickLanguage<T>(language: Language, texts: { ar: T; en: T; ur: T }): T {
  return texts[language];
}

/** A screen that has its language passes the language; an older one passes `isArabic`, which resolves to Arabic or English (Urdu needs the language). */
export const resolveLanguage = (value: Language | boolean): Language => (typeof value === "boolean" ? (value ? "ar" : "en") : value);

