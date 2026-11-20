import { Select } from "@/components/ds";
import { FieldShell } from "@/components/FieldShell";
import { NoPermission } from "@/components/ScreenStates";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { pickLanguage } from "@/lib/language";
import { useCan, usePermissionsLoading } from "@/lib/permissions";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { X } from "lucide-react";
import React, { useMemo, useState } from "react";
import { useParams } from "wouter";

// Q-43 batch 4 (docs/proposals/subcontractor-progress.md §6): the site engineer proves a subcontractor's work — no price anywhere on this screen.
//   subcontract → kind (units or quantities) → for units: activity → villas (pick, or a whole block) → percent; for quantities: BOQ item → quantity
//   → the lines gathered below → «Review» shows them → «Send» creates the confirmation and sends it for approval.
// Every rule is the server's (double claims, BOQ quantity, separation of duties); its refusal is shown in the person's language and nothing is half-sent:
// a refused send leaves the draft, which the screen says.
const tap = "min-h-[44px] min-w-[44px]";
const field = `${tap} w-full rounded-xl border bg-card px-3 text-base`;
const RECORD = "project.subcontract.progress.record";

const text = {
  ar: {
    title: "إثبات أعمال مقاول", back: "العودة إلى الإدخال الميداني", loading: "جارٍ التحميل…", retry: "إعادة المحاولة",
    subcontract: "العقد / المقاول", pickSubcontract: "اختر العقد", noSubcontracts: "لا عقد مقاول في هذا المشروع بعد.", number: "رقم الإثبات", from: "من", to: "إلى",
    kind: "نوع الإثبات", units: "وحدات", quantities: "كميات", activity: "النشاط", pickActivity: "اختر النشاط", villas: "الفلل", wholeBlock: "البلوك كاملًا", percent: "النسبة %",
    boqItem: "بند الكميات", pickBoq: "اختر البند", quantity: "الكمية", boqQuantity: "كمية البند", add: "أضف الأسطر", lines: "الأسطر", noLines: "لم تُضف أسطر بعد.", remove: "احذف السطر",
    note: "ملاحظات", review: "مراجعة", edit: "تعديل", send: "إرسال للاعتماد", sending: "جارٍ الإرسال…", sent: "أُرسل الإثبات للاعتماد", another: "إثبات آخر", villa: "فيلا",
    noPrices: "لا أسعار في هذه الشاشة: الإثبات يقول ما أُنجز، والمستخلص يحسب ثمنه لاحقًا.", draftLeft: "حُفظ الإثبات مسودة ولم يُرسل:", percentRange: "النسبة بين 0.01 و100.", quantityPositive: "الكمية أكبر من صفر.",
    pickVillas: "اختر فيلا واحدة على الأقل.", reviewTitle: "راجع قبل الإرسال", count: "عدد الأسطر",
  },
  en: {
    title: "Subcontractor work confirmation", back: "Back to quick entry", loading: "Loading…", retry: "Retry",
    subcontract: "Contract / subcontractor", pickSubcontract: "Pick the contract", noSubcontracts: "No subcontract in this project yet.", number: "Confirmation number", from: "From", to: "To",
    kind: "Confirmation kind", units: "Units", quantities: "Quantities", activity: "Activity", pickActivity: "Pick the activity", villas: "Villas", wholeBlock: "Whole block", percent: "Percent %",
    boqItem: "BOQ item", pickBoq: "Pick the item", quantity: "Quantity", boqQuantity: "Item quantity", add: "Add the lines", lines: "Lines", noLines: "No lines added yet.", remove: "Remove the line",
    note: "Notes", review: "Review", edit: "Edit", send: "Send for approval", sending: "Sending…", sent: "The confirmation was sent for approval", another: "Another confirmation", villa: "Villa",
    noPrices: "No prices on this screen: the confirmation says what was done; the certificate prices it later.", draftLeft: "The confirmation was saved as a draft and not sent:", percentRange: "The percent is between 0.01 and 100.", quantityPositive: "The quantity is above zero.",
    pickVillas: "Pick at least one villa.", reviewTitle: "Review before sending", count: "Lines",
  },
  ur: {
    title: "ذیلی ٹھیکیدار کے کام کی تصدیق", back: "فوری اندراج پر واپس", loading: "لوڈ ہو رہا ہے…", retry: "دوبارہ کوشش کریں",
    subcontract: "معاہدہ / ذیلی ٹھیکیدار", pickSubcontract: "معاہدہ منتخب کریں", noSubcontracts: "اس پروجیکٹ میں ابھی کوئی ذیلی معاہدہ نہیں۔", number: "تصدیق نمبر", from: "سے", to: "تک",
    kind: "تصدیق کی قسم", units: "یونٹس", quantities: "مقداریں", activity: "سرگرمی", pickActivity: "سرگرمی منتخب کریں", villas: "ولاز", wholeBlock: "پورا بلاک", percent: "فیصد %",
    boqItem: "BOQ آئٹم", pickBoq: "آئٹم منتخب کریں", quantity: "مقدار", boqQuantity: "آئٹم کی مقدار", add: "سطریں شامل کریں", lines: "سطریں", noLines: "ابھی کوئی سطر شامل نہیں کی گئی۔", remove: "سطر ہٹائیں",
    note: "نوٹس", review: "جائزہ", edit: "ترمیم", send: "منظوری کے لیے بھیجیں", sending: "بھیجا جا رہا ہے…", sent: "تصدیق منظوری کے لیے بھیج دی گئی", another: "ایک اور تصدیق", villa: "ولا",
    noPrices: "اس اسکرین پر کوئی قیمت نہیں: تصدیق بتاتی ہے کہ کیا کام ہوا؛ بل بعد میں اس کی قیمت لگاتا ہے۔", draftLeft: "تصدیق مسودے کے طور پر محفوظ ہوئی اور بھیجی نہیں گئی:", percentRange: "فیصد 0.01 اور 100 کے درمیان ہو۔", quantityPositive: "مقدار صفر سے زیادہ ہو۔",
    pickVillas: "کم از کم ایک ولا منتخب کریں۔", reviewTitle: "بھیجنے سے پہلے جائزہ لیں", count: "سطریں",
  },
};

