// Interactive master-plan drawing: read a DXF in the browser, match its shapes to the plan's units,
// let a person confirm each link, colour the map by unit status, and export the confirmed links.
// The file never leaves the browser, and nothing is saved on the server (G-189).
import React, { useEffect, useMemo, useState, type ChangeEvent } from "react";
import { trpc } from "@/lib/trpc";
import { latestVersionId } from "@/lib/masterPlanDrawingLayout";
import { useMasterPlanDrawingLayout } from "@/lib/useMasterPlanDrawingLayout";
import { SectionMessage } from "@/components/SectionResilience";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { matchDrawingToUnits, type ProjectUnit } from "@/lib/dxf/dxfMatch";
import { readDxf, type DxfDrawing } from "@/lib/dxf/dxfReader";
import { rasterKind, readPdfFirstPage, readRasterImage } from "@/lib/raster/rasterFile";
import type { OcrWorker } from "@/lib/raster/ocrWorker";
import {
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
    title: "الرسم التفاعلي للخطة الرئيسية",
    intro: "ارفع ملف DXF للرسم. تُربط الأشكال بالوحدات تلقائيًا، ويجب أن تؤكد كل ربط قبل أن يُحسب.",
    upload: "اختيار ملف الرسم",
    noUnits: "لا توجد وحدات في أحدث إصدار من الخطة الرئيسية. أضف الوحدات أولًا.",
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
    legend: "الألوان: حسب حالة الوحدة للمؤكَّد، أزرق للمقترح، رمادي لغير المربوط.",
    exportCsv: "تصدير الروابط المؤكدة (CSV)",
    exportJson: "تصدير الروابط المؤكدة (JSON)",
    save: "حفظ التخطيط",
    saved: "تم حفظ التخطيط.",
    savedVersion: (version: number, name: string) => `الرسم المحفوظ: النسخة ${version}، ${name}`,
    saveFailed: "تعذر حفظ التخطيط. راجع الرسالة وحاول مجددًا.",
    readFailed: "تعذّرت قراءة الملف",
    unsupported: "نوع الملف غير مدعوم. ارفع ملف DXF أو PNG أو JPG أو PDF.",
    rasterFailed: "تعذّرت قراءة الصورة. جرّب ملفًا أوضح أو ملف DXF.",
    busy: (done: number, total: number) => (total === 0 ? "جارٍ قراءة الرسم…" : `جارٍ قراءة الوحدات: ${done} من ${total}`),
    rasterNote: (shapes: number, labels: number) => `وُجد ${shapes} شكلًا وقُرئ رمز ${labels} منها. كل ربط مقترح من قراءة الصورة، فأكِّده أو غيّره قبل الحساب.`,
    tooLarge: "الملف أكبر من الحد المسموح به",
    empty: "لم يُرفع رسم بعد.",
    ignored: "كيانات لم تُقرأ",
  },
  en: {
    title: "Interactive master-plan drawing",
    intro: "Upload a DXF drawing. Shapes are matched to units automatically, and each link must be confirmed before it counts.",
    upload: "Choose a drawing file",
    noUnits: "The latest master-plan version has no units. Add units first.",
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
    legend: "Colours: confirmed shapes use the unit status; blue is proposed; grey is unlinked.",
    exportCsv: "Export confirmed links (CSV)",
    exportJson: "Export confirmed links (JSON)",
    save: "Save layout",
    saved: "Layout saved.",
    savedVersion: (version: number, name: string) => `Saved drawing: version ${version}, ${name}`,
    saveFailed: "The layout could not be saved. Check the message and try again.",
    readFailed: "The file could not be read",
    unsupported: "This file type is not supported. Upload a DXF, PNG, JPG or PDF file.",
    rasterFailed: "The image could not be read. Try a clearer file or a DXF.",
    busy: (done: number, total: number) => (total === 0 ? "Reading the drawing…" : `Reading units: ${done} of ${total}`),
    rasterNote: (shapes: number, labels: number) => `Found ${shapes} shapes and read the code in ${labels} of them. Each proposed link comes from reading the image: confirm or change it before it counts.`,
    tooLarge: "The file is larger than the allowed limit",
    empty: "No drawing uploaded yet.",
    ignored: "Entities not read",
  },
  ur: {
    title: "Interactive master-plan drawing",
    intro: "Upload a DXF drawing. Shapes are matched to units automatically, and each link must be confirmed before it counts.",
    upload: "Choose a drawing file",
    noUnits: "The latest master-plan version has no units. Add units first.",
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
    legend: "Colours: confirmed shapes use the unit status; blue is proposed; grey is unlinked.",
    exportCsv: "Export confirmed links (CSV)",
    exportJson: "Export confirmed links (JSON)",
    save: "Save layout",
    saved: "Layout saved.",
    savedVersion: (version: number, name: string) => `Saved drawing: version ${version}, ${name}`,
    saveFailed: "The layout could not be saved. Check the message and try again.",
    readFailed: "The file could not be read",
    unsupported: "This file type is not supported. Upload a DXF, PNG, JPG or PDF file.",
    rasterFailed: "The image could not be read. Try a clearer file or a DXF.",
    busy: (done: number, total: number) => (total === 0 ? "Reading the drawing…" : `Reading units: ${done} of ${total}`),
    rasterNote: (shapes: number, labels: number) => `Found ${shapes} shapes and read the code in ${labels} of them. Each proposed link comes from reading the image: confirm or change it before it counts.`,
    tooLarge: "The file is larger than the allowed limit",
    empty: "No drawing uploaded yet.",
    ignored: "Entities not read",
  },
};

