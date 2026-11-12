import React from "react";
import { Download } from "lucide-react";
import { Button, FileDropzone, formatNumber, formatPercent, type UploadItem } from "@/components/ds";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { WriteGate } from "@/lib/permissions";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { projectErrorMessages } from "@shared/projectErrors";

// Q-10 (b): item 3 of the base file — the planned cash flow. Download the template, drop the filled file, read the check report (months, total, refused rows), then save.
// The server reads the file and refuses a total other than 100% (server/domain/plannedCashFlow.ts); this screen only shows what it said. The stored plan is drawn as an S-curve.
const text = {
  ar: { template: "قالب Excel", check: "تقرير التحقق", months: (n: number) => `${formatNumber(n)} شهر`, total: "المجموع", diff: (d: string) => `الفرق عن 100%: ${d}`, row: "الصف", save: "حفظ التدفق النقدي", saved: "حُفظ التدفق النقدي.", curve: "منحنى S المخطط (التراكمي)", issues: { CASHFLOW_MONTH_INVALID: "شهر غير مفهوم", CASHFLOW_PERCENT_INVALID: "نسبة غير صحيحة", CASHFLOW_MONTH_REPEATED: "شهر مكرر" } },
  en: { template: "Excel template", check: "Check report", months: (n: number) => `${formatNumber(n)} months`, total: "Total", diff: (d: string) => `Difference from 100%: ${d}`, row: "Row", save: "Save the cash flow", saved: "The cash flow was saved.", curve: "Planned S-curve (cumulative)", issues: { CASHFLOW_MONTH_INVALID: "Month not understood", CASHFLOW_PERCENT_INVALID: "Share is not valid", CASHFLOW_MONTH_REPEATED: "Repeated month" } },
  ur: { template: "Excel سانچہ", check: "جانچ رپورٹ", months: (n: number) => `${formatNumber(n)} مہینے`, total: "مجموعہ", diff: (d: string) => `100% سے فرق: ${d}`, row: "قطار", save: "نقد بہاؤ محفوظ کریں", saved: "نقد بہاؤ محفوظ ہو گیا۔", curve: "منصوبہ بند S منحنی (مجموعی)", issues: { CASHFLOW_MONTH_INVALID: "مہینہ سمجھ نہیں آیا", CASHFLOW_PERCENT_INVALID: "حصہ درست نہیں", CASHFLOW_MONTH_REPEATED: "دہرایا گیا مہینہ" } },
};
const MAX_BYTES = 1024 * 1024;
type Point = { month: string; cumulative: number };

