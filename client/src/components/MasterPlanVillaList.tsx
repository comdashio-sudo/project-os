// Q-40: the villas linked on the master plan as a side list that shares its choice with the drawing — search by number, choose one or several,
// see the chosen ones on the plan — and the villa types' hatches with their legend (drawn over the progress colour, never instead of it).
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { MODEL_HATCHES, searchVillas, type ListedVilla } from "@/lib/masterPlanSelection";

const text = {
  ar: { list: "الفلل على المخطط", search: "ابحث برقم الفيلا أو رمزها أو نوعها", several: "اختيار أكثر من فيلا", chosen: (n: number, total: number) => `المحدد: ${n} من ${total}`, shown: (n: number) => `النتائج: ${n}`, clear: "إلغاء التحديد", show: "عرض المحدد على المخطط", none: "لا فيلا تطابق البحث.", type: "النوع", types: "أنواع الفلل (النقش فوق لون التقدم)", noType: "بلا نوع" },
  en: { list: "Villas on the plan", search: "Search by villa number, code or type", several: "Choose several villas", chosen: (n: number, total: number) => `Selected: ${n} of ${total}`, shown: (n: number) => `Results: ${n}`, clear: "Clear selection", show: "Show selected on the plan", none: "No villa matches the search.", type: "Type", types: "Villa types (the hatch sits over the progress colour)", noType: "No type" },
  ur: { list: "نقشے پر ولاز", search: "ولا نمبر، کوڈ یا قسم سے تلاش کریں", several: "ایک سے زیادہ ولاز منتخب کریں", chosen: (n: number, total: number) => `منتخب: ${total} میں سے ${n}`, shown: (n: number) => `نتائج: ${n}`, clear: "انتخاب ختم کریں", show: "منتخب ولاز نقشے پر دکھائیں", none: "کوئی ولا تلاش سے مطابقت نہیں رکھتا۔", type: "قسم", types: "ولا کی اقسام (نقش پیش رفت کے رنگ کے اوپر ہے)", noType: "قسم نہیں" },
};
export const useVillaListText = () => pickLanguage(useLanguage().language, text);

const infoText = {
  ar: { title: "معلومات الفيلا", block: "البلوك", type: "النوع", progress: "الإنجاز الموزون", activity: "النشاط الحالي", complete: "مكتملة", status: "حالة الموقع", card: "بطاقة الفيلا", unknown: "—" },
  en: { title: "Villa details", block: "Block", type: "Type", progress: "Weighted progress", activity: "Current activity", complete: "Complete", status: "Site status", card: "Villa card", unknown: "—" },
  ur: { title: "ولا کی تفصیل", block: "بلاک", type: "قسم", progress: "وزنی پیش رفت", activity: "موجودہ سرگرمی", complete: "مکمل", status: "سائٹ کی حالت", card: "ولا کارڈ", unknown: "—" },
};

export type VillaInfo = { unitCode: string; unitNumber: number | null; blockCode?: string | null; modelCode?: string | null; overallPercent?: number | null; currentActivity?: { name: string } | null; statusText?: string | null; cardHref?: string | null };

/** Q-40 (4): the chosen villa's details, from the site map the plan already reads — nothing is fetched or written here. */
export function VillaInfoPanel({ villa }: { villa: VillaInfo }) {
  const t = pickLanguage(useLanguage().language, infoText);
  const row = (label: string, value: React.ReactNode) => <div className="flex justify-between gap-3 py-1.5"><dt className="text-muted-foreground">{label}</dt><dd className="font-medium">{value}</dd></div>;
  return (
    <section aria-label={t.title} className="rounded-lg border border-border bg-card p-3 text-sm" data-villa-info>
      <h4 className="font-semibold"><bdi dir="ltr">{villa.unitCode}</bdi></h4>
      <dl className="mt-1 divide-y divide-border">
        {row(t.block, villa.blockCode || t.unknown)}
        {row(t.type, villa.modelCode || t.unknown)}
        {row(t.progress, villa.overallPercent === null || villa.overallPercent === undefined ? t.unknown : <bdi dir="ltr">{`${Math.round(villa.overallPercent)}%`}</bdi>)}
        {row(t.activity, villa.currentActivity ? villa.currentActivity.name : villa.overallPercent !== null && villa.overallPercent !== undefined && villa.overallPercent >= 100 ? t.complete : t.unknown)}
        {villa.statusText ? row(t.status, villa.statusText) : null}
      </dl>
      {villa.cardHref ? <a href={villa.cardHref} className="mt-2 inline-flex min-h-11 items-center rounded-lg border border-border px-3">{t.card}</a> : null}
    </section>
  );
}

