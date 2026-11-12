import React from "react";
import { Download } from "lucide-react";
import { Button, FileDropzone, formatNumber, type UploadItem } from "@/components/ds";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { WriteGate } from "@/lib/permissions";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { projectErrorMessages } from "@shared/projectErrors";
import { readPickedFile, saveBase64File } from "./ProjectBaselineCashFlow";

// Q-10 (d): item 8 of the base file (optional) — the planned labour histogram. Template, drop the file, check report (rows, peak, refused rows), save; the stored
// plan is drawn as one bar per month. The server reads and decides (server/domain/plannedLabour.ts, server/projectBaseline.ts).
const text = {
  ar: { template: "قالب Excel", check: "تقرير التحقق", rows: (n: number) => `${formatNumber(n)} صف`, peak: "الذروة", workers: (n: number) => `${formatNumber(n)} عامل`, row: "الصف", save: "حفظ العمالة المخططة", saved: "حُفظت العمالة المخططة.", chart: "هيستوغرام العمالة المخططة (عمال في الشهر)", issues: { LABOUR_MONTH_INVALID: "شهر غير مفهوم", LABOUR_WORKERS_INVALID: "عدد العمال يجب أن يكون عددًا صحيحًا من صفر", LABOUR_TRADE_TOO_LONG: "اسم المهنة أطول من 80 حرفًا", LABOUR_ROW_REPEATED: "الشهر والمهنة مكرران" } },
  en: { template: "Excel template", check: "Check report", rows: (n: number) => `${formatNumber(n)} rows`, peak: "Peak", workers: (n: number) => `${formatNumber(n)} workers`, row: "Row", save: "Save the planned labour", saved: "The planned labour was saved.", chart: "Planned labour histogram (workers per month)", issues: { LABOUR_MONTH_INVALID: "Month not understood", LABOUR_WORKERS_INVALID: "Workers must be a whole number from zero", LABOUR_TRADE_TOO_LONG: "Trade longer than 80 characters", LABOUR_ROW_REPEATED: "Month and trade repeated" } },
  ur: { template: "Excel سانچہ", check: "جانچ رپورٹ", rows: (n: number) => `${formatNumber(n)} قطاریں`, peak: "عروج", workers: (n: number) => `${formatNumber(n)} مزدور`, row: "قطار", save: "منصوبہ بند افرادی قوت محفوظ کریں", saved: "منصوبہ بند افرادی قوت محفوظ ہو گئی۔", chart: "منصوبہ بند افرادی قوت (ماہانہ مزدور)", issues: { LABOUR_MONTH_INVALID: "مہینہ سمجھ نہیں آیا", LABOUR_WORKERS_INVALID: "مزدوروں کی تعداد صفر یا اس سے بڑا پورا عدد ہو", LABOUR_TRADE_TOO_LONG: "پیشے کا نام 80 حروف سے لمبا", LABOUR_ROW_REPEATED: "مہینہ اور پیشہ دہرائے گئے" } },
};
const MAX_BYTES = 1024 * 1024;
type Bar = { month: string; workers: number };

/** One bar per month, height relative to the peak; the first and last months and the peak are written under it. */
export function LabourHistogram({ bars, label, peakLabel }: { bars: Bar[]; label: string; peakLabel: string }) {
  if (!bars.length) return null;
  const peak = Math.max(1, ...bars.map(bar => bar.workers));
  return (
    <figure className="mt-3" data-testid="labour-histogram">
      <figcaption className="text-xs text-muted-foreground">{label} · {peakLabel}: <bdi dir="ltr">{formatNumber(peak)}</bdi></figcaption>
      <div dir="ltr" className="mt-1 w-full max-w-md">
        <div className="flex h-32 items-end gap-0.5 border-b border-border" role="img" aria-label={label}>
          {bars.map(bar => <div key={bar.month} className="flex-1 rounded-t-sm bg-primary" style={{ height: `${Math.max(2, (bar.workers / peak) * 100)}%` }} title={`${bar.month.slice(0, 7)}: ${formatNumber(bar.workers)}`} />)}
        </div>
        <p className="flex justify-between text-xs text-muted-foreground"><span>{bars[0].month.slice(0, 7)}</span><span>{bars[bars.length - 1].month.slice(0, 7)}</span></p>
      </div>
    </figure>
  );
}

export function LabourItem({ tenantId, projectId, histogram }: { tenantId: string; projectId: string; histogram: Bar[] }) {
  const { language } = useLanguage(); const t = pickLanguage(language, text);
  const utils = trpc.useUtils();
  const [file, setFile] = React.useState<Awaited<ReturnType<typeof readPickedFile>> | null>(null);
  const preview = trpc.projects.baseline.previewLabour.useMutation();
  const save = trpc.projects.baseline.saveLabour.useMutation({ onSuccess: () => { void utils.projects.baseline.status.invalidate(); } });
  const take = async (picked: File) => { const next = await readPickedFile(picked); setFile(next); save.reset(); preview.mutate({ tenantId, projectId, fileBase64: next.base64, format: next.format }); };
  const report = preview.data;
  const refusal = report?.refusal;
  const items: UploadItem[] = file ? [{ id: "labour", name: file.name, size: file.size, status: preview.isPending ? "uploading" : preview.isError || refusal ? "failed" : "done" }] : [];
  return (
    <div className="space-y-3">
      <LabourHistogram bars={histogram} label={t.chart} peakLabel={t.peak} />
      <Button type="button" variant="secondary" className="min-h-11 md:min-h-11" onClick={() => { void utils.projects.baseline.labourTemplate.fetch({ tenantId, projectId, locale: language }).then(saveBase64File); }}><Download className="me-1 h-4 w-4" />{t.template}</Button>
      <WriteGate permission="project.manage" projectId={projectId}>
        <FileDropzone accept={[".xlsx", ".csv"]} maxBytes={MAX_BYTES} items={items} onFiles={files => { if (files[0]) void take(files[0]); }} />
        {preview.error ? <p role="alert" className="text-sm font-medium text-destructive">{getLocalizedProjectError(preview.error, language)}</p> : null}
        {report ? (
          <section className="rounded-[var(--radius)] border border-border p-3" aria-label={t.check} data-testid="labour-report">
            <h3 className="text-sm font-semibold">{t.check}</h3>
            <p className="mt-1 text-sm">{t.rows(report.count)} · {t.peak}: {t.workers(report.peak)}</p>
            {report.issues.length ? <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-destructive">{report.issues.map(issue => <li key={`${issue.rowNumber}-${issue.code}`}>{t.row} {formatNumber(issue.rowNumber)}: {t.issues[issue.code]}{issue.value ? <> — <bdi dir="ltr">{issue.value}</bdi></> : null}</li>)}</ul> : null}
            {refusal ? <p role="alert" className="mt-2 text-sm font-medium text-destructive">{refusal in projectErrorMessages ? projectErrorMessages[refusal as keyof typeof projectErrorMessages][language] : refusal}</p> : <LabourHistogram bars={report.histogram} label={t.chart} peakLabel={t.peak} />}
            {file && !refusal ? <Button type="button" className="mt-3 min-h-11 md:min-h-11" loading={save.isPending} onClick={() => save.mutate({ tenantId, projectId, fileBase64: file.base64, format: file.format })}>{t.save}</Button> : null}
            {save.error ? <p role="alert" className="mt-2 text-sm font-medium text-destructive">{getLocalizedProjectError(save.error, language)}</p> : null}
            {save.isSuccess ? <p role="status" className="mt-2 text-sm text-success">{t.saved}</p> : null}
          </section>
        ) : null}
      </WriteGate>
    </div>
  );
}
