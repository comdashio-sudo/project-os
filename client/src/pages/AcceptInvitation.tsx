import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { FieldError } from "@/components/FieldError";
import { formFieldErrors } from "@/lib/formValidation";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import React from "react";
import { Link, useSearch } from "wouter";
import { pickLanguage } from "@/lib/language";

export default function AcceptInvitation() {
  const { isArabic, language } = useLanguage();
  const search = useSearch();
  const [inviteToken, setInviteToken] = React.useState(() => new URLSearchParams(search).get("token") ?? "");
  const acceptance = trpc.tenant.acceptInvitation.useMutation();
  const t = pickLanguage(language, { ar: { title: "قبول دعوة الشركة", sub: "سجّل الدخول بالبريد الذي استلم الدعوة، ثم أكمل القبول لإضافة عضويتك ودورك ضمن الشركة.", token: "رمز القبول", submit: "قبول الدعوة", submitting: "جارٍ قبول الدعوة…", success: "تم قبول الدعوة وتفعيل عضويتك بنجاح.", back: "العودة إلى مساحة العمل" }, en: { title: "Accept organization invitation", sub: "Sign in with the email address that received the invitation, then complete acceptance to add your membership and role.", token: "Acceptance token", submit: "Accept invitation", submitting: "Accepting invitation…", success: "The invitation was accepted and your membership is active.", back: "Back to workspace" }, ur: { title: "کمپنی کا دعوت نامہ قبول کریں", sub: "جس ای میل پر دعوت نامہ موصول ہوا ہے اسی سے سائن ان کریں، پھر قبولیت مکمل کریں تاکہ آپ کی رکنیت اور کردار شامل ہو جائیں۔", token: "قبولیت کا ٹوکن", submit: "دعوت نامہ قبول کریں", submitting: "دعوت نامہ قبول کیا جا رہا ہے…", success: "دعوت نامہ قبول ہو گیا اور آپ کی رکنیت فعال ہو گئی ہے۔", back: "ورک اسپیس پر واپس جائیں" } });
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors = formFieldErrors(event.currentTarget, language);
    setFieldErrors(errors);
    if (Object.keys(errors).length === 0) acceptance.mutate({ inviteToken: inviteToken.trim() });
  };
  return <main className="min-h-screen bg-background p-5 sm:p-8"><div className="mx-auto max-w-xl"><Link href="/" className="text-sm font-semibold text-primary">{t.back}</Link><Card className="mt-5"><CardHeader><ShieldCheck className="h-7 w-7 text-primary" /><h1 data-slot="card-title" className="mt-2 text-2xl font-semibold leading-none">{t.title}</h1><p className="text-sm leading-6 text-muted-foreground">{t.sub}</p></CardHeader><CardContent><form noValidate className="space-y-4" onSubmit={submit}><div className="space-y-2"><Label htmlFor="invite-token">{t.token}</Label><Input id="invite-token" required minLength={32} value={inviteToken} onChange={event => setInviteToken(event.target.value)} /><FieldError id="invite-token-error" message={fieldErrors["invite-token"]} /></div><Button type="submit" disabled={acceptance.isPending}>{acceptance.isPending ? t.submitting : t.submit}</Button>{acceptance.error ? <p role="alert" className="text-sm font-medium text-danger-soft-foreground">{getLocalizedProjectError(acceptance.error, isArabic)}</p> : null}{acceptance.isSuccess ? <p role="status" className="flex items-center gap-2 text-sm font-medium text-success-soft-foreground"><CheckCircle2 className="h-4 w-4" />{t.success}</p> : null}</form></CardContent></Card></div></main>;
}
