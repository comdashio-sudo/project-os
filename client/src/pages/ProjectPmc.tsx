import { PmcRowCorrections, type AppliedEdit, type AppliedReplace, type PreviewRow } from "@/components/PmcRowCorrections";
import { ImportGrid } from "@/components/ImportGrid";
import { PmcColumnMapping, type PmcImportColumns } from "@/components/PmcColumnMapping";
import { ActivityNameToggle, hasEnglishNames, useActivityNameLanguage, type ActivityNameLanguage } from "@/lib/activityNames";
import { DirectImportRunner, type DirectImportView } from "@/components/DirectImportRunner";
import { ImportTemplatesList } from "@/components/ImportTemplates";
import { PmcColumnProfiles } from "@/components/PmcColumnProfiles";
import { SiteWorkbookImport } from "@/components/SiteWorkbookImport";
import { PageMain, PageHeader } from "@/components/pageFrame";
import { SectionErrorBoundary } from "@/components/SectionResilience";
import { Button } from "@/components/ui/button";
import { ALL, LabelledSelect } from "@/components/LabelledSelect";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { ErrorState } from "@/components/ScreenStates";
import { trpc } from "@/lib/trpc";
import { PmcImportKindList, PmcImportTemplateGuide } from "@/components/PmcImportGuide";
import type { PmcGuideKind } from "@/lib/pmcImportGuide";
import { ArrowLeft, Download, FileUp, Printer } from "lucide-react";
import { ProgressBoard } from "@/components/pmc/ProgressBoard";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { exportElementToPdf } from "@/lib/pdfExport";
import { Link, useParams } from "wouter";
import { PmcProgramme } from "./PmcProgramme";
import { PmcSitePlan } from "./PmcSitePlan";
import { PmcEditors } from "./PmcEditors";
import { WriteGate } from "@/lib/permissions";
import { ExportExcelButton } from "@/components/ExportExcelButton";
import type { ExportColumn } from "@/lib/excelExport";
import { pickLanguage } from "@/lib/language";
import { pmcImportReason } from "@/lib/pmcImportMessages";
import { wo22Text } from "@/lib/wo22Text";
import { SourcePercentages } from "@/components/pmc/SourcePercentages";
import { TableScroll } from "@/components/ds/TableScroll";
import { PMC_GUIDE_LABELS, PMC_NOT_IN_PLATFORM, PMC_TAB_GUIDE } from "@/lib/pmcTabGuide";

