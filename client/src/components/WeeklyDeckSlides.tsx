// D-50: the weekly report's export bar and the PDF. The PDF draws the SAME slides as the PowerPoint (weeklyDeck.ts): each slide is laid out at 96 px an inch
// (1280 × 720), its charts drawn as SVG, then pictured by the browser (so Arabic shaping and right-to-left order are the browser's own) onto a 16:9 page.
import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { Button, FileDropzone } from "@/components/ds";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { buildWeeklyDeck, type ChartSpec, type DeckInput, type Item, type Slide, SLIDE } from "@/lib/weeklyDeck";
import { downloadBytes, weeklyDeckPptx } from "@/lib/weeklyDeckPptx";

const PX = 96;
const text = {
  ar: { title: "تصدير التقرير الأسبوعي", pptx: "PowerPoint", pdf: "PDF", map: "صورة المخطط الملوّن (اختياري)", mapHint: "صدّرها PNG من «الرسم التفاعلي للخطة الرئيسية» ثم اخترها هنا.", working: "جارٍ الإعداد…", failed: "تعذّر إنشاء الملف. أعد المحاولة." },
  en: { title: "Export the weekly report", pptx: "PowerPoint", pdf: "PDF", map: "Coloured master plan picture (optional)", mapHint: "Export it as PNG from «Interactive master plan drawing», then choose it here.", working: "Preparing…", failed: "The file could not be made. Try again." },
  ur: { title: "ہفتہ وار رپورٹ برآمد کریں", pptx: "PowerPoint", pdf: "PDF", map: "رنگین ماسٹر پلان کی تصویر (اختیاری)", mapHint: "اسے «ماسٹر پلان کی انٹرایکٹو ڈرائنگ» سے PNG برآمد کریں، پھر یہاں منتخب کریں۔", working: "تیار ہو رہا ہے…", failed: "فائل نہیں بن سکی۔ دوبارہ کوشش کریں۔" },
};

const colour = (index: number) => `var(--chart-${(index % 5) + 1})`;

function SvgChart({ title, chart, w, h }: { title: string; chart: ChartSpec; w: number; h: number }) {
  const top = 30; const bottom = 46; const left = 44; const plotW = w - left - 12; const plotH = h - top - bottom;
  const legend = <g>{chart.series.length > 1 || chart.type === "doughnut" ? (chart.type === "doughnut" ? chart.labels : chart.series.map(s => s.name)).map((name, i) => <g key={name} transform={`translate(${left + i * 140}, ${h - 14})`}><rect width="10" height="10" y="-9" fill={colour(i)} /><text x="14" fontSize="11">{name}</text></g>) : null}</g>;
  if (chart.type === "doughnut") {
    const values = chart.series[0]?.values ?? []; const total = values.reduce((t, v) => t + v, 0) || 1; const r = Math.min(plotW, plotH) / 2; const cx = left + plotW / 2; const cy = top + plotH / 2;
    let angle = -Math.PI / 2;
    return <svg width={w} height={h}><text x={w / 2} y="18" fontSize="14" fontWeight="bold" textAnchor="middle">{title}</text>{values.map((v, i) => { const a0 = angle; angle += (v / total) * Math.PI * 2; const large = angle - a0 > Math.PI ? 1 : 0;
      return v > 0 ? <path key={i} fill={colour(i)} d={`M ${cx + r * Math.cos(a0)} ${cy + r * Math.sin(a0)} A ${r} ${r} 0 ${large} 1 ${cx + r * Math.cos(angle - 1e-6)} ${cy + r * Math.sin(angle - 1e-6)} L ${cx + r * 0.55 * Math.cos(angle - 1e-6)} ${cy + r * 0.55 * Math.sin(angle - 1e-6)} A ${r * 0.55} ${r * 0.55} 0 ${large} 0 ${cx + r * 0.55 * Math.cos(a0)} ${cy + r * 0.55 * Math.sin(a0)} Z`} /> : null; })}{legend}</svg>;
  }
  const count = chart.labels.length || 1;
  const sums = chart.labels.map((_, i) => chart.series.reduce((t, s) => t + (s.values[i] ?? 0), 0));
  const max = Math.max(1, ...(chart.stacked ? sums : chart.series.flatMap(s => s.values)));
  const y = (v: number) => top + plotH - (v / max) * plotH; const slot = plotW / count;
  return (
    <svg width={w} height={h}>
      <text x={w / 2} y="18" fontSize="14" fontWeight="bold" textAnchor="middle">{title}</text>
      <line x1={left} x2={left + plotW} y1={top + plotH} y2={top + plotH} stroke="currentColor" strokeWidth="0.5" />
      <text x={left - 4} y={top + 4} fontSize="10" textAnchor="end">{Math.round(max)}</text>
      {chart.labels.map((label, i) => <text key={label} x={left + slot * (i + 0.5)} y={top + plotH + 14} fontSize="10" textAnchor="middle">{label}</text>)}
      {chart.type === "line" ? chart.series.map((s, k) => <polyline key={s.name} fill="none" stroke={colour(k)} strokeWidth="2" points={s.values.map((v, i) => `${left + slot * (i + 0.5)},${y(v)}`).join(" ")} />)
        : chart.labels.map((_, i) => { let base = 0; return chart.series.map((s, k) => { const v = s.values[i] ?? 0; const barW = chart.stacked ? slot * 0.6 : (slot * 0.7) / chart.series.length;
          const x = left + slot * i + (chart.stacked ? slot * 0.2 : slot * 0.15 + k * barW); const rect = <rect key={`${i}-${k}`} x={x} y={y(base + v)} width={barW} height={y(base) - y(base + v)} fill={colour(k)} />; if (chart.stacked) base += v; return rect; }); })}
      {legend}
    </svg>
  );
}

