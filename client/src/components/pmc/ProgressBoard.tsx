// Q-63 (batch 1): the villas' progress board on the PMC page — a KPI bar (actual, planned today, variance, SPI, the month's target and the weekly pace
// needed to reach it) and a map of every villa coloured by progress, by this month's increase or by model. With no linked drawing the map is a schematic
// by block (never an empty screen). Every figure comes from the server (pmc.progressBoard, the PMC read gate); an unknown is «—», never 0.
// The map is drawn on one canvas so 1,200 villas paint in well under a second on a phone; a tap opens the villa's card.
import React from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { formatNumber, formatPercent } from "@/components/ds/format";
import { ErrorState, LoadingState } from "@/components/ScreenStates";
import { bandOf, cellAt, schematicLayout, type ColourMode, type Layout } from "@/lib/progressBoardLayout";

const text = {
  ar: { actual: "الإنجاز الفعلي", planned: "المخطط حتى اليوم", variance: "الفرق", spi: "مؤشر أداء الجدول (SPI)", target: "مستهدف نهاية الشهر", perWeek: "المطلوب أسبوعيًا", thisMonth: "زيادة هذا الشهر", noBaseline: "المخطط والفرق وSPI تظهر بعد استيراد البرنامج الزمني المخطط.", villas: "فيلا", done: "منجزة", inProgress: "جارية", notStarted: "لم تبدأ", unknown: "غير محسوبة", colour: "التلوين", modes: { progress: "نسبة الإنجاز", month: "هذا الشهر", model: "النموذج" }, mapLabel: (n: number) => `خريطة ${n} فيلا ملوّنة؛ اضغط فيلا لفتح بطاقتها`, schematic: "خريطة تخطيطية بالبلوك (لا رسم مربوط بعد)", legend: { done: "100%", high: "67–99%", mid: "34–66%", low: "1–33%", none: "0%", unknown: "غير محسوب" }, legendMonth: { high: "15%+", mid: "5–15%", low: "أقل من 5%", none: "لا شيء", unknown: "غير محسوب" }, empty: "لا فلل في هذا المشروع بعد. استورد قائمة الفلل من «الاستيراد».", failed: "تعذّر تحميل لوحة التقدّم", loading: "جارٍ تحميل لوحة التقدّم…" },
  en: { actual: "Actual progress", planned: "Planned to date", variance: "Variance", spi: "Schedule performance (SPI)", target: "Month-end target", perWeek: "Needed per week", thisMonth: "Added this month", noBaseline: "Planned, variance and SPI appear once the planned programme is imported.", villas: "villas", done: "done", inProgress: "in progress", notStarted: "not started", unknown: "not computed", colour: "Colour by", modes: { progress: "Progress", month: "This month", model: "Model" }, mapLabel: (n: number) => `Map of ${n} villas, coloured; tap a villa to open its card`, schematic: "Schematic map by block (no drawing linked yet)", legend: { done: "100%", high: "67–99%", mid: "34–66%", low: "1–33%", none: "0%", unknown: "not computed" }, legendMonth: { high: "15%+", mid: "5–15%", low: "under 5%", none: "none", unknown: "not computed" }, empty: "No villas in this project yet. Import the villa list from «Import».", failed: "The progress board could not be loaded", loading: "Loading the progress board…" },
  ur: { actual: "اصل پیش رفت", planned: "آج تک منصوبہ بند", variance: "فرق", spi: "شیڈول کارکردگی (SPI)", target: "مہینے کے آخر کا ہدف", perWeek: "ہفتہ وار درکار", thisMonth: "اس مہینے کا اضافہ", noBaseline: "منصوبہ بند، فرق اور SPI منصوبہ بند پروگرام درآمد ہونے کے بعد دکھائی دیں گے۔", villas: "ولاز", done: "مکمل", inProgress: "جاری", notStarted: "شروع نہیں", unknown: "حساب نہیں", colour: "رنگ بلحاظ", modes: { progress: "پیش رفت", month: "یہ مہینہ", model: "ماڈل" }, mapLabel: (n: number) => `${n} ولاز کا رنگین نقشہ؛ کارڈ کھولنے کے لیے ولا پر ٹیپ کریں`, schematic: "بلاک کے لحاظ سے خاکہ نقشہ (ابھی کوئی ڈرائنگ منسلک نہیں)", legend: { done: "100%", high: "67–99%", mid: "34–66%", low: "1–33%", none: "0%", unknown: "حساب نہیں" }, legendMonth: { high: "15%+", mid: "5–15%", low: "5% سے کم", none: "کچھ نہیں", unknown: "حساب نہیں" }, empty: "اس منصوبے میں ابھی کوئی ولا نہیں۔ «درآمد» سے ولاز کی فہرست درآمد کریں۔", failed: "پیش رفت بورڈ لوڈ نہیں ہو سکا", loading: "پیش رفت بورڈ لوڈ ہو رہا ہے…" },
};

/** The theme colour of each band, read from the page's tokens so both themes stay right. */
const BAND_TOKEN: Record<string, string> = { done: "--success", high: "--chart-1", mid: "--chart-2", low: "--chart-3", none: "--border", unknown: "--muted", "model:0": "--chart-1", "model:1": "--chart-2", "model:2": "--chart-3", "model:3": "--chart-4", "model:4": "--chart-5" };
const token = (name: string) => (typeof document === "undefined" ? "#888" : getComputedStyle(document.documentElement).getPropertyValue(name).trim() || "#888");
const pct = (value: number | null) => (value === null ? "—" : formatPercent(value, 1));
const signed = (value: number | null) => (value === null ? "—" : `${value > 0 ? "+" : ""}${formatPercent(value, 1)}`);

