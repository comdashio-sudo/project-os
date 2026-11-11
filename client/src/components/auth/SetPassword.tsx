import React from "react";
import { Button, Field, TextInput } from "@/components/ds";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { emailFieldError } from "@/lib/formValidation";
import { authErrorText, authPost, PASSWORD_MAX, passwordTooWeak } from "@/lib/authRequest";

// D-83: «forgot the password» on the sign-in page and «set a password» on the profile are one path (#241): a code is mailed (`email/request`), then the code and the
// new password go together (`password/set`), which signs the person in. The password is checked here first (8 to 72, not only spaces) so the message sits beside its
// field; the server checks it again before it spends the code. Each refusal is shown beside the field it is about, and the first such field takes the focus.
const text = {
  ar: { email: "البريد الإلكتروني", send: "أرسل رمزًا", sending: "جارٍ الإرسال…", sentTo: "أرسلنا رمزًا إلى", code: "الرمز الذي وصلك", password: "كلمة المرور الجديدة", passwordHint: "8 أحرف على الأقل.", save: "احفظ كلمة المرور وادخل", saving: "جارٍ الحفظ…", resend: "أرسل رمزًا جديدًا", codeRequired: "أدخل الرمز الذي وصلك (6 إلى 8 أرقام).", alreadySent: "أُرسل إليك رمز قبل قليل. أدخل الرمز الذي وصلك." },
  en: { email: "E-mail address", send: "Send a code", sending: "Sending…", sentTo: "We sent a code to", code: "The code you received", password: "New password", passwordHint: "At least 8 characters.", save: "Save the password and sign in", saving: "Saving…", resend: "Send a new code", codeRequired: "Enter the code you received (6 to 8 digits).", alreadySent: "A code was sent to you a moment ago. Enter the code you received." },
  ur: { email: "ای میل ایڈریس", send: "کوڈ بھیجیں", sending: "بھیجا جا رہا ہے…", sentTo: "ہم نے ایک کوڈ بھیجا ہے", code: "موصول شدہ کوڈ", password: "نیا پاس ورڈ", passwordHint: "کم از کم 8 حروف۔", save: "پاس ورڈ محفوظ کریں اور لاگ ان کریں", saving: "محفوظ کیا جا رہا ہے…", resend: "نیا کوڈ بھیجیں", codeRequired: "موصول شدہ کوڈ درج کریں (6 سے 8 ہندسے)۔", alreadySent: "ابھی ابھی آپ کو ایک کوڈ بھیجا گیا تھا۔ جو کوڈ ملا ہے وہی درج کریں۔" },
};
type Problems = { email?: string; code?: string; password?: string; general?: string };

export function SetPassword({ initialEmail = "", fixedEmail = false, onDone, children }: { initialEmail?: string; fixedEmail?: boolean; onDone: () => void; children?: React.ReactNode }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  const [step, setStep] = React.useState<"request" | "set">("request");
  const [email, setEmail] = React.useState(initialEmail);
  const [code, setCode] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [problems, setProblems] = React.useState<Problems>({});
  const form = React.useRef<HTMLFormElement>(null);
  // the first field that carries a message takes the focus, so a keyboard or screen-reader user lands on what to fix
  React.useEffect(() => { form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); }, [problems]);

  const request = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const emailProblem = emailFieldError(email, language);
    if (emailProblem) { setProblems({ email: emailProblem }); return; }
    setBusy(true); setProblems({});
    const result = await authPost("/api/auth/email/request", { email: email.trim() });
    setBusy(false);
    if (result.ok) { setCode(""); setStep("set"); }
    else if (result.code === "PROJECT_OS_AUTH_RATE_LIMITED" && result.retryAfterSeconds) { setStep("set"); setProblems({ general: t.alreadySent }); }
    else setProblems({ general: authErrorText(result.code ?? "default", language) });
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const local: Problems = {};
    if (!/^\d{6,8}$/.test(code)) local.code = t.codeRequired;
    if (passwordTooWeak(password)) local.password = authErrorText("PROJECT_OS_AUTH_PASSWORD_WEAK", language);
    if (local.code || local.password) { setProblems(local); return; }
    setBusy(true); setProblems({});
    const result = await authPost("/api/auth/password/set", { email: email.trim(), code, password });
    if (result.ok) { onDone(); return; }
    setBusy(false);
    const message = authErrorText(result.code ?? "default", language);
    setProblems(result.code === "PROJECT_OS_AUTH_PASSWORD_WEAK" ? { password: message } : result.code === "PROJECT_OS_AUTH_CODE_INVALID" ? { code: message } : { general: message });
  };

  return (
    <form ref={form} onSubmit={step === "request" ? request : save} method="post" className="grid gap-4" noValidate data-set-password={step}>
      {step === "request" ? (
        fixedEmail ? <p className="text-sm"><bdi dir="ltr" className="font-medium">{email}</bdi></p> : (
          <Field label={t.email} required error={problems.email}>
            {props => <TextInput {...props} type="email" inputMode="email" autoComplete="email" dir="ltr" value={email} onChange={event => setEmail(event.target.value)} className="min-h-12 text-base" />}
          </Field>
        )
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t.sentTo} <bdi dir="ltr" className="font-medium text-foreground">{email.trim()}</bdi></p>
          <Field label={t.code} required error={problems.code}>
            {props => <TextInput {...props} inputMode="numeric" autoComplete="one-time-code" maxLength={8} dir="ltr" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} className="min-h-12 text-center text-xl tracking-[0.3em]" />}
          </Field>
          <Field label={t.password} hint={t.passwordHint} required error={problems.password}>
            {props => <TextInput {...props} type="password" autoComplete="new-password" maxLength={PASSWORD_MAX} dir="ltr" value={password} onChange={event => setPassword(event.target.value)} className="min-h-12 text-base" />}
          </Field>
        </>
      )}
      {problems.general ? <p role="alert" className="rounded-[var(--radius)] bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">{problems.general}</p> : null}
      <Button type="submit" size="lg" className="w-full" loading={busy} disabled={busy || (step === "request" && !email.trim())}>{step === "request" ? (busy ? t.sending : t.send) : busy ? t.saving : t.save}</Button>
      <div className="flex flex-wrap justify-between gap-2 text-sm">
        {children}
        {step === "set" ? <Button variant="ghost" className="-me-4 min-h-11 text-primary" disabled={busy} onClick={() => { void request(); }}>{t.resend}</Button> : null}
      </div>
    </form>
  );
}
