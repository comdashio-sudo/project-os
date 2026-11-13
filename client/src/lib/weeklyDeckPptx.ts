// D-50: the weekly report's slides (weeklyDeck.ts) written as a PowerPoint file, 16:9, with NATIVE charts (bar, line, doughnut) that stay editable in PowerPoint.
// The library is loaded on first use only. A PowerPoint file cannot read the screen's CSS tokens, so the few colours it needs are written here as plain
// six-digit values (the deck's palette: ink, rule and four series colours close to the screen's tokens).
import type { Item, Slide } from "@/lib/weeklyDeck";

const INK = "1F2937";
const RULE = "BFC5CC";
const SERIES = ["1F6F6B", "C77C1E", "4C6FB3", "8A5A9E", "5E8C3A", "B4473A"];

type Writer = { addSlide: () => any; write: (options: { outputType: "arraybuffer" | "blob" }) => Promise<unknown>; layout: string; rtlMode: boolean; ChartType: Record<string, unknown> };

/** Reads a picture into a data URL (PowerPoint embeds the bytes); a picture that cannot be read is left out rather than failing the file. */
async function dataUrl(url: string): Promise<string | null> {
  if (url.startsWith("data:")) return url;
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise<string | null>(resolve => { const reader = new FileReader(); reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null); reader.onerror = () => resolve(null); reader.readAsDataURL(blob); });
  } catch {
    return null;
  }
}

async function place(writer: Writer, slide: any, item: Item, rtl: boolean) {
  const at = { x: item.box.x, y: item.box.y, w: item.box.w, h: item.box.h };
  if (item.kind === "text") {
    slide.addText(item.text, { ...at, fontSize: item.size, bold: Boolean(item.bold), color: INK, fontFace: "Arial", valign: item.role === "body" ? "top" : "middle", align: rtl ? "right" : "left", rtlMode: rtl, lang: rtl ? "ar-SA" : "en-US", margin: 2 });
  } else if (item.kind === "table") {
    slide.addTable(item.rows.map((row, index) => row.map(cell => ({ text: cell, options: { bold: index === 0, align: rtl ? "right" : "left", rtlMode: rtl } }))), { x: at.x, y: at.y, w: at.w, rowH: item.box.h / item.rows.length, fontSize: item.size, fontFace: "Arial", color: INK, border: { type: "solid", pt: 0.5, color: RULE }, autoPage: false });
  } else if (item.kind === "chart") {
    const { chart } = item;
    const type = writer.ChartType[chart.type];
    const data = chart.series.map(series => ({ name: series.name, labels: chart.labels, values: series.values }));
    slide.addChart(type, data, { ...at, showTitle: true, title: item.title, titleFontSize: 14, titleColor: INK, showLegend: true, legendPos: "b", legendFontSize: 10, catAxisLabelFontSize: 9, valAxisLabelFontSize: 9, chartColors: SERIES, barGrouping: chart.stacked ? "stacked" : "clustered", lineDataSymbol: "circle", holeSize: 55, showPercent: chart.type === "doughnut", dataLabelColor: INK });
  } else {
    const data = await dataUrl(item.url);
    if (data) slide.addImage({ data, ...at, sizing: { type: "contain", w: at.w, h: at.h } });
  }
}

/** The slides as a .pptx file's bytes. */
export async function weeklyDeckPptx(slides: Slide[], language: "ar" | "en" | "ur"): Promise<ArrayBuffer> {
  const { default: PptxGenJS } = await import("pptxgenjs");
  const writer = new PptxGenJS() as unknown as Writer;
  writer.layout = "LAYOUT_WIDE"; // 13.333 × 7.5 in, the deck's frame
  const rtl = language !== "en";
  writer.rtlMode = rtl;
  for (const spec of slides) {
    const slide = writer.addSlide();
    for (const item of spec.items) await place(writer, slide, item, rtl);
  }
  return (await writer.write({ outputType: "arraybuffer" })) as ArrayBuffer;
}

export function downloadBytes(bytes: ArrayBuffer, fileName: string, type: string) {
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([bytes], { type }));
  link.download = fileName;
  document.body.appendChild(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
}
