import type { BilingualMessage } from "@shared/projectErrors";

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

  return isArabic
    ? "تعذر إتمام الطلب. تحقق من البيانات ثم أعد المحاولة."
    : "We could not complete the request. Check the details and try again.";
}
