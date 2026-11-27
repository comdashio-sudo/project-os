// Interactive master-plan drawing: read a DXF in the browser, match its shapes to the plan's units,
// let a person confirm each link, colour the map by unit status, and export the confirmed links.
// The file never leaves the browser, and nothing is saved on the server (G-189).
import { FileButton, Select } from "@/components/ds";

/** Radix lists carry no empty value: "no unit chosen" is this sentinel, never a unit id. */
const NO_CHOICE = "__none";
import React, { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { trpc } from "@/lib/trpc";
import { latestVersionId } from "@/lib/masterPlanDrawingLayout";
import { useMasterPlanDrawingLayout } from "@/lib/useMasterPlanDrawingLayout";
import { SectionMessage } from "@/components/SectionResilience";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { getProjectError } from "@shared/projectErrors";
import { matchDrawingToUnits, type ProjectUnit } from "@/lib/dxf/dxfMatch";
import { readDxf, type DxfDrawing } from "@/lib/dxf/dxfReader";
import { rasterKind, readPdfPage, readRasterImage } from "@/lib/raster/rasterFile";
import { readPdfVector } from "@/lib/raster/pdfVector";
import { PanZoomControls, usePanZoom } from "@/components/PanZoomMap";
import { useAuth } from "@/_core/hooks/useAuth";
import type { OcrWorker } from "@/lib/raster/ocrWorker";
import { MeasureOverlay, MeasurePanel, drawingPointFromClient, type MeasureTool } from "@/components/MasterPlanMeasure";
import type { DrawingCalibration, PlanPoint } from "@shared/masterPlanCalibration";
import { ManualLinkPanel, useManualText, type LinkTool } from "@/components/MasterPlanManualLink";
import { MasterPlanColourPanel, exportDrawingPng, useColourText } from "@/components/MasterPlanColourPanel";
import { SITE_COLOUR, colourUnits, passesFilter, type SiteUnit, unitNumberOf } from "@/lib/masterPlanColouring";
import { boundsOf, hatchIndexOf, pickVilla, type ListedVilla } from "@/lib/masterPlanSelection";
import { MasterPlanVillaList, ModelHatchDefs, ModelLegend, VillaInfoPanel } from "@/components/MasterPlanVillaList";
import { MANUAL_LAYER, addManualShape, markerSide, removeManualShape, shapeAt, squareAround, unlinkedUnits } from "@/lib/dxf/manualLinks";
import { confirmAllProposals,
  assignUnit,
  buildReview,
  clearLink,
  confirmLink,
  exportLinksCsv,
  exportLinksJson,
  polygonFill,
  rejectLink,
  summarizeReview,
  type ReviewItem,
  type ReviewResult,
} from "@/lib/dxf/dxfReview";

// The browser parses the file; this cap keeps very large files from freezing the page.
const MAX_DXF_BYTES = 50 * 1024 * 1024;

type PlanUnit = ProjectUnit & { name: string; status: string; progressPercent: string };

// OCR and the PDF reader load their files from /ocr, which vite.config.ts copies at build; the CSP allows no other origin.
const OCR_ASSETS = { workerPath: "/ocr/worker.min.js", corePath: "/ocr/core", langPath: "/ocr/lang" };

type ViewError = { kind: "read" | "file" | "action"; code: string; message: { ar: string; en: string; ur: string } };

const text = {
  ar: {
    title: "الماستر بلان",
    intro: "ارفع الرسم: صورة PNG أو JPG، أو PDF، أو DXF. كبّر وحرّك بالإصبعين أو بالأزرار. تُربط الأشكال بالوحدات تلقائيًا، ويجب أن تؤكد كل ربط قبل أن يُحسب.",
    upload: "اختيار ملف الرسم",
    noUnits: "لا توجد فلل لهذا المشروع بعد. استورد «قائمة الفلل» من صفحة الاستيراد، فتظهر هنا للربط بالرسم.",
    noPlan: "لا توجد خطة رئيسية لهذا المشروع بعد. أنشئ الخطة من «الخطة الرئيسية» أعلاه ثم احفظ الرسم فيها.",
    summary: (c: { confirmed: number; proposed: number; unlinked: number; unitsRemaining: number; unitsTotal: number }) =>
      `مؤكَّد: ${c.confirmed} · مقترح: ${c.proposed} · غير مربوط: ${c.unlinked} · وحدات متبقية: ${c.unitsRemaining} من ${c.unitsTotal}`,
    shapes: "الأشكال",
    shape: (n: number) => `شكل ${n}`,
    state: { proposed: "مقترح", confirmed: "مؤكَّد", unlinked: "غير مربوط" },
    unitStatus: { not_started: "لم تبدأ", in_progress: "قيد التنفيذ", completed: "مكتملة", blocked: "متوقفة" },
    reason: {
      no_text: "لا يوجد نص داخل الشكل",
      several_texts_in_polygon: "أكثر من نص داخل الشكل",
      duplicate_unit_code: "رمز مشترك بين وحدتين",
      several_polygons_for_unit: "وحدة يطالبها أكثر من شكل",
      rejected_by_reviewer: "رُفض يدويًا",
    },
    confirm: "تأكيد",
    reject: "رفض",
    clear: "إلغاء الربط",
    assignLabel: "اختيار وحدة",
    assign: "ربط بالوحدة",
    noChoice: "اختر وحدة",
    selected: "المحدد",
    none: "لم يُحدَّد شكل بعد",
    map: "خريطة الرسم",
    zoomIn: "تكبير",
    zoomOut: "تصغير",
    resetView: "ملاءمة الشاشة",
    zoomSlider: "مستوى التكبير",
    villaComplete: "مكتملة",
    page: "الصفحة",
    pageOption: (n: number, total: number) => `الصفحة ${n} من ${total}`,
    legend: "الألوان: حسب حالة الوحدة للمؤكَّد، أزرق للمقترح، رمادي لغير المربوط.",
    exportCsv: "تصدير الروابط المؤكدة (CSV)",
    exportJson: "تصدير الروابط المؤكدة (JSON)",
    save: "حفظ التخطيط",
    saved: "تم حفظ التخطيط.",
    savedVersion: (version: number, name: string) => `الرسم المحفوظ: النسخة ${version}، ${name}`,
    saveFailed: "تعذّر حفظ الرسم:",
    saveReason: "السبب من الخادم:",
    villasDenied: "فلل المشروع (PMC) لا تظهر لك: ربطها بالرسم يحتاج صلاحية قراءة PMC للمشروع. اطلبها من مدير الشركة.",
    readFailed: "تعذّرت قراءة الملف",
    unsupported: "نوع الملف غير مدعوم. ارفع ملف DXF أو PNG أو JPG أو PDF.",
    dwg: "ملفات DWG لا تُقرأ في المتصفح. افتح الرسم في برنامج التصميم واحفظه بصيغة DXF أو PDF ثم ارفعه.",
    rasterFailed: "تعذّرت قراءة الصورة. جرّب ملفًا أوضح أو ملف DXF.",
    busy: (done: number, total: number) => (total === 0 ? "جارٍ قراءة الرسم…" : `جارٍ قراءة الوحدات: ${done} من ${total}`),
    vectorNote: (shapes: number, proposed: number, villas: number, outlines: number) => `قُرئ المخطط من رسمه المتجهي: ${shapes} شكلًا${outlines ? ` (وتُرك ${outlines} من الحدود المحيطة)` : ""}، واقتُرح ربط ${proposed} من ${villas} فيلا برقمها. راجع ثم أكّد قبل الحفظ.`,
    confirmAll: (count: number) => `تأكيد كل المقترحات (${count})`,
    confirmAllLeft: (count: number) => `تُرك ${count} مقترح لتقرره أنت: فيلاه مؤكدة على شكل آخر أو مقترحة على شكلين.`,
    rasterPartial: (shapes: number, villas: number) => `وُجد ${shapes} شكلًا فقط وللمشروع ${villas} فيلا: قراءة الصورة جزئية (قد تكون الفلل صغيرة جدًا في هذا الحجم). لنتيجة كاملة ارفع ملف DXF أو PDF متجهيًا من برنامج الكاد، أو اربط الباقي بالنقر.`,
    rasterNone: "لم يُعثر على أشكال فلل في هذه الصورة. لنتيجة أدق ارفع ملف DXF أو PDF متجهيًا مُصدَّرًا من برنامج الكاد، أو اربط الفلل بالنقر على الرسم.",
    rasterNote: (shapes: number, labels: number) => `وُجد ${shapes} شكلًا وقُرئ رمز ${labels} منها. كل ربط مقترح من قراءة الصورة، فأكِّده أو غيّره قبل الحساب.`,
    tooLarge: "الملف أكبر من الحد المسموح به",
    empty: "لم يُرفع رسم بعد.",
    ignored: "كيانات لم تُقرأ",
  },
  en: {
    title: "Interactive master-plan drawing",
    intro: "Upload the drawing: a PNG or JPG image, a PDF, or a DXF. Zoom and move with two fingers or the buttons. Shapes are matched to units automatically, and each link must be confirmed before it counts.",
    upload: "Choose a drawing file",
    noUnits: "This project has no villas yet. Import the \u201cvilla list\u201d from the import page and they appear here to link to the drawing.",
    noPlan: "This project has no master plan yet. Create it under \u201cMaster plan\u201d above, then save the drawing into it.",
    summary: (c: { confirmed: number; proposed: number; unlinked: number; unitsRemaining: number; unitsTotal: number }) =>
      `Confirmed: ${c.confirmed} · Proposed: ${c.proposed} · Unlinked: ${c.unlinked} · Units remaining: ${c.unitsRemaining} of ${c.unitsTotal}`,
    shapes: "Shapes",
    shape: (n: number) => `Shape ${n}`,
    state: { proposed: "Proposed", confirmed: "Confirmed", unlinked: "Unlinked" },
    unitStatus: { not_started: "Not started", in_progress: "In progress", completed: "Completed", blocked: "Blocked" },
    reason: {
      no_text: "No text inside the shape",
      several_texts_in_polygon: "More than one text inside the shape",
      duplicate_unit_code: "Code shared by two units",
      several_polygons_for_unit: "Several shapes claim this unit",
      rejected_by_reviewer: "Rejected by reviewer",
    },
    confirm: "Confirm",
    reject: "Reject",
    clear: "Clear link",
    assignLabel: "Choose a unit",
    assign: "Link to unit",
    noChoice: "Choose a unit",
    selected: "Selected",
    none: "No shape selected yet",
    map: "Drawing map",
    zoomIn: "Zoom in",
    zoomOut: "Zoom out",
    resetView: "Fit to screen",
    zoomSlider: "Zoom level",
    villaComplete: "Complete",
    page: "Page",
    pageOption: (n: number, total: number) => `Page ${n} of ${total}`,
    legend: "Colours: confirmed shapes use the unit status; blue is proposed; grey is unlinked.",
    exportCsv: "Export confirmed links (CSV)",
    exportJson: "Export confirmed links (JSON)",
    save: "Save layout",
    saved: "Layout saved.",
    savedVersion: (version: number, name: string) => `Saved drawing: version ${version}, ${name}`,
    saveFailed: "The drawing could not be saved:",
    saveReason: "Reason from the server:",
    villasDenied: "The project's villas (PMC) are not shown to you: linking them to the drawing needs the PMC read permission on the project. Ask the company administrator.",
    readFailed: "The file could not be read",
    unsupported: "This file type is not supported. Upload a DXF, PNG, JPG or PDF file.",
    dwg: "DWG files cannot be read in the browser. Open the drawing in your design program, save it as DXF or PDF, then upload it.",
    rasterFailed: "The image could not be read. Try a clearer file or a DXF.",
    busy: (done: number, total: number) => (total === 0 ? "Reading the drawing…" : `Reading units: ${done} of ${total}`),
    vectorNote: (shapes: number, proposed: number, villas: number, outlines: number) => `The plan was read from its vector drawing: ${shapes} shapes${outlines ? ` (${outlines} surrounding outline${outlines > 1 ? "s" : ""} set aside)` : ""}, and ${proposed} of ${villas} villas are proposed by their number. Review, then confirm before saving.`,
    confirmAll: (count: number) => `Confirm all proposals (${count})`,
    confirmAllLeft: (count: number) => `${count} proposal(s) left for you to decide: the villa is confirmed on another shape or proposed on two.`,
    rasterPartial: (shapes: number, villas: number) => `Only ${shapes} shapes were found and the project has ${villas} villas: the image was read in part (the villas may be too small at this size). For a complete result upload a DXF or a vector PDF from the CAD program, or link the rest by tapping.`,
    rasterNone: "No villa shapes were found in this image. For a more exact result upload a DXF or a vector PDF exported from the CAD program, or link the villas by tapping the drawing.",
    rasterNote: (shapes: number, labels: number) => `Found ${shapes} shapes and read the code in ${labels} of them. Each proposed link comes from reading the image: confirm or change it before it counts.`,
    tooLarge: "The file is larger than the allowed limit",
    empty: "No drawing uploaded yet.",
    ignored: "Entities not read",
  },
  ur: {
    title: "ماسٹر پلان کی انٹرایکٹو ڈرائنگ",
    intro: "DXF ڈرائنگ اپ لوڈ کریں۔ شکلیں خودکار طور پر یونٹوں سے ملائی جاتی ہیں، اور ہر جوڑ کو شمار ہونے سے پہلے تصدیق کرنا ہوگا۔",
    upload: "ڈرائنگ کی فائل منتخب کریں",
    noUnits: "اس منصوبے میں ابھی کوئی ولا نہیں۔ امپورٹ صفحے سے «ولاز کی فہرست» امپورٹ کریں، پھر وہ ڈرائنگ سے جوڑنے کے لیے یہاں نظر آئیں گی۔",
    noPlan: "اس منصوبے کا ابھی کوئی ماسٹر پلان نہیں۔ اوپر «ماسٹر پلان» سے بنائیں، پھر ڈرائنگ اس میں محفوظ کریں۔",
    summary: (c: { confirmed: number; proposed: number; unlinked: number; unitsRemaining: number; unitsTotal: number }) =>
      `تصدیق شدہ: ${c.confirmed} · تجویز شدہ: ${c.proposed} · غیر جڑا ہوا: ${c.unlinked} · باقی یونٹ: ${c.unitsRemaining} از ${c.unitsTotal}`,
    shapes: "شکلیں",
    shape: (n: number) => `شکل ${n}`,
    state: { proposed: "تجویز شدہ", confirmed: "تصدیق شدہ", unlinked: "غیر جڑا ہوا" },
    unitStatus: { not_started: "شروع نہیں ہوا", in_progress: "جاری ہے", completed: "مکمل", blocked: "رکا ہوا" },
    reason: {
      no_text: "شکل کے اندر کوئی متن نہیں",
      several_texts_in_polygon: "شکل کے اندر ایک سے زیادہ متن",
      duplicate_unit_code: "ایک کوڈ دو یونٹوں میں مشترک",
      several_polygons_for_unit: "کئی شکلیں اس یونٹ پر دعویٰ کرتی ہیں",
      rejected_by_reviewer: "جائزہ لینے والے نے مسترد کیا",
    },
    confirm: "تصدیق کریں",
    reject: "مسترد کریں",
    clear: "جوڑ ختم کریں",
    assignLabel: "ایک یونٹ منتخب کریں",
    assign: "یونٹ سے جوڑیں",
    noChoice: "ایک یونٹ منتخب کریں",
    selected: "منتخب شدہ",
    none: "ابھی کوئی شکل منتخب نہیں",
    map: "ڈرائنگ کا نقشہ",
    zoomIn: "زوم بڑھائیں",
    zoomOut: "زوم کم کریں",
    resetView: "اسکرین کے مطابق",
    zoomSlider: "زوم کی سطح",
    villaComplete: "مکمل",
    page: "صفحہ",
    pageOption: (n: number, total: number) => `صفحہ ${n} از ${total}`,
    legend: "رنگ: تصدیق شدہ شکلیں یونٹ کی حیثیت کا رنگ لیتی ہیں؛ نیلا تجویز شدہ ہے؛ خاکستری غیر جڑا ہوا ہے۔",
    exportCsv: "تصدیق شدہ جوڑ برآمد کریں (CSV)",
    exportJson: "تصدیق شدہ جوڑ برآمد کریں (JSON)",
    save: "خاکہ محفوظ کریں",
    saved: "خاکہ محفوظ ہو گیا۔",
    savedVersion: (version: number, name: string) => `محفوظ شدہ خاکہ: ورژن ${version}، ${name}`,
    saveFailed: "ڈرائنگ محفوظ نہیں ہو سکی:",
    saveReason: "سرور کی وجہ:",
    villasDenied: "منصوبے کے ولاز (PMC) آپ کو نظر نہیں آتے: انہیں ڈرائنگ سے جوڑنے کے لیے منصوبے پر PMC پڑھنے کی اجازت درکار ہے۔ کمپنی کے منتظم سے مانگیں۔",
    readFailed: "فائل پڑھی نہیں جا سکی",
    unsupported: "یہ فائل کی قسم معاون نہیں ہے۔ DXF، PNG، JPG یا PDF فائل اپ لوڈ کریں۔",
    dwg: "DWG فائلیں براؤزر میں نہیں پڑھی جا سکتیں۔ ڈرائنگ کو ڈیزائن پروگرام میں کھول کر DXF یا PDF کے طور پر محفوظ کریں، پھر اپ لوڈ کریں۔",
    rasterFailed: "تصویر پڑھی نہیں جا سکی۔ زیادہ واضح فائل یا DXF آزمائیں۔",
    busy: (done: number, total: number) => (total === 0 ? "ڈرائنگ پڑھی جا رہی ہے…" : `یونٹ پڑھے جا رہے ہیں: ${done} از ${total}`),
    vectorNote: (shapes: number, proposed: number, villas: number, outlines: number) => `منصوبہ اس کی ویکٹر ڈرائنگ سے پڑھا گیا: ${shapes} شکلیں${outlines ? ` (${outlines} بیرونی حدود چھوڑ دی گئیں)` : ""}، اور ${villas} میں سے ${proposed} ولاز ان کے نمبر سے تجویز کیے گئے۔ محفوظ کرنے سے پہلے دیکھ کر تصدیق کریں۔`,
    confirmAll: (count: number) => `تمام تجاویز کی تصدیق کریں (${count})`,
    confirmAllLeft: (count: number) => `${count} تجاویز آپ کے فیصلے کے لیے چھوڑی گئیں: ولا کسی اور شکل پر تصدیق شدہ ہے یا دو شکلوں پر تجویز شدہ۔`,
    rasterPartial: (shapes: number, villas: number) => `صرف ${shapes} شکلیں ملیں اور منصوبے میں ${villas} ولاز ہیں: تصویر جزوی طور پر پڑھی گئی (ولاز اس سائز میں بہت چھوٹے ہو سکتے ہیں)۔ مکمل نتیجے کے لیے CAD سے DXF یا ویکٹر PDF اپ لوڈ کریں، یا باقی کو ٹیپ کر کے جوڑیں۔`,
    rasterNone: "اس تصویر میں ولا کی کوئی شکل نہیں ملی۔ زیادہ درست نتیجے کے لیے CAD پروگرام سے برآمد شدہ DXF یا ویکٹر PDF اپ لوڈ کریں، یا ڈرائنگ پر ٹیپ کر کے ولاز جوڑیں۔",
    rasterNote: (shapes: number, labels: number) => `${shapes} شکلیں ملیں اور ان میں سے ${labels} کا کوڈ پڑھا گیا۔ ہر تجویز شدہ جوڑ تصویر پڑھ کر بنایا گیا ہے: شمار ہونے سے پہلے اس کی تصدیق کریں یا اسے بدلیں۔`,
    tooLarge: "فائل اجازت شدہ حد سے بڑی ہے",
    empty: "ابھی تک کوئی ڈرائنگ اپ لوڈ نہیں ہوئی۔",
    ignored: "اکائیاں نہیں پڑھی گئیں",
  },
};

// Map box: DXF y grows upward, SVG y grows downward, so each y is flipped inside the box.
function mapGeometry(drawing: DxfDrawing) {
  const points = drawing.polygons.flatMap(polygon => polygon.points);
  if (points.length === 0) return null;
  const minX = Math.min(...points.map(p => p.x));
  const maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y));
  const maxY = Math.max(...points.map(p => p.y));
  const pad = Math.max(maxX - minX, maxY - minY) * 0.02 || 1;
  return { x: minX - pad, y: minY - pad, width: maxX - minX + 2 * pad, height: maxY - minY + 2 * pad, flipY: (y: number) => minY + maxY - y };
}