export const PMC_TEXT = {
  ar: {
    title: "ضبط المشروع PMC", back: "العودة إلى لوحة المشروع", loading: "جارٍ التحميل…", retry: "إعادة المحاولة", noData: "لا توجد بيانات", export: "تصدير Excel", pdf: "PDF", print: "طباعة", pdfFailed: "تعذّر بناء ملف PDF. اطبع من المتصفح بدلًا منه.",
    tabs: { board: "لوحة التقدّم", latestUpdates: "آخر التحديثات", approvals: "الاعتمادات", sitePlan: "المخطط", programme: "البرنامج الزمني", inspections: "الفحوصات", activities: "الأنشطة", zones: "المناطق", weekly: "الأسبوعي", monthly: "الشهري", pending: "المعلّق", stages: "المراحل", editors: "تحرير الوحدات والأوزان والحالة", import: "الاستيراد" },
    filters: { zone: "المنطقة", block: "البلوك", unitFrom: "من وحدة", unitTo: "إلى وحدة", group: "المجموعة", stage: "المرحلة", activity: "النشاط", period: "الفترة", all: "الكل", default: "الافتراضية", d7: "آخر 7 أيام", d30: "آخر 30 يومًا", d90: "آخر 90 يومًا", d365: "آخر 12 شهرًا", everything: "كل الفترة", contractor: "المقاول", consultant: "الاستشاري" },
    freshness: "حداثة البيانات", sources: { locations: "المواقع", catalog: "الكتالوج", status: "حالة الأنشطة", requests: "الطلبات", baseline: "خط الأساس" }, otherSource: "مصدر آخر", never: "لا تحديث بعد", today: "اليوم", daysAgo: (n: number) => (n === 1 ? "قبل يوم واحد" : n === 2 ? "قبل يومين" : n <= 10 ? `قبل ${n} أيام` : `قبل ${n} يومًا`),
    engineer: "المهندس", updates: "التحديثات", activeDays: "أيام نشطة", unitRange: "نطاق الوحدات", added: "النسبة المضافة", byGroup: "حسب المجموعة", total: "الإجمالي",
    request: "الطلب", activity: "النشاط", date: "التاريخ", contractor: "المقاول", consultant: "الاستشاري", reply: "الرد", units: "الوحدات", pendingReply: "معلّق", perConsultant: "الردود لكل استشاري", perDay: "الردود حسب اليوم", perActivity: "الردود حسب النشاط",
    stage: "الموقف", count: "العدد", percent: "النسبة", heldBy: "عند من الطلب", stalled: "أكثر الأنشطة تعطلًا", open: "مفتوح", oldestDays: "أقدم (أيام)",
    stageNames: { CONFIGURATIONS: "التهيئة", MANAGER_APPROVAL: "اعتماد المدير", TECHNICAL_ASSISTANT: "المساعد الفني", WAITING_CONSULTANT: "انتظار الاستشاري", RESULT_RECEIVING: "استلام النتيجة", ANSWERED: "تم الرد", REJECTED: "مرفوض", NOT_STARTED: "لم يبدأ" } as Record<string, string>,
    group: "المجموعة", weight: "الوزن", share: "النسبة من الوزن", zone: "المنطقة", cells: "الخلايا", complete: "المكتمل", completion: "الإنجاز", unassigned: "غير مسند",
    period: "الفترة من", status: "الحالة", statuses: { NOT_STARTED: "لم يبدأ", IN_PROGRESS: "قيد التنفيذ", UNDER_REVIEW: "قيد المراجعة", COMPLETE: "مكتمل" } as Record<string, string>,
    unit: "الوحدة", verification: "حالة التحقق", since: "منذ", age: "العمر (أيام)", buckets: "أعمار الانتظار", late: "أنشطة متأخرة", planned: "المخطط", actual: "الفعلي", noLate: "لا أنشطة متأخرة",
    savedTitle: "ما حُفظ", savedModel: "النموذج", savedActivities: "الأنشطة", savedTotal: "مجموع الأوزان", savedSkipped: "صفوف لم تُحفظ والسبب", savedNoSkips: "لم يُتخطَّ أي صف.", savedLeftOut: "صفوف تركتها أنت قبل الحفظ", openActivities: "افتح «الأنشطة» للتحقق", skippedTotals: "تُخطّيت أسطر إجمالي", ignoredColumns: "أعمدة في الملف لا يقرؤها الاستيراد (تُركت كما هي)", filledDown: "مُلئ القسم من السطر الذي فوقه (القسم مكتوب مرة واحدة فوق أنشطته)", outlineHeadings: "عناوين مرقّمة قُرئت منها المجموعة والمرحلة (لم تُستورد كأنشطة)", roundedTotals: "قُبل مجموع مقرّب كـ100% للنموذج", totalMatches: "سطر الإجمالي في الملف (الصف {row}): {file} يطابق مجموع ما قُرئ", totalDiffers: "سطر الإجمالي في الملف (الصف {row}): {file}، ومجموع ما قُرئ {sum}: صف لم يُقرأ أو إجمالي مكتوب يدويًا — راجع الصفوف المرفوضة والمتروكة", totalNotComparable: "سطر الإجمالي في الملف (الصف {row}) لا يُقارن: قيمته ليست رقمًا أو في الملف أكثر من نموذج", importKinds: { weights: "جدول الأوزان (القسم، البند الفرعي، النشاط، الوزن)", locations: "قائمة الفلل (الزون، البلوك، الفيلا، النموذج)", catalog: "الكتالوج والأوزان", status: "حالة الوحدة-النشاط", requests: "الطلبات والردود", baseline: "خط الأساس", baselineDates: "خط الأساس بتواريخ البداية والنهاية" } as Record<string, string>, ignoredZero: "صفوف تُجوهلت لأن وزنها صفر أو فارغ", scaledFractions: "الأوزان مكتوبة كسورًا (مجموعها 1) فقُرئت نسبًا مئوية.",
    importKind: "نوع الملف", confirmRows: (count: number) => `أؤكّد استيراد ${count} صف`, modelTotal: "مجموع أوزان النموذج", chooseFile: "اختر ملف Excel أو CSV", analyze: "فحص الملف", confirm: "حفظ الملف الموافَق عليه", report: "تقرير التحقق", rows: "الصفوف", create: "سيُنشأ", update: "سيُحدَّث", unchanged: "بلا تغيير", errorsFound: "صفوف مرفوضة", row: "الصف", reason: "السبب", saved: "تم الحفظ", nothingSaved: "لم يُحفظ شيء قبل موافقتك.", alreadyUpToDate: "الملف مطابق لما هو محفوظ: لا شيء ليُحفظ.",
  },
  en: {
    title: "Project control (PMC)", back: "Back to project board", loading: "Loading…", retry: "Retry", noData: "No data", export: "Export Excel", pdf: "PDF", print: "Print", pdfFailed: "Could not build the PDF. Print from the browser instead.",
    tabs: { board: "Progress board", latestUpdates: "Latest updates", approvals: "Approvals", sitePlan: "Site plan", programme: "Programme", inspections: "Inspections", activities: "Activities", zones: "Zones", weekly: "Weekly", monthly: "Monthly", pending: "Pending", stages: "Stages", editors: "Units, weights and status", import: "Import" },
    filters: { zone: "Zone", block: "Block", unitFrom: "From unit", unitTo: "To unit", group: "Group", stage: "Stage", activity: "Activity", period: "Period", all: "All", default: "Default", d7: "Last 7 days", d30: "Last 30 days", d90: "Last 90 days", d365: "Last 12 months", everything: "All time", contractor: "Contractor", consultant: "Consultant" },
    freshness: "Data freshness", sources: { locations: "Locations", catalog: "Catalogue", status: "Activity status", requests: "Requests", baseline: "Baseline" }, otherSource: "Other source", never: "never updated", today: "today", daysAgo: (n: number) => (n === 1 ? "1 day ago" : `${n} days ago`),
    engineer: "Engineer", updates: "Updates", activeDays: "Active days", unitRange: "Unit range", added: "Percent added", byGroup: "By group", total: "Total",
    request: "Request", activity: "Activity", date: "Date", contractor: "Contractor", consultant: "Consultant", reply: "Reply", units: "Units", pendingReply: "pending", perConsultant: "Replies per consultant", perDay: "Replies per day", perActivity: "Replies per activity",
    stage: "Stage", count: "Count", percent: "Percent", heldBy: "Held by", stalled: "Most stalled activities", open: "Open", oldestDays: "Oldest (days)",
    stageNames: { CONFIGURATIONS: "Configurations", MANAGER_APPROVAL: "Manager approval", TECHNICAL_ASSISTANT: "Technical assistant", WAITING_CONSULTANT: "Waiting for consultant", RESULT_RECEIVING: "Result receiving", ANSWERED: "Answered", REJECTED: "Rejected", NOT_STARTED: "Not started" } as Record<string, string>,
    group: "Group", weight: "Weight", share: "Share of weight", zone: "Zone", cells: "Cells", complete: "Complete", completion: "Completion", unassigned: "Unassigned",
    period: "Period from", status: "Status", statuses: { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", UNDER_REVIEW: "Under review", COMPLETE: "Complete" } as Record<string, string>,
    unit: "Unit", verification: "Verification status", since: "Since", age: "Age (days)", buckets: "Waiting age", late: "Late activities", planned: "Planned", actual: "Actual", noLate: "No late activities",
    savedTitle: "What was saved", savedModel: "Model", savedActivities: "Activities", savedTotal: "Total weight", savedSkipped: "Rows not saved, and why", savedNoSkips: "No row was skipped.", savedLeftOut: "Rows you left out before saving", openActivities: "Open «Activities» to check", skippedTotals: "Totals lines skipped", ignoredColumns: "Columns of the file the import does not read (left as they are)", filledDown: "Section filled from the row above (written once above its activities)", outlineHeadings: "Numbered headings that gave the group and stage (not imported as activities)", roundedTotals: "A rounded total accepted as 100% for model", totalMatches: "The file's totals line (row {row}): {file} matches the sum read", totalDiffers: "The file's totals line (row {row}): {file}, while the sum read is {sum}: a row was not read or the total was typed by hand — check the rejected and left-out rows", totalNotComparable: "The file's totals line (row {row}) is not compared: its value is not a number or the file has more than one model", importKinds: { weights: "Weights table (section, sub-item, activity, weight)", locations: "Villa list (zone, block, villa, model)", catalog: "Catalogue and weights", status: "Unit-activity status", requests: "Requests and replies", baseline: "Baseline", baselineDates: "Baseline by start and end dates" } as Record<string, string>, ignoredZero: "Rows skipped because their weight is zero or empty", scaledFractions: "The weights are written as fractions (totalling 1), so they were read as percentages.",
    importKind: "File type", confirmRows: (count: number) => `Confirm importing ${count} rows`, modelTotal: "Weights of model", chooseFile: "Choose an Excel or CSV file", analyze: "Check the file", confirm: "Save the approved file", report: "Validation report", rows: "Rows", create: "Will create", update: "Will update", unchanged: "Unchanged", errorsFound: "Rejected rows", row: "Row", reason: "Reason", saved: "Saved", nothingSaved: "Nothing is saved until you approve.", alreadyUpToDate: "The file matches what is stored: nothing to save.",
  }, ur: {
    title: "منصوبے کا کنٹرول (PMC)", back: "منصوبے کے کنٹرولز پر واپس", loading: "لوڈ ہو رہا ہے…", retry: "دوبارہ کوشش کریں", noData: "کوئی ڈیٹا نہیں", export: "Excel برآمد کریں", pdf: "PDF", print: "پرنٹ کریں", pdfFailed: "PDF نہیں بن سکی۔ اس کے بجائے براؤزر سے پرنٹ کریں۔",
    tabs: { board: "پیش رفت بورڈ", latestUpdates: "تازہ ترین اپ ڈیٹس", approvals: "منظوریاں", sitePlan: "سائٹ کا نقشہ", programme: "پروگرام", inspections: "معائنے", activities: "سرگرمیاں", zones: "زونز", weekly: "ہفتہ وار", monthly: "ماہانہ", pending: "زیرِ التوا", stages: "مراحل", editors: "یونٹس، وزن اور حیثیت", import: "درآمد" },
    filters: { zone: "زون", block: "بلاک", unitFrom: "یونٹ سے", unitTo: "یونٹ تک", group: "گروپ", stage: "مرحلہ", activity: "سرگرمی", period: "مدت", all: "سب", default: "طے شدہ", d7: "پچھلے 7 دن", d30: "پچھلے 30 دن", d90: "پچھلے 90 دن", d365: "پچھلے 12 مہینے", everything: "تمام مدت", contractor: "ٹھیکیدار", consultant: "مشیر" },
    freshness: "ڈیٹا کی تازگی", sources: { locations: "مقامات", catalog: "کیٹلاگ", status: "سرگرمیوں کی حالت", requests: "درخواستیں", baseline: "بنیادی منصوبہ" }, otherSource: "دیگر ماخذ", never: "ابھی تک اپ ڈیٹ نہیں ہوا", today: "آج", daysAgo: (n: number) => `${n} دن پہلے`,
    engineer: "انجینئر", updates: "اپ ڈیٹس", activeDays: "فعال دن", unitRange: "یونٹوں کی حد", added: "شامل کردہ فیصد", byGroup: "گروپ کے لحاظ سے", total: "کل",
    request: "درخواست", activity: "سرگرمی", date: "تاریخ", contractor: "ٹھیکیدار", consultant: "مشیر", reply: "جواب", units: "یونٹس", pendingReply: "زیرِ التوا", perConsultant: "فی مشیر جوابات", perDay: "فی دن جوابات", perActivity: "فی سرگرمی جوابات",
    stage: "مرحلہ", count: "تعداد", percent: "فیصد", heldBy: "کس کے پاس", stalled: "سب سے زیادہ رکی ہوئی سرگرمیاں", open: "کھلی", oldestDays: "سب سے پرانی (دن)",
    stageNames: { CONFIGURATIONS: "ترتیبات", MANAGER_APPROVAL: "مینیجر کی منظوری", TECHNICAL_ASSISTANT: "تکنیکی معاون", WAITING_CONSULTANT: "مشیر کا انتظار", RESULT_RECEIVING: "نتیجہ وصولی", ANSWERED: "جواب دیا گیا", REJECTED: "مسترد", NOT_STARTED: "شروع نہیں ہوا" } as Record<string, string>,
    group: "گروپ", weight: "وزن", share: "وزن میں حصہ", zone: "زون", cells: "خانے", complete: "مکمل", completion: "تکمیل", unassigned: "غیر تفویض شدہ",
    period: "مدت از", status: "حیثیت", statuses: { NOT_STARTED: "شروع نہیں ہوا", IN_PROGRESS: "جاری", UNDER_REVIEW: "زیرِ جائزہ", COMPLETE: "مکمل" } as Record<string, string>,
    unit: "یونٹ", verification: "تصدیق کی حیثیت", since: "سے", age: "عمر (دن)", buckets: "انتظار کی مدت", late: "تاخیر والی سرگرمیاں", planned: "منصوبہ بند", actual: "اصل", noLate: "کوئی تاخیر والی سرگرمی نہیں",
    savedTitle: "کیا محفوظ ہوا", savedModel: "ماڈل", savedActivities: "سرگرمیاں", savedTotal: "وزن کا مجموعہ", savedSkipped: "قطاریں جو محفوظ نہیں ہوئیں، اور کیوں", savedNoSkips: "کوئی قطار نہیں چھوڑی گئی۔", savedLeftOut: "قطاریں جو آپ نے محفوظ کرنے سے پہلے چھوڑیں", openActivities: "تصدیق کے لیے «سرگرمیاں» کھولیں", skippedTotals: "مجموعے کی سطریں چھوڑ دی گئیں", ignoredColumns: "فائل کے وہ کالم جو درآمد نہیں پڑھتی (جیسے ہیں ویسے چھوڑ دیے گئے)", filledDown: "سیکشن اوپر والی سطر سے بھرا گیا (اپنی سرگرمیوں کے اوپر ایک بار لکھا گیا)", outlineHeadings: "نمبر والے عنوانات جن سے گروپ اور مرحلہ پڑھا گیا (سرگرمی کے طور پر درآمد نہیں ہوئے)", roundedTotals: "ماڈل کے لیے گول مجموعہ 100% مانا گیا", totalMatches: "فائل کی مجموعے کی سطر (قطار {row}): {file} پڑھے گئے مجموعے کے برابر ہے", totalDiffers: "فائل کی مجموعے کی سطر (قطار {row}): {file}، جبکہ پڑھا گیا مجموعہ {sum} ہے: کوئی قطار نہیں پڑھی گئی یا مجموعہ ہاتھ سے لکھا گیا — مسترد اور چھوڑی گئی قطاریں دیکھیں", totalNotComparable: "فائل کی مجموعے کی سطر (قطار {row}) کا موازنہ نہیں ہوا: اس کی قدر عدد نہیں یا فائل میں ایک سے زیادہ ماڈل ہیں", importKinds: { weights: "وزن کی جدول (سیکشن، ذیلی آئٹم، سرگرمی، وزن)", locations: "ولاز کی فہرست (زون، بلاک، ولا، ماڈل)", catalog: "کیٹلاگ اور وزن", status: "یونٹ-سرگرمی کی حیثیت", requests: "درخواستیں اور جوابات", baseline: "بیس لائن", baselineDates: "آغاز اور اختتام کی تاریخوں سے بیس لائن" } as Record<string, string>, ignoredZero: "قطاریں چھوڑ دی گئیں کیونکہ ان کا وزن صفر یا خالی ہے", scaledFractions: "وزن کسور میں لکھے ہیں (مجموعہ 1)، اس لیے انہیں فیصد کے طور پر پڑھا گیا۔",
    importKind: "فائل کی قسم", confirmRows: (count: number) => `${count} قطاریں امپورٹ کرنے کی تصدیق کریں`, modelTotal: "ماڈل کے اوزان کا مجموعہ", chooseFile: "Excel یا CSV فائل منتخب کریں", analyze: "فائل جانچیں", confirm: "منظور شدہ فائل محفوظ کریں", report: "توثیق کی رپورٹ", rows: "قطاریں", create: "بنائے گا", update: "اپ ڈیٹ کرے گا", unchanged: "بغیر تبدیلی", errorsFound: "مسترد قطاریں", row: "قطار", reason: "وجہ", saved: "محفوظ ہو گیا", nothingSaved: "آپ کی منظوری تک کچھ محفوظ نہیں ہوتا۔", alreadyUpToDate: "فائل محفوظ ڈیٹا سے مطابقت رکھتی ہے: محفوظ کرنے کو کچھ نہیں۔",
  },
};
const text = PMC_TEXT;
// Q-66 (4): the line that says in which order the file's numeric dates were read, with an example
const DATE_ORDER = {
  ar: (order: "dmy" | "mdy", n: number) => order === "dmy" ? `قُرئت تواريخ الملف (${n}) يومًا أولًا: 05/09/2026 = 5 سبتمبر 2026. إن كان ملفك يكتب الشهر أولًا فصحّح الملف قبل التأكيد.` : `قُرئت تواريخ الملف (${n}) شهرًا أولًا لأن فيه تاريخًا لا يُقرأ إلا هكذا (مثل 12/25/2026): 09/05/2026 = 5 سبتمبر 2026.`,
  en: (order: "dmy" | "mdy", n: number) => order === "dmy" ? `The file's dates (${n}) were read day first: 05/09/2026 = 5 September 2026. If your file writes the month first, correct it before confirming.` : `The file's dates (${n}) were read month first, since one of them can only be read that way (such as 12/25/2026): 09/05/2026 = 5 September 2026.`,
  ur: (order: "dmy" | "mdy", n: number) => order === "dmy" ? `فائل کی تاریخیں (${n}) پہلے دن کے ساتھ پڑھی گئیں: 05/09/2026 = 5 ستمبر 2026۔ اگر آپ کی فائل پہلے مہینہ لکھتی ہے تو تصدیق سے پہلے درست کریں۔` : `فائل کی تاریخیں (${n}) پہلے مہینے کے ساتھ پڑھی گئیں کیونکہ ان میں سے ایک صرف اسی طرح پڑھی جا سکتی ہے (جیسے 12/25/2026): 09/05/2026 = 5 ستمبر 2026۔`,
};
// Q-66 (6): the note above the columns when a remembered choice was used
const REMEMBERED_MAPPING = {
  ar: (n: number) => `قُرئت الأعمدة بالربط الذي اختارته شركتك لملف بالشكل نفسه من قبل (${n} حقول). غيّره أدناه إن لزم.`,
  en: (n: number) => `The columns were read with the choice your company made for a file of this shape before (${n} fields). Change it below if needed.`,
  ur: (n: number) => `کالم اسی شکل کی فائل کے لیے آپ کی کمپنی کے پہلے کیے گئے انتخاب سے پڑھے گئے (${n} فیلڈز)۔ ضرورت ہو تو نیچے بدلیں۔`,
};
type T = typeof text.en;
const TABS = ["board", "latestUpdates", "approvals", "sitePlan", "programme", "inspections", "activities", "zones", "weekly", "monthly", "pending", "stages", "editors", "import"] as const;
type Tab = (typeof TABS)[number];
type Filters = { zone?: string; block?: string; unitFrom?: number; unitTo?: number; group?: string; stage?: string; activity?: string; contractor?: string; consultant?: string; since?: Date };
const field = "min-h-[44px] rounded-lg border border-input bg-card px-2 text-sm";

function Table({ label, headers, rows }: { label: string; headers: string[]; rows: Array<Array<React.ReactNode>> }) {
  return (
    <TableScroll label={label}>
      <table className="w-full min-w-[32rem] text-sm">
        <thead><tr className="text-xs text-muted-foreground">{headers.map(h => <th key={h} className="py-1 pe-3 text-start font-medium">{h}</th>)}</tr></thead>
        <tbody>{rows.map((row, i) => <tr key={i} className="border-t">{row.map((cell, j) => <td key={j} className="whitespace-nowrap py-1.5 pe-3">{cell}</td>)}</tr>)}</tbody>
      </table>
    </TableScroll>
  );
}

const heat = (percent: number) => ({ backgroundColor: `color-mix(in srgb, var(--primary) ${Math.round(Math.min(1, percent / 100) * 60)}%, transparent)` });
export const ageText = (t: T, days: number | null) => (days === null ? t.never : days === 0 ? t.today : t.daysAgo(days));

/** The column helpers, bound to one row type. Passed to a `columns` callback so the row type is known before the lambdas are typed. */
type Cols<Row> = {
  number: (header: string, get: (row: Row) => number | null | undefined) => Col<Row>;
  text: (header: string, get: (row: Row) => string | null | undefined, shown?: (row: Row) => React.ReactNode) => Col<Row>;
  percent: (header: string, get: (row: Row) => number | null | undefined, heated?: boolean) => Col<Row>;
  date: (header: string, get: (row: Row) => Date) => Col<Row>;
};
function helpersFor<Row>(): Cols<Row> {
  return { number: numberCol, text: textCol, percent: percentCol, date: dateCol };
}

/** A screen table with its own Excel button beside the heading. `exportRows` (default: all rows) is what the file gets; subtotal rows stay on screen only. */
function DataTable<Row>({ heading, exportAs, columns, rows, exportRows }: { heading?: React.ReactNode; exportAs: ExportAs; columns: (h: Cols<Row>) => Col<Row>[]; rows: readonly Row[]; exportRows?: readonly Row[] }) {
  const list = columns(helpersFor<Row>());
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {heading ? <h3 className="font-semibold">{heading}</h3> : <span />}
        <ExportExcelButton fileName={exportAs.file} sheetName={exportAs.sheet} title={exportAs.title} columns={list} rows={exportRows ?? rows} />
      </div>
      <Table label={typeof heading === "string" ? heading : exportAs.sheet} headers={list.map(column => column.header)} rows={rows.map(row => list.map(column => column.cell(row)))} />
    </div>
  );
}

