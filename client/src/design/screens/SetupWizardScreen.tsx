import React, { useState } from "react";
import { CheckCircle2, Circle } from "lucide-react";
import { Badge, Button, Card, CardBody, CardFooter, CardHeader, CardTitle, Field, PageIntro, Select, Stepper, TextInput, notify } from "@/components/ds";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { DemoShell, useDemoNames } from "./demoShell";

// The setup wizard, redrawn with the shared components on synthetic data. The old screen's wording (a numbered title such as "2. First project", a paragraph above every step) is
// replaced by one line and a "Learn more"; the figures are Western digits in every language.
const dictionary = {
  ar: {
    title: "معالج الإعداد", summary: "أنشئ مشروعك الأول، ثم استورد بياناته وادعُ فريقك.", details: "كل خطوة تُحفظ فور إتمامها، فيمكنك المتابعة لاحقاً من حيث توقفت. الاستيراد والدعوات اختياريان الآن.",
    stepsLabel: "خطوات الإعداد", company: "الشركة", project: "أول مشروع", import: "الاستيراد", invite: "دعوة الفريق",
    cardTitle: "أول مشروع", name: "اسم المشروع", nameHint: "يظهر في القوائم والتقارير.", code: "رمز المشروع", codeHint: "حروف لاتينية وأرقام، مثل PRJ-001.", codeError: "رمز المشروع مطلوب.",
    type: "نوع المشروع", types: ["سكني", "تجاري", "بنية تحتية"], start: "تاريخ البدء", location: "الموقع", locationPlaceholder: "المدينة أو الحي",
    back: "السابق", draft: "حفظ كمسودة", next: "التالي", saved: "حُفظ المشروع", savedLine: "انتقل إلى خطوة الاستيراد.",
    summaryTitle: "ملخص", planTitle: "الخطة", planBadge: "تجريبية: 14 يوماً", checks: ["تم إنشاء الشركة", "المشروع قيد الإنشاء", "الاستيراد لم يبدأ", "لم تُرسل دعوات"],
    crumbSetup: "الإعداد", crumbProject: "أول مشروع",
  },
  en: {
    title: "Setup wizard", summary: "Create your first project, then import its data and invite your team.", details: "Each step is saved as soon as it is done, so you can carry on later from where you stopped. Importing and inviting are optional for now.",
    stepsLabel: "Setup steps", company: "Company", project: "First project", import: "Import", invite: "Invite team",
    cardTitle: "First project", name: "Project name", nameHint: "Shown in lists and reports.", code: "Project code", codeHint: "Latin letters and digits, such as PRJ-001.", codeError: "The project code is required.",
    type: "Project type", types: ["Residential", "Commercial", "Infrastructure"], start: "Start date", location: "Location", locationPlaceholder: "City or district",
    back: "Back", draft: "Save as draft", next: "Next", saved: "Project saved", savedLine: "Continue to the import step.",
    summaryTitle: "Summary", planTitle: "Plan", planBadge: "Trial: 14 days", checks: ["Company created", "Project being created", "Import not started", "No invitations sent"],
    crumbSetup: "Setup", crumbProject: "First project",
  },
  ur: {
    title: "سیٹ اپ وزرڈ", summary: "اپنا پہلا پروجیکٹ بنائیں، پھر اس کا ڈیٹا درآمد کریں اور ٹیم کو مدعو کریں۔", details: "ہر مرحلہ مکمل ہوتے ہی محفوظ ہو جاتا ہے، اس لیے آپ بعد میں وہیں سے جاری رکھ سکتے ہیں۔ درآمد اور دعوتیں فی الحال اختیاری ہیں۔",
    stepsLabel: "سیٹ اپ کے مراحل", company: "کمپنی", project: "پہلا پروجیکٹ", import: "درآمد", invite: "ٹیم کو دعوت",
    cardTitle: "پہلا پروجیکٹ", name: "پروجیکٹ کا نام", nameHint: "فہرستوں اور رپورٹوں میں نظر آتا ہے۔", code: "پروجیکٹ کوڈ", codeHint: "لاطینی حروف اور ہندسے، مثلاً PRJ-001۔", codeError: "پروجیکٹ کوڈ ضروری ہے۔",
    type: "پروجیکٹ کی قسم", types: ["رہائشی", "تجارتی", "انفراسٹرکچر"], start: "آغاز کی تاریخ", location: "مقام", locationPlaceholder: "شہر یا علاقہ",
    back: "پیچھے", draft: "مسودے کے طور پر محفوظ کریں", next: "اگلا", saved: "پروجیکٹ محفوظ ہو گیا", savedLine: "درآمد کے مرحلے پر جائیں۔",
    summaryTitle: "خلاصہ", planTitle: "پلان", planBadge: "آزمائشی: 14 دن", checks: ["کمپنی بن گئی", "پروجیکٹ بن رہا ہے", "درآمد شروع نہیں ہوئی", "کوئی دعوت نہیں بھیجی گئی"],
    crumbSetup: "سیٹ اپ", crumbProject: "پہلا پروجیکٹ",
  },
};

