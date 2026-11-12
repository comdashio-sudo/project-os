import React from "react";
import { Link, useParams } from "wouter";
import { CheckCircle2, CircleDashed, FileUp, Download, MinusCircle } from "lucide-react";
import { Badge, Button, Card, CardBody, CardHeader, CardTitle, Field, TextInput, formatNumber } from "@/components/ds";
import type { BadgeTone } from "@/components/ds";
import { CheckedForm } from "@/components/CheckedForm";
import { PageHeader, PageMain } from "@/components/pageFrame";
import { SectionErrorBoundary, SourceNotice } from "@/components/SectionResilience";
import { useLanguage } from "@/contexts/LanguageContext";
import { projectErrorCode } from "@/lib/errorCode";
import { pickLanguage } from "@/lib/language";
import { WriteGate } from "@/lib/permissions";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { ProjectImports } from "./ProjectImports";
import { CashFlowItem } from "./ProjectBaselineCashFlow";
import { BoqItem } from "./ProjectBaselineBoq";
import { LabourItem } from "./ProjectBaselineLabour";

// Q-10 (a): the project's «base file» — one page that lists what any project needs before the platform can plan it, says in a line what each piece is and what it feeds, and shows
// where it stands (uploaded / missing / optional). The owner opens the project and sees the eight items; each one that is a file is uploaded from here, and the importer that
// already exists does the work. The contract is the one item that is a form. Server: server/projectBaseline.ts.
type Code = "contract" | "schedule" | "cashFlow" | "weights" | "units" | "boq" | "wbs" | "labour";
type Copy = { title: string; what: string; feeds: string };
const ITEMS: readonly Code[] = ["contract", "schedule", "cashFlow", "weights", "units", "boq", "wbs", "labour"];
/** The importer that takes the file for an item today (`general`: this page's own import panel; `pmc`: the PMC import tab); the rest are added in the next slices. */
const UPLOAD: Record<Code, "form" | "general" | "pmc" | "later"> = { contract: "form", schedule: "general", cashFlow: "form", weights: "pmc", units: "pmc", boq: "form", wbs: "general", labour: "form" };
const GENERAL_MODULE: Partial<Record<Code, "schedule" | "wbs">> = { schedule: "schedule", wbs: "wbs" };