function SlideView({ slide, rtl }: { slide: Slide; rtl: boolean }) {
  const at = (item: Item): React.CSSProperties => ({ position: "absolute", left: item.box.x * PX, top: item.box.y * PX, width: item.box.w * PX, height: item.box.h * PX, overflow: "hidden" });
  return (
    <div data-deck-slide dir={rtl ? "rtl" : "ltr"} style={{ position: "relative", width: SLIDE.w * PX, height: SLIDE.h * PX, background: "white", color: "black", fontFamily: "Arial, sans-serif" }}>
      {slide.items.map((item, i) => {
        if (item.kind === "text") return <div key={i} style={{ ...at(item), fontSize: item.size * (PX / 72), fontWeight: item.bold ? 700 : 400, whiteSpace: "pre-wrap", lineHeight: 1.3, display: "flex", alignItems: item.role === "body" ? "flex-start" : "center", borderTop: item.role === "footer" ? "1px solid silver" : undefined }}><span>{item.text}</span></div>;
        if (item.kind === "table") return <table key={i} style={{ ...at(item), borderCollapse: "collapse", fontSize: item.size * (PX / 72) }}><tbody>{item.rows.map((row, r) => <tr key={r}>{row.map((cell, c) => <td key={c} style={{ border: "1px solid silver", padding: "2px 6px", fontWeight: r === 0 ? 700 : 400 }}>{cell}</td>)}</tr>)}</tbody></table>;
        if (item.kind === "chart") return <div key={i} style={at(item)} dir="ltr"><SvgChart title={item.title} chart={item.chart} w={item.box.w * PX} h={item.box.h * PX} /></div>;
        return <img key={i} src={item.url} alt={item.caption ?? ""} style={{ ...at(item), objectFit: "contain" }} />;
      })}
    </div>
  );
}

/** Pictures each slide onto a 16:9 page. The slides are drawn off screen, then removed. */
async function deckPdf(slides: Slide[], rtl: boolean, fileName: string) {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import("html2canvas-pro"), import("jspdf")]);
  const host = document.createElement("div");
  host.style.cssText = "position:fixed;left:-20000px;top:0";
  document.body.appendChild(host);
  const root = createRoot(host);
  try {
    root.render(<div>{slides.map((slide, i) => <SlideView key={i} slide={slide} rtl={rtl} />)}</div>);
    await new Promise(resolve => setTimeout(resolve, 300));
    await Promise.all(Array.from(host.querySelectorAll("img")).map(img => (img.complete ? null : new Promise(resolve => { img.onload = img.onerror = resolve; }))));
    const pdf = new jsPDF({ orientation: "landscape", unit: "in", format: [SLIDE.w, SLIDE.h] });
    const pages = Array.from(host.querySelectorAll<HTMLElement>("[data-deck-slide]"));
    for (let i = 0; i < pages.length; i += 1) {
      const page = pages[i];
      const canvas = await html2canvas(page, { scale: 1.5, backgroundColor: "white", logging: false });
      if (i) pdf.addPage([SLIDE.w, SLIDE.h], "landscape");
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.9), "JPEG", 0, 0, SLIDE.w, SLIDE.h);
    }
    pdf.save(fileName);
  } finally {
    root.unmount(); host.remove();
  }
}

export function WeeklyExports({ deck, fileBase }: { deck: Omit<DeckInput, "mapImage" | "language"> | null; fileBase: string }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  const [map, setMap] = useState<{ name: string; size: number; url: string } | null>(null);
  const [busy, setBusy] = useState<"pptx" | "pdf" | null>(null);
  const [failed, setFailed] = useState(false);
  const run = async (kind: "pptx" | "pdf") => {
    if (!deck) return;
    setBusy(kind); setFailed(false);
    try {
      const slides = buildWeeklyDeck({ ...deck, language, mapImage: map?.url ?? null });
      if (kind === "pptx") downloadBytes(await weeklyDeckPptx(slides, language), `${fileBase}.pptx`, "application/vnd.openxmlformats-officedocument.presentationml.presentation");
      else await deckPdf(slides, language !== "en", `${fileBase}.pdf`);
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  };
  return (
    <section aria-label={t.title} className="flex flex-col gap-2 rounded-[var(--radius)] border p-3" data-weekly-exports>
      <h2 className="text-sm font-semibold">{t.title}</h2>
      <p className="text-sm">{t.map}</p>
      <FileDropzone accept={[".png", ".jpg", ".jpeg"]} maxBytes={8 * 1024 * 1024} hint={t.mapHint} items={map ? [{ id: "map", name: map.name, size: map.size, status: "done" }] : []} onRemove={() => setMap(null)}
        onFiles={([file]) => { const reader = new FileReader(); reader.onload = () => setMap(typeof reader.result === "string" ? { name: file.name, size: file.size, url: reader.result } : null); reader.readAsDataURL(file); }} />
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" disabled={!deck || busy !== null} onClick={() => void run("pptx")}>{busy === "pptx" ? t.working : t.pptx}</Button>
        <Button variant="secondary" disabled={!deck || busy !== null} onClick={() => void run("pdf")}>{busy === "pdf" ? t.working : t.pdf}</Button>
      </div>
      {failed ? <p role="alert" className="text-sm text-danger-soft-foreground">{t.failed}</p> : null}
    </section>
  );
}
