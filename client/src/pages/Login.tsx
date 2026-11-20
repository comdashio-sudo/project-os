import { Button, Card, DirectionProvider, Field, Logo, Segmented, TextInput } from "@/components/ds";
import { safeNext } from "@/const";
import { useLanguage } from "@/contexts/LanguageContext";
import React from "react";
import { pickLanguage } from "@/lib/language";
import { emailFieldError } from "@/lib/formValidation";
import { LanguageToggle } from "@/components/LanguageToggle";
import { SetPassword } from "@/components/auth/SetPassword";
import { authErrorText, authPost, PASSWORD_MAX } from "@/lib/authRequest";

type Step = "email" | "code";
/** D-83: two equal ways in (#241): a code by e-mail, or the e-mail and a password; «forgot the password» is a view of its own. */
type Method = "code" | "password";

const messages = {
  ar: {
    title: "تسجيل الدخول",
    tagline: "إدارة مشاريع البناء من الموقع إلى الإدارة التنفيذية، بأرقام من بيانات المشروع نفسه.",
    headline: "كل وحدة في مشروعك، في مكانها الصحيح.", subtitle: "أدخل بريدك للوصول إلى مشاريع شركتك.",
    stats: [["يومي", "تقرير الموقع"], ["S-Curve", "المخطط مقابل الفعلي"], ["3+ أيام", "تنبيه التوقف"]] as Array<[string, string]>,
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
    method: "طريقة الدخول", byCode: "رمز بالبريد", byPassword: "كلمة المرور", password: "كلمة المرور", passwordHelp: "أدخل بريدك وكلمة المرور التي عيّنتها.", signIn: "دخول", signingIn: "جارٍ الدخول…", forgot: "نسيت كلمة المرور؟", forgotTitle: "تعيين كلمة مرور جديدة", forgotHelp: "نرسل رمزًا إلى بريدك، ثم تكتب الرمز وكلمة المرور الجديدة معًا.", back: "العودة إلى الدخول", lockedFor: (m: number) => `محاولات خاطئة كثيرة. أعد المحاولة بعد ${m} دقيقة.`,
        loading: "جارٍ التحميل…",
    latestOnly: "الرمز الأحدث وحده يعمل: كل طلب رمز جديد يلغي السابق.",
    resendIn: (n: number) => `إعادة الإرسال بعد ${n} ثانية`,
  },
  en: {
    title: "Sign in",
    tagline: "Construction projects from the site to the board, with figures from the project's own data.",
    headline: "Every unit of your project, in its right place.", subtitle: "Enter your email to reach your company's projects.",
    stats: [["Daily", "Site report"], ["S-Curve", "Planned against actual"], ["3+ days", "Stall alert"]] as Array<[string, string]>,
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
    method: "How to sign in", byCode: "Code by e-mail", byPassword: "Password", password: "Password", passwordHelp: "Enter your e-mail and the password you set.", signIn: "Sign in", signingIn: "Signing in…", forgot: "Forgot the password?", forgotTitle: "Set a new password", forgotHelp: "We send a code to your e-mail; then you enter the code and the new password together.", back: "Back to sign-in", lockedFor: (m: number) => `Too many wrong attempts. Try again in ${m} min.`,
        loading: "Loading…",
    latestOnly: "Only the newest code works: every new request cancels the previous one.",
    resendIn: (n: number) => `Send a new code in ${n} s`,
  },
  ur: {
    title: "لاگ ان",
    tagline: "تعمیراتی منصوبے سائٹ سے انتظامیہ تک، منصوبے کے اپنے ڈیٹا کے اعداد کے ساتھ۔",
    headline: "آپ کے منصوبے کا ہر یونٹ، اپنی درست جگہ پر۔", subtitle: "اپنی کمپنی کے منصوبوں تک پہنچنے کے لیے ای میل درج کریں۔",
    stats: [["روزانہ", "سائٹ رپورٹ"], ["ایس کرو", "منصوبہ بمقابلہ اصل"], ["3+ دن", "رکاوٹ کا انتباہ"]] as Array<[string, string]>,
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
    method: "لاگ ان کا طریقہ", byCode: "ای میل پر کوڈ", byPassword: "پاس ورڈ", password: "پاس ورڈ", passwordHelp: "اپنا ای میل اور اپنا مقرر کردہ پاس ورڈ درج کریں۔", signIn: "لاگ ان", signingIn: "لاگ ان ہو رہا ہے…", forgot: "پاس ورڈ بھول گئے؟", forgotTitle: "نیا پاس ورڈ مقرر کریں", forgotHelp: "ہم آپ کے ای میل پر کوڈ بھیجتے ہیں، پھر آپ کوڈ اور نیا پاس ورڈ ایک ساتھ درج کرتے ہیں۔", back: "لاگ ان پر واپس", lockedFor: (m: number) => `بہت زیادہ غلط کوششیں۔ ${m} منٹ بعد دوبارہ کوشش کریں۔`,
        loading: "لوڈ ہو رہا ہے…",
    latestOnly: "صرف تازہ ترین کوڈ کام کرتا ہے: ہر نئی درخواست پچھلے کوڈ کو منسوخ کر دیتی ہے۔",
    resendIn: (n: number) => `${n} سیکنڈ بعد نیا کوڈ بھیجیں`,
  },
}

