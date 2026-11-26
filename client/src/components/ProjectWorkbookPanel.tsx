// Q-51 batch 2b: «كراسة بيانات المشروع» on the screens. ProjectWorkbookDownload downloads the blank workbook in the reader's language (the wizard,
// the import page and the base file). ProjectWorkbookPanel uploads a filled one: it is previewed first (nothing is written — the server runs every
// sheet as the save would and rolls back), the person reads each sheet's line (what it will create, update or leave, or why it is refused), then saves
// that very file (its fingerprint from the preview). Each sheet is saved on its own: a refused sheet writes nothing, the others are saved, and the
// screen says so sheet by sheet and that uploading again is safe (it updates, it never duplicates). The team is never invited from here.
import React from "react";
import { Download, FileUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FileButton } from "@/components/ds";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { getProjectError } from "@shared/projectErrors";
import { pmcImportReason } from "@/lib/pmcImportMessages";
import { trpc } from "@/lib/trpc";

const MAX_BYTES = 3 * 1024 * 1024;
const text = {
  ar: { download: "تنزيل كراسة بيانات المشروع (Excel)", downloadFilled: "تنزيل الكراسة بما في المشروع الآن", filledNote: "النماذج والوحدات والأنشطة والأوزان معبأة؛ أكمل الناقص وارفعها: ما لم تغيّره يبقى «بلا تغيير».", title: "كراسة بيانات المشروع", intro: "ملف Excel واحد يُملأ بما يلزم المشروع ثم يُرفع دفعة واحدة. تُعاين أولًا ولا يُحفظ شيء حتى تضغط «حفظ».", choose: "اختر الكراسة المعبأة", preview: "معاينة الكراسة", save: "حفظ ما ظهر في المعاينة", safe: "كل ورقة تُحفظ وحدها: الورقة المرفوضة لا يُكتب منها شيء والبقية تُحفظ. إعادة رفع الكراسة آمنة: تحدّث ولا تكرّر.", sheet: "الورقة", state: "الحالة", detail: "التفاصيل", tooLarge: "الملف أكبر من 3 ميغابايت.", row: "الصف",
    status: { empty: "فارغة", will_apply: "ستُحفظ", applied: "حُفظت", refused: "مرفوضة", awaiting_confirmation: "بانتظار تأكيد منفصل (لا تُرسل دعوة من هنا)", feeds_other_sheets: "تُقرأ عبر الأوراق الأخرى" } as Record<string, string>,
    counts: (c: { create: number; update: number; unchanged: number }) => `جديد ${c.create} · تحديث ${c.update} · بلا تغيير ${c.unchanged}`,
    reasons: { WORKBOOK_KEY_MISSING: "مفتاح فارغ في صف فيه بيانات", WORKBOOK_KEY_DUPLICATE: "مفتاح مكرر في الورقة", WORKBOOK_REQUIRED_MISSING: "عمود إلزامي فارغ", WORKBOOK_HEADERS_CHANGED: "عناوين الأعمدة تغيّرت: نزّل الكراسة من جديد", WORKBOOK_TOO_MANY_ROWS: "صفوف أكثر من الحد (20,000)" } as Record<string, string> },
  en: { download: "Download the project workbook (Excel)", downloadFilled: "Download the workbook with what the project holds now", filledNote: "Models, units, activities and weights are filled in; complete what is missing and upload it: what you leave as it is stays «unchanged».", title: "Project workbook", intro: "One Excel file filled with what the project needs, uploaded at once. It is previewed first; nothing is saved until you press «Save».", choose: "Choose the filled workbook", preview: "Preview the workbook", save: "Save what the preview showed", safe: "Each sheet is saved on its own: a refused sheet writes nothing and the others are saved. Uploading the workbook again is safe: it updates, it never duplicates.", sheet: "Sheet", state: "State", detail: "Details", tooLarge: "The file is larger than 3 MB.", row: "row",
    status: { empty: "Empty", will_apply: "Will be saved", applied: "Saved", refused: "Refused", awaiting_confirmation: "Awaiting a separate confirmation (no invitation is sent from here)", feeds_other_sheets: "Read through the other sheets" } as Record<string, string>,
    counts: (c: { create: number; update: number; unchanged: number }) => `new ${c.create} · update ${c.update} · unchanged ${c.unchanged}`,
    reasons: { WORKBOOK_KEY_MISSING: "A key is empty on a row with data", WORKBOOK_KEY_DUPLICATE: "A key repeated in the sheet", WORKBOOK_REQUIRED_MISSING: "A required column is empty", WORKBOOK_HEADERS_CHANGED: "The column headers were changed: download the workbook again", WORKBOOK_TOO_MANY_ROWS: "More rows than the limit (20,000)" } as Record<string, string> },
  ur: { download: "پروجیکٹ ورک بک ڈاؤن لوڈ کریں (Excel)", downloadFilled: "پروجیکٹ میں موجود ڈیٹا کے ساتھ ورک بک ڈاؤن لوڈ کریں", filledNote: "ماڈل، یونٹس، سرگرمیاں اور وزن بھرے ہوئے ہیں؛ جو کمی ہے مکمل کریں اور اپ لوڈ کریں: جو آپ نہ بدلیں وہ «بغیر تبدیلی» رہتا ہے۔", title: "پروجیکٹ ورک بک", intro: "ایک Excel فائل جو پروجیکٹ کی ضرورت سے بھری جائے اور ایک ساتھ اپ لوڈ ہو۔ پہلے پیش منظر ہوتا ہے؛ «محفوظ کریں» دبانے تک کچھ محفوظ نہیں ہوتا۔", choose: "بھری ہوئی ورک بک منتخب کریں", preview: "ورک بک کا پیش منظر", save: "پیش منظر میں دکھایا گیا محفوظ کریں", safe: "ہر شیٹ الگ محفوظ ہوتی ہے: مسترد شیٹ سے کچھ نہیں لکھا جاتا اور باقی محفوظ ہوتی ہیں۔ ورک بک دوبارہ اپ لوڈ کرنا محفوظ ہے: یہ اپ ڈیٹ کرتی ہے، دہراتی نہیں۔", sheet: "شیٹ", state: "حالت", detail: "تفصیل", tooLarge: "فائل 3 MB سے بڑی ہے۔", row: "قطار",
    status: { empty: "خالی", will_apply: "محفوظ ہوگی", applied: "محفوظ ہوئی", refused: "مسترد", awaiting_confirmation: "الگ تصدیق کی منتظر (یہاں سے کوئی دعوت نہیں بھیجی جاتی)", feeds_other_sheets: "دوسری شیٹس کے ذریعے پڑھی جاتی ہے" } as Record<string, string>,
    counts: (c: { create: number; update: number; unchanged: number }) => `نئے ${c.create} · اپ ڈیٹ ${c.update} · بغیر تبدیلی ${c.unchanged}`,
    reasons: { WORKBOOK_KEY_MISSING: "ڈیٹا والی قطار میں کلید خالی ہے", WORKBOOK_KEY_DUPLICATE: "شیٹ میں دہرائی گئی کلید", WORKBOOK_REQUIRED_MISSING: "لازمی کالم خالی ہے", WORKBOOK_HEADERS_CHANGED: "کالم کے عنوانات بدل گئے: ورک بک دوبارہ ڈاؤن لوڈ کریں", WORKBOOK_TOO_MANY_ROWS: "حد (20,000) سے زیادہ قطاریں" } as Record<string, string> },
};
type Outcome = { key: string; status: string; rows: number; counts?: { create: number; update: number; unchanged: number }; title?: { ar: string; en: string; ur: string }; errors: Array<{ row?: number; rowNumber?: number; field?: string; code: string; detail?: string }> };

