import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/contexts/LanguageContext";
import { getLocalizedProjectError } from "@/lib/projectErrors";
import { trpc } from "@/lib/trpc";

export function ProjectWarehouses({ tenantId, projectId }: { tenantId: string; projectId: string }) {
  const { isArabic } = useLanguage();
  const t = isArabic ? { title: "المستودعات والمخزون", warehouse: "المستودع", code: "الرمز", name: "الاسم", location: "الموقع", addWarehouse: "إضافة مستودع", movement: "حركة مادة", material: "المادة", type: "نوع الحركة", receipt: "استلام", issue: "صرف", adjustment: "تعديل", quantity: "الكمية", reference: "مرجع الحركة", note: "ملاحظة", record: "تسجيل الحركة", balances: "الأرصدة الحالية", history: "آخر الحركات", empty: "لا توجد مستودعات أو حركات مسجلة بعد.", loading: "جارٍ تحميل المستودعات والمخزون...", onHand: "المتاح", date: "التاريخ" } : { title: "Warehouses and inventory", warehouse: "Warehouse", code: "Code", name: "Name", location: "Location", addWarehouse: "Add warehouse", movement: "Material movement", material: "Material", type: "Movement type", receipt: "Receipt", issue: "Issue", adjustment: "Adjustment", quantity: "Quantity", reference: "Movement reference", note: "Note", record: "Record movement", balances: "Current balances", history: "Recent movements", empty: "No warehouses or inventory movements have been recorded yet.", loading: "Loading warehouses and inventory...", onHand: "On hand", date: "Date" };
  const register = trpc.warehouses.list.useQuery({ tenantId, projectId });
  const materials = trpc.materials.list.useQuery({ tenantId, projectId });
  const create = trpc.warehouses.create.useMutation({ onSuccess: () => register.refetch() });
  const record = trpc.warehouses.recordInventory.useMutation({ onSuccess: () => register.refetch() });
  const [warehouse, setWarehouse] = useState({ code: "", name: "", locationDescription: "" });
  const [movement, setMovement] = useState({ warehouseId: "", materialId: "", transactionType: "receipt" as "receipt" | "issue" | "adjustment", quantity: "", referenceNumber: "", note: "" });
  const error = create.error ?? record.error;
  if (register.isLoading || materials.isLoading) return <p className="text-sm text-muted-foreground">{t.loading}</p>;
  const signedQuantity = movement.transactionType === "issue" ? -Math.abs(Number(movement.quantity)) : Number(movement.quantity);
  return <Card><CardHeader><CardTitle>{t.title}</CardTitle></CardHeader><CardContent className="space-y-5">
    <form className="grid gap-3 md:grid-cols-3" onSubmit={event => { event.preventDefault(); create.mutate({ tenantId, projectId, code: warehouse.code, name: warehouse.name, locationDescription: warehouse.locationDescription || undefined }); }}>
      <div><Label htmlFor="warehouse-code">{t.code}</Label><Input id="warehouse-code" value={warehouse.code} onChange={event => setWarehouse({ ...warehouse, code: event.target.value })} required /></div>
      <div><Label htmlFor="warehouse-name">{t.name}</Label><Input id="warehouse-name" value={warehouse.name} onChange={event => setWarehouse({ ...warehouse, name: event.target.value })} required /></div>
      <div><Label htmlFor="warehouse-location">{t.location}</Label><Input id="warehouse-location" value={warehouse.locationDescription} onChange={event => setWarehouse({ ...warehouse, locationDescription: event.target.value })} /></div>
      <Button type="submit" disabled={create.isPending}>{t.addWarehouse}</Button>
    </form>
    {register.data?.warehouses.length && materials.data?.length ? <form className="grid gap-3 md:grid-cols-3" onSubmit={event => { event.preventDefault(); if (movement.warehouseId && movement.materialId && Number.isFinite(signedQuantity) && signedQuantity !== 0) record.mutate({ tenantId, projectId, warehouseId: movement.warehouseId, materialId: movement.materialId, transactionType: movement.transactionType, quantityDelta: signedQuantity, referenceNumber: movement.referenceNumber || undefined, note: movement.note || undefined, occurredAt: new Date() }); }}>
      <div><Label htmlFor="inventory-warehouse">{t.warehouse}</Label><select id="inventory-warehouse" className="h-9 w-full rounded-md border bg-background px-3" value={movement.warehouseId} onChange={event => setMovement({ ...movement, warehouseId: event.target.value })} required><option value="">—</option>{register.data.warehouses.filter(item => item.active).map(item => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></div>
      <div><Label htmlFor="inventory-material">{t.material}</Label><select id="inventory-material" className="h-9 w-full rounded-md border bg-background px-3" value={movement.materialId} onChange={event => setMovement({ ...movement, materialId: event.target.value })} required><option value="">—</option>{materials.data.map(item => <option key={item.id} value={item.id}>{item.code} · {item.description}</option>)}</select></div>
      <div><Label htmlFor="inventory-type">{t.type}</Label><select id="inventory-type" className="h-9 w-full rounded-md border bg-background px-3" value={movement.transactionType} onChange={event => setMovement({ ...movement, transactionType: event.target.value as typeof movement.transactionType })}><option value="receipt">{t.receipt}</option><option value="issue">{t.issue}</option><option value="adjustment">{t.adjustment}</option></select></div>
      <div><Label htmlFor="inventory-quantity">{t.quantity}</Label><Input id="inventory-quantity" type="number" step="0.001" value={movement.quantity} onChange={event => setMovement({ ...movement, quantity: event.target.value })} required /></div>
      <div><Label htmlFor="inventory-reference">{t.reference}</Label><Input id="inventory-reference" value={movement.referenceNumber} onChange={event => setMovement({ ...movement, referenceNumber: event.target.value })} /></div>
      <div><Label htmlFor="inventory-note">{t.note}</Label><Input id="inventory-note" value={movement.note} onChange={event => setMovement({ ...movement, note: event.target.value })} /></div>
      <Button type="submit" disabled={record.isPending}>{t.record}</Button>
    </form> : <p className="text-sm text-muted-foreground">{t.empty}</p>}
    <div><h3 className="text-sm font-semibold">{t.balances}</h3><div className="mt-2 grid gap-2">{register.data?.balances.map(item => <div key={item.id} className="rounded-lg border p-3 text-sm"><strong>{item.material?.code ?? item.materialId}</strong> · {item.material?.description} <span className="text-muted-foreground">{t.onHand}: {item.quantityOnHand} {item.material?.unitOfMeasure ?? ""}</span></div>)}</div></div>
    <div><h3 className="text-sm font-semibold">{t.history}</h3><div className="mt-2 grid gap-2">{register.data?.transactions.map(item => <div key={item.id} className="rounded-lg border p-3 text-sm"><strong>{item.transactionType}</strong> · {item.material?.code ?? item.materialId} · {item.quantityDelta} <span className="text-muted-foreground">{t.date}: {new Date(item.occurredAt).toLocaleDateString(isArabic ? "ar" : "en")}</span></div>)}</div></div>
    {error ? <p role="alert" className="text-sm text-destructive">{getLocalizedProjectError(error, isArabic)}</p> : null}
  </CardContent></Card>;
}
