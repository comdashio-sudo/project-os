// Q-8: the «not linked» list and linking by hand. The person picks a unit that has no shape yet, then either taps its place on the map (a small square is
// made there) or taps the corners of its plot and closes the polygon. The link is confirmed at once (the person chose it) and is saved with the layout.
import React from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";

export type LinkTool = "point" | "polygon";

const text = {
  ar: {
    title: (n: number, total: number) => `غير مربوط: ${n} من ${total}`, all: "كل الوحدات مربوطة بأشكال.", unit: "الوحدة التي تضعها", pick: "اختر وحدة",
    point: "ربط بنقرة", polygon: "رسم مضلع", close: (n: number) => `إغلاق المضلع (${n} نقاط)`, stop: "إنهاء",
    hintPoint: "انقر مكان الوحدة على المخطط؛ تنتقل القائمة إلى الوحدة التالية.", hintPolygon: "انقر زوايا قطعة الوحدة ثم «إغلاق المضلع».",
    linked: (code: string) => `رُبطت ${code}. احفظ التخطيط ليُحفظ الربط.`, already: "هذه الوحدة مربوطة بشكل آخر.", few: "المضلع يحتاج ثلاث نقاط على الأقل.", removeShape: "حذف الشكل",
  },
  en: {
    title: (n: number, total: number) => `Not linked: ${n} of ${total}`, all: "Every unit is linked to a shape.", unit: "Unit to place", pick: "Choose a unit",
    point: "Link by a tap", polygon: "Draw a polygon", close: (n: number) => `Close the polygon (${n} points)`, stop: "Done",
    hintPoint: "Tap the unit's place on the plan; the list moves to the next unit.", hintPolygon: "Tap the corners of the unit's plot, then «Close the polygon».",
    linked: (code: string) => `${code} linked. Save the layout to keep the link.`, already: "This unit is linked to another shape.", few: "A polygon needs at least three points.", removeShape: "Remove the shape",
  },
  ur: {
    title: (n: number, total: number) => `غیر منسلک: ${n} از ${total}`, all: "ہر یونٹ کسی شکل سے منسلک ہے۔", unit: "رکھنے والا یونٹ", pick: "یونٹ منتخب کریں",
    point: "ایک ٹیپ سے جوڑیں", polygon: "کثیر الاضلاع بنائیں", close: (n: number) => `کثیر الاضلاع بند کریں (${n} نقطے)`, stop: "ختم",
    hintPoint: "نقشے پر یونٹ کی جگہ ٹیپ کریں؛ فہرست اگلے یونٹ پر چلی جاتی ہے۔", hintPolygon: "یونٹ کے پلاٹ کے کونے ٹیپ کریں، پھر «کثیر الاضلاع بند کریں»۔",
    linked: (code: string) => `${code} منسلک ہو گیا۔ ربط رکھنے کے لیے خاکہ محفوظ کریں۔`, already: "یہ یونٹ کسی اور شکل سے منسلک ہے۔", few: "کثیر الاضلاع کے لیے کم از کم تین نقطے چاہییں۔", removeShape: "شکل ہٹائیں",
  },
};
export const useManualText = () => pickLanguage(useLanguage().language, text);

export function ManualLinkPanel(props: {
  unlinked: Array<{ id: string; code: string }>;
  total: number;
  unitId: string;
  onUnit: (id: string) => void;
  tool: LinkTool | null;
  onTool: (tool: LinkTool | null) => void;
  polygonPoints: number;
  onClose: () => void;
  notice: { kind: "linked" | "already" | "few"; code?: string } | null;
}) {
  const t = useManualText();
  const button = "min-h-[44px] rounded-lg border border-slate-300 px-3 text-sm disabled:opacity-50";
  const active = "min-h-[44px] rounded-lg bg-slate-900 px-3 text-sm text-white";
  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-3" data-manual-link>
      <p className="text-sm font-semibold" data-unlinked-count>{props.unlinked.length === 0 ? t.all : t.title(props.unlinked.length, props.total)}</p>
      {props.unlinked.length > 0 ? (
        <>
          <ul className="flex max-h-28 flex-wrap gap-1 overflow-y-auto" aria-label={t.title(props.unlinked.length, props.total)}>
            {props.unlinked.map(unit => (
              <li key={unit.id}><button type="button" className={`min-h-[44px] rounded-md border px-2 text-xs ${unit.id === props.unitId ? "border-slate-900 bg-white font-semibold" : "border-slate-300"}`} aria-pressed={unit.id === props.unitId} onClick={() => props.onUnit(unit.id)}>{unit.code}</button></li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" className={props.tool === "point" ? active : button} aria-pressed={props.tool === "point"} disabled={!props.unitId} onClick={() => props.onTool(props.tool === "point" ? null : "point")}>{t.point}</button>
            <button type="button" className={props.tool === "polygon" ? active : button} aria-pressed={props.tool === "polygon"} disabled={!props.unitId} onClick={() => props.onTool(props.tool === "polygon" ? null : "polygon")}>{t.polygon}</button>
            {props.tool === "polygon" ? <button type="button" className={button} disabled={props.polygonPoints < 3} onClick={props.onClose}>{t.close(props.polygonPoints)}</button> : null}
            {props.tool ? <button type="button" className={button} onClick={() => props.onTool(null)}>{t.stop}</button> : null}
          </div>
          {props.tool ? <p className="text-xs text-slate-600">{props.tool === "point" ? t.hintPoint : t.hintPolygon}</p> : null}
        </>
      ) : null}
      {props.notice?.kind === "linked" ? <p role="status" className="text-sm text-emerald-800">{t.linked(props.notice.code ?? "")}</p> : null}
      {props.notice && props.notice.kind !== "linked" ? <p role="alert" className="text-sm text-red-800">{props.notice.kind === "already" ? t.already : t.few}</p> : null}
    </div>
  );
}
