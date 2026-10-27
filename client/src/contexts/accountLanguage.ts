import { createContext, useContext } from "react";
import type { Language } from "@/lib/language";

/** What the language switch needs from the account layer (LanguageAccountSync): whether the person is signed in, and how to save a choice on their
 *  account. Without that layer (a screen rendered on its own, a test) the switch changes the language on this device only. Kept apart from
 *  LanguageContext so a test that replaces LanguageContext does not have to replace this too. */
export type AccountLanguageValue = { signedIn: boolean; save: (language: Language) => void };
const AccountLanguageContext = createContext<AccountLanguageValue>({ signedIn: false, save: () => undefined });
export const AccountLanguageProvider = AccountLanguageContext.Provider;
export const useAccountLanguage = () => useContext(AccountLanguageContext);
