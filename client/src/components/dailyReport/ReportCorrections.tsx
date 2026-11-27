import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { fieldInput, tap } from "@/components/FieldShell";
import { formatDateTime, Select } from "@/components/ds";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";

// Q-72 (5): a report that was sent is frozen. What was wrong in it is recorded here, beside it — who wrote it, when, which part — and the sent figures stay as they were sent.
export const CORRECTION_SECTIONS = ["summary", "labour", "equipment", "work", "materials", "hse", "obstacles", "weather", "other"] as const;
type Section = (typeof CORRECTION_SECTIONS)[number];
export type Correction = { id: string; section: string; note: string; createdByUserId: number; createdAt: string | Date };

const text = {
  ar: { title: "تصحيحات التقرير", intro: "التقرير مُرسَل ولا يُعدَّل. سجّل هنا ما كان خطأً وما الصحيح؛ يُحفظ بجانبه باسمك ووقته.", none: "لا تصحيحات.", part: "الجزء", note: "ما الذي يُصحَّح وما الصحيح؟", add: "أضف تصحيحًا", added: "سُجّل التصحيح.",
    sections: { summary: "الملخص", labour: "العمالة", equipment: "المعدات", work: "الأعمال", materials: "المواد", hse: "السلامة", obstacles: "المعوقات", weather: "الطقس", other: "أخرى" } },
  en: { title: "Report corrections", intro: "This report was sent and is not edited. Record here what was wrong and what is right; it is kept beside the report with your name and the time.", none: "No corrections.", part: "Part", note: "What is corrected, and what is right?", add: "Add a correction", added: "Correction recorded.",
    sections: { summary: "Summary", labour: "Labour", equipment: "Equipment", work: "Work", materials: "Materials", hse: "Safety", obstacles: "Obstacles", weather: "Weather", other: "Other" } },
  ur: { title: "رپورٹ کی تصحیحات", intro: "یہ رپورٹ بھیجی جا چکی ہے اور اس میں ترمیم نہیں ہوتی۔ یہاں لکھیں کہ کیا غلط تھا اور صحیح کیا ہے؛ یہ آپ کے نام اور وقت کے ساتھ رپورٹ کے ساتھ محفوظ رہتی ہے۔", none: "کوئی تصحیح نہیں۔", part: "حصہ", note: "کیا درست کیا جا رہا ہے، اور صحیح کیا ہے؟", add: "تصحیح شامل کریں", added: "تصحیح درج ہو گئی۔",
    sections: { summary: "خلاصہ", labour: "افرادی قوت", equipment: "آلات", work: "کام", materials: "مواد", hse: "حفاظت", obstacles: "رکاوٹیں", weather: "موسم", other: "دیگر" } },
};

export function ReportCorrections({ scope, reportId, corrections, canAdd, onAdded }: { scope: { tenantId: string; projectId: string }; reportId: string; corrections: Correction[]; canAdd: boolean; onAdded: () => void }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  const [section, setSection] = useState<Section>("labour");
  const [note, setNote] = useState("");
  const [done, setDone] = useState(false);
  const add = trpc.siteReports.addCorrection.useMutation({ onSuccess: () => { setNote(""); setDone(true); onAdded(); } });
  const failure = add.error ? getLocalizedProjectError(add.error, language) : null;
  return (
    <section aria-label={t.title} className="space-y-3 rounded-xl border bg-card p-3" data-report-corrections>
      <h3 className="text-sm font-semibold">{t.title}</h3>
      {corrections.length ? (
        <ul className="space-y-2">
          {corrections.map(row => <li key={row.id} className="rounded-lg bg-muted p-2 text-sm"><span className="font-medium">{t.sections[row.section as Section] ?? row.section}</span> · <span className="text-xs text-muted-foreground">{formatDateTime(row.createdAt, language)}</span><p className="mt-1 whitespace-pre-wrap">{row.note}</p></li>)}
        </ul>
      ) : <p className="text-sm text-muted-foreground">{t.none}</p>}
      {canAdd && (
        <form noValidate className="space-y-2" onSubmit={event => { event.preventDefault(); setDone(false); add.mutate({ ...scope, reportId, section, note }); }}>
          <p className="text-xs text-muted-foreground">{t.intro}</p>
          <label className="block text-sm font-medium">{t.part}
            <Select className="mt-1" aria-label={t.part} value={section} onValueChange={value => setSection(value as Section)} options={CORRECTION_SECTIONS.map(key => ({ value: key, label: t.sections[key] }))} />
          </label>
          <label className="block text-sm font-medium">{t.note}<textarea className={`${fieldInput} mt-1`} rows={3} maxLength={2000} value={note} onChange={event => setNote(event.target.value)} /></label>
          {failure && <p role="alert" className="text-sm text-danger-soft-foreground">{failure}</p>}
          {done && !add.error && <p role="status" className="text-sm text-muted-foreground">{t.added}</p>}
          <Button type="submit" className={tap} disabled={add.isPending || !note.trim()}>{t.add}</Button>
        </form>
      )}
    </section>
  );
}