/** A table column: `value` is the raw figure the Excel file gets, `cell` is what the screen shows. One list drives both. */
type Col<Row> = ExportColumn<Row> & { cell: (row: Row) => React.ReactNode };
type ExportAs = { file: string; sheet: string; title: string };
const isoDay = (date: Date) => date.toISOString().slice(0, 10);
function numberCol<Row>(header: string, get: (row: Row) => number | null | undefined): Col<Row> {
  return { header, kind: "number", value: row => get(row) ?? null, cell: row => get(row) ?? "" };
}
function textCol<Row>(header: string, get: (row: Row) => string | null | undefined, shown?: (row: Row) => React.ReactNode): Col<Row> {
  return { header, kind: "text", value: row => get(row) ?? null, cell: row => (shown ? shown(row) : (get(row) ?? "")) };
}
/** The screen holds percentages in points (25 means 25%); Excel gets the fraction 0.25 with a percent format. */
function percentCol<Row>(header: string, get: (row: Row) => number | null | undefined, heated = false): Col<Row> {
  return {
    header, kind: "percent",
    value: row => { const v = get(row); return v === null || v === undefined ? null : v / 100; },
    cell: row => {
      const v = get(row);
      if (v === null || v === undefined) return "—";
      return heated ? <span className="block rounded px-2 py-0.5" style={heat(v)}>{v}%</span> : `${v}%`;
    },
  };
}
function dateCol<Row>(header: string, get: (row: Row) => Date): Col<Row> {
  return { header, kind: "date", value: get, cell: row => isoDay(get(row)) };
}

