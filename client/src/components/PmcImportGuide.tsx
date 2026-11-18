import React from "react";
import { CheckCircle2, Circle, Clock, LoaderCircle, XCircle } from "lucide-react";
import { formatDate } from "@/components/ds/format";
import type { Language } from "@/lib/language";
import { pickLanguage } from "@/lib/language";
import { PMC_GUIDE_KINDS, PMC_IMPORT_GUIDE, type PmcGuideKind } from "@/lib/pmcImportGuide";

// Q-35: the PMC import kinds as a list a person chooses from, each with what the project's saved imports say about it (pmc.importStatus, read from
// data_imports: an uploaded file that was never confirmed is not «imported»), and under it the chosen template explained (lib/pmcImportGuide.ts).
// Every state has its colour, its icon and its words, so it is never told by colour alone.
export type PmcImportState = "completed" | "pending" | "analyzing" | "failed" | "none";
export type PmcKindStatus = { kind: string; state: PmcImportState; lastAttemptAt: Date | string | null; lastImportedAt: Date | string | null; createdRows: number; updatedRows: number };

const text = {
  ar: { list: "أنواع الاستيراد", states: { completed: "اكتمل الاستيراد", pending: "بانتظار التأكيد", analyzing: "قيد التحليل", failed: "فشل", none: "لم يُستورد" }, lastImported: "آخر استيراد ناجح", rows: (created: number, updated: number) => `أُنشئ ${created} · حُدّث ${updated}`, failedBefore: "آخر محاولة فشلت؛ آخر استيراد ناجح", purpose: "ماذا يفعل", when: "متى يُستعمل", columns: "الأعمدة", required: "مطلوب", optional: "اختياري", format: "الصيغة", example: "مثال (بيانات وهمية)", after: "بعد النجاح", where: "أين ترى البيانات", unknown: "تعذّر قراءة حالة الاستيراد؛ القائمة تعمل بدونها." },
  en: { list: "Import types", states: { completed: "Import complete", pending: "Waiting for confirmation", analyzing: "Analysing", failed: "Failed", none: "Not imported" }, lastImported: "Last successful import", rows: (created: number, updated: number) => `${created} created · ${updated} updated`, failedBefore: "The last attempt failed; last successful import", purpose: "What it does", when: "When to use it", columns: "Columns", required: "Required", optional: "Optional", format: "Format", example: "Example (made-up data)", after: "After a successful import", where: "Where to see the data", unknown: "The import status could not be read; the list works without it." },
  ur: { list: "درآمد کی اقسام", states: { completed: "درآمد مکمل", pending: "تصدیق کا منتظر", analyzing: "تجزیہ جاری", failed: "ناکام", none: "درآمد نہیں ہوا" }, lastImported: "آخری کامیاب درآمد", rows: (created: number, updated: number) => `${created} بنے · ${updated} اپ ڈیٹ`, failedBefore: "آخری کوشش ناکام؛ آخری کامیاب درآمد", purpose: "یہ کیا کرتا ہے", when: "کب استعمال کریں", columns: "کالم", required: "لازمی", optional: "اختیاری", format: "شکل", example: "مثال (فرضی ڈیٹا)", after: "کامیابی کے بعد", where: "ڈیٹا کہاں دیکھیں", unknown: "درآمد کی حیثیت پڑھی نہیں جا سکی؛ فہرست اس کے بغیر کام کرتی ہے۔" },
};

const LOOK: Record<PmcImportState, { icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>; className: string }> = {
  completed: { icon: CheckCircle2, className: "bg-success-soft text-success-soft-foreground" },
  pending: { icon: Clock, className: "bg-warning-soft text-warning-soft-foreground" },
  analyzing: { icon: LoaderCircle, className: "bg-info-soft text-info-soft-foreground" },
  failed: { icon: XCircle, className: "bg-danger-soft text-danger-soft-foreground" },
  none: { icon: Circle, className: "bg-muted text-muted-foreground" },
};

