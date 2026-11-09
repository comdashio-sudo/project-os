import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, Checkbox } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { pickLanguage } from "@/lib/language";
import React from "react";

// D-81 (owner's decision 2026-11-09): sign-in is one e-mail code; two-step verification is required of nobody unless the company asks for it here. Off by default.
// Switching it on asks every active member of THIS company (its administrators included) for an authenticator-app code at the next request; switching it off lifts it at once.
// Switching it ON touches every member, so it asks once to confirm; switching it off does not. Renders nothing when the server refuses the read (a person who is not the company's administrator): the server is the gate, this card only offers the choice.
export function TwoStepRequirementCard({ tenantId }: { tenantId: string }) {
  const { language } = useLanguage();
  const [confirming, setConfirming] = React.useState(false);
  const utils = trpc.useUtils();
  const settings = trpc.tenant.securitySettings.useQuery({ tenantId }, { retry: false });
  const save = trpc.tenant.setRequireTwoStep.useMutation({ onSuccess: async () => { setConfirming(false); await utils.tenant.securitySettings.invalidate({ tenantId }); await utils.mfa.status.invalidate(); } });
  const t = pickLanguage(language, {
    ar: { title: "التحقق بخطوتين", label: "اشتراط التحقق بخطوتين لأعضاء الشركة", note: "مطفأ افتراضيًا: الدخول برمز البريد وحده. عند تفعيله يُطلب من كل عضو في هذه الشركة رمز من تطبيق مصادقة بعد رمز البريد.", on: "مفعّل", off: "مطفأ", saving: "جارٍ الحفظ…", confirmText: "سيُطلب من كل أعضاء الشركة رمز من تطبيق مصادقة عند دخولهم التالي، ومن لم يُعدّه بعد يُطلب منه إعداده. متابعة؟", confirm: "نعم، اشترطه", cancel: "إلغاء" },
    en: { title: "Two-step verification", label: "Require two-step verification of the company's members", note: "Off by default: sign-in is the e-mail code alone. When on, every member of this company is asked for an authenticator-app code after the e-mail code.", on: "On", off: "Off", saving: "Saving…", confirmText: "Every member of the company will be asked for an authenticator-app code at their next sign-in, and anyone who has not set one up will be asked to. Continue?", confirm: "Yes, require it", cancel: "Cancel" },
    ur: { title: "دو مرحلوں کی تصدیق", label: "کمپنی کے اراکین کے لیے دو مرحلوں کی تصدیق لازمی کریں", note: "بطور طے شدہ بند: سائن اِن صرف ای میل کوڈ سے۔ فعال کرنے پر اس کمپنی کے ہر رکن سے ای میل کوڈ کے بعد آتھنٹیکیٹر ایپ کا کوڈ مانگا جائے گا۔", on: "فعال", off: "بند", saving: "محفوظ ہو رہا ہے…", confirmText: "کمپنی کے ہر رکن سے اگلے سائن اِن پر آتھنٹیکیٹر ایپ کا کوڈ مانگا جائے گا، اور جس نے اسے سیٹ نہیں کیا اس سے سیٹ کرنے کو کہا جائے گا۔ جاری رکھیں؟", confirm: "ہاں، لازمی کریں", cancel: "منسوخ کریں" },
  });
  if (settings.isLoading || settings.isError || !settings.data) return null;
  const required = settings.data.requireTwoStep;
  return (
    <Card data-two-step-requirement>
      <CardHeader><CardTitle className="flex flex-wrap items-center gap-2 text-lg">{t.title}<Badge tone={required ? "success" : "neutral"}>{required ? t.on : t.off}</Badge></CardTitle><p className="text-sm text-slate-600">{t.note}</p></CardHeader>
      <CardContent className="space-y-3">
        <Checkbox checked={required || confirming} disabled={save.isPending || confirming} onCheckedChange={next => (next ? setConfirming(true) : save.mutate({ tenantId, requireTwoStep: false }))} className="justify-start">
          <span className="text-sm font-medium">{t.label}</span>
        </Checkbox>
        {confirming ? (
          <div role="alertdialog" aria-label={t.label} className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
            <p>{t.confirmText}</p>
            <div className="flex flex-wrap gap-2"><Button className="min-h-11" disabled={save.isPending} onClick={() => save.mutate({ tenantId, requireTwoStep: true })}>{t.confirm}</Button><Button variant="outline" className="min-h-11" disabled={save.isPending} onClick={() => setConfirming(false)}>{t.cancel}</Button></div>
          </div>
        ) : null}
        {save.isPending ? <p role="status" className="text-sm text-slate-600">{t.saving}</p> : null}
        {save.error ? <p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(save.error, language)}</p> : null}
      </CardContent>
    </Card>
  );
}