type Options = { zones: string[]; blocks: string[]; groups: string[]; stages: string[]; activities: string[] };
type ScreenResult<D> = { data: D; freshness: Array<{ source: string; ageDays: number | null }>; options: Options };
type Query<D> = { isLoading: boolean; error: unknown; data?: ScreenResult<D>; refetch: () => unknown };

function Frame<D>({ query, t, isArabic, isEmpty, children, onOptions }: { query: Query<D>; t: T; isArabic: boolean; isEmpty: (data: D) => boolean; children: (data: D) => React.ReactNode; onOptions?: (options: Options) => void }) {
  const { language } = useLanguage();
  const options = query.data?.options;
  useEffect(() => { if (options) onOptions?.(options); }, [options]); // eslint-disable-line react-hooks/exhaustive-deps
  if (query.isLoading) return <p role="status" className="text-sm text-muted-foreground">{t.loading}</p>;
  if (!query.data) return <ErrorState isArabic={isArabic} error={query.error} title={pickLanguage(language, { ar: "تعذّر تحميل ضبط المشروع PMC", en: "The PMC workspace could not be loaded", ur: "PMC ورک اسپیس لوڈ نہیں ہو سکا" })} onRetry={() => query.refetch()} retryLabel={t.retry} />;
  return (
    <div className="space-y-4">
      <p className="flex flex-wrap gap-2 text-xs text-muted-foreground" data-testid="freshness"><b>{t.freshness}:</b>{query.data.freshness.map(f => <span key={f.source} className="rounded-full bg-muted px-2 py-0.5">{t.sources[f.source as keyof T["sources"]] ?? t.otherSource}: {ageText(t, f.ageDays)}</span>)}</p>
      {isEmpty(query.data.data) ? <p className="rounded-xl bg-muted p-4 text-sm text-muted-foreground">{t.noData}</p> : children(query.data.data)}
    </div>
  );
}

type ReplyRow = { key: string; A: number; B: number; C: number; UR: number; pending: number; total: number };
function ReplyTable({ title, exportAs, rows, t }: { title: string; exportAs: ExportAs; rows: ReplyRow[]; t: T }) {
  return <DataTable heading={title} exportAs={exportAs} rows={rows} columns={h => [
    textCol<ReplyRow>("", r => r.key), numberCol<ReplyRow>("A", r => r.A), numberCol<ReplyRow>("B", r => r.B), numberCol<ReplyRow>("C", r => r.C),
    numberCol<ReplyRow>("UR", r => r.UR), numberCol<ReplyRow>(t.pendingReply, r => r.pending), numberCol<ReplyRow>(t.total, r => r.total),
  ]} />;
}

type MatrixCell = { count: number; weightPoints: number; sharePercent: number };
/** One row of the activities matrix: a group subtotal (`label` null) or an activity under its group. */
type MatrixRow = { groupName: string; label: string | null; cells: MatrixCell[] };

