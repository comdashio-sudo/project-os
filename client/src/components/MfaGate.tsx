import React, { useState } from "react";
import { Button, Card, CardBody, CardHeader, CardTitle, Field, TextInput, notify } from "@/components/ds";
import { DashboardLayoutSkeleton } from "@/components/DashboardLayoutSkeleton";
import { useAuth } from "@/_core/hooks/useAuth";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { pickLanguage } from "@/lib/language";
import { trpc } from "@/lib/trpc";

// Two-step verification for the platform owner and company administrators (server: server/mfa.ts). The server refuses everything else until the session passes it;
// this screen is how it does: set up an authenticator app once (and keep the recovery codes), then enter its code at each sign-in.
const dictionary = {
  ar: {
    title: "التحقق بخطوتين", setupIntro: "حسابك يدير المنصة أو شركة، فيلزمه تحقق بخطوتين. أضف حسابك إلى تطبيق مصادقة (Google Authenticator أو Microsoft Authenticator أو أي تطبيق TOTP) مرة واحدة.",
    start: "ابدأ التفعيل", secretLabel: "المفتاح السري (أدخله في التطبيق، أو افتح الرابط من هاتفك)", openApp: "افتح في تطبيق المصادقة", codeLabel: "الرمز المكوّن من 6 أرقام من التطبيق", confirm: "تأكيد وتفعيل",
    verifyIntro: "أدخل الرمز الحالي من تطبيق المصادقة لمتابعة العمل. إن فقدت هاتفك فأدخل أحد رموز الاسترداد.", verifyCodeLabel: "رمز التطبيق أو رمز استرداد", verify: "متابعة",
    recoveryTitle: "احفظ رموز الاسترداد الآن", recoveryText: "تُعرض مرة واحدة فقط. كل رمز يعمل مرة واحدة، وهي طريقك إن فقدت الهاتف. احفظها في مكان آمن بعيدًا عن هذا الجهاز.", saved: "حفظتها، تابع", signOut: "تسجيل الخروج",
  },
  en: {
    title: "Two-step verification", setupIntro: "Your account administers the platform or a company, so it needs two-step verification. Add your account to an authenticator app (Google Authenticator, Microsoft Authenticator or any TOTP app) once.",
    start: "Start the setup", secretLabel: "Secret key (enter it in the app, or open the link on your phone)", openApp: "Open in the authenticator app", codeLabel: "The 6-digit code from the app", confirm: "Confirm and switch on",
    verifyIntro: "Enter the current code from your authenticator app to continue. If you lost your phone, enter one of your recovery codes.", verifyCodeLabel: "App code or recovery code", verify: "Continue",
    recoveryTitle: "Save your recovery codes now", recoveryText: "They are shown only once. Each works once, and they are your way in if you lose the phone. Keep them somewhere safe, away from this device.", saved: "I saved them, continue", signOut: "Sign out",
  },
  ur: {
    title: "دو مرحلوں کی تصدیق", setupIntro: "آپ کا اکاؤنٹ پلیٹ فارم یا کسی کمپنی کا انتظام کرتا ہے، اس لیے دو مرحلوں کی تصدیق ضروری ہے۔ اپنا اکاؤنٹ ایک بار آتھنٹیکیٹر ایپ (Google Authenticator، Microsoft Authenticator یا کوئی بھی TOTP ایپ) میں شامل کریں۔",
    start: "سیٹ اپ شروع کریں", secretLabel: "خفیہ کلید (ایپ میں درج کریں، یا فون پر لنک کھولیں)", openApp: "آتھنٹیکیٹر ایپ میں کھولیں", codeLabel: "ایپ کا 6 ہندسوں کا کوڈ", confirm: "تصدیق کریں اور فعال کریں",
    verifyIntro: "جاری رکھنے کے لیے آتھنٹیکیٹر ایپ کا موجودہ کوڈ درج کریں۔ فون کھو جائے تو ریکوری کوڈ درج کریں۔", verifyCodeLabel: "ایپ کا کوڈ یا ریکوری کوڈ", verify: "جاری رکھیں",
    recoveryTitle: "ریکوری کوڈ ابھی محفوظ کریں", recoveryText: "یہ صرف ایک بار دکھائے جاتے ہیں۔ ہر کوڈ ایک بار چلتا ہے، اور فون کھونے پر یہی آپ کا راستہ ہیں۔ انہیں اس ڈیوائس سے الگ محفوظ جگہ رکھیں۔", saved: "میں نے محفوظ کر لیے، جاری رکھیں", signOut: "سائن آؤٹ",
  },
};