/** In words, never a bare code: the workbook's own reasons, the PMC importer's (pmcImportReason) and the platform's messages. */
function reasonOf(error: { code: string; field?: string; detail?: string }, language: "ar" | "en" | "ur", reasons: Record<string, string>) {
  if (reasons[error.code]) return [reasons[error.code], error.field].filter(Boolean).join(" · ");
  if (error.code.startsWith("PROJECT_OS_")) return getProjectError(error.code).messages[language];
  return pmcImportReason(error, language);
}

function saveFile(file: { base64: string; fileName: string; contentType: string }) {
  const bytes = Uint8Array.from(window.atob(file.base64), char => char.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: file.contentType })); const link = document.createElement("a"); link.href = url; link.download = file.fileName; link.click(); URL.revokeObjectURL(url);
}

export function ProjectWorkbookDownload() {
  const { language } = useLanguage(); const t = pickLanguage(language, text);
  const download = trpc.dataImports.projectWorkbook.useMutation({ onSuccess: saveFile });
  return (
    <div className="flex flex-wrap items-center gap-2" data-workbook-download>
      <Button type="button" variant="outline" className="min-h-11" disabled={download.isPending} onClick={() => download.mutate({ locale: language })}><Download aria-hidden className="me-1 h-4 w-4" />{t.download}</Button>
      {download.error ? <p role="alert" className="text-sm text-destructive">{getLocalizedProjectError(download.error, language)}</p> : null}
    </div>
  );
}

