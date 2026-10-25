import type { BilingualMessage } from "@shared/projectErrors";
import { isNetworkError } from "./offlineQueue";
import type { Language } from "./language";

type ProjectErrorPayload = {
  data?: {
    projectError?: {
      code?: string;
      messages?: BilingualMessage;
    };
  };
};

// The sentences used when the server gave no catalogue message: each language says it in its own words.
const NETWORK_MESSAGE: Record<Language, string> = {
  ar: "تعذّر الاتصال بالخادم. تحقق من اتصالك بالإنترنت ثم أعد المحاولة.",
  en: "Could not reach the server. Check your internet connection and try again.",
  ur: "سرور سے رابطہ نہیں ہو سکا۔ انٹرنیٹ کنکشن چیک کریں اور دوبارہ کوشش کریں۔",
};

const GENERIC_MESSAGE: Record<Language, string> = {
  ar: "تعذر إتمام الطلب. تحقق من البيانات ثم أعد المحاولة.",
  en: "We could not complete the request. Check the details and try again.",
  ur: "درخواست مکمل نہیں ہو سکی۔ معلومات چیک کریں اور دوبارہ کوشش کریں۔",
};

// The boolean is the old form of the argument (true for Arabic), kept so that the callers that have not moved to a language still compile.
export function getLocalizedProjectError(error: unknown, language: Language | boolean): string {
  const lang: Language = typeof language === "boolean" ? (language ? "ar" : "en") : language;
  const messages = (error as ProjectErrorPayload | null)?.data?.projectError?.messages;
  if (messages) return messages[lang];

  // No answer from the server at all (offline, a dropped connection, a timeout): the person's data is not the problem, so do not say it is.
  if (isNetworkError(error)) return NETWORK_MESSAGE[lang];

  return GENERIC_MESSAGE[lang];
}
