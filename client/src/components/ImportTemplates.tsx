import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { pickLanguage, type Language } from "@/lib/language";
import { trpc } from "@/lib/trpc";
import { BookmarkPlus, Trash2, Wand2 } from "lucide-react";
import React, { useState } from "react";

// Q-50 batch 2b (adviser's decision I52): the company's column-mapping templates on the import screens. A template is OFFERED when the file's headers match one
// by at least 80% (the server decides, `progress.suggestedTemplate`); applying it only analyses the file again with its columns — nothing is written before the
// person has read the new report and confirmed, exactly as with columns they pick by hand. A mapping that analysed cleanly can be saved under a name, and the
// list shows the templates of the kinds this person may import, each deletable. Every check (permission, licence, company, name taken) is the server's.

export type SuggestedTemplate = { id: string; name: string; score: number; mapping: Record<string, string> };

const text = {
  ar: {
    suggested: "قالب مقترح", match: "تطابق العناوين", apply: "طبّق القالب وأعد التحليل", applied: "القالب مطبَّق على هذا التحليل",
    applyHint: "يُعاد تحليل الملف بأعمدة القالب، ولا يُحفظ شيء قبل أن تقرأ التقرير الجديد وتعتمده.",
    saveTitle: "احفظ هذا التعيين قالبًا للشركة", saveHint: "يُقترح القالب لاحقًا لأي ملف من النوع نفسه تتطابق عناوينه بنسبة 80% أو أكثر.", name: "اسم القالب", save: "احفظ القالب", saved: "حُفظ القالب",
    nameShort: "اكتب اسمًا من حرفين على الأقل.",
    listTitle: "قوالب الشركة", empty: "لا قوالب بعد. احفظ تعيينًا ناجحًا من شاشة الاستيراد ليُقترح لاحقًا.", fields: "حقول", remove: "احذف", confirmRemove: "تأكيد الحذف", cancel: "إلغاء",
  },
  en: {
    suggested: "Suggested template", match: "Header match", apply: "Apply the template and analyse again", applied: "The template is applied to this analysis",
    applyHint: "The file is analysed again with the template's columns; nothing is saved before you read the new report and confirm it.",
    saveTitle: "Save this mapping as a company template", saveHint: "It will be suggested for any later file of the same kind whose headers match by 80% or more.", name: "Template name", save: "Save the template", saved: "Template saved",
    nameShort: "Enter a name of at least two characters.",
    listTitle: "Company templates", empty: "No templates yet. Save a successful mapping on the import screen to have it suggested later.", fields: "fields", remove: "Delete", confirmRemove: "Confirm delete", cancel: "Cancel",
  },
  ur: {
    suggested: "تجویز کردہ ٹیمپلیٹ", match: "عنوانات کی مطابقت", apply: "ٹیمپلیٹ لاگو کریں اور دوبارہ تجزیہ کریں", applied: "ٹیمپلیٹ اس تجزیے پر لاگو ہے",
    applyHint: "فائل کا ٹیمپلیٹ کے کالموں کے ساتھ دوبارہ تجزیہ ہوتا ہے؛ نئی رپورٹ پڑھنے اور اس کی تصدیق سے پہلے کچھ محفوظ نہیں ہوتا۔",
    saveTitle: "اس میپنگ کو کمپنی کے ٹیمپلیٹ کے طور پر محفوظ کریں", saveHint: "یہ بعد میں اسی قسم کی کسی بھی فائل کے لیے تجویز ہوگا جس کے عنوانات 80% یا زیادہ مطابقت رکھتے ہوں۔", name: "ٹیمپلیٹ کا نام", save: "ٹیمپلیٹ محفوظ کریں", saved: "ٹیمپلیٹ محفوظ ہو گیا",
    nameShort: "کم از کم دو حروف کا نام لکھیں۔",
    listTitle: "کمپنی کے ٹیمپلیٹ", empty: "ابھی کوئی ٹیمپلیٹ نہیں۔ امپورٹ اسکرین سے کامیاب میپنگ محفوظ کریں تاکہ وہ بعد میں تجویز ہو۔", fields: "فیلڈز", remove: "حذف کریں", confirmRemove: "حذف کی تصدیق", cancel: "منسوخ",
  },
};

/** The applied state: every column the template names is the column the current analysis used. */
export const templateApplied = (template: SuggestedTemplate, mapping: Record<string, string> | undefined) =>
  Boolean(mapping) && Object.entries(template.mapping).every(([field, header]) => mapping![field] === header);

