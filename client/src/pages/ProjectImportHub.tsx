import React from "react";
import { Link, useParams } from "wouter";
import { CalendarClock, FileSpreadsheet, FolderInput, LayoutGrid, ListChecks, Map as MapIcon, type LucideIcon } from "lucide-react";
import { PageMain, PageTitle } from "@/components/pageFrame";
import { ProjectWorkbookPanel } from "@/components/ProjectWorkbookPanel";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { useCanPage } from "@/lib/permissions";
import { PAGE_NAMES } from "@shared/pageNames";
import type { PageKey } from "@shared/pageAccess";

type Text = { ar: string; en: string; ur: string };
/** Each kind of file, what it holds, and the page that imports it (the same screens as before: no import moved, none was added). */
const KINDS: ReadonlyArray<{ key: string; icon: LucideIcon; page: PageKey; path: string; title: Text; files: Text }> = [
  { key: "programme", icon: CalendarClock, page: "controls", path: "import/programme",
    title: { ar: "البرنامج الزمني والتكلفة", en: "Programme and cost", ur: "پروگرام اور لاگت" },
    files: { ar: "ملف Primavera (XER) أو Excel للأنشطة وWBS والميزانية.", en: "A Primavera file (XER) or Excel for the activities, the WBS and the budget.", ur: "Primavera فائل (XER) یا سرگرمیوں، WBS اور بجٹ کے لیے Excel۔" } },
  { key: "operational", icon: FileSpreadsheet, page: "controls", path: "import/operational",
    title: { ar: "البيانات التشغيلية", en: "Operational data", ur: "آپریشنل ڈیٹا" },
    files: { ar: "Excel للتكاليف الفعلية وأوامر الشراء والموظفين والساعات.", en: "Excel for actual costs, purchase orders, employees and hours.", ur: "اصل لاگت، خریداری آرڈرز، ملازمین اور گھنٹوں کے لیے Excel۔" } },
  { key: "reference", icon: ListChecks, page: "controls", path: "import/reference",
    title: { ar: "القوائم المرجعية", en: "Reference lists", ur: "حوالہ جاتی فہرستیں" },
    files: { ar: "العمالة والمعدات والأنشطة، وملف Tracker القديم.", en: "Labour, equipment and activities, and the old Tracker file.", ur: "افرادی قوت، آلات اور سرگرمیاں، اور پرانی Tracker فائل۔" } },
  { key: "masterPlan", icon: MapIcon, page: "controls", path: "import/master-plan",
    title: { ar: "مخطط الماستر بلان", en: "Master plan drawing", ur: "ماسٹر پلان کا نقشہ" },
    files: { ar: "صورة أو PDF أو DXF للمخطط.", en: "An image, PDF or DXF of the plan.", ur: "نقشے کی تصویر، PDF یا DXF۔" } },
  { key: "pmc", icon: LayoutGrid, page: "pmc", path: "pmc?tab=import",
    title: { ar: "ملفات PMC", en: "PMC files", ur: "PMC فائلیں" },
    files: { ar: "الوحدات والأوزان وحالة الموقع والطلبات وخط الأساس.", en: "Units, weights, site status, requests and the baseline.", ur: "یونٹس، وزن، سائٹ کی حالت، درخواستیں اور بیس لائن۔" } },
  { key: "baseline", icon: FolderInput, page: "baseline", path: "baseline",
    title: { ar: "ملف المشروع الأساسي", en: "Project base file", ur: "منصوبے کی بنیادی فائل" },
    files: { ar: "العقد، والتدفق النقدي المخطط، وجدول الكميات BOQ، والعمالة المخططة.", en: "The contract, the planned cash flow, the bill of quantities (BOQ) and the planned labour.", ur: "معاہدہ، منصوبہ بند نقدی بہاؤ، مقداروں کا جدول (BOQ) اور منصوبہ بند افرادی قوت۔" } },
];

const text = {
  intro: { ar: "اختر نوع الملف، وتفتح لك الصفحة التي تستورده. كل استيراد يُعرض قبل حفظه، ولا يُكتب شيء قبل تأكيدك.", en: "Choose the kind of file; the page that imports it opens. Every import is shown before it is saved, and nothing is written until you confirm.", ur: "فائل کی قسم منتخب کریں؛ اسے درآمد کرنے والا صفحہ کھلے گا۔ ہر درآمد محفوظ ہونے سے پہلے دکھائی جاتی ہے، اور آپ کی تصدیق سے پہلے کچھ نہیں لکھا جاتا۔" },
  nothing: { ar: "لا تملك صلاحية فتح أي من صفحات الاستيراد في هذا المشروع.", en: "You may not open any of this project's import pages.", ur: "آپ اس منصوبے کا کوئی درآمدی صفحہ نہیں کھول سکتے۔" },
};

/**
 * Q-36 (step 3 c, docs/proposals/navigation.md §4): the five ways in to an import become ONE entry that sends each kind of file where it is imported.
 * The old entries stay where they were (nothing moved, no address changed); «Upload any file» on the project board now opens this page. Each card is
 * drawn only for whoever may open its page (shared/pageAccess.ts IMPORT_HUB_PAGES); the page itself reads and writes nothing.
 */
export default function ProjectImportHub() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { language } = useLanguage();
  const can: Record<string, boolean> = { controls: useCanPage("controls", projectId), pmc: useCanPage("pmc", projectId), baseline: useCanPage("baseline", projectId) };
  const shown = KINDS.filter(kind => can[kind.page]);
  return (
    <PageMain className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 md:p-6">
      <PageTitle title={pickLanguage(language, PAGE_NAMES.imports)} description={pickLanguage(language, text.intro)} />
      {shown.length ? (
        <ul className="grid gap-3 sm:grid-cols-2" data-import-cards>
          {shown.map(({ key, icon: Icon, path, title, files }) => (
            <li key={key} data-import-card={key}>
              <Link href={`/projects/${tenantId}/${projectId}/${path}`} className="flex min-h-11 h-full flex-col gap-2 rounded-[var(--radius)] border border-border bg-card p-4 hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring">
                <span className="flex items-center gap-2 text-base font-semibold"><Icon aria-hidden className="h-5 w-5 text-muted-foreground" />{pickLanguage(language, title)}</span>
                <span className="text-sm text-muted-foreground">{pickLanguage(language, files)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : <p role="note" className="rounded-xl bg-muted px-4 py-3 text-sm text-muted-foreground ring-1 ring-border">{pickLanguage(language, text.nothing)}</p>}
      {/* Q-51: the whole project in one workbook — saved through the PMC importer's permission, so offered to whoever opens the PMC pages */}
      {can.pmc ? <ProjectWorkbookPanel tenantId={tenantId} projectId={projectId} /> : null}
    </PageMain>
  );
}