function ScreenBody({ tab, tenantId, projectId, filters, t, isArabic, onData, names }: { tab: Exclude<Tab, "board" | "import" | "sitePlan" | "programme" | "editors">; tenantId: string; projectId: string; filters: Filters; t: T; isArabic: boolean; onData: (options: Options) => void; names?: ActivityNameLanguage }) {
  const { language } = useLanguage();
  // Q-49: the activity names in the chosen language (the server substitutes them; every figure is the same)
  const input = { tenantId, projectId, filters, names, language };
  const common = { t, isArabic, onOptions: onData };
  /** Export names: the file gets the screen's tab and the table's name, e.g. pmc-approvals-requests-<date>.xlsx. */
  const exp = (file: string, sheet: string): ExportAs => ({ file: `pmc-${tab}-${file}`, sheet, title: `${t.title} · ${sheet}` });
  if (tab === "latestUpdates") {
    const q = trpc.pmc.latestUpdates.useQuery(input);
    return <Frame {...common} query={q} isEmpty={d => d.engineers.length === 0}>{d => (<>
      <DataTable exportAs={exp("engineers", t.engineer)} rows={d.engineers} columns={h => [
        h.text(t.engineer, e => e.name), h.number(t.updates, e => e.updates), h.number(t.activeDays, e => e.activeDays),
        h.text(t.unitRange, e => `${e.unitFrom} – ${e.unitTo}`, e => <bdi dir="ltr">{`${e.unitFrom} – ${e.unitTo}`}</bdi>), h.percent(t.added, e => e.addedProjectPercent),
      ]} />
      <p className="text-sm">{t.total}: <b>{d.totals.updates}</b> · {t.added}: <b>{d.totals.addedProjectPercent}%</b></p>
      <DataTable heading={t.byGroup} exportAs={exp("by-group", t.byGroup)} rows={d.engineers.flatMap(e => e.byGroup.map(g => ({ engineer: e.name, group: g })))} columns={h => [
        h.text(t.engineer, r => r.engineer), h.text(t.group, r => r.group.groupName), h.number(t.updates, r => r.group.updates), h.percent(t.added, r => r.group.addedProjectPercent),
      ]} />
    </>)}</Frame>;
  }
  if (tab === "approvals") {
    const q = trpc.pmc.approvals.useQuery(input);
    return <Frame {...common} query={q} isEmpty={d => d.requests.length === 0}>{d => (<>
      <DataTable exportAs={exp("requests", t.request)} rows={d.requests} columns={h => [
        h.text(t.request, r => r.code), h.text(t.activity, r => r.activityCode), h.date(t.date, r => r.requestedAt),
        h.text(t.contractor, r => r.contractor, r => r.contractor ?? "—"), h.text(t.consultant, r => r.consultant, r => r.consultant ?? "—"),
        h.text(t.reply, r => r.response, r => r.response ?? t.pendingReply), h.number(t.units, r => r.units),
      ]} />
      <ReplyTable title={t.perConsultant} exportAs={exp("per-consultant", t.perConsultant)} rows={d.byConsultant} t={t} />
      <ReplyTable title={t.perDay} exportAs={exp("per-day", t.perDay)} rows={d.byDay} t={t} />
      <ReplyTable title={t.perActivity} exportAs={exp("per-activity", t.perActivity)} rows={d.byActivity} t={t} />
    </>)}</Frame>;
  }
  if (tab === "inspections") {
    const q = trpc.pmc.inspectionFlow.useQuery(input);
    return <Frame {...common} query={q} isEmpty={d => d.total === 0}>{d => (<>
      <DataTable exportAs={exp("by-stage", t.stage)} rows={d.byStage} columns={h => [
        h.text(t.stage, s => t.stageNames[s.stage] ?? s.stage), h.number(t.count, s => s.count), h.percent(t.percent, s => s.percent),
      ]} />
      <DataTable heading={t.heldBy} exportAs={exp("held-by", t.heldBy)} rows={d.heldBy} columns={h => [h.text(t.heldBy, h => h.holder), h.number(t.count, h => h.count)]} />
      <DataTable heading={t.stalled} exportAs={exp("stalled", t.stalled)} rows={d.stalledActivities} columns={h => [
        h.text(t.activity, a => `${a.activityCode} · ${a.activityName}`), h.number(t.open, a => a.open), h.number(t.oldestDays, a => a.oldestDays),
      ]} />
    </>)}</Frame>;
  }
  if (tab === "activities") {
    const q = trpc.pmc.activitiesMatrix.useQuery(input);
    return <Frame {...common} query={q} isEmpty={d => d.groups.length === 0}>{d => {
      // Group rows are subtotals: they stay on screen, the file gets one row per activity with its group name filled in.
      const matrixRows: MatrixRow[] = d.groups.flatMap(g => [
        { groupName: g.groupName, label: null, cells: g.cells },
        ...g.activities.map(a => ({ groupName: g.groupName, label: `${a.code} · ${a.name}`, cells: a.cells })),
      ]);
      const matrixColumns: Col<MatrixRow>[] = [
        textCol<MatrixRow>(t.group, r => r.groupName, r => (r.label === null ? <b>{r.groupName}</b> : "")),
        textCol<MatrixRow>(t.activity, r => r.label, r => r.label ?? ""),
        ...d.columns.flatMap((c, i) => [
          numberCol<MatrixRow>(`${c.label} #`, r => r.cells[i]?.count),
          numberCol<MatrixRow>(`${c.label} ${t.weight}`, r => r.cells[i]?.weightPoints),
          percentCol<MatrixRow>(`${c.label} %`, r => r.cells[i]?.sharePercent),
        ]),
      ];
      return <DataTable exportAs={exp("activities", t.activity)} rows={matrixRows} exportRows={matrixRows.filter(r => r.label !== null)} columns={() => matrixColumns} />;
    }}</Frame>;
  }
  if (tab === "zones") {
    const q = trpc.pmc.zonesView.useQuery(input);
    return <Frame {...common} query={q} isEmpty={d => d.rows.length === 0}>{d => (
      <DataTable exportAs={exp("zones", t.zone)} rows={d.rows} columns={h => [
        h.text(t.zone, r => r.zoneCode), h.text(t.stage, r => r.stageName), h.text(t.engineer, r => r.engineer, r => r.engineer ?? t.unassigned),
        h.number(t.cells, r => r.cells), h.number(t.complete, r => r.completeCells), h.number(t.weight, r => r.weightComplete),
        h.percent(t.completion, r => r.completionPercent, true),
      ]} />
    )}</Frame>;
  }
  if (tab === "weekly" || tab === "monthly") {
    const q = tab === "weekly" ? trpc.pmc.weeklyReport.useQuery(input) : trpc.pmc.monthlyReport.useQuery(input);
    return <Frame {...common} query={q} isEmpty={d => d.periods.length === 0}>{d => (<>
      <DataTable exportAs={exp("periods", t.period)} rows={d.periods} columns={h => [
        h.text(t.period, p => p.from), h.number(t.updates, p => p.updates), h.percent(t.added, p => p.addedProjectPercent),
        h.text(t.byGroup, p => p.byGroup.map(g => `${g.groupCode} ${g.addedProjectPercent}%`).join(" · ")),
        h.text(t.status, p => p.byStatus.map(s => `${t.statuses[s.status]} ${s.updates}`).join(" · ")),
      ]} />
      <DataTable exportAs={exp("by-engineer", t.engineer)} rows={d.periods.flatMap(p => p.rows.map(r => ({ from: p.from, engineer: r.engineer, activityCode: r.activityCode, updates: r.updates })))} columns={h => [
        h.text(t.period, r => r.from), h.text(t.engineer, r => r.engineer), h.text(t.activity, r => r.activityCode), h.number(t.updates, r => r.updates),
      ]} />
    </>)}</Frame>;
  }
  if (tab === "pending") {
    const q = trpc.pmc.pendingAtVerifier.useQuery(input);
    return <Frame {...common} query={q} isEmpty={d => d.total === 0}>{d => (<>
      <p className="flex flex-wrap gap-2 text-sm"><b>{t.buckets}:</b>{d.buckets.map(b => <span key={b.label} className="rounded-full bg-muted px-2 py-0.5">{b.label}: {b.count}</span>)}</p>
      <DataTable exportAs={exp("rows", t.unit)} rows={d.rows} columns={h => [
        h.number(t.unit, r => r.unitNumber), h.text(t.activity, r => `${r.activityCode} · ${r.activityName}`), h.text(t.verification, r => r.verificationStatus),
        h.text(t.engineer, r => r.engineer, r => r.engineer ?? t.unassigned), h.date(t.since, r => r.since), h.number(t.age, r => r.ageDays),
      ]} />
    </>)}</Frame>;
  }
  const q = trpc.pmc.stagesView.useQuery(input);
  return <Frame {...common} query={q} isEmpty={d => d.stages.length === 0}>{d => (
    <div className="space-y-4">{d.stages.map(s => (
      <div key={s.stageCode}>
        <DataTable heading={<>{s.stageName} <span className="text-xs font-normal text-muted-foreground">({s.total})</span></>} exportAs={exp(`stage-${s.stageCode}`, s.stageName)} rows={s.byStatus} columns={h => [
          h.text(t.status, b => t.statuses[b.status]), h.number(t.count, b => b.count), h.number(t.weight, b => b.weightPoints), h.percent(t.percent, b => b.percent, true),
        ]} />
        <p className="mt-1 text-sm">{t.late}: {s.lateActivities.length === 0 ? t.noLate : s.lateActivities.map(a => `${a.activityCode} (${t.actual} ${a.actualPercent}% / ${t.planned} ${a.plannedPercent}%)`).join(" · ")}</p>
      </div>))}</div>
  )}</Frame>;
}

