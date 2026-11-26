// Q-36 (step 1, docs/proposals/navigation.md §3.2, adviser's decision §6): ONE name per page, in the three languages, read by the side menu, the page's own
// title, the buttons and links that open it, and the breadcrumb. A page that went by several names («ضوابط المشروع», «لوحة تسليم المشروع», «مركز قيادة
// المشروع»…) now has the one below; client/src/lib/pageNames.test.ts fails if an old name comes back in the client.
export type PageName = { ar: string; en: string; ur: string };

export const PAGE_NAMES = {
  board: { ar: "لوحة المشروع", en: "Project board", ur: "پروجیکٹ بورڈ" },
  executive: { ar: "الإدارة التنفيذية", en: "Executive management", ur: "ایگزیکٹو انتظامیہ" },
  fieldEntry: { ar: "الإدخال الميداني", en: "Field entry", ur: "فیلڈ اندراج" },
  commercial: { ar: "المقاولون والعقود", en: "Contractors and contracts", ur: "ٹھیکیدار اور معاہدے" },
  profitability: { ar: "ربحية المشروع", en: "Project profitability", ur: "پروجیکٹ کی منافع بخشی" },
  siteConsultant: { ar: "مقارنة الموقع والاستشاري", en: "Site and consultant comparison", ur: "سائٹ اور کنسلٹنٹ کا موازنہ" },
  masterPlan: { ar: "الماستر بلان", en: "Master plan", ur: "ماسٹر پلان" },
  pmc: { ar: "ضبط المشروع PMC", en: "Project controls (PMC)", ur: "منصوبے کا کنٹرول (PMC)" },
  baseline: { ar: "ملف المشروع الأساسي", en: "Project base file", ur: "منصوبے کی بنیادی فائل" },
  team: { ar: "فريق المشروع", en: "Project team", ur: "پروجیکٹ ٹیم" },
  stalled: { ar: "الوحدات المتوقفة", en: "Stalled units", ur: "رکے ہوئے یونٹس" },
  progressLog: { ar: "سجل الإنجاز", en: "Progress log", ur: "پیش رفت لاگ" },
  quality: { ar: "الجودة", en: "Quality", ur: "معیار" },
  submittals: { ar: "تسليمات الاستشاري", en: "Consultant submittals", ur: "کنسلٹنٹ سبمٹلز" },
  guide: { ar: "دليل الاستخدام", en: "User guide", ur: "استعمال کی رہنمائی" },
  weeklyReport: { ar: "التقرير الأسبوعي", en: "Weekly report", ur: "ہفتہ وار رپورٹ" },
  monthlyReport: { ar: "التقرير الشهري", en: "Monthly report", ur: "ماہانہ رپورٹ" },
  myPerformance: { ar: "مؤشراتي", en: "My indicators", ur: "میرے اشاریے" },
  meetings: { ar: "اجتماعات المشروع", en: "Project meetings", ur: "پروجیکٹ میٹنگز" },
  risks: { ar: "مخاطر المشروع", en: "Project risks", ur: "پروجیکٹ کے خطرات" },
  safety: { ar: "السلامة", en: "Safety", ur: "حفاظت" },
  site: { ar: "الموقع والتنفيذ", en: "Site and execution", ur: "سائٹ اور عمل درآمد" },
  reports: { ar: "التقارير", en: "Reports", ur: "رپورٹس" },
  imports: { ar: "الاستيراد", en: "Import", ur: "درآمد" },
  planning: { ar: "التخطيط والتحكم", en: "Planning and control", ur: "منصوبہ بندی اور کنٹرول" },
  supply: { ar: "المستودعات والمشتريات", en: "Warehouses and procurement", ur: "گودام اور خریداری" },
  fieldRecords: { ar: "سجلات الموقع", en: "Site records", ur: "سائٹ کے ریکارڈ" },
  contractsRecords: { ar: "العقود والمستندات", en: "Contracts and documents", ur: "معاہدے اور دستاویزات" },
  dailyReport: { ar: "التقرير اليومي", en: "Daily report", ur: "روزانہ رپورٹ" },
  progress: { ar: "تحديث الإنجاز", en: "Progress update", ur: "پیش رفت کی تازہ کاری" },
  qcReceipt: { ar: "استلام QC", en: "QC receipt", ur: "کیو سی وصولی" },
  liveSchedule: { ar: "الجدول الزمني الحي", en: "Live schedule", ur: "لائیو شیڈول" },
  operations: { ar: "التشغيل", en: "Operations", ur: "آپریشنز" },
  strategy: { ar: "مركز التخطيط الاستراتيجي", en: "Strategy centre", ur: "حکمتِ عملی کا مرکز" },
} as const satisfies Record<string, PageName>;
export type PageNameKey = keyof typeof PAGE_NAMES;

/** The project sub-pages by the last part of their address (/projects/:t/:p/<part>), for the breadcrumb: workspace › project › page. */
export const PROJECT_SUBPAGE_NAMES: Record<string, PageNameKey> = {
  controls: "board", baseline: "baseline", team: "team", pmc: "pmc", stalled: "stalled", "progress-log": "progressLog", profitability: "profitability", commercial: "commercial",
  quality: "quality", submittals: "submittals", "site-consultant": "siteConsultant", guide: "guide", "weekly-report": "weeklyReport",
  "monthly-report": "monthlyReport", "my-performance": "myPerformance", meetings: "meetings", risks: "risks", safety: "safety", schedule: "liveSchedule", site: "site", reports: "reports", import: "imports",
  planning: "planning", supply: "supply", "field-records": "fieldRecords", contracts: "contractsRecords",
};

/** Names a page no longer goes by (Arabic), and the page they belonged to. The client test fails if any of them is shown again. */
export const RETIRED_PAGE_NAMES: Array<[string, PageNameKey]> = [
  ["ضوابط المشروع", "board"], ["لوحة تسليم المشروع", "board"], ["مركز قيادة المشروع", "board"],
  ["القيادة التنفيذية", "executive"], ["نظرة القيادة", "executive"],
  ["إدخال سريع من الموقع", "fieldEntry"], ["الإدخال السريع", "fieldEntry"],
  ["السلسلة التجارية", "commercial"], ["لوحة ضبط ربحية المشروع", "profitability"],
  ["رسم الخطة التفاعلي", "masterPlan"], ["الرسم التفاعلي للخطة الرئيسية", "masterPlan"],
];