// Units of the newest version of the newest plan: the set a drawing is matched against.
function latestUnits(data: { plans: { id: string }[]; versions: { id: string; masterPlanId: string; versionNumber: number }[]; entities: { id: string; masterPlanVersionId: string; entityType: string; code: string; name: string; status: string; progressPercent: string }[] } | undefined): PlanUnit[] {
  const plan = data?.plans[0];
  if (!plan || !data) return [];
  const version = data.versions.filter(v => v.masterPlanId === plan.id).sort((a, b) => b.versionNumber - a.versionNumber)[0];
  if (!version) return [];
  return data.entities
    .filter(entity => entity.masterPlanVersionId === version.id && entity.entityType === "unit")
    .map(entity => ({ id: entity.id, code: entity.code, name: entity.name, status: entity.status, progressPercent: entity.progressPercent }));
}

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

export function MasterPlanDrawing({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { language, isArabic } = useLanguage();
  const t = text[language];
  const plansQuery = trpc.masterPlans.list.useQuery({ tenantId, projectId });
  const units = useMemo(() => latestUnits(plansQuery.data), [plansQuery.data]);
  // The saved layout of the newest version's drawing (G-189): it fills the screen when a drawing is not open yet, and saves what the person confirms.
  const saved = useMasterPlanDrawingLayout({ tenantId, projectId, masterPlanVersionId: latestVersionId(plansQuery.data), units });
  const [file, setFile] = useState<File | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const [drawing, setDrawing] = useState<DxfDrawing | null>(null);
  const [items, setItems] = useState<ReviewItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [zoom, setZoom] = useState(1);
  const [error, setError] = useState<ViewError | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [rasterStats, setRasterStats] = useState<{ shapes: number; labels: number } | null>(null);

  useEffect(() => {
    if (!drawing && saved.savedReview) {
      setDrawing(saved.savedReview.drawing);
      setItems(saved.savedReview.items);
    }
  }, [drawing, saved.savedReview]);

  const unitById = useMemo(() => new Map(units.map(unit => [unit.id, unit])), [units]);
  const summary = summarizeReview(items, units);
  const remaining = units.filter(unit => !items.some(entry => entry.state === "confirmed" && entry.unitId === unit.id));
  const selected = items.find(item => item.polygonId === selectedId) ?? null;
  const geometry = drawing ? mapGeometry(drawing) : null;
  const ignoredCount = drawing ? Object.values(drawing.ignoredEntities).reduce((sum, value) => sum + value, 0) : 0;

  const applyResult = (result: ReviewResult) => {
    if (result.ok) {
      setItems(result.items);
      setError(null);
    } else {
      setError({ kind: "action", code: result.error.code, message: result.error.message });
    }
  };

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > MAX_DXF_BYTES) {
      setError({ kind: "file", code: "FILE_TOO_LARGE", message: { ar: text.ar.tooLarge, en: text.en.tooLarge, ur: text.ur.tooLarge } });
      return;
    }
    setFile(file);
    setSavedNotice(false);
    if (/\.dxf$/i.test(file.name)) {
      await readDxfFile(file);
      return;
    }
    const kind = rasterKind(file.name);
    if (!kind) {
      setError({ kind: "file", code: "UNSUPPORTED_FILE", message: { ar: text.ar.unsupported, en: text.en.unsupported, ur: text.ur.unsupported } });
      return;
    }
    await readRasterDrawing(file, kind);
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
    setItems(buildReview(parsed.drawing, matchDrawingToUnits(parsed.drawing, units)));
    setSelectedId(null);
    setError(null);
  }

  // Tesseract and pdf.js load only here, so a plan page that never opens a raster drawing does not download them.
  async function readRasterDrawing(file: File, kind: "image" | "pdf") {
    setError(null);
    setProgress({ done: 0, total: 0 });
    let ocr: OcrWorker | null = null;
    try {
      const image = kind === "pdf" ? await readPdfFirstPage(new Uint8Array(await file.arrayBuffer())) : await readRasterImage(file);
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
    const outcome = await saved.save({ file, drawing, items });
    if (outcome.ok) {
      setFile(null);
      setSavedNotice(true);
    } else {
      setError({ kind: "action", code: outcome.code, message: { ar: text.ar.saveFailed, en: text.en.saveFailed, ur: text.ur.saveFailed } });
    }
  }

  const unitStatusText = (status: string) => (t.unitStatus as Record<string, string>)[status] ?? status;
  const reasonText = (reason: string | null) => (reason && (t.reason as Record<string, string>)[reason]) || null;

  return (
    <section aria-labelledby="master-plan-drawing-title" className="space-y-4 rounded-2xl bg-white p-5 shadow-sm ring-1 ring-slate-200">
      <div>
        <h3 id="master-plan-drawing-title" className="text-lg font-semibold">{t.title}</h3>
        <p className="mt-1 text-sm text-slate-600">{t.intro}</p>
      </div>

      {plansQuery.error ? <SectionMessage title={t.title} isArabic={isArabic} language={language} kind="error" error={plansQuery.error} onRetry={() => plansQuery.refetch()} /> : null}

      {plansQuery.data && units.length === 0 ? <p role="note" className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t.noUnits}</p> : null}

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex min-h-[44px] cursor-pointer items-center rounded-lg border border-slate-300 bg-white px-4 text-sm font-medium">
          {t.upload}
          <input type="file" accept=".dxf,.png,.jpg,.jpeg,.pdf" className="sr-only" onChange={onFile} disabled={units.length === 0} />
        </label>
      </div>

      {saved.layout?.latestVersion ? <p className="text-sm text-slate-700">{t.savedVersion(saved.layout.latestVersion.versionNumber, saved.layout.latestVersion.fileName)}</p> : null}
      {savedNotice ? <p role="status" className="text-sm text-emerald-800">{t.saved}</p> : null}
      {progress ? <p role="status" aria-live="polite" className="text-sm text-slate-700">{t.busy(progress.done, progress.total)}</p> : null}

      {error ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{pickLanguage(language, error.message)}</p> : null}

      {!drawing ? <p className="text-sm text-slate-500">{t.empty}</p> : (
        <>
          <p className="text-sm font-medium" aria-live="polite">{t.summary(summary)}</p>
          {rasterStats ? <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">{t.rasterNote(rasterStats.shapes, rasterStats.labels)}</p> : null}
          {ignoredCount > 0 ? <p className="text-xs text-slate-500">{t.ignored}: {ignoredCount}</p> : null}

          {geometry ? (
            <div>
              <div className="mb-2 flex gap-2">
                <button type="button" className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm" onClick={() => setZoom(z => Math.min(z * 1.5, 8))} aria-label={t.zoomIn}>+</button>
                <button type="button" className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm" onClick={() => setZoom(z => Math.max(z / 1.5, 0.5))} aria-label={t.zoomOut}>−</button>
              </div>
              <svg role="img" aria-label={t.map} viewBox={`${geometry.x + geometry.width / 2 - geometry.width / (2 * zoom)} ${geometry.y + geometry.height / 2 - geometry.height / (2 * zoom)} ${geometry.width / zoom} ${geometry.height / zoom}`} className="h-auto w-full rounded-lg bg-slate-50 ring-1 ring-slate-200">
                {drawing?.polygons.map(polygon => {
                  const item = items.find(entry => entry.polygonId === polygon.id);
                  if (!item) return null;
                  const unit = item.unitId ? unitById.get(item.unitId) : undefined;
                  const points = polygon.points.map(p => `${p.x},${geometry.flipY(p.y)}`).join(" ");
                  const centre = polygon.points.reduce((acc, p) => ({ x: acc.x + p.x / polygon.points.length, y: acc.y + p.y / polygon.points.length }), { x: 0, y: 0 });
                  const isSelected = selectedId === polygon.id;
                  return (
                    <g key={polygon.id}>
                      <polygon
                        points={points}
                        fill={polygonFill(item, unit?.status ?? null)}
                        fillOpacity={0.75}
                        stroke={isSelected ? "#111827" : "#475569"}
                        strokeWidth={isSelected ? 0.4 : 0.15}
                        strokeDasharray={item.state === "unlinked" ? "1 0.6" : undefined}
                        role="button"
                        tabIndex={0}
                        aria-label={`${t.shape(items.indexOf(item) + 1)}: ${item.unitCode ?? t.state[item.state]}`}
                        onClick={() => setSelectedId(polygon.id)}
                        onKeyDown={event => { if (event.key === "Enter" || event.key === " ") setSelectedId(polygon.id); }}
                        style={{ cursor: "pointer" }}
                      />
                      {item.unitCode ? <text x={centre.x} y={geometry.flipY(centre.y)} fontSize={geometry.width / 60} textAnchor="middle" fill="#111827" pointerEvents="none">{item.unitCode}</text> : null}
                    </g>
                  );
                })}
              </svg>
              <p className="mt-2 text-xs text-slate-600">{t.legend}</p>
            </div>
          ) : null}

          <div className="space-y-2">
            <h4 className="font-semibold">{t.shapes}</h4>
            <ul className="divide-y divide-slate-200">
              {items.map((item, index) => {
                return (
                  <li key={item.polygonId} className={`py-3 ${selectedId === item.polygonId ? "bg-slate-50" : ""}`}>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <button type="button" className="min-h-[44px] text-start font-medium" onClick={() => setSelectedId(item.polygonId)} aria-pressed={selectedId === item.polygonId}>
                        {t.shape(index + 1)} · {t.state[item.state]}{item.unitCode ? ` · ${item.unitCode}` : ""}
                      </button>
                      {item.state === "confirmed" && item.unitId && unitById.get(item.unitId) ? <span className="text-xs text-slate-600">{unitStatusText(unitById.get(item.unitId)!.status)}</span> : null}
                      {reasonText(item.reason) ? <span className="text-xs text-slate-600">{reasonText(item.reason)}</span> : null}
                    </div>
                    {selectedId === item.polygonId ? (
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        {item.state === "proposed" ? (
                          <>
                            <button type="button" className="min-h-[44px] rounded-lg bg-primary px-3 text-sm text-white" onClick={() => applyResult(confirmLink(items, item.polygonId))}>{t.confirm}</button>
                            <button type="button" className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm" onClick={() => applyResult(rejectLink(items, item.polygonId))}>{t.reject}</button>
                          </>
                        ) : null}
                        {item.state === "confirmed" ? (
                          <button type="button" className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm" onClick={() => applyResult(clearLink(items, item.polygonId))}>{t.clear}</button>
                        ) : null}
                        {item.state !== "confirmed" ? (
                          <>
                            <label className="flex flex-col text-xs">
                              {t.assignLabel}
                              <select className="min-h-[44px] rounded-lg border border-slate-300 px-2 text-sm" value={choice[item.polygonId] ?? ""} onChange={event => setChoice(prev => ({ ...prev, [item.polygonId]: event.target.value }))}>
                                <option value="">{t.noChoice}</option>
                                {remaining.map(unit => <option key={unit.id} value={unit.id}>{unit.code}</option>)}
                              </select>
                            </label>
                            <button
                              type="button"
                              className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm"
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
            {items.length === 0 ? <p className="text-sm text-slate-500">{t.none}</p> : null}
          </div>

          <div className="flex flex-wrap gap-2">
            <button type="button" className="min-h-[44px] rounded-lg bg-primary px-4 text-sm text-white disabled:opacity-50" disabled={!drawing || saved.busy || (!file && !saved.layout?.latestVersion)} onClick={onSave}>{t.save}</button>
            <button type="button" className="min-h-[44px] rounded-lg border border-slate-300 px-4 text-sm" onClick={() => download("master-plan-links.csv", exportLinksCsv(items), "text/csv")}>{t.exportCsv}</button>
            <button type="button" className="min-h-[44px] rounded-lg border border-slate-300 px-4 text-sm" onClick={() => download("master-plan-links.json", exportLinksJson(items), "application/json")}>{t.exportJson}</button>
          </div>
        </>
      )}
    </section>
  );
}
