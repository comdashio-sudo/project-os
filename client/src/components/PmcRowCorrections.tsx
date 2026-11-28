import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ds/Select";
import { PMC_FIELD_LABELS, pmcImportReason } from "@/lib/pmcImportMessages";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { pickLanguage, type Language } from "@/lib/language";
import { trpc } from "@/lib/trpc";
import { PencilLine } from "lucide-react";
import React, { useMemo, useState } from "react";

// Q-50 batch 4b (docs/proposals/universal-import.md §4; adviser's decision I52 (3): non-financial data first, every correction audited): the person corrects a
// rejected row of a PMC file here instead of going back to Excel — a cell of the row (by the field it is read for) or the whole row left out. The stored file
// stays as uploaded; the server analyses it again with the corrections, records each one (row, column, the file's value, the new one) in the audit trail, and
// nothing is written before the person confirms the new report. The corrections already applied are listed, each can be undone; the full set is sent each time.
export type AppliedEdit = { row: number; field: string; header: string; from: string; to: string };
type RowError = { rowNumber: number; code: string; field?: string; detail?: string };
/** Q-66 (5b): «every cell like it» — in the column read for `field`, each cell reading `from` reads `to`; `cells`: how many the analysis changed. */
export type ReplaceRule = { field: string; from: string; to: string };
export type AppliedReplace = ReplaceRule & { header: string; cells: number };
export type PreviewRow = { row: number; class: "data" | "total" | "leftOut"; cells: Record<string, string> };

const text = {
  ar: {
    title: "صحّح هنا بدل Excel", hint: "الملف المرفوع يبقى كما هو. كل تصحيح يُسجَّل في سجل التدقيق بالقيمة الأصلية والجديدة، ويُعاد التحليل، ولا يُحفظ شيء قبل أن تعتمد التقرير الجديد.",
    row: "الصف", field: "الحقل", value: "القيمة الصحيحة", leaveOut: "اترك هذا الصف", leftOut: "متروك", apply: "أعد التحليل بهذه التصحيحات", applied: "تصحيحات هذا التحليل", undo: "تراجع",
    ignoredRows: "صفوف متروكة", moreRows: (count: number) => `و${count} صفوف أخرى: صحّحها في الملف`, from: "في الملف", to: "يُقرأ", dropped: "اختيار أعمدة أخرى أدناه قراءة جديدة للملف: تُسقط هذه التصحيحات.", preview: "تصنيف الصفوف", previewHint: (count: number) => `الصفوف الأولى كما قرأها الاستيراد (${count}). غيّر تصنيف صف إن أخطأ: «بيانات» يُقرأ، «متروك» لا يُقرأ، و«إجمالي» سطر مجموع لا يُقرأ.`, classOf: { data: "بيانات", leftOut: "متروك", total: "إجمالي" } as Record<string, string>, classLabel: "التصنيف",
  },
  en: {
    title: "Correct it here instead of Excel", hint: "The uploaded file stays as it is. Each correction is recorded in the audit trail with the original and new value, the file is analysed again, and nothing is saved before you confirm the new report.",
    row: "Row", field: "Field", value: "Correct value", leaveOut: "Leave this row out", leftOut: "Left out", apply: "Analyse again with these corrections", applied: "Corrections in this analysis", undo: "Undo",
    ignoredRows: "Rows left out", moreRows: (count: number) => `and ${count} more rows: correct them in the file`, from: "In the file", to: "Read as", dropped: "Choosing other columns below is a new reading of the file: these corrections are dropped.", preview: "Row classes", previewHint: (count: number) => `The first ${count} rows as the import read them. Change a row's class if it is wrong: «Data» is read, «Left out» is not, and «Total» is a totals line that is not read.`, classOf: { data: "Data", leftOut: "Left out", total: "Total" } as Record<string, string>, classLabel: "Class",
  },
  ur: {
    title: "Excel کے بجائے یہیں درست کریں", hint: "اپ لوڈ کی گئی فائل جیسی ہے ویسی رہتی ہے۔ ہر درستی اصل اور نئی قدر کے ساتھ آڈٹ ریکارڈ میں درج ہوتی ہے، فائل کا دوبارہ تجزیہ ہوتا ہے، اور نئی رپورٹ کی تصدیق سے پہلے کچھ محفوظ نہیں ہوتا۔",
    row: "قطار", field: "فیلڈ", value: "درست قدر", leaveOut: "یہ قطار چھوڑ دیں", leftOut: "چھوڑی گئی", apply: "ان درستیوں کے ساتھ دوبارہ تجزیہ کریں", applied: "اس تجزیے کی درستیاں", undo: "واپس لیں",
    ignoredRows: "چھوڑی گئی قطاریں", moreRows: (count: number) => `اور ${count} مزید قطاریں: انہیں فائل میں درست کریں`, from: "فائل میں", to: "پڑھا گیا", dropped: "نیچے دوسرے کالم چننا فائل کو نئے سرے سے پڑھنا ہے: یہ درستیاں ختم ہو جائیں گی۔", preview: "قطاروں کی درجہ بندی", previewHint: (count: number) => `پہلی ${count} قطاریں جیسے امپورٹ نے پڑھیں۔ اگر کسی قطار کی درجہ بندی غلط ہو تو بدلیں: «ڈیٹا» پڑھی جاتی ہے، «چھوڑی گئی» نہیں، اور «میزان» مجموعے کی سطر ہے جو نہیں پڑھی جاتی۔`, classOf: { data: "ڈیٹا", leftOut: "چھوڑی گئی", total: "میزان" } as Record<string, string>, classLabel: "درجہ",
  },
};

