import { Button } from "@/components/ui/button";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import React, { useEffect, useRef, useState } from "react";
import { Link, useParams } from "wouter";

// Issue material to a unit's activity from the phone, in four steps: find the material (type, or scan its QR), say how much, say which unit and
// which activity, save. The screen keeps the warehouse, the unit and the activity of the last issue, so the next one is find → quantity → save.
// Target (work order 12, item 3): under 20 seconds from opening the screen to a saved issue; scripts/e2e-quick-issue.mjs measures it in a real browser at 390px.
const tap = "min-h-[44px] min-w-[44px]";
const remembered = (key: string) => { try { return localStorage.getItem(key); } catch { return null; } };
const remember = (key: string, value: string) => { try { localStorage.setItem(key, value); } catch { /* storage may be unavailable: the defaults then fall back to the first item */ } };

const text = {
  ar: {
    title: "صرف سريع إلى وحدة", back: "العودة إلى الإدخال السريع", find: "ابحث بالرمز أو الاسم", scan: "مسح QR", scanning: "وجّه الكاميرا إلى ملصق المادة", scanFailed: "تعذّر قراءة الملصق، اكتب الرمز",
    quantity: "الكمية", unit: "رقم الوحدة", activity: "النشاط", warehouse: "المستودع", save: "حفظ الصرف", saving: "جارٍ الحفظ…", onHand: "المتوفر", noResults: "لا توجد مادة بهذا الاسم",
    unitUnknown: "لا توجد وحدة بهذا الرقم في هذا المشروع", pickActivity: "اختر النشاط", more: "صرف آخر", saved: "تم الصرف", cost: "التكلفة المحمّلة", tooMuch: "الكمية أكبر من المتوفر",
    noActivities: "لا نشاط مربوط ببند WBS في هذا المشروع، فلا يمكن تحميل تكلفة.", loading: "جارٍ التحميل…", retry: "إعادة المحاولة", notAllowed: "دورك لا يتيح الصرف من المستودع.", model: "النموذج",
  },
  en: {
    title: "Quick issue to a unit", back: "Back to quick entry", find: "Search by code or name", scan: "Scan QR", scanning: "Point the camera at the material label", scanFailed: "Could not read the label, type the code",
    quantity: "Quantity", unit: "Unit number", activity: "Activity", warehouse: "Warehouse", save: "Save issue", saving: "Saving…", onHand: "On hand", noResults: "No material by that name",
    unitUnknown: "No unit with that number in this project", pickActivity: "Pick the activity", more: "Issue another", saved: "Issued", cost: "Cost charged", tooMuch: "More than is on the shelf",
    noActivities: "No activity in this project is linked to a WBS item, so no cost can be charged.", loading: "Loading…", retry: "Retry", notAllowed: "Your role does not allow issuing from the warehouse.", model: "Model",
  },
};

type Barcode = { rawValue: string };
type Detector = { detect: (source: CanvasImageSource) => Promise<Barcode[]> };
const scannerAvailable = () => typeof window !== "undefined" && "BarcodeDetector" in window && Boolean(navigator.mediaDevices?.getUserMedia);

/** Opens the back camera and resolves with the first QR text it reads. */
function Scanner({ onCode, onFail, label }: { onCode: (code: string) => void; onFail: () => void; label: string }) {
  const video = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    let stopped = false; let stream: MediaStream | null = null;
    (async () => {
      try {
        const Ctor = (window as unknown as { BarcodeDetector: new (options: { formats: string[] }) => Detector }).BarcodeDetector;
        const detector = new Ctor({ formats: ["qr_code"] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (!video.current) return;
        video.current.srcObject = stream; await video.current.play();
        while (!stopped) {
          const [hit] = await detector.detect(video.current);
          if (hit) { onCode(hit.rawValue); return; }
          await new Promise(resolve => setTimeout(resolve, 250));
        }
      } catch { if (!stopped) onFail(); }
    })();
    return () => { stopped = true; stream?.getTracks().forEach(track => track.stop()); };
  }, [onCode, onFail]);
  return <div className="space-y-2"><p className="text-sm text-slate-600">{label}</p><video ref={video} playsInline muted className="w-full rounded-xl bg-black" /></div>;
}

