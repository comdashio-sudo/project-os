import { Button } from "@/components/ui/button";
import { CameraCapture, Select } from "@/components/ds";
import { FieldShell, fieldInput, showDate, tap } from "@/components/FieldShell";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { useCan, WriteGate } from "@/lib/permissions";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { useDirectUpload } from "@/lib/useDirectUpload";
import { CheckedForm } from "@/components/CheckedForm";
import { SourceNotice } from "@/components/SectionResilience";
import { LockedNote, ReportSection } from "@/components/dailyReport/ReportSection";
import { emptySections, HseSection, hseSummary, MaterialsSection, ObstaclesSection, sectionProblems, sectionsBody, sectionsFrom, TomorrowSection, useSectionText, type Sections } from "@/components/dailyReport/ReportSections";
import { formatWeekday } from "@/components/ds";
import React, { useMemo, useState } from "react";
import { useParams } from "wouter";

// The daily site report on the phone (work order 14, item 1). The site engineer writes it in four short parts — the day, the people and equipment, the work done per
// unit and activity, the photos — and sends it; the project manager sees what approving would move, then approves or sends it back with a reason. Nothing here
// computes progress: the server moves the cells when the report is approved, and says which lines it left alone and why.
// "None" in a list: the custom list (Radix) cannot hold an empty value, so it carries this one and the screen reads it as empty.
const NONE = "__none";
const text = {
  ar: {
    header: "الرأس", weekday: "اليوم", windHours: "الرياح وساعات العمل", inspections: "الفحوصات (WIR/RFI)", materials: "المواد المستلمة", hse: "السلامة (HSE)", tomorrow: "خطة الغد", approval: "الاعتماد", pickRole: "اختر الدور", pickEquipment: "اختر المعدة", noRoles: "لا أدوار عمالة في قائمة المشروع بعد.", seedRoles: "انسخ القائمة الافتراضية", seeded: "أُضيفت الأدوار الافتراضية", noEquipment: "لا معدات في سجل المشروع بعد.", askManager: "يضيفها مدير المشروع.", workers: (n: number) => `المجموع: ${n === 1 ? "عامل واحد" : n === 2 ? "عاملان" : n >= 3 && n <= 10 ? `${n} عمال` : `${n} عاملًا`}`, units: (n: number) => `المجموع: ${n}`, lineCount: (n: number) => `${n} سطر`, matrix: "مصفوفة الشركات والأدوار ونسخ الأمس", statusNow: "حالة التقرير", chain: "سلسلة أعدّه ← راجعه ← اعتمده", 
    title: "التقرير اليومي", back: "العودة إلى الإدخال السريع", loading: "جارٍ التحميل…", retry: "إعادة المحاولة",
    day: "يوم العمل", weather: "الطقس", temperature: "الحرارة (°م)", summary: "ملخص اليوم", obstacles: "العوائق",
    weatherClear: "صافٍ", weatherCloudy: "غائم", weatherRain: "مطر", weatherDust: "غبار", weatherHot: "حرارة شديدة", weatherWindy: "رياح",
    labour: "العمالة", equipment: "المعدات", work: "الأعمال المنفذة", addLabour: "إضافة عمالة", addEquipment: "إضافة معدة", addWork: "إضافة عمل",
    trade: "المهنة", machine: "المعدة", count: "العدد", hours: "الساعات", unit: "رقم الوحدة", activity: "النشاط", pickActivity: "اختر النشاط", status: "الحالة بعد العمل", notes: "ملاحظات", remove: "حذف",
    unitUnknown: "لا وحدة بهذا الرقم في المشروع", forActivity: "لهذا النشاط (اختياري)", none: "بلا نشاط",
    inProgress: "قيد التنفيذ", underReview: "قيد المراجعة", complete: "مكتمل",
    save: "حفظ المسودة", saving: "جارٍ الحفظ…", saved: "حُفظت المسودة", submit: "إرسال للاعتماد", submitting: "جارٍ الإرسال…", submitted: "أُرسل التقرير للاعتماد",
    photos: "الصور", takePhoto: "التقاط صورة", photoNeedsSave: "احفظ المسودة أولًا ثم أضف الصور.", photoAdded: "أُضيفت الصورة", noPhotos: "لا صور بعد.", uploading: "جارٍ الرفع…",
    recent: "تقارير حديثة", noReports: "لا تقارير بعد.", open: "فتح", edit: "تعديل", view: "عرض", draft: "مسودة", pending: "بانتظار الاعتماد", approved: "معتمد", rejected: "أُعيد للتعديل",
    rejectedNote: "سبب الإعادة", locked: "هذا التقرير مُرسَل أو معتمد ولا يُعدَّل.", newReport: "تقرير جديد",
    review: "اعتماد التقارير", reviewHint: "تقارير بانتظار اعتمادك.", nothingToReview: "لا تقارير بانتظار الاعتماد.", preview: "ماذا سيتحرك؟", approve: "اعتماد", reject: "إعادة للتعديل", reason: "السبب (إلزامي)",
    willMove: "ستتحرك هذه الخلايا", willSkip: "لن تتحرك (الخلية متقدمة أصلًا)", blocked: "تنبيه الجودة: لا فحص مقبول لهذه الخلايا", noMoves: "لا خلايا ستتحرك.", approvedDone: "اعتُمد التقرير وتحرك التقدم", rejectedDone: "أُعيد التقرير لكاتبه",
    noPermission: "دورك لا يتيح كتابة التقرير اليومي.", noReview: "اعتماد التقارير لمدير المشروع.", otherReports: "تقارير الآخرين",
  },
  en: {
    header: "Header", weekday: "Day", windHours: "Wind and working hours", inspections: "Inspections (WIR/RFI)", materials: "Materials received", hse: "Safety (HSE)", tomorrow: "Plan for tomorrow", approval: "Approval", pickRole: "Pick the role", pickEquipment: "Pick the equipment", noRoles: "The project has no labour roles yet.", seedRoles: "Copy the default list", seeded: "Default roles added", noEquipment: "The project has no equipment yet.", askManager: "The project manager adds them.", workers: (n: number) => `Total: ${n} workers`, units: (n: number) => `Total: ${n}`, lineCount: (n: number) => `${n} lines`, matrix: "Company × role matrix and copy from yesterday", statusNow: "Report status", chain: "Prepared → reviewed → approved chain", 
    title: "Daily report", back: "Back to quick entry", loading: "Loading…", retry: "Retry",
    day: "Work day", weather: "Weather", temperature: "Temperature (°C)", summary: "Summary of the day", obstacles: "Obstacles",
    weatherClear: "Clear", weatherCloudy: "Cloudy", weatherRain: "Rain", weatherDust: "Dust", weatherHot: "Extreme heat", weatherWindy: "Windy",
    labour: "Labour", equipment: "Equipment", work: "Work done", addLabour: "Add labour", addEquipment: "Add equipment", addWork: "Add work",
    trade: "Trade", machine: "Equipment", count: "Count", hours: "Hours", unit: "Unit number", activity: "Activity", pickActivity: "Pick the activity", status: "Status after the work", notes: "Notes", remove: "Remove",
    unitUnknown: "No unit with that number in this project", forActivity: "For this activity (optional)", none: "No activity",
    inProgress: "In progress", underReview: "Under review", complete: "Complete",
    save: "Save draft", saving: "Saving…", saved: "Draft saved", submit: "Send for approval", submitting: "Sending…", submitted: "The report was sent for approval",
    photos: "Photos", takePhoto: "Take a photo", photoNeedsSave: "Save the draft first, then add photos.", photoAdded: "Photo added", noPhotos: "No photos yet.", uploading: "Uploading…",
    recent: "Recent reports", noReports: "No reports yet.", open: "Open", edit: "Edit", view: "View", draft: "Draft", pending: "Awaiting approval", approved: "Approved", rejected: "Sent back",
    rejectedNote: "Why it was sent back", locked: "This report is sent or approved and cannot be edited.", newReport: "New report",
    review: "Approve reports", reviewHint: "Reports waiting for your approval.", nothingToReview: "No report is waiting for approval.", preview: "What will move?", approve: "Approve", reject: "Send back", reason: "Reason (required)",
    willMove: "These cells will move", willSkip: "These will not move (already further on)", blocked: "Quality warning: no accepted inspection for these cells", noMoves: "No cell will move.", approvedDone: "Report approved and progress moved", rejectedDone: "Report sent back to its writer",
    noPermission: "Your role does not allow writing the daily report.", noReview: "Approving reports belongs to the project manager.", otherReports: "Other people's reports",
  },
  ur: {
    header: "سرخی", weekday: "دن", windHours: "ہوا اور کام کے اوقات", inspections: "معائنے (WIR/RFI)", materials: "موصول شدہ مواد", hse: "حفاظت (HSE)", tomorrow: "کل کا منصوبہ", approval: "منظوری", pickRole: "کردار منتخب کریں", pickEquipment: "سازوسامان منتخب کریں", noRoles: "پروجیکٹ میں ابھی مزدوروں کے کردار نہیں۔", seedRoles: "پہلے سے طے شدہ فہرست نقل کریں", seeded: "پہلے سے طے شدہ کردار شامل ہو گئے", noEquipment: "پروجیکٹ میں ابھی کوئی سازوسامان نہیں۔", askManager: "پروجیکٹ مینیجر انہیں شامل کرتا ہے۔", workers: (n: number) => `کل: ${n} مزدور`, units: (n: number) => `کل: ${n}`, lineCount: (n: number) => `${n} سطریں`, matrix: "کمپنی × کردار میٹرکس اور کل سے نقل", statusNow: "رپورٹ کی حالت", chain: "تیار ← جائزہ ← منظوری کا سلسلہ", 
    title: "روزانہ رپورٹ", back: "فوری اندراج پر واپس", loading: "لوڈ ہو رہا ہے…", retry: "دوبارہ کوشش",
    day: "کام کا دن", weather: "موسم", temperature: "درجۂ حرارت (°C)", summary: "دن کا خلاصہ", obstacles: "رکاوٹیں",
    weatherClear: "صاف", weatherCloudy: "ابر آلود", weatherRain: "بارش", weatherDust: "گرد و غبار", weatherHot: "شدید گرمی", weatherWindy: "تیز ہوا",
    labour: "مزدور", equipment: "سازوسامان", work: "مکمل کیا گیا کام", addLabour: "مزدور شامل کریں", addEquipment: "سازوسامان شامل کریں", addWork: "کام شامل کریں",
    trade: "ہنر", machine: "سازوسامان", count: "تعداد", hours: "گھنٹے", unit: "یونٹ نمبر", activity: "سرگرمی", pickActivity: "سرگرمی منتخب کریں", status: "کام کے بعد کی حالت", notes: "نوٹس", remove: "حذف کریں",
    unitUnknown: "اس پروجیکٹ میں اس نمبر کا کوئی یونٹ نہیں", forActivity: "اس سرگرمی کے لیے (اختیاری)", none: "کوئی سرگرمی نہیں",
    inProgress: "جاری", underReview: "زیرِ جائزہ", complete: "مکمل",
    save: "مسودہ محفوظ کریں", saving: "محفوظ کیا جا رہا ہے…", saved: "مسودہ محفوظ ہو گیا", submit: "منظوری کے لیے بھیجیں", submitting: "بھیجا جا رہا ہے…", submitted: "رپورٹ منظوری کے لیے بھیج دی گئی",
    photos: "تصاویر", takePhoto: "تصویر لیں", photoNeedsSave: "پہلے مسودہ محفوظ کریں، پھر تصاویر شامل کریں۔", photoAdded: "تصویر شامل ہو گئی", noPhotos: "ابھی کوئی تصویر نہیں۔", uploading: "اپ لوڈ ہو رہا ہے…",
    recent: "حالیہ رپورٹس", noReports: "ابھی کوئی رپورٹ نہیں۔", open: "کھولیں", edit: "ترمیم", view: "دیکھیں", draft: "مسودہ", pending: "منظوری کے انتظار میں", approved: "منظور شدہ", rejected: "واپس بھیجی گئی",
    rejectedNote: "واپس بھیجنے کی وجہ", locked: "یہ رپورٹ بھیجی جا چکی ہے یا منظور ہے، اس میں ترمیم نہیں ہو سکتی۔", newReport: "نئی رپورٹ",
    review: "رپورٹس کی منظوری", reviewHint: "آپ کی منظوری کی منتظر رپورٹس۔", nothingToReview: "منظوری کی منتظر کوئی رپورٹ نہیں۔", preview: "کیا آگے بڑھے گا؟", approve: "منظور کریں", reject: "واپس بھیجیں", reason: "وجہ (لازمی)",
    willMove: "یہ خانے آگے بڑھیں گے", willSkip: "یہ آگے نہیں بڑھیں گے (پہلے ہی آگے ہیں)", blocked: "معیار کی تنبیہ: ان خانوں کا کوئی قبول شدہ معائنہ نہیں", noMoves: "کوئی خانہ آگے نہیں بڑھے گا۔", approvedDone: "رپورٹ منظور ہو گئی اور پیش رفت آگے بڑھی", rejectedDone: "رپورٹ لکھنے والے کو واپس بھیج دی گئی",
    noPermission: "آپ کا کردار روزانہ رپورٹ لکھنے کی اجازت نہیں دیتا۔", noReview: "رپورٹس کی منظوری پروجیکٹ مینیجر کا کام ہے۔", otherReports: "دوسروں کی رپورٹس",
  },
};

