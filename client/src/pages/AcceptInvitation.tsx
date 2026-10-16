import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import React from "react";
import { Link, useSearch } from "wouter";

export default function AcceptInvitation() {
  const { isArabic } = useLanguage();
  const search = useSearch();
  const [inviteToken, setInviteToken] = React.useState(() => new URLSearchParams(search).get("token") ?? "");
  const acceptance = trpc.tenant.acceptInvitation.useMutation();
  const t = isArabic
    ? { title: "قبول دعوة الشركة", sub: "سجّل الدخول بالبريد الذي استلم الدعوة، ثم أكمل القبول لإضافة عضويتك ودورك ضمن الشركة.", token: "رمز القبول", submit: "قبول الدعوة", submitting: "جارٍ قبول الدعوة…", success: "تم قبول الدعوة وتفعيل عضويتك بنجاح.", back: "العودة إلى مساحة العمل" }
    : { title: "Accept organization invitation", sub: "Sign in with the email address that received the invitation, then complete acceptance to add your membership and role.", token: "Acceptance token", submit: "Accept invitation", submitting: "Accepting invitation…", success: "The invitation was accepted and your membership is active.", back: "Back to workspace" };
  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    acceptance.mutate({ inviteToken: inviteToken.trim() });
  };
  return <main className="min-h-screen bg-[#f4f6f8] p-5 sm:p-8"><div className="mx-auto max-w-xl"><Link href="/" className="text-sm font-semibold text-[#0e6b70]">{t.back}</Link><Card className="mt-5"><CardHeader><ShieldCheck className="h-7 w-7 text-[#0e6b70]" /><CardTitle className="mt-2 text-2xl">{t.title}</CardTitle><p className="text-sm leading-6 text-slate-500">{t.sub}</p></CardHeader><CardContent><form className="space-y-4" onSubmit={submit}><div className="space-y-2"><Label htmlFor="invite-token">{t.token}</Label><Input id="invite-token" required minLength={32} value={inviteToken} onChange={event => setInviteToken(event.target.value)} /></div><Button type="submit" disabled={acceptance.isPending}>{acceptance.isPending ? t.submitting : t.submit}</Button>{acceptance.error ? <p role="alert" className="text-sm font-medium text-red-700">{getLocalizedProjectError(acceptance.error, isArabic)}</p> : null}{acceptance.isSuccess ? <p role="status" className="flex items-center gap-2 text-sm font-medium text-emerald-700"><CheckCircle2 className="h-4 w-4" />{t.success}</p> : null}</form></CardContent></Card></div></main>;
}
