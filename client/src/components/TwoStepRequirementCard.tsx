import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ds";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { pickLanguage } from "@/lib/language";
import React from "react";

// D-81 (owner's decision 2026-11-09): sign-in is one e-mail code; two-step verification is required of nobody unless the company asks for it here. Off by default.
// Switching it on asks every active member of THIS company (its administrators included) for an authenticator-app code at the next request; switching it off lifts it at once.
// Renders nothing when the server refuses the read (a person who is not the company's administrator): the server is the gate, this card only offers the choice.
export function TwoStepRequirementCard({ tenantId }: { tenantId: string }) {
  const { isArabic, language } = useLanguage();
  const utils = trpc.useUtils();
  const settings = trpc.tenant.securitySettings.useQuery({ tenantId }, { retry: false });
  const save = trpc.tenant.setRequireTwoStep.useMutation({ onSuccess: async () => { await utils.tenant.securitySettings.invalidate({ tenantId }); await utils.mfa.status.invalidate(); } });
  const t = pickLanguage(language, {
    ar: { title: "التحقق بخطوتين", label: "اشتراط التحقق بخطوتين لأعضاء الشركة", note: "مطفأ افتراضيًا: الدخول برمز البريد وحده. عند تفعيله يُطلب من كل عضو في هذه الشركة رمز من تطبيق مصادقة بعد رمز البريد.", on: "مفعّل: يُطلب الرمز الثاني من أعضاء الشركة.", off: "مطفأ: الدخول برمز البريد وحده.", saving: "جارٍ الحفظ…" },
    en: { title: "Two-step verification", label: "Require two-step verification of the company's members", note: "Off by default: sign-in is the e-mail code alone. When on, every member of this company is asked for an authenticator-app code after the e-mail code.", on: "On: the company's members are asked for the second code.", off: "Off: sign-in is the e-mail code alone.", saving: "Saving…" },
    ur: { title: "دو مرحلوں کی تصدیق", label: "کمپنی کے اراکین کے لیے دو مرحلوں کی تصدیق لازمی کریں", note: "بطور طے شدہ بند: سائن اِن صرف ای میل کوڈ سے۔ فعال کرنے پر اس کمپنی کے ہر رکن سے ای میل کوڈ کے بعد آتھنٹیکیٹر ایپ کا کوڈ مانگا جائے گا۔", on: "فعال: کمپنی کے اراکین سے دوسرا کوڈ مانگا جاتا ہے۔", off: "بند: سائن اِن صرف ای میل کوڈ سے۔", saving: "محفوظ ہو رہا ہے…" },
  });
  if (settings.isLoading || settings.isError || !settings.data) return null;
  const required = settings.data.requireTwoStep;
  return (
    <Card data-two-step-requirement>
      <CardHeader><CardTitle className="text-lg">{t.title}</CardTitle><p className="text-sm text-slate-600">{t.note}</p></CardHeader>
      <CardContent className="space-y-3">
        <Checkbox checked={required} disabled={save.isPending} onCheckedChange={next => save.mutate({ tenantId, requireTwoStep: next })} className="justify-start">
          <span className="text-sm font-medium">{t.label}</span>
        </Checkbox>
        <p role="status" className="text-sm text-slate-600">{save.isPending ? t.saving : required ? t.on : t.off}</p>
        {save.error ? <p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(save.error, isArabic)}</p> : null}
      </CardContent>
    </Card>
  );
}
