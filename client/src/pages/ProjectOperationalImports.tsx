import { DirectImportRunner } from "@/components/DirectImportRunner";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { ledgerErrorLabel } from "@/lib/ledgerMessages";
import { WriteGate } from "@/lib/permissions";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { ledgerColumns, ledgerImportPermission, LEDGER_MODULES, type LedgerModule } from "@shared/ledgerImportColumns";
import { Download, FileSpreadsheet } from "lucide-react";
import React, { useState } from "react";
import { pickLanguage } from "@/lib/language";

function download(file: { base64: string; fileName: string; contentType: string }) {
  const bytes = Uint8Array.from(window.atob(file.base64), value => value.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: file.contentType })); const link = document.createElement("a"); link.href = url; link.download = file.fileName; link.click(); URL.revokeObjectURL(url);
}

const text = {
  ar: {
    title: "Excel للبيانات التشغيلية", note: "قالب ← تصدير ← تعديل ← إعادة رفع، مع معاينة الفروق قبل أي حفظ. لا يكتب الملف إلا ما رأيته في المعاينة، ولا يتجاوز مسار اعتماد قائم.",
    modules: { costs: "التكاليف الفعلية", purchaseOrders: "أوامر الشراء", employees: "الموظفون", timeEntries: "الساعات" } as Record<LedgerModule, string>,
    rules: {
      costs: "كل صف يُربط ببند WBS موجود أو ببند ميزانية مربوط ببند WBS، وإلا يُرفض بسببه. المبالغ بالريال. التكلفة المرحَّلة لا تُعدَّل من الملف: الصف المصدَّر المعدَّل يُرفض.",
      purchaseOrders: "كل أمر يُربط بعقد موجود أو بمورد موجود. تُنشأ الأوامر مسودات دائمًا، ولا يُعدَّل إلا ما بقي مسودة. عمود الحالة للعرض فقط: تقديم الأمر واعتماده يتمان من مساره.",
      employees: "السجل الوظيفي فقط (الرقم والاسم والمسمى والقسم وتاريخ التعيين والحالة). لا جنسية ولا وثائق هوية في الملف، وإنهاء الخدمة من شاشة الموارد البشرية. كل قراءة لهذه السجلات تُسجَّل في سجل التدقيق.",
      timeEntries: "صف لكل موظف ولكل يوم على إسناده في هذا المشروع، وبالقاعدة نفسها لشاشة الساعات: لا يُقبل يوم بلا حضور معتمد. تُنشأ الساعات مسودات، واليوم المسجَّل لا يُعدَّل من الملف.",
    } as Record<LedgerModule, string>,
    template: "تنزيل القالب", export: "تصدير البيانات الحالية", chooseFile: "ملف Excel أو CSV", analyze: "رفع الملف وتحليله", confirm: "حفظ ما ظهر في المعاينة", columns: "الأعمدة", required: "مطلوب",
    denied: "لا تملك صلاحية استيراد هذا النوع، فالشاشة للتصدير والقالب فقط.",
  },
  en: {
    title: "Excel for operational data", note: "Template → export → edit → re-upload, with a differences preview before anything is saved. The file writes only what you saw in the preview and never goes around an existing approval path.",
    modules: { costs: "Actual costs", purchaseOrders: "Purchase orders", employees: "Employees", timeEntries: "Hours" } as Record<LedgerModule, string>,
    rules: {
      costs: "Every row is tied to an existing WBS item or to a budget line linked to one, or it is refused with its reason. Amounts are in riyals. A posted cost is not edited from a file: an edited exported row is refused.",
      purchaseOrders: "Every order is tied to an existing contract or supplier. Orders are always created as drafts and only a draft can be changed. The Status column is for display: submitting and approving happen in the order's workflow.",
      employees: "The working record only (number, name, title, department, hire date, status). No nationality or identity documents in the file, and termination is done on the HR screen. Every read of these records is written to the audit trail.",
      timeEntries: "One row per employee per day against their assignment on this project, under the hours screen's own rule: a day without approved attendance is refused. Hours are created as drafts and a booked day is not edited from a file.",
    } as Record<LedgerModule, string>,
    template: "Download the template", export: "Export the current data", chooseFile: "Excel or CSV file", analyze: "Upload and analyse", confirm: "Save what the preview showed", columns: "Columns", required: "required",
    denied: "You may not import this kind of data; this section offers the export and the template only.",
  }, ur: {
    title: "آپریشنل ڈیٹا کے لیے Excel", note: "ٹیمپلیٹ ← ایکسپورٹ ← ترمیم ← دوبارہ اپ لوڈ، کچھ بھی محفوظ کرنے سے پہلے فرق کے پیش منظر کے ساتھ۔ فائل صرف وہی لکھتی ہے جو آپ نے پیش منظر میں دیکھا، اور کبھی موجودہ منظوری کے راستے کو نظرانداز نہیں کرتی۔",
    modules: { costs: "اصل لاگت", purchaseOrders: "خریداری کے آرڈر", employees: "ملازمین", timeEntries: "گھنٹے" } as Record<LedgerModule, string>,
    rules: {
      costs: "ہر قطار کسی موجودہ WBS آئٹم سے، یا اس سے منسلک بجٹ لائن سے جڑی ہوتی ہے، ورنہ وجہ کے ساتھ مسترد کر دی جاتی ہے۔ رقوم ریال میں ہیں۔ درج شدہ لاگت فائل سے تبدیل نہیں کی جاتی: ایکسپورٹ کی گئی قطار میں ترمیم ہو تو وہ مسترد کر دی جاتی ہے۔",
      purchaseOrders: "ہر آرڈر کسی موجودہ معاہدے یا سپلائر سے جڑا ہوتا ہے۔ آرڈر ہمیشہ مسودے کے طور پر بنتے ہیں اور صرف مسودہ ہی تبدیل کیا جا سکتا ہے۔ حیثیت کا کالم صرف دکھانے کے لیے ہے: جمع کرانا اور منظوری آرڈر کے ورک فلو میں ہوتی ہے۔",
      employees: "صرف ملازمت کا ریکارڈ (نمبر، نام، عہدہ، شعبہ، تقرری کی تاریخ، حیثیت)۔ فائل میں نہ قومیت ہے نہ شناختی دستاویزات، اور ملازمت کا خاتمہ HR اسکرین پر ہوتا ہے۔ ان ریکارڈز کو ہر بار پڑھنا آڈٹ لاگ میں درج ہوتا ہے۔",
      timeEntries: "ہر ملازم کے لیے فی دن ایک قطار، اس پروجیکٹ پر اس کی تفویض کے مقابل، گھنٹوں کی اسکرین کے اپنے اصول کے تحت: منظور شدہ حاضری کے بغیر دن مسترد کر دیا جاتا ہے۔ گھنٹے مسودے کے طور پر بنتے ہیں اور درج شدہ دن فائل سے تبدیل نہیں کیا جاتا۔",
    } as Record<LedgerModule, string>,
    template: "ٹیمپلیٹ ڈاؤن لوڈ کریں", export: "موجودہ ڈیٹا ایکسپورٹ کریں", chooseFile: "Excel یا CSV فائل", analyze: "اپ لوڈ اور تجزیہ کریں", confirm: "پیش منظر میں دکھایا گیا محفوظ کریں", columns: "کالم", required: "لازمی",
    denied: "آپ اس قسم کا ڈیٹا امپورٹ نہیں کر سکتے؛ یہ حصہ صرف ایکسپورٹ اور ٹیمپلیٹ فراہم کرتا ہے۔",
  },
};