function ImportPanel({ tenantId, projectId, t, isArabic, onOpenActivities }: { tenantId: string; projectId: string; t: T; isArabic: boolean; onOpenActivities: () => void }) {
  const { language } = useLanguage();
  const [kind, setKind] = useState<PmcGuideKind>("weights");
  // asked again every few seconds while an import is on its way, so «analysing» turns into «waiting for confirmation» or «import complete» by itself
  const importStatus = trpc.pmc.importStatus.useQuery({ tenantId, projectId }, { refetchInterval: query => (query.state.data?.some(row => row.state === "analyzing" || row.state === "pending") ? 5000 : false) });
  // The file goes browser → Storage on a signed URL (up to 50 MB), is analysed by a background job with a progress bar, and is written only after the person has read the report and confirmed.
  type Report = { totalRows: number; errorCount: number; errors: Array<{ rowNumber: number; code: string; field?: string; detail?: string }>; counts: { create: number; update: number; unchanged: number }; details?: { dateOrder?: { order: "dmy" | "mdy"; dates: number }; rememberedMapping?: { name: string; fields: string[] }; edits?: AppliedEdit[]; replaced?: AppliedReplace[]; ignoredRows?: number[]; readRows?: number[]; preview?: PreviewRow[]; ignoredZeroWeight?: number; scaledFromFractions?: boolean; skippedTotals?: number; filledDown?: number; outlineHeadings?: number; ignoredColumns?: Array<{ header: string; samples: string[] }>; roundedTotals?: Array<{ modelCode: string; totalWeight: number }>; totalChecks?: Array<{ row: number; fileValue: number | null; readSum: number; status: "matches" | "differs" | "not_comparable" }>; columns?: PmcImportColumns; models?: Array<{ modelCode: string; activities: number; totalWeight: number }> } };
  const renderReport = (view: DirectImportView) => {
    const report = (view.external?.report as { pmc?: Report } | undefined)?.pmc;
    if (!report) return null;
    return (
      <div className="space-y-3" data-testid="import-report">
        <h3 className="font-semibold">{t.report}</h3>
        <p className="flex flex-wrap gap-2 text-sm"><span className="rounded-full bg-muted px-2 py-0.5">{t.rows}: {report.totalRows}</span><span className="rounded-full bg-success-soft px-2 py-0.5">{t.create}: {report.counts.create}</span><span className="rounded-full bg-warning-soft px-2 py-0.5">{t.update}: {report.counts.update}</span><span className="rounded-full bg-muted px-2 py-0.5">{t.unchanged}: {report.counts.unchanged}</span><span className={`rounded-full px-2 py-0.5 ${report.errorCount ? "bg-danger-soft text-danger-soft-foreground" : "bg-muted"}`}>{t.errorsFound}: {report.errorCount}</span></p>
        {/* Q-3: what the weights table did quietly is said, not hidden: rows skipped for a zero weight, fractions read as percentages */}
        {(report.details?.ignoredZeroWeight ?? 0) > 0 && <p className="text-sm text-muted-foreground" data-ignored-zero>{t.ignoredZero}: {report.details!.ignoredZeroWeight}</p>}
        {report.details?.scaledFromFractions && <p className="text-sm text-muted-foreground" data-scaled-fractions>{t.scaledFractions}</p>}
        {/* review of #370 and Q-47: a totals line skipped, a section filled down, a rounded total accepted — said, never silent */}
        {(report.details?.skippedTotals ?? 0) > 0 && <p className="text-sm text-muted-foreground" data-skipped-totals>{t.skippedTotals}: {report.details!.skippedTotals}</p>}
        {(report.details?.filledDown ?? 0) > 0 && <p className="text-sm text-muted-foreground" data-filled-down>{t.filledDown}: {report.details!.filledDown}</p>}
        {(report.details?.outlineHeadings ?? 0) > 0 && <p className="text-sm text-muted-foreground" data-outline-headings>{t.outlineHeadings}: {report.details!.outlineHeadings}</p>}
        {/* Q-48: every column no field reads is named with a few of its values (the division, its weight and value, the scope column…): seen, not lost */}
        {(report.details?.ignoredColumns ?? []).length > 0 && (
          <div className="text-sm text-muted-foreground" data-ignored-columns>
            <p>{t.ignoredColumns}:</p>
            <ul className="ms-4 list-disc">{report.details!.ignoredColumns!.map(column => <li key={column.header}><bdi className="font-medium text-foreground">{column.header}</bdi>{column.samples.map((sample, index) => <span key={index}>{index === 0 ? " — " : "، "}<bdi>{sample}</bdi></span>)}</li>)}</ul>
          </div>
        )}
        {/* Q-50 batch 5a: the file's own totals line against what was read — said, never fixed */}
        {(report.details?.totalChecks ?? []).map(item => {
          const fill = (template: string) => template.replace("{row}", String(item.row)).replace("{file}", String(item.fileValue ?? "—")).replace("{sum}", String(item.readSum));
          return <p key={`total-${item.row}`} data-total-check={item.status} className={item.status === "differs" ? "rounded-md bg-warning-soft px-2 py-1 text-sm text-warning-soft-foreground" : "text-sm text-muted-foreground"}>{fill(item.status === "matches" ? t.totalMatches : item.status === "differs" ? t.totalDiffers : t.totalNotComparable)}</p>;
        })}
        {(report.details?.roundedTotals ?? []).map(item => <p key={item.modelCode} className="rounded-md bg-warning-soft px-2 py-1 text-sm text-warning-soft-foreground" data-rounded-total>{t.roundedTotals} {item.modelCode}: {item.totalWeight}</p>)}
        {report.errors.length > 0 && <DataTable exportAs={{ file: "pmc-import-rejected-rows", sheet: t.errorsFound, title: `${t.title} · ${t.errorsFound}` }} rows={report.errors} columns={h => [
          { header: t.row, kind: "number", value: e => e.rowNumber || null, cell: e => e.rowNumber || "—" },
          h.text(t.reason, e => pmcImportReason(e, language)),
        ]} />}
        {/* Q-66 batch 1: the file after processing, as a grid like Excel — every row, each cell with what the reader did, corrected in place */}
        {report.details?.columns && (view.status === "uploaded" || view.status === "validated") && <ImportGrid key={`${view.id}:grid:${JSON.stringify(report.details.columns.fields)}`} tenantId={tenantId} projectId={projectId} importId={view.id} columns={report.details.columns} applied={report.details.edits ?? []} ignoredRows={report.details.ignoredRows ?? []} readRows={report.details.readRows ?? []} replaced={report.details.replaced ?? []} language={language}
          checks={(report.details.models ?? []).map(model => ({ label: `${t.modelTotal} ${model.modelCode}`, ok: Math.abs(model.totalWeight - 100) <= 0.01, detail: `${model.totalWeight}%` }))} />}
        {/* Q-50 batch 4b: a rejected row corrected here (a cell, or the row left out) instead of in Excel — audited, and analysed again before anything is written */}
        {report.details?.columns && (report.errors.some(error => error.rowNumber > 0) || (report.details.edits ?? []).length > 0 || (report.details.ignoredRows ?? []).length > 0 || (report.details.preview ?? []).length > 0) && <PmcRowCorrections key={`${view.id}:corrections:${JSON.stringify([report.details.edits ?? [], report.details.ignoredRows ?? [], report.details.readRows ?? [], report.errors.map(error => error.rowNumber)])}`} tenantId={tenantId} projectId={projectId} importId={view.id} errors={report.errors} fields={report.details.columns.fields.filter(field => field.header).map(field => field.key)} applied={report.details.edits ?? []} ignoredRows={report.details.ignoredRows ?? []} readRows={report.details.readRows ?? []} preview={report.details.preview ?? []} replaced={report.details.replaced ?? []} language={language} />}
        {report.errorCount === 0 && view.external && !view.external.canConfirm && <p className="text-sm text-muted-foreground">{t.alreadyUpToDate}</p>}
        {/* Q-66 (4): how the file's numeric dates were read — a month-first file whose every day is 12 or less is seen before it is confirmed */}
        {report.details?.dateOrder && <p className="rounded-md bg-muted px-2 py-1 text-sm" data-date-order={report.details.dateOrder.order}>{pickLanguage(language, DATE_ORDER)(report.details.dateOrder.order, report.details.dateOrder.dates)}</p>}
        {/* Q-66 (6): the columns were read with the choice this company made for a file of the same shape — said, and still changeable below */}
        {report.details?.rememberedMapping && <p className="rounded-md bg-info-soft px-2 py-1 text-sm text-info-soft-foreground" data-remembered-mapping>{pickLanguage(language, REMEMBERED_MAPPING)(report.details.rememberedMapping.fields.length)}</p>}
        {/* Q-31 (P0-02): which column each field came from; a person can pick another one and analyse again (key: a new report resets the choice) */}
        {report.details?.columns && <PmcColumnMapping key={`${view.id}:${JSON.stringify(report.details.columns.fields)}`} tenantId={tenantId} projectId={projectId} importId={view.id} columns={report.details.columns} language={language} isArabic={isArabic} />}
      </div>
    );
  };
  // Q-56 (5): after saving, the screen says what was saved — activities and their total per model, the rows not saved and why — and opens «Activities» to check
  const renderResult = (view: DirectImportView) => {
    const report = (view.external?.report as { pmc?: Report } | undefined)?.pmc;
    if (!report) return null;
    const models = report.details?.models ?? [];
    const skipped = ([[t.skippedTotals, report.details?.skippedTotals ?? 0], [t.ignoredZero, report.details?.ignoredZeroWeight ?? 0], [t.outlineHeadings, report.details?.outlineHeadings ?? 0], [t.savedLeftOut, report.details?.ignoredRows?.length ?? 0]] as Array<[string, number]>).filter(([, count]) => count > 0);
    return (
      <div className="space-y-3 rounded-xl border border-border p-3" data-testid="import-result">
        <h3 className="font-semibold">{t.savedTitle}</h3>
        {models.length > 0 && <TableScroll label={t.savedTitle}><table className="w-full text-sm" data-import-result-models>
          <thead><tr className="text-muted-foreground"><th scope="col" className="p-2 text-start">{t.savedModel}</th><th scope="col" className="p-2 text-start">{t.savedActivities}</th><th scope="col" className="p-2 text-start">{t.savedTotal}</th></tr></thead>
          <tbody>{models.map(model => <tr key={model.modelCode} className="border-t border-border"><td className="p-2"><bdi>{model.modelCode}</bdi></td><td className="p-2">{model.activities}</td><td className="p-2"><bdi>{model.totalWeight}%</bdi></td></tr>)}</tbody>
        </table></TableScroll>}
        <div className="text-sm" data-import-result-skipped>{skipped.length ? <><p className="font-medium">{t.savedSkipped}</p><ul className="ms-4 list-disc">{skipped.map(([reason, count]) => <li key={reason}>{reason}: {count}</li>)}</ul></> : <p className="text-muted-foreground">{t.savedNoSkips}</p>}</div>
        {models.length > 0 && <Button type="button" variant="outline" className="min-h-[44px]" onClick={onOpenActivities}>{t.openActivities}</Button>}
      </div>
    );
  };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">{t.nothingSaved}</p>
      <WriteGate permission={"project.pmc.manage"} projectId={projectId}><div className="space-y-3">
        {/* Q-35: the kinds with what the saved imports say about each, and the chosen template explained */}
        <PmcImportKindList kind={kind} onChange={setKind} labels={t.importKinds} statuses={importStatus.data} statusFailed={Boolean(importStatus.error)} language={language} />
        <PmcImportTemplateGuide kind={kind} language={language} />
        <DirectImportRunner tenantId={tenantId} projectId={projectId} moduleCode={`pmc.${kind}`} isArabic={isArabic} fileLabel={t.chooseFile} analyzeLabel={t.analyze} confirmLabel={view => { const rows = (view.external?.report as { pmc?: Report } | undefined)?.pmc?.totalRows; return rows ? t.confirmRows(rows) : t.confirm; }} showErrors={false} renderReport={renderReport} renderResult={renderResult} templates />
        {/* Q-50 batch 2b: the company's saved PMC column templates */}
        <ImportTemplatesList tenantId={tenantId} projectId={projectId} kinds={Object.keys(t.importKinds).map(code => `pmc.${code}`)} kindLabel={code => (t.importKinds as Record<string, string>)[code.replace(/^pmc\./, "")]} language={language} />
        <PmcColumnProfiles tenantId={tenantId} projectId={projectId} language={language} kindLabel={kind => (t.importKinds as Record<string, string>)[kind]} />
      </div></WriteGate>
      {/* D-59: the site's old workbook — what the site-update screen and the S-curve stand on; their empty states link here (?tab=import) */}
      <WriteGate permission={"project.pmc.manage"} projectId={projectId}><SiteWorkbookImport tenantId={tenantId} projectId={projectId} /></WriteGate>
    </div>
  );
}

