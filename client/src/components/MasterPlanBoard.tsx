// Q-54: the master-plan status board as in the reference «الماستر بلان» (1440): block filter chips, each block a card of villa tiles
// coloured by the six state tokens, a dark card for the chosen villa and a colour key with counts. Read-only: it shows the
// entities the page already loaded and changes nothing.
import React, { useMemo, useState } from "react";
import { Link } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { unitNumberOf } from "@/lib/masterPlanColouring";
import { BOARD_STATES, BOARD_STATE_CLASS, countStates, groupBoard, type BoardEntity, type BoardState } from "@/lib/masterPlanBoard";

const text = {
  ar: { all: "كل البلوكات", block: (code: string) => `بلوك ${code}`, ungrouped: "بلا بلوك", hint: "اضغط على فيلا لعرض تفاصيلها", key: "دليل الألوان", progress: "إنجاز الفيلا", item: "البلوك", open: "فتح سجل الفيلا", pick: "اختر فيلا من الخريطة", empty: "لا توجد وحدات في هذا الإصدار بعد.", map: "خريطة حالة الفلل", state: { complete: "مكتملة", advanced: "متقدّمة", progress: "جارية", start: "بداية", none: "لم تبدأ", stopped: "متوقفة" } },
  en: { all: "All blocks", block: (code: string) => `Block ${code}`, ungrouped: "No block", hint: "Tap a villa to see its details", key: "Colour key", progress: "Villa progress", item: "Block", open: "Open villa record", pick: "Pick a villa on the map", empty: "This version has no units yet.", map: "Villa status map", state: { complete: "Complete", advanced: "Advanced", progress: "Ongoing", start: "Started", none: "Not started", stopped: "Stopped" } },
  ur: { all: "تمام بلاک", block: (code: string) => `بلاک ${code}`, ungrouped: "بلاک کے بغیر", hint: "تفصیل دیکھنے کے لیے ولا پر ٹیپ کریں", key: "رنگوں کی کلید", progress: "ولا کی پیش رفت", item: "بلاک", open: "ولا کا ریکارڈ کھولیں", pick: "نقشے سے ولا منتخب کریں", empty: "اس ورژن میں ابھی کوئی یونٹ نہیں۔", map: "ولاز کی حالت کا نقشہ", state: { complete: "مکمل", advanced: "آگے", progress: "جاری", start: "آغاز", none: "شروع نہیں", stopped: "رکی ہوئی" } },
};