type Status = "NOT_STARTED" | "IN_PROGRESS" | "UNDER_REVIEW" | "COMPLETE";
type Line = { key: string; lineType: "labour" | "equipment" | "work"; label: string; quantity: string; hours: string; description: string; unitNumber: string; activityId: string; reportedStatus: Status };
const WEATHER = ["clear", "cloudy", "rain", "dust", "hot", "windy"] as const;
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const blank = (lineType: Line["lineType"]): Line => ({ key: crypto.randomUUID(), lineType, label: "", quantity: "", hours: "", description: "", unitNumber: "", activityId: "", reportedStatus: "IN_PROGRESS" });
const num = (value: string) => (value.trim() === "" || Number.isNaN(Number(value)) ? undefined : Number(value));

export default function SiteDailyReport() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { language } = useLanguage();
  const isArabic = language === "ar";
  const t = pickLanguage(language, text);
  const scope = { tenantId, projectId };
  const enabled = Boolean(tenantId && projectId);
  const utils = trpc.useUtils();
  const options = trpc.siteReports.options.useQuery(scope, { enabled });
  const list = trpc.siteReports.list.useQuery(scope, { enabled });
  const canWrite = useCan("project.field.manage", projectId);
  const canReview = useCan("project.manage", projectId);
  // D-44 (a), #233: the labour roles and the equipment the report chooses from (active ones only); the project manager can seed the default roles
  const roles = trpc.projects.labourRoles.list.useQuery(scope, { enabled });
  const machines = trpc.projects.equipment.list.useQuery(scope, { enabled });
  // the consultant's material approvals a received material may name (optional; a list that fails leaves the choice at «no approval»)
  const submittals = trpc.submittals.list.useQuery({ ...scope, submittalType: "material_approval" }, { enabled });
  const seedRoles = trpc.projects.labourRoles.seedDefaults.useMutation({ onSuccess: () => { setMessage(t.seeded); void roles.refetch(); } });

  const [reportId, setReportId] = useState<string | null>(null);
  const [locked, setLocked] = useState(false);
  const [rejectedNote, setRejectedNote] = useState<string | null>(null);
  const [date, setDate] = useState(today());
  const [weather, setWeather] = useState("");
  const [temperature, setTemperature] = useState("");
  const [summary, setSummary] = useState("");
  const [obstacles, setObstacles] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  // D-46 (2): sections 5 to 8 on the contract of D-45 (b)
  const [sections, setSections] = useState<Sections>(emptySections());
  const sectionText = useSectionText();
  const put = <K extends keyof Sections>(name: K) => (rows: Sections[K]) => setSections(current => ({ ...current, [name]: rows }));
  const [message, setMessage] = useState<string | null>(null);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);

  const units = options.data?.units ?? [];
  const activities = options.data?.activities ?? [];
  const unitOf = (number: string) => units.find(unit => String(unit.number) === number.trim());
  const detail = trpc.siteReports.get.useQuery({ ...scope, reportId: reportId ?? "" }, { enabled: enabled && Boolean(reportId) });
  const upload = useDirectUpload({ tenantId, projectId, purpose: "sitePhoto" });

  const save = trpc.siteReports.save.useMutation({
    onSuccess: result => { setReportId(result.id); setMessage(t.saved); void utils.siteReports.list.invalidate(); },
  });
  const submit = trpc.siteReports.submit.useMutation({
    onSuccess: () => { setLocked(true); setMessage(t.submitted); void utils.siteReports.list.invalidate(); },
  });
  const attach = trpc.siteReports.attachPhoto.useMutation({ onSuccess: () => { setPhotoMessage(t.photoAdded); void detail.refetch(); } });

  const problems = useMemo(() => lines.flatMap(line => {
    if (line.lineType === "work") return !unitOf(line.unitNumber) || !line.activityId ? [line.key] : [];
    return line.label.trim() === "" ? [line.key] : [];
  }).concat(sectionProblems(sections)), [lines, units, sections]); // eslint-disable-line react-hooks/exhaustive-deps

  const body = () => ({
    ...scope, reportDate: date, weather: weather || undefined, temperatureC: num(temperature), summary: summary.trim() || undefined, obstacles: obstacles.trim() || undefined,
    lines: lines.map(line => ({
      lineType: line.lineType, label: line.lineType === "work" ? undefined : line.label.trim(), quantity: line.lineType === "work" ? undefined : num(line.quantity), hours: line.lineType === "labour" ? num(line.hours) : undefined,
      description: line.description.trim() || undefined, pmcUnitId: line.lineType === "work" ? unitOf(line.unitNumber)?.id : undefined,
      pmcActivityDefinitionId: line.activityId || undefined, reportedStatus: line.lineType === "work" ? line.reportedStatus : undefined,
    })),
    // the server replaces the four lists whole on each save, so all four go every time, empty ones included
    ...sectionsBody(sections),
  });

  const startNew = () => { setReportId(null); setLocked(false); setRejectedNote(null); setDate(today()); setWeather(""); setTemperature(""); setSummary(""); setObstacles(""); setLines([]); setSections(emptySections()); setMessage(null); setPhotoMessage(null); };
  const openReport = async (id: string) => {
    const full = await utils.siteReports.get.fetch({ ...scope, reportId: id });
    const unitNumber = (unitId: string | null) => String(units.find(unit => unit.id === unitId)?.number ?? "");
    setReportId(id); setDate(full.report.reportDate); setWeather(full.report.weather ?? ""); setTemperature(full.report.temperatureC === null || full.report.temperatureC === undefined ? "" : String(full.report.temperatureC));
    setSummary(full.report.summary ?? ""); setObstacles(full.report.obstacles ?? ""); setSections(sectionsFrom(full));
    setLines(full.lines.map(line => ({ key: line.id, lineType: line.lineType, label: line.label ?? "", quantity: line.quantity === null ? "" : String(line.quantity), hours: line.hours === null ? "" : String(line.hours), description: line.description ?? "", unitNumber: unitNumber(line.pmcUnitId), activityId: line.pmcActivityDefinitionId ?? "", reportedStatus: (line.reportedStatus ?? "IN_PROGRESS") as Status })));
    setLocked(full.report.status === "submitted" || full.report.status === "approved");
    setRejectedNote(full.report.status === "rejected" ? (full.report.reviewNote ?? null) : null);
    setMessage(null); setPhotoMessage(null);
  };

  const update = (key: string, patch: Partial<Line>) => setLines(current => current.map(line => (line.key === key ? { ...line, ...patch } : line)));
  const statusName = (status: string) => ({ draft: t.draft, submitted: t.pending, approved: t.approved, rejected: t.rejected } as Record<string, string>)[status] ?? status;
  const weatherName: Record<string, string> = { clear: t.weatherClear, cloudy: t.weatherCloudy, rain: t.weatherRain, dust: t.weatherDust, hot: t.weatherHot, windy: t.weatherWindy };
  const reports = list.data ?? [];
  const waiting = reports.filter(report => report.status === "submitted");
  const error = save.error ?? submit.error ?? attach.error ?? detail.error;

  const addPhoto = async (file: File | undefined) => {
    if (!file || !reportId) return;
    setPhotoMessage(t.uploading);
    try {
      const key = await upload.upload(file, file.type || "image/jpeg");
      await attach.mutateAsync({ ...scope, reportId, uploadKey: key, fileName: file.name || "photo.jpg" });
    } catch { setPhotoMessage(null); }
  };

  const section = (lineType: Line["lineType"]) => lines.filter(line => line.lineType === lineType);
  const roleNames = (roles.data ?? []).filter(role => role.active).map(role => role.name);
  const machineNames = (machines.data ?? []).filter(item => item.active).map(item => [item.equipmentType, item.model, item.plateOrSize].filter(Boolean).join(" · "));
  // live totals for what can be counted now (the figure the server approves is its own)
  const total = (lineType: "labour" | "equipment") => section(lineType).reduce((sum, line) => sum + (num(line.quantity) ?? 0), 0);
  const lineBox = (line: Line) => {
    const unit = line.lineType === "work" ? unitOf(line.unitNumber) : undefined;
    const choices = unit ? activities.filter(activity => activity.modelCode === unit.modelCode) : activities;
    return (
      <li key={line.key} className="space-y-2 rounded-xl border bg-card p-3" data-line={line.lineType}>
        {line.lineType !== "work" ? (
          <>
            <label className="block text-sm font-medium">{line.lineType === "labour" ? t.trade : t.machine}
              <Select className="mt-1" value={line.label || undefined} placeholder={line.lineType === "labour" ? t.pickRole : t.pickEquipment} disabled={locked} onValueChange={value => update(line.key, { label: value })}
                options={(line.lineType === "labour" ? roleNames : machineNames).concat(line.label ? [line.label] : []).filter((name, index, all) => all.indexOf(name) === index).map(name => ({ value: name, label: name }))} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block text-sm font-medium">{t.count}<input className={`${fieldInput} mt-1`} type="number" inputMode="decimal" min="0" step="any" value={line.quantity} disabled={locked} onChange={event => update(line.key, { quantity: event.target.value })} /></label>
              {line.lineType === "labour" && <label className="block text-sm font-medium">{t.hours}<input className={`${fieldInput} mt-1`} type="number" inputMode="decimal" min="0" max="24" step="any" value={line.hours} disabled={locked} onChange={event => update(line.key, { hours: event.target.value })} /></label>}
            </div>
            <label className="block text-sm font-medium">{t.forActivity}
              <Select className="mt-1" value={line.activityId || NONE} disabled={locked} onValueChange={value => update(line.key, { activityId: value === NONE ? "" : value })}
                options={[{ value: NONE, label: t.none }, ...activities.map(activity => ({ value: activity.id, label: `${activity.code} — ${activity.name}${activities.some(other => other.id !== activity.id && other.code === activity.code) ? ` (${activity.modelCode})` : ""}` }))]} /></label>
          </>
        ) : (
          <>
            <label className="block text-sm font-medium">{t.unit}<input className={`${fieldInput} mt-1`} type="number" inputMode="numeric" min="1" step="1" value={line.unitNumber} disabled={locked} onChange={event => update(line.key, { unitNumber: event.target.value, activityId: "" })} /></label>
            {line.unitNumber.trim() && !unit && <p role="alert" className="text-sm text-danger-soft-foreground">{t.unitUnknown}</p>}
            <label className="block text-sm font-medium">{t.activity}
              <Select className="mt-1" value={line.activityId || undefined} placeholder={t.pickActivity} disabled={locked || !unit} onValueChange={value => update(line.key, { activityId: value })}
                options={choices.map(activity => ({ value: activity.id, label: `${activity.code} — ${activity.name}` }))} /></label>
            <label className="block text-sm font-medium">{t.status}
              <Select className="mt-1" value={line.reportedStatus} disabled={locked} onValueChange={value => update(line.key, { reportedStatus: value as Status })}
                options={[{ value: "IN_PROGRESS", label: t.inProgress }, { value: "UNDER_REVIEW", label: t.underReview }, { value: "COMPLETE", label: t.complete }]} /></label>
          </>
        )}
        <label className="block text-sm font-medium">{t.notes}<input className={`${fieldInput} mt-1`} value={line.description} disabled={locked} onChange={event => update(line.key, { description: event.target.value })} /></label>
        {!locked && <Button type="button" variant="outline" className={tap} onClick={() => setLines(current => current.filter(item => item.key !== line.key))}>{t.remove}</Button>}
      </li>
    );
  };
  const group = (lineType: Line["lineType"], heading: string, addLabel: string) => {
    const choices = lineType === "labour" ? roleNames : lineType === "equipment" ? machineNames : null;
    const source = lineType === "labour" ? roles : machines;
    // a list that failed to load is not an empty list: SourceNotice says so, and the empty state with its seed button stays away
    const empty = choices !== null && choices.length === 0 && !source.isLoading && !source.error;
    return (
      <div className="space-y-2" aria-label={heading} role="group">
        {lineType === "labour" ? <SourceNotice query={roles} isArabic={isArabic} title={heading} /> : lineType === "equipment" ? <SourceNotice query={machines} isArabic={isArabic} title={heading} /> : null}
        {empty && <div role="status" className="space-y-2 rounded-lg bg-muted p-3 text-sm"><p>{lineType === "labour" ? t.noRoles : t.noEquipment}</p>
          {lineType === "labour" && canReview ? <Button type="button" variant="outline" className={tap} disabled={seedRoles.isPending} onClick={() => seedRoles.mutate({ ...scope, language })}>{t.seedRoles}</Button> : <p className="text-muted-foreground">{t.askManager}</p>}</div>}
        <ul className="space-y-2">{section(lineType).map(lineBox)}</ul>
        {!locked && !empty && <Button type="button" variant="outline" className={`${tap} w-full`} onClick={() => setLines(current => [...current, blank(lineType)])}>{addLabel}</Button>}
      </div>
    );
  };

  if (options.isLoading || list.isLoading) return <FieldShell tenantId={tenantId} projectId={projectId} current="report" title={t.title} backHref={`/m/${tenantId}/${projectId}`} backLabel={t.back}><p role="status" className="text-sm text-muted-foreground">{t.loading}</p></FieldShell>;
  const loadError = options.error ?? list.error;
  if (loadError) return <FieldShell tenantId={tenantId} projectId={projectId} current="report" title={t.title} backHref={`/m/${tenantId}/${projectId}`} backLabel={t.back}><p role="alert" className="text-sm text-danger-soft-foreground">{getLocalizedProjectError(loadError, isArabic)}</p><Button className={tap} variant="outline" onClick={() => { void options.refetch(); void list.refetch(); }}>{t.retry}</Button></FieldShell>;

  return (
    <FieldShell wide tenantId={tenantId} projectId={projectId} current="report" title={t.title} backHref={`/m/${tenantId}/${projectId}`} backLabel={t.back}>
      <WriteGate permission="project.field.manage" projectId={projectId} reason={{ ar: text.ar.noPermission, en: text.en.noPermission, ur: text.ur.noPermission }}>
        {/* specification §3: sections 0 to 10 in order; one column on a phone (the site engineer), two on a desk (the planning engineer) */}
        {/* room under the last section for the save bar, which is fixed to the bottom of a phone's screen (a sticky bar would be lost in an overflow ancestor) */}
        <CheckedForm className="space-y-3 pb-24 lg:pb-0" onSubmit={event => { event.preventDefault(); if (locked || problems.length > 0 || save.isPending) return; setMessage(null); save.mutate(body()); }}>
          {reportId && <div className="flex items-center justify-between"><span className="text-sm text-muted-foreground">{showDate(date, language)}</span><Button type="button" variant="outline" className={tap} onClick={startNew}>{t.newReport}</Button></div>}
          {rejectedNote && <p role="note" className="rounded-xl bg-warning-soft p-3 text-sm text-warning-soft-foreground"><b>{t.rejectedNote}:</b> {rejectedNote}</p>}
          {locked && <p role="note" className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">{t.locked}</p>}
          {/* two independent columns on a desk (the sections flow down the first, then the second), so a long section never leaves a hole beside a short one */}
          <div className="space-y-3 lg:columns-2 lg:gap-3 lg:space-y-0 [&>*]:break-inside-avoid lg:[&>*]:mb-3">
            <ReportSection number={0} title={t.header} summary={showDate(date, language)}>
              <label className="block text-sm font-medium">{t.day}<input className={`${fieldInput} mt-1`} type="date" value={date} max={today()} disabled={locked || Boolean(reportId)} onChange={event => setDate(event.target.value)} /></label>
              <p className="text-sm"><span className="text-muted-foreground">{t.weekday}: </span>{formatWeekday(date, language)}</p>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm font-medium">{t.weather}
                  <Select className="mt-1" value={weather || NONE} disabled={locked} onValueChange={value => setWeather(value === NONE ? "" : value)}
                    options={[{ value: NONE, label: "—" }, ...WEATHER.map(value => ({ value, label: weatherName[value] }))]} /></label>
                <label className="block text-sm font-medium">{t.temperature}<input className={`${fieldInput} mt-1`} type="number" inputMode="decimal" step="any" value={temperature} disabled={locked} onChange={event => setTemperature(event.target.value)} /></label>
              </div>
              <label className="block text-sm font-medium">{t.summary}<textarea className="mt-1 min-h-[88px] w-full rounded-xl border bg-card p-3 text-base" value={summary} disabled={locked} onChange={event => setSummary(event.target.value)} /></label>
              <p className="text-sm font-medium">{t.windHours}</p><LockedNote />
            </ReportSection>
            <ReportSection number={1} title={t.labour} summary={t.workers(total("labour"))}>
              {group("labour", t.labour, t.addLabour)}
              <p className="text-sm font-medium">{t.matrix}</p><LockedNote />
            </ReportSection>
            <ReportSection number={2} title={t.equipment} summary={t.units(total("equipment"))}>{group("equipment", t.equipment, t.addEquipment)}</ReportSection>
            <ReportSection number={3} title={t.work} summary={t.lineCount(section("work").length)}>{group("work", t.work, t.addWork)}</ReportSection>
            <ReportSection number={4} title={t.inspections} defaultOpen={false}><LockedNote /></ReportSection>
            <ReportSection number={5} title={t.materials} summary={t.lineCount(sections.materials.length)}>
              <MaterialsSection title={t.materials} rows={sections.materials} onChange={put("materials")} locked={locked} submittals={submittals.data ?? []} />
            </ReportSection>
            <ReportSection number={6} title={t.hse} summary={hseSummary(sections.hse, sectionText) || t.lineCount(0)}><HseSection title={t.hse} rows={sections.hse} onChange={put("hse")} locked={locked} /></ReportSection>
            <ReportSection number={7} title={t.obstacles} summary={t.lineCount(sections.obstacleItems.length)}>
              <ObstaclesSection title={t.obstacles} rows={sections.obstacleItems} onChange={put("obstacleItems")} locked={locked} />
              <label className="block text-sm font-medium">{sectionText.freeText}<textarea className="mt-1 min-h-[64px] w-full rounded-xl border bg-card p-3 text-base" value={obstacles} disabled={locked} onChange={event => setObstacles(event.target.value)} /></label>
            </ReportSection>
            <ReportSection number={8} title={t.tomorrow} summary={t.lineCount(sections.tomorrow.length)}><TomorrowSection title={t.tomorrow} rows={sections.tomorrow} onChange={put("tomorrow")} locked={locked} /></ReportSection>
            <ReportSection number={9} title={t.photos}>
            {!reportId && <p className="text-sm text-muted-foreground">{t.photoNeedsSave}</p>}
            {reportId && !locked && <CameraCapture label={t.takePhoto} disabled={upload.busy || attach.isPending} onFile={file => { void addPhoto(file); }} />}
            {photoMessage && <p role="status" className="text-sm text-success-soft-foreground">{photoMessage}</p>}
            {reportId && (detail.data?.photos.length ? <ul className="grid grid-cols-3 gap-2">{detail.data.photos.map(photo => <li key={photo.id}>{photo.url ? <img src={photo.url} alt={photo.caption ?? photo.fileName} className="aspect-square w-full rounded-lg object-cover" /> : <span className="text-xs text-muted-foreground">{photo.fileName}</span>}</li>)}</ul> : <p className="text-sm text-muted-foreground">{t.noPhotos}</p>)}
            </ReportSection>
            <ReportSection number={10} title={t.approval} summary={reportId ? (locked ? t.pending : t.draft) : t.newReport} defaultOpen={false}>
              <p className="text-sm"><span className="text-muted-foreground">{t.statusNow}: </span>{reportId ? (locked ? t.pending : t.draft) : t.newReport}</p>
              <p className="text-sm font-medium">{t.chain}</p><LockedNote />
            </ReportSection>
          </div>
          {error && <p role="alert" className="text-sm text-danger-soft-foreground">{getLocalizedProjectError(error, isArabic)}</p>}
          {message && <p role="status" className="rounded-xl bg-success-soft p-3 text-sm font-semibold text-success-soft-foreground">{message}</p>}
          {!locked && (
            // the save bar stays in reach of the thumb while the site engineer scrolls the sections
            <div data-save-bar className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-2 gap-2 border-t bg-background p-3 shadow-[0_-4px_12px_rgb(0_0_0/0.06)] lg:static lg:border-0 lg:p-0 lg:shadow-none">
              <Button type="submit" variant="outline" className={`${tap} text-base`} disabled={problems.length > 0 || save.isPending}>{save.isPending ? t.saving : t.save}</Button>
              <Button type="button" className={`${tap} text-base`} disabled={!reportId || problems.length > 0 || submit.isPending} onClick={() => { setMessage(null); if (reportId) submit.mutate({ ...scope, reportId }); }}>{submit.isPending ? t.submitting : t.submit}</Button>
            </div>
          )}
        </CheckedForm>
      </WriteGate>

      <section className="space-y-2" aria-label={t.recent}>
        <h2 className="text-base font-semibold">{t.recent}</h2>
        {reports.length === 0 && <p className="text-sm text-muted-foreground">{t.noReports}</p>}
        <ul className="space-y-2">
          {reports.slice(0, 15).map(report => (
            <li key={report.id} className="flex items-center justify-between gap-2 rounded-xl border bg-card p-3" data-report-status={report.status}>
              <span><span className="block text-sm font-semibold">{showDate(report.reportDate, language)}</span><span className="block text-xs text-muted-foreground">{statusName(report.status)}{report.weather ? ` · ${weatherName[report.weather] ?? report.weather}` : ""}</span></span>
              <Button type="button" variant="outline" className={tap} onClick={() => { void openReport(report.id); }}>{canWrite && (report.status === "draft" || report.status === "rejected") ? t.edit : t.view}</Button>
            </li>
          ))}
        </ul>
      </section>

      {canReview && <ReviewPanel scope={scope} waiting={waiting} t={t} language={language} isArabic={isArabic} onDone={() => { void utils.siteReports.list.invalidate(); }} />}
    </FieldShell>
  );
}

