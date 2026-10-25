import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { ArrowUpRight, Inbox } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import { Badge, Breadcrumbs, Button, Card, CardBody, CardFooter, CardHeader, CardTitle, DataTable, DirectionProvider, DIRECTIONS, EmptyState, Field, FileDropzone, Logo, Modal, PageIntro, Segmented, Select, SkeletonRows, Stepper, TextArea, TextInput, Toaster, formatNumber, notify, useDirection, type DirectionId, type Mode } from "@/components/ds";
import { useLanguage } from "@/contexts/LanguageContext";
import { contrastRatio } from "@/lib/contrast";
import { LANGUAGES, LANGUAGE_NAMES, pickLanguage } from "@/lib/language";
import "@/design/directions.css";

// /design-preview -- the platform owner chooses a visual direction here (work order 19, phase A). Three genuinely different looks, each with its mark, its colours (with the
// measured contrast), its fonts, every shared component live, and the two redrawn screens at 390px and 1280px. Only the platform owner sees it; no company data is on it.
const dictionary = {
  ar: {
    title: "معاينة التصميم", summary: "ثلاثة اتجاهات بصرية مختلفة. اختر واحداً، ثم نطبّقه على كل الشاشات.", ownerOnly: "هذه الصفحة لمالك المنصة فقط.", back: "الرئيسية",
    direction: "الاتجاه", mode: "المظهر", light: "فاتح", dark: "داكن", language: "اللغة", noDark: "هذا الاتجاه فاتح فقط",
    identity: "الهوية", colors: "الألوان", fonts: "الخطوط", components: "المكوّنات", screens: "الشاشتان على بيانات وهمية", logo: "الشعار", symbol: "الرمز", horizontal: "أفقي", stacked: "مرتّب",
    primary: "الرئيسي", complement: "المكمّل", neutrals: "المحايدة", states: "الحالات", success: "نجاح", warning: "تحذير", error: "خطأ", info: "معلومة", aa: "AA", contrast: "التباين",
    sampleAr: "مشاريع المؤسسات، محكومة بالتصميم: 1,234.56", sampleEn: "Enterprise projects, governed by design: 1,234.56", sampleUr: "ادارہ جاتی پروجیکٹس، ڈیزائن ہی سے منظم: 1,234.56",
    buttons: "الأزرار", primaryBtn: "رئيسي", secondaryBtn: "ثانوي", ghostBtn: "شفاف", dangerBtn: "خطر", loadingBtn: "جارٍ الحفظ", disabledBtn: "معطّل",
    fields: "الحقول", fieldName: "اسم المشروع", fieldHint: "يظهر في القوائم والتقارير.", fieldError: "رمز المشروع مستخدم في مشروع آخر.", fieldCode: "رمز المشروع", fieldNote: "ملاحظات", select: "قائمة الاختيار المخصصة",
    options: ["سكني", "تجاري", "بنية تحتية"], upload: "رفع الملفات", stepper: "مؤشر الخطوات", steps: ["الشركة", "أول مشروع", "الاستيراد", "الدعوات"], cards: "البطاقات", cardTitle: "عنوان البطاقة", cardBody: "محتوى البطاقة في سطر واحد.", cardAction: "إجراء",
    table: "الجداول", tableCaption: "مثال على جدول", colItem: "البند", colQty: "الكمية", colStatus: "الحالة", rows: ["حفر وأساسات", "أعمال الخرسانة", "الكهرباء"], statusDone: "مكتمل", statusLate: "متأخر", statusOpen: "جارٍ",
    badges: "الشارات", empty: "الحالات الفارغة", emptyTitle: "لا توجد مشاريع بعد", emptyLine: "أنشئ مشروعك الأول لتبدأ.", emptyAction: "مشروع جديد",
    skeleton: "هياكل التحميل", toast: "التنبيهات المنبثقة", toastBtn: "إظهار تنبيه", toastDone: "تم الحفظ", toastLine: "حُفظت التغييرات.", modal: "النوافذ", modalBtn: "فتح نافذة حذف", modalTitle: "حذف المشروع؟", modalLine: "لا يمكن التراجع عن هذا الإجراء.", modalConfirm: "حذف",
    intro: "مقدمة الصفحة", introTitle: "عنوان الصفحة", introSummary: "سطر واحد يشرح الصفحة.", introDetails: "التفاصيل الطويلة تُطوى هنا، ولا تُعرض إلا لمن يطلبها.", crumbs: "مسار التنقل", crumbItems: ["المشاريع", "فلل النموذج", "الاستيراد"],
    setupScreen: "معالج الإعداد", importScreen: "استيراد البيانات", phone: "جوال 390", desktop: "سطح المكتب 1280", openFull: "فتح بالحجم الكامل",
    seg: "اختيار من مجموعة", segOptions: ["شهري", "أسبوعي", "يومي"],
  },
  en: {
    title: "Design preview", summary: "Three genuinely different visual directions. Pick one and it is applied to every screen.", ownerOnly: "This page is for the platform owner only.", back: "Home",
    direction: "Direction", mode: "Appearance", light: "Light", dark: "Dark", language: "Language", noDark: "This direction is light only",
    identity: "Identity", colors: "Colours", fonts: "Typefaces", components: "Components", screens: "The two screens, on synthetic data", logo: "Logo", symbol: "Symbol", horizontal: "Horizontal", stacked: "Stacked",
    primary: "Primary", complement: "Complement", neutrals: "Neutrals", states: "States", success: "Success", warning: "Warning", error: "Error", info: "Info", aa: "AA", contrast: "Contrast",
    sampleAr: "مشاريع المؤسسات، محكومة بالتصميم: 1,234.56", sampleEn: "Enterprise projects, governed by design: 1,234.56", sampleUr: "ادارہ جاتی پروجیکٹس، ڈیزائن ہی سے منظم: 1,234.56",
    buttons: "Buttons", primaryBtn: "Primary", secondaryBtn: "Secondary", ghostBtn: "Ghost", dangerBtn: "Danger", loadingBtn: "Saving", disabledBtn: "Disabled",
    fields: "Fields", fieldName: "Project name", fieldHint: "Shown in lists and reports.", fieldError: "This project code is used by another project.", fieldCode: "Project code", fieldNote: "Notes", select: "Custom select",
    options: ["Residential", "Commercial", "Infrastructure"], upload: "File upload", stepper: "Stepper", steps: ["Company", "First project", "Import", "Invitations"], cards: "Cards", cardTitle: "Card title", cardBody: "The card's content in one line.", cardAction: "Action",
    table: "Tables", tableCaption: "A sample table", colItem: "Item", colQty: "Quantity", colStatus: "Status", rows: ["Excavation and foundations", "Concrete works", "Electrical"], statusDone: "Done", statusLate: "Late", statusOpen: "In progress",
    badges: "Badges", empty: "Empty states", emptyTitle: "No projects yet", emptyLine: "Create your first project to begin.", emptyAction: "New project",
    skeleton: "Loading skeletons", toast: "Toasts", toastBtn: "Show a toast", toastDone: "Saved", toastLine: "Your changes were saved.", modal: "Dialogs", modalBtn: "Open a delete dialog", modalTitle: "Delete the project?", modalLine: "This cannot be undone.", modalConfirm: "Delete",
    intro: "Page intro", introTitle: "Page title", introSummary: "One line that says what the page is for.", introDetails: "The long explanation folds away here and shows only to those who ask.", crumbs: "Breadcrumbs", crumbItems: ["Projects", "Sample Villas", "Import"],
    setupScreen: "Setup wizard", importScreen: "Data import", phone: "Phone 390", desktop: "Desktop 1280", openFull: "Open at full size",
    seg: "Segmented choice", segOptions: ["Monthly", "Weekly", "Daily"],
  },
  ur: {
    title: "ڈیزائن کا پیش منظر", summary: "تین واقعی مختلف بصری انداز۔ ایک چنیں، پھر ہم اسے تمام اسکرینز پر لاگو کریں گے۔", ownerOnly: "یہ صفحہ صرف پلیٹ فارم کے مالک کے لیے ہے۔", back: "ہوم",
    direction: "انداز", mode: "ظاہری شکل", light: "روشن", dark: "گہرا", language: "زبان", noDark: "یہ انداز صرف روشن ہے",
    identity: "شناخت", colors: "رنگ", fonts: "خط", components: "اجزاء", screens: "دو اسکرینیں، فرضی ڈیٹا پر", logo: "لوگو", symbol: "علامت", horizontal: "افقی", stacked: "عمودی",
    primary: "بنیادی", complement: "تکمیلی", neutrals: "غیر جانبدار", states: "حالتیں", success: "کامیابی", warning: "انتباہ", error: "غلطی", info: "معلومات", aa: "AA", contrast: "تضاد",
    sampleAr: "مشاريع المؤسسات، محكومة بالتصميم: 1,234.56", sampleEn: "Enterprise projects, governed by design: 1,234.56", sampleUr: "ادارہ جاتی پروجیکٹس، ڈیزائن ہی سے منظم: 1,234.56",
    buttons: "بٹن", primaryBtn: "بنیادی", secondaryBtn: "ثانوی", ghostBtn: "شفاف", dangerBtn: "خطرہ", loadingBtn: "محفوظ ہو رہا ہے", disabledBtn: "غیر فعال",
    fields: "خانے", fieldName: "پروجیکٹ کا نام", fieldHint: "فہرستوں اور رپورٹوں میں نظر آتا ہے۔", fieldError: "یہ پروجیکٹ کوڈ دوسرے پروجیکٹ میں استعمال ہو چکا ہے۔", fieldCode: "پروجیکٹ کوڈ", fieldNote: "نوٹس", select: "حسب ضرورت فہرست",
    options: ["رہائشی", "تجارتی", "انفراسٹرکچر"], upload: "فائل اپ لوڈ", stepper: "مراحل کا اشارہ", steps: ["کمپنی", "پہلا پروجیکٹ", "درآمد", "دعوتیں"], cards: "کارڈ", cardTitle: "کارڈ کا عنوان", cardBody: "کارڈ کا مواد ایک سطر میں۔", cardAction: "عمل",
    table: "جدولیں", tableCaption: "نمونہ جدول", colItem: "مد", colQty: "مقدار", colStatus: "حالت", rows: ["کھدائی اور بنیادیں", "کنکریٹ کا کام", "بجلی"], statusDone: "مکمل", statusLate: "تاخیر", statusOpen: "جاری",
    badges: "بیج", empty: "خالی حالتیں", emptyTitle: "ابھی کوئی پروجیکٹ نہیں", emptyLine: "شروع کرنے کے لیے اپنا پہلا پروجیکٹ بنائیں۔", emptyAction: "نیا پروجیکٹ",
    skeleton: "لوڈنگ ڈھانچے", toast: "اطلاعات", toastBtn: "اطلاع دکھائیں", toastDone: "محفوظ ہو گیا", toastLine: "آپ کی تبدیلیاں محفوظ ہو گئیں۔", modal: "ونڈوز", modalBtn: "حذف کی ونڈو کھولیں", modalTitle: "پروجیکٹ حذف کریں؟", modalLine: "اسے واپس نہیں کیا جا سکتا۔", modalConfirm: "حذف",
    intro: "صفحے کا تعارف", introTitle: "صفحے کا عنوان", introSummary: "ایک سطر جو بتائے کہ صفحہ کس لیے ہے۔", introDetails: "لمبی وضاحت یہاں سمٹی رہتی ہے اور صرف مانگنے پر دکھتی ہے۔", crumbs: "راستہ", crumbItems: ["پروجیکٹس", "نمونہ ولاز", "درآمد"],
    setupScreen: "سیٹ اپ وزرڈ", importScreen: "ڈیٹا درآمد", phone: "موبائل 390", desktop: "ڈیسک ٹاپ 1280", openFull: "مکمل سائز میں کھولیں",
    seg: "جماعتی انتخاب", segOptions: ["ماہانہ", "ہفتہ وار", "روزانہ"],
  },
};
export const usePreviewText = () => pickLanguage(useLanguage().language, dictionary);

