import { CheckedForm } from "@/components/CheckedForm";
import QRCode from "qrcode";
import React, { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { pickLanguage } from "@/lib/language";
import { trpc } from "@/lib/trpc";

// D-81 (owner's decision 2026-11-09): sign-in is one e-mail code. Two-step verification is a personal choice, switched on and off here (server/mfa.ts setOwnTwoStep):
// on → every later sign-in asks for an authenticator-app code; off → back to the e-mail code alone. Both directions take a current code, and "off" is refused while
// a company the person belongs to requires it (the company's administrator decides that, in the company's settings).
const dictionary = {
  ar: { title: "التحقق بخطوتين (اختياري)", hint: "الدخول برمز البريد وحده. يمكنك إضافة رمز من تطبيق مصادقة لكل دخول.", stateOn: "مفعّل لحسابك.", stateOff: "مطفأ: الدخول برمز البريد وحده.", company: "شركة أنت عضو فيها تشترطه، فلا يمكن إيقافه من هنا.", turnOn: "تفعيل", turnOff: "إيقاف", code: "رمز تطبيق المصادقة (أو رمز استرداد)", confirm: "تأكيد", cancel: "إلغاء", scan: "امسح الرمز بتطبيق المصادقة ثم أدخل الرمز الذي يظهر.", recovery: "احفظ رموز الاسترداد الآن: تُعرض مرة واحدة، وكل رمز يعمل مرة واحدة.", done: "تم", qrAlt: "رمز QR لإضافة الحساب إلى تطبيق المصادقة", openApp: "افتح في تطبيق المصادقة" },
  en: { title: "Two-step verification (optional)", hint: "Sign-in is the e-mail code alone. You can add an authenticator-app code to every sign-in.", stateOn: "On for your account.", stateOff: "Off: sign-in is the e-mail code alone.", company: "A company you belong to requires it, so it cannot be switched off here.", turnOn: "Switch on", turnOff: "Switch off", code: "Authenticator-app code (or a recovery code)", confirm: "Confirm", cancel: "Cancel", scan: "Scan the code with your authenticator app, then enter the code it shows.", recovery: "Save your recovery codes now: they are shown once, and each works once.", done: "Done", qrAlt: "QR code that adds the account to the authenticator app", openApp: "Open in the authenticator app" },
  ur: { title: "دو مرحلوں کی تصدیق (اختیاری)", hint: "سائن اِن صرف ای میل کوڈ سے۔ آپ ہر سائن اِن میں آتھنٹیکیٹر ایپ کا کوڈ شامل کر سکتے ہیں۔", stateOn: "آپ کے اکاؤنٹ کے لیے فعال۔", stateOff: "بند: سائن اِن صرف ای میل کوڈ سے۔", company: "آپ جس کمپنی کے رکن ہیں وہ اسے لازمی کرتی ہے، اس لیے یہاں سے بند نہیں ہو سکتا۔", turnOn: "فعال کریں", turnOff: "بند کریں", code: "آتھنٹیکیٹر ایپ کا کوڈ (یا ریکوری کوڈ)", confirm: "تصدیق کریں", cancel: "منسوخ کریں", scan: "آتھنٹیکیٹر ایپ سے کوڈ اسکین کریں، پھر جو کوڈ دکھائے وہ درج کریں۔", recovery: "ریکوری کوڈ ابھی محفوظ کریں: یہ ایک بار دکھائے جاتے ہیں اور ہر کوڈ ایک بار چلتا ہے۔", done: "ہو گیا", qrAlt: "اکاؤنٹ کو آتھنٹیکیٹر ایپ میں شامل کرنے کا QR کوڈ", openApp: "آتھنٹیکیٹر ایپ میں کھولیں" },
};

export function OwnTwoStepCard() {
  const { language } = useLanguage(); const t = pickLanguage(language, dictionary);
  const utils = trpc.useUtils();
  const status = trpc.mfa.status.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const [mode, setMode] = useState<"idle" | "enrol" | "on" | "off">("idle");
  const [code, setCode] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const finish = async () => { setMode("idle"); setCode(""); await utils.mfa.status.invalidate(); };
  const begin = trpc.mfa.beginEnrolment.useMutation();
  const confirm = trpc.mfa.confirmEnrolment.useMutation({ onSuccess: async result => { setRecoveryCodes(result.recoveryCodes); await finish(); } });
  const setOwn = trpc.mfa.setOwn.useMutation({ onSuccess: finish });
  useEffect(() => { if (begin.data) void QRCode.toDataURL(begin.data.otpauthUri, { margin: 1, width: 192 }).then(setQr).catch(() => setQr(null)); }, [begin.data]);
  if (status.isLoading || status.isError || !status.data) return null;
  const { selfRequired, companyRequired, enrolled } = status.data;
  const on = selfRequired || companyRequired;
  const error = begin.error ?? confirm.error ?? setOwn.error;
  const start = () => { setCode(""); if (enrolled) setMode("on"); else { setMode("enrol"); begin.mutate(); } };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (mode === "enrol" && begin.data) confirm.mutate({ code, enrolmentId: begin.data.enrolmentId, turnOn: true });
    else if (mode === "on" || mode === "off") setOwn.mutate({ on: mode === "on", code });
  };
  return (
    <Card data-own-two-step>
      <CardHeader><CardTitle>{t.title}</CardTitle><CardDescription>{t.hint}</CardDescription></CardHeader>
      <CardContent className="space-y-3">
        <p role="status" className="text-sm font-medium">{on ? t.stateOn : t.stateOff}</p>
        {companyRequired ? <p className="text-sm text-muted-foreground">{t.company}</p> : null}
        {recoveryCodes ? (
          <div className="space-y-2"><p className="text-sm">{t.recovery}</p><ul dir="ltr" className="grid grid-cols-2 gap-2 font-mono text-sm">{recoveryCodes.map(item => <li key={item} className="rounded-md border bg-muted px-3 py-2">{item}</li>)}</ul><Button className="min-h-11" type="button" onClick={() => setRecoveryCodes(null)}>{t.done}</Button></div>
        ) : mode === "idle" ? (
          selfRequired && !companyRequired ? <Button className="min-h-11" type="button" variant="outline" onClick={() => { setCode(""); setMode("off"); }}>{t.turnOff}</Button>
            : !on ? <Button className="min-h-11" type="button" onClick={start}>{t.turnOn}</Button> : null
        ) : (
          <CheckedForm className="space-y-3" onSubmit={submit}>
            {mode === "enrol" ? <><p className="text-sm text-muted-foreground">{t.scan}</p>{qr ? <img src={qr} alt={t.qrAlt} width={192} height={192} className="rounded-md border bg-white" /> : null}{begin.data ? <a href={begin.data.otpauthUri} className="inline-flex min-h-11 items-center text-sm font-semibold text-primary underline-offset-4 hover:underline">{t.openApp}</a> : null}</> : null}
            <div className="space-y-1.5"><Label htmlFor="own-two-step-code">{t.code}</Label><Input id="own-two-step-code" dir="ltr" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value)} /></div>
            <div className="flex flex-wrap gap-2"><Button className="min-h-11" type="submit" disabled={code.trim().length < 6 || confirm.isPending || setOwn.isPending || (mode === "enrol" && !begin.data)}>{t.confirm}</Button><Button className="min-h-11" type="button" variant="ghost" onClick={() => { setMode("idle"); setCode(""); }}>{t.cancel}</Button></div>
          </CheckedForm>
        )}
        {error ? <p role="alert" className="text-sm text-destructive">{getLocalizedProjectError(error, language)}</p> : null}
      </CardContent>
    </Card>
  );
}
