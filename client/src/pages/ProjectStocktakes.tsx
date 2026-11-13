import React, { useEffect, useState } from "react";
import { CheckedForm } from "@/components/CheckedForm";
import { formatDate, formatNumber } from "@/components/ds/format";
import { Select } from "@/components/ds";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { SourceNotice } from "@/components/SectionResilience";
import { enumLabel } from "@/lib/labels";
import { useCan, usePermissionsLoading, WriteGate } from "@/lib/permissions";
import { pickLanguage } from "@/lib/language";

type Warehouse = { id: string; code: string; name: string; active: boolean };

/**
 * D-32 (G-104): the stocktake document on screen — open a count of one warehouse, enter what is on the shelf, and have SOMEONE ELSE approve it.
 * The server (server/stocktakes.ts) decides everything that matters: the book quantity of each line, that the approver is not the opener, that every
 * line is counted, and the adjustment it posts; this screen only collects the counts and shows the server's answer in the page's language.
 */
export function ProjectStocktakes({ tenantId, projectId, warehouses }: { tenantId: string; projectId: string; warehouses: Warehouse[] }) {
  const { isArabic, language } = useLanguage();
  const t = pickLanguage(language, {
    ar: { title: "الجرد", intro: "افتح جردًا لمستودع، وأدخل الكمية المعدودة لكل مادة، ثم يعتمده شخص غير الذي فتحه. الفرق يُرحَّل تعديلًا بتكلفة المتوسط.", warehouse: "المستودع", number: "رقم الجرد", note: "ملاحظة", open: "فتح جرد", list: "الجرود", none: "لا جرود بعد.", show: "عرض", system: "حسب الدفاتر", counted: "المعدود", variance: "الفرق", notCounted: "لم يُعدّ", saveCounts: "حفظ الكميات", reason: "سبب الاعتماد", approve: "اعتماد الجرد وترحيل الفروق", approvedNote: "اعتُمد هذا الجرد ورُحّلت فروقه، فلا يُعدَّل.", sameApprover: "يعتمده شخص غير الذي فتحه.", opened: "فُتح الجرد", saved: "حُفظت الكميات", approvedDone: "اعتُمد الجرد", adjustments: "تعديلات مُرحّلة", loading: "جارٍ تحميل الجرد...", noWarehouse: "أضف مستودعًا وسجّل فيه حركة أولًا.", denied: "الجرد لمن يملك صلاحية إدارة المخزون؛ لا تملكها في هذا المشروع." },
    en: { title: "Stocktake", intro: "Open a count of one warehouse, enter the counted quantity of each material, then someone other than the opener approves it. Each difference is posted as an adjustment at average cost.", warehouse: "Warehouse", number: "Stocktake number", note: "Note", open: "Open stocktake", list: "Stocktakes", none: "No stocktakes yet.", show: "Show", system: "Book", counted: "Counted", variance: "Difference", notCounted: "Not counted", saveCounts: "Save counts", reason: "Approval reason", approve: "Approve and post differences", approvedNote: "This stocktake is approved and its differences posted; it cannot be changed.", sameApprover: "Approved by someone other than the opener.", opened: "Stocktake opened", saved: "Counts saved", approvedDone: "Stocktake approved", adjustments: "adjustments posted", loading: "Loading stocktakes...", noWarehouse: "Add a warehouse and record a movement in it first.", denied: "Stocktakes are for people who manage inventory; you do not have that permission on this project." },
    ur: { title: "اسٹاک کی گنتی", intro: "ایک گودام کی گنتی کھولیں، ہر مادّے کی گنی ہوئی مقدار درج کریں، پھر کھولنے والے کے علاوہ کوئی اور اسے منظور کرے۔ ہر فرق اوسط لاگت پر ایڈجسٹمنٹ کے طور پر درج ہوتا ہے۔", warehouse: "گودام", number: "گنتی نمبر", note: "نوٹ", open: "گنتی کھولیں", list: "گنتیاں", none: "ابھی کوئی گنتی نہیں۔", show: "دکھائیں", system: "کھاتے کے مطابق", counted: "گنی گئی", variance: "فرق", notCounted: "نہیں گنی گئی", saveCounts: "مقداریں محفوظ کریں", reason: "منظوری کی وجہ", approve: "منظور کریں اور فرق درج کریں", approvedNote: "یہ گنتی منظور ہو چکی اور اس کے فرق درج ہو چکے؛ اسے بدلا نہیں جا سکتا۔", sameApprover: "کھولنے والے کے علاوہ کوئی اور منظور کرے۔", opened: "گنتی کھل گئی", saved: "مقداریں محفوظ ہو گئیں", approvedDone: "گنتی منظور ہو گئی", adjustments: "ایڈجسٹمنٹس درج ہوئیں", loading: "گنتیاں لوڈ ہو رہی ہیں...", noWarehouse: "پہلے ایک گودام شامل کریں اور اس میں کوئی حرکت درج کریں۔", denied: "گنتی ان کے لیے ہے جو اسٹاک کا انتظام کرتے ہیں؛ اس منصوبے میں آپ کے پاس یہ اجازت نہیں ہے۔" },
  });
  // G-212: stocktakes are read by who may count stock (the server checks project.inventory.manage); anyone else sees one line and makes no refused call.
  const canCount = useCan("project.inventory.manage", projectId); const permissionsLoading = usePermissionsLoading();
  const list = trpc.stocktakes.list.useQuery({ tenantId, projectId }, { enabled: canCount });
  const [selected, setSelected] = useState<string | null>(null);
  const detail = trpc.stocktakes.get.useQuery({ tenantId, projectId, stocktakeId: selected ?? "" }, { enabled: canCount && Boolean(selected) });
  const [form, setForm] = useState({ warehouseId: "", stocktakeNumber: "", note: "" });
  const [counts, setCounts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [done, setDone] = useState<string | null>(null);
  const open = trpc.stocktakes.open.useMutation({ onSuccess: result => { setDone(t.opened); setForm({ warehouseId: "", stocktakeNumber: "", note: "" }); setSelected(result.id); void list.refetch(); } });
  const count = trpc.stocktakes.count.useMutation({ onSuccess: () => { setDone(t.saved); void detail.refetch(); } });
  const approve = trpc.stocktakes.approve.useMutation({ onSuccess: result => { setDone(`${t.approvedDone} · ${formatNumber(result.adjustments)} ${t.adjustments}`); setReason(""); void detail.refetch(); void list.refetch(); } });
  // The inputs start from what the server holds, so a correction edits the saved count instead of a blank field.
  // Keyed on what the server holds (not on the object), so a refetch with the same counts does not wipe what is being typed.
  const saved = detail.data ? JSON.stringify(detail.data.lines.map(line => [line.id, line.countedQuantity])) : "";
  useEffect(() => { if (saved) setCounts(Object.fromEntries((JSON.parse(saved) as Array<[string, number | null]>).map(([id, counted]) => [id, counted === null ? "" : String(counted)]))); }, [saved]);
  const warehouseName = (id: string) => { const item = warehouses.find(entry => entry.id === id); return item ? `${item.code} · ${item.name}` : id; };
  const failure = open.error ?? count.error ?? approve.error;
  const changed = detail.data ? detail.data.lines.filter(line => counts[line.id] !== undefined && counts[line.id] !== "" && Number(counts[line.id]) !== line.countedQuantity) : [];
  const activeWarehouses = warehouses.filter(item => item.active);
  if (!canCount) return permissionsLoading ? null : <section aria-labelledby="stocktake-title" className="space-y-2 rounded-lg border p-4"><h3 id="stocktake-title" className="text-sm font-semibold">{t.title}</h3><p role="note" data-stocktake-denied className="text-sm text-muted-foreground">{t.denied}</p></section>;
  return <section aria-labelledby="stocktake-title" className="space-y-4 rounded-lg border p-4">
    <div><h3 id="stocktake-title" className="text-sm font-semibold">{t.title}</h3><p className="mt-1 text-sm text-muted-foreground">{t.intro}</p></div>
    <SourceNotice query={list} isArabic={isArabic} title={t.list} />
    {activeWarehouses.length ? <WriteGate permission={"project.inventory.manage"} projectId={projectId} reason={{ ar: "لا تملك صلاحية فتح الجرد، فالشاشة للعرض فقط.", en: "You do not have permission to open a stocktake; this view is read-only for you.", ur: "آپ کو گنتی کھولنے کی اجازت نہیں ہے؛ یہ اسکرین آپ کے لیے صرف دیکھنے کے لیے ہے۔" }}>
      <CheckedForm className="grid gap-3 md:grid-cols-3" onSubmit={event => { event.preventDefault(); setDone(null); open.mutate({ tenantId, projectId, warehouseId: form.warehouseId, stocktakeNumber: form.stocktakeNumber.trim(), note: form.note.trim() || undefined }); }}>
        <div><Label htmlFor="stocktake-warehouse">{t.warehouse}</Label><Select id="stocktake-warehouse" value={form.warehouseId} placeholder="—" onValueChange={value => setForm({ ...form, warehouseId: value })} required options={activeWarehouses.map(item => ({ value: item.id, label: `${item.code} · ${item.name}` }))} /></div>
        <div><Label htmlFor="stocktake-number">{t.number}</Label><Input className="min-h-11" id="stocktake-number" value={form.stocktakeNumber} maxLength={60} onChange={event => setForm({ ...form, stocktakeNumber: event.target.value })} required /></div>
        <div><Label htmlFor="stocktake-note">{t.note}</Label><Input className="min-h-11" id="stocktake-note" value={form.note} maxLength={500} onChange={event => setForm({ ...form, note: event.target.value })} /></div>
        <Button className="min-h-11" type="submit" disabled={open.isPending}>{t.open}</Button>
      </CheckedForm>
    </WriteGate> : <p className="text-sm text-muted-foreground">{t.noWarehouse}</p>}
    {list.isLoading ? <p className="text-sm text-muted-foreground">{t.loading}</p> : list.data?.length ? <ul aria-label={t.list} className="grid gap-2">{list.data.map(item => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-3 text-sm">
      <span><strong>{item.stocktakeNumber}</strong> · {warehouseName(item.warehouseId)} · {enumLabel(item.status, language)} · {formatDate(item.createdAt, language)}</span>
      <Button className="min-h-11" type="button" variant={selected === item.id ? "default" : "outline"} aria-pressed={selected === item.id} onClick={() => { setDone(null); setSelected(item.id); }}>{t.show} <span className="sr-only">{item.stocktakeNumber}</span></Button>
    </li>)}</ul> : list.data ? <p className="text-sm text-muted-foreground">{t.none}</p> : null}
    {selected ? <SourceNotice query={detail} isArabic={isArabic} title={t.title} /> : null}
    {detail.data ? <div className="space-y-3">
      <h4 className="text-sm font-semibold">{detail.data.stocktakeNumber} · {warehouseName(detail.data.warehouseId)} · {enumLabel(detail.data.status, language)}</h4>
      <ul className="grid gap-2">{detail.data.lines.map(line => <li key={line.id} className="grid gap-2 rounded-lg border p-3 text-sm sm:grid-cols-[1fr_auto] sm:items-end">
        <div><strong>{line.code}</strong> · {line.description}<div className="text-muted-foreground">{t.system}: <bdi dir="ltr">{formatNumber(line.systemQuantity, 3)}</bdi> {line.unitOfMeasure} · {t.variance}: {line.variance === null ? t.notCounted : <bdi dir="ltr" data-variance>{formatNumber(line.variance, 3)}</bdi>}</div></div>
        {detail.data!.status === "counting" ? <div className="sm:w-40"><Label htmlFor={`stocktake-count-${line.id}`}>{t.counted} <span className="sr-only">{line.code}</span></Label><Input className="min-h-11" id={`stocktake-count-${line.id}`} type="number" inputMode="decimal" min="0" step="0.001" value={counts[line.id] ?? ""} onChange={event => setCounts({ ...counts, [line.id]: event.target.value })} /></div>
          : <div>{t.counted}: {line.countedQuantity === null ? t.notCounted : <bdi dir="ltr">{formatNumber(line.countedQuantity, 3)}</bdi>}</div>}
      </li>)}</ul>
      {detail.data.status === "counting" ? <WriteGate permission={"project.inventory.manage"} projectId={projectId} reason={{ ar: "لا تملك صلاحية تسجيل الجرد أو اعتماده، فالشاشة للعرض فقط.", en: "You do not have permission to record or approve a stocktake; this view is read-only for you.", ur: "آپ کو گنتی درج یا منظور کرنے کی اجازت نہیں ہے؛ یہ اسکرین آپ کے لیے صرف دیکھنے کے لیے ہے۔" }}>
        <div className="space-y-3">
          <Button className="min-h-11" type="button" disabled={count.isPending || !changed.length} onClick={() => { setDone(null); count.mutate({ tenantId, projectId, stocktakeId: detail.data!.id, counts: changed.map(line => ({ lineId: line.id, countedQuantity: Number(counts[line.id]) })) }); }}>{t.saveCounts}</Button>
          <CheckedForm className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end" onSubmit={event => { event.preventDefault(); setDone(null); approve.mutate({ tenantId, projectId, stocktakeId: detail.data!.id, reason: reason.trim() }); }}>
            <div><Label htmlFor="stocktake-reason">{t.reason}</Label><Input className="min-h-11" id="stocktake-reason" value={reason} minLength={3} maxLength={500} onChange={event => setReason(event.target.value)} required aria-describedby="stocktake-approver-note" /><p id="stocktake-approver-note" className="mt-1 text-xs text-muted-foreground">{t.sameApprover}</p></div>
            <Button className="min-h-11" type="submit" disabled={approve.isPending}>{t.approve}</Button>
          </CheckedForm>
        </div>
      </WriteGate> : <p className="text-sm text-muted-foreground">{t.approvedNote}</p>}
    </div> : null}
    {done && !failure ? <p role="status" className="text-sm">{done}</p> : null}
    {failure ? <p role="alert" className="text-sm text-destructive">{getLocalizedProjectError(failure, isArabic)}</p> : null}
  </section>;
}
