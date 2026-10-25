import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandMark } from "@/components/BrandMark";
import { safeNext } from "@/const";
import { useLanguage } from "@/contexts/LanguageContext";
import React from "react";
import { pickLanguage } from "@/lib/language";
import { emailFieldError } from "@/lib/formValidation";
import { LanguageToggle } from "@/components/LanguageToggle";

type Step = "email" | "code";

const messages = {
  ar: {
    title: "تسجيل الدخول",
    emailHelp: "أدخل بريدك وسنرسل إليك رمز الدخول. الدخول بدعوة من مدير شركتك أو من مالك المنصة.",
    email: "البريد الإلكتروني",
    send: "إرسال الرمز",
    sending: "جارٍ الإرسال…",
    codeHelp: "أرسلنا رمزًا إلى",
    code: "رمز الدخول",
    verify: "دخول",
    verifying: "جارٍ التحقق…",
    changeEmail: "تغيير البريد",
    resend: "إعادة إرسال الرمز",
    google: "المتابعة بحساب Google",
        loading: "جارٍ التحميل…",
    latestOnly: "الرمز الأحدث وحده يعمل: كل طلب رمز جديد يلغي السابق.",
    resendIn: (n: number) => `إعادة الإرسال بعد ${n} ثانية`,
    errors: {
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
  },
  en: {
    title: "Sign in",
    emailHelp: "Enter your e-mail and we will send you a sign-in code. Sign-in is by invitation from your company administrator or the platform owner.",
    email: "E-mail address",
    send: "Send code",
    sending: "Sending…",
    codeHelp: "We sent a code to",
    code: "Sign-in code",
    verify: "Sign in",
    verifying: "Checking…",
    changeEmail: "Use another e-mail",
    resend: "Send a new code",
    google: "Continue with Google",
        loading: "Loading…",
    latestOnly: "Only the newest code works: every new request cancels the previous one.",
    resendIn: (n: number) => `Send a new code in ${n} s`,
    errors: {
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
  },
  ur: {
    title: "لاگ ان",
    emailHelp: "اپنا ای میل درج کریں، ہم آپ کو لاگ ان کوڈ بھیجیں گے۔ لاگ ان آپ کی کمپنی کے منتظم یا پلیٹ فارم کے مالک کی دعوت پر ہے۔",
    email: "ای میل ایڈریس",
    send: "کوڈ بھیجیں",
    sending: "بھیجا جا رہا ہے…",
    codeHelp: "ہم نے ایک کوڈ بھیجا ہے",
    code: "لاگ ان کوڈ",
    verify: "لاگ ان",
    verifying: "جانچا جا رہا ہے…",
    changeEmail: "کوئی اور ای میل استعمال کریں",
    resend: "نیا کوڈ بھیجیں",
    google: "Google کے ساتھ جاری رکھیں",
        loading: "لوڈ ہو رہا ہے…",
    latestOnly: "صرف تازہ ترین کوڈ کام کرتا ہے: ہر نئی درخواست پچھلے کوڈ کو منسوخ کر دیتی ہے۔",
    resendIn: (n: number) => `${n} سیکنڈ بعد نیا کوڈ بھیجیں`,
    errors: {
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
  },
}

/** The code length is a server setting (Authentication > Email in Supabase): the field takes any length from 6 to 8, so changing the setting never makes a correct code unenterable. */
export const CODE_MIN_LENGTH = 6;
export const CODE_MAX_LENGTH = 8;
const RESEND_SECONDS = 60;
const EMAIL_KEY = "login.email";
const remembered = () => { try { return window.sessionStorage.getItem(EMAIL_KEY) ?? ""; } catch { return ""; } };
const remember = (email: string) => { try { window.sessionStorage.setItem(EMAIL_KEY, email); } catch { /* private window: the code step still works in this tab */ } };

async function post(path: string, body: unknown): Promise<{ ok: boolean; code?: string; retryAfterSeconds?: number }> {
  try {
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
    const data = (await response.json().catch(() => ({}))) as { code?: string; retryAfterSeconds?: number };
    return { ok: response.ok, code: data.code, retryAfterSeconds: data.retryAfterSeconds };
  } catch {
    return { ok: false, code: "network" };
  }
}

export default function Login() {
  const { isArabic, language } = useLanguage();
  const t = pickLanguage(language, messages);
  const params = React.useMemo(() => new URLSearchParams(window.location.search), []);
  const next = safeNext(params.get("next"));
  // /login?step=code opens the code step (the mailed button did, until the owner removed it on 2026-10-25 because the sender's domain differs from the platform's; it returns with a domain of its own). The address never travels in a link: it is kept in this browser tab's session storage when the code is requested.
  const resume = React.useMemo(() => (params.get("step") === "code" ? remembered() : ""), [params]);
  const [step, setStep] = React.useState<Step>(resume ? "code" : "email");
  const [email, setEmail] = React.useState(resume);
  const [ready, setReady] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(0);
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<string | null>(params.get("error"));
  const [googleEnabled, setGoogleEnabled] = React.useState(false);
  const [emailProblem, setEmailProblem] = React.useState<string | null>(null);

  // The button stays disabled until the page is interactive, so a press can never go to a form nothing is listening to.
  React.useEffect(() => { setReady(true); }, []);
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown(value => Math.max(0, value - 1)), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  React.useEffect(() => {
    fetch("/api/auth/config", { credentials: "include" })
      .then(response => (response.ok ? response.json() : null))
      .then((config: { google?: boolean } | null) => setGoogleEnabled(Boolean(config?.google)))
      .catch(() => undefined);
  }, []);

  const errorText = errorKey ? ((t.errors as Record<string, string>)[errorKey] ?? t.errors.default) : null;

  const requestCode = async (event?: React.FormEvent) => {
    event?.preventDefault();
    // The address is checked here, in the page's language, and the message is shown beside the field (the browser's own check is English).
    const problem = emailFieldError(email, language);
    setEmailProblem(problem);
    if (problem) return;
    setBusy(true);
    setErrorKey(null);
    const result = await post("/api/auth/email/request", { email });
    setBusy(false);
    if (result.ok) {
      remember(email.trim());
      setCode("");
      setStep("code");
      setCooldown(RESEND_SECONDS);
    } else if (result.code === "PROJECT_OS_AUTH_RATE_LIMITED" && result.retryAfterSeconds) {
      // The provider's own send limit ("after N seconds"): a code was just sent, so this is not a wrong code and not a dead end.
      remember(email.trim());
      setStep("code");
      setCooldown(result.retryAfterSeconds);
      setErrorKey("PROJECT_OS_AUTH_CODE_ALREADY_SENT");
    } else setErrorKey(result.code ?? "default");
  };

  const verify = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setErrorKey(null);
    const result = await post("/api/auth/email/verify", { email, code });
    if (result.ok) {
      window.location.assign(next);
      return;
    }
    setBusy(false);
    setErrorKey(result.code ?? "default");
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[#f4f6f8] p-5">
      <div className="absolute end-4 top-4"><LanguageToggle showNote /></div>
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200">
        <BrandMark className="mx-auto mb-5 h-9 w-auto max-w-full" />
        <h1 className="text-center text-xl font-semibold">{t.title}</h1>
        {step === "email" ? (
          <form onSubmit={requestCode} method="post" className="mt-5 space-y-4" noValidate>
            <p className="text-sm text-slate-600">{t.emailHelp}</p>
            <label className="block text-sm font-medium" htmlFor="login-email">{t.email}</label>
            <Input id="login-email" type="email" inputMode="email" autoComplete="email" dir="ltr" value={email} onChange={event => setEmail(event.target.value)} className="h-12 text-base" required aria-invalid={!!emailProblem} aria-describedby={emailProblem ? "login-email-error" : undefined} />
            {emailProblem ? <p id="login-email-error" role="alert" className="text-sm text-red-700">{emailProblem}</p> : null}
            <Button type="submit" className="h-12 w-full text-base" disabled={!ready || busy || !email.trim()}>{!ready ? t.loading : busy ? t.sending : t.send}</Button>
          </form>
        ) : (
          <form onSubmit={verify} method="post" className="mt-5 space-y-4" noValidate>
            <p className="text-sm text-slate-600">{t.codeHelp} <bdi dir="ltr" className="font-medium">{email}</bdi></p>
            <label className="block text-sm font-medium" htmlFor="login-code">{t.code}</label>
            <Input id="login-code" inputMode="numeric" autoComplete="one-time-code" maxLength={CODE_MAX_LENGTH} dir="ltr" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} className="h-12 text-center text-2xl tracking-[0.4em]" required />
            <Button type="submit" className="h-12 w-full text-base" disabled={!ready || busy || code.length < CODE_MIN_LENGTH}>{!ready ? t.loading : busy ? t.verifying : t.verify}</Button>
            <p className="text-xs text-slate-600">{t.latestOnly}</p>
            <div className="flex justify-between text-sm">
              <button type="button" className="text-[#0e6b70] underline" onClick={() => { setStep("email"); setErrorKey(null); }}>{t.changeEmail}</button>
              <button type="button" className="text-[#0e6b70] underline disabled:opacity-50" disabled={!ready || busy || cooldown > 0} onClick={() => requestCode()}>{cooldown > 0 ? t.resendIn(cooldown) : t.resend}</button>
            </div>
          </form>
        )}
        {errorText ? <p role="alert" className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{errorText}</p> : null}
        {googleEnabled && step === "email" ? (
          <a href={`/api/auth/google/start?next=${encodeURIComponent(next)}`} className="mt-5 block rounded-md border border-slate-300 px-4 py-3 text-center text-sm font-medium hover:bg-slate-50">{t.google}</a>
        ) : null}
      </div>
    </main>
  );
}