export function ImportStateBadge({ state, language }: { state: PmcImportState; language: Language }) {
  const t = pickLanguage(language, text);
  const { icon: Icon, className } = LOOK[state];
  return <span data-import-state={state} className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${className}`}><Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />{t.states[state]}</span>;
}

/** The kinds, each a choice (a radio group) with its saved state. `statuses` undefined: still loading, or failed (`statusFailed`), and the list still works. */
export function PmcImportKindList({ kind, onChange, labels, statuses, statusFailed, language }: { kind: PmcGuideKind; onChange: (kind: PmcGuideKind) => void; labels: Record<string, string>; statuses?: PmcKindStatus[]; statusFailed?: boolean; language: Language }) {
  const t = pickLanguage(language, text);
  return (
    <fieldset className="space-y-2" data-testid="pmc-import-kinds">
      <legend className="text-sm font-medium">{t.list}</legend>
      {statusFailed && <p role="note" className="text-xs text-muted-foreground">{t.unknown}</p>}
      <div role="radiogroup" aria-label={t.list} className="grid gap-2 sm:grid-cols-2">
        {PMC_GUIDE_KINDS.map(item => {
          const status = statuses?.find(row => row.kind === item);
          const chosen = item === kind;
          return (
            <button key={item} type="button" role="radio" aria-checked={chosen} data-kind={item} onClick={() => onChange(item)}
              className={`flex min-h-11 flex-col items-start gap-1 rounded-[var(--radius)] border p-3 text-start text-sm ${chosen ? "border-primary ring-2 ring-primary" : "border-border bg-card hover:bg-muted"}`}>
              <span className="font-medium">{labels[item] ?? item}</span>
              {status && <ImportStateBadge state={status.state} language={language} />}
              {status?.lastImportedAt && <span className="text-xs text-muted-foreground">{status.state === "failed" ? t.failedBefore : t.lastImported}: <bdi dir="ltr">{formatDate(status.lastImportedAt, language)}</bdi> · {t.rows(status.createdRows, status.updatedRows)}</span>}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

/** The chosen template explained: what, when, columns (required / optional), format, an example, what happens after, and where to see it. */
export function PmcImportTemplateGuide({ kind, language }: { kind: PmcGuideKind; language: Language }) {
  const t = pickLanguage(language, text);
  const guide = PMC_IMPORT_GUIDE[language][kind];
  const [header, ...rows] = guide.example;
  const line = (label: string, value: string) => <div><dt className="text-xs font-semibold text-foreground">{label}</dt><dd className="text-sm text-muted-foreground">{value}</dd></div>;
  return (
    <section className="space-y-3 rounded-[var(--radius-lg)] border border-border bg-card p-4" data-testid="pmc-import-guide" data-kind={kind}>
      <dl className="grid gap-3 sm:grid-cols-2">{line(t.purpose, guide.purpose)}{line(t.when, guide.when)}</dl>
      <div>
        <h4 className="text-xs font-semibold">{t.columns}</h4>
        <ul className="mt-1 flex flex-wrap gap-2" data-testid="pmc-import-guide-columns">
          {guide.columns.map(column => (
            <li key={column.header} className="rounded-[var(--radius)] border border-border px-2 py-1 text-xs" data-required={column.required}>
              <bdi className="font-medium">{column.header}</bdi> · <span className={column.required ? "font-semibold text-foreground" : "text-muted-foreground"}>{column.required ? t.required : t.optional}</span>{column.note ? <span className="text-muted-foreground"> — {column.note}</span> : null}
            </li>
          ))}
        </ul>
      </div>
      <dl>{line(t.format, guide.format)}</dl>
      <div>
        <h4 className="text-xs font-semibold">{t.example}</h4>
        <div className="mt-1 overflow-x-auto">
          <table className="min-w-full text-xs tabular-nums" data-testid="pmc-import-guide-example">
            <thead><tr>{header.map(cell => <th key={String(cell)} scope="col" className="border border-border bg-muted px-2 py-1 text-start font-semibold">{cell}</th>)}</tr></thead>
            <tbody>{rows.map((row, index) => <tr key={index}>{row.map((cell, column) => <td key={column} className="border border-border px-2 py-1"><bdi>{cell}</bdi></td>)}</tr>)}</tbody>
          </table>
        </div>
      </div>
      <dl className="grid gap-3 sm:grid-cols-2">{line(t.after, guide.after)}{line(t.where, guide.where)}</dl>
    </section>
  );
}
