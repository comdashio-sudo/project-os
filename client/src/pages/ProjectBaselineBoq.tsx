import React from "react";
import { Download } from "lucide-react";
import { Button, FileDropzone, formatAmount, formatNumber, type UploadItem } from "@/components/ds";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { WriteGate } from "@/lib/permissions";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { projectErrorMessages } from "@shared/projectErrors";
import { readPickedFile, saveBase64File } from "./ProjectBaselineCashFlow";

// Q-10 (c): item 6 of the base file — the bill of quantities. Template, drop the file, read the check report (items, total, new / updated, refused rows), then save.
// A code already in the project is updated in place; nothing is deleted. The server decides (server/domain/boqFile.ts, server/projectBaseline.ts).
const text = {
  ar: { template: "قالب Excel", check: "تقرير التحقق", items: (n: number) => `${formatNumber(n)} بند`, total: "الإجمالي", fresh: (n: number) => `جديد: ${formatNumber(n)}`, update: (n: number) => `يُحدَّث: ${formatNumber(n)}`, row: "الصف", save: "حفظ جدول الكميات", saved: "حُفظ جدول الكميات.", issues: { BOQ_CODE_MISSING: "رقم البند ناقص", BOQ_CODE_TOO_LONG: "رقم البند أطول من 80 حرفًا", BOQ_DESCRIPTION_MISSING: "الوصف ناقص", BOQ_UNIT_INVALID: "الوحدة ناقصة أو طويلة", BOQ_QUANTITY_INVALID: "كمية غير صحيحة", BOQ_RATE_INVALID: "سعر غير صحيح", BOQ_CODE_REPEATED: "رقم بند مكرر" } },
  en: { template: "Excel template", check: "Check report", items: (n: number) => `${formatNumber(n)} items`, total: "Total", fresh: (n: number) => `New: ${formatNumber(n)}`, update: (n: number) => `Updated: ${formatNumber(n)}`, row: "Row", save: "Save the BOQ", saved: "The BOQ was saved.", issues: { BOQ_CODE_MISSING: "Item no. missing", BOQ_CODE_TOO_LONG: "Item no. longer than 80 characters", BOQ_DESCRIPTION_MISSING: "Description missing", BOQ_UNIT_INVALID: "Unit missing or too long", BOQ_QUANTITY_INVALID: "Quantity is not valid", BOQ_RATE_INVALID: "Rate is not valid", BOQ_CODE_REPEATED: "Repeated item no." } },
  ur: { template: "Excel سانچہ", check: "جانچ رپورٹ", items: (n: number) => `${formatNumber(n)} آئٹم`, total: "کل", fresh: (n: number) => `نئے: ${formatNumber(n)}`, update: (n: number) => `تازہ: ${formatNumber(n)}`, row: "قطار", save: "مقداروں کا جدول محفوظ کریں", saved: "مقداروں کا جدول محفوظ ہو گیا۔", issues: { BOQ_CODE_MISSING: "آئٹم نمبر نہیں", BOQ_CODE_TOO_LONG: "آئٹم نمبر 80 حروف سے لمبا", BOQ_DESCRIPTION_MISSING: "تفصیل نہیں", BOQ_UNIT_INVALID: "اکائی نہیں یا لمبی", BOQ_QUANTITY_INVALID: "مقدار درست نہیں", BOQ_RATE_INVALID: "شرح درست نہیں", BOQ_CODE_REPEATED: "دہرایا گیا آئٹم نمبر" } },
};
const MAX_BYTES = 3 * 1024 * 1024;

export function BoqItem({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { language } = useLanguage(); const t = pickLanguage(language, text);
  const utils = trpc.useUtils();
  const [file, setFile] = React.useState<Awaited<ReturnType<typeof readPickedFile>> | null>(null);
  const preview = trpc.projects.baseline.previewBoq.useMutation();
  const save = trpc.projects.baseline.saveBoq.useMutation({ onSuccess: () => { void utils.projects.baseline.status.invalidate(); } });
  const take = async (picked: File) => { const next = await readPickedFile(picked); setFile(next); save.reset(); preview.mutate({ tenantId, projectId, fileBase64: next.base64, format: next.format }); };
  const report = preview.data;
  const items: UploadItem[] = file ? [{ id: "boq", name: file.name, size: file.size, status: preview.isPending ? "uploading" : preview.isError || report?.refusal ? "failed" : "done" }] : [];
  const refusal = report?.refusal;
  return (
    <div className="space-y-3">
      <Button type="button" variant="secondary" className="min-h-11 md:min-h-11" onClick={() => { void utils.projects.baseline.boqTemplate.fetch({ tenantId, projectId, locale: language }).then(saveBase64File); }}><Download className="me-1 h-4 w-4" />{t.template}</Button>
      <WriteGate permission="project.wbs.manage" projectId={projectId}>
        <FileDropzone accept={[".xlsx", ".csv"]} maxBytes={MAX_BYTES} items={items} onFiles={files => { if (files[0]) void take(files[0]); }} />
        {preview.error ? <p role="alert" className="text-sm font-medium text-destructive">{getLocalizedProjectError(preview.error, language)}</p> : null}
        {report ? (
          <section className="rounded-[var(--radius)] border border-border p-3" aria-label={t.check} data-testid="boq-report">
            <h3 className="text-sm font-semibold">{t.check}</h3>
            <p className="mt-1 text-sm">{t.items(report.count)} · {t.total}: <bdi dir="ltr">{formatAmount(report.totalAmount)}</bdi></p>
            {report.count ? <p className="text-sm text-muted-foreground">{t.fresh(report.newCount)} · {t.update(report.updateCount)}</p> : null}
            {report.issues.length ? <ul className="mt-2 list-disc space-y-1 ps-5 text-sm text-destructive">{report.issues.map(issue => <li key={`${issue.rowNumber}-${issue.code}`}>{t.row} {formatNumber(issue.rowNumber)}: {t.issues[issue.code]}{issue.value ? <> — <bdi dir="ltr">{issue.value}</bdi></> : null}</li>)}</ul> : null}
            {refusal ? <p role="alert" className="mt-2 text-sm font-medium text-destructive">{refusal in projectErrorMessages ? projectErrorMessages[refusal as keyof typeof projectErrorMessages][language] : refusal}</p> : null}
            {file && !refusal ? <Button type="button" className="mt-3 min-h-11 md:min-h-11" loading={save.isPending} onClick={() => save.mutate({ tenantId, projectId, fileBase64: file.base64, format: file.format })}>{t.save}</Button> : null}
            {save.error ? <p role="alert" className="mt-2 text-sm font-medium text-destructive">{getLocalizedProjectError(save.error, language)}</p> : null}
            {save.isSuccess ? <p role="status" className="mt-2 text-sm text-success">{t.saved}</p> : null}
          </section>
        ) : null}
      </WriteGate>
    </div>
  );
}
