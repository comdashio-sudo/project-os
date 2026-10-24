import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BrandMark } from "@/components/BrandMark";
import { safeNext } from "@/const";
import { useLanguage } from "@/contexts/LanguageContext";
import React from "react";
import { pickLanguage } from "@/lib/language";
import { LanguageToggle } from "@/components/LanguageToggle";

type Step = "email" | "code";

const messages = {
  ar: {
    title: "تسجيل الدخول",
    emailHelp: "أدخل بريدك وسنرسل إليك رمزًا من 6 أرقام.",
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
    errors: {
      PROJECT_OS_AUTH_EMAIL_INVALID: "البريد الإلكتروني غير صحيح.",
      PROJECT_OS_AUTH_RATE_LIMITED: "محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.",
      PROJECT_OS_AUTH_MAIL_UNAVAILABLE: "تعذّر إرسال الرمز الآن. أعد المحاولة بعد قليل.",
      PROJECT_OS_AUTH_CODE_INVALID: "الرمز غير صحيح أو انتهت صلاحيته.",
      google_denied: "أُلغي الدخول بحساب Google.",
      google_failed: "تعذّر الدخول بحساب Google. جرّب البريد.",
      google_unverified: "بريد حساب Google غير موثّق.",
      default: "حدث خطأ. أعد المحاولة.",
    },
  },
  en: {
    title: "Sign in",
    emailHelp: "Enter your e-mail and we will send you a 6-digit code.",
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
    errors: {
      PROJECT_OS_AUTH_EMAIL_INVALID: "That e-mail address is not valid.",
      PROJECT_OS_AUTH_RATE_LIMITED: "Too many attempts. Wait a little and try again.",
      PROJECT_OS_AUTH_MAIL_UNAVAILABLE: "The code could not be sent right now. Try again shortly.",
      PROJECT_OS_AUTH_CODE_INVALID: "The code is wrong or has expired.",
      google_denied: "Google sign-in was cancelled.",
      google_failed: "Google sign-in failed. Try your e-mail instead.",
      google_unverified: "That Google account's e-mail is not verified.",
      default: "Something went wrong. Try again.",
    },
  },
  ur: {
    title: "لاگ ان",
    emailHelp: "اپنا ای میل درج کریں، ہم آپ کو 6 ہندسوں کا کوڈ بھیجیں گے۔",
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
    errors: {
      PROJECT_OS_AUTH_EMAIL_INVALID: "یہ ای میل ایڈریس درست نہیں ہے۔",
      PROJECT_OS_AUTH_RATE_LIMITED: "بہت زیادہ کوششیں۔ تھوڑی دیر انتظار کریں، پھر دوبارہ کوشش کریں۔",
      PROJECT_OS_AUTH_MAIL_UNAVAILABLE: "ابھی کوڈ نہیں بھیجا جا سکا۔ تھوڑی دیر بعد دوبارہ کوشش کریں۔",
      PROJECT_OS_AUTH_CODE_INVALID: "کوڈ غلط ہے یا اس کی مدت ختم ہو چکی ہے۔",
      google_denied: "Google سے لاگ ان منسوخ کر دیا گیا۔",
      google_failed: "Google سے لاگ ان ناکام ہوا۔ اس کے بجائے اپنا ای میل آزمائیں۔",
      google_unverified: "اس Google اکاؤنٹ کا ای میل تصدیق شدہ نہیں ہے۔",
      default: "کچھ غلط ہو گیا۔ دوبارہ کوشش کریں۔",
    },
  },
}

async function post(path: string, body: unknown): Promise<{ ok: boolean; code?: string }> {
  try {
    const response = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "include", body: JSON.stringify(body) });
    const data = (await response.json().catch(() => ({}))) as { code?: string };
    return { ok: response.ok, code: data.code };
  } catch {
    return { ok: false, code: "network" };
  }
}

export default function Login() {
  const { isArabic, language } = useLanguage();
  const t = pickLanguage(language, messages);
  const params = React.useMemo(() => new URLSearchParams(window.location.search), []);
  const next = safeNext(params.get("next"));
  const [step, setStep] = React.useState<Step>("email");
  const [email, setEmail] = React.useState("");
  const [code, setCode] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [errorKey, setErrorKey] = React.useState<string | null>(params.get("error"));
  const [googleEnabled, setGoogleEnabled] = React.useState(false);

  React.useEffect(() => {
    fetch("/api/auth/config", { credentials: "include" })
      .then(response => (response.ok ? response.json() : null))
      .then((config: { google?: boolean } | null) => setGoogleEnabled(Boolean(config?.google)))
      .catch(() => undefined);
  }, []);

  const errorText = errorKey ? ((t.errors as Record<string, string>)[errorKey] ?? t.errors.default) : null;

  const requestCode = async (event?: React.FormEvent) => {
    event?.preventDefault();
    setBusy(true);
    setErrorKey(null);
    const result = await post("/api/auth/email/request", { email });
    setBusy(false);
    if (result.ok) {
      setCode("");
      setStep("code");
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
          <form onSubmit={requestCode} className="mt-5 space-y-4" noValidate>
            <p className="text-sm text-slate-600">{t.emailHelp}</p>
            <label className="block text-sm font-medium" htmlFor="login-email">{t.email}</label>
            <Input id="login-email" type="email" inputMode="email" autoComplete="email" dir="ltr" value={email} onChange={event => setEmail(event.target.value)} className="h-12 text-base" required />
            <Button type="submit" className="h-12 w-full text-base" disabled={busy || !email.trim()}>{busy ? t.sending : t.send}</Button>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-5 space-y-4" noValidate>
            <p className="text-sm text-slate-600">{t.codeHelp} <bdi dir="ltr" className="font-medium">{email}</bdi></p>
            <label className="block text-sm font-medium" htmlFor="login-code">{t.code}</label>
            <Input id="login-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} dir="ltr" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} className="h-12 text-center text-2xl tracking-[0.4em]" required />
            <Button type="submit" className="h-12 w-full text-base" disabled={busy || code.length !== 6}>{busy ? t.verifying : t.verify}</Button>
            <div className="flex justify-between text-sm">
              <button type="button" className="text-[#0e6b70] underline" onClick={() => { setStep("email"); setErrorKey(null); }}>{t.changeEmail}</button>
              <button type="button" className="text-[#0e6b70] underline disabled:opacity-50" disabled={busy} onClick={() => requestCode()}>{t.resend}</button>
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
