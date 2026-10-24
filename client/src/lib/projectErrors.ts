import type { BilingualMessage } from "@shared/projectErrors";
import { pickLanguage, resolveLanguage, type Language } from "./language";
import { isNetworkError } from "./offlineQueue";

type ProjectErrorPayload = {
  data?: {
    projectError?: {
      code?: string;
      messages?: BilingualMessage;
    };
  };
};

export function getLocalizedProjectError(error: unknown, language: Language | boolean): string {
  const lang = resolveLanguage(language);
  const messages = (error as ProjectErrorPayload | null)?.data?.projectError?.messages;
  if (messages) return messages[lang];

  // No answer from the server at all (offline, a dropped connection, a timeout): the person's data is not the problem, so do not say it is.
  if (isNetworkError(error)) {
    return pickLanguage(lang, {
      ar: "تعذّر الاتصال بالخادم. تحقق من اتصالك بالإنترنت ثم أعد المحاولة.",
      en: "Could not reach the server. Check your internet connection and try again.",
      ur: "سرور سے رابطہ نہیں ہو سکا۔ اپنا انٹرنیٹ کنکشن دیکھیں اور دوبارہ کوشش کریں۔",
    });
  }

  return pickLanguage(lang, {
    ar: "تعذر إتمام الطلب. تحقق من البيانات ثم أعد المحاولة.",
    en: "We could not complete the request. Check the details and try again.",
    ur: "ہم درخواست مکمل نہیں کر سکے۔ تفصیلات دیکھیں اور دوبارہ کوشش کریں۔",
  });
}
