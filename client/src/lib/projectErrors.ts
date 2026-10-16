import type { BilingualMessage } from "@shared/projectErrors";
import { isNetworkError } from "./offlineQueue";

type ProjectErrorPayload = {
  data?: {
    projectError?: {
      code?: string;
      messages?: BilingualMessage;
    };
  };
};

export function getLocalizedProjectError(error: unknown, isArabic: boolean): string {
  const messages = (error as ProjectErrorPayload | null)?.data?.projectError?.messages;
  if (messages) return isArabic ? messages.ar : messages.en;

  // No answer from the server at all (offline, a dropped connection, a timeout): the person's data is not the problem, so do not say it is.
  if (isNetworkError(error)) {
    return isArabic
      ? "تعذّر الاتصال بالخادم. تحقق من اتصالك بالإنترنت ثم أعد المحاولة."
      : "Could not reach the server. Check your internet connection and try again.";
  }

  return isArabic
    ? "تعذر إتمام الطلب. تحقق من البيانات ثم أعد المحاولة."
    : "We could not complete the request. Check the details and try again.";
}
