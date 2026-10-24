import { riyalLabel } from "@/lib/profitabilityView";
import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { discard, enqueue, flushQueue, isNetworkError, loadQueue, retryFailed, reviveDates, type QueueItem, type SendResult } from "@/lib/offlineQueue";
import { trpc } from "@/lib/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import { getProjectError } from "@shared/projectErrors";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link, useParams } from "wouter";
import { SourceNotice } from "@/components/SectionResilience";
import { type Language, pickLanguage } from "@/lib/language";
import { LanguageToggle } from "@/components/LanguageToggle";

// Phone entry for the two things a site engineer does all day: log progress and
// issue material. Built for speed: every control is at least 44px, the screen
// guesses what it can (last unit cost, last warehouse and work item), and a
// save needs three taps: pick, choose, save.
const text = {
  ar: {
    title: "إدخال سريع من الموقع", back: "العودة إلى ضوابط المشروع", notAllowed: "دورك لا يتيح تسجيل التقدم ولا صرف المواد من هذه الشاشة.", progress: "تسجيل تقدم", issue: "صرف مادة", loading: "جارٍ التحميل…", retry: "إعادة المحاولة",
    pickItem: "اختر بند العمل", nowAt: "التقدم الآن", never: "لم يُسجَّل", save: "حفظ", saving: "جارٍ الحفظ…", saved: "تم الحفظ", another: "تسجيل آخر", noWbs: "لا بنود عمل في هذا المشروع بعد.", plus5: "+5", minus5: "−5",
    issueToUnit: "صرف إلى وحدة ونشاط (بحث أو QR)", pickMaterial: "اختر المادة", quantity: "الكمية", unitCost: "سعر الوحدة", warehouse: "المستودع", workItem: "بند العمل", change: "تغيير", onHand: "الرصيد", total: "الإجمالي", noMaterials: "لا مواد في الكتالوج بعد.", noWarehouses: "لا مستودع فعّال في هذا المشروع.", issued: "صُرفت", to: "إلى",
    team: "ساعات الفريق", workDate: "يوم العمل", teamEmpty: "لا إسناد يغطي هذا اليوم.", attendanceMissing: "الحضور غير معتمد بعد", entered: "مُدخَلة", hours: "ساعات", saveTeam: "حفظ ساعات الفريق", teamSaved: "حُفظت ساعات", rows: "صفوف", rowErrors: "لم يُحفظ شيء. صحّح الصفوف التالية:",
    queuedSaved: "حُفظ على هذا الهاتف وسيُرسل عند عودة الاتصال", queueNotSaved: "تعذّر الحفظ على الهاتف (مساحة التخزين ممتلئة أو محظورة). أعد الإرسال حين يعود الاتصال.", offline: "لا اتصال", online: "متصل", pending: "بانتظار الإرسال", sendNow: "أرسل الآن", sending: "جارٍ الإرسال…", failedItems: "طلبات رفضها الخادم", discard: "حذف", retryItem: "إعادة", cachedNotice: "لا اتصال: هذه آخر بيانات محفوظة على الهاتف.",
    averageCost: "متوسط التكلفة", usesAverage: "يُصرف بمتوسط تكلفة المخزون", directToSite: "توريد مباشر للموقع (لا يدخل المستودع، وتُحمَّل التكلفة الآن)", intoWarehouse: "يدخل المستودع، وتُحمَّل التكلفة عند الصرف", noWarehouseToReceive: "لا مستودع نشط لاستلام المادة فيه. سجّله توريدًا مباشرًا للموقع أو أضف مستودعًا.",
    receive: "استلام مواد", pickOrder: "اختر أمر الشراء", receivedQty: "الكمية المستلمة", noOrders: "لا أوامر شراء صادرة لهذا المشروع.", received: "استُلمت", from: "من", grn: "إذن الاستلام", rejectedHint: "الكمية المرفوضة تُسجَّل من شاشة الاستلام المكتبية بدليلها.",
   checkingIdentity: "التحقق من هويتك", offlineOff: "الحفظ دون اتصال معطّل إلى أن يعود؛ أعد المحاولة قبل أن تحفظ إدخالًا." },
  en: {
    title: "Quick site entry", back: "Back to project controls", notAllowed: "Your role does not allow logging progress or issuing material from this screen.", progress: "Log progress", issue: "Issue material", loading: "Loading…", retry: "Retry",
    pickItem: "Pick the work item", nowAt: "Now at", never: "not recorded", save: "Save", saving: "Saving…", saved: "Saved", another: "Record another", noWbs: "This project has no work items yet.", plus5: "+5", minus5: "−5",
    issueToUnit: "Issue to a unit's activity (search or QR)", pickMaterial: "Pick the material", quantity: "Quantity", unitCost: "Unit cost", warehouse: "Warehouse", workItem: "Work item", change: "Change", onHand: "On hand", total: "Total", noMaterials: "No materials in the catalogue yet.", noWarehouses: "This project has no active warehouse.", issued: "Issued", to: "to",
    team: "Team hours", workDate: "Work day", teamEmpty: "No assignment covers this day.", attendanceMissing: "Attendance not approved yet", entered: "Entered", hours: "hours", saveTeam: "Save team hours", teamSaved: "Hours saved", rows: "rows", rowErrors: "Nothing was saved. Fix these rows:",
    queuedSaved: "Saved on this phone, will be sent when the connection returns", queueNotSaved: "Could not keep it on this phone (storage full or blocked). Send again when you are online.", offline: "Offline", online: "Online", pending: "waiting to send", sendNow: "Send now", sending: "Sending…", failedItems: "Requests the server refused", discard: "Discard", retryItem: "Retry", cachedNotice: "Offline: this is the last data saved on the phone.",
    averageCost: "Average cost", usesAverage: "Issued at the stock's average cost", directToSite: "Direct delivery to site (no warehouse, cost charged now)", intoWarehouse: "Goes into the warehouse; cost is charged when it is issued", noWarehouseToReceive: "There is no active warehouse to receive into. Record it as a direct delivery to site or add a warehouse.",
    receive: "Receive material", pickOrder: "Pick the purchase order", receivedQty: "Quantity received", noOrders: "This project has no issued purchase orders.", received: "Received", from: "from", grn: "Receipt note", rejectedHint: "Rejected quantity, with its evidence, is recorded from the desk receipt screen.",
   checkingIdentity: "Checking who you are", offlineOff: "Saving offline is off until it is back; try again before you save an entry." }, ur: {
    title: "سائٹ سے فوری اندراج", back: "پروجیکٹ کنٹرولز پر واپس", notAllowed: "آپ کا کردار اس اسکرین سے پیش رفت درج کرنے یا مادّہ اجرا کرنے کی اجازت نہیں دیتا۔", progress: "پیش رفت درج کریں", issue: "مادّہ اجرا کریں", loading: "لوڈ ہو رہا ہے…", retry: "دوبارہ کوشش کریں",
    pickItem: "کام کی آئٹم منتخب کریں", nowAt: "اب تک", never: "درج نہیں ہوئی", save: "محفوظ کریں", saving: "محفوظ کیا جا رہا ہے…", saved: "محفوظ ہو گیا", another: "ایک اور درج کریں", noWbs: "اس پروجیکٹ میں ابھی کوئی کام کی آئٹم نہیں ہے۔", plus5: "+5", minus5: "−5",
    issueToUnit: "یونٹ کی سرگرمی پر اجرا (تلاش یا QR)", pickMaterial: "مادّہ منتخب کریں", quantity: "مقدار", unitCost: "فی یونٹ لاگت", warehouse: "گودام", workItem: "کام کی آئٹم", change: "تبدیل کریں", onHand: "دستیاب", total: "کل", noMaterials: "کیٹلاگ میں ابھی کوئی مادّہ نہیں ہے۔", noWarehouses: "اس پروجیکٹ میں کوئی فعال گودام نہیں ہے۔", issued: "اجرا ہوا", to: "کو",
    team: "ٹیم کے گھنٹے", workDate: "کام کا دن", teamEmpty: "اس دن کے لیے کوئی تفویض نہیں۔", attendanceMissing: "حاضری ابھی منظور نہیں ہوئی", entered: "درج شدہ", hours: "گھنٹے", saveTeam: "ٹیم کے گھنٹے محفوظ کریں", teamSaved: "گھنٹے محفوظ ہو گئے", rows: "قطاریں", rowErrors: "کچھ محفوظ نہیں ہوا۔ یہ قطاریں درست کریں:",
    queuedSaved: "اس فون پر محفوظ ہو گیا، کنکشن واپس آنے پر بھیجا جائے گا", queueNotSaved: "اسے فون پر محفوظ نہیں رکھا جا سکا (اسٹوریج بھری ہے یا بند ہے)۔ آن لائن ہونے پر دوبارہ بھیجیں۔", offline: "آف لائن", online: "آن لائن", pending: "بھیجے جانے کا منتظر", sendNow: "ابھی بھیجیں", sending: "بھیجا جا رہا ہے…", failedItems: "سرور کی طرف سے مسترد درخواستیں", discard: "حذف کریں", retryItem: "دوبارہ", cachedNotice: "آف لائن: یہ فون پر محفوظ آخری ڈیٹا ہے۔",
    averageCost: "اوسط لاگت", usesAverage: "مادّہ اسٹاک کی اوسط لاگت پر اجرا ہوتا ہے", directToSite: "براہِ راست سائٹ پر سپلائی (گودام میں نہیں جاتا، لاگت ابھی منتقل ہوتی ہے)", intoWarehouse: "گودام میں جاتا ہے؛ اجرا کے وقت لاگت منتقل ہوتی ہے", noWarehouseToReceive: "وصولی کے لیے کوئی فعال گودام نہیں ہے۔ اسے براہِ راست سائٹ پر سپلائی کے طور پر درج کریں یا گودام شامل کریں۔",
    receive: "مادّہ وصول کریں", pickOrder: "خریداری کا آرڈر منتخب کریں", receivedQty: "وصول شدہ مقدار", noOrders: "اس پروجیکٹ کے لیے جاری شدہ خریداری کے آرڈر نہیں ہیں۔", received: "وصول ہوا", from: "سے", grn: "وصولی نوٹ (GRN)", rejectedHint: "مسترد شدہ مقدار اپنے ثبوت کے ساتھ دفتری وصولی کی اسکرین سے درج ہوتی ہے۔",
 checkingIdentity: "آپ کی شناخت کی جانچ ہو رہی ہے", offlineOff: "آف لائن محفوظ کرنا اس وقت تک بند ہے جب تک یہ بحال نہ ہو؛ کوئی اندراج محفوظ کرنے سے پہلے دوبارہ کوشش کریں۔" },
};
type T = typeof text.en;
const PRESETS = [0, 25, 50, 75, 100];
const tap = "min-h-[44px] min-w-[44px]";
const remembered = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const remember = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* storage may be unavailable; defaults then fall back to the first item */ } };

