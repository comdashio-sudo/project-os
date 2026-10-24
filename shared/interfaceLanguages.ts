// The three interface languages, shared by the server (the language a person chose is validated against this list, and the table's check constraint
// admits the same three codes) and the client (client/src/lib/language.ts). Arabic is the default. Adding a language is a change here, in the check
// constraint of `user_language_preferences`, and in the migration that replaces it: all three must move together.
export const INTERFACE_LANGUAGES = ["ar", "en", "ur"] as const;
export type InterfaceLanguage = (typeof INTERFACE_LANGUAGES)[number];
