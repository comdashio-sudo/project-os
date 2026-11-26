// Q-67 (6): «اختر من الخريطة» — the project's master plan (the saved drawing's shapes linked to a villa, pmc.progressMapShapes) as a way to choose the villas
// of a field entry, in step with «اختر من القائمة» (the same chosen list). Each villa is coloured by the chosen item's status (not started grey, in progress
// blue, under review, complete green; a villa the item does not apply to is faded and cannot be chosen); a tap chooses or un-chooses it (a bold outline and
// a ✓); «choose by area» drags a rectangle; a block's name chooses its villas; the phase filter brings its villas into view. One SVG for the whole plan.
import React from "react";
import { Button, Select, formatNumber } from "@/components/ds";
import { PanZoomControls, usePanZoom } from "@/components/PanZoomMap";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { cn } from "@/lib/utils";
import type { PickerVilla } from "@/lib/villaPicker";
import { boundsOf, centreOf, groupLabels, toggleVillas, villasInRectangle, type Point, type VillaShape } from "@/lib/villaMap";

const text = {
  ar: { chosen: (n: number) => `${formatNumber(n)} فيلا محددة`, clear: "مسح", area: "تحديد بمساحة", areaOn: "اسحب مستطيلًا حول الفلل", phase: "قرّب على المرحلة", all: "كل المشروع", map: "خريطة المشروع لاختيار الفلل", zoomIn: "تكبير", zoomOut: "تصغير", reset: "ملء الشاشة", key: { NOT_STARTED: "لم يبدأ", IN_PROGRESS: "جارٍ", UNDER_REVIEW: "قيد المراجعة", COMPLETE: "مكتمل", none: "لا ينطبق" } as Record<string, string>, villa: "فيلا" },
  en: { chosen: (n: number) => `${formatNumber(n)} villas chosen`, clear: "Clear", area: "Choose by area", areaOn: "Drag a rectangle around the villas", phase: "Zoom to the phase", all: "Whole project", map: "The project's plan for choosing villas", zoomIn: "Zoom in", zoomOut: "Zoom out", reset: "Fit to screen", key: { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", UNDER_REVIEW: "Under review", COMPLETE: "Complete", none: "Does not apply" } as Record<string, string>, villa: "Villa" },
  ur: { chosen: (n: number) => `${formatNumber(n)} ولاز منتخب`, clear: "صاف کریں", area: "رقبے سے منتخب کریں", areaOn: "ولاز کے گرد مستطیل کھینچیں", phase: "مرحلے پر زوم کریں", all: "پورا منصوبہ", map: "ولاز منتخب کرنے کے لیے منصوبے کا نقشہ", zoomIn: "زوم ان", zoomOut: "زوم آؤٹ", reset: "اسکرین پر فٹ", key: { NOT_STARTED: "شروع نہیں ہوا", IN_PROGRESS: "جاری", UNDER_REVIEW: "زیر جائزہ", COMPLETE: "مکمل", none: "لاگو نہیں" } as Record<string, string>, villa: "ولا" },
};
// not started is a visible grey (the light «none» state token reads as empty paper on the plan); a villa the item does not apply to is an empty dashed outline
const FILL: Record<string, string> = { NOT_STARTED: "fill-muted-foreground/35", IN_PROGRESS: "fill-info", UNDER_REVIEW: "fill-status-review", COMPLETE: "fill-success" };
const NOT_APPLICABLE = "fill-transparent stroke-muted-foreground/60";
const ALL = "__all";

export function VillaMap({ shapes: rawShapes, yUp, villas, models, chosen, onChosen }: { shapes: VillaShape[]; yUp: boolean; villas: PickerVilla[]; models: string[] | null; chosen: string[]; onChosen: (villas: string[]) => void }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  // a DXF's y goes up; the screen's goes down
  const shapes = React.useMemo(() => (yUp ? rawShapes.map(shape => ({ ...shape, points: shape.points.map(point => ({ x: point.x, y: -point.y })) })) : rawShapes), [rawShapes, yUp]);
  const bounds = React.useMemo(() => boundsOf(shapes.flatMap(shape => shape.points)), [shapes]);
  const pan = usePanZoom(bounds);
  const byVilla = React.useMemo(() => new Map(villas.map(villa => [villa.villa, villa])), [villas]);
  const applies = React.useCallback((villa: string) => { const item = byVilla.get(villa); return Boolean(item) && (!models || models.includes(item!.model)); }, [byVilla, models]);
  const chosenSet = React.useMemo(() => new Set(chosen), [chosen]);
  const blocks = React.useMemo(() => groupLabels(shapes, villa => byVilla.get(villa)?.block || null), [shapes, byVilla]);
  const phases = React.useMemo(() => Array.from(new Set(villas.map(villa => villa.phase).filter((phase): phase is string => Boolean(phase)))).sort((a, b) => a.localeCompare(b, "en", { numeric: true })), [villas]);
  const [phase, setPhase] = React.useState(ALL);
  const [area, setArea] = React.useState(false);
  const [drag, setDrag] = React.useState<{ from: Point; to: Point } | null>(null);
  const svgRef = React.useRef<SVGSVGElement | null>(null);
  const size = bounds ? Math.max(bounds.width, bounds.height) : 1;
  // the points as SVG text and the centre, once per drawing (not on every tap)
  const drawn = React.useMemo(() => shapes.map(shape => ({ villa: shape.villa, points: shape.points.map(point => `${point.x},${point.y}`).join(" "), centre: centreOf(shape.points) })), [shapes]);

  const choose = (list: string[]) => onChosen(toggleVillas(chosen, list.filter(applies)));
  const focusPhase = (value: string) => {
    setPhase(value);
    const points = value === ALL ? shapes.flatMap(shape => shape.points) : shapes.filter(shape => byVilla.get(shape.villa)?.phase === value).flatMap(shape => shape.points);
    const region = boundsOf(points);
    if (region) { if (value === ALL) pan.reset(); else pan.focus(region); }
  };
  // the pointer in the drawing's own units (the SVG's viewBox), for the rectangle
  const toDrawing = (event: React.PointerEvent<SVGSVGElement>): Point => {
    const svg = svgRef.current; const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return { x: 0, y: 0 };
    const point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix.inverse());
    return { x: point.x, y: point.y };
  };
  const { ref: panRef, ...panHandlers } = pan.svgProps;
  const setRefs = (node: SVGSVGElement | null) => { svgRef.current = node; (panRef as React.MutableRefObject<SVGSVGElement | null>).current = node; };
  const areaHandlers = {
    onPointerDown: (event: React.PointerEvent<SVGSVGElement>) => { event.currentTarget.setPointerCapture?.(event.pointerId); const at = toDrawing(event); setDrag({ from: at, to: at }); },
    onPointerMove: (event: React.PointerEvent<SVGSVGElement>) => { if (drag) setDrag({ ...drag, to: toDrawing(event) }); },
    onPointerUp: () => { if (drag) choose(villasInRectangle(shapes, drag.from, drag.to)); setDrag(null); setArea(false); },
    onPointerCancel: () => setDrag(null),
  };
  if (!bounds) return null;

  return (
    <div className="flex flex-col gap-2" data-villa-map>
      <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-border bg-card/95 p-2 text-sm backdrop-blur" data-map-bar>
        <span className="font-semibold" data-map-chosen>{t.chosen(chosen.length)}</span>
        {chosen.length > 0 && <Button type="button" variant="ghost" size="sm" onClick={() => onChosen([])}>{t.clear}</Button>}
        <Button type="button" variant={area ? "primary" : "secondary"} size="sm" aria-pressed={area} data-map-area onClick={() => setArea(value => !value)}>{t.area}</Button>
        {phases.length > 0 && <div className="min-w-32 flex-1 sm:flex-none"><Select aria-label={t.phase} value={phase} onValueChange={focusPhase} options={[{ value: ALL, label: t.all }, ...phases.map(code => ({ value: code, label: code }))]} /></div>}
      </div>
      {area && <p className="text-xs text-muted-foreground">{t.areaOn}</p>}
      <PanZoomControls pan={pan} labels={{ zoomIn: t.zoomIn, zoomOut: t.zoomOut, reset: t.reset }} />
      {/* the box takes the plan's own proportions (a wide plan is not lost in a tall box), between 14rem and 36rem high */}
      <svg ref={setRefs} {...(area ? { viewBox: panHandlers.viewBox, ...areaHandlers } : panHandlers)} style={{ touchAction: "none", userSelect: "none", aspectRatio: `${Math.max(bounds.width, 1)} / ${Math.max(bounds.height, bounds.width / 3, 1)}` }} role="group" aria-label={t.map}
        className="max-h-[36rem] min-h-56 w-full rounded-[var(--radius)] border border-border bg-muted/30" data-aspect={`${Math.round(bounds.width)}/${Math.round(bounds.height)}`}>
        {/* one delegated click for all the villas, and each villa drawn by a memoised shape: a tap redraws the villa it changed, not the 1,300 others */}
        <g onClick={event => { const villa = (event.target as Element).closest("[data-map-villa]")?.getAttribute("data-map-villa"); if (villa && applies(villa) && !area) onChosen(toggleVillas(chosen, [villa])); }}>
          {drawn.map(shape => <VillaShapeView key={shape.villa} villa={shape.villa} points={shape.points} centre={shape.centre} fill={FILL[byVilla.get(shape.villa)?.status ?? "NOT_STARTED"] ?? FILL.NOT_STARTED} ok={applies(shape.villa)} chosen={chosenSet.has(shape.villa)} label={`${t.villa} ${shape.villa}`} markSize={size / 90} />)}
        </g>
        {blocks.map(block => (
          <text key={block.key} x={block.at.x} y={block.at.y} textAnchor="middle" dominantBaseline="central" fontSize={size / 60} role="button" aria-label={block.key} data-map-block={block.key}
            onClick={() => { if (!area) choose(block.villas); }} className="cursor-pointer fill-foreground font-semibold" paintOrder="stroke" stroke="var(--card)" strokeWidth={size / 400}>{block.key}</text>
        ))}
        {drag && (() => { const x = Math.min(drag.from.x, drag.to.x); const y = Math.min(drag.from.y, drag.to.y); return <rect x={x} y={y} width={Math.abs(drag.to.x - drag.from.x)} height={Math.abs(drag.to.y - drag.from.y)} vectorEffect="non-scaling-stroke" className="pointer-events-none fill-primary/10 stroke-primary" strokeDasharray="4 3" />; })()}
      </svg>
      <ul className="flex flex-wrap gap-3 text-xs text-muted-foreground" aria-label={t.map}>
        {(["NOT_STARTED", "IN_PROGRESS", "UNDER_REVIEW", "COMPLETE"] as const).map(status => <li key={status} className="flex items-center gap-1"><svg width="12" height="12" aria-hidden="true"><rect width="12" height="12" rx="2" className={FILL[status]} /></svg>{t.key[status]}</li>)}
        <li className="flex items-center gap-1"><svg width="12" height="12" aria-hidden="true"><rect x="0.5" y="0.5" width="11" height="11" rx="2" strokeDasharray="3 2" className={NOT_APPLICABLE} /></svg>{t.key.none}</li>
      </ul>
    </div>
  );
}

/** One villa on the map; redrawn only when its own colour, applicability or choice changes. */
const VillaShapeView = React.memo(function VillaShapeView({ villa, points, centre, fill, ok, chosen, label, markSize }: { villa: string; points: string; centre: Point; fill: string; ok: boolean; chosen: boolean; label: string; markSize: number }) {
  return (
    <g data-map-villa={villa} data-chosen={chosen || undefined} aria-label={label} role="button" aria-pressed={chosen} aria-disabled={!ok || undefined} className={cn(ok ? "cursor-pointer" : "cursor-not-allowed")}>
      <polygon points={points} vectorEffect="non-scaling-stroke" className={cn(ok ? fill : NOT_APPLICABLE, chosen ? "stroke-primary" : ok ? "stroke-border" : "")} strokeWidth={chosen ? 3 : 1} strokeDasharray={ok ? undefined : "3 2"} />
      {chosen && <text x={centre.x} y={centre.y} textAnchor="middle" dominantBaseline="central" fontSize={markSize} className="pointer-events-none fill-primary-foreground font-bold">✓</text>}
    </g>
  );
});