type Context = inferRouterOutputs<AppRouter>["fieldEntry"]["context"];
type Sheet = inferRouterOutputs<AppRouter>["teamHours"]["sheet"];
type KeepOffline = (item: Pick<QueueItem, "id" | "kind" | "payload" | "summary">) => boolean;

const newId = () => globalThis.crypto.randomUUID();
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dayOf = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const readCache = <V,>(key: string): V | null => { const raw = remembered(key); if (!raw) return null; try { return JSON.parse(raw) as V; } catch { return null; } };
// The phone may be offline while a form is open, and the library would then wait for the network instead of failing, so
// field requests ask to be attempted either way; a failed attempt is what puts the request in the queue.
const attempt = { networkMode: "always" as const };
const localized = (code: string, language: Language) => pickLanguage(language, getProjectError(code).messages);

function ProgressEntry({ tenantId, projectId, context, t, onSaved, isArabic, keepOffline }: { tenantId: string; projectId: string; context: Context; t: T; onSaved: () => void; isArabic: boolean; keepOffline: KeepOffline }) {
  const [itemId, setItemId] = useState<string | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [done, setDone] = useState<{ name: string; percent: number; queued: boolean } | null>(null);
  const [notKept, setNotKept] = useState(false);
  const requestId = useRef(newId()); // one identifier per intended save: a resend reuses it, so the server applies it once
  const finish = (queued: boolean) => { const item = context.wbs.find(w => w.id === itemId)!; setDone({ name: `${item.code} · ${item.name}`, percent: percent!, queued }); setItemId(null); setPercent(null); requestId.current = newId(); };
  const create = trpc.progress.create.useMutation({
    ...attempt,
    onSuccess: () => { setNotKept(false); finish(false); onSaved(); },
    onError: (error, variables) => { if (!isNetworkError(error)) return; if (keepOffline({ id: variables.clientRequestId!, kind: "progress", payload: variables, summary: `${context.wbs.find(w => w.id === variables.wbsItemId)?.code ?? ""} → ${variables.percentComplete}%` })) { setNotKept(false); finish(true); } else setNotKept(true); },
  });
  if (done) return <div className="space-y-3"><p role="status" className="rounded-xl bg-emerald-50 p-4 text-base font-semibold text-emerald-800">{done.queued ? t.queuedSaved : t.saved}: {done.name} → {done.percent}%</p><Button className={`${tap} w-full`} onClick={() => setDone(null)}>{t.another}</Button></div>;
  if (context.wbs.length === 0) return <p className="text-sm text-slate-500">{t.noWbs}</p>;
  const selected = context.wbs.find(w => w.id === itemId) ?? null;
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-slate-600">{t.pickItem}</p>
      <ul className="space-y-2">
        {[...context.wbs].sort((a, b) => a.code.localeCompare(b.code, undefined, { numeric: true })).map(item => (
          <li key={item.id}>
            <button type="button" aria-pressed={item.id === itemId} className={`${tap} w-full rounded-xl border px-4 py-3 text-start ${item.id === itemId ? "border-[#0e6b70] bg-teal-50" : "bg-white"}`} onClick={() => { setItemId(item.id); setPercent(null); }}>
              <span className="font-semibold">{item.code} · {item.name}</span>
              <span className="block text-xs text-slate-500">{t.nowAt}: {item.lastPercent === null ? t.never : `${item.lastPercent}%`}</span>
            </button>
            {item.id === itemId && (
              <div className="mt-2 rounded-xl bg-slate-50 p-3">
                <div className="grid grid-cols-5 gap-2" role="group" aria-label={t.progress}>
                  {PRESETS.map(value => <button key={value} type="button" aria-pressed={percent === value} className={`${tap} rounded-lg border text-base font-semibold ${percent === value ? "border-[#0e6b70] bg-[#0e6b70] text-white" : "bg-white"}`} onClick={() => setPercent(value)}>{value}%</button>)}
                </div>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <button type="button" className={`${tap} rounded-lg border bg-white px-4`} onClick={() => setPercent(Math.max(0, (percent ?? selected?.lastPercent ?? 0) - 5))}>{t.minus5}</button>
                  <b className="text-xl" dir="ltr">{percent === null ? "—" : `${percent}%`}</b>
                  <button type="button" className={`${tap} rounded-lg border bg-white px-4`} onClick={() => setPercent(Math.min(100, (percent ?? selected?.lastPercent ?? 0) + 5))}>{t.plus5}</button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {notKept && <p role="alert" className="text-sm text-red-700">{t.queueNotSaved}</p>}
      {create.error && !isNetworkError(create.error) && <p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(create.error, isArabic)}</p>}
      <Button className={`${tap} w-full text-base`} disabled={itemId === null || percent === null || create.isPending} onClick={() => create.mutate({ tenantId, projectId, wbsItemId: itemId!, percentComplete: percent!, reportedAt: new Date(), clientRequestId: requestId.current })}>{create.isPending ? t.saving : t.save}</Button>
    </div>
  );
}

function MaterialIssueEntry({ tenantId, projectId, context, t, onSaved, isArabic, keepOffline }: { tenantId: string; projectId: string; context: Context; t: T; onSaved: () => void; isArabic: boolean; keepOffline: KeepOffline }) {
  const rememberedWarehouse = remembered(`fieldEntry:${projectId}:warehouse`);
  const rememberedWbs = remembered(`fieldEntry:${projectId}:wbs`);
  const [warehouseId, setWarehouseId] = useState(context.warehouses.find(w => w.id === rememberedWarehouse)?.id ?? context.warehouses[0]?.id ?? "");
  const [wbsItemId, setWbsItemId] = useState(context.wbs.find(w => w.id === rememberedWbs)?.id ?? context.wbs.find(w => w.id === context.lastIssuedWbsItemId)?.id ?? context.wbs[0]?.id ?? "");
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [done, setDone] = useState<{ text: string; queued: boolean } | null>(null);
  const [notKept, setNotKept] = useState(false);
  const requestId = useRef(newId());
  const material = context.materials.find(m => m.id === materialId) ?? null;
  const wbsItem = context.wbs.find(w => w.id === wbsItemId);
  const warehouse = context.warehouses.find(w => w.id === warehouseId);
  const summary = `${t.issued}: ${quantity} ${material?.unitOfMeasure ?? ""} ${material?.code ?? ""} ${t.to} ${wbsItem?.code ?? ""}`;
  const finish = (queued: boolean) => { remember(`fieldEntry:${projectId}:warehouse`, warehouseId); remember(`fieldEntry:${projectId}:wbs`, wbsItemId); setDone({ text: summary, queued }); setMaterialId(null); setQuantity(""); setUnitCost(""); requestId.current = newId(); };
  const issue = trpc.warehouses.issueToWork.useMutation({
    ...attempt,
    onSuccess: () => { setNotKept(false); finish(false); onSaved(); },
    onError: (error, variables) => { if (!isNetworkError(error)) return; if (keepOffline({ id: variables.clientRequestId!, kind: "issue", payload: variables, summary })) { setNotKept(false); finish(true); } else setNotKept(true); },
  });
  if (done) return <div className="space-y-3"><p role="status" className="rounded-xl bg-emerald-50 p-4 text-base font-semibold text-emerald-800">{done.queued ? t.queuedSaved : t.saved}: {done.text}</p><Button className={`${tap} w-full`} onClick={() => setDone(null)}>{t.another}</Button></div>;
  if (context.materials.length === 0) return <p className="text-sm text-slate-500">{t.noMaterials}</p>;
  if (context.warehouses.length === 0) return <p className="text-sm text-slate-500">{t.noWarehouses}</p>;
  const qty = Number(quantity);
  const cost = Number(unitCost);
  const shelf = material?.onHand.find(h => h.warehouseId === warehouseId);
  const averageCost = shelf?.averageCost ?? null; // priced stock is issued at its average; the unit cost is asked only for stock nobody priced
  const ready = Boolean(materialId && warehouseId && wbsItemId && qty > 0 && (averageCost !== null || cost > 0));
  const onHand = shelf?.quantity ?? null;
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-slate-600">{t.pickMaterial}</p>
      <ul className="max-h-72 space-y-2 overflow-y-auto">
        {context.materials.map(item => (
          <li key={item.id}>
            <button type="button" aria-pressed={item.id === materialId} className={`${tap} w-full rounded-xl border px-4 py-3 text-start ${item.id === materialId ? "border-[#0e6b70] bg-teal-50" : "bg-white"}`} onClick={() => { setMaterialId(item.id); setUnitCost(item.lastUnitCost === null ? "" : String(item.lastUnitCost)); }}>
              <span className="font-semibold">{item.code} · {item.description}</span>
              <span className="block text-xs text-slate-500">{item.unitOfMeasure}</span>
            </button>
          </li>
        ))}
      </ul>
      {material && (
        <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
          <label className="text-sm">{t.quantity} ({material.unitOfMeasure})<input aria-label={t.quantity} className={`${tap} mt-1 w-full rounded-lg border bg-white px-3 text-lg`} inputMode="decimal" value={quantity} onChange={event => setQuantity(event.target.value)} /></label>
          {averageCost === null
            ? <label className="text-sm">{t.unitCost}<input aria-label={t.unitCost} className={`${tap} mt-1 w-full rounded-lg border bg-white px-3 text-lg`} inputMode="decimal" value={unitCost} onChange={event => setUnitCost(event.target.value)} /></label>
            : <p className="text-sm">{t.averageCost}: <b>{averageCost}</b><span className="block text-xs text-slate-500">{t.usesAverage}</span></p>}
          <p className="col-span-2 text-xs text-slate-600">{t.onHand}: <b>{onHand === null ? "—" : onHand}</b>{qty > 0 && (averageCost ?? cost) > 0 && <> · {t.total}: <b>{(qty * (averageCost ?? cost)).toFixed(2)}</b></>}</p>
        </div>
      )}
      <details className="rounded-xl border bg-white p-3 text-sm">
        <summary className={`${tap} flex cursor-pointer items-center`}>{t.warehouse}: <b className="mx-1">{warehouse?.code}</b> · {t.workItem}: <b className="mx-1">{wbsItem?.code}</b> <span className="ms-auto text-[#0e6b70]">{t.change}</span></summary>
        <label className="mt-2 block">{t.warehouse}<select aria-label={t.warehouse} className={`${tap} mt-1 w-full rounded-lg border bg-white px-2`} value={warehouseId} onChange={event => setWarehouseId(event.target.value)}>{context.warehouses.map(w => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}</select></label>
        <label className="mt-2 block">{t.workItem}<select aria-label={t.workItem} className={`${tap} mt-1 w-full rounded-lg border bg-white px-2`} value={wbsItemId} onChange={event => setWbsItemId(event.target.value)}>{context.wbs.map(w => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}</select></label>
      </details>
      {notKept && <p role="alert" className="text-sm text-red-700">{t.queueNotSaved}</p>}
      {issue.error && !isNetworkError(issue.error) && <p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(issue.error, isArabic)}</p>}
      <Button className={`${tap} w-full text-base`} disabled={!ready || issue.isPending} onClick={() => issue.mutate({ tenantId, projectId, warehouseId, materialId: materialId!, wbsItemId, issuedQuantity: qty, unitCost: averageCost === null ? cost : undefined, issuedAt: new Date(), clientRequestId: requestId.current })}>{issue.isPending ? t.saving : t.save}</Button>
    </div>
  );
}

function ReceiptEntry({ tenantId, projectId, context, t, onSaved, isArabic, keepOffline }: { tenantId: string; projectId: string; context: Context; t: T; onSaved: () => void; isArabic: boolean; keepOffline: KeepOffline }) {
  const orders = context.purchaseOrders ?? [];
  const [orderId, setOrderId] = useState(orders.length === 1 ? orders[0].id : "");
  const rememberedStore = remembered(`fieldEntry:${projectId}:warehouse`);
  const [receiveWarehouseId, setReceiveWarehouseId] = useState(context.warehouses.find(w => w.id === rememberedStore)?.id ?? context.warehouses[0]?.id ?? "");
  const [direct, setDirect] = useState(false);
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [done, setDone] = useState<{ text: string; queued: boolean } | null>(null);
  const [notKept, setNotKept] = useState(false);
  const requestId = useRef(newId());
  const grnNumber = useRef<string | null>(null); // fixed for one intended save, so a resend carries the same number
  const order = orders.find(o => o.id === orderId) ?? null;
  const chosenMaterialId = materialId ?? order?.lastReceivedMaterialId ?? null;
  const material = context.materials.find(m => m.id === chosenMaterialId) ?? null;
  const summary = `${t.received}: ${quantity} ${material?.unitOfMeasure ?? ""} ${material?.code ?? ""} ${t.from} ${order?.purchaseOrderNumber ?? ""}`;
  const finish = (queued: boolean) => { setDone({ text: summary, queued }); setQuantity(""); setUnitCost(""); setMaterialId(null); requestId.current = newId(); grnNumber.current = null; };
  const receive = trpc.goodsReceipts.create.useMutation({
    ...attempt,
    onSuccess: () => { setNotKept(false); finish(false); onSaved(); },
    onError: (error, variables) => { if (!isNetworkError(error)) return; if (keepOffline({ id: variables.clientRequestId!, kind: "receipt", payload: variables, summary })) { setNotKept(false); finish(true); } else setNotKept(true); },
  });
  if (done) return <div className="space-y-3"><p role="status" className="rounded-xl bg-emerald-50 p-4 text-base font-semibold text-emerald-800">{done.queued ? t.queuedSaved : t.saved}: {done.text}</p><Button className={`${tap} w-full`} onClick={() => setDone(null)}>{t.another}</Button></div>;
  if (orders.length === 0) return <p className="text-sm text-slate-500">{t.noOrders}</p>;
  const qty = Number(quantity);
  const cost = Number(unitCost || material?.lastUnitCost || 0);
  const ready = Boolean(order && material && qty > 0 && cost > 0 && (direct || receiveWarehouseId));
  const submit = () => {
    if (!grnNumber.current) { const now = new Date(); grnNumber.current = `GRN-${now.toISOString().slice(0, 10).replace(/-/g, "")}-${now.toISOString().slice(11, 19).replace(/:/g, "")}-${requestId.current.slice(0, 4).toUpperCase()}`; }
    receive.mutate({ tenantId, projectId, grnNumber: grnNumber.current, purchaseOrderId: order!.id, materialId: material!.id, receivedQuantity: qty, rejectedQuantity: 0, unitCost: cost, unitOfMeasure: material!.unitOfMeasure, receivedAt: new Date(), receiptMode: direct ? "direct_to_site" : "warehouse_stock", warehouseId: direct ? undefined : receiveWarehouseId, clientRequestId: requestId.current });
  };
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-slate-600">{t.pickOrder}</p>
      <ul className="space-y-2">
        {orders.map(item => (
          <li key={item.id}>
            <button type="button" aria-pressed={item.id === orderId} className={`${tap} w-full rounded-xl border px-4 py-3 text-start ${item.id === orderId ? "border-[#0e6b70] bg-teal-50" : "bg-white"}`} onClick={() => { setOrderId(item.id); setMaterialId(null); }}>
              <span className="font-semibold">{item.purchaseOrderNumber}</span>
              <span className="block text-xs text-slate-500">{item.supplierName}</span>
            </button>
          </li>
        ))}
      </ul>
      {order && (
        <>
          <label className="block text-sm">{t.pickMaterial}<select aria-label={t.pickMaterial} className={`${tap} mt-1 w-full rounded-lg border bg-white px-2`} value={chosenMaterialId ?? ""} onChange={event => { setMaterialId(event.target.value || null); setUnitCost(""); }}><option value="">—</option>{context.materials.map(m => <option key={m.id} value={m.id}>{m.code} · {m.description}</option>)}</select></label>
          {material && (
            <div className="grid grid-cols-2 gap-3 rounded-xl bg-slate-50 p-3">
              <label className="text-sm">{t.receivedQty} ({material.unitOfMeasure})<input aria-label={t.receivedQty} className={`${tap} mt-1 w-full rounded-lg border bg-white px-3 text-lg`} inputMode="decimal" value={quantity} onChange={event => setQuantity(event.target.value)} /></label>
              <label className="text-sm">{t.unitCost}<input aria-label={t.unitCost} className={`${tap} mt-1 w-full rounded-lg border bg-white px-3 text-lg`} inputMode="decimal" placeholder={material.lastUnitCost === null ? "" : String(material.lastUnitCost)} value={unitCost} onChange={event => setUnitCost(event.target.value)} /></label>
              <label className="col-span-2 flex items-start gap-2 text-sm"><input type="checkbox" aria-label={t.directToSite} className="mt-1 h-5 w-5" checked={direct} onChange={event => setDirect(event.target.checked)} />{t.directToSite}</label>
              {!direct && (context.warehouses.length === 0
                ? <p role="alert" className="col-span-2 text-xs text-red-700">{t.noWarehouseToReceive}</p>
                : <label className="col-span-2 text-sm">{t.warehouse}<select aria-label={t.warehouse} className={`${tap} mt-1 w-full rounded-lg border bg-white px-2`} value={receiveWarehouseId} onChange={event => setReceiveWarehouseId(event.target.value)}>{context.warehouses.map(w => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}</select><span className="block text-xs text-slate-500">{t.intoWarehouse}</span></label>)}
              <p className="col-span-2 text-xs text-slate-600">{qty > 0 && cost > 0 && <>{t.total}: <b>{(qty * cost).toFixed(2)}</b> {riyalLabel(isArabic)} · </>}{t.rejectedHint}</p>
            </div>
          )}
        </>
      )}
      {notKept && <p role="alert" className="text-sm text-red-700">{t.queueNotSaved}</p>}
      {receive.error && !isNetworkError(receive.error) && <p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(receive.error, isArabic)}</p>}
      <Button className={`${tap} w-full text-base`} disabled={!ready || receive.isPending} onClick={submit}>{receive.isPending ? t.saving : t.save}</Button>
    </div>
  );
}

function TeamHoursEntry({ tenantId, projectId, personId, t, isArabic, language, keepOffline, online }: { tenantId: string; projectId: string; personId: number | null; t: T; isArabic: boolean; language: Language; keepOffline: KeepOffline; online: boolean }) {
  const [date, setDate] = useState(todayIso);
  const [hours, setHours] = useState<Record<string, string>>({});
  const [unticked, setUnticked] = useState<Set<string>>(new Set());
  const [rowErrors, setRowErrors] = useState<Array<{ index: number; assignmentId: string; code: string }>>([]);
  const [done, setDone] = useState<{ count: number; queued: boolean } | null>(null);
  const [notKept, setNotKept] = useState(false);
  const requestId = useRef(newId());
  // The sheet carries employees' names, so it is kept for the signed-in person only and only the latest one (a new one replaces it).
  const sheetKey = `fieldEntry:sheet:${personId ?? "anon"}:${projectId}`;
  const sheet = trpc.teamHours.sheet.useQuery({ tenantId, projectId, workDate: dayOf(date) }, { ...attempt, retry: 1 });
  useEffect(() => { if (sheet.data && personId !== null) remember(sheetKey, JSON.stringify({ date, sheet: sheet.data })); }, [sheet.data, sheetKey, date, personId]);
  const cachedEntry = !sheet.data && personId !== null && (!online || (sheet.error && isNetworkError(sheet.error))) ? readCache<{ date: string; sheet: Sheet }>(sheetKey) : null;
  const cached = cachedEntry && cachedEntry.date === date ? cachedEntry.sheet : null;
  const rows = (sheet.data ?? cached)?.rows ?? null;
  const hoursOf = (assignmentId: string) => hours[assignmentId] ?? "8";
  const eligible = (rows ?? []).filter(row => row.attendanceApproved && !row.entered);
  const entries = eligible.filter(row => !unticked.has(row.assignmentId) && Number(hoursOf(row.assignmentId)) > 0 && Number(hoursOf(row.assignmentId)) <= 24).map(row => ({ assignmentId: row.assignmentId, actualHours: Number(hoursOf(row.assignmentId)) }));
  const finish = (count: number, queued: boolean) => { setDone({ count, queued }); setRowErrors([]); setHours({}); setUnticked(new Set()); requestId.current = newId(); };
  const save = trpc.teamHours.save.useMutation({
    ...attempt,
    onSuccess: result => { setNotKept(false); if (result.errors.length) { setRowErrors(result.errors); requestId.current = newId(); return; } /* the server stored this answer under the old identifier, so the corrected sheet must go out under a new one */ finish(result.saved, false); void sheet.refetch(); },
    onError: (error, variables) => { if (!isNetworkError(error)) return; if (keepOffline({ id: variables.clientRequestId!, kind: "team", payload: variables, summary: `${t.team} ${date}: ${variables.entries.length} ${t.rows}` })) { setNotKept(false); finish(variables.entries.length, true); } else setNotKept(true); },
  });
  const label = (assignmentId: string) => { const row = rows?.find(entry => entry.assignmentId === assignmentId); return row ? `${row.employeeNumber} · ${row.fullName}` : assignmentId; };
  return (
    <div className="space-y-3">
      <label className="block text-sm font-semibold text-slate-600">{t.workDate}<input type="date" aria-label={t.workDate} className={`${tap} mt-1 w-full rounded-lg border bg-white px-3 text-lg`} value={date} onChange={event => { if (event.target.value) { setDate(event.target.value); setDone(null); setRowErrors([]); setHours({}); setUnticked(new Set()); requestId.current = newId(); } }} /></label>
      {cached && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t.cachedNotice}</p>}
      {sheet.isLoading && !rows && <p role="status" className="text-sm text-slate-500">{t.loading}</p>}
      {sheet.error && !rows && !isNetworkError(sheet.error) && <p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(sheet.error, isArabic)}</p>}
      {rows && rows.length === 0 && <p className="text-sm text-slate-500">{t.teamEmpty}</p>}
      {rows && rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map(row => {
            const open = row.attendanceApproved && !row.entered;
            return (
              <li key={row.assignmentId} className={`flex items-center gap-3 rounded-xl border px-3 py-2 ${open ? "bg-white" : "bg-slate-50 text-slate-500"}`}>
                <input type="checkbox" aria-label={`${row.employeeNumber} ${row.fullName}`} className={`${tap} shrink-0`} disabled={!open} checked={open && !unticked.has(row.assignmentId)} onChange={event => setUnticked(previous => { const next = new Set(previous); if (event.target.checked) next.delete(row.assignmentId); else next.add(row.assignmentId); return next; })} />
                <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{row.employeeNumber} · {row.fullName}</span><span className="block text-xs">{row.wbsCode ? `${row.wbsCode} · ` : ""}{row.entered ? `${t.entered}: ${row.entered.hours} ${t.hours}` : row.attendanceApproved ? "" : t.attendanceMissing}</span></span>
                {open && <input aria-label={`${t.hours} ${row.employeeNumber}`} className={`${tap} w-20 rounded-lg border bg-white px-2 text-center text-lg`} inputMode="decimal" value={hoursOf(row.assignmentId)} onChange={event => setHours(previous => ({ ...previous, [row.assignmentId]: event.target.value }))} />}
              </li>
            );
          })}
        </ul>
      )}
      {rowErrors.length > 0 && <div role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800"><p className="font-semibold">{t.rowErrors}</p><ul className="mt-1 list-disc ps-5">{rowErrors.map(error => <li key={`${error.index}-${error.assignmentId}`}>{label(error.assignmentId)}: {localized(error.code, language)}</li>)}</ul></div>}
      {notKept && <p role="alert" className="text-sm text-red-700">{t.queueNotSaved}</p>}
      {save.error && !isNetworkError(save.error) && <p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(save.error, isArabic)}</p>}
      {done && <p role="status" className="rounded-xl bg-emerald-50 p-4 text-base font-semibold text-emerald-800">{done.queued ? t.queuedSaved : t.teamSaved}: {done.count} {t.rows}</p>}
      <Button className={`${tap} w-full text-base`} disabled={entries.length === 0 || save.isPending} onClick={() => { setDone(null); save.mutate({ tenantId, projectId, workDate: dayOf(date), entries, clientRequestId: requestId.current }); }}>{save.isPending ? t.saving : `${t.saveTeam}${entries.length ? ` (${entries.length})` : ""}`}</Button>
    </div>
  );
}

