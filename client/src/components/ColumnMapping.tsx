import { Button } from "@/components/ui/button";
import { Select } from "@/components/ds/Select";
import { pickLanguage, type Language } from "@/lib/language";
import React, { useMemo, useState } from "react";

// Q-50 batch 3a (docs/proposals/universal-import.md §5.3; adviser's decision I52 (1): one preview-and-mapping component for every import kind). This is the
// one column picker: each field, whether it is required, the column of the file it is read from, the choice of another column, and the request to read the
// file again with that choice. The two screens' wrappers keep their names and contracts: PmcColumnMapping (a stored file analysed again by the background job)
// and ColumnChoice (a file checked inside the request). One column for two fields is not offered; «no column» is sent as an empty header (it clears what the
// reader found — review of #371); the columns no field takes are ignored, since the person has just seen the whole list.
export type ColumnReport = { headers: string[]; fields: Array<{ key: string; required: boolean; header: string | null }>; overridden: boolean };
export type ColumnMappingFlow = "reanalyze" | "check";
const NONE = "__none";

const shared = {
  ar: { title: "أعمدة الملف", required: "مطلوب", optional: "اختياري", none: "— لا عمود —", twice: "عمود واحد لحقلين: اختر عمودًا لكل حقل", chosen: "الأعمدة مختارة يدويًا", missing: "ناقص" },
  en: { title: "File columns", required: "Required", optional: "Optional", none: "— No column —", twice: "One column for two fields: pick a column for each field", chosen: "Columns chosen by hand", missing: "Missing" },
  ur: { title: "فائل کے کالم", required: "لازمی", optional: "اختیاری", none: "— کوئی کالم نہیں —", twice: "دو فیلڈز کے لیے ایک کالم: ہر فیلڈ کے لیے الگ کالم چنیں", chosen: "کالم ہاتھ سے چنے گئے", missing: "موجود نہیں" },
};
// what the button does, and what the hint promises, differ by flow: a stored file is analysed again (and saved only once the new report is confirmed);
// a file checked inside the request is checked again (and saved only when the person saves)
const byFlow = {
  reanalyze: {
    ar: { hint: "كل حقل وعموده في ملفك. إن لم يُعرف عمود أو اختير الخطأ، اختر الصحيح ثم أعد التحليل؛ والأعمدة التي لا يأخذها أي حقل تُتجاهل. لا يُحفظ شيء قبل أن تعتمد التقرير الجديد.", apply: "أعد التحليل بهذه الأعمدة" },
    en: { hint: "Each field and the column of your file it is read from. If a column was not recognised or the wrong one was taken, pick the right one and analyse again; columns no field takes are ignored. Nothing is saved before you confirm the new report.", apply: "Analyse again with these columns" },
    ur: { hint: "ہر فیلڈ اور آپ کی فائل کا وہ کالم جس سے وہ پڑھی گئی۔ اگر کوئی کالم پہچانا نہیں گیا یا غلط لیا گیا تو درست کالم چنیں اور دوبارہ تجزیہ کریں؛ جو کالم کسی فیلڈ نے نہیں لیے وہ نظر انداز ہوں گے۔ نئی رپورٹ کی تصدیق سے پہلے کچھ محفوظ نہیں ہوتا۔", apply: "ان کالموں کے ساتھ دوبارہ تجزیہ کریں" },
  },
  check: {
    ar: { hint: "كل حقل وعموده في ملفك. إن لم يُعرف عمود أو اختير الخطأ، اختر الصحيح ثم أعد الفحص؛ والأعمدة التي لا يأخذها أي حقل تُتجاهل. لا يُحفظ شيء قبل أن تحفظ بنفسك.", apply: "أعد الفحص بهذه الأعمدة" },
    en: { hint: "Each field and the column of your file it is read from. If a column was not recognised or the wrong one was taken, pick the right one and check again; columns no field takes are ignored. Nothing is saved until you save.", apply: "Check again with these columns" },
    ur: { hint: "ہر فیلڈ اور آپ کی فائل کا وہ کالم جس سے وہ پڑھی گئی۔ اگر کوئی کالم پہچانا نہیں گیا یا غلط لیا گیا تو درست کالم چنیں اور دوبارہ جانچیں؛ جو کالم کسی فیلڈ نے نہیں لیے وہ نظر انداز ہوں گے۔ آپ کے محفوظ کرنے سے پہلے کچھ محفوظ نہیں ہوتا۔", apply: "ان کالموں کے ساتھ دوبارہ جانچیں" },
  },
};

/** The mapping handed to `onApply`: every field («no column» as an empty header), and the columns no field takes ignored. */
export const mappingOf = (choice: Record<string, string>) => ({ ...Object.fromEntries(Object.entries(choice).map(([key, header]) => [key, header === NONE ? "" : header])), __others__: "ignore" });

export function ColumnMapping({ columns, language, flow, fieldLabel, pending, error, testId, onApply }: {
  columns: ColumnReport; language: Language; flow: ColumnMappingFlow; fieldLabel: (key: string) => string; pending: boolean;
  /** The refusal of the last apply, already in the person's language. */
  error?: string | null;
  testId: string; onApply: (mapping: Record<string, string>) => void;
}) {
  const t = { ...pickLanguage(language, shared), ...pickLanguage(language, byFlow[flow]) };
  const found = useMemo(() => Object.fromEntries(columns.fields.map(field => [field.key, field.header ?? NONE])), [columns]);
  const [choice, setChoice] = useState<Record<string, string>>(found);
  const picked = Object.values(choice).filter(header => header !== NONE);
  const usedTwice = new Set(picked).size !== picked.length;
  // the first analysis with the person's own columns may change no field at all: it still says «ignore the columns no field takes»
  const changed = columns.fields.some(field => choice[field.key] !== found[field.key]);
  const options = [{ value: NONE, label: t.none }, ...columns.headers.map(header => ({ value: header, label: header }))];
  return (
    <section className="space-y-3 rounded-xl border p-3" aria-label={t.title} data-testid={testId}>
      <div>
        <h4 className="font-semibold">{t.title}</h4>
        <p className="text-xs text-muted-foreground">{t.hint}</p>
        {columns.overridden && <p className="mt-1 text-xs font-medium" data-overridden>{t.chosen}</p>}
      </div>
      <ul className="divide-y">
        {columns.fields.map(field => (
          <li key={field.key} className="flex flex-col gap-2 py-2 text-sm sm:flex-row sm:items-center sm:justify-between">
            <span className="flex items-center gap-2">
              <span className="font-medium">{fieldLabel(field.key)}</span>
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{field.required ? t.required : t.optional}</span>
              {field.required && choice[field.key] === NONE && <span className="text-xs text-destructive">{t.missing}</span>}
            </span>
            <Select className="w-full sm:w-64" aria-label={fieldLabel(field.key)} value={choice[field.key]} options={options} onValueChange={value => setChoice(current => ({ ...current, [field.key]: value }))} />
          </li>
        ))}
      </ul>
      {usedTwice && <p role="alert" className="text-sm text-destructive">{t.twice}</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      <Button type="button" className="min-h-[44px]" disabled={(!changed && columns.overridden) || usedTwice || pending} onClick={() => onApply(mappingOf(choice))}>{t.apply}</Button>
    </section>
  );
}