const taglines: Record<DirectionId, { ar: string; en: string; ur: string }> = {
  a: { ar: "دقيق وكثيف وبارد، على طريقة أدوات المنتجات الحديثة.", en: "Precise, dense and cool, like a modern product tool.", ur: "درست، گھنا اور ٹھنڈا، جدید پروڈکٹ ٹول کی طرح۔" },
  b: { ar: "هادئ ورحب وورقي، يشبه دفتر حسابات مرتّباً.", en: "Calm, roomy and paper-like, a well-kept ledger.", ur: "پرسکون، کشادہ اور کاغذی، ایک سلیقے کا کھاتا۔" },
  c: { ar: "حادّ وتقني بالأبيض والأسود وبرتقالي واحد.", en: "Sharp and technical: black, white and one signal orange.", ur: "تیز اور تکنیکی: سیاہ، سفید اور ایک نارنجی اشارہ۔" },
};
const fontNames: Record<DirectionId, { ar: string; lat: string; ur: string }> = {
  a: { ar: "IBM Plex Sans Arabic", lat: "Inter", ur: "Noto Nastaliq Urdu" },
  b: { ar: "Readex Pro", lat: "Readex Pro", ur: "Noto Nastaliq Urdu" },
  c: { ar: "Noto Kufi Arabic", lat: "Space Grotesk", ur: "Noto Nastaliq Urdu" },
};

