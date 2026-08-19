import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";
import { ShoppingCart } from "lucide-react";
import React, { useState } from "react";

const next: Record<string, string[]> = { draft: ["submitted"], submitted: ["approved", "cancelled"], approved: ["issued", "cancelled"], issued: [], cancelled: [] };
export const nextPurchaseOrderStatuses = (status: string) => next[status] ?? [];

export function ProjectPurchaseOrders({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { isArabic } = useLanguage();
  const today = new Date().toISOString().slice(0, 10);
  const list = trpc.purchaseOrders.list.useQuery({ tenantId, projectId });
  const [draft, setDraft] = useState({ purchaseOrderNumber: "", supplierName: "", orderDate: today, amount: "", currency: "USD", summary: "" });
  const [notice, setNotice] = useState("");
  const t = isArabic
    ? { title: "سجل أوامر الشراء", number: "رقم أمر الشراء", supplier: "المورد", date: "تاريخ الأمر", amount: "القيمة", currency: "العملة", summary: "ملخص الأمر", create: "حفظ أمر الشراء", move: "تحديث الحالة", empty: "لا توجد أوامر شراء لهذا المشروع.", draft: "مسودة", submitted: "مرسل", approved: "معتمد", issued: "صادر", cancelled: "ملغى", saved: "تم حفظ أمر الشراء.", moved: "تم تحديث حالة أمر الشراء." }
    : { title: "Purchase-order register", number: "Purchase-order number", supplier: "Supplier", date: "Order date", amount: "Amount", currency: "Currency", summary: "Order summary", create: "Save purchase order", move: "Update status", empty: "No purchase orders are registered for this project.", draft: "Draft", submitted: "Submitted", approved: "Approved", issued: "Issued", cancelled: "Cancelled", saved: "Purchase order saved.", moved: "Purchase-order status updated." };
  const create = trpc.purchaseOrders.create.useMutation({ onSuccess: () => { setDraft({ purchaseOrderNumber: "", supplierName: "", orderDate: today, amount: "", currency: "USD", summary: "" }); setNotice(t.saved); void list.refetch(); } });
  const transition = trpc.purchaseOrders.transitionStatus.useMutation({ onSuccess: () => { setNotice(t.moved); void list.refetch(); } });
  const error = list.error ?? create.error ?? transition.error;
  const displayDate = (value: Date | string) => new Intl.DateTimeFormat(isArabic ? "ar" : "en", { dateStyle: "medium" }).format(new Date(value));
  const displayAmount = (value: string, currency: string) => new Intl.NumberFormat(isArabic ? "ar" : "en", { style: "currency", currency }).format(Number(value));
  if (list.isLoading) return null;
  if (!list.data) return <p className="text-sm text-red-700">{getLocalizedProjectError(error, isArabic)}</p>;
  return <section className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-slate-200"><div className="flex items-center gap-3"><ShoppingCart className="text-violet-700" /><h2 className="font-semibold">{t.title}</h2></div>{error && <p role="alert" className="mt-3 text-sm text-red-700">{getLocalizedProjectError(error, isArabic)}</p>}{notice && <p role="status" className="mt-3 text-sm text-emerald-700">{notice}</p>}<form className="mt-4 grid gap-3" onSubmit={event => { event.preventDefault(); create.mutate({ tenantId, projectId, purchaseOrderNumber: draft.purchaseOrderNumber, supplierName: draft.supplierName, orderDate: new Date(`${draft.orderDate}T00:00:00.000Z`), amount: Number(draft.amount), currency: draft.currency.toUpperCase(), summary: draft.summary }); }}><div className="grid gap-3 sm:grid-cols-2"><Input aria-label={t.number} placeholder={t.number} value={draft.purchaseOrderNumber} onChange={event => setDraft({ ...draft, purchaseOrderNumber: event.target.value })} required /><Input aria-label={t.supplier} placeholder={t.supplier} value={draft.supplierName} onChange={event => setDraft({ ...draft, supplierName: event.target.value })} required /></div><div className="grid gap-3 sm:grid-cols-3"><label className="text-xs font-medium text-slate-700">{t.date}<Input className="mt-1" aria-label={t.date} type="date" value={draft.orderDate} onChange={event => setDraft({ ...draft, orderDate: event.target.value })} required /></label><label className="text-xs font-medium text-slate-700">{t.amount}<Input className="mt-1" aria-label={t.amount} type="number" min="0.01" step="0.01" value={draft.amount} onChange={event => setDraft({ ...draft, amount: event.target.value })} required /></label><label className="text-xs font-medium text-slate-700">{t.currency}<Input className="mt-1" aria-label={t.currency} maxLength={3} value={draft.currency} onChange={event => setDraft({ ...draft, currency: event.target.value.toUpperCase() })} required /></label></div><Textarea aria-label={t.summary} placeholder={t.summary} value={draft.summary} onChange={event => setDraft({ ...draft, summary: event.target.value })} required /><Button disabled={create.isPending}>{t.create}</Button></form>{list.data.length ? <div className="mt-5 space-y-3">{list.data.map(order => <div key={order.id} className="rounded-xl bg-slate-50 p-3"><div className="flex flex-wrap items-center justify-between gap-2"><b>{order.purchaseOrderNumber} · {order.supplierName}</b><span className="text-xs text-slate-500">{displayDate(order.orderDate)}</span></div><p className="mt-2 text-sm">{order.summary}</p><p className="mt-1 text-xs text-slate-600">{displayAmount(order.amount, order.currency)} · {t[order.status]}</p>{nextPurchaseOrderStatuses(order.status).map(status => <Button key={status} size="sm" variant="outline" className="mt-2 me-2" onClick={() => transition.mutate({ tenantId, projectId, purchaseOrderId: order.id, nextStatus: status as never })}>{t.move}: {t[status as keyof typeof t]}</Button>)}</div>)}</div> : <p className="mt-4 text-sm text-slate-500">{t.empty}</p>}</section>;
}