/** Q-51 batch 3: the workbook pre-filled with the project's models, units and activities (the PMC importer's permission; an audit row is written). */
export function ProjectWorkbookFilledDownload({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { language } = useLanguage(); const t = pickLanguage(language, text);
  const download = trpc.dataImports.projectWorkbookFilled.useMutation({ onSuccess: saveFile });
  return (
    <div className="flex flex-col gap-1" data-workbook-filled-download>
      <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" className="min-h-11" disabled={download.isPending} onClick={() => download.mutate({ tenantId, projectId, locale: language })}><Download aria-hidden className="me-1 h-4 w-4" />{t.downloadFilled}</Button></div>
      <p className="text-xs text-muted-foreground">{t.filledNote}</p>
      {download.error ? <p role="alert" className="text-sm text-destructive">{getLocalizedProjectError(download.error, language)}</p> : null}
    </div>
  );
}

const toBase64 = (file: File) => new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1] ?? ""); reader.onerror = () => reject(reader.error); reader.readAsDataURL(file); });

export function ProjectWorkbookPanel({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { language } = useLanguage(); const t = pickLanguage(language, text);
  const [file, setFile] = React.useState<{ base64: string; name: string } | null>(null); const [local, setLocal] = React.useState("");
  const preview = trpc.dataImports.projectWorkbookPreview.useMutation();
  const apply = trpc.dataImports.projectWorkbookApply.useMutation();
  const shown = (apply.data?.sheets ?? preview.data?.sheets ?? []) as Outcome[];
  const choose = async (picked: File | undefined) => {
    preview.reset(); apply.reset(); setFile(null); setLocal("");
    if (!picked) return;
    if (picked.size > MAX_BYTES) { setLocal(t.tooLarge); return; }
    setFile({ base64: await toBase64(picked), name: picked.name });
  };
  const canSave = Boolean(file && preview.data && !apply.data && (preview.data.sheets as Outcome[]).some(sheet => sheet.status === "will_apply"));
  return (
    <section className="flex flex-col gap-3 rounded-[var(--radius)] border border-border bg-card p-4" data-workbook-panel>
      <h2 className="text-base font-semibold">{t.title}</h2>
      <p className="text-sm text-muted-foreground">{t.intro}</p>
      <ProjectWorkbookDownload />
      <ProjectWorkbookFilledDownload tenantId={tenantId} projectId={projectId} />
      <div className="flex flex-wrap items-center gap-2"><FileButton label={t.choose} accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onFile={picked => void choose(picked ?? undefined)} /></div>
      {local ? <p role="alert" className="text-sm text-destructive">{local}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button type="button" className="min-h-11" disabled={!file || preview.isPending} onClick={() => file && preview.mutate({ tenantId, projectId, fileBase64: file.base64 })}><FileUp aria-hidden className="me-1 h-4 w-4" />{t.preview}</Button>
        <Button type="button" className="min-h-11" disabled={!canSave || apply.isPending} onClick={() => file && preview.data && apply.mutate({ tenantId, projectId, fileBase64: file.base64, approvedHash: preview.data.fileHash })}>{t.save}</Button>
      </div>
      {preview.error || apply.error ? <p role="alert" className="text-sm text-destructive">{getLocalizedProjectError((apply.error ?? preview.error)!, language)}</p> : null}
      {shown.length ? (
        <>
          <p role="note" className="rounded-md bg-muted px-3 py-2 text-sm" data-workbook-safe>{t.safe}</p>
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border" data-workbook-sheets>
            {shown.map(sheet => (
              <li key={sheet.key} className="flex flex-col gap-1 p-3 text-sm" data-workbook-sheet={sheet.key} data-workbook-state={sheet.status}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-medium">{sheet.title ? pickLanguage(language, sheet.title) : sheet.key}</span>
                  <span className={sheet.status === "refused" ? "font-semibold text-destructive" : "text-muted-foreground"}>{t.status[sheet.status] ?? sheet.status}{sheet.counts ? ` · ${t.counts(sheet.counts)}` : ""}</span>
                </div>
                {sheet.errors.length ? <ul className="ms-4 list-disc text-destructive">{sheet.errors.slice(0, 20).map((error, index) => <li key={index} data-workbook-error={error.code}>{`${t.row} ${error.row || error.rowNumber || "—"} · `}<bdi>{reasonOf(error, language, t.reasons)}</bdi></li>)}</ul> : null}
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </section>
  );
}
