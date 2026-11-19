import { Button } from "@/components/ui/button";
import { Select } from "@/components/ds/Select";
import { pickLanguage, type Language } from "@/lib/language";
import React, { useMemo, useState } from "react";

// Q-31 (P0-02): the column picker for a file checked inside the request (the baseline's BOQ, cash flow and labour). It shows each field and the column it is
// read from, lets the person pick another, and hands the choice back: the screen previews again with it and saves with the same choice, so the save reads the
// file exactly as the preview shown. One column for two fields is not offered. (The job importers' twin is PmcColumnMapping, which re-analyses a stored file.)
export type ColumnReport = { headers: string[]; fields: Array<{ key: string; required: boolean; header: string | null }>; overridden: boolean };
const NONE = "__none";

const text = {
  ar: { title: "أعمدة الملف", hint: "كل حقل وعموده في ملفك. إن لم يُعرف عمود أو اختير الخطأ، اختر الصحيح ثم أعد الفحص؛ والأعمدة التي لا يأخذها أي حقل تُتجاهل. لا يُحفظ شيء قبل أن تحفظ بنفسك.", required: "مطلوب", optional: "اختياري", none: "— لا عمود —", apply: "أعد الفحص بهذه الأعمدة", twice: "عمود واحد لحقلين: اختر عمودًا لكل حقل", chosen: "الأعمدة مختارة يدويًا", missing: "ناقص" },
  en: { title: "File columns", hint: "Each field and the column of your file it is read from. If a column was not recognised or the wrong one was taken, pick the right one and check again; columns no field takes are ignored. Nothing is saved until you save.", required: "Required", optional: "Optional", none: "— No column —", apply: "Check again with these columns", twice: "One column for two fields: pick a column for each field", chosen: "Columns chosen by hand", missing: "Missing" },
  ur: { title: "فائل کے کالم", hint: "ہر فیلڈ اور آپ کی فائل کا وہ کالم جس سے وہ پڑھی گئی۔ اگر کوئی کالم پہچانا نہیں گیا یا غلط لیا گیا تو درست کالم چنیں اور دوبارہ جانچیں؛ جو کالم کسی فیلڈ نے نہیں لیے وہ نظر انداز ہوں گے۔ آپ کے محفوظ کرنے سے پہلے کچھ محفوظ نہیں ہوتا۔", required: "لازمی", optional: "اختیاری", none: "— کوئی کالم نہیں —", apply: "ان کالموں کے ساتھ دوبارہ جانچیں", twice: "دو فیلڈز کے لیے ایک کالم: ہر فیلڈ کے لیے الگ کالم چنیں", chosen: "کالم ہاتھ سے چنے گئے", missing: "موجود نہیں" },
};

/** `onApply` receives every field («no column» as an empty header) and asks to ignore the columns no field takes: the person has just seen the whole list. */
export function ColumnChoice({ columns, language, fieldLabel, pending, onApply }: { columns: ColumnReport; language: Language; fieldLabel: (key: string) => string | undefined; pending: boolean; onApply: (mapping: Record<string, string>) => void }) {
  const t = pickLanguage(language, text);
  const found = useMemo(() => Object.fromEntries(columns.fields.map(field => [field.key, field.header ?? NONE])), [columns]);
  const [choice, setChoice] = useState<Record<string, string>>(found);
  const picked = Object.values(choice).filter(header => header !== NONE);
  const usedTwice = new Set(picked).size !== picked.length;
  const changed = columns.fields.some(field => choice[field.key] !== found[field.key]);
  const options = [{ value: NONE, label: t.none }, ...columns.headers.map(header => ({ value: header, label: header }))];
  const label = (key: string) => fieldLabel(key) ?? key;
  return (
    <section className="space-y-3 rounded-xl border p-3" aria-label={t.title} data-testid="column-choice">
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
      <Button type="button" className="min-h-[44px]" disabled={(!changed && columns.overridden) || usedTwice || pending} onClick={() => onApply({ ...Object.fromEntries(Object.entries(choice).map(([key, header]) => [key, header === NONE ? "" : header])), __others__: "ignore" })}>{t.apply}</Button>
    </section>
  );
}

/** The picker is offered when the columns are the problem (a required one not found, or a choice refused), and kept once the person has chosen. */
export const offersColumnChoice = (report: { refusal?: string | null; columns?: ColumnReport } | undefined): report is { refusal?: string | null; columns: ColumnReport } =>
  Boolean(report?.columns && (report.columns.overridden || report.refusal?.endsWith("_COLUMNS_MISSING") || report.refusal === "PROJECT_OS_IMPORT_MAPPING_INVALID"));
