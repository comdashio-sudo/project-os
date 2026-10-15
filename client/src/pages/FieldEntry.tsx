import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import type { inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";
import React, { useState } from "react";
import { Link, useParams } from "wouter";

// Phone entry for the two things a site engineer does all day: log progress and
// issue material. Built for speed: every control is at least 44px, the screen
// guesses what it can (last unit cost, last warehouse and work item), and a
// save needs three taps: pick, choose, save.
const text = {
  ar: {
    title: "إدخال سريع من الموقع", back: "العودة إلى ضوابط المشروع", notAllowed: "دورك لا يتيح تسجيل التقدم ولا صرف المواد من هذه الشاشة.", progress: "تسجيل تقدم", issue: "صرف مادة", loading: "جارٍ التحميل…", retry: "إعادة المحاولة",
    pickItem: "اختر بند العمل", nowAt: "التقدم الآن", never: "لم يُسجَّل", save: "حفظ", saving: "جارٍ الحفظ…", saved: "تم الحفظ", another: "تسجيل آخر", noWbs: "لا بنود عمل في هذا المشروع بعد.", plus5: "+5", minus5: "−5",
    pickMaterial: "اختر المادة", quantity: "الكمية", unitCost: "سعر الوحدة", warehouse: "المستودع", workItem: "بند العمل", change: "تغيير", onHand: "الرصيد", total: "الإجمالي", noMaterials: "لا مواد في الكتالوج بعد.", noWarehouses: "لا مستودع فعّال في هذا المشروع.", issued: "صُرفت", to: "إلى",
  },
  en: {
    title: "Quick site entry", back: "Back to project controls", notAllowed: "Your role does not allow logging progress or issuing material from this screen.", progress: "Log progress", issue: "Issue material", loading: "Loading…", retry: "Retry",
    pickItem: "Pick the work item", nowAt: "Now at", never: "not recorded", save: "Save", saving: "Saving…", saved: "Saved", another: "Record another", noWbs: "This project has no work items yet.", plus5: "+5", minus5: "−5",
    pickMaterial: "Pick the material", quantity: "Quantity", unitCost: "Unit cost", warehouse: "Warehouse", workItem: "Work item", change: "Change", onHand: "On hand", total: "Total", noMaterials: "No materials in the catalogue yet.", noWarehouses: "This project has no active warehouse.", issued: "Issued", to: "to",
  },
};
type T = typeof text.en;
const PRESETS = [0, 25, 50, 75, 100];
const tap = "min-h-[44px] min-w-[44px]";
const remembered = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const remember = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* storage may be unavailable; defaults then fall back to the first item */ } };

type Context = inferRouterOutputs<AppRouter>["fieldEntry"]["context"];