/** The code length is a server setting (Authentication > Email in Supabase): the field takes any length from 6 to 8, so changing the setting never makes a correct code unenterable. */
export const CODE_MIN_LENGTH = 6;
export const CODE_MAX_LENGTH = 8;
const RESEND_SECONDS = 60;
const EMAIL_KEY = "login.email";
const remembered = () => { try { return window.sessionStorage.getItem(EMAIL_KEY) ?? ""; } catch { return ""; } };
const remember = (email: string) => { try { window.sessionStorage.setItem(EMAIL_KEY, email); } catch { /* private window: the code step still works in this tab */ } };

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
  const [method, setMethod] = React.useState<Method>("code");
  const [forgot, setForgot] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [passwordProblem, setPasswordProblem] = React.useState<string | null>(null);
  const passwordForm = React.useRef<HTMLFormElement>(null);
  // the first field that carries a message takes the focus
  React.useEffect(() => { passwordForm.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus(); }, [emailProblem, passwordProblem]);

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

  const errorText = errorKey ? authErrorText(errorKey, language) : null;
  // the e-mail typed in one method stays when the visitor switches to the other, and so does the password
  const switchMethod = (value: string) => { setMethod(value as Method); setErrorKey(null); setEmailProblem(null); setPasswordProblem(null); };

  const signInWithPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    const problem = emailFieldError(email, language);
    setEmailProblem(problem);
    setPasswordProblem(password ? null : authErrorText("PROJECT_OS_AUTH_CREDENTIALS_INVALID", language));
    if (problem || !password) return;
    setBusy(true);
    setErrorKey(null);
    const result = await authPost("/api/auth/password/sign-in", { email: email.trim(), password });
    if (result.ok) { window.location.assign(next); return; }
    setBusy(false);
    // a wrong pair is said beside the password (the server does not say which of the two is wrong); a lock says how long it lasts
    if (result.code === "PROJECT_OS_AUTH_CREDENTIALS_INVALID") setPasswordProblem(authErrorText(result.code, language));
    else if (result.code === "PROJECT_OS_AUTH_RATE_LIMITED" && result.retryAfterSeconds) setPasswordProblem(t.lockedFor(Math.ceil(result.retryAfterSeconds / 60)));
    else setErrorKey(result.code ?? "default");
  };

  const requestCode = async (event?: React.FormEvent) => {
    event?.preventDefault();
    // The address is checked here, in the page's language, and the message is shown beside the field (the browser's own check is English).
    const problem = emailFieldError(email, language);
    setEmailProblem(problem);
    if (problem) return;
    setBusy(true);
    setErrorKey(null);
    const result = await authPost("/api/auth/email/request", { email });
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
    const result = await authPost("/api/auth/email/verify", { email, code });
    if (result.ok) {
      window.location.assign(next);
      return;
    }
    setBusy(false);
    setErrorKey(result.code ?? "default");
  };

  return (
    <DirectionProvider direction="a">
      <main className="grid min-h-screen bg-background text-foreground md:grid-cols-2 lg:grid-cols-[560px_minmax(0,1fr)]">
        {/* Q-54: the reference's dark panel — the logo at the head, the headline, the line and three short facts at the foot, a quiet mosaic of the unit states
            behind (on a phone: a band above the form with the logo and the headline only). On the right in Arabic and Urdu. */}
        <aside className="relative flex flex-col gap-4 overflow-hidden bg-sidebar px-6 pb-8 pt-[max(2rem,env(safe-area-inset-top))] text-sidebar-accent-foreground md:justify-between md:p-12" data-login-panel>
          <Logo size={40} onDark />
          <div aria-hidden="true" className="pointer-events-none absolute end-12 top-36 hidden w-[300px] grid-cols-10 gap-1.5 opacity-90 md:grid" data-login-mosaic>
            {Array.from({ length: 60 }, (_, index) => { const value = ((index * 7919) % 97) / 97 + (1 - index / 60) * 0.5; return <span key={index} className={`aspect-square rounded-[4px] ${value > 1.15 ? "bg-sidebar-mark" : value > 0.85 ? "bg-primary" : value > 0.55 ? "bg-sidebar-accent" : "bg-sidebar-surface"}`} />; })}
          </div>
          <div className="relative flex flex-col gap-3 md:gap-5">
            <h2 className="text-2xl font-bold leading-tight md:text-[40px] md:leading-[1.25]">{t.headline}</h2>
            <p className="hidden max-w-md text-base leading-relaxed text-sidebar-foreground/80 md:block">{t.tagline}</p>
            <dl className="hidden gap-7 pt-2 md:flex">
              {t.stats.map(([value, caption]) => <div key={caption} className="flex flex-col gap-0.5"><dt className="sr-only">{caption}</dt><dd className="text-[22px] font-semibold text-sidebar-mark">{value}</dd><dd className="text-xs text-sidebar-foreground/70">{caption}</dd></div>)}
            </dl>
          </div>
        </aside>
        <div className="flex flex-col items-center justify-center gap-4 p-5 md:p-12">
        <div className="flex w-full max-w-[400px] justify-end"><LanguageToggle showNote /></div>
        <Card className="w-full max-w-[400px] border-0 bg-transparent p-0 shadow-none" data-login-form>
          <h1 className="text-start text-[30px] font-bold leading-tight">{forgot ? t.forgotTitle : t.title}</h1>{forgot ? null : <p className="mt-2 text-[15px] text-muted-foreground">{t.subtitle}</p>}
          {forgot ? (
            <div className="mt-5 grid gap-4">
              <p className="text-sm text-muted-foreground">{t.forgotHelp}</p>
              <SetPassword initialEmail={email} onDone={() => window.location.assign(next)}>
                <Button variant="ghost" className="-ms-4 min-h-11 text-primary" onClick={() => { setForgot(false); setErrorKey(null); }}>{t.back}</Button>
              </SetPassword>
            </div>
          ) : (<>
          {step === "email" ? <div className="mt-5"><Segmented layout="grid" columns={2} label={t.method} value={method} onValueChange={switchMethod} options={[{ value: "code", label: t.byCode }, { value: "password", label: t.byPassword }]} /></div> : null}
          {step === "email" && method === "password" ? (
            <form ref={passwordForm} onSubmit={signInWithPassword} method="post" className="mt-5 grid gap-4" noValidate data-method="password">
              <p className="text-sm text-muted-foreground">{t.passwordHelp}</p>
              <Field label={t.email} required error={emailProblem ?? undefined}>
                {props => <TextInput {...props} type="email" inputMode="email" autoComplete="email" dir="ltr" value={email} onChange={event => setEmail(event.target.value)} className="min-h-[52px] text-base" />}
              </Field>
              <Field label={t.password} required error={passwordProblem ?? undefined}>
                {props => <TextInput {...props} type="password" autoComplete="current-password" maxLength={PASSWORD_MAX} dir="ltr" value={password} onChange={event => setPassword(event.target.value)} className="min-h-[52px] text-base" />}
              </Field>
              <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!ready || busy}>{!ready ? t.loading : busy ? t.signingIn : t.signIn}</Button>
              <Button variant="ghost" className="-ms-4 min-h-11 justify-self-start text-primary" onClick={() => { setForgot(true); setErrorKey(null); }}>{t.forgot}</Button>
            </form>
          ) : step === "email" ? (
            <form onSubmit={requestCode} method="post" className="mt-5 grid gap-4" noValidate>
              <p className="text-sm text-muted-foreground">{t.emailHelp}</p>
              <Field label={t.email} required error={emailProblem ?? undefined}>
                {props => <TextInput {...props} type="email" inputMode="email" autoComplete="email" dir="ltr" value={email} onChange={event => setEmail(event.target.value)} className="min-h-[52px] text-base" />}
              </Field>
              <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!ready || !email.trim()}>{!ready ? t.loading : busy ? t.sending : t.send}</Button>
            </form>
          ) : (
            <form onSubmit={verify} method="post" className="mt-5 grid gap-4" noValidate>
              <p className="text-sm text-muted-foreground">{t.codeHelp} <bdi dir="ltr" className="font-medium text-foreground">{email}</bdi></p>
              {/* the code step's error (wrong code, rate limit, code already sent) sits beside the code field, before the two text buttons, tied by aria-describedby */}
              <Field label={t.code} required error={errorText ?? undefined}>
                {props => <TextInput {...props} inputMode="numeric" autoComplete="one-time-code" maxLength={CODE_MAX_LENGTH} dir="ltr" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} className="min-h-12 text-center text-2xl tracking-[0.4em]" />}
              </Field>
              <Button type="submit" size="lg" className="w-full" loading={busy} disabled={!ready || code.length < CODE_MIN_LENGTH}>{!ready ? t.loading : busy ? t.verifying : t.verify}</Button>
              <p className="text-xs text-muted-foreground">{t.latestOnly}</p>
              <div className="flex flex-wrap justify-between gap-2 text-sm">
                <Button variant="ghost" className="-ms-4 min-h-11 text-primary" onClick={() => { setStep("email"); setErrorKey(null); }}>{t.changeEmail}</Button>
                <Button variant="ghost" className="-me-4 min-h-11 text-primary" disabled={!ready || busy || cooldown > 0} onClick={() => requestCode()}>{cooldown > 0 ? t.resendIn(cooldown) : t.resend}</Button>
              </div>
            </form>
          )}
          {errorText && step === "email" ? <p role="alert" className="mt-4 rounded-[var(--radius)] bg-danger-soft px-3 py-2 text-sm text-danger-soft-foreground">{errorText}</p> : null}
          {googleEnabled && step === "email" ? (
            <a href={`/api/auth/google/start?next=${encodeURIComponent(next)}`} className="mt-5 flex min-h-11 items-center justify-center rounded-[var(--radius)] border border-input px-4 text-sm font-medium hover:bg-muted">{t.google}</a>
          ) : null}
          </>)}
        </Card>
        </div>
      </main>
    </DirectionProvider>
  );
}