export default function QuickIssue() {
  const { tenantId = "", projectId = "" } = useParams<{ tenantId: string; projectId: string }>();
  const { isArabic } = useLanguage();
  const t = isArabic ? text.ar : text.en;
  const options = trpc.warehouses.cellOptions.useQuery({ tenantId, projectId }, { enabled: Boolean(tenantId && projectId), networkMode: "always", retry: 1 });
  const key = (name: string) => `quickIssue:${projectId}:${name}`;
  const [warehouseId, setWarehouseId] = useState("");
  const [query, setQuery] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scanFailed, setScanFailed] = useState(false);
  const [picked, setPicked] = useState<{ id: string; code: string; description: string; unit: string; onHand: number } | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [unitNumber, setUnitNumber] = useState(() => remembered(key("unit")) ?? "");
  const [activityId, setActivityId] = useState(() => remembered(key("activity")) ?? "");
  const [done, setDone] = useState<{ cost: number; summary: string } | null>(null);
  const requestId = useRef(globalThis.crypto.randomUUID());
  const quantityBox = useRef<HTMLInputElement>(null);
  const data = options.data;
  const activeWarehouse = warehouseId || (data ? (data.warehouses.find(item => item.id === remembered(key("warehouse")))?.id ?? data.warehouses[0]?.id ?? "") : "");
  const found = trpc.warehouses.findMaterial.useQuery({ tenantId, projectId, warehouseId: activeWarehouse, query: query.trim() }, { enabled: Boolean(activeWarehouse && query.trim().length >= 1 && !picked), networkMode: "always", retry: false, staleTime: 5_000 });
  const chosen = picked;
  const unit = data?.units.find(item => String(item.number) === unitNumber.trim()) ?? null;
  const activities = data && unit ? data.activities.filter(item => item.modelCode === unit.modelCode) : [];
  const activity = activities.find(item => item.id === activityId) ?? null;
  const qty = Number(quantity);
  const enough = chosen ? qty <= chosen.onHand : true;
  const ready = Boolean(chosen && activeWarehouse && unit && activity && qty > 0 && enough);

  const issue = trpc.warehouses.issueToCell.useMutation({
    networkMode: "always",
    onSuccess: result => {
      remember(key("warehouse"), activeWarehouse); remember(key("unit"), unitNumber.trim()); remember(key("activity"), activityId);
      setDone({ cost: result.totalCost, summary: `${qty} ${chosen?.unit ?? ""} ${chosen?.code ?? ""} → ${unit?.number} / ${activity?.code}` });
      requestId.current = globalThis.crypto.randomUUID();
    },
  });
  const choose = (item: { id: string; code: string; description: string; unit: string; onHand: number }) => { setPicked(item); setQuantity("1"); setTimeout(() => { quantityBox.current?.focus(); quantityBox.current?.select(); }, 0); };
  const again = () => { setDone(null); setPicked(null); setQuery(""); setQuantity("1"); };

  return (
    <main className="min-h-screen bg-[#f7f8fc] px-4 py-4 text-slate-900" dir={isArabic ? "rtl" : "ltr"}>
      <div className="mx-auto max-w-md space-y-4">
        <Link href={`/m/${tenantId}/${projectId}`} className={`${tap} inline-flex items-center text-sm font-semibold text-[#0e6b70]`}>{t.back}</Link>
        <h1 className="text-xl font-semibold">{t.title}</h1>
        {options.isLoading && <p role="status" className="text-sm text-slate-500">{t.loading}</p>}
        {options.error && <div><p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(options.error, isArabic)}</p><Button className={tap} variant="outline" onClick={() => options.refetch()}>{t.retry}</Button></div>}
        {data && data.activities.length === 0 && <p role="alert" className="rounded-xl bg-amber-50 p-3 text-sm text-amber-900">{t.noActivities}</p>}
        {data && done && (
          <div className="space-y-3">
            <p role="status" className="rounded-xl bg-emerald-50 p-4 text-base font-semibold text-emerald-800">{t.saved}: {done.summary}<br />{t.cost}: {done.cost}</p>
            <Button className={`${tap} w-full text-base`} onClick={again}>{t.more}</Button>
          </div>
        )}
        {data && !done && data.activities.length > 0 && (
          <div className="space-y-3">
            {data.warehouses.length > 1 && (
              <label className="block text-sm font-medium">{t.warehouse}
                <select className={`${tap} mt-1 w-full rounded-xl border bg-white px-3 text-base`} value={activeWarehouse} onChange={event => { setWarehouseId(event.target.value); setPicked(null); }}>
                  {data.warehouses.map(item => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}
                </select>
              </label>
            )}
            {!chosen && (
              <div className="space-y-2">
                <label className="block text-sm font-medium" htmlFor="qi-find">{t.find}</label>
                <div className="flex gap-2">
                  <input id="qi-find" autoFocus inputMode="search" autoComplete="off" className={`${tap} w-full flex-1 rounded-xl border bg-white px-3 text-base`} value={query} onChange={event => { setQuery(event.target.value); setScanFailed(false); }} />
                  {scannerAvailable() && <Button type="button" variant="outline" className={tap} onClick={() => { setScanning(value => !value); setScanFailed(false); }}>{t.scan}</Button>}
                </div>
                {scanFailed && <p role="alert" className="text-sm text-red-700">{t.scanFailed}</p>}
                {scanning && <Scanner label={t.scanning} onFail={() => { setScanning(false); setScanFailed(true); }} onCode={code => { setScanning(false); setQuery(code); }} />}
                {found.error && <p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(found.error, isArabic)}</p>}
                {query.trim() && found.data && found.data.length === 0 && <p className="text-sm text-slate-500">{t.noResults}</p>}
                <ul className="space-y-2">
                  {(found.data ?? []).map(item => (
                    <li key={item.id}><button type="button" className={`${tap} w-full rounded-xl border bg-white p-3 text-start`} onClick={() => choose(item)}>
                      <span className="block text-base font-semibold">{item.code}</span><span className="block text-sm text-slate-600">{item.description}</span><span className="block text-xs text-slate-500">{t.onHand}: {item.onHand} {item.unit}</span>
                    </button></li>
                  ))}
                </ul>
              </div>
            )}
            {chosen && (
              <div className="space-y-3">
                <div className="flex items-start justify-between rounded-xl border bg-white p-3">
                  <div><p className="text-base font-semibold">{chosen.code}</p><p className="text-sm text-slate-600">{chosen.description}</p><p className="text-xs text-slate-500">{t.onHand}: {chosen.onHand} {chosen.unit}</p></div>
                  <Button type="button" variant="outline" className={tap} onClick={again}>×</Button>
                </div>
                <label className="block text-sm font-medium" htmlFor="qi-quantity">{t.quantity} ({chosen.unit})</label>
                <input id="qi-quantity" ref={quantityBox} type="number" inputMode="decimal" min="0" step="any" className={`${tap} w-full rounded-xl border bg-white px-3 text-base`} value={quantity} onChange={event => setQuantity(event.target.value)} />
                {!enough && <p role="alert" className="text-sm text-red-700">{t.tooMuch}</p>}
                <label className="block text-sm font-medium" htmlFor="qi-unit">{t.unit}</label>
                <input id="qi-unit" type="number" inputMode="numeric" min="1" step="1" className={`${tap} w-full rounded-xl border bg-white px-3 text-base`} value={unitNumber} onChange={event => { setUnitNumber(event.target.value); setActivityId(""); }} />
                {unitNumber.trim() && !unit && <p role="alert" className="text-sm text-red-700">{t.unitUnknown}</p>}
                {unit && (
                  <label className="block text-sm font-medium">{t.activity} <span className="text-xs text-slate-500">({t.model} {unit.modelCode} · {unit.zone}/{unit.block})</span>
                    <select className={`${tap} mt-1 w-full rounded-xl border bg-white px-3 text-base`} value={activityId} onChange={event => setActivityId(event.target.value)}>
                      <option value="">{t.pickActivity}</option>
                      {activities.map(item => <option key={item.id} value={item.id}>{item.code} — {item.name}</option>)}
                    </select>
                  </label>
                )}
                {issue.error && <p role="alert" className="text-sm text-red-700">{getLocalizedProjectError(issue.error, isArabic)}</p>}
                <Button className={`${tap} w-full text-base`} disabled={!ready || issue.isPending} onClick={() => issue.mutate({ tenantId, projectId, warehouseId: activeWarehouse, materialId: chosen.id, pmcUnitId: unit!.id, pmcActivityDefinitionId: activity!.id, issuedQuantity: qty, issuedAt: new Date(), clientRequestId: requestId.current })}>{issue.isPending ? t.saving : t.save}</Button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