const text = {
  ar: {
    title: "ملف المشروع الأساسي", intro: "كل ما يحتاجه المشروع قبل أن تخطط له المنصة. ارفع كل ملف من مكانه، والمنصة تعرف أين تضعه.",
    progress: (ready: number, required: number) => `${formatNumber(ready)} من ${formatNumber(required)} بنود مطلوبة جاهزة`,
    states: { uploaded: "مرفوع", missing: "ناقص", optional: "اختياري" }, feeds: "يغذّي", upload: "رفع", template: "قالب Excel", later: "الرفع من هنا قريبًا",
    count: (n: number) => `${formatNumber(n)} سجل`,
    contract: { value: "قيمة العقد", start: "تاريخ البداية", finish: "تاريخ النهاية", save: "حفظ العقد", saved: "حُفظ العقد." },
    importTitle: "رفع ملف", importHint: "اختر البند ثم ارفع ملفه. أي ملف Primavera (XER) يُقبل كجدول زمني مهما كان النوع المختار.", openPmc: "فتح رفع الوحدات والأوزان",
    items: {
      contract: { title: "العقد", what: "قيمة العقد وتاريخا البداية والنهاية (نموذج إدخال لا ملف).", feeds: "الربحية، والمنحنى المخطط، وتقارير التقدم" },
      schedule: { title: "الجدول الزمني", what: "برنامج المشروع بأي مستوى، من ملف Primavera (XER) أو Excel.", feeds: "الأنشطة، والتواريخ المخططة، ومنحنى S" },
      cashFlow: { title: "التدفق النقدي المخطط", what: "النسبة الشهرية المخططة من العقد؛ مجموعها 100%.", feeds: "منحنى S المخطط ومقارنة الإنجاز الفعلي" },
      weights: { title: "جدول الأوزان", what: "وزن كل نشاط من الوحدة؛ مجموع كل نموذج 100%.", feeds: "نسبة إنجاز الوحدة والمشروع" },
      units: { title: "قائمة الوحدات", what: "البلوك والفيلا والنموذج لكل وحدة.", feeds: "تحديث الموقع، وبطاقة الفيلا، والماستر بلان" },
      boq: { title: "جدول الكميات (BOQ)", what: "بنود الأعمال بكمياتها وأسعارها.", feeds: "التكلفة، والمستخلصات" },
      wbs: { title: "هيكل تقسيم العمل (WBS)", what: "شجرة أكواد التكلفة التي تُربط بها الأنشطة.", feeds: "ضبط التكاليف والميزانية" },
      labour: { title: "هيستوغرام العمالة المخطط", what: "عدد العمال المخطط شهريًا (اختياري).", feeds: "مقارنة العمالة الفعلية بالمخطط" },
    } as Record<Code, Copy>,
  },
  en: {
    title: "Project base file", intro: "Everything a project needs before the platform can plan it. Upload each file from where you have it; the platform knows where it goes.",
    progress: (ready: number, required: number) => `${formatNumber(ready)} of ${formatNumber(required)} required items ready`,
    states: { uploaded: "Uploaded", missing: "Missing", optional: "Optional" }, feeds: "Feeds", upload: "Upload", template: "Excel template", later: "Upload from here is coming",
    count: (n: number) => `${formatNumber(n)} records`,
    contract: { value: "Contract value", start: "Start date", finish: "End date", save: "Save the contract", saved: "The contract was saved." },
    importTitle: "Upload a file", importHint: "Choose the item, then upload its file. Any Primavera (XER) file is accepted as the schedule whichever kind is ticked.", openPmc: "Open the units and weights upload",
    items: {
      contract: { title: "Contract", what: "The contract value and its start and end dates (a form, not a file).", feeds: "Profitability, the planned curve and progress reports" },
      schedule: { title: "Schedule", what: "The project programme at any level, from a Primavera (XER) file or Excel.", feeds: "Activities, planned dates and the S-curve" },
      cashFlow: { title: "Planned cash flow", what: "The planned monthly share of the contract; the shares total 100%.", feeds: "The planned S-curve and the comparison with actual progress" },
      weights: { title: "Weights table", what: "Each activity's weight in the unit; each model totals 100%.", feeds: "Unit and project progress" },
      units: { title: "Unit list", what: "Block, villa and model for every unit.", feeds: "Site update, the villa card and the master plan" },
      boq: { title: "Bill of quantities (BOQ)", what: "Work items with their quantities and rates.", feeds: "Cost and payment certificates" },
      wbs: { title: "Work breakdown structure (WBS)", what: "The tree of cost codes that activities are tied to.", feeds: "Cost control and the budget" },
      labour: { title: "Planned labour histogram", what: "The planned number of workers per month (optional).", feeds: "Actual labour against plan" },
    } as Record<Code, Copy>,
  },
  ur: {
    title: "پروجیکٹ کی بنیادی فائل", intro: "پلیٹ فارم کے منصوبہ بندی کرنے سے پہلے پروجیکٹ کو جو کچھ چاہیے۔ ہر فائل وہیں سے اپ لوڈ کریں جہاں آپ کے پاس ہے؛ پلیٹ فارم جانتا ہے کہاں جائے گی۔",
    progress: (ready: number, required: number) => `${formatNumber(required)} میں سے ${formatNumber(ready)} ضروری آئٹم تیار`,
    states: { uploaded: "اپ لوڈ", missing: "غائب", optional: "اختیاری" }, feeds: "کہاں استعمال ہوتا ہے", upload: "اپ لوڈ", template: "Excel ٹیمپلیٹ", later: "یہاں سے اپ لوڈ جلد آ رہا ہے",
    count: (n: number) => `${formatNumber(n)} ریکارڈ`,
    contract: { value: "معاہدے کی قدر", start: "آغاز کی تاریخ", finish: "اختتام کی تاریخ", save: "معاہدہ محفوظ کریں", saved: "معاہدہ محفوظ ہو گیا۔" },
    importTitle: "فائل اپ لوڈ کریں", importHint: "آئٹم منتخب کریں پھر اس کی فائل اپ لوڈ کریں۔ کوئی بھی Primavera (XER) فائل منتخب قسم سے قطع نظر شیڈول کے طور پر قبول ہوتی ہے۔", openPmc: "یونٹس اور وزن کی اپ لوڈ کھولیں",
    items: {
      contract: { title: "معاہدہ", what: "معاہدے کی قدر اور آغاز و اختتام کی تاریخیں (فارم، فائل نہیں)۔", feeds: "منافع، منصوبہ بند منحنی اور پیش رفت کی رپورٹیں" },
      schedule: { title: "شیڈول", what: "پروجیکٹ کا پروگرام کسی بھی سطح پر، Primavera (XER) یا Excel سے۔", feeds: "سرگرمیاں، منصوبہ بند تاریخیں اور S منحنی" },
      cashFlow: { title: "منصوبہ بند نقد بہاؤ", what: "معاہدے کا ماہانہ منصوبہ بند حصہ؛ مجموعہ 100%۔", feeds: "منصوبہ بند S منحنی اور اصل پیش رفت سے موازنہ" },
      weights: { title: "وزن کا جدول", what: "یونٹ میں ہر سرگرمی کا وزن؛ ہر ماڈل کا مجموعہ 100%۔", feeds: "یونٹ اور پروجیکٹ کی پیش رفت" },
      units: { title: "یونٹس کی فہرست", what: "ہر یونٹ کا بلاک، ولا اور ماڈل۔", feeds: "سائٹ اپ ڈیٹ، ولا کارڈ اور ماسٹر پلان" },
      boq: { title: "مقداروں کا جدول (BOQ)", what: "کام کے آئٹم ان کی مقداروں اور نرخوں کے ساتھ۔", feeds: "لاگت اور ادائیگی کے سرٹیفکیٹ" },
      wbs: { title: "ورک بریک ڈاؤن (WBS)", what: "لاگت کے کوڈز کا درخت جس سے سرگرمیاں جڑتی ہیں۔", feeds: "لاگت کا کنٹرول اور بجٹ" },
      labour: { title: "منصوبہ بند مزدور ہسٹوگرام", what: "ماہانہ منصوبہ بند مزدوروں کی تعداد (اختیاری)۔", feeds: "اصل مزدوروں کا منصوبے سے موازنہ" },
    } as Record<Code, Copy>,
  },
};