function QueueBanner({ items, online, flushing, onFlush, onDiscard, onRetry, t, isArabic, language }: { items: QueueItem[]; online: boolean; flushing: boolean; onFlush: () => void; onDiscard: (id: string) => void; onRetry: (id: string) => void; t: T; isArabic: boolean; language: Language }) {
  const pending = items.filter(item => item.status === "pending");
  const failed = items.filter(item => item.status === "failed");
  return (
    <section className="space-y-2">
      <p aria-live="polite" data-testid="queue-status" className={`rounded-xl px-3 py-2 text-sm font-semibold ${online ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900"}`}>{online ? t.online : t.offline}{pending.length > 0 && ` · ${pending.length} ${t.pending}`}</p>
      {pending.length > 0 && <Button className={`${tap} w-full`} variant="outline" disabled={!online || flushing} onClick={onFlush}>{flushing ? t.sending : t.sendNow}</Button>}
      {failed.length > 0 && (
        <div className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
          <p className="font-semibold">{t.failedItems}</p>
          <ul className="mt-1 space-y-2">{failed.map(item => <li key={item.id}><span className="block">{item.summary}</span><span className="block text-xs">{localized(item.error ?? "", language)}</span><span className="mt-1 flex gap-2"><button type="button" className={`${tap} rounded-lg border bg-white px-3`} onClick={() => onRetry(item.id)}>{t.retryItem}</button><button type="button" className={`${tap} rounded-lg border bg-white px-3`} onClick={() => onDiscard(item.id)}>{t.discard}</button></span></li>)}</ul>
        </div>
      )}
    </section>
  );
}

