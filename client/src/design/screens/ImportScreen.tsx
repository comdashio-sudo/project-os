import React, { useEffect, useRef, useState } from "react";
import { Badge, Button, Card, CardBody, CardFooter, CardHeader, CardTitle, DataTable, EmptyState, Field, FileDropzone, PageIntro, Segmented, Select, SkeletonRows, formatNumber, notify, type UploadItem } from "@/components/ds";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { DemoShell, useDemoNames } from "./demoShell";

// The data-import screen, redrawn with the shared components on synthetic data: a real drag-and-drop area (no "Choose File"), progress, a validation summary and an issues table.
const dictionary = {
  ar: {
    title: "استيراد البيانات", summary: "ارفع جدولك الزمني أو قوالب البيانات، وراجع النتيجة قبل أن يُكتب أي شيء.", details: "تُفحص الملفات وتُعرض عليك أولاً. لا يُكتب شيء في المشروع إلا بعد ضغط «استيراد»، ويمكنك الإلغاء في أي لحظة.",
    source: "نوع المصدر", sources: ["Primavera XER", "Excel", "CSV"], project: "المشروع", cardTitle: "الملف", validation: "نتيجة الفحص",
    valid: "صفوف سليمة", warnings: "تحذيرات", errors: "أخطاء", issuesCaption: "الصفوف التي تحتاج انتباهاً", row: "الصف", field: "الحقل", issue: "المشكلة", level: "المستوى",
    levelWarn: "تحذير", levelError: "خطأ", cancel: "إلغاء", doImport: "استيراد", analyzing: "جارٍ فحص الملف", emptyTitle: "لم تُرفع أي بيانات بعد", emptyLine: "ارفع ملفاً لتظهر نتيجة الفحص هنا.",
    started: "بدأ الاستيراد", startedLine: "ستصلك رسالة عند الانتهاء.", crumbProject: "المشروع", crumbImport: "استيراد البيانات", ok: "سليم",
    issues: [["الوزن", "قيمة غير رقمية"], ["تاريخ البدء", "بعد تاريخ الانتهاء"], ["الرمز", "مكرر في الملف"], ["الكمية", "فارغة"]],
  },
  en: {
    title: "Import data", summary: "Upload your schedule or the data templates, and review the result before anything is written.", details: "Files are checked and shown to you first. Nothing is written to the project until you press Import, and you can cancel at any time.",
    source: "Source type", sources: ["Primavera XER", "Excel", "CSV"], project: "Project", cardTitle: "File", validation: "Check result",
    valid: "Valid rows", warnings: "Warnings", errors: "Errors", issuesCaption: "Rows that need attention", row: "Row", field: "Field", issue: "Problem", level: "Level",
    levelWarn: "Warning", levelError: "Error", cancel: "Cancel", doImport: "Import", analyzing: "Checking the file", emptyTitle: "No data uploaded yet", emptyLine: "Upload a file and the check result appears here.",
    started: "Import started", startedLine: "You will get a message when it finishes.", crumbProject: "Project", crumbImport: "Import data", ok: "Valid",
    issues: [["Weight", "Not a number"], ["Start date", "After the finish date"], ["Code", "Repeated in the file"], ["Quantity", "Empty"]],
  },
  ur: {
    title: "ڈیٹا درآمد", summary: "اپنا شیڈول یا ڈیٹا ٹیمپلیٹس اپ لوڈ کریں اور کچھ لکھے جانے سے پہلے نتیجہ دیکھیں۔", details: "فائلیں پہلے جانچی جاتی ہیں اور آپ کو دکھائی جاتی ہیں۔ «درآمد» دبانے تک پروجیکٹ میں کچھ نہیں لکھا جاتا، اور آپ کسی بھی وقت منسوخ کر سکتے ہیں۔",
    source: "ماخذ کی قسم", sources: ["Primavera XER", "Excel", "CSV"], project: "پروجیکٹ", cardTitle: "فائل", validation: "جانچ کا نتیجہ",
    valid: "درست صفیں", warnings: "انتباہات", errors: "غلطیاں", issuesCaption: "توجہ طلب صفیں", row: "صف", field: "خانہ", issue: "مسئلہ", level: "سطح",
    levelWarn: "انتباہ", levelError: "غلطی", cancel: "منسوخ", doImport: "درآمد", analyzing: "فائل جانچی جا رہی ہے", emptyTitle: "ابھی کوئی ڈیٹا اپ لوڈ نہیں ہوا", emptyLine: "فائل اپ لوڈ کریں تو جانچ کا نتیجہ یہاں نظر آئے گا۔",
    started: "درآمد شروع ہو گئی", startedLine: "مکمل ہونے پر آپ کو پیغام ملے گا۔", crumbProject: "پروجیکٹ", crumbImport: "ڈیٹا درآمد", ok: "درست",
    issues: [["وزن", "عدد نہیں ہے"], ["آغاز کی تاریخ", "اختتام کی تاریخ کے بعد"], ["کوڈ", "فائل میں دہرایا گیا"], ["مقدار", "خالی"]],
  },
};