type Line = { key: string; kind: "unit"; pmcUnitId: string; pmcActivityDefinitionId: string; percent: number; label: string } | { key: string; kind: "quantity"; boqItemId: string; quantity: number; label: string };
const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 8)}01`;

export default function WorkConfirmation() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { isArabic, language } = useLanguage();
  const t = pickLanguage(language, text);
  const canRecord = useCan(RECORD, projectId); const permissionsLoading = usePermissionsLoading();
  const options = trpc.workConfirmations.options.useQuery({ tenantId, projectId }, { enabled: canRecord, retry: false });
  const create = trpc.workConfirmations.create.useMutation();
  const transition = trpc.workConfirmations.transition.useMutation();

  const [subcontractId, setSubcontractId] = useState("");
  const [number, setNumber] = useState("");
  const [periodStart, setPeriodStart] = useState(monthStart());
  const [periodEnd, setPeriodEnd] = useState(today());
  const [kind, setKind] = useState<"unit" | "quantity">("unit");
  const [activityId, setActivityId] = useState("");
  const [villas, setVillas] = useState<string[]>([]);
  // one block open at a time: a project of hundreds of villas stays a short list of blocks on a phone
  const [openBlock, setOpenBlock] = useState<string | null>(null);
  const [percent, setPercent] = useState("100");
  const [boqItemId, setBoqItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [lines, setLines] = useState<Line[]>([]);
  const [note, setNote] = useState("");
  const [lineError, setLineError] = useState<string | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [draftLeft, setDraftLeft] = useState(false);

  const data = canRecord ? options.data : undefined;
  const activity = data?.activities.find(item => item.id === activityId);
  // the villas of the activity's model only: an activity belongs to one model's catalogue
  const units = useMemo(() => (data?.units ?? []).filter(unit => !activity || unit.modelCode === activity.modelCode), [data, activity]);
  const blocks = useMemo(() => Array.from(new Set(units.map(unit => unit.blockCode ?? "—"))), [units]);
  const activityName = (item: { name: string; nameEn: string | null }) => (language === "ar" ? item.name : item.nameEn ?? item.name);

  const addLines = () => {
    setLineError(null);
    if (kind === "unit") {
      const value = Number(percent);
      if (!activity) { setLineError(t.pickActivity); return; }
      if (!villas.length) { setLineError(t.pickVillas); return; }
      if (!(value >= 0.01 && value <= 100)) { setLineError(t.percentRange); return; }
      const added = villas.map(id => { const unit = units.find(item => item.id === id)!; return { key: `${id}:${activity.id}`, kind: "unit" as const, pmcUnitId: id, pmcActivityDefinitionId: activity.id, percent: value, label: `${t.villa} ${unit.unitNumber} · ${activity.code} — ${activityName(activity)} · ${value}%` }; });
      setLines(current => [...current.filter(line => !added.some(item => item.key === line.key)), ...added]);
      setVillas([]);
    } else {
      const item = data?.boqItems.find(entry => entry.id === boqItemId);
      const value = Number(quantity);
      if (!item) { setLineError(t.pickBoq); return; }
      if (!(value > 0)) { setLineError(t.quantityPositive); return; }
      const line = { key: item.id, kind: "quantity" as const, boqItemId: item.id, quantity: value, label: `${item.code} — ${item.description} · ${value} ${item.unitOfMeasure}` };
      setLines(current => [...current.filter(entry => entry.key !== line.key), line]);
      setQuantity("");
    }
  };

  const send = async () => {
    setDraftLeft(false);
    const created = await create.mutateAsync({ tenantId, projectId, subcontractId, confirmationNumber: number.trim(), periodStart, periodEnd, note: note.trim() || null,
      lines: lines.map(line => (line.kind === "unit" ? { kind: "unit" as const, pmcUnitId: line.pmcUnitId, pmcActivityDefinitionId: line.pmcActivityDefinitionId, percent: line.percent } : { kind: "quantity" as const, boqItemId: line.boqItemId, quantity: line.quantity })) }).catch(() => null);
    if (!created) return;
    const moved = await transition.mutateAsync({ tenantId, projectId, confirmationId: created.id, nextStatus: "submitted" }).catch(() => null);
    if (!moved) { setDraftLeft(true); return; }
    setSent(number.trim());
  };
  const reset = () => { setSent(null); setLines([]); setNumber(""); setNote(""); setReviewing(false); setDraftLeft(false); create.reset(); transition.reset(); };

  const ready = Boolean(subcontractId) && number.trim().length > 0 && lines.length > 0 && periodStart <= periodEnd;
  const error = create.error ?? transition.error;
  return (
    <FieldShell title={t.title} backHref={`/m/${tenantId}/${projectId}`} backLabel={t.back}>
      {!canRecord && !permissionsLoading && <NoPermission isArabic={isArabic} scope="section" />}
      {canRecord && <p className="text-xs text-muted-foreground">{t.noPrices}</p>}
      {options.isLoading && canRecord && <p role="status" className="text-sm text-muted-foreground">{t.loading}</p>}
      {options.error && <div className="space-y-2"><p role="alert" className="text-sm text-danger-soft-foreground">{getLocalizedProjectError(options.error, language)}</p><Button className={tap} variant="outline" onClick={() => options.refetch()}>{t.retry}</Button></div>}
      {data && data.subcontracts.length === 0 && <p role="status" className="rounded-xl bg-warning-soft p-3 text-sm text-warning-soft-foreground">{t.noSubcontracts}</p>}
      {data && sent && <div className="space-y-3" data-testid="work-confirmation-sent">
        <p role="status" className="rounded-xl bg-success-soft p-4 text-base font-semibold text-success-soft-foreground">{t.sent}: <bdi>{sent}</bdi></p>
        <Button className={`${tap} w-full text-base`} onClick={reset}>{t.another}</Button>
      </div>}
      {data && !sent && data.subcontracts.length > 0 && !reviewing && <div className="space-y-3" data-testid="work-confirmation-form">
        <label className="block text-sm font-medium">{t.subcontract}
          <Select className="mt-1 min-h-12 text-base md:min-h-12" value={subcontractId || undefined} placeholder={t.pickSubcontract} onValueChange={setSubcontractId} options={data.subcontracts.map(item => ({ value: item.id, label: `${item.code} — ${item.subcontractorName}` }))} />
        </label>
        <label className="block text-sm font-medium" htmlFor="wc-number">{t.number}</label>
        <input id="wc-number" className={field} value={number} maxLength={60} onChange={event => setNumber(event.target.value)} />
        <div className="grid grid-cols-2 gap-2">
          <label className="block text-sm font-medium">{t.from}<input type="date" className={`${field} mt-1`} value={periodStart} onChange={event => setPeriodStart(event.target.value)} /></label>
          <label className="block text-sm font-medium">{t.to}<input type="date" className={`${field} mt-1`} value={periodEnd} onChange={event => setPeriodEnd(event.target.value)} /></label>
        </div>
        <div role="radiogroup" aria-label={t.kind} className="grid grid-cols-2 gap-2">
          {(["unit", "quantity"] as const).map(value => <Button key={value} type="button" role="radio" aria-checked={kind === value} variant={kind === value ? "default" : "outline"} className={tap} onClick={() => { setKind(value); setLineError(null); }}>{value === "unit" ? t.units : t.quantities}</Button>)}
        </div>
        {kind === "unit" ? <div className="space-y-3 rounded-xl border p-3">
          <label className="block text-sm font-medium">{t.activity}
            <Select className="mt-1 min-h-12 text-base md:min-h-12" value={activityId || undefined} placeholder={t.pickActivity} onValueChange={value => { setActivityId(value); setVillas([]); setOpenBlock(null); }} options={data.activities.map(item => ({ value: item.id, label: `${item.modelCode} · ${item.code} — ${activityName(item)}` }))} />
          </label>
          {activity && <fieldset className="space-y-2"><legend className="text-sm font-medium">{t.villas}</legend>
            {blocks.map(block => { const inBlock = units.filter(unit => (unit.blockCode ?? "—") === block); const all = inBlock.every(unit => villas.includes(unit.id)); const picked = inBlock.filter(unit => villas.includes(unit.id)).length; const open = openBlock === block; return (
              <div key={block} className="space-y-2 rounded-xl border p-2">
                <div className="grid grid-cols-[1fr_auto] gap-2">
                  <Button type="button" variant="ghost" className={`${tap} justify-between`} aria-expanded={open} onClick={() => setOpenBlock(open ? null : block)}><span className="font-semibold">{block}</span><span className="text-xs text-muted-foreground">{picked}/{inBlock.length}</span></Button>
                  <Button type="button" variant={all ? "default" : "outline"} className={tap} aria-pressed={all} aria-label={`${t.wholeBlock} ${block}`} onClick={() => setVillas(current => (all ? current.filter(id => !inBlock.some(unit => unit.id === id)) : Array.from(new Set([...current, ...inBlock.map(unit => unit.id)]))))}>{t.wholeBlock}</Button>
                </div>
                {open && <div className="flex flex-wrap gap-2">{inBlock.map(unit => { const on = villas.includes(unit.id); return <Button key={unit.id} type="button" variant={on ? "default" : "outline"} className={tap} aria-pressed={on} aria-label={`${t.villa} ${unit.unitNumber}`} onClick={() => setVillas(current => (on ? current.filter(id => id !== unit.id) : [...current, unit.id]))}>{unit.unitNumber}</Button>; })}</div>}
              </div>); })}
          </fieldset>}
          <label className="block text-sm font-medium" htmlFor="wc-percent">{t.percent}</label>
          <input id="wc-percent" type="number" inputMode="decimal" min="0.01" max="100" step="any" className={field} value={percent} onChange={event => setPercent(event.target.value)} />
        </div> : <div className="space-y-3 rounded-xl border p-3">
          <label className="block text-sm font-medium">{t.boqItem}
            <Select className="mt-1 min-h-12 text-base md:min-h-12" value={boqItemId || undefined} placeholder={t.pickBoq} onValueChange={setBoqItemId} options={data.boqItems.map(item => ({ value: item.id, label: `${item.code} — ${item.description} (${t.boqQuantity}: ${item.quantity} ${item.unitOfMeasure})` }))} />
          </label>
          <label className="block text-sm font-medium" htmlFor="wc-quantity">{t.quantity}</label>
          <input id="wc-quantity" type="number" inputMode="decimal" min="0" step="any" className={field} value={quantity} onChange={event => setQuantity(event.target.value)} />
        </div>}
        {lineError && <p role="alert" className="text-sm text-danger-soft-foreground">{lineError}</p>}
        <Button type="button" variant="outline" className={`${tap} w-full`} onClick={addLines}>{t.add}</Button>
        <LinesList lines={lines} t={t} onRemove={key => setLines(current => current.filter(line => line.key !== key))} />
        <label className="block text-sm font-medium" htmlFor="wc-note">{t.note}</label>
        <textarea id="wc-note" className={`${field} min-h-[88px] py-2`} maxLength={500} value={note} onChange={event => setNote(event.target.value)} />
        <Button className={`${tap} w-full text-base`} disabled={!ready} onClick={() => setReviewing(true)}>{t.review}</Button>
      </div>}
      {data && !sent && reviewing && <div className="space-y-3" data-testid="work-confirmation-review">
        <h2 className="text-base font-semibold">{t.reviewTitle}</h2>
        <p className="text-sm"><bdi>{number}</bdi> · {data.subcontracts.find(item => item.id === subcontractId)?.subcontractorName} · <bdi>{periodStart}</bdi> – <bdi>{periodEnd}</bdi></p>
        <p className="text-sm">{t.count}: {lines.length}</p>
        <LinesList lines={lines} t={t} />
        {note.trim() && <p className="text-sm text-muted-foreground">{note}</p>}
        {error && <p role="alert" className="text-sm text-danger-soft-foreground">{draftLeft ? `${t.draftLeft} ` : ""}{getLocalizedProjectError(error, language)}</p>}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" className={tap} disabled={create.isPending || transition.isPending || draftLeft} onClick={() => setReviewing(false)}>{t.edit}</Button>
          <Button className={tap} disabled={create.isPending || transition.isPending || draftLeft} onClick={() => void send()}>{create.isPending || transition.isPending ? t.sending : t.send}</Button>
        </div>
      </div>}
    </FieldShell>
  );
}

function LinesList({ lines, t, onRemove }: { lines: Line[]; t: (typeof text)["en"]; onRemove?: (key: string) => void }) {
  if (!lines.length) return <p className="text-sm text-muted-foreground">{t.noLines}</p>;
  return (
    <section aria-label={t.lines}><ul className="divide-y rounded-xl border">
      {lines.map(line => <li key={line.key} className="flex items-center justify-between gap-2 p-2 text-sm"><bdi>{line.label}</bdi>
        {onRemove && <Button type="button" variant="outline" className={tap} aria-label={`${t.remove}: ${line.label}`} onClick={() => onRemove(line.key)}><X className="h-4 w-4" aria-hidden /></Button>}
      </li>)}
    </ul></section>
  );
}
