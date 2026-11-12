// Q-8 (b): what the drawing is coloured by — the plan's own unit status, or a PMC activity's site status per villa — with the block and model filters, the key
// with a count per colour, and the PNG export of the coloured drawing.
import React from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { Select } from "@/components/ds";
import { KEY_ORDER, SITE_COLOUR, type ColourKey } from "@/lib/masterPlanColouring";

const text = {
  ar: {
    colourBy: "التلوين حسب", planStatus: "حالة الوحدة في الخطة", block: "البلوك", model: "النموذج", all: "الكل", exportPng: "تصدير PNG", card: "بطاقة الفيلا",
    rule: "تُطابَق الوحدة مع الفيلا برقمها في الرمز (\u2066V-04\u2069 ← الفيلا 4).", noSource: "تعذّر تحميل حالات الموقع؛ التلوين بحالة الوحدة في الخطة.",
    keys: { NOT_STARTED: "لم يبدأ", IN_PROGRESS: "جارٍ", UNDER_REVIEW: "قيد المراجعة", COMPLETE: "مكتمل", NOT_IN_MODEL: "ليس في نموذج الفيلا", NOT_MATCHED: "بلا فيلا مطابقة" },
  },
  en: {
    colourBy: "Colour by", planStatus: "Unit status in the plan", block: "Block", model: "Model", all: "All", exportPng: "Export PNG", card: "Villa card",
    rule: "A unit is matched to a villa by the number in its code (V-04 → villa 4).", noSource: "Site statuses could not be loaded; colouring by the plan's unit status.",
    keys: { NOT_STARTED: "Not started", IN_PROGRESS: "In progress", UNDER_REVIEW: "Under review", COMPLETE: "Complete", NOT_IN_MODEL: "Not in the villa's model", NOT_MATCHED: "No matching villa" },
  },
  ur: {
    colourBy: "رنگ بلحاظ", planStatus: "منصوبے میں یونٹ کی حالت", block: "بلاک", model: "ماڈل", all: "سب", exportPng: "PNG برآمد کریں", card: "ولا کارڈ",
    rule: "یونٹ کو اس کے کوڈ کے نمبر سے ولا سے ملایا جاتا ہے (\u2066V-04\u2069 ← ولا 4)۔", noSource: "سائٹ کی حالتیں لوڈ نہیں ہو سکیں؛ منصوبے کی یونٹ حالت سے رنگ۔",
    keys: { NOT_STARTED: "شروع نہیں", IN_PROGRESS: "جاری", UNDER_REVIEW: "زیر جائزہ", COMPLETE: "مکمل", NOT_IN_MODEL: "ولا کے ماڈل میں نہیں", NOT_MATCHED: "مطابق ولا نہیں" },
  },
};
export const useColourText = () => pickLanguage(useLanguage().language, text);

// the custom list cannot hold an empty value, so «all» and «the plan's status» carry this one
const ANY = "__any";

