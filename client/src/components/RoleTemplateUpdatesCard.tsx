import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { pickLanguage } from "@/lib/language";
import React from "react";

// Work order 17, item 2: when a ready-made role template stops carrying a permission, the company is ASKED, never changed silently. The administrator sees the role, the
// power, and how many people hold the role, then approves or declines. Additions need no question (they are applied and audited by the server). Renders nothing when
// there is nothing to decide, or when the server refuses the read (a person who is not an administrator).
export function RoleTemplateUpdatesCard({ tenantId }: { tenantId: string }) {
  const { isArabic, language } = useLanguage();
  const utils = trpc.useUtils();
  const list = trpc.tenant.roleTemplateRemovals.useQuery({ tenantId }, { retry: false });
  const decide = trpc.tenant.decideRoleTemplateRemovals.useMutation({ onSuccess: async () => { await utils.tenant.roleTemplateRemovals.invalidate({ tenantId }); await utils.tenant.administration.invalidate({ tenantId }); } });
  const t = pickLanguage(language, {
    ar: { title: "تحديثات قوالب الأدوار تنتظر قرارك", note: "قالب جاهز لم يعد يمنح الصلاحية التالية. لن يتغير شيء قبل موافقتك.", role: "الدور", power: "الصلاحية التي ستُسحب", holders: (n: number) => `${n} شخصًا يحملون هذا الدور وسيفقدونها`, approve: "أوافق على السحب", decline: "أُبقيها كما هي", working: "جارٍ الحفظ…" },
    en: { title: "Role template updates waiting for your decision", note: "A ready-made role no longer grants the permission below. Nothing changes until you approve.", role: "Role", power: "Permission to be withdrawn", holders: (n: number) => `${n} people hold this role and would lose it`, approve: "Approve the withdrawal", decline: "Keep it as it is", working: "Saving…" },
    ur: { title: "رول ٹیمپلیٹ کی تبدیلیاں آپ کے فیصلے کی منتظر ہیں", note: "ایک تیار رول اب نیچے دی گئی اجازت نہیں دیتا۔ آپ کی منظوری سے پہلے کچھ نہیں بدلے گا۔", role: "رول", power: "واپس لی جانے والی اجازت", holders: (n: number) => `${n} افراد یہ رول رکھتے ہیں اور اسے کھو دیں گے`, approve: "واپسی کی منظوری دیں", decline: "جیسا ہے ویسا رہنے دیں", working: "محفوظ ہو رہا ہے…" },
  });
  const items = list.data ?? [];
  if (list.isLoading || list.isError || !items.length) return null;
  return (
    <Card data-role-template-updates>
      <CardHeader><CardTitle className="text-lg">{t.title}</CardTitle><p className="text-sm text-slate-600">{t.note}</p></CardHeader>
      <CardContent className="space-y-3">
        {items.map(item => (
          <div key={item.id} className="space-y-2 rounded-xl border p-3" data-removal={item.id}>
            <p className="text-sm"><span className="font-semibold">{t.role}:</span> <bdi>{item.roleName}</bdi></p>
            <p className="text-sm"><span className="font-semibold">{t.power}:</span> <bdi dir="ltr">{item.permissionCode}</bdi></p>
            <p className="text-sm text-amber-800">{t.holders(item.holders)}</p>
            <div className="flex flex-wrap gap-2">
              <Button className="min-h-[44px]" disabled={decide.isPending} onClick={() => decide.mutate({ tenantId, ids: [item.id], decision: "approve" })}>{decide.isPending ? t.working : t.approve}</Button>
              <Button variant="outline" className="min-h-[44px]" disabled={decide.isPending} onClick={() => decide.mutate({ tenantId, ids: [item.id], decision: "decline" })}>{t.decline}</Button>
            </div>
          </div>
        ))}
        {decide.error && <p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(decide.error, isArabic)}</p>}
      </CardContent>
    </Card>
  );
}