// The queue belongs to one project on one phone. Online again, it is sent by itself, one request at a time.
// It also tries again every RETRY_MS while something waits and the phone believes it is online: "online" can stay true
// while the server is unreachable, and no event fires when it comes back.
const RETRY_MS = 30_000;
// `scope` names the person as well as the project (null until the signed-in person is known): a phone shared on site must never
// send one person's waiting requests under the next person's sign-in.
function useOfflineQueue(scope: string | null) {
  const client = trpc.useUtils().client;
  const [items, setItems] = useState<QueueItem[]>(() => (scope ? loadQueue(scope) : []));
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  const [flushing, setFlushing] = useState(false);
  const refresh = useCallback(() => setItems(scope ? loadQueue(scope) : []), [scope]);
  useEffect(() => { refresh(); }, [refresh]); // a different person on the same phone sees their own queue
  // The sender is read through a ref so that `flush` keeps one identity: a changing client must not re-arm the effects below on every render.
  const send = useCallback(async (item: QueueItem): Promise<SendResult> => {
    const payload = { ...reviveDates(item.payload), clientRequestId: item.id } as never;
    if (item.kind === "progress") await client.progress.create.mutate(payload);
    else if (item.kind === "issue") await client.warehouses.issueToWork.mutate(payload);
    else if (item.kind === "receipt") await client.goodsReceipts.create.mutate(payload);
    else { const result = await client.teamHours.save.mutate(payload); if (result.errors.length) return { rejected: result.errors[0].code }; }
  }, [client]);
  const sendRef = useRef(send);
  sendRef.current = send;
  const flush = useCallback(async () => { if (!scope) return; setFlushing(true); try { await flushQueue(scope, item => sendRef.current(item)); } finally { setFlushing(false); refresh(); } }, [scope, refresh]);
  useEffect(() => {
    const goOnline = () => { setOnline(true); void flush(); };
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline); window.addEventListener("offline", goOffline);
    if (scope && navigator.onLine !== false && loadQueue(scope).some(item => item.status === "pending")) void flush();
    return () => { window.removeEventListener("online", goOnline); window.removeEventListener("offline", goOffline); };
  }, [scope, flush]);
  const waiting = items.some(item => item.status === "pending");
  useEffect(() => {
    if (!waiting || !online) return undefined;
    const timer = setInterval(() => { void flush(); }, RETRY_MS);
    return () => clearInterval(timer);
  }, [waiting, online, flush]);
  const keep: KeepOffline = useCallback(item => { if (!scope) return false; const kept = enqueue(scope, item); refresh(); return kept; }, [scope, refresh]);
  return { items, online, flushing, flush, keep, discard: (id: string) => { if (scope) { discard(scope, id); refresh(); } }, retry: (id: string) => { if (scope) { retryFailed(scope, id); refresh(); void flush(); } } };
}