export function MasterPlanColourPanel(props: {
  activities: Array<{ code: string; name: string }>;
  activityCode: string;
  onActivity: (code: string) => void;
  blocks: string[];
  models: string[];
  block: string;
  model: string;
  onBlock: (value: string) => void;
  onModel: (value: string) => void;
  counts: Record<ColourKey, number> | null;
  failed: boolean;
  onExportPng: () => void;
}) {
  const t = useColourText();
  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-3" data-colour-panel>
      <div className="flex flex-wrap items-end gap-2">
        <label className="flex flex-col text-xs">{t.colourBy}
          <Select className="mt-1 min-w-48" aria-label={t.colourBy} value={props.activityCode || ANY} onValueChange={value => props.onActivity(value === ANY ? "" : value)}
            options={[{ value: ANY, label: t.planStatus }, ...props.activities.map(activity => ({ value: activity.code, label: `${activity.code} · ${activity.name}` }))]} />
        </label>
        {props.activityCode ? (
          <>
            <label className="flex flex-col text-xs">{t.block}
              <Select className="mt-1" aria-label={t.block} value={props.block || ANY} onValueChange={value => props.onBlock(value === ANY ? "" : value)} options={[{ value: ANY, label: t.all }, ...props.blocks.map(block => ({ value: block, label: block }))]} />
            </label>
            <label className="flex flex-col text-xs">{t.model}
              <Select className="mt-1" aria-label={t.model} value={props.model || ANY} onValueChange={value => props.onModel(value === ANY ? "" : value)} options={[{ value: ANY, label: t.all }, ...props.models.map(model => ({ value: model, label: model }))]} />
            </label>
          </>
        ) : null}
        <button type="button" className="min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 text-sm" onClick={props.onExportPng}>{t.exportPng}</button>
      </div>
      {props.failed ? <p role="note" className="text-xs text-amber-900">{t.noSource}</p> : null}
      {props.activityCode && props.counts ? (
        <>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs" aria-label={t.colourBy} data-colour-key>
            {KEY_ORDER.filter(key => key !== "NOT_MATCHED" || props.counts![key] > 0).map(key => (
              <li key={key} className="flex items-center gap-1" data-key={key}>
                <span aria-hidden="true" className="inline-block h-3 w-3 rounded-sm ring-1 ring-slate-400" style={{ background: SITE_COLOUR[key] }} />
                {t.keys[key]}: <b data-count>{props.counts![key]}</b>
              </li>
            ))}
          </ul>
          <p className="text-xs text-slate-600">{t.rule}</p>
        </>
      ) : null}
    </div>
  );
}

/** The coloured drawing as a PNG: the SVG with its fills resolved to real colours (a canvas does not read CSS variables); a picture from another origin is left out. */
export async function exportDrawingPng(svg: SVGSVGElement, fileName: string): Promise<void> {
  const clone = svg.cloneNode(true) as SVGSVGElement;
  const originals = Array.from(svg.querySelectorAll("polygon, polyline, line, circle, text"));
  Array.from(clone.querySelectorAll("polygon, polyline, line, circle, text")).forEach((node, index) => {
    const style = getComputedStyle(originals[index]!);
    node.setAttribute("fill", style.fill); node.setAttribute("stroke", style.stroke);
  });
  // an SVG drawn as a picture loads nothing it links to: the plan's picture is drawn on the canvas first (a local file only), the shapes over it
  for (const image of Array.from(clone.querySelectorAll("image"))) image.remove();
  const source = svg.querySelector("image");
  const sourceHref = source?.getAttribute("href") ?? "";
  const [viewX, viewY, width, height] = (svg.getAttribute("viewBox") ?? "0 0 1 1").split(/\s+/).map(Number);
  const scale = 2000 / Math.max(width!, height!);
  clone.setAttribute("width", String(Math.round(width! * scale))); clone.setAttribute("height", String(Math.round(height! * scale)));
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml" }));
  try {
    const picture = new Image();
    await new Promise<void>((resolve, reject) => { picture.onload = () => resolve(); picture.onerror = () => reject(new Error("svg")); picture.src = url; });
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(width! * scale); canvas.height = Math.round(height! * scale);
    const context = canvas.getContext("2d")!;
    context.fillStyle = "white"; context.fillRect(0, 0, canvas.width, canvas.height);
    if (source && /^(blob:|data:)/.test(sourceHref)) {
      const plan = new Image();
      const loaded = await new Promise<boolean>(resolve => { plan.onload = () => resolve(true); plan.onerror = () => resolve(false); plan.src = sourceHref; });
      if (loaded) {
        // the picture sits at (0, 0) in drawing units with the size given on the element; the export shows the part in view, at the canvas scale
        const toPixels = plan.naturalWidth / Number(source.getAttribute("width") || plan.naturalWidth);
        context.globalAlpha = 1;
        context.drawImage(plan, viewX! * toPixels, viewY! * toPixels, width! * toPixels, height! * toPixels, 0, 0, canvas.width, canvas.height);
      }
    }
    context.drawImage(picture, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => (blob ? resolve(blob) : reject(new Error("png"))), "image/png"));
    const link = document.createElement("a");
    link.href = URL.createObjectURL(png); link.download = fileName; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(link.href), 10_000);
  } finally {
    URL.revokeObjectURL(url);
  }
}
