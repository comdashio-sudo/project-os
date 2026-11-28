// Q-66 (6) (I3 28-11): the company's remembered PMC column choices — a choice a person made for a file of some shape, used again when the next file of that
// shape cannot be read by its column names alone. Each is shown with its kind, which field was read from which column, how often it was used and when it
// last changed, and can be forgotten (two steps: «forget» then «confirm»). Every check (who may, which company) is the server's.
import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { formatDateTime, formatNumber } from "@/components/ds/format";
import { SourceNotice } from "@/components/SectionResilience";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { pickLanguage, type Language } from "@/lib/language";
import { PMC_FIELD_LABELS } from "@/lib/pmcImportMessages";
import { trpc } from "@/lib/trpc";

const text = {
  ar: { title: "أعمدة محفوظة لملفات شركتك", hint: "حين تختار أعمدة ملف بنفسك وتعتمد الاستيراد، يُحفظ اختيارك لشكل هذا الملف ويُستعمل للملف التالي بالشكل نفسه إن لم تُفهم أعمدته بأسمائها.", empty: "لا اختيارات محفوظة بعد.", used: (n: number) => `استُعمل ${formatNumber(n)} مرة`, changed: "آخر تغيير", forget: "انسَ هذا الاختيار", confirm: "تأكيد النسيان", cancel: "إلغاء", forgotten: "نُسي الاختيار: الملف التالي بهذا الشكل سيطلب أعمدته." },
  en: { title: "Remembered columns for your company's files", hint: "When you choose a file's columns yourself and confirm the import, your choice is kept for that shape of file and used for the next file of the same shape whose columns cannot be read by their names.", empty: "No remembered choices yet.", used: (n: number) => `used ${formatNumber(n)} times`, changed: "last changed", forget: "Forget this choice", confirm: "Confirm forgetting", cancel: "Cancel", forgotten: "Forgotten: the next file of this shape will ask for its columns." },
  ur: { title: "آپ کی کمپنی کی فائلوں کے محفوظ کالم", hint: "جب آپ خود فائل کے کالم منتخب کر کے درآمد کی تصدیق کرتے ہیں تو اس شکل کی فائل کے لیے آپ کا انتخاب محفوظ ہوتا ہے اور اسی شکل کی اگلی فائل کے لیے استعمال ہوتا ہے جس کے کالم ناموں سے نہ سمجھے جائیں۔", empty: "ابھی کوئی محفوظ انتخاب نہیں۔", used: (n: number) => `${formatNumber(n)} بار استعمال ہوا`, changed: "آخری تبدیلی", forget: "یہ انتخاب بھول جائیں", confirm: "بھولنے کی تصدیق کریں", cancel: "منسوخ", forgotten: "بھلا دیا گیا: اس شکل کی اگلی فائل اپنے کالم مانگے گی۔" },
};

export function PmcColumnProfiles({ tenantId, projectId, language, kindLabel }: { tenantId: string; projectId: string; language: Language; kindLabel: (kind: string) => string | undefined }) {
  const t = pickLanguage(language, text);
  const fieldLabels = pickLanguage<Record<string, string>>(language, PMC_FIELD_LABELS);
  const utils = trpc.useUtils();
  const profiles = trpc.pmc.columnProfiles.useQuery({ tenantId, projectId }, { enabled: Boolean(tenantId && projectId) });
  const [asking, setAsking] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const remove = trpc.pmc.deleteColumnProfile.useMutation({ onSuccess: () => { setAsking(null); setDone(true); void utils.pmc.columnProfiles.invalidate(); } });
  const rows = profiles.data ?? [];
  return (
    <section className="space-y-2 rounded-[var(--radius)] border p-3" aria-label={t.title} data-column-profiles>
      <h3 className="text-sm font-semibold">{t.title}</h3>
      <p className="text-xs text-muted-foreground">{t.hint}</p>
      <SourceNotice query={profiles} isArabic={language === "ar"} title={t.title} />
      {done && <p role="status" className="text-sm">{t.forgotten}</p>}
      {remove.error && <p role="alert" className="text-sm text-danger-soft-foreground">{getLocalizedProjectError(remove.error, language)}</p>}
      {profiles.data && !rows.length ? <p className="text-sm text-muted-foreground">{t.empty}</p> : (
        <ul className="space-y-2">
          {rows.map(profile => (
            <li key={profile.id} className="flex flex-col gap-2 rounded-[var(--radius)] border p-2 text-sm" data-column-profile={profile.kind}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-medium">{kindLabel(profile.kind) ?? profile.kind}</span>
                <span className="text-xs text-muted-foreground">{t.used(profile.timesUsed)} · {t.changed} <bdi>{formatDateTime(profile.updatedAt, language)}</bdi></span>
              </div>
              <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                {Object.entries(profile.mapping).filter(([field]) => field !== "__others__").map(([field, header]) => <li key={field}>{fieldLabels[field] ?? field} ← <bdi>{header}</bdi></li>)}
              </ul>
              <div className="flex flex-wrap gap-2">
                {asking === profile.id ? (
                  <>
                    <Button size="sm" variant="destructive" disabled={remove.isPending} onClick={() => remove.mutate({ tenantId, projectId, profileId: profile.id })}>{t.confirm}</Button>
                    <Button size="sm" variant="outline" onClick={() => setAsking(null)}>{t.cancel}</Button>
                  </>
                ) : <Button size="sm" variant="outline" onClick={() => { setDone(false); setAsking(profile.id); }}>{t.forget}</Button>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