const TONE = { uploaded: "success", missing: "danger", optional: "neutral" } as Record<"uploaded" | "missing" | "optional", BadgeTone>;
const STATE_ICON = { uploaded: CheckCircle2, missing: CircleDashed, optional: MinusCircle } as const;

function ContractForm({ tenantId, projectId, value, start, finish }: { tenantId: string; projectId: string; value: string; start: string | null; finish: string | null }) {
  const { language } = useLanguage(); const t = pickLanguage(language, text);
  const utils = trpc.useUtils();
  const initial = Number(value) > 0 ? String(Number(value)) : "";
  const [amount, setAmount] = React.useState(initial);
  const [from, setFrom] = React.useState(start ?? "");
  const [to, setTo] = React.useState(finish ?? "");
  React.useEffect(() => { setAmount(initial); setFrom(start ?? ""); setTo(finish ?? ""); }, [initial, start, finish]);
  const save = trpc.projects.baseline.saveContract.useMutation({ onSuccess: () => { void utils.projects.baseline.status.invalidate(); } });
  const code = save.error ? projectErrorCode(save.error) : null;
  const message = save.error ? getLocalizedProjectError(save.error, language) : undefined;
  const at = (codes: string[]) => (code && codes.includes(code) ? message : undefined);
  const elsewhere = code && !["PROJECT_OS_CONTRACT_VALUE_INVALID", "PROJECT_OS_CONTRACT_DATES_INVALID"].includes(code) ? message : null;
  return (
    <CheckedForm className="mt-3 grid gap-3 sm:grid-cols-[repeat(3,minmax(0,1fr))_auto] sm:items-end" onSubmit={event => { event.preventDefault(); save.mutate({ tenantId, projectId, contractValue: Number(amount), plannedStartAt: from, plannedFinishAt: to }); }}>
      <Field label={t.contract.value} required error={at(["PROJECT_OS_CONTRACT_VALUE_INVALID"])}>{props => <TextInput {...props} invalid={Boolean(props["aria-invalid"])} dir="ltr" type="number" inputMode="decimal" min="0" step="0.01" required value={amount} onChange={event => setAmount(event.target.value)} />}</Field>
      <Field label={t.contract.start} required error={at(["PROJECT_OS_CONTRACT_DATES_INVALID"])}>{props => <TextInput {...props} invalid={Boolean(props["aria-invalid"])} dir="ltr" type="date" required value={from} onChange={event => setFrom(event.target.value)} />}</Field>
      <Field label={t.contract.finish} required>{props => <TextInput {...props} invalid={Boolean(props["aria-invalid"])} dir="ltr" type="date" required value={to} onChange={event => setTo(event.target.value)} />}</Field>
      <Button type="submit" className="min-h-11" loading={save.isPending}>{t.contract.save}</Button>
      {elsewhere ? <p role="alert" className="text-sm font-medium text-destructive sm:col-span-full">{elsewhere}</p> : null}
      {save.isSuccess ? <p role="status" className="text-sm text-success sm:col-span-full">{t.contract.saved}</p> : null}
    </CheckedForm>
  );
}