/** Q-62: «could not save» says why — the server's own sentence for a known refusal, else the code — never the bare sentence alone. */
export function saveFailure(code: string): { ar: string; en: string; ur: string } {
  const known = code.startsWith("PROJECT_OS_") ? getProjectError(code) : null;
  const reason = known && known.code !== "PROJECT_OS_REQUEST_FAILED" ? known.messages : null;
  const why = (language: "ar" | "en" | "ur") => (reason ? (reason as Record<string, string>)[language] ?? reason.en : `${text[language].saveReason} ${code}`);
  return { ar: `${text.ar.saveFailed} ${why("ar")}`, en: `${text.en.saveFailed} ${why("en")}`, ur: `${text.ur.saveFailed} ${why("ur")}` };
}

export function MasterPlanDrawing({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { language, isArabic } = useLanguage();
  const t = text[language];
  const plansQuery = trpc.masterPlans.list.useQuery({ tenantId, projectId });
  // Q-62: the units a drawing is matched against come from the server — the newest version's own units, or, when it has none, the project's PMC villas
  // (the «villa list» import), so the villas are never entered twice
  const versionId = latestVersionId(plansQuery.data);
  const unitsQuery = trpc.masterPlans.drawingUnits.useQuery({ tenantId, projectId, masterPlanVersionId: versionId ?? "00000000-0000-4000-8000-000000000000" }, { enabled: versionId !== null });
  const units: PlanUnit[] = useMemo(() => (unitsQuery.data?.units ?? []).map(unit => ({ id: unit.id, code: unit.code, name: unit.name, status: unit.status, progressPercent: unit.progressPercent })), [unitsQuery.data]);
  const unitSource = unitsQuery.data?.source ?? "plan";
  // The saved layout of the newest version's drawing (G-189): it fills the screen when a drawing is not open yet, and saves what the person confirms.
  const saved = useMasterPlanDrawingLayout({ tenantId, projectId, masterPlanVersionId: versionId, units, unitSource });
  const [file, setFile] = useState<File | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const [drawing, setDrawing] = useState<DxfDrawing | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [pdfSource, setPdfSource] = useState<{ file: File; pageCount: number; page: number } | null>(null);
  const [error, setError] = useState<ViewError | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [rasterStats, setRasterStats] = useState<{ shapes: number; labels: number } | null>(null);
  const [confirmAllNote, setConfirmAllNote] = useState(0);
  const [vectorStats, setVectorStats] = useState<{ shapes: number; proposed: number; villas: number; outlines: number } | null>(null);
  // Q-7: the picture under the shapes of a raster drawing (an image or a PDF page), at the size the shapes were read at; null for a DXF.
  const [background, setBackground] = useState<{ href: string; width: number; height: number; page: number } | null>(null);
  const [tool, setTool] = useState<MeasureTool>("none");
  // Q-8: linking by hand — the unit being placed, a tap or a polygon, the polygon's corners so far
  const manualText = useManualText();
  const [linkTool, setLinkTool] = useState<LinkTool | null>(null);
  const [linkUnitId, setLinkUnitId] = useState("");
  const [linkPicks, setLinkPicks] = useState<PlanPoint[]>([]);
  const [linkNotice, setLinkNotice] = useState<{ kind: "linked" | "already" | "few"; code?: string } | null>(null);
  const [picks, setPicks] = useState<PlanPoint[]>([]);
  const [localCalibration, setLocalCalibration] = useState<DrawingCalibration | null>(null);

  useEffect(() => {
    if (!drawing && saved.savedReview) {
      setDrawing(saved.savedReview.drawing);
      setItems(saved.savedReview.items);
    }
  }, [drawing, saved.savedReview]);

  // After a reload the saved raster drawing gets its picture back: an image directly by its short-lived link, a PDF page rendered again in the browser.
  const savedBackground = saved.layout?.background ?? null;
  const savedBackgroundUrl = saved.layout?.backgroundUrl ?? null;
  const savedMime = saved.layout?.latestVersion?.mimeType ?? "";
  useEffect(() => {
    if (background || file || !savedBackground || !savedBackgroundUrl) return;
    let cancelled = false;
    const { width, height, page } = savedBackground;
    if (savedMime.startsWith("image/")) {
      setBackground({ href: savedBackgroundUrl, width, height, page });
    } else if (savedMime === "application/pdf") {
      fetch(savedBackgroundUrl)
        .then(response => (response.ok ? response.arrayBuffer() : Promise.reject(new Error(String(response.status)))))
        .then(bytes => readPdfPage(new Uint8Array(bytes), page))
        .then(pdf => { if (!cancelled && pdf.preview) setBackground({ href: pdf.preview, width, height, page }); })
        .catch(() => undefined); // the shapes still show; only the picture under them is missing
    }
    return () => { cancelled = true; };
  }, [background, file, savedBackground, savedBackgroundUrl, savedMime]);

  const calibration = localCalibration ?? saved.layout?.calibration ?? null;
  const hasVersion = versionId !== null;

  const unitById = useMemo(() => new Map(units.map(unit => [unit.id, unit])), [units]);
  // Q-8 (b): colour by a PMC activity's site status (Q-4 writes it), with block and model filters; the plan's unit status stays the default
  const colourText = useColourText();
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const [activityCode, setActivityCode] = useState("");
  const [blockFilter, setBlockFilter] = useState("");
  const [modelFilter, setModelFilter] = useState("");
  const [phaseFilter, setPhaseFilter] = useState("");
  const [colourSource, setColourSource] = useState<"site" | "qc">("site");
  const siteMap = trpc.pmc.siteMap.useQuery({ tenantId, projectId, activityCode: activityCode || undefined }, { enabled: Boolean(drawing) });
  // Q-5's QC receipt for the same activity, coloured apart from the site's status
  const qcMap = trpc.pmc.qcMap.useQuery({ tenantId, projectId, activityCode }, { enabled: Boolean(drawing) && Boolean(activityCode) && colourSource === "qc" });
  const villas = (colourSource === "qc" ? qcMap.data ?? [] : siteMap.data?.units ?? []) as SiteUnit[];
  const colourData = colourSource === "qc" ? qcMap.data : siteMap.data;
  const confirmedCodes = items.filter(item => item.state === "confirmed" && item.unitCode).map(item => item.unitCode!);
  const colouring = activityCode && colourData ? colourUnits(confirmedCodes, villas) : null;
  const summary = summarizeReview(items, units);
  const remaining = units.filter(unit => !items.some(entry => entry.state === "confirmed" && entry.unitId === unit.id));
  const selected = items.find(item => item.polygonId === selectedId) ?? null;
  // A raster drawing is framed by its picture, so the picture and the shapes line up; a DXF by its shapes.
  const geometry = drawing ? (background ? { x: 0, y: 0, width: background.width, height: background.height, flipY: (y: number) => background.height - y } : mapGeometry(drawing)) : null;
  const ignoredCount = drawing ? Object.values(drawing.ignoredEntities).reduce((sum, value) => sum + value, 0) : 0;
  // Q-20: the last zoom and position, kept on this device for this person and this project.
  const { user } = useAuth();
  const pan = usePanZoom(geometry, { storageKey: user ? `dashio-plan-view:${user.id}:${projectId}` : undefined });
  // Q-20: inside each villa, at 150% and more, its number, current activity and weighted progress (from the site map); below that, the number only.
  const detailOf = new Map((siteMap.data?.units ?? []).map(unit => [unit.unitNumber, unit as SiteUnit & { overallPercent?: number | null; currentActivity?: { code: string; name: string } | null }]));
  // the villa a plan code names, from the site map itself (with or without an activity chosen for colouring)
  const villaByCode = (code: string) => { const number = unitNumberOf(code); return number === null ? undefined : detailOf.get(number); };
  // Q-40: villa types are told apart by a hatch drawn over the shape, so the fill keeps showing progress; the choice of villas is shared by the
  // drawing and the side list (one tap chooses one villa; with «several» on, or Ctrl/Shift held, taps add and remove).
  const [showTypes, setShowTypes] = useState(false);
  const modelCodes = Array.from(new Set((siteMap.data?.units ?? []).map(unit => unit.modelCode))).filter(Boolean).sort();
  const hatchOf = useMemo(() => hatchIndexOf(modelCodes), [modelCodes.join("|")]); // eslint-disable-line react-hooks/exhaustive-deps -- keyed by the list's content
  const [picked, setPicked] = useState<Set<string>>(() => new Set());
  const [several, setSeveral] = useState(false);
  const [revealId, setRevealId] = useState<string | null>(null);
  // one pass over the shapes for 500 villas: lookups by id, never a search per shape
  const itemByPolygon = useMemo(() => new Map(items.map((item, index) => [item.polygonId, { item, index }])), [items]);
  const polygonById = useMemo(() => new Map((drawing?.polygons ?? []).map(polygon => [polygon.id, polygon])), [drawing]);
  const mappedVillas = items.filter(item => item.state === "confirmed" && item.unitCode);
  const listedVillas: ListedVilla[] = mappedVillas.map(item => ({ polygonId: item.polygonId, unitCode: item.unitCode!, modelCode: villaByCode(item.unitCode!)?.modelCode ?? null }));
  function focusShapes(ids: Iterable<string>) {
    if (!geometry) return;
    const box = boundsOf(Array.from(ids).flatMap(id => (polygonById.get(id)?.points ?? []).map(point => ({ x: point.x, y: geometry.flipY(point.y) }))));
    if (box) pan.focus(box);
  }
  function choose(polygonId: string, many: boolean, from: "plan" | "list") {
    setPicked(current => pickVilla(current, polygonId, many));
    setSelectedId(polygonId);
    if (from === "plan") setRevealId(polygonId); else if (!many) focusShapes([polygonId]);
  }
  const detailed = pan.percent >= 150;
  // Q-20: choosing a block in the filter brings its villas into view.
  useEffect(() => {
    if (!blockFilter || !drawing || !geometry) return;
    const points = drawing.polygons.flatMap(polygon => { const item = items.find(entry => entry.polygonId === polygon.id); const villa = item?.unitCode ? villaByCode(item.unitCode) : undefined; return villa?.blockCode === blockFilter ? polygon.points.map(p => ({ x: p.x, y: geometry.flipY(p.y) })) : []; });
    if (!points.length) return;
    const xs = points.map(p => p.x); const ys = points.map(p => p.y);
    pan.focus({ x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only a new block choice moves the view, not every render
  }, [blockFilter]);

  const applyResult = (result: ReviewResult) => {
    if (result.ok) {
      setItems(result.items);
      setError(null);
    } else {
      setError({ kind: "action", code: result.error.code, message: result.error.message });
    }
  };

  async function onFileChosen(file: File | null) {
    if (!file) return;
    if (file.size > MAX_DXF_BYTES) {
      setError({ kind: "file", code: "FILE_TOO_LARGE", message: { ar: text.ar.tooLarge, en: text.en.tooLarge, ur: text.ur.tooLarge } });
      return;
    }
    if (/\.dwg$/i.test(file.name)) {
      setError({ kind: "file", code: "DWG_NOT_SUPPORTED", message: { ar: text.ar.dwg, en: text.en.dwg, ur: text.ur.dwg } });
      return;
    }
    setFile(file);
    setSavedNotice(false);
    setPdfSource(null);
    setTool("none");
    setPicks([]);
    if (/\.dxf$/i.test(file.name)) {
      await readDxfFile(file);
      return;
    }
    const kind = rasterKind(file.name);
    if (!kind) {
      setError({ kind: "file", code: "UNSUPPORTED_FILE", message: { ar: text.ar.unsupported, en: text.en.unsupported, ur: text.ur.unsupported } });
      return;
    }
    await readRasterDrawing(file, kind, 1);
  }

  async function readDxfFile(file: File) {
    const parsed = readDxf(new Uint8Array(await file.arrayBuffer()));
    if (!parsed.ok) {
      setDrawing(null);
      setItems([]);
      setRasterStats(null);
      setError({ kind: "read", code: parsed.error.code, message: parsed.error.message });
      return;
    }
    setDrawing(parsed.drawing);
    setRasterStats(null);
    setVectorStats(null);
    setBackground(null);
    setItems(buildReview(parsed.drawing, matchDrawingToUnits(parsed.drawing, units)));
    setSelectedId(null);
    setError(null);
  }

  // Tesseract and pdf.js load only here, so a plan page that never opens a raster drawing does not download them.
  async function readRasterDrawing(file: File, kind: "image" | "pdf", page: number) {
    setError(null);
    setProgress({ done: 0, total: 0 });
    let ocr: OcrWorker | null = null;
    try {
      // Q-62 batch 3: a PDF is read from its own drawing first (CAD exports villas as closed paths and numbers as text); the image reading is the fallback
      if (kind === "pdf") {
        const vector = await readPdfVector(new Uint8Array(await file.arrayBuffer()), page).catch(() => null);
        if (vector && vector.polygonCount > 0) {
          setPdfSource({ file, pageCount: vector.pageCount, page });
          setBackground(null);
          setDrawing(vector.drawing);
          const review = buildReview(vector.drawing, matchDrawingToUnits(vector.drawing, units));
          setItems(review);
          setRasterStats(null);
          setVectorStats({ shapes: vector.polygonCount, proposed: review.filter(item => item.state === "proposed").length, villas: units.length, outlines: vector.outlinesSetAside });
          setSelectedId(null);
          return;
        }
      }
      setVectorStats(null);
      const pdf = kind === "pdf" ? await readPdfPage(new Uint8Array(await file.arrayBuffer()), page) : null;
      const image = pdf ? pdf.image : await readRasterImage(file);
      if (pdf) setPdfSource({ file, pageCount: pdf.pageCount, page });
      const href = pdf ? pdf.preview : URL.createObjectURL(file);
      setBackground(href ? { href, width: image.width, height: image.height, page } : null);
      const [{ createOcrWorker }, { analyseRaster }] = await Promise.all([import("@/lib/raster/ocrWorker"), import("@/lib/raster/rasterAnalysis")]);
      ocr = await createOcrWorker(OCR_ASSETS);
      const analysis = await analyseRaster(image, ocr.recognize, (done, total) => setProgress({ done, total }));
      setDrawing(analysis.drawing);
      setItems(buildReview(analysis.drawing, matchDrawingToUnits(analysis.drawing, units)));
      setRasterStats({ shapes: analysis.shapeCount, labels: analysis.labelCount });
      setSelectedId(null);
    } catch {
      setDrawing(null);
      setItems([]);
      setRasterStats(null);
      setError({ kind: "read", code: "RASTER_FAILED", message: { ar: text.ar.rasterFailed, en: text.en.rasterFailed, ur: text.ur.rasterFailed } });
    } finally {
      if (ocr) await ocr.terminate();
      setProgress(null);
    }
  }

  function download(name: string, content: string, type: string) {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function onSave() {
    if (!drawing) return;
    setError(null);
    setSavedNotice(false);
    // A new raster file stores the size it was read at; a new DXF clears it; saving links only keeps what is stored.
    const outcome = await saved.save({ file, drawing, items, background: file ? (background ? { width: background.width, height: background.height, page: background.page } : null) : undefined });
    if (outcome.ok) {
      setFile(null);
      setSavedNotice(true);
    } else {
      setError({ kind: "action", code: outcome.code, message: saveFailure(outcome.code) });
    }
  }

  async function onSaveCalibration(next: DrawingCalibration) {
    setError(null);
    const outcome = await saved.saveCalibration(next);
    if (outcome.ok) {
      setLocalCalibration(next);
      setPicks([]);
      return true;
    }
    setError({ kind: "action", code: outcome.code, message: saveFailure(outcome.code) });
    return false;
  }

  // the shape is linked to the unit at once; the list then moves to the next unit that has no shape
  function placeShape(points: PlanPoint[]) {
    const unit = units.find(entry => entry.id === linkUnitId);
    if (!drawing || !unit) return;
    const result = addManualShape(drawing, items, points, unit);
    if (!result.ok) { setLinkNotice({ kind: result.code === "UNIT_ALREADY_LINKED" ? "already" : "few" }); return; }
    setDrawing(result.drawing);
    setItems(result.items);
    setLinkPicks([]);
    setLinkNotice({ kind: "linked", code: unit.code });
    setLinkUnitId(unlinkedUnits(units, result.items)[0]?.id ?? "");
  }

  function onMapClick(event: React.MouseEvent<SVGSVGElement>) {
    if (linkTool && geometry && drawing) {
      const point = drawingPointFromClient(event.currentTarget, event.clientX, event.clientY, geometry.flipY);
      if (!point) return;
      if (linkTool === "point") {
        // a tap inside a read shape that is not confirmed links that shape; elsewhere it places a small marker
        const under = shapeAt(drawing, point);
        const item = under ? items.find(entry => entry.polygonId === under) : undefined;
        const unit = units.find(entry => entry.id === linkUnitId);
        if (item && item.state !== "confirmed" && unit) {
          const result = assignUnit(items, item.polygonId, unit);
          if (!result.ok) { setLinkNotice({ kind: "already" }); return; }
          setItems(result.items);
          setLinkNotice({ kind: "linked", code: unit.code });
          setLinkUnitId(unlinkedUnits(units, result.items)[0]?.id ?? "");
          return;
        }
        placeShape(squareAround(point, markerSide(drawing)));
      }
      else setLinkPicks(previous => [...previous, point]);
      return;
    }
    if (tool === "none" || !geometry) return;
    const point = drawingPointFromClient(event.currentTarget, event.clientX, event.clientY, geometry.flipY);
    if (point) setPicks(previous => (previous.length >= 2 ? [point] : [...previous, point]));
  }

  const unitStatusText = (status: string) => (t.unitStatus as Record<string, string>)[status] ?? status; // a PMC villa has none: its site status is the colouring
  const reasonText = (reason: string | null) => (reason && (t.reason as Record<string, string>)[reason]) || null;

  return (
    <section aria-labelledby="master-plan-drawing-title" className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-border">
      <div>
        <h3 id="master-plan-drawing-title" className="text-lg font-semibold">{t.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t.intro}</p>
      </div>

      {plansQuery.error ? <SectionMessage title={t.title} isArabic={isArabic} language={language} kind="error" error={plansQuery.error} onRetry={() => plansQuery.refetch()} /> : null}
      {!plansQuery.error && unitsQuery.error ? <SectionMessage title={t.title} isArabic={isArabic} language={language} kind="error" error={unitsQuery.error} onRetry={() => unitsQuery.refetch()} /> : null}

      {plansQuery.data && !hasVersion ? <p role="note" className="rounded-lg bg-warning-soft p-3 text-sm text-warning-soft-foreground">{t.noPlan}</p> : null}
      {unitsQuery.data?.villasDenied ? <p role="note" data-villas-denied className="rounded-lg bg-warning-soft p-3 text-sm text-warning-soft-foreground">{t.villasDenied}</p> : null}
      {plansQuery.data && hasVersion && unitsQuery.data && !unitsQuery.data.villasDenied && units.length === 0 ? <p role="note" className="rounded-lg bg-warning-soft p-3 text-sm text-warning-soft-foreground">{t.noUnits}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <FileButton label={t.upload} accept=".dxf,.dwg,.png,.jpg,.jpeg,.pdf" showName={false} onFile={onFileChosen} />
        {pdfSource && pdfSource.pageCount > 1 ? (
          <label className="flex flex-col text-xs">
            {t.page}
            <Select aria-label={t.page} value={String(pdfSource.page)} disabled={progress !== null} onValueChange={value => readRasterDrawing(pdfSource.file, "pdf", Number(value))}
              options={Array.from({ length: pdfSource.pageCount }, (_, index) => ({ value: String(index + 1), label: t.pageOption(index + 1, pdfSource.pageCount) }))} />
          </label>
        ) : null}
      </div>

      {saved.layout?.latestVersion ? <p className="text-sm text-foreground">{t.savedVersion(saved.layout.latestVersion.versionNumber, saved.layout.latestVersion.fileName)}</p> : null}
      {savedNotice ? <p role="status" className="text-sm text-success-soft-foreground">{t.saved}</p> : null}
      {progress ? <p role="status" aria-live="polite" className="text-sm text-foreground">{t.busy(progress.done, progress.total)}</p> : null}

      {error ? <p role="alert" className="rounded-lg bg-danger-soft p-3 text-sm text-danger-soft-foreground">{pickLanguage(language, error.message)}</p> : null}

      {!drawing ? <p className="text-sm text-muted-foreground">{t.empty}</p> : (
        <>
          <p className="text-sm font-medium" aria-live="polite">{t.summary(summary)}</p>
          {vectorStats ? (
            <div className="space-y-2 rounded-lg bg-info-soft p-3 text-sm text-info-soft-foreground" data-vector-note>
              <p>{t.vectorNote(vectorStats.shapes, vectorStats.proposed, vectorStats.villas, vectorStats.outlines)}</p>
              {items.some(item => item.state === "proposed") ? <button type="button" className="min-h-[44px] rounded-lg bg-primary px-4 text-sm text-white" data-confirm-all onClick={() => { const result = confirmAllProposals(items); setItems(result.items); setConfirmAllNote(result.leftForPerson); }}>{t.confirmAll(items.filter(item => item.state === "proposed").length)}</button> : null}
              {confirmAllNote ? <p data-confirm-all-left>{t.confirmAllLeft(confirmAllNote)}</p> : null}
            </div>
          ) : null}
          {/* review of #554 (A): a find far below the project's villas (under 80%) is said to be partial, so it is not read as the whole plan */}
          {rasterStats ? (() => { const partial = rasterStats.shapes > 0 && units.length > 0 && rasterStats.shapes < units.length * 0.8; return <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning-soft-foreground" data-raster-note={rasterStats.shapes === 0 ? "none" : partial ? "partial" : "found"}>{rasterStats.shapes === 0 ? t.rasterNone : <>{t.rasterNote(rasterStats.shapes, rasterStats.labels)}{partial ? <><br />{t.rasterPartial(rasterStats.shapes, units.length)}</> : null}</>}</p>; })() : null}
          {ignoredCount > 0 ? <p className="text-xs text-muted-foreground">{t.ignored}: {ignoredCount}</p> : null}

          {geometry ? (
            <div>
              <PanZoomControls pan={pan} labels={{ zoomIn: t.zoomIn, zoomOut: t.zoomOut, reset: t.resetView, hundred: "100%", slider: t.zoomSlider }} />
              <MeasurePanel
                tool={tool}
                onTool={next => { setTool(next); setPicks([]); setLinkTool(null); setLinkPicks([]); }}
                picks={picks}
                calibration={calibration}
                canCalibrate={Boolean(saved.layout?.drawingId) && !file}
                busy={saved.busy}
                onSaveCalibration={onSaveCalibration}
              />
              {units.length > 0 ? (
                <ManualLinkPanel
                  unlinked={unlinkedUnits(units, items)}
                  total={units.length}
                  unitId={linkUnitId}
                  onUnit={id => { setLinkUnitId(id); setLinkNotice(null); }}
                  tool={linkTool}
                  onTool={next => { setLinkTool(next); setLinkPicks([]); setLinkNotice(null); setTool("none"); setPicks([]); }}
                  polygonPoints={linkPicks.length}
                  onClose={() => placeShape(linkPicks)}
                  notice={linkNotice}
                />
              ) : null}
              <MasterPlanColourPanel
                activities={siteMap.data?.activities ?? []}
                activityCode={activityCode}
                onActivity={code => { setActivityCode(code); setBlockFilter(""); setModelFilter(""); setPhaseFilter(""); }}
                source={colourSource}
                onSource={setColourSource}
                blocks={Array.from(new Set((siteMap.data?.units ?? []).map(villa => villa.blockCode))).sort()}
                models={modelCodes}
                block={blockFilter}
                model={modelFilter}
                onBlock={setBlockFilter}
                onModel={setModelFilter}
                phases={Array.from(new Set((siteMap.data?.units ?? []).map(villa => (villa as { phase?: string | null }).phase).filter((value): value is string => Boolean(value)))).sort()}
                phase={phaseFilter}
                onPhase={setPhaseFilter}
                counts={colouring?.counts ?? null}
                failed={Boolean(colourSource === "qc" ? qcMap.error : siteMap.error)}
                onExportPng={() => { if (svgRef.current) void exportDrawingPng(svgRef.current, `master-plan-${activityCode ? `${activityCode}-${colourSource}` : "status"}-${new Date().toISOString().slice(0, 10)}.png`); }}
              />
              {modelCodes.length > 0 && <label className="inline-flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" className="h-5 w-5" checked={showTypes} onChange={event => setShowTypes(event.target.checked)} />
                {pickLanguage(language, { ar: "إظهار أنواع الفلل بنقش", en: "Show villa types as hatching", ur: "ولا کی اقسام نقش سے دکھائیں" })}
              </label>}
              {showTypes ? <ModelLegend models={modelCodes} hatchOf={hatchOf} /> : null}
              <svg role="img" aria-label={t.map} aria-describedby="mp-map-summary" {...pan.svgProps} ref={node => { svgRef.current = node; (pan.svgProps.ref as React.MutableRefObject<SVGSVGElement | null>).current = node; }} onClick={onMapClick} className={`h-auto w-full rounded-lg bg-muted ring-1 ring-border ${tool !== "none" || linkTool ? "cursor-crosshair" : ""}`}>
                <desc id="mp-map-summary">{pickLanguage(language, { ar: `${mappedVillas.length} فيلا مربوطة، والمحدد ${picked.size}`, en: `${mappedVillas.length} linked villas, ${picked.size} selected`, ur: `${mappedVillas.length} منسلک ولاز، ${picked.size} منتخب` })}</desc>
                {showTypes ? <ModelHatchDefs size={Math.max(geometry.width, geometry.height) / 250} /> : null}
                {background ? <image href={background.href} x={0} y={0} width={background.width} height={background.height} preserveAspectRatio="none" data-testid="drawing-background" /> : null}
                {drawing?.polygons.map(polygon => {
                  const entry = itemByPolygon.get(polygon.id);
                  if (!entry) return null;
                  const { item, index } = entry;
                  const unit = item.unitId ? unitById.get(item.unitId) : undefined;
                  const points = polygon.points.map(p => `${p.x},${geometry.flipY(p.y)}`).join(" ");
                  const centre = polygon.points.reduce((acc, p) => ({ x: acc.x + p.x / polygon.points.length, y: acc.y + p.y / polygon.points.length }), { x: 0, y: 0 });
                  const isSelected = selectedId === polygon.id;
                  const villa = item.state === "confirmed" && item.unitCode ? villaByCode(item.unitCode) : undefined;
                  const isPicked = picked.has(polygon.id);
                  const hatch = showTypes && villa?.modelCode ? hatchOf.get(villa.modelCode) : undefined;
                  return (
                    <g key={polygon.id}>
                      <polygon
                        points={points}
                        fill={colouring && item.state === "confirmed" && item.unitCode ? SITE_COLOUR[colouring.keyOf(item.unitCode)] : polygonFill(item, unit?.status ?? null)}
                        fillOpacity={item.unitCode && !passesFilter(villa ?? null, blockFilter, modelFilter, phaseFilter) ? 0.08 : background ? 0.45 : 0.75}
                        data-colour={colouring && item.state === "confirmed" && item.unitCode ? colouring.keyOf(item.unitCode) : undefined}
                        stroke={isPicked ? "var(--primary)" : isSelected ? "var(--foreground)" : "var(--muted-foreground)"}
                        strokeWidth={isPicked ? 3 : isSelected ? 0.4 : 0.15}
                        vectorEffect={isPicked ? "non-scaling-stroke" : undefined}
                        data-picked={isPicked || undefined}
                        data-model={villa?.modelCode || undefined}
                        strokeDasharray={item.state === "unlinked" ? "1 0.6" : undefined}
                        role="button"
                        aria-pressed={isPicked || isSelected}
                        tabIndex={0}
                        aria-label={`${t.shape(index + 1)}: ${item.unitCode ?? t.state[item.state]}${villa?.modelCode ? ` · ${pickLanguage(language, { ar: "النوع", en: "Type", ur: "قسم" })} ${villa.modelCode}` : ""}`}
                        onClick={event => { if (tool === "none") choose(polygon.id, several || event.ctrlKey || event.metaKey || event.shiftKey, "plan"); }}
                        onKeyDown={event => { if (tool === "none" && !linkTool && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); choose(polygon.id, several || event.ctrlKey || event.metaKey || event.shiftKey, "plan"); } }}
                        // While calibrating or measuring the shapes take no taps: a phone would otherwise move a tap onto the nearest shape.
                        style={tool === "none" && !linkTool ? { cursor: "pointer" } : { pointerEvents: "none" }}
                      />
                      {hatch !== undefined ? <polygon points={points} fill={`url(#mp-hatch-${hatch})`} pointerEvents="none" data-hatch={hatch} aria-hidden="true" /> : null}
                      {item.unitCode ? (() => {
                        const detail = villaByCode(item.unitCode);
                        const xs = polygon.points.map(p => p.x); const ys = polygon.points.map(p => p.y); const boxHeight = Math.max(...ys) - Math.min(...ys); const boxWidth = Math.max(...xs) - Math.min(...xs);
                        if (!detailed || !detail) return <text x={centre.x} y={geometry.flipY(centre.y)} fontSize={geometry.width / 60} textAnchor="middle" fill="var(--foreground)" pointerEvents="none">{item.unitCode}</text>;
                        // three short lines sized to the villa's own shape, so they stay inside it however far the plan is zoomed
                        const size = Math.max(Math.min(boxHeight / 4.2, boxWidth / 9, geometry.width / 60), geometry.width / 2000);
                        const y = geometry.flipY(centre.y);
                        return <text x={centre.x} y={y - size} fontSize={size} textAnchor="middle" fill="var(--foreground)" pointerEvents="none" data-villa-detail={item.unitCode}>
                          <tspan x={centre.x} fontWeight={700}>{item.unitCode}</tspan>
                          <tspan x={centre.x} dy={size * 1.15}>{detail.currentActivity ? detail.currentActivity.name.slice(0, 22) : t.villaComplete}</tspan>
                          <tspan x={centre.x} dy={size * 1.15} direction="ltr">{`${Math.round(detail.overallPercent ?? 0)}%`}</tspan>
                        </text>;
                      })() : null}
                    </g>
                  );
                })}
                {linkPicks.length > 0 ? <polyline data-testid="link-polygon" points={linkPicks.map(p => `${p.x},${geometry.flipY(p.y)}`).join(" ")} fill="none" stroke="currentColor" className="text-danger-soft-foreground" strokeWidth={Math.max(geometry.width, geometry.height) / 400} pointerEvents="none" /> : null}
                <MeasureOverlay picks={picks} flipY={geometry.flipY} size={Math.max(geometry.width, geometry.height) / 150} />
              </svg>
              <p className="mt-2 text-xs text-muted-foreground">{t.legend}</p>
            </div>
          ) : null}

          {/* Q-40 (4): one villa chosen (on the plan or in the list) shows its details beside the list */}
          {geometry && picked.size === 1 ? (() => {
            const item = itemByPolygon.get(Array.from(picked)[0]!)?.item;
            if (!item?.unitCode || item.state !== "confirmed") return null;
            const detail = villaByCode(item.unitCode);
            const number = unitNumberOf(item.unitCode);
            return <VillaInfoPanel villa={{ unitCode: item.unitCode, unitNumber: number, blockCode: detail?.blockCode, modelCode: detail?.modelCode, overallPercent: detail?.overallPercent ?? null, currentActivity: detail?.currentActivity ?? null,
              statusText: colouring ? colourText.keys[colouring.keyOf(item.unitCode)] : null,
              cardHref: number !== null ? `/m/${tenantId}/${projectId}/unit/${number}${activityCode ? `?activity=${encodeURIComponent(activityCode)}` : ""}` : null }} />;
          })() : null}
          {geometry ? (
            <MasterPlanVillaList villas={listedVillas} picked={picked} several={several} onSeveral={setSeveral} revealId={revealId}
              onPick={(id, many) => choose(id, many, "list")} onClear={() => setPicked(new Set())} onShow={() => focusShapes(picked)} />
          ) : null}

          <div className="space-y-2">
            <h4 className="font-semibold">{t.shapes}</h4>
            <ul className="divide-y divide-border">
              {items.map((item, index) => {
                return (
                  <li key={item.polygonId} className={`py-3 ${selectedId === item.polygonId ? "bg-muted" : ""}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button type="button" className="min-h-[44px] text-start font-medium" onClick={() => setSelectedId(item.polygonId)} aria-pressed={selectedId === item.polygonId}>
                        {t.shape(index + 1)} · {t.state[item.state]}{item.unitCode ? ` · ${item.unitCode}` : ""}
                      </button>
                      {item.state === "confirmed" && item.unitId && unitById.get(item.unitId)?.status ? <span className="text-xs text-muted-foreground">{unitStatusText(unitById.get(item.unitId)!.status)}</span> : null}
                      {reasonText(item.reason) ? <span className="text-xs text-muted-foreground">{reasonText(item.reason)}</span> : null}
                      {colouring && item.state === "confirmed" && item.unitCode ? <span className="text-xs text-muted-foreground" data-site-status>{colourText.keys[colouring.keyOf(item.unitCode)]}</span> : null}
                    </div>
                    {selectedId === item.polygonId && item.state === "confirmed" && item.unitCode && colouring?.villaOf(item.unitCode) ? (
                      <a className="mt-2 inline-flex min-h-[44px] items-center rounded-lg border border-border px-3 text-sm" href={`/m/${tenantId}/${projectId}/unit/${colouring.villaOf(item.unitCode)!.unitNumber}${activityCode ? `?activity=${encodeURIComponent(activityCode)}` : ""}`}>{colourText.card}</a>
                    ) : null}
                    {selectedId === item.polygonId ? (
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        {item.state === "proposed" ? (
                          <>
                            <button type="button" className="min-h-[44px] rounded-lg bg-primary px-3 text-sm text-white" onClick={() => applyResult(confirmLink(items, item.polygonId))}>{t.confirm}</button>
                            <button type="button" className="min-h-[44px] rounded-lg border border-border px-3 text-sm" onClick={() => applyResult(rejectLink(items, item.polygonId))}>{t.reject}</button>
                          </>
                        ) : null}
                        {item.state === "confirmed" ? (
                          <button type="button" className="min-h-[44px] rounded-lg border border-border px-3 text-sm" onClick={() => applyResult(clearLink(items, item.polygonId))}>{t.clear}</button>
                        ) : null}
                        {item.layer === MANUAL_LAYER ? (
                          <button type="button" className="min-h-[44px] rounded-lg border border-border px-3 text-sm" onClick={() => { if (!drawing) return; const next = removeManualShape(drawing, items, item.polygonId); setDrawing(next.drawing); setItems(next.items); setSelectedId(null); }}>{manualText.removeShape}</button>
                        ) : null}
                        {item.state !== "confirmed" ? (
                          <>
                            <label className="flex flex-col text-xs">
                              {t.assignLabel}
                              <Select aria-label={t.assignLabel} value={choice[item.polygonId] || NO_CHOICE} onValueChange={value => setChoice(prev => ({ ...prev, [item.polygonId]: value === NO_CHOICE ? "" : value }))}
                                options={[{ value: NO_CHOICE, label: t.noChoice }, ...remaining.map(unit => ({ value: unit.id, label: unit.code }))]} />
                            </label>
                            <button
                              type="button"
                              className="min-h-[44px] rounded-lg border border-border px-3 text-sm"
                              disabled={!choice[item.polygonId]}
                              onClick={() => {
                                const unit = unitById.get(choice[item.polygonId]);
                                if (unit) applyResult(assignUnit(items, item.polygonId, unit));
                              }}
                            >
                              {t.assign}
                            </button>
                          </>
                        ) : null}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
            {items.length === 0 ? <p className="text-sm text-muted-foreground">{t.none}</p> : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="min-h-[44px] rounded-lg bg-primary px-4 text-sm text-white disabled:opacity-50" disabled={!drawing || !hasVersion || saved.busy || (!file && !saved.layout?.latestVersion)} onClick={onSave}>{t.save}</button>
            <button type="button" className="min-h-[44px] rounded-lg border border-border px-4 text-sm" onClick={() => download("master-plan-links.csv", exportLinksCsv(items), "text/csv")}>{t.exportCsv}</button>
            <button type="button" className="min-h-[44px] rounded-lg border border-border px-4 text-sm" onClick={() => download("master-plan-links.json", exportLinksJson(items), "application/json")}>{t.exportJson}</button>
          </div>
        </>
      )}
    </section>
  );
}