function Wizard() {
  const t = pickLanguage(useLanguage().language, dictionary); const n = useDemoNames();
  const [name, setName] = useState(n.phase1); const [code, setCode] = useState(""); const [type, setType] = useState("0"); const [location, setLocation] = useState("");
  const [codeError, setCodeError] = useState<string | undefined>(); const [saving, setSaving] = useState(false);
  const next = () => {
    if (!code.trim()) { setCodeError(t.codeError); return; }
    setCodeError(undefined); setSaving(true);
    setTimeout(() => { setSaving(false); notify.success(t.saved, t.savedLine); }, 700);
  };
  return (
    <div className="flex flex-col gap-6">
      <PageIntro title={t.title} summary={t.summary} details={t.details} />
      <Stepper label={t.stepsLabel} current={1} steps={[{ id: "company", label: t.company }, { id: "project", label: t.project }, { id: "import", label: t.import }, { id: "invite", label: t.invite }]} />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Card>
          <CardHeader><CardTitle>{t.cardTitle}</CardTitle></CardHeader>
          <CardBody className="grid gap-5 sm:grid-cols-2">
            <Field label={t.name} hint={t.nameHint} required className="sm:col-span-2">{props => <TextInput {...props} value={name} onChange={event => setName(event.target.value)} />}</Field>
            <Field label={t.code} hint={t.codeHint} error={codeError} required>{props => <TextInput {...props} dir="ltr" placeholder="PRJ-001" invalid={Boolean(codeError)} value={code} onChange={event => { setCode(event.target.value); if (codeError) setCodeError(undefined); }} />}</Field>
            <Field label={t.type}>{props => <Select {...props} value={type} onValueChange={setType} options={t.types.map((label, index) => ({ value: String(index), label }))} />}</Field>
            <Field label={t.start}>{props => <TextInput {...props} type="date" defaultValue="2026-11-01" />}</Field>
            <Field label={t.location} optional>{props => <TextInput {...props} placeholder={t.locationPlaceholder} value={location} onChange={event => setLocation(event.target.value)} />}</Field>
          </CardBody>
          <CardFooter className="justify-between"><Button variant="ghost">{t.back}</Button><div className="flex flex-wrap gap-2"><Button variant="secondary">{t.draft}</Button><Button loading={saving} onClick={next}>{t.next}</Button></div></CardFooter>
        </Card>
        <Card as="aside">
          <CardHeader><CardTitle>{t.summaryTitle}</CardTitle></CardHeader>
          <CardBody className="flex flex-col gap-4">
            <div><p className="text-xs text-muted-foreground">{t.planTitle}</p><Badge tone="info" className="mt-1">{t.planBadge}</Badge></div>
            <ul className="flex flex-col gap-2.5 text-sm">{t.checks.map((label, index) => <li key={label} className="flex items-center gap-2">{index === 0 ? <CheckCircle2 className="h-4 w-4 text-success" aria-hidden="true" /> : <Circle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}<span className={index === 0 ? "" : "text-muted-foreground"}>{label}</span></li>)}</ul>
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

export function SetupWizardScreen() {
  const t = pickLanguage(useLanguage().language, dictionary);
  return <DemoShell activeId="setup" crumbs={[t.crumbSetup, t.crumbProject]}><Wizard /></DemoShell>;
}