export default function FieldEntry() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { isArabic, isRtl, language } = useLanguage();
  const t = pickLanguage(language, text);
  const [chosen, setTab] = useState<"progress" | "issue" | "receive" | "team" | null>(null);
  const me = trpc.auth.me.useQuery(undefined, { retry: false, refetchOnWindowFocus: false });
  const queue = useOfflineQueue(me.data?.id ? `${me.data.id}:${tenantId}:${projectId}` : null);
  const contextKey = `fieldEntry:context:${me.data?.id ?? "anon"}:${tenantId}:${projectId}`;
  const context = trpc.fieldEntry.context.useQuery({ tenantId, projectId }, { enabled: Boolean(tenantId && projectId), ...attempt, retry: 1 });
  useEffect(() => { if (context.data && me.data?.id) remember(contextKey, JSON.stringify(context.data)); }, [context.data, contextKey, me.data?.id]);
  const cachedContext = !context.data && Boolean(me.data?.id) && (!queue.online || (context.error && isNetworkError(context.error))) ? readCache<Context>(contextKey) : null;
  const data = context.data ?? cachedContext;
  const can = { progress: data ? data.can.logProgress : true, issue: data ? data.can.issueMaterial : true, receive: data ? Boolean(data.can.receiveMaterial) : false, team: data ? Boolean(data.can.logTeamHours) : false };
  const tabs = (["progress", "issue", ...(can.receive ? ["receive"] : []), ...(can.team ? ["team"] : [])] as Array<"progress" | "issue" | "receive" | "team">);
  const tab = chosen && can[chosen] ? chosen : can.progress ? "progress" : can.issue ? "issue" : can.receive ? "receive" : can.team ? "team" : "progress";
  const nothingAllowed = Boolean(data) && !can.progress && !can.issue && !can.receive && !can.team;
  return (
    <main className="min-h-screen bg-[#f7f8fc] px-4 py-4 text-slate-900" dir={isRtl ? "rtl" : "ltr"}>
      <div className="mb-2 flex justify-end"><LanguageToggle /></div>
      <div className="mx-auto max-w-md space-y-4">
        <Link href={`/projects/${tenantId}/${projectId}/controls`} className={`${tap} inline-flex items-center text-sm font-semibold text-[#0e6b70]`}>{t.back}</Link>
        <h1 className="text-xl font-semibold">{t.title}</h1>
        <SourceNotice query={me} isArabic={isArabic} title={t.checkingIdentity} fallback={t.offlineOff} />
        <QueueBanner items={queue.items} online={queue.online} flushing={queue.flushing} onFlush={() => void queue.flush()} onDiscard={queue.discard} onRetry={queue.retry} t={t} isArabic={isArabic} language={language} />
        <div role="tablist" className={`grid gap-2 ${tabs.length >= 4 ? "grid-cols-2" : tabs.length === 3 ? "grid-cols-3" : "grid-cols-2"}`}>
          {tabs.map(key => <button key={key} role="tab" type="button" aria-selected={tab === key} disabled={!can[key]} className={`${tap} rounded-xl border text-base font-semibold disabled:opacity-40 ${tab === key ? "border-[#0e6b70] bg-[#0e6b70] text-white" : "bg-white"}`} onClick={() => setTab(key)}>{t[key]}</button>)}
        </div>
        {can.issue && tab === "issue" && <Link href={`/m/${tenantId}/${projectId}/issue`} className={`${tap} inline-flex w-full items-center justify-center rounded-xl border border-[#0e6b70] text-base font-semibold text-[#0e6b70]`}>{t.issueToUnit}</Link>}
        {cachedContext && <p role="status" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t.cachedNotice}</p>}
        {context.isLoading && !data && <p role="status" className="text-sm text-slate-500">{t.loading}</p>}
        {context.error && !data && <div><p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(context.error, isArabic)}</p><Button className={`${tap} mt-2`} variant="outline" onClick={() => context.refetch()}>{t.retry}</Button></div>}
        {nothingAllowed && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t.notAllowed}</p>}
        {data && !nothingAllowed && (tab === "progress"
          ? <ProgressEntry tenantId={tenantId} projectId={projectId} context={data} t={t} isArabic={isArabic} keepOffline={queue.keep} onSaved={() => context.refetch()} />
          : tab === "issue"
            ? <MaterialIssueEntry tenantId={tenantId} projectId={projectId} context={data} t={t} isArabic={isArabic} keepOffline={queue.keep} onSaved={() => context.refetch()} />
            : tab === "receive"
              ? <ReceiptEntry tenantId={tenantId} projectId={projectId} context={data} t={t} isArabic={isArabic} keepOffline={queue.keep} onSaved={() => context.refetch()} />
              : <TeamHoursEntry tenantId={tenantId} projectId={projectId} personId={me.data?.id ?? null} t={t} isArabic={isArabic} language={language} keepOffline={queue.keep} online={queue.online} />)}
      </div>
    </main>
  );
}
