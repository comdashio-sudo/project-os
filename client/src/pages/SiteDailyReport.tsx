import { DailyRangeExport } from "@/components/dailyReport/DailyRangeExport";
import { Button } from "@/components/ui/button";
import { CameraCapture, Select } from "@/components/ds";
import { FieldShell, fieldInput, showDate, tap } from "@/components/FieldShell";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { useCan, usePermissionsLoading, WriteGate } from "@/lib/permissions";
import { projectErrorCode } from "@/lib/errorCode";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { useDirectUpload } from "@/lib/useDirectUpload";
import { CheckedForm } from "@/components/CheckedForm";
import { SourceNotice } from "@/components/SectionResilience";
import { ReportSection } from "@/components/dailyReport/ReportSection";
import { ReportsHeader, SectionStrip, StepButtons, sectionNumber, useLayoutText, type SectionKey, type SectionState } from "@/components/dailyReport/ReportLayout";
import { EquipmentOfDay, HeaderExtras, LabourMatrix, equipmentBody, equipmentFrom, equipmentProblems, labourBody, labourFrom, labourProblems, labourTotal, useCoreText, type EquipmentRows, type LabourCells } from "@/components/dailyReport/CoreSections";
import { DailyReportDocument, ReportExports } from "@/components/dailyReport/DailyReportDocument";
import { ApprovalChain, InspectionsSection, PhotoPlace, photoPlaceText } from "@/components/dailyReport/ApprovalSections";
import { OwnReportNote, WhoApproves } from "@/components/dailyReport/ApprovalWho";
import { emptySections, HseSection, hseSummary, MaterialsSection, ObstaclesSection, sectionProblems, sectionsBody, sectionsFrom, TomorrowSection, useSectionText, type Sections } from "@/components/dailyReport/ReportSections";
import { formatDateTime, formatWeekday } from "@/components/ds";
import { SectionOnlyReport, useReportSections } from "@/components/dailyReport/SectionOnlyReport";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { OfflineQueuePanel } from "@/components/OfflineQueuePanel";
import { isNetworkError, type QueueItem, type SendResult } from "@/lib/offlineQueue";
import { useOfflineQueue } from "@/lib/useOfflineQueue";
import { offlineReasons } from "@/lib/offlineReasons";
import { useParams } from "wouter";