const PERIODS = [["default", undefined], ["d7", 7], ["d30", 30], ["d90", 90], ["d365", 365], ["everything", 36500]] as const;

/** The whole PMC workspace. `embedded` (inside the project board page, G-051) renders a plain block instead of a full-page <PageMain>, so the page keeps its single main landmark. */
export function ProjectPmcWorkspace({ embedded = false }: { embedded?: boolean }) {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { isArabic, isRtl, language } = useLanguage();
  const t = pickLanguage(language, text);
  // «?tab=import» opens the import directly (the S-curve's empty state links here)
  const [tab, setTab] = useState<Tab>(() => { const asked = typeof window === "undefined" ? null : new URLSearchParams(window.location.search).get("tab"); return (TABS as readonly string[]).includes(asked ?? "") ? asked as Tab : "latestUpdates"; });
  const [filters, setFilters] = useState<Filters>({});
  const bodyRef = useRef<HTMLElement>(null);
  const tabsRef = useRef<HTMLElement>(null);
  // Q-69: the open tab is scrolled into the row's view (a phone shows three or four of the fourteen)
  useEffect(() => { tabsRef.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest", inline: "nearest" }); }, [tab]);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [pdfError, setPdfError] = useState(false);
  const [period, setPeriod] = useState<(typeof PERIODS)[number][0]>("default");
  const [options, setOptions] = useState<Options>({ zones: [], blocks: [], groups: [], stages: [], activities: [] });
  const days = PERIODS.find(([key]) => key === period)![1];
  const since = useMemo(() => (days === undefined ? undefined : new Date(new Date().setUTCHours(0, 0, 0, 0) - days * 86_400_000)), [days]);
  const effective = useMemo(() => ({ ...filters, since }), [filters, since]);
  // Q-49: the activity names switch, offered when the project has an English name
  const [nameLanguage, setNameLanguage] = useActivityNameLanguage();
  const structure = trpc.pmc.structure.useQuery({ tenantId, projectId }, { enabled: Boolean(tenantId && projectId) });
  // a structure that could not be read offers no switch: the names stay as stored (the screens below say their own failures)
  const withEnglish = !structure.error && (structure.data?.models ?? []).some(model => hasEnglishNames(model.activities) || model.activities.some(activity => activity.sectionEn || activity.subEn));
  const names = withEnglish ? nameLanguage : undefined;
  const exportScreen = trpc.pmc.exportScreen.useMutation({
    onSuccess: file => { const bytes = Uint8Array.from(atob(file.base64), c => c.charCodeAt(0)); const url = URL.createObjectURL(new Blob([bytes], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })); const link = document.createElement("a"); link.href = url; link.download = file.fileName; link.click(); URL.revokeObjectURL(url); },
  });
  const screenOfTab: Record<Exclude<Tab, "board" | "import" | "sitePlan" | "programme" | "editors">, "latestUpdates" | "approvals" | "inspections" | "activities" | "zones" | "weekly" | "monthly" | "pending" | "stages"> = { latestUpdates: "latestUpdates", approvals: "approvals", inspections: "inspections", activities: "activities", zones: "zones", weekly: "weekly", monthly: "monthly", pending: "pending", stages: "stages" };
  const select = (key: keyof Filters, label: string, values: string[]) => (
    <LabelledSelect label={label} value={(filters[key] as string | undefined) ?? ALL} onValueChange={value => setFilters({ ...filters, [key]: value === ALL ? undefined : value })} options={[{ value: ALL, label: t.filters.all }, ...values.map(v => ({ value: v, label: v }))]} />
  );
  return (
    <Shell embedded={embedded} isArabic={isArabic} isRtl={isRtl}>
      <div className="mx-auto max-w-7xl space-y-4">
        <PageHeader className="flex flex-wrap items-center justify-between gap-3 print:hidden">
          <div>{embedded ? <h2 className="text-xl font-semibold">{t.title}</h2> : <h1 className="text-2xl font-semibold">{t.title}</h1>}</div>
          {tab !== "board" && tab !== "import" && tab !== "sitePlan" && tab !== "programme" && tab !== "editors" && <div className="flex gap-2">
            <Button variant="outline" className="min-h-[44px]" disabled={exportScreen.isPending} onClick={() => exportScreen.mutate({ tenantId, projectId, screen: screenOfTab[tab], locale: language, filters: effective, names })}><Download className="me-1 h-4 w-4" />{t.export}</Button>
            <Button variant="outline" className="min-h-[44px]" disabled={pdfBusy} onClick={async () => { if (!bodyRef.current) return; setPdfBusy(true); setPdfError(false); try { await exportElementToPdf(bodyRef.current, `project-os-pmc-${tab}`); } catch (error) { console.error("PDF export failed:", error instanceof Error ? error.message : String(error)); setPdfError(true); } finally { setPdfBusy(false); } }}><Download className="me-1 h-4 w-4" />{t.pdf}</Button>
            <Button variant="outline" className="min-h-[44px]" onClick={() => window.print()}><Printer className="me-1 h-4 w-4" />{t.print}</Button>
          </div>}
        </PageHeader>
        {/* Work order 22: the three percentages and the two site screens */}
        <section className="space-y-3 print:hidden"><div className="flex flex-wrap gap-2"><Link href={`/projects/${tenantId}/${projectId}/site-consultant`}><Button variant="outline" className="min-h-[44px]">{pickLanguage(language, wo22Text).goToComparison}</Button></Link><Link href={`/m/${tenantId}/${projectId}/site-update`}><Button variant="outline" className="min-h-[44px]">{pickLanguage(language, wo22Text).goToUpdate}</Button></Link></div><SourcePercentages tenantId={tenantId} projectId={projectId} levels={false} /></section>
        {withEnglish && <div className="print:hidden"><ActivityNameToggle value={nameLanguage} onChange={setNameLanguage} /></div>}
        {/* Q-69: one row of tabs kept under the header, scrolling sideways on a phone instead of wrapping into four rows */}
        <nav ref={tabsRef} role="tablist" data-pmc-tabs="" style={{ top: "var(--shell-top, 0px)" }} className="sticky z-20 -mx-4 flex gap-2 overflow-x-auto border-b border-border bg-background/95 px-4 py-2 backdrop-blur print:hidden">{TABS.map(key => <button key={key} role="tab" type="button" aria-selected={tab === key} className={`min-h-[44px] shrink-0 whitespace-nowrap rounded-[var(--radius)] border px-4 text-sm font-medium ${tab === key ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card text-foreground hover:bg-muted"}`} onClick={() => setTab(key)}>{t.tabs[key]}</button>)}</nav>
        {/* Q-37 (c): what the open tab is for and when to use it; the whole list, and what PMC does not have, one click away */}
        <section className="space-y-2 print:hidden" data-pmc-tab-guide={tab}>
          <p className="text-sm text-muted-foreground">{pickLanguage(language, PMC_TAB_GUIDE[tab].what)} <span className="font-semibold text-foreground">{pickLanguage(language, PMC_GUIDE_LABELS.when)}:</span> {pickLanguage(language, PMC_TAB_GUIDE[tab].when)}</p>
          <details className="rounded-[var(--radius)] border border-border bg-card text-sm">
            <summary className="flex min-h-11 cursor-pointer items-center px-3 font-medium">{pickLanguage(language, PMC_GUIDE_LABELS.all)}</summary>
            <dl className="grid gap-2 border-t border-border p-3 md:grid-cols-2" data-pmc-guide-all>{TABS.map(key => <div key={key}><dt className="font-semibold">{t.tabs[key]}</dt><dd className="text-muted-foreground">{pickLanguage(language, PMC_TAB_GUIDE[key].what)} {pickLanguage(language, PMC_TAB_GUIDE[key].when)}</dd></div>)}</dl>
            <p className="border-t border-border p-3 text-muted-foreground" data-pmc-not-in-platform>{pickLanguage(language, PMC_NOT_IN_PLATFORM)}</p>
          </details>
        </section>
        {tab !== "board" && tab !== "import" && tab !== "sitePlan" && tab !== "programme" && tab !== "editors" && (
          <section aria-label={pickLanguage(language, { ar: "عوامل التصفية", en: "Filters", ur: "فلٹرز" })} className="flex flex-wrap items-end gap-3 rounded-2xl bg-card p-4 shadow-sm ring-1 ring-border print:hidden">
            {select("zone", t.filters.zone, options.zones)}{select("block", t.filters.block, options.blocks)}{select("group", t.filters.group, options.groups)}{select("stage", t.filters.stage, options.stages)}{select("activity", t.filters.activity, options.activities)}
            <label className="text-xs">{t.filters.unitFrom}<input aria-label={t.filters.unitFrom} type="number" min="0" className={`${field} mt-1 block w-24`} value={filters.unitFrom ?? ""} onChange={event => setFilters({ ...filters, unitFrom: event.target.value === "" ? undefined : Number(event.target.value) })} /></label>
            <label className="text-xs">{t.filters.unitTo}<input aria-label={t.filters.unitTo} type="number" min="0" className={`${field} mt-1 block w-24`} value={filters.unitTo ?? ""} onChange={event => setFilters({ ...filters, unitTo: event.target.value === "" ? undefined : Number(event.target.value) })} /></label>
            <LabelledSelect label={t.filters.period} value={period} onValueChange={value => setPeriod(value as typeof period)} options={PERIODS.map(([key]) => ({ value: key, label: key === "default" ? t.filters.default : t.filters[key as "d7" | "d30" | "d90" | "d365" | "everything"] }))} />
          </section>
        )}
        {pdfError && <p role="alert" className="rounded-xl bg-danger-soft p-3 text-sm text-danger-soft-foreground print:hidden">{t.pdfFailed}</p>}
        <section ref={bodyRef} className="rounded-2xl bg-card p-5 shadow-sm ring-1 ring-border">
          {/* A screen that fails to render shows its own message and the tabs stay usable; moving to another tab starts it clean. */}
          <SectionErrorBoundary key={tab} title={pickLanguage(language, { ar: "هذه الشاشة", en: "This screen", ur: "یہ اسکرین" })} isArabic={isArabic}>
            {tab === "board" ? <ProgressBoard tenantId={tenantId} projectId={projectId} /> : tab === "import" ? <ImportPanel tenantId={tenantId} projectId={projectId} t={t} isArabic={isArabic} onOpenActivities={() => setTab("activities")} /> : tab === "sitePlan" ? <PmcSitePlan tenantId={tenantId} projectId={projectId} /> : tab === "programme" ? <PmcProgramme tenantId={tenantId} projectId={projectId} /> : tab === "editors" ? <PmcEditors tenantId={tenantId} projectId={projectId} /> : <ScreenBody tab={tab} tenantId={tenantId} projectId={projectId} filters={effective} t={t} isArabic={isArabic} onData={setOptions} names={names} />}
          </SectionErrorBoundary>
        </section>
      </div>
    </Shell>
  );
}

function Shell({ embedded, isArabic, isRtl = isArabic, children }: { embedded: boolean; isArabic: boolean; isRtl?: boolean; children: React.ReactNode }) {
  return embedded
    ? <div className="px-0 py-2 text-foreground" dir={isRtl ? "rtl" : "ltr"}>{children}</div>
    : <PageMain className="py-2 text-foreground print:bg-card" dir={isRtl ? "rtl" : "ltr"}>{children}</PageMain>;
}

export default function ProjectPmc() {
  return <ProjectPmcWorkspace />;
}