/** The rows the panel offers at once; a file with more rejected rows is a file to fix at its source. */
export const MAX_CORRECTABLE_ROWS = 20;
const key = (row: number, field: string) => `${row}:${field}`;

/** The full set the server receives: the applied corrections still kept (with any new value typed over them), the new ones typed, and the rows left out. */
export function correctionsOf(applied: AppliedEdit[], undone: ReadonlySet<string>, drafts: Readonly<Record<string, string>>, ignore: ReadonlySet<number>, read: ReadonlySet<number> = new Set(), replace: ReplaceRule[] = []) {
  const cells = new Map<string, { row: number; field: string; value: string }>();
  for (const edit of applied) if (!undone.has(key(edit.row, edit.field))) cells.set(key(edit.row, edit.field), { row: edit.row, field: edit.field, value: edit.to });
  for (const [draftKey, value] of Object.entries(drafts)) {
    const [row, field] = [Number(draftKey.slice(0, draftKey.indexOf(":"))), draftKey.slice(draftKey.indexOf(":") + 1)];
    if (value.trim() === "") continue;
    cells.set(draftKey, { row, field, value: value.trim() });
  }
  const readRows = Array.from(read).filter(row => !ignore.has(row)).sort((a, b) => a - b);
  return { cells: Array.from(cells.values()).filter(cell => !ignore.has(cell.row)).sort((a, b) => a.row - b.row || a.field.localeCompare(b.field)), ignoreRows: Array.from(ignore).sort((a, b) => a - b), ...(readRows.length ? { readRows } : {}), ...(replace.length ? { replace: replace.map(({ field, from, to }) => ({ field, from, to })) } : {}) };
}