function ProgressEntry({ tenantId, projectId, context, t, onSaved, isArabic }: { tenantId: string; projectId: string; context: Context; t: T; onSaved: () => void; isArabic: boolean }) {
  const [itemId, setItemId] = useState<string | null>(null);
  const [percent, setPercent] = useState<number | null>(null);
  const [done, setDone] = useState<{ name: string; percent: number } | null>(null);
  const create = trpc.progress.create.useMutation({ onSuccess: () => { const item = context.wbs.find(w => w.id === itemId)!; setDone({ name: `${item.code} · ${item.name}`, percent: percent! }); setItemId(null); setPercent(null); onSaved(); } });
  if (done) return <div className="space-y-3"><p role="status" className="rounded-xl bg-emerald-50 p-4 text-base font-semibold text-emerald-800">{t.saved}: {done.name} → {done.percent}%</p><Button className={`${tap} w-full`} onClick={() => setDone(null)}>{t.another}</Button></div>;
  if (context.wbs.length === 0) return <p className="text-sm text-slate-500">{t.noWbs}</p>;
  const selected = context.wbs.find(w => w.id === itemId) ?? null;
  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-slate-600">{t.pickItem}</p>
      <ul className="space-y-2">
        {context.wbs.map(item => (
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
      {create.error && <p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(create.error, isArabic)}</p>}
      <Button className={`${tap} w-full text-base`} disabled={itemId === null || percent === null || create.isPending} onClick={() => create.mutate({ tenantId, projectId, wbsItemId: itemId!, percentComplete: percent!, reportedAt: new Date() })}>{create.isPending ? t.saving : t.save}</Button>
    </div>
  );
}

function MaterialIssueEntry({ tenantId, projectId, context, t, onSaved, isArabic }: { tenantId: string; projectId: string; context: Context; t: T; onSaved: () => void; isArabic: boolean }) {
  const rememberedWarehouse = remembered(`fieldEntry:${projectId}:warehouse`);
  const rememberedWbs = remembered(`fieldEntry:${projectId}:wbs`);
  const [warehouseId, setWarehouseId] = useState(context.warehouses.find(w => w.id === rememberedWarehouse)?.id ?? context.warehouses[0]?.id ?? "");
  const [wbsItemId, setWbsItemId] = useState(context.wbs.find(w => w.id === rememberedWbs)?.id ?? context.wbs.find(w => w.id === context.lastIssuedWbsItemId)?.id ?? context.wbs[0]?.id ?? "");
  const [materialId, setMaterialId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState("");
  const [unitCost, setUnitCost] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const material = context.materials.find(m => m.id === materialId) ?? null;
  const wbsItem = context.wbs.find(w => w.id === wbsItemId);
  const warehouse = context.warehouses.find(w => w.id === warehouseId);
  const issue = trpc.warehouses.issueToWork.useMutation({ onSuccess: () => { remember(`fieldEntry:${projectId}:warehouse`, warehouseId); remember(`fieldEntry:${projectId}:wbs`, wbsItemId); setDone(`${t.issued}: ${quantity} ${material?.unitOfMeasure ?? ""} ${material?.code ?? ""} ${t.to} ${wbsItem?.code ?? ""}`); setMaterialId(null); setQuantity(""); setUnitCost(""); onSaved(); } });
  if (done) return <div className="space-y-3"><p role="status" className="rounded-xl bg-emerald-50 p-4 text-base font-semibold text-emerald-800">{t.saved}: {done}</p><Button className={`${tap} w-full`} onClick={() => setDone(null)}>{t.another}</Button></div>;
  if (context.materials.length === 0) return <p className="text-sm text-slate-500">{t.noMaterials}</p>;
  if (context.warehouses.length === 0) return <p className="text-sm text-slate-500">{t.noWarehouses}</p>;
  const qty = Number(quantity);
  const cost = Number(unitCost);
  const ready = Boolean(materialId && warehouseId && wbsItemId && qty > 0 && cost > 0);
  const onHand = material?.onHand.find(h => h.warehouseId === warehouseId)?.quantity ?? null;
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
          <label className="text-sm">{t.unitCost}<input aria-label={t.unitCost} className={`${tap} mt-1 w-full rounded-lg border bg-white px-3 text-lg`} inputMode="decimal" value={unitCost} onChange={event => setUnitCost(event.target.value)} /></label>
          <p className="col-span-2 text-xs text-slate-600">{t.onHand}: <b>{onHand === null ? "—" : onHand}</b>{qty > 0 && cost > 0 && <> · {t.total}: <b>{(qty * cost).toFixed(2)}</b></>}</p>
        </div>
      )}
      <details className="rounded-xl border bg-white p-3 text-sm">
        <summary className={`${tap} flex cursor-pointer items-center`}>{t.warehouse}: <b className="mx-1">{warehouse?.code}</b> · {t.workItem}: <b className="mx-1">{wbsItem?.code}</b> <span className="ms-auto text-[#0e6b70]">{t.change}</span></summary>
        <label className="mt-2 block">{t.warehouse}<select aria-label={t.warehouse} className={`${tap} mt-1 w-full rounded-lg border bg-white px-2`} value={warehouseId} onChange={event => setWarehouseId(event.target.value)}>{context.warehouses.map(w => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}</select></label>
        <label className="mt-2 block">{t.workItem}<select aria-label={t.workItem} className={`${tap} mt-1 w-full rounded-lg border bg-white px-2`} value={wbsItemId} onChange={event => setWbsItemId(event.target.value)}>{context.wbs.map(w => <option key={w.id} value={w.id}>{w.code} · {w.name}</option>)}</select></label>
      </details>
      {issue.error && <p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(issue.error, isArabic)}</p>}
      <Button className={`${tap} w-full text-base`} disabled={!ready || issue.isPending} onClick={() => issue.mutate({ tenantId, projectId, warehouseId, materialId: materialId!, wbsItemId, issuedQuantity: qty, unitCost: cost, issuedAt: new Date() })}>{issue.isPending ? t.saving : t.save}</Button>
    </div>
  );
}

export default function FieldEntry() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { isArabic } = useLanguage();
  const t = isArabic ? text.ar : text.en;
  const [chosen, setTab] = useState<"progress" | "issue" | null>(null);
  const context = trpc.fieldEntry.context.useQuery({ tenantId, projectId }, { enabled: Boolean(tenantId && projectId) });
  const can = { progress: context.data ? context.data.can.logProgress : true, issue: context.data ? context.data.can.issueMaterial : true };
  const tab = chosen && can[chosen] ? chosen : can.progress ? "progress" : can.issue ? "issue" : "progress";
  const nothingAllowed = Boolean(context.data) && !can.progress && !can.issue;
  return (
    <main className="min-h-screen bg-[#f7f8fc] px-4 py-4 text-slate-900" dir={isArabic ? "rtl" : "ltr"}>
      <div className="mx-auto max-w-md space-y-4">
        <Link href={`/projects/${tenantId}/${projectId}/controls`} className={`${tap} inline-flex items-center text-sm font-semibold text-[#0e6b70]`}>{t.back}</Link>
        <h1 className="text-xl font-semibold">{t.title}</h1>
        <div role="tablist" className="grid grid-cols-2 gap-2">
          {(["progress", "issue"] as const).map(key => <button key={key} role="tab" type="button" aria-selected={tab === key} disabled={!can[key]} className={`${tap} rounded-xl border text-base font-semibold disabled:opacity-40 ${tab === key ? "border-[#0e6b70] bg-[#0e6b70] text-white" : "bg-white"}`} onClick={() => setTab(key)}>{t[key]}</button>)}
        </div>
        {context.isLoading && <p role="status" className="text-sm text-slate-500">{t.loading}</p>}
        {context.error && <div><p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(context.error, isArabic)}</p><Button className={`${tap} mt-2`} variant="outline" onClick={() => context.refetch()}>{t.retry}</Button></div>}
        {nothingAllowed && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t.notAllowed}</p>}
        {context.data && !nothingAllowed && (tab === "progress"
          ? <ProgressEntry tenantId={tenantId} projectId={projectId} context={context.data} t={t} isArabic={isArabic} onSaved={() => context.refetch()} />
          : <MaterialIssueEntry tenantId={tenantId} projectId={projectId} context={context.data} t={t} isArabic={isArabic} onSaved={() => context.refetch()} />)}
      </div>
    </main>
  );
}