type Phase = "empty" | "analyzing" | "ready";
function ImportBody({ initial }: { initial: Phase }) {
  const t = pickLanguage(useLanguage().language, dictionary); const n = useDemoNames();
  const [source, setSource] = useState("0"); const [project, setProject] = useState("p1"); const [phase, setPhase] = useState<Phase>(initial);
  const [items, setItems] = useState<UploadItem[]>(initial === "empty" ? [] : [{ id: "f1", name: "schedule_phase1.xer", size: 12_400_000, status: "done" }, { id: "f2", name: "boq_templates.xlsx", size: 3_150_000, status: "uploading", progress: 62 }]);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);
  const upload = (files: File[]) => {
    const file = files[0]; const id = `up-${Date.now()}`;
    setItems([{ id, name: file.name, size: file.size, status: "uploading", progress: 0 }]); setPhase("analyzing");
    let progress = 0;
    timer.current = setInterval(() => { progress += 20; setItems(list => list.map(item => item.id === id ? { ...item, progress: Math.min(progress, 100), status: progress >= 100 ? "done" : "uploading" } : item)); if (progress >= 100) { if (timer.current) clearInterval(timer.current); setPhase("ready"); } }, 350);
  };
  const rows = t.issues.map(([field, issue], index) => ({ id: `r${index}`, row: [48, 112, 230, 305][index], field, issue, error: index === 1 }));
  return (
    <div className="flex flex-col gap-6">
      <PageIntro title={t.title} summary={t.summary} details={t.details} />
      <Card>
        <CardHeader><CardTitle>{t.cardTitle}</CardTitle></CardHeader>
        <CardBody className="flex flex-col gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5"><span className="text-sm font-medium">{t.source}</span><Segmented label={t.source} value={source} onValueChange={setSource} options={t.sources.map((label, index) => ({ value: String(index), label }))} /></div>
            <Field label={t.project}>{props => <Select {...props} value={project} onValueChange={setProject} options={[{ value: "p1", label: n.phase1 }, { value: "p2", label: n.phase2 }]} />}</Field>
          </div>
          <FileDropzone accept={[".xer", ".xlsx", ".csv"]} maxBytes={50 * 1024 * 1024} items={items} onFiles={upload} onRemove={id => { setItems(list => list.filter(item => item.id !== id)); if (items.length <= 1) setPhase("empty"); }} />
        </CardBody>
      </Card>
      <Card>
        <CardHeader><CardTitle>{t.validation}</CardTitle></CardHeader>
        <CardBody className="flex flex-col gap-5">
          {phase === "empty" ? <EmptyState title={t.emptyTitle} line={t.emptyLine} /> : null}
          {phase === "analyzing" ? <SkeletonRows rows={3} label={t.analyzing} /> : null}
          {phase === "ready" ? <>
            <dl className="grid grid-cols-3 gap-3">
              {[[t.valid, 1240, "success"], [t.warnings, 12, "warning"], [t.errors, 3, "danger"]].map(([label, value, tone]) => <div key={String(label)} className="rounded-[var(--radius)] border border-border p-3"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 flex items-center gap-2 text-xl font-semibold tabular-nums">{formatNumber(Number(value))}<Badge tone={tone as "success" | "warning" | "danger"} className="hidden sm:inline-flex">{tone === "success" ? t.ok : tone === "warning" ? t.levelWarn : t.levelError}</Badge></dd></div>)}
            </dl>
            <DataTable caption={t.issuesCaption} rowKey={row => String(row.id)} rows={rows}
              columns={[{ key: "row", header: t.row, numeric: true, render: row => formatNumber(Number(row.row)) }, { key: "field", header: t.field }, { key: "issue", header: t.issue }, { key: "level", header: t.level, render: row => <Badge tone={row.error ? "danger" : "warning"}>{row.error ? t.levelError : t.levelWarn}</Badge> }]} />
          </> : null}
        </CardBody>
        <CardFooter><Button variant="ghost">{t.cancel}</Button><Button disabled={phase !== "ready"} onClick={() => notify.success(t.started, t.startedLine)}>{t.doImport}</Button></CardFooter>
      </Card>
    </div>
  );
}

export function ImportScreen({ initial = "ready" }: { initial?: Phase }) {
  const t = pickLanguage(useLanguage().language, dictionary); const n = useDemoNames();
  return <DemoShell activeId="import" crumbs={[n.phase1, t.crumbImport]}><ImportBody initial={initial} /></DemoShell>;
}