export default function ProjectBaseline() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { language, isRtl } = useLanguage();
  const t = pickLanguage(language, text);
  const status = trpc.projects.baseline.status.useQuery({ tenantId, projectId });
  const template = trpc.dataImports.template.useMutation({ onSuccess: file => { const bytes = Uint8Array.from(window.atob(file.base64), value => value.charCodeAt(0)); const url = URL.createObjectURL(new Blob([bytes], { type: file.contentType })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = file.fileName; anchor.click(); URL.revokeObjectURL(url); } });
  // which kind the upload panel below is opened on; choosing another item remounts it on that kind
  const [importKind, setImportKind] = React.useState<"schedule" | "wbs">("schedule");
  const panel = React.useRef<HTMLDivElement>(null);
  const openUpload = (kind: "schedule" | "wbs") => { setImportKind(kind); window.setTimeout(() => panel.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 0); };
  if (status.error) return <PageMain className="py-2" dir={isRtl ? "rtl" : "ltr"}><SourceNotice query={status} isArabic={language === "ar"} title={t.title} /></PageMain>;
  const data = status.data;
  return (
    <PageMain className="py-2 text-foreground" dir={isRtl ? "rtl" : "ltr"}>
      <div className="mx-auto max-w-4xl space-y-4">
        <PageHeader>
          <h1 className="text-2xl font-semibold">{t.title}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t.intro}</p>
          {data ? <p role="status" data-testid="baseline-progress" className="mt-2 text-sm font-medium">{t.progress(data.ready, data.required)}</p> : null}
        </PageHeader>
        <ol className="space-y-3" aria-label={t.title}>
          {ITEMS.map((code, index) => {
            const item = data?.items.find(entry => entry.code === code);
            const copy = t.items[code];
            const State = item ? STATE_ICON[item.state] : CircleDashed;
            const kind = GENERAL_MODULE[code];
            return (
              <li key={code} data-testid={`baseline-${code}`}>
                <Card>
                  <CardHeader className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <CardTitle><span className="me-2 text-muted-foreground">{formatNumber(index + 1)}.</span>{copy.title}</CardTitle>
                      <p className="mt-1 text-sm text-muted-foreground">{copy.what}</p>
                      <p className="mt-1 text-xs text-muted-foreground">{t.feeds}: {copy.feeds}</p>
                    </div>
                    {item ? <Badge tone={TONE[item.state]}><State className="h-3.5 w-3.5" aria-hidden="true" />{t.states[item.state]}{item.state === "uploaded" && code !== "contract" ? ` · ${t.count(item.count)}` : ""}</Badge> : null}
                  </CardHeader>
                  <CardBody>
                    {code === "contract" && item ? <WriteGate permission="project.manage" projectId={projectId}><ContractForm tenantId={tenantId} projectId={projectId} value={item.detail.contractValue ?? "0"} start={item.detail.plannedStartAt ?? null} finish={item.detail.plannedFinishAt ?? null} /></WriteGate> : null}
                    {code === "cashFlow" && item ? <SectionErrorBoundary title={copy.title} isArabic={language === "ar"}><CashFlowItem tenantId={tenantId} projectId={projectId} curve={item.detail.curve ?? []} /></SectionErrorBoundary> : null}
                    {code === "boq" ? <SectionErrorBoundary title={copy.title} isArabic={language === "ar"}><BoqItem tenantId={tenantId} projectId={projectId} /></SectionErrorBoundary> : null}
                    {code === "labour" && item ? <SectionErrorBoundary title={copy.title} isArabic={language === "ar"}><LabourItem tenantId={tenantId} projectId={projectId} histogram={item.detail.histogram ?? []} /></SectionErrorBoundary> : null}
                    {code !== "contract" && code !== "cashFlow" && code !== "boq" && code !== "labour" ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {kind ? <>
                          <Button type="button" variant="secondary" className="min-h-11" disabled={template.isPending} onClick={() => template.mutate({ moduleCode: kind, locale: language })}><Download className="me-1 h-4 w-4" />{t.template}</Button>
                          <Button type="button" className="min-h-11" onClick={() => openUpload(kind)}><FileUp className="me-1 h-4 w-4" />{t.upload}</Button>
                        </> : UPLOAD[code] === "pmc" ? <Link href={`/projects/${tenantId}/${projectId}/pmc?tab=import`}><Button type="button" className="min-h-11"><FileUp className="me-1 h-4 w-4" />{t.upload}</Button></Link>
                          : <span className="text-sm text-muted-foreground">{t.later}</span>}
                      </div>
                    ) : null}
                  </CardBody>
                </Card>
              </li>
            );
          })}
        </ol>
        <div ref={panel}><ProjectImports key={importKind} tenantId={tenantId} projectId={projectId} initialModule={importKind} /></div>
      </div>
    </PageMain>
  );
}