/** The hatch patterns, one per villa type, sized to the drawing (`size` is in drawing units) so they read at any zoom of a given plan. */
export function ModelHatchDefs({ size, idPrefix = "mp-hatch" }: { size: number; idPrefix?: string }) {
  return (
    <defs>
      {MODEL_HATCHES.map((hatch, index) => {
        const step = size * hatch.spacing;
        const line = { stroke: "var(--foreground)", strokeWidth: step / 6, strokeOpacity: 0.7 };
        return (
          <pattern key={index} id={`${idPrefix}-${index}`} patternUnits="userSpaceOnUse" width={step} height={step} patternTransform={hatch.angle ? `rotate(${hatch.angle})` : undefined}>
            {hatch.kind === "dots" ? <circle cx={step / 2} cy={step / 2} r={step / 5} fill="var(--foreground)" fillOpacity={0.7} /> : <line x1={0} y1={step / 2} x2={step} y2={step / 2} {...line} />}
            {hatch.kind === "cross" || hatch.kind === "grid" ? <line x1={step / 2} y1={0} x2={step / 2} y2={step} {...line} /> : null}
          </pattern>
        );
      })}
    </defs>
  );
}

/** The legend: each type's hatch as drawn on the plan, with its code. Its own small svg carries the same patterns. */
export function ModelLegend({ models, hatchOf }: { models: readonly string[]; hatchOf: ReadonlyMap<string, number> }) {
  const t = useVillaListText();
  if (!models.length) return null;
  return (
    <figure className="flex flex-col gap-1" data-model-legend>
      <figcaption className="text-xs font-medium text-muted-foreground">{t.types}</figcaption>
      <ul className="flex flex-wrap gap-3 text-xs">
        {models.map(code => (
          <li key={code} className="inline-flex items-center gap-1.5" data-model-key={code}>
            <svg aria-hidden="true" width="20" height="20" viewBox="0 0 20 20" className="rounded-sm ring-1 ring-border">
              <ModelHatchDefs size={5} idPrefix="mp-legend" />
              <rect width="20" height="20" fill={`url(#mp-legend-${hatchOf.get(code) ?? 0})`} />
            </svg>
            {t.type} {code}
          </li>
        ))}
      </ul>
    </figure>
  );
}

/**
 * The side list. `picked` is the shared choice; `onPick(id, several)` makes the same choice a tap on the drawing makes. When `revealId` changes
 * (a villa tapped on the drawing) its row scrolls into view, so the two stay in step on a phone too. Rows are plain list items: 500 villas render
 * as 500 rows with no measurement or effect per row.
 */
export function MasterPlanVillaList({ villas, picked, several, onSeveral, onPick, onClear, onShow, revealId }: {
  villas: readonly ListedVilla[]; picked: ReadonlySet<string>; several: boolean; onSeveral: (value: boolean) => void;
  onPick: (polygonId: string, several: boolean) => void; onClear: () => void; onShow: () => void; revealId: string | null;
}) {
  const t = useVillaListText();
  const [query, setQuery] = useState("");
  const shown = useMemo(() => searchVillas(villas, query), [villas, query]);
  const listRef = useRef<HTMLUListElement | null>(null);
  useEffect(() => {
    if (!revealId) return;
    const row = listRef.current?.querySelector<HTMLElement>(`[data-villa-row="${CSS.escape(revealId)}"]`);
    row?.scrollIntoView?.({ block: "nearest" });
  }, [revealId]);
  if (!villas.length) return null;
  return (
    <section aria-label={t.list} className="flex flex-col gap-2 rounded-lg border border-border p-3" data-villa-list>
      <h4 className="font-semibold">{t.list}</h4>
      <input type="search" aria-label={t.search} placeholder={t.search} value={query} onChange={event => setQuery(event.target.value)} inputMode="search"
        className="min-h-11 w-full rounded-[var(--radius)] border border-input bg-background px-3 text-sm" />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label className="inline-flex min-h-11 items-center gap-2">
          <input type="checkbox" className="h-5 w-5" checked={several} onChange={event => onSeveral(event.target.checked)} />
          {t.several}
        </label>
        <span className="text-muted-foreground" aria-live="polite" data-picked-count>{t.chosen(picked.size, villas.length)}</span>
        {query ? <span className="text-muted-foreground">{t.shown(shown.length)}</span> : null}
      </div>
      {picked.size ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="min-h-11 rounded-lg border border-border px-3 text-sm" onClick={onShow}>{t.show}</button>
          <button type="button" className="min-h-11 rounded-lg border border-border px-3 text-sm" onClick={onClear}>{t.clear}</button>
        </div>
      ) : null}
      {shown.length ? (
        <ul ref={listRef} className="max-h-80 divide-y divide-border overflow-y-auto">
          {shown.map(villa => {
            const isPicked = picked.has(villa.polygonId);
            return (
              <li key={villa.polygonId} data-villa-row={villa.polygonId} data-picked={isPicked || undefined} className={`flex items-center gap-2 px-1 ${isPicked ? "bg-primary/10" : ""}`}>
                <label className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center">
                  <input type="checkbox" className="h-5 w-5" checked={isPicked} aria-label={villa.unitCode} onChange={() => onPick(villa.polygonId, true)} />
                </label>
                <button type="button" className="min-h-11 flex-1 text-start text-sm" aria-pressed={isPicked} onClick={() => onPick(villa.polygonId, several)}>
                  <span className="font-medium" dir="ltr">{villa.unitCode}</span>
                  <span className="ms-2 text-xs text-muted-foreground">{villa.modelCode ? `${t.type} ${villa.modelCode}` : t.noType}</span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : <p className="text-sm text-muted-foreground">{t.none}</p>}
    </section>
  );
}
