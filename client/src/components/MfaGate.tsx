import QRCode from "qrcode";
import React, { useEffect, useRef, useState } from "react";
import { Button, Card, CardBody, CardHeader, CardTitle, DirectionProvider, Field, Logo, TextInput, notify } from "@/components/ds";
import { DashboardLayoutSkeleton } from "@/components/DashboardLayoutSkeleton";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { pickLanguage } from "@/lib/language";
import { trpc } from "@/lib/trpc";

// Two-step verification, shown ONLY to a person who must pass it (server/mfa.ts isMfaRequired: since D-81, nobody by default — only someone who switched it on for himself, or a member
// of a company that requires it; the platform owner and company administrators are not asked by role). The server refuses everything else until the session passes it;
// this screen is how it does: set up an authenticator app once (and keep the recovery codes), then enter its code at each sign-in.
const dictionary = {
  ar: {
    title: "التحقق بخطوتين", setupIntro: "شركتك تشترط التحقق بخطوتين. أضف حسابك إلى تطبيق مصادقة (Google Authenticator أو Microsoft Authenticator أو أي تطبيق TOTP) مرة واحدة.",
    start: "ابدأ التفعيل", secretLabel: "المفتاح السري (أدخله في التطبيق، أو افتح الرابط من هاتفك)", openApp: "افتح في تطبيق المصادقة", codeLabel: "الرمز المكوّن من 6 أرقام من التطبيق", confirm: "تأكيد وتفعيل",
    verifyIntro: "أدخل الرمز الحالي من تطبيق المصادقة لمتابعة العمل. إن فقدت هاتفك فأدخل أحد رموز الاسترداد.", verifyCodeLabel: "رمز التطبيق أو رمز استرداد", verify: "متابعة",
    recoveryTitle: "احفظ رموز الاسترداد الآن", recoveryText: "تُعرض مرة واحدة فقط. كل رمز يعمل مرة واحدة، وهي طريقك إن فقدت الهاتف. احفظها في مكان آمن بعيدًا عن هذا الجهاز.", saved: "حفظتها، تابع", signOut: "تسجيل الخروج", scan: "امسح الرمز بتطبيق المصادقة", showKey: "أظهر المفتاح للإدخال اليدوي", hideKey: "أخفِ المفتاح", later: "لاحقًا (7 أيام)", laterNote: "يؤجّل الإلزام سبعة أيام مرة واحدة في هذا المتصفح.", preparing: "جارٍ تجهيز التفعيل…", qrAlt: "رمز QR لإضافة الحساب إلى تطبيق المصادقة",
  },
  en: {
    title: "Two-step verification", setupIntro: "Your company requires two-step verification. Add your account to an authenticator app (Google Authenticator, Microsoft Authenticator or any TOTP app) once.",
    start: "Start the setup", secretLabel: "Secret key (enter it in the app, or open the link on your phone)", openApp: "Open in the authenticator app", codeLabel: "The 6-digit code from the app", confirm: "Confirm and switch on",
    verifyIntro: "Enter the current code from your authenticator app to continue. If you lost your phone, enter one of your recovery codes.", verifyCodeLabel: "App code or recovery code", verify: "Continue",
    recoveryTitle: "Save your recovery codes now", recoveryText: "They are shown only once. Each works once, and they are your way in if you lose the phone. Keep them somewhere safe, away from this device.", saved: "I saved them, continue", signOut: "Sign out", scan: "Scan the code with your authenticator app", showKey: "Show the key to type it in", hideKey: "Hide the key", later: "Later (7 days)", laterNote: "Postpones the requirement for seven days, once in this browser.", preparing: "Preparing the setup…", qrAlt: "QR code that adds the account to the authenticator app",
  },
  ur: {
    title: "دو مرحلوں کی تصدیق", setupIntro: "آپ کی کمپنی دو مرحلوں کی تصدیق لازمی کرتی ہے۔ اپنا اکاؤنٹ ایک بار آتھنٹیکیٹر ایپ (Google Authenticator، Microsoft Authenticator یا کوئی بھی TOTP ایپ) میں شامل کریں۔",
    start: "سیٹ اپ شروع کریں", secretLabel: "خفیہ کلید (ایپ میں درج کریں، یا فون پر لنک کھولیں)", openApp: "آتھنٹیکیٹر ایپ میں کھولیں", codeLabel: "ایپ کا 6 ہندسوں کا کوڈ", confirm: "تصدیق کریں اور فعال کریں",
    verifyIntro: "جاری رکھنے کے لیے آتھنٹیکیٹر ایپ کا موجودہ کوڈ درج کریں۔ فون کھو جائے تو ریکوری کوڈ درج کریں۔", verifyCodeLabel: "ایپ کا کوڈ یا ریکوری کوڈ", verify: "جاری رکھیں",
    recoveryTitle: "ریکوری کوڈ ابھی محفوظ کریں", recoveryText: "یہ صرف ایک بار دکھائے جاتے ہیں۔ ہر کوڈ ایک بار چلتا ہے، اور فون کھونے پر یہی آپ کا راستہ ہیں۔ انہیں اس ڈیوائس سے الگ محفوظ جگہ رکھیں۔", saved: "میں نے محفوظ کر لیے، جاری رکھیں", signOut: "سائن آؤٹ", scan: "آتھنٹیکیٹر ایپ سے کوڈ اسکین کریں", showKey: "ہاتھ سے درج کرنے کے لیے کلید دکھائیں", hideKey: "کلید چھپائیں", later: "بعد میں (7 دن)", laterNote: "اس براؤزر میں ایک بار سات دن کے لیے لازمی تقاضا مؤخر کرتا ہے۔", preparing: "سیٹ اپ تیار ہو رہا ہے…", qrAlt: "اکاؤنٹ کو آتھنٹیکیٹر ایپ میں شامل کرنے کا QR کوڈ",
  },
};

