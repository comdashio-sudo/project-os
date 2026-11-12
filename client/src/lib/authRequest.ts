import type { Language } from "@/lib/language";
import { projectErrorMessages } from "@shared/projectErrors";

// D-83: the sign-in requests (plain HTTP, not tRPC: the contract in the description of #241) and their messages, shared by the sign-in page and the profile's «set a password».
export type AuthReply = { ok: boolean; code?: string; retryAfterSeconds?: number };
export async function authPost(path: string, body: unknown): Promise<AuthReply> {
  try {
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
    const data = (await response.json().catch(() => ({}))) as { code?: string; retryAfterSeconds?: number };
    return { ok: response.ok, code: data.code, retryAfterSeconds: data.retryAfterSeconds };
  } catch {
    return { ok: false, code: "network" };
  }
}

/** The password rule the server applies (8 to 72 characters, not only spaces), checked here first so the message sits beside the field before anything is sent. */
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 72;
export const passwordTooWeak = (password: string) => password.length < PASSWORD_MIN || password.length > PASSWORD_MAX || password.trim() === "";

const errors: Record<Language, Record<string, string>> = {
  ar: {
      PROJECT_OS_AUTH_EMAIL_INVALID: "البريد الإلكتروني غير صحيح.",
      PROJECT_OS_AUTH_RATE_LIMITED: "محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.",
      PROJECT_OS_AUTH_MAIL_UNAVAILABLE: "تعذّر إرسال الرمز الآن. أعد المحاولة بعد قليل.",
      PROJECT_OS_AUTH_CODE_ALREADY_SENT: "أُرسل إليك رمز قبل قليل. أدخل الرمز الذي وصلك؛ طلب رمز جديد يلغي السابق.",
      PROJECT_OS_AUTH_FAILED: "تعذّر إكمال الطلب بسبب خطأ عندنا، وليس في بريدك. أعد المحاولة بعد قليل.",
      network: "تعذّر الاتصال بالخادم. تأكد من الإنترنت ثم أعد المحاولة.",
      PROJECT_OS_AUTH_CODE_INVALID: "الرمز غير صحيح أو انتهت صلاحيته.",
      google_denied: "أُلغي الدخول بحساب Google.",
      google_failed: "تعذّر الدخول بحساب Google. جرّب البريد.",
      google_unverified: "بريد حساب Google غير موثّق.",
      not_invited: "هذا البريد غير مدعوّ. اطلب دعوة من مدير شركتك أو من مالك المنصة.",
      default: "حدث خطأ. أعد المحاولة.",
  },
  en: {
      PROJECT_OS_AUTH_EMAIL_INVALID: "That e-mail address is not valid.",
      PROJECT_OS_AUTH_RATE_LIMITED: "Too many attempts. Wait a little and try again.",
      PROJECT_OS_AUTH_MAIL_UNAVAILABLE: "The code could not be sent right now. Try again shortly.",
      PROJECT_OS_AUTH_CODE_ALREADY_SENT: "A code was sent to you a moment ago. Enter the code you received; asking for a new one cancels the previous one.",
      PROJECT_OS_AUTH_FAILED: "We could not complete the request because of a problem on our side, not with your e-mail. Try again shortly.",
      network: "Could not reach the server. Check your connection and try again.",
      PROJECT_OS_AUTH_CODE_INVALID: "The code is wrong or has expired.",
      google_denied: "Google sign-in was cancelled.",
      google_failed: "Google sign-in failed. Try your e-mail instead.",
      google_unverified: "That Google account's e-mail is not verified.",
      not_invited: "This address has not been invited. Ask your company administrator or the platform owner for an invitation.",
      default: "Something went wrong. Try again.",
  },
  ur: {
      PROJECT_OS_AUTH_EMAIL_INVALID: "یہ ای میل ایڈریس درست نہیں ہے۔",
      PROJECT_OS_AUTH_RATE_LIMITED: "بہت زیادہ کوششیں۔ تھوڑی دیر انتظار کریں، پھر دوبارہ کوشش کریں۔",
      PROJECT_OS_AUTH_MAIL_UNAVAILABLE: "ابھی کوڈ نہیں بھیجا جا سکا۔ تھوڑی دیر بعد دوبارہ کوشش کریں۔",
      PROJECT_OS_AUTH_CODE_ALREADY_SENT: "ابھی ابھی آپ کو ایک کوڈ بھیجا گیا تھا۔ جو کوڈ ملا ہے وہی درج کریں؛ نیا کوڈ مانگنے سے پچھلا منسوخ ہو جاتا ہے۔",
      PROJECT_OS_AUTH_FAILED: "ہماری طرف کی خرابی کی وجہ سے درخواست مکمل نہ ہو سکی، آپ کے ای میل میں کوئی مسئلہ نہیں۔ تھوڑی دیر بعد دوبارہ کوشش کریں۔",
      network: "سرور سے رابطہ نہ ہو سکا۔ انٹرنیٹ دیکھیں اور دوبارہ کوشش کریں۔",
      PROJECT_OS_AUTH_CODE_INVALID: "کوڈ غلط ہے یا اس کی مدت ختم ہو چکی ہے۔",
      google_denied: "Google سے لاگ ان منسوخ کر دیا گیا۔",
      google_failed: "Google سے لاگ ان ناکام ہوا۔ اس کے بجائے اپنا ای میل آزمائیں۔",
      google_unverified: "اس Google اکاؤنٹ کا ای میل تصدیق شدہ نہیں ہے۔",
      not_invited: "اس پتے کو دعوت نہیں ملی۔ اپنی کمپنی کے منتظم یا پلیٹ فارم کے مالک سے دعوت مانگیں۔",
      default: "کچھ غلط ہو گیا۔ دوبارہ کوشش کریں۔",
  },
};
const shared = ["PROJECT_OS_AUTH_CREDENTIALS_INVALID", "PROJECT_OS_AUTH_PASSWORD_WEAK"] as const;
/** The message for a refusal's code in the page's language; an unknown code reads as the general one. */
export function authErrorText(code: string, language: Language): string {
  if ((shared as readonly string[]).includes(code)) return projectErrorMessages[code as (typeof shared)[number]][language];
  return errors[language][code] ?? errors[language].default;
}