/** A spreadsheet the server sent (base64) saved by the browser. */
export function saveBase64File(file: { fileName: string; base64: string }) {
  const bytes = Uint8Array.from(window.atob(file.base64), value => value.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const anchor = document.createElement("a"); anchor.href = url; anchor.download = file.fileName; anchor.click(); URL.revokeObjectURL(url);
}
/** A picked .xlsx/.csv as the base64 body the preview and save procedures take. */
export async function readPickedFile(picked: File) {
  const buffer = new Uint8Array(await picked.arrayBuffer()); let binary = ""; buffer.forEach(byte => { binary += String.fromCharCode(byte); });
  return { name: picked.name, size: picked.size, base64: window.btoa(binary), format: picked.name.toLowerCase().endsWith(".csv") ? "csv" as const : "xlsx" as const };
}

/** The cumulative plan as a line from 0 to 100%: one point per month, the months on the bottom edge (first and last labelled). */
export function SCurve({ points, label }: { points: Point[]; label: string }) {
  if (!points.length) return null;
  const width = 320; const height = 120; const step = points.length > 1 ? width / (points.length - 1) : 0;
  const coord = (value: number) => Math.round(value * 10) / 10; // SVG coordinates, never shown as text
  const line = points.map((point, index) => `${coord(index * step)},${coord(height - Math.min(1, Math.max(0, point.cumulative)) * height)}`).join(" ");
  return (
    <figure className="mt-3" data-testid="cashflow-curve">
      <figcaption className="text-xs text-muted-foreground">{label}</figcaption>
      <div dir="ltr" className="mt-1 w-full max-w-md">
        <svg viewBox={`-4 -4 ${width + 8} ${height + 8}`} className="h-32 w-full" preserveAspectRatio="none" role="img" aria-label={label}>
          <line x1="0" y1={height} x2={width} y2={height} className="stroke-border" strokeWidth="1" vectorEffect="non-scaling-stroke" />
          <polyline points={line} fill="none" className="stroke-primary" strokeWidth="2.5" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        </svg>
        <p className="flex justify-between text-xs text-muted-foreground"><span>{points[0].month.slice(0, 7)}</span><span>{points[points.length - 1].month.slice(0, 7)}</span></p>
      </div>
    </figure>
  );
}

export function CashFlowItem({ tenantId, projectId, curve }: { tenantId: string; projectId: string; curve: Point[] }) {
  const { language } = useLanguage(); const t = pickLanguage(language, text);
  const utils = trpc.useUtils();
  const [file, setFile] = React.useState<{ name: string; size: number; base64: string; format: "xlsx" | "csv" } | null>(null);
  const preview = trpc.projects.baseline.previewCashFlow.useMutation();
  const save = trpc.projects.baseline.saveCashFlow.useMutation({ onSuccess: () => { void utils.projects.baseline.status.invalidate(); } });
  const download = async () => saveBase64File(await utils.projects.baseline.cashFlowTemplate.fetch({ tenantId, projectId, locale: language }));
  const take = async (picked: File) => {
    const next = await readPickedFile(picked);
    setFile(next); save.reset(); preview.mutate({ tenantId, projectId, fileBase64: next.base64, format: next.format });
  };
  const report = preview.data;
  const items: UploadItem[] = file ? [{ id: "cashflow", name: file.name, size: file.size, status: preview.isPending ? "uploading" : preview.isError || report?.refusal ? "failed" : "done" }] : [];
  return (
    <div className="space-y-3">
      {curve.length ? <SCurve points={curve} label={t.curve} /> : null}
      <Button type="button" variant="secondary" className="min-h-11 md:min-h-11" onClick={() => { void download(); }}><Download className="me-1 h-4 w-4" />{t.template}</Button>
      <WriteGate permission="project.manage" projectId={projectId}>
        <FileDropzone accept={[".xlsx", ".csv"]} maxBytes={MAX_BYTES} items={items} onFiles={files => { if (files[0]) void take(files[0]); }} />
        {preview.error ? <p role="alert" className="text-sm font-medium text-destructive">{getLocalizedProjectError(preview.error, language)}</p> : null}
        {report ? (
          <section className="rounded-[var(--radius)] border border-border p-3" aria-label={t.check} data-testid="cashflow-report">
            <h3 className="text-sm font-semibold">{t.check}</h3>
            <p className="mt-1 text-sm">{t.months(report.months.length)} · {t.total}: <bdi dir="ltr">{formatPercent(report.totalPercent, 2)}</bdi></p>
            {Math.abs(report.totalPercent - 100) > 0.01 && report.months.length ? <p className="text-sm text-destructive">{t.diff(formatPercent(Math.round((report.totalPercent - 100) * 100) / 100, 2))}</p> : null}
            {report.issues.length ? <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-destructive">{report.issues.map(issue => <li key={`${issue.rowNumber}-${issue.code}`}>{t.row} {formatNumber(issue.rowNumber)}: {t.issues[issue.code]}{issue.value ? <> — <bdi dir="ltr">{issue.value}</bdi></> : null}</li>)}</ul> : null}
            {report.refusal ? <p role="alert" className="mt-2 text-sm font-medium text-destructive">{report.refusal in projectErrorMessages ? projectErrorMessages[report.refusal as keyof typeof projectErrorMessages][language] : report.refusal}</p> : null}
            {!report.refusal ? <SCurve points={report.months} label={t.curve} /> : null}
            {file && !report.refusal ? <Button type="button" className="mt-3 min-h-11 md:min-h-11" loading={save.isPending} onClick={() => save.mutate({ tenantId, projectId, fileBase64: file.base64, format: file.format })}>{t.save}</Button> : null}
            {save.error ? <p role="alert" className="mt-2 text-sm font-medium text-destructive">{getLocalizedProjectError(save.error, language)}</p> : null}
            {save.isSuccess ? <p role="status" className="mt-2 text-sm text-success">{t.saved}</p> : null}
          </section>
        ) : null}
      </WriteGate>
    </div>
  );
}
