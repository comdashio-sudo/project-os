import { Button } from "@/components/ui/button";
import { Select } from "@/components/ds/Select";
import { PMC_FIELD_LABELS } from "@/lib/pmcImportMessages";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { pickLanguage, type Language } from "@/lib/language";
import { trpc } from "@/lib/trpc";
import React, { useMemo, useState } from "react";

// Q-31 (P0-02): which column of the file each field was read from, shown with every PMC import report. When the importer did not recognise a column (a header
// nobody's alias list has) or found two columns for one field, the person picks it here and the file is analysed again with that mapping — nothing is written
// until they have read the new report and confirmed, and the write uses the same mapping. One column for two fields is not offered.
export type PmcImportColumns = { headers: string[]; fields: Array<{ key: string; required: boolean; header: string | null }>; overridden: boolean };
const NONE = "__none";

const text = {
  ar: { title: "أعمدة الملف", hint: "كل حقل وعموده في ملفك. إن لم يُعرف عمود أو اختير الخطأ، اختر الصحيح ثم أعد التحليل؛ والأعمدة التي لا يأخذها أي حقل تُتجاهل. لا يُحفظ شيء قبل أن تعتمد التقرير الجديد.", required: "مطلوب", optional: "اختياري", none: "— لا عمود —", reanalyze: "أعد التحليل بهذه الأعمدة", twice: "عمود واحد لحقلين: اختر عمودًا لكل حقل", chosen: "الأعمدة مختارة يدويًا", missing: "ناقص" },
  en: { title: "File columns", hint: "Each field and the column of your file it is read from. If a column was not recognised or the wrong one was taken, pick the right one and analyse again; columns no field takes are ignored. Nothing is saved before you confirm the new report.", required: "Required", optional: "Optional", none: "— No column —", reanalyze: "Analyse again with these columns", twice: "One column for two fields: pick a column for each field", chosen: "Columns chosen by hand", missing: "Missing" },
  ur: { title: "فائل کے کالم", hint: "ہر فیلڈ اور آپ کی فائل کا وہ کالم جس سے وہ پڑھی گئی۔ اگر کوئی کالم پہچانا نہیں گیا یا غلط لیا گیا تو درست کالم چنیں اور دوبارہ تجزیہ کریں؛ جو کالم کسی فیلڈ نے نہیں لیے وہ نظر انداز ہوں گے۔ نئی رپورٹ کی تصدیق سے پہلے کچھ محفوظ نہیں ہوتا۔", required: "لازمی", optional: "اختیاری", none: "— کوئی کالم نہیں —", reanalyze: "ان کالموں کے ساتھ دوبارہ تجزیہ کریں", twice: "دو فیلڈز کے لیے ایک کالم: ہر فیلڈ کے لیے الگ کالم چنیں", chosen: "کالم ہاتھ سے چنے گئے", missing: "موجود نہیں" },
};

/** `fieldLabel`: the name of a field for another importer (the operational ledgers, Q-31); PMC's own names otherwise. */
export function PmcColumnMapping({ tenantId, projectId, importId, columns, language, isArabic, fieldLabel }: { tenantId: string; projectId: string; importId: string; columns: PmcImportColumns; language: Language; isArabic: boolean; fieldLabel?: (key: string) => string | undefined }) {
  const t = pickLanguage(language, text);
  const pmcLabels = pickLanguage<Record<string, string>>(language, PMC_FIELD_LABELS);
  const label = (key: string) => (fieldLabel ? fieldLabel(key) : pmcLabels[key]) ?? key;
  const found = useMemo(() => Object.fromEntries(columns.fields.map(field => [field.key, field.header ?? NONE])), [columns]);
  const [choice, setChoice] = useState<Record<string, string>>(found);
  const utils = trpc.useUtils();
  // the differences preview (operational ledgers) is read again too: it follows the new columns
  const reanalyze = trpc.dataImports.reanalyze.useMutation({ onSuccess: () => Promise.all([utils.dataImports.progress.invalidate(), utils.dataImports.diff.invalidate()]) });
  const picked = Object.values(choice).filter(header => header !== NONE);
  const usedTwice = new Set(picked).size !== picked.length;
  // the first analysis with the person's own columns may change no field at all: it still says «ignore the columns no field takes»
  const changed = columns.fields.some(field => choice[field.key] !== found[field.key]);
  const options = [{ value: NONE, label: t.none }, ...columns.headers.map(header => ({ value: header, label: header }))];
  // every field is sent: «no column» as an empty header (it clears what the reader found — review of #371), and the columns no field uses are ignored:
  // the person has just seen the whole list (an extra «Notes» column no longer blocks a villa list)
  const submit = () => reanalyze.mutate({ tenantId, projectId, importId, mappingOverride: { ...Object.fromEntries(Object.entries(choice).map(([key, header]) => [key, header === NONE ? "" : header])), __others__: "ignore" } });
  return (
    <section className="space-y-3 rounded-xl border p-3" aria-label={t.title} data-testid="pmc-column-mapping">
      <div>
        <h4 className="font-semibold">{t.title}</h4>
        <p className="text-xs text-muted-foreground">{t.hint}</p>
        {columns.overridden && <p className="mt-1 text-xs font-medium" data-overridden>{t.chosen}</p>}
      </div>
      <ul className="divide-y">
        {columns.fields.map(field => (
          <li key={field.key} className="flex flex-col gap-2 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-2">
              <span className="font-medium">{label(field.key)}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{field.required ? t.required : t.optional}</span>
              {field.required && choice[field.key] === NONE && <span className="text-xs text-destructive">{t.missing}</span>}
            </span>
            <Select className="w-full sm:w-64" aria-label={label(field.key)} value={choice[field.key]} options={options} onValueChange={value => setChoice(current => ({ ...current, [field.key]: value }))} />
          </li>
        ))}
      </ul>
      {usedTwice && <p role="alert" className="text-sm text-destructive">{t.twice}</p>}
      {reanalyze.error && <p role="alert" className="text-sm text-destructive">{getLocalizedProjectError(reanalyze.error, isArabic)}</p>}
      <Button type="button" className="min-h-[44px]" disabled={(!changed && columns.overridden) || usedTwice || reanalyze.isPending} onClick={submit}>{t.reanalyze}</Button>
    </section>
  );
}