/** The value of a CSS token as the browser resolved it, as #rrggbb. Empty where there is no stylesheet (tests). */
function useTokenHex(names: string[]): { hexes: Record<string, string>; ref: React.RefObject<HTMLDivElement | null> } {
  const ref = useRef<HTMLDivElement>(null);
  const { direction, mode } = useDirection();
  const [values, setValues] = useState<Record<string, string>>({});
  useLayoutEffect(() => {
    const element = ref.current; if (!element) return;
    const probe = document.createElement("span"); element.appendChild(probe);
    const next: Record<string, string> = {};
    for (const name of names) {
      probe.style.color = `var(--${name})`;
      const match = getComputedStyle(probe).color.match(/rgba?\(\s*(\d+)[,\s]+(\d+)[,\s]+(\d+)/);
      if (match) next[name] = `#${[match[1], match[2], match[3]].map(part => Number(part).toString(16).padStart(2, "0")).join("")}`;
    }
    element.removeChild(probe); setValues(next);
  }, [direction, mode, names]);
  return { hexes: values, ref };
}

function Swatch({ name, label, on, hexes }: { name: string; label: string; on?: string; hexes: Record<string, string> }) {
  const t = usePreviewText();
  const hex = hexes[name]; const onHex = on ? hexes[on] : undefined;
  const ratio = hex && onHex ? contrastRatio(hex, onHex) : null;
  return (
    <li className="flex items-center gap-3 rounded-[var(--radius)] border border-border bg-card p-2.5">
      <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[calc(var(--radius)-2px)] border border-border text-xs font-semibold" style={{ background: `var(--${name})`, color: on ? `var(--${on})` : "var(--foreground)" }}>Aa</span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{label}</span><span dir="ltr" className="block text-xs text-muted-foreground">{hex ?? "—"}</span></span>
      {ratio ? <Badge tone={ratio >= 4.5 ? "success" : "danger"}>{t.aa} {formatNumber(ratio, 1)}:1</Badge> : null}
    </li>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return <section aria-labelledby={id} className="flex flex-col gap-4"><h2 id={id} className="border-b border-border pb-2 text-lg font-semibold">{title}</h2>{children}</section>;
}

function Gallery() {
  const t = usePreviewText(); const { language } = useLanguage();
  const [type, setType] = useState("0"); const [seg, setSeg] = useState("0"); const [modal, setModal] = useState(false);
  const [items, setItems] = useState([{ id: "u1", name: "schedule_phase1.xer", size: 12_400_000, status: "uploading" as const, progress: 62 }, { id: "u2", name: "boq.xlsx", size: 3_150_000, status: "done" as const }]);
  const rows = t.rows.map((name, index) => ({ id: String(index), name, qty: [1250, 8400.5, 312][index], status: index }));
  const tone = ["success", "danger", "info"] as const;
  return (
    <div className="flex flex-col gap-8">
      <Section id="g-buttons" title={t.buttons}><div className="flex flex-wrap items-center gap-3">
        <Button>{t.primaryBtn}</Button><Button variant="secondary">{t.secondaryBtn}</Button><Button variant="ghost">{t.ghostBtn}</Button><Button variant="danger">{t.dangerBtn}</Button>
        <Button loading>{t.loadingBtn}</Button><Button disabled>{t.disabledBtn}</Button><Button size="sm">{t.primaryBtn}</Button><Button size="lg">{t.primaryBtn}</Button>
      </div></Section>
      <Section id="g-fields" title={t.fields}><div className="grid gap-5 md:grid-cols-2">
        <Field label={t.fieldName} hint={t.fieldHint} required>{props => <TextInput {...props} defaultValue={t.crumbItems[1]} />}</Field>
        <Field label={t.fieldCode} error={t.fieldError} required>{props => <TextInput {...props} dir="ltr" invalid defaultValue="PRJ-001" />}</Field>
        <Field label={t.select}>{props => <Select {...props} value={type} onValueChange={setType} options={t.options.map((label, index) => ({ value: String(index), label }))} />}</Field>
        <Field label={t.fieldNote} optional>{props => <TextArea {...props} rows={3} />}</Field>
        <Field label={t.seg}>{() => <Segmented label={t.seg} value={seg} onValueChange={setSeg} options={t.segOptions.map((label, index) => ({ value: String(index), label }))} />}</Field>
      </div></Section>
      <Section id="g-upload" title={t.upload}><FileDropzone accept={[".xer", ".xlsx", ".csv"]} maxBytes={50 * 1024 * 1024} items={items} onFiles={files => setItems(list => [...list, { id: `n${list.length}`, name: files[0].name, size: files[0].size, status: "done" }])} onRemove={id => setItems(list => list.filter(item => item.id !== id))} /></Section>
      <Section id="g-stepper" title={t.stepper}><Stepper label={t.stepper} current={1} steps={t.steps.map((label, index) => ({ id: String(index), label }))} /></Section>
      <Section id="g-cards" title={t.cards}><div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><CardTitle>{t.cardTitle}</CardTitle></CardHeader><CardBody><p className="text-sm text-muted-foreground">{t.cardBody}</p></CardBody><CardFooter><Button size="sm" variant="secondary">{t.cardAction}</Button></CardFooter></Card>
        <Card><CardBody className="flex items-center justify-between"><div><p className="text-xs text-muted-foreground">{t.colQty}</p><p className="text-2xl font-semibold tabular-nums">{formatNumber(12480)}</p></div><Badge tone="success">{t.statusDone}</Badge></CardBody></Card></div></Section>
      <Section id="g-table" title={t.table}><DataTable caption={t.tableCaption} rowKey={row => String(row.id)} rows={rows} columns={[{ key: "name", header: t.colItem }, { key: "qty", header: t.colQty, numeric: true, render: row => formatNumber(Number(row.qty), 2) }, { key: "status", header: t.colStatus, render: row => <Badge tone={tone[Number(row.status)]}>{[t.statusDone, t.statusLate, t.statusOpen][Number(row.status)]}</Badge> }]} /></Section>
      <Section id="g-badges" title={t.badges}><div className="flex flex-wrap gap-2"><Badge>{language === "en" ? "Neutral" : t.primaryBtn}</Badge><Badge tone="primary">{t.primary}</Badge><Badge tone="success">{t.success}</Badge><Badge tone="warning">{t.warning}</Badge><Badge tone="danger">{t.error}</Badge><Badge tone="info">{t.info}</Badge></div></Section>
      <Section id="g-empty" title={t.empty}><EmptyState title={t.emptyTitle} line={t.emptyLine} action={<Button>{t.emptyAction}</Button>} /></Section>
      <Section id="g-skeleton" title={t.skeleton}><SkeletonRows rows={3} /></Section>
      <Section id="g-toast" title={t.toast}><div><Button variant="secondary" onClick={() => notify.success(t.toastDone, t.toastLine)}>{t.toastBtn}</Button></div></Section>
      <Section id="g-modal" title={t.modal}><div><Button variant="danger" onClick={() => setModal(true)}>{t.modalBtn}</Button></div><Modal open={modal} onOpenChange={setModal} title={t.modalTitle} line={t.modalLine} danger confirmLabel={t.modalConfirm} onConfirm={() => { setModal(false); notify.info(t.toastDone); }} /></Section>
      <Section id="g-intro" title={t.intro}><Card><CardBody><PageIntro title={t.introTitle} summary={t.introSummary} details={t.introDetails} /></CardBody></Card></Section>
      <Section id="g-crumbs" title={t.crumbs}><Breadcrumbs items={[{ label: t.crumbItems[0], href: "#" }, { label: t.crumbItems[1], href: "#" }, { label: t.crumbItems[2] }]} onNavigate={() => undefined} /></Section>
    </div>
  );
}

function Frame({ direction, mode, screen, width, height, scale, language, label }: { direction: DirectionId; mode: Mode; screen: "setup" | "import"; width: number; height: number; scale: number; language: string; label: string }) {
  const t = usePreviewText();
  const src = `/design-preview/frame/${direction}/${screen}?lang=${language}&mode=${mode}`;
  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <figcaption className="flex items-center justify-between text-xs text-muted-foreground"><span>{label}</span><a href={src} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">{t.openFull}<ArrowUpRight className="h-3 w-3 rtl:-scale-x-100" aria-hidden="true" /></a></figcaption>
      <div className="overflow-auto rounded-[var(--radius)] border border-border bg-muted" style={{ maxWidth: "100%" }}>
        <div style={{ width: width * scale, height: height * scale }}><iframe title={`${label}`} src={src} width={width} height={height} className="origin-top-left border-0 bg-background" style={{ transform: `scale(${scale})` }} /></div>
      </div>
    </figure>
  );
}

function Preview({ direction, mode }: { direction: DirectionId; mode: Mode }) {
  const t = usePreviewText(); const { language } = useLanguage();
  const names = useMemo(() => ["primary", "primary-foreground", "secondary", "secondary-foreground", "background", "foreground", "card", "muted", "muted-foreground", "border", "input", "success", "success-foreground", "warning", "warning-foreground", "destructive", "destructive-foreground", "info", "info-foreground", "accent", "accent-foreground"], []);
  const { hexes, ref } = useTokenHex(names);
  return (
    <div ref={ref} className="flex flex-col gap-10">
      <Section id="s-identity" title={t.identity}>
        <p className="text-sm text-muted-foreground">{pickLanguage(language, taglines[direction])}</p>
        <div className="grid gap-4 md:grid-cols-3">
          <Card><CardHeader><CardTitle>{t.symbol}</CardTitle></CardHeader><CardBody className="flex items-center justify-center py-8"><Logo variant="symbol" size={72} /></CardBody></Card>
          <Card><CardHeader><CardTitle>{t.horizontal}</CardTitle></CardHeader><CardBody className="flex items-center justify-center py-8"><Logo variant="horizontal" size={44} /></CardBody></Card>
          <Card><CardHeader><CardTitle>{t.stacked}</CardTitle></CardHeader><CardBody className="flex items-center justify-center py-8"><Logo variant="stacked" size={44} /></CardBody></Card>
        </div>
        <div className="flex items-center gap-4 rounded-[var(--radius)] bg-hero p-5 text-hero-foreground"><Logo variant="horizontal" size={36} className="[&_span]:!text-hero-foreground" /><span className="text-sm opacity-80">{t.logo}</span></div>
      </Section>
      <Section id="s-colors" title={t.colors}>
        <div><h3 className="mb-2 text-sm font-semibold text-muted-foreground">{t.primary} / {t.complement}</h3><ul className="grid gap-2 sm:grid-cols-2"><Swatch name="primary" on="primary-foreground" label={t.primary} hexes={hexes} /><Swatch name="secondary" on="secondary-foreground" label={t.complement} hexes={hexes} /></ul></div>
        <div><h3 className="mb-2 text-sm font-semibold text-muted-foreground">{t.neutrals}</h3><ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3"><Swatch name="background" on="foreground" label="background" hexes={hexes} /><Swatch name="card" on="foreground" label="card" hexes={hexes} /><Swatch name="muted" on="muted-foreground" label="muted" hexes={hexes} /><Swatch name="border" label="border" hexes={hexes} /><Swatch name="input" on="card" label="input (3:1)" hexes={hexes} /><Swatch name="accent" on="accent-foreground" label="accent" hexes={hexes} /></ul></div>
        <div><h3 className="mb-2 text-sm font-semibold text-muted-foreground">{t.states}</h3><ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4"><Swatch name="success" on="success-foreground" label={t.success} hexes={hexes} /><Swatch name="warning" on="warning-foreground" label={t.warning} hexes={hexes} /><Swatch name="destructive" on="destructive-foreground" label={t.error} hexes={hexes} /><Swatch name="info" on="info-foreground" label={t.info} hexes={hexes} /></ul></div>
      </Section>
      <Section id="s-fonts" title={t.fonts}>
        <div className="grid gap-4 md:grid-cols-3">
          <Card><CardBody className="flex flex-col gap-2"><p className="text-xs text-muted-foreground">العربية — {fontNames[direction].ar}</p><p dir="rtl" lang="ar" className="text-2xl font-semibold" style={{ fontFamily: "var(--font-ar)" }}>{t.sampleAr}</p><p dir="rtl" lang="ar" className="text-sm" style={{ fontFamily: "var(--font-ar)" }}>{"لوحة المؤشرات والتقارير ومتابعة الإنجاز"}</p></CardBody></Card>
          <Card><CardBody className="flex flex-col gap-2"><p className="text-xs text-muted-foreground">English — {fontNames[direction].lat}</p><p dir="ltr" lang="en" className="text-2xl font-semibold" style={{ fontFamily: "var(--font-lat)" }}>{t.sampleEn}</p><p dir="ltr" lang="en" className="text-sm" style={{ fontFamily: "var(--font-lat)" }}>Dashboards, reports and progress tracking</p></CardBody></Card>
          <Card><CardBody className="flex flex-col gap-2"><p className="text-xs text-muted-foreground">اردو — {fontNames[direction].ur}</p><p dir="rtl" lang="ur" className="text-xl font-semibold" style={{ fontFamily: "var(--font-ur)", lineHeight: 1.95 }}>{t.sampleUr}</p></CardBody></Card>
        </div>
      </Section>
      <Section id="s-components" title={t.components}><Gallery /></Section>
      <Section id="s-screens" title={t.screens}>
        {(["setup", "import"] as const).map(screen => (
          <div key={screen} className="flex flex-col gap-3"><h3 className="text-base font-semibold">{screen === "setup" ? t.setupScreen : t.importScreen}</h3>
            <div className="grid items-start gap-5 xl:grid-cols-[auto_minmax(0,1fr)]"><Frame direction={direction} mode={mode} screen={screen} width={390} height={844} scale={0.8} language={language} label={t.phone} /><Frame direction={direction} mode={mode} screen={screen} width={1280} height={800} scale={0.62} language={language} label={t.desktop} /></div>
          </div>))}
      </Section>
    </div>
  );
}

export default function DesignPreview() {
  const { user, loading } = useAuth(); const { language, setLanguage } = useLanguage(); const t = usePreviewText();
  const initial = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const [direction, setDirection] = useState<DirectionId>(["a", "b", "c"].includes(initial.get("d") ?? "") ? (initial.get("d") as DirectionId) : "a");
  const [mode, setMode] = useState<Mode>(initial.get("mode") === "dark" ? "dark" : "light");
  if (loading) return <main className="p-8"><p role="status">…</p></main>;
  if (user?.role !== "admin") return <main className="min-h-screen bg-background p-8 text-foreground"><div className="mx-auto max-w-xl"><EmptyState title={t.ownerOnly} line={t.summary} action={<Link href="/" className="font-semibold text-primary">{t.back}</Link>} /></div></main>;
  const darkOk = DIRECTIONS[direction].darkMode;
  return (
    <DirectionProvider direction={direction} mode={mode}>
      <div className="min-h-screen bg-background text-foreground">
        <header className="sticky top-0 z-30 border-b border-border bg-card/95 backdrop-blur">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
            <div className="flex items-center gap-3"><Logo variant="horizontal" size={30} /><span className="hidden text-sm text-muted-foreground sm:inline">{t.title}</span></div>
            <div className="flex flex-wrap items-center gap-3">
              <Segmented label={t.direction} value={direction} onValueChange={value => setDirection(value as DirectionId)} options={(["a", "b", "c"] as const).map(id => ({ value: id, label: `${id.toUpperCase()} · ${pickLanguage(language, DIRECTIONS[id].name)}` }))} />
              <Segmented label={t.mode} value={darkOk ? mode : "light"} onValueChange={value => darkOk && setMode(value as Mode)} options={[{ value: "light", label: t.light }, { value: "dark", label: darkOk ? t.dark : `${t.dark} ✕` }]} />
              <Segmented label={t.language} value={language} onValueChange={value => setLanguage(value as typeof language)} options={LANGUAGES.map(code => ({ value: code, label: LANGUAGE_NAMES[code] }))} />
            </div>
          </div>
        </header>
        <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8">
          <PageIntro title={t.title} summary={t.summary} details={darkOk ? undefined : t.noDark} />
          <Preview direction={direction} mode={mode} />
        </main>
        <Toaster />
      </div>
    </DirectionProvider>
  );
}