export function SuggestedTemplateCard({ tenantId, projectId, importId, template, currentMapping, language }: { tenantId: string; projectId: string; importId: string; template: SuggestedTemplate; currentMapping?: Record<string, string>; language: Language }) {
  const t = pickLanguage(language, text);
  const utils = trpc.useUtils();
  const reanalyze = trpc.dataImports.reanalyze.useMutation({ onSuccess: () => Promise.all([utils.dataImports.progress.invalidate(), utils.dataImports.diff.invalidate()]) });
  const applied = templateApplied(template, currentMapping);
  return (
    <section className="rounded-xl border border-primary/30 bg-accent p-3 text-sm" aria-label={t.suggested} data-testid="suggested-template">
      <p className="flex flex-wrap items-center gap-2">
        <Wand2 className="h-4 w-4 text-primary" aria-hidden />
        <span className="font-semibold">{t.suggested}: <bdi>{template.name}</bdi></span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{t.match} {Math.round(template.score * 100)}%</span>
      </p>
      {applied ? <p role="status" className="mt-2 text-xs font-medium" data-applied>{t.applied}</p> : <>
        <p className="mt-1 text-xs text-muted-foreground">{t.applyHint}</p>
        <Button type="button" className="mt-2 min-h-[44px]" disabled={reanalyze.isPending} onClick={() => reanalyze.mutate({ tenantId, projectId, importId, mappingOverride: { ...template.mapping, __others__: "ignore" } })}>{t.apply}</Button>
      </>}
      {reanalyze.error && <p role="alert" className="mt-2 text-sm text-danger-soft-foreground">{getLocalizedProjectError(reanalyze.error, language)}</p>}
    </section>
  );
}

export function SaveTemplateForm({ tenantId, projectId, importId, language }: { tenantId: string; projectId: string; importId: string; language: Language }) {
  const t = pickLanguage(language, text);
  const [name, setName] = useState("");
  const [tooShort, setTooShort] = useState(false);
  const utils = trpc.useUtils();
  const save = trpc.dataImports.saveTemplate.useMutation({ onSuccess: () => utils.dataImports.templates.invalidate() });
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed.length < 2) { setTooShort(true); return; }
    setTooShort(false);
    save.mutate({ tenantId, projectId, importId, name: trimmed });
  };
  return (
    <form noValidate className="space-y-2 rounded-xl border p-3 text-sm" onSubmit={submit} aria-label={t.saveTitle} data-testid="save-template">
      <p className="flex items-center gap-2 font-semibold"><BookmarkPlus className="h-4 w-4" aria-hidden />{t.saveTitle}</p>
      <p className="text-xs text-muted-foreground">{t.saveHint}</p>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <label className="block flex-1"><span className="text-xs font-medium">{t.name}</span><Input className="mt-1 min-h-[44px]" value={name} maxLength={160} onChange={event => { setName(event.target.value); save.reset(); }} /></label>
        <Button type="submit" variant="outline" className="min-h-[44px]" disabled={save.isPending}>{t.save}</Button>
      </div>
      {tooShort && <p role="alert" className="text-sm text-danger-soft-foreground">{t.nameShort}</p>}
      {save.isSuccess && <p role="status" className="text-sm font-medium text-success-soft-foreground">{t.saved}: <bdi>{save.data.name}</bdi></p>}
      {save.error && <p role="alert" className="text-sm text-danger-soft-foreground">{getLocalizedProjectError(save.error, language)}</p>}
    </form>
  );
}

/** The company's templates for the kinds this person may import (the server filters), optionally only some kinds; each one deletable after a second click. */
export function ImportTemplatesList({ tenantId, projectId, kinds, kindLabel, language }: { tenantId: string; projectId: string; kinds?: readonly string[]; kindLabel: (kind: string) => string | undefined; language: Language }) {
  const t = pickLanguage(language, text);
  const utils = trpc.useUtils();
  const list = trpc.dataImports.templates.useQuery({ tenantId, projectId });
  const [pending, setPending] = useState<string | null>(null);
  const remove = trpc.dataImports.deleteTemplate.useMutation({ onSuccess: () => { setPending(null); return utils.dataImports.templates.invalidate(); } });
  const rows = (list.data ?? []).filter(row => !kinds || kinds.includes(row.kind));
  return (
    <section className="space-y-2" aria-label={t.listTitle} data-testid="import-templates">
      <h3 className="text-sm font-semibold">{t.listTitle}</h3>
      {list.error && <p role="alert" className="text-sm text-danger-soft-foreground">{getLocalizedProjectError(list.error, language)}</p>}
      {list.data && rows.length === 0 && <p className="text-xs text-muted-foreground">{t.empty}</p>}
      {rows.length > 0 && <ul className="divide-y rounded-xl border">
        {rows.map(row => (
          <li key={row.id} className="flex flex-col gap-2 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="min-w-0"><span className="block truncate font-medium"><bdi>{row.name}</bdi></span><span className="text-xs text-muted-foreground">{kindLabel(row.kind) ?? row.kind} · {Object.keys(row.mapping).length} {t.fields}</span></span>
            {pending === row.id ? <span className="flex gap-2">
              <Button type="button" variant="destructive" className="min-h-[44px]" disabled={remove.isPending} onClick={() => remove.mutate({ tenantId, projectId, templateId: row.id })}>{t.confirmRemove}</Button>
              <Button type="button" variant="outline" className="min-h-[44px]" onClick={() => setPending(null)}>{t.cancel}</Button>
            </span> : <Button type="button" variant="outline" className="min-h-[44px]" aria-label={`${t.remove}: ${row.name}`} onClick={() => { remove.reset(); setPending(row.id); }}><Trash2 className="me-1 h-4 w-4" aria-hidden />{t.remove}</Button>}
          </li>
        ))}
      </ul>}
      {remove.error && <p role="alert" className="text-sm text-danger-soft-foreground">{getLocalizedProjectError(remove.error, language)}</p>}
    </section>
  );
}