export function ProgressBoard({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { language, isArabic } = useLanguage();
  const t = pickLanguage(language, text);
  const [, navigate] = useLocation();
  const [mode, setMode] = React.useState<ColourMode>("progress");
  const board = trpc.pmc.progressBoard.useQuery({ tenantId, projectId });
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    const element = wrapRef.current; if (!element) return;
    const measure = () => setWidth(Math.floor(element.clientWidth));
    measure();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    observer?.observe(element); return () => observer?.disconnect();
  }, [board.data]);
  const units = board.data?.units ?? [];
  const models = React.useMemo(() => Array.from(new Set(units.map(u => u.modelCode))).sort(), [units]);
  const layout: Layout | null = React.useMemo(() => (width > 0 && units.length ? schematicLayout(units, width, width < 480 ? 10 : 14) : null), [units, width]);

  React.useEffect(() => {
    const canvas = canvasRef.current; if (!canvas || !layout) return;
    const ratio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    canvas.width = layout.width * ratio; canvas.height = Math.max(layout.height, 1) * ratio;
    const context = canvas.getContext("2d"); if (!context) return;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, layout.width, layout.height);
    const colours = new Map(Object.entries(BAND_TOKEN).map(([band, name]) => [band, token(name)]));
    const byNumber = new Map(units.map(u => [u.unitNumber, u]));
    for (const cell of layout.cells) { const unit = byNumber.get(cell.unitNumber); if (!unit) continue; context.fillStyle = colours.get(bandOf(unit, mode, models)) ?? "#888"; context.fillRect(cell.x, cell.y, cell.size, cell.size); }
    context.fillStyle = token("--muted-foreground"); context.font = "600 11px system-ui, sans-serif"; context.textBaseline = "top";
    for (const block of layout.blocks) context.fillText(block.blockCode, block.x, block.y + 2);
  }, [layout, units, mode, models]);

  if (board.isLoading) return <LoadingState isArabic={isArabic} label={t.loading} />;
  if (board.error) return <ErrorState isArabic={isArabic} error={board.error} title={t.failed} onRetry={() => board.refetch()} retrying={board.isFetching} />;
  const data = board.data!;
  const kpi = data.kpi;
  const tiles: Array<[string, string, string?]> = [[t.actual, pct(kpi.actual)], [t.planned, pct(kpi.plannedToday)], [t.variance, signed(kpi.variance), kpi.variance === null ? undefined : kpi.variance < 0 ? "text-destructive" : "text-success"], [t.spi, kpi.spi === null ? "—" : formatNumber(kpi.spi, 2)], [t.target, pct(kpi.monthTarget)], [t.perWeek, pct(kpi.perWeekNeeded)], [t.thisMonth, pct(kpi.thisMonth)]];
  const legend = mode === "month" ? t.legendMonth : mode === "progress" ? t.legend : Object.fromEntries(models.map((model, index) => [`model:${index % 5}`, model]));

  return (
    <section data-progress-board="" className="flex min-w-0 flex-col gap-4">
      <div role="list" className="grid grid-cols-2 gap-3 sm:grid-cols-4 xl:grid-cols-7">
        {tiles.map(([label, value, tone]) => <div role="listitem" key={label} data-kpi={label} className="rounded-[14px] border border-border bg-card p-3"><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 text-xl font-semibold tabular-nums ${tone ?? ""}`}><bdi dir="ltr">{value}</bdi></p></div>)}
      </div>
      {!data.hasBaseline ? <p className="text-sm text-muted-foreground" data-no-baseline="">{t.noBaseline}</p> : null}
      <p className="text-sm" data-board-counts=""><bdi>{data.counts.villas}</bdi> {t.villas} · <bdi>{data.counts.done}</bdi> {t.done} · <bdi>{data.counts.inProgress}</bdi> {t.inProgress} · <bdi>{data.counts.notStarted}</bdi> {t.notStarted}{data.counts.unknown ? <> · <bdi>{data.counts.unknown}</bdi> {t.unknown}</> : null}</p>
      {!units.length ? <p className="rounded-[14px] border border-dashed border-border p-4 text-sm text-muted-foreground" data-board-empty="">{t.empty}</p> : <>
        <div role="group" aria-label={t.colour} className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">{t.colour}</span>
          {(["progress", "month", "model"] as const).map(key => <button key={key} type="button" aria-pressed={mode === key} data-colour-mode={key} onClick={() => setMode(key)} className={`min-h-11 rounded-[var(--radius)] border px-3 text-sm ${mode === key ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card"}`}>{t.modes[key]}</button>)}
        </div>
        <p className="text-xs text-muted-foreground">{t.schematic}</p>
        <div ref={wrapRef} className="w-full min-w-0">
          <canvas ref={canvasRef} role="img" aria-label={t.mapLabel(units.length)} data-board-map="" style={{ width: layout?.width ?? "100%", height: layout?.height ?? 0 }} className="block cursor-pointer"
            onClick={event => { if (!layout) return; const box = event.currentTarget.getBoundingClientRect(); const number = cellAt(layout, event.clientX - box.left, event.clientY - box.top); if (number !== null) navigate(`/m/${tenantId}/${projectId}/unit/${number}`); }} />
        </div>
        <ul className="flex flex-wrap gap-3 text-xs" data-board-legend="">{Object.entries(legend).map(([band, label]) => <li key={band} className="flex items-center gap-1"><span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm" style={{ background: `var(${BAND_TOKEN[band] ?? "--muted"})` }} />{label}</li>)}</ul>
      </>}
    </section>
  );
}