// The daily site report on the phone (work order 14, item 1). The site engineer writes it in four short parts — the day, the people and equipment, the work done per
// unit and activity, the photos — and sends it; the project manager sees what approving would move, then approves or sends it back with a reason. Nothing here
// computes progress: the server moves the cells when the report is approved, and says which lines it left alone and why.
// "None" in a list: the custom list (Radix) cannot hold an empty value, so it carries this one and the screen reads it as empty.
const NONE = "__none";
// Q-58 (2): how long after the last change the draft saves itself
const AUTOSAVE_MS = 4000;
// Q-58 (1): several reports of one day — the label that tells them apart, and «copy from which report?» when the previous day holds two or more
const manyText = {
  ar: { label: "الوردية / المنطقة / المقاول (اختياري)", labelHint: "يميّز تقارير اليوم الواحد.", copyWhich: "لليوم السابق أكثر من تقرير: من أيّها تنسخ؟", noLabel: "بلا وصف" },
  en: { label: "Shift / area / contractor (optional)", labelHint: "Tells reports of the same day apart.", copyWhich: "The previous day has more than one report: copy from which one?", noLabel: "No label" },
  ur: { label: "شفٹ / علاقہ / ٹھیکیدار (اختیاری)", labelHint: "ایک دن کی رپورٹس میں فرق کرتا ہے۔", copyWhich: "پچھلے دن کی ایک سے زیادہ رپورٹس ہیں: کس سے نقل کریں؟", noLabel: "بغیر وضاحت" },
};
const text = {
  ar: {
    keptOffline: "حُفظ التقرير على هذا الهاتف وسيُرسل عند عودة الاتصال.", notKept: "تعذّر حفظ التقرير على الهاتف (مساحة ممتلئة أو محظورة). أعد الحفظ عند الاتصال.",
    header: "الرأس", weekday: "اليوم", windHours: "الرياح وساعات العمل", inspections: "الفحوصات (WIR/RFI)", materials: "المواد المستلمة", hse: "السلامة (HSE)", tomorrow: "خطة الغد", approval: "الاعتماد", pickRole: "اختر الدور", pickEquipment: "اختر المعدة", noRoles: "لا أدوار عمالة في قائمة المشروع بعد.", seedRoles: "انسخ القائمة الافتراضية", seeded: "أُضيفت الأدوار الافتراضية", noEquipment: "لا معدات في سجل المشروع بعد.", askManager: "يضيفها مدير المشروع.", workers: (n: number) => `المجموع: ${n === 1 ? "عامل واحد" : n === 2 ? "عاملان" : n >= 3 && n <= 10 ? `${n} عمال` : `${n} عاملًا`}`, units: (n: number) => `المجموع: ${n}`, lineCount: (n: number) => `${n} سطر`, matrix: "مصفوفة الشركات والأدوار ونسخ الأمس", statusNow: "حالة التقرير", chain: "سلسلة أعدّه ← راجعه ← اعتمده", 
    title: "التقرير اليومي", back: "العودة إلى الإدخال الميداني", loading: "جارٍ التحميل…", retry: "إعادة المحاولة",
    day: "يوم العمل", weather: "الطقس", temperature: "الحرارة (°م)", summary: "ملخص اليوم", obstacles: "العوائق",
    weatherClear: "صافٍ", weatherCloudy: "غائم", weatherRain: "مطر", weatherDust: "غبار", weatherHot: "حرارة شديدة", weatherWindy: "رياح",
    labour: "العمالة", equipment: "المعدات", work: "الأعمال المنفذة", addLabour: "إضافة عمالة", addEquipment: "إضافة معدة", addWork: "إضافة عمل",
    trade: "المهنة", machine: "المعدة", count: "العدد", hours: "الساعات", unit: "رقم الوحدة", activity: "النشاط", pickActivity: "اختر النشاط", status: "الحالة بعد العمل", notes: "ملاحظات", remove: "حذف",
    unitUnknown: "لا وحدة بهذا الرقم في المشروع", forActivity: "لهذا النشاط (اختياري)", none: "بلا نشاط",
    inProgress: "قيد التنفيذ", underReview: "قيد المراجعة", complete: "مكتمل",
    save: "حفظ المسودة", saving: "جارٍ الحفظ…", saved: "حُفظت المسودة", submit: "إرسال للاعتماد", submitting: "جارٍ الإرسال…", submitted: "أُرسل التقرير للاعتماد", send: "إرسال التقرير", sentFinal: "أُرسل التقرير وأصبح نهائيًا: دخل الأسبوعي والشهري.", sentApplied: "خلايا تقدم حُدِّثت:", sentHeld: "خلايا لم تُحدَّث لأن فحصها لم يُقبل:",
    photos: "الصور", takePhoto: "التقاط صورة", photoNeedsSave: "احفظ المسودة أولًا ثم أضف الصور.", photoAdded: "أُضيفت الصورة", noPhotos: "لا صور بعد.", uploading: "جارٍ الرفع…",
    recent: "تقارير حديثة", noReports: "لا تقارير بعد.", open: "فتح", edit: "تعديل", view: "عرض", draft: "مسودة", pending: "بانتظار الاعتماد", approved: "معتمد", rejected: "أُعيد للتعديل",
    rejectedNote: "سبب الإعادة", locked: "هذا التقرير مُرسَل أو معتمد ولا يُعدَّل.", newReport: "تقرير جديد",
    review: "اعتماد التقارير", reviewHint: "تقارير بانتظار اعتمادك.", nothingToReview: "لا تقارير بانتظار الاعتماد.", preview: "ماذا سيتحرك؟", approve: "اعتماد", reject: "إعادة للتعديل", reason: "السبب (إلزامي)",
    willMove: "ستتحرك هذه الخلايا", willSkip: "لن تتحرك (الخلية متقدمة أصلًا)", blocked: "تنبيه الجودة: لا فحص مقبول لهذه الخلايا", qcHeld: "لا استلام QC لهذه الفلل والأنشطة، فلا تُكمَّل:", leaveNotAccepted: "اعتماد التقرير دون تحريك هذه الفلل", noMoves: "لا خلايا ستتحرك.", approvedDone: "اعتُمد التقرير وتحرك التقدم", rejectedDone: "أُعيد التقرير لكاتبه",
    noPermission: "دورك لا يتيح كتابة التقرير اليومي.", noReview: "اعتماد التقارير لمدير المشروع.", otherReports: "تقارير الآخرين",
  },
  en: {
    keptOffline: "The report is kept on this phone and will be sent when the connection returns.", notKept: "Could not keep the report on this phone (storage full or blocked). Save again when online.",
    header: "Header", weekday: "Day", windHours: "Wind and working hours", inspections: "Inspections (WIR/RFI)", materials: "Materials received", hse: "Safety (HSE)", tomorrow: "Plan for tomorrow", approval: "Approval", pickRole: "Pick the role", pickEquipment: "Pick the equipment", noRoles: "The project has no labour roles yet.", seedRoles: "Copy the default list", seeded: "Default roles added", noEquipment: "The project has no equipment yet.", askManager: "The project manager adds them.", workers: (n: number) => `Total: ${n} workers`, units: (n: number) => `Total: ${n}`, lineCount: (n: number) => `${n} lines`, matrix: "Company × role matrix and copy from yesterday", statusNow: "Report status", chain: "Prepared → reviewed → approved chain", 
    title: "Daily report", back: "Back to quick entry", loading: "Loading…", retry: "Retry",
    day: "Work day", weather: "Weather", temperature: "Temperature (°C)", summary: "Summary of the day", obstacles: "Obstacles",
    weatherClear: "Clear", weatherCloudy: "Cloudy", weatherRain: "Rain", weatherDust: "Dust", weatherHot: "Extreme heat", weatherWindy: "Windy",
    labour: "Labour", equipment: "Equipment", work: "Work done", addLabour: "Add labour", addEquipment: "Add equipment", addWork: "Add work",
    trade: "Trade", machine: "Equipment", count: "Count", hours: "Hours", unit: "Unit number", activity: "Activity", pickActivity: "Pick the activity", status: "Status after the work", notes: "Notes", remove: "Remove",
    unitUnknown: "No unit with that number in this project", forActivity: "For this activity (optional)", none: "No activity",
    inProgress: "In progress", underReview: "Under review", complete: "Complete",
    save: "Save draft", saving: "Saving…", saved: "Draft saved", submit: "Send for approval", submitting: "Sending…", submitted: "The report was sent for approval", send: "Send the report", sentFinal: "The report was sent and is final: it counts in the week and month.", sentApplied: "Progress cells updated:", sentHeld: "Cells not updated because their inspection is not accepted:",
    photos: "Photos", takePhoto: "Take a photo", photoNeedsSave: "Save the draft first, then add photos.", photoAdded: "Photo added", noPhotos: "No photos yet.", uploading: "Uploading…",
    recent: "Recent reports", noReports: "No reports yet.", open: "Open", edit: "Edit", view: "View", draft: "Draft", pending: "Awaiting approval", approved: "Approved", rejected: "Sent back",
    rejectedNote: "Why it was sent back", locked: "This report is sent or approved and cannot be edited.", newReport: "New report",
    review: "Approve reports", reviewHint: "Reports waiting for your approval.", nothingToReview: "No report is waiting for approval.", preview: "What will move?", approve: "Approve", reject: "Send back", reason: "Reason (required)",
    willMove: "These cells will move", willSkip: "These will not move (already further on)", blocked: "Quality warning: no accepted inspection for these cells", qcHeld: "No QC receipt for these villas and activities, so they are not completed:", leaveNotAccepted: "Approve the report without moving these villas", noMoves: "No cell will move.", approvedDone: "Report approved and progress moved", rejectedDone: "Report sent back to its writer",
    noPermission: "Your role does not allow writing the daily report.", noReview: "Approving reports belongs to the project manager.", otherReports: "Other people's reports",
  },
  ur: {
    keptOffline: "رپورٹ اس فون پر محفوظ ہو گئی، کنکشن واپس آنے پر بھیجی جائے گی۔", notKept: "رپورٹ فون پر محفوظ نہ ہو سکی (اسٹوریج بھرا یا بند)۔ کنکشن پر دوبارہ محفوظ کریں۔",
    header: "سرخی", weekday: "دن", windHours: "ہوا اور کام کے اوقات", inspections: "معائنے (WIR/RFI)", materials: "موصول شدہ مواد", hse: "حفاظت (HSE)", tomorrow: "کل کا منصوبہ", approval: "منظوری", pickRole: "کردار منتخب کریں", pickEquipment: "سازوسامان منتخب کریں", noRoles: "پروجیکٹ میں ابھی مزدوروں کے کردار نہیں۔", seedRoles: "پہلے سے طے شدہ فہرست نقل کریں", seeded: "پہلے سے طے شدہ کردار شامل ہو گئے", noEquipment: "پروجیکٹ میں ابھی کوئی سازوسامان نہیں۔", askManager: "پروجیکٹ مینیجر انہیں شامل کرتا ہے۔", workers: (n: number) => `کل: ${n} مزدور`, units: (n: number) => `کل: ${n}`, lineCount: (n: number) => `${n} سطریں`, matrix: "کمپنی × کردار میٹرکس اور کل سے نقل", statusNow: "رپورٹ کی حالت", chain: "تیار ← جائزہ ← منظوری کا سلسلہ", 
    title: "روزانہ رپورٹ", back: "فوری اندراج پر واپس", loading: "لوڈ ہو رہا ہے…", retry: "دوبارہ کوشش",
    day: "کام کا دن", weather: "موسم", temperature: "درجۂ حرارت (°C)", summary: "دن کا خلاصہ", obstacles: "رکاوٹیں",
    weatherClear: "صاف", weatherCloudy: "ابر آلود", weatherRain: "بارش", weatherDust: "گرد و غبار", weatherHot: "شدید گرمی", weatherWindy: "تیز ہوا",
    labour: "مزدور", equipment: "سازوسامان", work: "مکمل کیا گیا کام", addLabour: "مزدور شامل کریں", addEquipment: "سازوسامان شامل کریں", addWork: "کام شامل کریں",
    trade: "ہنر", machine: "سازوسامان", count: "تعداد", hours: "گھنٹے", unit: "یونٹ نمبر", activity: "سرگرمی", pickActivity: "سرگرمی منتخب کریں", status: "کام کے بعد کی حالت", notes: "نوٹس", remove: "حذف کریں",
    unitUnknown: "اس پروجیکٹ میں اس نمبر کا کوئی یونٹ نہیں", forActivity: "اس سرگرمی کے لیے (اختیاری)", none: "کوئی سرگرمی نہیں",
    inProgress: "جاری", underReview: "زیرِ جائزہ", complete: "مکمل",
    save: "مسودہ محفوظ کریں", saving: "محفوظ کیا جا رہا ہے…", saved: "مسودہ محفوظ ہو گیا", submit: "منظوری کے لیے بھیجیں", submitting: "بھیجا جا رہا ہے…", submitted: "رپورٹ منظوری کے لیے بھیج دی گئی", send: "رپورٹ بھیجیں", sentFinal: "رپورٹ بھیج دی گئی اور حتمی ہے: ہفتہ وار و ماہانہ میں شامل ہوئی۔", sentApplied: "پیش رفت کے خانے اپ ڈیٹ ہوئے:", sentHeld: "خانے جو اپ ڈیٹ نہیں ہوئے کیونکہ ان کا معائنہ قبول نہیں ہوا:",
    photos: "تصاویر", takePhoto: "تصویر لیں", photoNeedsSave: "پہلے مسودہ محفوظ کریں، پھر تصاویر شامل کریں۔", photoAdded: "تصویر شامل ہو گئی", noPhotos: "ابھی کوئی تصویر نہیں۔", uploading: "اپ لوڈ ہو رہا ہے…",
    recent: "حالیہ رپورٹس", noReports: "ابھی کوئی رپورٹ نہیں۔", open: "کھولیں", edit: "ترمیم", view: "دیکھیں", draft: "مسودہ", pending: "منظوری کے انتظار میں", approved: "منظور شدہ", rejected: "واپس بھیجی گئی",
    rejectedNote: "واپس بھیجنے کی وجہ", locked: "یہ رپورٹ بھیجی جا چکی ہے یا منظور ہے، اس میں ترمیم نہیں ہو سکتی۔", newReport: "نئی رپورٹ",
    review: "رپورٹس کی منظوری", reviewHint: "آپ کی منظوری کی منتظر رپورٹس۔", nothingToReview: "منظوری کی منتظر کوئی رپورٹ نہیں۔", preview: "کیا آگے بڑھے گا؟", approve: "منظور کریں", reject: "واپس بھیجیں", reason: "وجہ (لازمی)",
    willMove: "یہ خانے آگے بڑھیں گے", willSkip: "یہ آگے نہیں بڑھیں گے (پہلے ہی آگے ہیں)", blocked: "معیار کی تنبیہ: ان خانوں کا کوئی قبول شدہ معائنہ نہیں", qcHeld: "ان ولاز اور سرگرمیوں کی QC وصولی نہیں، اس لیے مکمل نہیں ہوں گی:", leaveNotAccepted: "ان ولاز کو آگے بڑھائے بغیر رپورٹ منظور کریں", noMoves: "کوئی خانہ آگے نہیں بڑھے گا۔", approvedDone: "رپورٹ منظور ہو گئی اور پیش رفت آگے بڑھی", rejectedDone: "رپورٹ لکھنے والے کو واپس بھیج دی گئی",
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
  const many = pickLanguage(language, manyText);
  const layout = useLayoutText();
  // Q-58 (2): the section in hand — on a phone the only one drawn, on a desk the one the strip last took the reader to
  const [current, setCurrent] = useState<SectionKey>("header");
  const goTo = useCallback((key: SectionKey) => {
    setCurrent(key);
    // open it (a section may have been folded) and bring it into view once drawn
    requestAnimationFrame(() => { const element = document.getElementById(`report-section-${key}`) as HTMLDetailsElement | null; if (!element) return; element.open = true; element.scrollIntoView?.({ block: "start", behavior: "smooth" }); });
  }, []);
  const scope = { tenantId, projectId };
  const enabled = Boolean(tenantId && projectId);
  const utils = trpc.useUtils();
  const options = trpc.siteReports.options.useQuery(scope, { enabled });
  const list = trpc.siteReports.list.useQuery(scope, { enabled });
  // Q-71 (2): the company's rule — off (the default), a sent report is final; on, it waits for the approver. Unknown (loading, failed): the neutral wording
  const policy = trpc.policy.effective.useQuery(scope, { enabled });
  // a failed read is not «off»: the wording stays neutral and the server decides on sending (its answer says final or waiting)
  const approvalOn = !policy.isError && policy.data?.dailyReportApproval === true;
  const canWrite = useCan("project.field.manage", projectId);
  const canReview = useCan("project.manage", projectId);
  // Q-12: who does not hold the site's part (the HSE and QA/QC engineers, the planning engineer) gets their own section only, below
  const reportSections = useReportSections(projectId); const permissionsLoading = usePermissionsLoading();
  const planner = useCan(["project.pmc.manage", "project.schedule.manage"], projectId);
  const sectionOnly = !permissionsLoading && !reportSections.edit.includes("site") && (reportSections.edit.length > 0 || planner);
  // D-44 (a), #233: the labour roles and the equipment the report chooses from (active ones only); the project manager can seed the default roles
  const roles = trpc.projects.labourRoles.list.useQuery(scope, { enabled });
  const machines = trpc.projects.equipment.list.useQuery(scope, { enabled });
  // the consultant's material approvals a received material may name (optional; a list that fails says so in section 5 and leaves the choice at «no approval»)
  const submittals = trpc.submittals.list.useQuery({ ...scope, submittalType: "material_approval" }, { enabled });
  const seedRoles = trpc.projects.labourRoles.seedDefaults.useMutation({ onSuccess: () => { setMessage(t.seeded); void roles.refetch(); } });

  const [reportId, setReportId] = useState<string | null>(null);
  const [label, setLabel] = useState("");
  // Q-58 (1): the id of the report this form will create — chosen here, so a save sent twice (or kept offline twice) changes it instead of making a second one
  const [newReportId, setNewReportId] = useState(() => crypto.randomUUID());
  const [copyChoices, setCopyChoices] = useState<Array<{ id: string; reportNumber: string | null; label: string | null }> | null>(null);
  const [locked, setLocked] = useState(false);
  const [rejectedNote, setRejectedNote] = useState<string | null>(null);
  // Q-59 (3): the quick search opens a report on its date (/m/…/report?date=2026-11-20); any other value is ignored
  const [date, setDate] = useState(() => { const asked = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("date"); return asked && /^\d{4}-\d{2}-\d{2}$/.test(asked) ? asked : today(); });
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
  // D-45 (c): where the next photo was taken (a zone in words, a unit of this project), both optional
  // Q-9 (b): the header's wind and hours, the labour matrix and the equipment of the day (D-45 a)
  const coreText = useCoreText();
  const companies = trpc.projects.companies.list.useQuery(scope, { enabled });
  const [wind, setWind] = useState("");
  const [workHours, setWorkHours] = useState("");
  const [labourCells, setLabourCells] = useState<LabourCells>({});
  const [dayEquipment, setDayEquipment] = useState<EquipmentRows>({});
  const copy = trpc.siteReports.copyFromYesterday.useMutation({
    onSuccess: result => { setCopyChoices(null); void utils.siteReports.list.invalidate(); void openReport(result.id); },
    // Q-58 (1): the previous day holds two or more of my reports — the server asks which; the choices are that day's reports of mine
    onError: error => {
      if (projectErrorCode(error) !== "PROJECT_OS_SITE_REPORT_COPY_WHICH") return;
      const earlier = (list.data ?? []).filter(row => row.preparedByUserId === me.data?.id && row.reportDate < date).map(row => row.reportDate).sort().pop();
      setCopyChoices((list.data ?? []).filter(row => row.preparedByUserId === me.data?.id && row.reportDate === earlier).map(row => ({ id: row.id, reportNumber: (row as { reportNumber?: string | null }).reportNumber ?? null, label: (row as { label?: string | null }).label ?? null })));
    },
  });
  // Q-9 (c): the report as a document, for the PDF and Word exports; the labour sheet is the server's (D-47 a)
  const documentRef = useRef<HTMLElement | null>(null);
  const exportSheet = trpc.siteReports.export.useMutation();
  const [photoZone, setPhotoZone] = useState("");
  const [photoUnit, setPhotoUnit] = useState("");

  const units = options.data?.units ?? [];
  const activities = options.data?.activities ?? [];
  const unitOf = (number: string) => units.find(unit => String(unit.number) === number.trim());
  const detail = trpc.siteReports.get.useQuery({ ...scope, reportId: reportId ?? "" }, { enabled: enabled && Boolean(reportId) });
  const upload = useDirectUpload({ tenantId, projectId, purpose: "sitePhoto" });

  // Q-24 (P-120): a save that cannot reach the server is kept on this phone (with when it was kept) and sent when the connection returns; a report saved
  // after it was kept is not overwritten — the server refuses (PROJECT_OS_SITE_REPORT_CHANGED_SINCE) and the refusal is shown here
  const me = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const client = utils.client;
  const sendKept = useCallback(async (item: QueueItem): Promise<SendResult> => { await client.siteReports.save.mutate({ ...item.payload, clientRequestId: item.id } as never); }, [client]);
  const queue = useOfflineQueue(me.data?.id ? `${me.data.id}:${tenantId}:${projectId}:siteReport` : null, sendKept);
  // Q-58 (2): the draft saves itself a few seconds after a change (autoSaving marks those saves: no «saved» banner, no offline queue)
  const autoSaving = useRef(false);
  // the form's content as it was sent: once the server has it, that is the saved state the autosave compares with
  const sending = useRef<string | null>(null);
  const [autoSavedAt, setAutoSavedAt] = useState<Date | null>(null);
  const save = trpc.siteReports.save.useMutation({
    onSuccess: result => { setReportId(result.id); if (sending.current !== null) { setSavedSignature(sending.current); sending.current = null; } if (autoSaving.current) setAutoSavedAt(new Date()); else setMessage(t.saved); autoSaving.current = false; void utils.siteReports.list.invalidate(); },
    onError: (error, variables) => {
      sending.current = null;
      // an automatic save that fails is retried by the next change or by «save draft»; only the person's own save goes to the offline queue
      if (autoSaving.current) { autoSaving.current = false; return; }
      if (!isNetworkError(error) || !variables.clientRequestId) return;
      setMessage(queue.keep({ id: variables.clientRequestId, kind: "siteReport", payload: { ...variables, queuedAt: new Date().toISOString() }, summary: `${t.title} · ${variables.reportDate}` }) ? t.keptOffline : t.notKept);
    },
  });
  const submit = trpc.siteReports.submit.useMutation({
    onSuccess: result => {
      setLocked(true);
      const sent = result as { final?: boolean; applied?: unknown[]; skipped?: Array<{ reason?: string }> };
      const applied = sent.applied?.length ?? 0; const held = (sent.skipped ?? []).filter(cell => cell.reason === "QC_NOT_ACCEPTED").length;
      setMessage(sent.final ? [t.sentFinal, applied ? `${t.sentApplied} ${applied}.` : "", held ? `${t.sentHeld} ${held}` : ""].filter(Boolean).join(" ") : t.submitted);
      void utils.siteReports.list.invalidate();
    },
  });
  const attach = trpc.siteReports.attachPhoto.useMutation({ onSuccess: () => { setPhotoMessage(t.photoAdded); void detail.refetch(); } });

  const problems = useMemo(() => lines.flatMap(line => {
    if (line.lineType === "work") return !unitOf(line.unitNumber) || !line.activityId ? [line.key] : [];
    return line.label.trim() === "" ? [line.key] : [];
  }).concat(sectionProblems(sections), labourProblems(labourCells), equipmentProblems(dayEquipment), workHours.trim() !== "" && !(Number(workHours) >= 0 && Number(workHours) <= 24) ? ["workHours"] : []), [lines, units, sections, labourCells, dayEquipment, workHours]); // eslint-disable-line react-hooks/exhaustive-deps

  const body = () => ({
    // Q-58 (1): an opened report is named (several reports of one day are allowed); none is a new report
    ...scope, reportDate: date, ...(reportId ? { reportId } : { newReportId }), ...(label.trim() ? { label: label.trim() } : {}), weather: weather || undefined, temperatureC: num(temperature), summary: summary.trim() || undefined, obstacles: obstacles.trim() || undefined,
    lines: lines.map(line => ({
      lineType: line.lineType, label: line.lineType === "work" ? undefined : line.label.trim(), quantity: line.lineType === "work" ? undefined : num(line.quantity), hours: line.lineType === "labour" ? num(line.hours) : undefined,
      description: line.description.trim() || undefined, pmcUnitId: line.lineType === "work" ? unitOf(line.unitNumber)?.id : undefined,
      pmcActivityDefinitionId: line.activityId || undefined, reportedStatus: line.lineType === "work" ? line.reportedStatus : undefined,
    })),
    // the server replaces the four lists whole on each save, so all four go every time, empty ones included
    ...sectionsBody(sections),
    wind: wind || undefined, workHours: num(workHours),
    // a list goes only when what it is drawn from loaded: the server replaces a list that is sent, and a list left out stays as it is
    ...(companies.data && roles.data ? { labour: labourBody(labourCells) } : {}),
    ...(machines.data ? { equipment: equipmentBody(dayEquipment) } : {}),
  });

  const startNew = () => { setBaselinePending(true); setAutoSavedAt(null); setCurrent("header"); setReportId(null); setNewReportId(crypto.randomUUID()); setLabel(""); setCopyChoices(null); setLocked(false); setRejectedNote(null); setDate(today()); setWeather(""); setTemperature(""); setSummary(""); setObstacles(""); setLines([]); setSections(emptySections()); setWind(""); setWorkHours(""); setLabourCells({}); setDayEquipment({}); setMessage(null); setPhotoMessage(null); };
  const openReport = async (id: string) => {
    const full = await utils.siteReports.get.fetch({ ...scope, reportId: id });
    const unitNumber = (unitId: string | null) => String(units.find(unit => unit.id === unitId)?.number ?? "");
    setBaselinePending(true); setAutoSavedAt(null); setCurrent("header"); setReportId(id); setLabel((full.report as { label?: string | null }).label ?? ""); setDate(full.report.reportDate); setWeather(full.report.weather ?? ""); setTemperature(full.report.temperatureC === null || full.report.temperatureC === undefined ? "" : String(full.report.temperatureC));
    setSummary(full.report.summary ?? ""); setObstacles(full.report.obstacles ?? ""); setSections(sectionsFrom(full));
    setWind(full.report.wind ?? ""); setWorkHours(full.report.workHours === null || full.report.workHours === undefined ? "" : String(full.report.workHours));
    setLabourCells(labourFrom(full.labour ?? [])); setDayEquipment(equipmentFrom(full.equipment ?? []));
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
  const error = (save.error && !isNetworkError(save.error) ? save.error : null) ?? submit.error ?? attach.error ?? detail.error ?? copy.error; // a save kept offline is not an error

  const addPhoto = async (file: File | undefined) => {
    if (!file || !reportId) return;
    setPhotoMessage(t.uploading);
    try {
      const key = await upload.upload(file, file.type || "image/jpeg");
      await attach.mutateAsync({ ...scope, reportId, uploadKey: key, fileName: file.name || "photo.jpg", zone: photoZone.trim() || undefined, pmcUnitId: photoUnit.trim() ? unitOf(photoUnit)?.id : undefined });
    } catch { setPhotoMessage(null); }
  };

  const section = (lineType: Line["lineType"]) => lines.filter(line => line.lineType === lineType);
  const roleNames = (roles.data ?? []).filter(role => role.active).map(role => role.name);
  const machineNames = (machines.data ?? []).filter(item => item.active).map(item => [item.equipmentType, item.model, item.plateOrSize].filter(Boolean).join(" · "));
  // live totals for what can be counted now (the figure the server approves is its own)
  const total = (lineType: "labour" | "equipment") => section(lineType).reduce((sum, line) => sum + (num(line.quantity) ?? 0), 0);
  // Q-58 (2): each section's state in the strip — filled once it holds something; the safety, materials and inspections sections, while empty, are the HSE and
  // QA/QC engineers' to fill (shared/dailyReportSections.ts), so they say so instead of «empty»
  const sectionTitles: Record<SectionKey, string> = { header: t.header, work: t.work, labour: t.labour, equipment: t.equipment, materials: t.materials, inspections: t.inspections, hse: t.hse, obstacles: t.obstacles, tomorrow: t.tomorrow, photos: t.photos, review: t.approval };
  const filledOr = (filled: boolean, otherwise: SectionState = "empty"): SectionState => (filled ? "filled" : otherwise);
  const inspectionCount = (detail.data?.inspections?.wir.submitted ?? 0) + (detail.data?.inspections?.rfi.submitted ?? 0);
  const sectionStates: Record<SectionKey, SectionState> = {
    header: filledOr(Boolean(weather || temperature || summary.trim() || label.trim() || wind || workHours)),
    work: filledOr(section("work").length > 0),
    labour: filledOr(total("labour") + labourTotal(labourCells) > 0),
    equipment: filledOr(total("equipment") > 0 || Object.keys(dayEquipment).length > 0),
    materials: filledOr(sections.materials.length > 0, "other"),
    inspections: filledOr(Boolean(reportId) && inspectionCount > 0, "other"),
    hse: filledOr(sections.hse.length > 0, "other"),
    obstacles: filledOr(sections.obstacleItems.length > 0 || Boolean(obstacles.trim())),
    tomorrow: filledOr(sections.tomorrow.length > 0),
    photos: filledOr(Boolean(reportId) && (detail.data?.photos.length ?? 0) > 0),
    review: filledOr(locked),
  };
  // what the form holds, without the report's id: the autosave compares it with what was last saved (or opened), so opening a report — or one sent back,
  // whose reason a save would clear — never saves anything by itself
  const signature = JSON.stringify(body(), (key, value) => (key === "reportId" || key === "newReportId" ? undefined : value));
  const [savedSignature, setSavedSignature] = useState<string | null>(null);
  const [baselinePending, setBaselinePending] = useState(true);
  useEffect(() => { if (baselinePending) { setSavedSignature(signature); setBaselinePending(false); } }, [baselinePending, signature]);
  const somethingWritten = Object.entries(sectionStates).some(([key, state]) => key !== "review" && state === "filled");
  useEffect(() => {
    if (baselinePending || locked || !canWrite || save.isPending || problems.length > 0 || signature === savedSignature || (!reportId && !somethingWritten)) return;
    const timer = window.setTimeout(() => {
      autoSaving.current = true;
      sending.current = signature; save.mutate({ ...body(), clientRequestId: crypto.randomUUID() });
    }, AUTOSAVE_MS);
    return () => window.clearTimeout(timer);
  }, [signature, savedSignature, baselinePending, locked, canWrite, save.isPending, problems.length, reportId, somethingWritten]); // eslint-disable-line react-hooks/exhaustive-deps -- body() is read when the timer fires
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

  if (sectionOnly) return <FieldShell wide tenantId={tenantId} projectId={projectId} current="report" title={t.title} backHref={`/m/${tenantId}/${projectId}`} backLabel={t.back}><SectionOnlyReport tenantId={tenantId} projectId={projectId} access={reportSections} /></FieldShell>;
  if (options.isLoading || list.isLoading) return <FieldShell tenantId={tenantId} projectId={projectId} current="report" title={t.title} backHref={`/m/${tenantId}/${projectId}`} backLabel={t.back}><p role="status" className="text-sm text-muted-foreground">{t.loading}</p></FieldShell>;
  const loadError = options.error ?? list.error;
  if (loadError) return <FieldShell tenantId={tenantId} projectId={projectId} current="report" title={t.title} backHref={`/m/${tenantId}/${projectId}`} backLabel={t.back}><p role="alert" className="text-sm text-danger-soft-foreground">{getLocalizedProjectError(loadError, isArabic)}</p><Button className={tap} variant="outline" onClick={() => { void options.refetch(); void list.refetch(); }}>{t.retry}</Button></FieldShell>;

  return (
    <FieldShell wide tenantId={tenantId} projectId={projectId} current="report" title={t.title} backHref={`/m/${tenantId}/${projectId}`} backLabel={t.back}>
      <OfflineQueuePanel identityError={me.error} items={queue.items} online={queue.online} flushing={queue.flushing} onFlush={() => void queue.flush()} onDiscard={queue.discard} reason={item => offlineReasons(item.error, {}, language)} language={language} />
      {/* Q-58 (2): the page opens with «new report» and the reports with what each waits for */}
      <ReportsHeader scope={scope} reports={reports} me={me.data?.id ?? null} activeId={reportId} showDate={day => showDate(day, language)} onNew={startNew} newDisabled={!canWrite}
        onOpen={id => { void openReport(id); }} />
      <WriteGate permission="project.field.manage" projectId={projectId} reason={{ ar: text.ar.noPermission, en: text.en.noPermission, ur: text.ur.noPermission }}>
        {/* specification §3: sections 0 to 10 in order; one column on a phone (the site engineer), two on a desk (the planning engineer) */}
        {/* room under the last section for the save bar, which is fixed to the bottom of a phone's screen (a sticky bar would be lost in an overflow ancestor) */}
        <CheckedForm className="space-y-3 pb-24 lg:pb-0" onSubmit={event => { event.preventDefault(); if (locked || problems.length > 0 || save.isPending) return; setMessage(null); autoSaving.current = false; sending.current = signature; save.mutate({ ...body(), clientRequestId: crypto.randomUUID() }); }}>
          {!reportId && !locked && (
            <div className="space-y-1 rounded-xl border bg-card p-3" data-copy-yesterday>
              <Button type="button" variant="outline" className={tap} disabled={copy.isPending} onClick={() => { setMessage(null); copy.mutate({ ...scope, reportDate: date }); }}>{coreText.copy}</Button>
              <p className="text-xs text-muted-foreground">{coreText.copyHint}</p>
              {copyChoices && copyChoices.length > 0 && (
                <div role="group" aria-label={many.copyWhich} data-copy-which className="space-y-2">
                  <p className="text-sm font-semibold">{many.copyWhich}</p>
                  {copyChoices.map(choice => <Button key={choice.id} type="button" variant="outline" className={`${tap} w-full justify-start`} disabled={copy.isPending} onClick={() => { setMessage(null); copy.mutate({ ...scope, reportDate: date, sourceReportId: choice.id }); }}>{[choice.reportNumber, choice.label ?? many.noLabel].filter(Boolean).join(" · ")}</Button>)}
                </div>
              )}
            </div>
          )}
          {rejectedNote && <p role="note" className="rounded-xl bg-warning-soft p-3 text-sm text-warning-soft-foreground"><b>{t.rejectedNote}:</b> {rejectedNote}</p>}
          {locked && <p role="note" className="rounded-xl bg-muted p-3 text-sm text-muted-foreground">{t.locked}</p>}
          {/* Q-58 (2): every section with its state; a tap goes there (on a phone it becomes the one on screen) */}
          <SectionStrip titles={sectionTitles} states={sectionStates} current={current} onPick={goTo} />
          {/* two independent columns on a desk (the sections flow down the first, then the second), so a long section never leaves a hole beside a short one */}
          <div className="space-y-3 lg:columns-2 lg:gap-3 lg:space-y-0 [&>*]:break-inside-avoid lg:[&>*]:mb-3">
<ReportSection sectionKey="header" number={sectionNumber("header")} onPhone={current === "header"} footer={<StepButtons at="header" onGo={goTo} />} required={layout.required} title={t.header} summary={showDate(date, language)}>
              <label className="block text-sm font-medium">{t.day}<input className={`${fieldInput} mt-1`} type="date" value={date} max={today()} disabled={locked || Boolean(reportId)} onChange={event => setDate(event.target.value)} /></label>
              <p className="text-sm"><span className="text-muted-foreground">{t.weekday}: </span>{formatWeekday(date, language)}</p>
              <label className="block text-sm font-medium">{many.label}<input className={`${fieldInput} mt-1`} value={label} maxLength={120} disabled={locked} onChange={event => setLabel(event.target.value)} /><span className="mt-1 block text-xs font-normal text-muted-foreground">{many.labelHint}</span></label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-sm font-medium">{t.weather}
                  <Select className="mt-1" value={weather || NONE} disabled={locked} onValueChange={value => setWeather(value === NONE ? "" : value)}
                    options={[{ value: NONE, label: "—" }, ...WEATHER.map(value => ({ value, label: weatherName[value] }))]} /></label>
                <label className="block text-sm font-medium">{t.temperature}<input className={`${fieldInput} mt-1`} type="number" inputMode="decimal" step="any" value={temperature} disabled={locked} onChange={event => setTemperature(event.target.value)} /></label>
              </div>
              <label className="block text-sm font-medium">{t.summary}<textarea className="mt-1 min-h-[88px] w-full rounded-xl border bg-card p-3 text-base" value={summary} disabled={locked} onChange={event => setSummary(event.target.value)} /></label>
              <HeaderExtras wind={wind} workHours={workHours} onWind={setWind} onHours={setWorkHours} locked={locked} />
            </ReportSection>
            <ReportSection sectionKey="work" number={sectionNumber("work")} onPhone={current === "work"} footer={<StepButtons at="work" onGo={goTo} />} title={t.work} summary={t.lineCount(section("work").length)}>{group("work", t.work, t.addWork)}</ReportSection>
            <ReportSection sectionKey="labour" number={sectionNumber("labour")} onPhone={current === "labour"} footer={<StepButtons at="labour" onGo={goTo} />} title={t.labour} summary={t.workers(total("labour") + labourTotal(labourCells))}>
              {group("labour", t.labour, t.addLabour)}
              <SourceNotice query={companies} isArabic={isArabic} title={coreText.matrix} />
              <LabourMatrix companies={companies.data ?? []} roles={roles.data ?? []} cells={labourCells} onChange={setLabourCells} locked={locked} />
            </ReportSection>
            <ReportSection sectionKey="equipment" number={sectionNumber("equipment")} onPhone={current === "equipment"} footer={<StepButtons at="equipment" onGo={goTo} />} title={t.equipment} summary={t.units(total("equipment"))}>{group("equipment", t.equipment, t.addEquipment)}<EquipmentOfDay machines={machines.data ?? []} rows={dayEquipment} onChange={setDayEquipment} locked={locked} /></ReportSection>
            <ReportSection sectionKey="materials" number={sectionNumber("materials")} onPhone={current === "materials"} footer={<StepButtons at="materials" onGo={goTo} />} title={t.materials} summary={t.lineCount(sections.materials.length)}>
              {/* a list of approvals that failed to load says so; the choice stays at «no approval» meanwhile */}
              <SourceNotice query={submittals} isArabic={isArabic} title={sectionText.approval} />
              <MaterialsSection title={t.materials} rows={sections.materials} onChange={put("materials")} locked={locked} submittals={submittals.data ?? []} />
            </ReportSection>
            <ReportSection sectionKey="inspections" number={sectionNumber("inspections")} onPhone={current === "inspections"} footer={<StepButtons at="inspections" onGo={goTo} />} title={t.inspections} summary={detail.data?.inspections ? `WIR ${detail.data.inspections.wir.submitted} · RFI ${detail.data.inspections.rfi.submitted}` : undefined} defaultOpen={false}><InspectionsSection inspections={reportId ? detail.data?.inspections : undefined} /></ReportSection>
            <ReportSection sectionKey="hse" number={sectionNumber("hse")} onPhone={current === "hse"} footer={<StepButtons at="hse" onGo={goTo} />} title={t.hse} summary={hseSummary(sections.hse, sectionText) || t.lineCount(0)}><HseSection title={t.hse} rows={sections.hse} onChange={put("hse")} locked={locked} /></ReportSection>
            <ReportSection sectionKey="obstacles" number={sectionNumber("obstacles")} onPhone={current === "obstacles"} footer={<StepButtons at="obstacles" onGo={goTo} />} title={t.obstacles} summary={t.lineCount(sections.obstacleItems.length)}>
              <ObstaclesSection title={t.obstacles} rows={sections.obstacleItems} onChange={put("obstacleItems")} locked={locked} />
              <label className="block text-sm font-medium">{sectionText.freeText}<textarea className="mt-1 min-h-[64px] w-full rounded-xl border bg-card p-3 text-base" value={obstacles} disabled={locked} onChange={event => setObstacles(event.target.value)} /></label>
            </ReportSection>
            <ReportSection sectionKey="tomorrow" number={sectionNumber("tomorrow")} onPhone={current === "tomorrow"} footer={<StepButtons at="tomorrow" onGo={goTo} />} title={t.tomorrow} summary={t.lineCount(sections.tomorrow.length)}><TomorrowSection title={t.tomorrow} rows={sections.tomorrow} onChange={put("tomorrow")} locked={locked} /></ReportSection>
            <ReportSection sectionKey="photos" number={sectionNumber("photos")} onPhone={current === "photos"} footer={<StepButtons at="photos" onGo={goTo} />} title={t.photos}>
            {!reportId && <p className="text-sm text-muted-foreground">{t.photoNeedsSave}</p>}
            {reportId && !locked && <PhotoPlace zone={photoZone} unitNumber={photoUnit} onZone={setPhotoZone} onUnit={setPhotoUnit} unitKnown={Boolean(unitOf(photoUnit))} />}
            {reportId && !locked && <CameraCapture label={t.takePhoto} disabled={upload.busy || attach.isPending || (photoUnit.trim() !== "" && !unitOf(photoUnit))} onFile={file => { void addPhoto(file); }} />}
            {photoMessage && <p role="status" className="text-sm text-success-soft-foreground">{photoMessage}</p>}
            {reportId && (detail.data?.photos.length ? <ul className="grid grid-cols-3 gap-2">{detail.data.photos.map(photo => { const place = photoPlaceText(language, photo.zone ?? null, photo.pmcUnitId ? String(units.find(unit => unit.id === photo.pmcUnitId)?.number ?? "") || null : null); return <li key={photo.id}>{photo.url ? <img src={photo.url} alt={photo.caption ?? photo.fileName} className="aspect-square w-full rounded-lg object-cover" /> : <span className="text-xs text-muted-foreground">{photo.fileName}</span>}{place ? <span className="block text-xs text-muted-foreground" data-photo-place>{place}</span> : null}</li>; })}</ul> : <p className="text-sm text-muted-foreground">{t.noPhotos}</p>)}
            </ReportSection>
            <ReportSection sectionKey="review" number={sectionNumber("review")} onPhone={current === "review"} footer={<StepButtons at="review" onGo={goTo} />} title={t.approval} summary={reportId ? (locked ? t.pending : t.draft) : t.newReport} defaultOpen={current === "review"}>
              <p className="text-sm"><span className="text-muted-foreground">{t.statusNow}: </span>{reportId ? (locked ? t.pending : t.draft) : t.newReport}</p>
              <p className="text-sm font-medium">{t.chain}</p>
              <ApprovalChain scope={scope} reportId={reportId} status={detail.data?.report.status ?? null} approval={detail.data?.approval} onChanged={() => { void detail.refetch(); void utils.siteReports.list.invalidate(); }} />
            </ReportSection>
          </div>
          {error && <p role="alert" className="text-sm text-danger-soft-foreground">{getLocalizedProjectError(error, isArabic)}</p>}
          {message && <p role="status" className="rounded-xl bg-success-soft p-3 text-sm font-semibold text-success-soft-foreground">{message}</p>}
          {/* Q-56 (4a): once sent, where the report goes — or that nobody on the project can approve it yet */}
          {reportId && locked && (detail.data?.report.status ?? "submitted") === "submitted" && <WhoApproves scope={scope} preparedBy={detail.data?.report.preparedByUserId ?? me.data?.id ?? null} />}
          {!locked && (
            // the save bar stays in reach of the thumb while the site engineer scrolls the sections
            // Q-58 (2): one bar for the whole report, fixed to a phone's screen and held at the bottom of a desk's view while the sections scroll
            <div data-save-bar className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-2 gap-2 border-t bg-background p-3 shadow-[0_-4px_12px_rgb(0_0_0/0.06)] lg:sticky lg:px-0 lg:shadow-none">
              <p className="col-span-2 text-xs text-muted-foreground" role="status" data-autosaved={autoSavedAt ? "" : undefined}>{autoSavedAt ? layout.autosaved(formatDateTime(autoSavedAt, language)) : layout.autosaveHint}</p>
              <Button type="submit" variant="outline" className={`${tap} text-base`} disabled={problems.length > 0 || save.isPending}>{save.isPending ? t.saving : t.save}</Button>
              <Button type="button" className={`${tap} text-base`} disabled={!reportId || problems.length > 0 || submit.isPending} onClick={() => { setMessage(null); if (reportId) submit.mutate({ ...scope, reportId }); }}>{submit.isPending ? t.submitting : approvalOn ? t.submit : t.send}</Button>
            </div>
          )}
        </CheckedForm>
      </WriteGate>

      {reportId && detail.data && (
        <>
          <ReportExports language={language} fileBase={`daily-report-${detail.data.report.reportNumber ?? date}`} documentRef={documentRef} buttonClass={`${tap} rounded-xl border bg-card px-3 text-sm font-medium disabled:opacity-50`}
            onExcel={() => exportSheet.mutateAsync({ ...scope, reportId, format: "xlsx", locale: language })}
            onServerExport={format => exportSheet.mutateAsync({ ...scope, reportId, format, locale: language })} />
          {/* drawn off screen: the PDF is a picture of this element, and Word takes its HTML */}
          <div aria-hidden="true" style={{ position: "fixed", insetInlineStart: -20000, top: 0 }}>
            <DailyReportDocument ref={documentRef} data={detail.data} language={language}
              unitNumber={id => String(units.find(unit => unit.id === id)?.number ?? "—")}
              activityName={id => activities.find(activity => activity.id === id)?.name ?? "—"} />
          </div>
        </>
      )}

      {list.data && <DailyRangeExport tenantId={tenantId} projectId={projectId} />}

      {canReview && <ReviewPanel scope={scope} waiting={waiting} me={me.data?.id ?? null} t={t} language={language} isArabic={isArabic} onDone={() => { void utils.siteReports.list.invalidate(); }} />}
    </FieldShell>
  );
}

type Waiting = { id: string; reportDate: string; weather: string | null; preparedByUserId?: number | null };
type Cell = { unitId: string; activityDefinitionId: string };
type Preview = { id: string; applied: Array<Cell & { from: string | null; to: string }>; skipped: Cell[]; notAccepted: Cell[] };
function ReviewPanel({ scope, waiting, me, t, language, isArabic, onDone }: { scope: { tenantId: string; projectId: string }; waiting: Waiting[]; me: number | null; t: (typeof text)["en"]; language: "ar" | "en" | "ur"; isArabic: boolean; onDone: () => void }) {
  const [reason, setReason] = useState<Record<string, string>>({});
  const [done, setDone] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const options = trpc.siteReports.options.useQuery(scope);
  const review = trpc.siteReports.review.useMutation({
    onSuccess: (result, variables) => {
      // the server names the cells QC has not accepted as «notAccepted» (Q-56 4b: the list used to be read under another name and never showed)
      if (variables.dryRun) { setPreview({ id: variables.reportId, applied: result.applied, skipped: result.skipped, notAccepted: (result as { notAccepted?: Cell[] }).notAccepted ?? [] }); return; }
      setPreview(null); setDone(variables.decision === "approve" ? t.approvedDone : t.rejectedDone); onDone();
    },
    // Q-56 (4b): a refusal for QC opens the list of what holds it, with the way to approve without moving those villas
    onError: (error, variables) => { if (projectErrorCode(error) === "PROJECT_OS_QC_NOT_ACCEPTED" && !variables.dryRun) review.mutate({ ...variables, dryRun: true }); },
  });
  const cellName = (cell: Cell) => {
    const unit = options.data?.units.find(item => item.id === cell.unitId); const activity = options.data?.activities.find(item => item.id === cell.activityDefinitionId);
    return `${unit?.number ?? "?"} · ${activity ? `${activity.code} — ${activity.name}` : "?"}`;
  };
  return (
    <section className="space-y-2" aria-label={t.review}>
      <h2 className="text-base font-semibold">{t.review}</h2>
      <p className="text-sm text-muted-foreground">{t.reviewHint}</p>
      {done && <p role="status" className="rounded-xl bg-success-soft p-3 text-sm font-semibold text-success-soft-foreground">{done}</p>}
      {review.error && !(projectErrorCode(review.error) === "PROJECT_OS_QC_NOT_ACCEPTED" && preview) && <p role="alert" className="text-sm text-danger-soft-foreground">{getLocalizedProjectError(review.error, isArabic)}</p>}
      {waiting.length === 0 && <p className="text-sm text-muted-foreground">{t.nothingToReview}</p>}
      <ul className="space-y-3">
        {waiting.map(report => (
          <li key={report.id} className="space-y-2 rounded-xl border bg-card p-3" data-review={report.id}>
            <p className="text-sm font-semibold">{showDate(report.reportDate, language)}</p>
            {/* Q-56 (4a): the preparer does not approve their own report (the server refuses it): no buttons that can only fail, and who approves instead */}
            {me !== null && report.preparedByUserId === me ? <OwnReportNote scope={scope} preparedBy={me} /> : (
              <>
                <Button type="button" variant="outline" className={tap} disabled={review.isPending} onClick={() => review.mutate({ ...scope, reportId: report.id, decision: "approve", dryRun: true })}>{t.preview}</Button>
                {preview?.id === report.id && (
                  <div className="space-y-1 rounded-lg bg-muted p-2 text-sm" data-preview>
                    {preview.applied.length === 0 ? <p>{t.noMoves}</p> : <><p className="font-semibold">{t.willMove}</p><ul>{preview.applied.map(cell => <li key={`${cell.unitId}${cell.activityDefinitionId}`}>{cellName(cell)}: {cell.from ?? "—"} → {cell.to}</li>)}</ul></>}
                    {preview.skipped.length > 0 && <><p className="font-semibold">{t.willSkip}</p><ul>{preview.skipped.map(cell => <li key={`${cell.unitId}${cell.activityDefinitionId}`}>{cellName(cell)}</li>)}</ul></>}
                    {preview.notAccepted.length > 0 && (
                      <div className="space-y-2" data-qc-held={preview.notAccepted.length}>
                        <p className="font-semibold text-warning-soft-foreground">{t.qcHeld}</p>
                        <ul>{preview.notAccepted.map(cell => <li key={`${cell.unitId}${cell.activityDefinitionId}`}>{cellName(cell)}</li>)}</ul>
                        <Button type="button" variant="outline" className={`${tap} w-full`} disabled={review.isPending} onClick={() => review.mutate({ ...scope, reportId: report.id, decision: "approve", leaveNotAccepted: true })}>{t.leaveNotAccepted}</Button>
                      </div>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" className={tap} disabled={review.isPending} onClick={() => review.mutate({ ...scope, reportId: report.id, decision: "approve" })}>{t.approve}</Button>
                  <Button type="button" variant="outline" className={tap} disabled={review.isPending || !(reason[report.id] ?? "").trim()} onClick={() => review.mutate({ ...scope, reportId: report.id, decision: "reject", note: reason[report.id]!.trim() })}>{t.reject}</Button>
                </div>
                <input className={fieldInput} aria-label={t.reason} placeholder={t.reason} value={reason[report.id] ?? ""} onChange={event => setReason(current => ({ ...current, [report.id]: event.target.value }))} />
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
