// The three interface languages (the list itself lives in shared/interfaceLanguages.ts, next to the server's check). Arabic is the default.
// Arabic and Urdu are written right to left, English left to right.
// Text is chosen with `pickLanguage(language, { ar, en, ur })`: the type checker requires the same keys in all three objects, and
// client/src/lib/translationKeys.test.tsx reads every such dictionary and fails when a key is missing in any language.
import { INTERFACE_LANGUAGES, type InterfaceLanguage } from "@shared/interfaceLanguages";

export const LANGUAGES = INTERFACE_LANGUAGES;
export type Language = InterfaceLanguage;

/** The key under which the choice is kept in this browser. It is the device's copy of the choice: a signed-in person's choice is also kept on the
 *  account (server/userLanguage.ts), and the account wins when the person signs in; this copy is what the device falls back to when the account cannot be reached. */
export const LANGUAGE_STORAGE_KEY = "project-os-language";

/** The name of each language, written in that language, for the language switch. */
export const LANGUAGE_NAMES: Record<Language, string> = { ar: "العربية", en: "English", ur: "اردو" };

export const isLanguage = (value: unknown): value is Language => typeof value === "string" && (LANGUAGES as readonly string[]).includes(value);

/** Arabic and Urdu are right to left; English is left to right. */
export const isRtlLanguage = (language: Language) => language !== "en";

export function pickLanguage<T>(language: Language, texts: { ar: T; en: T; ur: T }): T {
  return texts[language];
}