export function PmcRowCorrections({ tenantId, projectId, importId, errors, fields, applied, ignoredRows, readRows = [], preview = [], replaced = [], language }: {
  tenantId: string; projectId: string; importId: string; errors: RowError[];
  /** The fields read from a column of this file (a correction is by field; one no column is read for cannot be corrected). */
  fields: string[]; applied: AppliedEdit[]; ignoredRows: number[];
  /** Q-50 4c: the rows the reader took for totals that the person reads as data, and the first rows with their class. */
  readRows?: number[]; preview?: PreviewRow[];
  /** Q-66 (5b): the «every cell like it» rules the analysis holds — kept in every set this panel sends. */
  replaced?: ReplaceRule[]; language: Language;
}) {
  const t = pickLanguage(language, text);
  const labels = pickLanguage<Record<string, string>>(language, PMC_FIELD_LABELS);
  const label = (field: string) => labels[field] ?? field;
  const rows = useMemo(() => {
    const byRow = new Map<number, RowError[]>();
    for (const error of errors) if (error.rowNumber > 0) byRow.set(error.rowNumber, [...(byRow.get(error.rowNumber) ?? []), error]);
    return Array.from(byRow.entries()).sort((a, b) => a[0] - b[0]);
  }, [errors]);
  const [fieldOf, setFieldOf] = useState<Record<number, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [ignore, setIgnore] = useState<Set<number>>(() => new Set(ignoredRows));
  const [undone, setUndone] = useState<Set<string>>(new Set());
  const [read, setRead] = useState<Set<number>>(() => new Set(readRows));
  const utils = trpc.useUtils();
  const correct = trpc.dataImports.correct.useMutation({ onSuccess: () => utils.dataImports.progress.invalidate() });
  const next = correctionsOf(applied, undone, drafts, ignore, read, replaced);
  const current = correctionsOf(applied, new Set(), {}, new Set(ignoredRows), new Set(readRows), replaced);
  // a row's class as the person now sets it; «total» is offered only for a row the reader took for totals
  const wasTotal = (row: PreviewRow) => row.class === "total" || readRows.includes(row.row);
  const classNow = (row: PreviewRow) => (ignore.has(row.row) ? "leftOut" : wasTotal(row) && !read.has(row.row) ? "total" : "data");
  const setClass = (row: PreviewRow, value: string) => {
    setIgnore(previous => { const out = new Set(previous); if (value === "leftOut") out.add(row.row); else out.delete(row.row); return out; });
    setRead(previous => { const out = new Set(previous); if (value === "data" && wasTotal(row)) out.add(row.row); else out.delete(row.row); return out; });
  };
  const changed = JSON.stringify(next) !== JSON.stringify(current);
  const toggle = (row: number) => setIgnore(previous => { const out = new Set(previous); if (out.has(row)) out.delete(row); else out.add(row); return out; });
  const options = fields.map(field => ({ value: field, label: label(field) }));
  if (rows.length === 0 && applied.length === 0 && ignoredRows.length === 0 && preview.length === 0) return null;
  return (
    <section className="space-y-3 rounded-xl border p-3 text-sm" aria-label={t.title} data-testid="pmc-row-corrections">
      <div>
        <h4 className="flex items-center gap-2 font-semibold"><PencilLine className="h-4 w-4" aria-hidden />{t.title}</h4>
        <p className="text-xs text-muted-foreground">{t.hint}</p>
      </div>
      {rows.length > 0 && <ul className="divide-y rounded-lg border">
        {rows.slice(0, MAX_CORRECTABLE_ROWS).map(([row, rowErrors]) => {
          const field = fieldOf[row] ?? rowErrors.find(error => error.field && fields.includes(error.field))?.field ?? fields[0];
          const left = ignore.has(row);
          return (
            <li key={row} className="space-y-2 p-2" data-row={row}>
              <p className="font-medium">{t.row} <bdi>{row}</bdi>{left && <span className="ms-2 rounded-full bg-muted px-2 py-0.5 text-xs">{t.leftOut}</span>}</p>
              <ul className="text-xs text-danger-soft-foreground">{rowErrors.map((error, index) => <li key={index}>{pmcImportReason(error, language)}</li>)}</ul>
              {!left && field && <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
                <label className="block sm:w-56"><span className="text-xs font-medium">{t.field}</span><Select className="mt-1 w-full min-h-11 md:min-h-11" aria-label={`${t.field} · ${t.row} ${row}`} value={field} options={options} onValueChange={value => setFieldOf(previous => ({ ...previous, [row]: value }))} /></label>
                <label className="block flex-1"><span className="text-xs font-medium">{t.value}</span><Input className="mt-1 min-h-[44px]" aria-label={`${t.value} · ${t.row} ${row}`} maxLength={500} value={drafts[key(row, field)] ?? ""} onChange={event => { const value = event.target.value; setDrafts(previous => ({ ...previous, [key(row, field)]: value })); }} /></label>
              </div>}
              <Button type="button" variant="outline" className="min-h-[44px]" aria-pressed={left} onClick={() => toggle(row)}>{left ? t.undo : t.leaveOut}</Button>
            </li>
          );
        })}
      </ul>}
      {rows.length > MAX_CORRECTABLE_ROWS && <p className="text-xs text-muted-foreground">{t.moreRows(rows.length - MAX_CORRECTABLE_ROWS)}</p>}
      {(applied.length > 0 || ignoredRows.length > 0) && <div className="space-y-1" data-testid="applied-corrections">
        <p className="font-medium">{t.applied}</p>
        <p className="text-xs text-muted-foreground" data-dropped-note>{t.dropped}</p>
        <ul className="divide-y rounded-lg border">
          {applied.map(edit => {
            const gone = undone.has(key(edit.row, edit.field));
            return (
              <li key={key(edit.row, edit.field)} className={`flex flex-col gap-2 p-2 sm:flex-row sm:items-center sm:justify-between ${gone ? "opacity-50" : ""}`}>
                <span>{t.row} <bdi>{edit.row}</bdi> · {label(edit.field)} (<bdi>{edit.header}</bdi>): {t.from} «<bdi>{edit.from}</bdi>» ← {t.to} «<bdi>{edit.to}</bdi>»</span>
                <Button type="button" variant="outline" className="min-h-[44px]" aria-pressed={gone} onClick={() => setUndone(previous => { const out = new Set(previous); if (out.has(key(edit.row, edit.field))) out.delete(key(edit.row, edit.field)); else out.add(key(edit.row, edit.field)); return out; })}>{t.undo}</Button>
              </li>
            );
          })}
          {ignoredRows.filter(row => !rows.some(([errorRow]) => errorRow === row)).map(row => (
            <li key={`ignored-${row}`} className={`flex flex-col gap-2 p-2 sm:flex-row sm:items-center sm:justify-between ${ignore.has(row) ? "" : "opacity-50"}`}>
              <span>{t.ignoredRows}: {t.row} <bdi>{row}</bdi></span>
              <Button type="button" variant="outline" className="min-h-[44px]" aria-pressed={!ignore.has(row)} onClick={() => toggle(row)}>{t.undo}</Button>
            </li>
          ))}
        </ul>
      </div>}
      {preview.length > 0 && <div className="space-y-1" data-testid="row-classes">
        <p className="font-medium">{t.preview}</p>
        <p className="text-xs text-muted-foreground">{t.previewHint(preview.length)}</p>
        <ul className="divide-y rounded-lg border">
          {preview.map(row => {
            const now = classNow(row);
            const choices = (wasTotal(row) ? ["data", "total", "leftOut"] : ["data", "leftOut"]).map(value => ({ value, label: t.classOf[value] }));
            return (
              <li key={row.row} className="flex flex-col gap-2 p-2 sm:flex-row sm:items-center sm:justify-between" data-class={now}>
                <span className="min-w-0"><span className="font-medium">{t.row} <bdi>{row.row}</bdi></span><span className="ms-2 break-words text-xs text-muted-foreground"><bdi>{Object.values(row.cells).filter(Boolean).join(" · ")}</bdi></span></span>
                <Select className="w-full min-h-11 sm:w-44 md:min-h-11" aria-label={`${t.classLabel} · ${t.row} ${row.row}`} value={now} options={choices} onValueChange={value => setClass(row, value)} />
              </li>
            );
          })}
        </ul>
      </div>}
      {correct.error && <p role="alert" className="text-sm text-danger-soft-foreground">{getLocalizedProjectError(correct.error, language)}</p>}
      <Button type="button" className="min-h-[44px]" disabled={!changed || correct.isPending} onClick={() => correct.mutate({ tenantId, projectId, importId, edits: next })}>{t.apply}</Button>
    </section>
  );
}