/** Lets the children through unless this person must pass the second step and this session has not. A failed status read lets them through: the server is the gate, this screen only explains it. */
export function MfaGate({ children }: { children: React.ReactNode }) {
  const status = trpc.mfa.status.useQuery(undefined, { retry: false, refetchOnWindowFocus: false, staleTime: 5 * 60_000 });
  if (status.isLoading) return <DashboardLayoutSkeleton />;
  if (status.isError || !status.data || !status.data.required || status.data.verified || status.data.postponedUntil) return <>{children}</>;
  return <MfaPanel enrolled={status.data.enrolled} canPostpone={status.data.canPostpone} />;
}

function MfaPanel({ enrolled, canPostpone }: { enrolled: boolean; canPostpone: boolean }) {
  const { language } = useLanguage(); const t = pickLanguage(language, dictionary);
  const { logout } = useAuth();
  const utils = trpc.useUtils();
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string; enrolmentId: string } | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [qr, setQr] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  // the session is verified on the server when these succeed; every cached read is then fetched again, now that it is allowed
  const done = async () => { await utils.invalidate(); };
  const begin = trpc.mfa.beginEnrolment.useMutation({ onSuccess: result => setSetup(result) });
  const postpone = trpc.mfa.postpone.useMutation({ onSuccess: async () => { await done(); } });
  const confirm = trpc.mfa.confirmEnrolment.useMutation({ onSuccess: result => { setRecoveryCodes(result.recoveryCodes); setCode(""); } });
  const verify = trpc.mfa.verify.useMutation({ onSuccess: async () => { notify.success(t.title); await done(); } });
  // There is at most ONE pending enrolment per person, and asking for it again returns the same one (server/mfa.ts): so the setup starts by itself, once, and a reload shows the same code.
  const started = useRef(false);
  useEffect(() => { if (!enrolled && !started.current) { started.current = true; begin.mutate(); } }, [enrolled]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (setup) void QRCode.toDataURL(setup.otpauthUri, { margin: 1, width: 224 }).then(setQr).catch(() => setQr(null)); }, [setup]);
  const error = begin.error ?? confirm.error ?? verify.error ?? postpone.error;
  // the error is said in the page's language (Urdu included) and, on the code forms, beside the field it is about (Field ties it by aria-describedby)
  const errorText = error ? getLocalizedProjectError(error, language) : undefined;
  return (
    <DirectionProvider direction="a">
      <main className="flex min-h-screen flex-col items-center justify-center gap-5 bg-background px-5 py-10 text-foreground">
        <Logo />
        <Card className="w-full max-w-xl" aria-label={t.title}>
          <CardHeader><CardTitle>{recoveryCodes ? t.recoveryTitle : t.title}</CardTitle></CardHeader>
          <CardBody className="grid gap-5">
            {recoveryCodes ? (
              <>
                <p className="text-sm text-muted-foreground">{t.recoveryText}</p>
                <ul dir="ltr" className="grid grid-cols-2 gap-2 font-mono text-sm" aria-label={t.recoveryTitle}>{recoveryCodes.map(item => <li key={item} className="rounded-[var(--radius-sm)] border border-border bg-muted px-3 py-2">{item}</li>)}</ul>
                <div><Button onClick={done}>{t.saved}</Button></div>
              </>
            ) : enrolled ? (
              <form className="grid gap-5" onSubmit={event => { event.preventDefault(); verify.mutate({ code }); }}>
                <p className="text-sm text-muted-foreground">{t.verifyIntro}</p>
                <Field label={t.verifyCodeLabel} required error={errorText}>{props => <TextInput {...props} dir="ltr" autoComplete="one-time-code" inputMode="text" value={code} onChange={event => setCode(event.target.value)} />}</Field>
                <div className="flex items-center gap-3"><Button type="submit" loading={verify.isPending} disabled={code.trim().length < 6}>{t.verify}</Button><Button type="button" variant="ghost" onClick={logout}>{t.signOut}</Button></div>
              </form>
            ) : !setup ? (
              <>
                <p className="text-sm text-muted-foreground">{t.setupIntro}</p>
                {errorText ? <p role="alert" className="text-sm font-medium text-destructive">{errorText}</p> : <p role="status" className="text-sm text-muted-foreground">{t.preparing}</p>}
                <div className="flex items-center gap-3"><Button variant="secondary" onClick={() => begin.mutate()}>{t.start}</Button><Button variant="ghost" onClick={logout}>{t.signOut}</Button></div>
              </>
            ) : (
              <form className="grid gap-5" onSubmit={event => { event.preventDefault(); confirm.mutate({ code, enrolmentId: setup!.enrolmentId }); }}>
                <div className="grid gap-3">
                  <p className="text-sm text-muted-foreground">{t.setupIntro}</p>
                  <p className="text-sm font-medium">{t.scan}</p>
                  {qr ? <img src={qr} alt={t.qrAlt} width={224} height={224} className="hidden rounded-[var(--radius-sm)] border border-border bg-white sm:block" /> : null}
                  <a href={setup.otpauthUri} className="inline-flex min-h-11 items-center justify-self-start text-sm font-semibold text-primary underline-offset-4 hover:underline">{t.openApp}</a>
                  <div><Button type="button" variant="ghost" className="-ms-4" onClick={() => setShowKey(value => !value)}>{showKey ? t.hideKey : t.showKey}</Button></div>
                  {showKey ? <p dir="ltr" className="break-all rounded-[var(--radius-sm)] border border-border bg-muted px-3 py-2 font-mono text-sm" data-testid="mfa-secret">{setup.secret}</p> : null}
                </div>
                <Field label={t.codeLabel} required error={errorText}>{props => <TextInput {...props} dir="ltr" autoComplete="one-time-code" inputMode="numeric" value={code} onChange={event => setCode(event.target.value)} />}</Field>
                <div className="flex flex-wrap items-center gap-3"><Button type="submit" loading={confirm.isPending} disabled={code.trim().length < 6}>{t.confirm}</Button>{canPostpone ? <Button type="button" variant="secondary" loading={postpone.isPending} onClick={() => postpone.mutate()}>{t.later}</Button> : null}<Button type="button" variant="ghost" onClick={logout}>{t.signOut}</Button></div>
                {canPostpone ? <p className="text-xs text-muted-foreground">{t.laterNote}</p> : null}
              </form>
            )}
          </CardBody>
        </Card>
      </main>
    </DirectionProvider>
  );
}