export function ProjectOperationalImports({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { isArabic, language } = useLanguage();
  const t = pickLanguage(language, text);
  const locale = language;
  const [moduleCode, setModuleCode] = useState<LedgerModule>("costs");
  const template = trpc.dataImports.template.useMutation({ onSuccess: download });
  const exporter = trpc.dataImports.export.useMutation({ onSuccess: download });
  const columns = ledgerColumns[moduleCode].filter(column => !column.readOnly);
  const fieldLabel = (field: string) => ledgerColumns[moduleCode].find(column => column.key === field)?.[locale];
  const error = template.error ?? exporter.error;
  return (
    <section className="rounded-[var(--radius-lg)] border border-border bg-card p-5 shadow-sm sm:p-6" data-testid="operational-imports">
      <div className="flex items-start gap-3"><span className="grid h-10 w-10 place-items-center rounded-[var(--radius-md)] bg-[var(--dashio-indigo)]/10 text-primary"><FileSpreadsheet className="h-5 w-5" /></span><div><h2 className="font-semibold">{t.title}</h2><p className="mt-1 text-xs text-muted-foreground">{t.note}</p></div></div>
      <div role="tablist" className="mt-4 flex flex-wrap gap-2">{LEDGER_MODULES.map(code => <Button key={code} role="tab" aria-selected={moduleCode === code} type="button" className="min-h-[44px]" variant={moduleCode === code ? "default" : "outline"} onClick={() => setModuleCode(code)}>{t.modules[code]}</Button>)}</div>
      <p className="mt-4 text-sm leading-6">{t.rules[moduleCode]}</p>
      <p className="mt-3 text-xs font-semibold text-muted-foreground">{t.columns}</p>
      <div className="mt-2 flex flex-wrap gap-2">{columns.map(column => <span key={column.key} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium text-foreground">{column[locale]}{column.required ? ` · ${t.required}` : ""}</span>)}</div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="min-h-[44px]" disabled={template.isPending} onClick={() => template.mutate({ moduleCode, locale })}><Download className="me-1 h-4 w-4" />{t.template}</Button>
        <Button type="button" variant="outline" className="min-h-[44px]" disabled={exporter.isPending} onClick={() => exporter.mutate({ tenantId, projectId, moduleCode, format: "xlsx", locale })}><Download className="me-1 h-4 w-4" />{t.export}</Button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{getLocalizedProjectError(error, isArabic)}</p>}
      <div className="mt-5 border-t border-border pt-4">
        <WriteGate permission={ledgerImportPermission[moduleCode]} projectId={projectId} reason={{ ar: text.ar.denied, en: text.en.denied, ur: text.ur.denied }}>
          <DirectImportRunner tenantId={tenantId} projectId={projectId} moduleCode={moduleCode} isArabic={isArabic} fileLabel={t.chooseFile} analyzeLabel={t.analyze} confirmLabel={t.confirm} withDiff fieldLabel={fieldLabel} errorLabel={code => ledgerErrorLabel(code, isArabic)} />
        </WriteGate>
      </div>
    </section>
  );
}