type Waiting = { id: string; reportDate: string; weather: string | null };
function ReviewPanel({ scope, waiting, t, language, isArabic, onDone }: { scope: { tenantId: string; projectId: string }; waiting: Waiting[]; t: (typeof text)["en"]; language: "ar" | "en" | "ur"; isArabic: boolean; onDone: () => void }) {
  const [reason, setReason] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ id: string; applied: Array<{ unitId: string; activityDefinitionId: string; from: string | null; to: string }>; skipped: Array<{ unitId: string; activityDefinitionId: string }>; gate?: { mode: string; notAccepted: Array<{ unitId: string; activityDefinitionId: string }> } } | null>(null);
  const options = trpc.siteReports.options.useQuery(scope);
  const review = trpc.siteReports.review.useMutation({
    onSuccess: (result, variables) => {
      if (variables.dryRun) { setPreview({ id: variables.reportId, applied: result.applied, skipped: result.skipped, gate: (result as { gate?: { mode: string; notAccepted: Array<{ unitId: string; activityDefinitionId: string }> } }).gate }); return; }
      setPreview(null); setDone(variables.decision === "approve" ? t.approvedDone : t.rejectedDone); onDone();
    },
  });
  const cellName = (cell: { unitId: string; activityDefinitionId: string }) => {
    const unit = options.data?.units.find(item => item.id === cell.unitId); const activity = options.data?.activities.find(item => item.id === cell.activityDefinitionId);
    return `${unit?.number ?? "?"} · ${activity?.code ?? "?"}`;
  };
  return (
    <section className="space-y-2" aria-label={t.review}>
      <h2 className="text-base font-semibold">{t.review}</h2>
      <p className="text-sm text-muted-foreground">{t.reviewHint}</p>
      {done && <p role="status" className="rounded-xl bg-success-soft p-3 text-sm font-semibold text-success-soft-foreground">{done}</p>}
      {review.error && <p role="alert" className="text-sm text-danger-soft-foreground">{getLocalizedProjectError(review.error, isArabic)}</p>}
      {waiting.length === 0 && <p className="text-sm text-muted-foreground">{t.nothingToReview}</p>}
      <ul className="space-y-3">
        {waiting.map(report => (
          <li key={report.id} className="space-y-2 rounded-xl border bg-card p-3" data-review={report.id}>
            <p className="text-sm font-semibold">{showDate(report.reportDate, language)}</p>
            <Button type="button" variant="outline" className={tap} disabled={review.isPending} onClick={() => review.mutate({ ...scope, reportId: report.id, decision: "approve", dryRun: true })}>{t.preview}</Button>
            {preview?.id === report.id && (
              <div className="space-y-1 rounded-lg bg-muted p-2 text-sm" data-preview>
                {preview.applied.length === 0 ? <p>{t.noMoves}</p> : <><p className="font-semibold">{t.willMove}</p><ul>{preview.applied.map(cell => <li key={`${cell.unitId}${cell.activityDefinitionId}`}>{cellName(cell)}: {cell.from ?? "—"} → {cell.to}</li>)}</ul></>}
                {preview.skipped.length > 0 && <><p className="font-semibold">{t.willSkip}</p><ul>{preview.skipped.map(cell => <li key={`${cell.unitId}${cell.activityDefinitionId}`}>{cellName(cell)}</li>)}</ul></>}
                {preview.gate && preview.gate.notAccepted.length > 0 && <><p className="font-semibold text-warning-soft-foreground">{t.blocked} ({preview.gate.mode})</p><ul>{preview.gate.notAccepted.map(cell => <li key={`${cell.unitId}${cell.activityDefinitionId}`}>{cellName(cell)}</li>)}</ul></>}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" className={tap} disabled={review.isPending} onClick={() => review.mutate({ ...scope, reportId: report.id, decision: "approve" })}>{t.approve}</Button>
              <Button type="button" variant="outline" className={tap} disabled={review.isPending || !(reason[report.id] ?? "").trim()} onClick={() => review.mutate({ ...scope, reportId: report.id, decision: "reject", note: reason[report.id]!.trim() })}>{t.reject}</Button>
            </div>
            <input className={fieldInput} aria-label={t.reason} placeholder={t.reason} value={reason[report.id] ?? ""} onChange={event => setReason(current => ({ ...current, [report.id]: event.target.value }))} />
          </li>
        ))}
      </ul>
    </section>
  );
}