export function MasterPlanBoard({ tenantId, projectId, entities, selectedId, onSelect }: { tenantId: string; projectId: string; entities: BoardEntity[]; selectedId: string | null; onSelect: (id: string) => void }) {
  const { language } = useLanguage();
  const t = pickLanguage(language, text);
  const blocks = useMemo(() => groupBoard(entities), [entities]);
  const counts = useMemo(() => countStates(blocks), [blocks]);
  const [blockFilter, setBlockFilter] = useState("all");
  const shown = blockFilter === "all" ? blocks : blocks.filter(block => block.id === blockFilter);
  const selected = blocks.flatMap(block => block.units.map(unit => ({ unit, block }))).find(entry => entry.unit.id === selectedId) ?? null;
  if (!blocks.length) return <p data-master-plan-board="empty" className="mt-5 rounded-[18px] bg-muted p-4 text-sm text-muted-foreground">{t.empty}</p>;
  const blockLabel = (code: string) => (code ? t.block(code) : t.ungrouped);
  const unitNumber = selected ? unitNumberOf(selected.unit.code) : null;

  return <div data-master-plan-board className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
    <div className="min-w-0 overflow-hidden rounded-[18px] border border-border bg-card">
      <div className="flex flex-col gap-3 border-b border-border p-4 md:flex-row md:items-center md:justify-between">
        <div className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1" role="group" aria-label={t.item}>
          {[{ id: "all", label: t.all }, ...blocks.map(block => ({ id: block.id || "none", label: blockLabel(block.code) }))].map(chip => {
            const active = blockFilter === chip.id || (chip.id === "none" && blockFilter === "");
            return <button key={chip.id} type="button" aria-pressed={active} onClick={() => setBlockFilter(chip.id === "none" ? "" : chip.id)} className={`min-h-11 shrink-0 whitespace-nowrap rounded-full border px-4 text-sm font-semibold md:min-h-9 ${active ? "border-transparent bg-hero text-hero-foreground" : "border-border bg-card text-foreground"}`}>{chip.label}</button>;
          })}
        </div>
        <p className="shrink-0 text-xs text-muted-foreground">{t.hint}</p>
      </div>
      <div aria-label={t.map} className="max-h-[720px] overflow-auto bg-muted p-4">
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {shown.map(block => <section key={block.id || "none"} data-board-block className="rounded-[18px] bg-card p-4 shadow-sm">
            <div className="flex items-baseline justify-between gap-2"><h3 className="text-base font-bold">{blockLabel(block.code)}</h3><span className="text-xs text-muted-foreground tabular-nums">{block.progress}%</span></div>
            <div className="mt-3 grid grid-cols-5 gap-1.5">
              {block.units.map(unit => <button key={unit.id} type="button" data-board-unit={unit.state} aria-pressed={unit.id === selectedId} aria-label={`${unit.code} · ${t.state[unit.state]} · ${unit.progress}%`} onClick={() => onSelect(unit.id)}
                className={`grid min-h-11 min-w-0 place-items-center rounded-lg border text-[11px] font-semibold tabular-nums ${BOARD_STATE_CLASS[unit.state]} ${unit.id === selectedId ? "ring-2 ring-foreground ring-offset-2 ring-offset-card" : ""}`}>
                <span className="truncate px-0.5">{unit.code}</span>
              </button>)}
            </div>
          </section>)}
        </div>
      </div>
    </div>
    <aside className="space-y-4">
      <div data-board-selected className="rounded-[18px] bg-hero p-5 text-hero-foreground">
        {selected ? <>
          <div className="flex items-start justify-between gap-3"><p className="text-3xl font-bold tabular-nums" dir="ltr">{selected.unit.code}</p><span className={`rounded-full px-3 py-1 text-xs font-semibold ${BOARD_STATE_CLASS[selected.unit.state]}`}>{t.state[selected.unit.state]}</span></div>
          <p className="mt-3 text-xs text-hero-foreground/75">{t.item}</p><p className="font-semibold">{blockLabel(selected.block.code)}{selected.block.name ? ` · ${selected.block.name}` : ""}</p>
          <div className="mt-4 flex justify-between text-xs text-hero-foreground/75"><span>{t.progress}</span><span className="tabular-nums">{selected.unit.progress}%</span></div>
          <div className="mt-1 h-2 overflow-hidden rounded-full bg-hero-foreground/15"><div className="h-full rounded-full bg-sidebar-mark" style={{ width: `${selected.unit.progress}%` }} /></div>
          {unitNumber ? <Link href={`/m/${tenantId}/${projectId}/unit/${unitNumber}`} className="mt-5 flex min-h-12 items-center justify-center rounded-xl bg-sidebar-mark px-4 text-sm font-bold text-hero">{t.open}</Link> : null}
        </> : <p className="text-sm text-hero-foreground/75">{t.pick}</p>}
      </div>
      <div className="rounded-[18px] border border-border bg-card p-5">
        <h3 className="text-base font-bold">{t.key}</h3>
        <ul className="mt-3 space-y-2.5">{BOARD_STATES.map((state: BoardState) => <li key={state} className="flex items-center justify-between gap-3 text-sm"><span className="flex items-center gap-2"><span aria-hidden className={`h-5 w-5 rounded-md border ${BOARD_STATE_CLASS[state]}`} />{t.state[state]}</span><span data-board-count={state} className="font-semibold tabular-nums">{counts[state]}</span></li>)}</ul>
      </div>
    </aside>
  </div>;
}