/** Lets the children through unless this person must pass the second step and this session has not. A failed status read lets them through: the server is the gate, this screen only explains it. */
export function MfaGate({ children }: { children: React.ReactNode }) {
  const status = trpc.mfa.status.useQuery(undefined, { retry: false, refetchOnWindowFocus: false, staleTime: 5 * 60_000 });
  if (status.isLoading) return <DashboardLayoutSkeleton />;
  if (status.isError || !status.data || !status.data.required || status.data.verified) return <>{children}</>;
  return <MfaPanel enrolled={status.data.enrolled} />;
}

function MfaPanel({ enrolled }: { enrolled: boolean }) {
  const { language, isArabic } = useLanguage(); const t = pickLanguage(language, dictionary);
  const { logout } = useAuth();
  const utils = trpc.useUtils();
  const [code, setCode] = useState("");
  const [setup, setSetup] = useState<{ secret: string; otpauthUri: string } | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  // the session is verified on the server when these succeed; every cached read is then fetched again, now that it is allowed
  const done = async () => { await utils.invalidate(); };
  const begin = trpc.mfa.beginEnrolment.useMutation({ onSuccess: result => setSetup(result) });
  const confirm = trpc.mfa.confirmEnrolment.useMutation({ onSuccess: result => { setRecoveryCodes(result.recoveryCodes); setCode(""); } });
  const verify = trpc.mfa.verify.useMutation({ onSuccess: async () => { notify.success(t.title); await done(); } });
  const error = begin.error ?? confirm.error ?? verify.error;
  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-5 py-10">
      <Card className="w-full" aria-label={t.title}>
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
              <Field label={t.verifyCodeLabel} required>{props => <TextInput {...props} dir="ltr" autoComplete="one-time-code" inputMode="text" value={code} onChange={event => setCode(event.target.value)} />}</Field>
              {error ? <p role="alert" className="text-sm font-medium text-destructive">{getLocalizedProjectError(error, isArabic)}</p> : null}
              <div className="flex items-center gap-3"><Button type="submit" loading={verify.isPending} disabled={code.trim().length < 6}>{t.verify}</Button><Button type="button" variant="ghost" onClick={logout}>{t.signOut}</Button></div>
            </form>
          ) : !setup ? (
            <>
              <p className="text-sm text-muted-foreground">{t.setupIntro}</p>
              {error ? <p role="alert" className="text-sm font-medium text-destructive">{getLocalizedProjectError(error, isArabic)}</p> : null}
              <div className="flex items-center gap-3"><Button loading={begin.isPending} onClick={() => begin.mutate()}>{t.start}</Button><Button variant="ghost" onClick={logout}>{t.signOut}</Button></div>
            </>
          ) : (
            <form className="grid gap-5" onSubmit={event => { event.preventDefault(); confirm.mutate({ code }); }}>
              <div className="grid gap-2"><p className="text-sm font-medium">{t.secretLabel}</p><p dir="ltr" className="break-all rounded-[var(--radius-sm)] border border-border bg-muted px-3 py-2 font-mono text-sm" data-testid="mfa-secret">{setup.secret}</p><a href={setup.otpauthUri} className="text-sm font-semibold text-primary">{t.openApp}</a></div>
              <Field label={t.codeLabel} required>{props => <TextInput {...props} dir="ltr" autoComplete="one-time-code" inputMode="numeric" value={code} onChange={event => setCode(event.target.value)} />}</Field>
              {error ? <p role="alert" className="text-sm font-medium text-destructive">{getLocalizedProjectError(error, isArabic)}</p> : null}
              <div className="flex items-center gap-3"><Button type="submit" loading={confirm.isPending} disabled={code.trim().length < 6}>{t.confirm}</Button><Button type="button" variant="ghost" onClick={logout}>{t.signOut}</Button></div>
            </form>
          )}
        </CardBody>
      </Card>
    </main>
  );
}
